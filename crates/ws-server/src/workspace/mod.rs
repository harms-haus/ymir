//! Workspace management with git2 integration
//!
//! This module handles workspace CRUD operations and integrates with git2
//! for worktree management on the filesystem.

use crate::db::{ActivityLogEntry, Workspace as DbWorkspace};
use crate::protocol::{
  ServerMessage, ServerMessagePayload, WorktreeCreated, WorkspaceCreate, WorkspaceCreated,
  WorkspaceData, WorkspaceDelete, WorkspaceDeleted,
};
use crate::state::AppState;
use anyhow::{Context, Result};
use git2::{BranchType, Repository};
use std::path::Path;
use std::sync::Arc;
use tracing::{info, instrument};
use uuid::Uuid;

fn parse_workspace_timestamp(field: &str, value: &str) -> Result<u64> {
    let timestamp = chrono::DateTime::parse_from_rfc3339(value)
        .with_context(|| format!("Invalid workspace {} timestamp: {}", field, value))?
        .timestamp();

    Ok(timestamp as u64)
}

fn workspace_data_from_db(ws: DbWorkspace) -> Result<WorkspaceData> {
    let workspace_id =
        Uuid::parse_str(&ws.id).with_context(|| format!("Invalid workspace id: {}", ws.id))?;

    Ok(WorkspaceData {
        id: workspace_id,
        name: ws.name,
        root_path: ws.root_path,
        color: Some(ws.color),
        icon: Some(ws.icon),
        worktree_base_dir: Some(ws.worktree_base_dir),
        settings: Some(ws.settings_json),
        created_at: parse_workspace_timestamp("created_at", &ws.created_at)?,
        updated_at: parse_workspace_timestamp("updated_at", &ws.updated_at)?,
    })
}

/// Expand tilde (~) to home directory in a path
fn expand_tilde(path: &str) -> String {
    if path.starts_with("~/") {
        if let Some(home) = std::env::var_os("HOME") {
            return path.replacen("~", &home.to_string_lossy(), 1);
        }
    } else if path == "~" {
        if let Some(home) = std::env::var_os("HOME") {
            return home.to_string_lossy().to_string();
        }
    }
    path.to_string()
}

pub fn find_main_branch(repo_path: &str) -> Result<String> {
    let repo = Repository::open(repo_path).context("Failed to open git repository")?;

    if repo.find_branch("main", BranchType::Local).is_ok() {
        return Ok("main".to_string());
    }

    if repo.find_branch("master", BranchType::Local).is_ok() {
        return Ok("master".to_string());
    }

    let head_result = repo.head();
    match head_result {
        Ok(head) => {
            let head_name = head
                .shorthand()
                .ok_or_else(|| anyhow::anyhow!("HEAD has no branch name"))?
                .to_string();
            info!("No main/master branch found, using HEAD branch: {}", head_name);
            Ok(head_name)
        }
        Err(e) => {
            if e.code() == git2::ErrorCode::UnbornBranch {
                Ok("main".to_string())
            } else {
                Err(e).context("Failed to get HEAD")
            }
        }
    }
}

