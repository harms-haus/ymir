//! Test fixture infrastructure for cross-language testing
//!
//! This module provides utilities for creating and managing test fixtures
//! used in cross-language protocol compatibility tests.

use anyhow::Result;
use serde::Serialize;
use std::path::PathBuf;

/// Returns the path to the test fixtures directory
///
/// The fixtures directory is located at `<workspace_root>/test-fixtures/`
pub fn fixture_dir() -> PathBuf {
    let mut path = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    path.pop();
    path.pop();
    path.push("test-fixtures");
    path
}

/// Writes a serializable type to a test fixture file
///
/// # Arguments
/// * `name` - The name of the fixture file (without extension)
/// * `data` - The data to serialize and write
///
/// # Returns
/// The full path to the created fixture file
///
/// # Example
/// ```ignore
/// let msg = ClientMessage::new(ClientMessagePayload::Ping(Ping { timestamp: 12345 }));
/// let path = write_fixture("ping_message", &msg)?;
/// // File created at: <workspace>/test-fixtures/ping_message.msgpack
/// ```
pub fn write_fixture<T: Serialize>(name: &str, data: &T) -> Result<PathBuf> {
    let fixture_dir = fixture_dir();
    std::fs::create_dir_all(&fixture_dir)?;

    let file_path = fixture_dir.join(format!("{}.msgpack", name));
    let bytes = rmp_serde::to_vec(data)?;
    std::fs::write(&file_path, bytes)?;

    Ok(file_path)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_fixture_dir_points_to_correct_location() {
        let dir = fixture_dir();
        assert!(dir.ends_with("test-fixtures"));
    }

    #[test]
    fn test_write_fixture_creates_file() -> Result<()> {
        let test_data = vec![1, 2, 3];
        let path = write_fixture("test_vec", &test_data)?;

        assert!(path.exists());
        assert!(path.ends_with("test-fixtures/test_vec.msgpack"));

        // Cleanup
        std::fs::remove_file(path)?;
        Ok(())
    }

    #[test]
    fn test_write_fixture_serializes_correctly() -> Result<()> {
        use serde::{Deserialize, Serialize};

        #[derive(Debug, Serialize, Deserialize, PartialEq)]
        struct TestStruct {
            name: String,
            value: i32,
        }

        let original = TestStruct {
            name: "test".to_string(),
            value: 42,
        };

        let path = write_fixture("test_struct", &original)?;
        let bytes = std::fs::read(&path)?;
        let decoded: TestStruct = rmp_serde::from_slice(&bytes)?;

        assert_eq!(original, decoded);

        // Cleanup
        std::fs::remove_file(path)?;
        Ok(())
    }

    #[test]
    fn test_workspace_create_fixture() -> Result<()> {
        use crate::protocol::{ClientMessage, ClientMessagePayload, WorkspaceCreate};

        let msg = ClientMessage::new(ClientMessagePayload::WorkspaceCreate(WorkspaceCreate {
            name: "test-workspace".to_string(),
            root_path: "/path/to/workspace".to_string(),
            color: Some("#ff0000".to_string()),
            icon: Some("folder".to_string()),
            worktree_base_dir: Some(".worktrees".to_string()),
        }));

        let path = write_fixture("WorkspaceCreate", &msg)?;
        assert!(path.exists());
        assert!(path.ends_with("test-fixtures/WorkspaceCreate.msgpack"));

        let bytes = std::fs::read(&path)?;
        let decoded: ClientMessage = rmp_serde::from_slice(&bytes)?;
        assert_eq!(msg, decoded);

        Ok(())
    }

    #[test]
    fn test_workspace_rename_fixture() -> Result<()> {
        use crate::protocol::{ClientMessage, ClientMessagePayload, WorkspaceRename};
        use uuid::Uuid;

        let msg = ClientMessage::new(ClientMessagePayload::WorkspaceRename(WorkspaceRename {
            workspace_id: Uuid::new_v4(),
            new_name: "renamed-workspace".to_string(),
        }));

        let path = write_fixture("WorkspaceRename", &msg)?;
        assert!(path.exists());
        assert!(path.ends_with("test-fixtures/WorkspaceRename.msgpack"));

        let bytes = std::fs::read(&path)?;
        let decoded: ClientMessage = rmp_serde::from_slice(&bytes)?;
        assert_eq!(msg, decoded);

        Ok(())
    }

    #[test]
    fn test_workspace_update_fixture() -> Result<()> {
        use crate::protocol::{ClientMessage, ClientMessagePayload, WorkspaceUpdate};
        use uuid::Uuid;

        let msg = ClientMessage::new(ClientMessagePayload::WorkspaceUpdate(WorkspaceUpdate {
            workspace_id: Uuid::new_v4(),
            color: Some("#00ff00".to_string()),
            icon: Some("code".to_string()),
            worktree_base_dir: Some("custom-worktrees".to_string()),
            settings: Some("{\"theme\":\"dark\"}".to_string()),
            request_id: Some(Uuid::new_v4()),
        }));

        let path = write_fixture("WorkspaceUpdate", &msg)?;
        assert!(path.exists());
        assert!(path.ends_with("test-fixtures/WorkspaceUpdate.msgpack"));

        let bytes = std::fs::read(&path)?;
        let decoded: ClientMessage = rmp_serde::from_slice(&bytes)?;
        assert_eq!(msg, decoded);

        Ok(())
    }

    #[test]
    fn test_agent_spawn_fixture() -> Result<()> {
        use crate::protocol::{AgentSpawn, ClientMessage, ClientMessagePayload};
        use uuid::Uuid;

        let msg = ClientMessage::new(ClientMessagePayload::AgentSpawn(AgentSpawn {
            worktree_id: Uuid::new_v4(),
            agent_type: "coder".to_string(),
        }));

        let path = write_fixture("AgentSpawn", &msg)?;
        assert!(path.exists());
        assert!(path.ends_with("test-fixtures/AgentSpawn.msgpack"));

        let bytes = std::fs::read(&path)?;
        let decoded: ClientMessage = rmp_serde::from_slice(&bytes)?;
        assert_eq!(msg, decoded);

        Ok(())
    }

    #[test]
    fn test_agent_send_fixture() -> Result<()> {
        use crate::protocol::{AgentSend, ClientMessage, ClientMessagePayload};
        use uuid::Uuid;

        let msg = ClientMessage::new(ClientMessagePayload::AgentSend(AgentSend {
            worktree_id: Uuid::new_v4(),
            message: "Hello, agent!".to_string(),
        }));

        let path = write_fixture("AgentSend", &msg)?;
        assert!(path.exists());
        assert!(path.ends_with("test-fixtures/AgentSend.msgpack"));

        let bytes = std::fs::read(&path)?;
        let decoded: ClientMessage = rmp_serde::from_slice(&bytes)?;
        assert_eq!(msg, decoded);

        Ok(())
    }

    #[test]
    fn test_agent_cancel_fixture() -> Result<()> {
        use crate::protocol::{AgentCancel, ClientMessage, ClientMessagePayload};
        use uuid::Uuid;

        let msg = ClientMessage::new(ClientMessagePayload::AgentCancel(AgentCancel {
            worktree_id: Uuid::new_v4(),
        }));

        let path = write_fixture("AgentCancel", &msg)?;
        assert!(path.exists());
        assert!(path.ends_with("test-fixtures/AgentCancel.msgpack"));

        let bytes = std::fs::read(&path)?;
        let decoded: ClientMessage = rmp_serde::from_slice(&bytes)?;
        assert_eq!(msg, decoded);

        Ok(())
    }

    #[test]
    fn test_worktree_delete_fixture() -> Result<()> {
        use crate::protocol::{ClientMessage, ClientMessagePayload, WorktreeDelete};
        use uuid::Uuid;

        let msg = ClientMessage::new(ClientMessagePayload::WorktreeDelete(WorktreeDelete {
            worktree_id: Uuid::new_v4(),
        }));

        let path = write_fixture("WorktreeDelete", &msg)?;
        assert!(path.exists());
        assert!(path.ends_with("test-fixtures/WorktreeDelete.msgpack"));

        let bytes = std::fs::read(&path)?;
        let decoded: ClientMessage = rmp_serde::from_slice(&bytes)?;
        assert_eq!(msg, decoded);

        Ok(())
    }

    #[test]
    fn test_worktree_list_fixture() -> Result<()> {
        use crate::protocol::{ClientMessage, ClientMessagePayload, WorktreeList};
        use uuid::Uuid;

        let msg = ClientMessage::new(ClientMessagePayload::WorktreeList(WorktreeList {
            workspace_id: Uuid::new_v4(),
        }));

        let path = write_fixture("WorktreeList", &msg)?;
        assert!(path.exists());
        assert!(path.ends_with("test-fixtures/WorktreeList.msgpack"));

        let bytes = std::fs::read(&path)?;
        let decoded: ClientMessage = rmp_serde::from_slice(&bytes)?;
        assert_eq!(msg, decoded);

        Ok(())
    }

    #[test]
    fn test_worktree_merge_fixture() -> Result<()> {
        use crate::protocol::{ClientMessage, ClientMessagePayload, WorktreeMerge};
        use uuid::Uuid;

        let msg = ClientMessage::new(ClientMessagePayload::WorktreeMerge(WorktreeMerge {
            worktree_id: Uuid::new_v4(),
            squash: true,
            delete_after: false,
        }));

        let path = write_fixture("WorktreeMerge", &msg)?;
        assert!(path.exists());
        assert!(path.ends_with("test-fixtures/WorktreeMerge.msgpack"));

        let bytes = std::fs::read(&path)?;
        let decoded: ClientMessage = rmp_serde::from_slice(&bytes)?;
        assert_eq!(msg, decoded);

        Ok(())
    }

    #[test]
    fn test_agent_output_fixture() -> Result<()> {
        use crate::protocol::{AgentOutput, ServerMessage, ServerMessagePayload};
        use uuid::Uuid;

        let msg = ServerMessage::new(ServerMessagePayload::AgentOutput(AgentOutput {
            worktree_id: Uuid::new_v4(),
            output: "Agent output text".to_string(),
        }));

        let path = write_fixture("AgentOutput", &msg)?;
        assert!(path.exists());
        assert!(path.ends_with("test-fixtures/AgentOutput.msgpack"));

        let bytes = std::fs::read(&path)?;
        let decoded: ServerMessage = rmp_serde::from_slice(&bytes)?;
        assert_eq!(msg, decoded);

        Ok(())
    }

    #[test]
    fn test_agent_prompt_fixture() -> Result<()> {
        use crate::protocol::{AgentPrompt, ServerMessage, ServerMessagePayload};
        use uuid::Uuid;

        let msg = ServerMessage::new(ServerMessagePayload::AgentPrompt(AgentPrompt {
            worktree_id: Uuid::new_v4(),
            prompt: "What would you like to do?".to_string(),
        }));

        let path = write_fixture("AgentPrompt", &msg)?;
        assert!(path.exists());
        assert!(path.ends_with("test-fixtures/AgentPrompt.msgpack"));

        let bytes = std::fs::read(&path)?;
        let decoded: ServerMessage = rmp_serde::from_slice(&bytes)?;
        assert_eq!(msg, decoded);

        Ok(())
    }

    #[test]
    fn test_terminal_input_fixture() -> Result<()> {
        use crate::protocol::{ClientMessage, ClientMessagePayload, TerminalInput};
        use uuid::Uuid;

        let msg = ClientMessage::new(ClientMessagePayload::TerminalInput(TerminalInput {
            session_id: Uuid::new_v4(),
            data: "ls -la\n".to_string(),
        }));

        let path = write_fixture("TerminalInput", &msg)?;
        assert!(path.exists());
        assert!(path.ends_with("test-fixtures/TerminalInput.msgpack"));

        let bytes = std::fs::read(&path)?;
        let decoded: ClientMessage = rmp_serde::from_slice(&bytes)?;
        assert_eq!(msg, decoded);

        Ok(())
    }

    #[test]
    fn test_terminal_create_fixture() -> Result<()> {
        use crate::protocol::{ClientMessage, ClientMessagePayload, TerminalCreate};
        use uuid::Uuid;

        let msg = ClientMessage::new(ClientMessagePayload::TerminalCreate(TerminalCreate {
            worktree_id: Uuid::new_v4(),
            label: Some("main-terminal".to_string()),
            shell: Some("/bin/bash".to_string()),
        }));

        let path = write_fixture("TerminalCreate", &msg)?;
        assert!(path.exists());
        assert!(path.ends_with("test-fixtures/TerminalCreate.msgpack"));

        let bytes = std::fs::read(&path)?;
        let decoded: ClientMessage = rmp_serde::from_slice(&bytes)?;
        assert_eq!(msg, decoded);

        Ok(())
    }

    #[test]
    fn test_terminal_output_fixture() -> Result<()> {
        use crate::protocol::{ServerMessage, ServerMessagePayload, TerminalOutput};
        use uuid::Uuid;

        let msg = ServerMessage::new(ServerMessagePayload::TerminalOutput(TerminalOutput {
            session_id: Uuid::new_v4(),
            data: "Hello, terminal!\n".to_string(),
        }));

        let path = write_fixture("TerminalOutput", &msg)?;
        assert!(path.exists());
        assert!(path.ends_with("test-fixtures/TerminalOutput.msgpack"));

        let bytes = std::fs::read(&path)?;
        let decoded: ServerMessage = rmp_serde::from_slice(&bytes)?;
        assert_eq!(msg, decoded);

        Ok(())
    }

    #[test]
    fn test_terminal_resize_fixture() -> Result<()> {
        use crate::protocol::{ClientMessage, ClientMessagePayload, TerminalResize};
        use uuid::Uuid;

        let msg = ClientMessage::new(ClientMessagePayload::TerminalResize(TerminalResize {
            session_id: Uuid::new_v4(),
            cols: 120,
            rows: 40,
        }));

        let path = write_fixture("TerminalResize", &msg)?;
        assert!(path.exists());
        assert!(path.ends_with("test-fixtures/TerminalResize.msgpack"));

        let bytes = std::fs::read(&path)?;
        let decoded: ClientMessage = rmp_serde::from_slice(&bytes)?;
        assert_eq!(msg, decoded);

        Ok(())
    }

    #[test]
    fn test_terminal_kill_fixture() -> Result<()> {
        use crate::protocol::{ClientMessage, ClientMessagePayload, TerminalKill};
        use uuid::Uuid;

        let msg = ClientMessage::new(ClientMessagePayload::TerminalKill(TerminalKill {
            session_id: Uuid::new_v4(),
        }));

        let path = write_fixture("TerminalKill", &msg)?;
        assert!(path.exists());
        assert!(path.ends_with("test-fixtures/TerminalKill.msgpack"));

        let bytes = std::fs::read(&path)?;
        let decoded: ClientMessage = rmp_serde::from_slice(&bytes)?;
        assert_eq!(msg, decoded);

        Ok(())
    }

    #[test]
    fn test_terminal_created_fixture() -> Result<()> {
        use crate::protocol::{ServerMessage, ServerMessagePayload, TerminalCreated};
        use uuid::Uuid;

        let msg = ServerMessage::new(ServerMessagePayload::TerminalCreated(TerminalCreated {
            session_id: Uuid::new_v4(),
            worktree_id: Uuid::new_v4(),
            label: Some("bash".to_string()),
            shell: "/bin/bash".to_string(),
        }));

        let path = write_fixture("TerminalCreated", &msg)?;
        assert!(path.exists());
        assert!(path.ends_with("test-fixtures/TerminalCreated.msgpack"));

        let bytes = std::fs::read(&path)?;
        let decoded: ServerMessage = rmp_serde::from_slice(&bytes)?;
        assert_eq!(msg, decoded);

        Ok(())
    }

    #[test]
    fn test_agent_status_update_fixture() -> Result<()> {
        use crate::protocol::{
            AgentStatus, AgentStatusUpdate, ServerMessage, ServerMessagePayload,
        };
        use uuid::Uuid;

        let msg = ServerMessage::new(ServerMessagePayload::AgentStatusUpdate(AgentStatusUpdate {
            id: Uuid::new_v4(),
            worktree_id: Uuid::new_v4(),
            agent_type: "test-agent".to_string(),
            status: AgentStatus::Working,
            started_at: 1234567890,
        }));

        let path = write_fixture("AgentStatusUpdate", &msg)?;
        assert!(path.exists());
        assert!(path.ends_with("test-fixtures/AgentStatusUpdate.msgpack"));

        let bytes = std::fs::read(&path)?;
        let decoded: ServerMessage = rmp_serde::from_slice(&bytes)?;
        assert_eq!(msg, decoded);

        Ok(())
    }

    #[test]
    fn test_file_read_fixture() -> Result<()> {
        use crate::protocol::{ClientMessage, ClientMessagePayload, FileRead};
        use uuid::Uuid;

        let msg = ClientMessage::new(ClientMessagePayload::FileRead(FileRead {
            worktree_id: Uuid::new_v4(),
            path: "src/main.rs".to_string(),
        }));

        let path = write_fixture("FileRead", &msg)?;
        assert!(path.exists());
        assert!(path.ends_with("test-fixtures/FileRead.msgpack"));

        let bytes = std::fs::read(&path)?;
        let decoded: ClientMessage = rmp_serde::from_slice(&bytes)?;
        assert_eq!(msg, decoded);

        Ok(())
    }

    #[test]
    fn test_file_write_fixture() -> Result<()> {
        use crate::protocol::{ClientMessage, ClientMessagePayload, FileWrite};
        use uuid::Uuid;

        let msg = ClientMessage::new(ClientMessagePayload::FileWrite(FileWrite {
            worktree_id: Uuid::new_v4(),
            path: "src/main.rs".to_string(),
            content: "fn main() {}".to_string(),
        }));

        let path = write_fixture("FileWrite", &msg)?;
        assert!(path.exists());
        assert!(path.ends_with("test-fixtures/FileWrite.msgpack"));

        let bytes = std::fs::read(&path)?;
        let decoded: ClientMessage = rmp_serde::from_slice(&bytes)?;
        assert_eq!(msg, decoded);

        Ok(())
    }

    #[test]
    fn test_git_status_fixture() -> Result<()> {
        use crate::protocol::{ClientMessage, ClientMessagePayload, GitStatus};
        use uuid::Uuid;

        let msg = ClientMessage::new(ClientMessagePayload::GitStatus(GitStatus {
            worktree_id: Uuid::new_v4(),
        }));

        let path = write_fixture("GitStatus", &msg)?;
        assert!(path.exists());
        assert!(path.ends_with("test-fixtures/GitStatus.msgpack"));

        let bytes = std::fs::read(&path)?;
        let decoded: ClientMessage = rmp_serde::from_slice(&bytes)?;
        assert_eq!(msg, decoded);

        Ok(())
    }

    #[test]
    fn test_file_content_fixture() -> Result<()> {
        use crate::protocol::{FileContent, ServerMessage, ServerMessagePayload};
        use uuid::Uuid;

        let msg = ServerMessage::new(ServerMessagePayload::FileContent(FileContent {
            worktree_id: Uuid::new_v4(),
            path: "src/main.rs".to_string(),
            content: "fn main() {}".to_string(),
        }));

        let path = write_fixture("FileContent", &msg)?;
        assert!(path.exists());
        assert!(path.ends_with("test-fixtures/FileContent.msgpack"));

        let bytes = std::fs::read(&path)?;
        let decoded: ServerMessage = rmp_serde::from_slice(&bytes)?;
        assert_eq!(msg, decoded);

        Ok(())
    }

    #[test]
    fn test_git_diff_fixture() -> Result<()> {
        use crate::protocol::{ClientMessage, ClientMessagePayload, GitDiff};
        use uuid::Uuid;

        let msg = ClientMessage::new(ClientMessagePayload::GitDiff(GitDiff {
            worktree_id: Uuid::new_v4(),
            file_path: Some("src/main.rs".to_string()),
        }));

        let path = write_fixture("GitDiff", &msg)?;
        assert!(path.exists());
        assert!(path.ends_with("test-fixtures/GitDiff.msgpack"));

        let bytes = std::fs::read(&path)?;
        let decoded: ClientMessage = rmp_serde::from_slice(&bytes)?;
        assert_eq!(msg, decoded);

        Ok(())
    }

    #[test]
    fn test_git_commit_fixture() -> Result<()> {
        use crate::protocol::{ClientMessage, ClientMessagePayload, GitCommit};
        use uuid::Uuid;

        let msg = ClientMessage::new(ClientMessagePayload::GitCommit(GitCommit {
            worktree_id: Uuid::new_v4(),
            message: "feat: add new feature".to_string(),
            files: Some(vec!["src/main.rs".to_string(), "src/lib.rs".to_string()]),
        }));

        let path = write_fixture("GitCommit", &msg)?;
        assert!(path.exists());
        assert!(path.ends_with("test-fixtures/GitCommit.msgpack"));

        let bytes = std::fs::read(&path)?;
        let decoded: ClientMessage = rmp_serde::from_slice(&bytes)?;
        assert_eq!(msg, decoded);

        Ok(())
    }

    #[test]
    fn test_git_diff_result_fixture() -> Result<()> {
        use crate::protocol::{GitDiffResult, ServerMessage, ServerMessagePayload};
        use uuid::Uuid;

        let msg = ServerMessage::new(ServerMessagePayload::GitDiffResult(GitDiffResult {
            worktree_id: Uuid::new_v4(),
            file_path: Some("src/main.rs".to_string()),
            diff: "--- a/src/main.rs\n+++ b/src/main.rs\n@@ -1,3 +1,4 @@\n fn main() {\n+    println!(\"Hello, world!\");\n }\n".to_string(),
        }));

        let path = write_fixture("GitDiffResult", &msg)?;
        assert!(path.exists());
        assert!(path.ends_with("test-fixtures/GitDiffResult.msgpack"));

        let bytes = std::fs::read(&path)?;
        let decoded: ServerMessage = rmp_serde::from_slice(&bytes)?;
        assert_eq!(msg, decoded);

        Ok(())
    }

    #[test]
    fn test_create_pr_fixture() -> Result<()> {
        use crate::protocol::{ClientMessage, ClientMessagePayload, CreatePR};
        use uuid::Uuid;

        let msg = ClientMessage::new(ClientMessagePayload::CreatePR(CreatePR {
            worktree_id: Uuid::new_v4(),
            title: "Add new feature".to_string(),
            body: Some("This PR adds a new feature".to_string()),
        }));

        let path = write_fixture("CreatePR", &msg)?;
        assert!(path.exists());
        assert!(path.ends_with("test-fixtures/CreatePR.msgpack"));

        let bytes = std::fs::read(&path)?;
        let decoded: ClientMessage = rmp_serde::from_slice(&bytes)?;
        assert_eq!(msg, decoded);

        Ok(())
    }

    #[test]
    fn test_git_status_result_fixture() -> Result<()> {
        use crate::protocol::{
            GitStatusEntry, GitStatusResult, ServerMessage, ServerMessagePayload,
        };
        use uuid::Uuid;

        let msg = ServerMessage::new(ServerMessagePayload::GitStatusResult(GitStatusResult {
            worktree_id: Uuid::new_v4(),
            entries: vec![
                GitStatusEntry {
                    path: "src/main.rs".to_string(),
                    status_code: " M".to_string(),
                },
                GitStatusEntry {
                    path: "src/lib.rs".to_string(),
                    status_code: "A ".to_string(),
                },
            ],
        }));

        let path = write_fixture("GitStatusResult", &msg)?;
        assert!(path.exists());
        assert!(path.ends_with("test-fixtures/GitStatusResult.msgpack"));

        let bytes = std::fs::read(&path)?;
        let decoded: ServerMessage = rmp_serde::from_slice(&bytes)?;
        assert_eq!(msg, decoded);

        Ok(())
    }

    #[test]
    fn test_state_snapshot_fixture() -> Result<()> {
        use crate::protocol::{
            AgentSessionData, AgentStatus, ServerMessage, ServerMessagePayload, SettingData,
            StateSnapshot, TerminalSessionData, WorkspaceData, WorktreeData,
        };
        use uuid::Uuid;

        let workspace_id = Uuid::new_v4();
        let worktree_id = Uuid::new_v4();
        let agent_session_id = Uuid::new_v4();
        let terminal_session_id = Uuid::new_v4();

        let msg = ServerMessage::new(ServerMessagePayload::StateSnapshot(StateSnapshot {
            request_id: Uuid::new_v4(),
            workspaces: vec![WorkspaceData {
                id: workspace_id,
                name: "test-workspace".to_string(),
                root_path: "/path/to/workspace".to_string(),
                color: Some("#ff0000".to_string()),
                icon: Some("folder".to_string()),
                worktree_base_dir: Some(".worktrees".to_string()),
                settings: Some("{\"theme\":\"dark\"}".to_string()),
                created_at: 1234567890,
                updated_at: 1234567900,
            }],
            worktrees: vec![WorktreeData {
                id: worktree_id,
                workspace_id,
                branch_name: "main".to_string(),
                path: "/path/to/worktree".to_string(),
                status: "active".to_string(),
                created_at: 1234567890,
                is_main: true,
                git_stats: None,
            }],
            agent_sessions: vec![AgentSessionData {
                id: agent_session_id,
                worktree_id,
                agent_type: "coder".to_string(),
                acp_session_id: Some("acp-123".to_string()),
                status: AgentStatus::Working,
                started_at: 1234567890,
            }],
            terminal_sessions: vec![TerminalSessionData {
                id: terminal_session_id,
                worktree_id,
                label: Some("bash".to_string()),
                shell: "/bin/bash".to_string(),
                created_at: 1234567890,
            }],
            settings: vec![SettingData {
                key: "theme".to_string(),
                value: "dark".to_string(),
            }],
        }));

        let path = write_fixture("StateSnapshot", &msg)?;
        assert!(path.exists());
        assert!(path.ends_with("test-fixtures/StateSnapshot.msgpack"));

        let bytes = std::fs::read(&path)?;
        let decoded: ServerMessage = rmp_serde::from_slice(&bytes)?;
        assert_eq!(msg, decoded);

        Ok(())
    }

    #[test]
    fn test_update_settings_fixture() -> Result<()> {
        use crate::protocol::{ClientMessage, ClientMessagePayload, UpdateSettings};

        let msg = ClientMessage::new(ClientMessagePayload::UpdateSettings(UpdateSettings {
            key: "theme".to_string(),
            value: "dark".to_string(),
        }));

        let path = write_fixture("UpdateSettings", &msg)?;
        assert!(path.exists());
        assert!(path.ends_with("test-fixtures/UpdateSettings.msgpack"));

        let bytes = std::fs::read(&path)?;
        let decoded: ClientMessage = rmp_serde::from_slice(&bytes)?;
        assert_eq!(msg, decoded);

        Ok(())
    }

    #[test]
    fn test_pong_fixture() -> Result<()> {
        use crate::protocol::{Pong, ServerMessage, ServerMessagePayload};

        let msg = ServerMessage::new(ServerMessagePayload::Pong(Pong { timestamp: 12345 }));

        let path = write_fixture("Pong", &msg)?;
        assert!(path.exists());
        assert!(path.ends_with("test-fixtures/Pong.msgpack"));

        let bytes = std::fs::read(&path)?;
        let decoded: ServerMessage = rmp_serde::from_slice(&bytes)?;
        assert_eq!(msg, decoded);

        Ok(())
    }

    #[test]
    fn test_ping_fixture() -> Result<()> {
        use crate::protocol::{ClientMessage, ClientMessagePayload, Ping};

        let msg = ClientMessage::new(ClientMessagePayload::Ping(Ping { timestamp: 12345 }));

        let path = write_fixture("Ping", &msg)?;
        assert!(path.exists());
        assert!(path.ends_with("test-fixtures/Ping.msgpack"));

        let bytes = std::fs::read(&path)?;
        let decoded: ClientMessage = rmp_serde::from_slice(&bytes)?;
        assert_eq!(msg, decoded);

        Ok(())
    }

    #[test]
    fn test_get_state_fixture() -> Result<()> {
        use crate::protocol::{ClientMessage, ClientMessagePayload, GetState};
        use uuid::Uuid;

        let msg = ClientMessage::new(ClientMessagePayload::GetState(GetState {
            request_id: Uuid::new_v4(),
        }));

        let path = write_fixture("GetState", &msg)?;
        assert!(path.exists());
        assert!(path.ends_with("test-fixtures/GetState.msgpack"));

        let bytes = std::fs::read(&path)?;
        let decoded: ClientMessage = rmp_serde::from_slice(&bytes)?;
        assert_eq!(msg, decoded);

        Ok(())
    }

    #[test]
    fn test_ack_fixture() -> Result<()> {
        use crate::protocol::{Ack, AckStatus, ClientMessage, ClientMessagePayload};
        use uuid::Uuid;

        let msg = ClientMessage::new(ClientMessagePayload::Ack(Ack {
            message_id: Uuid::new_v4(),
            status: AckStatus::Success,
        }));

        let path = write_fixture("Ack", &msg)?;
        assert!(path.exists());
        assert!(path.ends_with("test-fixtures/Ack.msgpack"));

        let bytes = std::fs::read(&path)?;
        let decoded: ClientMessage = rmp_serde::from_slice(&bytes)?;
        assert_eq!(msg, decoded);

        Ok(())
    }

    #[test]
    fn test_ack_error_fixture() -> Result<()> {
        use crate::protocol::{Ack, AckStatus, ClientMessage, ClientMessagePayload};
        use uuid::Uuid;

        let msg = ClientMessage::new(ClientMessagePayload::Ack(Ack {
            message_id: Uuid::new_v4(),
            status: AckStatus::Error("Something went wrong".to_string()),
        }));

        let path = write_fixture("AckError", &msg)?;
        assert!(path.exists());
        assert!(path.ends_with("test-fixtures/AckError.msgpack"));

        let bytes = std::fs::read(&path)?;
        let decoded: ClientMessage = rmp_serde::from_slice(&bytes)?;
        assert_eq!(msg, decoded);

        Ok(())
    }

    #[test]
    fn test_notification_fixture() -> Result<()> {
        use crate::protocol::{
            Notification, NotificationLevel, ServerMessage, ServerMessagePayload,
        };

        let msg = ServerMessage::new(ServerMessagePayload::Notification(Notification {
            level: NotificationLevel::Info,
            title: "Test Notification".to_string(),
            message: "This is a test notification".to_string(),
        }));

        let path = write_fixture("Notification", &msg)?;
        assert!(path.exists());
        assert!(path.ends_with("test-fixtures/Notification.msgpack"));

        let bytes = std::fs::read(&path)?;
        let decoded: ServerMessage = rmp_serde::from_slice(&bytes)?;
        assert_eq!(msg, decoded);

        Ok(())
    }

    #[test]
    fn test_workspace_created_fixture() -> Result<()> {
        use crate::protocol::{
            ServerMessage, ServerMessagePayload, WorkspaceCreated, WorkspaceData,
        };
        use uuid::Uuid;

        let msg = ServerMessage::new(ServerMessagePayload::WorkspaceCreated(WorkspaceCreated {
            workspace: WorkspaceData {
                id: Uuid::new_v4(),
                name: "test-workspace".to_string(),
                root_path: "/path/to/workspace".to_string(),
                color: Some("#ff0000".to_string()),
                icon: Some("folder".to_string()),
                worktree_base_dir: Some(".worktrees".to_string()),
                settings: Some(r#"{"theme":"dark"}"#.to_string()),
                created_at: 1234567890,
                updated_at: 1234567900,
            },
        }));

        let path = write_fixture("WorkspaceCreated", &msg)?;
        assert!(path.exists());
        assert!(path.ends_with("test-fixtures/WorkspaceCreated.msgpack"));

        let bytes = std::fs::read(&path)?;
        let decoded: ServerMessage = rmp_serde::from_slice(&bytes)?;
        assert_eq!(msg, decoded);

        Ok(())
    }

    #[test]
    fn test_workspace_deleted_fixture() -> Result<()> {
        use crate::protocol::{ServerMessage, ServerMessagePayload, WorkspaceDeleted};
        use uuid::Uuid;

        let msg = ServerMessage::new(ServerMessagePayload::WorkspaceDeleted(WorkspaceDeleted {
            workspace_id: Uuid::new_v4(),
        }));

        let path = write_fixture("WorkspaceDeleted", &msg)?;
        assert!(path.exists());
        assert!(path.ends_with("test-fixtures/WorkspaceDeleted.msgpack"));

        let bytes = std::fs::read(&path)?;
        let decoded: ServerMessage = rmp_serde::from_slice(&bytes)?;
        assert_eq!(msg, decoded);

        Ok(())
    }

    #[test]
    fn test_workspace_updated_fixture() -> Result<()> {
        use crate::protocol::{
            ServerMessage, ServerMessagePayload, WorkspaceData, WorkspaceUpdated,
        };
        use uuid::Uuid;

        let msg = ServerMessage::new(ServerMessagePayload::WorkspaceUpdated(WorkspaceUpdated {
            workspace: WorkspaceData {
                id: Uuid::new_v4(),
                name: "test-workspace".to_string(),
                root_path: "/path/to/workspace".to_string(),
                color: Some("#00ff00".to_string()),
                icon: Some("briefcase".to_string()),
                worktree_base_dir: Some(".worktrees".to_string()),
                settings: Some(r#"{"theme":"light"}"#.to_string()),
                created_at: 1234567890,
                updated_at: 1234567999,
            },
        }));

        let path = write_fixture("WorkspaceUpdated", &msg)?;
        assert!(path.exists());
        assert!(path.ends_with("test-fixtures/WorkspaceUpdated.msgpack"));

        let bytes = std::fs::read(&path)?;
        let decoded: ServerMessage = rmp_serde::from_slice(&bytes)?;
        assert_eq!(msg, decoded);

        Ok(())
    }

    #[test]
    fn test_worktree_deleted_fixture() -> Result<()> {
        use crate::protocol::{ServerMessage, ServerMessagePayload, WorktreeDeleted};
        use uuid::Uuid;

        let msg = ServerMessage::new(ServerMessagePayload::WorktreeDeleted(WorktreeDeleted {
            worktree_id: Uuid::new_v4(),
        }));

        let path = write_fixture("WorktreeDeleted", &msg)?;
        assert!(path.exists());
        assert!(path.ends_with("test-fixtures/WorktreeDeleted.msgpack"));

        let bytes = std::fs::read(&path)?;
        let decoded: ServerMessage = rmp_serde::from_slice(&bytes)?;
        assert_eq!(msg, decoded);

        Ok(())
    }

    #[test]
    fn test_worktree_created_fixture() -> Result<()> {
        use crate::protocol::{ServerMessage, ServerMessagePayload, WorktreeCreated, WorktreeData};
        use uuid::Uuid;

        let workspace_id = Uuid::new_v4();
        let worktree_id = Uuid::new_v4();

        let msg = ServerMessage::new(ServerMessagePayload::WorktreeCreated(WorktreeCreated {
            worktree: WorktreeData {
                id: worktree_id,
                workspace_id,
                branch_name: "main".to_string(),
                path: "/path/to/worktree".to_string(),
                status: "active".to_string(),
                created_at: 1234567890,
                is_main: true,
                git_stats: None,
            },
        }));

        let path = write_fixture("WorktreeCreated", &msg)?;
        assert!(path.exists());
        assert!(path.ends_with("test-fixtures/WorktreeCreated.msgpack"));

        let bytes = std::fs::read(&path)?;
        let decoded: ServerMessage = rmp_serde::from_slice(&bytes)?;
        assert_eq!(msg, decoded);

        Ok(())
    }
}
