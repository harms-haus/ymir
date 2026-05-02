//! Bridge encoder: converts ServerMessagePayload to BridgeEnvelope for JSON wire format.
//!
//! This module provides helpers to construct BridgeEnvelope messages from the existing
//! ServerMessagePayload types, enabling the server-side of the binary-to-text transition.

use harms_haus_acp_ws_bridge::contract::{BridgeEnvelope, BridgeMessage};

use crate::protocol::ServerMessagePayload;

/// Converts a ServerMessage into a BridgeEnvelope for JSON serialization.
///
/// Each ServerMessagePayload variant is mapped to the corresponding BridgeMessage
/// variant with the payload serialized as structured JSON.
pub fn server_message_to_envelope(
    msg: crate::protocol::ServerMessage,
    timestamp_ms: u64,
) -> BridgeEnvelope {
    let bridge_message = payload_to_bridge_message(msg.payload);
    BridgeEnvelope::new(bridge_message, timestamp_ms)
}

/// Maps a ServerMessagePayload variant to the corresponding BridgeMessage variant.
///
/// The payload data is serialized to serde_json::Value for transport in the
/// BridgeEnvelope. The bridge does not interpret or modify the payload contents.
fn payload_to_bridge_message(payload: ServerMessagePayload) -> BridgeMessage {
    match payload {
        // ACP wire events pass through as raw ACP payloads
        ServerMessagePayload::AcpWireEvent(envelope) => BridgeMessage::AcpPayload {
            payload: serde_json::to_value(&envelope).unwrap_or_default(),
        },

        // Workspace lifecycle events
        ServerMessagePayload::WorkspaceCreated(_) => BridgeMessage::WorkspaceEvent {
            payload: serde_json::to_value(&payload).unwrap_or_default(),
        },
        ServerMessagePayload::WorkspaceDeleted(_) => BridgeMessage::WorkspaceEvent {
            payload: serde_json::to_value(&payload).unwrap_or_default(),
        },
        ServerMessagePayload::WorkspaceUpdated(_) => BridgeMessage::WorkspaceEvent {
            payload: serde_json::to_value(&payload).unwrap_or_default(),
        },

        // Worktree lifecycle events
        ServerMessagePayload::WorktreeCreated(_) => BridgeMessage::WorktreeEvent {
            payload: serde_json::to_value(&payload).unwrap_or_default(),
        },
        ServerMessagePayload::WorktreeDeleted(_) => BridgeMessage::WorktreeEvent {
            payload: serde_json::to_value(&payload).unwrap_or_default(),
        },
        ServerMessagePayload::WorktreeChanged(_) => BridgeMessage::WorktreeEvent {
            payload: serde_json::to_value(&payload).unwrap_or_default(),
        },
        ServerMessagePayload::WorktreeListResult(_) => BridgeMessage::WorktreeEvent {
            payload: serde_json::to_value(&payload).unwrap_or_default(),
        },
        ServerMessagePayload::WorktreeStatus(_) => BridgeMessage::WorktreeEvent {
            payload: serde_json::to_value(&payload).unwrap_or_default(),
        },
        ServerMessagePayload::WorktreeDetailsResult(_) => BridgeMessage::WorktreeEvent {
            payload: serde_json::to_value(&payload).unwrap_or_default(),
        },

        // Git operation responses
        ServerMessagePayload::GitStatusResult(_) => BridgeMessage::GitResponse {
            payload: serde_json::to_value(&payload).unwrap_or_default(),
        },
        ServerMessagePayload::GitDiffResult(_) => BridgeMessage::GitResponse {
            payload: serde_json::to_value(&payload).unwrap_or_default(),
        },

        // File operation responses
        ServerMessagePayload::FileContent(_) => BridgeMessage::FileResponse {
            payload: serde_json::to_value(&payload).unwrap_or_default(),
        },
        ServerMessagePayload::FileListResult(_) => BridgeMessage::FileResponse {
            payload: serde_json::to_value(&payload).unwrap_or_default(),
        },

        // Agent lifecycle events
        ServerMessagePayload::AgentStatusUpdate(_) => BridgeMessage::AgentEvent {
            payload: serde_json::to_value(&payload).unwrap_or_default(),
        },
        ServerMessagePayload::AgentOutput(_) => BridgeMessage::AgentEvent {
            payload: serde_json::to_value(&payload).unwrap_or_default(),
        },
        ServerMessagePayload::AgentPrompt(_) => BridgeMessage::AgentEvent {
            payload: serde_json::to_value(&payload).unwrap_or_default(),
        },
        ServerMessagePayload::AgentRemoved(_) => BridgeMessage::AgentEvent {
            payload: serde_json::to_value(&payload).unwrap_or_default(),
        },
        ServerMessagePayload::AgentUpdated(_) => BridgeMessage::AgentEvent {
            payload: serde_json::to_value(&payload).unwrap_or_default(),
        },

        // Terminal lifecycle events
        ServerMessagePayload::TerminalOutput(_) => BridgeMessage::TerminalEvent {
            payload: serde_json::to_value(&payload).unwrap_or_default(),
        },
        ServerMessagePayload::TerminalCreated(_) => BridgeMessage::TerminalEvent {
            payload: serde_json::to_value(&payload).unwrap_or_default(),
        },
        ServerMessagePayload::TerminalRemoved(_) => BridgeMessage::TerminalEvent {
            payload: serde_json::to_value(&payload).unwrap_or_default(),
        },
        ServerMessagePayload::TerminalUpdated(_) => BridgeMessage::TerminalEvent {
            payload: serde_json::to_value(&payload).unwrap_or_default(),
        },
        ServerMessagePayload::TerminalHistory(_) => BridgeMessage::TerminalEvent {
            payload: serde_json::to_value(&payload).unwrap_or_default(),
        },

        // State snapshot
        ServerMessagePayload::StateSnapshot(_) => BridgeMessage::StateSnapshot {
            payload: serde_json::to_value(&payload).unwrap_or_default(),
        },

        // Notifications
        ServerMessagePayload::Notification(data) => BridgeMessage::Notification {
            payload: serde_json::to_value(&data).unwrap_or_default(),
        },

        // Errors
        ServerMessagePayload::Error(data) => BridgeMessage::ErrorResponse {
            payload: serde_json::to_value(&data).unwrap_or_default(),
        },

        // Acknowledgments
        ServerMessagePayload::Ack(data) => BridgeMessage::Ack {
            payload: serde_json::to_value(&data).unwrap_or_default(),
        },

        // Heartbeat ping
        ServerMessagePayload::Ping(data) => BridgeMessage::Ping {
            payload: serde_json::to_value(&data).unwrap_or_default(),
        },

        // Heartbeat pong
        ServerMessagePayload::Pong(data) => BridgeMessage::Pong {
            payload: serde_json::to_value(&data).unwrap_or_default(),
        },
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use harms_haus_acp_ws_bridge::contract::ENVELOPE_VERSION;
    use uuid::Uuid;

    use crate::protocol::{Ack, Error, Notification, Ping, Pong, ServerMessage, StateSnapshot};

    // Helper: create a timestamp for testing
    fn test_timestamp() -> u64 {
        1234567890
    }

    // ========================================================================
    // Tests for server_message_to_envelope
    // ========================================================================

    #[test]
    fn test_envelope_version_is_set() {
        let msg = ServerMessage::new(ServerMessagePayload::Pong(Pong {
            timestamp: 12345,
        }));
        let envelope = server_message_to_envelope(msg, test_timestamp());

        assert_eq!(envelope.version, ENVELOPE_VERSION);
    }

    #[test]
    fn test_envelope_seq_is_zero_for_live() {
        let msg = ServerMessage::new(ServerMessagePayload::Pong(Pong {
            timestamp: 12345,
        }));
        let envelope = server_message_to_envelope(msg, test_timestamp());

        assert_eq!(envelope.seq, 0);
    }

    #[test]
    fn test_envelope_timestamp_is_preserved() {
        let msg = ServerMessage::new(ServerMessagePayload::Pong(Pong {
            timestamp: 12345,
        }));
        let ts = test_timestamp();
        let envelope = server_message_to_envelope(msg, ts);

        assert_eq!(envelope.timestamp_ms, ts);
    }

    // ========================================================================
    // Tests for payload_to_bridge_message mapping
    // ========================================================================

    #[test]
    fn test_pong_maps_to_pong() {
        let payload = ServerMessagePayload::Pong(Pong { timestamp: 99999 });
        let bridge = payload_to_bridge_message(payload);

        match bridge {
            BridgeMessage::Pong { payload } => {
                assert_eq!(payload["timestamp"], 99999);
            }
            _ => panic!("Expected Pong BridgeMessage variant"),
        }
    }

    #[test]
    fn test_ping_maps_to_ping() {
        let payload = ServerMessagePayload::Ping(Ping { timestamp: 88888 });
        let bridge = payload_to_bridge_message(payload);

        match bridge {
            BridgeMessage::Ping { payload } => {
                assert_eq!(payload["timestamp"], 88888);
            }
            _ => panic!("Expected Ping BridgeMessage variant"),
        }
    }

    #[test]
    fn test_error_maps_to_error_response() {
        let payload = ServerMessagePayload::Error(Error {
            code: "TEST_ERROR".to_string(),
            message: "Something went wrong".to_string(),
            details: Some("Extra details".to_string()),
            request_id: None,
        });
        let bridge = payload_to_bridge_message(payload);

        match bridge {
            BridgeMessage::ErrorResponse { payload } => {
                assert_eq!(payload["code"], "TEST_ERROR");
                assert_eq!(payload["message"], "Something went wrong");
            }
            _ => panic!("Expected ErrorResponse BridgeMessage variant"),
        }
    }

    #[test]
    fn test_ack_maps_to_ack() {
        let msg_id = Uuid::new_v4();
        let payload = ServerMessagePayload::Ack(Ack {
            message_id: msg_id,
            status: crate::protocol::AckStatus::Success,
        });
        let bridge = payload_to_bridge_message(payload);

        match bridge {
            BridgeMessage::Ack { payload } => {
                // UUID is serialized as string
                assert_eq!(payload["messageId"], msg_id.to_string());
                assert_eq!(payload["status"], "Success");
            }
            _ => panic!("Expected Ack BridgeMessage variant"),
        }
    }

    #[test]
    fn test_notification_maps_to_notification() {
        let payload = ServerMessagePayload::Notification(Notification {
            level: crate::protocol::NotificationLevel::Info,
            title: "Test".to_string(),
            message: "Test message".to_string(),
        });
        let bridge = payload_to_bridge_message(payload);

        match bridge {
            BridgeMessage::Notification { payload } => {
                assert_eq!(payload["level"], "Info");
                assert_eq!(payload["title"], "Test");
            }
            _ => panic!("Expected Notification BridgeMessage variant"),
        }
    }

    #[test]
    fn test_workspace_created_maps_to_workspace_event() {
        let workspace = crate::protocol::WorkspaceData {
            id: Uuid::new_v4(),
            name: "test-workspace".to_string(),
            root_path: "/tmp/test".to_string(),
            color: None,
            icon: None,
            worktree_base_dir: None,
            settings: None,
            created_at: 0,
            updated_at: 0,
        };
        let payload =
            ServerMessagePayload::WorkspaceCreated(crate::protocol::WorkspaceCreated { workspace });
        let bridge = payload_to_bridge_message(payload);

        match bridge {
            BridgeMessage::WorkspaceEvent { payload } => {
                assert_eq!(payload["type"], "WorkspaceCreated");
            }
            _ => panic!("Expected WorkspaceEvent BridgeMessage variant"),
        }
    }

    #[test]
    fn test_acp_wire_event_maps_to_acp_payload() {
        use crate::protocol::{
            AcpEvent, AcpEventEnvelope, AcpPromptComplete, AcpPromptCompleteReason,
        };

        let envelope = AcpEventEnvelope {
            sequence: 1,
            correlation_id: None,
            timestamp: 1234567890,
            event: AcpEvent::PromptComplete(AcpPromptComplete {
                worktree_id: Uuid::new_v4(),
                acp_session_id: "session-123".to_string(),
                reason: AcpPromptCompleteReason::Normal,
            }),
        };
        let payload = ServerMessagePayload::AcpWireEvent(envelope);
        let bridge = payload_to_bridge_message(payload);

        match bridge {
            BridgeMessage::AcpPayload { payload } => {
                assert_eq!(payload["sequence"], 1);
                assert_eq!(payload["timestamp"], 1234567890);
            }
            _ => panic!("Expected AcpPayload BridgeMessage variant"),
        }
    }

    #[test]
    fn test_terminal_output_maps_to_terminal_event() {
        let payload = ServerMessagePayload::TerminalOutput(crate::protocol::TerminalOutput {
            session_id: Uuid::new_v4(),
            data: "terminal output here".to_string(),
        });
        let bridge = payload_to_bridge_message(payload);

        match bridge {
            BridgeMessage::TerminalEvent { payload } => {
                assert_eq!(payload["type"], "TerminalOutput");
                assert_eq!(payload["data"]["data"], "terminal output here");
            }
            _ => panic!("Expected TerminalEvent BridgeMessage variant"),
        }
    }

    #[test]
    fn test_state_snapshot_maps_to_state_snapshot() {
        let payload = ServerMessagePayload::StateSnapshot(StateSnapshot {
            request_id: Uuid::new_v4(),
            workspaces: vec![],
            worktrees: vec![],
            agent_sessions: vec![],
            terminal_sessions: vec![],
            settings: vec![],
        });
        let bridge = payload_to_bridge_message(payload);

        match bridge {
            BridgeMessage::StateSnapshot { payload } => {
                assert_eq!(payload["type"], "StateSnapshot");
                assert!(payload["data"]["workspaces"].is_array());
            }
            _ => panic!("Expected StateSnapshot BridgeMessage variant"),
        }
    }

    // ========================================================================
    // Tests for full serialization round-trip
    // ========================================================================

    #[test]
    fn test_full_json_roundtrip_pong() {
        let msg = ServerMessage::new(ServerMessagePayload::Pong(Pong { timestamp: 42 }));
        let envelope = server_message_to_envelope(msg, test_timestamp());

        let json = serde_json::to_string(&envelope).expect("Failed to serialize");
        let deserialized: BridgeEnvelope =
            serde_json::from_str(&json).expect("Failed to deserialize");

        assert_eq!(deserialized.version, ENVELOPE_VERSION);
        assert_eq!(deserialized.timestamp_ms, test_timestamp());
        assert!(matches!(deserialized.message, BridgeMessage::Pong { .. }));
    }

    #[test]
    fn test_full_json_roundtrip_error() {
        let msg = ServerMessage::new(ServerMessagePayload::Error(Error {
            code: "TEST".to_string(),
            message: "fail".to_string(),
            details: None,
            request_id: None,
        }));
        let envelope = server_message_to_envelope(msg, test_timestamp());

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
        let msg = ServerMessage::new(ServerMessagePayload::Pong(Pong {
            timestamp: 12345,
        }));
        let envelope = server_message_to_envelope(msg, test_timestamp());

        let json = serde_json::to_string(&envelope).expect("Failed to serialize");
        assert!(!json.contains("extraData"));
        assert!(!json.contains("extra_data"));
    }

    #[test]
    fn test_json_contains_type_discriminator() {
        let msg = ServerMessage::new(ServerMessagePayload::Ack(Ack {
            message_id: Uuid::new_v4(),
            status: crate::protocol::AckStatus::Success,
        }));
        let envelope = server_message_to_envelope(msg, test_timestamp());

        let json = serde_json::to_string(&envelope).expect("Failed to serialize");
        // BridgeMessage uses snake_case type discriminator
        assert!(json.contains("\"type\":\"ack\""));
    }
}
