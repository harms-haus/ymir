//! Message routing and dispatch for WebSocket server

use crate::hub::handle_pong;
use crate::protocol::{
    ClientMessage, ClientMessagePayload, Error, ServerMessage, ServerMessagePayload,
};
use crate::state::AppState;
use std::sync::Arc;
use uuid::Uuid;

/// Route a client message to the appropriate handler
pub async fn route_message(
    state: Arc<AppState>,
    client_id: Uuid,
    message: ClientMessage,
) -> Option<ServerMessage> {
    let response = match message.payload {
        ClientMessagePayload::Ping(ping) => {
            Some(ServerMessage::new(ServerMessagePayload::Pong(crate::protocol::Pong {
                timestamp: ping.timestamp,
            })))
        }
        ClientMessagePayload::Pong(pong) => {
            handle_pong(state, client_id, pong.timestamp).await;
            None
        }

        ClientMessagePayload::GetState(get_state) => {
            Some(handle_get_state(state.clone(), get_state.request_id).await)
        }

        ClientMessagePayload::WorkspaceCreate(msg) => {
            match crate::workspace::create(state.clone(), msg).await {
                Ok(result) => Some(ServerMessage::new(ServerMessagePayload::WorkspaceCreated(result))),
                Err(e) => Some(ServerMessage::new(ServerMessagePayload::Error(Error {
                    code: "WORKSPACE_CREATE_ERROR".to_string(),
                    message: e.to_string(),
                    details: None,
                }))),
            }
        }
        
        ClientMessagePayload::WorkspaceDelete(msg) => {
            match crate::workspace::delete(state.clone(), msg).await {
                Ok(result) => Some(ServerMessage::new(ServerMessagePayload::WorkspaceDeleted(result))),
                Err(e) => Some(ServerMessage::new(ServerMessagePayload::Error(Error {
                    code: "WORKSPACE_DELETE_ERROR".to_string(),
                    message: e.to_string(),
                    details: None,
                }))),
            }
        }
        
        ClientMessagePayload::WorktreeCreate(msg) => {
            match crate::worktree::create(state.clone(), msg).await {
                Ok(result) => Some(ServerMessage::new(ServerMessagePayload::WorktreeCreated(result))),
                Err(e) => Some(ServerMessage::new(ServerMessagePayload::Error(Error {
                    code: "WORKTREE_CREATE_ERROR".to_string(),
                    message: e.to_string(),
                    details: None,
                }))),
            }
        }
        
        ClientMessagePayload::WorktreeDelete(msg) => {
            match crate::worktree::delete(state.clone(), msg).await {
                Ok(result) => Some(ServerMessage::new(ServerMessagePayload::WorktreeDeleted(result))),
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
                Ok(worktrees) => Some(ServerMessage::new(ServerMessagePayload::WorktreeStatus(
                    crate::protocol::WorktreeStatus {
                        worktree_id: workspace_id,
                        status: format!("Found {} worktrees", worktrees.len()),
                    }
                ))),
                Err(e) => Some(ServerMessage::new(ServerMessagePayload::Error(Error {
                    code: "WORKTREE_LIST_ERROR".to_string(),
                    message: e.to_string(),
                    details: None,
                }))),
            }
        }
        ClientMessagePayload::WorkspaceRename(_) | ClientMessagePayload::WorkspaceUpdate(_) | ClientMessagePayload::WorktreeMerge(_) | ClientMessagePayload::AgentSpawn(_) | ClientMessagePayload::AgentSend(_) | ClientMessagePayload::AgentCancel(_) | ClientMessagePayload::TerminalInput(_) | ClientMessagePayload::TerminalResize(_) | ClientMessagePayload::TerminalCreate(_) | ClientMessagePayload::FileRead(_) | ClientMessagePayload::FileWrite(_) | ClientMessagePayload::UpdateSettings(_) => Some(not_implemented(message.payload)),
        
        ClientMessagePayload::GitStatus(msg) => {
            Some(handle_git_status(state.clone(), msg).await)
        }
        
        ClientMessagePayload::GitDiff(msg) => {
            Some(handle_git_diff(state.clone(), msg).await)
        }
        
        ClientMessagePayload::GitCommit(msg) => {
            Some(handle_git_commit(state.clone(), msg).await)
        }
        
        ClientMessagePayload::CreatePR(msg) => {
            Some(handle_create_pr(state.clone(), msg).await)
        }
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
        _ => "Unknown",
    };

    ServerMessage::new(ServerMessagePayload::Error(Error {
        code: "NOT_IMPLEMENTED".to_string(),
        message: format!("{} handler not implemented yet", msg_type),
        details: None,
    }))
}

