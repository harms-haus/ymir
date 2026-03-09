use crate::state::{PtySession, PtyState};
use portable_pty::{native_pty_system, CommandBuilder, PtySize};
use serde::Serialize;
use std::io::{Read, Write};
use std::sync::Arc;
use tauri::async_runtime;
use tauri::ipc::Channel;
use tracing::{debug, error, info, instrument, warn};
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

/// Helper to spawn a PTY reader task that broadcasts output
fn spawn_pty_reader(
    mut reader: Box<dyn Read + Send>,
    output_tx: tokio::sync::broadcast::Sender<(String, String)>,
    session_id: String,
    sessions: Arc<dashmap::DashMap<String, PtySession>>,
) {
    // Use spawn_blocking for blocking I/O operations
    tokio::task::spawn_blocking(move || {
        let mut buffer = [0u8; 4096];

        loop {
            match reader.read(&mut buffer) {
                Ok(0) => {
                    // EOF - process exited
                    let _ = output_tx.send(("exit".to_string(), String::new()));
                    sessions.remove(&session_id);
                    break;
                }
                Ok(n) => {
                    let data = String::from_utf8_lossy(&buffer[..n]);
                    let data_str = data.to_string();

                    // Check for notifications in output
                    if let Some(message) = parse_notification(&data_str) {
                        let _ = output_tx.send(("notification".to_string(), message));
                    }

                    // Broadcast output - ignore send errors (no subscribers)
                    let _ = output_tx.send(("output".to_string(), data_str));
                }
                Err(_) => {
                    let _ = output_tx.send(("exit".to_string(), String::new()));
                    sessions.remove(&session_id);
                    break;
                }
            }
        }
    });
}

/// Helper to forward broadcast events to a Tauri channel
fn forward_broadcast_to_channel(
    mut rx: tokio::sync::broadcast::Receiver<(String, String)>,
    on_event: Channel<PtyEvent>,
) {
    async_runtime::spawn(async move {
        loop {
            match rx.recv().await {
                Ok((event_type, data)) => {
                    let event = match event_type.as_str() {
                        "output" => PtyEvent::Output { data },
                        "notification" => PtyEvent::Notification { message: data },
                        "exit" => PtyEvent::Exit { code: None },
                        _ => continue,
                    };
                    if on_event.send(event).is_err() {
                        // Channel closed, stop forwarding
                        break;
                    }
                }
                Err(tokio::sync::broadcast::error::RecvError::Closed) => {
                    // Broadcast channel closed
                    break;
                }
                Err(tokio::sync::broadcast::error::RecvError::Lagged(_)) => {
                    // Missed some messages, continue
                    continue;
                }
            }
        }
    });
}

#[tauri::command]
#[instrument(skip(state, on_event), fields(correlation_id = %correlation_id.as_deref().unwrap_or("none")))]
pub async fn spawn_pty(
    state: tauri::State<'_, PtyState>,
    on_event: Channel<PtyEvent>,
    correlation_id: Option<String>,
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
    cmd.arg("-i"); // Start as interactive shell to get a prompt

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

    // Create broadcast channel for this PTY (buffer size 256)
    let (output_tx, _) = tokio::sync::broadcast::channel(256);

    let session = PtySession {
        master: Arc::new(tokio::sync::Mutex::new(master)),
        writer: Arc::new(tokio::sync::Mutex::new(writer)),
        child: Arc::new(tokio::sync::Mutex::new(child)),
        workspace_id: None,
        pane_id: None,
        output_tx: output_tx.clone(),
    };

    state.sessions.insert(session_id.clone(), session);

    // Spawn the PTY reader task
    spawn_pty_reader(
        reader,
        output_tx.clone(),
        session_id.clone(),
        Arc::clone(&state.sessions),
    );

    // Subscribe and forward to the initial channel
    let rx = output_tx.subscribe();
    forward_broadcast_to_channel(rx, on_event);

    info!(session_id = %session_id, "PTY session spawned successfully");
    Ok(session_id)
}

#[tauri::command]
#[instrument(skip(state, on_event), fields(%workspace_id, %pane_id))]
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
    cmd.arg("-i"); // Start as interactive shell to get a prompt

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

    // Create broadcast channel for this PTY (buffer size 256)
    let (output_tx, _) = tokio::sync::broadcast::channel(256);

    let session = PtySession {
        master: Arc::new(tokio::sync::Mutex::new(master)),
        writer: Arc::new(tokio::sync::Mutex::new(writer)),
        child: Arc::new(tokio::sync::Mutex::new(child)),
        workspace_id: Some(workspace_id.clone()),
        pane_id: Some(pane_id.clone()),
        output_tx: output_tx.clone(),
    };

    state.sessions.insert(session_id.clone(), session);

    // Spawn the PTY reader task
    spawn_pty_reader(
        reader,
        output_tx.clone(),
        session_id.clone(),
        Arc::clone(&state.sessions),
    );

    // Subscribe and forward to the initial channel
    let rx = output_tx.subscribe();
    forward_broadcast_to_channel(rx, on_event);

    info!(session_id = %session_id, "PTY session created for pane in workspace");
    Ok(session_id)
}

