use crate::db::{ActivityLogEntry, Db};
use crate::protocol::{GitDiffResult, GitStatusResult};
use git2::build::CheckoutBuilder;
use git2::{BranchType, Commit, DiffFormat, DiffOptions, IndexAddOption, Repository, Status, StatusOptions};
use std::path::Path;
use std::process::Command;
use std::sync::Arc;
use thiserror::Error;
use uuid::Uuid;

pub struct GitOps {
    db: Arc<Db>,
}

impl std::fmt::Debug for GitOps {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("GitOps").finish_non_exhaustive()
    }
}

impl GitOps {
    pub fn new(db: Arc<Db>) -> Self {
        Self { db }
    }

    pub async fn status(&self, worktree_id: Uuid, repo_path: &Path) -> Result<GitStatusResult, GitError> {
        let (status, entry_count) = {
            let repo = open_repo(repo_path)?;

            let mut opts = StatusOptions::new();
            opts.include_untracked(true)
                .recurse_untracked_dirs(true)
                .include_ignored(false)
                .renames_head_to_index(true)
                .renames_index_to_workdir(true);

            let statuses = repo.statuses(Some(&mut opts))?;
            let mut lines = Vec::with_capacity(statuses.len());
            for entry in statuses.iter() {
                let path = entry.path().unwrap_or("<unknown>");
                lines.push(format!("{} {}", status_code(entry.status()), path));
            }

            let status = if lines.is_empty() {
                "clean".to_string()
            } else {
                lines.join("\n")
            };

            (status, statuses.len())
        };

        self.log_info(
            "status",
            format!("Checked git status for {}", repo_path.display()),
            format!(
                r#"{{"worktree_id":"{}","repo_path":"{}","entries":{}}}"#,
                worktree_id,
                repo_path.display(),
                entry_count
            ),
        )
        .await?;

        Ok(GitStatusResult { worktree_id, status })
    }

    pub async fn diff(
        &self,
        worktree_id: Uuid,
        repo_path: &Path,
        file_path: Option<&str>,
    ) -> Result<GitDiffResult, GitError> {
        let diff_text = {
            let repo = open_repo(repo_path)?;

            let mut diff_opts = DiffOptions::new();
            diff_opts.include_untracked(true).recurse_untracked_dirs(true);
            if let Some(path) = file_path {
                diff_opts.pathspec(path);
            }

            let head_tree = repo
                .head()
                .ok()
                .and_then(|head| head.peel_to_tree().ok());

            let diff = repo.diff_tree_to_workdir_with_index(head_tree.as_ref(), Some(&mut diff_opts))?;

            let mut out = String::new();
            diff.print(DiffFormat::Patch, |_delta, _hunk, line| {
                out.push(line.origin());
                out.push_str(std::str::from_utf8(line.content()).unwrap_or("[binary]\n"));
                true
            })?;

            if out.trim().is_empty() {
                "No changes".to_string()
            } else {
                out
            }
        };

        self.log_info(
            "diff",
            format!("Generated git diff for {}", repo_path.display()),
            format!(
                r#"{{"worktree_id":"{}","repo_path":"{}","file_path":{}}}"#,
                worktree_id,
                repo_path.display(),
                json_opt_str(file_path)
            ),
        )
        .await?;

        Ok(GitDiffResult {
            worktree_id,
            file_path: file_path.map(ToString::to_string),
            diff: diff_text,
        })
    }

    pub async fn commit(
        &self,
        worktree_id: Uuid,
        repo_path: &Path,
        message: &str,
        files: Option<Vec<String>>,
    ) -> Result<String, GitError> {
        let commit_hash = {
            let repo = open_repo(repo_path)?;
            let mut index = repo.index()?;

            if let Some(paths) = files {
                for path in paths {
                    index
                        .add_path(Path::new(&path))
                        .map_err(|e| GitError::StagingFailed(path, e.to_string()))?;
                }
            } else {
                index.add_all(["*"], IndexAddOption::DEFAULT, None)?;
            }

            index.write()?;
            let sig = repo
                .signature()
                .or_else(|_| git2::Signature::now("ymir", "ymir@example.com"))?;
            let tree_id = index.write_tree()?;
            let tree = repo.find_tree(tree_id)?;
            let parent = repo.head().ok().and_then(|h| h.peel_to_commit().ok());

            let oid = if let Some(parent_commit) = parent.as_ref() {
                repo.commit(
                    Some("HEAD"),
                    &sig,
                    &sig,
                    message,
                    &tree,
                    &[parent_commit],
                )?
            } else {
                repo.commit(Some("HEAD"), &sig, &sig, message, &tree, &[])?
            };

            oid.to_string()
        };

        self.log_info(
            "commit",
            format!("Created commit {}", commit_hash),
            format!(
                r#"{{"worktree_id":"{}","repo_path":"{}","message":"{}","commit":"{}"}}"#,
                worktree_id,
                repo_path.display(),
                json_escape(message),
                commit_hash
            ),
        )
        .await?;

        Ok(commit_hash)
    }

