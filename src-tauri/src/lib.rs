use portable_pty::{native_pty_system, CommandBuilder, PtySize};
use serde::Serialize;
use std::io::{Read, Write};
use std::sync::Arc;
use tauri::async_runtime;
use tauri::ipc::Channel;
use uuid::Uuid;

mod state;

use state::{PtySession, PtyState};

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase", tag = "event", content = "data")]
pub enum PtyEvent {
    Output { data: String },
    Notification { message: String },
    Exit { code: Option<u32> },
}

/// Parse OSC notification sequences from terminal output
/// Supports OSC 9, OSC 99, and OSC 777 notification protocols
fn parse_notification(line: &str) -> Option<String> {
    // OSC sequences start with ESC ] (0x1b 0x5d) and end with BEL (0x07) or ESC \
    // OSC 9: \x1b]9;message\x07
    // OSC 99: \x1b]99;message\x07
    // OSC 777: \x1b]777;notify;message\x07

    // Check for OSC 9 or OSC 99: ESC ]9; or ESC ]99;
    if let Some(start) = line.find("\x1b]9;") {
        let content = &line[start + 4..];
        if let Some(end) = content.find('\x07') {
            return Some(content[..end].to_string());
        }
    }

    if let Some(start) = line.find("\x1b]99;") {
        let content = &line[start + 5..];
        if let Some(end) = content.find('\x07') {
            return Some(content[..end].to_string());
        }
    }

    // OSC 777: ESC ]777;notify;message BEL
    if let Some(start) = line.find("\x1b]777;notify;") {
        let content = &line[start + 14..];
        if let Some(end) = content.find('\x07') {
            return Some(content[..end].to_string());
        }
    }

    None
}

#[tauri::command]
async fn spawn_pty(
    state: tauri::State<'_, PtyState>,
    on_event: Channel<PtyEvent>,
) -> Result<String, String> {
    let pty_system = native_pty_system();

    let pair = pty_system
        .openpty(PtySize {
            rows: 24,
            cols: 80,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| format!("Failed to open PTY: {}", e))?;

    let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/bash".to_string());
    let cmd = CommandBuilder::new(&shell);

    let child = pair
        .slave
        .spawn_command(cmd)
        .map_err(|e| format!("Failed to spawn shell: {}", e))?;

    let session_id = Uuid::new_v4().to_string();

    // Clone the reader before moving master into the session
    let reader = pair
        .master
        .try_clone_reader()
        .map_err(|e| format!("Failed to clone reader: {}", e))?;

    // Get the master before moving pair into session
    let master = pair.master;

    let session = PtySession {
        master: Arc::new(tokio::sync::Mutex::new(master)),
        child: Arc::new(tokio::sync::Mutex::new(child)),
    };

    state.sessions.insert(session_id.clone(), session);

    // Spawn async task to read PTY output
    let session_id_clone = session_id.clone();
    let state_clone = Arc::new(state.sessions.clone());

    async_runtime::spawn(async move {
        let mut reader = reader;
        let mut buffer = [0u8; 4096];

        loop {
            match reader.read(&mut buffer) {
                Ok(0) => {
                    // EOF - process exited
                    let _ = on_event.send(PtyEvent::Exit { code: None });
                    state_clone.remove(&session_id_clone);
                    break;
                }
                Ok(n) => {
                    let data = String::from_utf8_lossy(&buffer[..n]);
                    let data_str = data.to_string();

                    // Check for notifications in the output
                    if let Some(message) = parse_notification(&data_str) {
                        let _ = on_event.send(PtyEvent::Notification { message });
                    }

                    // Always send the output
                    if on_event.send(PtyEvent::Output { data: data_str }).is_err() {
                        break;
                    }
                }
                Err(_) => {
                    let _ = on_event.send(PtyEvent::Exit { code: None });
                    state_clone.remove(&session_id_clone);
                    break;
                }
            }
        }
    });

    Ok(session_id)
}

#[tauri::command]
async fn write_pty(
    state: tauri::State<'_, PtyState>,
    session_id: String,
    data: String,
) -> Result<(), String> {
    if let Some(session) = state.sessions.get(&session_id) {
        let mut writer = session
            .master
            .lock()
            .await
            .take_writer()
            .map_err(|e| format!("Failed to get PTY writer: {}", e))?;
        writer
            .write_all(data.as_bytes())
            .map_err(|e| format!("Failed to write to PTY: {}", e))?;
        writer
            .flush()
            .map_err(|e| format!("Failed to flush PTY: {}", e))?;
        Ok(())
    } else {
        Err("Session not found".to_string())
    }
}

#[tauri::command]
async fn resize_pty(
    state: tauri::State<'_, PtyState>,
    session_id: String,
    cols: u16,
    rows: u16,
) -> Result<(), String> {
    if let Some(session) = state.sessions.get(&session_id) {
        session
            .master
            .lock()
            .await
            .resize(PtySize {
                rows,
                cols,
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(|e| format!("Failed to resize PTY: {}", e))?;
        Ok(())
    } else {
        Err("Session not found".to_string())
    }
}

#[tauri::command]
async fn kill_pty(
    state: tauri::State<'_, PtyState>,
    session_id: String,
) -> Result<(), String> {
    if let Some((_, session)) = state.sessions.remove(&session_id) {
        let _ = session.child.lock().await.kill();
        Ok(())
    } else {
        Err("Session not found".to_string())
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .manage(PtyState::default())
        .invoke_handler(tauri::generate_handler![
            spawn_pty,
            write_pty,
            resize_pty,
            kill_pty
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
