//! MessagePack protocol types for Ymir WebSocket communication
//!
//! This module defines all message types for the Ymir protocol, including
//! client-to-server requests, server-to-client responses, and bidirectional messages.
//! All messages include a version header for protocol compatibility.

use serde::{Deserialize, Deserializer, Serialize, Serializer};
use uuid::Uuid;

mod uuid_str {
    use super::*;
    use std::str::FromStr;

    pub fn serialize<S>(uuid: &Uuid, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        serializer.serialize_str(&uuid.hyphenated().to_string())
    }

    pub fn deserialize<'de, D>(deserializer: D) -> Result<Uuid, D::Error>
    where
        D: Deserializer<'de>,
    {
        let s = String::deserialize(deserializer)?;
        Uuid::from_str(&s).map_err(serde::de::Error::custom)
    }
}

/// Protocol version for message compatibility
pub const PROTOCOL_VERSION: u32 = 1;

/// Wrapper for all client-to-server messages with version header
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ClientMessage {
    pub version: u32,
    #[serde(flatten)]
    pub payload: ClientMessagePayload,
}

/// Wrapper for all server-to-client messages with version header
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ServerMessage {
    pub version: u32,
    #[serde(flatten)]
    pub payload: ServerMessagePayload,
}

/// All client-to-server message types
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(tag = "type", content = "data")]
pub enum ClientMessagePayload {
    WorkspaceCreate(WorkspaceCreate),
    WorkspaceDelete(WorkspaceDelete),
    WorkspaceRename(WorkspaceRename),
    WorkspaceUpdate(WorkspaceUpdate),
    WorktreeCreate(WorktreeCreate),
    WorktreeDelete(WorktreeDelete),
    WorktreeMerge(WorktreeMerge),
    WorktreeList(WorktreeList),
    AgentSpawn(AgentSpawn),
    AgentSend(AgentSend),
    AgentCancel(AgentCancel),
    TerminalInput(TerminalInput),
    TerminalResize(TerminalResize),
    TerminalCreate(TerminalCreate),
    FileRead(FileRead),
    FileWrite(FileWrite),
    GitStatus(GitStatus),
    GitDiff(GitDiff),
    GitCommit(GitCommit),
    CreatePR(CreatePR),
    GetState(GetState),
    UpdateSettings(UpdateSettings),
    Ping(Ping),
    Pong(Pong),
    Ack(Ack),
}

/// All server-to-client message types
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(tag = "type", content = "data")]
pub enum ServerMessagePayload {
    StateSnapshot(StateSnapshot),
    WorkspaceCreated(WorkspaceCreated),
    WorkspaceDeleted(WorkspaceDeleted),
    WorkspaceUpdated(WorkspaceUpdated),
    WorktreeCreated(WorktreeCreated),
    WorktreeDeleted(WorktreeDeleted),
    WorktreeListResult(WorktreeListResult),
    WorktreeStatus(WorktreeStatus),
    AgentStatusUpdate(AgentStatusUpdate),
    AgentOutput(AgentOutput),
    AgentPrompt(AgentPrompt),
    TerminalOutput(TerminalOutput),
    TerminalCreated(TerminalCreated),
    FileContent(FileContent),
    GitStatusResult(GitStatusResult),
    GitDiffResult(GitDiffResult),
    Error(Error),
    Ping(Ping),
    Pong(Pong),
    Notification(Notification),
    Ack(Ack),
}