    pub async fn merge(
        &self,
        worktree_id: Uuid,
        repo_path: &Path,
        squash: bool,
    ) -> Result<String, GitError> {
        let (feature_branch, target_branch, merge_oid) = {
            let repo = open_repo(repo_path)?;

            let head = repo.head()?;
            let feature_branch = head
                .shorthand()
                .ok_or_else(|| GitError::InvalidReference("missing current branch".to_string()))?
                .to_string();
            if feature_branch == "main" || feature_branch == "master" {
                return Err(GitError::MergeFailed(
                    "current branch must be a feature branch, not main/master".to_string(),
                ));
            }

            let (base_ref_name, base_branch) = find_base_branch(&repo)?;
            let base_commit = base_branch.get().peel_to_commit()?;
            let feature_commit = head.peel_to_commit()?;

            let mut merge_index = repo.merge_commits(&base_commit, &feature_commit, None)?;
            if merge_index.has_conflicts() {
                return Err(GitError::MergeConflicts(collect_conflicts(&mut merge_index)?));
            }

            repo.set_head(base_ref_name)?;
            repo.checkout_head(Some(CheckoutBuilder::new().force()))?;

            let tree_oid = merge_index.write_tree_to(&repo)?;
            let tree = repo.find_tree(tree_oid)?;
            let sig = repo
                .signature()
                .or_else(|_| git2::Signature::now("ymir", "ymir@example.com"))?;
            let target_branch = base_ref_name[11..].to_string();

            let msg = if squash {
                format!("Squash merge '{}' into {}", feature_branch, target_branch)
            } else {
                format!("Merge branch '{}' into {}", feature_branch, target_branch)
            };

            let oid = if squash {
                let parents: [&Commit<'_>; 1] = [&base_commit];
                repo.commit(Some("HEAD"), &sig, &sig, msg.as_str(), &tree, parents.as_slice())?
            } else {
                let parents: [&Commit<'_>; 2] = [&base_commit, &feature_commit];
                repo.commit(Some("HEAD"), &sig, &sig, msg.as_str(), &tree, parents.as_slice())?
            };

            repo.cleanup_state()?;
            (feature_branch, target_branch, oid)
        };

        self.log_info(
            "merge",
            format!("Merged '{}' into {}", feature_branch, target_branch),
            format!(
                r#"{{"worktree_id":"{}","repo_path":"{}","source_branch":"{}","target_branch":"{}","squash":{},"commit":"{}"}}"#,
                worktree_id,
                repo_path.display(),
                json_escape(&feature_branch),
                json_escape(&target_branch),
                squash,
                merge_oid
            ),
        )
        .await?;

        Ok(format!("Merged {} ({})", feature_branch, merge_oid))
    }

    pub async fn create_pr(
        &self,
        worktree_id: Uuid,
        repo_path: &Path,
        title: &str,
        body: Option<&str>,
    ) -> Result<String, GitError> {
        let gh_bin = std::env::var("YMIR_GH_BIN").unwrap_or_else(|_| "gh".to_string());
        let mut cmd = Command::new(&gh_bin);
        cmd.arg("pr").arg("create").arg("--title").arg(title);
        cmd.arg("--body").arg(body.unwrap_or(""));
        cmd.current_dir(repo_path);

        let output = cmd.output().map_err(|_| GitError::GhNotInstalled)?;
        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
            return Err(GitError::CommandFailed(if stderr.is_empty() {
                "gh pr create failed".to_string()
            } else {
                stderr
            }));
        }

        let pr_url = String::from_utf8_lossy(&output.stdout).trim().to_string();
        if pr_url.is_empty() {
            return Err(GitError::CommandFailed(
                "gh pr create returned empty output".to_string(),
            ));
        }

        self.log_info(
            "pr",
            format!("Created PR '{}': {}", title, pr_url),
            format!(
                r#"{{"worktree_id":"{}","repo_path":"{}","title":"{}","pr_url":"{}"}}"#,
                worktree_id,
                repo_path.display(),
                json_escape(title),
                json_escape(&pr_url)
            ),
        )
        .await?;

        Ok(pr_url)
    }

    async fn log_info(&self, op: &str, message: String, metadata_json: String) -> Result<(), GitError> {
        self.db
            .log_activity(&ActivityLogEntry {
                id: None,
                timestamp: chrono::Utc::now().to_rfc3339(),
                level: "info".to_string(),
                source: Some("git".to_string()),
                message,
                metadata_json,
            })
            .await
            .map_err(|e| GitError::DbError(format!("{} log failed: {}", op, e)))?;
        Ok(())
    }
}

fn open_repo(path: &Path) -> Result<Repository, GitError> {
    Repository::open(path).map_err(|e| GitError::RepositoryNotFound(e.to_string()))
}

fn status_code(status: Status) -> &'static str {
    if status.contains(Status::INDEX_NEW) {
        "A"
    } else if status.contains(Status::INDEX_MODIFIED) {
        "M"
    } else if status.contains(Status::INDEX_DELETED) {
        "D"
    } else if status.contains(Status::WT_NEW) {
        "??"
    } else if status.contains(Status::WT_MODIFIED) {
        " M"
    } else if status.contains(Status::WT_DELETED) {
        " D"
    } else {
        "??"
    }
}

