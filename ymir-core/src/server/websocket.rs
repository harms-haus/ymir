//! WebSocket Handler Module
//!
//! Provides the WebSocket message handling trait and utilities for
//! processing WebSocket messages. This is the foundation for future
//! JSON-RPC message routing.

use axum::extract::ws::Message;
use std::fmt;

/// Trait for handling WebSocket messages
///
/// Implementors of this trait can be registered to handle incoming
/// WebSocket messages. This is the foundation for JSON-RPC routing
/// that will be implemented in future tasks.
#[async_trait::async_trait]
pub trait WebSocketHandler: Send + Sync {
    /// Handle an incoming text message
    ///
    /// Returns Ok(true) to keep the connection open, Ok(false) to close it,
    /// or Err to close with an error.
    async fn handle_text(&self, text: String) -> Result<bool, String>;

    /// Handle an incoming binary message
    async fn handle_binary(&self, data: Vec<u8>) -> Result<bool, String>;

    /// Handle a ping message (default implementation responds with pong)
    async fn handle_ping(&self, data: Vec<u8>) -> Result<Option<Message>, String> {
        Ok(Some(Message::Pong(data)))
    }

    /// Handle a pong message (default implementation just acknowledges)
    async fn handle_pong(&self, _data: Vec<u8>) -> Result<(), String> {
        Ok(())
    }

    /// Called when the connection is established
    async fn on_connect(&self) -> Result<(), String> {
        Ok(())
    }

    /// Called when the connection is closed
    async fn on_disconnect(&self) -> Result<(), String> {
        Ok(())
    }
}

/// WebSocket message types
#[derive(Debug, Clone, PartialEq)]
pub enum WebSocketMessageType {
    Text,
    Binary,
    Ping,
    Pong,
    Close,
}

impl fmt::Display for WebSocketMessageType {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            WebSocketMessageType::Text => write!(f, "text"),
            WebSocketMessageType::Binary => write!(f, "binary"),
            WebSocketMessageType::Ping => write!(f, "ping"),
            WebSocketMessageType::Pong => write!(f, "pong"),
            WebSocketMessageType::Close => write!(f, "close"),
        }
    }
}

/// Statistics for a WebSocket connection
#[derive(Debug, Clone, Default)]
pub struct ConnectionStats {
    /// Number of messages received
    pub messages_received: u64,
    /// Number of messages sent
    pub messages_sent: u64,
    /// Number of bytes received
    pub bytes_received: u64,
    /// Number of bytes sent
    pub bytes_sent: u64,
    /// Number of ping messages sent
    pub pings_sent: u64,
    /// Number of pong messages received
    pub pongs_received: u64,
}

impl ConnectionStats {
    /// Create new empty stats
    pub fn new() -> Self {
        Self::default()
    }

    /// Record a received message
    pub fn record_received(&mut self, bytes: usize) {
        self.messages_received += 1;
        self.bytes_received += bytes as u64;
    }

    /// Record a sent message
    pub fn record_sent(&mut self, bytes: usize) {
        self.messages_sent += 1;
        self.bytes_sent += bytes as u64;
    }

    /// Record a ping sent
    pub fn record_ping_sent(&mut self) {
        self.pings_sent += 1;
    }

    /// Record a pong received
    pub fn record_pong_received(&mut self) {
        self.pongs_received += 1;
    }
}

/// WebSocket close codes as defined in RFC 6455
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CloseCode {
    /// Normal closure
    Normal = 1000,
    /// Endpoint going away
    GoingAway = 1001,
    /// Protocol error
    ProtocolError = 1002,
    /// Received unacceptable data
    UnsupportedData = 1003,
    /// Reserved
    Reserved = 1004,
    /// No status code present
    NoStatusReceived = 1005,
    /// Abnormal closure
    AbnormalClosure = 1006,
    /// Invalid frame payload data
    InvalidFramePayload = 1007,
    /// Policy violation
    PolicyViolation = 1008,
    /// Message too big
    MessageTooBig = 1009,
    /// Mandatory extension required
    MandatoryExtension = 1010,
    /// Internal server error
    InternalError = 1011,
    /// Service restart
    ServiceRestart = 1012,
    /// Try again later
    TryAgainLater = 1013,
    /// Bad gateway
    BadGateway = 1014,
    /// TLS handshake failure
    TlsHandshake = 1015,
}

impl CloseCode {
    /// Check if this is a valid close code
    pub fn is_valid(code: u16) -> bool {
        match code {
            1000 | 1001 | 1002 | 1003 | 1004 | 1005 | 1006 | 1007 |
            1008 | 1009 | 1010 | 1011 | 1012 | 1013 | 1014 | 1015 => true,
            _ => false,
        }
    }