/// Create a new workspace and initialize git repository if needed
#[instrument(skip(state), fields(name = %msg.name, root_path = %msg.root_path))]
pub async fn create(state: Arc<AppState>, msg: WorkspaceCreate) -> Result<WorkspaceCreated> {
    let expanded_root_path = expand_tilde(&msg.root_path);
    let root_path = Path::new(&expanded_root_path);
    if !root_path.exists() {
        anyhow::bail!("Root path does not exist: {}", msg.root_path);
    }

    if root_path.join(".git").exists() {
        let root_path = expanded_root_path.clone();
        tokio::task::spawn_blocking(move || Repository::open(&root_path))
            .await
            .context("Git repository open task failed")?
            .context("Failed to open existing git repository")?;
    } else {
        let root_path = expanded_root_path.clone();
        tokio::task::spawn_blocking(move || Repository::init(&root_path))
            .await
            .context("Git repository init task failed")?
            .context("Failed to initialize git repository")?;
    }

    // Create workspace in database
    let workspace_id = Uuid::new_v4();
    let now = chrono::Utc::now();
    let now_rfc3339 = now.to_rfc3339();
    let now_timestamp = now.timestamp() as u64;
    let workspace = DbWorkspace {
        id: workspace_id.to_string(),
        name: msg.name.clone(),
        root_path: expanded_root_path.clone(),
        color: msg.color.unwrap_or_else(|| "#3B82F6".to_string()),
        icon: msg.icon.unwrap_or_else(|| "folder".to_string()),
        worktree_base_dir: msg
            .worktree_base_dir
            .unwrap_or_else(|| ".git/worktrees".to_string()),
        settings_json: "{}".to_string(),
        created_at: now_rfc3339.clone(),
        updated_at: now_rfc3339,
    };

    state
        .db
        .create_workspace(&workspace)
        .await
        .context("Failed to create workspace in database")?;

    // Add to in-memory state
    state.workspaces.write().await.insert(
        workspace_id,
        crate::state::WorkspaceState {
            id: workspace_id,
            name: workspace.name.clone(),
            root_path: workspace.root_path.clone(),
            color: Some(workspace.color.clone()),
            icon: Some(workspace.icon.clone()),
            worktree_base_dir: Some(workspace.worktree_base_dir.clone()),
        },
    );

  // Find the main branch and create the main worktree
  let main_branch = find_main_branch(&expanded_root_path)?;
  let main_worktree =
    crate::worktree::create_main(state.clone(), workspace_id, &main_branch).await?;
  info!(
    "Created main worktree '{}' for workspace '{}'",
    main_branch, workspace.name
  );

  let worktree_created_msg = ServerMessage::new(ServerMessagePayload::WorktreeCreated(
    WorktreeCreated {
      worktree: main_worktree,
    },
  ));
  state.broadcast(worktree_created_msg).await;

  let activity = ActivityLogEntry {
    id: None,
        timestamp: chrono::Utc::now().to_rfc3339(),
        level: "info".to_string(),
        source: Some("workspace".to_string()),
        message: format!("Created workspace: {}", workspace.name),
        metadata_json: serde_json::json!({
            "workspace_id": workspace_id.to_string(),
            "root_path": expanded_root_path,
            "has_git_repo": true
        })
        .to_string(),
    };
    state.db.log_activity(&activity).await?;

    Ok(WorkspaceCreated {
        workspace: WorkspaceData {
            id: workspace_id,
            name: workspace.name,
            root_path: workspace.root_path,
            color: Some(workspace.color),
            icon: Some(workspace.icon),
            worktree_base_dir: Some(workspace.worktree_base_dir),
            settings: Some(workspace.settings_json),
            created_at: now_timestamp,
            updated_at: now_timestamp,
        },
    })
}

/// Delete a workspace and clean up associated worktrees
#[instrument(skip(state), fields(workspace_id = %msg.workspace_id))]
pub async fn delete(state: Arc<AppState>, msg: WorkspaceDelete) -> Result<WorkspaceDeleted> {
    // Get workspace from database
    let workspace = state
        .db
        .get_workspace(&msg.workspace_id.to_string())
        .await
        .context("Failed to fetch workspace from database")?
        .ok_or_else(|| anyhow::anyhow!("Workspace not found: {}", msg.workspace_id))?;

    // List all worktrees for this workspace
    let worktrees = state
        .db
        .list_worktrees(&msg.workspace_id.to_string())
        .await
        .context("Failed to list worktrees for workspace")?;
    let worktree_count = worktrees.len();
    let mut delete_errors = Vec::new();

    // Delete each worktree (this will clean up git worktrees on disk)
    for worktree in &worktrees {
        let worktree_id = match Uuid::parse_str(&worktree.id) {
            Ok(worktree_id) => worktree_id,
            Err(err) => {
                delete_errors.push(format!(
                    "{} ({}) has invalid id {}: {}",
                    worktree.branch_name, worktree.path, worktree.id, err
                ));
                continue;
            }
        };
        let delete_msg = crate::protocol::WorktreeDelete { worktree_id };

        // Use forced delete for workspace deletion to allow deleting main worktrees
        if let Err(err) = crate::worktree::delete_forced(state.clone(), delete_msg).await {
            delete_errors.push(format!(
                "{} ({}) failed to delete: {}",
                worktree.branch_name, worktree.path, err
            ));
        }
    }

    if !delete_errors.is_empty() {
        anyhow::bail!(
            "Failed to delete {} worktree(s): {}",
            delete_errors.len(),
            delete_errors.join("; ")
        );
    }

    // Delete workspace from database
    let deleted = state
        .db
        .delete_workspace(&msg.workspace_id.to_string())
        .await
        .context("Failed to delete workspace from database")?;

    if !deleted {
        anyhow::bail!(
            "Workspace not found or already deleted: {}",
            msg.workspace_id
        );
    }

    // Remove from in-memory state
    state.workspaces.write().await.remove(&msg.workspace_id);

    // Log activity
    let activity = ActivityLogEntry {
        id: None,
        timestamp: chrono::Utc::now().to_rfc3339(),
        level: "info".to_string(),
        source: Some("workspace".to_string()),
        message: format!("Deleted workspace: {}", workspace.name),
        metadata_json: serde_json::json!({
            "workspace_id": msg.workspace_id.to_string(),
            "root_path": workspace.root_path,
            "worktrees_deleted": worktree_count
        })
        .to_string(),
    };
    state.db.log_activity(&activity).await?;

    Ok(WorkspaceDeleted {
        workspace_id: msg.workspace_id,
    })
}

