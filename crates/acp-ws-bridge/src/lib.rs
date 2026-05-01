//! WebSocket bridge library for ACP Chat Core.
//!
//! This library provides a WebSocket-based bridge between Rust and TypeScript for
//! real-time communication in the ACP Chat system. It defines versioned envelope formats
//! for all bridge-to-browser messages and provides a generic WebSocket server for
//! managing bridge connections.
//!
//! ## Modules
//!
//! - [`contract`]: Versioned envelope types and message formats
//! - [`server`]: Generic WebSocket server for bridge connections
//!
//! ## Exports
//!
//! The library re-exports all public types from its modules:
//!
//! ### From contract module:
//! - [`BridgeEnvelope`]: Versioned envelope for all bridge-to-browser messages
//! - [`BridgeMessage`]: Message variants for bridge communications
//! - [`BridgeStatus`]: Bridge lifecycle states
//! - [`UnsupportedVersionError`]: Error for unsupported envelope versions
//! - [`ENVELOPE_VERSION`]: Current supported envelope version
//! - [`SUPPORTED_VERSIONS`]: Supported envelope versions for negotiation
//!
//! ### From server module:
//! - [`ServerConfig`]: Server configuration
//! - [`run_server`]: Start the WebSocket server
//! - [`SessionState`]: Session state tracking
//! - [`InitMessage`]: Init message structure from client
//! - [`DisconnectMessage`]: Disconnect message structure from client

pub mod contract;
pub mod server;
pub mod test_utils;

pub use contract::{
    BridgeEnvelope, BridgeMessage, BridgeStatus, UnsupportedVersionError, ENVELOPE_VERSION,
    SUPPORTED_VERSIONS,
};
pub use server::{run_server, DisconnectMessage, InitMessage, ServerConfig, SessionState};
