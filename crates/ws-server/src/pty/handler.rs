//! PTY manager integration for WebSocket server

use crate::db::TerminalSession;
use crate::protocol::{AckStatus, Error, ServerMessage, ServerMessagePayload};
use crate::pty::spawn_output_reader;
use crate::state::AppState;
use std::sync::Arc;
use tracing::instrument;
use uuid::Uuid;

#[instrument(skip(state, msg), fields(worktree_id = %msg.worktree_id))]
pub async fn handle_terminal_create(
    state: Arc<AppState>,
    msg: crate::protocol::TerminalCreate,
) -> ServerMessage {
    let pty_manager = match state.pty_manager.clone() {
        Some(manager) => manager,
        None => {
            return ServerMessage::new(ServerMessagePayload::Error(Error {
                code: "PTY_MANAGER_NOT_INITIALIZED".to_string(),
                message: "PTY manager is not initialized".to_string(),
                details: None,
            }));
        }
    };

    let (session_id, _rx) = match pty_manager.spawn(msg.worktree_id, msg.label.clone(), msg.shell.clone()) {
        Ok(result) => result,
        Err(e) => {
            return ServerMessage::new(ServerMessagePayload::Error(Error {
                code: "PTY_SPAWN_ERROR".to_string(),
                message: e.to_string(),
                details: None,
            }));
        }
    };

    let reader = match pty_manager.get_session(session_id) {
        Some(session) => {
            match session.lock().unwrap().take_reader() {
                Ok(r) => r,
                Err(e) => {
                    let _ = pty_manager.kill(session_id);
                    return ServerMessage::new(ServerMessagePayload::Error(Error {
                        code: "PTY_READER_ERROR".to_string(),
                        message: format!("Failed to get PTY reader: {}", e),
                        details: None,
                    }));
                }
            }
        }
        None => {
            return ServerMessage::new(ServerMessagePayload::Error(Error {
                code: "PTY_SESSION_NOT_FOUND".to_string(),
                message: "PTY session not found after creation".to_string(),
                details: None,
            }));
        }
    };

    let output_handle = spawn_output_reader(
        session_id,
        reader,
        state.broadcast_tx.clone(),
    );
    pty_manager.register_output_reader(session_id, output_handle);

    let shell = msg.shell.clone().unwrap_or_else(|| "/bin/bash".to_string());
    let now = chrono::Utc::now().to_rfc3339();

    let db_session = TerminalSession {
        id: session_id.to_string(),
        worktree_id: msg.worktree_id.to_string(),
        label: msg.label.clone(),
        shell: shell.clone(),
        created_at: now.clone(),
    };

    if let Err(e) = state.db.create_terminal_session(&db_session).await {
        tracing::error!("Failed to store terminal session in database: {}", e);
    }

    {
        let mut terminals = state.terminals.write().await;
        terminals.insert(session_id, crate::state::TerminalState {
            id: session_id,
            worktree_id: msg.worktree_id,
            label: msg.label.clone(),
            shell: shell.clone(),
        });
    }

    let broadcast_msg = ServerMessage::new(ServerMessagePayload::TerminalCreated(
        crate::protocol::TerminalCreated {
            session_id,
            worktree_id: msg.worktree_id,
            label: msg.label.clone(),
            shell: shell.clone(),
        },
    ));

    let _ = state.broadcast_tx.send(broadcast_msg);

    ServerMessage::new(ServerMessagePayload::TerminalCreated(
        crate::protocol::TerminalCreated {
            session_id,
            worktree_id: msg.worktree_id,
            label: msg.label,
            shell,
        },
    ))
}

