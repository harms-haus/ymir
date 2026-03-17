//! Agent client implementation for ACP protocol
//!
//! This module provides the ACP (Agent Client Protocol) client implementation
//! for managing agent subprocesses and handling JSON-RPC communication.

pub mod acp;

pub use acp::{AcpClient, AgentStatus};
