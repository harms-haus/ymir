//! Git operations module using git2-rs
//!
//! Provides core git functionality for the VS Code-like git panel:
//! - Repository status checking
//! - File staging/unstaging
//! - Commit operations
//! - Branch management

use git2::{BranchType, ErrorClass, ErrorCode, IndexAddOption, Repository, Status, StatusOptions};
use serde::{Deserialize, Serialize};
use std::path::Path;
use tracing::{debug, error, info, instrument, warn};

/// Error types for git operations
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum GitError {
    NotFound(String),
    NotARepository(String),
    Auth(String),
    Conflict(String),
    InvalidBranch(String),
    InvalidPath(String),
    Other(String),
}

impl std::fmt::Display for GitError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            GitError::NotFound(msg) => write!(f, "Not found: {}", msg),
            GitError::NotARepository(msg) => write!(f, "Not a git repository: {}", msg),
            GitError::Auth(msg) => write!(f, "Authentication error: {}", msg),
            GitError::Conflict(msg) => write!(f, "Conflict: {}", msg),
            GitError::InvalidBranch(msg) => write!(f, "Invalid branch: {}", msg),
            GitError::InvalidPath(msg) => write!(f, "Invalid path: {}", msg),
            GitError::Other(msg) => write!(f, "Git error: {}", msg),
        }
    }
}

impl std::error::Error for GitError {}

impl From<git2::Error> for GitError {
    fn from(err: git2::Error) -> Self {
        match err.code() {
            ErrorCode::NotFound => GitError::NotFound(err.message().to_string()),
            ErrorCode::Auth => GitError::Auth(err.message().to_string()),
            ErrorCode::Exists => GitError::Conflict(err.message().to_string()),
            ErrorCode::InvalidSpec => GitError::InvalidBranch(err.message().to_string()),
            _ => match err.class() {
                ErrorClass::Repository => GitError::NotARepository(err.message().to_string()),
                _ => GitError::Other(err.message().to_string()),
            },
        }
    }
}

/// Represents the status of a file in the working directory
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub enum FileStatus {
    /// New file in index (staged)
    Added,
    /// Modified in index (staged)
    StagedModified,
    /// Deleted in index (staged)
    StagedDeleted,
    /// Renamed in index (staged)
    StagedRenamed,
    /// Modified in working tree (unstaged)
    Modified,
    /// Deleted in working tree (unstaged)
    Deleted,
    /// Untracked file
    Untracked,
    /// Ignored file
    Ignored,
    /// Conflicted file
    Conflicted,
    /// Clean (no changes)
    Clean,
}

impl FileStatus {
    /// Convert git2 Status to our FileStatus
    fn from_git2_status(status: Status) -> Vec<FileStatus> {
        let mut statuses = Vec::new();

        if status.contains(Status::CONFLICTED) {
            statuses.push(FileStatus::Conflicted);
            return statuses;
        }

        if status.contains(Status::INDEX_NEW) {
            statuses.push(FileStatus::Added);
        }
        if status.contains(Status::INDEX_MODIFIED) {
            statuses.push(FileStatus::StagedModified);
        }
        if status.contains(Status::INDEX_DELETED) {
            statuses.push(FileStatus::StagedDeleted);
        }
        if status.contains(Status::INDEX_RENAMED) {
            statuses.push(FileStatus::StagedRenamed);
        }
        if status.contains(Status::WT_MODIFIED) {
            statuses.push(FileStatus::Modified);
        }
        if status.contains(Status::WT_DELETED) {
            statuses.push(FileStatus::Deleted);
        }
        if status.contains(Status::WT_NEW) {
            statuses.push(FileStatus::Untracked);
        }
        if status.contains(Status::IGNORED) {
            statuses.push(FileStatus::Ignored);
        }

        if statuses.is_empty() {
            statuses.push(FileStatus::Clean);
        }

        statuses
    }

    /// Check if file is staged (in index)
    pub fn is_staged(&self) -> bool {
        matches!(
            self,
            FileStatus::Added
                | FileStatus::StagedModified
                | FileStatus::StagedDeleted
                | FileStatus::StagedRenamed
        )
    }

