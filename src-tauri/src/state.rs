use std::sync::Mutex;


pub struct PtyState {
    // Placeholder for PTY state - will be implemented in Task 2
    pub pty: Mutex<Option<()>>,
}

impl PtyState {
    pub fn new() -> Self {
        Self {
            pty: Mutex::new(None),
        }
    }
}

impl Default for PtyState {
    fn default() -> Self {
        Self::new()
    }
}
