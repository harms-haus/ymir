//! ACP JSON-RPC dispatcher module.
//!
//! Parses JSON-RPC 2.0 payloads arriving via `BridgeMessage::AcpPayload` and
//! dispatches them to the appropriate `AcpHandle` methods.

use anyhow::Result;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use uuid::Uuid;

use super::acp::AcpHandle;

// ---------------------------------------------------------------------------
// JSON-RPC 2.0 types
// ---------------------------------------------------------------------------

/// Parsed JSON-RPC 2.0 request envelope.
#[derive(Debug, Deserialize)]
struct JsonRpcRequest {
    jsonrpc: String,
    id: Option<Value>,
    method: String,
    params: Option<Value>,
}

/// JSON-RPC 2.0 error object.
#[derive(Debug, Serialize)]
struct JsonRpcError {
    code: i64,
    message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    data: Option<Value>,
}

/// JSON-RPC 2.0 response envelope.
#[derive(Debug, Serialize)]
struct JsonRpcResponse {
    jsonrpc: &'static str, // always "2.0"
    #[serde(skip_serializing_if = "Option::is_none")]
    id: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    result: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<JsonRpcError>,
}

impl JsonRpcResponse {
    /// Build a success response.
    fn success(id: Option<Value>, result: Value) -> Self {
        Self {
            jsonrpc: "2.0",
            id,
            result: Some(result),
            error: None,
        }
    }

    /// Build an error response.
    fn error(id: Option<Value>, code: i64, message: impl Into<String>) -> Self {
        Self {
            jsonrpc: "2.0",
            id,
            result: None,
            error: Some(JsonRpcError {
                code,
                message: message.into(),
                data: None,
            }),
        }
    }

    /// Serialise to a `serde_json::Value`.
    fn to_value(&self) -> Value {
        serde_json::to_value(self).unwrap_or_else(|_| {
            serde_json::json!({
                "jsonrpc": "2.0",
                "id": null,
                "error": { "code": -32603, "message": "Internal error serialising response" }
            })
        })
    }
}

// ---------------------------------------------------------------------------
// Standard JSON-RPC error codes
// ---------------------------------------------------------------------------

const CODE_INVALID_REQUEST: i64 = -32600;
const CODE_METHOD_NOT_FOUND: i64 = -32601;
const CODE_INVALID_PARAMS: i64 = -32602;
const CODE_INTERNAL_ERROR: i64 = -32603;

// ---------------------------------------------------------------------------
// Relay
// ---------------------------------------------------------------------------

/// Dispatches inbound ACP JSON-RPC payloads to the ACP runtime via `AcpHandle`.
#[derive(Clone)]
pub struct AcpJsonRpcRelay {
    acp_handle: AcpHandle,
}

impl AcpJsonRpcRelay {
    pub fn new(acp_handle: AcpHandle) -> Self {
        Self { acp_handle }
    }

    /// Handle an inbound ACP JSON-RPC payload.
    ///
    /// Returns `Some(JSON-RPC response value)` when the request carries an `id`
    /// (i.e. it expects a response).  Returns `None` for notifications (no `id`)
    /// or when no response is warranted.
    pub async fn handle_payload(
        &self,
        client_id: Uuid,
        payload: Value,
    ) -> Option<Value> {
        // Parse the envelope.
        let req: JsonRpcRequest = match serde_json::from_value(payload) {
            Ok(r) => r,
            Err(e) => {
                // We cannot know the id if parsing failed entirely, so try a
                // best-effort extraction.
                let id = extract_id_from_raw(&e);
                return Some(JsonRpcResponse::error(
                    id,
                    CODE_INVALID_REQUEST,
                    format!("Invalid JSON-RPC request: {}", e),
                ).to_value());
            }
        };

        let id = req.id;

        // Validate JSON-RPC version.
        if req.jsonrpc != "2.0" {
            return Some(JsonRpcResponse::error(
                id,
                CODE_INVALID_REQUEST,
                "jsonrpc must be \"2.0\"",
            ).to_value());
        }

        // Dispatch method.
        let result = self.dispatch(&req.method, client_id, req.params).await;

        match result {
            Ok(value) => Some(JsonRpcResponse::success(id, value).to_value()),
            Err(dispatch_err) => Some(JsonRpcResponse::error(id, dispatch_err.code, dispatch_err.message).to_value()),
        }
    }

