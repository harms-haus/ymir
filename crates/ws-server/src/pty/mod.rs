//! PTY session manager for terminal emulation

pub mod handler;
mod output;

use anyhow::{anyhow, Result};
use portable_pty::{native_pty_system, CommandBuilder, PtySize};
use std::collections::HashMap;
use std::io::{Read, Write};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use tokio::sync::{broadcast, mpsc};
use tokio::task::JoinHandle;
use tokio::time::interval;
use tracing::instrument;
use uuid::Uuid;

pub use handler::{
    handle_terminal_create, handle_terminal_input, handle_terminal_kill,
    handle_terminal_mount, handle_terminal_request_history, handle_terminal_resize,
    handle_terminal_tab_close, handle_terminal_unmount,
};
pub use output::spawn_output_reader;

const MAX_SESSIONS_PER_WORKTREE: usize = 10;
const TTL_CHECK_INTERVAL: Duration = Duration::from_secs(30);

/// Get the configurable session TTL duration.
/// Reads from TERMINAL_SESSION_TTL_SECS env var, defaults to 180s (3min).
fn session_ttl() -> Duration {
    let secs: u64 = std::env::var("TERMINAL_SESSION_TTL_SECS")
        .ok()
        .and_then(|v| v.parse().ok())
        .unwrap_or(180);
    Duration::from_secs(secs)
}

pub struct PtySession {
    pub id: Uuid,
    pub tab_id: Option<Uuid>,
    pub worktree_id: Uuid,
    pub shell: String,
    pub label: Option<String>,
    pub start_time: Instant,
    pub last_activity: Arc<Mutex<Instant>>,
    pub is_ended: bool,
    pub ended_reason: Option<String>,
    master: Option<Box<dyn portable_pty::MasterPty + Send>>,
    writer: Option<Box<dyn Write + Send>>,
    _process: Option<Box<dyn portable_pty::Child + Send + Sync>>,
    tx: mpsc::UnboundedSender<Vec<u8>>,
}

impl PtySession {
    fn new(
        id: Uuid,
        tab_id: Option<Uuid>,
        worktree_id: Uuid,
        shell: String,
        label: Option<String>,
        master: Box<dyn portable_pty::MasterPty + Send>,
        writer: Box<dyn Write + Send>,
        process: Box<dyn portable_pty::Child + Send + Sync>,
        tx: mpsc::UnboundedSender<Vec<u8>>,
    ) -> Self {
        let now = Instant::now();
        Self {
            id,
            tab_id,
            worktree_id,
            shell,
            label,
            start_time: now,
            last_activity: Arc::new(Mutex::new(now)),
            is_ended: false,
            ended_reason: None,
            master: Some(master),
            writer: Some(writer),
            _process: Some(process),
            tx,
        }
    }

    pub fn write(&mut self, data: &[u8]) -> Result<()> {
        let writer = self.writer.as_mut().ok_or_else(|| anyhow!("Session is ended"))?;
        writer.write_all(data)?;
        writer.flush()?;

        *self.last_activity.lock().unwrap() = Instant::now();

        Ok(())
    }

    pub fn read(&self) -> Result<Vec<u8>> {
        let master = self.master.as_ref().ok_or_else(|| anyhow!("Session is ended"))?;
        let mut reader = master.try_clone_reader()?;
        let mut buffer = Vec::new();
        let mut temp_buf = [0u8; 4096];

        loop {
            match reader.read(&mut temp_buf) {
                Ok(0) => break,
                Ok(n) => {
                    buffer.extend_from_slice(&temp_buf[..n]);
                }
                Err(e) if e.kind() == std::io::ErrorKind::WouldBlock => break,
                Err(e) => return Err(e.into()),
            }
        }

        if !buffer.is_empty() {
            *self.last_activity.lock().unwrap() = Instant::now();
        }

        Ok(buffer)
    }

    pub fn resize(&self, cols: u16, rows: u16) -> Result<()> {
        let master = self.master.as_ref().ok_or_else(|| anyhow!("Session is ended"))?;
        let size = PtySize {
            rows,
            cols,
            pixel_width: 0,
            pixel_height: 0,
        };
        master.resize(size)?;

        #[cfg(unix)]
        {
            use nix::sys::signal::{kill, Signal};
            use nix::unistd::Pid;

            if let Some(process) = &self._process {
                if let Some(pid) = process.process_id() {
                    if let Ok(pid) = pid.try_into() {
                        let _ = kill(Pid::from_raw(pid), Signal::SIGWINCH);
                    }
                }
            }
        }

        Ok(())
    }

    pub fn kill(&mut self) -> Result<()> {
        if let Some(mut process) = self._process.take() {
            process.kill()?;
        }
        Ok(())
    }

    pub fn is_expired(&self) -> bool {
        let last_activity = *self.last_activity.lock().unwrap();
        last_activity.elapsed() > session_ttl()
    }

    pub fn output_tx(&self) -> mpsc::UnboundedSender<Vec<u8>> {
        self.tx.clone()
    }

