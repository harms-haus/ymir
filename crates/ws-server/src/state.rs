//! Application state for the WebSocket server
//!
//! This module defines the central `AppState` struct that holds all shared state
//! for the WebSocket server, including database connections, in-memory registries,
//! and communication channels.

use crate::agent::AcpHandle;
use crate::db::Db;
use crate::git::GitOps;
use crate::protocol::ServerMessage;
use crate::pty::PtyManager;
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::{broadcast, mpsc, watch, RwLock};
use uuid::Uuid;

/// Disconnect clients inactive for this many seconds
pub const CLIENT_INACTIVITY_TIMEOUT_SECS: u64 = 30;

/// In-memory state for a workspace
#[derive(Debug, Clone)]
pub struct WorkspaceState {
    pub id: Uuid,
    pub name: String,
    pub root_path: String,
    pub color: Option<String>,
    pub icon: Option<String>,
    pub worktree_base_dir: Option<String>,
}

/// In-memory state for a worktree
#[derive(Debug, Clone)]
pub struct WorktreeState {
    pub id: Uuid,
    pub workspace_id: Uuid,
    pub branch_name: String,
    pub path: String,
    pub status: String,
    pub is_main: bool,
}

/// In-memory state for an agent session
#[derive(Debug, Clone)]
pub struct AgentState {
    pub id: Uuid,
    pub worktree_id: Uuid,
    pub agent_type: String,
    pub status: String,
}

/// In-memory state for a terminal session
#[derive(Debug, Clone)]
pub struct TerminalState {
    pub id: Uuid,
    pub worktree_id: Uuid,
    pub label: Option<String>,
    pub shell: String,
}

/// Client connection state
#[derive(Debug)]
pub struct ClientState {
    /// Channel to send messages to this client
    pub tx: mpsc::Sender<ServerMessage>,
    /// Last activity timestamp (updated when Ping received)
    pub last_activity: std::time::Instant,
}

/// The central application state shared across all handlers
pub struct AppState {
    /// Database connection (shared)
    pub db: Arc<Db>,

    /// Git operations handler
    pub git_ops: Arc<GitOps>,

    /// In-memory workspace registry
    pub workspaces: RwLock<HashMap<Uuid, WorkspaceState>>,

    /// Active worktrees
    pub worktrees: RwLock<HashMap<Uuid, WorktreeState>>,

    /// Running agent sessions (metadata)
    pub agents: RwLock<HashMap<Uuid, AgentState>>,

    /// Handle to ACP runtime (manages all agent clients internally)
    pub acp_handle: Option<AcpHandle>,

    /// Active PTY sessions
    pub terminals: RwLock<HashMap<Uuid, TerminalState>>,

    /// Connected WebSocket clients (client_id -> sender)
    pub clients: RwLock<HashMap<Uuid, ClientState>>,

    /// Broadcast channel for messages to all clients
    pub broadcast_tx: broadcast::Sender<ServerMessage>,

    /// Graceful shutdown signal (true = shutdown requested)
    pub shutdown_rx: watch::Receiver<bool>,

    /// PTY manager for terminal sessions (optional for flexibility)
    pub pty_manager: Option<Arc<PtyManager>>,
}

impl std::fmt::Debug for AppState {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("AppState")
            .field("db", &"Arc<Db>")
            .field("git_ops", &"Arc<GitOps>")
            .field("workspaces", &self.workspaces.try_read().map(|g| g.len()))
            .field("worktrees", &self.worktrees.try_read().map(|g| g.len()))
            .field("agents", &self.agents.try_read().map(|g| g.len()))
            .field("acp_handle", &self.acp_handle.is_some())
            .field("terminals", &self.terminals.try_read().map(|g| g.len()))
            .field("clients", &self.clients.try_read().map(|g| g.len()))
            .field("pty_manager", &self.pty_manager.is_some())
            .finish()
    }
}

impl AppState {
    pub fn new(db: Arc<Db>, shutdown_rx: watch::Receiver<bool>) -> Self {
        let (broadcast_tx, _) = broadcast::channel(1024);
        let git_ops = Arc::new(GitOps::new(db.clone()));

        Self {
            db,
            git_ops,
            workspaces: RwLock::new(HashMap::new()),
            worktrees: RwLock::new(HashMap::new()),
            agents: RwLock::new(HashMap::new()),
            acp_handle: None,
            terminals: RwLock::new(HashMap::new()),
            clients: RwLock::new(HashMap::new()),
            broadcast_tx,
            shutdown_rx,
            pty_manager: None,
        }
    }

    pub fn with_pty_manager(db: Arc<Db>, shutdown_rx: watch::Receiver<bool>) -> Self {
        let mut state = Self::new(db, shutdown_rx);
        state.pty_manager = Some(PtyManager::new());
        state
    }

    pub fn with_acp(db: Arc<Db>, shutdown_rx: watch::Receiver<bool>) -> Self {
        use crate::agent::start_acp_runtime;
        let mut state = Self::new(db, shutdown_rx);
        let broadcast_tx = state.broadcast_tx.clone();
        let (handle, _join) = start_acp_runtime(broadcast_tx);
        state.acp_handle = Some(handle);
        state.pty_manager = Some(PtyManager::new());
        state
    }

    /// Initialize in-memory state from database
    pub async fn initialize_from_db(&self) {
        // Load workspaces
        match self.db.list_workspaces().await {
            Ok(db_workspaces) => {
                let mut workspaces = self.workspaces.write().await;
                for ws in db_workspaces {
                    if let Ok(id) = uuid::Uuid::parse_str(&ws.id) {
                        workspaces.insert(
                            id,
                            WorkspaceState {
                                id,
                                name: ws.name,
                                root_path: ws.root_path,
                                color: if ws.color.is_empty() { None } else { Some(ws.color) },
                                icon: if ws.icon.is_empty() { None } else { Some(ws.icon) },
                                worktree_base_dir: if ws.worktree_base_dir.is_empty() { None } else { Some(ws.worktree_base_dir) },
                            },
                        );
                    }
                }
            }
            Err(e) => tracing::warn!("Failed to load workspaces from DB: {}", e),
        }

        // TODO: Load all worktrees - will be implemented in Task 2 with list_all_worktrees()
        // This avoids the duplicate list_workspaces() call and N+1 query pattern


        tracing::info!("Initialized in-memory state from database");
    }

    #[cfg(test)]
    pub async fn new_test() -> Self {
        let db = Db::in_memory()
            .await
            .expect("Failed to create in-memory db");
        let (_shutdown_tx, shutdown_rx) = watch::channel(false);
        Self::with_acp(Arc::new(db), shutdown_rx)
    }

    /// Find agent session ID for a worktree.
    /// Returns None if no agent session exists for the worktree.
    pub async fn find_agent_session_for_worktree(&self, worktree_id: Uuid) -> Option<Uuid> {
        let agents = self.agents.read().await;
        agents
            .iter()
            .find(|(_, agent)| agent.worktree_id == worktree_id)
            .map(|(id, _)| *id)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_app_state_creation() {
        let state = AppState::new_test().await;

        assert!(state.workspaces.read().await.is_empty());
        assert!(state.worktrees.read().await.is_empty());
        assert!(state.agents.read().await.is_empty());
        assert!(state.terminals.read().await.is_empty());
        assert!(state.clients.read().await.is_empty());
        assert!(state.acp_handle.is_some());
    }

#[tokio::test]
  async fn test_client_inactivity_timeout() {
    assert_eq!(CLIENT_INACTIVITY_TIMEOUT_SECS, 30);
  }
}
