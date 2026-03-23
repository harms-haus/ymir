//! ACP-WS Adapter: Stateless translation between ACP SDK and WS-ACP wire types.

use crate::protocol::{
    AcpAgentCapabilities, AcpChunkContent, AcpConfigOptionsUpdate, AcpContextUpdate,
    AcpContextUpdateType, AcpEvent, AcpEventEnvelope, AcpPromptChunk,
    AcpSessionConfigOption, AcpSessionConfigOptionCategory, AcpSessionConfigSelectOption,
    AcpSessionInit, AcpToolUseEvent, AcpToolUseStatus,
};
use agent_client_protocol::{
    Client, ContentBlock, Error, FileSystemCapabilities, Implementation,
    ModelInfo, PermissionOptionKind, RequestPermissionOutcome, RequestPermissionResponse,
    SelectedPermissionOutcome, SessionConfigKind, SessionConfigOption,
    SessionConfigOptionCategory, SessionConfigSelectOptions, SessionModeState,
    SessionModelState, SessionNotification, SessionUpdate, ToolCallStatus,
};
use std::sync::Mutex;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;
use tracing::{debug, warn};
use uuid::Uuid;

pub fn normalize_config_options(options: &[SessionConfigOption]) -> Vec<AcpSessionConfigOption> {
    options
        .iter()
        .filter_map(|option| {
            let select = match &option.kind {
                SessionConfigKind::Select(select) => select,
                _ => return None,
            };

            let normalized_options = match &select.options {
                SessionConfigSelectOptions::Ungrouped(values) => values
                    .iter()
                    .map(|value| AcpSessionConfigSelectOption {
                        value: value.value.to_string(),
                        name: value.name.clone(),
                        description: value.description.clone(),
                    })
                    .collect(),
                SessionConfigSelectOptions::Grouped(groups) => groups
                    .iter()
                    .flat_map(|group| group.options.iter())
                    .map(|value| AcpSessionConfigSelectOption {
                        value: value.value.to_string(),
                        name: value.name.clone(),
                        description: value.description.clone(),
                    })
                    .collect(),
                _ => Vec::new(),
            };

            let category = option.category.as_ref().map(|category| match category {
                SessionConfigOptionCategory::Mode => AcpSessionConfigOptionCategory::Mode,
                SessionConfigOptionCategory::Model => AcpSessionConfigOptionCategory::Model,
                SessionConfigOptionCategory::ThoughtLevel => {
                    AcpSessionConfigOptionCategory::ThoughtLevel
                }
                SessionConfigOptionCategory::Other(value) => {
                    AcpSessionConfigOptionCategory::Other(value.clone())
                }
                _ => AcpSessionConfigOptionCategory::Other("unknown".to_string()),
            });

            Some(AcpSessionConfigOption {
                id: option.id.to_string(),
                name: option.name.clone(),
                description: option.description.clone(),
                category,
                current_value: select.current_value.to_string(),
                options: normalized_options,
            })
        })
        .collect()
}

pub fn mode_state_to_config_option(mode_state: &SessionModeState) -> AcpSessionConfigOption {
    AcpSessionConfigOption {
        id: "mode".to_string(),
        name: "Mode".to_string(),
        description: None,
        category: Some(AcpSessionConfigOptionCategory::Mode),
        current_value: mode_state.current_mode_id.to_string(),
        options: mode_state
            .available_modes
            .iter()
            .map(|mode| AcpSessionConfigSelectOption {
                value: mode.id.to_string(),
                name: mode.name.clone(),
                description: mode.description.clone(),
            })
            .collect(),
    }
}

pub fn model_state_to_config_option(model_state: &SessionModelState) -> AcpSessionConfigOption {
    AcpSessionConfigOption {
        id: "model".to_string(),
        name: "Model".to_string(),
        description: None,
        category: Some(AcpSessionConfigOptionCategory::Model),
        current_value: model_state.current_model_id.to_string(),
        options: model_state
            .available_models
            .iter()
            .map(|model: &ModelInfo| AcpSessionConfigSelectOption {
                value: model.model_id.to_string(),
                name: model.name.clone(),
                description: model.description.clone(),
            })
            .collect(),
    }
}

