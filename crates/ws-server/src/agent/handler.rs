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
                }));
            }
        }
    };

    let mut agent_client = match AcpClient::spawn(&msg.agent_type, &worktree_path).await {
        Ok(client) => client,
        Err(e) => {
            return ServerMessage::new(ServerMessagePayload::Error(Error {
                code: "AGENT_SPAWN_ERROR".to_string(),
                message: format!("Failed to spawn agent: {}", e),
                details: None,
            }));
        }
    };

    let acp_session_id = None;
    let session_id = Uuid::new_v4();
    let now = chrono::Utc::now().to_rfc3339();

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
        let _ = agent_client.kill().await;
        return ServerMessage::new(ServerMessagePayload::Error(Error {
            code: "AGENT_DB_ERROR".to_string(),
            message: format!("Failed to store agent session: {}", e),
            details: None,
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

    {
        let mut agent_clients = state.agent_clients.write().await;
        agent_clients.insert(msg.worktree_id, Arc::new(tokio::sync::Mutex::new(agent_client)));
    }

    let broadcast_msg = ServerMessage::new(ServerMessagePayload::AgentStatusUpdate(
        AgentStatusUpdate {
            worktree_id: msg.worktree_id,
            status: AgentStatus::Idle,
        },
    ));

    let _ = state.broadcast_tx.send(broadcast_msg);

    ServerMessage::new(ServerMessagePayload::AgentStatusUpdate(
        AgentStatusUpdate {
            worktree_id: msg.worktree_id,
            status: AgentStatus::Idle,
        },
    ))
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
    let agent_client_arc = {
        let agent_clients = state.agent_clients.read().await;
        match agent_clients.get(&msg.worktree_id) {
            Some(client) => client.clone(),
            None => {
                return ServerMessage::new(ServerMessagePayload::Error(Error {
                    code: "AGENT_NOT_FOUND".to_string(),
                    message: format!("No agent running for worktree {}", msg.worktree_id),
                    details: None,
                }));
            }
        }
    };

    {
        let mut agent_client = agent_client_arc.lock().await;
        if let Err(e) = agent_client.kill().await {
            tracing::warn!("Failed to kill agent process: {}", e);
        }
    }

    {
        let mut agent_clients = state.agent_clients.write().await;
        agent_clients.remove(&msg.worktree_id);
    }

    let session_id_opt = {
        let agents = state.agents.read().await;
        agents.iter().find_map(|(id, state)| {
            if state.worktree_id == msg.worktree_id {
                Some(*id)
            } else {
                None
            }
        })
    };

    if let Some(session_id) = session_id_opt {
        {
            let mut agents = state.agents.write().await;
            agents.remove(&session_id);
        }

        if let Err(e) = state.db.delete_agent_session(&session_id.to_string()).await {
            tracing::warn!("Failed to delete agent session from database: {}", e);
        }
    }

    let broadcast_msg = ServerMessage::new(ServerMessagePayload::AgentStatusUpdate(
        AgentStatusUpdate {
            worktree_id: msg.worktree_id,
            status: AgentStatus::Idle,
        },
    ));

    let _ = state.broadcast_tx.send(broadcast_msg);

    ServerMessage::new(ServerMessagePayload::Ack(crate::protocol::Ack {
        message_id: msg.worktree_id,
        status: AckStatus::Success,
    }))
}