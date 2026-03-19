//! Agent client integration for WebSocket server

use crate::agent::AcpClient;
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

    let session_id_ref = session_id;
    let worktree_id_ref = msg.worktree_id;
    let agent_type_ref = msg.agent_type.clone();
    let state_ref = state.clone();
    let worktree_path_ref = worktree_path;

    tokio::spawn(async move {
        match AcpClient::spawn(&agent_type_ref, &worktree_path_ref).await {
            Ok(agent_client) => {
                let mut agent_clients = state_ref.agent_clients.write().await;
                agent_clients.insert(worktree_id_ref, Arc::new(tokio::sync::Mutex::new(agent_client)));
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

#[instrument(skip(state, msg), fields(worktree_id = %msg.worktree_id))]
pub async fn handle_agent_send(
    state: Arc<AppState>,
    msg: crate::protocol::AgentSend,
) -> ServerMessage {
    let agent_client_arc = {
        let agent_clients = state.agent_clients.read().await;
        match agent_clients.get(&msg.worktree_id) {
            Some(client) => client.clone(),
            None => {
                return ServerMessage::new(ServerMessagePayload::Error(Error {
                    code: "AGENT_NOT_FOUND".to_string(),
                    message: format!("No agent running for worktree {}", msg.worktree_id),
                    details: None,
                    request_id: None,
                }));
            }
        }
    };

    let mut agent_client = agent_client_arc.lock().await;
    
    if let Err(e) = agent_client.send_prompt(&msg.message).await {
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
                Some((*id, agent_state.agent_type.clone()))
            } else {
                None
            }
        })
    };

    let (session_id, agent_type) = match session_data_opt {
        Some(data) => data,
        None => {
            return ServerMessage::new(ServerMessagePayload::Error(Error {
                code: "AGENT_NOT_FOUND".to_string(),
                message: format!("No agent session for worktree {}", msg.worktree_id),
                details: None,
                request_id: None,
            }));
        }
    };

    let agent_client_arc = {
        let agent_clients = state.agent_clients.read().await;
        agent_clients.get(&msg.worktree_id).cloned()
    };

    if let Some(agent_client_arc) = agent_client_arc {
        let mut agent_client = agent_client_arc.lock().await;
        if let Err(e) = agent_client.kill().await {
            tracing::warn!("Failed to kill agent process: {}", e);
        }
        drop(agent_client);

        let mut agent_clients = state.agent_clients.write().await;
        agent_clients.remove(&msg.worktree_id);
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