use tauri::Manager;

mod state;

use state::PtyState;

#[tauri::command]
async fn create_pty(state: tauri::State<'_, PtyState>) -> Result<String, String> {
    // Placeholder for PTY creation - will be implemented in Task 2
    Ok("pty_created".to_string())
}

#[tauri::command]
async fn write_to_pty(state: tauri::State<'_, PtyState>, data: String) -> Result<(), String> {
    // Placeholder for writing to PTY - will be implemented in Task 2
    Ok(())
}

#[tauri::command]
async fn resize_pty(state: tauri::State<'_, PtyState>, cols: u16, rows: u16) -> Result<(), String> {
    // Placeholder for resizing PTY - will be implemented in Task 2
    Ok(())
}

#[tauri::command]
async fn close_pty(state: tauri::State<'_, PtyState>) -> Result<(), String> {
    // Placeholder for closing PTY - will be implemented in Task 2
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .manage(PtyState::default())
        .invoke_handler(tauri::generate_handler![
            create_pty,
            write_to_pty,
            resize_pty,
            close_pty
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