pub fn merge_session_setup_options(
    config_options: Option<&[SessionConfigOption]>,
    mode_state: Option<&SessionModeState>,
    model_state: Option<&SessionModelState>,
) -> Vec<AcpSessionConfigOption> {
    let mut merged = config_options
        .map(normalize_config_options)
        .unwrap_or_default();

    if let Some(mode_state) = mode_state {
        let mode_option = mode_state_to_config_option(mode_state);
        if let Some(existing) = merged.iter_mut().find(|option| {
            option.id == "mode" || matches!(option.category, Some(AcpSessionConfigOptionCategory::Mode))
        }) {
            *existing = mode_option;
        } else {
            merged.push(mode_option);
        }
    }

    if let Some(model_state) = model_state {
        let model_option = model_state_to_config_option(model_state);
        if let Some(existing) = merged.iter_mut().find(|option| {
            option.id == "model" || matches!(option.category, Some(AcpSessionConfigOptionCategory::Model))
        }) {
            *existing = model_option;
        } else {
            merged.push(model_option);
        }
    }

    merged
}

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

#[derive(Clone)]
pub struct YmirClientHandler {
    worktree_id: Uuid,
    event_sender: Arc<dyn AcpEventSender>,
    sequence: Arc<SequenceCounter>,
    config_options: Arc<Mutex<Vec<AcpSessionConfigOption>>>,
}

impl YmirClientHandler {
    pub fn new(worktree_id: Uuid, event_sender: Arc<dyn AcpEventSender>, sequence: Arc<SequenceCounter>) -> Self {
        Self {
            worktree_id,
            event_sender,
            sequence,
            config_options: Arc::new(Mutex::new(Vec::new())),
        }
    }

    pub fn emit_session_init(&self, acp_session_id: String, config_options: Vec<AcpSessionConfigOption>) {
        if let Ok(mut stored) = self.config_options.lock() {
            *stored = config_options.clone();
        }

        self.send_event(AcpEvent::SessionInit(AcpSessionInit {
            acp_session_id,
            capabilities: AcpAgentCapabilities {
                supports_tool_use: true,
                supports_context_update: true,
                supports_cancellation: true,
            },
            config_options,
        }));
    }

    pub fn emit_config_options_update(&self, acp_session_id: String, config_options: Vec<AcpSessionConfigOption>) {
        if let Ok(mut stored) = self.config_options.lock() {
            *stored = config_options.clone();
        }

        self.send_event(AcpEvent::ConfigOptionsUpdate(AcpConfigOptionsUpdate {
            worktree_id: self.worktree_id,
            acp_session_id,
            config_options,
        }));
    }

    pub fn update_config_option_value(&self, config_id: &str, value: &str) -> Vec<AcpSessionConfigOption> {
        if let Ok(mut stored) = self.config_options.lock() {
            if let Some(option) = stored.iter_mut().find(|option| {
                option.id == config_id
                    || (config_id == "mode" && matches!(option.category, Some(AcpSessionConfigOptionCategory::Mode)))
                    || (config_id == "model" && matches!(option.category, Some(AcpSessionConfigOptionCategory::Model)))
            }) {
                option.current_value = value.to_string();
            }
            return stored.clone();
        }

        Vec::new()
    }

  fn send_event(&self, event: AcpEvent) {
    let envelope = AcpEventEnvelope {
      sequence: self.sequence.next(),
      correlation_id: None,
      timestamp: std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0),
      event: event.clone(),
    };
    tracing::info!("Broadcasting ACP event: {:?} for worktree {}", event, self.worktree_id);
    self.event_sender.send_event(envelope);
  }

  fn handle_session_notification(&self, notif: SessionNotification) {
    let session_id_str = notif.session_id.0.to_string();
    tracing::info!("Received session notification from ACP agent: {:?}", notif.update);

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
            SessionUpdate::ConfigOptionUpdate(update) => {
                let config_options = normalize_config_options(&update.config_options);
                self.emit_config_options_update(session_id_str, config_options);
            }
            SessionUpdate::CurrentModeUpdate(update) => {
                let config_options = self.update_config_option_value("mode", &update.current_mode_id.to_string());
                self.emit_config_options_update(session_id_str, config_options);
            }
            SessionUpdate::AvailableCommandsUpdate(_) | SessionUpdate::SessionInfoUpdate(_) => {
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
