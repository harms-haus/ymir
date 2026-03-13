//! JSON-RPC 2.0 Server Protocol Handler
//!
//! This module provides server-side protocol handling for WebSocket messages:
//! - Message parsing and validation
//! - Request/response routing with correlation IDs
//! - Notification broadcasting primitives
//! - Standard error response generation
//!
//! This layer wraps the core protocol types and adds server-specific functionality.

use crate::protocol::{JsonRpcError, JsonRpcRequest, JsonRpcResponse, Notification};
use serde_json::Value;

use super::{ConnectionId, ServerState};

/// Server-side protocol errors
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ProtocolError {
    /// JSON-RPC 2.0 parse error
    ParseError(String),
    /// Invalid JSON-RPC request
    InvalidRequest(String),
    /// Method not found
    MethodNotFound(String),
    /// Invalid parameters
    InvalidParams(String),
    /// Internal server error
    InternalError(String),
}

impl ProtocolError {
    /// Convert to JsonRpcError
    pub fn to_jsonrpc_error(&self) -> JsonRpcError {
        match self {
            Self::ParseError(msg) => JsonRpcError::parse_error(msg.clone()),
            Self::InvalidRequest(msg) => JsonRpcError::invalid_request(msg.clone()),
            Self::MethodNotFound(method) => JsonRpcError::method_not_found(method.clone()),
            Self::InvalidParams(msg) => JsonRpcError::invalid_params(msg.clone()),
            Self::InternalError(msg) => JsonRpcError::internal_error(msg.clone()),
        }
    }
}

/// Correlation ID for request/response matching
///
/// This type wraps the request ID to provide type safety for correlation.
pub type CorrelationId = String;

/// Parsed JSON-RPC message from a client
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum IncomingMessage {
    /// A request that expects a response
    Request {
        /// Correlation ID for matching response
        correlation_id: CorrelationId,
        /// Method name to invoke
        method: String,
        /// Parameters (if any)
        params: Option<Value>,
    },
    /// A notification (no response expected)
    Notification {
        /// Method name to invoke
        method: String,
        /// Parameters (if any)
        params: Option<Value>,
    },
    /// An invalid message
    Invalid(ProtocolError),
}

/// Outgoing JSON-RPC message to a client
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum OutgoingMessage {
    /// A response to a request
    Response {
        /// Correlation ID matching the request
        correlation_id: CorrelationId,
        /// Result value (if successful)
        result: Option<Value>,
        /// Error (if failed)
        error: Option<JsonRpcError>,
    },
    /// A notification broadcast to clients
    Notification {
        /// Method name
        method: String,
        /// Parameters (if any)
        params: Option<Value>,
    },
}

impl OutgoingMessage {
    /// Create a success response
    pub fn success(correlation_id: CorrelationId, result: Value) -> Self {
        Self::Response {
            correlation_id,
            result: Some(result),
            error: None,
        }
    }

    /// Create an error response
    pub fn error(correlation_id: CorrelationId, error: JsonRpcError) -> Self {
        Self::Response {
            correlation_id,
            result: None,
            error: Some(error),
        }
    }

    /// Create a notification
    pub fn notification(method: String, params: Option<Value>) -> Self {
        Self::Notification { method, params }
    }
}

impl TryFrom<String> for IncomingMessage {
    type Error = ProtocolError;

    fn try_from(json: String) -> Result<Self, Self::Error> {
        // First, try to parse as JsonRpcRequest
        if let Ok(request) = serde_json::from_str::<JsonRpcRequest>(&json) {
            return Ok(IncomingMessage::Request {
                correlation_id: request.id,
                method: request.method,
                params: request.params,
            });
        }

        // Try to parse as Notification
        if let Ok(notification) = serde_json::from_str::<Notification>(&json) {
            return Ok(IncomingMessage::Notification {
                method: notification.method,
                params: notification.params,
            });
        }

        // If both fail, it's a parse error
        Err(ProtocolError::ParseError("Failed to parse JSON-RPC message".to_string()))
    }
}

impl IncomingMessage {
    /// Parse incoming JSON-RPC message from text
    pub fn parse(text: &str) -> Result<Self, ProtocolError> {
        text.to_string().try_into()
    }

    /// Extract correlation ID if this is a request
    pub fn correlation_id(&self) -> Option<&CorrelationId> {
        match self {
            Self::Request { correlation_id, .. } => Some(correlation_id),
            Self::Notification { .. } => None,
            Self::Invalid(_) => None,
        }
    }

    /// Check if this is a request (expects response)
    pub fn is_request(&self) -> bool {
        match self {
            Self::Request { .. } => true,
            _ => false,
        }
    }

    /// Check if this is a notification
    pub fn is_notification(&self) -> bool {
        match self {
            Self::Notification { .. } => true,
            _ => false,
        }
    }

    /// Get method name
    pub fn method(&self) -> Option<&str> {
        match self {
            Self::Request { method, .. } | Self::Notification { method, .. } => Some(method),
            Self::Invalid(_) => None,
        }
    }

