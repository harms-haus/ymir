//! Agent client implementation for ACP protocol

pub mod acp;
pub mod adapter;
pub mod handler;

pub use acp::{AcpHandle, AgentStatus, start_acp_runtime};
pub use adapter::{
    create_client_capabilities, create_implementation,
    AcpEventSender, SequenceCounter, YmirClientHandler,
};
pub use handler::{
    cleanup_agents_for_worktree, get_worktree_path, handle_agent_cancel,
    handle_agent_send, handle_agent_set_config_option, handle_agent_spawn,
};
