//! Bridge decoder: parses BridgeMessage variants into typed payloads for existing handlers.
//!
//! This module provides helpers to extract structured data from incoming BridgeMessage
//! variants, enabling the server to route messages to the existing handler functions
//! that expect the original protocol types.

use harms_haus_acp_ws_bridge::contract::{BridgeEnvelope, BridgeMessage};

use crate::protocol::{ClientMessage, ClientMessagePayload};

/// Result of decoding a BridgeEnvelope into a dispatchable client message.
#[derive(Debug, Clone)]
pub enum DecodedMessage {
    /// Successfully decoded into a ClientMessage for routing.
    Client(ClientMessage),
    /// The envelope contained an unsupported protocol version.
    UnsupportedVersion(UnsupportedVersionError),
    /// The message type is not a client request (e.g., AcpPayload, StartAgent).
    /// These are handled through separate pathways.
    NonClient(BridgeMessage),
}

/// Error returned when the envelope version is unsupported.
#[derive(Debug, Clone)]
pub struct UnsupportedVersionError {
    pub received: u32,
    pub supported: Vec<u32>,
}

/// Attempts to parse a JSON text message as a BridgeEnvelope and decode it
/// into a ClientMessage for routing to existing handlers.
///
/// Returns:
/// - `DecodedMessage::Client(msg)` if the envelope contains a recognizable client request
/// - `DecodedMessage::UnsupportedVersion` if the protocol version is not supported
/// - `DecodedMessage::NonClient(msg)` if the message type is handled through other pathways
///   (e.g., AcpPayload goes directly to the ACP runtime, StartAgent to process spawning)
/// - `None` if the JSON cannot be parsed as a BridgeEnvelope
pub fn decode_bridge_message(text: &str) -> Option<DecodedMessage> {
    let envelope: BridgeEnvelope = match serde_json::from_str(text) {
        Ok(env) => env,
        Err(_) => return None,
    };

    // Version check
    if !envelope.is_supported_version() {
        return Some(DecodedMessage::UnsupportedVersion(UnsupportedVersionError {
            received: envelope.version,
            supported: harms_haus_acp_ws_bridge::contract::SUPPORTED_VERSIONS.to_vec(),
        }));
    }

    let message = envelope.message;
    match bridge_message_to_client_payload(&message) {
        Some(payload) => Some(DecodedMessage::Client(ClientMessage::new(payload))),
        None => Some(DecodedMessage::NonClient(message)),
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

/// Parses an incoming BridgeEnvelope and extracts the appropriate handler argument.
///
/// This is a convenience function for Phase 3 handler migration. It takes a
/// BridgeMessage and a target type name, then deserializes the payload into
/// the requested type.
///
/// Example usage during handler migration:
/// ```ignore
/// let workspace_create: WorkspaceCreate =
///     bridge::extract_payload(&message, "WorkspaceCreate")?;
/// ```
pub fn extract_payload<'a, T: serde::de::DeserializeOwned>(
    message: &'a BridgeMessage,
    _type_name: &str,
) -> Option<T> {
    let payload = match message {
        BridgeMessage::Ping { payload }
        | BridgeMessage::Pong { payload }
        | BridgeMessage::Ack { payload }
        | BridgeMessage::Notification { payload }
        | BridgeMessage::ErrorResponse { payload }
        | BridgeMessage::StateSnapshot { payload }
        | BridgeMessage::WorkspaceEvent { payload }
        | BridgeMessage::WorktreeEvent { payload }
        | BridgeMessage::GitResponse { payload }
        | BridgeMessage::FileResponse { payload }
        | BridgeMessage::AgentEvent { payload }
        | BridgeMessage::TerminalEvent { payload } => payload.clone(),

        // These don't carry wrapped payloads in the same way
        BridgeMessage::AcpPayload { payload } => payload.clone(),
        BridgeMessage::StartAgent { .. }
        | BridgeMessage::BridgeStatus { .. }
        | BridgeMessage::Stderr { .. }
        | BridgeMessage::ProcessExit { .. }
        | BridgeMessage::ReplayMetadata { .. } => return None,
    };

    // The payload is the full ClientMessagePayload: { "type": "...", "data": { ... } }
    // The entire payload IS the ClientMessagePayload, deserialize it directly.
    serde_json::from_value(payload).ok()
}

#[cfg(test)]
mod tests {
    use super::*;
    use harms_haus_acp_ws_bridge::contract::{BridgeEnvelope, BridgeMessage};
    use serde_json::json;
    use uuid::Uuid;

    // ========================================================================
    // Tests for decode_bridge_message
    // ========================================================================

    #[test]
    fn test_decode_valid_ping_envelope() {
        let ping_payload = json!({
            "type": "Ping",
            "data": { "timestamp": 12345 }
        });
        let envelope = BridgeEnvelope::new(
            BridgeMessage::Ping {
                payload: ping_payload,
            },
            1234567890,
        );
        let json = serde_json::to_string(&envelope).unwrap();

        let result = decode_bridge_message(&json);
        assert!(result.is_some());

        match result.unwrap() {
            DecodedMessage::Client(msg) => {
                assert_eq!(msg.version, 1); // PROTOCOL_VERSION default
                match msg.payload {
                    ClientMessagePayload::Ping(ping) => {
                        assert_eq!(ping.timestamp, 12345);
                    }
                    _ => panic!("Expected Ping payload"),
                }
            }
            other => panic!("Expected DecodedMessage::Client, got {:?}", other),
        }
    }

    #[test]
    fn test_decode_acp_payload_returns_non_client() {
        let envelope = BridgeEnvelope::new(
            BridgeMessage::AcpPayload {
                payload: json!({"jsonrpc": "2.0", "method": "initialize"}),
            },
            1234567890,
        );
        let json = serde_json::to_string(&envelope).unwrap();

        let result = decode_bridge_message(&json);
        assert!(result.is_some());

        match result.unwrap() {
            DecodedMessage::NonClient(BridgeMessage::AcpPayload { payload }) => {
                assert_eq!(payload["method"], "initialize");
            }
            other => panic!("Expected DecodedMessage::NonClient(AcpPayload), got {:?}", other),
        }
    }

    #[test]
    fn test_decode_start_agent_returns_non_client() {
        let envelope = BridgeEnvelope::new(
            BridgeMessage::StartAgent {
                command: "node".to_string(),
                args: vec!["script.js".to_string()],
                cwd: Some("/workspace".to_string()),
                env: vec![],
            },
            1234567890,
        );
        let json = serde_json::to_string(&envelope).unwrap();

        let result = decode_bridge_message(&json);
        assert!(result.is_some());

        match result.unwrap() {
            DecodedMessage::NonClient(BridgeMessage::StartAgent { command, .. }) => {
                assert_eq!(command, "node");
            }
            other => panic!("Expected DecodedMessage::NonClient(StartAgent), got {:?}", other),
        }
    }

    #[test]
    fn test_decode_unsupported_version() {
        // Manually construct an envelope with unsupported version
        let unsupported = BridgeEnvelope {
            version: 999,
            seq: 0,
            timestamp_ms: 1234567890,
            extra_data: None,
            message: BridgeMessage::Ping {
                payload: json!({"timestamp": 1}),
            },
        };
        let json = serde_json::to_string(&unsupported).unwrap();

        let result = decode_bridge_message(&json);
        assert!(result.is_some());

        match result.unwrap() {
            DecodedMessage::UnsupportedVersion(err) => {
                assert_eq!(err.received, 999);
                assert!(!err.supported.contains(&999));
            }
            other => panic!("Expected UnsupportedVersion, got {:?}", other),
        }
    }

    #[test]
    fn test_decode_invalid_json_returns_none() {
        let result = decode_bridge_message("not valid json");
        assert!(result.is_none());
    }

    #[test]
    fn test_decode_workspace_event_returns_non_client() {
        let envelope = BridgeEnvelope::new(
            BridgeMessage::WorkspaceEvent {
                payload: json!({
                    "type": "WorkspaceCreated",
                    "data": {
                        "workspace": {
                            "id": "00000000-0000-0000-0000-000000000001",
                            "name": "test",
                            "rootPath": "/tmp/test",
                            "color": null,
                            "icon": null,
                            "worktreeBaseDir": null,
                            "createdAt": 0,
                            "updatedAt": 0
                        }
                    }
                }),
            },
            1234567890,
        );
        let json = serde_json::to_string(&envelope).unwrap();

        let result = decode_bridge_message(&json);
        assert!(result.is_some());

        match result.unwrap() {
            DecodedMessage::NonClient(BridgeMessage::WorkspaceEvent { .. }) => {}
            other => panic!("Expected NonClient(WorkspaceEvent), got {:?}", other),
        }
    }

    // ========================================================================
    // Tests for extract_payload
    // ========================================================================

    #[test]
    fn test_extract_payload_from_workspace_event() {
        use crate::protocol::WorkspaceCreate;

        let workspace_id = Uuid::new_v4();
        let payload = json!({
            "type": "WorkspaceCreated",
            "data": {
                "workspace": {
                    "id": workspace_id.to_string(),
                    "name": "extract-test",
                    "rootPath": "/tmp/extract",
                    "color": null,
                    "icon": null,
                    "worktreeBaseDir": null,
                    "createdAt": 0,
                    "updatedAt": 0
                }
            }
        });
        let message = BridgeMessage::WorkspaceEvent { payload };

        let extracted: Option<serde_json::Value> = extract_payload(&message, "WorkspaceEvent");
        assert!(extracted.is_some());
        let val = extracted.unwrap();
        assert_eq!(val["data"]["workspace"]["name"], "extract-test");
    }

    #[test]
    fn test_extract_payload_from_terminal_event() {
        let session_id = Uuid::new_v4();
        let payload = json!({
            "type": "TerminalOutput",
            "data": {
                "sessionId": session_id.to_string(),
                "data": "output line 1\n"
            }
        });
        let message = BridgeMessage::TerminalEvent { payload };

        let extracted: Option<serde_json::Value> = extract_payload(&message, "TerminalOutput");
        assert!(extracted.is_some());
        let val = extracted.unwrap();
        assert_eq!(val["data"]["data"], "output line 1\n");
    }

    #[test]
    fn test_extract_payload_from_acp_payload() {
        let payload = json!({
            "jsonrpc": "2.0",
            "method": "session/prompt",
            "params": { "prompt": "Hello" }
        });
        let message = BridgeMessage::AcpPayload {
            payload: payload.clone(),
        };

        let extracted: Option<serde_json::Value> = extract_payload(&message, "AcpPayload");
        assert!(extracted.is_some());
        assert_eq!(extracted.unwrap()["method"], "session/prompt");
    }

    #[test]
    fn test_extract_payload_returns_none_for_bridge_status() {
        use harms_haus_acp_ws_bridge::contract::BridgeStatus;

        let message = BridgeMessage::BridgeStatus {
            status: BridgeStatus::Connected,
        };

        let extracted: Option<serde_json::Value> = extract_payload(&message, "BridgeStatus");
        assert!(extracted.is_none());
    }

    #[test]
    fn test_extract_payload_returns_none_for_stderr() {
        let message = BridgeMessage::Stderr {
            line: "error".to_string(),
        };

        let extracted: Option<serde_json::Value> = extract_payload(&message, "Stderr");
        assert!(extracted.is_none());
    }

    #[test]
    fn test_extract_payload_returns_none_for_process_exit() {
        let message = BridgeMessage::ProcessExit {
            code: Some(0),
            signal: None,
        };

        let extracted: Option<serde_json::Value> = extract_payload(&message, "ProcessExit");
        assert!(extracted.is_none());
    }

    #[test]
    fn test_extract_payload_returns_none_for_replay_metadata() {
        let message = BridgeMessage::ReplayMetadata {
            captured_at_ms: 1234567890,
            total_envelopes: 100,
            description: None,
        };

        let extracted: Option<serde_json::Value> = extract_payload(&message, "ReplayMetadata");
        assert!(extracted.is_none());
    }

    // ========================================================================
    // Tests for TerminalEvent decoding
    // ========================================================================

    #[test]
    fn test_decode_terminal_event_with_terminal_input() {
        let session_id = Uuid::new_v4();
        let payload = json!({
            "type": "TerminalInput",
            "data": {
                "sessionId": session_id.to_string(),
                "data": "ls -la\n"
            }
        });
        let envelope = BridgeEnvelope::new(
            BridgeMessage::TerminalEvent { payload },
            1234567890,
        );
        let json = serde_json::to_string(&envelope).unwrap();

        let result = decode_bridge_message(&json);
        assert!(result.is_some());

        match result.unwrap() {
            DecodedMessage::Client(msg) => {
                assert_eq!(msg.version, 1);
                match msg.payload {
                    ClientMessagePayload::TerminalInput(input) => {
                        assert_eq!(input.session_id, session_id);
                        assert_eq!(input.data, "ls -la\n");
                    }
                    _ => panic!("Expected TerminalInput payload"),
                }
            }
            other => panic!("Expected DecodedMessage::Client, got {:?}", other),
        }
    }

    #[test]
    fn test_decode_terminal_event_with_terminal_resize() {
        let session_id = Uuid::new_v4();
        let payload = json!({
            "type": "TerminalResize",
            "data": {
                "sessionId": session_id.to_string(),
                "cols": 120,
                "rows": 40
            }
        });
        let envelope = BridgeEnvelope::new(
            BridgeMessage::TerminalEvent { payload },
            1234567890,
        );
        let json = serde_json::to_string(&envelope).unwrap();

        let result = decode_bridge_message(&json);
        assert!(result.is_some());

        match result.unwrap() {
            DecodedMessage::Client(msg) => {
                assert_eq!(msg.version, 1);
                match msg.payload {
                    ClientMessagePayload::TerminalResize(resize) => {
                        assert_eq!(resize.session_id, session_id);
                        assert_eq!(resize.cols, 120);
                        assert_eq!(resize.rows, 40);
                    }
                    _ => panic!("Expected TerminalResize payload"),
                }
            }
            other => panic!("Expected DecodedMessage::Client, got {:?}", other),
        }
    }
}
