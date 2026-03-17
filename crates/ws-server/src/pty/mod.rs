//! PTY session manager for terminal emulation
//!
//! This module provides cross-platform PTY session management with TTL enforcement,
//! session limits, and proper resource cleanup.

use anyhow::{anyhow, Result};
use portable_pty::{native_pty_system, CommandBuilder, PtySize};
use std::collections::HashMap;
use std::io::{Read, Write};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use tokio::sync::mpsc;
use tokio::time::interval;
use tracing::{debug, info, warn};
use uuid::Uuid;

const MAX_SESSIONS_PER_WORKTREE: usize = 10;
const SESSION_TTL: Duration = Duration::from_secs(3600);
const TTL_CHECK_INTERVAL: Duration = Duration::from_secs(60);

pub struct PtySession {
    pub id: Uuid,
    pub worktree_id: Uuid,
    pub shell: String,
    pub label: Option<String>,
    pub start_time: Instant,
    pub last_activity: Arc<Mutex<Instant>>,
    master: Box<dyn portable_pty::MasterPty + Send>,
    _process: Box<dyn portable_pty::Child + Send + Sync>,
    tx: mpsc::UnboundedSender<Vec<u8>>,
}

impl PtySession {
    fn new(
        id: Uuid,
        worktree_id: Uuid,
        shell: String,
        label: Option<String>,
        master: Box<dyn portable_pty::MasterPty + Send>,
        process: Box<dyn portable_pty::Child + Send + Sync>,
        tx: mpsc::UnboundedSender<Vec<u8>>,
    ) -> Self {
        let now = Instant::now();
        Self {
            id,
            worktree_id,
            shell,
            label,
            start_time: now,
            last_activity: Arc::new(Mutex::new(now)),
            master,
            _process: process,
            tx,
        }
    }

    pub fn write(&self, data: &[u8]) -> Result<()> {
        let mut writer = self.master.take_writer()?;
        writer.write_all(data)?;
        writer.flush()?;
        
        *self.last_activity.lock().unwrap() = Instant::now();
        
        Ok(())
    }

    pub fn read(&self) -> Result<Vec<u8>> {
        let mut reader = self.master.try_clone_reader()?;
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
        let size = PtySize {
            rows,
            cols,
            pixel_width: 0,
            pixel_height: 0,
        };
        self.master.resize(size)?;
        
        #[cfg(unix)]
        {
            use nix::sys::signal::{kill, Signal};
            use nix::unistd::Pid;
            
            if let Some(pid) = self._process.process_id() {
                if let Ok(pid) = pid.try_into() {
                    let _ = kill(Pid::from_raw(pid), Signal::SIGWINCH);
                }
            }
        }
        
        Ok(())
    }

    pub fn kill(&mut self) -> Result<()> {
        self._process.kill()?;
        Ok(())
    }

    pub fn is_expired(&self) -> bool {
        let last_activity = *self.last_activity.lock().unwrap();
        last_activity.elapsed() > SESSION_TTL
    }

    pub fn output_tx(&self) -> mpsc::UnboundedSender<Vec<u8>> {
        self.tx.clone()
    }
}

pub struct PtyManager {
    sessions: Arc<Mutex<HashMap<Uuid, PtySession>>>,
    _ttl_handle: Option<tokio::task::JoinHandle<()>>,
}

impl PtyManager {
    pub fn new() -> Arc<Self> {
        let sessions = Arc::new(Mutex::new(HashMap::new()));
        let sessions_clone = sessions.clone();
        
        let ttl_handle = tokio::spawn(async move {
            let mut interval = interval(TTL_CHECK_INTERVAL);
            loop {
                interval.tick().await;
                Self::check_ttl(&sessions_clone).await;
            }
        });
        
        Arc::new(Self {
            sessions,
            _ttl_handle: Some(ttl_handle),
        })
    }

