//! Workspace-related protocol types

use serde::{Deserialize, Serialize};
use ts_rs::TS;
use uuid::Uuid;

use super::{optional_uuid_serde, uuid_serde};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct WorkspaceCreate {
    pub name: String,
    pub root_path: String,
    pub color: Option<String>,
    pub icon: Option<String>,
    pub worktree_base_dir: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct WorkspaceDelete {
    #[serde(with = "uuid_serde")]
    #[ts(as = "String")]
    pub workspace_id: Uuid,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct WorkspaceRename {
    #[serde(with = "uuid_serde")]
    #[ts(type = "string")]
    pub workspace_id: Uuid,
    pub new_name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct WorkspaceUpdate {
    #[serde(with = "uuid_serde")]
    #[ts(type = "string")]
    pub workspace_id: Uuid,
    pub color: Option<String>,
    pub icon: Option<String>,
    pub worktree_base_dir: Option<String>,
    pub settings: Option<String>,
    #[serde(with = "optional_uuid_serde")]
    #[ts(type = "string")]
    pub request_id: Option<Uuid>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct WorkspaceData {
    #[serde(with = "uuid_serde")]
    #[ts(type = "string")]
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

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct WorkspaceCreated {
    pub workspace: WorkspaceData,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct WorkspaceDeleted {
    #[serde(with = "uuid_serde")]
    #[ts(type = "string")]
    pub workspace_id: Uuid,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, TS)]
#[ts(export)]
pub struct WorkspaceUpdated {
    pub workspace: WorkspaceData,
}
