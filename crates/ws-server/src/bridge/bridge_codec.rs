//! Bridge codec: unified encoder/decoder for BridgeEnvelope conversions.
//!
//! This module provides the primary conversion functions between the server's
//! native protocol types (`ServerMessagePayload`/`ClientMessagePayload`) and
//! the bridge wire format (`BridgeMessage`/`BridgeEnvelope`).
//!
//! ## Server -> Client (Encoding)
//!
//! `server_message_to_bridge` converts a `ServerMessagePayload` into a
//! `BridgeEnvelope` ready for JSON serialization. Each payload variant is
//! mapped to the corresponding `BridgeMessage` discriminant with the payload
//! data serialized as structured JSON.
//!
//! ## Client -> Server (Decoding)
//!
//! `client_message_from_bridge` converts an incoming `BridgeMessage` back
//! into a typed `ClientMessagePayload` for routing to existing handlers.
//! Returns `None` for message types that are not client requests (e.g.,
//! AcpPayload, StartAgent, or server-to-client passthrough types).

use harms_haus_acp_ws_bridge::contract::{BridgeEnvelope, BridgeMessage};

use crate::protocol::{ClientMessagePayload, ServerMessagePayload};

// Re-export the lower-level helpers for advanced use cases.
pub use super::decoder::{decode_bridge_message, extract_payload};
pub use super::encoder::server_message_to_envelope;

/// Converts a `ServerMessagePayload` into a `BridgeEnvelope` for JSON wire
/// serialization.
///
/// Each `ServerMessagePayload` variant is mapped to the corresponding
/// `BridgeMessage` variant with the payload data serialized as structured
/// JSON via `serde_json::to_value`. The resulting envelope uses the current
/// envelope version and live-mode sequence number (zero).
///
/// # Example
/// ```ignore
/// let payload = ServerMessagePayload::Pong(Pong { timestamp: 12345 });
/// let envelope = server_message_to_bridge(payload, now_ms());
/// let json = serde_json::to_string(&envelope)?;
/// socket.send(Message::Text(json)).await?;
/// ```
pub fn server_message_to_bridge(
    payload: ServerMessagePayload,
    timestamp_ms: u64,
) -> BridgeEnvelope {
    let bridge_message = payload_to_bridge_message(&payload);
    BridgeEnvelope::new(bridge_message, timestamp_ms)
}

/// Converts an incoming `BridgeMessage` into a typed `ClientMessagePayload`
/// for routing to existing handlers.
///
/// Returns `None` for message types that are not client requests:
/// - `AcpPayload` — handled by the ACP runtime directly
/// - `StartAgent` — handled by process spawning
/// - Server-to-client passthrough types (WorkspaceEvent, AgentEvent, etc.)
///
/// # Example
/// ```ignore
/// if let Some(payload) = client_message_from_bridge(&message) {
///     let client_msg = ClientMessage::new(payload);
///     route_message(state, client_id, client_msg).await;
/// }
/// ```
pub fn client_message_from_bridge(message: &BridgeMessage) -> Option<ClientMessagePayload> {
    bridge_message_to_client_payload(message)
}

// ============================================================================
// Internal mapping functions
// ============================================================================

