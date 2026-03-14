//! Workspace settings persistence module
//!
//! This module provides YAML-based serialization for workspace settings,
//! allowing workspace configuration to be persisted to and loaded from disk.

pub mod yaml;

pub use yaml::{load, save, WorkspaceSettings, WorkspaceSettingsFile};
