//! Git handlers for JSON-RPC methods
//!
//! Provides handlers for git operations through WebSocket JSON-RPC:
//! - git.status: Get repository status
//! - git.stage: Stage a file
//! - git.unstage: Unstage a file
//! - git.commit: Create a commit
//! - git.branches: List branches
//! - git.checkout: Checkout/switch branch
//!
//! Each handler follows the two-layer pattern: business handler + RPC adapter.

use crate::db::client::DatabaseClient;
use crate::git::service::GitService;
use crate::git::{BranchInfo, FileStatus, GitStatus};
use crate::server::protocol::{OutgoingMessage, ProtocolError};
use crate::types::{CoreError, Result};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::RwLock;
use tokio::time::interval;

// ============================================================================
// Input/Output Types
// ============================================================================

/// Input for git.status method
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GitStatusInput {
    /// Absolute path to the git repository
    pub repo_path: String,
}

/// Output for git.status method
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GitStatusOutput {
    /// Repository status information
    pub status: GitStatus,
}

/// Input for git.stage method
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GitStageInput {
    /// Absolute path to the git repository
    pub repo_path: String,
    /// Relative path of the file to stage
    pub file_path: String,
}

/// Output for git.stage method
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GitStageOutput {
    /// Whether the operation succeeded
    pub success: bool,
    /// Path of the staged file
    pub file_path: String,
}

/// Input for git.unstage method
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GitUnstageInput {
    /// Absolute path to the git repository
    pub repo_path: String,
    /// Relative path of the file to unstage
    pub file_path: String,
}

/// Output for git.unstage method
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GitUnstageOutput {
    /// Whether the operation succeeded
    pub success: bool,
    /// Path of the unstaged file
    pub file_path: String,
}

/// Input for git.commit method
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GitCommitInput {
    /// Absolute path to the git repository
    pub repo_path: String,
    /// Commit message
    pub message: String,
}

/// Output for git.commit method
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GitCommitOutput {
    /// Commit ID (SHA)
    pub commit_id: String,
}

/// Input for git.branches method
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GitBranchesInput {
    /// Absolute path to the git repository
    pub repo_path: String,
}

/// Output for git.branches method
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GitBranchesOutput {
    /// List of branches
    pub branches: Vec<BranchInfo>,
}

/// Input for git.checkout method
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GitCheckoutInput {
    /// Absolute path to the git repository
    pub repo_path: String,
    /// Branch name to checkout
    pub branch: String,
}

/// Output for git.checkout method
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GitCheckoutOutput {
    /// Whether the operation succeeded
    pub success: bool,
    /// Name of the checked out branch
    pub branch: String,
}

// ============================================================================
// Notification Types
// ============================================================================

/// Git state change notification
#[derive(Debug, Clone, Serialize)]
#[serde(tag = "action", rename_all = "camelCase")]
pub enum GitNotification {
    /// Repository status has changed
    StatusChanged {
        /// Repository path
        repo_path: String,
        /// New status
        status: GitStatus,
    },
    /// File has been staged
    FileStaged {
        /// Repository path
        repo_path: String,
        /// File path
        file_path: String,
    },
    /// File has been unstaged
    FileUnstaged {
        /// Repository path
        repo_path: String,
        /// File path
        file_path: String,
    },
    /// New commit created
    Committed {
        /// Repository path
        repo_path: String,
        /// Commit ID
        commit_id: String,
        /// Commit message
        message: String,
    },
    /// Branch switched
    BranchChanged {
        /// Repository path
        repo_path: String,
        /// New branch name
        branch: String,
    },
}

// ============================================================================
// Git Handler (Business Logic Layer)
// ============================================================================

/// Git handler for repository operations
///
/// Wraps GitService and provides business logic for git operations
/// with optional database persistence and polling support.
#[derive(Clone)]
pub struct GitHandler {
    git_service: GitService,
    db: Option<Arc<DatabaseClient>>,
    /// Map of repo paths to their last known status (for change detection)
    last_status: Arc<RwLock<HashMap<String, GitStatus>>>,
}

impl GitHandler {
    /// Create a new git handler without database persistence
    pub fn new() -> Self {
        Self {
            git_service: GitService::new(),
            db: None,
            last_status: Arc::new(RwLock::new(HashMap::new())),
        }
    }