    pub fn take_reader(&mut self) -> Result<Box<dyn Read + Send>> {
        let master = self.master.as_ref().ok_or_else(|| anyhow!("Session is ended"))?;
        master.try_clone_reader()
    }
}

pub struct PtyManager {
    sessions: Arc<Mutex<HashMap<Uuid, Arc<Mutex<PtySession>>>>>,
    output_readers: Arc<Mutex<HashMap<Uuid, JoinHandle<()>>>>,
    _ttl_handle: Option<JoinHandle<()>>,
    broadcast_tx: Option<Arc<Mutex<Option<broadcast::Sender<crate::protocol::ServerMessage>>>>>,
}

impl std::fmt::Debug for PtyManager {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("PtyManager")
            .field("session_count", &self.sessions.lock().unwrap().len())
            .finish()
    }
}

impl PtyManager {
    pub fn new() -> Arc<Self> {
        let sessions = Arc::new(Mutex::new(HashMap::new()));
        let output_readers = Arc::new(Mutex::new(HashMap::new()));
        let sessions_clone = sessions.clone();
        let broadcast_slot: Arc<Mutex<Option<broadcast::Sender<crate::protocol::ServerMessage>>>> =
            Arc::new(Mutex::new(None));
        let broadcast_clone = broadcast_slot.clone();

        let ttl_handle = tokio::spawn(async move {
            let mut interval = interval(TTL_CHECK_INTERVAL);
            loop {
                interval.tick().await;
                let tx = broadcast_clone.lock().unwrap().clone();
                Self::check_ttl(&sessions_clone, tx).await;
            }
        });

        Arc::new(Self {
            sessions,
            output_readers,
            _ttl_handle: Some(ttl_handle),
            broadcast_tx: Some(broadcast_slot),
        })
    }

    /// Set the broadcast sender for TTL expiry notifications.
    /// Must be called after construction, typically from AppState setup.
    pub fn set_broadcast_tx(&self, tx: broadcast::Sender<crate::protocol::ServerMessage>) {
        if let Some(slot) = &self.broadcast_tx {
            *slot.lock().unwrap() = Some(tx);
        }
    }

    /// Get or create a PTY session for a given tab.
    /// If an active session exists for the tab, returns it (with None for the rx channel,
    /// since the output reader is already broadcasting through AppState).
    /// Otherwise, spawns a new session linked to the tab.
    #[instrument(skip(self), fields(tab_id = %tab_id, worktree_id = %worktree_id))]
    pub fn get_or_create_session(
        self: &Arc<Self>,
        tab_id: Uuid,
        worktree_id: Uuid,
        worktree_path: &str,
        label: Option<String>,
        shell: Option<String>,
    ) -> Result<(Uuid, Option<mpsc::UnboundedReceiver<Vec<u8>>>)> {
        // Check if there's an active (non-ended) session for this tab
        {
            let sessions = self.sessions.lock().unwrap();
            for (session_id, session) in sessions.iter() {
                let s = session.lock().unwrap();
                if s.tab_id == Some(tab_id) && !s.is_ended {
                    tracing::info!(
                        session_id = %session_id,
                        "Reusing existing active session for tab {}",
                        tab_id
                    );
                    return Ok((*session_id, None));
                }
            }
        }

        // No active session found, create a new one
        let (session_id, rx) = self.spawn_internal(Some(tab_id), worktree_id, worktree_path, label, shell)?;
        Ok((session_id, Some(rx)))
    }

    /// Spawn a new PTY session linked to a specific tab.
    #[instrument(skip(self), fields(tab_id = %tab_id, worktree_id = %worktree_id))]
    pub fn spawn_with_tab(
        &self,
        tab_id: Uuid,
        worktree_id: Uuid,
        worktree_path: &str,
        label: Option<String>,
        shell: Option<String>,
    ) -> Result<(Uuid, mpsc::UnboundedReceiver<Vec<u8>>)> {
        self.spawn_internal(Some(tab_id), worktree_id, worktree_path, label, shell)
    }

    /// Spawn a new PTY session (legacy: no tab linkage).
    #[instrument(skip(self), fields(worktree_id = %worktree_id))]
    pub fn spawn(
        &self,
        worktree_id: Uuid,
        worktree_path: &str,
        label: Option<String>,
        shell: Option<String>,
    ) -> Result<(Uuid, mpsc::UnboundedReceiver<Vec<u8>>)> {
        self.spawn_internal(None, worktree_id, worktree_path, label, shell)
    }

