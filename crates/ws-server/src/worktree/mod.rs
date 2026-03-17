//! Worktree management with git2 integration
//!
//! This module handles worktree CRUD operations using git2 for actual
//! git worktree creation and deletion on the filesystem.

use crate::db::{Worktree as DbWorktree, ActivityLogEntry};
use crate::protocol::{WorktreeCreate, WorktreeCreated, WorktreeDelete, WorktreeDeleted, WorktreeData, WorktreeList, WorktreeStatus};
use crate::state::AppState;
use anyhow::{Context, Result};
use git2::Repository;
use std::path::Path;
use std::sync::Arc;
use tracing::{debug, info, warn};
use uuid::Uuid;

/// Create a new git worktree for a workspace
pub async fn create(
    state: Arc<AppState>,
    msg: WorktreeCreate,
) -> Result<WorktreeCreated> {
    debug!("Creating worktree for workspace: {}", msg.workspace_id);
    
    // Get workspace from database
    let workspace = state.db.get_workspace(&msg.workspace_id.to_string()).await
        .context("Failed to fetch workspace from database")?
        .ok_or_else(|| anyhow::anyhow!("Workspace not found: {}", msg.workspace_id))?;
    
    // Open the git repository
    let repo = Repository::open(&workspace.root_path)
        .context("Failed to open git repository")?;
    
    let worktree_base_dir = Path::new(&workspace.root_path).join(&workspace.worktree_base_dir);
    let worktree_path = worktree_base_dir.join(msg.branch_name.replace('/', "_"));
    
    // Create worktree base directory if it doesn't exist
    std::fs::create_dir_all(&worktree_base_dir)
        .context("Failed to create worktree base directory")?;
    
    // Check if branch exists, create it if not
    let branch_name = &msg.branch_name;
    let _branch_ref = format!("refs/heads/{}", branch_name);
    
    let branch_exists = repo.find_branch(branch_name, git2::BranchType::Local).is_ok();
    
    if !branch_exists {
        // Create new branch from HEAD
        let head = repo.head()
            .context("Failed to get HEAD")?;
        let head_commit = head.peel_to_commit()
            .context("Failed to get HEAD commit")?;
        
        repo.branch(branch_name, &head_commit, false)
            .context("Failed to create branch")?;
        
        info!("Created new branch: {}", branch_name);
    }
    
    let worktree_name = format!("{}_{}", msg.workspace_id.to_string().split('-').next().unwrap(), msg.branch_name.replace('/', "_"));
    
    let git_worktree_dir = Path::new(&workspace.root_path).join(".git").join("worktrees").join(&worktree_name);
    if git_worktree_dir.exists() {
        warn!("Git worktree metadata directory already exists, removing it");
        std::fs::remove_dir_all(&git_worktree_dir)
            .context("Failed to remove git worktree metadata directory")?;
    }
    
    if worktree_path.exists() {
        warn!("Worktree directory already exists, removing it");
        std::fs::remove_dir_all(&worktree_path)
            .context("Failed to remove worktree directory")?;
    }
    
    repo.worktree(&worktree_name, &worktree_path, None)
        .context("Failed to create git worktree")?;
    
    info!("Created git worktree at: {}", worktree_path.display());
    
    // Create worktree record in database
    let worktree_id = Uuid::new_v4();
    let worktree = DbWorktree {
        id: worktree_id.to_string(),
        workspace_id: msg.workspace_id.to_string(),
        branch_name: msg.branch_name.clone(),
        path: worktree_path.to_string_lossy().to_string(),
        status: "active".to_string(),
        created_at: chrono::Utc::now().to_rfc3339(),
    };
    
    state.db.create_worktree(&worktree).await
        .context("Failed to create worktree in database")?;
    
    // Add to in-memory state
    state.worktrees.write().await.insert(worktree_id, crate::state::WorktreeState {
        id: worktree_id,
        workspace_id: msg.workspace_id,
        branch_name: worktree.branch_name.clone(),
        path: worktree.path.clone(),
        status: worktree.status.clone(),
    });
    
    // Log activity
    let activity = ActivityLogEntry {
        id: None,
        timestamp: chrono::Utc::now().to_rfc3339(),
        level: "info".to_string(),
        source: Some("worktree".to_string()),
        message: format!("Created worktree: {}", msg.branch_name),
        metadata_json: serde_json::json!({
            "worktree_id": worktree_id.to_string(),
            "workspace_id": msg.workspace_id.to_string(),
            "branch_name": msg.branch_name,
            "path": worktree_path.to_string_lossy().to_string(),
            "agent_type": msg.agent_type
        }).to_string(),
    };
    state.db.log_activity(&activity).await?;
    
    info!("Worktree created successfully: {}", msg.branch_name);
    
    Ok(WorktreeCreated {
        worktree: WorktreeData {
            id: worktree_id,
            workspace_id: msg.workspace_id,
            branch_name: worktree.branch_name,
            path: worktree.path,
            status: worktree.status,
            created_at: chrono::Utc::now().timestamp() as u64,
        },
    })
}