    /// Create a new git handler with database persistence
    pub fn with_db(db: Arc<DatabaseClient>) -> Self {
        Self {
            git_service: GitService::with_db(db.as_ref().clone()),
            db: Some(db),
            last_status: Arc::new(RwLock::new(HashMap::new())),
        }
    }

    /// Get repository status
    pub async fn status(&self, input: GitStatusInput) -> Result<GitStatusOutput> {
        let status = self
            .git_service
            .get_repo_status(&input.repo_path)
            .await
            .map_err(|e| CoreError::Other(format!("Git error: {}", e)))?;

        // Store last known status
        let mut last_status = self.last_status.write().await;
        last_status.insert(input.repo_path.clone(), status.clone());

        Ok(GitStatusOutput { status })
    }

    /// Stage a file
    pub async fn stage(&self, input: GitStageInput) -> Result<GitStageOutput> {
        self.git_service
            .stage_file(&input.repo_path, &input.file_path)
            .await
            .map_err(|e| CoreError::Other(format!("Git error: {}", e)))?;

        Ok(GitStageOutput {
            success: true,
            file_path: input.file_path,
        })
    }

    /// Unstage a file
    pub async fn unstage(&self, input: GitUnstageInput) -> Result<GitUnstageOutput> {
        self.git_service
            .unstage_file(&input.repo_path, &input.file_path)
            .await
            .map_err(|e| CoreError::Other(format!("Git error: {}", e)))?;

        Ok(GitUnstageOutput {
            success: true,
            file_path: input.file_path,
        })
    }

    /// Create a commit
    pub async fn commit(&self, input: GitCommitInput) -> Result<GitCommitOutput> {
        let commit_id = self
            .git_service
            .commit(&input.repo_path, &input.message)
            .await
            .map_err(|e| CoreError::Other(format!("Git error: {}", e)))?;

        Ok(GitCommitOutput { commit_id })
    }

    /// Get list of branches
    pub async fn branches(&self, input: GitBranchesInput) -> Result<GitBranchesOutput> {
        let branches = self
            .git_service
            .get_branches(&input.repo_path)
            .await
            .map_err(|e| CoreError::Other(format!("Git error: {}", e)))?;

        Ok(GitBranchesOutput { branches })
    }

    /// Checkout/switch to a branch
    pub async fn checkout(&self, input: GitCheckoutInput) -> Result<GitCheckoutOutput> {
        self.git_service
            .checkout_branch(&input.repo_path, &input.branch)
            .await
            .map_err(|e| CoreError::Other(format!("Git error: {}", e)))?;

        Ok(GitCheckoutOutput {
            success: true,
            branch: input.branch,
        })
    }

    /// Create a notification message
    pub fn create_notification(&self, notification: GitNotification) -> OutgoingMessage {
        let method = "git.state_change".to_string();
        let params = serde_json::to_value(notification).ok();
        OutgoingMessage::notification(method, params)
    }

    /// Check if status has changed for a repository
    pub async fn has_status_changed(&self, repo_path: &str, new_status: &GitStatus) -> bool {
        let last_status = self.last_status.read().await;
        if let Some(last) = last_status.get(repo_path) {
            // Compare key metrics
            last.current_branch != new_status.current_branch
                || last.staged_count != new_status.staged_count
                || last.modified_count != new_status.modified_count
                || last.untracked_count != new_status.untracked_count
                || last.conflicted_count != new_status.conflicted_count
                || last.ahead_count != new_status.ahead_count
                || last.behind_count != new_status.behind_count
        } else {
            true // No previous status, consider it changed
        }
    }

    /// Update last known status
    pub async fn update_last_status(&self, repo_path: &str, status: GitStatus) {
        let mut last_status = self.last_status.write().await;
        last_status.insert(repo_path.to_string(), status);
    }

    /// Get the underlying git service (for polling)
    pub fn git_service(&self) -> &GitService {
        &self.git_service
    }
}

impl Default for GitHandler {
    fn default() -> Self {
        Self::new()
    }
}

// ============================================================================
// Git RPC Handler (Adapter Layer)
// ============================================================================

/// JSON-RPC adapter for git operations
///
/// Wraps GitHandler and adapts it to the JSON-RPC protocol.
pub struct GitRpcHandler {
    inner: GitHandler,
}

