//! ACP client using official agent-client-protocol SDK with message-passing boundary.

use crate::agent::adapter::{create_client_capabilities, create_implementation, AcpEventSender, SequenceCounter, YmirClientHandler};
use crate::protocol::{AcpEventEnvelope, ServerMessage, ServerMessagePayload};
use agent_client_protocol::{
    Agent, CancelNotification, ClientSideConnection, ContentBlock,
    InitializeRequest, NewSessionRequest, PromptRequest, ProtocolVersion, SessionId,
};
use anyhow::{anyhow, Result};
use std::collections::HashMap;
use std::process::Stdio;
use std::sync::Arc;
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Child;
use tokio::sync::{broadcast, mpsc, oneshot, RwLock};
use tokio::task::JoinHandle;
use tokio_util::compat::{TokioAsyncReadCompatExt, TokioAsyncWriteCompatExt};
use uuid::Uuid;

#[derive(Debug, Clone, PartialEq)]
pub enum AgentStatus {
    Working { task_summary: String },
    Waiting { prompt: String },
    Idle,
}

enum AcpCommand {
    Spawn {
        worktree_id: Uuid,
        agent_type: String,
        worktree_path: String,
        respond: oneshot::Sender<Result<()>>,
    },
    SendPrompt {
        worktree_id: Uuid,
        content: String,
        respond: oneshot::Sender<Result<()>>,
    },
    Cancel {
        worktree_id: Uuid,
        respond: oneshot::Sender<Result<()>>,
    },
    Kill {
        worktree_id: Uuid,
        respond: oneshot::Sender<Result<()>>,
    },
    Status {
        worktree_id: Uuid,
        respond: oneshot::Sender<AgentStatus>,
    },
}

/// Event sender that broadcasts ACP events to all WebSocket clients.
pub struct BroadcastingEventSender {
    broadcast_tx: broadcast::Sender<ServerMessage>,
}

impl BroadcastingEventSender {
    pub fn new(broadcast_tx: broadcast::Sender<ServerMessage>) -> Self {
        Self { broadcast_tx }
    }
}

impl AcpEventSender for BroadcastingEventSender {
    fn send_event(&self, envelope: AcpEventEnvelope) {
        let msg = ServerMessage::new(ServerMessagePayload::AcpWireEvent(envelope));
        // Use send() which is non-blocking and handles no receivers gracefully
        let _ = self.broadcast_tx.send(msg);
    }
}

struct AcpClient {
    process: Child,
    _connection: ClientSideConnection,
    _io_task: JoinHandle<()>,
    session_id: Option<SessionId>,
    status: Arc<RwLock<AgentStatus>>,
}

impl AcpClient {
    async fn spawn(
        agent_type: &str,
        worktree_path: &str,
        worktree_id: Uuid,
        broadcast_tx: broadcast::Sender<ServerMessage>,
    ) -> Result<Self> {
        let status = Arc::new(RwLock::new(AgentStatus::Idle));
        let event_sender = Arc::new(BroadcastingEventSender::new(broadcast_tx));
        let sequence = Arc::new(SequenceCounter::new());
        let handler = YmirClientHandler::new(worktree_id, event_sender, sequence);

        let (connection, _io_task, child) = Self::spawn_stdio(agent_type, worktree_path, handler).await?;

        let mut client = Self {
            process: child,
            _connection: connection,
            _io_task,
            session_id: None,
            status,
        };

        client.initialize().await?;
        client.create_session(worktree_path).await?;

        Ok(client)
    }

        async fn spawn_stdio(
        agent_type: &str,
        worktree_path: &str,
        handler: YmirClientHandler,
    ) -> Result<(ClientSideConnection, JoinHandle<()>, Child)> {
        let executable = match agent_type {
            "claude" => "claude-agent",
            "opencode" => "opencode",
            "pi" => "pi-acp",
            _ => return Err(anyhow!("Unknown agent type: {}", agent_type)),
        };

        let mut cmd = tokio::process::Command::new(executable);
        if agent_type == "opencode" {
            cmd.args(&["acp"]);
        }
        let mut child = cmd
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .current_dir(worktree_path)
            .spawn()
            .map_err(|e| anyhow!("Failed to spawn agent: {}", e))?;

        let stdin = child.stdin.take().ok_or_else(|| anyhow!("No stdin"))?;
        let stdout = child.stdout.take().ok_or_else(|| anyhow!("No stdout"))?;
        let stderr = child.stderr.take().ok_or_else(|| anyhow!("No stderr"))?;

        let _stderr_drain = tokio::spawn(async move {
            let mut reader = BufReader::new(stderr);
            let mut buffer = Vec::new();
            loop {
                match reader.read_until(b'\n', &mut buffer).await {
                    Ok(0) => break,
                    Ok(_) => buffer.clear(),
                    Err(_) => break,
                }
            }
        });

        let (connection, io_future) = ClientSideConnection::new(
            handler,
            stdin.compat_write(),
            stdout.compat(),
            |fut| { tokio::task::spawn_local(fut); },
        );

        let io_task = tokio::task::spawn_local(async move {
            let _ = io_future.await;
        });

        Ok((connection, io_task, child))
    }