/// Maps a ServerMessagePayload variant to the corresponding BridgeMessage variant.
///
/// The payload data is serialized to `serde_json::Value` for transport in the
/// BridgeEnvelope. The bridge does not interpret or modify the payload contents.
fn payload_to_bridge_message(payload: &ServerMessagePayload) -> BridgeMessage {
    match payload {
        // ACP wire events pass through as raw ACP payloads
        ServerMessagePayload::AcpWireEvent(envelope) => BridgeMessage::AcpPayload {
            payload: serde_json::to_value(envelope).unwrap_or_default(),
        },

        // Workspace lifecycle events
        ServerMessagePayload::WorkspaceCreated(_) => BridgeMessage::WorkspaceEvent {
            payload: serde_json::to_value(payload).unwrap_or_default(),
        },
        ServerMessagePayload::WorkspaceDeleted(_) => BridgeMessage::WorkspaceEvent {
            payload: serde_json::to_value(payload).unwrap_or_default(),
        },
        ServerMessagePayload::WorkspaceRemoved(_) => BridgeMessage::WorkspaceEvent {
            payload: serde_json::to_value(payload).unwrap_or_default(),
        },
        ServerMessagePayload::WorkspaceUpdated(_) => BridgeMessage::WorkspaceEvent {
            payload: serde_json::to_value(payload).unwrap_or_default(),
        },

        // Worktree lifecycle events
        ServerMessagePayload::WorktreeCreated(_) => BridgeMessage::WorktreeEvent {
            payload: serde_json::to_value(payload).unwrap_or_default(),
        },
        ServerMessagePayload::WorktreeDeleted(_) => BridgeMessage::WorktreeEvent {
            payload: serde_json::to_value(payload).unwrap_or_default(),
        },
        ServerMessagePayload::WorktreeChanged(_) => BridgeMessage::WorktreeEvent {
            payload: serde_json::to_value(payload).unwrap_or_default(),
        },
        ServerMessagePayload::WorktreeUpdated(_) => BridgeMessage::WorktreeEvent {
            payload: serde_json::to_value(payload).unwrap_or_default(),
        },
        ServerMessagePayload::WorktreeListResult(_) => BridgeMessage::WorktreeEvent {
            payload: serde_json::to_value(payload).unwrap_or_default(),
        },
        ServerMessagePayload::WorktreeStatus(_) => BridgeMessage::WorktreeEvent {
            payload: serde_json::to_value(payload).unwrap_or_default(),
        },
        ServerMessagePayload::WorktreeDetailsResult(_) => BridgeMessage::WorktreeEvent {
            payload: serde_json::to_value(payload).unwrap_or_default(),
        },
        ServerMessagePayload::WorktreeUpdated(_) => BridgeMessage::WorktreeEvent {
            payload: serde_json::to_value(payload).unwrap_or_default(),
        },

        // Git operation responses
        ServerMessagePayload::GitStatusResult(_) => BridgeMessage::GitResponse {
            payload: serde_json::to_value(payload).unwrap_or_default(),
        },
        ServerMessagePayload::GitDiffResult(_) => BridgeMessage::GitResponse {
            payload: serde_json::to_value(payload).unwrap_or_default(),
        },
        ServerMessagePayload::GitListBranchesResult(_) => BridgeMessage::GitResponse {
            payload: serde_json::to_value(payload).unwrap_or_default(),
        },

        // File operation responses
        ServerMessagePayload::FileContent(_) => BridgeMessage::FileResponse {
            payload: serde_json::to_value(payload).unwrap_or_default(),
        },
        ServerMessagePayload::FileListResult(_) => BridgeMessage::FileResponse {
            payload: serde_json::to_value(payload).unwrap_or_default(),
        },

        // Agent lifecycle events
        ServerMessagePayload::AgentStatusUpdate(_) => BridgeMessage::AgentEvent {
            payload: serde_json::to_value(payload).unwrap_or_default(),
        },
        ServerMessagePayload::AgentOutput(_) => BridgeMessage::AgentEvent {
            payload: serde_json::to_value(payload).unwrap_or_default(),
        },
        ServerMessagePayload::AgentPrompt(_) => BridgeMessage::AgentEvent {
            payload: serde_json::to_value(payload).unwrap_or_default(),
        },
        ServerMessagePayload::AgentRemoved(_) => BridgeMessage::AgentEvent {
            payload: serde_json::to_value(payload).unwrap_or_default(),
        },
        ServerMessagePayload::AgentUpdated(_) => BridgeMessage::AgentEvent {
            payload: serde_json::to_value(payload).unwrap_or_default(),
        },

        // Terminal lifecycle events
        ServerMessagePayload::TerminalOutput(_) => BridgeMessage::TerminalEvent {
            payload: serde_json::to_value(payload).unwrap_or_default(),
        },
        ServerMessagePayload::TerminalCreated(_) => BridgeMessage::TerminalEvent {
            payload: serde_json::to_value(payload).unwrap_or_default(),
        },
        ServerMessagePayload::TerminalRemoved(_) => BridgeMessage::TerminalEvent {
            payload: serde_json::to_value(payload).unwrap_or_default(),
        },
        ServerMessagePayload::TerminalUpdated(_) => BridgeMessage::TerminalEvent {
            payload: serde_json::to_value(payload).unwrap_or_default(),
        },
        ServerMessagePayload::TerminalHistory(_) => BridgeMessage::TerminalEvent {
            payload: serde_json::to_value(payload).unwrap_or_default(),
        },
        ServerMessagePayload::TerminalMounted(_) => BridgeMessage::TerminalEvent {
            payload: serde_json::to_value(payload).unwrap_or_default(),
        },
        ServerMessagePayload::TerminalSessionEnded(_) => BridgeMessage::TerminalEvent {
            payload: serde_json::to_value(payload).unwrap_or_default(),
        },
        ServerMessagePayload::TerminalTabHistory(_) => BridgeMessage::TerminalEvent {
            payload: serde_json::to_value(payload).unwrap_or_default(),
        },
        ServerMessagePayload::TerminalTabList(_) => BridgeMessage::TerminalEvent {
            payload: serde_json::to_value(payload).unwrap_or_default(),
        },
        ServerMessagePayload::TerminalTabClosed(_) => BridgeMessage::TerminalEvent {
            payload: serde_json::to_value(payload).unwrap_or_default(),
        },

        // State snapshot
        ServerMessagePayload::StateSnapshot(data) => BridgeMessage::StateSnapshot {
            payload: serde_json::to_value(data).unwrap_or_default(),
        },

        // Notifications
        ServerMessagePayload::Notification(data) => BridgeMessage::Notification {
            payload: serde_json::to_value(data).unwrap_or_default(),
        },

        // Errors
        ServerMessagePayload::Error(data) => BridgeMessage::ErrorResponse {
            payload: serde_json::to_value(data).unwrap_or_default(),
        },

        // Acknowledgments
        ServerMessagePayload::Ack(data) => BridgeMessage::Ack {
            payload: serde_json::to_value(data).unwrap_or_default(),
        },

        // Heartbeat ping
        ServerMessagePayload::Ping(data) => BridgeMessage::Ping {
            payload: serde_json::to_value(data).unwrap_or_default(),
        },

        // Heartbeat pong
        ServerMessagePayload::Pong(data) => BridgeMessage::Pong {
            payload: serde_json::to_value(data).unwrap_or_default(),
        },
    }
}