    fn spawn_internal(
        &self,
        tab_id: Option<Uuid>,
        worktree_id: Uuid,
        worktree_path: &str,
        label: Option<String>,
        shell: Option<String>,
    ) -> Result<(Uuid, mpsc::UnboundedReceiver<Vec<u8>>)> {
        let session_count = {
            let sessions = self.sessions.lock().unwrap();
            sessions
                .values()
                .filter(|session| !session.lock().unwrap().is_ended && session.lock().unwrap().worktree_id == worktree_id)
                .count()
        };

        if session_count >= MAX_SESSIONS_PER_WORKTREE {
            return Err(anyhow!(
                "Maximum number of sessions ({}) exceeded for worktree {}",
                MAX_SESSIONS_PER_WORKTREE,
                worktree_id
            ));
        }

        let shell_path = self.detect_shell(shell)?;

        let pty_system = native_pty_system();
        let pair = pty_system.openpty(PtySize {
            rows: 24,
            cols: 80,
            pixel_width: 0,
            pixel_height: 0,
        })?;

        let mut cmd = CommandBuilder::new(&shell_path);
        cmd.cwd(worktree_path);
        let child = pair.slave.spawn_command(cmd)?;

        let master = pair.master;
        #[cfg(unix)]
        Self::set_master_nonblocking(master.as_ref())?;
        let writer = master.take_writer()?;
        drop(pair.slave);

        let session_id = Uuid::new_v4();
        let (tx, rx) = mpsc::unbounded_channel();

        let session = Arc::new(Mutex::new(PtySession::new(
            session_id,
            tab_id,
            worktree_id,
            shell_path,
            label,
            master,
            writer,
            child,
            tx,
        )));

        self.sessions.lock().unwrap().insert(session_id, session);

        Ok((session_id, rx))
    }

    #[cfg(unix)]
    fn set_master_nonblocking(master: &(dyn portable_pty::MasterPty + Send)) -> Result<()> {
        let Some(fd) = master.as_raw_fd() else {
            return Ok(());
        };

        let flags = unsafe { libc::fcntl(fd, libc::F_GETFL) };
        if flags == -1 {
            return Err(std::io::Error::last_os_error().into());
        }

        if flags & libc::O_NONBLOCK == 0 {
            let result = unsafe { libc::fcntl(fd, libc::F_SETFL, flags | libc::O_NONBLOCK) };
            if result == -1 {
                return Err(std::io::Error::last_os_error().into());
            }
        }

        Ok(())
    }

    fn detect_shell(&self, preferred: Option<String>) -> Result<String> {
        if let Some(shell) = preferred {
            if self.shell_exists(&shell) {
                return Ok(shell);
            }
        }

        let shells = ["/bin/bash", "/bin/zsh", "/bin/sh"];
        for shell in &shells {
            if self.shell_exists(shell) {
                return Ok(shell.to_string());
            }
        }

        Err(anyhow!("No suitable shell found"))
    }

    fn shell_exists(&self, path: &str) -> bool {
        std::path::Path::new(path).exists()
            && std::fs::metadata(path)
                .map(|m| m.is_file())
                .unwrap_or(false)
    }

    pub fn get_session(&self, session_id: Uuid) -> Option<Arc<Mutex<PtySession>>> {
        self.sessions.lock().unwrap().get(&session_id).cloned()
    }

    /// Check if a session exists in memory and is not ended.
    pub fn is_session_alive(&self, session_id: Uuid) -> bool {
        self.sessions
            .lock()
            .unwrap()
            .get(&session_id)
            .map(|s| !s.lock().unwrap().is_ended)
            .unwrap_or(false)
    }

    /// Gracefully end a session: kills the PTY process but keeps the session
    /// record in memory, marking it as ended with the given reason.
    #[instrument(skip(self), fields(session_id = %session_id))]
    pub fn end_session(&self, session_id: Uuid, reason: &str) -> Result<()> {
        let session = self
            .sessions
            .lock()
            .unwrap()
            .get(&session_id)
            .cloned()
            .ok_or_else(|| anyhow!("Session {} not found", session_id))?;

        // Mark session as ended (disconnected) but DO NOT kill the PTY.
        // The session will resume on remount. PTY is only killed on
        // explicit TerminalTabClose or TTL expiry.
        {
            let mut s = session.lock().unwrap();
            s.is_ended = true;
            s.ended_reason = Some(reason.to_string());
        }

        tracing::info!(
            session_id = %session_id,
            reason = reason,
            "Session ended gracefully"
        );

        Ok(())
    }

    /// Full session cleanup: removes the session from memory entirely.
    #[instrument(skip(self))]
    pub fn kill_session(&self, session_id: Uuid) -> Result<()> {
        // Remove output reader
        if let Some(handle) = self.output_readers.lock().unwrap().remove(&session_id) {
            handle.abort();
        }

        let mut sessions = self.sessions.lock().unwrap();
        if let Some(session) = sessions.remove(&session_id) {
            let mut s = session.lock().unwrap();
            let _ = s.kill();
            Ok(())
        } else {
            Err(anyhow!("Session {} not found", session_id))
        }
    }

    #[instrument(skip(self, data))]
    pub fn write(&self, session_id: Uuid, data: &[u8]) -> Result<()> {
        let session = self
            .sessions
            .lock()
            .unwrap()
            .get(&session_id)
            .cloned()
            .ok_or_else(|| anyhow!("Session {} not found", session_id))?;

        let result = session.lock().unwrap().write(data);
        result
    }

