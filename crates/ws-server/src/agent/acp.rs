//! ACP client using official agent-client-protocol SDK with message-passing boundary.

use crate::agent::adapter::{
    create_client_capabilities, create_implementation, merge_session_setup_options,
    AcpEventSender, SequenceCounter, YmirClientHandler,
};
use crate::protocol::{AcpEventEnvelope, ServerMessage, ServerMessagePayload};
use agent_client_protocol::{
    Agent, CancelNotification, ClientSideConnection, ContentBlock,
    InitializeRequest, NewSessionRequest, PromptRequest, ProtocolVersion, SessionId,
    SetSessionConfigOptionRequest, SetSessionModeRequest, SetSessionModelRequest,
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
        agent_tab_id: Uuid,
        worktree_id: Uuid,
        agent_type: String,
        worktree_path: String,
        respond: oneshot::Sender<Result<()>>,
    },
    SendPrompt {
        agent_tab_id: Uuid,
        content: String,
        respond: oneshot::Sender<Result<()>>,
    },
    Cancel {
        agent_tab_id: Uuid,
        respond: oneshot::Sender<Result<()>>,
    },
    Kill {
        agent_tab_id: Uuid,
        respond: oneshot::Sender<Result<()>>,
    },
    SetSessionConfigOption {
        agent_tab_id: Uuid,
        config_id: String,
        value: String,
        respond: oneshot::Sender<Result<()>>,
    },
    Status {
        agent_tab_id: Uuid,
        respond: oneshot::Sender<AgentStatus>,
    },
    /// List all active agent sessions with their sessionId mappings
    ListSessions {
        respond: oneshot::Sender<Vec<AcpSessionInfo>>,
    },
    FindSessionByAcpId {
        acp_session_id: String,
        respond: oneshot::Sender<Option<Uuid>>,
    },
}

#[derive(Debug, Clone)]
pub struct AcpSessionInfo {
    pub agent_tab_id: Uuid,
    pub worktree_id: Uuid,
    pub acp_session_id: Option<String>,
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
    worktree_id: Uuid,
    handler: YmirClientHandler,
}

