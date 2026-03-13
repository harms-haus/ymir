//! PTY Session Manager Module
//!
//! This module provides PTY (pseudo-terminal) session management for ymir-core.
//! It handles spawning shells, writing input, resizing terminals, and streaming
//! output via broadcast channels.
//!
//! Sessions are bound to `tab_id` for the new architecture, replacing the
//! old workspace/pane binding model.

pub mod manager;

pub use manager::{PtyManager, PtySession, PtyOutput};