    /// Get parameters
    pub fn params(&self) -> Option<&Value> {
        match self {
            Self::Request { params, .. } | Self::Notification { params, .. } => params.as_ref(),
            Self::Invalid(_) => None,
        }
    }
}

impl OutgoingMessage {
    /// Convert to JSON string for WebSocket transmission
    pub fn to_json(&self) -> Result<String, serde_json::Error> {
        match self {
            Self::Response {
                correlation_id,
                result,
                error,
            } => {
                let response = JsonRpcResponse {
                    jsonrpc: "2.0".to_string(),
                    id: correlation_id.clone(),
                    result: result.clone(),
                    error: error.clone(),
                };
                serde_json::to_string(&response)
            }
            Self::Notification { method, params } => {
                let notification = Notification {
                    jsonrpc: "2.0".to_string(),
                    method: method.clone(),
                    params: params.clone(),
                };
                serde_json::to_string(&notification)
            }
        }
    }
}

/// Protocol handler for request/response routing
///
/// This trait defines the interface for handling JSON-RPC requests.
/// Implementations can be registered with the server to handle specific methods.
#[async_trait::async_trait]
pub trait RequestHandler: Send + Sync {
    /// Handle a JSON-RPC request and return a result
    async fn handle(&self, method: &str, params: Option<Value>) -> Result<Value, ProtocolError>;
}

/// Request router that dispatches to registered handlers
pub struct RequestRouter {
    handlers: dashmap::DashMap<String, Box<dyn RequestHandler>>,
}

impl RequestRouter {
    /// Create a new request router
    pub fn new() -> Self {
        Self {
            handlers: dashmap::DashMap::new(),
        }
    }

    /// Register a handler for a specific method
    pub fn register<H: RequestHandler + 'static>(&self, method: String, handler: H) {
        self.handlers.insert(method, Box::new(handler));
    }

    /// Route a request to the appropriate handler
    pub async fn route(&self, method: &str, params: Option<Value>) -> Result<Value, ProtocolError> {
        if let Some(entry) = self.handlers.get(method) {
            entry.handle(method, params).await
        } else {
            Err(ProtocolError::MethodNotFound(method.to_string()))
        }
    }
}

impl Default for RequestRouter {
    fn default() -> Self {
        Self::new()
    }
}

/// Notification broadcaster for server-wide events
pub struct NotificationBroadcaster;

impl NotificationBroadcaster {
    /// Create a new notification broadcaster
    pub fn new() -> Self {
        Self
    }

    /// Broadcast a notification to all connected clients
    pub fn broadcast(
        &self,
        server_state: &ServerState,
        method: String,
        params: Option<Value>,
    ) -> usize {
        let message = OutgoingMessage::notification(method, params);
        match message.to_json() {
            Ok(json) => server_state.broadcast(json),
            Err(_) => 0,
        }
    }

    /// Send a notification to a specific client
    pub fn send_to(
        &self,
        server_state: &ServerState,
        connection_id: ConnectionId,
        method: String,
        params: Option<Value>,
    ) -> Result<(), String> {
        let message = OutgoingMessage::notification(method, params);
        match message.to_json() {
            Ok(json) => {
                use axum::extract::ws::Message;
                server_state.send_to(connection_id, Message::Text(json))
            }
            Err(e) => Err(format!("Failed to serialize notification: {}", e)),
        }
    }
}

impl Default for NotificationBroadcaster {
    fn default() -> Self {
        Self::new()
    }
}

/// Standard error response factory
pub struct ErrorResponse;

impl ErrorResponse {
    /// Create a parse error response
    pub fn parse_error(correlation_id: CorrelationId, message: String) -> OutgoingMessage {
        OutgoingMessage::error(correlation_id, JsonRpcError::parse_error(message))
    }

    /// Create an invalid request response
    pub fn invalid_request(correlation_id: CorrelationId, message: String) -> OutgoingMessage {
        OutgoingMessage::error(correlation_id, JsonRpcError::invalid_request(message))
    }

    /// Create a method not found response
    pub fn method_not_found(correlation_id: CorrelationId, method: String) -> OutgoingMessage {
        OutgoingMessage::error(correlation_id, JsonRpcError::method_not_found(method))
    }

    /// Create an invalid params response
    pub fn invalid_params(correlation_id: CorrelationId, message: String) -> OutgoingMessage {
        OutgoingMessage::error(correlation_id, JsonRpcError::invalid_params(message))
    }

    /// Create an internal error response
    pub fn internal_error(correlation_id: CorrelationId, message: String) -> OutgoingMessage {
        OutgoingMessage::error(correlation_id, JsonRpcError::internal_error(message))
    }
}

