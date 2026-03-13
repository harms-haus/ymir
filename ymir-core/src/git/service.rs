//! Git service implementation
//!
//! Provides a service layer for git operations with optional database persistence.
//! Adapted from src-tauri/src/git.rs to work as a reusable core service.

use super::{BranchInfo, FileStatus, GitError, GitFile, GitStatus, RepoFileInfo, RepoInfo};
use git2::{BranchType, IndexAddOption, Repository, StatusOptions};
use std::path::Path;
use std::sync::Arc;
use tokio::sync::Mutex;

/// Git service for repository operations
#[derive(Debug, Clone)]
pub struct GitService {
    db: Option<Arc<Mutex<crate::db::DatabaseClient>>>,
}

impl GitService {
    /// Create a new git service without database persistence
    pub fn new() -> Self {
        Self { db: None }
    }

    /// Create a new git service with database persistence
    pub fn with_db(db: crate::db::DatabaseClient) -> Self {
        Self {
            db: Some(Arc::new(Mutex::new(db))),
        }
    }

    /// Open a repository at the given path
    fn open_repository(repo_path: &str) -> Result<Repository, GitError> {
        let path = Path::new(repo_path);
        if !path.exists() {
            return Err(GitError::NotFound(format!(
                "Path does not exist: {}",
                repo_path
            )));
        }

        Repository::open(path).map_err(|e| {
            if e.code() == git2::ErrorCode::NotFound {
                GitError::NotARepository(format!("{} is not a git repository", repo_path))
            } else {
                GitError::from(e)
            }
        })
    }

    /// Get the current branch name
    fn get_current_branch(repo: &Repository) -> Result<String, GitError> {
        let head = repo.head().map_err(|e| {
            if e.code() == git2::ErrorCode::UnbornBranch {
                GitError::Other("No commits yet".to_string())
            } else {
                GitError::from(e)
            }
        })?;

        if let Some(name) = head.shorthand() {
            Ok(name.to_string())
        } else {
            Err(GitError::Other("Invalid branch name".to_string()))
        }
    }

    /// Get ahead/behind counts for current branch
    fn get_ahead_behind(repo: &Repository) -> Result<(usize, usize), GitError> {
        let head = repo.head().map_err(GitError::from)?;
        let local_ref = head.resolve().map_err(GitError::from)?;
        let local_oid = local_ref
            .target()
            .ok_or_else(|| GitError::Other("No target".to_string()))?;

        let branch = repo
            .find_branch(head.shorthand().unwrap_or("HEAD"), BranchType::Local)
            .map_err(GitError::from)?;

        if let Some(upstream) = branch.upstream().ok() {
            if let Some(upstream_ref) = upstream.get().target() {
                let ahead_behind = repo
                    .graph_ahead_behind(local_oid, upstream_ref)
                    .map_err(GitError::from)?;
                return Ok(ahead_behind);
            }
        }

        Ok((0, 0))
    }

    /// Get the status of a repository
    pub async fn get_repo_status(&self, repo_path: &str) -> Result<GitStatus, GitError> {

        let repo = Self::open_repository(repo_path)?;
        let current_branch =
            Self::get_current_branch(&repo).unwrap_or_else(|_| "(no branch)".to_string());

        let mut opts = StatusOptions::new();
        opts.include_untracked(true)
            .recurse_untracked_dirs(true)
            .include_ignored(false)
            .renames_head_to_index(true)
            .renames_index_to_workdir(true);

        let statuses = repo.statuses(Some(&mut opts)).map_err(GitError::from)?;

        let mut files = Vec::new();
        let mut staged_count = 0;
        let mut modified_count = 0;
        let mut untracked_count = 0;
        let mut conflicted_count = 0;

        for entry in statuses.iter() {
            let path = entry.path().unwrap_or("???").to_string();
            let status = entry.status();

            let file_statuses = FileStatus::from_git2_status(status);

            for fs in &file_statuses {
                if fs.is_staged() {
                    staged_count += 1;
                }
                if fs.has_changes() {
                    modified_count += 1;
                }
                if *fs == FileStatus::Untracked {
                    untracked_count += 1;
                }
                if *fs == FileStatus::Conflicted {
                    conflicted_count += 1;
                }
            }

            let (primary, secondary) = if file_statuses.len() > 1 {
                let staged = file_statuses.iter().find(|s| s.is_staged()).cloned();
                let unstaged = file_statuses.iter().find(|s| s.has_changes()).cloned();
                (staged.unwrap_or(FileStatus::Clean), unstaged)
            } else {
                (file_statuses[0].clone(), None)
            };

            files.push(GitFile {
                path,
                status: primary,
                secondary_status: secondary,
            });
        }

        let (ahead_count, behind_count) = Self::get_ahead_behind(&repo).unwrap_or((0, 0));

        let status = GitStatus {
            repo_path: repo_path.to_string(),
            current_branch,
            files,
            staged_count,
            modified_count,
            untracked_count,
            conflicted_count,
            ahead_count,
            behind_count,
        };

        if let Some(ref db) = self.db {
            let _ = self.persist_status(db, &status).await;
        }

        Ok(status)
    }

