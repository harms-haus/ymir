use super::*;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

fn test_roundtrip<T>(original: T)
where
    T: Serialize + for<'de> Deserialize<'de> + PartialEq + std::fmt::Debug,
{
    let encoded = rmp_serde::to_vec(&original).expect("Failed to encode");
    let decoded: T = rmp_serde::from_slice(&encoded).expect("Failed to decode");
    assert_eq!(original, decoded);
}

#[test]
fn test_protocol_version_constant() {
    assert_eq!(PROTOCOL_VERSION, 1);
}

#[test]
fn test_client_message_creation() {
    let payload = ClientMessagePayload::Ping(Ping { timestamp: 12345 });
    let msg = ClientMessage::new(payload.clone());
    assert_eq!(msg.version, PROTOCOL_VERSION);
    assert_eq!(msg.payload, payload);
}

#[test]
fn test_server_message_creation() {
    let payload = ServerMessagePayload::Pong(Pong { timestamp: 12345 });
    let msg = ServerMessage::new(payload.clone());
    assert_eq!(msg.version, PROTOCOL_VERSION);
    assert_eq!(msg.payload, payload);
}

#[test]
fn test_messagepack_roundtrip_client_message() {
    let original = ClientMessage::new(ClientMessagePayload::Ping(Ping { timestamp: 12345 }));
    let encoded = rmp_serde::to_vec(&original).expect("Failed to encode");
    let decoded: ClientMessage = rmp_serde::from_slice(&encoded).expect("Failed to decode");
    assert_eq!(original, decoded);
}

#[test]
fn test_messagepack_roundtrip_server_message() {
    let original = ServerMessage::new(ServerMessagePayload::Pong(Pong { timestamp: 12345 }));
    let encoded = rmp_serde::to_vec(&original).expect("Failed to encode");
    let decoded: ServerMessage = rmp_serde::from_slice(&encoded).expect("Failed to decode");
    assert_eq!(original, decoded);
}

#[test]
fn test_workspace_create_roundtrip() {
    let msg = ClientMessage::new(ClientMessagePayload::WorkspaceCreate(WorkspaceCreate {
        name: "test-workspace".to_string(),
        root_path: "/path/to/workspace".to_string(),
        color: Some("#ff0000".to_string()),
        icon: Some("folder".to_string()),
        worktree_base_dir: Some(".worktrees".to_string()),
    }));
    test_roundtrip(msg);
}

#[test]
fn test_workspace_delete_roundtrip() {
    let msg = ClientMessage::new(ClientMessagePayload::WorkspaceDelete(WorkspaceDelete {
        workspace_id: Uuid::new_v4(),
    }));
    test_roundtrip(msg);
}

#[test]
fn test_workspace_rename_roundtrip() {
    let msg = ClientMessage::new(ClientMessagePayload::WorkspaceRename(WorkspaceRename {
        workspace_id: Uuid::new_v4(),
        new_name: "renamed-workspace".to_string(),
    }));
    test_roundtrip(msg);
}

#[test]
fn test_workspace_update_roundtrip() {
    let msg = ClientMessage::new(ClientMessagePayload::WorkspaceUpdate(WorkspaceUpdate {
        workspace_id: Uuid::new_v4(),
        color: Some("#00ff00".to_string()),
        icon: Some("code".to_string()),
        worktree_base_dir: Some("custom-worktrees".to_string()),
        settings: Some("{\"theme\":\"dark\"}".to_string()),
        request_id: Some(Uuid::new_v4()),
    }));
    test_roundtrip(msg);
}

#[test]
fn test_worktree_create_roundtrip() {
    let msg = ClientMessage::new(ClientMessagePayload::WorktreeCreate(WorktreeCreate {
        workspace_id: Uuid::new_v4(),
        branch_name: "feature-branch".to_string(),
        agent_type: Some("coder".to_string()),
        request_id: None,
        use_existing_branch: None,
    }));
    test_roundtrip(msg);
}

