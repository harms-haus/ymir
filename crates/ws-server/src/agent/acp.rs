//! ACP (Agent Client Protocol) client implementation
//!
//! This module provides the ACP client for managing agent subprocesses and handling
//! JSON-RPC communication with agents that support the ACP protocol.

use anyhow::{anyhow, Result};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;
use std::process::Stdio;
use std::sync::Arc;
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::{Child, ChildStdin};
use tokio::sync::{mpsc, oneshot, Mutex, RwLock};
use tokio::task::JoinHandle;
use tokio::time::Duration;
use tracing::instrument;
use uuid::Uuid;

/// Agent status enum representing the current state of an agent
#[derive(Debug, Clone, PartialEq)]
pub enum AgentStatus {
    Working { task_summary: String },
    Waiting { prompt: String },
    Idle,
}

/// Request ID for JSON-RPC correlation
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
struct RequestId(String);

impl RequestId {
    fn new() -> Self {
        Self(Uuid::new_v4().to_string())
    }
}

/// JSON-RPC request structure
#[derive(Serialize, Deserialize)]
struct JsonRpcRequest {
    jsonrpc: String,
    id: String,
    method: String,
    params: Value,
}

/// JSON-RPC response structure
#[derive(Deserialize)]
struct JsonRpcResponse {
    jsonrpc: String,
    id: Option<String>,
    result: Option<Value>,
    error: Option<JsonRpcError>,
}

/// JSON-RPC error structure
#[derive(Deserialize)]
struct JsonRpcError {
    code: i32,
    message: String,
    data: Option<Value>,
}

/// JSON-RPC notification structure (no response expected)
#[derive(Serialize)]
struct JsonRpcNotification {
    jsonrpc: String,
    method: String,
    params: Value,
}

/// ACP client for managing agent subprocesses
pub struct AcpClient {
    process: Child,
    stdin: ChildStdin,
    stdout_reader: JoinHandle<()>,
    pending_requests: Arc<Mutex<HashMap<RequestId, oneshot::Sender<Result<Value>>>>>,
    session_id: Arc<Mutex<Option<String>>>,
    status: Arc<RwLock<AgentStatus>>,
    _output_tx: mpsc::UnboundedSender<String>,
}

impl AcpClient {
    /// Spawn a new agent subprocess and establish ACP connection
    #[instrument(fields(agent_type = %agent_type, worktree_path = %worktree_path))]
    pub async fn spawn(agent_type: &str, worktree_path: &str) -> Result<Self> {
        let executable = match agent_type {
            "claude" => "claude-agent",
            "opencode" => "opencode",
            "pi" => "pi-acp",
            _ => return Err(anyhow!("Unknown agent type: {}", agent_type)),
        };

        let mut child = tokio::process::Command::new(executable)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .current_dir(worktree_path)
            .spawn()
            .map_err(|e| anyhow!("Failed to spawn agent process: {}", e))?;

  let stdin = child
    .stdin
    .take()
    .ok_or_else(|| anyhow!("Failed to capture stdin"))?;

  let stdout = child
    .stdout
    .take()
    .ok_or_else(|| anyhow!("Failed to capture stdout"))?;

  let stderr = child
    .stderr
    .take()
    .ok_or_else(|| anyhow!("Failed to capture stderr"))?;

  let _stderr_drain = {
    tokio::spawn(async move {
      let mut reader = tokio::io::BufReader::new(stderr);
      let mut buffer = Vec::new();
      loop {
        match reader.read_until(b'\n', &mut buffer).await {
          Ok(0) => {
            // EOF - agent process ended
            break;
          }
          Ok(_n) => {
            // Discard stderr output
            if !buffer.is_empty() {
              buffer.clear();
            }
          }
          Err(e) => {
            // Log error and stop draining
            tracing::error!("Error reading agent stderr: {}", e);
            break;
          }
        }
      }
    })
  };

        let pending_requests = Arc::new(Mutex::new(HashMap::new()));
        let session_id = Arc::new(Mutex::new(None));
        let status = Arc::new(RwLock::new(AgentStatus::Idle));
        let (output_tx, _output_rx) = mpsc::unbounded_channel();

        let stdout_reader = {
            let pending_requests = pending_requests.clone();
            let session_id = session_id.clone();
            let status = status.clone();
            let output_tx = output_tx.clone();
            tokio::spawn(Self::read_stdout(
                stdout,
                pending_requests,
                session_id,
                status,
                output_tx,
            ))
        };

        let mut client = Self {
            process: child,
            stdin,
            stdout_reader,
            pending_requests,
            session_id,
            status,
            _output_tx: output_tx,
        };

        client.initialize().await?;
        client.create_session(worktree_path).await?;

        Ok(client)
    }