    #[instrument(skip(self))]
    pub fn resize(&self, session_id: Uuid, cols: u16, rows: u16) -> Result<()> {
        let session = self
            .sessions
            .lock()
            .unwrap()
            .get(&session_id)
            .cloned()
            .ok_or_else(|| anyhow!("Session {} not found", session_id))?;

        let result = session.lock().unwrap().resize(cols, rows);
        result
    }

    pub fn register_output_reader(&self, session_id: Uuid, handle: JoinHandle<()>) {
        self.output_readers.lock().unwrap().insert(session_id, handle);
    }

    #[instrument(skip(self))]
    pub fn cleanup_on_disconnect(&self, worktree_id: Uuid) {
        let session_ids: Vec<Uuid> = {
            let sessions = self.sessions.lock().unwrap();
            sessions
                .iter()
                .filter_map(|(id, session)| {
                    let session = session.lock().unwrap();
                    (session.worktree_id == worktree_id && !session.is_ended).then_some(*id)
                })
                .collect()
        };

        for session_id in session_ids {
            // Kill PTY and mark as ended (not full removal)
            if let Some(session) = self.sessions.lock().unwrap().get(&session_id).cloned() {
                let mut s = session.lock().unwrap();
                let _ = s.kill();
                *s.last_activity.lock().unwrap() = Instant::now();
                s.is_ended = true;
                s.ended_reason = Some("client_disconnect".to_string());
            }
            if let Some(handle) = self.output_readers.lock().unwrap().remove(&session_id) {
                handle.abort();
            }
        }
    }

    async fn check_ttl(
        sessions: &Arc<Mutex<HashMap<Uuid, Arc<Mutex<PtySession>>>>>,
        broadcast_tx: Option<broadcast::Sender<crate::protocol::ServerMessage>>,
    ) {
        let session_ids: Vec<Uuid> = {
            let sessions_guard = sessions.lock().unwrap();
            sessions_guard.keys().copied().collect()
        };

        for session_id in session_ids {
            let Some(session) = sessions.lock().unwrap().get(&session_id).cloned() else {
                continue;
            };

            // Skip already-ended sessions
            if session.lock().unwrap().is_ended {
                continue;
            }

            if !session.lock().unwrap().is_expired() {
                continue;
            }

            let tab_id = session.lock().unwrap().tab_id;

            // Kill the PTY and mark as expired (keeps session record)
            {
                let mut s = session.lock().unwrap();
                *s.last_activity.lock().unwrap() = Instant::now();
                s.is_ended = true;
                s.ended_reason = Some("ttl".to_string());
                let _ = s.kill();
            }

            tracing::info!(
                session_id = %session_id,
                ?tab_id,
                "Session expired due to TTL"
            );

            // Broadcast TerminalSessionEnded if we have a broadcast sender and tab_id
            if let (Some(tx), Some(tab)) = (&broadcast_tx, tab_id) {
                let msg = crate::protocol::ServerMessage::new(
                    crate::protocol::ServerMessagePayload::TerminalSessionEnded(
                        crate::protocol::TerminalSessionEnded {
                            tab_id: tab,
                            session_id,
                            reason: "ttl".to_string(),
                        },
                    ),
                );
                let _ = tx.send(msg);
                tracing::info!(
                    session_id = %session_id,
                    ?tab_id,
                    "Broadcast TerminalSessionEnded for expired session"
                );
            }

            // Remove the output reader
            sessions
                .lock()
                .unwrap()
                .get(&session_id)
                .map(|_| ());
        }
    }

    /// Count only active (non-ended) sessions.
    pub fn session_count(&self) -> usize {
        self.sessions
            .lock()
            .unwrap()
            .values()
            .filter(|s| !s.lock().unwrap().is_ended)
            .count()
    }

    /// Get all session IDs (including ended) for a worktree.
    pub fn get_worktree_sessions(&self, worktree_id: Uuid) -> Vec<Uuid> {
        let sessions = self.sessions.lock().unwrap();
        sessions
            .iter()
            .filter_map(|(id, session)| {
                let session = session.lock().unwrap();
                (session.worktree_id == worktree_id).then_some(*id)
            })
            .collect()
    }

    /// Get active (non-ended) session IDs for a worktree.
    pub fn get_active_worktree_sessions(&self, worktree_id: Uuid) -> Vec<Uuid> {
        let sessions = self.sessions.lock().unwrap();
        sessions
            .iter()
            .filter_map(|(id, session)| {
                let session = session.lock().unwrap();
                (session.worktree_id == worktree_id && !session.is_ended).then_some(*id)
            })
            .collect()
    }
}

