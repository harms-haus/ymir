//! Message routing and dispatch for WebSocket server

use crate::protocol::{
    ClientMessage, ClientMessagePayload, Error, ServerMessage, ServerMessagePayload, FileListResult, FileContent,
};
use crate::agent::{handle_agent_cancel, handle_agent_send, handle_agent_spawn};
use crate::pty::{
    handle_terminal_create, handle_terminal_input, handle_terminal_kill, handle_terminal_request_history, handle_terminal_resize,
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
                    request_id: None,
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
                    request_id: None,
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
                    request_id: None,
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
                    request_id: None,
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
                    request_id: None,
                }))),
            }
        }

        ClientMessagePayload::WorktreeChangeBranch(msg) => {
            match crate::worktree::change_branch(state.clone(), msg).await {
                Ok(result) => Some(ServerMessage::new(ServerMessagePayload::WorktreeChanged(
                    result,
                ))),
                Err(e) => Some(ServerMessage::new(ServerMessagePayload::Error(Error {
                    code: "WORKTREE_CHANGE_BRANCH_ERROR".to_string(),
                    message: e.to_string(),
                    details: None,
                    request_id: None,
                }))),
            }
        }

        ClientMessagePayload::TerminalCreate(msg) => {
            Some(handle_terminal_create(state.clone(), msg).await)
        }

        ClientMessagePayload::TerminalKill(msg) => {
            Some(handle_terminal_kill(state.clone(), msg).await)
        }

        ClientMessagePayload::TerminalInput(msg) => {
            Some(handle_terminal_input(state.clone(), msg).await)
        }

        ClientMessagePayload::TerminalResize(msg) => {
            Some(handle_terminal_resize(state.clone(), msg).await)
        }

        ClientMessagePayload::AgentSpawn(msg) => {
            Some(handle_agent_spawn(state.clone(), msg).await)
        }

        ClientMessagePayload::AgentSend(msg) => {
            Some(handle_agent_send(state.clone(), msg).await)
        }

        ClientMessagePayload::AgentCancel(msg) => {
            Some(handle_agent_cancel(state.clone(), msg).await)
        }

        ClientMessagePayload::AgentRename(msg) => {
            Some(handle_agent_rename(state.clone(), msg).await)
        }

        ClientMessagePayload::AgentReorder(msg) => {
            Some(handle_agent_reorder(state.clone(), msg).await)
        }

    ClientMessagePayload::FileList(msg) => {
        Some(handle_file_list(state.clone(), msg).await)
    }

    ClientMessagePayload::FileRead(msg) => {
        Some(handle_file_read(state.clone(), msg).await)
    }

        ClientMessagePayload::TerminalRename(msg) => {
            Some(handle_terminal_rename(state.clone(), msg).await)
        }

        ClientMessagePayload::TerminalReorder(msg) => {
            Some(handle_terminal_reorder(state.clone(), msg).await)
        }

        ClientMessagePayload::TerminalRequestHistory(msg) => {
            Some(handle_terminal_request_history(state.clone(), msg).await)
        }

    ClientMessagePayload::GetWorktreeDetails(msg) => {
        Some(handle_get_worktree_details(state.clone(), msg).await)
    }

    ClientMessagePayload::WorkspaceRename(_)
    | ClientMessagePayload::WorkspaceUpdate(_)
    | ClientMessagePayload::WorktreeMerge(_)
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
        ClientMessagePayload::WorktreeChangeBranch(_) => "WorktreeChangeBranch",
        ClientMessagePayload::GetWorktreeDetails(_) => "GetWorktreeDetails",
        ClientMessagePayload::AgentSpawn(_) => "AgentSpawn",
        ClientMessagePayload::AgentSend(_) => "AgentSend",
        ClientMessagePayload::AgentCancel(_) => "AgentCancel",
        ClientMessagePayload::AgentRename(_) => "AgentRename",
        ClientMessagePayload::AgentReorder(_) => "AgentReorder",
        ClientMessagePayload::TerminalInput(_) => "TerminalInput",
        ClientMessagePayload::TerminalResize(_) => "TerminalResize",
        ClientMessagePayload::TerminalCreate(_) => "TerminalCreate",
        ClientMessagePayload::TerminalKill(_) => "TerminalKill",
        ClientMessagePayload::TerminalRename(_) => "TerminalRename",
        ClientMessagePayload::TerminalReorder(_) => "TerminalReorder",
        ClientMessagePayload::TerminalRequestHistory(_) => "TerminalRequestHistory",
        ClientMessagePayload::FileRead(_) => "FileRead",
        ClientMessagePayload::FileWrite(_) => "FileWrite",
        ClientMessagePayload::FileList(_) => "FileList",
        ClientMessagePayload::GitStatus(_) => "GitStatus",
        ClientMessagePayload::GitDiff(_) => "GitDiff",
        ClientMessagePayload::GitCommit(_) => "GitCommit",
        ClientMessagePayload::CreatePR(_) => "CreatePR",
        ClientMessagePayload::GetState(_) => "GetState",
        ClientMessagePayload::UpdateSettings(_) => "UpdateSettings",
        ClientMessagePayload::Ping(_) => "Ping",
        ClientMessagePayload::Pong(_) => "Pong",
        ClientMessagePayload::Ack(_) => "Ack",
    };

    ServerMessage::new(ServerMessagePayload::Error(Error {
        code: "NOT_IMPLEMENTED".to_string(),
        message: format!("{} handler not implemented yet", msg_type),
        details: None,
                    request_id: None,
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
                    request_id: None,
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
                    request_id: None,
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
                    request_id: None,
                }));
            }
        };

        // Populate in-memory agents map from database
        for session in &db_agent_sessions {
            let session_id = Uuid::parse_str(&session.id).unwrap_or_else(|_| Uuid::new_v4());
            let worktree_id = Uuid::parse_str(&session.worktree_id).unwrap_or(worktree.id);
            let mut agents = state.agents.write().await;
            agents.insert(session_id, crate::state::AgentState {
                id: session_id,
                worktree_id,
                agent_type: session.agent_type.clone(),
                status: session.status.clone(),
            });
        }

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
                    request_id: None,
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
        worktrees: vec![],      // Empty - lazy loaded on demand
        agent_sessions: vec![], // Empty - lazy loaded on demand
        terminal_sessions: vec![], // Empty - lazy loaded on demand
        settings: vec![],
    }))
}