    /// Persist repository status to database
    async fn persist_status(
        &self,
        db: &Arc<Mutex<crate::db::DatabaseClient>>,
        status: &GitStatus,
    ) -> crate::Result<()> {
        let db = db.lock().await;

        // Use simple literal values in SQL for libsql compatibility
        let path = &status.repo_path;
        let branch = &status.current_branch;
        let staged = status.staged_count as i64;
        let modified = status.modified_count as i64;
        let untracked = status.untracked_count as i64;
        let conflicted = status.conflicted_count as i64;

        // Insert or update repository record using string interpolation for values
        let sql = format!(
            "INSERT INTO git_repos (path, current_branch, staged_count, modified_count, untracked_count, conflicted_count, last_poll_at)
             VALUES ('{}', '{}', {}, {}, {}, {}, datetime('now'))
             ON CONFLICT(path) DO UPDATE SET
               current_branch = excluded.current_branch,
               staged_count = excluded.staged_count,
               modified_count = excluded.modified_count,
               untracked_count = excluded.untracked_count,
               conflicted_count = excluded.conflicted_count,
               last_poll_at = excluded.last_poll_at
             RETURNING id",
            escape_sql(path),
            escape_sql(branch),
            staged,
            modified,
            untracked,
            conflicted
        );

        let mut rows = db
            .query(&sql, ())
            .await
            .map_err(|e| crate::CoreError::Database(format!("Failed to persist repo: {}", e)))?;

        let repo_id: i64 = rows
            .next()
            .await
            .map_err(|e| crate::CoreError::Database(format!("Failed to get row: {}", e)))?
            .ok_or_else(|| crate::CoreError::Database("No repo id returned".to_string()))?
            .get(0)
            .map_err(|e| crate::CoreError::Database(format!("Failed to get column: {}", e)))?;

        // Delete old file records for this repo
        let delete_sql = format!("DELETE FROM git_files WHERE repo_id = {}", repo_id);
        db.execute(&delete_sql, ())
            .await
            .map_err(|e| crate::CoreError::Database(format!("Failed to delete old files: {}", e)))?;

        // Insert new file records
        for file in &status.files {
            let status_str = if file.status.is_staged() {
                "staged"
            } else {
                "unstaged"
            };
            let file_status_str = format!("{:?}", file.status);
            let file_path = escape_sql(&file.path);
            let status_escaped = escape_sql(status_str);
            let file_status_escaped = escape_sql(&file_status_str);

            let insert_sql = format!(
                "INSERT INTO git_files (repo_id, path, status, file_status) VALUES ({}, '{}', '{}', '{}')",
                repo_id, file_path, status_escaped, file_status_escaped
            );

            db.execute(&insert_sql, ())
                .await
                .map_err(|e| crate::CoreError::Database(format!("Failed to insert file: {}", e)))?;
        }

        Ok(())
    }

    /// Stage a file (add to index)
    pub async fn stage_file(&self, repo_path: &str, file_path: &str) -> Result<(), GitError> {

        let repo = Self::open_repository(repo_path)?;
        let mut index = repo.index().map_err(GitError::from)?;

        let path = Path::new(file_path);
        index.add_path(path).map_err(GitError::from)?;
        index.write().map_err(GitError::from)?;

        Ok(())
    }

