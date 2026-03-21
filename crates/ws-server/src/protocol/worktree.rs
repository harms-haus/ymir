//! Worktree-related protocol types

use serde::{Deserialize, Serialize};
use ts_rs::TS;
use uuid::Uuid;

use super::{optional_uuid_serde, uuid_serde};

/// Git statistics for a worktree
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct GitStats {
    pub modified: u32,
    pub added: u32,
    pub deleted: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct WorktreeCreate {
    #[serde(with = "uuid_serde")]
    #[ts(type = "string")]
    pub workspace_id: Uuid,
    pub branch_name: String,
    pub agent_type: Option<String>,
    #[serde(with = "optional_uuid_serde")]
    #[ts(as = "Option<String>")]
    pub request_id: Option<Uuid>,
    pub use_existing_branch: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct WorktreeDelete {
    #[serde(with = "uuid_serde")]
    #[ts(type = "string")]
    pub worktree_id: Uuid,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct WorktreeChangeBranch {
    #[serde(with = "uuid_serde")]
    #[ts(type = "string")]
    pub worktree_id: Uuid,
    pub new_branch_name: String,
    #[serde(with = "optional_uuid_serde")]
    #[ts(as = "Option<String>")]
    pub request_id: Option<Uuid>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct WorktreeMerge {
    #[serde(with = "uuid_serde")]
    #[ts(type = "string")]
    pub worktree_id: Uuid,
    pub squash: bool,
    pub delete_after: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct WorktreeList {
    #[serde(with = "uuid_serde")]
    #[ts(as = "String")]
    pub workspace_id: Uuid,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct WorktreeData {
    #[serde(with = "uuid_serde")]
    #[ts(type = "string")]
    pub id: Uuid,
    #[serde(with = "uuid_serde")]
    #[ts(type = "string")]
    pub workspace_id: Uuid,
    pub branch_name: String,
    pub path: String,
    pub status: String,
    pub created_at: u64,
    pub is_main: bool,
    pub git_stats: Option<GitStats>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct WorktreeCreated {
    pub worktree: WorktreeData,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct WorktreeChanged {
    pub worktree: WorktreeData,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct WorktreeDeleted {
    #[serde(with = "uuid_serde")]
    #[ts(type = "string")]
    pub worktree_id: Uuid,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct WorktreeListResult {
    #[serde(with = "uuid_serde")]
    pub workspace_id: Uuid,
    pub worktrees: Vec<WorktreeData>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct WorktreeStatus {
    #[serde(with = "uuid_serde")]
    pub worktree_id: Uuid,
    pub status: String,
}