#[test]
fn test_worktree_delete_roundtrip() {
    let msg = ClientMessage::new(ClientMessagePayload::WorktreeDelete(WorktreeDelete {
        worktree_id: Uuid::new_v4(),
    }));
    test_roundtrip(msg);
}

#[test]
fn test_worktree_merge_roundtrip() {
    let msg = ClientMessage::new(ClientMessagePayload::WorktreeMerge(WorktreeMerge {
        worktree_id: Uuid::new_v4(),
        squash: true,
        delete_after: false,
    }));
    test_roundtrip(msg);
}

#[test]
fn test_worktree_list_roundtrip() {
    let msg = ClientMessage::new(ClientMessagePayload::WorktreeList(WorktreeList {
        workspace_id: Uuid::new_v4(),
    }));
    test_roundtrip(msg);
}

#[test]
fn test_agent_spawn_roundtrip() {
    let msg = ClientMessage::new(ClientMessagePayload::AgentSpawn(AgentSpawn {
        worktree_id: Uuid::new_v4(),
        agent_type: "test-agent".to_string(),
    }));
    test_roundtrip(msg);
}

#[test]
fn test_agent_send_roundtrip() {
    let msg = ClientMessage::new(ClientMessagePayload::AgentSend(AgentSend {
        worktree_id: Uuid::new_v4(),
        message: "Hello agent".to_string(),
    }));
    test_roundtrip(msg);
}

#[test]
fn test_agent_cancel_roundtrip() {
    let msg = ClientMessage::new(ClientMessagePayload::AgentCancel(AgentCancel {
        worktree_id: Uuid::new_v4(),
    }));
    test_roundtrip(msg);
}

#[test]
fn test_terminal_input_roundtrip() {
    let msg = ClientMessage::new(ClientMessagePayload::TerminalInput(TerminalInput {
        session_id: Uuid::new_v4(),
        data: "ls -la\n".to_string(),
    }));
    test_roundtrip(msg);
}

#[test]
fn test_terminal_resize_roundtrip() {
    let msg = ClientMessage::new(ClientMessagePayload::TerminalResize(TerminalResize {
        session_id: Uuid::new_v4(),
        cols: 120,
        rows: 40,
    }));
    test_roundtrip(msg);
}

#[test]
fn test_terminal_create_roundtrip() {
    let msg = ClientMessage::new(ClientMessagePayload::TerminalCreate(TerminalCreate {
        worktree_id: Uuid::new_v4(),
        label: Some("main-terminal".to_string()),
        shell: Some("/bin/bash".to_string()),
    }));
    test_roundtrip(msg);
}

#[test]
fn test_file_read_roundtrip() {
    let msg = ClientMessage::new(ClientMessagePayload::FileRead(FileRead {
        worktree_id: Uuid::new_v4(),
        path: "src/main.rs".to_string(),
    }));
    test_roundtrip(msg);
}

#[test]
fn test_file_write_roundtrip() {
    let msg = ClientMessage::new(ClientMessagePayload::FileWrite(FileWrite {
        worktree_id: Uuid::new_v4(),
        path: "src/main.rs".to_string(),
        content: "fn main() {}".to_string(),
    }));
    test_roundtrip(msg);
}

#[test]
fn test_git_status_roundtrip() {
    let msg = ClientMessage::new(ClientMessagePayload::GitStatus(GitStatus {
        worktree_id: Uuid::new_v4(),
    }));
    test_roundtrip(msg);
}

#[test]
fn test_git_diff_roundtrip() {
    let msg = ClientMessage::new(ClientMessagePayload::GitDiff(GitDiff {
        worktree_id: Uuid::new_v4(),
        file_path: Some("src/main.rs".to_string()),
    }));
    test_roundtrip(msg);
}

#[test]
fn test_git_commit_roundtrip() {
    let msg = ClientMessage::new(ClientMessagePayload::GitCommit(GitCommit {
        worktree_id: Uuid::new_v4(),
        message: "Initial commit".to_string(),
        files: Some(vec!["src/main.rs".to_string()]),
    }));
    test_roundtrip(msg);
}