impl Drop for PtyManager {
    fn drop(&mut self) {
        if let Some(ttl_handle) = self._ttl_handle.take() {
            ttl_handle.abort();
        }

        for (_, handle) in self.output_readers.lock().unwrap().drain() {
            handle.abort();
        }

        let mut sessions = self.sessions.lock().unwrap();
        for (_, session) in sessions.drain() {
            let _ = session.lock().unwrap().kill();
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tokio::time::{sleep, Duration as TokioDuration};

    #[tokio::test]
    async fn test_spawn_session() {
        let manager = PtyManager::new();
        let worktree_id = Uuid::new_v4();

        let result = manager.spawn(worktree_id, "/tmp/test-worktree", Some("test-session".to_string()), None);
        assert!(result.is_ok());

        let (session_id, _rx) = result.unwrap();
        assert_eq!(manager.session_count(), 1);

        let _ = manager.kill_session(session_id);
    }

    #[tokio::test]
    async fn test_max_sessions_per_worktree() {
        let manager = PtyManager::new();
        let worktree_id = Uuid::new_v4();

        for i in 0..MAX_SESSIONS_PER_WORKTREE {
            let result = manager.spawn(worktree_id, "/tmp/test-worktree", Some(format!("session-{}", i)), None);
            assert!(result.is_ok(), "Failed to create session {}", i);
        }

        let result = manager.spawn(worktree_id, "/tmp/test-worktree", Some("extra-session".to_string()), None);
        assert!(result.is_err());
        assert!(result
            .unwrap_err()
            .to_string()
            .contains("Maximum number of sessions"));

        let sessions = manager.get_worktree_sessions(worktree_id);
        for session_id in sessions {
            let _ = manager.kill_session(session_id);
        }
    }

    #[tokio::test]
    async fn test_session_ttl_enforcement() {
        let manager = PtyManager::new();
        let worktree_id = Uuid::new_v4();

        let result = manager.spawn(worktree_id, "/tmp/test-worktree", Some("ttl-test".to_string()), None);
        assert!(result.is_ok());

        let (session_id, _rx) = result.unwrap();
        assert_eq!(manager.session_count(), 1);

        sleep(TokioDuration::from_secs(2)).await;

        // With default TTL of 180s, session should NOT be expired after 2s
        PtyManager::check_ttl(&manager.sessions, None).await;

        assert_eq!(manager.session_count(), 1);
        assert!(manager.is_session_alive(session_id));

        let _ = manager.kill_session(session_id);
    }

    #[tokio::test]
    async fn test_write_and_read() {
        let manager = PtyManager::new();
        let worktree_id = Uuid::new_v4();

        let result = manager.spawn(
            worktree_id,
            "/tmp/test-worktree",
            Some("io-test".to_string()),
            Some("/bin/sh".to_string()),
        );
        assert!(result.is_ok());

        let (session_id, _rx) = result.unwrap();

        let write_result = manager.write(session_id, b"echo 'hello'\n");
        assert!(write_result.is_ok());

        sleep(TokioDuration::from_millis(100)).await;

        let _ = manager.kill_session(session_id);
    }

    #[tokio::test]
    async fn test_resize() {
        let manager = PtyManager::new();
        let worktree_id = Uuid::new_v4();

        let result = manager.spawn(worktree_id, "/tmp/test-worktree", Some("resize-test".to_string()), None);
        assert!(result.is_ok());

        let (session_id, _rx) = result.unwrap();

        let resize_result = manager.resize(session_id, 120, 40);
        assert!(resize_result.is_ok());

        let _ = manager.kill_session(session_id);
    }

    #[tokio::test]
    async fn test_kill_session() {
        let manager = PtyManager::new();
        let worktree_id = Uuid::new_v4();

        let result = manager.spawn(worktree_id, "/tmp/test-worktree", Some("kill-test".to_string()), None);
        assert!(result.is_ok());

        let (session_id, _rx) = result.unwrap();
        assert_eq!(manager.session_count(), 1);

        let kill_result = manager.kill_session(session_id);
        assert!(kill_result.is_ok());
        assert_eq!(manager.session_count(), 0);
    }

    #[tokio::test]
    async fn test_end_session() {
        let manager = PtyManager::new();
        let worktree_id = Uuid::new_v4();

        let result = manager.spawn(worktree_id, "/tmp/test-worktree", Some("end-test".to_string()), None);
        assert!(result.is_ok());

        let (session_id, _rx) = result.unwrap();
        assert_eq!(manager.session_count(), 1);
        assert!(manager.is_session_alive(session_id));

        // End the session gracefully
        let end_result = manager.end_session(session_id, "test_end");
        assert!(end_result.is_ok());

        // Session should still exist in memory but not be alive
        assert!(manager.get_session(session_id).is_some());
        assert!(!manager.is_session_alive(session_id));

        // Session count should be 0 (ended sessions don't count)
        assert_eq!(manager.session_count(), 0);

        // Verify the session is marked as ended
        let session = manager.get_session(session_id).unwrap();
        let s = session.lock().unwrap();
        assert!(s.is_ended);
        assert_eq!(s.ended_reason, Some("test_end".to_string()));
    }

    #[tokio::test]
    async fn test_get_or_create_session() {
        let manager = PtyManager::new();
        let worktree_id = Uuid::new_v4();
        let tab_id = Uuid::new_v4();

        // Create a session for this tab
        let (session_id_1, _rx_1) = manager
            .get_or_create_session(tab_id, worktree_id, "/tmp/test-worktree", Some("tab-session".to_string()), None)
            .unwrap();

        assert_eq!(manager.session_count(), 1);
        assert!(manager.is_session_alive(session_id_1));

        // Request another session for the same tab - should reuse existing
        let (session_id_2, _rx_2) = manager
            .get_or_create_session(tab_id, worktree_id, "/tmp/test-worktree", Some("tab-session-2".to_string()), None)
            .unwrap();

        assert_eq!(session_id_1, session_id_2);
        assert_eq!(manager.session_count(), 1);

        // End the session
        let _ = manager.end_session(session_id_1, "closed");

        // Now get_or_create should create a new session
        let (session_id_3, _rx_3) = manager
            .get_or_create_session(tab_id, worktree_id, "/tmp/test-worktree", Some("tab-session-3".to_string()), None)
            .unwrap();

        assert_ne!(session_id_1, session_id_3);
        assert_eq!(manager.session_count(), 1);
        assert!(manager.is_session_alive(session_id_3));

        let _ = manager.kill_session(session_id_3);
    }

    #[tokio::test]
    async fn test_is_session_alive() {
        let manager = PtyManager::new();
        let worktree_id = Uuid::new_v4();

        let result = manager.spawn(worktree_id, "/tmp/test-worktree", Some("alive-test".to_string()), None);
        assert!(result.is_ok());

        let (session_id, _rx) = result.unwrap();

        // Session should be alive
        assert!(manager.is_session_alive(session_id));

        // Non-existent session should not be alive
        assert!(!manager.is_session_alive(Uuid::new_v4()));

        // After ending, session should not be alive
        let _ = manager.end_session(session_id, "test");
        assert!(!manager.is_session_alive(session_id));
    }

    #[tokio::test]
    async fn test_cleanup_on_disconnect() {
        let manager = PtyManager::new();
        let worktree_id = Uuid::new_v4();

        for i in 0..3 {
            let result = manager.spawn(worktree_id, "/tmp/test-worktree", Some(format!("session-{}", i)), None);
            assert!(result.is_ok());
        }

        assert_eq!(manager.get_active_worktree_sessions(worktree_id).len(), 3);

        manager.cleanup_on_disconnect(worktree_id);

        assert_eq!(manager.get_active_worktree_sessions(worktree_id).len(), 0);
        assert_eq!(manager.session_count(), 0);
    }

    #[tokio::test]
    async fn test_detect_shell() {
        let manager = PtyManager::new();

        let result = manager.detect_shell(Some("/bin/sh".to_string()));
        assert!(result.is_ok());

        let result = manager.detect_shell(Some("/nonexistent/shell".to_string()));
        assert!(result.is_ok());
    }

    #[tokio::test]
    async fn test_shell_exists() {
        let manager = PtyManager::new();

        assert!(manager.shell_exists("/bin/sh"));
        assert!(!manager.shell_exists("/nonexistent/shell"));
    }

    #[tokio::test]
    async fn test_spawn_with_tab() {
        let manager = PtyManager::new();
        let worktree_id = Uuid::new_v4();
        let tab_id = Uuid::new_v4();

        let result = manager.spawn_with_tab(tab_id, worktree_id, "/tmp/test-worktree", Some("tab-test".to_string()), None);
        assert!(result.is_ok());

        let (session_id, _rx) = result.unwrap();

        // Verify tab_id is linked
        let session = manager.get_session(session_id).unwrap();
        let s = session.lock().unwrap();
        assert_eq!(s.tab_id, Some(tab_id));

        let _ = manager.kill_session(session_id);
    }

    #[tokio::test]
    async fn test_session_ttl_configurable() {
        // Test default TTL
        let ttl = session_ttl();
        assert_eq!(ttl, Duration::from_secs(180));

        // Test custom TTL from env
        std::env::set_var("TERMINAL_SESSION_TTL_SECS", "300");
        let ttl = session_ttl();
        assert_eq!(ttl, Duration::from_secs(300));
        std::env::remove_var("TERMINAL_SESSION_TTL_SECS");

        // Verify default is restored
        let ttl = session_ttl();
        assert_eq!(ttl, Duration::from_secs(180));
    }

    #[tokio::test]
    async fn test_ttl_check_interval() {
        // Verify TTL check interval is 30s
        assert_eq!(TTL_CHECK_INTERVAL, Duration::from_secs(30));
    }

    // --- Terminal Tab Rebuild Tests (Phase 9) ---

    #[tokio::test]
    async fn test_get_or_create_session_creates_new() {
        let manager = PtyManager::new();
        let worktree_id = Uuid::new_v4();
        let tab_id = Uuid::new_v4();

        // First call should create a new session
        let (session_id, rx) = manager
            .get_or_create_session(tab_id, worktree_id, "/tmp/test-worktree", Some("new-tab".to_string()), None)
            .unwrap();

        assert_eq!(manager.session_count(), 1);
        assert!(manager.is_session_alive(session_id));
        // New session should have an rx channel
        assert!(rx.is_some());

        let _ = manager.kill_session(session_id);
    }

    #[tokio::test]
    async fn test_get_or_create_session_reuses_existing() {
        let manager = PtyManager::new();
        let worktree_id = Uuid::new_v4();
        let tab_id = Uuid::new_v4();

        // Create first session
        let (session_id_1, _rx_1) = manager
            .get_or_create_session(tab_id, worktree_id, "/tmp/test-worktree", Some("reuse-tab".to_string()), None)
            .unwrap();
        assert_eq!(manager.session_count(), 1);

        // Second call should reuse existing active session
        let (session_id_2, rx_2) = manager
            .get_or_create_session(tab_id, worktree_id, "/tmp/test-worktree", Some("reuse-tab-2".to_string()), None)
            .unwrap();

        // Same session ID, no rx channel (output reader already exists)
        assert_eq!(session_id_1, session_id_2);
        assert!(rx_2.is_none());
        assert_eq!(manager.session_count(), 1);

        let _ = manager.kill_session(session_id_1);
    }

    #[tokio::test]
    async fn test_get_or_create_session_creates_after_ended() {
        let manager = PtyManager::new();
        let worktree_id = Uuid::new_v4();
        let tab_id = Uuid::new_v4();

        // Create and end session
        let (session_id_1, _rx_1) = manager
            .get_or_create_session(tab_id, worktree_id, "/tmp/test-worktree", Some("respawn-tab".to_string()), None)
            .unwrap();
        let _ = manager.end_session(session_id_1, "unmount");
        assert_eq!(manager.session_count(), 0);

        // get_or_create should spawn a new session for the same tab
        let (session_id_2, rx_2) = manager
            .get_or_create_session(tab_id, worktree_id, "/tmp/test-worktree", Some("respawn-tab-2".to_string()), None)
            .unwrap();

        assert_ne!(session_id_1, session_id_2);
        assert_eq!(manager.session_count(), 1);
        assert!(manager.is_session_alive(session_id_2));
        assert!(rx_2.is_some());

        let _ = manager.kill_session(session_id_2);
    }

    #[tokio::test]
    async fn test_session_ttl_expiry_broadcast() {
        let (broadcast_tx, mut broadcast_rx) = broadcast::channel::<crate::protocol::ServerMessage>(32);

        let manager = PtyManager::new();
        manager.set_broadcast_tx(broadcast_tx.clone());

        let worktree_id = Uuid::new_v4();
        let tab_id = Uuid::new_v4();

        // Set a very short TTL for testing
        std::env::set_var("TERMINAL_SESSION_TTL_SECS", "1");
        let (session_id, _rx) = manager
            .get_or_create_session(tab_id, worktree_id, "/tmp/test-worktree", Some("ttl-broadcast".to_string()), None)
            .unwrap();

        // Manually set last_activity to far in the past to simulate expiry
        {
            let session = manager.get_session(session_id).unwrap();
            let s = session.lock().unwrap();
            *s.last_activity.lock().unwrap() = Instant::now() - Duration::from_secs(2);
        }

        // Run TTL check
        PtyManager::check_ttl(&manager.sessions, Some(broadcast_tx)).await;

        // Session should be ended
        assert!(!manager.is_session_alive(session_id));

        // Should have broadcast TerminalSessionEnded
        if let Ok(msg) = broadcast_rx.try_recv() {
            if let crate::protocol::ServerMessagePayload::TerminalSessionEnded(ended) = &msg.payload {
                assert_eq!(ended.tab_id, tab_id);
                assert_eq!(ended.session_id, session_id);
                assert_eq!(ended.reason, "ttl");
            } else {
                panic!("Expected TerminalSessionEnded, got {:?}", msg.payload);
            }
        } else {
            panic!("Expected broadcast message");
        }

        std::env::remove_var("TERMINAL_SESSION_TTL_SECS");
    }

    #[tokio::test]
    async fn test_spawn_with_tab_links_tab_id() {
        let manager = PtyManager::new();
        let worktree_id = Uuid::new_v4();
        let tab_id = Uuid::new_v4();

        let (session_id, _rx) = manager
            .spawn_with_tab(tab_id, worktree_id, "/tmp/test-worktree", Some("linked-tab".to_string()), None)
            .unwrap();

        // Verify tab_id is correctly linked
        let session = manager.get_session(session_id).unwrap();
        let s = session.lock().unwrap();
        assert_eq!(s.tab_id, Some(tab_id));
        assert_eq!(s.worktree_id, worktree_id);

        let _ = manager.kill_session(session_id);
    }

    #[tokio::test]
    async fn test_end_session_updates_last_activity() {
        let manager = PtyManager::new();
        let worktree_id = Uuid::new_v4();

        let (session_id, _rx) = manager
            .spawn(worktree_id, "/tmp/test-worktree", Some("end-activity".to_string()), None)
            .unwrap();

        // Set last_activity to far in the past
        {
            let session = manager.get_session(session_id).unwrap();
            let mut s = session.lock().unwrap();
            *s.last_activity.lock().unwrap() = Instant::now() - Duration::from_secs(600);
        }

        // End the session
        manager.end_session(session_id, "test").unwrap();

        // After end_session, last_activity should be set to now (prevents TTL from interfering)
        let session = manager.get_session(session_id).unwrap();
        let s = session.lock().unwrap();
        let elapsed = s.last_activity.lock().unwrap().elapsed();
        assert!(elapsed.as_secs() < 5, "last_activity should have been reset to now");
        assert!(s.is_ended);
        assert_eq!(s.ended_reason, Some("test".to_string()));
    }

    #[tokio::test]
    async fn test_multiple_tabs_same_worktree() {
        let manager = PtyManager::new();
        let worktree_id = Uuid::new_v4();
        let tab_id_1 = Uuid::new_v4();
        let tab_id_2 = Uuid::new_v4();

        // Create sessions for two different tabs
        let (session_id_1, _) = manager
            .get_or_create_session(tab_id_1, worktree_id, "/tmp/test-worktree", Some("tab-1".to_string()), None)
            .unwrap();

        let (session_id_2, _) = manager
            .get_or_create_session(tab_id_2, worktree_id, "/tmp/test-worktree", Some("tab-2".to_string()), None)
            .unwrap();

        assert_eq!(manager.session_count(), 2);
        assert!(manager.is_session_alive(session_id_1));
        assert!(manager.is_session_alive(session_id_2));

        // Verify each session has the correct tab_id
        let s1 = manager.get_session(session_id_1).unwrap();
        assert_eq!(s1.lock().unwrap().tab_id, Some(tab_id_1));

        let s2 = manager.get_session(session_id_2).unwrap();
        assert_eq!(s2.lock().unwrap().tab_id, Some(tab_id_2));

        // End tab 1's session, tab 2 should still be alive
        let _ = manager.end_session(session_id_1, "unmount");
        assert_eq!(manager.session_count(), 1);
        assert!(!manager.is_session_alive(session_id_1));
        assert!(manager.is_session_alive(session_id_2));

        let _ = manager.kill_session(session_id_2);
    }

    #[tokio::test]
    async fn test_get_or_create_session_different_tabs_different_sessions() {
        let manager = PtyManager::new();
        let worktree_id = Uuid::new_v4();
        let tab_id_1 = Uuid::new_v4();
        let tab_id_2 = Uuid::new_v4();

        // Create session for tab 1
        let (session_id_1, _) = manager
            .get_or_create_session(tab_id_1, worktree_id, "/tmp/test-worktree", Some("diff-tab-1".to_string()), None)
            .unwrap();

        // Create session for tab 2 — should be different
        let (session_id_2, _) = manager
            .get_or_create_session(tab_id_2, worktree_id, "/tmp/test-worktree", Some("diff-tab-2".to_string()), None)
            .unwrap();

        assert_ne!(session_id_1, session_id_2);
        assert_eq!(manager.session_count(), 2);

        let _ = manager.kill_session(session_id_1);
        let _ = manager.kill_session(session_id_2);
    }

    #[tokio::test]
    async fn test_end_session_marks_ended() {
        let manager = PtyManager::new();
        let worktree_id = Uuid::new_v4();

        let (session_id, _rx) = manager
            .spawn(worktree_id, "/tmp/test-worktree", Some("end-marks-test".to_string()), None)
            .unwrap();

        // Verify session is active before ending
        assert!(manager.is_session_alive(session_id));

        // End the session
        let result = manager.end_session(session_id, "user_closed");
        assert!(result.is_ok());

        // Verify session is marked as ended
        let session = manager.get_session(session_id).expect("Session should still exist in memory");
        let s = session.lock().unwrap();
        assert!(s.is_ended, "Session should be marked as ended");
        assert_eq!(s.ended_reason, Some("user_closed".to_string()));
        // Session should no longer be considered alive
        drop(s);
        assert!(!manager.is_session_alive(session_id));

        let _ = manager.kill_session(session_id);
    }

    #[tokio::test]
    async fn test_is_session_alive_returns_true_for_active() {
        let manager = PtyManager::new();
        let worktree_id = Uuid::new_v4();

        let (session_id, _rx) = manager
            .spawn(worktree_id, "/tmp/test-worktree", Some("alive-true-test".to_string()), None)
            .unwrap();

        assert!(manager.is_session_alive(session_id), "Active session should return true");

        let _ = manager.kill_session(session_id);
    }

    #[tokio::test]
    async fn test_is_session_alive_returns_false_for_ended() {
        let manager = PtyManager::new();
        let worktree_id = Uuid::new_v4();

        let (session_id, _rx) = manager
            .spawn(worktree_id, "/tmp/test-worktree", Some("alive-false-test".to_string()), None)
            .unwrap();

        // End the session
        manager.end_session(session_id, "ended_for_test").unwrap();

        // Session should return false for is_session_alive
        assert!(!manager.is_session_alive(session_id), "Ended session should return false");

        // Non-existent session should also return false
        assert!(!manager.is_session_alive(Uuid::new_v4()), "Non-existent session should return false");
    }
}