/// Maps a BridgeMessage variant to a ClientMessagePayload for routing.
///
/// Returns None for message types that are not client requests (e.g., AcpPayload,
/// StartAgent, or server-to-client passthrough types).
///
/// For payload-carrying BridgeMessage variants, the inner payload is in the
/// `{type: "...", data: {...}}` format matching `ClientMessagePayload`'s
/// `#[serde(tag = "type", content = "data")]` serialization. We attempt direct
/// deserialization — if the type tag matches a client-side variant, we get the
/// typed payload; otherwise deserialization fails and we return None.
fn bridge_message_to_client_payload(message: &BridgeMessage) -> Option<ClientMessagePayload> {
    let payload = match message {
        // Messages that carry a payload field which might contain a client request.
        // The payload is the original {type, data} structure from the bridge envelope format.
        BridgeMessage::Ping { payload }
        | BridgeMessage::Pong { payload }
        | BridgeMessage::Ack { payload }
        | BridgeMessage::WorkspaceEvent { payload }
        | BridgeMessage::WorktreeEvent { payload }
        | BridgeMessage::GitResponse { payload }
        | BridgeMessage::FileResponse { payload }
        | BridgeMessage::AgentEvent { payload }
        | BridgeMessage::TerminalEvent { payload }
        | BridgeMessage::StateSnapshot { payload }
        | BridgeMessage::Notification { payload }
        | BridgeMessage::ErrorResponse { payload } => payload,

        // Messages that never carry client requests
        BridgeMessage::AcpPayload { .. }
        | BridgeMessage::StartAgent { .. }
        | BridgeMessage::BridgeStatus { .. }
        | BridgeMessage::Stderr { .. }
        | BridgeMessage::ProcessExit { .. }
        | BridgeMessage::ReplayMetadata { .. } => return None,
    };

    // Try to deserialize the payload as a ClientMessagePayload.
    // The payload is in {type: "...", data: {...}} format, which matches
    // the #[serde(tag = "type", content = "data")] format of ClientMessagePayload.
    // Server-only type tags (e.g., "StateSnapshot", "Error", "Notification")
    // will fail to deserialize, correctly returning None.
    serde_json::from_value(payload.clone()).ok()
}