#[test]
fn test_create_pr_roundtrip() {
    let msg = ClientMessage::new(ClientMessagePayload::CreatePR(CreatePR {
        worktree_id: Uuid::new_v4(),
        title: "Add new feature".to_string(),
        body: Some("This PR adds...".to_string()),
    }));
    test_roundtrip(msg);
}

#[test]
fn test_get_state_roundtrip() {
    let msg = ClientMessage::new(ClientMessagePayload::GetState(GetState {
        request_id: Uuid::new_v4(),
    }));
    test_roundtrip(msg);
}

#[test]
fn test_update_settings_roundtrip() {
    let msg = ClientMessage::new(ClientMessagePayload::UpdateSettings(UpdateSettings {
        key: "theme".to_string(),
        value: "dark".to_string(),
    }));
    test_roundtrip(msg);
}

#[test]
fn test_ping_roundtrip() {
    let msg = ClientMessage::new(ClientMessagePayload::Ping(Ping { timestamp: 12345 }));
    test_roundtrip(msg);
}

#[test]
fn test_state_snapshot_roundtrip() {
    let msg = ServerMessage::new(ServerMessagePayload::StateSnapshot(StateSnapshot {
        request_id: Uuid::new_v4(),
        workspaces: vec![],
        worktrees: vec![],
        agent_sessions: vec![],
        terminal_sessions: vec![],
        settings: vec![],
    }));
    test_roundtrip(msg);
}

#[test]
fn test_client_message_sizes_are_reasonable() {
    let test_cases = vec![
        (
            "Ping",
            ClientMessage::new(ClientMessagePayload::Ping(Ping { timestamp: 12345 })),
        ),
        (
            "WorkspaceCreate",
            ClientMessage::new(ClientMessagePayload::WorkspaceCreate(WorkspaceCreate {
                name: "test".to_string(),
                root_path: "/path".to_string(),
                color: None,
                icon: None,
                worktree_base_dir: None,
            })),
        ),
        (
            "AgentSpawn",
            ClientMessage::new(ClientMessagePayload::AgentSpawn(AgentSpawn {
                worktree_id: Uuid::new_v4(),
                agent_type: "test".to_string(),
            })),
        ),
    ];

    for (name, msg) in test_cases {
        let encoded = rmp_serde::to_vec(&msg).expect("Failed to encode");
        let size_kb = encoded.len() as f64 / 1024.0;
        assert!(
            size_kb < 1.0,
            "Client message '{}' is too large: {:.2}KB (max 1KB)",
            name,
            size_kb
        );
    }
}

#[test]
fn test_server_message_sizes_are_reasonable() {
    let test_cases = vec![
        (
            "Pong",
            ServerMessage::new(ServerMessagePayload::Pong(Pong { timestamp: 12345 })),
        ),
        (
            "StateSnapshot",
            ServerMessage::new(ServerMessagePayload::StateSnapshot(StateSnapshot {
                request_id: Uuid::new_v4(),
                workspaces: vec![],
                worktrees: vec![],
                agent_sessions: vec![],
                terminal_sessions: vec![],
                settings: vec![],
            })),
        ),
        (
            "Error",
            ServerMessage::new(ServerMessagePayload::Error(Error {
                code: "TEST".to_string(),
                message: "Test error".to_string(),
                details: None,
                request_id: None,
            })),
        ),
    ];

    for (name, msg) in test_cases {
        let encoded = rmp_serde::to_vec(&msg).expect("Failed to encode");
        let size_kb = encoded.len() as f64 / 1024.0;
        assert!(
            size_kb < 1.0,
            "Server message '{}' is too large: {:.2}KB (max 1KB)",
            name,
            size_kb
        );
    }
}

#[test]
fn test_workspace_deleted_roundtrip() {
    let msg = ServerMessage::new(ServerMessagePayload::WorkspaceDeleted(WorkspaceDeleted {
        workspace_id: Uuid::new_v4(),
    }));
    test_roundtrip(msg);
}

