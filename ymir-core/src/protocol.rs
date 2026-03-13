//! JSON-RPC 2.0 protocol definitions for Ymir WebSocket communication
//!
//! This module defines request/response envelopes, error codes, and protocol
//! constants used for WebSocket communication between frontend and backend.

use serde::{Deserialize, Serialize};

// ============================================================================
// Protocol Constants
// ============================================================================

/// Maximum number of messages to batch in a single WebSocket frame
pub const BATCH_SIZE: usize = 50;

/// Maximum size of a WebSocket message chunk in bytes
pub const CHUNK_SIZE: usize = 1000;

/// JSON-RPC 2.0 protocol version
pub const JSONRPC_VERSION: &str = "2.0";

// ============================================================================
// JSON-RPC 2.0 Request
// ============================================================================

/// JSON-RPC 2.0 Request envelope
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct JsonRpcRequest {
    /// JSON-RPC version (must be "2.0")
    pub jsonrpc: String,
    /// Request identifier (required for requests that expect a response)
    pub id: String,
    /// Method name to invoke
    pub method: String,
    /// Parameters for the method (optional)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub params: Option<serde_json::Value>,
}

impl JsonRpcRequest {
    /// Create a new JSON-RPC request
    pub fn new(id: String, method: String, params: Option<serde_json::Value>) -> Self {
        Self {
            jsonrpc: JSONRPC_VERSION.to_string(),
            id,
            method,
            params,
        }
    }

    /// Create a notification (request without id)
    pub fn notification(method: String, params: Option<serde_json::Value>) -> Notification {
        Notification {
            jsonrpc: JSONRPC_VERSION.to_string(),
            method,
            params,
        }
    }
}

/// JSON-RPC 2.0 Notification (request without id)
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Notification {
    /// JSON-RPC version (must be "2.0")
    pub jsonrpc: String,
    /// Method name to invoke
    pub method: String,
    /// Parameters for the method (optional)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub params: Option<serde_json::Value>,
}

// ============================================================================
// JSON-RPC 2.0 Response
// ============================================================================

/// JSON-RPC 2.0 Response envelope
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct JsonRpcResponse {
    /// JSON-RPC version (must be "2.0")
    pub jsonrpc: String,
    /// Request identifier (must match request id)
    pub id: String,
    /// Result if successful (must be null if error is present)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub result: Option<serde_json::Value>,
    /// Error if failed (must be null if result is present)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<JsonRpcError>,
}

impl JsonRpcResponse {
    /// Create a successful response
    pub fn success(id: String, result: serde_json::Value) -> Self {
        Self {
            jsonrpc: JSONRPC_VERSION.to_string(),
            id,
            result: Some(result),
            error: None,
        }
    }

    /// Create an error response
    pub fn error(id: String, error: JsonRpcError) -> Self {
        Self {
            jsonrpc: JSONRPC_VERSION.to_string(),
            id,
            result: None,
            error: Some(error),
        }
    }
}

// ============================================================================
// JSON-RPC 2.0 Error
// ============================================================================

/// JSON-RPC 2.0 Error object
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct JsonRpcError {
    /// Error code indicating the type of error
    pub code: i32,
    /// Short human-readable description
    pub message: String,
    /// Additional error data (optional)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub data: Option<serde_json::Value>,
}

impl JsonRpcError {
    /// Create a new JSON-RPC error
    pub fn new(code: i32, message: String, data: Option<serde_json::Value>) -> Self {
        Self {
            code,
            message,
            data,
        }
    }

    /// Parse error (-32700)
    pub fn parse_error(message: String) -> Self {
        Self::new(-32700, message, None)
    }

    /// Invalid request (-32600)
    pub fn invalid_request(message: String) -> Self {
        Self::new(-32600, message, None)
    }

    /// Method not found (-32601)
    pub fn method_not_found(method: String) -> Self {
        Self::new(-32601, format!("Method not found: {}", method), None)
    }

    /// Invalid params (-32602)
    pub fn invalid_params(message: String) -> Self {
        Self::new(-32602, message, None)
    }

    /// Internal error (-32603)
    pub fn internal_error(message: String) -> Self {
        Self::new(-32603, message, None)
    }

    /// Server error (-32000 to -32099)
    pub fn server_error(code: i32, message: String) -> Self {
        Self::new(code, message, None)
    }
}

/// Standard JSON-RPC 2.0 error codes
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum JsonRpcErrorCode {
    ParseError = -32700,
    InvalidRequest = -32600,
    MethodNotFound = -32601,
    InvalidParams = -32602,
    InternalError = -32603,
}

