//! Bridge contract types for WebSocket communication between Rust and TypeScript.
//!
//! This module defines the versioned envelope format that is the single source of truth
//! for all browser-facing transport messages. Types are exported to TypeScript via TS-RS.

mod envelope;
mod message;

pub use envelope::*;
pub use message::*;

/// Current supported envelope version.
/// Bump this when making breaking changes to the envelope format.
pub const ENVELOPE_VERSION: u32 = 1;

/// Supported envelope versions for version negotiation.
pub const SUPPORTED_VERSIONS: [u32; 1] = [1];