fn find_base_branch<'a>(repo: &'a Repository) -> Result<(&'static str, git2::Branch<'a>), GitError> {
    repo.find_branch("main", BranchType::Local)
        .map(|branch| ("refs/heads/main", branch))
        .or_else(|_| repo.find_branch("master", BranchType::Local).map(|branch| ("refs/heads/master", branch)))
        .map_err(|e| GitError::BranchNotFound("main/master".to_string(), e.to_string()))
}

fn collect_conflicts(index: &mut git2::Index) -> Result<Vec<String>, GitError> {
    let mut files = Vec::new();
    let conflicts = index
        .conflicts()
        .map_err(|e| GitError::MergeFailed(e.to_string()))?;
    for conflict in conflicts {
        let conflict = conflict.map_err(|e| GitError::MergeFailed(e.to_string()))?;
        let path = conflict
            .our
            .as_ref()
            .or(conflict.their.as_ref())
            .or(conflict.ancestor.as_ref())
            .and_then(|entry| std::str::from_utf8(&entry.path).ok())
            .unwrap_or("<unknown>")
            .to_string();
        files.push(path);
    }
    if files.is_empty() {
        files.push("<unknown>".to_string());
    }
    Ok(files)
}

fn json_opt_str(value: Option<&str>) -> String {
    value
        .map(|v| format!("\"{}\"", json_escape(v)))
        .unwrap_or_else(|| "null".to_string())
}

fn json_escape(value: &str) -> String {
    value.replace('\\', "\\\\").replace('"', "\\\"")
}