/// List all workspaces
#[instrument(skip(state))]
pub async fn list(state: Arc<AppState>) -> Result<Vec<WorkspaceData>> {
    let workspaces = state
        .db
        .list_workspaces()
        .await
        .context("Failed to list workspaces from database")?;

    let workspace_data = workspaces
        .into_iter()
        .map(workspace_data_from_db)
        .collect::<Result<Vec<_>>>()?;

    Ok(workspace_data)
}

/// Get a single workspace by ID
#[instrument(skip(state))]
pub async fn get(state: Arc<AppState>, workspace_id: Uuid) -> Result<Option<WorkspaceData>> {
    let workspace = state
        .db
        .get_workspace(&workspace_id.to_string())
        .await
        .context("Failed to fetch workspace from database")?;

    workspace.map(workspace_data_from_db).transpose()
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

    #[tokio::test]
    async fn test_create_workspace() {
        let (state, temp_dir) = create_test_state().await;
        let root_path = temp_dir.path().to_string_lossy().to_string();

        let msg = WorkspaceCreate {
            name: "Test Workspace".to_string(),
            root_path: root_path.clone(),
            color: Some("#FF0000".to_string()),
            icon: Some("folder-open".to_string()),
            worktree_base_dir: Some(".git/worktrees".to_string()),
        };

        let result = create(state.clone(), msg).await;
        assert!(
            result.is_ok(),
            "Failed to create workspace: {:?}",
            result.err()
        );

        let created = result.unwrap();
        assert_eq!(created.workspace.name, "Test Workspace");
        assert_eq!(created.workspace.root_path, root_path);
        assert!(created.workspace.color.is_some());
        assert!(created.workspace.icon.is_some());

        // Verify git repository was created
        assert!(std::path::Path::new(&root_path).join(".git").exists());
    }

    #[tokio::test]
    async fn test_delete_workspace() {
        let (state, temp_dir) = create_test_state().await;
        let root_path = temp_dir.path().to_string_lossy().to_string();

        // Create a workspace first
        let create_msg = WorkspaceCreate {
            name: "Test Workspace".to_string(),
            root_path: root_path.clone(),
            color: None,
            icon: None,
            worktree_base_dir: None,
        };

        let created = create(state.clone(), create_msg)
            .await
            .expect("Failed to create workspace");
        let workspace_id = created.workspace.id;

        // Delete the workspace
        let delete_msg = WorkspaceDelete { workspace_id };
        let result = delete(state.clone(), delete_msg).await;
        assert!(
            result.is_ok(),
            "Failed to delete workspace: {:?}",
            result.err()
        );

        // Verify workspace was deleted
        let get_result = get(state.clone(), workspace_id).await;
        assert!(get_result.is_ok());
        assert!(get_result.unwrap().is_none());
    }

    #[tokio::test]
    async fn test_list_workspaces() {
        let (state, temp_dir) = create_test_state().await;
        let root_path = temp_dir.path().to_string_lossy().to_string();

        // Create multiple workspaces
        for i in 0..3 {
            let msg = WorkspaceCreate {
                name: format!("Workspace {}", i),
                root_path: format!("{}/{}", root_path, i),
                color: None,
                icon: None,
                worktree_base_dir: None,
            };

            // Create directory for each workspace
            std::fs::create_dir_all(format!("{}/{}", root_path, i)).expect("Failed to create dir");
            create(state.clone(), msg)
                .await
                .expect("Failed to create workspace");
        }

        let workspaces = list(state.clone())
            .await
            .expect("Failed to list workspaces");
        assert_eq!(workspaces.len(), 3);
    }
}