impl AcpClient {
    async fn spawn(
        agent_type: &str,
        worktree_path: &str,
        worktree_id: Uuid,
        agent_tab_id: Uuid,
        broadcast_tx: broadcast::Sender<ServerMessage>,
    ) -> Result<Self> {
        let status = Arc::new(RwLock::new(AgentStatus::Idle));
        let event_sender = Arc::new(BroadcastingEventSender::new(broadcast_tx));
        let sequence = Arc::new(SequenceCounter::new());
        let handler = YmirClientHandler::new(worktree_id, agent_tab_id, event_sender, sequence);

        let (connection, _io_task, child) = Self::spawn_stdio(agent_type, worktree_path, handler.clone()).await?;

        let mut client = Self {
            process: child,
            _connection: connection,
            _io_task,
            session_id: None,
            status,
            worktree_id,
            handler,
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
            "hermes" => "hermes",
            "claude" => "claude-agent",
            "opencode" => "opencode",
            "pi" => "pi-acp",
            _ => return Err(anyhow!("Unknown agent type: {}", agent_type)),
        };

        let mut cmd = tokio::process::Command::new(executable);
        if agent_type == "opencode" || agent_type == "hermes" {
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
        let config_options = merge_session_setup_options(
            response.config_options.as_deref(),
            response.modes.as_ref(),
            response.models.as_ref(),
        );
        self.handler.emit_session_init(
            response.session_id.to_string(),
            config_options,
        );
        Ok(())
    }

    async fn set_config_option(&mut self, config_id: &str, value: &str) -> Result<()> {
        let session_id = self.session_id.clone().ok_or_else(|| anyhow!("No active session"))?;
        let config_id = config_id.to_string();
        let value = value.to_string();

        match config_id.as_str() {
            "mode" => {
                self._connection
                    .set_session_mode(SetSessionModeRequest::new(session_id, value.clone()))
                    .await
                    .map_err(|e| anyhow!("Set session mode failed: {}", e))?;
            }
            "model" => {
                self._connection
                    .set_session_model(SetSessionModelRequest::new(session_id, value.clone()))
                    .await
                    .map_err(|e| anyhow!("Set session model failed: {}", e))?;
            }
            _ => {
                self._connection
                    .set_session_config_option(SetSessionConfigOptionRequest::new(session_id, config_id.clone(), value.clone()))
                    .await
                    .map_err(|e| anyhow!("Set session config option failed: {}", e))?;
            }
        }

        let config_options = self.handler.update_config_option_value(&config_id, &value);
        let acp_session_id = self
            .session_id
            .as_ref()
            .map(ToString::to_string)
            .ok_or_else(|| anyhow!("No active session"))?;
        self.handler.emit_config_options_update(acp_session_id, config_options);

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

    pub async fn spawn_agent(&self, agent_tab_id: Uuid, worktree_id: Uuid, agent_type: &str, worktree_path: &str) -> Result<()> {
        let (respond_tx, respond_rx) = oneshot::channel();
        self.tx.send(AcpCommand::Spawn {
            agent_tab_id,
            worktree_id,
            agent_type: agent_type.to_string(),
            worktree_path: worktree_path.to_string(),
            respond: respond_tx,
        }).map_err(|e| anyhow!("Failed to send command: {}", e))?;
        respond_rx.await.map_err(|e| anyhow!("Failed to receive response: {}", e))?
    }

    pub async fn send_prompt(&self, agent_tab_id: Uuid, content: &str) -> Result<()> {
        let (respond_tx, respond_rx) = oneshot::channel();
        self.tx.send(AcpCommand::SendPrompt {
            agent_tab_id,
            content: content.to_string(),
            respond: respond_tx,
        }).map_err(|e| anyhow!("Failed to send command: {}", e))?;
        respond_rx.await.map_err(|e| anyhow!("Failed to receive response: {}", e))?
    }

    pub async fn cancel(&self, agent_tab_id: Uuid) -> Result<()> {
        let (respond_tx, respond_rx) = oneshot::channel();
        self.tx.send(AcpCommand::Cancel {
            agent_tab_id,
            respond: respond_tx,
        }).map_err(|e| anyhow!("Failed to send command: {}", e))?;
        respond_rx.await.map_err(|e| anyhow!("Failed to receive response: {}", e))?
    }

    pub async fn kill(&self, agent_tab_id: Uuid) -> Result<()> {
        let (respond_tx, respond_rx) = oneshot::channel();
        self.tx.send(AcpCommand::Kill {
            agent_tab_id,
            respond: respond_tx,
        }).map_err(|e| anyhow!("Failed to send command: {}", e))?;
        respond_rx.await.map_err(|e| anyhow!("Failed to receive response: {}", e))?
    }

    pub async fn set_session_config_option(&self, agent_tab_id: Uuid, config_id: &str, value: &str) -> Result<()> {
        let (respond_tx, respond_rx) = oneshot::channel();
        self.tx.send(AcpCommand::SetSessionConfigOption {
            agent_tab_id,
            config_id: config_id.to_string(),
            value: value.to_string(),
            respond: respond_tx,
        }).map_err(|e| anyhow!("Failed to send command: {}", e))?;
        respond_rx.await.map_err(|e| anyhow!("Failed to receive response: {}", e))?
    }

    pub async fn status(&self, agent_tab_id: Uuid) -> AgentStatus {
        let (respond_tx, respond_rx) = oneshot::channel();
        let _ = self.tx.send(AcpCommand::Status {
            agent_tab_id,
            respond: respond_tx,
        });
        respond_rx.await.unwrap_or(AgentStatus::Idle)
    }

    pub async fn list_sessions(&self) -> Vec<AcpSessionInfo> {
        let (respond_tx, respond_rx) = oneshot::channel();
        let _ = self.tx.send(AcpCommand::ListSessions { respond: respond_tx });
        respond_rx.await.unwrap_or_default()
    }

    pub async fn find_session_by_acp_id(&self, acp_session_id: &str) -> Option<Uuid> {
        let (respond_tx, respond_rx) = oneshot::channel();
        let _ = self.tx.send(AcpCommand::FindSessionByAcpId {
            acp_session_id: acp_session_id.to_string(),
            respond: respond_tx,
        });
        respond_rx.await.unwrap_or(None)
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
                    AcpCommand::Spawn { agent_tab_id, worktree_id, agent_type, worktree_path, respond } => {
                        let result = AcpClient::spawn(
                            &agent_type,
                            &worktree_path,
                            worktree_id,
                            agent_tab_id,
                            broadcast_tx.clone(),
                        ).await;
                        let _ = respond.send(result.map(|client| {
                            clients.insert(agent_tab_id, client);
                        }));
                    }
                    AcpCommand::SendPrompt { agent_tab_id, content, respond } => {
                        let result = if let Some(client) = clients.get_mut(&agent_tab_id) {
                            client.send_prompt(&content).await
                        } else {
                            Err(anyhow!("No client for agent tab {}", agent_tab_id))
                        };
                        let _ = respond.send(result);
                    }
                    AcpCommand::Cancel { agent_tab_id, respond } => {
                        let result = if let Some(client) = clients.get_mut(&agent_tab_id) {
                            client.cancel().await
                        } else {
                            Err(anyhow!("No client for agent tab {}", agent_tab_id))
                        };
                        let _ = respond.send(result);
                    }
                    AcpCommand::Kill { agent_tab_id, respond } => {
                        let result = if let Some(mut client) = clients.remove(&agent_tab_id) {
                            client.kill().await
                        } else {
                            Ok(())
                        };
                        let _ = respond.send(result);
                    }
                    AcpCommand::SetSessionConfigOption { agent_tab_id, config_id, value, respond } => {
                        let result = if let Some(client) = clients.get_mut(&agent_tab_id) {
                            client.set_config_option(&config_id, &value).await
                        } else {
                            Err(anyhow!("No client for agent tab {}", agent_tab_id))
                        };
                        let _ = respond.send(result);
                    }
                    AcpCommand::Status { agent_tab_id, respond } => {
                        let status = if let Some(client) = clients.get(&agent_tab_id) {
                            client.status().await
                        } else {
                            AgentStatus::Idle
                        };
                        let _ = respond.send(status);
                    }
                    AcpCommand::ListSessions { respond } => {
                        let sessions: Vec<AcpSessionInfo> = clients.iter().map(|(id, client)| {
                            AcpSessionInfo {
                                agent_tab_id: *id,
                                worktree_id: client.worktree_id,
                                acp_session_id: client.session_id.as_ref().map(|s| s.to_string()),
                            }
                        }).collect();
                        let _ = respond.send(sessions);
                    }
                    AcpCommand::FindSessionByAcpId { acp_session_id, respond } => {
                        let found = clients.iter()
                            .find(|(_, client)| {
                                client.session_id.as_ref().map(|s| s.to_string()) == Some(acp_session_id.clone())
                            })
                            .map(|(id, _)| *id);
                        let _ = respond.send(found);
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
            agent_tab_id: None,
            worktree_id: None,
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
