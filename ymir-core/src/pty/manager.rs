use dashmap::DashMap;
use portable_pty::{native_pty_system, Child, CommandBuilder, MasterPty, PtySize};
use std::io::{Read, Write};
use std::sync::Arc;
use tokio::sync::{broadcast, Mutex};
use tracing::{debug, info, warn};

/// PTY output event types
#[derive(Clone, Debug, PartialEq)]
pub enum PtyOutput {
    /// Terminal output data
    Output { data: String },
    /// Notification from OSC sequences
    Notification { message: String },
    /// Process exit event
    Exit { code: Option<u32> },
}

/// A single PTY session bound to a tab
pub struct PtySession {
    /// The master PTY handle for resizing
    pub master: Arc<Mutex<Box<dyn MasterPty + Send>>>,
    /// The writer for sending input to the PTY
    pub writer: Arc<Mutex<Box<dyn Write + Send>>>,
    /// The child process handle
    pub child: Arc<Mutex<Box<dyn Child + Send + Sync>>>,
    /// The tab ID this session is bound to
    pub tab_id: String,
    /// Broadcast sender for PTY output events
    pub output_tx: broadcast::Sender<PtyOutput>,
}

/// Configuration for spawning a new PTY session
#[derive(Clone, Debug, Default)]
pub struct PtyConfig {
    /// Initial number of rows
    pub rows: u16,
    /// Initial number of columns
    pub cols: u16,
    /// Working directory for the shell
    pub cwd: Option<String>,
    /// Shell command to use (defaults to $SHELL or /bin/bash)
    pub shell: Option<String>,
}

impl PtyConfig {
    /// Create a new PTY config with default size (24x80)
    pub fn new() -> Self {
        Self {
            rows: 24,
            cols: 80,
            cwd: None,
            shell: None,
        }
    }

    /// Set the working directory
    pub fn with_cwd(mut self, cwd: impl Into<String>) -> Self {
        self.cwd = Some(cwd.into());
        self
    }

    /// Set the shell command
    pub fn with_shell(mut self, shell: impl Into<String>) -> Self {
        self.shell = Some(shell.into());
        self
    }

    /// Set the initial size
    pub fn with_size(mut self, rows: u16, cols: u16) -> Self {
        self.rows = rows;
        self.cols = cols;
        self
    }
}

/// Manages PTY sessions bound to tab IDs
pub struct PtyManager {
    /// Map of tab_id to PTY session
    sessions: Arc<DashMap<String, PtySession>>,
}

impl PtyManager {
    /// Create a new PTY manager
    pub fn new() -> Self {
        Self {
            sessions: Arc::new(DashMap::new()),
        }
    }

