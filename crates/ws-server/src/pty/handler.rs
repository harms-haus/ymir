//! PTY manager integration for WebSocket server

use crate::db::TerminalSession;
use crate::protocol::{AckStatus, Error, ServerMessage, ServerMessagePayload};
use crate::pty::spawn_output_reader;
use crate::state::AppState;
use std::sync::Arc;
use tracing::instrument;
use uuid::Uuid;

pub async fn handle_terminal_request_history(
    state: Arc<AppState>,
    msg: crate::protocol::TerminalRequestHistory,
) -> ServerMessage {
    let history = match state
        .db
        .get_terminal_output_by_tab(&msg.tab_id.to_string(), msg.limit.map(|l| l as i64))
        .await
    {
        Ok(output) => output,
        Err(e) => {
            tracing::error!("Failed to get terminal output history: {}", e);
            return ServerMessage::new(ServerMessagePayload::Error(Error {
                code: "TERMINAL_HISTORY_ERROR".to_string(),
                message: format!("Failed to get terminal history: {}", e),
                details: None,
                request_id: Some(msg.request_id),
            }));
        }
    };

    let combined_output = history.join("");

    ServerMessage::new(ServerMessagePayload::TerminalTabHistory(
        crate::protocol::TerminalTabHistory {
            tab_id: msg.tab_id,
            data: combined_output,
        },
    ))
}

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
                    request_id: None,
            }));
        }
    };

    // Get worktree path for setting terminal working directory
    let worktree_path = match state.worktrees.read().await.get(&msg.worktree_id) {
        Some(wt) => wt.path.clone(),
        None => {
            return ServerMessage::new(ServerMessagePayload::Error(Error {
                code: "WORKTREE_NOT_FOUND".to_string(),
                message: format!("Worktree {} not found", msg.worktree_id),
                details: None,
                    request_id: None,
            }));
        }
    };

    let (session_id, _rx) = match pty_manager.spawn(msg.worktree_id, &worktree_path, msg.label.clone(), msg.shell.clone()) {
        Ok(result) => result,
        Err(e) => {
            return ServerMessage::new(ServerMessagePayload::Error(Error {
                code: "PTY_SPAWN_ERROR".to_string(),
                message: e.to_string(),
                details: None,
                    request_id: None,
            }));
        }
    };

    #[cfg(unix)]
    let output_handle = {
        let session = match pty_manager.get_session(session_id) {
            Some(s) => s,
            None => {
                return ServerMessage::new(ServerMessagePayload::Error(Error {
                    code: "PTY_SESSION_NOT_FOUND".to_string(),
                    message: "PTY session not found after creation".to_string(),
                    details: None,
                    request_id: None,
                }));
            }
        };
        let (master_fd, user_input_received) = {
            let s = session.lock().unwrap();
            let fd = match s.master_raw_fd() {
                Some(fd) => fd,
                None => {
                    let _ = pty_manager.kill_session(session_id);
                    return ServerMessage::new(ServerMessagePayload::Error(Error {
                        code: "PTY_READER_ERROR".to_string(),
                        message: "Failed to get PTY master fd".to_string(),
                        details: None,
                        request_id: None,
                    }));
                }
            };
            (fd, s.user_input_received())
        };
        spawn_output_reader(session_id, master_fd, Arc::clone(&state), user_input_received)
    };
    #[cfg(not(unix))]
    let output_handle = {
        let session = match pty_manager.get_session(session_id) {
            Some(s) => s,
            None => {
                return ServerMessage::new(ServerMessagePayload::Error(Error {
                    code: "PTY_SESSION_NOT_FOUND".to_string(),
                    message: "PTY session not found after creation".to_string(),
                    details: None,
                        request_id: None,
                }));
            }
        };
        let (reader, user_input_received) = {
            let mut s = session.lock().unwrap();
            let r = match s.take_reader() {
                Ok(r) => r,
                Err(e) => {
                    let _ = pty_manager.kill_session(session_id);
                    return ServerMessage::new(ServerMessagePayload::Error(Error {
                        code: "PTY_READER_ERROR".to_string(),
                        message: format!("Failed to get PTY reader: {}", e),
                        details: None,
                    request_id: None,
                    }));
                }
            };
            (r, s.user_input_received())
        };
        spawn_output_reader(session_id, reader, Arc::clone(&state), user_input_received)
    };
    pty_manager.register_output_reader(session_id, output_handle);

    let shell = msg.shell.clone().unwrap_or_else(|| "/bin/bash".to_string());
    let now = chrono::Utc::now().to_rfc3339();

