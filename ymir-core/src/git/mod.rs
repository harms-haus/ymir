//! Git service module for ymir-core
//!
//! Provides core git functionality:
//! - Repository status checking
//! - File staging/unstaging
//! - Commit operations
//! - Branch management
//!
//! This module is adapted from the original src-tauri/src/git.rs
//! to work as a reusable service layer with optional database persistence.

use serde::{Deserialize, Serialize};

pub mod service;

pub use service::GitService;

/// Error types for git operations
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum GitError {
    /// Path not found
    NotFound(String),
    /// Path is not a git repository
    NotARepository(String),
    /// Authentication error
    Auth(String),
    /// Conflict (e.g., branch already exists)
    Conflict(String),
    /// Invalid branch name
    InvalidBranch(String),
    /// Invalid file path
    InvalidPath(String),
    /// Other git error
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
        use git2::{ErrorClass, ErrorCode};
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
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
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
    fn from_git2_status(status: git2::Status) -> Vec<FileStatus> {
        let mut statuses = Vec::new();

        if status.contains(git2::Status::CONFLICTED) {
            statuses.push(FileStatus::Conflicted);
            return statuses;
        }

        if status.contains(git2::Status::INDEX_NEW) {
            statuses.push(FileStatus::Added);
        }
        if status.contains(git2::Status::INDEX_MODIFIED) {
            statuses.push(FileStatus::StagedModified);
        }
        if status.contains(git2::Status::INDEX_DELETED) {
            statuses.push(FileStatus::StagedDeleted);
        }
        if status.contains(git2::Status::INDEX_RENAMED) {
            statuses.push(FileStatus::StagedRenamed);
        }
        if status.contains(git2::Status::WT_MODIFIED) {
            statuses.push(FileStatus::Modified);
        }
        if status.contains(git2::Status::WT_DELETED) {
            statuses.push(FileStatus::Deleted);
        }
        if status.contains(git2::Status::WT_NEW) {
            statuses.push(FileStatus::Untracked);
        }
        if status.contains(git2::Status::IGNORED) {
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
            FileStatus::Modified | FileStatus::Deleted | FileStatus::Untracked | FileStatus::Conflicted
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

/// Repository information for database storage
#[derive(Debug, Clone)]
pub struct RepoInfo {
    /// Repository ID (database primary key)
    pub id: i64,
    /// Absolute path to repository
    pub path: String,
    /// Current branch name
    pub current_branch: String,
    /// Number of staged files
    pub staged_count: usize,
    /// Number of modified files
    pub modified_count: usize,
    /// Number of untracked files
    pub untracked_count: usize,
    /// Number of conflicted files
    pub conflicted_count: usize,
    /// Last poll timestamp
    pub last_poll_at: Option<String>,
}

/// File information for database storage
#[derive(Debug, Clone)]
pub struct RepoFileInfo {
    /// File ID (database primary key)
    pub id: i64,
    /// Repository ID (foreign key)
    pub repo_id: i64,
    /// Relative file path
    pub path: String,
    /// File status (staged/unstaged)
    pub status: String,
    /// Detailed git status
    pub file_status: String,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_file_status_from_git2() {
        let status = git2::Status::INDEX_NEW;
        let result = FileStatus::from_git2_status(status);
        assert!(result.contains(&FileStatus::Added));

        let status = git2::Status::WT_MODIFIED;
        let result = FileStatus::from_git2_status(status);
        assert!(result.contains(&FileStatus::Modified));

        let status = git2::Status::WT_NEW;
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
    fn test_git_error_display() {
        let err = GitError::NotFound("test".to_string());
        assert_eq!(err.to_string(), "Not found: test");

        let err = GitError::NotARepository("/path".to_string());
        assert_eq!(err.to_string(), "Not a git repository: /path");
    }
}