// ============================================================================
// Tests
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_constants() {
        assert_eq!(BATCH_SIZE, 50);
        assert_eq!(CHUNK_SIZE, 1000);
        assert_eq!(JSONRPC_VERSION, "2.0");
    }

    #[test]
    fn test_jsonrpc_request_serialization_roundtrip() {
        let request = JsonRpcRequest::new(
            "req-1".to_string(),
            "split_pane".to_string(),
            Some(serde_json::json!({
                "workspaceId": "ws-1",
                "paneId": "pane-1",
                "direction": "right"
            })),
        );

        let json = serde_json::to_string(&request).unwrap();
        let deserialized: JsonRpcRequest = serde_json::from_str(&json).unwrap();

        assert_eq!(request, deserialized);
        assert!(deserialized.params.is_some());
    }

    #[test]
    fn test_jsonrpc_notification_serialization_roundtrip() {
        let notification = Notification {
            jsonrpc: JSONRPC_VERSION.to_string(),
            method: "pty_output".to_string(),
            params: Some(serde_json::json!({
                "sessionId": "session-123",
                "data": "test output"
            })),
        };

        let json = serde_json::to_string(&notification).unwrap();
        let deserialized: Notification = serde_json::from_str(&json).unwrap();

        assert_eq!(notification, deserialized);
        assert_eq!(notification.method, "pty_output");
    }

    #[test]
    fn test_jsonrpc_response_success_serialization_roundtrip() {
        let response = JsonRpcResponse::success(
            "req-1".to_string(),
            serde_json::json!({
                "paneId": "pane-1"
            }),
        );

        let json = serde_json::to_string(&response).unwrap();
        let deserialized: JsonRpcResponse = serde_json::from_str(&json).unwrap();

        assert_eq!(response, deserialized);
        assert!(deserialized.result.is_some());
        assert!(deserialized.error.is_none());
    }

    #[test]
    fn test_jsonrpc_response_error_serialization_roundtrip() {
        let error = JsonRpcError::invalid_params("Missing workspace ID".to_string());
        let response = JsonRpcResponse::error("req-1".to_string(), error);

        let json = serde_json::to_string(&response).unwrap();
        let deserialized: JsonRpcResponse = serde_json::from_str(&json).unwrap();

        assert_eq!(response, deserialized);
        assert!(deserialized.result.is_none());
        assert!(deserialized.error.is_some());
    }

    #[test]
    fn test_jsonrpc_error_parse_error() {
        let error = JsonRpcError::parse_error("Invalid JSON".to_string());

        assert_eq!(error.code, -32700);
        assert_eq!(error.message, "Invalid JSON");
        assert!(error.data.is_none());
    }

    #[test]
    fn test_jsonrpc_error_method_not_found() {
        let error = JsonRpcError::method_not_found("unknown_method".to_string());

        assert_eq!(error.code, -32601);
        assert_eq!(error.message, "Method not found: unknown_method");
    }

    #[test]
    fn test_jsonrpc_error_invalid_params() {
        let error = JsonRpcError::invalid_params("Missing required field".to_string());

        assert_eq!(error.code, -32602);
        assert_eq!(error.message, "Missing required field");
    }

    #[test]
    fn test_jsonrpc_error_internal_error() {
        let error = JsonRpcError::internal_error("Database error".to_string());

        assert_eq!(error.code, -32603);
        assert_eq!(error.message, "Database error");
    }

    #[test]
    fn test_jsonrpc_error_server_error() {
        let error = JsonRpcError::server_error(-32001, "PTY not found".to_string());

        assert_eq!(error.code, -32001);
        assert_eq!(error.message, "PTY not found");
    }

    #[test]
    fn test_jsonrpc_error_serialization_with_data() {
        let error = JsonRpcError::new(
            -32602,
            "Invalid params".to_string(),
            Some(serde_json::json!({
                "field": "workspaceId",
                "expected": "string"
            })),
        );

        let json = serde_json::to_string(&error).unwrap();
        let deserialized: JsonRpcError = serde_json::from_str(&json).unwrap();

        assert_eq!(error, deserialized);
        assert!(deserialized.data.is_some());
    }

    #[test]
    fn test_jsonrpc_request_from_notification() {
        let notification = Notification {
            jsonrpc: JSONRPC_VERSION.to_string(),
            method: "pty_output".to_string(),
            params: Some(serde_json::json!({"data": "test"})),
        };

        assert_eq!(notification.jsonrpc, "2.0");
        assert_eq!(notification.method, "pty_output");
    }
}
