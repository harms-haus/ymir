use crate::state::{PtySession, PtyState};
use portable_pty::{native_pty_system, CommandBuilder, PtySize};
use serde::Serialize;
use std::io::{Read, Write};
use std::sync::Arc;
use tauri::async_runtime;
use tauri::ipc::Channel;
use uuid::Uuid;

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
pub async fn spawn_pty(
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

    // Clone reader before taking writer
    let reader = pair
        .master
        .try_clone_reader()
        .map_err(|e| format!("Failed to clone reader: {}", e))?;

    // Take the writer
    let writer = pair
        .master
        .take_writer()
        .map_err(|e| format!("Failed to take PTY writer: {}", e))?;

    let master = pair.master;

    let session = PtySession {
        master: Arc::new(tokio::sync::Mutex::new(master)),
        writer: Arc::new(tokio::sync::Mutex::new(writer)),
        child: Arc::new(tokio::sync::Mutex::new(child)),
        workspace_id: None,
        pane_id: None,
    };

    state.sessions.insert(session_id.clone(), session);

    // Spawn async task to read PTY output
    let session_id_clone = session_id.clone();
    let state_clone = Arc::clone(&state.sessions);

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

                    // Check for notifications in output
                    if let Some(message) = parse_notification(&data_str) {
                        let _ = on_event.send(PtyEvent::Notification { message });
                    }

                    // Always send output
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
pub async fn create_pane_in_workspace(
    state: tauri::State<'_, PtyState>,
    on_event: Channel<PtyEvent>,
    workspace_id: String,
    pane_id: String,
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
    let mut cmd = CommandBuilder::new(&shell);

    // Set environment variables for CLI
    cmd.env("CMUX_WORKSPACE", &workspace_id);
    cmd.env("CMUX_PANE", &pane_id);

    let child = pair
        .slave
        .spawn_command(cmd)
        .map_err(|e| format!("Failed to spawn shell: {}", e))?;

    let session_id = Uuid::new_v4().to_string();

    // Clone reader before taking writer
    let reader = pair
        .master
        .try_clone_reader()
        .map_err(|e| format!("Failed to clone reader: {}", e))?;

    // Take the writer
    let writer = pair
        .master
        .take_writer()
        .map_err(|e| format!("Failed to take PTY writer: {}", e))?;

    let master = pair.master;

    let session = PtySession {
        master: Arc::new(tokio::sync::Mutex::new(master)),
        writer: Arc::new(tokio::sync::Mutex::new(writer)),
        child: Arc::new(tokio::sync::Mutex::new(child)),
        workspace_id: Some(workspace_id.clone()),
        pane_id: Some(pane_id.clone()),
    };

    state.sessions.insert(session_id.clone(), session);

    // Spawn async task to read PTY output
    let session_id_clone = session_id.clone();
    let state_clone = Arc::clone(&state.sessions);

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

                    // Check for notifications in output
                    if let Some(message) = parse_notification(&data_str) {
                        let _ = on_event.send(PtyEvent::Notification { message });
                    }

                    // Always send output
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
pub async fn close_pane(
    state: tauri::State<'_, PtyState>,
    workspace_id: String,
    pane_id: String,
) -> Result<(), String> {
    // Find session with matching workspace_id and pane_id
    let session_id_to_remove = {
        let mut found_id = None;
        for entry in state.sessions.iter() {
            let (id, session) = entry.pair();
            if session.workspace_id.as_deref() == Some(&workspace_id)
                && session.pane_id.as_deref() == Some(&pane_id)
            {
                found_id = Some(id.clone());
                break;
            }
        }
        found_id
    };

    if let Some(session_id) = session_id_to_remove {
        if let Some((_, session)) = state.sessions.remove(&session_id) {
            if let Err(e) = session.child.lock().await.kill() {
                eprintln!("Failed to kill child process: {}", e);
            }
        }
        Ok(())
    } else {
        Err("Session not found for given workspace/pane".to_string())
    }
}

#[tauri::command]
pub async fn focus_pane(
    state: tauri::State<'_, PtyState>,
    workspace_id: String,
    pane_id: String,
) -> Result<(), String> {
    // Mark pane as focused - this is tracked on the frontend
    // Backend just validates the session exists
    let mut found = false;
    for entry in state.sessions.iter() {
        let (_id, session) = entry.pair();
        if session.workspace_id.as_deref() == Some(&workspace_id)
            && session.pane_id.as_deref() == Some(&pane_id)
        {
            found = true;
            break;
        }
    }

    if found {
        Ok(())
    } else {
        Err("Session not found for given workspace/pane".to_string())
    }
}

#[derive(Serialize)]
pub struct PaneInfo {
    #[serde(rename = "sessionId")]
    pub session_id: String,
    #[serde(rename = "cwd")]
    pub cwd: String,
}

#[tauri::command]
pub async fn get_pane_cwd(
    state: tauri::State<'_, PtyState>,
    workspace_id: String,
    pane_id: String,
) -> Result<PaneInfo, String> {
    // Find session with matching workspace_id and pane_id
    let session_info = {
        let mut found = None;
        for entry in state.sessions.iter() {
            let (id, session) = entry.pair();
            if session.workspace_id.as_deref() == Some(&workspace_id)
                && session.pane_id.as_deref() == Some(&pane_id)
            {
                found = Some((id.clone(), session.workspace_id.clone(), session.pane_id.clone()));
                break;
            }
        }
        found
    };

    if let Some((session_id, _, _)) = session_info {
        // For now, return the current working directory
        // In a real implementation, we would query the PTY process for its CWD
        // This is a placeholder that returns a default value
        Ok(PaneInfo {
            session_id,
            cwd: std::env::current_dir()
                .map(|p| p.to_string_lossy().to_string())
                .unwrap_or_else(|_| "/".to_string()),
        })
    } else {
        Err("Session not found for given workspace/pane".to_string())
    }
}

#[tauri::command]
pub async fn set_environment_context(
    state: tauri::State<'_, PtyState>,
    workspace_id: String,
    pane_id: String,
) -> Result<(), String> {
    // Update the environment context for an existing session
    // This is called when a pane is activated/focused
    let mut found = false;
    for mut entry in state.sessions.iter_mut() {
        let (_id, session) = entry.pair_mut();
        if session.workspace_id.as_deref() == Some(&workspace_id)
            && session.pane_id.as_deref() == Some(&pane_id)
        {
            found = true;
            break;
        }
    }











    if found {
        Ok(())
    } else {
        Err("Session not found for given workspace/pane".to_string())
    }
}

#[tauri::command]
pub async fn write_pty(
    state: tauri::State<'_, PtyState>,
    session_id: String,
    data: String,
) -> Result<(), String> {
    if let Some(session) = state.sessions.get(&session_id) {
        let mut writer = session
            .writer
            .lock()
            .await;
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
pub async fn resize_pty(
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
pub async fn kill_pty(
    state: tauri::State<'_, PtyState>,
    session_id: String,
) -> Result<(), String> {
    // Try to remove and kill session
    // If already removed (e.g., process exited naturally), that's fine
    if let Some((_, session)) = state.sessions.remove(&session_id) {
        if let Err(e) = session.child.lock().await.kill() {
            eprintln!("Failed to kill child process: {}", e);
            // Continue anyway - we've removed from state
        }
    }
    // Always succeed - if session was already cleaned up, that's ok
    Ok(())
}