let db_session = TerminalSession {
      id: session_id.to_string(),
      worktree_id: msg.worktree_id.to_string(),
      label: msg.label.clone(),
      shell: shell.clone(),
      created_at: now.clone(),
      position: 0,
      tab_id: None,
      status: "active".to_string(),
      ended_at: None,
      ended_reason: None,
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
                    request_id: None,
            }));
        }
    };

    // Accumulate input into line buffer; detect "clear" command when line is
    // completed (newline/carriage-return received). Terminal input arrives
    // character-by-character so checking each keystroke against "clear" would
    // never match — we must buffer until the user presses Enter.
    let clear_detected = if let Some(session) = pty_manager.get_session(msg.session_id) {
        let s = session.lock().unwrap();
        s.append_to_line_buffer(&msg.data)
            .filter(|line| line.eq_ignore_ascii_case("clear"))
            .is_some()
    } else {
        false
    };

    if clear_detected {
        if let Some(tab_id) = pty_manager.get_session(msg.session_id).and_then(|s| s.lock().unwrap().tab_id) {
            let tab_id_str = tab_id.to_string();
            let db = state.db.clone();
            tokio::spawn(async move {
                if let Err(e) = db.clear_terminal_output_for_tab(&tab_id_str).await {
                    tracing::error!("Failed to clear terminal history: {}", e);
                }
            });
        }
    }

    if let Err(e) = pty_manager.write(msg.session_id, &msg.data.into_bytes()) {
        return ServerMessage::new(ServerMessagePayload::Error(Error {
            code: "PTY_WRITE_ERROR".to_string(),
            message: e.to_string(),
            details: None,
                    request_id: None,
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
                    request_id: None,
            }));
        }
    };

    if let Err(e) = pty_manager.resize(msg.session_id, msg.cols, msg.rows) {
        return ServerMessage::new(ServerMessagePayload::Error(Error {
            code: "PTY_RESIZE_ERROR".to_string(),
            message: e.to_string(),
            details: None,
                    request_id: None,
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
                    request_id: None,
            }));
        }
    };

    if let Err(e) = pty_manager.kill_session(msg.session_id) {
        if !e.to_string().contains("not found") {
            return ServerMessage::new(ServerMessagePayload::Error(Error {
                code: "PTY_KILL_ERROR".to_string(),
                message: e.to_string(),
                details: None,
                    request_id: None,
            }));
        }
        tracing::warn!("PTY session not found (may be stale): {}", msg.session_id);
    }

    {
        let mut terminals = state.terminals.write().await;
        terminals.remove(&msg.session_id);
    }

    if let Err(e) = state.db.delete_terminal_session(&msg.session_id.to_string()).await {
        tracing::warn!("Failed to delete terminal session from database: {}", e);
    }

    if let Err(e) = state.db.delete_terminal_output(&msg.session_id.to_string()).await {
        tracing::warn!("Failed to delete terminal output from database: {}", e);
    }

    tracing::info!("Broadcasting TerminalRemoved for session: {}", msg.session_id);
    let broadcast_msg = ServerMessage::new(ServerMessagePayload::TerminalRemoved(
        crate::protocol::TerminalRemoved {
            session_id: msg.session_id,
        },
    ));

    state.broadcast(broadcast_msg).await;
    tracing::info!("Successfully broadcast TerminalRemoved");

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
                    request_id: None,
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
                tab_id: session_id, // backward compat: old sessions are their own tab
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

#[instrument(skip(state, msg), fields(tab_id = %msg.tab_id, worktree_id = %msg.worktree_id))]
pub async fn handle_terminal_mount(
    state: Arc<AppState>,
    msg: crate::protocol::TerminalMount,
) -> ServerMessage {
    let pty_manager = match state.pty_manager.clone() {
        Some(manager) => manager,
        None => {
            return ServerMessage::new(ServerMessagePayload::Error(Error {
                code: "PTY_MANAGER_NOT_INITIALIZED".to_string(),
                message: "PTY manager is not initialized".to_string(),
                details: None,
                request_id: None,
            }));
        }
    };

    // Get worktree path for setting terminal working directory
    let worktree_path = match state.worktrees.read().await.get(&msg.worktree_id) {
        Some(wt) => wt.path.clone(),
        None => {
            return ServerMessage::new(ServerMessagePayload::Error(Error {
                code: "WORKTREE_NOT_FOUND".to_string(),
                message: format!("Worktree {} not found", msg.worktree_id),
                details: None,
                request_id: None,
            }));
        }
    };

    let (session_id, rx) = match pty_manager.get_or_create_session(
        msg.tab_id,
        msg.worktree_id,
        &worktree_path,
        msg.label.clone(),
        msg.shell.clone(),
    ) {
        Ok(result) => result,
        Err(e) => {
            return ServerMessage::new(ServerMessagePayload::Error(Error {
                code: "PTY_SPAWN_ERROR".to_string(),
                message: e.to_string(),
                details: None,
                request_id: None,
            }));
        }
    };

    // If we got a new session (rx is Some), spawn the output reader
    if let Some(_rx) = rx {
        if let Some(session) = pty_manager.get_session(session_id) {
            #[cfg(unix)]
            {
                let (master_fd, user_input_received) = {
                    let s = session.lock().unwrap();
                    (s.master_raw_fd(), s.user_input_received())
                };
                if let Some(master_fd) = master_fd {
                    let output_handle =
                        spawn_output_reader(session_id, master_fd, Arc::clone(&state), user_input_received);
                    pty_manager.register_output_reader(session_id, output_handle);
                }
            }
            #[cfg(not(unix))]
            {
                let (pty_reader, user_input_received) = {
                    let mut s = session.lock().unwrap();
                    (s.take_reader(), s.user_input_received())
                };
                if let Ok(pty_reader) = pty_reader {
                    let output_handle =
                        spawn_output_reader(session_id, pty_reader, Arc::clone(&state), user_input_received);
                    pty_manager.register_output_reader(session_id, output_handle);
                }
            }
        }
    }

    let shell = msg.shell.clone().unwrap_or_else(|| "/bin/bash".to_string());
    let now = chrono::Utc::now().to_rfc3339();

    let db_session = TerminalSession {
        id: session_id.to_string(),
        worktree_id: msg.worktree_id.to_string(),
        label: msg.label.clone(),
        shell: shell.clone(),
        created_at: now.clone(),
        position: 0,
        tab_id: Some(msg.tab_id.to_string()),
        status: "active".to_string(),
        ended_at: None,
        ended_reason: None,
    };

    if let Err(e) = state.db.create_terminal_session(&db_session).await {
        tracing::error!("Failed to store terminal session in database: {}", e);
    }

    {
        let mut terminals = state.terminals.write().await;
        terminals.insert(
            session_id,
            crate::state::TerminalState {
                id: session_id,
                worktree_id: msg.worktree_id,
                label: msg.label.clone(),
                shell: shell.clone(),
            },
        );
    }

    let mounted = crate::protocol::TerminalMounted {
        tab_id: msg.tab_id,
        session_id,
        worktree_id: msg.worktree_id,
        label: msg.label,
        shell,
    };

    // Broadcast the mount event to all clients (including the requester)
    let broadcast_msg = ServerMessage::new(ServerMessagePayload::TerminalMounted(mounted));
    state.broadcast(broadcast_msg).await;

    ServerMessage::new(ServerMessagePayload::Ack(crate::protocol::Ack {
        message_id: session_id,
        status: crate::protocol::AckStatus::Success,
    }))
}