    async fn initialize(&mut self) -> Result<()> {
        let request = InitializeRequest::new(ProtocolVersion::V1)
            .client_capabilities(create_client_capabilities())
            .client_info(create_implementation());

        self._connection
            .initialize(request)
            .await
            .map_err(|e| anyhow!("Initialize failed: {}", e))?;

        Ok(())
    }

    async fn create_session(&mut self, worktree_path: &str) -> Result<()> {
        let request = NewSessionRequest::new(worktree_path);

        let response = self._connection
            .new_session(request)
            .await
            .map_err(|e| anyhow!("Session creation failed: {}", e))?;

        self.session_id = Some(response.session_id.clone());
        Ok(())
    }

    async fn send_prompt(&mut self, content: &str) -> Result<()> {
        let session_id = self.session_id.clone()
            .ok_or_else(|| anyhow!("No active session"))?;

        let request = PromptRequest::new(session_id, vec![ContentBlock::from(content.to_string())]);

        self._connection
            .prompt(request)
            .await
            .map_err(|e| anyhow!("Prompt failed: {}", e))?;

        *self.status.write().await = AgentStatus::Working {
            task_summary: "Processing prompt".to_string(),
        };
        Ok(())
    }

    async fn cancel(&mut self) -> Result<()> {
        let session_id = self.session_id.clone()
            .ok_or_else(|| anyhow!("No active session"))?;

        let notification = CancelNotification::new(session_id);

        self._connection
            .cancel(notification)
            .await
            .map_err(|e| anyhow!("Cancel failed: {}", e))?;

        *self.status.write().await = AgentStatus::Idle;
        Ok(())
    }

    async fn status(&self) -> AgentStatus {
        self.status.read().await.clone()
    }

    async fn kill(&mut self) -> Result<()> {
        self.process.kill().await?;
        Ok(())
    }
}

#[derive(Clone)]
pub struct AcpHandle {
    tx: mpsc::UnboundedSender<AcpCommand>,
}

impl AcpHandle {
    fn new(tx: mpsc::UnboundedSender<AcpCommand>) -> Self {
        Self { tx }
    }

    pub async fn spawn_agent(&self, worktree_id: Uuid, agent_type: &str, worktree_path: &str) -> Result<()> {
        let (respond_tx, respond_rx) = oneshot::channel();
        self.tx.send(AcpCommand::Spawn {
            worktree_id,
            agent_type: agent_type.to_string(),
            worktree_path: worktree_path.to_string(),
            respond: respond_tx,
        }).map_err(|e| anyhow!("Failed to send command: {}", e))?;
        respond_rx.await.map_err(|e| anyhow!("Failed to receive response: {}", e))?
    }

    pub async fn send_prompt(&self, worktree_id: Uuid, content: &str) -> Result<()> {
        let (respond_tx, respond_rx) = oneshot::channel();
        self.tx.send(AcpCommand::SendPrompt {
            worktree_id,
            content: content.to_string(),
            respond: respond_tx,
        }).map_err(|e| anyhow!("Failed to send command: {}", e))?;
        respond_rx.await.map_err(|e| anyhow!("Failed to receive response: {}", e))?
    }

    pub async fn cancel(&self, worktree_id: Uuid) -> Result<()> {
        let (respond_tx, respond_rx) = oneshot::channel();
        self.tx.send(AcpCommand::Cancel {
            worktree_id,
            respond: respond_tx,
        }).map_err(|e| anyhow!("Failed to send command: {}", e))?;
        respond_rx.await.map_err(|e| anyhow!("Failed to receive response: {}", e))?
    }

    pub async fn kill(&self, worktree_id: Uuid) -> Result<()> {
        let (respond_tx, respond_rx) = oneshot::channel();
        self.tx.send(AcpCommand::Kill {
            worktree_id,
            respond: respond_tx,
        }).map_err(|e| anyhow!("Failed to send command: {}", e))?;
        respond_rx.await.map_err(|e| anyhow!("Failed to receive response: {}", e))?
    }

    pub async fn status(&self, worktree_id: Uuid) -> AgentStatus {
        let (respond_tx, respond_rx) = oneshot::channel();
        let _ = self.tx.send(AcpCommand::Status {
            worktree_id,
            respond: respond_tx,
        });
        respond_rx.await.unwrap_or(AgentStatus::Idle)
    }
}