    /// Send initialize request to establish protocol version
    async fn initialize(&mut self) -> Result<()> {
        let request_id = RequestId::new();
        let request = JsonRpcRequest {
            jsonrpc: "2.0".to_string(),
            id: request_id.0.clone(),
            method: "initialize".to_string(),
            params: serde_json::json!({
                "protocolVersion": 1,
                "clientCapabilities": {
                    "fs": true,
                    "terminal": true
                },
                "clientInfo": {
                    "name": "ymir",
                    "version": env!("CARGO_PKG_VERSION")
                }
            }),
        };

        let response = self.send_request(request_id, request).await?;
        
        let protocol_version = response
            .get("protocolVersion")
            .and_then(|v| v.as_u64())
            .ok_or_else(|| anyhow!("Invalid initialize response: missing protocolVersion"))?;

        if protocol_version != 1 {
            return Err(anyhow!("Unsupported protocol version: {}", protocol_version));
        }

        Ok(())
    }

    /// Create a new session with the given worktree path
    async fn create_session(&mut self, worktree_path: &str) -> Result<()> {
        let request_id = RequestId::new();
        let request = JsonRpcRequest {
            jsonrpc: "2.0".to_string(),
            id: request_id.0.clone(),
            method: "session/new".to_string(),
            params: serde_json::json!({
                "cwd": worktree_path
            }),
        };

        let response = self.send_request(request_id, request).await?;
        
        let session_id = response
            .get("sessionId")
            .and_then(|v| v.as_str())
            .ok_or_else(|| anyhow!("Invalid session/new response: missing sessionId"))?
            .to_string();

        *self.session_id.lock().await = Some(session_id);
        Ok(())
    }

    /// Send a request and wait for response
  async fn send_request(&mut self, request_id: RequestId, request: JsonRpcRequest) -> Result<Value> {
    let (tx, rx) = oneshot::channel();

    self.pending_requests.lock().await.insert(request_id.clone(), tx);

    let json = serde_json::to_string(&request)?;
    self.stdin.write_all(json.as_bytes()).await?;
    self.stdin.write_all(b"\n").await?;
    self.stdin.flush().await?;

  match tokio::time::timeout(Duration::from_secs(30), rx).await {
    Ok(Ok(result)) => result,
    Ok(Err(_)) => Err(anyhow!("Request cancelled")),
    Err(timeout_error) => {
      self.pending_requests.lock().await.remove(&request_id);
      Err(anyhow!("Request timeout: {}", timeout_error))
    }
  }
}

    /// Send a prompt to the agent
    #[instrument(skip(self))]
    pub async fn send_prompt(&mut self, content: &str) -> Result<()> {
        let session_id = self.session_id.lock().await.clone()
            .ok_or_else(|| anyhow!("No active session"))?;

        let notification = JsonRpcNotification {
            jsonrpc: "2.0".to_string(),
            method: "session/prompt".to_string(),
            params: serde_json::json!({
                "sessionId": session_id,
                "content": content
            }),
        };

        let json = serde_json::to_string(&notification)?;
        self.stdin.write_all(json.as_bytes()).await?;
        self.stdin.write_all(b"\n").await?;
        self.stdin.flush().await?;

        Ok(())
    }

    /// Cancel the current agent operation
    #[instrument(skip(self))]
    pub async fn cancel(&mut self) -> Result<()> {
        let session_id = self.session_id.lock().await.clone()
            .ok_or_else(|| anyhow!("No active session"))?;

        let notification = JsonRpcNotification {
            jsonrpc: "2.0".to_string(),
            method: "session/cancel".to_string(),
            params: serde_json::json!({
                "sessionId": session_id
            }),
        };

        let json = serde_json::to_string(&notification)?;
        self.stdin.write_all(json.as_bytes()).await?;
        self.stdin.write_all(b"\n").await?;
        self.stdin.flush().await?;

        Ok(())
    }

    /// Get current agent status
    pub async fn status(&self) -> AgentStatus {
        self.status.read().await.clone()
    }

