//! Agent-related protocol types

use serde::{Deserialize, Serialize};
use ts_rs::TS;
use uuid::Uuid;

use super::{optional_uuid_serde, uuid_serde, uuid_vec_serde};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct AgentSpawn {
    #[serde(with = "uuid_serde")]
    #[ts(type = "string")]
    pub worktree_id: Uuid,
    pub agent_type: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct AgentSend {
    #[serde(with = "uuid_serde")]
    #[ts(type = "string")]
    pub worktree_id: Uuid,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct AgentCancel {
    #[serde(with = "uuid_serde")]
    #[ts(type = "string")]
    pub worktree_id: Uuid,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct AgentSessionData {
    #[serde(with = "uuid_serde")]
    #[ts(type = "string")]
    pub id: Uuid,
    #[serde(with = "uuid_serde")]
    #[ts(type = "string")]
    pub worktree_id: Uuid,
    pub agent_type: String,
    pub acp_session_id: Option<String>,
    pub status: AgentStatus,
    pub started_at: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub enum AgentStatus {
    Working,
    Waiting,
    Idle,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct AgentStatusUpdate {
    #[serde(with = "uuid_serde")]
    #[ts(type = "string")]
    pub id: Uuid,
    #[serde(with = "uuid_serde")]
    #[ts(type = "string")]
    pub worktree_id: Uuid,
    pub agent_type: String,
    pub status: AgentStatus,
    #[ts(type = "number")]
    pub started_at: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct AgentRemoved {
    #[serde(with = "uuid_serde")]
    #[ts(type = "string")]
    pub id: Uuid,
    #[serde(with = "uuid_serde")]
    #[ts(type = "string")]
    pub worktree_id: Uuid,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct AgentOutput {
    #[serde(with = "uuid_serde")]
    #[ts(type = "string")]
    pub worktree_id: Uuid,
    pub output: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct AgentPrompt {
    #[serde(with = "uuid_serde")]
    #[ts(type = "string")]
    pub worktree_id: Uuid,
    pub prompt: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct AgentRename {
    #[serde(with = "uuid_serde")]
    #[ts(type = "string")]
    pub session_id: Uuid,
    pub new_label: String,
    #[serde(with = "uuid_serde")]
    #[ts(type = "string")]
    pub request_id: Uuid,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct AgentReorder {
    #[serde(with = "uuid_serde")]
    #[ts(type = "string")]
    pub worktree_id: Uuid,
    #[ts(type = "string[]")]
    pub session_ids: Vec<Uuid>,
    #[serde(with = "uuid_serde")]
    #[ts(type = "string")]
    pub request_id: Uuid,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct AgentUpdated {
    #[serde(with = "uuid_serde")]
    #[ts(type = "string")]
    pub session_id: Uuid,
    #[serde(with = "uuid_serde")]
    #[ts(type = "string")]
    pub worktree_id: Uuid,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub label: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub position: Option<u32>,
    #[serde(with = "uuid_serde")]
    #[ts(type = "string")]
    pub request_id: Uuid,
}
