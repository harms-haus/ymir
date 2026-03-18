//! Message routing and dispatch for WebSocket server

use crate::protocol::{
    ClientMessage, ClientMessagePayload, Error, ServerMessage, ServerMessagePayload,
};
use crate::state::AppState;
use std::sync::Arc;
use tracing::instrument;
use uuid::Uuid;

/// Route a client message to the appropriate handler
#[instrument(skip(state, message), fields(client_id = %client_id))]
pub async fn route_message(
    state: Arc<AppState>,
    client_id: Uuid,
    message: ClientMessage,
) -> Option<ServerMessage> {
    let response = match message.payload {
        ClientMessagePayload::Ping(ping) => {
            state.update_activity(client_id).await;
            Some(ServerMessage::new(ServerMessagePayload::Pong(
                crate::protocol::Pong {
                    timestamp: ping.timestamp,
                },
            )))
        }
        ClientMessagePayload::Pong(_) => {
            None
        }

        ClientMessagePayload::GetState(get_state) => {
            Some(handle_get_state(state.clone(), get_state.request_id).await)
        }

        ClientMessagePayload::WorkspaceCreate(msg) => {
            match crate::workspace::create(state.clone(), msg).await {
                Ok(result) => Some(ServerMessage::new(ServerMessagePayload::WorkspaceCreated(
                    result,
                ))),
                Err(e) => Some(ServerMessage::new(ServerMessagePayload::Error(Error {
                    code: "WORKSPACE_CREATE_ERROR".to_string(),
                    message: e.to_string(),
                    details: None,
                }))),
            }
        }

        ClientMessagePayload::WorkspaceDelete(msg) => {
            match crate::workspace::delete(state.clone(), msg).await {
                Ok(result) => Some(ServerMessage::new(ServerMessagePayload::WorkspaceDeleted(
                    result,
                ))),
                Err(e) => Some(ServerMessage::new(ServerMessagePayload::Error(Error {
                    code: "WORKSPACE_DELETE_ERROR".to_string(),
                    message: e.to_string(),
                    details: None,
                }))),
            }
        }

        ClientMessagePayload::WorktreeCreate(msg) => {
            match crate::worktree::create(state.clone(), msg).await {
                Ok(result) => Some(ServerMessage::new(ServerMessagePayload::WorktreeCreated(
                    result,
                ))),
                Err(e) => Some(ServerMessage::new(ServerMessagePayload::Error(Error {
                    code: "WORKTREE_CREATE_ERROR".to_string(),
                    message: e.to_string(),
                    details: None,
                }))),
            }
        }

        ClientMessagePayload::WorktreeDelete(msg) => {
            match crate::worktree::delete(state.clone(), msg).await {
                Ok(result) => Some(ServerMessage::new(ServerMessagePayload::WorktreeDeleted(
                    result,
                ))),
                Err(e) => Some(ServerMessage::new(ServerMessagePayload::Error(Error {
                    code: "WORKTREE_DELETE_ERROR".to_string(),
                    message: e.to_string(),
                    details: None,
                }))),
            }
        }

        ClientMessagePayload::WorktreeList(msg) => {
            let workspace_id = msg.workspace_id;
            match crate::worktree::list(state.clone(), msg).await {
                Ok(worktrees) => Some(ServerMessage::new(
                    ServerMessagePayload::WorktreeListResult(crate::protocol::WorktreeListResult {
                        workspace_id,
                        worktrees,
                    }),
                )),
                Err(e) => Some(ServerMessage::new(ServerMessagePayload::Error(Error {
                    code: "WORKTREE_LIST_ERROR".to_string(),
                    message: e.to_string(),
                    details: None,
                }))),
            }
        }
        ClientMessagePayload::WorkspaceRename(_)
        | ClientMessagePayload::WorkspaceUpdate(_)
        | ClientMessagePayload::WorktreeMerge(_)
        | ClientMessagePayload::AgentSpawn(_)
        | ClientMessagePayload::AgentSend(_)
        | ClientMessagePayload::AgentCancel(_)
        | ClientMessagePayload::TerminalInput(_)
        | ClientMessagePayload::TerminalResize(_)
        | ClientMessagePayload::TerminalCreate(_)
        | ClientMessagePayload::FileRead(_)
        | ClientMessagePayload::FileWrite(_)
        | ClientMessagePayload::UpdateSettings(_) => Some(not_implemented(message.payload)),

        ClientMessagePayload::GitStatus(msg) => Some(handle_git_status(state.clone(), msg).await),

        ClientMessagePayload::GitDiff(msg) => Some(handle_git_diff(state.clone(), msg).await),

        ClientMessagePayload::GitCommit(msg) => Some(handle_git_commit(state.clone(), msg).await),

        ClientMessagePayload::CreatePR(msg) => Some(handle_create_pr(state.clone(), msg).await),

        ClientMessagePayload::Ack(_) => Some(not_implemented(message.payload)),
    };
    response
}