    /// Kill the agent subprocess and clean up resources
    #[instrument(skip(self))]
    pub async fn kill(&mut self) -> Result<()> {
        self.process.kill().await?;
        self.stdout_reader.abort();
        Ok(())
    }

  /// Background task to read stdout and route messages
  async fn read_stdout(
    stdout: tokio::process::ChildStdout,
    pending_requests: Arc<Mutex<HashMap<RequestId, oneshot::Sender<Result<Value>>>>>,
    _session_id: Arc<Mutex<Option<String>>>,
    status: Arc<RwLock<AgentStatus>>,
    _output_tx: mpsc::UnboundedSender<String>,
  ) {
    let reader = BufReader::new(stdout);
    let mut lines = reader.lines();

    loop {
      match lines.next_line().await {
        Ok(Some(line)) => {
          match serde_json::from_str::<Value>(&line) {
            Ok(message) => {
              // Route based on message type
              if let Some(id) = message.get("id").and_then(|v| v.as_str()) {
                // Response to a request
                let request_id = RequestId(id.to_string());
                if let Some(sender) = pending_requests.lock().await.remove(&request_id) {
                  if let Some(result) = message.get("result") {
                    let _ = sender.send(Ok(result.clone()));
                  } else if let Some(error) = message.get("error") {
                    let _ = sender.send(Err(anyhow!("JSON-RPC error: {:?}", error)));
                  }
                }
              } else if let Some(method) = message.get("method").and_then(|v| v.as_str()) {
                // Notification
                match method {
                  "session/update" => {
                    if let Some(params) = message.get("params") {
                      Self::handle_session_update(params, &status).await;
                    }
                  }
                  _ => {
                    tracing::debug!("Unhandled notification: {}", method);
                  }
                }
              }
            }
            Err(parse_error) => {
              tracing::error!("Failed to parse JSON from agent: {} - Error: {}", line, parse_error);
              // Signal reader death by setting status to error
              *status.write().await = AgentStatus::Idle;
              // Fail all pending requests
              for (_request_id, sender) in pending_requests.lock().await.drain() {
                let _ = sender.send(Err(anyhow!("Agent JSON parse error: {}", parse_error)));
              }
              return;
            }
          }
        }
          Ok(None) => {
            // EOF - agent process ended
            tracing::debug!("Agent stdout reached EOF");
            *status.write().await = AgentStatus::Idle;
            // Fail all pending requests immediately instead of leaving them to timeout
            for (_request_id, sender) in pending_requests.lock().await.drain() {
              let _ = sender.send(Err(anyhow!("Agent process exited (EOF)")));
            }
            return;
          }
        Err(io_error) => {
          tracing::error!("Error reading from agent stdout: {}", io_error);
          // Signal reader death by setting status to error
          *status.write().await = AgentStatus::Idle;
          // Fail all pending requests
          for (_request_id, sender) in pending_requests.lock().await.drain() {
            let _ = sender.send(Err(anyhow!("Agent read error: {}", io_error)));
          }
          return;
        }
      }
    }
  }

    /// Handle session/update notifications for status detection
    async fn handle_session_update(params: &Value, status: &Arc<RwLock<AgentStatus>>) {
        if let Some(session_update) = params.get("sessionUpdate") {
            if let Some(plan) = session_update.get("plan") {
                if let Some(status_str) = plan.get("status").and_then(|v| v.as_str()) {
                    if matches!(status_str, "pending" | "in_progress") {
                        *status.write().await = AgentStatus::Working {
                            task_summary: "Executing plan".to_string(),
                        };
                    }
                }
            }

            if let Some(tool_call) = session_update.get("tool_call") {
                if let Some(status_str) = tool_call.get("status").and_then(|v| v.as_str()) {
                    if matches!(status_str, "pending" | "in_progress") {
                        *status.write().await = AgentStatus::Working {
                            task_summary: "Executing tool call".to_string(),
                        };
                    }
                }
            }

            if let Some(tool_call_update) = session_update.get("tool_call_update") {
                if let Some(status_str) = tool_call_update.get("status").and_then(|v| v.as_str()) {
                    match status_str {
                        "in_progress" => {
                            *status.write().await = AgentStatus::Working {
                                task_summary: "Tool call in progress".to_string(),
                            };
                        }
                        "completed" => {}
                        _ => {}
                    }
                }
            }

            if let Some(permission) = session_update.get("session/request_permission") {
                if let Some(prompt) = permission.get("prompt").and_then(|v| v.as_str()) {
                    *status.write().await = AgentStatus::Waiting {
                        prompt: prompt.to_string(),
                    };
                }
            }

            if let Some(_chunk) = session_update.get("agent_message_chunk") {}

            if let Some(prompt_response) = session_update.get("session/prompt") {
                if let Some(stop_reason) = prompt_response.get("stopReason").and_then(|v| v.as_str()) {
                    match stop_reason {
                        "end_turn" | "cancelled" => {
                            *status.write().await = AgentStatus::Idle;
                        }
                        "max_tokens" => {
                            *status.write().await = AgentStatus::Idle;
                            tracing::warn!("Agent stopped due to max tokens limit");
                        }
                        _ => {}
                    }
                }
            }
        }
    }
}