    /// Unstage a file (remove from index, keep working tree changes)
    pub async fn unstage_file(&self, repo_path: &str, file_path: &str) -> Result<(), GitError> {

        let repo = Self::open_repository(repo_path)?;
        let mut index = repo.index().map_err(GitError::from)?;

        let head = repo.head().map_err(|e| {
            if e.code() == git2::ErrorCode::UnbornBranch {
                GitError::Other("No commits yet".to_string())
            } else {
                GitError::from(e)
            }
        })?;

        let head_tree = head.peel_to_tree().map_err(GitError::from)?;
        let entry = head_tree.get_path(Path::new(file_path)).ok();

        if let Some(entry) = entry {
            let blob = repo.find_blob(entry.id()).map_err(GitError::from)?;
            let index_entry = git2::IndexEntry {
                ctime: git2::IndexTime::new(0, 0),
                mtime: git2::IndexTime::new(0, 0),
                dev: 0,
                ino: 0,
                mode: entry.filemode() as u32,
                uid: 0,
                gid: 0,
                file_size: blob.content().len() as u32,
                id: entry.id(),
                flags: 0,
                flags_extended: 0,
                path: entry.name().unwrap_or(file_path).as_bytes().to_vec(),
            };
            index
                .add_frombuffer(&index_entry, blob.content())
                .map_err(GitError::from)?;
        } else {
            index
                .remove_path(Path::new(file_path))
                .map_err(GitError::from)?;
        }

        index.write().map_err(GitError::from)?;

        Ok(())
    }

    /// Discard changes in working tree (checkout file from index)
    pub async fn discard_changes(&self, repo_path: &str, file_path: &str) -> Result<(), GitError> {

        let repo = Self::open_repository(repo_path)?;

        let index = repo.index().map_err(GitError::from)?;
        let entry = index.get_path(Path::new(file_path), 0);

        if entry.is_some() {
            let mut checkout_opts = git2::build::CheckoutBuilder::new();
            checkout_opts.path(file_path);
            checkout_opts.force();

            let mut index = repo.index().map_err(GitError::from)?;
            repo.checkout_index(Some(&mut index), Some(&mut checkout_opts))
                .map_err(GitError::from)?;
        } else {
            let full_path = Path::new(repo_path).join(file_path);
            if full_path.exists() {
                if full_path.is_file() {
                    tokio::fs::remove_file(&full_path)
                        .await
                        .map_err(|e| GitError::Other(format!("Failed to remove file: {}", e)))?;
                } else if full_path.is_dir() {
                    tokio::fs::remove_dir_all(&full_path)
                        .await
                        .map_err(|e| GitError::Other(format!("Failed to remove directory: {}", e)))?;
                }
            }
        }

        Ok(())
    }

    /// Create a commit with the given message
    pub async fn commit(&self, repo_path: &str, message: &str) -> Result<String, GitError> {

        let repo = Self::open_repository(repo_path)?;

        let sig = repo
            .signature()
            .or_else(|_| git2::Signature::now("Anonymous", "anonymous@example.com"))
            .map_err(GitError::from)?;

        let mut index = repo.index().map_err(GitError::from)?;
        let tree_id = index.write_tree().map_err(GitError::from)?;
        let tree = repo.find_tree(tree_id).map_err(GitError::from)?;

        let head = repo.head();
        let parents: Vec<git2::Commit> = match head {
            Ok(head) => {
                let parent = head.peel_to_commit().map_err(GitError::from)?;
                vec![parent]
            }
            Err(e) if e.code() == git2::ErrorCode::UnbornBranch => {
                vec![]
            }
            Err(e) => return Err(GitError::from(e)),
        };

        let parent_refs: Vec<&git2::Commit> = parents.iter().collect();

        let commit_id = repo
            .commit(Some("HEAD"), &sig, &sig, message, &tree, &parent_refs)
            .map_err(GitError::from)?;

        Ok(commit_id.to_string())
    }

