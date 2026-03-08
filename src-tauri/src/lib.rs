mod commands;

mod state;

use state::PtyState;

// Re-export types and commands needed by frontend
pub use commands::{
    attach_pty_channel, close_pane, create_pane_in_workspace, focus_pane, get_pane_cwd,
    is_pty_alive, kill_all_sessions, kill_pty, resize_pty, set_environment_context, spawn_pty,
    write_pty, PtyEvent,
};


#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_notification::init())
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
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
