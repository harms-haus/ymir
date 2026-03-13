//! Ymir Core Library
//!
//! This crate contains shared types, database client, and WebSocket protocol
//! definitions used by both ymir-server and ymir-tauri.

pub mod db;
pub mod git;
pub mod handlers;
pub mod protocol;
pub mod pty;
pub mod scrollback;
pub mod server;
pub mod types;

pub use types::CoreError;
pub use types::Result;
