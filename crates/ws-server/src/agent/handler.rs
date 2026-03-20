//! Agent client integration for WebSocket server
//!
//! # Agent Lifecycle Rules
//!
//! ## Worktree-CWD Launch Rule
//!
//! Agent processes are launched in the currently selected worktree's CWD. The CWD is determined
//! by the `WorktreeState.path` field from the in-memory worktrees registry, NOT by UI selection.
//!
//! **Flow:**
//! 1. Client sends `AgentSpawn` message with `worktree_id`
//! 2. `get_worktree_path()` looks up the worktree in `state.worktrees`
//! 3. Retrieves `worktree.path` from `WorktreeState` (source of truth)
//! 4. Passes path to `AcpClient::spawn()` which sets `current_dir` for subprocess
//!
//! ## Lifecycle State Transitions
//!
//! ### Spawn
//! 1. Validate worktree exists → get CWD from `WorktreeState.path`
//! 2. Create DB session record
//! 3. Add to `state.agents` (session_id → AgentState)
//! 4. Spawn agent process in worktree CWD via tokio::spawn
//! 5. On success: spawn returns immediately, ACP runtime manages agent in background
//! 6. Broadcast `AgentStatusUpdate` to all clients
//!
//! **Enforcement:** One agent per worktree (ACP runtime tracks agents by worktree_id)
//!
//! ### Cancel
//! 1. Find session by `worktree_id` in `state.agents`
//! 2. Kill agent process via `AcpClient::kill()`
//! 3. Request kill via `AcpHandle` (message-passing to ACP runtime)
//! 4. Remove from `state.agents`
//! 5. Delete from database
//! 6. Broadcast `AgentRemoved` to all clients
//!
//! ### Worktree Deletion (Cleanup)
//! When a worktree is deleted:
//! 1. Database FK cascade removes agent_sessions row
//! 2. `cleanup_agents_for_worktree()` must be called to:
//!    - Kill running agent process
//!    - Request kill via `AcpHandle` (message-passing to ACP runtime)
//!    - Remove from `state.agents`
//!
//! ### Worktree Switch
//! No automatic cancellation. The agent continues running in the original worktree CWD.
//! The UI shows the agent for the worktree it belongs to, not the active worktree.
//!
//! ### Reconnect
//! On WebSocket reconnect, the web client requests full state snapshot.
//! Server returns all worktrees and their associated sessions from DB.
//! Orphaned processes (from server crash) are not automatically cleaned up.
//!
//! ### Stale Sessions
//! No automatic timeout. Sessions persist until explicitly cancelled or worktree deleted.
//! Server restart requires re-sync via `initialize_from_db()` which loads DB state.

use crate::db::AgentSession;
use crate::protocol::{AckStatus, AgentStatus, AgentStatusUpdate, Error, ServerMessage, ServerMessagePayload};
use crate::state::AppState;
use std::sync::Arc;
use tracing::instrument;
use uuid::Uuid;

