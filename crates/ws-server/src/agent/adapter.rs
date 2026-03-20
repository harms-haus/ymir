//! ACP-WS Adapter: Stateless translation between ACP SDK and WS-ACP wire types.

use crate::protocol::{
    AcpChunkContent, AcpContextUpdate, AcpContextUpdateType,
    AcpEvent, AcpEventEnvelope, AcpPromptChunk, AcpToolUseEvent, AcpToolUseStatus,
};
use agent_client_protocol::{
    Client, ContentBlock, Error, FileSystemCapabilities, Implementation,
    PermissionOptionKind, RequestPermissionOutcome, RequestPermissionResponse,
    SelectedPermissionOutcome, SessionNotification, SessionUpdate, ToolCallStatus,
};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;
use tracing::{debug, warn};
use uuid::Uuid;

pub struct SequenceCounter {
    inner: AtomicU64,
}

impl SequenceCounter {
    pub fn new() -> Self {
        Self { inner: AtomicU64::new(1) }
    }

    pub fn next(&self) -> u64 {
        self.inner.fetch_add(1, Ordering::SeqCst)
    }
}

impl Default for SequenceCounter {
    fn default() -> Self { Self::new() }
}

pub trait AcpEventSender: Send + Sync {
    fn send_event(&self, envelope: AcpEventEnvelope);
}

pub struct YmirClientHandler {
    worktree_id: Uuid,
    event_sender: Arc<dyn AcpEventSender>,
    sequence: Arc<SequenceCounter>,
}

impl YmirClientHandler {
    pub fn new(worktree_id: Uuid, event_sender: Arc<dyn AcpEventSender>, sequence: Arc<SequenceCounter>) -> Self {
        Self { worktree_id, event_sender, sequence }
    }

    fn send_event(&self, event: AcpEvent) {
        let envelope = AcpEventEnvelope {
            sequence: self.sequence.next(),
            correlation_id: None,
            timestamp: std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|d| d.as_millis() as u64)
                .unwrap_or(0),
            event,
        };
        self.event_sender.send_event(envelope);
    }

    fn handle_session_notification(&self, notif: SessionNotification) {
        let session_id_str = notif.session_id.0.to_string();
        
        match notif.update {
            SessionUpdate::AgentMessageChunk(chunk) => {
                let content = match chunk.content {
                    ContentBlock::Text(text) => AcpChunkContent::Text(text.text),
                    ContentBlock::Image(img) => AcpChunkContent::Structured(
                        serde_json::to_string(&img).unwrap_or_default()),
                    ContentBlock::Resource(res) => AcpChunkContent::Structured(
                        serde_json::to_string(&res).unwrap_or_default()),
                    ContentBlock::Audio(audio) => AcpChunkContent::Structured(
                        serde_json::to_string(&audio).unwrap_or_default()),
                    _ => AcpChunkContent::Structured(String::new()),
                };
                self.send_event(AcpEvent::PromptChunk(AcpPromptChunk {
                    worktree_id: self.worktree_id,
                    acp_session_id: session_id_str,
                    content,
                    is_final: false,
                }));
            }
            SessionUpdate::AgentThoughtChunk(chunk) => {
                let content = match chunk.content {
                    ContentBlock::Text(text) => AcpChunkContent::Text(text.text),
                    ContentBlock::Image(img) => AcpChunkContent::Structured(
                        serde_json::to_string(&img).unwrap_or_default()),
                    ContentBlock::Resource(res) => AcpChunkContent::Structured(
                        serde_json::to_string(&res).unwrap_or_default()),
                    ContentBlock::Audio(audio) => AcpChunkContent::Structured(
                        serde_json::to_string(&audio).unwrap_or_default()),
                    _ => AcpChunkContent::Structured(String::new()),
                };
                self.send_event(AcpEvent::PromptChunk(AcpPromptChunk {
                    worktree_id: self.worktree_id,
                    acp_session_id: session_id_str,
                    content,
                    is_final: false,
                }));
            }
            SessionUpdate::UserMessageChunk(chunk) => {
                let content = match chunk.content {
                    ContentBlock::Text(text) => AcpChunkContent::Text(text.text),
                    ContentBlock::Image(img) => AcpChunkContent::Structured(
                        serde_json::to_string(&img).unwrap_or_default()),
                    ContentBlock::Resource(res) => AcpChunkContent::Structured(
                        serde_json::to_string(&res).unwrap_or_default()),
                    ContentBlock::Audio(audio) => AcpChunkContent::Structured(
                        serde_json::to_string(&audio).unwrap_or_default()),
                    _ => AcpChunkContent::Structured(String::new()),
                };
                self.send_event(AcpEvent::PromptChunk(AcpPromptChunk {
                    worktree_id: self.worktree_id,
                    acp_session_id: session_id_str,
                    content,
                    is_final: false,
                }));
            }
            SessionUpdate::ToolCall(tool_call) => {
                let status = match tool_call.status {
                    ToolCallStatus::Pending => AcpToolUseStatus::Started,
                    ToolCallStatus::InProgress => AcpToolUseStatus::InProgress,
                    ToolCallStatus::Completed => AcpToolUseStatus::Completed,
                    ToolCallStatus::Failed => AcpToolUseStatus::Error,
                    _ => AcpToolUseStatus::InProgress,
                };
                self.send_event(AcpEvent::ToolUse(AcpToolUseEvent {
                    worktree_id: self.worktree_id,
                    acp_session_id: session_id_str,
                    tool_use_id: tool_call.tool_call_id.0.to_string(),
                    tool_name: tool_call.title,
                    status,
                    input: tool_call.raw_input.as_ref().map(|i| serde_json::to_string(i).unwrap_or_default()),
                    output: tool_call.raw_output.as_ref().map(|o| serde_json::to_string(o).unwrap_or_default()),
                    error: None,
                }));
            }
            SessionUpdate::ToolCallUpdate(update) => {
                let status = update.fields.status.map(|s| match s {
                    ToolCallStatus::Pending => AcpToolUseStatus::Started,
                    ToolCallStatus::InProgress => AcpToolUseStatus::InProgress,
                    ToolCallStatus::Completed => AcpToolUseStatus::Completed,
                    ToolCallStatus::Failed => AcpToolUseStatus::Error,
                    _ => AcpToolUseStatus::InProgress,
                }).unwrap_or(AcpToolUseStatus::InProgress);
                self.send_event(AcpEvent::ToolUse(AcpToolUseEvent {
                    worktree_id: self.worktree_id,
                    acp_session_id: session_id_str,
                    tool_use_id: update.tool_call_id.0.to_string(),
                    tool_name: update.fields.title.unwrap_or_default(),
                    status,
                    input: update.fields.raw_input.as_ref().map(|i| serde_json::to_string(i).unwrap_or_default()),
                    output: update.fields.raw_output.as_ref().map(|o| serde_json::to_string(o).unwrap_or_default()),
                    error: None,
                }));
            }
            SessionUpdate::Plan(plan) => {
                self.send_event(AcpEvent::ContextUpdate(AcpContextUpdate {
                    worktree_id: self.worktree_id,
                    acp_session_id: session_id_str,
                    update_type: AcpContextUpdateType::MemoryUpdate,
                    data: serde_json::to_string(&plan).unwrap_or_default(),
                }));
            }
            SessionUpdate::AvailableCommandsUpdate(_)
            | SessionUpdate::CurrentModeUpdate(_)
            | SessionUpdate::ConfigOptionUpdate(_)
            | SessionUpdate::SessionInfoUpdate(_) => {
                debug!("Unhandled session update type");
            }
            _ => {
                debug!("Unknown session update type");
            }
        }
    }
}