/// Bidirectional messages (can be sent by either side)
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Ack {
    pub message_id: Uuid,
    pub status: AckStatus,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum AckStatus {
    Success,
    Error(String),
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct WorkspaceCreate {
    pub name: String,
    pub root_path: String,
    pub color: Option<String>,
    pub icon: Option<String>,
    pub worktree_base_dir: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct WorkspaceDelete {
    pub workspace_id: Uuid,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct WorkspaceRename {
    pub workspace_id: Uuid,
    pub new_name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct WorkspaceUpdate {
    pub workspace_id: Uuid,
    pub color: Option<String>,
    pub icon: Option<String>,
    pub worktree_base_dir: Option<String>,
    pub settings: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct WorktreeCreate {
    pub workspace_id: Uuid,
    pub branch_name: String,
    pub agent_type: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct WorktreeDelete {
    pub worktree_id: Uuid,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct WorktreeMerge {
    pub worktree_id: Uuid,
    pub squash: bool,
    pub delete_after: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct WorktreeList {
    pub workspace_id: Uuid,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct AgentSpawn {
    pub worktree_id: Uuid,
    pub agent_type: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct AgentSend {
    pub worktree_id: Uuid,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct AgentCancel {
    pub worktree_id: Uuid,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct TerminalInput {
    pub session_id: Uuid,
    pub data: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct TerminalResize {
    pub session_id: Uuid,
    pub cols: u16,
    pub rows: u16,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct TerminalCreate {
    pub worktree_id: Uuid,
    pub label: Option<String>,
    pub shell: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct FileRead {
    pub worktree_id: Uuid,
    pub path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct FileWrite {
    pub worktree_id: Uuid,
    pub path: String,
    pub content: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct GitStatus {
    pub worktree_id: Uuid,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct GitDiff {
    pub worktree_id: Uuid,
    pub file_path: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct GitCommit {
    pub worktree_id: Uuid,
    pub message: String,
    pub files: Option<Vec<String>>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct CreatePR {
    pub worktree_id: Uuid,
    pub title: String,
    pub body: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct GetState {
    pub request_id: Uuid,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct UpdateSettings {
    pub key: String,
    pub value: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Ping {
    pub timestamp: u64,
}

// Server response messages

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct StateSnapshot {
    #[serde(with = "uuid_str")]
    pub request_id: Uuid,
    pub workspaces: Vec<WorkspaceData>,
    pub worktrees: Vec<WorktreeData>,
    pub agent_sessions: Vec<AgentSessionData>,
    pub terminal_sessions: Vec<TerminalSessionData>,
    pub settings: Vec<SettingData>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceData {
    #[serde(with = "uuid_str")]
    pub id: Uuid,
    pub name: String,
    pub root_path: String,
    pub color: Option<String>,
    pub icon: Option<String>,
    pub worktree_base_dir: Option<String>,
    pub settings: Option<String>,
    pub created_at: u64,
    pub updated_at: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct WorktreeData {
    #[serde(with = "uuid_str")]
    pub id: Uuid,
    #[serde(with = "uuid_str")]
    pub workspace_id: Uuid,
    pub branch_name: String,
    pub path: String,
    pub status: String,
    pub created_at: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct AgentSessionData {
    #[serde(with = "uuid_str")]
    pub id: Uuid,
    #[serde(with = "uuid_str")]
    pub worktree_id: Uuid,
    pub agent_type: String,
    pub acp_session_id: Option<String>,
    pub status: AgentStatus,
    pub started_at: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub enum AgentStatus {
    Working,
    Waiting,
    Idle,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct TerminalSessionData {
    #[serde(with = "uuid_str")]
    pub id: Uuid,
    #[serde(with = "uuid_str")]
    pub worktree_id: Uuid,
    pub label: Option<String>,
    pub shell: String,
    pub created_at: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct SettingData {
    pub key: String,
    pub value: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct WorkspaceCreated {
    pub workspace: WorkspaceData,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct WorkspaceDeleted {
    #[serde(with = "uuid_str")]
    pub workspace_id: Uuid,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct WorkspaceUpdated {
    pub workspace: WorkspaceData,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct WorktreeCreated {
    pub worktree: WorktreeData,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct WorktreeDeleted {
    #[serde(with = "uuid_str")]
    pub worktree_id: Uuid,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct WorktreeListResult {
    #[serde(with = "uuid_str")]
    pub workspace_id: Uuid,
    pub worktrees: Vec<WorktreeData>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct WorktreeStatus {
    #[serde(with = "uuid_str")]
    pub worktree_id: Uuid,
    pub status: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct AgentStatusUpdate {
    #[serde(with = "uuid_str")]
    pub worktree_id: Uuid,
    pub status: AgentStatus,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct AgentOutput {
    #[serde(with = "uuid_str")]
    pub worktree_id: Uuid,
    pub output: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct AgentPrompt {
    #[serde(with = "uuid_str")]
    pub worktree_id: Uuid,
    pub prompt: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct TerminalOutput {
    #[serde(with = "uuid_str")]
    pub session_id: Uuid,
    pub data: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct TerminalCreated {
    #[serde(with = "uuid_str")]
    pub session_id: Uuid,
    #[serde(with = "uuid_str")]
    pub worktree_id: Uuid,
    pub label: Option<String>,
    pub shell: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct FileContent {
    #[serde(with = "uuid_str")]
    pub worktree_id: Uuid,
    pub path: String,
    pub content: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct GitStatusResult {
    #[serde(with = "uuid_str")]
    pub worktree_id: Uuid,
    pub status: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct GitDiffResult {
    #[serde(with = "uuid_str")]
    pub worktree_id: Uuid,
    pub file_path: Option<String>,
    pub diff: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Error {
    pub code: String,
    pub message: String,
    pub details: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Pong {
    pub timestamp: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Notification {
    pub level: NotificationLevel,
    pub title: String,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum NotificationLevel {
    Info,
    Warning,
    Error,
}

// Helper functions for creating messages with version header

impl ClientMessage {
    pub fn new(payload: ClientMessagePayload) -> Self {
        Self {
            version: PROTOCOL_VERSION,
            payload,
        }
    }
}

impl ServerMessage {
    pub fn new(payload: ServerMessagePayload) -> Self {
        Self {
            version: PROTOCOL_VERSION,
            payload,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

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
        }));
        test_roundtrip(msg);
    }

    #[test]
    fn test_worktree_create_roundtrip() {
        let msg = ClientMessage::new(ClientMessagePayload::WorktreeCreate(WorktreeCreate {
            workspace_id: Uuid::new_v4(),
            branch_name: "feature-branch".to_string(),
            agent_type: Some("coder".to_string()),
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
            worktree_id: Uuid::new_v4(),
            status: AgentStatus::Working,
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

    fn test_roundtrip<T>(original: T)
    where
        T: Serialize + for<'de> Deserialize<'de> + PartialEq + std::fmt::Debug,
    {
        let encoded = rmp_serde::to_vec(&original).expect("Failed to encode");
        let decoded: T = rmp_serde::from_slice(&encoded).expect("Failed to decode");
        assert_eq!(original, decoded);
    }
}