impl GitRpcHandler {
    /// Create a new RPC handler without database
    pub fn new() -> Self {
        Self {
            inner: GitHandler::new(),
        }
    }

    /// Create a new RPC handler with database
    pub fn with_db(db: Arc<DatabaseClient>) -> Self {
        Self {
            inner: GitHandler::with_db(db),
        }
    }

    /// Handle JSON-RPC requests
    pub async fn handle(
        &self,
        method: &str,
        params: Option<Value>,
    ) -> std::result::Result<Value, ProtocolError> {
        match method {
            "git.status" => {
                let input: GitStatusInput = params
                    .map(|p| serde_json::from_value(p).map_err(|e| ProtocolError::InvalidParams(e.to_string())))
                    .unwrap_or(Err(ProtocolError::InvalidParams("Missing params".to_string())))?;

                let output = self.inner.status(input).await.map_err(|e| {
                    ProtocolError::InternalError(format!("Failed to get git status: {}", e))
                })?;

                serde_json::to_value(output).map_err(|e| ProtocolError::InternalError(e.to_string()))
            }
            "git.stage" => {
                let input: GitStageInput = params
                    .map(|p| serde_json::from_value(p).map_err(|e| ProtocolError::InvalidParams(e.to_string())))
                    .unwrap_or(Err(ProtocolError::InvalidParams("Missing params".to_string())))?;

                let output = self.inner.stage(input).await.map_err(|e| {
                    ProtocolError::InternalError(format!("Failed to stage file: {}", e))
                })?;

                serde_json::to_value(output).map_err(|e| ProtocolError::InternalError(e.to_string()))
            }
            "git.unstage" => {
                let input: GitUnstageInput = params
                    .map(|p| serde_json::from_value(p).map_err(|e| ProtocolError::InvalidParams(e.to_string())))
                    .unwrap_or(Err(ProtocolError::InvalidParams("Missing params".to_string())))?;

                let output = self.inner.unstage(input).await.map_err(|e| {
                    ProtocolError::InternalError(format!("Failed to unstage file: {}", e))
                })?;

                serde_json::to_value(output).map_err(|e| ProtocolError::InternalError(e.to_string()))
            }
            "git.commit" => {
                let input: GitCommitInput = params
                    .map(|p| serde_json::from_value(p).map_err(|e| ProtocolError::InvalidParams(e.to_string())))
                    .unwrap_or(Err(ProtocolError::InvalidParams("Missing params".to_string())))?;

                let output = self.inner.commit(input).await.map_err(|e| {
                    ProtocolError::InternalError(format!("Failed to create commit: {}", e))
                })?;

                serde_json::to_value(output).map_err(|e| ProtocolError::InternalError(e.to_string()))
            }
            "git.branches" => {
                let input: GitBranchesInput = params
                    .map(|p| serde_json::from_value(p).map_err(|e| ProtocolError::InvalidParams(e.to_string())))
                    .unwrap_or(Err(ProtocolError::InvalidParams("Missing params".to_string())))?;

                let output = self.inner.branches(input).await.map_err(|e| {
                    ProtocolError::InternalError(format!("Failed to get branches: {}", e))
                })?;

                serde_json::to_value(output).map_err(|e| ProtocolError::InternalError(e.to_string()))
            }
            "git.checkout" => {
                let input: GitCheckoutInput = params
                    .map(|p| serde_json::from_value(p).map_err(|e| ProtocolError::InvalidParams(e.to_string())))
                    .unwrap_or(Err(ProtocolError::InvalidParams("Missing params".to_string())))?;

                let output = self.inner.checkout(input).await.map_err(|e| {
                    ProtocolError::InternalError(format!("Failed to checkout branch: {}", e))
                })?;

                serde_json::to_value(output).map_err(|e| ProtocolError::InternalError(e.to_string()))
            }
            _ => Err(ProtocolError::MethodNotFound(method.to_string())),
        }
    }

    /// Get reference to inner handler
    pub fn inner(&self) -> &GitHandler {
        &self.inner
    }
}

impl Default for GitRpcHandler {
    fn default() -> Self {
        Self::new()
    }
}

// ============================================================================
// Git Polling Service
// ============================================================================

/// Server-side git polling service
///
/// Polls registered repositories for status changes and emits notifications.
pub struct GitPollingService {
    handler: GitHandler,
    /// Map of repo paths to their polling intervals
    poll_intervals: Arc<RwLock<HashMap<String, Duration>>>,
}