    pub fn spawn(
        &self,
        worktree_id: Uuid,
        label: Option<String>,
        shell: Option<String>,
    ) -> Result<(Uuid, mpsc::UnboundedReceiver<Vec<u8>>)> {
        let session_count = {
            let sessions = self.sessions.lock().unwrap();
            sessions
                .values()
                .filter(|s| s.worktree_id == worktree_id)
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

        let cmd = CommandBuilder::new(&shell_path);
        let child = pair.slave.spawn_command(cmd)?;
        
        let master = pair.master;
        drop(pair.slave);

        let session_id = Uuid::new_v4();
        let (tx, rx) = mpsc::unbounded_channel();
        
        let session = PtySession::new(
            session_id,
            worktree_id,
            shell_path,
            label,
            master,
            child,
            tx,
        );

        self.sessions.lock().unwrap().insert(session_id, session);
        
        info!("Created PTY session {} for worktree {}", session_id, worktree_id);
        
        Ok((session_id, rx))
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
        std::path::Path::new(path).exists() && std::fs::metadata(path).map(|m| m.is_file()).unwrap_or(false)
    }

    pub fn get_session(&self, session_id: Uuid) -> Option<Arc<Mutex<PtySession>>> {
        let sessions = self.sessions.lock().unwrap();
        sessions.get(&session_id).map(|session| {
            Arc::new(Mutex::new(PtySession {
                id: session.id,
                worktree_id: session.worktree_id,
                shell: session.shell.clone(),
                label: session.label.clone(),
                start_time: session.start_time,
                last_activity: session.last_activity.clone(),
                master: unsafe { std::ptr::read(&session.master) },
                _process: unsafe { std::ptr::read(&session._process) },
                tx: session.tx.clone(),
            }))
        })
    }

    pub fn write(&self, session_id: Uuid, data: &[u8]) -> Result<()> {
        let sessions = self.sessions.lock().unwrap();
        if let Some(session) = sessions.get(&session_id) {
            session.write(data)?;
            Ok(())
        } else {
            Err(anyhow!("Session {} not found", session_id))
        }
    }

    pub fn resize(&self, session_id: Uuid, cols: u16, rows: u16) -> Result<()> {
        let sessions = self.sessions.lock().unwrap();
        if let Some(session) = sessions.get(&session_id) {
            session.resize(cols, rows)?;
            Ok(())
        } else {
            Err(anyhow!("Session {} not found", session_id))
        }
    }

    pub fn kill(&self, session_id: Uuid) -> Result<()> {
        let mut sessions = self.sessions.lock().unwrap();
        if let Some(mut session) = sessions.remove(&session_id) {
            session.kill()?;
            info!("Killed PTY session {}", session_id);
            Ok(())
        } else {
            Err(anyhow!("Session {} not found", session_id))
        }
    }

    pub fn cleanup_on_disconnect(&self, worktree_id: Uuid) {
        let mut sessions = self.sessions.lock().unwrap();
        let session_ids: Vec<Uuid> = sessions
            .iter()
            .filter(|(_, session)| session.worktree_id == worktree_id)
            .map(|(id, _)| *id)
            .collect();

        for session_id in session_ids {
            if let Some(mut session) = sessions.remove(&session_id) {
                let _ = session.kill();
                info!("Cleaned up PTY session {} for disconnected worktree {}", session_id, worktree_id);
            }
        }
    }

    async fn check_ttl(sessions: &Arc<Mutex<HashMap<Uuid, PtySession>>>) {
        let expired_sessions: Vec<Uuid> = {
            let sessions_guard = sessions.lock().unwrap();
            sessions_guard
                .iter()
                .filter(|(_, session)| session.is_expired())
                .map(|(id, _)| *id)
                .collect()
        };

        if !expired_sessions.is_empty() {
            let mut sessions_guard = sessions.lock().unwrap();
            for session_id in expired_sessions {
                if let Some(mut session) = sessions_guard.remove(&session_id) {
                    let _ = session.kill();
                    warn!("Terminated expired PTY session {}", session_id);
                }
            }
        }
    }

    pub fn session_count(&self) -> usize {
        self.sessions.lock().unwrap().len()
    }

    pub fn get_worktree_sessions(&self, worktree_id: Uuid) -> Vec<Uuid> {
        let sessions = self.sessions.lock().unwrap();
        sessions
            .iter()
            .filter(|(_, session)| session.worktree_id == worktree_id)
            .map(|(id, _)| *id)
            .collect()
    }
}

impl Drop for PtyManager {
    fn drop(&mut self) {
        let mut sessions = self.sessions.lock().unwrap();
        for (session_id, mut session) in sessions.drain() {
            let _ = session.kill();
            debug!("Cleaned up PTY session {} on manager drop", session_id);
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
        
        let result = manager.spawn(worktree_id, Some("test-session".to_string()), None);
        assert!(result.is_ok());
        
        let (session_id, _rx) = result.unwrap();
        assert_eq!(manager.session_count(), 1);
        
        let _ = manager.kill(session_id);
    }

    #[tokio::test]
    async fn test_max_sessions_per_worktree() {
        let manager = PtyManager::new();
        let worktree_id = Uuid::new_v4();
        
        for i in 0..MAX_SESSIONS_PER_WORKTREE {
            let result = manager.spawn(worktree_id, Some(format!("session-{}", i)), None);
            assert!(result.is_ok(), "Failed to create session {}", i);
        }
        
        let result = manager.spawn(worktree_id, Some("extra-session".to_string()), None);
        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("Maximum number of sessions"));
        
        let sessions = manager.get_worktree_sessions(worktree_id);
        for session_id in sessions {
            let _ = manager.kill(session_id);
        }
    }

