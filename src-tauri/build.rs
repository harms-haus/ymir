fn main() {
    tauri_build::try_build(
        tauri_build::Attributes::new().app_manifest(
            tauri_build::AppManifest::new().commands(
                [
                    "spawn_pty",
                    "write_pty",
                    "resize_pty",
                    "kill_pty",
                    "is_pty_alive",
                    "get_git_status",
                    "stage_file",
                    "unstage_file",
                    "discard_file_changes",
                    "commit_changes",
                    "get_branches",
                    "create_branch",
                    "delete_branch",
                    "checkout_branch",
                    "discover_git_repos",
                    "get_platform_info",
                ]
                .as_slice(),
            ),
        ),
    )
    .expect("failed to run tauri-build");
}
