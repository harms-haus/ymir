use tracing::info;

#[tauri::command]
pub async fn kill_all_sessions() -> Result<(), String> {
    info!("Placeholder: kill_all_sessions called");
    Ok(())
}

#[tauri::command]
pub async fn exit_app(app: tauri::AppHandle) {
    info!("Exit requested from frontend");
    // Exit the app - this will close all windows
    app.exit(0);
}

#[tauri::command]
pub fn get_app_cwd() -> Result<String, String> {
    std::env::current_dir()
        .map(|p| p.to_string_lossy().to_string())
        .map_err(|e| format!("Failed to get current directory: {}", e))
}
