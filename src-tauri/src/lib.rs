fn init_logging() {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| tracing_subscriber::EnvFilter::new("info")),
        )
        .with_target(true)
        .init();
}

mod commands;
mod git;
mod logging;
mod platform;
mod state;

use state::PtyState;
use tauri::{RunEvent, WindowEvent};

// Re-export types and commands needed by frontend
pub use commands::{
    attach_pty_channel, checkout_branch, commit_changes, create_branch,
    delete_branch, discard_file_changes, discover_git_repos, exit_app,
    get_app_cwd, get_branches, get_git_status, is_pty_alive,
    kill_all_sessions, kill_pty, resize_pty, spawn_pty, stage_file,
    unstage_file, write_pty, PtyEvent,
};
pub use platform::get_platform_info;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    init_logging();
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .manage(PtyState::default())
        .invoke_handler(tauri::generate_handler![
            spawn_pty,
            write_pty,
            resize_pty,
            kill_pty,
            exit_app,
            get_app_cwd,
            get_git_status,
            stage_file,
            unstage_file,
            discard_file_changes,
            commit_changes,
            get_branches,
            create_branch,
            delete_branch,
            checkout_branch,
            discover_git_repos,
            get_platform_info,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    app.run(|_app_handle, event| match event {
        RunEvent::WindowEvent {
            label,
            event: window_event,
            ..
        } => {
            if label == "main" {
                if let WindowEvent::Destroyed = window_event {
                    tracing::info!("Main window destroyed");
                }
            }
        }
        RunEvent::ExitRequested { .. } => {
            tracing::info!("Exit requested");
        }
        _ => {}
    });
}