pub fn start_acp_runtime(broadcast_tx: broadcast::Sender<ServerMessage>) -> (AcpHandle, JoinHandle<()>) {
    let (tx, mut rx) = mpsc::unbounded_channel::<AcpCommand>();
    let handle = AcpHandle::new(tx);

    let join_handle = tokio::task::spawn_blocking(move || {
        let rt = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .expect("Failed to create ACP runtime");

        let local = tokio::task::LocalSet::new();

        local.block_on(&rt, async move {
            let mut clients: HashMap<Uuid, AcpClient> = HashMap::new();

            while let Some(cmd) = rx.recv().await {
                match cmd {
                    AcpCommand::Spawn { worktree_id, agent_type, worktree_path, respond } => {
                        let result = AcpClient::spawn(
                            &agent_type,
                            &worktree_path,
                            worktree_id,
                            broadcast_tx.clone(),
                        ).await;
                        let _ = respond.send(result.map(|client| {
                            clients.insert(worktree_id, client);
                        }));
                    }
                    AcpCommand::SendPrompt { worktree_id, content, respond } => {
                        let result = if let Some(client) = clients.get_mut(&worktree_id) {
                            client.send_prompt(&content).await
                        } else {
                            Err(anyhow!("No client for worktree {}", worktree_id))
                        };
                        let _ = respond.send(result);
                    }
                    AcpCommand::Cancel { worktree_id, respond } => {
                        let result = if let Some(client) = clients.get_mut(&worktree_id) {
                            client.cancel().await
                        } else {
                            Err(anyhow!("No client for worktree {}", worktree_id))
                        };
                        let _ = respond.send(result);
                    }
                    AcpCommand::Kill { worktree_id, respond } => {
                        let result = if let Some(mut client) = clients.remove(&worktree_id) {
                            client.kill().await
                        } else {
                            Ok(())
                        };
                        let _ = respond.send(result);
                    }
                    AcpCommand::Status { worktree_id, respond } => {
                        let status = if let Some(client) = clients.get(&worktree_id) {
                            client.status().await
                        } else {
                            AgentStatus::Idle
                        };
                        let _ = respond.send(status);
                    }
                }
            }
        });
    });

    (handle, join_handle)
}

#[cfg(test)]
mod tests {
    use super::*;
    use agent_client_protocol::{ClientCapabilities, Implementation};

    #[test]
    fn test_acp_handshake() {
        let caps: ClientCapabilities = create_client_capabilities();
        assert_eq!(caps.terminal, false);

        let impl_info: Implementation = create_implementation();
        assert_eq!(impl_info.name, "ymir");
    }

    #[tokio::test]
    async fn test_acp_status_transitions() {
        let status = Arc::new(RwLock::new(AgentStatus::Idle));

        *status.write().await = AgentStatus::Working {
            task_summary: "Test task".to_string(),
        };
        assert!(matches!(*status.read().await, AgentStatus::Working { .. }));

        *status.write().await = AgentStatus::Waiting {
            prompt: "Allow access?".to_string(),
        };
        match &*status.read().await {
            AgentStatus::Waiting { prompt } => assert_eq!(prompt, "Allow access?"),
            _ => panic!("Expected Waiting status"),
        }

        *status.write().await = AgentStatus::Idle;
        assert!(matches!(*status.read().await, AgentStatus::Idle));
    }

    #[tokio::test]
    async fn test_acp_handle_send() {
        let (broadcast_tx, _broadcast_rx) = broadcast::channel(16);
        let (handle, _join) = start_acp_runtime(broadcast_tx);

        let status = handle.status(Uuid::new_v4()).await;
        assert!(matches!(status, AgentStatus::Idle));
    }

    #[test]
    fn test_broadcasting_event_sender_sends_message() {
        let (broadcast_tx, mut broadcast_rx) = broadcast::channel(16);
        let sender = BroadcastingEventSender::new(broadcast_tx);

        let envelope = AcpEventEnvelope {
            sequence: 1,
            correlation_id: None,
            timestamp: 12345,
            event: crate::protocol::AcpEvent::SessionStatus(
                crate::protocol::AcpSessionStatusEvent {
                    worktree_id: Uuid::nil(),
                    acp_session_id: "test-session".to_string(),
                    status: crate::protocol::AcpSessionStatus::Working,
                }
            ),
        };

        sender.send_event(envelope);

        let received = broadcast_rx.try_recv().expect("Should receive broadcast");
        match received.payload {
            crate::protocol::ServerMessagePayload::AcpWireEvent(env) => {
                assert_eq!(env.sequence, 1);
            }
            _ => panic!("Expected AcpWireEvent, got {:?}", received.payload),
        }
    }
}