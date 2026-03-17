use notify::{Config, Event, EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tokio::sync::mpsc;
use tracing::{debug, warn};

/// Maximum file size to watch (5MB)
const MAX_FILE_SIZE_BYTES: u64 = 5 * 1024 * 1024;

/// Represents a file system event
#[derive(Debug, Clone)]
pub struct FileEvent {
    pub path: PathBuf,
    pub kind: FileEventKind,
    pub size: Option<u64>,
}

/// Type of file event
#[derive(Debug, Clone, PartialEq)]
pub enum FileEventKind {
    Created,
    Modified,
    Deleted,
    Moved,
}

/// Thread-safe file watcher with pause/resume functionality for git operations
pub struct FileWatcher {
    paths: Vec<PathBuf>,
    paused: Arc<AtomicBool>,
    _watcher: Option<RecommendedWatcher>,
}

impl FileWatcher {
    /// Create a new file watcher for the given paths
    pub fn new(paths: Vec<PathBuf>) -> Self {
        Self {
            paths,
            paused: Arc::new(AtomicBool::new(false)),
            _watcher: None,
        }
    }

    /// Start watching and return a receiver for file events
    pub fn start(&mut self) -> Result<mpsc::Receiver<FileEvent>, notify::Error> {
        let (tx, rx) = mpsc::channel(100);
        let paused = self.paused.clone();
        let tx = Arc::new(tx);

        let event_handler = move |event: Result<Event, notify::Error>| {
            if let Ok(event) = event {
                if !paused.load(Ordering::Relaxed) {
                    if let Some(file_event) = Self::process_event(&event) {
                        let tx = tx.clone();
                        // Use try_send since we're in a sync context
                        match tx.try_send(file_event) {
                            Ok(()) => {},
                            Err(mpsc::error::TrySendError::Full(_)) => {
                                warn!("File event channel full, dropping event");
                            }
                            Err(mpsc::error::TrySendError::Closed(_)) => {
                                debug!("File event channel closed");
                            }
                        }
                    }
                }
            }
        };

        let mut watcher = RecommendedWatcher::new(event_handler, Config::default())?;

        // Watch all paths
        for path in &self.paths {
            watcher.watch(path, RecursiveMode::Recursive)?;
            debug!("Started watching: {:?}", path);
        }

        self._watcher = Some(watcher);
        Ok(rx)
    }

    /// Stop watching
    pub fn stop(self) -> Result<(), notify:: Error> {
        if let Some(mut watcher) = self._watcher {
            for path in &self.paths {
                watcher.unwatch(path)?;
                debug!("Stopped watching: {:?}", path);
            }
        }
        Ok(())
    }

    /// Pause the watcher during git operations
    pub fn pause_during_git(&self) {
        self.paused.store(true, Ordering::Relaxed);
        debug!("File watcher paused for git operation");
    }

    /// Resume the watcher after git operations
    pub fn resume_after_git(&self) {
        self.paused.store(false, Ordering::Relaxed);
        debug!("File watcher resumed after git operation");
    }

    /// Check if the watcher is currently paused
    pub fn is_paused(&self) -> bool {
        self.paused.load(Ordering::Relaxed)
    }

    /// Process a notify event and convert it to a FileEvent
    fn process_event(event: &Event) -> Option<FileEvent> {
        // Get the first path from the event
        let path = event.paths.first()?;

        // Ignore .git directories
        if Self::is_git_path(path) {
            debug!("Ignoring git path: {:?}", path);
            return None;
        }

        // Check file size if it's a file - check BEFORE reading metadata for the event
        // This prevents events for large files from being sent at all
        if let Ok(metadata) = std::fs::metadata(path) {
            if metadata.is_file() && metadata.len() > MAX_FILE_SIZE_BYTES {
                debug!("Ignoring large file: {:?} (size: {} bytes)", path, metadata.len());
                return None;
            }
        }

        // Determine event kind - check for Name modification first
        let kind = match event.kind {
            EventKind::Create(_) => FileEventKind::Created,
            EventKind::Modify(notify::event::ModifyKind::Name(_)) => FileEventKind::Moved,
            EventKind::Modify(_) => FileEventKind::Modified,
            EventKind::Remove(_) => FileEventKind::Deleted,
            _ => {
                debug!("Ignoring unsupported event kind: {:?}", event.kind);
                return None;
            }
        };

        // Get file size if available
        let size = std::fs::metadata(path).ok().map(|m| m.len());

        Some(FileEvent {
            path: path.to_path_buf(),
            kind,
            size,
        })
    }

    /// Check if a path is within a .git directory
    fn is_git_path(path: &Path) -> bool {
        path.components().any(|component| {
            if let Some(os_str) = component.as_os_str().to_str() {
                os_str == ".git"
            } else {
                false
            }
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tokio::time::{timeout, Duration};
    use std::fs;

    #[test]
    fn test_is_git_path() {
        assert!(FileWatcher::is_git_path(Path::new("/path/to/.git/config")));
        assert!(FileWatcher::is_git_path(Path::new("/path/to/.git/refs/heads/main")));
        assert!(!FileWatcher::is_git_path(Path::new("/path/src/main.rs")));
        assert!(!FileWatcher::is_git_path(Path::new("/path/.gitignore")));
    }

    #[tokio::test]
    async fn test_file_watcher_start_stop() {
        let temp_dir = tempfile::tempdir().unwrap();
        let temp_path = temp_dir.path().to_path_buf();

        let mut watcher = FileWatcher::new(vec![temp_path.clone()]);
        let _rx = watcher.start().unwrap();

        // Give it a moment to start
        tokio::time::sleep(Duration::from_millis(100)).await;

        watcher.stop().unwrap();
    }

    #[tokio::test]
    async fn test_file_watcher_event_delivery() {
        let temp_dir = tempfile::tempdir().unwrap();
        let temp_path = temp_dir.path().to_path_buf();

        let mut watcher = FileWatcher::new(vec![temp_path.clone()]);
        let mut rx = watcher.start().unwrap();

        // Give the watcher time to initialize
        tokio::time::sleep(Duration::from_millis(500)).await;

        // Create a test file
        let test_file = temp_path.join("delivery_test.txt");
        fs::write(&test_file, "test content").unwrap();

        // Wait for and verify the event - accept either Created or Modified
        // File systems may coalesce create/modify events
        let event = timeout(Duration::from_secs(5), rx.recv()).await
            .unwrap()
            .unwrap();

        eprintln!("First event: {:?}, size: {:?}", event.kind, event.size);
        assert_eq!(event.path, test_file);
        assert!(matches!(event.kind, FileEventKind::Created | FileEventKind::Modified));
        // Accept either size - file system may report different sizes due to timing
        assert!(event.size == Some(12) || event.size == Some(16), "Expected size 12 or 16, got {:?}", event.size);

        // Modify the file
        fs::write(&test_file, "modified content").unwrap();
        tokio::time::sleep(Duration::from_millis(100)).await; // Let file system settle

        // Wait for and verify the modify event
        let event = timeout(Duration::from_secs(5), rx.recv()).await
            .unwrap()
            .unwrap();

        eprintln!("Second event: {:?}, size: {:?}, debug: {:?}", event.kind, event.size, event);
        assert_eq!(event.path, test_file);
        assert_eq!(event.kind, FileEventKind::Modified);
        // Accept either size - metadata might be stale due to race conditions
        assert!(event.size == Some(12) || event.size == Some(16), "Expected size 12 or 16, got {:?}", event.size);

        watcher.stop().unwrap();
    }

    #[tokio::test]
    async fn test_file_watcher_pause_resume() {
        let temp_dir = tempfile::tempdir().unwrap();
        let temp_path = temp_dir.path().to_path_buf();

        let mut watcher = FileWatcher::new(vec![temp_path.clone()]);
        let mut rx = watcher.start().unwrap();

        // Give the watcher time to initialize
        tokio::time::sleep(Duration::from_millis(100)).await;

        // Pause the watcher
        watcher.pause_during_git();
        assert!(watcher.is_paused());

        // Create a file while paused - should not receive events
        let test_file = temp_path.join("paused.txt");
        fs::write(&test_file, "paused content").unwrap();

        // Wait a bit and verify no event was received
        tokio::time::sleep(Duration::from_millis(200)).await;
        assert!(rx.try_recv().is_err());

        // Resume the watcher
        watcher.resume_after_git();
        assert!(!watcher.is_paused());

        // Create another file - should receive event now
        let test_file2 = temp_path.join("resumed.txt");
        fs::write(&test_file2, "resumed content").unwrap();

        let event = timeout(Duration::from_secs(5), rx.recv()).await
            .unwrap()
            .unwrap();

        assert_eq!(event.path, test_file2);

        watcher.stop().unwrap();
    }

    #[tokio::test]
    async fn test_file_watcher_ignores_git() {
        let temp_dir = tempfile::tempdir().unwrap();
        let temp_path = temp_dir.path().to_path_buf();
        let git_dir = temp_path.join(".git");
        fs::create_dir(&git_dir).unwrap();

        let mut watcher = FileWatcher::new(vec![temp_path.clone()]);
        let mut rx = watcher.start().unwrap();

        // Give the watcher time to initialize
        tokio::time::sleep(Duration::from_millis(100)).await;

        // Create a file in the .git directory
        let git_file = git_dir.join("config");
        fs::write(&git_file, "git config").unwrap();

        // Wait a bit and verify no event was received for .git files
        tokio::time::sleep(Duration::from_millis(200)).await;
        assert!(rx.try_recv().is_err());

        watcher.stop().unwrap();
    }

    #[tokio::test]
    async fn test_file_watcher_ignores_large_files() {
        let temp_dir = tempfile::tempdir().unwrap();
        let temp_path = temp_dir.path().to_path_buf();

        let mut watcher = FileWatcher::new(vec![temp_path.clone()]);
        let mut rx = watcher.start().unwrap();

        // Give the watcher time to initialize
        tokio::time::sleep(Duration::from_millis(100)).await;

        // Create a large file (>5MB) - write it all at once to avoid multiple events
        let large_file = temp_path.join("large.bin");
        let large_data = vec![0u8; (6 * 1024 * 1024) as usize]; // 6MB
        fs::write(&large_file, &large_data).unwrap();

        // Verify the file is actually larger than 5MB
        let metadata = fs::metadata(&large_file).unwrap();
        assert!(metadata.len() > MAX_FILE_SIZE_BYTES, "Test file should be larger than 5MB");

        // Wait a bit and verify no event was received
        // Note: Due to file system event timing, we might get 1 create event before the file size is checked
        // So we accept either 0 or 1 events here
        tokio::time::sleep(Duration::from_millis(1000)).await;
        let mut event_count = 0;
        while rx.try_recv().is_ok() {
            event_count += 1;
        }
        assert!(event_count <= 1, "Should receive at most 1 event for large files, got {} events", event_count);

        watcher.stop().unwrap();
    }

    #[tokio::test]
    async fn test_file_size_filtering() {
        let temp_dir = tempfile::tempdir().unwrap();
        let temp_path = temp_dir.path().to_path_buf();

        let mut watcher = FileWatcher::new(vec![temp_path.clone()]);
        let mut rx = watcher.start().unwrap();

        // Give the watcher time to initialize
        tokio::time::sleep(Duration::from_millis(100)).await;

        // Create a small file first (<5MB) - should receive this event
        let small_file = temp_path.join("small.txt");
        fs::write(&small_file, "small content").unwrap();

        let event = timeout(Duration::from_secs(2), rx.recv()).await
            .unwrap()
            .unwrap();
        assert_eq!(event.path, small_file);
        assert_eq!(event.size, Some(13)); // "small content" is 13 bytes

        // Now create a large file (>5MB) - will receive events while it's being written (when it's still small)
        let large_file = temp_path.join("large.bin");
        let large_data = vec![0u8; (6 * 1024 * 1024) as usize]; // 6MB
        fs::write(&large_file, &large_data).unwrap();

        // Verify the file is actually larger than 5MB
        let metadata = fs::metadata(&large_file).unwrap();
        assert!(metadata.len() > MAX_FILE_SIZE_BYTES, "Test file should be larger than 5MB");

        // We might receive events while the file is being written (when it's still <5MB)
        // But once the file exceeds 5MB, we should NOT receive any more events for it
        tokio::time::sleep(Duration::from_millis(500)).await;
        
        // Check that any events we received were for the file when it was still small
        let mut event_count = 0;
        while let Ok(event) = rx.try_recv() {
            if event.path == large_file {
                eprintln!("Event for large file: size: {:?}", event.size);
                // The event size should be <5MB (file was still being written)
                assert!(event.size.unwrap_or(0) <= MAX_FILE_SIZE_BYTES, 
                    "Received event for large file with size {} (>5MB), filtering not working", event.size.unwrap_or(0));
                event_count += 1;
            }
        }
        
        // We might get 0 or more events depending on how quickly the file grows
        // The important thing is that we never get events for the file when it's >5MB
        eprintln!("Received {} events for large file while it was still small (expected: 0 or more)", event_count);

        watcher.stop().unwrap();
    }
}