    /// Get list of all branches
    pub async fn get_branches(&self, repo_path: &str) -> Result<Vec<BranchInfo>, GitError> {

        let repo = Self::open_repository(repo_path)?;
        let branches = repo.branches(None).map_err(GitError::from)?;

        let mut result = Vec::new();

        for branch_result in branches {
            let (branch, branch_type) = branch_result.map_err(GitError::from)?;

            let name = branch
                .name()
                .map_err(GitError::from)?
                .unwrap_or("???")
                .to_string();

            let is_head = branch.is_head();
            let is_remote = branch_type == BranchType::Remote;

            let upstream = if branch_type == BranchType::Local {
                branch
                    .upstream()
                    .ok()
                    .and_then(|u| u.name().ok().flatten().map(|s| s.to_string()))
            } else {
                None
            };

            result.push(BranchInfo {
                name,
                is_head,
                is_remote,
                upstream,
            });
        }

        Ok(result)
    }

    /// Create a new branch from the current HEAD
    pub async fn create_branch(&self, repo_path: &str, name: &str) -> Result<(), GitError> {

        let repo = Self::open_repository(repo_path)?;

        let head = repo.head().map_err(GitError::from)?;
        let head_commit = head.peel_to_commit().map_err(GitError::from)?;

        repo.branch(name, &head_commit, false).map_err(|e| {
            if e.code() == git2::ErrorCode::Exists {
                GitError::Conflict(format!("Branch '{}' already exists", name))
            } else {
                GitError::from(e)
         }
         })?;

         Ok(())
    }

    /// Delete a branch
    pub async fn delete_branch(&self, repo_path: &str, name: &str) -> Result<(), GitError> {

        let repo = Self::open_repository(repo_path)?;

        let head = repo.head().map_err(GitError::from)?;
        if let Some(current) = head.shorthand() {
            if current == name {
                return Err(GitError::InvalidBranch(format!(
                    "Cannot delete current branch '{}'",
                    name
                )));
            }
        }

        let mut branch = repo.find_branch(name, BranchType::Local).map_err(|e| {
            if e.code() == git2::ErrorCode::NotFound {
                GitError::NotFound(format!("Branch '{}' not found", name))
            } else {
                GitError::from(e)
            }
        })?;

         branch.delete().map_err(GitError::from)?;

         Ok(())
    }

    /// Checkout/switch to a branch
    pub async fn checkout_branch(&self, repo_path: &str, name: &str) -> Result<(), GitError> {

        let repo = Self::open_repository(repo_path)?;

        let branch = repo.find_branch(name, BranchType::Local).map_err(|e| {
            if e.code() == git2::ErrorCode::NotFound {
                GitError::NotFound(format!("Branch '{}' not found", name))
            } else {
                GitError::from(e)
            }
        })?;

        let reference = branch.get();
        let treeish = reference.resolve().map_err(GitError::from)?;

        let target_oid = treeish
            .target()
            .ok_or_else(|| GitError::Other("Reference has no target".to_string()))?;
        let commit = repo.find_commit(target_oid).map_err(GitError::from)?;
        let tree = commit.tree().map_err(GitError::from)?;

        let mut checkout_opts = git2::build::CheckoutBuilder::new();
        checkout_opts.force();

        repo.checkout_tree(tree.as_object(), Some(&mut checkout_opts))
            .map_err(GitError::from)?;

        let ref_name = reference
            .name()
             .ok_or_else(|| GitError::Other("Reference has no name".to_string()))?;
         repo.set_head(ref_name).map_err(GitError::from)?;

         Ok(())
    }

    /// Stage all changes (git add -A)
    pub async fn stage_all(&self, repo_path: &str) -> Result<(), GitError> {

        let repo = Self::open_repository(repo_path)?;
        let mut index = repo.index().map_err(GitError::from)?;

         index
             .add_all(["*"].iter(), IndexAddOption::DEFAULT, None)
             .map_err(GitError::from)?;
         index.write().map_err(GitError::from)?;

         Ok(())
    }

    /// Unstage all changes (git reset HEAD)
    pub async fn unstage_all(&self, repo_path: &str) -> Result<(), GitError> {

        let repo = Self::open_repository(repo_path)?;
        let mut index = repo.index().map_err(GitError::from)?;

        let head = repo.head().map_err(|e| {
            if e.code() == git2::ErrorCode::UnbornBranch {
                GitError::Other("No commits yet".to_string())
            } else {
                GitError::from(e)
            }
        })?;

        let head_tree = head.peel_to_tree().map_err(GitError::from)?;

         index.read_tree(&head_tree).map_err(GitError::from)?;
         index.write().map_err(GitError::from)?;

         Ok(())
    }