    /// Check if file has working tree changes
    pub fn has_changes(&self) -> bool {
        matches!(
            self,
            FileStatus::Modified
                | FileStatus::Deleted
                | FileStatus::Untracked
                | FileStatus::Conflicted
        )
    }
}

/// Information about a single file in the git status
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GitFile {
    /// Relative path from repository root
    pub path: String,
    /// Current status of the file
    pub status: FileStatus,
    /// Additional status for files with both staged and unstaged changes
    #[serde(skip_serializing_if = "Option::is_none")]
    pub secondary_status: Option<FileStatus>,
}

/// Information about a branch
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BranchInfo {
    /// Branch name
    pub name: String,
    /// Whether this is the current HEAD branch
    pub is_head: bool,
    /// Whether this is a remote branch
    pub is_remote: bool,
    /// Upstream branch name (if any)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub upstream: Option<String>,
}

/// Complete repository status
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GitStatus {
    /// Repository root path
    pub repo_path: String,
    /// Current branch name
    pub current_branch: String,
    /// Files with changes
    pub files: Vec<GitFile>,
    /// Number of staged files
    pub staged_count: usize,
    /// Number of modified (unstaged) files
    pub modified_count: usize,
    /// Number of untracked files
    pub untracked_count: usize,
    /// Number of conflicted files
    pub conflicted_count: usize,
    /// Whether there are unpushed commits (ahead of upstream)
    pub ahead_count: usize,
    /// Whether there are unpulled commits (behind upstream)
    pub behind_count: usize,
}

/// Open a repository at the given path
#[instrument]
fn open_repository(repo_path: &str) -> Result<Repository, GitError> {
    let path = Path::new(repo_path);
    if !path.exists() {
        return Err(GitError::NotFound(format!(
            "Path does not exist: {}",
            repo_path
        )));
    }

    Repository::open(path).map_err(|e| {
        if e.code() == ErrorCode::NotFound {
            GitError::NotARepository(format!("{} is not a git repository", repo_path))
        } else {
            GitError::from(e)
        }
    })
}