impl GitPollingService {
    /// Create a new polling service
    pub fn new(handler: GitHandler) -> Self {
        Self {
            handler,
            poll_intervals: Arc::new(RwLock::new(HashMap::new())),
        }
    }

    /// Register a repository for polling
    pub async fn register_repo(&self, repo_path: String, interval: Duration) {
        let mut intervals = self.poll_intervals.write().await;
        intervals.insert(repo_path, interval);
    }

    /// Unregister a repository from polling
    pub async fn unregister_repo(&self, repo_path: &str) {
        let mut intervals = self.poll_intervals.write().await;
        intervals.remove(repo_path);
    }

    /// Poll all registered repositories and return notifications for changed repos
    pub async fn poll_all(&self) -> Vec<(String, GitStatus)> {
        let intervals = self.poll_intervals.read().await;
        let mut changed = Vec::new();

        for (repo_path, _interval) in intervals.iter() {
            match self.handler.git_service().get_repo_status(repo_path).await {
                Ok(status) => {
                    if self.handler.has_status_changed(repo_path, &status).await {
                        self.handler.update_last_status(repo_path, status.clone()).await;
                        changed.push((repo_path.clone(), status));
                    }
                }
                Err(_) => {
                    // Silently skip repos that fail to poll
                }
            }
        }

        changed
    }

    /// Start the polling loop (returns a future that runs indefinitely)
    pub async fn run<F>(self, mut on_change: F)
    where
        F: FnMut(String, GitStatus) + Send + 'static,
    {
        let mut ticker = interval(Duration::from_secs(5)); // Default 5 second tick

        loop {
            ticker.tick().await;

            let changed = self.poll_all().await;
            for (repo_path, status) in changed {
                on_change(repo_path, status);
            }
        }
    }
}

