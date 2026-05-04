//! Versioned WebSocket envelope for all bridge-to-browser messages.

use serde::{Deserialize, Serialize};
use ts_rs::TS;

use super::{ENVELOPE_VERSION, SUPPORTED_VERSIONS};
use crate::contract::BridgeMessage;

/// Versioned WebSocket envelope for all bridge-to-browser messages.
///
/// This is the single source of truth for the wire format. The bridge never
/// mutates ACP payload contents — it only wraps them in this envelope.
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct BridgeEnvelope {
    /// Envelope format version. Must be one of SUPPORTED_VERSIONS.
    pub version: u32,

    /// Sequence number for ordering messages in replay mode.
    /// Zero in live mode; monotonically increasing in replay mode.
    #[ts(type = "number")]
    pub seq: u64,

    /// Unix timestamp in milliseconds when the envelope was created.
    #[ts(type = "number")]
    pub timestamp_ms: u64,

    /// Optional free-form metadata. The ws-bridge treats this as opaque JSON.
    /// Specific interpretations (e.g., replay-speed) happen at the harness-server layer.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub extra_data: Option<serde_json::Value>,

    /// The message payload.
    #[serde(flatten)]
    pub message: BridgeMessage,
}

impl BridgeEnvelope {
    /// Creates a new envelope with the current version and a live-mode seq of 0.
    pub fn new(message: BridgeMessage, timestamp_ms: u64) -> Self {
        Self {
            version: ENVELOPE_VERSION,
            seq: 0,
            timestamp_ms,
            extra_data: None,
            message,
        }
    }

    /// Creates a new envelope for replay mode with a specific sequence number.
    pub fn new_replay(
        message: BridgeMessage,
        timestamp_ms: u64,
        seq: u64,
        extra_data: Option<serde_json::Value>,
    ) -> Self {
        Self {
            version: ENVELOPE_VERSION,
            seq,
            timestamp_ms,
            extra_data,
            message,
        }
    }

    /// Checks if the envelope version is supported.
    pub fn is_supported_version(&self) -> bool {
        SUPPORTED_VERSIONS.contains(&self.version)
    }
}

/// Error returned when parsing an envelope with an unsupported version.
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct UnsupportedVersionError {
    /// The version that was received.
    pub received: u32,
    /// The versions that are supported.
    pub supported: Vec<u32>,
}

impl std::fmt::Display for UnsupportedVersionError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(
            f,
            "Unsupported envelope version {}: supported versions are {:?}",
            self.received, self.supported
        )
    }
}

