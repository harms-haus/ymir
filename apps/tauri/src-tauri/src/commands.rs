//! Tauri IPC commands for native desktop features.

use tauri::AppHandle;
use tauri_plugin_clipboard_manager::ClipboardExt;
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_notification::NotificationExt;

/// Opens the OS file manager and reveals the given path.
///
/// Cross-platform support:
/// - Windows: Opens Explorer and selects the file/folder
/// - macOS: Opens Finder and selects the file/folder
/// - Linux: Opens the default file manager
///
/// # Arguments
/// * `path` - The absolute path to reveal in the file manager
///
/// # Errors
/// Returns an error string if the path cannot be opened
#[tauri::command]
pub async fn reveal_in_file_manager(path: String) -> Result<(), String> {
    open::that(&path).map_err(|e| format!("Failed to open file manager for '{}': {}", path, e))
}

/// Copies text to the system clipboard.
///
/// # Arguments
/// * `app` - Tauri app handle for accessing clipboard plugin
/// * `text` - The text to copy to clipboard
///
/// # Errors
/// Returns an error string if clipboard access fails
#[tauri::command]
pub async fn copy_to_clipboard(app: AppHandle, text: String) -> Result<(), String> {
    app.clipboard()
        .write_text(&text)
        .map_err(|e| format!("Failed to copy to clipboard: {}", e))
}

/// Shows a system notification.
///
/// Automatically requests notification permission if not already granted.
///
/// # Arguments
/// * `app` - Tauri app handle for accessing notification plugin
/// * `title` - Notification title
/// * `body` - Notification body text
///
/// # Errors
/// Returns an error string if notification cannot be shown
#[tauri::command]
pub async fn show_notification(
    app: AppHandle,
    title: String,
    body: String,
) -> Result<(), String> {
    let permission_state = app
        .notification()
        .permission_state()
        .map_err(|e| format!("Failed to check notification permission: {}", e))?;

    if permission_state != tauri_plugin_notification::PermissionState::Granted {
        app.notification()
            .request_permission()
            .map_err(|e| format!("Failed to request notification permission: {}", e))?;
    }

    app.notification()
        .builder()
        .title(&title)
        .body(&body)
        .show()
        .map_err(|e| format!("Failed to show notification: {}", e))
}

/// Opens a native directory picker dialog.
///
/// # Arguments
/// * `app` - Tauri app handle for accessing dialog plugin
///
/// # Returns
/// - `Some(path)` if a directory was selected
/// - `None` if the dialog was cancelled
///
/// # Errors
/// Returns an error string if the dialog fails to open
#[tauri::command]
pub async fn pick_directory(app: AppHandle) -> Result<Option<String>, String> {
    let result = app
        .dialog()
        .file()
        .blocking_pick_folder();

    match result {
        Some(folder) => Ok(Some(folder.to_string())),
        None => Ok(None),
    }
}