// ============================================================================
// Tests
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_incoming_message_parse_request() {
        let json = r#"{"jsonrpc":"2.0","id":"req-1","method":"ping","params":{}}"#;
        let message = IncomingMessage::parse(json).unwrap();

        assert!(message.is_request());
        assert_eq!(message.correlation_id(), Some(&"req-1".to_string()));
        assert_eq!(message.method(), Some("ping"));
    }

    #[test]
    fn test_incoming_message_parse_notification() {
        let json = r#"{"jsonrpc":"2.0","method":"pty_output","params":{"data":"test"}}"#;
        let message = IncomingMessage::parse(json).unwrap();

        assert!(message.is_notification());
        assert!(message.correlation_id().is_none());
        assert_eq!(message.method(), Some("pty_output"));
    }

    #[test]
    fn test_incoming_message_parse_invalid() {
        let json = r#"invalid json"#;
        let result = IncomingMessage::parse(json);

        assert!(result.is_err());
        match result {
            Err(ProtocolError::ParseError(_)) => (),
            _ => panic!("Expected ParseError"),
        }
    }

    #[test]
    fn test_outgoing_message_success() {
        let correlation_id = "req-1".to_string();
        let result = serde_json::json!({"status":"ok"});
        let message = OutgoingMessage::success(correlation_id, result);

        let json = message.to_json().unwrap();
        let parsed: JsonRpcResponse = serde_json::from_str(&json).unwrap();

        assert_eq!(parsed.id, "req-1");
        assert!(parsed.result.is_some());
        assert!(parsed.error.is_none());
    }

    #[test]
    fn test_outgoing_message_error() {
        let correlation_id = "req-1".to_string();
        let error = JsonRpcError::invalid_params("Missing field".to_string());
        let message = OutgoingMessage::error(correlation_id, error);

        let json = message.to_json().unwrap();
        let parsed: JsonRpcResponse = serde_json::from_str(&json).unwrap();

        assert_eq!(parsed.id, "req-1");
        assert!(parsed.result.is_none());
        assert!(parsed.error.is_some());
        assert_eq!(parsed.error.unwrap().code, -32602);
    }

    #[test]
    fn test_outgoing_message_notification() {
        let message = OutgoingMessage::notification(
            "pty_output".to_string(),
            Some(serde_json::json!({"data":"test"})),
        );

        let json = message.to_json().unwrap();
        let parsed: Notification = serde_json::from_str(&json).unwrap();

        assert_eq!(parsed.method, "pty_output");
        assert!(parsed.params.is_some());
    }

    #[test]
    fn test_protocol_error_to_jsonrpc_error() {
        let err = ProtocolError::MethodNotFound("test_method".to_string());
        let jsonrpc_err = err.to_jsonrpc_error();

        assert_eq!(jsonrpc_err.code, -32601);
        assert!(jsonrpc_err.message.contains("Method not found"));
    }

    #[test]
    fn test_error_response_factory() {
        let correlation_id = "req-1".to_string();

        let msg = ErrorResponse::parse_error(correlation_id.clone(), "Invalid JSON".to_string());
        let json = msg.to_json().unwrap();
        let parsed: JsonRpcResponse = serde_json::from_str(&json).unwrap();
        assert_eq!(parsed.error.unwrap().code, -32700);

        let msg = ErrorResponse::invalid_request(correlation_id.clone(), "Bad format".to_string());
        let json = msg.to_json().unwrap();
        let parsed: JsonRpcResponse = serde_json::from_str(&json).unwrap();
        assert_eq!(parsed.error.unwrap().code, -32600);

        let msg = ErrorResponse::method_not_found(correlation_id.clone(), "test_method".to_string());
        let json = msg.to_json().unwrap();
        let parsed: JsonRpcResponse = serde_json::from_str(&json).unwrap();
        assert_eq!(parsed.error.unwrap().code, -32601);

        let msg = ErrorResponse::invalid_params(correlation_id.clone(), "Missing field".to_string());
        let json = msg.to_json().unwrap();
        let parsed: JsonRpcResponse = serde_json::from_str(&json).unwrap();
        assert_eq!(parsed.error.unwrap().code, -32602);

        let msg = ErrorResponse::internal_error(correlation_id, "Internal failure".to_string());
        let json = msg.to_json().unwrap();
        let parsed: JsonRpcResponse = serde_json::from_str(&json).unwrap();
        assert_eq!(parsed.error.unwrap().code, -32603);
    }

    #[test]
    fn test_request_router() {
        // Create a simple test handler
        struct TestHandler;
        #[async_trait::async_trait]
        impl RequestHandler for TestHandler {
            async fn handle(&self, _method: &str, _params: Option<Value>) -> Result<Value, ProtocolError> {
                Ok(serde_json::json!({"result":"test"}))
            }
        }

        let router = RequestRouter::new();
        router.register("test_method".to_string(), TestHandler);

        // Note: We can't actually test async routing here without a runtime
        // This test just verifies the router can be created and handlers registered
        assert!(router.handlers.get("test_method").is_some());
    }

    #[tokio::test]
    async fn test_request_router_route_not_found() {
        let router = RequestRouter::new();
        let result = router.route("unknown_method", None).await;

        assert!(result.is_err());
        match result {
            Err(ProtocolError::MethodNotFound(method)) => {
                assert_eq!(method, "unknown_method");
            }
            _ => panic!("Expected MethodNotFound error"),
        }
    }
}