    /// Get repository info from database (if persistence is enabled)
    pub async fn get_repo_from_db(&self, repo_path: &str) -> crate::Result<Option<RepoInfo>> {
        let db = if let Some(db) = &self.db {
            db.lock().await
        } else {
            return Ok(None);
        };

        let sql = format!(
            "SELECT id, path, current_branch, staged_count, modified_count, untracked_count, conflicted_count, last_poll_at FROM git_repos WHERE path = '{}'",
            escape_sql(repo_path)
        );

        let mut rows = db
            .query(&sql, ())
            .await
            .map_err(|e| crate::CoreError::Database(format!("Failed to query repo: {}", e)))?;

    if let Some(row) = rows
        .next()
        .await
        .map_err(|e| crate::CoreError::Database(format!("Failed to get row: {}", e)))?
    {
        let id: i64 = row.get(0).map_err(|e| crate::CoreError::Database(format!("Failed to get id: {}", e)))?;
        let path: String = row.get(1).map_err(|e| crate::CoreError::Database(format!("Failed to get path: {}", e)))?;
        let current_branch: String = row.get(2).map_err(|e| crate::CoreError::Database(format!("Failed to get branch: {}", e)))?;
        let staged_count_i64: i64 = row.get(3).map_err(|e| crate::CoreError::Database(format!("Failed to get staged_count: {}", e)))?;
        let modified_count_i64: i64 = row.get(4).map_err(|e| crate::CoreError::Database(format!("Failed to get modified_count: {}", e)))?;
        let untracked_count_i64: i64 = row.get(5).map_err(|e| crate::CoreError::Database(format!("Failed to get untracked_count: {}", e)))?;
        let conflicted_count_i64: i64 = row.get(6).map_err(|e| crate::CoreError::Database(format!("Failed to get conflicted_count: {}", e)))?;
        let last_poll_at: Option<String> = row.get(7).ok();

        let repo_info = RepoInfo {
            id,
            path,
            current_branch,
            staged_count: staged_count_i64 as usize,
            modified_count: modified_count_i64 as usize,
            untracked_count: untracked_count_i64 as usize,
            conflicted_count: conflicted_count_i64 as usize,
            last_poll_at,
        };
        Ok(Some(repo_info))
    } else {
        Ok(None)
    }
}

    /// Get files for a repository from database
    pub async fn get_files_from_db(&self, repo_id: i64) -> crate::Result<Vec<RepoFileInfo>> {
        let db = if let Some(db) = &self.db {
            db.lock().await
        } else {
            return Ok(Vec::new());
        };

        let sql = format!(
            "SELECT id, repo_id, path, status, file_status FROM git_files WHERE repo_id = {}",
            repo_id
        );

        let mut rows = db
            .query(&sql, ())
            .await
            .map_err(|e| crate::CoreError::Database(format!("Failed to query files: {}", e)))?;

        let mut files = Vec::new();
        while let Some(row) = rows
            .next()
            .await
            .map_err(|e| crate::CoreError::Database(format!("Failed to get row: {}", e)))?
        {
            files.push(RepoFileInfo {
                id: row.get(0).map_err(|e| crate::CoreError::Database(format!("Failed to get id: {}", e)))?,
                repo_id: row.get(1).map_err(|e| crate::CoreError::Database(format!("Failed to get repo_id: {}", e)))?,
                path: row.get(2).map_err(|e| crate::CoreError::Database(format!("Failed to get path: {}", e)))?,
                status: row.get(3).map_err(|e| crate::CoreError::Database(format!("Failed to get status: {}", e)))?,
                file_status: row.get(4).map_err(|e| crate::CoreError::Database(format!("Failed to get file_status: {}", e)))?,
            });
        }

        Ok(files)
    }
}

impl Default for GitService {
    fn default() -> Self {
        Self::new()
    }
}