fn not_implemented(payload: ClientMessagePayload) -> ServerMessage {
    let msg_type = match payload {
        ClientMessagePayload::WorkspaceCreate(_) => "WorkspaceCreate",
        ClientMessagePayload::WorkspaceDelete(_) => "WorkspaceDelete",
        ClientMessagePayload::WorkspaceRename(_) => "WorkspaceRename",
        ClientMessagePayload::WorkspaceUpdate(_) => "WorkspaceUpdate",
        ClientMessagePayload::WorktreeCreate(_) => "WorktreeCreate",
        ClientMessagePayload::WorktreeDelete(_) => "WorktreeDelete",
        ClientMessagePayload::WorktreeMerge(_) => "WorktreeMerge",
        ClientMessagePayload::WorktreeList(_) => "WorktreeList",
        ClientMessagePayload::AgentSpawn(_) => "AgentSpawn",
        ClientMessagePayload::AgentSend(_) => "AgentSend",
        ClientMessagePayload::AgentCancel(_) => "AgentCancel",
        ClientMessagePayload::TerminalInput(_) => "TerminalInput",
        ClientMessagePayload::TerminalResize(_) => "TerminalResize",
        ClientMessagePayload::TerminalCreate(_) => "TerminalCreate",
        ClientMessagePayload::FileRead(_) => "FileRead",
        ClientMessagePayload::FileWrite(_) => "FileWrite",
        ClientMessagePayload::GitStatus(_) => "GitStatus",
        ClientMessagePayload::GitDiff(_) => "GitDiff",
        ClientMessagePayload::GitCommit(_) => "GitCommit",
        ClientMessagePayload::CreatePR(_) => "CreatePR",
        ClientMessagePayload::UpdateSettings(_) => "UpdateSettings",
        ClientMessagePayload::Ack(_) => "Ack",
        _ => "Unknown",
    };

    ServerMessage::new(ServerMessagePayload::Error(Error {
        code: "NOT_IMPLEMENTED".to_string(),
        message: format!("{} handler not implemented yet", msg_type),
        details: None,
    }))
}

fn parse_timestamp(timestamp: &str) -> u64 {
    chrono::DateTime::parse_from_rfc3339(timestamp)
        .ok()
        .and_then(|dt| u64::try_from(dt.timestamp()).ok())
        .unwrap_or(0)
}

fn parse_agent_status(status: &str) -> crate::protocol::AgentStatus {
    match status {
        "working" | "Working" => crate::protocol::AgentStatus::Working,
        "waiting" | "Waiting" => crate::protocol::AgentStatus::Waiting,
        _ => crate::protocol::AgentStatus::Idle,
    }
}

