//! Message types for bridge envelopes.

use serde::{Deserialize, Serialize};
use ts_rs::TS;

/// Bridge message variants for all browser-facing communications.
///
/// The bridge passes ACP payloads through unchanged. It does not normalize
/// or interpret ACP semantics.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[serde(tag = "type", rename_all = "snake_case")]
#[ts(export)]
pub enum BridgeMessage {
    /// Raw ACP JSON-RPC payload from the agent's stdout.
    /// The bridge does not parse or modify the payload.
    AcpPayload {
        /// The raw JSON-RPC message as received from the ACP agent.
        /// This is an opaque value — the bridge does not interpret it.
        payload: serde_json::Value,
    },

    /// Bridge lifecycle state change.
    BridgeStatus {
        /// The new bridge state.
        status: BridgeStatus,
    },

    /// A line of stderr output from the ACP process.
    Stderr {
        /// The stderr line content.
        line: String,
    },

    /// Notification that the ACP process has exited.
    ProcessExit {
        /// The exit code, if available.
        code: Option<i32>,
        /// Signal that terminated the process, if any.
        signal: Option<String>,
    },

    /// Replay metadata at the start of a replay session.
    ReplayMetadata {
        /// Original capture timestamp in milliseconds.
        #[ts(type = "number")]
        captured_at_ms: u64,
        /// Total number of envelopes in the replay file.
        #[ts(type = "number")]
        total_envelopes: u64,
        /// Optional description of the captured session.
        #[serde(skip_serializing_if = "Option::is_none")]
        description: Option<String>,
    },

    /// Command to spawn an ACP agent process (client-to-server).
    StartAgent {
        /// Command to execute.
        command: String,
        /// Command arguments.
        args: Vec<String>,
        /// Working directory for the process.
        cwd: Option<String>,
        /// Environment variables as key-value pairs.
        env: Vec<(String, String)>,
    },

    // ========================================================================
    // Ymir protocol message passthroughs
    // These discriminators carry the original MessagePack payload fields as
    // structured JSON. The bridge does not interpret or modify the payload.
    // ========================================================================
    /// Workspace lifecycle event (WorkspaceCreated, WorkspaceDeleted,
    /// WorkspaceUpdated). Carries the original ServerMessagePayload data.
    WorkspaceEvent {
        /// The original MessagePack payload as structured JSON.
        payload: serde_json::Value,
    },

    /// Worktree lifecycle event (WorktreeCreated, WorktreeDeleted,
    /// WorktreeChanged, WorktreeListResult, WorktreeStatus,
    /// WorktreeDetailsResult). Carries the original ServerMessagePayload data.
    WorktreeEvent {
        /// The original MessagePack payload as structured JSON.
        payload: serde_json::Value,
    },

    /// Git operation response (GitStatusResult, GitDiffResult).
    /// Carries the original ServerMessagePayload data.
    GitResponse {
        /// The original MessagePack payload as structured JSON.
        payload: serde_json::Value,
    },

    /// File operation response (FileContent, FileListResult).
    /// Carries the original ServerMessagePayload data.
    FileResponse {
        /// The original MessagePack payload as structured JSON.
        payload: serde_json::Value,
    },

    /// Agent lifecycle event (AgentStatusUpdate, AgentOutput, AgentPrompt,
    /// AgentRemoved, AgentUpdated). Carries the original ServerMessagePayload
    /// data.
    AgentEvent {
        /// The original MessagePack payload as structured JSON.
        payload: serde_json::Value,
    },

    /// Terminal lifecycle event (TerminalOutput, TerminalCreated,
    /// TerminalRemoved, TerminalUpdated, TerminalHistory). Carries the
    /// original ServerMessagePayload data.
    TerminalEvent {
        /// The original MessagePack payload as structured JSON.
        payload: serde_json::Value,
    },

    /// State snapshot response to GetState request. Carries the full
    /// application state snapshot as structured JSON.
    StateSnapshot {
        /// The original MessagePack payload as structured JSON.
        payload: serde_json::Value,
    },

    /// System notification (info, warning, error). Triggered by git
    /// operations, system events. Carries the original Notification data.
    Notification {
        /// The original MessagePack payload as structured JSON.
        payload: serde_json::Value,
    },

    /// Error response from any failed operation. Carries the original
    /// Error data with code, message, details, and optional request_id.
    ErrorResponse {
        /// The original MessagePack payload as structured JSON.
        payload: serde_json::Value,
    },

    /// Acknowledgment for rename/reorder operations. Carries the original
    /// Ack data with message_id and status.
    Ack {
        /// The original MessagePack payload as structured JSON.
        payload: serde_json::Value,
    },

    /// Server-initiated heartbeat ping. Carries the original Ping data
    /// with timestamp.
    Ping {
        /// The original MessagePack payload as structured JSON.
        payload: serde_json::Value,
    },

    /// Heartbeat pong response. Carries the original Pong data with
    /// timestamp.
    Pong {
        /// The original MessagePack payload as structured JSON.
        payload: serde_json::Value,
    },
}

/// Bridge lifecycle states.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "snake_case")]
#[ts(export)]
pub enum BridgeStatus {
    /// Bridge is starting up.
    Starting,
    /// Bridge is connected and proxying ACP traffic.
    Connected,
    /// Bridge is reconnecting after a disconnect.
    Reconnecting,
    /// Bridge has disconnected.
    Disconnected,
    /// Bridge encountered an error.
    Error,
}

impl BridgeMessage {
    /// Creates a new ACP payload message.
    pub fn acp_payload(payload: serde_json::Value) -> Self {
        Self::AcpPayload { payload }
    }

    /// Creates a new bridge status message.
    pub fn bridge_status(status: BridgeStatus) -> Self {
        Self::BridgeStatus { status }
    }

    /// Creates a new stderr message.
    pub fn stderr(line: String) -> Self {
        Self::Stderr { line }
    }

    /// Creates a new process exit message.
    pub fn process_exit(code: Option<i32>, signal: Option<String>) -> Self {
        Self::ProcessExit { code, signal }
    }

    /// Creates a new replay metadata message.
    pub fn replay_metadata(
        captured_at_ms: u64,
        total_envelopes: u64,
        description: Option<String>,
    ) -> Self {
        Self::ReplayMetadata {
            captured_at_ms,
            total_envelopes,
            description,
        }
    }

    /// Creates a new start agent message.
    pub fn start_agent(
        command: String,
        args: Vec<String>,
        cwd: Option<String>,
        env: Vec<(String, String)>,
    ) -> Self {
        Self::StartAgent {
            command,
            args,
            cwd,
            env,
        }
    }