impl std::error::Error for UnsupportedVersionError {}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::contract::{BridgeStatus, ENVELOPE_VERSION, SUPPORTED_VERSIONS};
    use serde_json::json;

    // Helper to create a test BridgeMessage
    fn test_message() -> BridgeMessage {
        BridgeMessage::AcpPayload {
            payload: json!({"test": "value"}),
        }
    }

    struct TestEnvelopeBuilder {
        version: u32,
        seq: u64,
        timestamp_ms: u64,
        extra_data: Option<serde_json::Value>,
        message: Option<BridgeMessage>,
    }

    impl TestEnvelopeBuilder {
        fn new() -> Self {
            Self {
                version: ENVELOPE_VERSION,
                seq: 0,
                timestamp_ms: 1234567890,
                extra_data: None,
                message: None,
            }
        }

        fn version(mut self, version: u32) -> Self {
            self.version = version;
            self
        }

        fn seq(mut self, seq: u64) -> Self {
            self.seq = seq;
            self
        }

        fn timestamp_ms(mut self, timestamp_ms: u64) -> Self {
            self.timestamp_ms = timestamp_ms;
            self
        }

        fn extra_data(mut self, extra_data: serde_json::Value) -> Self {
            self.extra_data = Some(extra_data);
            self
        }

        fn message(mut self, message: BridgeMessage) -> Self {
            self.message = Some(message);
            self
        }

        fn build(self) -> BridgeEnvelope {
            BridgeEnvelope {
                version: self.version,
                seq: self.seq,
                timestamp_ms: self.timestamp_ms,
                extra_data: self.extra_data,
                message: self.message.expect("message must be set"),
            }
        }
    }

    // ========================================================================
    // Tests for BridgeEnvelope::new()
    // ========================================================================

    #[test]
    fn test_new_basic() {
        let timestamp_ms = 1234567890;
        let message = test_message();
        let envelope = BridgeEnvelope::new(message.clone(), timestamp_ms);

        assert_eq!(envelope.version, ENVELOPE_VERSION);
        assert_eq!(envelope.seq, 0);
        assert_eq!(envelope.timestamp_ms, timestamp_ms);
        assert!(envelope.extra_data.is_none());
        assert!(matches!(envelope.message, BridgeMessage::AcpPayload { .. }));
    }

    #[test]
    fn test_new_seq_is_zero() {
        // Verify that new() always sets seq to 0 (live mode)
        let envelope = BridgeEnvelope::new(test_message(), 9999999999);
        assert_eq!(envelope.seq, 0);
    }

    #[test]
    fn test_new_extra_data_is_none() {
        // Verify that new() always sets extra_data to None
        let envelope = BridgeEnvelope::new(test_message(), 1234567890);
        assert!(envelope.extra_data.is_none());
    }

    // ========================================================================
    // Tests for BridgeEnvelope::new_replay()
    // ========================================================================

    #[test]
    fn test_new_replay_basic() {
        let timestamp_ms = 1234567890;
        let seq = 42;
        let extra_data = Some(json!({"replaySpeed": 2.0}));
        let message = test_message();

        let envelope =
            BridgeEnvelope::new_replay(message.clone(), timestamp_ms, seq, extra_data.clone());

        assert_eq!(envelope.version, ENVELOPE_VERSION);
        assert_eq!(envelope.seq, seq);
        assert_eq!(envelope.timestamp_ms, timestamp_ms);
        assert_eq!(envelope.extra_data, extra_data);
        assert!(matches!(envelope.message, BridgeMessage::AcpPayload { .. }));
    }

    #[test]
    fn test_new_replay_with_none_extra_data() {
        let timestamp_ms = 1234567890;
        let seq = 100;
        let extra_data = None;
        let message = test_message();

        let envelope = BridgeEnvelope::new_replay(message, timestamp_ms, seq, extra_data);

        assert_eq!(envelope.seq, seq);
        assert!(envelope.extra_data.is_none());
    }

    #[test]
    fn test_new_replay_with_complex_extra_data() {
        let timestamp_ms = 1234567890;
        let seq = 200;
        let extra_data = Some(json!({
            "replaySpeed": 1.5,
            "sessionId": "abc-123",
            "metadata": {
                "nested": true,
                "values": [1, 2, 3]
            }
        }));
        let message = test_message();

        let envelope = BridgeEnvelope::new_replay(message, timestamp_ms, seq, extra_data.clone());

        assert_eq!(envelope.extra_data, extra_data);
    }

    #[test]
    fn test_new_replay_seq_can_be_large() {
        // Test with a large sequence number
        let large_seq = u64::MAX;
        let envelope = BridgeEnvelope::new_replay(test_message(), 1234567890, large_seq, None);
        assert_eq!(envelope.seq, large_seq);
    }

    // ========================================================================
    // Tests for BridgeEnvelope::is_supported_version()
    #[test]
    fn test_envelope_version_constant_is_one() {
        assert_eq!(ENVELOPE_VERSION, 1);
    }

    #[test]
    fn test_is_supported_version_with_supported_version() {
        // Version 1 is supported
        let envelope = TestEnvelopeBuilder::new()
            .version(1)
            .message(test_message())
            .build();
        assert!(envelope.is_supported_version());
    }

    #[test]
    fn test_is_supported_version_with_unsupported_version() {
        // Version 0 is not supported
        let envelope = TestEnvelopeBuilder::new()
            .version(0)
            .message(test_message())
            .build();
        assert!(!envelope.is_supported_version());
    }

    #[test]
    fn test_is_supported_version_with_future_version() {
        // Version 2 is not supported (only version 1 is)
        let envelope = TestEnvelopeBuilder::new()
            .version(2)
            .message(test_message())
            .build();
        assert!(!envelope.is_supported_version());
    }

    #[test]
    fn test_is_supported_version_with_large_unsupported_version() {
        let envelope = TestEnvelopeBuilder::new()
            .version(999)
            .message(test_message())
            .build();
        assert!(!envelope.is_supported_version());
    }

    #[test]
    fn test_supported_versions_constant() {
        // Verify SUPPORTED_VERSIONS contains version 1
        assert!(SUPPORTED_VERSIONS.contains(&1));
        // Verify it doesn't contain other versions
        assert!(!SUPPORTED_VERSIONS.contains(&0));
        assert!(!SUPPORTED_VERSIONS.contains(&2));
    }

    // ========================================================================
    // Tests for serialization/deserialization (round-trip)
    // ========================================================================

    #[test]
    fn test_serialization_roundtrip_basic() {
        let original = BridgeEnvelope::new(test_message(), 1234567890);

        // Serialize
        let json = serde_json::to_string(&original).expect("Failed to serialize");

        // Deserialize
        let deserialized: BridgeEnvelope =
            serde_json::from_str(&json).expect("Failed to deserialize");

        // Verify
        assert_eq!(original.version, deserialized.version);
        assert_eq!(original.seq, deserialized.seq);
        assert_eq!(original.timestamp_ms, deserialized.timestamp_ms);
        assert_eq!(original.extra_data, deserialized.extra_data);
    }

    #[test]
    fn test_serialization_roundtrip_with_extra_data() {
        let extra_data = Some(json!({"key": "value", "number": 42}));
        let original =
            BridgeEnvelope::new_replay(test_message(), 1234567890, 100, extra_data.clone());

        // Serialize
        let json = serde_json::to_string(&original).expect("Failed to serialize");

        // Deserialize
        let deserialized: BridgeEnvelope =
            serde_json::from_str(&json).expect("Failed to deserialize");

        // Verify
        assert_eq!(original.version, deserialized.version);
        assert_eq!(original.seq, deserialized.seq);
        assert_eq!(original.timestamp_ms, deserialized.timestamp_ms);
        assert_eq!(original.extra_data, deserialized.extra_data);
    }

    #[test]
    fn test_serialization_skips_none_extra_data() {
        let envelope = BridgeEnvelope::new(test_message(), 1234567890);

        // Serialize
        let json = serde_json::to_string(&envelope).expect("Failed to serialize");

        // Verify that extra_data field is not present in JSON when None
        assert!(!json.contains("extraData"));
        assert!(!json.contains("extra_data"));
    }

    #[test]
    fn test_serialization_includes_some_extra_data() {
        let envelope =
            BridgeEnvelope::new_replay(test_message(), 1234567890, 1, Some(json!({"test": true})));

        // Serialize
        let json = serde_json::to_string(&envelope).expect("Failed to serialize");

        // Verify that extra_data is present in JSON
        assert!(json.contains("extraData") || json.contains("extra_data"));
    }

    #[test]
    fn test_serialization_with_different_message_types() {
        // Test with BridgeStatus message
        let status_message = BridgeMessage::BridgeStatus {
            status: BridgeStatus::Connected,
        };
        let envelope = BridgeEnvelope::new(status_message, 1234567890);

        let json = serde_json::to_string(&envelope).expect("Failed to serialize");
        let deserialized: BridgeEnvelope =
            serde_json::from_str(&json).expect("Failed to deserialize");

        assert!(matches!(
            deserialized.message,
            BridgeMessage::BridgeStatus {
                status: BridgeStatus::Connected
            }
        ));
    }

    #[test]
    fn test_serialization_all_message_variants_roundtrip() {
        // Test AcpPayload
        let acp_envelope = BridgeEnvelope::new(
            BridgeMessage::AcpPayload {
                payload: json!({"method": "test", "params": [1, 2, 3]}),
            },
            1234567890,
        );
        let json = serde_json::to_string(&acp_envelope).unwrap();
        let deserialized: BridgeEnvelope = serde_json::from_str(&json).unwrap();
        assert!(matches!(
            deserialized.message,
            BridgeMessage::AcpPayload { .. }
        ));

        // Test BridgeStatus - all variants
        for status in [
            BridgeStatus::Starting,
            BridgeStatus::Connected,
            BridgeStatus::Reconnecting,
            BridgeStatus::Disconnected,
            BridgeStatus::Error,
        ] {
            let envelope = BridgeEnvelope::new(BridgeMessage::BridgeStatus { status }, 1234567890);
            let json = serde_json::to_string(&envelope).unwrap();
            let deserialized: BridgeEnvelope = serde_json::from_str(&json).unwrap();
            assert!(matches!(
                deserialized.message,
                BridgeMessage::BridgeStatus { .. }
            ));
        }

        // Test Stderr
        let stderr_envelope = BridgeEnvelope::new(
            BridgeMessage::Stderr {
                line: "Error message".to_string(),
            },
            1234567890,
        );
        let json = serde_json::to_string(&stderr_envelope).unwrap();
        let deserialized: BridgeEnvelope = serde_json::from_str(&json).unwrap();
        match deserialized.message {
            BridgeMessage::Stderr { line } => assert_eq!(line, "Error message"),
            _ => panic!("Expected Stderr"),
        }

        // Test ProcessExit
        let exit_envelope = BridgeEnvelope::new(
            BridgeMessage::ProcessExit {
                code: Some(1),
                signal: Some("SIGTERM".to_string()),
            },
            1234567890,
        );
        let json = serde_json::to_string(&exit_envelope).unwrap();
        let deserialized: BridgeEnvelope = serde_json::from_str(&json).unwrap();
        match deserialized.message {
            BridgeMessage::ProcessExit { code, signal } => {
                assert_eq!(code, Some(1));
                assert_eq!(signal, Some("SIGTERM".to_string()));
            }
            _ => panic!("Expected ProcessExit"),
        }

        // Test ReplayMetadata
        let replay_envelope = BridgeEnvelope::new(
            BridgeMessage::ReplayMetadata {
                captured_at_ms: 1234567890,
                total_envelopes: 100,
                description: Some("Test session".to_string()),
            },
            1234567890,
        );
        let json = serde_json::to_string(&replay_envelope).unwrap();
        let deserialized: BridgeEnvelope = serde_json::from_str(&json).unwrap();
        match deserialized.message {
            BridgeMessage::ReplayMetadata {
                captured_at_ms,
                total_envelopes,
                description,
            } => {
                assert_eq!(captured_at_ms, 1234567890);
                assert_eq!(total_envelopes, 100);
                assert_eq!(description, Some("Test session".to_string()));
            }
            _ => panic!("Expected ReplayMetadata"),
        }

        // Test StartAgent
        let start_agent_envelope = BridgeEnvelope::new(
            BridgeMessage::StartAgent {
                command: "node".to_string(),
                args: vec!["script.js".to_string()],
                cwd: Some("/workspace".to_string()),
                env: vec![("NODE_ENV".to_string(), "test".to_string())],
            },
            1234567890,
        );
        let json = serde_json::to_string(&start_agent_envelope).unwrap();
        let deserialized: BridgeEnvelope = serde_json::from_str(&json).unwrap();
        match deserialized.message {
            BridgeMessage::StartAgent {
                command,
                args,
                cwd,
                env,
            } => {
                assert_eq!(command, "node");
                assert_eq!(args, vec!["script.js"]);
                assert_eq!(cwd, Some("/workspace".to_string()));
                assert_eq!(env, vec![("NODE_ENV".to_string(), "test".to_string())]);
            }
            _ => panic!("Expected StartAgent"),
        }

        // Test WorkspaceEvent
        let ws_evt = BridgeEnvelope::new(
            BridgeMessage::workspace_event(json!({"workspaceId": "ws-1"})),
            1234567890,
        );
        let json = serde_json::to_string(&ws_evt).unwrap();
        let deserialized: BridgeEnvelope = serde_json::from_str(&json).unwrap();
        assert!(matches!(
            deserialized.message,
            BridgeMessage::WorkspaceEvent { .. }
        ));

        // Test WorktreeEvent
        let wt_evt = BridgeEnvelope::new(
            BridgeMessage::worktree_event(json!({"worktreeId": "wt-1"})),
            1234567890,
        );
        let json = serde_json::to_string(&wt_evt).unwrap();
        let deserialized: BridgeEnvelope = serde_json::from_str(&json).unwrap();
        assert!(matches!(
            deserialized.message,
            BridgeMessage::WorktreeEvent { .. }
        ));

        // Test GitResponse
        let git = BridgeEnvelope::new(
            BridgeMessage::git_response(json!({"diff": "..."})),
            1234567890,
        );
        let json = serde_json::to_string(&git).unwrap();
        let deserialized: BridgeEnvelope = serde_json::from_str(&json).unwrap();
        assert!(matches!(
            deserialized.message,
            BridgeMessage::GitResponse { .. }
        ));

        // Test FileResponse
        let file = BridgeEnvelope::new(
            BridgeMessage::file_response(json!({"content": "data"})),
            1234567890,
        );
        let json = serde_json::to_string(&file).unwrap();
        let deserialized: BridgeEnvelope = serde_json::from_str(&json).unwrap();
        assert!(matches!(
            deserialized.message,
            BridgeMessage::FileResponse { .. }
        ));

        // Test AgentEvent
        let agent = BridgeEnvelope::new(
            BridgeMessage::agent_event(json!({"status": "Working"})),
            1234567890,
        );
        let json = serde_json::to_string(&agent).unwrap();
        let deserialized: BridgeEnvelope = serde_json::from_str(&json).unwrap();
        assert!(matches!(
            deserialized.message,
            BridgeMessage::AgentEvent { .. }
        ));

        // Test TerminalEvent
        let term = BridgeEnvelope::new(
            BridgeMessage::terminal_event(json!({"sessionId": "pty-1"})),
            1234567890,
        );
        let json = serde_json::to_string(&term).unwrap();
        let deserialized: BridgeEnvelope = serde_json::from_str(&json).unwrap();
        assert!(matches!(
            deserialized.message,
            BridgeMessage::TerminalEvent { .. }
        ));

        // Test StateSnapshot
        let snap = BridgeEnvelope::new(
            BridgeMessage::state_snapshot(json!({"workspaces": []})),
            1234567890,
        );
        let json = serde_json::to_string(&snap).unwrap();
        let deserialized: BridgeEnvelope = serde_json::from_str(&json).unwrap();
        assert!(matches!(
            deserialized.message,
            BridgeMessage::StateSnapshot { .. }
        ));

        // Test Notification
        let notif = BridgeEnvelope::new(
            BridgeMessage::notification(json!({"level": "Info", "title": "T", "message": "M"})),
            1234567890,
        );
        let json = serde_json::to_string(&notif).unwrap();
        let deserialized: BridgeEnvelope = serde_json::from_str(&json).unwrap();
        assert!(matches!(
            deserialized.message,
            BridgeMessage::Notification { .. }
        ));

        // Test ErrorResponse
        let err = BridgeEnvelope::new(
            BridgeMessage::error_response(json!({"code": "err", "message": "fail"})),
            1234567890,
        );
        let json = serde_json::to_string(&err).unwrap();
        let deserialized: BridgeEnvelope = serde_json::from_str(&json).unwrap();
        assert!(matches!(
            deserialized.message,
            BridgeMessage::ErrorResponse { .. }
        ));

        // Test Ack
        let ack = BridgeEnvelope::new(
            BridgeMessage::ack(json!({"messageId": "m1", "status": "Success"})),
            1234567890,
        );
        let json = serde_json::to_string(&ack).unwrap();
        let deserialized: BridgeEnvelope = serde_json::from_str(&json).unwrap();
        assert!(matches!(deserialized.message, BridgeMessage::Ack { .. }));

        // Test Ping
        let ping = BridgeEnvelope::new(BridgeMessage::ping(json!({"timestamp": 123})), 1234567890);
        let json = serde_json::to_string(&ping).unwrap();
        let deserialized: BridgeEnvelope = serde_json::from_str(&json).unwrap();
        assert!(matches!(deserialized.message, BridgeMessage::Ping { .. }));

        // Test Pong
        let pong = BridgeEnvelope::new(BridgeMessage::pong(json!({"timestamp": 456})), 1234567890);
        let json = serde_json::to_string(&pong).unwrap();
        let deserialized: BridgeEnvelope = serde_json::from_str(&json).unwrap();
        assert!(matches!(deserialized.message, BridgeMessage::Pong { .. }));
    }

    #[test]
    fn test_serialization_json_structure() {
        // Verify the exact JSON structure matches expected format
        let envelope = BridgeEnvelope::new(
            BridgeMessage::AcpPayload {
                payload: json!({"test": "value"}),
            },
            1234567890,
        );

        let json = serde_json::to_string(&envelope).unwrap();
        let value: serde_json::Value = serde_json::from_str(&json).unwrap();

        // Verify top-level fields
        assert_eq!(value["version"], 1);
        assert_eq!(value["seq"], 0);
        assert_eq!(value["timestamp_ms"], 1234567890);
        assert!(value.get("extra_data").is_none()); // Should be omitted when None
        assert_eq!(value["type"], "acp_payload");
        assert_eq!(value["payload"]["test"], "value");
    }

    #[test]
    fn test_serialization_json_structure_with_extra_data() {
        // Verify JSON structure with extra_data included
        let envelope = BridgeEnvelope::new_replay(
            BridgeMessage::AcpPayload {
                payload: json!({"method": "test"}),
            },
            9876543210,
            42,
            Some(json!({"replaySpeed": 2.0, "sessionId": "abc-123"})),
        );

        let json = serde_json::to_string(&envelope).unwrap();
        let value: serde_json::Value = serde_json::from_str(&json).unwrap();

        // Verify all fields including extra_data
        assert_eq!(value["version"], 1);
        assert_eq!(value["seq"], 42);
        assert_eq!(value["timestamp_ms"], serde_json::json!(9876543210i64));
        assert_eq!(value["extra_data"]["replaySpeed"], 2.0);
        assert_eq!(value["extra_data"]["sessionId"], "abc-123");
        assert_eq!(value["type"], "acp_payload");
        assert_eq!(value["payload"]["method"], "test");
    }

    // ========================================================================
    // Tests for extra_data handling edge cases
    // ========================================================================

    #[test]
    fn test_extra_data_empty_object() {
        let envelope = BridgeEnvelope::new_replay(test_message(), 1234567890, 1, Some(json!({})));
        assert_eq!(envelope.extra_data, Some(json!({})));
    }

    #[test]
    fn test_extra_data_null_value() {
        let envelope = BridgeEnvelope::new_replay(test_message(), 1234567890, 1, Some(json!(null)));
        assert_eq!(envelope.extra_data, Some(json!(null)));
    }

    #[test]
    fn test_extra_data_array() {
        let envelope = BridgeEnvelope::new_replay(
            test_message(),
            1234567890,
            1,
            Some(json!([1, 2, 3, "test"])),
        );
        assert_eq!(envelope.extra_data, Some(json!([1, 2, 3, "test"])));
    }

    #[test]
    fn test_extra_data_large_string() {
        let large_string = "x".repeat(10000);
        let envelope = BridgeEnvelope::new_replay(
            test_message(),
            1234567890,
            1,
            Some(json!(large_string.clone())),
        );
        assert_eq!(envelope.extra_data, Some(json!(large_string)));
    }

    #[test]
    fn test_extra_data_deeply_nested() {
        let nested = json!({
            "level1": {
                "level2": {
                    "level3": {
                        "level4": {
                            "value": "deep"
                        }
                    }
                }
            }
        });
        let envelope =
            BridgeEnvelope::new_replay(test_message(), 1234567890, 1, Some(nested.clone()));
        assert_eq!(envelope.extra_data, Some(nested));
    }

    // ========================================================================
    // Tests using EnvelopeBuilder
    // ========================================================================

    #[test]
    fn test_envelope_builder_default_values() {
        let envelope = TestEnvelopeBuilder::new().message(test_message()).build();

        assert_eq!(envelope.version, ENVELOPE_VERSION);
        assert_eq!(envelope.seq, 0);
        assert_eq!(envelope.timestamp_ms, 1234567890);
        assert!(envelope.extra_data.is_none());
    }

    #[test]
    fn test_envelope_builder_with_all_fields() {
        let envelope = TestEnvelopeBuilder::new()
            .version(1)
            .seq(50)
            .timestamp_ms(1234567890)
            .extra_data(json!({"custom": "data"}))
            .message(test_message())
            .build();

        assert_eq!(envelope.version, 1);
        assert_eq!(envelope.seq, 50);
        assert_eq!(envelope.timestamp_ms, 1234567890);
        assert_eq!(envelope.extra_data, Some(json!({"custom": "data"})));
    }

    #[test]
    fn test_envelope_builder_version_override() {
        // Test building with unsupported version (for testing error cases)
        let envelope = TestEnvelopeBuilder::new()
            .version(999)
            .message(test_message())
            .build();

        assert_eq!(envelope.version, 999);
        assert!(!envelope.is_supported_version());
    }

    // ========================================================================
    // Tests for UnsupportedVersionError
    // ========================================================================

    #[test]
    fn test_unsupported_version_error_display() {
        let error = UnsupportedVersionError {
            received: 999,
            supported: SUPPORTED_VERSIONS.to_vec(),
        };

        let display = format!("{}", error);
        assert!(display.contains("999"));
        assert!(display.contains("supported versions"));
        assert!(display.contains("[1]"));
    }

    #[test]
    fn test_unsupported_version_error_debug() {
        let error = UnsupportedVersionError {
            received: 0,
            supported: vec![1],
        };

        let debug = format!("{:?}", error);
        assert!(debug.contains("UnsupportedVersionError"));
    }

    // ========================================================================
    // Tests for valid envelope JSON parsing
    // ========================================================================

    #[test]
    fn test_parse_valid_envelope_minimal() {
        // Minimal valid envelope with only required fields
        let json = json!({
            "version": 1,
            "seq": 0,
            "timestamp_ms": 1234567890,
            "type": "acp_payload",
            "payload": {"jsonrpc": "2.0", "method": "test"}
        });

        let envelope: BridgeEnvelope =
            serde_json::from_value(json).expect("Should parse valid minimal envelope");

        assert_eq!(envelope.version, 1);
        assert_eq!(envelope.seq, 0);
        assert_eq!(envelope.timestamp_ms, 1234567890);
        assert!(envelope.extra_data.is_none());
    }

    #[test]
    fn test_parse_valid_envelope_with_extra_data() {
        let json = serde_json::json!({
            "version": 1,
            "seq": 42,
            "timestamp_ms": 1234567890,
            "extra_data": {"replaySpeed": 2.0, "sessionId": "abc-123"},
            "type": "acp_payload",
            "payload": {"method": "test"}
        });

        let envelope: BridgeEnvelope =
            serde_json::from_value(json).expect("Should parse valid envelope with extra_data");

        assert_eq!(envelope.version, 1);
        assert_eq!(envelope.seq, 42);
        assert!(envelope.extra_data.is_some());
    }

    #[test]
    fn test_parse_valid_envelope_all_message_types() {
        // Test AcpPayload
        let json = json!({
            "version": 1, "seq": 0, "timestamp_ms": 1,
            "type": "acp_payload", "payload": {"method": "test"}
        });
        assert!(serde_json::from_value::<BridgeEnvelope>(json).is_ok());

        // Test BridgeStatus
        let json = json!({
            "version": 1, "seq": 0, "timestamp_ms": 1,
            "type": "bridge_status", "status": "connected"
        });
        assert!(serde_json::from_value::<BridgeEnvelope>(json).is_ok());

        // Test Stderr
        let json = json!({
            "version": 1, "seq": 0, "timestamp_ms": 1,
            "type": "stderr", "line": "Error message"
        });
        assert!(serde_json::from_value::<BridgeEnvelope>(json).is_ok());

        // Test ProcessExit
        let json = json!({
            "version": 1, "seq": 0, "timestamp_ms": 1,
            "type": "process_exit", "code": 1, "signal": "SIGTERM"
        });
        assert!(serde_json::from_value::<BridgeEnvelope>(json).is_ok());

        // Test ReplayMetadata
        let json = json!({
            "version": 1, "seq": 0, "timestamp_ms": 1,
            "type": "replay_metadata",
            "captured_at_ms": 123, "total_envelopes": 100, "description": "Test"
        });
        assert!(serde_json::from_value::<BridgeEnvelope>(json).is_ok());

        // Test StartAgent
        let json = json!({
            "version": 1, "seq": 0, "timestamp_ms": 1,
            "type": "start_agent",
            "command": "node", "args": ["script.js"], "cwd": "/workspace",
            "env": [["NODE_ENV", "test"]]
        });
        assert!(serde_json::from_value::<BridgeEnvelope>(json).is_ok());
    }

    // ========================================================================
    // Tests for invalid envelope rejection - missing required fields
    // ========================================================================

    #[test]
    fn test_parse_invalid_envelope_missing_version() {
        let json = serde_json::json!({
            "seq": 0,
            "timestamp_ms": "1234567890",
            "type": "acp_payload",
            "payload": {"method": "test"}
        });

        let result: Result<BridgeEnvelope, _> = serde_json::from_value(json);
        assert!(result.is_err(), "Should fail without version field");
    }

    #[test]
    fn test_parse_invalid_envelope_missing_seq() {
        let json = json!({
            "version": 1,
            "timestamp_ms": 1234567890,
            "type": "acp_payload",
            "payload": {"method": "test"}
        });

        let result: Result<BridgeEnvelope, _> = serde_json::from_value(json);
        assert!(result.is_err(), "Should fail without seq field");
    }

    #[test]
    fn test_parse_invalid_envelope_missing_timestamp() {
        let json = json!({
            "version": 1,
            "seq": 0,
            "type": "acp_payload",
            "payload": {"method": "test"}
        });

        let result: Result<BridgeEnvelope, _> = serde_json::from_value(json);
        assert!(result.is_err(), "Should fail without timestamp_ms field");
    }

    #[test]
    fn test_parse_invalid_envelope_missing_message_type() {
        let json = json!({
            "version": 1,
            "seq": 0,
            "timestamp_ms": 1234567890
            // Missing type field for BridgeMessage
        });

        let result: Result<BridgeEnvelope, _> = serde_json::from_value(json);
        assert!(result.is_err(), "Should fail without message type field");
    }

    #[test]
    fn test_parse_invalid_envelope_missing_payload_for_acp() {
        let json = json!({
            "version": 1,
            "seq": 0,
            "timestamp_ms": 1234567890,
            "type": "acp_payload"
            // Missing payload field
        });

        let result: Result<BridgeEnvelope, _> = serde_json::from_value(json);
        assert!(
            result.is_err(),
            "Should fail without payload for acp_payload type"
        );
    }

    // ========================================================================
    // Tests for invalid envelope rejection - wrong field types
    // ========================================================================

    #[test]
    fn test_parse_invalid_envelope_wrong_version_type() {
        let json = json!({
            "version": "1",  // String instead of number
            "seq": 0,
            "timestamp_ms": 1234567890,
            "type": "acp_payload",
            "payload": {"method": "test"}
        });

        let result: Result<BridgeEnvelope, _> = serde_json::from_value(json);
        assert!(result.is_err(), "Should fail with string version");
    }

    #[test]
    fn test_parse_invalid_envelope_wrong_seq_type() {
        let json = json!({
            "version": 1,
            "seq": "zero",  // String instead of number
            "timestamp_ms": 1234567890,
            "type": "acp_payload",
            "payload": {"method": "test"}
        });

        let result: Result<BridgeEnvelope, _> = serde_json::from_value(json);
        assert!(result.is_err(), "Should fail with string seq");
    }

    #[test]
    fn test_parse_invalid_envelope_wrong_timestamp_type() {
        let json = json!({
            "version": 1,
            "seq": 0,
            "timestamp_ms": "1234567890",  // String instead of number
            "type": "acp_payload",
            "payload": {"method": "test"}
        });

        let result: Result<BridgeEnvelope, _> = serde_json::from_value(json);
        assert!(result.is_err(), "Should fail with string timestamp");
    }

    #[test]
    fn test_extra_data_accepts_all_json_types() {
        let json_string = json!({
            "version": 1,
            "seq": 0,
            "timestamp_ms": 1234567890,
            "extra_data": "string value",
            "type": "acp_payload",
            "payload": {"method": "test"}
        });
        assert!(serde_json::from_value::<BridgeEnvelope>(json_string).is_ok());

        let json_number = json!({
            "version": 1,
            "seq": 0,
            "timestamp_ms": 1234567890,
            "extra_data": 42,
            "type": "acp_payload",
            "payload": {"method": "test"}
        });
        assert!(serde_json::from_value::<BridgeEnvelope>(json_number).is_ok());

        let json_array = json!({
            "version": 1,
            "seq": 0,
            "timestamp_ms": 1234567890,
            "extra_data": [1, 2, 3],
            "type": "acp_payload",
            "payload": {"method": "test"}
        });
        assert!(serde_json::from_value::<BridgeEnvelope>(json_array).is_ok());
    }

    #[test]
    fn test_parse_invalid_envelope_unknown_message_type() {
        let json = json!({
            "version": 1,
            "seq": 0,
            "timestamp_ms": 1234567890,
            "type": "unknown_type",  // Not a valid BridgeMessage variant
            "data": {}
        });

        let result: Result<BridgeEnvelope, _> = serde_json::from_value(json);
        assert!(result.is_err(), "Should fail with unknown message type");
    }

    // ========================================================================
    // Tests for version validation
    // ========================================================================

    #[test]
    fn test_version_validation_supported_version_1() {
        let json = json!({
            "version": 1,
            "seq": 0,
            "timestamp_ms": 1234567890,
            "type": "acp_payload",
            "payload": {"method": "test"}
        });

        let envelope: BridgeEnvelope =
            serde_json::from_value(json).expect("Should parse version 1");
        assert!(envelope.is_supported_version());
    }

    #[test]
    fn test_version_validation_unsupported_version_0() {
        let json = json!({
            "version": 0,
            "seq": 0,
            "timestamp_ms": 1234567890,
            "type": "acp_payload",
            "payload": {"method": "test"}
        });

        let envelope: BridgeEnvelope =
            serde_json::from_value(json).expect("Should parse version 0 (but it's unsupported)");
        assert!(!envelope.is_supported_version());
    }

    #[test]
    fn test_version_validation_unsupported_version_2() {
        let json = json!({
            "version": 2,
            "seq": 0,
            "timestamp_ms": 1234567890,
            "type": "acp_payload",
            "payload": {"method": "test"}
        });

        let envelope: BridgeEnvelope =
            serde_json::from_value(json).expect("Should parse version 2 (but it's unsupported)");
        assert!(!envelope.is_supported_version());
    }

    #[test]
    fn test_version_validation_unsupported_large_version() {
        let json = json!({
            "version": 999,
            "seq": 0,
            "timestamp_ms": 1234567890,
            "type": "acp_payload",
            "payload": {"method": "test"}
        });

        let envelope: BridgeEnvelope =
            serde_json::from_value(json).expect("Should parse version 999");
        assert!(!envelope.is_supported_version());
    }

    // ========================================================================
    // Tests for malformed JSON handling
    // ========================================================================

    #[test]
    fn test_malformed_json_empty_string() {
        let result: Result<BridgeEnvelope, _> = serde_json::from_str("");
        assert!(result.is_err(), "Should fail with empty string");
    }

    #[test]
    fn test_malformed_json_invalid_syntax() {
        let result: Result<BridgeEnvelope, _> = serde_json::from_str("{ invalid json }");
        assert!(result.is_err(), "Should fail with invalid JSON syntax");
    }

    #[test]
    fn test_malformed_json_trailing_comma() {
        let result: Result<BridgeEnvelope, _> = serde_json::from_str(
            r#"{"version": 1, "seq": 0, "timestamp_ms": 1, "type": "acp_payload", "payload": {},}"#,
        );
        assert!(result.is_err(), "Should fail with trailing comma");
    }

    #[test]
    fn test_malformed_json_missing_closing_brace() {
        let result: Result<BridgeEnvelope, _> =
            serde_json::from_str(r#"{"version": 1, "seq": 0, "timestamp_ms": 1"#);
        assert!(result.is_err(), "Should fail with missing closing brace");
    }

    #[test]
    fn test_malformed_json_not_an_object() {
        let result: Result<BridgeEnvelope, _> = serde_json::from_str("[]");
        assert!(result.is_err(), "Should fail with array instead of object");

        let result: Result<BridgeEnvelope, _> = serde_json::from_str("\"string\"");
        assert!(result.is_err(), "Should fail with string instead of object");

        let result: Result<BridgeEnvelope, _> = serde_json::from_str("123");
        assert!(result.is_err(), "Should fail with number instead of object");
    }

    #[test]
    fn test_malformed_json_null() {
        let result: Result<BridgeEnvelope, _> = serde_json::from_str("null");
        assert!(result.is_err(), "Should fail with null");
    }

    // ========================================================================
    // Tests for edge cases - empty strings, null values, extra fields
    // ========================================================================

    #[test]
    fn test_edge_case_empty_string_in_message() {
        // Empty string in payload
        let json = json!({
            "version": 1,
            "seq": 0,
            "timestamp_ms": 1234567890,
            "type": "stderr",
            "line": ""
        });

        let envelope: BridgeEnvelope =
            serde_json::from_value(json).expect("Should parse with empty line");

        match envelope.message {
            BridgeMessage::Stderr { ref line } => assert_eq!(line, ""),
            _ => panic!("Expected Stderr message"),
        }
    }

    #[test]
    fn test_edge_case_null_extra_data() {
        // Explicit null for extraData should be treated as None
        let json = json!({
            "version": 1,
            "seq": 0,
            "timestamp_ms": 1234567890,
            "extraData": null,
            "type": "acp_payload",
            "payload": {"method": "test"}
        });

        let envelope: BridgeEnvelope =
            serde_json::from_value(json).expect("Should parse with null extraData");
        assert!(envelope.extra_data.is_none());
    }

    #[test]
    fn test_edge_case_extra_fields_ignored() {
        // Extra unknown fields should be ignored by serde
        let json = json!({
            "version": 1,
            "seq": 0,
            "timestamp_ms": 1234567890,
            "type": "acp_payload",
            "payload": {"method": "test"},
            "unknownField": "should be ignored",
            "anotherUnknown": {"nested": "value"}
        });

        let envelope: BridgeEnvelope =
            serde_json::from_value(json).expect("Should parse with extra unknown fields");

        assert_eq!(envelope.version, 1);
        assert_eq!(envelope.seq, 0);
    }

    #[test]
    fn test_edge_case_empty_payload_object() {
        let json = json!({
            "version": 1,
            "seq": 0,
            "timestamp_ms": 1234567890,
            "type": "acp_payload",
            "payload": {}
        });

        let envelope: BridgeEnvelope =
            serde_json::from_value(json).expect("Should parse with empty payload object");

        match envelope.message {
            BridgeMessage::AcpPayload { ref payload } => {
                assert_eq!(payload, &json!({}));
            }
            _ => panic!("Expected AcpPayload message"),
        }
    }

    #[test]
    fn test_edge_case_large_seq_value() {
        let json = json!({
            "version": 1,
            "seq": u64::MAX,
            "timestamp_ms": 1234567890,
            "type": "acp_payload",
            "payload": {"method": "test"}
        });

        let envelope: BridgeEnvelope =
            serde_json::from_value(json).expect("Should parse with max seq value");
        assert_eq!(envelope.seq, u64::MAX);
    }

    #[test]
    fn test_edge_case_zero_timestamp() {
        let json = json!({
            "version": 1,
            "seq": 0,
            "timestamp_ms": 0,
            "type": "acp_payload",
            "payload": {"method": "test"}
        });

        let envelope: BridgeEnvelope =
            serde_json::from_value(json).expect("Should parse with zero timestamp");
        assert_eq!(envelope.timestamp_ms, 0);
    }

    #[test]
    fn test_edge_case_empty_extra_data_object() {
        let json = json!({
            "version": 1,
            "seq": 0,
            "timestamp_ms": 1234567890,
            "extra_data": {},
            "type": "acp_payload",
            "payload": {"method": "test"}
        });

        let envelope: BridgeEnvelope =
            serde_json::from_value(json).expect("Should parse with empty extra_data object");
        // Empty object is preserved as Some(Object({}))
        assert!(envelope.extra_data.is_some());
    }

    #[test]
    fn test_edge_case_process_exit_with_nulls() {
        let json = json!({
            "version": 1,
            "seq": 0,
            "timestamp_ms": 1234567890,
            "type": "process_exit",
            "code": null,
            "signal": null
        });

        let envelope: BridgeEnvelope =
            serde_json::from_value(json).expect("Should parse process_exit with nulls");

        match envelope.message {
            BridgeMessage::ProcessExit { code, signal } => {
                assert_eq!(code, None);
                assert_eq!(signal, None);
            }
            _ => panic!("Expected ProcessExit message"),
        }
    }

    #[test]
    fn test_edge_case_start_agent_with_empty_arrays() {
        let json = json!({
            "version": 1,
            "seq": 0,
            "timestamp_ms": 1234567890,
            "type": "start_agent",
            "command": "node",
            "args": [],
            "cwd": null,
            "env": []
        });

        let envelope: BridgeEnvelope =
            serde_json::from_value(json).expect("Should parse start_agent with empty arrays");

        match envelope.message {
            BridgeMessage::StartAgent {
                command,
                args,
                cwd,
                env,
            } => {
                assert_eq!(command, "node");
                assert_eq!(args, Vec::<String>::new());
                assert_eq!(cwd, None);
                assert_eq!(env, Vec::<(String, String)>::new());
            }
            _ => panic!("Expected StartAgent message"),
        }
    }
}