    /// Convert a u16 to a CloseCode if valid
    pub fn from_u16(code: u16) -> Option<Self> {
        match code {
            1000 => Some(CloseCode::Normal),
            1001 => Some(CloseCode::GoingAway),
            1002 => Some(CloseCode::ProtocolError),
            1003 => Some(CloseCode::UnsupportedData),
            1004 => Some(CloseCode::Reserved),
            1005 => Some(CloseCode::NoStatusReceived),
            1006 => Some(CloseCode::AbnormalClosure),
            1007 => Some(CloseCode::InvalidFramePayload),
            1008 => Some(CloseCode::PolicyViolation),
            1009 => Some(CloseCode::MessageTooBig),
            1010 => Some(CloseCode::MandatoryExtension),
            1011 => Some(CloseCode::InternalError),
            1012 => Some(CloseCode::ServiceRestart),
            1013 => Some(CloseCode::TryAgainLater),
            1014 => Some(CloseCode::BadGateway),
            1015 => Some(CloseCode::TlsHandshake),
            _ => None,
        }
    }
}

impl fmt::Display for CloseCode {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        let description = match self {
            CloseCode::Normal => "normal closure",
            CloseCode::GoingAway => "going away",
            CloseCode::ProtocolError => "protocol error",
            CloseCode::UnsupportedData => "unsupported data",
            CloseCode::Reserved => "reserved",
            CloseCode::NoStatusReceived => "no status received",
            CloseCode::AbnormalClosure => "abnormal closure",
            CloseCode::InvalidFramePayload => "invalid frame payload",
            CloseCode::PolicyViolation => "policy violation",
            CloseCode::MessageTooBig => "message too big",
            CloseCode::MandatoryExtension => "mandatory extension",
            CloseCode::InternalError => "internal error",
            CloseCode::ServiceRestart => "service restart",
            CloseCode::TryAgainLater => "try again later",
            CloseCode::BadGateway => "bad gateway",
            CloseCode::TlsHandshake => "TLS handshake failure",
        };
        write!(f, "{} ({})", *self as u16, description)
    }
}

// ============================================================================
// Tests
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_websocket_message_type_display() {
        assert_eq!(WebSocketMessageType::Text.to_string(), "text");
        assert_eq!(WebSocketMessageType::Binary.to_string(), "binary");
        assert_eq!(WebSocketMessageType::Ping.to_string(), "ping");
        assert_eq!(WebSocketMessageType::Pong.to_string(), "pong");
        assert_eq!(WebSocketMessageType::Close.to_string(), "close");
    }

    #[test]
    fn test_connection_stats() {
        let mut stats = ConnectionStats::new();

        assert_eq!(stats.messages_received, 0);
        assert_eq!(stats.messages_sent, 0);
        assert_eq!(stats.bytes_received, 0);
        assert_eq!(stats.bytes_sent, 0);

        stats.record_received(100);
        assert_eq!(stats.messages_received, 1);
        assert_eq!(stats.bytes_received, 100);

        stats.record_sent(50);
        assert_eq!(stats.messages_sent, 1);
        assert_eq!(stats.bytes_sent, 50);

        stats.record_ping_sent();
        assert_eq!(stats.pings_sent, 1);

        stats.record_pong_received();
        assert_eq!(stats.pongs_received, 1);
    }

    #[test]
    fn test_close_code_valid() {
        assert!(CloseCode::is_valid(1000));
        assert!(CloseCode::is_valid(1001));
        assert!(CloseCode::is_valid(1015));
        assert!(!CloseCode::is_valid(999));
        assert!(!CloseCode::is_valid(1016));
        assert!(!CloseCode::is_valid(0));
    }

    #[test]
    fn test_close_code_from_u16() {
        assert_eq!(CloseCode::from_u16(1000), Some(CloseCode::Normal));
        assert_eq!(CloseCode::from_u16(1001), Some(CloseCode::GoingAway));
        assert_eq!(CloseCode::from_u16(1015), Some(CloseCode::TlsHandshake));
        assert_eq!(CloseCode::from_u16(999), None);
        assert_eq!(CloseCode::from_u16(1016), None);
    }

    #[test]
    fn test_close_code_display() {
        let code = CloseCode::Normal;
        let s = code.to_string();
        assert!(s.contains("1000"));
        assert!(s.contains("normal"));

        let code = CloseCode::InternalError;
        let s = code.to_string();
        assert!(s.contains("1011"));
        assert!(s.contains("internal"));
    }
}