/// Delete a git worktree
pub async fn delete(
    state: Arc<AppState>,
    msg: WorktreeDelete,
) -> Result<WorktreeDeleted> {
    debug!("Deleting worktree: {}", msg.worktree_id);
    
    // Get worktree from database
    let worktree = state.db.get_worktree(&msg.worktree_id.to_string()).await
        .context("Failed to fetch worktree from database")?
        .ok_or_else(|| anyhow::anyhow!("Worktree not found: {}", msg.worktree_id))?;
    
    // Get workspace to find the main repository
    let workspace = state.db.get_workspace(&worktree.workspace_id).await
        .context("Failed to fetch workspace from database")?
        .ok_or_else(|| anyhow::anyhow!("Workspace not found: {}", worktree.workspace_id))?;

    // Open the git repository
    let _repo = Repository::open(&workspace.root_path)
        .context("Failed to open git repository")?;
    
    // Remove the git worktree
    let worktree_path = Path::new(&worktree.path);
    if worktree_path.exists() {
        // Remove the worktree directory
        std::fs::remove_dir_all(worktree_path)
            .context("Failed to remove worktree directory")?;
        
        info!("Removed git worktree at: {}", worktree_path.display());
    } else {
        warn!("Worktree path does not exist: {}", worktree_path.display());
    }
    
    // Delete worktree from database
    let deleted = state.db.delete_worktree(&msg.worktree_id.to_string()).await
        .context("Failed to delete worktree from database")?;
    
    if !deleted {
        anyhow::bail!("Worktree not found or already deleted: {}", msg.worktree_id);
    }
    
    // Remove from in-memory state
    state.worktrees.write().await.remove(&msg.worktree_id);
    
    // Log activity
    let activity = ActivityLogEntry {
        id: None,
        timestamp: chrono::Utc::now().to_rfc3339(),
        level: "info".to_string(),
        source: Some("worktree".to_string()),
        message: format!("Deleted worktree: {}", worktree.branch_name),
        metadata_json: serde_json::json!({
            "worktree_id": msg.worktree_id.to_string(),
            "workspace_id": worktree.workspace_id,
            "branch_name": worktree.branch_name,
            "path": worktree.path
        }).to_string(),
    };
    state.db.log_activity(&activity).await?;
    
    info!("Worktree deleted successfully: {}", worktree.branch_name);
    
    Ok(WorktreeDeleted {
        worktree_id: msg.worktree_id,
    })
}

/// List worktrees for a workspace
pub async fn list(
    state: Arc<AppState>,
    msg: WorktreeList,
) -> Result<Vec<WorktreeData>> {
    let worktrees = state.db.list_worktrees(&msg.workspace_id.to_string()).await
        .context("Failed to list worktrees from database")?;
    
    let worktree_data: Vec<WorktreeData> = worktrees.into_iter().map(|wt| {
        WorktreeData {
            id: Uuid::parse_str(&wt.id).unwrap_or_else(|_| Uuid::new_v4()),
            workspace_id: Uuid::parse_str(&wt.workspace_id).unwrap_or_else(|_| Uuid::new_v4()),
            branch_name: wt.branch_name,
            path: wt.path,
            status: wt.status,
            created_at: chrono::DateTime::parse_from_rfc3339(&wt.created_at)
                .map(|dt| dt.timestamp() as u64)
                .unwrap_or_else(|_| chrono::Utc::now().timestamp() as u64),
        }
    }).collect();
    
    Ok(worktree_data)
}