#[instrument(skip(state))]
async fn handle_get_state(state: Arc<AppState>, request_id: Uuid) -> ServerMessage {
    use crate::protocol::{
        AgentSessionData, StateSnapshot, TerminalSessionData, WorkspaceData, WorktreeData,
    };

    let workspaces: Vec<WorkspaceData> = match crate::workspace::list(state.clone()).await {
        Ok(workspaces) => workspaces,
        Err(e) => {
            return ServerMessage::new(ServerMessagePayload::Error(Error {
                code: "GET_STATE_ERROR".to_string(),
                message: e.to_string(),
                details: None,
            }));
        }
    };

    let mut worktrees: Vec<WorktreeData> = Vec::new();
    for workspace in &workspaces {
        let workspace_worktrees = match crate::worktree::list(
            state.clone(),
            crate::protocol::WorktreeList {
                workspace_id: workspace.id,
            },
        )
        .await
        {
            Ok(worktrees) => worktrees,
            Err(e) => {
                return ServerMessage::new(ServerMessagePayload::Error(Error {
                    code: "GET_STATE_ERROR".to_string(),
                    message: e.to_string(),
                    details: None,
                }));
            }
        };
        worktrees.extend(workspace_worktrees);
    }

    let mut agent_sessions: Vec<AgentSessionData> = Vec::new();
    let mut terminal_sessions: Vec<TerminalSessionData> = Vec::new();
    for worktree in &worktrees {
        let worktree_id = worktree.id.to_string();

        let db_agent_sessions = match state.db.list_agent_sessions(&worktree_id).await {
            Ok(agent_sessions) => agent_sessions,
            Err(e) => {
                return ServerMessage::new(ServerMessagePayload::Error(Error {
                    code: "GET_STATE_ERROR".to_string(),
                    message: e.to_string(),
                    details: None,
                }));
            }
        };
        agent_sessions.extend(
            db_agent_sessions
                .into_iter()
                .map(|session| AgentSessionData {
                    id: Uuid::parse_str(&session.id).unwrap_or_else(|_| Uuid::new_v4()),
                    worktree_id: Uuid::parse_str(&session.worktree_id).unwrap_or(worktree.id),
                    agent_type: session.agent_type,
                    acp_session_id: session.acp_session_id,
                    status: parse_agent_status(&session.status),
                    started_at: parse_timestamp(&session.started_at),
                }),
        );

        let db_terminal_sessions = match state.db.list_terminal_sessions(&worktree_id).await {
            Ok(terminal_sessions) => terminal_sessions,
            Err(e) => {
                return ServerMessage::new(ServerMessagePayload::Error(Error {
                    code: "GET_STATE_ERROR".to_string(),
                    message: e.to_string(),
                    details: None,
                }));
            }
        };
        terminal_sessions.extend(db_terminal_sessions.into_iter().map(|session| {
            TerminalSessionData {
                id: Uuid::parse_str(&session.id).unwrap_or_else(|_| Uuid::new_v4()),
                worktree_id: Uuid::parse_str(&session.worktree_id).unwrap_or(worktree.id),
                label: session.label,
                shell: session.shell,
                created_at: parse_timestamp(&session.created_at),
            }
        }));
    }

    ServerMessage::new(ServerMessagePayload::StateSnapshot(StateSnapshot {
        request_id,
        workspaces,
        worktrees,
        agent_sessions,
        terminal_sessions,
        settings: vec![],
    }))
}

#[instrument(skip(state))]
async fn handle_git_status(state: Arc<AppState>, msg: crate::protocol::GitStatus) -> ServerMessage {
    let worktree_id = msg.worktree_id;

    let repo_path = {
        let worktrees = state.worktrees.read().await;
        match worktrees.get(&worktree_id) {
            Some(worktree) => std::path::PathBuf::from(worktree.path.clone()),
            None => {
                return ServerMessage::new(ServerMessagePayload::Error(Error {
                    code: "WORKTREE_NOT_FOUND".to_string(),
                    message: format!("Worktree {} not found", worktree_id),
                    details: None,
                }));
            }
        }
    };

    match state.git_ops.status(worktree_id, repo_path.as_path()).await {
        Ok(result) => ServerMessage::new(ServerMessagePayload::GitStatusResult(result)),
        Err(e) => ServerMessage::new(ServerMessagePayload::Error(Error {
            code: "GIT_STATUS_ERROR".to_string(),
            message: e.to_string(),
            details: None,
        })),
    }
}

#[instrument(skip(state))]
async fn handle_git_diff(state: Arc<AppState>, msg: crate::protocol::GitDiff) -> ServerMessage {
    let worktree_id = msg.worktree_id;
    let file_path = msg.file_path.as_deref();

    let repo_path = {
        let worktrees = state.worktrees.read().await;
        match worktrees.get(&worktree_id) {
            Some(worktree) => std::path::PathBuf::from(worktree.path.clone()),
            None => {
                return ServerMessage::new(ServerMessagePayload::Error(Error {
                    code: "WORKTREE_NOT_FOUND".to_string(),
                    message: format!("Worktree {} not found", worktree_id),
                    details: None,
                }));
            }
        }
    };

    match state
        .git_ops
        .diff(worktree_id, repo_path.as_path(), file_path)
        .await
    {
        Ok(result) => ServerMessage::new(ServerMessagePayload::GitDiffResult(result)),
        Err(e) => ServerMessage::new(ServerMessagePayload::Error(Error {
            code: "GIT_DIFF_ERROR".to_string(),
            message: e.to_string(),
            details: None,
        })),
    }
}