#[cfg(test)]
mod tests {
    use super::*;
    use harms_haus_acp_ws_bridge::contract::ENVELOPE_VERSION;
    use uuid::Uuid;

    use crate::protocol::{Ack, Error, Notification, Ping, Pong, ServerMessage, StateSnapshot};

    fn test_timestamp() -> u64 {
        1234567890
    }

    // ========================================================================
    // Tests for server_message_to_bridge
    // ========================================================================

    #[test]
    fn test_server_message_to_bridge_envelope_version() {
        let payload = ServerMessagePayload::Pong(Pong { timestamp: 12345 });
        let envelope = server_message_to_bridge(payload, test_timestamp());

        assert_eq!(envelope.version, ENVELOPE_VERSION);
        assert_eq!(envelope.seq, 0);
        assert_eq!(envelope.timestamp_ms, test_timestamp());
        assert!(envelope.extra_data.is_none());
    }

    #[test]
    fn test_server_message_to_bridge_pong() {
        let payload = ServerMessagePayload::Pong(Pong { timestamp: 99999 });
        let envelope = server_message_to_bridge(payload, test_timestamp());

        match envelope.message {
            BridgeMessage::Pong { payload } => {
                assert_eq!(payload["timestamp"], 99999);
            }
            _ => panic!("Expected Pong BridgeMessage variant"),
        }
    }

    #[test]
    fn test_server_message_to_bridge_ping() {
        let payload = ServerMessagePayload::Ping(Ping { timestamp: 88888 });
        let envelope = server_message_to_bridge(payload, test_timestamp());

        match envelope.message {
            BridgeMessage::Ping { payload } => {
                assert_eq!(payload["timestamp"], 88888);
            }
            _ => panic!("Expected Ping BridgeMessage variant"),
        }
    }

    #[test]
    fn test_server_message_to_bridge_error() {
        let payload = ServerMessagePayload::Error(Error {
            code: "TEST_ERROR".to_string(),
            message: "Something went wrong".to_string(),
            details: Some("Extra details".to_string()),
            request_id: None,
        });
        let envelope = server_message_to_bridge(payload, test_timestamp());

        match envelope.message {
            BridgeMessage::ErrorResponse { payload } => {
                assert_eq!(payload["code"], "TEST_ERROR");
                assert_eq!(payload["message"], "Something went wrong");
            }
            _ => panic!("Expected ErrorResponse BridgeMessage variant"),
        }
    }

    #[test]
    fn test_server_message_to_bridge_ack() {
        let msg_id = Uuid::new_v4();
        let payload = ServerMessagePayload::Ack(Ack {
            message_id: msg_id,
            status: crate::protocol::AckStatus::Success,
        });
        let envelope = server_message_to_bridge(payload, test_timestamp());

        match envelope.message {
            BridgeMessage::Ack { payload } => {
                assert_eq!(payload["messageId"], msg_id.to_string());
                assert_eq!(payload["status"], "Success");
            }
            _ => panic!("Expected Ack BridgeMessage variant"),
        }
    }

    #[test]
    fn test_server_message_to_bridge_notification() {
        let payload = ServerMessagePayload::Notification(Notification {
            level: crate::protocol::NotificationLevel::Info,
            title: "Test".to_string(),
            message: "Test message".to_string(),
        });
        let envelope = server_message_to_bridge(payload, test_timestamp());

        match envelope.message {
            BridgeMessage::Notification { payload } => {
                assert_eq!(payload["level"], "Info");
                assert_eq!(payload["title"], "Test");
            }
            _ => panic!("Expected Notification BridgeMessage variant"),
        }
    }

