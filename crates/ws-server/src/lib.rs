//! ymir WebSocket server library
//! Core communication framework for the ymir orchestrator

pub mod agent;
pub mod db;
pub mod git;
pub mod hub;
pub mod protocol;
pub mod pty;
pub mod router;
pub mod state;
pub mod watcher;
pub mod workspace;
pub mod worktree;

pub const DEFAULT_PORT: u16 = 7319;
pub const VITE_PROXY_PORT: u16 = 5173;