/// Get worktree status
pub async fn status(
    state: Arc<AppState>,
    worktree_id: Uuid,
) -> Result<WorktreeStatus> {
    let worktree = state.db.get_worktree(&worktree_id.to_string()).await
        .context("Failed to fetch worktree from database")?;
    
    match worktree {
        Some(wt) => Ok(WorktreeStatus {
            worktree_id,
            status: wt.status,
        }),
        None => anyhow::bail!("Worktree not found: {}", worktree_id),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::Db;
    use crate::state::AppState;
    use tempfile::TempDir;
    
    async fn create_test_state() -> (Arc<AppState>, TempDir) {
        let temp_dir = TempDir::new().expect("Failed to create temp dir");
        let db = Db::in_memory().await.expect("Failed to create test db");
        let (_shutdown_tx, shutdown_rx) = tokio::sync::watch::channel(false);
        let state = Arc::new(AppState::new(std::sync::Arc::new(db), shutdown_rx));
        (state, temp_dir)
    }
    
    async fn create_test_workspace(state: &Arc<AppState>, temp_dir: &TempDir) -> (Uuid, String) {
        let root_path = temp_dir.path().to_string_lossy().to_string();
        
        // Initialize git repo
        let _repo = git2::Repository::init(&root_path).expect("Failed to init repo");
        
        // Create initial commit
        let sig = git2::Signature::now("Test User", "test@example.com").expect("Failed to create signature");
        let tree_id = _repo.index().expect("Failed to get index").write_tree().expect("Failed to write tree");
        let tree = _repo.find_tree(tree_id).expect("Failed to find tree");
        _repo.commit(Some("HEAD"), &sig, &sig, "Initial commit", &tree, &[]).expect("Failed to create commit");
        
        let workspace_id = Uuid::new_v4();
        let workspace = crate::db::Workspace {
            id: workspace_id.to_string(),
            name: "Test Workspace".to_string(),
            root_path: root_path.clone(),
            color: "#3B82F6".to_string(),
            icon: "folder".to_string(),
            worktree_base_dir: ".git/worktrees".to_string(),
            settings_json: "{}".to_string(),
            created_at: chrono::Utc::now().to_rfc3339(),
            updated_at: chrono::Utc::now().to_rfc3339(),
        };
        
        state.db.create_workspace(&workspace).await.expect("Failed to create workspace");
        state.workspaces.write().await.insert(workspace_id, crate::state::WorkspaceState {
            id: workspace_id,
            name: workspace.name.clone(),
            root_path: workspace.root_path.clone(),
            color: Some(workspace.color.clone()),
            icon: Some(workspace.icon.clone()),
            worktree_base_dir: Some(workspace.worktree_base_dir.clone()),
        });
        
        (workspace_id, root_path)
    }
    
#[tokio::test]
    async fn test_create_worktree() {
        let (state, temp_dir) = create_test_state().await;
        let (workspace_id, _) = create_test_workspace(&state, &temp_dir).await;

        let unique_id = Uuid::new_v4().to_string().split('-').next().unwrap().to_string();
        let branch_name = format!("feature/test-{}", unique_id);
        
        let msg = WorktreeCreate {
            workspace_id,
            branch_name: branch_name.clone(),
            agent_type: Some("coder".to_string()),
        };

        let result = create(state.clone(), msg).await;
        assert!(result.is_ok(), "Failed to create worktree: {:?}", result.err());

        let created = result.unwrap();
        assert_eq!(created.worktree.branch_name, branch_name);
        assert_eq!(created.worktree.workspace_id, workspace_id);
        assert_eq!(created.worktree.status, "active");

        // Verify git worktree was created
        assert!(std::path::Path::new(&created.worktree.path).exists());
    }
    
#[tokio::test]
    async fn test_delete_worktree() {
        let (state, temp_dir) = create_test_state().await;
        let (workspace_id, _) = create_test_workspace(&state, &temp_dir).await;

        // Create a worktree first
        let unique_id = Uuid::new_v4().to_string().split('-').next().unwrap().to_string();
        let branch_name = format!("feature/delete-test-{}", unique_id);
        
        let create_msg = WorktreeCreate {
            workspace_id,
            branch_name: branch_name.clone(),
            agent_type: None,
        };

        let created = create(state.clone(), create_msg).await.expect("Failed to create worktree");
        let worktree_id = created.worktree.id;
        let worktree_path = created.worktree.path.clone();

        // Verify worktree exists
        assert!(std::path::Path::new(&worktree_path).exists());

        // Delete the worktree
        let delete_msg = WorktreeDelete { worktree_id };
        let result = delete(state.clone(), delete_msg).await;
        assert!(result.is_ok(), "Failed to delete worktree: {:?}", result.err());

        // Verify worktree was removed from disk
        assert!(!std::path::Path::new(&worktree_path).exists());

        // Verify worktree was removed from database
        let status_result = status(state.clone(), worktree_id).await;
        assert!(status_result.is_err());
    }
    
    #[tokio::test]
    async fn test_list_worktrees() {
        let (state, temp_dir) = create_test_state().await;
        let (workspace_id, _) = create_test_workspace(&state, &temp_dir).await;
        
        // Create multiple worktrees
        for i in 0..3 {
            let msg = WorktreeCreate {
                workspace_id,
                branch_name: format!("feature/test-{}", i),
                agent_type: None,
            };
            create(state.clone(), msg).await.expect("Failed to create worktree");
        }
        
        let list_msg = WorktreeList { workspace_id };
        let worktrees = list(state.clone(), list_msg).await.expect("Failed to list worktrees");
        assert_eq!(worktrees.len(), 3);
    }
    
#[tokio::test]
    async fn test_worktree_status() {
        let (state, temp_dir) = create_test_state().await;
        let (workspace_id, _) = create_test_workspace(&state, &temp_dir).await;

        let unique_id = Uuid::new_v4().to_string().split('-').next().unwrap().to_string();
        let branch_name = format!("feature/status-test-{}", unique_id);
        
        let create_msg = WorktreeCreate {
            workspace_id,
            branch_name: branch_name.clone(),
            agent_type: None,
        };

        let created = create(state.clone(), create_msg).await.expect("Failed to create worktree");
        let worktree_id = created.worktree.id;

        let status_result = status(state.clone(), worktree_id).await;
        assert!(status_result.is_ok());

        let status = status_result.unwrap();
        assert_eq!(status.worktree_id, worktree_id);
        assert_eq!(status.status, "active");
    }
}