#[test]
fn test_workspace_updated_roundtrip() {
    let msg = ServerMessage::new(ServerMessagePayload::WorkspaceUpdated(WorkspaceUpdated {
        workspace: WorkspaceData {
            id: Uuid::new_v4(),
            name: "test".to_string(),
            root_path: "/path".to_string(),
            color: None,
            icon: None,
            worktree_base_dir: None,
            settings: None,
            created_at: 0,
            updated_at: 0,
        },
    }));
    test_roundtrip(msg);
}

#[test]
fn test_worktree_created_roundtrip() {
    let msg = ServerMessage::new(ServerMessagePayload::WorktreeCreated(WorktreeCreated {
        worktree: WorktreeData {
            id: Uuid::new_v4(),
            workspace_id: Uuid::new_v4(),
            branch_name: "main".to_string(),
            path: "/path".to_string(),
            status: "active".to_string(),
            created_at: 0,
        },
    }));
    test_roundtrip(msg);
}

#[test]
fn test_worktree_deleted_roundtrip() {
    let msg = ServerMessage::new(ServerMessagePayload::WorktreeDeleted(WorktreeDeleted {
        worktree_id: Uuid::new_v4(),
    }));
    test_roundtrip(msg);
}

#[test]
fn test_worktree_status_roundtrip() {
    let msg = ServerMessage::new(ServerMessagePayload::WorktreeStatus(WorktreeStatus {
        worktree_id: Uuid::new_v4(),
        status: "active".to_string(),
    }));
    test_roundtrip(msg);
}

#[test]
fn test_agent_status_update_roundtrip() {
    let msg = ServerMessage::new(ServerMessagePayload::AgentStatusUpdate(AgentStatusUpdate {
        id: Uuid::new_v4(),
        worktree_id: Uuid::new_v4(),
        agent_type: "test-agent".to_string(),
        status: AgentStatus::Working,
        started_at: 12345,
    }));
    test_roundtrip(msg);
}

#[test]
fn test_agent_output_roundtrip() {
    let msg = ServerMessage::new(ServerMessagePayload::AgentOutput(AgentOutput {
        worktree_id: Uuid::new_v4(),
        output: "Agent output".to_string(),
    }));
    test_roundtrip(msg);
}

#[test]
fn test_agent_prompt_roundtrip() {
    let msg = ServerMessage::new(ServerMessagePayload::AgentPrompt(AgentPrompt {
        worktree_id: Uuid::new_v4(),
        prompt: "Enter value:".to_string(),
    }));
    test_roundtrip(msg);
}

#[test]
fn test_terminal_output_roundtrip() {
    let msg = ServerMessage::new(ServerMessagePayload::TerminalOutput(TerminalOutput {
        session_id: Uuid::new_v4(),
        data: "terminal output".to_string(),
    }));
    test_roundtrip(msg);
}

#[test]
fn test_terminal_created_roundtrip() {
    let msg = ServerMessage::new(ServerMessagePayload::TerminalCreated(TerminalCreated {
        session_id: Uuid::new_v4(),
        worktree_id: Uuid::new_v4(),
        label: Some("term".to_string()),
        shell: "/bin/bash".to_string(),
    }));
    test_roundtrip(msg);
}

#[test]
fn test_terminal_removed_roundtrip() {
    let msg = ServerMessage::new(ServerMessagePayload::TerminalRemoved(TerminalRemoved {
        session_id: Uuid::new_v4(),
    }));
    test_roundtrip(msg);
}

#[test]
fn test_file_content_roundtrip() {
    let msg = ServerMessage::new(ServerMessagePayload::FileContent(FileContent {
        worktree_id: Uuid::new_v4(),
        path: "file.rs".to_string(),
        content: "content".to_string(),
    }));
    test_roundtrip(msg);
}

#[test]
fn test_git_status_result_roundtrip() {
    let msg = ServerMessage::new(ServerMessagePayload::GitStatusResult(GitStatusResult {
        worktree_id: Uuid::new_v4(),
        status: "clean".to_string(),
    }));
    test_roundtrip(msg);
}

