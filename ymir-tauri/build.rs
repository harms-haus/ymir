fn main() {
    tauri_build::try_build(
        tauri_build::Attributes::new().app_manifest(
            tauri_build::AppManifest::new().commands(
                [
                    "get_platform_info",
                    "kill_all_sessions",
                    "exit_app",
                    "get_app_cwd",
                ]
                .as_slice(),
            ),
        ),
    )
    .expect("failed to run tauri-build");
}