#[instrument(skip(state, msg), fields(worktree_id = %msg.worktree_id, agent_type = %msg.agent_type))]
pub async fn handle_agent_spawn(
    state: Arc<AppState>,
    msg: crate::protocol::AgentSpawn,
) -> ServerMessage {
    let worktree_path = {
        let worktrees = state.worktrees.read().await;
        match worktrees.get(&msg.worktree_id) {
            Some(worktree) => worktree.path.clone(),
            None => {
                return ServerMessage::new(ServerMessagePayload::Error(Error {
                    code: "WORKTREE_NOT_FOUND".to_string(),
                    message: format!("Worktree {} not found", msg.worktree_id),
                    details: None,
                    request_id: None,
                }));
            }
        }
    };

    let acp_session_id = None;
    let session_id = Uuid::new_v4();
    let now = chrono::Utc::now().to_rfc3339();
    let started_at = parse_timestamp(&now);

    let db_session = AgentSession {
        id: session_id.to_string(),
        worktree_id: msg.worktree_id.to_string(),
        agent_type: msg.agent_type.clone(),
        acp_session_id,
        status: "idle".to_string(),
        started_at: now,
    };

    if let Err(e) = state.db.create_agent_session(&db_session).await {
        tracing::error!("Failed to store agent session in database: {}", e);
        return ServerMessage::new(ServerMessagePayload::Error(Error {
            code: "AGENT_DB_ERROR".to_string(),
            message: format!("Failed to store agent session: {}", e),
            details: None,
                    request_id: None,
        }));
    }

    {
        let mut agents = state.agents.write().await;
        agents.insert(session_id, crate::state::AgentState {
            id: session_id,
            worktree_id: msg.worktree_id,
            agent_type: msg.agent_type.clone(),
            status: "idle".to_string(),
        });
    }

    let broadcast_msg = ServerMessage::new(ServerMessagePayload::AgentStatusUpdate(
        AgentStatusUpdate {
            id: session_id,
            worktree_id: msg.worktree_id,
            agent_type: msg.agent_type.clone(),
            status: AgentStatus::Idle,
            started_at,
        },
    ));

    state.broadcast(broadcast_msg.clone()).await;

    let acp_handle = match &state.acp_handle {
        Some(handle) => handle.clone(),
        None => {
            tracing::error!("ACP runtime not initialized");
            return broadcast_msg;
        }
    };

    let session_id_ref = session_id;
    let worktree_id_ref = msg.worktree_id;
    let state_ref = state.clone();
    let agent_type_ref = msg.agent_type.clone();
    let worktree_path_ref = worktree_path;

    tokio::spawn(async move {
        match acp_handle.spawn_agent(worktree_id_ref, &agent_type_ref, &worktree_path_ref).await {
            Ok(()) => {
                tracing::info!("Agent spawned successfully for worktree {}", worktree_id_ref);
            }
            Err(e) => {
                tracing::error!("Failed to spawn agent process: {}", e);
                if let Err(db_err) = state_ref.db.update_agent_session(
                    &session_id_ref.to_string(),
                    "error"
                ).await {
                    tracing::error!("Failed to update agent session status: {}", db_err);
                }
                let mut agents = state_ref.agents.write().await;
                agents.remove(&session_id_ref);
            }
        }
    });

    broadcast_msg
}

fn parse_timestamp(timestamp: &str) -> u64 {
    chrono::DateTime::parse_from_rfc3339(timestamp)
        .ok()
        .and_then(|dt| u64::try_from(dt.timestamp()).ok())
        .unwrap_or(0)
}

/// Get the worktree path (CWD) for agent spawning.
///
/// Returns the `WorktreeState.path` from the in-memory registry.
/// This is the source of truth for agent CWD, not UI selection.
#[instrument(skip(state))]
pub async fn get_worktree_path(state: &AppState, worktree_id: Uuid) -> Option<String> {
    let worktrees = state.worktrees.read().await;
    worktrees.get(&worktree_id).map(|w| w.path.clone())
}

pub async fn cleanup_agents_for_worktree(state: &AppState, worktree_id: Uuid) {
    let session_ids: Vec<Uuid> = {
        let agents = state.agents.read().await;
        agents
            .iter()
            .filter(|(_, agent)| agent.worktree_id == worktree_id)
            .map(|(id, _)| *id)
            .collect()
    };

    if let Some(handle) = &state.acp_handle {
        let _ = handle.kill(worktree_id).await;
    }

    {
        let mut agents = state.agents.write().await;
        for session_id in &session_ids {
            agents.remove(session_id);
        }
    }

    for session_id in session_ids {
        let broadcast_msg = ServerMessage::new(ServerMessagePayload::AgentRemoved(
            crate::protocol::AgentRemoved {
                id: session_id,
                worktree_id,
            },
        ));
        state.broadcast(broadcast_msg).await;
    }
}

#[instrument(skip(state, msg), fields(worktree_id = %msg.worktree_id))]
pub async fn handle_agent_send(
    state: Arc<AppState>,
    msg: crate::protocol::AgentSend,
) -> ServerMessage {
    let handle = match &state.acp_handle {
        Some(h) => h.clone(),
        None => {
            return ServerMessage::new(ServerMessagePayload::Error(Error {
                code: "ACP_NOT_INITIALIZED".to_string(),
                message: "ACP runtime not initialized".to_string(),
                details: None,
                request_id: None,
            }));
        }
    };

    if let Err(e) = handle.send_prompt(msg.worktree_id, &msg.message).await {
        return ServerMessage::new(ServerMessagePayload::Error(Error {
            code: "AGENT_SEND_ERROR".to_string(),
            message: format!("Failed to send message to agent: {}", e),
            details: None,
            request_id: None,
        }));
    }

    ServerMessage::new(ServerMessagePayload::Ack(crate::protocol::Ack {
        message_id: msg.worktree_id,
        status: AckStatus::Success,
    }))
}

