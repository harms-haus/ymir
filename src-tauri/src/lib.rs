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
mod logging;
mod state;

use state::PtyState;
use tauri::{RunEvent, WindowEvent};

// Re-export types and commands needed by frontend
pub use commands::{
    attach_pty_channel, close_pane, create_pane_in_workspace, exit_app, focus_pane, get_pane_cwd,
    is_pty_alive, kill_all_sessions, kill_pty, resize_pty, set_environment_context, spawn_pty,
    write_pty, PtyEvent,
};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    init_logging();
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .manage(PtyState::default())
        .invoke_handler(tauri::generate_handler![
            // Original commands
            spawn_pty,
            write_pty,
            resize_pty,
            kill_pty,
            // New pane operation commands
            create_pane_in_workspace,
            close_pane,
            focus_pane,
            get_pane_cwd,
            set_environment_context,
            // Session reattach commands
            is_pty_alive,
            attach_pty_channel,
            kill_all_sessions,
            // Exit command
            exit_app,
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
