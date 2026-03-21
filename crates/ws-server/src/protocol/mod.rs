//! MessagePack protocol types for Ymir WebSocket communication
//!
//! This module defines all message types for the Ymir protocol, including
//! client-to-server requests, server-to-client responses, and bidirectional messages.
//! All messages include a version header for protocol compatibility.
//!
//! # WS-ACP Wire Contract
//!
//! The WS-ACP wire contract defines a stateless event vocabulary for communication
//! between the Rust ACP bridge and the TypeScript side. Key properties:
//!
//! - **Ordering**: Events carry monotonically increasing sequence numbers per session
//! - **Idempotency**: Events with duplicate sequence numbers are safe to replay
//! - **Resumability**: Client can request replay from last known sequence via `AcpResumeRequest`
//! - **Error Envelopes**: All failures are captured in structured `AcpError` types
//!
//! The ACP bridge translates between ACP JSON-RPC (over stdio) and these WebSocket
//! events. The TypeScript client accumulates these events into UI-appropriate structures.
//! This layer does NOT contain assistant-ui message parts or accumulated UI state.

mod acp;
mod agent;
mod common;
mod file;
mod git;
mod settings;
mod terminal;
mod workspace;
mod worktree;

use serde::{Deserialize, Deserializer, Serialize, Serializer};
use uuid::Uuid;

pub mod uuid_serde {
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

pub mod optional_uuid_serde {
    use super::*;
    use std::str::FromStr;

    pub fn serialize<S>(uuid: &Option<Uuid>, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        match uuid {
            Some(uuid) => serializer.serialize_str(&uuid.hyphenated().to_string()),
            None => serializer.serialize_none(),
        }
    }

    pub fn deserialize<'de, D>(deserializer: D) -> Result<Option<Uuid>, D::Error>
    where
        D: Deserializer<'de>,
    {
        let opt: Option<Option<String>> = Option::deserialize(deserializer).ok();
        match opt.flatten() {
            Some(s) => Uuid::from_str(&s)
                .map(Some)
                .map_err(serde::de::Error::custom),
            None => Ok(None),
        }
    }
}

pub mod uuid_vec_serde {
    use super::*;
    use std::str::FromStr;

    pub fn serialize<S>(uuids: &[Uuid], serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        let strings: Vec<String> = uuids.iter().map(|u| u.hyphenated().to_string()).collect();
        strings.serialize(serializer)
    }

    pub fn deserialize<'de, D>(deserializer: D) -> Result<Vec<Uuid>, D::Error>
    where
        D: Deserializer<'de>,
    {
        let strings: Vec<String> = Vec::deserialize(deserializer)?;
        let mut uuids = Vec::with_capacity(strings.len());
        for s in strings {
            uuids.push(Uuid::from_str(&s).map_err(serde::de::Error::custom)?);
        }
        Ok(uuids)
    }
}

pub use acp::*;
pub use agent::*;
pub use common::*;
pub use file::*;
pub use git::*;
pub use settings::*;
pub use terminal::*;
pub use workspace::*;
pub use worktree::*;

#[cfg(test)]
mod tests;