    #[test]
    fn test_server_message_to_bridge_workspace_event() {
        let workspace = crate::protocol::WorkspaceData {
            id: Uuid::new_v4(),
            name: "test-workspace".to_string(),
            root_path: "/tmp/test".to_string(),
            color: None,
            icon: None,
            worktree_base_dir: None,
            agent: None,
            settings: None,
            created_at: 0,
            updated_at: 0,
        };
        let payload =
            ServerMessagePayload::WorkspaceCreated(crate::protocol::WorkspaceCreated { workspace });
        let envelope = server_message_to_bridge(payload, test_timestamp());

        match envelope.message {
            BridgeMessage::WorkspaceEvent { payload } => {
                assert_eq!(payload["type"], "WorkspaceCreated");
            }
            _ => panic!("Expected WorkspaceEvent BridgeMessage variant"),
        }
    }

    #[test]
    fn test_server_message_to_bridge_terminal_event() {
        let payload = ServerMessagePayload::TerminalOutput(crate::protocol::TerminalOutput {
            session_id: Uuid::new_v4(),
            data: "terminal output here".to_string(),
        });
        let envelope = server_message_to_bridge(payload, test_timestamp());

        match envelope.message {
            BridgeMessage::TerminalEvent { payload } => {
                assert_eq!(payload["type"], "TerminalOutput");
                assert_eq!(payload["data"]["data"], "terminal output here");
            }
            _ => panic!("Expected TerminalEvent BridgeMessage variant"),
        }
    }

    #[test]
    fn test_server_message_to_bridge_state_snapshot() {
        let payload = ServerMessagePayload::StateSnapshot(StateSnapshot {
            request_id: Uuid::new_v4(),
            workspaces: vec![],
            worktrees: vec![],
            agent_sessions: vec![],
            terminal_sessions: vec![],
            settings: vec![],
        });
        let envelope = server_message_to_bridge(payload, test_timestamp());

        match envelope.message {
            BridgeMessage::StateSnapshot { payload } => {
                assert!(payload["workspaces"].is_array());
            }
            _ => panic!("Expected StateSnapshot BridgeMessage variant"),
        }
    }

    #[test]
    fn test_server_message_to_bridge_acp_wire_event() {
        let payload =
            ServerMessagePayload::AcpWireEvent(crate::protocol::AcpEventEnvelope {
                sequence: 1,
                correlation_id: None,
                timestamp: 1234567890,
                event: crate::protocol::AcpEvent::PromptComplete(crate::protocol::AcpPromptComplete {
                    worktree_id: Uuid::new_v4(),
                    acp_session_id: "session-123".to_string(),
                    reason: crate::protocol::AcpPromptCompleteReason::Normal,
                }),
                agent_tab_id: None,
                worktree_id: None,
            });
        let bridge = server_message_to_bridge(payload, test_timestamp());

        match bridge.message {
            BridgeMessage::AcpPayload { .. } => {}
            _ => panic!("Expected AcpPayload BridgeMessage variant"),
        }
    }

    // ========================================================================
    // Tests for client_message_from_bridge
    // ========================================================================

    #[test]
    fn test_client_message_from_bridge_ping() {
        let ping_payload = serde_json::json!({
            "type": "Ping",
            "data": { "timestamp": 12345 }
        });
        let message = BridgeMessage::Ping {
            payload: ping_payload,
        };

        let result = client_message_from_bridge(&message);
        assert!(result.is_some());

        match result.unwrap() {
            ClientMessagePayload::Ping(ping) => {
                assert_eq!(ping.timestamp, 12345);
            }
            _ => panic!("Expected Ping payload"),
        }
    }

    #[test]
    fn test_client_message_from_bridge_acp_payload_returns_none() {
        let message = BridgeMessage::AcpPayload {
            payload: serde_json::json!({"jsonrpc": "2.0", "method": "initialize"}),
        };

        let result = client_message_from_bridge(&message);
        assert!(result.is_none());
    }

    #[test]
    fn test_client_message_from_bridge_start_agent_returns_none() {
        let message = BridgeMessage::StartAgent {
            command: "node".to_string(),
            args: vec!["script.js".to_string()],
            cwd: Some("/workspace".to_string()),
            env: vec![],
        };

        let result = client_message_from_bridge(&message);
        assert!(result.is_none());
    }

