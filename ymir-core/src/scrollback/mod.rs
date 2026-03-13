//! Scrollback management module
//!
//! Provides efficient buffering, batching, and chunked storage of terminal
//! scrollback lines. The service batches lines (50 lines or 500ms) and
//! chunks them (1000 lines) for optimal storage and retrieval performance.

pub mod service;

pub use service::{
    ScrollbackChunk,
    ScrollbackCommand,
    ScrollbackService,
    BATCH_SIZE,
    BATCH_TIMEOUT_MS,
    CHUNK_SIZE,
};
