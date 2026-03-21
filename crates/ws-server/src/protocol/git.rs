//! Git-related protocol types

use serde::{Deserialize, Serialize};
use ts_rs::TS;
use uuid::Uuid;

use super::uuid_serde;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct GitStatus {
    #[serde(with = "uuid_serde")]
    #[ts(type = "string")]
    pub worktree_id: Uuid,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct GitDiff {
    #[serde(with = "uuid_serde")]
    #[ts(type = "string")]
    pub worktree_id: Uuid,
    pub file_path: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct GitCommit {
    #[serde(with = "uuid_serde")]
    #[ts(type = "string")]
    pub worktree_id: Uuid,
    pub message: String,
    pub files: Option<Vec<String>>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct CreatePR {
    #[serde(with = "uuid_serde")]
    #[ts(type = "string")]
    pub worktree_id: Uuid,
    pub title: String,
    pub body: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct GitStatusResult {
    #[serde(with = "uuid_serde")]
    #[ts(type = "string")]
    pub worktree_id: Uuid,
    pub status: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct GitDiffResult {
    #[serde(with = "uuid_serde")]
    #[ts(type = "string")]
    pub worktree_id: Uuid,
    pub file_path: Option<String>,
    pub diff: String,
}
