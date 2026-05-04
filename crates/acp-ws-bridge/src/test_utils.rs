//! Test utilities for acp-ws-bridge tests.

use crate::contract::{BridgeEnvelope, BridgeMessage, BridgeStatus, ENVELOPE_VERSION};
use serde_json::json;

/// Builder pattern for creating test BridgeEnvelope instances.
pub struct EnvelopeBuilder {
    version: u32,
    seq: u64,
    timestamp_ms: u64,
    extra_data: Option<serde_json::Value>,
    message: Option<BridgeMessage>,
}

impl Default for EnvelopeBuilder {
    fn default() -> Self {
        Self {
            version: ENVELOPE_VERSION,
            seq: 0,
            timestamp_ms: 1234567890,
            extra_data: None,
            message: None,
        }
    }
}

impl EnvelopeBuilder {
    /// Creates a new builder with default values.
    pub fn new() -> Self {
        Self::default()
    }

    /// Sets the envelope version.
    pub fn version(mut self, version: u32) -> Self {
        self.version = version;
        self
    }

    /// Sets the sequence number.
    pub fn seq(mut self, seq: u64) -> Self {
        self.seq = seq;
        self
    }

    /// Sets the timestamp in milliseconds.
    pub fn timestamp_ms(mut self, timestamp_ms: u64) -> Self {
        self.timestamp_ms = timestamp_ms;
        self
    }

    /// Sets extra data metadata.
    pub fn extra_data(mut self, extra_data: serde_json::Value) -> Self {
        self.extra_data = Some(extra_data);
        self
    }

    /// Sets the message payload.
    pub fn message(mut self, message: BridgeMessage) -> Self {
        self.message = Some(message);
        self
    }

    /// Builds the BridgeEnvelope.
    pub fn build(self) -> BridgeEnvelope {
        BridgeEnvelope {
            version: self.version,
            seq: self.seq,
            timestamp_ms: self.timestamp_ms,
            extra_data: self.extra_data,
            message: self.message.expect("message must be set"),
        }
    }
}

/// Helper functions for creating test messages.
pub struct MessageBuilder;

impl MessageBuilder {
    /// Creates an ACP payload message.
    pub fn acp_payload(payload: serde_json::Value) -> BridgeMessage {
        BridgeMessage::AcpPayload { payload }
    }

    /// Creates an ACP payload message with a JSON-RPC request.
    pub fn acp_request(method: &str, params: serde_json::Value) -> BridgeMessage {
        BridgeMessage::AcpPayload {
            payload: json!({
                "jsonrpc": "2.0",
                "id": 1,
                "method": method,
                "params": params
            }),
        }
    }

    /// Creates a bridge status message.
    pub fn bridge_status(status: BridgeStatus) -> BridgeMessage {
        BridgeMessage::BridgeStatus { status }
    }

    /// Creates a stderr message.
    pub fn stderr(line: &str) -> BridgeMessage {
        BridgeMessage::Stderr {
            line: line.to_string(),
        }
    }

    /// Creates a process exit message.
    pub fn process_exit(code: Option<i32>, signal: Option<&str>) -> BridgeMessage {
        BridgeMessage::ProcessExit {
            code,
            signal: signal.map(|s| s.to_string()),
        }
    }

    /// Creates a replay metadata message.
    pub fn replay_metadata(
        captured_at_ms: u64,
        total_envelopes: u64,
        description: Option<&str>,
    ) -> BridgeMessage {
        BridgeMessage::ReplayMetadata {
            captured_at_ms,
            total_envelopes,
            description: description.map(|s| s.to_string()),
        }
    }

    /// Creates a start agent message.
    pub fn start_agent(
        command: &str,
        args: Vec<&str>,
        cwd: Option<&str>,
        env: Vec<(&str, &str)>,
    ) -> BridgeMessage {
        BridgeMessage::StartAgent {
            command: command.to_string(),
            args: args.into_iter().map(|s| s.to_string()).collect(),
            cwd: cwd.map(|s| s.to_string()),
            env: env
                .into_iter()
                .map(|(k, v)| (k.to_string(), v.to_string()))
                .collect(),
        }
    }
}

/// Common test data constants.
pub mod constants {
    use super::*;

    /// Default test timestamp.
    pub const DEFAULT_TIMESTAMP_MS: u64 = 1234567890;

    /// Default test sequence number.
    pub const DEFAULT_SEQ: u64 = 0;

    /// Sample ACP payload for testing.
    pub fn sample_acp_payload() -> serde_json::Value {
        json!({
            "jsonrpc": "2.0",
            "id": 1,
            "method": "test/method",
            "params": {"test": "value"}
        })
    }

    /// Sample stderr line for testing.
    pub fn sample_stderr_line() -> &'static str {
        "Error: Something went wrong"
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_envelope_builder_default() {
        let envelope = EnvelopeBuilder::new()
            .message(MessageBuilder::acp_payload(json!({})))
            .build();

        assert_eq!(envelope.version, ENVELOPE_VERSION);
        assert_eq!(envelope.seq, 0);
        assert_eq!(envelope.timestamp_ms, 1234567890);
        assert!(envelope.extra_data.is_none());
    }

    #[test]
    fn test_envelope_builder_custom() {
        let envelope = EnvelopeBuilder::new()
            .version(2)
            .seq(100)
            .timestamp_ms(9_876_543_210u64)
            .extra_data(json!({"replaySpeed": 2.0}))
            .message(MessageBuilder::acp_payload(json!({})))
            .build();

        assert_eq!(envelope.version, 2);
        assert_eq!(envelope.seq, 100);
        assert_eq!(envelope.timestamp_ms, 9_876_543_210);
        assert_eq!(envelope.extra_data, Some(json!({"replaySpeed": 2.0})));
    }

    #[test]
    fn test_message_builder_acp_payload() {
        let msg = MessageBuilder::acp_payload(json!({"test": "value"}));

        match msg {
            BridgeMessage::AcpPayload { payload } => {
                assert_eq!(payload, json!({"test": "value"}));
            }
            _ => panic!("Expected AcpPayload"),
        }
    }

    #[test]
    fn test_message_builder_bridge_status() {
        let msg = MessageBuilder::bridge_status(BridgeStatus::Connected);

        match msg {
            BridgeMessage::BridgeStatus { status } => {
                assert_eq!(status, BridgeStatus::Connected);
            }
            _ => panic!("Expected BridgeStatus"),
        }
    }

    #[test]
    fn test_message_builder_stderr() {
        let msg = MessageBuilder::stderr("test error");

        match msg {
            BridgeMessage::Stderr { line } => {
                assert_eq!(line, "test error");
            }
            _ => panic!("Expected Stderr"),
        }
    }

    #[test]
    fn test_message_builder_process_exit() {
        let msg = MessageBuilder::process_exit(Some(1), Some("SIGTERM"));

        match msg {
            BridgeMessage::ProcessExit { code, signal } => {
                assert_eq!(code, Some(1));
                assert_eq!(signal, Some("SIGTERM".to_string()));
            }
            _ => panic!("Expected ProcessExit"),
        }
    }

    #[test]
    fn test_message_builder_replay_metadata() {
        let msg = MessageBuilder::replay_metadata(1234567890, 100, Some("Test session"));

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
            _ => panic!("Expected ReplayMetadata"),
        }
    }

    #[test]
    fn test_message_builder_start_agent() {
        let msg = MessageBuilder::start_agent(
            "node",
            vec!["script.js"],
            Some("/workspace"),
            vec![("NODE_ENV", "test")],
        );

        match msg {
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
    }
}