    #[test]
    fn test_client_message_from_bridge_server_types_return_none() {
        // Test a few server-to-client passthrough types
        let server_types = vec![
            BridgeMessage::BridgeStatus {
                status: harms_haus_acp_ws_bridge::contract::BridgeStatus::Connected,
            },
            BridgeMessage::Stderr {
                line: "error".to_string(),
            },
            BridgeMessage::ProcessExit {
                code: Some(0),
                signal: None,
            },
            BridgeMessage::ReplayMetadata {
                captured_at_ms: 1234567890,
                total_envelopes: 100,
                description: None,
            },
            BridgeMessage::WorkspaceEvent {
                payload: serde_json::json!({}),
            },
            BridgeMessage::Pong {
                payload: serde_json::json!({}),
            },
        ];

        for msg in server_types {
            let result = client_message_from_bridge(&msg);
            assert!(
                result.is_none(),
                "Expected None for {:?}",
                std::mem::discriminant(&msg)
            );
        }
    }

    // ========================================================================
    // Tests for full round-trip
    // ========================================================================

    #[test]
    fn test_full_json_roundtrip_pong() {
        let payload = ServerMessagePayload::Pong(Pong { timestamp: 42 });
        let envelope = server_message_to_bridge(payload, test_timestamp());

        let json = serde_json::to_string(&envelope).expect("Failed to serialize");
        let deserialized: BridgeEnvelope =
            serde_json::from_str(&json).expect("Failed to deserialize");

        assert_eq!(deserialized.version, ENVELOPE_VERSION);
        assert_eq!(deserialized.timestamp_ms, test_timestamp());
        assert!(matches!(deserialized.message, BridgeMessage::Pong { .. }));
    }

    #[test]
    fn test_full_json_roundtrip_error() {
        let payload = ServerMessagePayload::Error(Error {
            code: "TEST".to_string(),
            message: "fail".to_string(),
            details: None,
            request_id: None,
        });
        let envelope = server_message_to_bridge(payload, test_timestamp());

        let json = serde_json::to_string(&envelope).expect("Failed to serialize");
        let deserialized: BridgeEnvelope =
            serde_json::from_str(&json).expect("Failed to deserialize");

        match deserialized.message {
            BridgeMessage::ErrorResponse { payload } => {
                assert_eq!(payload["code"], "TEST");
            }
            _ => panic!("Expected ErrorResponse"),
        }
    }

    #[test]
    fn test_json_skips_extra_data_when_none() {
        let payload = ServerMessagePayload::Pong(Pong { timestamp: 12345 });
        let envelope = server_message_to_bridge(payload, test_timestamp());

        let json = serde_json::to_string(&envelope).expect("Failed to serialize");
        assert!(!json.contains("extraData"));
        assert!(!json.contains("extra_data"));
    }

    #[test]
    fn test_json_contains_type_discriminator() {
        let payload = ServerMessagePayload::Ack(Ack {
            message_id: Uuid::new_v4(),
            status: crate::protocol::AckStatus::Success,
        });
        let envelope = server_message_to_bridge(payload, test_timestamp());

        let json = serde_json::to_string(&envelope).expect("Failed to serialize");
        // BridgeMessage uses snake_case type discriminator
        assert!(json.contains("\"type\":\"ack\""));
    }

    // ========================================================================
    // Tests for all ServerMessagePayload variants
    // ========================================================================

