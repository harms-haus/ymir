//! WS-ACP Wire Contract Types
//!
//! Stateless event vocabulary for communication between the Rust ACP bridge
//! and the TypeScript side. These types are independent from assistant-ui
//! message parts and accumulated UI state.
//!
//! Ordering: sequence numbers are monotonically increasing per session
//! Idempotency: duplicate sequence numbers are safe to replay
//! Resumability: client can request replay from last known sequence
//! Error Envelopes: all failures captured in structured AcpError

use serde::{Deserialize, Serialize};
use ts_rs::TS;
use uuid::Uuid;

use super::{optional_uuid_serde, uuid_serde};

/// Sequence number for ordering WS-ACP events within a session.
/// Monotonically increasing, starting from 1.
pub type AcpSequence = u64;

/// Correlation ID for matching requests to responses.
/// Used for request-response patterns in the ACP bridge.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Hash, TS)]
#[ts(export)]
pub struct AcpCorrelationId(pub String);

/// Envelope for all WS-ACP events with ordering and correlation metadata.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct AcpEventEnvelope {
    /// Monotonically increasing sequence number for this event
    pub sequence: AcpSequence,
    /// Correlation ID for request-response matching (if applicable)
    #[serde(default)]
    pub correlation_id: Option<AcpCorrelationId>,
    /// Unix timestamp in milliseconds
    pub timestamp: u64,
    /// The actual event payload
    #[serde(flatten)]
    pub event: AcpEvent,
}

/// WS-ACP event types - stateless vocabulary for ACP bridge communication.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, TS)]
#[serde(tag = "eventType", content = "data")]
#[ts(export)]
pub enum AcpEvent {
    /// Session initialized successfully
    SessionInit(AcpSessionInit),
    /// Session status changed (working/waiting/complete/error)
    SessionStatus(AcpSessionStatusEvent),
    /// Streaming prompt response chunk
    PromptChunk(AcpPromptChunk),
    /// Prompt completed
    PromptComplete(AcpPromptComplete),
    /// Tool use started/progress/completed
    ToolUse(AcpToolUseEvent),
    /// Context update from agent
    ContextUpdate(AcpContextUpdate),
    /// Error from ACP bridge
    Error(AcpError),
    /// Resume marker for checkpoint/resume
    ResumeMarker(AcpResumeMarker),
}

/// Session initialization result from ACP bridge.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct AcpSessionInit {
    /// The ACP session ID from the agent
    pub acp_session_id: String,
    /// Agent capabilities
    pub capabilities: AcpAgentCapabilities,
}

/// Agent capabilities reported during initialization.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct AcpAgentCapabilities {
    pub supports_tool_use: bool,
    pub supports_context_update: bool,
    pub supports_cancellation: bool,
}

/// Session status event.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct AcpSessionStatusEvent {
    /// The worktree ID this session belongs to
    #[serde(with = "uuid_serde")]
    #[ts(type = "string")]
    pub worktree_id: Uuid,
    /// The ACP session ID
    pub acp_session_id: String,
    /// Current status
    pub status: AcpSessionStatus,
}

/// Session status values.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, TS)]
#[ts(export)]
pub enum AcpSessionStatus {
    Working,
    Waiting,
    Complete,
    Cancelled,
}

/// Streaming prompt response chunk.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct AcpPromptChunk {
    /// The worktree ID
    #[serde(with = "uuid_serde")]
    #[ts(type = "string")]
    pub worktree_id: Uuid,
    /// The ACP session ID
    pub acp_session_id: String,
    /// Chunk content (text or structured data)
    pub content: AcpChunkContent,
    /// True if this is the final chunk for this content item
    pub is_final: bool,
}

/// Content types for prompt chunks.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, TS)]
#[serde(tag = "type", content = "data")]
#[ts(export)]
pub enum AcpChunkContent {
    /// Text content
    Text(String),
    /// Structured content (JSON string)
    Structured(String),
}

/// Prompt completion event.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct AcpPromptComplete {
    /// The worktree ID
    #[serde(with = "uuid_serde")]
    #[ts(type = "string")]
    pub worktree_id: Uuid,
    /// The ACP session ID
    pub acp_session_id: String,
    /// Reason for completion
    pub reason: AcpPromptCompleteReason,
}