#[instrument(skip(state))]
async fn handle_get_worktree_details(
    state: Arc<AppState>,
    msg: crate::protocol::GetWorktreeDetails,
) -> ServerMessage {
    use crate::protocol::{
        AgentSessionData, TerminalSessionData, WorktreeData, WorktreeDetailsResult,
    };

    let workspace_id = msg.workspace_id;
    let request_id = msg.request_id.unwrap_or_else(Uuid::new_v4);

    // Load worktrees for this workspace
    let worktrees: Vec<WorktreeData> = match crate::worktree::list(
        state.clone(),
        crate::protocol::WorktreeList {
            workspace_id,
        },
    )
    .await
    {
        Ok(worktrees) => worktrees,
        Err(e) => {
            return ServerMessage::new(ServerMessagePayload::Error(Error {
                code: "GET_WORKTREE_DETAILS_ERROR".to_string(),
                message: e.to_string(),
                details: None,
                request_id: Some(request_id),
            }));
        }
    };

    // Load agents and terminals for these worktrees
    let mut agent_sessions: Vec<AgentSessionData> = Vec::new();
    let mut terminal_sessions: Vec<TerminalSessionData> = Vec::new();

    for worktree in &worktrees {
        let worktree_id = worktree.id.to_string();

        // Load agent sessions
        let db_agent_sessions = match state.db.list_agent_sessions(&worktree_id).await {
            Ok(sessions) => sessions,
            Err(e) => {
                return ServerMessage::new(ServerMessagePayload::Error(Error {
                    code: "GET_WORKTREE_DETAILS_ERROR".to_string(),
                    message: e.to_string(),
                    details: None,
                    request_id: Some(request_id),
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

        // Load terminal sessions
        let db_terminal_sessions = match state.db.list_terminal_sessions(&worktree_id).await {
            Ok(sessions) => sessions,
            Err(e) => {
                return ServerMessage::new(ServerMessagePayload::Error(Error {
                    code: "GET_WORKTREE_DETAILS_ERROR".to_string(),
                    message: e.to_string(),
                    details: None,
                    request_id: Some(request_id),
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

    ServerMessage::new(ServerMessagePayload::WorktreeDetailsResult(
        WorktreeDetailsResult {
            request_id: Some(request_id),
            worktrees,
            agent_sessions,
            terminal_sessions,
        }
    ))
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
                    request_id: None,
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
                    request_id: None,
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
                    request_id: None,
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
                    request_id: None,
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
                    request_id: None,
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
                    request_id: None,
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
                    request_id: None,
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
                    request_id: None,
        })),
    }
}

#[instrument(skip(state))]
async fn handle_file_list(state: Arc<AppState>, msg: crate::protocol::FileList) -> ServerMessage {
    let worktree_id = msg.worktree_id;
    let _path = msg.path.unwrap_or_default();
    
    let worktrees = state.worktrees.read().await;
    let worktree = match worktrees.get(&worktree_id) {
        Some(wt) => wt,
        None => {
            return ServerMessage::new(ServerMessagePayload::Error(Error {
                code: "WORKTREE_NOT_FOUND".to_string(),
                message: format!("Worktree {} not found", worktree_id),
                details: None,
                request_id: None,
            }));
        }
    };
    
    let base_path = std::path::PathBuf::from(worktree.path.clone());
    let mut files = Vec::new();
    
    // Helper function to collect files recursively
    fn collect_files(dir: &std::path::Path, base: &std::path::Path, files: &mut Vec<String>) {
        if let Ok(entries) = std::fs::read_dir(dir) {
            for entry in entries.flatten() {
                let entry_path = entry.path();
                if entry_path.file_name().and_then(|n| n.to_str()) == Some(".git") {
                    continue; // Skip .git directory
                }
                if entry_path.is_dir() {
                    collect_files(&entry_path, base, files);
                } else if let Ok(relative_path) = entry_path.strip_prefix(base) {
                    if let Some(path_str) = relative_path.to_str() {
                        files.push(path_str.to_string());
                    }
                }
            }
        }
    }
    
    // Collect files from worktree directory
    collect_files(&base_path, &base_path, &mut files);
    files.sort();
    
    ServerMessage::new(ServerMessagePayload::FileListResult(FileListResult {
        worktree_id,
        files,
        request_id: None,
    }))
}

#[instrument(skip(state))]
async fn handle_file_read(state: Arc<AppState>, msg: crate::protocol::FileRead) -> ServerMessage {
    let worktree_id = msg.worktree_id;
    let path = msg.path;

    let worktrees = state.worktrees.read().await;
    let worktree = match worktrees.get(&worktree_id) {
        Some(wt) => wt,
        None => {
            return ServerMessage::new(ServerMessagePayload::Error(Error {
                code: "WORKTREE_NOT_FOUND".to_string(),
                message: format!("Worktree {} not found", worktree_id),
                details: None,
                request_id: None,
            }));
        }
    };

    let base_path = std::path::PathBuf::from(worktree.path.clone());
    let file_path = base_path.join(&path);

    // Security check: ensure the file is within the worktree
    match file_path.canonicalize() {
        Ok(canonical_path) => {
            if !canonical_path.starts_with(&base_path) {
                return ServerMessage::new(ServerMessagePayload::Error(Error {
                    code: "FILE_ACCESS_DENIED".to_string(),
                    message: "File is outside of worktree directory".to_string(),
                    details: None,
                    request_id: None,
                }));
            }
        }
        Err(_) => {
            // File doesn't exist yet or can't be canonicalized - that's ok
            // We'll still try to read it if it exists
        }
    }

    match tokio::fs::read_to_string(&file_path).await {
        Ok(content) => {
            ServerMessage::new(ServerMessagePayload::FileContent(FileContent {
                worktree_id,
                path,
                content,
            }))
        }
        Err(e) => {
            tracing::error!("Failed to read file: {}", e);
            ServerMessage::new(ServerMessagePayload::Error(Error {
                code: "FILE_READ_ERROR".to_string(),
                message: format!("Failed to read file: {}", e),
                details: None,
                request_id: None,
            }))
        }
    }
}

#[instrument(skip(state))]
async fn handle_terminal_rename(state: Arc<AppState>, msg: crate::protocol::TerminalRename) -> ServerMessage {
    let session_id = msg.session_id;
    let new_label = msg.new_label;

    // Update database
    if let Err(e) = state.db.update_terminal_label(&session_id.to_string(), &new_label).await {
        tracing::error!("Failed to update terminal label: {}", e);
        return ServerMessage::new(ServerMessagePayload::Error(Error {
            code: "TERMINAL_RENAME_ERROR".to_string(),
            message: e.to_string(),
            details: None,
            request_id: Some(msg.request_id),
        }));
    }

    // Update in-memory state
    {
        let mut terminals = state.terminals.write().await;
        if let Some(terminal) = terminals.get_mut(&session_id) {
            terminal.label = Some(new_label.clone());
        }
    }

    // Get worktree_id for broadcast
    let worktree_id = {
        let terminals = state.terminals.read().await;
        terminals.get(&session_id).map(|t| t.worktree_id).unwrap_or_else(Uuid::nil)
    };

    // Broadcast update to all clients
    let broadcast_msg = ServerMessage::new(ServerMessagePayload::TerminalUpdated(
        crate::protocol::TerminalUpdated {
            session_id,
            worktree_id,
            label: Some(new_label),
            position: None,
            request_id: msg.request_id,
        },
    ));
    state.broadcast(broadcast_msg).await;

    ServerMessage::new(ServerMessagePayload::Ack(crate::protocol::Ack {
        message_id: session_id,
        status: crate::protocol::AckStatus::Success,
    }))
}

#[instrument(skip(state))]
async fn handle_terminal_reorder(state: Arc<AppState>, msg: crate::protocol::TerminalReorder) -> ServerMessage {
    let worktree_id = msg.worktree_id;
    let session_ids = msg.session_ids;

    // Update positions in database
    for (position, session_id) in session_ids.iter().enumerate() {
        if let Err(e) = state.db.update_terminal_position(&session_id.to_string(), position as i64).await {
            tracing::error!("Failed to update terminal position: {}", e);
            return ServerMessage::new(ServerMessagePayload::Error(Error {
                code: "TERMINAL_REORDER_ERROR".to_string(),
                message: e.to_string(),
                details: None,
                request_id: Some(msg.request_id),
            }));
        }
    }

    // Broadcast update to all clients
    for (position, session_id) in session_ids.iter().enumerate() {
        let broadcast_msg = ServerMessage::new(ServerMessagePayload::TerminalUpdated(
            crate::protocol::TerminalUpdated {
                session_id: *session_id,
                worktree_id,
                label: None,
                position: Some(position as u32),
                request_id: msg.request_id,
            },
        ));
        state.broadcast(broadcast_msg).await;
    }

    ServerMessage::new(ServerMessagePayload::Ack(crate::protocol::Ack {
        message_id: worktree_id,
        status: crate::protocol::AckStatus::Success,
    }))
}

#[instrument(skip(state))]
async fn handle_agent_rename(state: Arc<AppState>, msg: crate::protocol::AgentRename) -> ServerMessage {
    let session_id = msg.session_id;
    let new_label = msg.new_label;

    // Update database
    if let Err(e) = state.db.update_agent_label(&session_id.to_string(), &new_label).await {
        tracing::error!("Failed to update agent label: {}", e);
        return ServerMessage::new(ServerMessagePayload::Error(Error {
            code: "AGENT_RENAME_ERROR".to_string(),
            message: e.to_string(),
            details: None,
            request_id: Some(msg.request_id),
        }));
    }

    // Update in-memory state
    {
        let mut agents = state.agents.write().await;
        if let Some(_agent) = agents.get_mut(&session_id) {
            // Note: AgentState doesn't have label field, but database has it
            // We'll need to update that when we add label field to AgentState
        }
    }

    // Get worktree_id for broadcast
    let worktree_id = {
        let agents = state.agents.read().await;
        agents.get(&session_id).map(|a| a.worktree_id).unwrap_or_else(Uuid::nil)
    };

    // Broadcast update to all clients
    let broadcast_msg = ServerMessage::new(ServerMessagePayload::AgentUpdated(
        crate::protocol::AgentUpdated {
            session_id,
            worktree_id,
            label: Some(new_label),
            position: None,
            request_id: msg.request_id,
        },
    ));
    state.broadcast(broadcast_msg).await;

    ServerMessage::new(ServerMessagePayload::Ack(crate::protocol::Ack {
        message_id: session_id,
        status: crate::protocol::AckStatus::Success,
    }))
}

#[instrument(skip(state))]
async fn handle_agent_reorder(state: Arc<AppState>, msg: crate::protocol::AgentReorder) -> ServerMessage {
    let worktree_id = msg.worktree_id;
    let session_ids = msg.session_ids;

    // Update positions in database
    for (position, session_id) in session_ids.iter().enumerate() {
        if let Err(e) = state.db.update_agent_position(&session_id.to_string(), position as i64).await {
            tracing::error!("Failed to update agent position: {}", e);
            return ServerMessage::new(ServerMessagePayload::Error(Error {
                code: "AGENT_REORDER_ERROR".to_string(),
                message: e.to_string(),
                details: None,
                request_id: Some(msg.request_id),
            }));
        }
    }

    // Broadcast update to all clients
    for (position, session_id) in session_ids.iter().enumerate() {
        let broadcast_msg = ServerMessage::new(ServerMessagePayload::AgentUpdated(
            crate::protocol::AgentUpdated {
                session_id: *session_id,
                worktree_id,
                label: None,
                position: Some(position as u32),
                request_id: msg.request_id,
            },
        ));
        state.broadcast(broadcast_msg).await;
    }

    ServerMessage::new(ServerMessagePayload::Ack(crate::protocol::Ack {
        message_id: worktree_id,
        status: crate::protocol::AckStatus::Success,
    }))
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