async fn handle_get_state(state: Arc<AppState>, request_id: Uuid) -> ServerMessage {
    use crate::protocol::{StateSnapshot, WorkspaceData, WorktreeData, AgentSessionData, TerminalSessionData};

    let workspaces: Vec<WorkspaceData> = state
        .workspaces
        .read()
        .await
        .values()
        .map(|ws| WorkspaceData {
            id: ws.id,
            name: ws.name.clone(),
            root_path: ws.root_path.clone(),
            color: ws.color.clone(),
            icon: ws.icon.clone(),
            worktree_base_dir: ws.worktree_base_dir.clone(),
            settings: None,
            created_at: 0,
            updated_at: 0,
        })
        .collect();

    let worktrees: Vec<WorktreeData> = state
        .worktrees
        .read()
        .await
        .values()
        .map(|wt| WorktreeData {
            id: wt.id,
            workspace_id: wt.workspace_id,
            branch_name: wt.branch_name.clone(),
            path: wt.path.clone(),
            status: wt.status.clone(),
            created_at: 0,
        })
        .collect();

    let agent_sessions: Vec<AgentSessionData> = state
        .agents
        .read()
        .await
        .values()
        .map(|a| AgentSessionData {
            id: a.id,
            worktree_id: a.worktree_id,
            agent_type: a.agent_type.clone(),
            acp_session_id: None,
            status: crate::protocol::AgentStatus::Idle,
            started_at: 0,
        })
        .collect();

    let terminal_sessions: Vec<TerminalSessionData> = state
        .terminals
        .read()
        .await
        .values()
        .map(|t| TerminalSessionData {
            id: t.id,
            worktree_id: t.worktree_id,
            label: t.label.clone(),
            shell: t.shell.clone(),
            created_at: 0,
        })
        .collect();

    ServerMessage::new(ServerMessagePayload::StateSnapshot(StateSnapshot {
        request_id,
        workspaces,
        worktrees,
        agent_sessions,
        terminal_sessions,
        settings: vec![],
    }))
}


async fn handle_git_status(
    state: Arc<AppState>,
    msg: crate::protocol::GitStatus,
) -> ServerMessage {
    let worktree_id = msg.worktree_id;
    
    let worktrees = state.worktrees.read().await;
    let worktree = match worktrees.get(&worktree_id) {
        Some(wt) => wt,
        None => {
            return ServerMessage::new(ServerMessagePayload::Error(Error {
                code: "WORKTREE_NOT_FOUND".to_string(),
                message: format!("Worktree {} not found", worktree_id),
                details: None,
            }));
        }
    };
    
    let repo_path = std::path::Path::new(&worktree.path);
    
    match state.git_ops.status(worktree_id, repo_path).await {
        Ok(result) => ServerMessage::new(ServerMessagePayload::GitStatusResult(result)),
        Err(e) => ServerMessage::new(ServerMessagePayload::Error(Error {
            code: "GIT_STATUS_ERROR".to_string(),
            message: e.to_string(),
            details: None,
        })),
    }
}

async fn handle_git_diff(
    state: Arc<AppState>,
    msg: crate::protocol::GitDiff,
) -> ServerMessage {
    let worktree_id = msg.worktree_id;
    let file_path = msg.file_path.as_deref();
    
    let worktrees = state.worktrees.read().await;
    let worktree = match worktrees.get(&worktree_id) {
        Some(wt) => wt,
        None => {
            return ServerMessage::new(ServerMessagePayload::Error(Error {
                code: "WORKTREE_NOT_FOUND".to_string(),
                message: format!("Worktree {} not found", worktree_id),
                details: None,
            }));
        }
    };
    
    let repo_path = std::path::Path::new(&worktree.path);
    
    match state.git_ops.diff(worktree_id, repo_path, file_path).await {
        Ok(result) => ServerMessage::new(ServerMessagePayload::GitDiffResult(result)),
        Err(e) => ServerMessage::new(ServerMessagePayload::Error(Error {
            code: "GIT_DIFF_ERROR".to_string(),
            message: e.to_string(),
            details: None,
        })),
    }
}

async fn handle_git_commit(
    state: Arc<AppState>,
    msg: crate::protocol::GitCommit,
) -> ServerMessage {
    let worktree_id = msg.worktree_id;
    let message = msg.message;
    let files = msg.files;
    
    let worktrees = state.worktrees.read().await;
    let worktree = match worktrees.get(&worktree_id) {
        Some(wt) => wt,
        None => {
            return ServerMessage::new(ServerMessagePayload::Error(Error {
                code: "WORKTREE_NOT_FOUND".to_string(),
                message: format!("Worktree {} not found", worktree_id),
                details: None,
            }));
        }
    };
    
    let repo_path = std::path::Path::new(&worktree.path);
    
    match state.git_ops.commit(worktree_id, repo_path, &message, files).await {
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

async fn handle_create_pr(
    state: Arc<AppState>,
    msg: crate::protocol::CreatePR,
) -> ServerMessage {
    let worktree_id = msg.worktree_id;
    let title = msg.title;
    let body = msg.body.as_deref();
    
    let worktrees = state.worktrees.read().await;
    let worktree = match worktrees.get(&worktree_id) {
        Some(wt) => wt,
        None => {
            return ServerMessage::new(ServerMessagePayload::Error(Error {
                code: "WORKTREE_NOT_FOUND".to_string(),
                message: format!("Worktree {} not found", worktree_id),
                details: None,
            }));
        }
    };
    
    let repo_path = std::path::Path::new(&worktree.path);
    
    match state.git_ops.create_pr(worktree_id, repo_path, &title, body).await {
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