// ============================================================================
// Tests
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::TempDir;

    fn create_test_repo() -> (TempDir, String) {
        let temp_dir = TempDir::new().unwrap();
        let repo_path = temp_dir.path().to_str().unwrap().to_string();

        let repo = git2::Repository::init(&temp_dir).unwrap();

        let mut config = repo.config().unwrap();
        config.set_str("user.name", "Test User").unwrap();
        config.set_str("user.email", "test@example.com").unwrap();

        (temp_dir, repo_path)
    }

    fn create_initial_commit(repo_path: &str) {
        let repo = git2::Repository::open(repo_path).unwrap();
        let sig = git2::Signature::now("Test", "test@example.com").unwrap();

        let file_path = PathBuf::from(repo_path).join("initial.txt");
        fs::write(&file_path, "initial content").unwrap();

        let mut index = repo.index().unwrap();
        index.add_path(std::path::Path::new("initial.txt")).unwrap();
        index.write().unwrap();

        let tree_id = index.write_tree().unwrap();
        let tree = repo.find_tree(tree_id).unwrap();

        repo.commit(Some("HEAD"), &sig, &sig, "Initial commit", &tree, &[])
            .unwrap();
    }

    #[tokio::test]
    async fn test_status_empty_repo() {
        let (_temp, repo_path) = create_test_repo();
        let handler = GitHandler::new();

        let input = GitStatusInput { repo_path };
        let output = handler.status(input).await.unwrap();

        assert_eq!(output.status.files.len(), 0);
        assert_eq!(output.status.staged_count, 0);
        assert_eq!(output.status.modified_count, 0);
    }

    #[tokio::test]
    async fn test_stage_and_status() {
        let (_temp, repo_path) = create_test_repo();
        create_initial_commit(&repo_path);
        let handler = GitHandler::new();

        // Create a new file
        let file_path = PathBuf::from(&repo_path).join("test.txt");
        fs::write(&file_path, "test content").unwrap();

        // Stage the file
        let stage_input = GitStageInput {
            repo_path: repo_path.clone(),
            file_path: "test.txt".to_string(),
        };
        let stage_output = handler.stage(stage_input).await.unwrap();
        assert!(stage_output.success);
        assert_eq!(stage_output.file_path, "test.txt");

        // Check status
        let status_input = GitStatusInput { repo_path: repo_path.clone() };
        let status_output = handler.status(status_input).await.unwrap();
        assert_eq!(status_output.status.files.len(), 1);
        assert!(status_output.status.files[0].status.is_staged());
    }

    #[tokio::test]
    async fn test_unstage() {
        let (_temp, repo_path) = create_test_repo();
        create_initial_commit(&repo_path);
        let handler = GitHandler::new();

        // Create and stage a file
        let file_path = PathBuf::from(&repo_path).join("test.txt");
        fs::write(&file_path, "test content").unwrap();

        handler
            .stage(GitStageInput {
                repo_path: repo_path.clone(),
                file_path: "test.txt".to_string(),
            })
            .await
            .unwrap();

        // Unstage the file
        let unstage_input = GitUnstageInput {
            repo_path: repo_path.clone(),
            file_path: "test.txt".to_string(),
        };
        let unstage_output = handler.unstage(unstage_input).await.unwrap();
        assert!(unstage_output.success);

        // Check status - should be untracked
        let status_input = GitStatusInput { repo_path };
        let status_output = handler.status(status_input).await.unwrap();
        assert_eq!(status_output.status.files[0].status, FileStatus::Untracked);
    }

    #[tokio::test]
    async fn test_commit() {
        let (_temp, repo_path) = create_test_repo();
        create_initial_commit(&repo_path);
        let handler = GitHandler::new();

        // Create and stage a file
        let file_path = PathBuf::from(&repo_path).join("test.txt");
        fs::write(&file_path, "test content").unwrap();

        handler
            .stage(GitStageInput {
                repo_path: repo_path.clone(),
                file_path: "test.txt".to_string(),
            })
            .await
            .unwrap();

        // Commit
        let commit_input = GitCommitInput {
            repo_path: repo_path.clone(),
            message: "Add test file".to_string(),
        };
        let commit_output = handler.commit(commit_input).await.unwrap();
        assert!(!commit_output.commit_id.is_empty());

        // Status should be clean
        let status_input = GitStatusInput { repo_path };
        let status_output = handler.status(status_input).await.unwrap();
        assert_eq!(status_output.status.files.len(), 0);
    }

    #[tokio::test]
    async fn test_branches() {
        let (_temp, repo_path) = create_test_repo();
        create_initial_commit(&repo_path);
        let handler = GitHandler::new();

        let branches_input = GitBranchesInput { repo_path: repo_path.clone() };
        let branches_output = handler.branches(branches_input).await.unwrap();

        // Should have at least one branch (main/master)
        assert!(!branches_output.branches.is_empty());

        // Find current branch
        let current = branches_output.branches.iter().find(|b| b.is_head).unwrap();
        assert!(current.is_head);
    }

    #[tokio::test]
    async fn test_checkout() {
        let (_temp, repo_path) = create_test_repo();
        create_initial_commit(&repo_path);
        let handler = GitHandler::new();

        // Create a new branch
        handler
            .git_service
            .create_branch(&repo_path, "feature-branch")
            .await
            .unwrap();

        // Checkout the new branch
        let checkout_input = GitCheckoutInput {
            repo_path: repo_path.clone(),
            branch: "feature-branch".to_string(),
        };
        let checkout_output = handler.checkout(checkout_input).await.unwrap();
        assert!(checkout_output.success);
        assert_eq!(checkout_output.branch, "feature-branch");

        // Verify branch switched
        let status_input = GitStatusInput { repo_path };
        let status_output = handler.status(status_input).await.unwrap();
        assert_eq!(status_output.status.current_branch, "feature-branch");
    }

    #[tokio::test]
    async fn test_create_notification() {
        let handler = GitHandler::new();

        let status = GitStatus {
            repo_path: "/test".to_string(),
            current_branch: "main".to_string(),
            files: vec![],
            staged_count: 0,
            modified_count: 0,
            untracked_count: 0,
            conflicted_count: 0,
            ahead_count: 0,
            behind_count: 0,
        };

        let notification = GitNotification::StatusChanged {
            repo_path: "/test".to_string(),
            status,
        };
        let message = handler.create_notification(notification);

        match message {
            OutgoingMessage::Notification { method, .. } => {
                assert_eq!(method, "git.state_change");
            }
            _ => panic!("Expected Notification variant"),
        }
    }

    #[tokio::test]
    async fn test_rpc_handler_status() {
        let (_temp, repo_path) = create_test_repo();
        let handler = GitRpcHandler::new();

        let params = serde_json::json!({
            "repoPath": repo_path
        });

        let result = handler.handle("git.status", Some(params)).await;
        assert!(result.is_ok());
    }

    #[tokio::test]
    async fn test_rpc_handler_stage() {
        let (_temp, repo_path) = create_test_repo();
        create_initial_commit(&repo_path);
        let handler = GitRpcHandler::new();

        // Create a file first
        let file_path = PathBuf::from(&repo_path).join("test.txt");
        fs::write(&file_path, "test content").unwrap();

        let params = serde_json::json!({
            "repoPath": repo_path,
            "filePath": "test.txt"
        });

        let result = handler.handle("git.stage", Some(params)).await;
        assert!(result.is_ok());
    }

    #[tokio::test]
    async fn test_rpc_handler_commit() {
        let (_temp, repo_path) = create_test_repo();
        create_initial_commit(&repo_path);
        let handler = GitRpcHandler::new();

        // Create and stage a file first
        let file_path = PathBuf::from(&repo_path).join("test.txt");
        fs::write(&file_path, "test content").unwrap();

        handler
            .inner()
            .stage(GitStageInput {
                repo_path: repo_path.clone(),
                file_path: "test.txt".to_string(),
            })
            .await
            .unwrap();

        let params = serde_json::json!({
            "repoPath": repo_path,
            "message": "Test commit"
        });

        let result = handler.handle("git.commit", Some(params)).await;
        assert!(result.is_ok());
    }

    #[tokio::test]
    async fn test_rpc_handler_branches() {
        let (_temp, repo_path) = create_test_repo();
        create_initial_commit(&repo_path);
        let handler = GitRpcHandler::new();

        let params = serde_json::json!({
            "repoPath": repo_path
        });

        let result = handler.handle("git.branches", Some(params)).await;
        assert!(result.is_ok());
    }

    #[tokio::test]
    async fn test_rpc_handler_checkout() {
        let (_temp, repo_path) = create_test_repo();
        create_initial_commit(&repo_path);
        let handler = GitRpcHandler::new();

        // Create a branch first
        handler
            .inner()
            .git_service
            .create_branch(&repo_path, "test-branch")
            .await
            .unwrap();

        let params = serde_json::json!({
            "repoPath": repo_path,
            "branch": "test-branch"
        });

        let result = handler.handle("git.checkout", Some(params)).await;
        assert!(result.is_ok());
    }

    #[tokio::test]
    async fn test_rpc_handler_method_not_found() {
        let handler = GitRpcHandler::new();

        let result = handler.handle("git.unknown", None).await;
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_rpc_handler_invalid_params() {
        let handler = GitRpcHandler::new();

        let result = handler.handle("git.status", None).await;
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_status_change_detection() {
        let (_temp, repo_path) = create_test_repo();
        create_initial_commit(&repo_path);
        let handler = GitHandler::new();

        // Get initial status and store it
        let input = GitStatusInput { repo_path: repo_path.clone() };
        let output = handler.status(input).await.unwrap();

        // Should not have changed (same status)
        assert!(!handler.has_status_changed(&repo_path, &output.status).await);

        // Create a new file
        let file_path = PathBuf::from(&repo_path).join("new.txt");
        fs::write(&file_path, "new content").unwrap();

        // Get new status directly from git service (don't store via handler.status)
        let new_status = handler
            .git_service()
            .get_repo_status(&repo_path)
            .await
            .unwrap();

        // Should have changed compared to stored status
        assert!(handler.has_status_changed(&repo_path, &new_status).await);
    }

    #[tokio::test]
    async fn test_polling_service() {
        let handler = GitHandler::new();
        let polling = GitPollingService::new(handler.clone());

        let (_temp, repo_path) = create_test_repo();
        create_initial_commit(&repo_path);

        // Register repo for polling
        polling
            .register_repo(repo_path.clone(), Duration::from_secs(1))
            .await;

        // First poll returns current status since no previous status stored
        let changed = polling.poll_all().await;
        assert_eq!(changed.len(), 1);
        assert_eq!(changed[0].0, repo_path);

        // Second poll should return empty (no changes since last poll)
        let changed = polling.poll_all().await;
        assert!(changed.is_empty());

        // Unregister
        polling.unregister_repo(&repo_path).await;
    }
}