/// Escape SQL string literals
fn escape_sql(s: &str) -> String {
    s.replace("'", "''")
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::TempDir;

    fn create_test_repo() -> (TempDir, String) {
        let temp_dir = TempDir::new().unwrap();
        let repo_path = temp_dir.path().to_str().unwrap().to_string();

        let repo = Repository::init(&temp_dir).unwrap();

        let mut config = repo.config().unwrap();
        config.set_str("user.name", "Test User").unwrap();
        config.set_str("user.email", "test@example.com").unwrap();

        (temp_dir, repo_path)
    }

    fn create_initial_commit(repo_path: &str) {
        let repo = Repository::open(repo_path).unwrap();
        let sig = git2::Signature::now("Test", "test@example.com").unwrap();

        let file_path = Path::new(repo_path).join("initial.txt");
        fs::write(&file_path, "initial content").unwrap();

        let mut index = repo.index().unwrap();
        index.add_path(Path::new("initial.txt")).unwrap();
        index.write().unwrap();

        let tree_id = index.write_tree().unwrap();
        let tree = repo.find_tree(tree_id).unwrap();

        repo.commit(Some("HEAD"), &sig, &sig, "Initial commit", &tree, &[])
            .unwrap();
    }

    #[tokio::test]
    async fn test_get_repo_status_empty_repo() {
        let (_temp, repo_path) = create_test_repo();
        let service = GitService::new();

        let status = service.get_repo_status(&repo_path).await.unwrap();
        assert_eq!(status.files.len(), 0);
        assert_eq!(status.staged_count, 0);
        assert_eq!(status.modified_count, 0);
    }

    #[tokio::test]
    async fn test_stage_and_commit() {
        let (_temp, repo_path) = create_test_repo();
        create_initial_commit(&repo_path);

        let service = GitService::new();

        let file_path = Path::new(&repo_path).join("test.txt");
        fs::write(&file_path, "test content").unwrap();

        service.stage_file(&repo_path, "test.txt").await.unwrap();

        let status = service.get_repo_status(&repo_path).await.unwrap();
        assert_eq!(status.files.len(), 1);
        assert_eq!(status.files[0].status, FileStatus::Added);

        let commit_id = service.commit(&repo_path, "Add test file").await.unwrap();
        assert!(!commit_id.is_empty());

        let status = service.get_repo_status(&repo_path).await.unwrap();
        assert_eq!(status.files.len(), 0);
    }

    #[tokio::test]
    async fn test_unstage_file() {
        let (_temp, repo_path) = create_test_repo();
        create_initial_commit(&repo_path);

        let service = GitService::new();

        let file_path = Path::new(&repo_path).join("test.txt");
        fs::write(&file_path, "test content").unwrap();
        service.stage_file(&repo_path, "test.txt").await.unwrap();

        let status = service.get_repo_status(&repo_path).await.unwrap();
        assert_eq!(status.files[0].status, FileStatus::Added);

        service.unstage_file(&repo_path, "test.txt").await.unwrap();

        let status = service.get_repo_status(&repo_path).await.unwrap();
        assert_eq!(status.files[0].status, FileStatus::Untracked);
    }

    #[tokio::test]
    async fn test_discard_changes() {
        let (_temp, repo_path) = create_test_repo();
        create_initial_commit(&repo_path);

        let service = GitService::new();

        let file_path = Path::new(&repo_path).join("initial.txt");
        fs::write(&file_path, "modified content").unwrap();

        let status = service.get_repo_status(&repo_path).await.unwrap();
        assert_eq!(status.files[0].status, FileStatus::Modified);

        service.discard_changes(&repo_path, "initial.txt").await.unwrap();

        let status = service.get_repo_status(&repo_path).await.unwrap();
        assert_eq!(status.files.len(), 0);

        let content = fs::read_to_string(&file_path).unwrap();
        assert_eq!(content, "initial content");
    }

    #[tokio::test]
    async fn test_branch_operations() {
        let (_temp, repo_path) = create_test_repo();
        create_initial_commit(&repo_path);

        let service = GitService::new();

        service.create_branch(&repo_path, "feature-branch").await.unwrap();

        let branches = service.get_branches(&repo_path).await.unwrap();
        assert_eq!(branches.len(), 2);

        let feature = branches
            .iter()
            .find(|b| b.name == "feature-branch")
            .unwrap();
        assert!(!feature.is_head);

        service.checkout_branch(&repo_path, "feature-branch").await.unwrap();

        let branches = service.get_branches(&repo_path).await.unwrap();
        let feature = branches
            .iter()
            .find(|b| b.name == "feature-branch")
            .unwrap();
        assert!(feature.is_head);

        let main_branch = branches
            .iter()
            .find(|b| b.name != "feature-branch")
            .unwrap();
        service.checkout_branch(&repo_path, &main_branch.name).await.unwrap();

        service.delete_branch(&repo_path, "feature-branch").await.unwrap();

        let branches = service.get_branches(&repo_path).await.unwrap();
        assert_eq!(branches.len(), 1);
    }

    #[tokio::test]
    async fn test_delete_current_branch_fails() {
        let (_temp, repo_path) = create_test_repo();
        create_initial_commit(&repo_path);

        let service = GitService::new();

        let branches = service.get_branches(&repo_path).await.unwrap();
        let current = branches.iter().find(|b| b.is_head).unwrap();

        let result = service.delete_branch(&repo_path, &current.name).await;
        assert!(matches!(result, Err(GitError::InvalidBranch(_))));
    }

    #[tokio::test]
    async fn test_not_a_repository_error() {
        let temp_dir = TempDir::new().unwrap();
        let repo_path = temp_dir.path().to_str().unwrap();

        let service = GitService::new();
        let result = service.get_repo_status(repo_path).await;
        assert!(matches!(result, Err(GitError::NotARepository(_))));
    }

    #[tokio::test]
    async fn test_stage_all() {
        let (_temp, repo_path) = create_test_repo();
        create_initial_commit(&repo_path);

        let service = GitService::new();

        fs::write(Path::new(&repo_path).join("file1.txt"), "content1").unwrap();
        fs::write(Path::new(&repo_path).join("file2.txt"), "content2").unwrap();

        service.stage_all(&repo_path).await.unwrap();

        let status = service.get_repo_status(&repo_path).await.unwrap();
        assert_eq!(status.files.len(), 2);
        assert_eq!(status.staged_count, 2);
    }

    #[tokio::test]
    async fn test_branch_not_found() {
        let (_temp, repo_path) = create_test_repo();
        create_initial_commit(&repo_path);

        let service = GitService::new();
        let result = service.checkout_branch(&repo_path, "nonexistent-branch").await;
        assert!(matches!(result, Err(GitError::NotFound(_))));
    }

    #[tokio::test]
    async fn test_create_duplicate_branch() {
        let (_temp, repo_path) = create_test_repo();
        create_initial_commit(&repo_path);

        let service = GitService::new();
        service.create_branch(&repo_path, "duplicate").await.unwrap();
        let result = service.create_branch(&repo_path, "duplicate").await;
        assert!(matches!(result, Err(GitError::Conflict(_))));
    }

    #[tokio::test]
    async fn test_service_with_db_persistence() {
        let (_temp, repo_path) = create_test_repo();
        create_initial_commit(&repo_path);

        fs::write(Path::new(&repo_path).join("test.txt"), "test content").unwrap();

        let db = crate::db::DatabaseClient::new_in_memory().await.unwrap();

        db.execute(
            "CREATE TABLE git_repos (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                path TEXT UNIQUE NOT NULL,
                current_branch TEXT,
                staged_count INTEGER DEFAULT 0,
                modified_count INTEGER DEFAULT 0,
                untracked_count INTEGER DEFAULT 0,
                conflicted_count INTEGER DEFAULT 0,
                last_poll_at DATETIME
            )",
            (),
        )
        .await
        .unwrap();

        db.execute(
            "CREATE TABLE git_files (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                repo_id INTEGER NOT NULL REFERENCES git_repos(id) ON DELETE CASCADE,
                path TEXT NOT NULL,
                status TEXT,
                file_status TEXT
            )",
            (),
        )
        .await
        .unwrap();

        let service = GitService::with_db(db);

        service.stage_file(&repo_path, "test.txt").await.unwrap();

        let status = service.get_repo_status(&repo_path).await.unwrap();
        assert_eq!(status.files.len(), 1);
        assert_eq!(status.staged_count, 1);

        let repo_info = service.get_repo_from_db(&repo_path).await.unwrap();
        assert!(repo_info.is_some());
        let repo_info = repo_info.unwrap();
        assert_eq!(repo_info.staged_count, 1);
        assert_eq!(repo_info.untracked_count, 0);

        let files = service.get_files_from_db(repo_info.id).await.unwrap();
        assert_eq!(files.len(), 1);
        assert_eq!(files[0].path, "test.txt");
        assert_eq!(files[0].status, "staged");
    }
}
