//! Tests for `handle_file_list` in the router module.
//!
//! These tests verify:
//! 1. Returns `FILE_LIST_ERROR` for a worktree pointing to a non-existent path
//! 2. Returns `WORKTREE_NOT_FOUND` for an unknown worktree ID
//! 3. Returns `FileListResult` with expected files for a valid temp directory

use crate::protocol::{
    ClientMessage, ClientMessagePayload, FileList, ServerMessage, ServerMessagePayload,
};
use crate::router::route_message;
use crate::state::{AppState, WorktreeState};
use std::sync::Arc;
use uuid::Uuid;

/// Helper: create a minimal test AppState with no worktrees.
async fn make_empty_state() -> Arc<AppState> {
    AppState::new_test().await
}

/// Helper: register a worktree in the given state.
async fn register_worktree(
    state: &Arc<AppState>,
    id: Uuid,
    workspace_id: Uuid,
    branch: &str,
    path: &str,
    is_main: bool,
) {
    let mut worktrees = state.worktrees.write().await;
    worktrees.insert(
        id,
        WorktreeState {
            id,
            workspace_id,
            branch_name: branch.to_string(),
            path: path.to_string(),
            status: "active".to_string(),
            is_main,
        },
    );
}

/// Helper: send a FileList message through the router and return the response.
async fn send_file_list(
    state: Arc<AppState>,
    worktree_id: Uuid,
    path: Option<String>,
) -> ServerMessage {
    let msg = ClientMessage::new(ClientMessagePayload::FileList(FileList {
        worktree_id,
        path,
    }));
    // route_message returns Option<ServerMessage>; for FileList it always returns Some
    route_message(state, Uuid::new_v4(), msg)
        .await
        .expect("FileList should always return a response")
}

#[tokio::test]
async fn test_file_list_unknown_worktree_returns_error() {
    let state = make_empty_state().await;
    let unknown_id = Uuid::new_v4();

    let response = send_file_list(state, unknown_id, None).await;

    match response.payload {
        ServerMessagePayload::Error(err) => {
            assert_eq!(err.code, "WORKTREE_NOT_FOUND");
            assert!(err.message.contains(&unknown_id.to_string()));
        }
        other => panic!("Expected Error, got: {:?}", other),
    }
}

#[tokio::test]
async fn test_file_list_nonexistent_path_returns_file_list_error() {
    let state = make_empty_state().await;
    let worktree_id = Uuid::new_v4();
    let workspace_id = Uuid::new_v4();

    // Register a worktree pointing to a non-existent path
    register_worktree(
        &state,
        worktree_id,
        workspace_id,
        "test-branch",
        "/tmp/nonexistent-path-xyz-12345",
        false,
    )
    .await;

    let response = send_file_list(state, worktree_id, None).await;

    match response.payload {
        ServerMessagePayload::Error(err) => {
            assert_eq!(err.code, "FILE_LIST_ERROR");
            assert!(err.message.contains("Failed to list directory"));
        }
        other => panic!("Expected Error with FILE_LIST_ERROR, got: {:?}", other),
    }
}

#[tokio::test]
async fn test_file_list_valid_path_returns_files() {
    let state = make_empty_state().await;
    let worktree_id = Uuid::new_v4();
    let workspace_id = Uuid::new_v4();

    // Create a temp directory with some files
    let temp_dir = tempfile::tempdir().expect("Failed to create temp dir");
    let file1 = temp_dir.path().join("alpha.txt");
    let file2 = temp_dir.path().join("beta.rs");
    let subdir = temp_dir.path().join("subdir");
    std::fs::write(&file1, "hello").expect("Failed to write file1");
    std::fs::write(&file2, "fn main() {}").expect("Failed to write file2");
    std::fs::create_dir(&subdir).expect("Failed to create subdir");

    register_worktree(
        &state,
        worktree_id,
        workspace_id,
        "test-branch",
        temp_dir.path().to_str().unwrap(),
        false,
    )
    .await;

    let response = send_file_list(state, worktree_id, None).await;

    match response.payload {
        ServerMessagePayload::FileListResult(result) => {
            assert_eq!(result.worktree_id, worktree_id);
            assert_eq!(result.path, None);
            // Files should be sorted: alpha.txt, beta.rs, subdir/
            assert_eq!(result.files.len(), 3);
            assert!(result.files.contains(&"alpha.txt".to_string()));
            assert!(result.files.contains(&"beta.rs".to_string()));
            // Directories get a trailing "/"
            assert!(result.files.contains(&"subdir/".to_string()));
        }
        other => panic!("Expected FileListResult, got: {:?}", other),
    }
}