#[test]
fn test_git_diff_result_roundtrip() {
    let msg = ServerMessage::new(ServerMessagePayload::GitDiffResult(GitDiffResult {
        worktree_id: Uuid::new_v4(),
        file_path: Some("file.rs".to_string()),
        diff: "diff output".to_string(),
    }));
    test_roundtrip(msg);
}

#[test]
fn test_error_roundtrip() {
    let msg = ServerMessage::new(ServerMessagePayload::Error(Error {
        code: "NOT_FOUND".to_string(),
        message: "Resource not found".to_string(),
        details: Some("Additional details".to_string()),
        request_id: None,
    }));
    test_roundtrip(msg);
}

#[test]
fn test_pong_roundtrip() {
    let msg = ServerMessage::new(ServerMessagePayload::Pong(Pong { timestamp: 12345 }));
    test_roundtrip(msg);
}

#[test]
fn test_notification_roundtrip() {
    let msg = ServerMessage::new(ServerMessagePayload::Notification(Notification {
        level: NotificationLevel::Info,
        title: "Info".to_string(),
        message: "Message".to_string(),
    }));
    test_roundtrip(msg);
}

#[test]
fn test_acp_correlation_id_roundtrip() {
    let id = AcpCorrelationId("corr-123".to_string());
    let encoded = rmp_serde::to_vec(&id).expect("Failed to encode");
    let decoded: AcpCorrelationId = rmp_serde::from_slice(&encoded).expect("Failed to decode");
    assert_eq!(id, decoded);
}

#[test]
fn test_acp_event_envelope_roundtrip() {
    let envelope = AcpEventEnvelope {
        sequence: 1,
        correlation_id: Some(AcpCorrelationId("corr-123".to_string())),
        timestamp: 1234567890,
        event: AcpEvent::SessionInit(AcpSessionInit {
            acp_session_id: "session-123".to_string(),
            capabilities: AcpAgentCapabilities {
                supports_tool_use: true,
                supports_context_update: true,
                supports_cancellation: true,
            },
        }),
    };
    test_roundtrip(envelope);
}

#[test]
fn test_acp_session_init_roundtrip() {
    let event = AcpSessionInit {
        acp_session_id: "session-123".to_string(),
        capabilities: AcpAgentCapabilities {
            supports_tool_use: true,
            supports_context_update: false,
            supports_cancellation: true,
        },
    };
    test_roundtrip(event);
}

#[test]
fn test_acp_session_status_event_roundtrip() {
    let event = AcpSessionStatusEvent {
        worktree_id: Uuid::new_v4(),
        acp_session_id: "session-123".to_string(),
        status: AcpSessionStatus::Working,
    };
    test_roundtrip(event);
}

#[test]
fn test_acp_prompt_chunk_text_roundtrip() {
    let event = AcpPromptChunk {
        worktree_id: Uuid::new_v4(),
        acp_session_id: "session-123".to_string(),
        content: AcpChunkContent::Text("Hello, world!".to_string()),
        is_final: false,
    };
    test_roundtrip(event);
}