impl Drop for AcpClient {
  fn drop(&mut self) {
    self.stdout_reader.abort();
  }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_acp_handshake() {
        let request_id = RequestId::new();
        assert!(!request_id.0.is_empty());

        let request = JsonRpcRequest {
            jsonrpc: "2.0".to_string(),
            id: request_id.0.clone(),
            method: "initialize".to_string(),
            params: serde_json::json!({
                "protocolVersion": 1,
                "clientCapabilities": {
                    "fs": true,
                    "terminal": true
                },
                "clientInfo": {
                    "name": "ymir",
                    "version": "1.0.0"
                }
            }),
        };

        assert_eq!(request.jsonrpc, "2.0");
        assert_eq!(request.method, "initialize");
        assert!(request.id == request_id.0);
    }

    #[tokio::test]
    async fn test_acp_status_transitions() {
        let status = Arc::new(RwLock::new(AgentStatus::Idle));

        let plan_params = serde_json::json!({
            "sessionUpdate": {
                "plan": {
                    "status": "pending"
                }
            }
        });
        AcpClient::handle_session_update(&plan_params, &status).await;
        assert!(matches!(*status.read().await, AgentStatus::Working { .. }));

        let tool_params = serde_json::json!({
            "sessionUpdate": {
                "tool_call": {
                    "status": "in_progress"
                }
            }
        });
        AcpClient::handle_session_update(&tool_params, &status).await;
        assert!(matches!(*status.read().await, AgentStatus::Working { .. }));

        let permission_params = serde_json::json!({
            "sessionUpdate": {
                "session/request_permission": {
                    "prompt": "Allow file access?"
                }
            }
        });
        AcpClient::handle_session_update(&permission_params, &status).await;
        match &*status.read().await {
            AgentStatus::Waiting { prompt } => assert_eq!(prompt, "Allow file access?"),
            _ => panic!("Expected Waiting status"),
        }

        let stop_params = serde_json::json!({
            "sessionUpdate": {
                "session/prompt": {
                    "stopReason": "end_turn"
                }
            }
        });
        AcpClient::handle_session_update(&stop_params, &status).await;
        assert!(matches!(*status.read().await, AgentStatus::Idle));
    }

    #[tokio::test]
    async fn test_request_id_generation() {
        let id1 = RequestId::new();
        let id2 = RequestId::new();
        
        assert_ne!(id1.0, id2.0);
        assert!(Uuid::parse_str(&id1.0).is_ok());
        assert!(Uuid::parse_str(&id2.0).is_ok());
    }

    #[tokio::test]
    async fn test_json_rpc_structures() {
        let request = JsonRpcRequest {
            jsonrpc: "2.0".to_string(),
            id: "test-id".to_string(),
            method: "test/method".to_string(),
            params: serde_json::json!({"key": "value"}),
        };
        
        let json = serde_json::to_string(&request).unwrap();
        assert!(json.contains("\"jsonrpc\":\"2.0\""));
        assert!(json.contains("\"id\":\"test-id\""));
        assert!(json.contains("\"method\":\"test/method\""));
        
        let notification = JsonRpcNotification {
            jsonrpc: "2.0".to_string(),
            method: "test/notification".to_string(),
            params: serde_json::json!({"key": "value"}),
        };
        
        let json = serde_json::to_string(&notification).unwrap();
        assert!(json.contains("\"jsonrpc\":\"2.0\""));
        assert!(json.contains("\"method\":\"test/notification\""));
        assert!(!json.contains("\"id\""));
    }
}