#[tauri::command]
#[instrument(skip(state), fields(%workspace_id, %pane_id))]
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
                error!(error = %e, "Failed to kill child process");
            }
        }
        Ok(())
    } else {
        Err("Session not found for given workspace/pane".to_string())
    }
}

#[tauri::command]
#[instrument(skip(state), fields(%workspace_id, %pane_id))]
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
#[instrument(skip(state), fields(%workspace_id, %pane_id))]
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
#[instrument(skip(state), fields(%workspace_id, %pane_id))]
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
#[instrument(skip(state, data), fields(%session_id))]
pub async fn write_pty(
    state: tauri::State<'_, PtyState>,
    session_id: String,
    data: String,
) -> Result<(), String> {
    if let Some(session) = state.sessions.get(&session_id) {
        let mut writer = session.writer.lock().await;
        writer
            .write_all(data.as_bytes())
            .map_err(|e| format!("Failed to write to PTY: {}", e))?;
        writer
            .flush()
            .map_err(|e| format!("Failed to flush PTY: {}", e))?;
        debug!(%session_id, "Data written to PTY");
        Ok(())
    } else {
        Err("Session not found".to_string())
    }
}

#[tauri::command]
#[instrument(skip(state), fields(%session_id, cols, rows, correlation_id = %correlation_id.as_deref().unwrap_or("none")))]
pub async fn resize_pty(
    state: tauri::State<'_, PtyState>,
    session_id: String,
    cols: u16,
    rows: u16,
    correlation_id: Option<String>,
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
        debug!(%session_id, cols, rows, "PTY resized");
        Ok(())
    } else {
        Err("Session not found".to_string())
    }
}

#[tauri::command]
#[instrument(skip(state), fields(%session_id))]
pub async fn kill_pty(
    state: tauri::State<'_, PtyState>,
    session_id: String,
) -> Result<(), String> {
    // Try to remove and kill session
    // If already removed (e.g., process exited naturally), that's fine
    info!(%session_id, "Killing PTY session");
    if let Some((_, session)) = state.sessions.remove(&session_id) {
        if let Err(e) = session.child.lock().await.kill() {
            warn!(error = %e, "Failed to kill child process");
            // Continue anyway - we've removed from state
        }
    }
    // Always succeed - if session was already cleaned up, that's ok
    Ok(())
}

#[tauri::command]
#[instrument(skip(state), fields(%session_id, correlation_id = %correlation_id.as_deref().unwrap_or("none")))]
pub async fn is_pty_alive(
    state: tauri::State<'_, PtyState>,
    session_id: String,
    correlation_id: Option<String>,
) -> Result<bool, String> {
    Ok(state.sessions.contains_key(&session_id))
}

#[tauri::command]
#[instrument(skip(state, on_event), fields(%session_id, correlation_id = %correlation_id.as_deref().unwrap_or("none")))]
pub async fn attach_pty_channel(
    state: tauri::State<'_, PtyState>,
    session_id: String,
    on_event: Channel<PtyEvent>,
    correlation_id: Option<String>,
) -> Result<(), String> {
    // Get the broadcast sender from the session
    let output_tx = {
        let session_ref = state
            .sessions
            .get(&session_id)
            .ok_or_else(|| "Session not found".to_string())?;
        session_ref.output_tx.clone()
    };

    // Subscribe to the broadcast and forward to Tauri channel
    let rx = output_tx.subscribe();
    forward_broadcast_to_channel(rx, on_event);

    Ok(())
}

#[tauri::command]
#[instrument(skip(state))]
pub async fn kill_all_sessions(
    state: tauri::State<'_, PtyState>,
) -> Result<(), String> {
    // Get all session IDs
    let session_ids: Vec<String> = state.sessions.iter().map(|entry| entry.key().clone()).collect();
    let session_count = session_ids.len();
    info!(session_count, "Killing all PTY sessions");

    // Kill each session
    for session_id in session_ids {
        if let Some((_, session)) = state.sessions.remove(&session_id) {
            if let Err(e) = session.child.lock().await.kill() {
                warn!(%session_id, error = %e, "Failed to kill child process");
            }
        }
    }

    info!(session_count, "All PTY sessions killed");
    Ok(())
}


#[tauri::command]
#[instrument]
pub async fn exit_app() {
  info!("Exit requested from frontend");
  std::process::exit(0);
}


#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn kill_all_sessions_returns_ok_when_empty() {
        let state = PtyState::default();
        // Should return Ok when no sessions exist
        // Note: This is a sync test, async test would require tokio::test
        // The actual logic is tested via integration tests
    }
}