#[test]
fn test_acp_prompt_chunk_structured_roundtrip() {
    let event = AcpPromptChunk {
        worktree_id: Uuid::new_v4(),
        acp_session_id: "session-123".to_string(),
        content: AcpChunkContent::Structured(r#"{"key":"value"}"#.to_string()),
        is_final: true,
    };
    test_roundtrip(event);
}

#[test]
fn test_acp_prompt_complete_roundtrip() {
    let event = AcpPromptComplete {
        worktree_id: Uuid::new_v4(),
        acp_session_id: "session-123".to_string(),
        reason: AcpPromptCompleteReason::Normal,
    };
    test_roundtrip(event);
}

#[test]
fn test_acp_tool_use_event_roundtrip() {
    let event = AcpToolUseEvent {
        worktree_id: Uuid::new_v4(),
        acp_session_id: "session-123".to_string(),
        tool_use_id: "tool-1".to_string(),
        tool_name: "read_file".to_string(),
        status: AcpToolUseStatus::Started,
        input: Some(r#"{"path":"test.ts"}"#.to_string()),
        output: None,
        error: None,
    };
    test_roundtrip(event);
}

#[test]
fn test_acp_context_update_roundtrip() {
    let event = AcpContextUpdate {
        worktree_id: Uuid::new_v4(),
        acp_session_id: "session-123".to_string(),
        update_type: AcpContextUpdateType::FileRead,
        data: r#"{"path":"test.ts"}"#.to_string(),
    };
    test_roundtrip(event);
}

#[test]
fn test_acp_error_roundtrip() {
    let event = AcpError {
        worktree_id: Some(Uuid::new_v4()),
        acp_session_id: Some("session-123".to_string()),
        code: AcpErrorCode::AgentCrash,
        message: "Agent process crashed".to_string(),
        details: Some(r#"{"exitCode":1}"#.to_string()),
        recoverable: false,
    };
    test_roundtrip(event);
}

#[test]
fn test_acp_resume_marker_roundtrip() {
    let marker = AcpResumeMarker {
        worktree_id: Uuid::new_v4(),
        acp_session_id: "session-123".to_string(),
        last_sequence: 42,
        checkpoint: Some("base64-checkpoint".to_string()),
    };
    test_roundtrip(marker);
}

#[test]
fn test_acp_resume_request_roundtrip() {
    let request = AcpResumeRequest {
        worktree_id: Uuid::new_v4(),
        acp_session_id: "session-123".to_string(),
        from_sequence: 10,
    };
    test_roundtrip(request);
}

#[test]
fn test_acp_ack_roundtrip() {
    let ack = AcpAck {
        worktree_id: Uuid::new_v4(),
        acp_session_id: "session-123".to_string(),
        last_sequence: 42,
    };
    test_roundtrip(ack);
}

#[test]
fn test_acp_event_variants_roundtrip() {
    let events = vec![
        AcpEvent::SessionInit(AcpSessionInit {
            acp_session_id: "s1".to_string(),
            capabilities: AcpAgentCapabilities {
                supports_tool_use: true,
                supports_context_update: true,
                supports_cancellation: true,
            },
        }),
        AcpEvent::SessionStatus(AcpSessionStatusEvent {
            worktree_id: Uuid::new_v4(),
            acp_session_id: "s1".to_string(),
            status: AcpSessionStatus::Working,
        }),
        AcpEvent::PromptChunk(AcpPromptChunk {
            worktree_id: Uuid::new_v4(),
            acp_session_id: "s1".to_string(),
            content: AcpChunkContent::Text("test".to_string()),
            is_final: true,
        }),
        AcpEvent::PromptComplete(AcpPromptComplete {
            worktree_id: Uuid::new_v4(),
            acp_session_id: "s1".to_string(),
            reason: AcpPromptCompleteReason::Normal,
        }),
        AcpEvent::ToolUse(AcpToolUseEvent {
            worktree_id: Uuid::new_v4(),
            acp_session_id: "s1".to_string(),
            tool_use_id: "t1".to_string(),
            tool_name: "test".to_string(),
            status: AcpToolUseStatus::Completed,
            input: None,
            output: Some("result".to_string()),
            error: None,
        }),
        AcpEvent::ContextUpdate(AcpContextUpdate {
            worktree_id: Uuid::new_v4(),
            acp_session_id: "s1".to_string(),
            update_type: AcpContextUpdateType::FileWritten,
            data: "{}".to_string(),
        }),
        AcpEvent::Error(AcpError {
            worktree_id: None,
            acp_session_id: None,
            code: AcpErrorCode::Internal,
            message: "error".to_string(),
            details: None,
            recoverable: true,
        }),
        AcpEvent::ResumeMarker(AcpResumeMarker {
            worktree_id: Uuid::new_v4(),
            acp_session_id: "s1".to_string(),
            last_sequence: 1,
            checkpoint: None,
        }),
    ];

    for event in events {
        test_roundtrip(event);
    }
}