#[instrument(skip(state, msg), fields(session_id = %msg.session_id))]
pub async fn handle_terminal_input(
    state: Arc<AppState>,
    msg: crate::protocol::TerminalInput,
) -> ServerMessage {
    let pty_manager = match state.pty_manager.clone() {
        Some(manager) => manager,
        None => {
            return ServerMessage::new(ServerMessagePayload::Error(Error {
                code: "PTY_MANAGER_NOT_INITIALIZED".to_string(),
                message: "PTY manager is not initialized".to_string(),
                details: None,
            }));
        }
    };

    if let Err(e) = pty_manager.write(msg.session_id, &msg.data.into_bytes()) {
        return ServerMessage::new(ServerMessagePayload::Error(Error {
            code: "PTY_WRITE_ERROR".to_string(),
            message: e.to_string(),
            details: None,
        }));
    }

    ServerMessage::new(ServerMessagePayload::Ack(crate::protocol::Ack {
        message_id: msg.session_id,
        status: AckStatus::Success,
    }))
}

#[instrument(skip(state, msg), fields(session_id = %msg.session_id))]
pub async fn handle_terminal_resize(
    state: Arc<AppState>,
    msg: crate::protocol::TerminalResize,
) -> ServerMessage {
    let pty_manager = match state.pty_manager.clone() {
        Some(manager) => manager,
        None => {
            return ServerMessage::new(ServerMessagePayload::Error(Error {
                code: "PTY_MANAGER_NOT_INITIALIZED".to_string(),
                message: "PTY manager is not initialized".to_string(),
                details: None,
            }));
        }
    };

    if let Err(e) = pty_manager.resize(msg.session_id, msg.cols, msg.rows) {
        return ServerMessage::new(ServerMessagePayload::Error(Error {
            code: "PTY_RESIZE_ERROR".to_string(),
            message: e.to_string(),
            details: None,
        }));
    }

    ServerMessage::new(ServerMessagePayload::Ack(crate::protocol::Ack {
        message_id: msg.session_id,
        status: AckStatus::Success,
    }))
}

pub async fn handle_terminal_kill(
    state: Arc<AppState>,
    msg: crate::protocol::TerminalKill,
) -> ServerMessage {
    let pty_manager = match state.pty_manager.clone() {
        Some(manager) => manager,
        None => {
            return ServerMessage::new(ServerMessagePayload::Error(Error {
                code: "PTY_MANAGER_NOT_INITIALIZED".to_string(),
                message: "PTY manager is not initialized".to_string(),
                details: None,
            }));
        }
    };

    if let Err(e) = pty_manager.kill(msg.session_id) {
        return ServerMessage::new(ServerMessagePayload::Error(Error {
            code: "PTY_KILL_ERROR".to_string(),
            message: e.to_string(),
            details: None,
        }));
    }

    {
        let mut terminals = state.terminals.write().await;
        terminals.remove(&msg.session_id);
    }

    if let Err(e) = state.db.delete_terminal_session(&msg.session_id.to_string()).await {
        tracing::warn!("Failed to delete terminal session from database: {}", e);
    }

    ServerMessage::new(ServerMessagePayload::Ack(crate::protocol::Ack {
        message_id: msg.session_id,
        status: AckStatus::Success,
    }))
}

pub async fn handle_terminal_list(
    state: Arc<AppState>,
    worktree_id: Uuid,
) -> ServerMessage {
    let pty_manager = match state.pty_manager.clone() {
        Some(manager) => manager,
        None => {
            return ServerMessage::new(ServerMessagePayload::Error(Error {
                code: "PTY_MANAGER_NOT_INITIALIZED".to_string(),
                message: "PTY manager is not initialized".to_string(),
                details: None,
            }));
        }
    };

    let session_ids = pty_manager.get_worktree_sessions(worktree_id);

    let mut sessions = Vec::new();
    let terminals = state.terminals.read().await;
    for session_id in session_ids {
        if let Some(terminal_state) = terminals.get(&session_id) {
            sessions.push(crate::protocol::TerminalSessionData {
                id: session_id,
                worktree_id: terminal_state.worktree_id,
                label: terminal_state.label.clone(),
                shell: terminal_state.shell.clone(),
                created_at: 0,
            });
        }
    }

    ServerMessage::new(ServerMessagePayload::StateSnapshot(crate::protocol::StateSnapshot {
        request_id: Uuid::nil(),
        workspaces: vec![],
        worktrees: vec![],
        agent_sessions: vec![],
        terminal_sessions: sessions,
        settings: vec![],
    }))
}