    /// Core method dispatch.
    async fn dispatch(
        &self,
        method: &str,
        client_id: Uuid,
        params: Option<Value>,
    ) -> Result<Value, DispatchError> {
        match method {
            "initialize" => Ok(self.handle_initialize()),

            "session/list" => Ok(self.handle_session_list().await),

            "session/new" => Err(DispatchError::new(
                CODE_METHOD_NOT_FOUND,
                "not supported — use AgentSpawn",
            )),

            "session/load" => Err(DispatchError::new(
                CODE_METHOD_NOT_FOUND,
                "not supported",
            )),

            "session/prompt" => {
                self.handle_session_prompt(client_id, params).await
            }

            "session/cancel" => {
                self.handle_session_cancel(client_id, params).await
            }

            "session/set_config_option" => {
                self.handle_session_set_config_option(client_id, params).await
            }

            _ => Err(DispatchError::new(
                CODE_METHOD_NOT_FOUND,
                format!("Method not found: {}", method),
            )),
        }
    }

    // -----------------------------------------------------------------------
    // Method handlers
    // -----------------------------------------------------------------------

    fn handle_initialize(&self) -> Value {
        serde_json::json!({
            "capabilities": {
                "supportsToolUse": true,
                "supportsContextUpdate": true,
                "supportsCancellation": true,
            }
        })
    }

    async fn handle_session_list(&self) -> Value {
        let sessions = self.acp_handle.list_sessions().await;
        let session_values: Vec<Value> = sessions
            .iter()
            .filter_map(|s| {
                s.acp_session_id.as_ref().map(|sid| {
                    serde_json::json!({
                        "sessionId": sid,
                        "worktreeId": s.worktree_id.to_string(),
                    })
                })
            })
            .collect();
        serde_json::json!({ "sessions": session_values })
    }

    async fn handle_session_prompt(
        &self,
        _client_id: Uuid,
        params: Option<Value>,
    ) -> Result<Value, DispatchError> {
        let params = params.ok_or_else(|| {
            DispatchError::new(CODE_INVALID_PARAMS, "Missing params for session/prompt")
        })?;

        // Extract content: prefer `params.prompt` (array of content blocks),
        // fall back to `params.content` (plain string).
        let content = if let Some(prompt_arr) = params.get("prompt").and_then(|v| v.as_array()) {
            // Concatenate all text blocks from the prompt array.
            let mut parts = Vec::new();
            for block in prompt_arr {
                if block.get("type").and_then(|t| t.as_str()) == Some("text") {
                    if let Some(text) = block.get("text").and_then(|t| t.as_str()) {
                        parts.push(text.to_string());
                    }
                }
            }
            if parts.is_empty() {
                return Err(DispatchError::new(
                    CODE_INVALID_PARAMS,
                    "No text content found in 'prompt' array",
                ));
            }
            parts.join("\n")
        } else if let Some(content_str) = params.get("content").and_then(|v| v.as_str()) {
            content_str.to_string()
        } else {
            return Err(DispatchError::new(
                CODE_INVALID_PARAMS,
                "Missing 'prompt' or 'content' in params",
            ));
        };

        let _session_id_str = params.get("sessionId").and_then(|v| v.as_str());

        let agent_tab_id = self.resolve_agent_tab_id(_session_id_str).await?;

        self.acp_handle
            .send_prompt(agent_tab_id, &content)
            .await
            .map_err(|e| DispatchError::new(CODE_INTERNAL_ERROR, e.to_string()))?;

        Ok(serde_json::json!({
            "sessionId": _session_id_str.unwrap_or("")
        }))
    }

    async fn handle_session_cancel(
        &self,
        _client_id: Uuid,
        params: Option<Value>,
    ) -> Result<Value, DispatchError> {
        let params = params.ok_or_else(|| {
            DispatchError::new(CODE_INVALID_PARAMS, "Missing params for session/cancel")
        })?;

        let session_id_str = params.get("sessionId")
            .and_then(|v| v.as_str());

        let agent_tab_id = self.resolve_agent_tab_id(session_id_str).await?;

        self.acp_handle
            .cancel(agent_tab_id)
            .await
            .map_err(|e| DispatchError::new(CODE_INTERNAL_ERROR, e.to_string()))?;

        Ok(serde_json::json!({}))
    }

    async fn handle_session_set_config_option(
        &self,
        _client_id: Uuid,
        params: Option<Value>,
    ) -> Result<Value, DispatchError> {
        let params = params.ok_or_else(|| {
            DispatchError::new(CODE_INVALID_PARAMS, "Missing params for session/set_config_option")
        })?;

        let session_id_str = params.get("sessionId")
            .and_then(|v| v.as_str());

        let config_id = params.get("configId")
            .and_then(|v| v.as_str())
            .ok_or_else(|| {
                DispatchError::new(CODE_INVALID_PARAMS, "Missing 'configId' in params")
            })?
            .to_string();

        let value = params.get("value")
            .and_then(|v| v.as_str())
            .ok_or_else(|| {
                DispatchError::new(CODE_INVALID_PARAMS, "Missing 'value' in params")
            })?
            .to_string();

        let agent_tab_id = self.resolve_agent_tab_id(session_id_str).await?;

        self.acp_handle
            .set_session_config_option(agent_tab_id, &config_id, &value)
            .await
            .map_err(|e| DispatchError::new(CODE_INTERNAL_ERROR, e.to_string()))?;

        Ok(serde_json::json!({}))
    }