    /// Creates a new workspace event message.
    pub fn workspace_event(payload: serde_json::Value) -> Self {
        Self::WorkspaceEvent { payload }
    }

    /// Creates a new worktree event message.
    pub fn worktree_event(payload: serde_json::Value) -> Self {
        Self::WorktreeEvent { payload }
    }

    /// Creates a new git response message.
    pub fn git_response(payload: serde_json::Value) -> Self {
        Self::GitResponse { payload }
    }

    /// Creates a new file response message.
    pub fn file_response(payload: serde_json::Value) -> Self {
        Self::FileResponse { payload }
    }

    /// Creates a new agent event message.
    pub fn agent_event(payload: serde_json::Value) -> Self {
        Self::AgentEvent { payload }
    }

    /// Creates a new terminal event message.
    pub fn terminal_event(payload: serde_json::Value) -> Self {
        Self::TerminalEvent { payload }
    }

    /// Creates a new state snapshot message.
    pub fn state_snapshot(payload: serde_json::Value) -> Self {
        Self::StateSnapshot { payload }
    }

    /// Creates a new notification message.
    pub fn notification(payload: serde_json::Value) -> Self {
        Self::Notification { payload }
    }

    /// Creates a new error response message.
    pub fn error_response(payload: serde_json::Value) -> Self {
        Self::ErrorResponse { payload }
    }

    /// Creates a new ack message.
    pub fn ack(payload: serde_json::Value) -> Self {
        Self::Ack { payload }
    }

    /// Creates a new ping message.
    pub fn ping(payload: serde_json::Value) -> Self {
        Self::Ping { payload }
    }

