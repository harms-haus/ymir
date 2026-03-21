//! Settings-related protocol types

use serde::{Deserialize, Serialize};
use ts_rs::TS;
use uuid::Uuid;

use super::uuid_serde;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct GetState {
    #[serde(with = "uuid_serde")]
    #[ts(type = "string")]
    pub request_id: Uuid,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct UpdateSettings {
    pub key: String,
    pub value: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct SettingData {
    pub key: String,
    pub value: String,
}