    #[test]
    fn test_all_server_payload_variants_map_correctly() {
        use crate::protocol::{
            AgentOutput, AgentPrompt, AgentRemoved, AgentStatus, AgentStatusUpdate,
            AgentUpdated, FileContent, FileListResult, GitDiffResult, GitStatusResult,
            TerminalHistory, TerminalOutput, WorkspaceCreated, WorkspaceData, WorkspaceDeleted,
            WorkspaceUpdated, WorktreeChanged, WorktreeCreated, WorktreeData, WorktreeDeleted,
            WorktreeDetailsResult, WorktreeListResult, WorktreeStatus,
        };

        // Workspace variants -> WorkspaceEvent
        let ws = WorkspaceData {
            id: Uuid::new_v4(),
            name: "test".to_string(),
            root_path: "/tmp".to_string(),
            color: None,
            icon: None,
            worktree_base_dir: None,
            agent: None,
            settings: None,
            created_at: 0,
            updated_at: 0,
        };
        let workspace_payloads = vec![
            ServerMessagePayload::WorkspaceCreated(WorkspaceCreated {
                workspace: ws.clone(),
            }),
            ServerMessagePayload::WorkspaceDeleted(WorkspaceDeleted {
                workspace_id: ws.id,
            }),
            ServerMessagePayload::WorkspaceUpdated(WorkspaceUpdated { workspace: ws }),
        ];
        for p in workspace_payloads {
            let bridge = payload_to_bridge_message(&p);
            assert!(
                matches!(bridge, BridgeMessage::WorkspaceEvent { .. }),
                "Expected WorkspaceEvent for {:?}",
                std::mem::discriminant(&p)
            );
        }

        // Worktree variants -> WorktreeEvent
        let wt = WorktreeData {
            id: Uuid::new_v4(),
            workspace_id: Uuid::new_v4(),
            branch_name: "main".to_string(),
            path: "/tmp/wt".to_string(),
            status: "clean".to_string(),
            created_at: 0,
            is_main: true,
            git_stats: None,
            color: None,
            icon: None,
            agent_type: None,
        };
        let worktree_payloads = vec![
            ServerMessagePayload::WorktreeCreated(WorktreeCreated {
                worktree: wt.clone(),
            }),
            ServerMessagePayload::WorktreeDeleted(WorktreeDeleted {
                worktree_id: wt.id,
            }),
            ServerMessagePayload::WorktreeChanged(WorktreeChanged {
                worktree: wt.clone(),
            }),
            ServerMessagePayload::WorktreeListResult(WorktreeListResult {
                workspace_id: wt.workspace_id,
                worktrees: vec![wt.clone()],
            }),
            ServerMessagePayload::WorktreeStatus(WorktreeStatus {
                worktree_id: wt.id,
                status: "clean".to_string(),
            }),
            ServerMessagePayload::WorktreeDetailsResult(WorktreeDetailsResult {
                request_id: None,
                worktrees: vec![wt],
                agent_sessions: vec![],
                terminal_sessions: vec![],
                terminal_tabs: vec![],
            }),
        ];
        for p in worktree_payloads {
            let bridge = payload_to_bridge_message(&p);
            assert!(
                matches!(bridge, BridgeMessage::WorktreeEvent { .. }),
                "Expected WorktreeEvent for {:?}",
                std::mem::discriminant(&p)
            );
        }

        // Git variants -> GitResponse
        let git_payloads = vec![
            ServerMessagePayload::GitStatusResult(GitStatusResult {
                worktree_id: Uuid::new_v4(),
                entries: vec![],
            }),
            ServerMessagePayload::GitDiffResult(GitDiffResult {
                worktree_id: Uuid::new_v4(),
                file_path: None,
                diff: "diff content".to_string(),
            }),
        ];
        for p in git_payloads {
            let bridge = payload_to_bridge_message(&p);
            assert!(
                matches!(bridge, BridgeMessage::GitResponse { .. }),
                "Expected GitResponse for {:?}",
                std::mem::discriminant(&p)
            );
        }

        // File variants -> FileResponse
        let file_payloads = vec![
            ServerMessagePayload::FileContent(FileContent {
                worktree_id: Uuid::new_v4(),
                path: "test.txt".to_string(),
                content: "hello".to_string(),
            }),
            ServerMessagePayload::FileListResult(FileListResult {
                worktree_id: Uuid::new_v4(),
                files: vec!["test.txt".to_string()],
                path: None,
                request_id: None,
            }),
        ];
        for p in file_payloads {
            let bridge = payload_to_bridge_message(&p);
            assert!(
                matches!(bridge, BridgeMessage::FileResponse { .. }),
                "Expected FileResponse for {:?}",
                std::mem::discriminant(&p)
            );
        }

        // Agent variants -> AgentEvent
        let agent_payloads = vec![
            ServerMessagePayload::AgentStatusUpdate(AgentStatusUpdate {
                id: Uuid::new_v4(),
                worktree_id: Uuid::new_v4(),
                agent_type: "test".to_string(),
                status: AgentStatus::Working,
                started_at: 0,
                agent_tab_id: Uuid::new_v4(),
            }),
            ServerMessagePayload::AgentOutput(AgentOutput {
                worktree_id: Uuid::new_v4(),
                output: "output".to_string(),
            }),
            ServerMessagePayload::AgentPrompt(AgentPrompt {
                worktree_id: Uuid::new_v4(),
                prompt: "prompt".to_string(),
            }),
            ServerMessagePayload::AgentRemoved(AgentRemoved {
                id: Uuid::new_v4(),
                worktree_id: Uuid::new_v4(),
            }),
            ServerMessagePayload::AgentUpdated(AgentUpdated {
                session_id: Uuid::new_v4(),
                worktree_id: Uuid::new_v4(),
                label: None,
                position: None,
                request_id: Uuid::new_v4(),
            }),
        ];
        for p in agent_payloads {
            let bridge = payload_to_bridge_message(&p);
            assert!(
                matches!(bridge, BridgeMessage::AgentEvent { .. }),
                "Expected AgentEvent for {:?}",
                std::mem::discriminant(&p)
            );
        }

        // Terminal variants -> TerminalEvent
        let terminal_payloads = vec![
            ServerMessagePayload::TerminalOutput(TerminalOutput {
                session_id: Uuid::new_v4(),
                data: "output".to_string(),
            }),
            ServerMessagePayload::TerminalHistory(TerminalHistory {
                session_id: Uuid::new_v4(),
                data: "line1\n".to_string(),
            }),
        ];
        for p in terminal_payloads {
            let bridge = payload_to_bridge_message(&p);
            assert!(
                matches!(bridge, BridgeMessage::TerminalEvent { .. }),
                "Expected TerminalEvent for {:?}",
                std::mem::discriminant(&p)
            );
        }

        // Single variants
        let single_payloads: Vec<(ServerMessagePayload, &str)> = vec![
            (
                ServerMessagePayload::StateSnapshot(StateSnapshot {
                    request_id: Uuid::new_v4(),
                    workspaces: vec![],
                    worktrees: vec![],
                    agent_sessions: vec![],
                    terminal_sessions: vec![],
                    settings: vec![],
                }),
                "StateSnapshot",
            ),
            (
                ServerMessagePayload::Notification(Notification {
                    level: crate::protocol::NotificationLevel::Info,
                    title: "Test".to_string(),
                    message: "Test".to_string(),
                }),
                "Notification",
            ),
            (
                ServerMessagePayload::Error(Error {
                    code: "E".to_string(),
                    message: "err".to_string(),
                    details: None,
                    request_id: None,
                }),
                "ErrorResponse",
            ),
            (
                ServerMessagePayload::Ack(Ack {
                    message_id: Uuid::new_v4(),
                    status: crate::protocol::AckStatus::Success,
                }),
                "Ack",
            ),
            (
                ServerMessagePayload::Ping(Ping { timestamp: 1 }),
                "Ping",
            ),
            (
                ServerMessagePayload::Pong(Pong { timestamp: 1 }),
                "Pong",
            ),
        ];
        for (p, expected) in single_payloads {
            let bridge = payload_to_bridge_message(&p);
            let variant_name = match &bridge {
                BridgeMessage::StateSnapshot { .. } => "StateSnapshot",
                BridgeMessage::Notification { .. } => "Notification",
                BridgeMessage::ErrorResponse { .. } => "ErrorResponse",
                BridgeMessage::Ack { .. } => "Ack",
                BridgeMessage::Ping { .. } => "Ping",
                BridgeMessage::Pong { .. } => "Pong",
                other => panic!(
                    "Unexpected variant {:?} for {:?}",
                    std::mem::discriminant(other),
                    std::mem::discriminant(&p)
                ),
            };
            assert_eq!(
                variant_name, expected,
                "Mismatch for {:?}",
                std::mem::discriminant(&p)
            );
        }
    }
}
