//! Application state for the WebSocket server
//!
//! This module defines the central `AppState` struct that holds all shared state
//! for the WebSocket server, including database connections, in-memory registries,
//! and communication channels.

use crate::db::Db;
use crate::git::GitOps;
use crate::protocol::ServerMessage;
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::{broadcast, mpsc, RwLock, watch};
use uuid::Uuid;

/// Heartbeat configuration
pub const HEARTBEAT_INTERVAL_SECS: u64 = 30;
pub const HEARTBEAT_TIMEOUT_SECS: u64 = 5;

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
    /// Last pong timestamp (for heartbeat tracking)
    pub last_pong: std::time::Instant,
}

/// The central application state shared across all handlers
#[derive(Debug)]
pub struct AppState {
    /// Database connection (shared)
    pub db: Arc<Db>,

    /// Git operations handler
    pub git_ops: Arc<GitOps>,

    /// In-memory workspace registry
    pub workspaces: RwLock<HashMap<Uuid, WorkspaceState>>,

    /// Active worktrees
    pub worktrees: RwLock<HashMap<Uuid, WorktreeState>>,

    /// Running agent sessions
    pub agents: RwLock<HashMap<Uuid, AgentState>>,

    /// Active PTY sessions
    pub terminals: RwLock<HashMap<Uuid, TerminalState>>,

    /// Connected WebSocket clients (client_id -> sender)
    pub clients: RwLock<HashMap<Uuid, ClientState>>,

    /// Broadcast channel for messages to all clients
    pub broadcast_tx: broadcast::Sender<ServerMessage>,

    /// Graceful shutdown signal (true = shutdown requested)
    pub shutdown_rx: watch::Receiver<bool>,
}

impl AppState {
    /// Create a new AppState with the given database
    pub fn new(db: Arc<Db>, shutdown_rx: watch::Receiver<bool>) -> Self {
        let (broadcast_tx, _) = broadcast::channel(1024);
        let git_ops = Arc::new(GitOps::new(db.clone()));

        Self {
            db,
            git_ops,
            workspaces: RwLock::new(HashMap::new()),
            worktrees: RwLock::new(HashMap::new()),
            agents: RwLock::new(HashMap::new()),
            terminals: RwLock::new(HashMap::new()),
            clients: RwLock::new(HashMap::new()),
            broadcast_tx,
            shutdown_rx,
        }
    }

    /// Create an AppState for testing with an in-memory database
    #[cfg(test)]
    pub async fn new_test() -> Self {
        let db = Db::in_memory().await.expect("Failed to create in-memory db");
        let (_shutdown_tx, shutdown_rx) = watch::channel(false);
        Self::new(Arc::new(db), shutdown_rx)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_app_state_creation() {
        let state = AppState::new_test().await;

        // Verify initial state is empty
        assert!(state.workspaces.read().await.is_empty());
        assert!(state.worktrees.read().await.is_empty());
        assert!(state.agents.read().await.is_empty());
        assert!(state.terminals.read().await.is_empty());
        assert!(state.clients.read().await.is_empty());
    }

    #[tokio::test]
    async fn test_heartbeat_constants() {
        assert_eq!(HEARTBEAT_INTERVAL_SECS, 30);
        assert_eq!(HEARTBEAT_TIMEOUT_SECS, 5);
    }
}