    /// Creates a new pong message.
    pub fn pong(payload: serde_json::Value) -> Self {
        Self::Pong { payload }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::test_utils::MessageBuilder;
    use serde_json::json;

    // ========================================================================
    // Tests for BridgeMessage variants - construction and pattern matching
    // ========================================================================

    #[test]
    fn test_acp_payload_variant() {
        let payload = json!({"method": "test", "params": {"key": "value"}});
        let msg = BridgeMessage::AcpPayload {
            payload: payload.clone(),
        };

        match msg {
            BridgeMessage::AcpPayload { payload: p } => {
                assert_eq!(p, payload);
            }
            _ => panic!("Expected AcpPayload variant"),
        }
    }

    #[test]
    fn test_bridge_status_variant() {
        let msg = BridgeMessage::BridgeStatus {
            status: BridgeStatus::Connected,
        };

        match msg {
            BridgeMessage::BridgeStatus { status } => {
                assert_eq!(status, BridgeStatus::Connected);
            }
            _ => panic!("Expected BridgeStatus variant"),
        }
    }

    #[test]
    fn test_stderr_variant() {
        let error_line = "Error: Connection failed".to_string();
        let msg = BridgeMessage::Stderr {
            line: error_line.clone(),
        };

        match msg {
            BridgeMessage::Stderr { line } => {
                assert_eq!(line, error_line);
            }
            _ => panic!("Expected Stderr variant"),
        }
    }

    #[test]
    fn test_process_exit_variant_with_code_and_signal() {
        let msg = BridgeMessage::ProcessExit {
            code: Some(1),
            signal: Some("SIGTERM".to_string()),
        };

        match msg {
            BridgeMessage::ProcessExit { code, signal } => {
                assert_eq!(code, Some(1));
                assert_eq!(signal, Some("SIGTERM".to_string()));
            }
            _ => panic!("Expected ProcessExit variant"),
        }
    }

    #[test]
    fn test_process_exit_variant_without_code() {
        let msg = BridgeMessage::ProcessExit {
            code: None,
            signal: Some("SIGKILL".to_string()),
        };

        match msg {
            BridgeMessage::ProcessExit { code, signal } => {
                assert_eq!(code, None);
                assert_eq!(signal, Some("SIGKILL".to_string()));
            }
            _ => panic!("Expected ProcessExit variant"),
        }
    }

    #[test]
    fn test_process_exit_variant_without_signal() {
        let msg = BridgeMessage::ProcessExit {
            code: Some(0),
            signal: None,
        };

        match msg {
            BridgeMessage::ProcessExit { code, signal } => {
                assert_eq!(code, Some(0));
                assert_eq!(signal, None);
            }
            _ => panic!("Expected ProcessExit variant"),
        }
    }

    #[test]
    fn test_replay_metadata_variant_with_description() {
        let msg = BridgeMessage::ReplayMetadata {
            captured_at_ms: 1234567890,
            total_envelopes: 100,
            description: Some("Test session".to_string()),
        };

        match msg {
            BridgeMessage::ReplayMetadata {
                captured_at_ms,
                total_envelopes,
                description,
            } => {
                assert_eq!(captured_at_ms, 1234567890);
                assert_eq!(total_envelopes, 100);
                assert_eq!(description, Some("Test session".to_string()));
            }
            _ => panic!("Expected ReplayMetadata variant"),
        }
    }

    #[test]
    fn test_replay_metadata_variant_without_description() {
        let msg = BridgeMessage::ReplayMetadata {
            captured_at_ms: 9876543210,
            total_envelopes: 500,
            description: None,
        };

        match msg {
            BridgeMessage::ReplayMetadata {
                captured_at_ms,
                total_envelopes,
                description,
            } => {
                assert_eq!(captured_at_ms, 9876543210);
                assert_eq!(total_envelopes, 500);
                assert_eq!(description, None);
            }
            _ => panic!("Expected ReplayMetadata variant"),
        }
    }

    #[test]
    fn test_start_agent_variant_with_all_fields() {
        let msg = BridgeMessage::StartAgent {
            command: "node".to_string(),
            args: vec!["script.js".to_string(), "--verbose".to_string()],
            cwd: Some("/workspace".to_string()),
            env: vec![
                ("NODE_ENV".to_string(), "test".to_string()),
                ("DEBUG".to_string(), "true".to_string()),
            ],
        };

        match msg {
            BridgeMessage::StartAgent {
                command,
                args,
                cwd,
                env,
            } => {
                assert_eq!(command, "node");
                assert_eq!(args, vec!["script.js", "--verbose"]);
                assert_eq!(cwd, Some("/workspace".to_string()));
                assert_eq!(
                    env,
                    vec![
                        ("NODE_ENV".to_string(), "test".to_string()),
                        ("DEBUG".to_string(), "true".to_string())
                    ]
                );
            }
            _ => panic!("Expected StartAgent variant"),
        }
    }

    #[test]
    fn test_start_agent_variant_minimal() {
        let msg = BridgeMessage::StartAgent {
            command: "python".to_string(),
            args: vec![],
            cwd: None,
            env: vec![],
        };

        match msg {
            BridgeMessage::StartAgent {
                command,
                args,
                cwd,
                env,
            } => {
                assert_eq!(command, "python");
                assert!(args.is_empty());
                assert_eq!(cwd, None);
                assert!(env.is_empty());
            }
            _ => panic!("Expected StartAgent variant"),
        }
    }

    // ========================================================================
    // Tests for factory methods
    // ========================================================================

    #[test]
    fn test_acp_payload_factory() {
        let payload = json!({"jsonrpc": "2.0", "method": "initialize"});
        let msg = BridgeMessage::acp_payload(payload.clone());

        match msg {
            BridgeMessage::AcpPayload { payload: p } => {
                assert_eq!(p, payload);
            }
            _ => panic!("Expected AcpPayload from factory"),
        }
    }

    #[test]
    fn test_bridge_status_factory() {
        let msg = BridgeMessage::bridge_status(BridgeStatus::Reconnecting);

        match msg {
            BridgeMessage::BridgeStatus { status } => {
                assert_eq!(status, BridgeStatus::Reconnecting);
            }
            _ => panic!("Expected BridgeStatus from factory"),
        }
    }

    #[test]
    fn test_stderr_factory() {
        let msg = BridgeMessage::stderr("Test error message".to_string());

        match msg {
            BridgeMessage::Stderr { line } => {
                assert_eq!(line, "Test error message");
            }
            _ => panic!("Expected Stderr from factory"),
        }
    }

    #[test]
    fn test_process_exit_factory_with_all_params() {
        let msg = BridgeMessage::process_exit(Some(127), Some("SIGSEGV".to_string()));

        match msg {
            BridgeMessage::ProcessExit { code, signal } => {
                assert_eq!(code, Some(127));
                assert_eq!(signal, Some("SIGSEGV".to_string()));
            }
            _ => panic!("Expected ProcessExit from factory"),
        }
    }

    #[test]
    fn test_process_exit_factory_with_none_params() {
        let msg = BridgeMessage::process_exit(None, None);

        match msg {
            BridgeMessage::ProcessExit { code, signal } => {
                assert_eq!(code, None);
                assert_eq!(signal, None);
            }
            _ => panic!("Expected ProcessExit from factory"),
        }
    }

    #[test]
    fn test_replay_metadata_factory_with_description() {
        let msg =
            BridgeMessage::replay_metadata(1111111111, 250, Some("Captured session".to_string()));

        match msg {
            BridgeMessage::ReplayMetadata {
                captured_at_ms,
                total_envelopes,
                description,
            } => {
                assert_eq!(captured_at_ms, 1111111111);
                assert_eq!(total_envelopes, 250);
                assert_eq!(description, Some("Captured session".to_string()));
            }
            _ => panic!("Expected ReplayMetadata from factory"),
        }
    }

    #[test]
    fn test_replay_metadata_factory_without_description() {
        let msg = BridgeMessage::replay_metadata(2222222222, 300, None);

        match msg {
            BridgeMessage::ReplayMetadata {
                captured_at_ms,
                total_envelopes,
                description,
            } => {
                assert_eq!(captured_at_ms, 2222222222);
                assert_eq!(total_envelopes, 300);
                assert_eq!(description, None);
            }
            _ => panic!("Expected ReplayMetadata from factory"),
        }
    }

    #[test]
    fn test_start_agent_factory_with_all_params() {
        let msg = BridgeMessage::start_agent(
            "cargo".to_string(),
            vec!["run".to_string(), "--release".to_string()],
            Some("/project".to_string()),
            vec![
                ("RUST_LOG".to_string(), "debug".to_string()),
                ("CARGO_TERM".to_string(), "color".to_string()),
            ],
        );

        match msg {
            BridgeMessage::StartAgent {
                command,
                args,
                cwd,
                env,
            } => {
                assert_eq!(command, "cargo");
                assert_eq!(args, vec!["run", "--release"]);
                assert_eq!(cwd, Some("/project".to_string()));
                assert_eq!(
                    env,
                    vec![
                        ("RUST_LOG".to_string(), "debug".to_string()),
                        ("CARGO_TERM".to_string(), "color".to_string())
                    ]
                );
            }
            _ => panic!("Expected StartAgent from factory"),
        }
    }

    #[test]
    fn test_start_agent_factory_minimal() {
        let msg = BridgeMessage::start_agent("echo".to_string(), vec![], None, vec![]);

        match msg {
            BridgeMessage::StartAgent {
                command,
                args,
                cwd,
                env,
            } => {
                assert_eq!(command, "echo");
                assert!(args.is_empty());
                assert_eq!(cwd, None);
                assert!(env.is_empty());
            }
            _ => panic!("Expected StartAgent from factory"),
        }
    }

    // ========================================================================
    // Tests for ymir protocol message variants - construction and pattern matching
    // ========================================================================

    #[test]
    fn test_workspace_event_variant() {
        let payload = json!({"type": "WorkspaceCreated", "workspaceId": "ws-1"});
        let msg = BridgeMessage::WorkspaceEvent {
            payload: payload.clone(),
        };

        match msg {
            BridgeMessage::WorkspaceEvent { payload: p } => {
                assert_eq!(p, payload);
            }
            _ => panic!("Expected WorkspaceEvent variant"),
        }
    }

    #[test]
    fn test_worktree_event_variant() {
        let payload = json!({"type": "WorktreeCreated", "worktreeId": "wt-1"});
        let msg = BridgeMessage::WorktreeEvent {
            payload: payload.clone(),
        };

        match msg {
            BridgeMessage::WorktreeEvent { payload: p } => {
                assert_eq!(p, payload);
            }
            _ => panic!("Expected WorktreeEvent variant"),
        }
    }

    #[test]
    fn test_git_response_variant() {
        let payload = json!({"worktreeId": "wt-1", "entries": []});
        let msg = BridgeMessage::GitResponse {
            payload: payload.clone(),
        };

        match msg {
            BridgeMessage::GitResponse { payload: p } => {
                assert_eq!(p, payload);
            }
            _ => panic!("Expected GitResponse variant"),
        }
    }

    #[test]
    fn test_file_response_variant() {
        let payload = json!({"worktreeId": "wt-1", "path": "src/main.rs", "content": "..."});
        let msg = BridgeMessage::FileResponse {
            payload: payload.clone(),
        };

        match msg {
            BridgeMessage::FileResponse { payload: p } => {
                assert_eq!(p, payload);
            }
            _ => panic!("Expected FileResponse variant"),
        }
    }

    #[test]
    fn test_agent_event_variant() {
        let payload = json!({"id": "sess-1", "worktreeId": "wt-1", "status": "Working"});
        let msg = BridgeMessage::AgentEvent {
            payload: payload.clone(),
        };

        match msg {
            BridgeMessage::AgentEvent { payload: p } => {
                assert_eq!(p, payload);
            }
            _ => panic!("Expected AgentEvent variant"),
        }
    }

    #[test]
    fn test_terminal_event_variant() {
        let payload = json!({"sessionId": "pty-1", "data": "output"});
        let msg = BridgeMessage::TerminalEvent {
            payload: payload.clone(),
        };

        match msg {
            BridgeMessage::TerminalEvent { payload: p } => {
                assert_eq!(p, payload);
            }
            _ => panic!("Expected TerminalEvent variant"),
        }
    }

    #[test]
    fn test_state_snapshot_variant() {
        let payload = json!({"requestId": "req-1", "workspaces": [], "worktrees": []});
        let msg = BridgeMessage::StateSnapshot {
            payload: payload.clone(),
        };

        match msg {
            BridgeMessage::StateSnapshot { payload: p } => {
                assert_eq!(p, payload);
            }
            _ => panic!("Expected StateSnapshot variant"),
        }
    }

    #[test]
    fn test_notification_variant() {
        let payload = json!({"level": "Info", "title": "Test", "message": "Hello"});
        let msg = BridgeMessage::Notification {
            payload: payload.clone(),
        };

        match msg {
            BridgeMessage::Notification { payload: p } => {
                assert_eq!(p, payload);
            }
            _ => panic!("Expected Notification variant"),
        }
    }

    #[test]
    fn test_error_response_variant() {
        let payload = json!({"code": "test_error", "message": "Something failed"});
        let msg = BridgeMessage::ErrorResponse {
            payload: payload.clone(),
        };

        match msg {
            BridgeMessage::ErrorResponse { payload: p } => {
                assert_eq!(p, payload);
            }
            _ => panic!("Expected ErrorResponse variant"),
        }
    }

    #[test]
    fn test_ack_variant() {
        let payload = json!({"messageId": "msg-1", "status": "Success"});
        let msg = BridgeMessage::Ack {
            payload: payload.clone(),
        };

        match msg {
            BridgeMessage::Ack { payload: p } => {
                assert_eq!(p, payload);
            }
            _ => panic!("Expected Ack variant"),
        }
    }

    #[test]
    fn test_ping_variant() {
        let payload = json!({"timestamp": 1234567890});
        let msg = BridgeMessage::Ping {
            payload: payload.clone(),
        };

        match msg {
            BridgeMessage::Ping { payload: p } => {
                assert_eq!(p, payload);
            }
            _ => panic!("Expected Ping variant"),
        }
    }

    #[test]
    fn test_pong_variant() {
        let payload = json!({"timestamp": 1234567890});
        let msg = BridgeMessage::Pong {
            payload: payload.clone(),
        };

        match msg {
            BridgeMessage::Pong { payload: p } => {
                assert_eq!(p, payload);
            }
            _ => panic!("Expected Pong variant"),
        }
    }

    // ========================================================================
    // Tests for ymir protocol factory methods
    // ========================================================================

    #[test]
    fn test_workspace_event_factory() {
        let payload = json!({"workspaceId": "ws-1"});
        let msg = BridgeMessage::workspace_event(payload.clone());

        match msg {
            BridgeMessage::WorkspaceEvent { payload: p } => {
                assert_eq!(p, payload);
            }
            _ => panic!("Expected WorkspaceEvent from factory"),
        }
    }

    #[test]
    fn test_worktree_event_factory() {
        let payload = json!({"worktreeId": "wt-1"});
        let msg = BridgeMessage::worktree_event(payload.clone());

        match msg {
            BridgeMessage::WorktreeEvent { payload: p } => {
                assert_eq!(p, payload);
            }
            _ => panic!("Expected WorktreeEvent from factory"),
        }
    }

    #[test]
    fn test_git_response_factory() {
        let payload = json!({"diff": ""});
        let msg = BridgeMessage::git_response(payload.clone());

        match msg {
            BridgeMessage::GitResponse { payload: p } => {
                assert_eq!(p, payload);
            }
            _ => panic!("Expected GitResponse from factory"),
        }
    }

    #[test]
    fn test_file_response_factory() {
        let payload = json!({"content": "file contents"});
        let msg = BridgeMessage::file_response(payload.clone());

        match msg {
            BridgeMessage::FileResponse { payload: p } => {
                assert_eq!(p, payload);
            }
            _ => panic!("Expected FileResponse from factory"),
        }
    }

    #[test]
    fn test_agent_event_factory() {
        let payload = json!({"status": "Idle"});
        let msg = BridgeMessage::agent_event(payload.clone());

        match msg {
            BridgeMessage::AgentEvent { payload: p } => {
                assert_eq!(p, payload);
            }
            _ => panic!("Expected AgentEvent from factory"),
        }
    }

    #[test]
    fn test_terminal_event_factory() {
        let payload = json!({"sessionId": "pty-1", "data": "hello"});
        let msg = BridgeMessage::terminal_event(payload.clone());

        match msg {
            BridgeMessage::TerminalEvent { payload: p } => {
                assert_eq!(p, payload);
            }
            _ => panic!("Expected TerminalEvent from factory"),
        }
    }

    #[test]
    fn test_state_snapshot_factory() {
        let payload = json!({"workspaces": [], "settings": []});
        let msg = BridgeMessage::state_snapshot(payload.clone());

        match msg {
            BridgeMessage::StateSnapshot { payload: p } => {
                assert_eq!(p, payload);
            }
            _ => panic!("Expected StateSnapshot from factory"),
        }
    }

    #[test]
    fn test_notification_factory() {
        let payload = json!({"level": "Warning", "title": "Warning", "message": "Careful"});
        let msg = BridgeMessage::notification(payload.clone());

        match msg {
            BridgeMessage::Notification { payload: p } => {
                assert_eq!(p, payload);
            }
            _ => panic!("Expected Notification from factory"),
        }
    }

    #[test]
    fn test_error_response_factory() {
        let payload = json!({"code": "fatal", "message": "Crash"});
        let msg = BridgeMessage::error_response(payload.clone());

        match msg {
            BridgeMessage::ErrorResponse { payload: p } => {
                assert_eq!(p, payload);
            }
            _ => panic!("Expected ErrorResponse from factory"),
        }
    }

    #[test]
    fn test_ack_factory() {
        let payload = json!({"messageId": "msg-1", "status": "Error", "error": "fail"});
        let msg = BridgeMessage::ack(payload.clone());

        match msg {
            BridgeMessage::Ack { payload: p } => {
                assert_eq!(p, payload);
            }
            _ => panic!("Expected Ack from factory"),
        }
    }

    #[test]
    fn test_ping_factory() {
        let payload = json!({"timestamp": 9999});
        let msg = BridgeMessage::ping(payload.clone());

        match msg {
            BridgeMessage::Ping { payload: p } => {
                assert_eq!(p, payload);
            }
            _ => panic!("Expected Ping from factory"),
        }
    }

    #[test]
    fn test_pong_factory() {
        let payload = json!({"timestamp": 9999});
        let msg = BridgeMessage::pong(payload.clone());

        match msg {
            BridgeMessage::Pong { payload: p } => {
                assert_eq!(p, payload);
            }
            _ => panic!("Expected Pong from factory"),
        }
    }

    // ========================================================================
    // Tests using MessageBuilder from test_utils
    // ========================================================================

    #[test]
    fn test_message_builder_acp_payload() {
        let msg = MessageBuilder::acp_payload(json!({"test": "builder"}));

        match msg {
            BridgeMessage::AcpPayload { payload } => {
                assert_eq!(payload, json!({"test": "builder"}));
            }
            _ => panic!("Expected AcpPayload from MessageBuilder"),
        }
    }

    #[test]
    fn test_message_builder_acp_request() {
        let msg = MessageBuilder::acp_request("initialize", json!({"protocolVersion": "1.0"}));

        match msg {
            BridgeMessage::AcpPayload { payload } => {
                assert_eq!(payload["method"], "initialize");
                assert_eq!(payload["params"]["protocolVersion"], "1.0");
                assert_eq!(payload["jsonrpc"], "2.0");
                assert!(payload["id"].is_number());
            }
            _ => panic!("Expected AcpPayload from MessageBuilder::acp_request"),
        }
    }

    #[test]
    fn test_message_builder_bridge_status() {
        let msg = MessageBuilder::bridge_status(BridgeStatus::Starting);

        match msg {
            BridgeMessage::BridgeStatus { status } => {
                assert_eq!(status, BridgeStatus::Starting);
            }
            _ => panic!("Expected BridgeStatus from MessageBuilder"),
        }
    }

    #[test]
    fn test_message_builder_stderr() {
        let msg = MessageBuilder::stderr("Builder error");

        match msg {
            BridgeMessage::Stderr { line } => {
                assert_eq!(line, "Builder error");
            }
            _ => panic!("Expected Stderr from MessageBuilder"),
        }
    }

    #[test]
    fn test_message_builder_process_exit_with_params() {
        let msg = MessageBuilder::process_exit(Some(1), Some("SIGTERM"));

        match msg {
            BridgeMessage::ProcessExit { code, signal } => {
                assert_eq!(code, Some(1));
                assert_eq!(signal, Some("SIGTERM".to_string()));
            }
            _ => panic!("Expected ProcessExit from MessageBuilder"),
        }
    }

    #[test]
    fn test_message_builder_process_exit_without_params() {
        let msg = MessageBuilder::process_exit(None, None);

        match msg {
            BridgeMessage::ProcessExit { code, signal } => {
                assert_eq!(code, None);
                assert_eq!(signal, None);
            }
            _ => panic!("Expected ProcessExit from MessageBuilder"),
        }
    }

    #[test]
    fn test_message_builder_replay_metadata_with_description() {
        let msg = MessageBuilder::replay_metadata(3333333333, 400, Some("Builder session"));

        match msg {
            BridgeMessage::ReplayMetadata {
                captured_at_ms,
                total_envelopes,
                description,
            } => {
                assert_eq!(captured_at_ms, 3333333333);
                assert_eq!(total_envelopes, 400);
                assert_eq!(description, Some("Builder session".to_string()));
            }
            _ => panic!("Expected ReplayMetadata from MessageBuilder"),
        }
    }

    #[test]
    fn test_message_builder_replay_metadata_without_description() {
        let msg = MessageBuilder::replay_metadata(4444444444, 500, None);

        match msg {
            BridgeMessage::ReplayMetadata {
                captured_at_ms,
                total_envelopes,
                description,
            } => {
                assert_eq!(captured_at_ms, 4444444444);
                assert_eq!(total_envelopes, 500);
                assert_eq!(description, None);
            }
            _ => panic!("Expected ReplayMetadata from MessageBuilder"),
        }
    }

    #[test]
    fn test_message_builder_start_agent_full() {
        let msg = MessageBuilder::start_agent(
            "npm",
            vec!["start", "--watch"],
            Some("/app"),
            vec![("NODE_ENV", "development")],
        );

        match msg {
            BridgeMessage::StartAgent {
                command,
                args,
                cwd,
                env,
            } => {
                assert_eq!(command, "npm");
                assert_eq!(args, vec!["start", "--watch"]);
                assert_eq!(cwd, Some("/app".to_string()));
                assert_eq!(
                    env,
                    vec![("NODE_ENV".to_string(), "development".to_string())]
                );
            }
            _ => panic!("Expected StartAgent from MessageBuilder"),
        }
    }

    #[test]
    fn test_message_builder_start_agent_minimal() {
        let msg = MessageBuilder::start_agent("ls", vec![], None, vec![]);

        match msg {
            BridgeMessage::StartAgent {
                command,
                args,
                cwd,
                env,
            } => {
                assert_eq!(command, "ls");
                assert!(args.is_empty());
                assert_eq!(cwd, None);
                assert!(env.is_empty());
            }
            _ => panic!("Expected StartAgent from MessageBuilder"),
        }
    }

    // ========================================================================
    // Tests for BridgeStatus enum variants
    // ========================================================================

    #[test]
    fn test_bridge_status_starting() {
        let status = BridgeStatus::Starting;
        assert_eq!(status, BridgeStatus::Starting);
    }

    #[test]
    fn test_bridge_status_connected() {
        let status = BridgeStatus::Connected;
        assert_eq!(status, BridgeStatus::Connected);
    }

    #[test]
    fn test_bridge_status_disconnected() {
        let status = BridgeStatus::Disconnected;
        assert_eq!(status, BridgeStatus::Disconnected);
    }

    #[test]
    fn test_bridge_status_reconnecting() {
        let status = BridgeStatus::Reconnecting;
        assert_eq!(status, BridgeStatus::Reconnecting);
    }

    #[test]
    fn test_bridge_status_error_equality() {
        let status1 = BridgeStatus::Error;
        let status2 = BridgeStatus::Error;
        assert_eq!(status1, status2);
    }

    #[test]
    fn test_bridge_status_not_equal_different_variants() {
        assert_ne!(BridgeStatus::Starting, BridgeStatus::Connected);
        assert_ne!(BridgeStatus::Connected, BridgeStatus::Disconnected);
        assert_ne!(BridgeStatus::Disconnected, BridgeStatus::Reconnecting);
        assert_ne!(BridgeStatus::Reconnecting, BridgeStatus::Error);
    }

    #[test]
    fn test_bridge_status_clone() {
        let status = BridgeStatus::Connected;
        let cloned = status.clone();
        assert_eq!(status, cloned);
    }

    #[test]
    fn test_bridge_status_debug() {
        let status = BridgeStatus::Reconnecting;
        let debug_str = format!("{:?}", status);
        assert!(debug_str.contains("Reconnecting"));
    }

    // ========================================================================
    // Tests for serialization/deserialization
    // ========================================================================

    #[test]
    fn test_serialization_acp_payload() {
        let msg = BridgeMessage::acp_payload(json!({"method": "test"}));
        let json = serde_json::to_string(&msg).expect("Failed to serialize");

        assert!(json.contains("\"type\":\"acp_payload\""));
        assert!(json.contains("\"method\":\"test\""));
    }

    #[test]
    fn test_serialization_bridge_status_starting() {
        let msg = BridgeMessage::bridge_status(BridgeStatus::Starting);
        let json = serde_json::to_string(&msg).expect("Failed to serialize");

        assert!(json.contains("\"type\":\"bridge_status\""));
        assert!(json.contains("\"status\":\"starting\""));
    }

    #[test]
    fn test_serialization_bridge_status_connected() {
        let msg = BridgeMessage::bridge_status(BridgeStatus::Connected);
        let json = serde_json::to_string(&msg).expect("Failed to serialize");

        assert!(json.contains("\"status\":\"connected\""));
    }

    #[test]
    fn test_serialization_bridge_status_disconnected() {
        let msg = BridgeMessage::bridge_status(BridgeStatus::Disconnected);
        let json = serde_json::to_string(&msg).expect("Failed to serialize");

        assert!(json.contains("\"status\":\"disconnected\""));
    }

    #[test]
    fn test_serialization_bridge_status_reconnecting() {
        let msg = BridgeMessage::bridge_status(BridgeStatus::Reconnecting);
        let json = serde_json::to_string(&msg).expect("Failed to serialize");

        assert!(json.contains("\"status\":\"reconnecting\""));
    }

    #[test]
    fn test_serialization_bridge_status_error() {
        let msg = BridgeMessage::bridge_status(BridgeStatus::Error);
        let json = serde_json::to_string(&msg).expect("Failed to serialize");

        assert!(json.contains("\"status\":\"error\""));
    }

    #[test]
    fn test_serialization_stderr() {
        let msg = BridgeMessage::stderr("Test error".to_string());
        let json = serde_json::to_string(&msg).expect("Failed to serialize");

        assert!(json.contains("\"type\":\"stderr\""));
        assert!(json.contains("\"line\":\"Test error\""));
    }

    #[test]
    fn test_serialization_process_exit_with_code() {
        let msg = BridgeMessage::process_exit(Some(1), None);
        let json = serde_json::to_string(&msg).expect("Failed to serialize");

        assert!(json.contains("\"type\":\"process_exit\""));
        assert!(json.contains("\"code\":1"));
    }

    #[test]
    fn test_serialization_process_exit_with_signal() {
        let msg = BridgeMessage::process_exit(None, Some("SIGTERM".to_string()));
        let json = serde_json::to_string(&msg).expect("Failed to serialize");

        assert!(json.contains("\"type\":\"process_exit\""));
        assert!(json.contains("\"signal\":\"SIGTERM\""));
    }

    #[test]
    fn test_serialization_replay_metadata_with_description() {
        let msg = BridgeMessage::replay_metadata(1234567890, 100, Some("Test".to_string()));
        let json = serde_json::to_string(&msg).expect("Failed to serialize");

        assert!(json.contains("\"type\":\"replay_metadata\""));
        assert!(json.contains("\"captured_at_ms\":1234567890"));
        assert!(json.contains("\"total_envelopes\":100"));
        assert!(json.contains("\"description\":\"Test\""));
    }

    #[test]
    fn test_serialization_replay_metadata_without_description() {
        let msg = BridgeMessage::replay_metadata(1234567890, 100, None);
        let json = serde_json::to_string(&msg).expect("Failed to serialize");

        assert!(json.contains("\"type\":\"replay_metadata\""));
        // Description should be omitted when None due to skip_serializing_if
    }

    #[test]
    fn test_serialization_start_agent() {
        let msg = BridgeMessage::start_agent(
            "node".to_string(),
            vec!["app.js".to_string()],
            Some("/app".to_string()),
            vec![("PORT".to_string(), "3000".to_string())],
        );
        let json = serde_json::to_string(&msg).expect("Failed to serialize");

        assert!(json.contains("\"type\":\"start_agent\""));
        assert!(json.contains("\"command\":\"node\""));
        assert!(json.contains("\"args\":[\"app.js\"]"));
    }

    #[test]
    fn test_deserialization_acp_payload() {
        let json = r#"{"type":"acp_payload","payload":{"method":"test"}}"#;
        let msg: BridgeMessage = serde_json::from_str(json).expect("Failed to deserialize");

        match msg {
            BridgeMessage::AcpPayload { payload } => {
                assert_eq!(payload["method"], "test");
            }
            _ => panic!("Expected AcpPayload after deserialization"),
        }
    }

    #[test]
    fn test_deserialization_bridge_status() {
        let json = r#"{"type":"bridge_status","status":"connected"}"#;
        let msg: BridgeMessage = serde_json::from_str(json).expect("Failed to deserialize");

        match msg {
            BridgeMessage::BridgeStatus { status } => {
                assert_eq!(status, BridgeStatus::Connected);
            }
            _ => panic!("Expected BridgeStatus after deserialization"),
        }
    }

    #[test]
    fn test_deserialization_stderr() {
        let json = r#"{"type":"stderr","line":"Error message"}"#;
        let msg: BridgeMessage = serde_json::from_str(json).expect("Failed to deserialize");

        match msg {
            BridgeMessage::Stderr { line } => {
                assert_eq!(line, "Error message");
            }
            _ => panic!("Expected Stderr after deserialization"),
        }
    }

    #[test]
    fn test_deserialization_process_exit_with_code() {
        let json = r#"{"type":"process_exit","code":127,"signal":null}"#;
        let msg: BridgeMessage = serde_json::from_str(json).expect("Failed to deserialize");

        match msg {
            BridgeMessage::ProcessExit { code, signal } => {
                assert_eq!(code, Some(127));
                assert_eq!(signal, None);
            }
            _ => panic!("Expected ProcessExit after deserialization"),
        }
    }

    #[test]
    fn test_deserialization_process_exit_with_signal() {
        let json = r#"{"type":"process_exit","code":null,"signal":"SIGKILL"}"#;
        let msg: BridgeMessage = serde_json::from_str(json).expect("Failed to deserialize");

        match msg {
            BridgeMessage::ProcessExit { code, signal } => {
                assert_eq!(code, None);
                assert_eq!(signal, Some("SIGKILL".to_string()));
            }
            _ => panic!("Expected ProcessExit after deserialization"),
        }
    }

    #[test]
    fn test_deserialization_replay_metadata_with_description() {
        let json = r#"{"type":"replay_metadata","captured_at_ms":1234567890,"total_envelopes":100,"description":"Test"}"#;
        let msg: BridgeMessage = serde_json::from_str(json).expect("Failed to deserialize");

        match msg {
            BridgeMessage::ReplayMetadata {
                captured_at_ms,
                total_envelopes,
                description,
            } => {
                assert_eq!(captured_at_ms, 1234567890);
                assert_eq!(total_envelopes, 100);
                assert_eq!(description, Some("Test".to_string()));
            }
            _ => panic!("Expected ReplayMetadata after deserialization"),
        }
    }

    #[test]
    fn test_deserialization_replay_metadata_without_description() {
        let json =
            r#"{"type":"replay_metadata","captured_at_ms":1234567890,"total_envelopes":100}"#;
        let msg: BridgeMessage = serde_json::from_str(json).expect("Failed to deserialize");

        match msg {
            BridgeMessage::ReplayMetadata {
                captured_at_ms,
                total_envelopes,
                description,
            } => {
                assert_eq!(captured_at_ms, 1234567890);
                assert_eq!(total_envelopes, 100);
                assert_eq!(description, None);
            }
            _ => panic!("Expected ReplayMetadata after deserialization"),
        }
    }

    #[test]
    fn test_deserialization_start_agent() {
        let json = r#"{"type":"start_agent","command":"node","args":["app.js"],"cwd":"/app","env":[["NODE_ENV","test"]]}"#;
        let msg: BridgeMessage = serde_json::from_str(json).expect("Failed to deserialize");

        match msg {
            BridgeMessage::StartAgent {
                command,
                args,
                cwd,
                env,
            } => {
                assert_eq!(command, "node");
                assert_eq!(args, vec!["app.js"]);
                assert_eq!(cwd, Some("/app".to_string()));
                assert_eq!(env, vec![("NODE_ENV".to_string(), "test".to_string())]);
            }
            _ => panic!("Expected StartAgent after deserialization"),
        }
    }

    // ========================================================================
    // Tests for round-trip serialization
    // ========================================================================

    #[test]
    fn test_roundtrip_acp_payload() {
        let original = BridgeMessage::acp_payload(json!({"key": "value", "num": 42}));
        let json = serde_json::to_string(&original).unwrap();
        let deserialized: BridgeMessage = serde_json::from_str(&json).unwrap();

        match (original, deserialized) {
            (
                BridgeMessage::AcpPayload { payload: orig },
                BridgeMessage::AcpPayload { payload: deser },
            ) => {
                assert_eq!(orig, deser);
            }
            _ => panic!("Round-trip failed"),
        }
    }

    #[test]
    fn test_roundtrip_bridge_status() {
        let original = BridgeMessage::bridge_status(BridgeStatus::Reconnecting);
        let json = serde_json::to_string(&original).unwrap();
        let deserialized: BridgeMessage = serde_json::from_str(&json).unwrap();

        match (original, deserialized) {
            (
                BridgeMessage::BridgeStatus {
                    status: orig_status,
                },
                BridgeMessage::BridgeStatus {
                    status: deser_status,
                },
            ) => {
                assert_eq!(orig_status, deser_status);
            }
            _ => panic!("Round-trip failed"),
        }
    }

    #[test]
    fn test_roundtrip_stderr() {
        let original = BridgeMessage::stderr("Error line".to_string());
        let json = serde_json::to_string(&original).unwrap();
        let deserialized: BridgeMessage = serde_json::from_str(&json).unwrap();

        match (original, deserialized) {
            (
                BridgeMessage::Stderr { line: orig_line },
                BridgeMessage::Stderr { line: deser_line },
            ) => {
                assert_eq!(orig_line, deser_line);
            }
            _ => panic!("Round-trip failed"),
        }
    }

    #[test]
    fn test_roundtrip_process_exit() {
        let original = BridgeMessage::process_exit(Some(1), Some("SIGTERM".to_string()));
        let json = serde_json::to_string(&original).unwrap();
        let deserialized: BridgeMessage = serde_json::from_str(&json).unwrap();

        match (original, deserialized) {
            (
                BridgeMessage::ProcessExit {
                    code: orig_code,
                    signal: orig_signal,
                },
                BridgeMessage::ProcessExit {
                    code: deser_code,
                    signal: deser_signal,
                },
            ) => {
                assert_eq!(orig_code, deser_code);
                assert_eq!(orig_signal, deser_signal);
            }
            _ => panic!("Round-trip failed"),
        }
    }

    #[test]
    fn test_roundtrip_replay_metadata() {
        let original = BridgeMessage::replay_metadata(1234567890, 100, Some("Session".to_string()));
        let json = serde_json::to_string(&original).unwrap();
        let deserialized: BridgeMessage = serde_json::from_str(&json).unwrap();

        match (original, deserialized) {
            (
                BridgeMessage::ReplayMetadata {
                    captured_at_ms: orig_ts,
                    total_envelopes: orig_total,
                    description: orig_desc,
                },
                BridgeMessage::ReplayMetadata {
                    captured_at_ms: deser_ts,
                    total_envelopes: deser_total,
                    description: deser_desc,
                },
            ) => {
                assert_eq!(orig_ts, deser_ts);
                assert_eq!(orig_total, deser_total);
                assert_eq!(orig_desc, deser_desc);
            }
            _ => panic!("Round-trip failed"),
        }
    }

    #[test]
    fn test_roundtrip_start_agent() {
        let original = BridgeMessage::start_agent(
            "node".to_string(),
            vec!["app.js".to_string()],
            Some("/app".to_string()),
            vec![("PORT".to_string(), "3000".to_string())],
        );
        let json = serde_json::to_string(&original).unwrap();
        let deserialized: BridgeMessage = serde_json::from_str(&json).unwrap();

        match (original, deserialized) {
            (
                BridgeMessage::StartAgent {
                    command: orig_cmd,
                    args: orig_args,
                    cwd: orig_cwd,
                    env: orig_env,
                },
                BridgeMessage::StartAgent {
                    command: deser_cmd,
                    args: deser_args,
                    cwd: deser_cwd,
                    env: deser_env,
                },
            ) => {
                assert_eq!(orig_cmd, deser_cmd);
                assert_eq!(orig_args, deser_args);
                assert_eq!(orig_cwd, deser_cwd);
                assert_eq!(orig_env, deser_env);
            }
            _ => panic!("Round-trip failed"),
        }
    }

    // ========================================================================
    // Tests for Clone trait
    // ========================================================================

    #[test]
    fn test_clone_acp_payload() {
        let msg = BridgeMessage::acp_payload(json!({"test": true}));
        let cloned = msg.clone();

        match (msg, cloned) {
            (
                BridgeMessage::AcpPayload { payload: orig },
                BridgeMessage::AcpPayload { payload: cloned },
            ) => {
                assert_eq!(orig, cloned);
            }
            _ => panic!("Clone failed"),
        }
    }

    #[test]
    fn test_clone_bridge_status() {
        let msg = BridgeMessage::bridge_status(BridgeStatus::Connected);
        let cloned = msg.clone();
        assert_eq!(msg, cloned);
    }

    #[test]
    fn test_clone_stderr() {
        let msg = BridgeMessage::stderr("test".to_string());
        let cloned = msg.clone();
        assert_eq!(msg, cloned);
    }

    #[test]
    fn test_clone_process_exit() {
        let msg = BridgeMessage::process_exit(Some(1), Some("SIGTERM".to_string()));
        let cloned = msg.clone();
        assert_eq!(msg, cloned);
    }

    #[test]
    fn test_clone_replay_metadata() {
        let msg = BridgeMessage::replay_metadata(123, 456, Some("desc".to_string()));
        let cloned = msg.clone();
        assert_eq!(msg, cloned);
    }

    #[test]
    fn test_clone_start_agent() {
        let msg = BridgeMessage::start_agent(
            "cmd".to_string(),
            vec!["arg".to_string()],
            Some("/cwd".to_string()),
            vec![("k".to_string(), "v".to_string())],
        );
        let cloned = msg.clone();
        assert_eq!(msg, cloned);
    }

    #[test]
    fn test_clone_workspace_event() {
        let msg = BridgeMessage::workspace_event(json!({"workspaceId": "ws-1"}));
        let cloned = msg.clone();
        assert_eq!(msg, cloned);
    }

    #[test]
    fn test_clone_worktree_event() {
        let msg = BridgeMessage::worktree_event(json!({"worktreeId": "wt-1"}));
        let cloned = msg.clone();
        assert_eq!(msg, cloned);
    }

    #[test]
    fn test_clone_git_response() {
        let msg = BridgeMessage::git_response(json!({"diff": ""}));
        let cloned = msg.clone();
        assert_eq!(msg, cloned);
    }

    #[test]
    fn test_clone_file_response() {
        let msg = BridgeMessage::file_response(json!({"content": "data"}));
        let cloned = msg.clone();
        assert_eq!(msg, cloned);
    }

    #[test]
    fn test_clone_agent_event() {
        let msg = BridgeMessage::agent_event(json!({"status": "Working"}));
        let cloned = msg.clone();
        assert_eq!(msg, cloned);
    }

    #[test]
    fn test_clone_terminal_event() {
        let msg = BridgeMessage::terminal_event(json!({"sessionId": "pty-1"}));
        let cloned = msg.clone();
        assert_eq!(msg, cloned);
    }

    #[test]
    fn test_clone_state_snapshot() {
        let msg = BridgeMessage::state_snapshot(json!({"workspaces": []}));
        let cloned = msg.clone();
        assert_eq!(msg, cloned);
    }

    #[test]
    fn test_clone_notification() {
        let msg =
            BridgeMessage::notification(json!({"level": "Info", "title": "T", "message": "M"}));
        let cloned = msg.clone();
        assert_eq!(msg, cloned);
    }

    #[test]
    fn test_clone_error_response() {
        let msg = BridgeMessage::error_response(json!({"code": "err", "message": "fail"}));
        let cloned = msg.clone();
        assert_eq!(msg, cloned);
    }

    #[test]
    fn test_clone_ack() {
        let msg = BridgeMessage::ack(json!({"messageId": "m1", "status": "Success"}));
        let cloned = msg.clone();
        assert_eq!(msg, cloned);
    }

    #[test]
    fn test_clone_ping() {
        let msg = BridgeMessage::ping(json!({"timestamp": 123}));
        let cloned = msg.clone();
        assert_eq!(msg, cloned);
    }

    #[test]
    fn test_clone_pong() {
        let msg = BridgeMessage::pong(json!({"timestamp": 456}));
        let cloned = msg.clone();
        assert_eq!(msg, cloned);
    }

    // ========================================================================
    // Tests for Debug trait
    // ========================================================================

    #[test]
    fn test_debug_acp_payload() {
        let msg = BridgeMessage::acp_payload(json!({"test": true}));
        let debug_str = format!("{:?}", msg);
        assert!(debug_str.contains("AcpPayload"));
    }

    #[test]
    fn test_debug_bridge_status() {
        let msg = BridgeMessage::bridge_status(BridgeStatus::Error);
        let debug_str = format!("{:?}", msg);
        assert!(debug_str.contains("BridgeStatus"));
    }

    #[test]
    fn test_debug_all_variants() {
        let messages = vec![
            BridgeMessage::acp_payload(json!({})),
            BridgeMessage::bridge_status(BridgeStatus::Starting),
            BridgeMessage::stderr("test".to_string()),
            BridgeMessage::process_exit(Some(0), None),
            BridgeMessage::replay_metadata(0, 0, None),
            BridgeMessage::start_agent("cmd".to_string(), vec![], None, vec![]),
            BridgeMessage::workspace_event(json!({})),
            BridgeMessage::worktree_event(json!({})),
            BridgeMessage::git_response(json!({})),
            BridgeMessage::file_response(json!({})),
            BridgeMessage::agent_event(json!({})),
            BridgeMessage::terminal_event(json!({})),
            BridgeMessage::state_snapshot(json!({})),
            BridgeMessage::notification(json!({})),
            BridgeMessage::error_response(json!({})),
            BridgeMessage::ack(json!({})),
            BridgeMessage::ping(json!({})),
            BridgeMessage::pong(json!({})),
        ];

        for msg in messages {
            let debug_str = format!("{:?}", msg);
            assert!(!debug_str.is_empty(), "Debug output should not be empty");
        }
    }
}
