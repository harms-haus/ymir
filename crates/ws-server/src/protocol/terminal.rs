//! Terminal-related protocol types

use serde::{Deserialize, Serialize};
use ts_rs::TS;
use uuid::Uuid;

use super::{uuid_serde, uuid_vec_serde};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct TerminalInput {
    #[serde(with = "uuid_serde")]
    #[ts(type = "string")]
    pub session_id: Uuid,
    pub data: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct TerminalResize {
    #[serde(with = "uuid_serde")]
    #[ts(type = "string")]
    pub session_id: Uuid,
    pub cols: u16,
    pub rows: u16,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct TerminalCreate {
    #[serde(with = "uuid_serde")]
    #[ts(type = "string")]
    pub worktree_id: Uuid,
    pub label: Option<String>,
    pub shell: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct TerminalSessionData {
    #[serde(with = "uuid_serde")]
    #[ts(type = "string")]
    pub id: Uuid,
    #[serde(with = "uuid_serde")]
    #[ts(type = "string")]
    pub worktree_id: Uuid,
    pub label: Option<String>,
    pub shell: String,
    pub created_at: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct TerminalOutput {
    #[serde(with = "uuid_serde")]
    #[ts(type = "string")]
    pub session_id: Uuid,
    pub data: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct TerminalCreated {
    #[serde(with = "uuid_serde")]
    #[ts(type = "string")]
    pub session_id: Uuid,
    #[serde(with = "uuid_serde")]
    #[ts(type = "string")]
    pub worktree_id: Uuid,
    pub label: Option<String>,
    pub shell: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct TerminalRemoved {
    #[serde(with = "uuid_serde")]
    #[ts(type = "string")]
    pub session_id: Uuid,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct TerminalRename {
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
pub struct TerminalReorder {
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
pub struct TerminalUpdated {
    #[serde(with = "uuid_serde")]
    #[ts(type = "string")]
    pub session_id: Uuid,
    #[serde(with = "uuid_serde")]
    #[ts(type = "string")]
    pub worktree_id: Uuid,
    pub label: Option<String>,
    pub position: Option<u32>,
    #[serde(with = "uuid_serde")]
    #[ts(type = "string")]
    pub request_id: Uuid,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct TerminalKill {
    #[serde(with = "uuid_serde")]
    #[ts(type = "string")]
    pub session_id: Uuid,
}