#[instrument(skip(state))]
async fn handle_git_commit(state: Arc<AppState>, msg: crate::protocol::GitCommit) -> ServerMessage {
    let worktree_id = msg.worktree_id;
    let message = msg.message;
    let files = msg.files;

    let repo_path = {
        let worktrees = state.worktrees.read().await;
        match worktrees.get(&worktree_id) {
            Some(worktree) => std::path::PathBuf::from(worktree.path.clone()),
            None => {
                return ServerMessage::new(ServerMessagePayload::Error(Error {
                    code: "WORKTREE_NOT_FOUND".to_string(),
                    message: format!("Worktree {} not found", worktree_id),
                    details: None,
                }));
            }
        }
    };

    match state
        .git_ops
        .commit(worktree_id, repo_path.as_path(), &message, files)
        .await
    {
        Ok(result) => ServerMessage::new(ServerMessagePayload::Notification(
            crate::protocol::Notification {
                level: crate::protocol::NotificationLevel::Info,
                title: "Commit Created".to_string(),
                message: format!("Created commit {}", result),
            },
        )),
        Err(e) => ServerMessage::new(ServerMessagePayload::Error(Error {
            code: "GIT_COMMIT_ERROR".to_string(),
            message: e.to_string(),
            details: None,
        })),
    }
}

#[instrument(skip(state))]
async fn handle_create_pr(state: Arc<AppState>, msg: crate::protocol::CreatePR) -> ServerMessage {
    let worktree_id = msg.worktree_id;
    let title = msg.title;
    let body = msg.body.as_deref();

    let repo_path = {
        let worktrees = state.worktrees.read().await;
        match worktrees.get(&worktree_id) {
            Some(worktree) => std::path::PathBuf::from(worktree.path.clone()),
            None => {
                return ServerMessage::new(ServerMessagePayload::Error(Error {
                    code: "WORKTREE_NOT_FOUND".to_string(),
                    message: format!("Worktree {} not found", worktree_id),
                    details: None,
                }));
            }
        }
    };

    match state
        .git_ops
        .create_pr(worktree_id, repo_path.as_path(), &title, body)
        .await
    {
        Ok(result) => ServerMessage::new(ServerMessagePayload::Notification(
            crate::protocol::Notification {
                level: crate::protocol::NotificationLevel::Info,
                title: "Pull Request Created".to_string(),
                message: format!("PR created: {}", result),
            },
        )),
        Err(e) => ServerMessage::new(ServerMessagePayload::Error(Error {
            code: "CREATE_PR_ERROR".to_string(),
            message: e.to_string(),
            details: None,
        })),
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    use crate::protocol::{GetState, Ping};
    use crate::state::AppState;

    #[tokio::test]
    async fn test_route_ping_returns_pong() {
        let state = AppState::new_test().await;
        let client_id = Uuid::new_v4();

        let msg = ClientMessage::new(ClientMessagePayload::Ping(Ping { timestamp: 12345 }));
        let response = route_message(Arc::new(state), client_id, msg).await;

        assert!(response.is_some());
        let response = response.unwrap();
        match response.payload {
            ServerMessagePayload::Pong(pong) => {
                assert_eq!(pong.timestamp, 12345);
            }
            _ => panic!("Expected Pong response"),
        }
    }

    #[tokio::test]
    async fn test_route_get_state_returns_snapshot() {
        let state = AppState::new_test().await;
        let client_id = Uuid::new_v4();
        let request_id = Uuid::new_v4();

        let msg = ClientMessage::new(ClientMessagePayload::GetState(GetState { request_id }));
        let response = route_message(Arc::new(state), client_id, msg).await;

        assert!(response.is_some());
        let response = response.unwrap();
        match response.payload {
            ServerMessagePayload::StateSnapshot(snapshot) => {
                assert_eq!(snapshot.request_id, request_id);
                assert!(snapshot.workspaces.is_empty());
                assert!(snapshot.worktrees.is_empty());
            }
            _ => panic!("Expected StateSnapshot response"),
        }
    }

    #[tokio::test]
    async fn test_route_workspace_create_returns_workspace_created() {
        let state = AppState::new_test().await;
        let client_id = Uuid::new_v4();
        let temp_dir = tempfile::TempDir::new().expect("Failed to create temp dir");
        let root_path = temp_dir.path().to_string_lossy().to_string();

        let msg = ClientMessage::new(ClientMessagePayload::WorkspaceCreate(
            crate::protocol::WorkspaceCreate {
                name: "test".to_string(),
                root_path: root_path.clone(),
                color: None,
                icon: None,
                worktree_base_dir: None,
            },
        ));
        let response = route_message(Arc::new(state), client_id, msg).await;

        assert!(response.is_some());
        let response = response.unwrap();
        match response.payload {
            ServerMessagePayload::WorkspaceCreated(created) => {
                assert_eq!(created.workspace.name, "test");
                assert_eq!(created.workspace.root_path, root_path);
            }
            ServerMessagePayload::Error(err) => {
                assert_ne!(err.code, "NOT_IMPLEMENTED");
            }
            _ => panic!("Expected WorkspaceCreated or Error response"),
        }
    }
}