/// Reason for prompt completion.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, TS)]
#[ts(export)]
pub enum AcpPromptCompleteReason {
    Normal,
    Cancelled,
    Error,
}

/// Tool use event from ACP agent.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct AcpToolUseEvent {
    /// The worktree ID
    #[serde(with = "uuid_serde")]
    #[ts(type = "string")]
    pub worktree_id: Uuid,
    /// The ACP session ID
    pub acp_session_id: String,
    /// Tool use ID for correlation
    pub tool_use_id: String,
    /// Tool name
    pub tool_name: String,
    /// Current status of the tool use
    pub status: AcpToolUseStatus,
    /// Input to the tool (JSON string) - present when status is Started
    #[serde(default)]
    pub input: Option<String>,
    /// Output from the tool (JSON string) - present when status is Completed
    #[serde(default)]
    pub output: Option<String>,
    /// Error message - present when status is Error
    #[serde(default)]
    pub error: Option<String>,
}

/// Tool use status values.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, TS)]
#[ts(export)]
pub enum AcpToolUseStatus {
    Started,
    InProgress,
    Completed,
    Error,
}

/// Context update event from ACP agent.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct AcpContextUpdate {
    /// The worktree ID
    #[serde(with = "uuid_serde")]
    #[ts(type = "string")]
    pub worktree_id: Uuid,
    /// The ACP session ID
    pub acp_session_id: String,
    /// Context update type
    pub update_type: AcpContextUpdateType,
    /// Context data (JSON string)
    pub data: String,
}

/// Context update type values.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, TS)]
#[ts(export)]
pub enum AcpContextUpdateType {
    FileRead,
    FileWritten,
    CommandExecuted,
    BrowserAction,
    MemoryUpdate,
}

/// Structured error from ACP bridge.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct AcpError {
    /// The worktree ID (if applicable)
    #[serde(with = "optional_uuid_serde", default)]
    #[ts(type = "string | null")]
    pub worktree_id: Option<Uuid>,
    /// The ACP session ID (if applicable)
    #[serde(default)]
    pub acp_session_id: Option<String>,
    /// Error code for programmatic handling
    pub code: AcpErrorCode,
    /// Human-readable error message
    pub message: String,
    /// Additional details (JSON string)
    #[serde(default)]
    pub details: Option<String>,
    /// Whether this error is recoverable
    pub recoverable: bool,
}

/// ACP error codes for programmatic handling.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, TS)]
#[ts(export)]
pub enum AcpErrorCode {
    /// Agent process crashed
    AgentCrash,
    /// Agent initialization failed
    InitFailed,
    /// Session not found
    SessionNotFound,
    /// Prompt failed
    PromptFailed,
    /// Tool execution failed
    ToolFailed,
    /// Cancellation failed
    CancelFailed,
    /// Timeout exceeded
    Timeout,
    /// Invalid request
    InvalidRequest,
    /// Internal error
    Internal,
}

/// Resume marker for checkpoint/resume functionality.
/// Sent periodically to allow clients to resume from a known point.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct AcpResumeMarker {
    /// The worktree ID
    #[serde(with = "uuid_serde")]
    #[ts(type = "string")]
    pub worktree_id: Uuid,
    /// The ACP session ID
    pub acp_session_id: String,
    /// The last sequence number that can be resumed from
    pub last_sequence: AcpSequence,
    /// Checkpoint data for resumption (opaque to client)
    #[serde(default)]
    pub checkpoint: Option<String>,
}

/// Request to resume from a known sequence number.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct AcpResumeRequest {
    /// The worktree ID
    #[serde(with = "uuid_serde")]
    #[ts(type = "string")]
    pub worktree_id: Uuid,
    /// The ACP session ID
    pub acp_session_id: String,
    /// The sequence number to resume from
    pub from_sequence: AcpSequence,
}

/// Acknowledgment for WS-ACP events with last processed sequence.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct AcpAck {
    /// The worktree ID
    #[serde(with = "uuid_serde")]
    #[ts(type = "string")]
    pub worktree_id: Uuid,
    /// The ACP session ID
    pub acp_session_id: String,
    /// The last sequence number successfully processed
    #[ts(type = "number")]
    pub last_sequence: AcpSequence,
}