    /// Spawn a new PTY session bound to the given tab_id
    ///
    /// Returns the session ID (same as tab_id) on success
    pub async fn spawn(
        &self,
        tab_id: impl Into<String>,
        config: PtyConfig,
    ) -> crate::Result<String> {
        let tab_id = tab_id.into();
        let pty_system = native_pty_system();

        let pair = pty_system
            .openpty(PtySize {
                rows: config.rows,
                cols: config.cols,
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(|e| crate::CoreError::PtyError(format!("Failed to open PTY: {}", e)))?;

        let shell = config
            .shell
            .or_else(|| std::env::var("SHELL").ok())
            .unwrap_or_else(|| "/bin/bash".to_string());

        let mut cmd = CommandBuilder::new(&shell);
        cmd.arg("-i");

        if let Some(ref cwd) = config.cwd {
            cmd.cwd(std::path::Path::new(cwd));
        }

        let child = pair
            .slave
            .spawn_command(cmd)
            .map_err(|e| crate::CoreError::PtyError(format!("Failed to spawn shell: {}", e)))?;

        let reader = pair
            .master
            .try_clone_reader()
            .map_err(|e| crate::CoreError::PtyError(format!("Failed to clone reader: {}", e)))?;

        let writer = pair
            .master
            .take_writer()
            .map_err(|e| crate::CoreError::PtyError(format!("Failed to take writer: {}", e)))?;

        let master = pair.master;

        let (output_tx, _) = broadcast::channel(256);

        let session = PtySession {
            master: Arc::new(Mutex::new(master)),
            writer: Arc::new(Mutex::new(writer)),
            child: Arc::new(Mutex::new(child)),
            tab_id: tab_id.clone(),
            output_tx: output_tx.clone(),
        };

        self.sessions.insert(tab_id.clone(), session);

        spawn_pty_reader(
            reader,
            output_tx.clone(),
            tab_id.clone(),
            Arc::clone(&self.sessions),
        );

        info!(tab_id = %tab_id, "PTY session spawned successfully");
        Ok(tab_id)
    }

    /// Write data to a PTY session
    pub async fn write(&self, tab_id: &str, data: &str) -> crate::Result<()> {
        if let Some(session) = self.sessions.get(tab_id) {
            let mut writer = session.writer.lock().await;
            writer
                .write_all(data.as_bytes())
                .map_err(|e| crate::CoreError::PtyError(format!("Failed to write: {}", e)))?;
            writer
                .flush()
                .map_err(|e| crate::CoreError::PtyError(format!("Failed to flush: {}", e)))?;
            debug!(tab_id = %tab_id, "Data written to PTY");
            Ok(())
        } else {
            Err(crate::CoreError::PtyError(format!(
                "Session not found for tab_id: {}",
                tab_id
            )))
        }
    }

    /// Resize a PTY session
    pub async fn resize(&self, tab_id: &str, cols: u16, rows: u16) -> crate::Result<()> {
        if let Some(session) = self.sessions.get(tab_id) {
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
                .map_err(|e| crate::CoreError::PtyError(format!("Failed to resize: {}", e)))?;
            debug!(tab_id = %tab_id, cols, rows, "PTY resized");
            Ok(())
        } else {
            Err(crate::CoreError::PtyError(format!(
                "Session not found for tab_id: {}",
                tab_id
            )))
        }
    }

    /// Kill a PTY session
    pub async fn kill(&self, tab_id: &str) -> crate::Result<()> {
        info!(tab_id = %tab_id, "Killing PTY session");
        if let Some((_, session)) = self.sessions.remove(tab_id) {
            // Close the PTY master first to unblock the reader thread
            drop(session.master.lock().await);
            // Kill the child process
            if let Err(e) = session.child.lock().await.kill() {
                warn!(error = %e, "Failed to kill child process");
            }
        }
        Ok(())
    }

    /// Check if a PTY session is alive
    pub fn is_alive(&self, tab_id: &str) -> bool {
        self.sessions.contains_key(tab_id)
    }

    /// Get a broadcast receiver for PTY output events
    pub fn subscribe(&self, tab_id: &str) -> crate::Result<broadcast::Receiver<PtyOutput>> {
        if let Some(session) = self.sessions.get(tab_id) {
            Ok(session.output_tx.subscribe())
        } else {
            Err(crate::CoreError::PtyError(format!(
                "Session not found for tab_id: {}",
                tab_id
            )))
        }
    }

    /// Get the number of active sessions
    pub fn session_count(&self) -> usize {
        self.sessions.len()
    }

    /// Kill all sessions
    pub async fn kill_all(&self) -> crate::Result<()> {
        let tab_ids: Vec<String> = self
            .sessions
            .iter()
            .map(|entry| entry.key().clone())
            .collect();

        info!(count = tab_ids.len(), "Killing all PTY sessions");

        for tab_id in tab_ids {
            if let Some((_, session)) = self.sessions.remove(&tab_id) {
                if let Err(e) = session.child.lock().await.kill() {
                    warn!(tab_id = %tab_id, error = %e, "Failed to kill child process");
                }
            }
        }

        Ok(())
    }
}

impl Default for PtyManager {
    fn default() -> Self {
        Self::new()
    }
}

/// Spawn a background task to read PTY output and broadcast it
fn spawn_pty_reader(
    mut reader: Box<dyn Read + Send>,
    output_tx: broadcast::Sender<PtyOutput>,
    tab_id: String,
    sessions: Arc<DashMap<String, PtySession>>,
) {
    debug!(tab_id = %tab_id, "[PTY_READER] spawn_pty_reader: spawning background reader task");
    
    tokio::task::spawn_blocking(move || {
        let reader_tab_id = tab_id.clone();
        debug!(tab_id = %reader_tab_id, "[PTY_READER] background task started, entering read loop");
        
        let mut buffer = [0u8; 4096];
        let mut read_count: u64 = 0;
        
        loop {
            match reader.read(&mut buffer) {
                Ok(0) => {
                    debug!(tab_id = %reader_tab_id, reads_completed = read_count, "[PTY_READER] EOF received, sending Exit event");
                    let _ = output_tx.send(PtyOutput::Exit { code: None });
                    sessions.remove(&reader_tab_id);
                    break;
                }
                Ok(n) => {
                    read_count += 1;
                    debug!(tab_id = %reader_tab_id, bytes_read = n, read_count = read_count, receiver_count = output_tx.receiver_count(), "[PTY_READER] read data, broadcasting Output");
                    
                    let data = String::from_utf8_lossy(&buffer[..n]);
                    let data_str = data.to_string();
                    
                    if let Some(message) = parse_notification(&data_str) {
                        let _ = output_tx.send(PtyOutput::Notification { message });
                    }
                    
                    let send_result = output_tx.send(PtyOutput::Output { data: data_str });
                    debug!(tab_id = %reader_tab_id, send_success = send_result.is_ok(), "[PTY_READER] Output event sent");
                }
                Err(e) => {
                    debug!(tab_id = %reader_tab_id, error = %e, "[PTY_READER] read error, sending Exit event");
                    let _ = output_tx.send(PtyOutput::Exit { code: None });
                    sessions.remove(&reader_tab_id);
                    break;
                }
            }
        }
        
        debug!(tab_id = %reader_tab_id, "[PTY_READER] background task exiting");
    });
}

/// Parse OSC notification sequences from terminal output
/// Supports OSC 9, OSC 99, and OSC 777 notification protocols
fn parse_notification(line: &str) -> Option<String> {
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

    if let Some(start) = line.find("\x1b]777;notify;") {
        let content = &line[start + 13..];
        if let Some(end) = content.find('\x07') {
            return Some(content[..end].to_string());
        }
    }

    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_pty_config_default() {
        let config = PtyConfig::new();
        assert_eq!(config.rows, 24);
        assert_eq!(config.cols, 80);
        assert!(config.cwd.is_none());
        assert!(config.shell.is_none());
    }

    #[test]
    fn test_pty_config_builder() {
        let config = PtyConfig::new()
            .with_size(50, 100)
            .with_cwd("/home/user")
            .with_shell("/bin/zsh");

        assert_eq!(config.rows, 50);
        assert_eq!(config.cols, 100);
        assert_eq!(config.cwd, Some("/home/user".to_string()));
        assert_eq!(config.shell, Some("/bin/zsh".to_string()));
    }

    #[test]
    fn test_pty_manager_new() {
        let manager = PtyManager::new();
        assert_eq!(manager.session_count(), 0);
    }

    #[test]
    fn test_is_alive_returns_false_for_unknown_tab() {
        let manager = PtyManager::new();
        assert!(!manager.is_alive("unknown-tab"));
    }

    #[test]
    fn test_subscribe_fails_for_unknown_tab() {
        let manager = PtyManager::new();
        let result = manager.subscribe("unknown-tab");
        assert!(result.is_err());
    }

    #[test]
    fn test_parse_notification_osc9() {
        let input = "\x1b]9;Hello World\x07";
        let result = parse_notification(input);
        assert_eq!(result, Some("Hello World".to_string()));
    }

    #[test]
    fn test_parse_notification_osc99() {
        let input = "\x1b]99;Build complete\x07";
        let result = parse_notification(input);
        assert_eq!(result, Some("Build complete".to_string()));
    }

    #[test]
    fn test_parse_notification_osc777() {
        let input = "\x1b]777;notify;Deployment successful\x07";
        let result = parse_notification(input);
        assert_eq!(result, Some("Deployment successful".to_string()));
    }

    #[test]
    fn test_parse_notification_with_prefix() {
        let input = "Some output\x1b]9;Notification\x07more text";
        let result = parse_notification(input);
        assert_eq!(result, Some("Notification".to_string()));
    }

    #[test]
    fn test_parse_notification_no_notification() {
        let input = "Just regular terminal output";
        let result = parse_notification(input);
        assert_eq!(result, None);
    }

    #[test]
    fn test_parse_notification_malformed_no_bel() {
        let input = "\x1b]9;No closing bell";
        let result = parse_notification(input);
        assert_eq!(result, None);
    }

    #[test]
    fn test_parse_notification_empty_message() {
        let input = "\x1b]9;\x07";
        let result = parse_notification(input);
        assert_eq!(result, Some("".to_string()));
    }

    #[test]
    fn test_parse_notification_unicode() {
        let input = "\x1b]9;Hello 世界 🌍\x07";
        let result = parse_notification(input);
        assert_eq!(result, Some("Hello 世界 🌍".to_string()));
    }

    #[tokio::test]
    async fn test_spawn_pty_session() {
        let manager = PtyManager::new();
        let tab_id = "test-tab-1";

        let result = manager.spawn(tab_id, PtyConfig::new()).await;
        assert!(result.is_ok(), "Failed to spawn PTY: {:?}", result.err());
        assert_eq!(result.unwrap(), tab_id);
        assert!(manager.is_alive(tab_id));

        // Cleanup
        let _ = manager.kill(tab_id).await;
    }

    #[tokio::test]
    async fn test_write_to_pty() {
        let manager = PtyManager::new();
        let tab_id = "test-tab-write";

        manager.spawn(tab_id, PtyConfig::new()).await.unwrap();

        // Write a simple command that exits immediately
        let result = manager.write(tab_id, "exit\n").await;
        assert!(result.is_ok());

        // Give it time to process
        tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;

        // Cleanup
        let _ = manager.kill(tab_id).await;
    }

    #[tokio::test]
    async fn test_write_to_unknown_tab_fails() {
        let manager = PtyManager::new();
        let result = manager.write("unknown-tab", "data").await;
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_resize_pty() {
        let manager = PtyManager::new();
        let tab_id = "test-tab-resize";

        manager.spawn(tab_id, PtyConfig::new()).await.unwrap();

        let result = manager.resize(tab_id, 100, 50).await;
        assert!(result.is_ok());

        // Cleanup
        let _ = manager.kill(tab_id).await;
    }

    #[tokio::test]
    async fn test_resize_unknown_tab_fails() {
        let manager = PtyManager::new();
        let result = manager.resize("unknown-tab", 100, 50).await;
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_kill_pty_session() {
        let manager = PtyManager::new();
        let tab_id = "test-tab-kill";

        manager.spawn(tab_id, PtyConfig::new()).await.unwrap();
        assert!(manager.is_alive(tab_id));

        let result = manager.kill(tab_id).await;
        assert!(result.is_ok());

        // Session should be removed from manager
        assert!(!manager.is_alive(tab_id));
    }

    #[tokio::test]
    async fn test_kill_unknown_tab_succeeds() {
        let manager = PtyManager::new();
        // Killing an unknown tab should succeed (idempotent)
        let result = manager.kill("unknown-tab").await;
        assert!(result.is_ok());
    }

    #[tokio::test]
    async fn test_subscribe_to_output() {
        let manager = PtyManager::new();
        let tab_id = "test-tab-subscribe";

        manager.spawn(tab_id, PtyConfig::new()).await.unwrap();

        let result = manager.subscribe(tab_id);
        assert!(result.is_ok());

        // Cleanup
        let _ = manager.kill(tab_id).await;
    }

    #[tokio::test]
    async fn test_kill_all_sessions() {
        let manager = PtyManager::new();

        manager.spawn("tab-1", PtyConfig::new()).await.unwrap();
        manager.spawn("tab-2", PtyConfig::new()).await.unwrap();
        manager.spawn("tab-3", PtyConfig::new()).await.unwrap();

        assert_eq!(manager.session_count(), 3);

        let result = manager.kill_all().await;
        assert!(result.is_ok());

        assert_eq!(manager.session_count(), 0);
    }

    #[tokio::test]
    async fn test_spawn_with_custom_config() {
        let manager = PtyManager::new();
        let tab_id = "test-tab-custom";

        let config = PtyConfig::new()
            .with_size(50, 100)
            .with_cwd("/tmp")
            .with_shell("/bin/sh");

        let result = manager.spawn(tab_id, config).await;
        assert!(result.is_ok());

        // Cleanup
        let _ = manager.kill(tab_id).await;
    }
}
