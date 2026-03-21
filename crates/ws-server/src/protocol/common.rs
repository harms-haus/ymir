//! Core protocol types for Ymir WebSocket communication

use serde::{Deserialize, Serialize};
use ts_rs::TS;
use uuid::Uuid;

use super::{
    acp::AcpEventEnvelope,
    agent::{
        AgentCancel, AgentOutput, AgentPrompt, AgentRemoved, AgentRename, AgentReorder, AgentSend,
        AgentSessionData, AgentSpawn, AgentStatusUpdate, AgentUpdated,
    },
    file::{FileContent, FileList, FileListResult, FileRead, FileWrite},
    git::{CreatePR, GitCommit, GitDiff, GitDiffResult, GitStatus, GitStatusResult},
    optional_uuid_serde,
    settings::{GetState, SettingData, UpdateSettings},
    terminal::{
        TerminalCreate, TerminalCreated, TerminalInput, TerminalKill, TerminalOutput,
        TerminalRemoved, TerminalRename, TerminalReorder, TerminalResize, TerminalSessionData,
        TerminalUpdated,
    },
    uuid_serde,
    workspace::{
        WorkspaceCreate, WorkspaceCreated, WorkspaceData, WorkspaceDelete, WorkspaceDeleted,
        WorkspaceRename, WorkspaceUpdate, WorkspaceUpdated,
    },
    worktree::{
        WorktreeChangeBranch, WorktreeChanged, WorktreeCreate, WorktreeCreated, WorktreeData,
        WorktreeDelete, WorktreeDeleted, WorktreeList, WorktreeListResult, WorktreeMerge,
        WorktreeStatus,
    },
};

pub const PROTOCOL_VERSION: u32 = 1;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ClientMessage {
    pub version: u32,
    #[serde(flatten)]
    pub payload: ClientMessagePayload,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ServerMessage {
    pub version: u32,
    #[serde(flatten)]
    pub payload: ServerMessagePayload,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(tag = "type", content = "data")]
pub enum ClientMessagePayload {
    WorkspaceCreate(super::WorkspaceCreate),
    WorkspaceDelete(WorkspaceDelete),
    WorkspaceRename(WorkspaceRename),
    WorkspaceUpdate(WorkspaceUpdate),
    WorktreeCreate(WorktreeCreate),
    WorktreeDelete(WorktreeDelete),
    WorktreeMerge(WorktreeMerge),
    WorktreeList(WorktreeList),
    WorktreeChangeBranch(WorktreeChangeBranch),
    AgentSpawn(AgentSpawn),
    AgentSend(AgentSend),
    AgentCancel(AgentCancel),
    TerminalInput(TerminalInput),
    TerminalResize(TerminalResize),
    TerminalCreate(TerminalCreate),
    TerminalKill(TerminalKill),
    TerminalRename(TerminalRename),
    TerminalReorder(TerminalReorder),
    AgentRename(AgentRename),
    AgentReorder(AgentReorder),
    FileRead(FileRead),
    FileWrite(FileWrite),
    FileList(FileList),
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

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(tag = "type", content = "data")]
pub enum ServerMessagePayload {
    StateSnapshot(StateSnapshot),
    WorkspaceCreated(WorkspaceCreated),
    WorkspaceDeleted(WorkspaceDeleted),
    WorkspaceUpdated(WorkspaceUpdated),
    WorktreeCreated(WorktreeCreated),
    WorktreeDeleted(WorktreeDeleted),
    WorktreeChanged(WorktreeChanged),
    WorktreeListResult(WorktreeListResult),
    WorktreeStatus(WorktreeStatus),
    AgentStatusUpdate(AgentStatusUpdate),
    AgentOutput(AgentOutput),
    AgentPrompt(AgentPrompt),
    AgentRemoved(AgentRemoved),
    TerminalOutput(TerminalOutput),
    TerminalCreated(TerminalCreated),
    TerminalRemoved(TerminalRemoved),
    TerminalUpdated(TerminalUpdated),
    AgentUpdated(AgentUpdated),
    FileContent(FileContent),
    FileListResult(FileListResult),
    GitStatusResult(GitStatusResult),
    GitDiffResult(GitDiffResult),
    Error(Error),
    Ping(Ping),
    Pong(Pong),
    Notification(Notification),
    Ack(Ack),
    AcpWireEvent(AcpEventEnvelope),
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct Ack {
    #[serde(with = "uuid_serde")]
    #[ts(type = "string")]
    pub message_id: Uuid,
    pub status: AckStatus,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, TS)]
#[ts(export)]
pub enum AckStatus {
    Success,
    Error(String),
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct Ping {
    #[ts(type = "number")]
    pub timestamp: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct Pong {
    #[ts(type = "number")]
    pub timestamp: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct StateSnapshot {
    #[serde(with = "uuid_serde")]
    #[ts(type = "string")]
    pub request_id: Uuid,
    pub workspaces: Vec<WorkspaceData>,
    pub worktrees: Vec<WorktreeData>,
    pub agent_sessions: Vec<AgentSessionData>,
    pub terminal_sessions: Vec<TerminalSessionData>,
    pub settings: Vec<SettingData>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct Error {
    pub code: String,
    pub message: String,
    pub details: Option<String>,
    #[serde(with = "optional_uuid_serde")]
    #[ts(as = "Option<String>")]
    #[serde(default)]
    pub request_id: Option<Uuid>,
}

impl Default for Error {
    fn default() -> Self {
        Self {
            code: String::new(),
            message: String::new(),
            details: None,
            request_id: None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct Notification {
    pub level: NotificationLevel,
    pub title: String,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, TS)]
#[ts(export)]
pub enum NotificationLevel {
    Info,
    Warning,
    Error,
}

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