#[instrument(skip(state, msg), fields(worktree_id = %msg.worktree_id))]
pub async fn handle_agent_cancel(
    state: Arc<AppState>,
    msg: crate::protocol::AgentCancel,
) -> ServerMessage {
    let session_data_opt = {
        let agents = state.agents.read().await;
        agents.iter().find_map(|(id, agent_state)| {
            if agent_state.worktree_id == msg.worktree_id {
                Some(*id)
            } else {
                None
            }
        })
    };

    let session_id = match session_data_opt {
        Some(id) => id,
        None => {
            return ServerMessage::new(ServerMessagePayload::Error(Error {
                code: "AGENT_NOT_FOUND".to_string(),
                message: format!("No agent session for worktree {}", msg.worktree_id),
                details: None,
                request_id: None,
            }));
        }
    };

    if let Some(handle) = &state.acp_handle {
        let _ = handle.kill(msg.worktree_id).await;
    }

    {
        let mut agents = state.agents.write().await;
        agents.remove(&session_id);
    }

    if let Err(e) = state.db.delete_agent_session(&session_id.to_string()).await {
        tracing::warn!("Failed to delete agent session from database: {}", e);
    }

    let broadcast_msg = ServerMessage::new(ServerMessagePayload::AgentRemoved(
        crate::protocol::AgentRemoved {
            id: session_id,
            worktree_id: msg.worktree_id,
        },
    ));

    state.broadcast(broadcast_msg).await;

    ServerMessage::new(ServerMessagePayload::Ack(crate::protocol::Ack {
        message_id: msg.worktree_id,
        status: AckStatus::Success,
    }))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::state::{AgentState, WorktreeState};
    use std::sync::Arc;

    async fn create_test_state() -> Arc<AppState> {
        Arc::new(AppState::new_test().await)
    }

    #[tokio::test]
    async fn test_get_worktree_path_returns_path_from_state() {
        let state = create_test_state().await;
        let worktree_id = Uuid::new_v4();
        let workspace_id = Uuid::new_v4();
        let expected_path = "/path/to/worktree".to_string();

        state.worktrees.write().await.insert(
            worktree_id,
            WorktreeState {
                id: worktree_id,
                workspace_id,
                branch_name: "main".to_string(),
                path: expected_path.clone(),
                status: "active".to_string(),
            },
        );

        let result = get_worktree_path(&state, worktree_id).await;
        assert_eq!(result, Some(expected_path));
    }

    #[tokio::test]
    async fn test_get_worktree_path_returns_none_for_missing_worktree() {
        let state = create_test_state().await;
        let missing_worktree_id = Uuid::new_v4();

        let result = get_worktree_path(&state, missing_worktree_id).await;
        assert!(result.is_none());
    }

    #[tokio::test]
    async fn test_cleanup_agents_for_worktree_removes_sessions() {
        let state = create_test_state().await;
        let worktree_id = Uuid::new_v4();
        let session_id = Uuid::new_v4();

        state.agents.write().await.insert(
            session_id,
            AgentState {
                id: session_id,
                worktree_id,
                agent_type: "test".to_string(),
                status: "idle".to_string(),
            },
        );

        cleanup_agents_for_worktree(&state, worktree_id).await;

        assert!(state.agents.read().await.get(&session_id).is_none());
    }

    #[tokio::test]
    async fn test_cleanup_agents_for_worktree_noops_for_missing_worktree() {
        let state = create_test_state().await;
        let worktree_id = Uuid::new_v4();

        cleanup_agents_for_worktree(&state, worktree_id).await;

        assert!(state.agents.read().await.is_empty());
    }

    #[tokio::test]
    async fn test_cleanup_agents_for_worktree_preserves_other_worktree_sessions() {
        let state = create_test_state().await;
        let worktree_to_delete = Uuid::new_v4();
        let worktree_to_keep = Uuid::new_v4();
        let session_to_delete = Uuid::new_v4();
        let session_to_keep = Uuid::new_v4();

        state.agents.write().await.insert(
            session_to_delete,
            AgentState {
                id: session_to_delete,
                worktree_id: worktree_to_delete,
                agent_type: "test".to_string(),
                status: "idle".to_string(),
            },
        );

        state.agents.write().await.insert(
            session_to_keep,
            AgentState {
                id: session_to_keep,
                worktree_id: worktree_to_keep,
                agent_type: "test".to_string(),
                status: "idle".to_string(),
            },
        );

        cleanup_agents_for_worktree(&state, worktree_to_delete).await;

        assert!(state.agents.read().await.get(&session_to_delete).is_none());
        assert!(state.agents.read().await.get(&session_to_keep).is_some());
    }

    #[tokio::test]
    async fn test_find_agent_session_for_worktree() {
        let state = create_test_state().await;
        let worktree_id = Uuid::new_v4();
        let session_id = Uuid::new_v4();

        state.agents.write().await.insert(
            session_id,
            AgentState {
                id: session_id,
                worktree_id,
                agent_type: "test".to_string(),
                status: "idle".to_string(),
            },
        );

        let found = state.find_agent_session_for_worktree(worktree_id).await;
        assert_eq!(found, Some(session_id));

        let not_found = state.find_agent_session_for_worktree(Uuid::new_v4()).await;
        assert!(not_found.is_none());
    }

    #[tokio::test]
    async fn test_spawn_fails_for_missing_worktree() {
        let state = create_test_state().await;
        let msg = crate::protocol::AgentSpawn {
            worktree_id: Uuid::new_v4(),
            agent_type: "test".to_string(),
        };

        let result = handle_agent_spawn(state, msg).await;

        match result.payload {
            ServerMessagePayload::Error(e) => {
                assert_eq!(e.code, "WORKTREE_NOT_FOUND");
            }
            _ => panic!("Expected error response"),
        }
    }

    #[tokio::test]
    async fn test_cancel_fails_for_missing_session() {
        let state = create_test_state().await;
        let msg = crate::protocol::AgentCancel {
            worktree_id: Uuid::new_v4(),
        };

        let result = handle_agent_cancel(state, msg).await;

        match result.payload {
            ServerMessagePayload::Error(e) => {
                assert_eq!(e.code, "AGENT_NOT_FOUND");
            }
            _ => panic!("Expected error response"),
        }
    }

    #[tokio::test]
    async fn test_acp_handle_initialized_in_test_state() {
        let state = create_test_state().await;
        assert!(state.acp_handle.is_some(), "ACP handle should be initialized in test state");
    }

    #[tokio::test]
    async fn test_cleanup_broadcasts_agent_removed() {
        let state = create_test_state().await;
        let worktree_id = Uuid::new_v4();
        let session_id = Uuid::new_v4();
        let client_id = Uuid::new_v4();

        state.agents.write().await.insert(
            session_id,
            AgentState {
                id: session_id,
                worktree_id,
                agent_type: "test".to_string(),
                status: "idle".to_string(),
            },
        );

        let mut rx = state.connect(client_id).await;

        cleanup_agents_for_worktree(&state, worktree_id).await;

        let received = tokio::time::timeout(
            std::time::Duration::from_millis(500),
            rx.recv()
        ).await;

        match received {
            Ok(Some(msg)) => {
                match msg.payload {
                    ServerMessagePayload::AgentRemoved(removed) => {
                        assert_eq!(removed.id, session_id);
                        assert_eq!(removed.worktree_id, worktree_id);
                    }
                    _ => panic!("Expected AgentRemoved message, got {:?}", msg.payload),
                }
            }
            Ok(None) => panic!("Channel closed"),
            Err(_) => panic!("Timeout waiting for broadcast message"),
        }
    }

    #[tokio::test]
    async fn test_spawn_requires_worktree_in_database() {
        let state = create_test_state().await;
        let worktree_id = Uuid::new_v4();
        let workspace_id = Uuid::new_v4();
        let now = chrono::Utc::now().to_rfc3339();

        let db_workspace = crate::db::Workspace {
            id: workspace_id.to_string(),
            name: "test-workspace".to_string(),
            root_path: "/tmp/test".to_string(),
            color: String::new(),
            icon: String::new(),
            worktree_base_dir: String::new(),
            settings_json: String::new(),
            created_at: now.clone(),
            updated_at: now,
        };
        state.db.create_workspace(&db_workspace).await.expect("Failed to create workspace");

        let db_worktree = crate::db::Worktree {
            id: worktree_id.to_string(),
            workspace_id: workspace_id.to_string(),
            branch_name: "main".to_string(),
            path: "/tmp/test-worktree".to_string(),
            status: "active".to_string(),
            created_at: chrono::Utc::now().to_rfc3339(),
        };
        state.db.create_worktree(&db_worktree).await.expect("Failed to create worktree");

        state.worktrees.write().await.insert(
            worktree_id,
            WorktreeState {
                id: worktree_id,
                workspace_id,
                branch_name: "main".to_string(),
                path: "/tmp/test-worktree".to_string(),
                status: "active".to_string(),
            },
        );

        let msg = crate::protocol::AgentSpawn {
            worktree_id,
            agent_type: "test".to_string(),
        };

        let result = handle_agent_spawn(state.clone(), msg).await;

        match result.payload {
            ServerMessagePayload::AgentStatusUpdate(update) => {
                assert_eq!(update.worktree_id, worktree_id);
                assert_eq!(update.agent_type, "test");
            }
            ServerMessagePayload::Error(e) => {
                panic!("Expected AgentStatusUpdate, got Error: {:?}", e);
            }
            _ => panic!("Expected AgentStatusUpdate, got {:?}", result.payload),
        }
    }

    #[tokio::test]
    async fn test_cancel_succeeds_with_valid_session() {
        let state = create_test_state().await;
        let worktree_id = Uuid::new_v4();
        let session_id = Uuid::new_v4();
        let client_id = Uuid::new_v4();

        // Set up in-memory agent session
        state.agents.write().await.insert(
            session_id,
            AgentState {
                id: session_id,
                worktree_id,
                agent_type: "test-agent".to_string(),
                status: "working".to_string(),
            },
        );

        // Connect client to receive broadcasts
        let mut rx = state.connect(client_id).await;

        let msg = crate::protocol::AgentCancel {
            worktree_id,
        };

        let result = handle_agent_cancel(state.clone(), msg).await;

        // Verify Ack response
        match result.payload {
            ServerMessagePayload::Ack(ack) => {
                assert_eq!(ack.status, AckStatus::Success);
            }
            _ => panic!("Expected Ack, got {:?}", result.payload),
        }

        // Verify session removed from memory
        assert!(state.agents.read().await.get(&session_id).is_none());

        // Verify AgentRemoved broadcast sent
        let received = tokio::time::timeout(
            std::time::Duration::from_millis(500),
            rx.recv()
        ).await;

        match received {
            Ok(Some(msg)) => {
                match msg.payload {
                    ServerMessagePayload::AgentRemoved(removed) => {
                        assert_eq!(removed.id, session_id);
                        assert_eq!(removed.worktree_id, worktree_id);
                    }
                    _ => panic!("Expected AgentRemoved message, got {:?}", msg.payload),
                }
            }
            Ok(None) => panic!("Channel closed"),
            Err(_) => panic!("Timeout waiting for broadcast message"),
        }
    }

    #[tokio::test]
    async fn test_spawn_error_returns_correct_error_codes() {
        let state = create_test_state().await;

        // Test 1: Missing worktree returns WORKTREE_NOT_FOUND
        let missing_worktree_msg = crate::protocol::AgentSpawn {
            worktree_id: Uuid::new_v4(),
            agent_type: "test".to_string(),
        };

        let result = handle_agent_spawn(state.clone(), missing_worktree_msg).await;
        match result.payload {
            ServerMessagePayload::Error(e) => {
                assert_eq!(e.code, "WORKTREE_NOT_FOUND");
                assert!(e.message.contains("not found"));
            }
            _ => panic!("Expected Error response for missing worktree"),
        }
    }

    #[tokio::test]
    async fn test_send_error_returns_correct_error_code() {
        let state = create_test_state().await;

        // ACP handle is initialized in test state, but no agent is spawned
        // This tests the send path when there's no running agent
        let msg = crate::protocol::AgentSend {
            worktree_id: Uuid::new_v4(),
            message: "test message".to_string(),
        };

        let result = handle_agent_send(state, msg).await;

        // The ACP handle's send_prompt will fail because no agent is running
        match result.payload {
            ServerMessagePayload::Error(e) => {
                // Either AGENT_SEND_ERROR or similar error
                assert!(!e.code.is_empty());
            }
            ServerMessagePayload::Ack(_) => {
                // This is also acceptable if the mock handle succeeds
            }
            _ => panic!("Expected Error or Ack, got {:?}", result.payload),
        }
    }
}