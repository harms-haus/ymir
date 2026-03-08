use dashmap::DashMap;
use portable_pty::{Child, MasterPty};
use std::io::Write;
use std::sync::Arc;
use tokio::sync::{broadcast, Mutex};

pub struct PtySession {
    pub master: Arc<Mutex<Box<dyn MasterPty + Send>>>,
    pub writer: Arc<Mutex<Box<dyn Write + Send>>>,
    pub child: Arc<Mutex<Box<dyn Child + Send + Sync>>>,
    pub workspace_id: Option<String>,
    pub pane_id: Option<String>,
    /// Broadcast sender for PTY output events
    /// Subscribers receive (event_type, data) tuples
    pub output_tx: broadcast::Sender<(String, String)>,
}

pub struct PtyState {
    pub sessions: Arc<DashMap<String, PtySession>>,
}

impl PtyState {
    pub fn new() -> Self {
        Self {
            sessions: Arc::new(DashMap::new()),
        }
    }
}

impl Default for PtyState {
    fn default() -> Self {
        Self::new()
    }
}