#[derive(Error, Debug)]
pub enum GitError {
    #[error("Repository not found: {0}")]
    RepositoryNotFound(String),
    #[error("Branch not found: {0} - {1}")]
    BranchNotFound(String, String),
    #[error("Invalid reference: {0}")]
    InvalidReference(String),
    #[error("Staging failed for {0}: {1}")]
    StagingFailed(String, String),
    #[error("Merge failed: {0}")]
    MergeFailed(String),
    #[error("GitHub CLI (gh) is not installed")]
    GhNotInstalled,
    #[error("Command failed: {0}")]
    CommandFailed(String),
    #[error("Merge conflicts detected: {0:?}")]
    MergeConflicts(Vec<String>),
    #[error("Database error: {0}")]
    DbError(String),
    #[error(transparent)]
    Git(#[from] git2::Error),
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::os::unix::fs::PermissionsExt;
    use std::path::PathBuf;
    use tempfile::TempDir;

    async fn setup_git_ops() -> (TempDir, PathBuf, Arc<Db>, GitOps, Uuid) {
        let temp = TempDir::new().expect("temp dir");
        let repo_path = temp.path().join("repo");
        fs::create_dir_all(&repo_path).expect("create repo dir");

        let repo = Repository::init(&repo_path).expect("init repo");
        let sig = git2::Signature::now("tester", "tester@example.com").expect("signature");
        fs::write(repo_path.join("README.md"), "initial\n").expect("write readme");

        let mut index = repo.index().expect("index");
        index.add_path(Path::new("README.md")).expect("stage");
        index.write().expect("write index");
        let tree_id = index.write_tree().expect("tree id");
        let tree = repo.find_tree(tree_id).expect("tree");
        repo.commit(Some("HEAD"), &sig, &sig, "initial", &tree, &[])
            .expect("initial commit");

        let db = Arc::new(Db::in_memory().await.expect("db"));
        let git_ops = GitOps::new(db.clone());

        (temp, repo_path, db, git_ops, Uuid::new_v4())
    }

    fn create_feature_commit(repo_path: &Path) {
        let repo = Repository::open(repo_path).expect("open repo");
        let head = repo.head().expect("head");
        let head_commit = head.peel_to_commit().expect("head commit");
        repo.branch("feature/test", &head_commit, false)
            .expect("create branch");
        repo.set_head("refs/heads/feature/test").expect("set head");
        repo.checkout_head(Some(CheckoutBuilder::new().force()))
            .expect("checkout feature");

        fs::write(repo_path.join("README.md"), "initial\nfeature\n").expect("write feature change");

        let sig = git2::Signature::now("tester", "tester@example.com").expect("signature");
        let mut index = repo.index().expect("index");
        index.add_path(Path::new("README.md")).expect("add path");
        index.write().expect("write");
        let tree = repo.find_tree(index.write_tree().expect("tree id")).expect("tree");
        let parent = repo.head().expect("head").peel_to_commit().expect("parent");

        repo.commit(Some("HEAD"), &sig, &sig, "feature commit", &tree, &[&parent])
            .expect("commit feature");
    }

    #[tokio::test]
    async fn test_git_operations_status_logs_activity() {
        let (_temp, repo_path, db, git_ops, worktree_id) = setup_git_ops().await;
        fs::write(repo_path.join("new.txt"), "new file\n").expect("write untracked");

        let result = git_ops.status(worktree_id, &repo_path).await.expect("status result");
        assert!(result.status.contains("new.txt"));

        let logs = db.query_activity_log(Some("info"), None).await.expect("activity logs");
        assert!(logs.iter().any(|entry| {
            entry.source.as_deref() == Some("git") && entry.message.contains("Checked git status")
        }));
    }

    #[tokio::test]
    async fn test_git_operations_diff_for_file() {
        let (_temp, repo_path, _db, git_ops, worktree_id) = setup_git_ops().await;
        fs::write(repo_path.join("README.md"), "initial\nchanged\n").expect("write change");

        let diff = git_ops
            .diff(worktree_id, &repo_path, Some("README.md"))
            .await
            .expect("diff result");

        assert!(diff.diff.contains("README.md"));
        assert!(diff.diff.contains("+changed"));
    }

    #[tokio::test]
    async fn test_git_operations_commit_returns_hash() {
        let (_temp, repo_path, _db, git_ops, worktree_id) = setup_git_ops().await;
        fs::write(repo_path.join("README.md"), "initial\ncommit-me\n").expect("write change");

        let commit_hash = git_ops
            .commit(worktree_id, &repo_path, "update readme", None)
            .await
            .expect("commit result");

        assert_eq!(commit_hash.len(), 40);
        let repo = Repository::open(&repo_path).expect("open repo");
        let head = repo.head().expect("head").peel_to_commit().expect("commit");
        assert_eq!(head.message(), Some("update readme"));
    }

    #[tokio::test]
    async fn test_git_operations_merge_commit() {
        let (_temp, repo_path, _db, git_ops, worktree_id) = setup_git_ops().await;
        create_feature_commit(&repo_path);

        let result = git_ops
            .merge(worktree_id, &repo_path, false)
            .await
            .expect("merge result");

        assert!(result.contains("Merged feature/test"));
        let repo = Repository::open(&repo_path).expect("open repo");
        let head = repo.head().expect("head").peel_to_commit().expect("commit");
        assert_eq!(head.parent_count(), 2);
    }

    #[tokio::test]
    async fn test_git_operations_merge_squash() {
        let (_temp, repo_path, _db, git_ops, worktree_id) = setup_git_ops().await;
        create_feature_commit(&repo_path);

        let result = git_ops
            .merge(worktree_id, &repo_path, true)
            .await
            .expect("merge result");

        assert!(result.contains("Merged feature/test"));
        let repo = Repository::open(&repo_path).expect("open repo");
        let head = repo.head().expect("head").peel_to_commit().expect("commit");
        assert_eq!(head.parent_count(), 1);
        assert!(head.message().unwrap_or_default().contains("Squash merge"));
    }

    #[tokio::test]
    async fn test_git_operations_create_pr_uses_gh_cli() {
        let (_temp, repo_path, _db, git_ops, worktree_id) = setup_git_ops().await;
        let bin_dir = tempfile::tempdir().expect("bin tempdir");
        let fake_gh_path = bin_dir.path().join("fake-gh");

        fs::write(
            &fake_gh_path,
            "#!/bin/sh\necho 'https://example.com/org/repo/pull/123'\n",
        )
        .expect("write fake gh");
        fs::set_permissions(&fake_gh_path, fs::Permissions::from_mode(0o755))
            .expect("chmod fake gh");

        std::env::set_var("YMIR_GH_BIN", fake_gh_path.display().to_string());
        let result = git_ops
            .create_pr(worktree_id, &repo_path, "Test PR", Some("body"))
            .await
            .expect("create pr result");
        std::env::remove_var("YMIR_GH_BIN");

        assert_eq!(result, "https://example.com/org/repo/pull/123");
    }
}