#[tokio::test]
async fn test_file_list_subdirectory_returns_files() {
    let state = make_empty_state().await;
    let worktree_id = Uuid::new_v4();
    let workspace_id = Uuid::new_v4();

    // Create a temp directory with a subdirectory containing files
    let temp_dir = tempfile::tempdir().expect("Failed to create temp dir");
    let subdir = temp_dir.path().join("src");
    std::fs::create_dir(&subdir).expect("Failed to create subdir");
    std::fs::write(subdir.join("main.rs"), "fn main() {}")
        .expect("Failed to write main.rs");
    std::fs::write(subdir.join("lib.rs"), "pub fn hello() {}")
        .expect("Failed to write lib.rs");

    register_worktree(
        &state,
        worktree_id,
        workspace_id,
        "test-branch",
        temp_dir.path().to_str().unwrap(),
        false,
    )
    .await;

    let response =
        send_file_list(state, worktree_id, Some("src".to_string())).await;

    match response.payload {
        ServerMessagePayload::FileListResult(result) => {
            assert_eq!(result.worktree_id, worktree_id);
            assert_eq!(result.path, Some("src".to_string()));
            assert_eq!(result.files.len(), 2);
            assert!(result.files.contains(&"lib.rs".to_string()));
            assert!(result.files.contains(&"main.rs".to_string()));
        }
        other => panic!("Expected FileListResult, got: {:?}", other),
    }
}

#[tokio::test]
async fn test_file_list_subdirectory_not_found_returns_error() {
    let state = make_empty_state().await;
    let worktree_id = Uuid::new_v4();
    let workspace_id = Uuid::new_v4();

    // Create a temp directory WITHOUT a subdirectory called "nonexistent"
    let temp_dir = tempfile::tempdir().expect("Failed to create temp dir");
    std::fs::write(temp_dir.path().join("readme.md"), "# readme")
        .expect("Failed to write readme");

    register_worktree(
        &state,
        worktree_id,
        workspace_id,
        "test-branch",
        temp_dir.path().to_str().unwrap(),
        false,
    )
    .await;

    let response =
        send_file_list(state, worktree_id, Some("nonexistent".to_string()))
            .await;

    match response.payload {
        ServerMessagePayload::Error(err) => {
            assert_eq!(err.code, "FILE_LIST_ERROR");
            assert!(err.message.contains("nonexistent"));
        }
        other => panic!("Expected Error with FILE_LIST_ERROR, got: {:?}", other),
    }
}

#[tokio::test]
async fn test_file_list_empty_directory_returns_empty_result() {
    let state = make_empty_state().await;
    let worktree_id = Uuid::new_v4();
    let workspace_id = Uuid::new_v4();

    let temp_dir = tempfile::tempdir().expect("Failed to create temp dir");

    register_worktree(
        &state,
        worktree_id,
        workspace_id,
        "test-branch",
        temp_dir.path().to_str().unwrap(),
        false,
    )
    .await;

    let response = send_file_list(state, worktree_id, None).await;

    match response.payload {
        ServerMessagePayload::FileListResult(result) => {
            assert!(result.files.is_empty());
        }
        other => panic!("Expected FileListResult, got: {:?}", other),
    }
}