/// Get the current branch name
#[instrument(skip(repo))]
fn get_current_branch(repo: &Repository) -> Result<String, GitError> {
    let head = repo.head().map_err(|e| {
        if e.code() == ErrorCode::UnbornBranch {
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

/// Get the status of a repository
#[instrument]
pub fn get_repo_status(repo_path: &str) -> Result<GitStatus, GitError> {
    debug!(repo_path = %repo_path, "Getting repository status");

    let repo = open_repository(repo_path)?;
    let current_branch = get_current_branch(&repo).unwrap_or_else(|_| "(no branch)".to_string());

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

        // Count categories
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

        // Create GitFile entry
        let (primary, secondary) = if file_statuses.len() > 1 {
            // File has both staged and unstaged changes
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

    // Get ahead/behind counts
    let (ahead_count, behind_count) = get_ahead_behind(&repo).unwrap_or((0, 0));

    info!(
        repo_path = %repo_path,
        branch = %current_branch,
        file_count = files.len(),
        staged = staged_count,
        modified = modified_count,
        untracked = untracked_count,
        "Repository status retrieved"
    );

    Ok(GitStatus {
        repo_path: repo_path.to_string(),
        current_branch,
        files,
        staged_count,
        modified_count,
        untracked_count,
        conflicted_count,
        ahead_count,
        behind_count,
    })
}

/// Get ahead/behind counts for current branch
#[instrument(skip(repo))]
fn get_ahead_behind(repo: &Repository) -> Result<(usize, usize), GitError> {
    let head = repo.head().map_err(GitError::from)?;
    let local_ref = head.resolve().map_err(GitError::from)?;
    let local_oid = local_ref
        .target()
        .ok_or_else(|| GitError::Other("No target".to_string()))?;

    // Try to get upstream
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

/// Stage a file (add to index)
#[instrument]
pub fn stage_file(repo_path: &str, file_path: &str) -> Result<(), GitError> {
    debug!(repo_path = %repo_path, file_path = %file_path, "Staging file");

    let repo = open_repository(repo_path)?;
    let mut index = repo.index().map_err(GitError::from)?;

    let path = Path::new(file_path);
    index.add_path(path).map_err(GitError::from)?;
    index.write().map_err(GitError::from)?;

    info!(file_path = %file_path, "File staged successfully");
    Ok(())
}

/// Unstage a file (remove from index, keep working tree changes)
#[instrument]
pub fn unstage_file(repo_path: &str, file_path: &str) -> Result<(), GitError> {
    debug!(repo_path = %repo_path, file_path = %file_path, "Unstaging file");

    let repo = open_repository(repo_path)?;
    let mut index = repo.index().map_err(GitError::from)?;

    // Get the file's current state in HEAD
    let head = repo.head().map_err(|e| {
        if e.code() == ErrorCode::UnbornBranch {
            // No HEAD yet, just remove from index
            GitError::Other("No commits yet".to_string())
        } else {
            GitError::from(e)
        }
    })?;

    let head_tree = head.peel_to_tree().map_err(GitError::from)?;
    let entry = head_tree.get_path(Path::new(file_path)).ok();

    if let Some(entry) = entry {
        // Restore the file in index to HEAD state
        let blob = repo.find_blob(entry.id()).map_err(GitError::from)?;
        // Create an IndexEntry from the tree entry
        let mut index_entry = git2::IndexEntry {
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
        // File doesn't exist in HEAD, remove from index
        index
            .remove_path(Path::new(file_path))
            .map_err(GitError::from)?;
    }

    index.write().map_err(GitError::from)?;

    info!(file_path = %file_path, "File unstaged successfully");
    Ok(())
}

/// Discard changes in working tree (checkout file from index)
#[instrument]
pub fn discard_changes(repo_path: &str, file_path: &str) -> Result<(), GitError> {
    debug!(repo_path = %repo_path, file_path = %file_path, "Discarding changes");

    let repo = open_repository(repo_path)?;

    // Check if file is in index
    let index = repo.index().map_err(GitError::from)?;
    let entry = index.get_path(Path::new(file_path), 0);

    if entry.is_some() {
        // Checkout from index - need mutable index
        let mut checkout_opts = git2::build::CheckoutBuilder::new();
        checkout_opts.path(file_path);
        checkout_opts.force();

        let mut index = repo.index().map_err(GitError::from)?;
        repo.checkout_index(Some(&mut index), Some(&mut checkout_opts))
            .map_err(GitError::from)?;
    } else {
        // File is untracked, remove it
        let full_path = Path::new(repo_path).join(file_path);
        if full_path.exists() {
            if full_path.is_file() {
                std::fs::remove_file(&full_path)
                    .map_err(|e| GitError::Other(format!("Failed to remove file: {}", e)))?;
            } else if full_path.is_dir() {
                std::fs::remove_dir_all(&full_path)
                    .map_err(|e| GitError::Other(format!("Failed to remove directory: {}", e)))?;
            }
        }
    }

    info!(file_path = %file_path, "Changes discarded successfully");
    Ok(())
}

/// Create a commit with the given message
#[instrument]
pub fn commit(repo_path: &str, message: &str) -> Result<String, GitError> {
    debug!(repo_path = %repo_path, "Creating commit");

    let repo = open_repository(repo_path)?;

    // Get signature from config or use defaults
    let sig = repo
        .signature()
        .or_else(|_| git2::Signature::now("Anonymous", "anonymous@example.com"))
        .map_err(GitError::from)?;

    // Prepare tree from index
    let mut index = repo.index().map_err(GitError::from)?;
    let tree_id = index.write_tree().map_err(GitError::from)?;
    let tree = repo.find_tree(tree_id).map_err(GitError::from)?;

    // Get parent commit(s)
    let head = repo.head();
    let parents: Vec<git2::Commit> = match head {
        Ok(head) => {
            let parent = head.peel_to_commit().map_err(GitError::from)?;
            vec![parent]
        }
        Err(e) if e.code() == ErrorCode::UnbornBranch => {
            // Initial commit, no parents
            vec![]
        }
        Err(e) => return Err(GitError::from(e)),
    };

    let parent_refs: Vec<&git2::Commit> = parents.iter().collect();

    // Create commit
    let commit_id = repo
        .commit(Some("HEAD"), &sig, &sig, message, &tree, &parent_refs)
        .map_err(GitError::from)?;

    let commit_oid = commit_id.to_string();
    info!(commit_id = %commit_oid, "Commit created successfully");

    Ok(commit_oid)
}

/// Get list of all branches
#[instrument]
pub fn get_branches(repo_path: &str) -> Result<Vec<BranchInfo>, GitError> {
    debug!(repo_path = %repo_path, "Getting branches");

    let repo = open_repository(repo_path)?;
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

    info!(branch_count = result.len(), "Branches retrieved");
    Ok(result)
}

/// Create a new branch from the current HEAD
#[instrument]
pub fn create_branch(repo_path: &str, name: &str) -> Result<(), GitError> {
    debug!(repo_path = %repo_path, branch_name = %name, "Creating branch");

    let repo = open_repository(repo_path)?;

    let head = repo.head().map_err(GitError::from)?;
    let head_commit = head.peel_to_commit().map_err(GitError::from)?;

    repo.branch(name, &head_commit, false).map_err(|e| {
        if e.code() == ErrorCode::Exists {
            GitError::Conflict(format!("Branch '{}' already exists", name))
        } else {
            GitError::from(e)
        }
    })?;

    info!(branch_name = %name, "Branch created successfully");
    Ok(())
}

/// Delete a branch
#[instrument]
pub fn delete_branch(repo_path: &str, name: &str) -> Result<(), GitError> {
    debug!(repo_path = %repo_path, branch_name = %name, "Deleting branch");

    let repo = open_repository(repo_path)?;

    // Check if trying to delete current branch
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
        if e.code() == ErrorCode::NotFound {
            GitError::NotFound(format!("Branch '{}' not found", name))
        } else {
            GitError::from(e)
        }
    })?;

    branch.delete().map_err(GitError::from)?;

    info!(branch_name = %name, "Branch deleted successfully");
    Ok(())
}

/// Checkout/switch to a branch
#[instrument]
pub fn checkout_branch(repo_path: &str, name: &str) -> Result<(), GitError> {
    debug!(repo_path = %repo_path, branch_name = %name, "Checking out branch");

    let repo = open_repository(repo_path)?;

    // Find the branch
    let branch = repo.find_branch(name, BranchType::Local).map_err(|e| {
        if e.code() == ErrorCode::NotFound {
            GitError::NotFound(format!("Branch '{}' not found", name))
        } else {
            GitError::from(e)
        }
    })?;

    let reference = branch.get();
    let treeish = reference.resolve().map_err(GitError::from)?;

    // Get the commit and its tree
    let target_oid = treeish
        .target()
        .ok_or_else(|| GitError::Other("Reference has no target".to_string()))?;
    let commit = repo.find_commit(target_oid).map_err(GitError::from)?;
    let tree = commit.tree().map_err(GitError::from)?;

    // Checkout the branch
    let mut checkout_opts = git2::build::CheckoutBuilder::new();
    checkout_opts.force();

    repo.checkout_tree(tree.as_object(), Some(&mut checkout_opts))
        .map_err(GitError::from)?;

    // Move HEAD to the branch
    let ref_name = reference
        .name()
        .ok_or_else(|| GitError::Other("Reference has no name".to_string()))?;
    repo.set_head(ref_name).map_err(GitError::from)?;

    info!(branch_name = %name, "Branch checked out successfully");
    Ok(())
}

/// Stage all changes (git add -A)
#[instrument]
pub fn stage_all(repo_path: &str) -> Result<(), GitError> {
    debug!(repo_path = %repo_path, "Staging all changes");

    let repo = open_repository(repo_path)?;
    let mut index = repo.index().map_err(GitError::from)?;

    index
        .add_all(["*"].iter(), IndexAddOption::DEFAULT, None)
        .map_err(GitError::from)?;
    index.write().map_err(GitError::from)?;

    info!("All changes staged successfully");
    Ok(())
}

/// Unstage all changes (git reset HEAD)
#[instrument]
pub fn unstage_all(repo_path: &str) -> Result<(), GitError> {
    debug!(repo_path = %repo_path, "Unstaging all changes");

    let repo = open_repository(repo_path)?;
    let mut index = repo.index().map_err(GitError::from)?;

    // Reset index to HEAD tree
    let head = repo.head().map_err(|e| {
        if e.code() == ErrorCode::UnbornBranch {
            // No HEAD, just clear the index
            GitError::Other("No commits yet".to_string())
        } else {
            GitError::from(e)
        }
    })?;

    let head_tree = head.peel_to_tree().map_err(GitError::from)?;

    // Read HEAD tree into index
    index.read_tree(&head_tree).map_err(GitError::from)?;
    index.write().map_err(GitError::from)?;

    info!("All changes unstaged successfully");
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::TempDir;

    fn create_test_repo() -> (TempDir, String) {
        let temp_dir = TempDir::new().unwrap();
        let repo_path = temp_dir.path().to_str().unwrap().to_string();

        // Initialize git repo
        let repo = Repository::init(&temp_dir).unwrap();

        // Configure git user
        let mut config = repo.config().unwrap();
        config.set_str("user.name", "Test User").unwrap();
        config.set_str("user.email", "test@example.com").unwrap();

        (temp_dir, repo_path)
    }

    fn create_initial_commit(repo_path: &str) {
        let repo = Repository::open(repo_path).unwrap();
        let sig = git2::Signature::now("Test", "test@example.com").unwrap();

        // Create a file and stage it
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

    #[test]
    fn test_file_status_from_git2() {
        let status = Status::INDEX_NEW;
        let result = FileStatus::from_git2_status(status);
        assert!(result.contains(&FileStatus::Added));

        let status = Status::WT_MODIFIED;
        let result = FileStatus::from_git2_status(status);
        assert!(result.contains(&FileStatus::Modified));

        let status = Status::WT_NEW;
        let result = FileStatus::from_git2_status(status);
        assert!(result.contains(&FileStatus::Untracked));
    }

    #[test]
    fn test_file_status_is_staged() {
        assert!(FileStatus::Added.is_staged());
        assert!(FileStatus::StagedModified.is_staged());
        assert!(FileStatus::StagedDeleted.is_staged());
        assert!(!FileStatus::Modified.is_staged());
        assert!(!FileStatus::Untracked.is_staged());
    }

    #[test]
    fn test_file_status_has_changes() {
        assert!(FileStatus::Modified.has_changes());
        assert!(FileStatus::Deleted.has_changes());
        assert!(FileStatus::Untracked.has_changes());
        assert!(!FileStatus::Added.has_changes());
        assert!(!FileStatus::Clean.has_changes());
    }

    #[test]
    fn test_get_repo_status_empty_repo() {
        let (_temp, repo_path) = create_test_repo();

        // Empty repo should have no files
        let status = get_repo_status(&repo_path).unwrap();
        assert_eq!(status.files.len(), 0);
        assert_eq!(status.staged_count, 0);
        assert_eq!(status.modified_count, 0);
    }

    #[test]
    fn test_stage_and_commit() {
        let (_temp, repo_path) = create_test_repo();
        create_initial_commit(&repo_path);

        // Create a new file
        let file_path = Path::new(&repo_path).join("test.txt");
        fs::write(&file_path, "test content").unwrap();

        // Stage the file
        stage_file(&repo_path, "test.txt").unwrap();

        // Check status
        let status = get_repo_status(&repo_path).unwrap();
        assert_eq!(status.files.len(), 1);
        assert_eq!(status.files[0].status, FileStatus::Added);

        // Commit
        let commit_id = commit(&repo_path, "Add test file").unwrap();
        assert!(!commit_id.is_empty());

        // Status should be clean now
        let status = get_repo_status(&repo_path).unwrap();
        assert_eq!(status.files.len(), 0);
    }

    #[test]
    fn test_unstage_file() {
        let (_temp, repo_path) = create_test_repo();
        create_initial_commit(&repo_path);

        // Create and stage a file
        let file_path = Path::new(&repo_path).join("test.txt");
        fs::write(&file_path, "test content").unwrap();
        stage_file(&repo_path, "test.txt").unwrap();

        // Verify staged
        let status = get_repo_status(&repo_path).unwrap();
        assert_eq!(status.files[0].status, FileStatus::Added);

        // Unstage
        unstage_file(&repo_path, "test.txt").unwrap();

        // Should be untracked now
        let status = get_repo_status(&repo_path).unwrap();
        assert_eq!(status.files[0].status, FileStatus::Untracked);
    }

    #[test]
    fn test_discard_changes() {
        let (_temp, repo_path) = create_test_repo();
        create_initial_commit(&repo_path);

        // Modify the tracked file
        let file_path = Path::new(&repo_path).join("initial.txt");
        fs::write(&file_path, "modified content").unwrap();

        // Verify modified
        let status = get_repo_status(&repo_path).unwrap();
        assert_eq!(status.files[0].status, FileStatus::Modified);

        // Discard changes
        discard_changes(&repo_path, "initial.txt").unwrap();

        // Should be clean
        let status = get_repo_status(&repo_path).unwrap();
        assert_eq!(status.files.len(), 0);

        // File content should be restored
        let content = fs::read_to_string(&file_path).unwrap();
        assert_eq!(content, "initial content");
    }

    #[test]
    fn test_branch_operations() {
        let (_temp, repo_path) = create_test_repo();
        create_initial_commit(&repo_path);

        // Create branch
        create_branch(&repo_path, "feature-branch").unwrap();

        // List branches
        let branches = get_branches(&repo_path).unwrap();
        assert_eq!(branches.len(), 2); // main/master + feature-branch

        let feature = branches
            .iter()
            .find(|b| b.name == "feature-branch")
            .unwrap();
        assert!(!feature.is_head);

        // Checkout branch
        checkout_branch(&repo_path, "feature-branch").unwrap();

        let branches = get_branches(&repo_path).unwrap();
        let feature = branches
            .iter()
            .find(|b| b.name == "feature-branch")
            .unwrap();
        assert!(feature.is_head);

        // Checkout back to main/master
        let main_branch = branches
            .iter()
            .find(|b| b.name != "feature-branch")
            .unwrap();
        checkout_branch(&repo_path, &main_branch.name).unwrap();

        // Delete branch
        delete_branch(&repo_path, "feature-branch").unwrap();

        let branches = get_branches(&repo_path).unwrap();
        assert_eq!(branches.len(), 1);
    }

    #[test]
    fn test_delete_current_branch_fails() {
        let (_temp, repo_path) = create_test_repo();
        create_initial_commit(&repo_path);

        // Get current branch name
        let branches = get_branches(&repo_path).unwrap();
        let current = branches.iter().find(|b| b.is_head).unwrap();

        // Should fail
        let result = delete_branch(&repo_path, &current.name);
        assert!(matches!(result, Err(GitError::InvalidBranch(_))));
    }

    #[test]
    fn test_not_a_repository_error() {
        let temp_dir = TempDir::new().unwrap();
        let repo_path = temp_dir.path().to_str().unwrap();

        let result = get_repo_status(repo_path);
        assert!(matches!(result, Err(GitError::NotARepository(_))));
    }

    #[test]
    fn test_stage_all() {
        let (_temp, repo_path) = create_test_repo();
        create_initial_commit(&repo_path);

        // Create multiple files
        fs::write(Path::new(&repo_path).join("file1.txt"), "content1").unwrap();
        fs::write(Path::new(&repo_path).join("file2.txt"), "content2").unwrap();

        // Stage all
        stage_all(&repo_path).unwrap();

        let status = get_repo_status(&repo_path).unwrap();
        assert_eq!(status.files.len(), 2);
        assert_eq!(status.staged_count, 2);
    }

    #[test]
    fn test_branch_not_found() {
        let (_temp, repo_path) = create_test_repo();
        create_initial_commit(&repo_path);

        let result = checkout_branch(&repo_path, "nonexistent-branch");
        assert!(matches!(result, Err(GitError::NotFound(_))));
    }

    #[test]
    fn test_create_duplicate_branch() {
        let (_temp, repo_path) = create_test_repo();
        create_initial_commit(&repo_path);

        create_branch(&repo_path, "duplicate").unwrap();
        let result = create_branch(&repo_path, "duplicate");
        assert!(matches!(result, Err(GitError::Conflict(_))));
    }
}
