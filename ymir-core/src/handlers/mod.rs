//! Request handlers for JSON-RPC methods
//!
//! This module provides handlers for WebSocket JSON-RPC requests:
//! - auth: Password-based authentication
//! - workspace: Workspace CRUD operations
//! - pane: Pane CRUD operations (simplified, no splits)
//! - tab: Tab lifecycle with auto-spawn PTY
//! - pty: PTY operations (connect, write, resize)
//! - git: Git operations (status, stage, unstage, commit, branches, checkout)
//!
//! Each handler module provides:
//! - Input/output types for method parameters and results
//! - Handler struct with business logic
//! - RPC adapter for JSON-RPC integration
//! - State change notifications

pub mod auth;
pub mod git;
pub mod pane;
pub mod pty;
pub mod tab;
pub mod workspace;
pub mod workspace_settings;

pub use auth::{
    AuthConfig, AuthError, AuthHandler, AuthMiddleware, AuthNotification, AuthRpcHandler,
    AuthStatusInput, AuthStatusOutput, LoginInput, LoginOutput, LogoutInput, LogoutOutput,
};
pub use git::{
    GitBranchesInput, GitBranchesOutput, GitCheckoutInput, GitCheckoutOutput, GitCommitInput,
    GitCommitOutput, GitHandler, GitNotification, GitPollingService, GitRpcHandler, GitStageInput,
    GitStageOutput, GitStatusInput, GitStatusOutput, GitUnstageInput, GitUnstageOutput,
};
pub use pane::{
    CreatePaneInput, CreatePaneOutput, DeletePaneInput, DeletePaneOutput, ListPanesInput,
    ListPanesOutput, PaneHandler, PaneNotification, PaneRpcHandler,
};
pub use pty::{
    ConnectPtyInput, ConnectPtyOutput, PtyHandler, PtyNotification, PtyRpcHandler, ResizePtyInput,
    ResizePtyOutput, WritePtyInput, WritePtyOutput,
};
pub use tab::{
    CloseTabInput, CloseTabOutput, CreateTabInput, CreateTabOutput, ListTabsInput, ListTabsOutput,
    TabHandler, TabNotification, TabRpcHandler,
};
pub use workspace::{
    CreateWorkspaceInput, CreateWorkspaceOutput, DeleteWorkspaceInput, DeleteWorkspaceOutput,
    ListWorkspacesInput, ListWorkspacesOutput, RenameWorkspaceInput, RenameWorkspaceOutput,
    WorkspaceHandler, WorkspaceNotification, WorkspaceRpcHandler,
};
pub use workspace_settings::{
    GetSettingsInput, GetSettingsOutput, UpdateSettingsInput, UpdateSettingsOutput,
    WorkspaceSettingsHandler, WorkspaceSettingsRpcHandler,
};
