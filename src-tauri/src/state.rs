use dashmap::DashMap;
use portable_pty::{Child, MasterPty};
use std::sync::Arc;
use tokio::sync::Mutex;

#[derive(Clone)]
pub struct PtySession {
    pub master: Arc<Mutex<Box<dyn MasterPty + Send>>>,
    pub child: Arc<Mutex<Box<dyn Child + Send + Sync>>>,
}

pub struct PtyState {
    pub sessions: DashMap<String, PtySession>,
}

impl PtyState {
    pub fn new() -> Self {
        Self {
            sessions: DashMap::new(),
        }
    }
}

impl Default for PtyState {
    fn default() -> Self {
        Self::new()
    }
}