#[instrument(skip(state, msg), fields(tab_id = %msg.tab_id, session_id = %msg.session_id))]
pub async fn handle_terminal_unmount(
    state: Arc<AppState>,
    msg: crate::protocol::TerminalUnmount,
) -> ServerMessage {
    // Do NOT kill the PTY on unmount. The session should remain alive
    // for remount (StrictMode double-invoke, tab navigation, etc.).
    // The PTY will be killed only on explicit TerminalTabClose or TTL expiry.
    // Just update the DB session status for bookkeeping.
    if let Err(e) = state.db.end_tab_session(&msg.session_id.to_string(), "unmount").await {
        tracing::warn!("Failed to update DB session status for unmount: {}", e);
    }

    ServerMessage::new(ServerMessagePayload::Ack(crate::protocol::Ack {
        message_id: msg.tab_id,
        status: AckStatus::Success,
    }))
}

#[instrument(skip(state, msg), fields(tab_id = %msg.tab_id))]
pub async fn handle_terminal_tab_close(
    state: Arc<AppState>,
    msg: crate::protocol::TerminalTabClose,
) -> ServerMessage {
    let pty_manager = match state.pty_manager.clone() {
        Some(manager) => manager,
        None => {
            return ServerMessage::new(ServerMessagePayload::Error(Error {
                code: "PTY_MANAGER_NOT_INITIALIZED".to_string(),
                message: "PTY manager is not initialized".to_string(),
                details: None,
                request_id: None,
            }));
        }
    };

    // Find all sessions for this tab in DB
    let tab_id_str = msg.tab_id.to_string();
    let sessions_in_db = match state.db.list_terminal_sessions_for_tab(&tab_id_str).await {
        Ok(sessions) => sessions,
        Err(e) => {
            tracing::warn!("Failed to query sessions for tab {}: {}", tab_id_str, e);
            Vec::new()
        }
    };

    // Collect session IDs that are active
    let active_session_ids: Vec<Uuid> = sessions_in_db
        .iter()
        .filter(|s| s.status == "active")
        .filter_map(|s| Uuid::parse_str(&s.id).ok())
        .collect();

    // For each active session: kill the PTY and clean up in-memory state
    for session_id in &active_session_ids {
        if let Err(e) = pty_manager.kill_session(*session_id) {
            if !e.to_string().contains("not found") {
                tracing::warn!("Failed to kill PTY session {}: {}", session_id, e);
            }
        }

        {
            let mut terminals = state.terminals.write().await;
            terminals.remove(session_id);
        }
    }

    // Close the tab in DB — this ends all sessions for the tab
    if let Err(e) = state.db.close_terminal_tab(&tab_id_str).await {
        tracing::warn!("Failed to close terminal tab {} in DB: {}", tab_id_str, e);
    }

    // Broadcast the tab closed event
    let closed = crate::protocol::TerminalTabClosed {
        tab_id: msg.tab_id,
    };
    let broadcast_msg = ServerMessage::new(ServerMessagePayload::TerminalTabClosed(closed.clone()));
    state.broadcast(broadcast_msg).await;

    ServerMessage::new(ServerMessagePayload::Ack(crate::protocol::Ack {
        message_id: msg.tab_id,
        status: AckStatus::Success,
    }))
}