mod commands;
mod tray;

use tauri::Manager;

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            tray::setup_tray(app)?;
            
            let window = app.get_webview_window("main").expect("main window not found");
            let app_handle = app.app_handle().clone();
            
            window.on_window_event(move |event| {
                if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                    api.prevent_close();
                    if let Some(win) = app_handle.get_webview_window("main") {
                        let _ = win.hide();
                    }
                }
            });
            
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::reveal_in_file_manager,
            commands::copy_to_clipboard,
            commands::show_notification,
            commands::pick_directory,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}