    #[tokio::test]
    async fn test_session_ttl_enforcement() {
        let manager = PtyManager::new();
        let worktree_id = Uuid::new_v4();
        
        let result = manager.spawn(worktree_id, Some("ttl-test".to_string()), None);
        assert!(result.is_ok());
        
        let (session_id, _rx) = result.unwrap();
        assert_eq!(manager.session_count(), 1);
        
        sleep(TokioDuration::from_secs(2)).await;
        
        PtyManager::check_ttl(&manager.sessions).await;
        
        assert_eq!(manager.session_count(), 1);
        
        let _ = manager.kill(session_id);
    }

    #[tokio::test]
    async fn test_write_and_read() {
        let manager = PtyManager::new();
        let worktree_id = Uuid::new_v4();
        
        let result = manager.spawn(worktree_id, Some("io-test".to_string()), Some("/bin/sh".to_string()));
        assert!(result.is_ok());
        
        let (session_id, _rx) = result.unwrap();
        
        let write_result = manager.write(session_id, b"echo 'hello'\n");
        assert!(write_result.is_ok());
        
        sleep(TokioDuration::from_millis(100)).await;
        
        let _ = manager.kill(session_id);
    }

    #[tokio::test]
    async fn test_resize() {
        let manager = PtyManager::new();
        let worktree_id = Uuid::new_v4();
        
        let result = manager.spawn(worktree_id, Some("resize-test".to_string()), None);
        assert!(result.is_ok());
        
        let (session_id, _rx) = result.unwrap();
        
        let resize_result = manager.resize(session_id, 120, 40);
        assert!(resize_result.is_ok());
        
        let _ = manager.kill(session_id);
    }

    #[tokio::test]
    async fn test_kill_session() {
        let manager = PtyManager::new();
        let worktree_id = Uuid::new_v4();
        
        let result = manager.spawn(worktree_id, Some("kill-test".to_string()), None);
        assert!(result.is_ok());
        
        let (session_id, _rx) = result.unwrap();
        assert_eq!(manager.session_count(), 1);
        
        let kill_result = manager.kill(session_id);
        assert!(kill_result.is_ok());
        assert_eq!(manager.session_count(), 0);
    }

    #[tokio::test]
    async fn test_cleanup_on_disconnect() {
        let manager = PtyManager::new();
        let worktree_id = Uuid::new_v4();
        
        for i in 0..3 {
            let result = manager.spawn(worktree_id, Some(format!("session-{}", i)), None);
            assert!(result.is_ok());
        }
        
        assert_eq!(manager.get_worktree_sessions(worktree_id).len(), 3);
        
        manager.cleanup_on_disconnect(worktree_id);
        
        assert_eq!(manager.get_worktree_sessions(worktree_id).len(), 0);
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
}