    // -----------------------------------------------------------------------
    // Helpers
    // -----------------------------------------------------------------------

    /// Resolve an ACP `sessionId` string to an `agent_tab_id` (Uuid).
    ///
    /// Uses `AcpHandle::find_session_by_acp_id` to look up the session mapping
    /// maintained by the ACP runtime. Returns an error if the session ID is
    /// missing or no matching agent session is found.
    async fn resolve_agent_tab_id(
        &self,
        session_id: Option<&str>,
    ) -> Result<Uuid, DispatchError> {
        let session_id_str = session_id.ok_or_else(|| {
            DispatchError::new(CODE_INVALID_PARAMS, "Missing 'sessionId' in params")
        })?;

        self.acp_handle
            .find_session_by_acp_id(session_id_str)
            .await
            .ok_or_else(|| {
                DispatchError::new(
                    CODE_INVALID_PARAMS,
                    format!("No agent session found for sessionId: {}", session_id_str),
                )
            })
    }
}

// ---------------------------------------------------------------------------
// Internal error helper
// ---------------------------------------------------------------------------

struct DispatchError {
    code: i64,
    message: String,
}

impl DispatchError {
    fn new(code: i64, message: impl Into<String>) -> Self {
        Self {
            code,
            message: message.into(),
        }
    }
}

/// Best-effort extraction of `id` from a raw `serde_json::Error` context.
/// When full envelope parsing fails, serde may still have partially consumed
/// the value. We fall back to `Value::Null`.
fn extract_id_from_raw(_err: &serde_json::Error) -> Option<Value> {
    // If we cannot parse the envelope at all, we have no id to echo back.
    None
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use tokio::sync::broadcast;

    /// Helper to create an `AcpJsonRpcRelay` backed by a real (idle) ACP runtime.
    fn make_relay() -> AcpJsonRpcRelay {
        let (broadcast_tx, _) = broadcast::channel(16);
        let (handle, _join) = crate::agent::start_acp_runtime(broadcast_tx);
        AcpJsonRpcRelay::new(handle)
    }

    #[tokio::test]
    async fn test_initialize() {
        let relay = make_relay();
        let payload = serde_json::json!({
            "jsonrpc": "2.0",
            "id": 1,
            "method": "initialize",
            "params": null
        });

        let resp = relay.handle_payload(Uuid::new_v4(), payload).await.unwrap();
        assert_eq!(resp["jsonrpc"], "2.0");
        assert_eq!(resp["id"], 1);
        assert!(resp["result"]["capabilities"]["supportsToolUse"].as_bool().unwrap());
    }

    #[tokio::test]
    async fn test_session_list() {
        let relay = make_relay();
        let payload = serde_json::json!({
            "jsonrpc": "2.0",
            "id": 2,
            "method": "session/list"
        });

        let resp = relay.handle_payload(Uuid::new_v4(), payload).await.unwrap();
        assert!(resp["result"]["sessions"].as_array().unwrap().is_empty());
    }

    #[tokio::test]
    async fn test_unknown_method() {
        let relay = make_relay();
        let payload = serde_json::json!({
            "jsonrpc": "2.0",
            "id": 3,
            "method": "foo/bar"
        });

        let resp = relay.handle_payload(Uuid::new_v4(), payload).await.unwrap();
        assert_eq!(resp["error"]["code"], -32601);
    }

    #[tokio::test]
    async fn test_session_new_not_supported() {
        let relay = make_relay();
        let payload = serde_json::json!({
            "jsonrpc": "2.0",
            "id": 4,
            "method": "session/new"
        });

        let resp = relay.handle_payload(Uuid::new_v4(), payload).await.unwrap();
        assert_eq!(resp["error"]["code"], -32601);
        assert!(resp["error"]["message"].as_str().unwrap().contains("AgentSpawn"));
    }

    #[tokio::test]
    async fn test_invalid_jsonrpc_version() {
        let relay = make_relay();
        let payload = serde_json::json!({
            "jsonrpc": "1.0",
            "id": 5,
            "method": "initialize"
        });

        let resp = relay.handle_payload(Uuid::new_v4(), payload).await.unwrap();
        assert_eq!(resp["error"]["code"], -32600);
    }
}