#[async_trait::async_trait(?Send)]
impl Client for YmirClientHandler {
    async fn request_permission(
        &self,
        args: agent_client_protocol::RequestPermissionRequest,
    ) -> agent_client_protocol::Result<RequestPermissionResponse> {
        debug!("Permission request from agent");
        
        // Find an allow option (prefer AllowOnce over AllowAlways)
        let allow_option = args.options.iter()
            .find(|opt| matches!(opt.kind, PermissionOptionKind::AllowOnce))
            .or_else(|| args.options.iter()
                .find(|opt| matches!(opt.kind, PermissionOptionKind::AllowAlways)));
        
        let outcome = if let Some(opt) = allow_option {
            RequestPermissionOutcome::Selected(
                SelectedPermissionOutcome::new(opt.option_id.clone())
            )
        } else {
            warn!("No allow option found for permission request, denying");
            RequestPermissionOutcome::Cancelled
        };
        
        Ok(RequestPermissionResponse::new(outcome))
    }

    async fn session_notification(
        &self,
        args: SessionNotification,
    ) -> agent_client_protocol::Result<()> {
        self.handle_session_notification(args);
        Ok(())
    }

    async fn read_text_file(
        &self,
        _args: agent_client_protocol::ReadTextFileRequest,
    ) -> agent_client_protocol::Result<agent_client_protocol::ReadTextFileResponse> {
        Err(Error::method_not_found())
    }

    async fn write_text_file(
        &self,
        _args: agent_client_protocol::WriteTextFileRequest,
    ) -> agent_client_protocol::Result<agent_client_protocol::WriteTextFileResponse> {
        Err(Error::method_not_found())
    }
}

pub fn create_client_capabilities() -> agent_client_protocol::ClientCapabilities {
    agent_client_protocol::ClientCapabilities::new()
        .fs(FileSystemCapabilities::new())
        .terminal(false)
}

pub fn create_implementation() -> Implementation {
    Implementation::new("ymir", env!("CARGO_PKG_VERSION"))
        .title("Ymir Agent Client")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_sequence_counter() {
        let counter = SequenceCounter::new();
        assert_eq!(counter.next(), 1);
        assert_eq!(counter.next(), 2);
    }

    #[test]
    fn test_create_client_capabilities() {
        let caps = create_client_capabilities();
        assert_eq!(caps.fs.read_text_file, false);
        assert_eq!(caps.terminal, false);
    }

    #[test]
    fn test_create_implementation() {
        let impl_info = create_implementation();
        assert_eq!(impl_info.name, "ymir");
        assert!(impl_info.title.is_some());
    }
}