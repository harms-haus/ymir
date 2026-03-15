use crate::types::ScrollbackLine;
use std::collections::HashMap;
use tokio::sync::mpsc;
use tokio::time::{interval, Duration, Instant};
use tracing::{debug, info};

pub const BATCH_SIZE: usize = 50;
pub const BATCH_TIMEOUT_MS: u64 = 500;
pub const CHUNK_SIZE: usize = 1000;
const DEBUG_SCROLLBACK: bool = true;

#[derive(Debug, Clone, PartialEq)]
pub struct ScrollbackChunk {
    pub chunk_number: u32,
    pub lines: Vec<ScrollbackLine>,
    pub line_count: usize,
}

#[derive(Debug)]
struct PendingBatch {
    lines: Vec<ScrollbackLine>,
    created_at: Instant,
}

impl PendingBatch {
    fn new() -> Self {
        Self {
            lines: Vec::with_capacity(BATCH_SIZE),
            created_at: Instant::now(),
        }
    }

    fn is_expired(&self) -> bool {
        self.created_at.elapsed().as_millis() >= BATCH_TIMEOUT_MS as u128
    }

    fn len(&self) -> usize {
        self.lines.len()
    }

    fn is_empty(&self) -> bool {
        self.lines.is_empty()
    }
}

#[derive(Debug)]
struct TabScrollbackState {
    pending: PendingBatch,
    completed_chunks: Vec<ScrollbackChunk>,
    next_chunk_number: u32,
    total_line_count: usize,
    staging_area: Vec<ScrollbackLine>,
}

impl TabScrollbackState {
    fn new() -> Self {
        Self {
            pending: PendingBatch::new(),
            completed_chunks: Vec::new(),
            next_chunk_number: 0,
            total_line_count: 0,
            staging_area: Vec::with_capacity(CHUNK_SIZE),
        }
    }

    fn add_lines(&mut self, lines: Vec<ScrollbackLine>) {
        for line in lines {
            self.pending.lines.push(line);

            if self.pending.len() >= BATCH_SIZE {
                self.flush_batch();
            }
        }
    }

    fn flush_batch(&mut self) {
        if self.pending.is_empty() {
            return;
        }

        let lines = std::mem::replace(&mut self.pending.lines, Vec::with_capacity(BATCH_SIZE));
        self.pending.created_at = Instant::now();

        self.staging_area.extend(lines);

        while self.staging_area.len() >= CHUNK_SIZE {
            let chunk_lines: Vec<ScrollbackLine> = self.staging_area.drain(..CHUNK_SIZE).collect();
            self.total_line_count += CHUNK_SIZE;
            self.completed_chunks.push(ScrollbackChunk {
                chunk_number: self.next_chunk_number,
                lines: chunk_lines,
                line_count: CHUNK_SIZE,
            });
            self.next_chunk_number += 1;
        }
    }

    fn force_flush(&mut self) -> Vec<ScrollbackChunk> {
        self.flush_batch();

        if !self.staging_area.is_empty() {
            let count = self.staging_area.len();
            let chunk_lines: Vec<ScrollbackLine> = self.staging_area.drain(..).collect();
            self.total_line_count += count;
            self.completed_chunks.push(ScrollbackChunk {
                chunk_number: self.next_chunk_number,
                lines: chunk_lines,
                line_count: count,
            });
            self.next_chunk_number += 1;
        }

        self.completed_chunks.clone()
    }

    fn get_merged_scrollback(&self) -> Vec<ScrollbackLine> {
        let mut result = Vec::with_capacity(
            self.total_line_count + self.pending.len() + self.staging_area.len(),
        );

        for chunk in &self.completed_chunks {
            result.extend(chunk.lines.clone());
        }

        result.extend(self.staging_area.clone());
        result.extend(self.pending.lines.clone());

        result
    }

    fn get_chunked_scrollback(&self) -> Vec<ScrollbackChunk> {
        let mut result = self.completed_chunks.clone();

        if !self.staging_area.is_empty() {
            result.push(ScrollbackChunk {
                chunk_number: self.next_chunk_number,
                lines: self.staging_area.clone(),
                line_count: self.staging_area.len(),
            });
        }

        if !self.pending.is_empty() {
            let pending_chunk_num = if result.is_empty() {
                self.next_chunk_number
            } else {
                self.next_chunk_number + 1
            };
            result.push(ScrollbackChunk {
                chunk_number: pending_chunk_num,
                lines: self.pending.lines.clone(),
                line_count: self.pending.len(),
            });
        }

        result
    }

    fn clear(&mut self) {
        self.pending = PendingBatch::new();
        self.completed_chunks.clear();
        self.next_chunk_number = 0;
        self.total_line_count = 0;
        self.staging_area.clear();
    }
}

#[derive(Debug)]
pub enum ScrollbackCommand {
    AddLines {
        tab_id: String,
        lines: Vec<ScrollbackLine>,
    },
    FlushTab {
        tab_id: String,
        respond_to: tokio::sync::oneshot::Sender<Vec<ScrollbackChunk>>,
    },
    GetScrollback {
        tab_id: String,
        respond_to: tokio::sync::oneshot::Sender<Vec<ScrollbackLine>>,
    },
    GetChunks {
        tab_id: String,
        respond_to: tokio::sync::oneshot::Sender<Vec<ScrollbackChunk>>,
    },
    ClearTab {
        tab_id: String,
    },
    Shutdown,
}

#[derive(Clone)]
pub struct ScrollbackService {
    command_tx: mpsc::UnboundedSender<ScrollbackCommand>,
}

impl ScrollbackService {
    pub fn new() -> Self {
        let (command_tx, command_rx) = mpsc::unbounded_channel();
        tokio::spawn(run_service(command_rx));
        Self { command_tx }
    }

    pub fn add_lines(&self, tab_id: impl Into<String>, lines: Vec<ScrollbackLine>) {
        let tab_id = tab_id.into();
        if DEBUG_SCROLLBACK {
            debug!(tab_id = %tab_id, line_count = lines.len(), "[SCROLLBACK] add_lines: adding lines to pending batch");
        }
        if let Err(_e) = self
            .command_tx
            .send(ScrollbackCommand::AddLines { tab_id, lines })
        {
            // Silently drop send errors (service may be shutting down)
        }
    }

    pub async fn flush_tab(&self, tab_id: impl Into<String>) -> Vec<ScrollbackChunk> {
        let tab_id = tab_id.into();
        if DEBUG_SCROLLBACK {
            debug!(tab_id = %tab_id, "[SCROLLBACK] flush_tab: flushing tab scrollback");
        }
        
        let (tx, rx) = tokio::sync::oneshot::channel();

        if let Err(_e) = self.command_tx.send(ScrollbackCommand::FlushTab {
            tab_id,
            respond_to: tx,
        }) {
            return Vec::new();
        }

        rx.await.unwrap_or_default()
    }

    pub async fn get_scrollback(&self, tab_id: impl Into<String>) -> Vec<ScrollbackLine> {
        let tab_id = tab_id.into();
        let tab_id_for_log = tab_id.clone();
        if DEBUG_SCROLLBACK {
            debug!(tab_id = %tab_id_for_log, "[SCROLLBACK] get_scrollback: requesting scrollback for tab");
        }
        
        let (tx, rx) = tokio::sync::oneshot::channel();

        if let Err(_e) = self.command_tx.send(ScrollbackCommand::GetScrollback {
            tab_id,
            respond_to: tx,
        }) {
            return Vec::new();
        }

        let result = rx.await.unwrap_or_default();
        if DEBUG_SCROLLBACK {
            debug!(tab_id = %tab_id_for_log, line_count = result.len(), "[SCROLLBACK] get_scrollback: returning lines");
        }
        result
    }

    pub async fn get_chunks(&self, tab_id: impl Into<String>) -> Vec<ScrollbackChunk> {
        let tab_id = tab_id.into();
        let (tx, rx) = tokio::sync::oneshot::channel();

        if let Err(_e) = self.command_tx.send(ScrollbackCommand::GetChunks {
            tab_id,
            respond_to: tx,
        }) {
            return Vec::new();
        }

        rx.await.unwrap_or_default()
    }

    pub fn clear_tab(&self, tab_id: impl Into<String>) {
        let tab_id = tab_id.into();
        if let Err(_e) = self.command_tx.send(ScrollbackCommand::ClearTab { tab_id }) {
            // Silently drop send errors
        }
    }

    pub fn shutdown(&self) {
        let _ = self.command_tx.send(ScrollbackCommand::Shutdown);
    }
}

impl Default for ScrollbackService {
    fn default() -> Self {
        Self::new()
    }
}

async fn run_service(mut command_rx: mpsc::UnboundedReceiver<ScrollbackCommand>) {
    let mut tabs: HashMap<String, TabScrollbackState> = HashMap::new();
    let mut flush_interval = interval(Duration::from_millis(BATCH_TIMEOUT_MS));

    loop {
        tokio::select! {
            Some(cmd) = command_rx.recv() => {
                match cmd {
                    ScrollbackCommand::AddLines { tab_id, lines } => {
                        let state = tabs.entry(tab_id.clone()).or_insert_with(TabScrollbackState::new);
                        state.add_lines(lines);
                    }
                    ScrollbackCommand::FlushTab { tab_id, respond_to } => {
                        let chunks = if let Some(state) = tabs.get_mut(&tab_id) {
                            state.force_flush()
                        } else {
                            Vec::new()
                        };
                        let _ = respond_to.send(chunks);
                    }
                    ScrollbackCommand::GetScrollback { tab_id, respond_to } => {
                        let scrollback = if let Some(state) = tabs.get(&tab_id) {
                            state.get_merged_scrollback()
                        } else {
                            Vec::new()
                        };
                        let _ = respond_to.send(scrollback);
                    }
                    ScrollbackCommand::GetChunks { tab_id, respond_to } => {
                        let chunks = if let Some(state) = tabs.get(&tab_id) {
                            state.get_chunked_scrollback()
                        } else {
                            Vec::new()
                        };
                        let _ = respond_to.send(chunks);
                    }
                    ScrollbackCommand::ClearTab { tab_id } => {
                        if let Some(state) = tabs.get_mut(&tab_id) {
                            state.clear();
                        }
                    }
                    ScrollbackCommand::Shutdown => {
                        break;
                    }
                }
            }
            _ = flush_interval.tick() => {
                for (_tab_id, state) in tabs.iter_mut() {
                    if !state.pending.is_empty() && state.pending.is_expired() {
                        state.flush_batch();
                    }
                }
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn create_test_line(text: &str) -> ScrollbackLine {
        ScrollbackLine {
            text: text.to_string(),
            ansi: None,
            timestamp: None,
        }
    }

    #[tokio::test]
    async fn test_service_creation() {
        let service = ScrollbackService::new();
        service.shutdown();
    }

    #[tokio::test]
    async fn test_add_single_line() {
        let service = ScrollbackService::new();
        let tab_id = "test-tab-1";

        service.add_lines(tab_id, vec![create_test_line("Hello, World!")]);
        tokio::time::sleep(Duration::from_millis(10)).await;

        let scrollback = service.get_scrollback(tab_id).await;
        assert_eq!(scrollback.len(), 1);
        assert_eq!(scrollback[0].text, "Hello, World!");

        service.shutdown();
    }

    #[tokio::test]
    async fn test_add_multiple_lines() {
        let service = ScrollbackService::new();
        let tab_id = "test-tab-2";

        let lines: Vec<ScrollbackLine> = (0..10)
            .map(|i| create_test_line(&format!("Line {}", i)))
            .collect();

        service.add_lines(tab_id, lines);
        tokio::time::sleep(Duration::from_millis(10)).await;

        let scrollback = service.get_scrollback(tab_id).await;
        assert_eq!(scrollback.len(), 10);
        assert_eq!(scrollback[0].text, "Line 0");
        assert_eq!(scrollback[9].text, "Line 9");

        service.shutdown();
    }

    #[tokio::test]
    async fn test_batch_flush_on_size() {
        let service = ScrollbackService::new();
        let tab_id = "test-tab-3";

        let lines: Vec<ScrollbackLine> = (0..BATCH_SIZE)
            .map(|i| create_test_line(&format!("Batch line {}", i)))
            .collect();

        service.add_lines(tab_id, lines);
        let chunks = service.flush_tab(tab_id).await;

        assert_eq!(chunks.len(), 1);
        assert_eq!(chunks[0].line_count, BATCH_SIZE);
        assert_eq!(chunks[0].lines.len(), BATCH_SIZE);

        service.shutdown();
    }

    #[tokio::test]
    async fn test_chunking_at_1000_lines() {
        let service = ScrollbackService::new();
        let tab_id = "test-tab-4";

        let total_lines = CHUNK_SIZE + 100;
        let lines: Vec<ScrollbackLine> = (0..total_lines)
            .map(|i| create_test_line(&format!("Chunk line {}", i)))
            .collect();

        service.add_lines(tab_id, lines);
        let chunks = service.flush_tab(tab_id).await;

        assert_eq!(chunks.len(), 2);
        assert_eq!(chunks[0].line_count, CHUNK_SIZE);
        assert_eq!(chunks[1].line_count, 100);

        service.shutdown();
    }

    #[tokio::test]
    async fn test_batch_timeout_flush() {
        let service = ScrollbackService::new();
        let tab_id = "test-tab-5";

        service.add_lines(
            tab_id,
            vec![create_test_line("Line 1"), create_test_line("Line 2")],
        );

        tokio::time::sleep(Duration::from_millis(BATCH_TIMEOUT_MS + 100)).await;

        let scrollback = service.get_scrollback(tab_id).await;
        assert_eq!(scrollback.len(), 2);
        assert_eq!(scrollback[0].text, "Line 1");
        assert_eq!(scrollback[1].text, "Line 2");

        service.shutdown();
    }

    #[tokio::test]
    async fn test_merged_scrollback_order() {
        let service = ScrollbackService::new();
        let tab_id = "test-tab-6";

        for batch in 0..3 {
            let lines: Vec<ScrollbackLine> = (0..BATCH_SIZE)
                .map(|i| create_test_line(&format!("Batch {} Line {}", batch, i)))
                .collect();
            service.add_lines(tab_id, lines);
        }

        let _ = service.flush_tab(tab_id).await;
        let scrollback = service.get_scrollback(tab_id).await;

        assert_eq!(scrollback.len(), BATCH_SIZE * 3);

        for (i, line) in scrollback.iter().enumerate() {
            let expected_batch = i / BATCH_SIZE;
            let expected_line = i % BATCH_SIZE;
            assert_eq!(
                line.text,
                format!("Batch {} Line {}", expected_batch, expected_line)
            );
        }

        service.shutdown();
    }

    #[tokio::test]
    async fn test_get_chunks_structure() {
        let service = ScrollbackService::new();
        let tab_id = "test-tab-7";

        let lines: Vec<ScrollbackLine> = (0..CHUNK_SIZE + 500)
            .map(|i| create_test_line(&format!("Line {}", i)))
            .collect();

        service.add_lines(tab_id, lines);
        let _ = service.flush_tab(tab_id).await;

        let chunks = service.get_chunks(tab_id).await;

        assert_eq!(chunks.len(), 2);
        assert_eq!(chunks[0].chunk_number, 0);
        assert_eq!(chunks[1].chunk_number, 1);
        assert_eq!(chunks[0].line_count, CHUNK_SIZE);
        assert_eq!(chunks[1].line_count, 500);

        service.shutdown();
    }

    #[tokio::test]
    async fn test_clear_tab() {
        let service = ScrollbackService::new();
        let tab_id = "test-tab-8";

        service.add_lines(
            tab_id,
            vec![create_test_line("Line 1"), create_test_line("Line 2")],
        );

        tokio::time::sleep(Duration::from_millis(10)).await;

        let scrollback = service.get_scrollback(tab_id).await;
        assert_eq!(scrollback.len(), 2);

        service.clear_tab(tab_id);
        tokio::time::sleep(Duration::from_millis(10)).await;

        let scrollback = service.get_scrollback(tab_id).await;
        assert_eq!(scrollback.len(), 0);

        service.shutdown();
    }

    #[tokio::test]
    async fn test_multiple_tabs_isolation() {
        let service = ScrollbackService::new();

        service.add_lines("tab-a", vec![create_test_line("Tab A Line")]);
        service.add_lines("tab-b", vec![create_test_line("Tab B Line")]);

        tokio::time::sleep(Duration::from_millis(10)).await;

        let scrollback_a = service.get_scrollback("tab-a").await;
        let scrollback_b = service.get_scrollback("tab-b").await;

        assert_eq!(scrollback_a.len(), 1);
        assert_eq!(scrollback_b.len(), 1);
        assert_eq!(scrollback_a[0].text, "Tab A Line");
        assert_eq!(scrollback_b[0].text, "Tab B Line");

        service.shutdown();
    }

    #[tokio::test]
    async fn test_empty_tab_returns_empty() {
        let service = ScrollbackService::new();

        let scrollback = service.get_scrollback("nonexistent-tab").await;
        assert!(scrollback.is_empty());

        let chunks = service.get_chunks("nonexistent-tab").await;
        assert!(chunks.is_empty());

        service.shutdown();
    }

    #[tokio::test]
    async fn test_flush_empty_tab() {
        let service = ScrollbackService::new();

        let chunks = service.flush_tab("empty-tab").await;
        assert!(chunks.is_empty());

        service.shutdown();
    }

    #[tokio::test]
    async fn test_large_batch_chunking() {
        let service = ScrollbackService::new();
        let tab_id = "test-tab-large";

        let lines: Vec<ScrollbackLine> = (0..2500)
            .map(|i| create_test_line(&format!("Large line {}", i)))
            .collect();

        service.add_lines(tab_id, lines);
        let chunks = service.flush_tab(tab_id).await;

        assert_eq!(chunks.len(), 3);
        assert_eq!(chunks[0].line_count, 1000);
        assert_eq!(chunks[1].line_count, 1000);
        assert_eq!(chunks[2].line_count, 500);

        assert_eq!(chunks[0].chunk_number, 0);
        assert_eq!(chunks[1].chunk_number, 1);
        assert_eq!(chunks[2].chunk_number, 2);

        service.shutdown();
    }

    #[tokio::test]
    async fn test_partial_batch_retrieval() {
        let service = ScrollbackService::new();
        let tab_id = "test-tab-partial";

        service.add_lines(
            tab_id,
            vec![create_test_line("Pending 1"), create_test_line("Pending 2")],
        );

        tokio::time::sleep(Duration::from_millis(10)).await;

        let chunks = service.get_chunks(tab_id).await;

        assert_eq!(chunks.len(), 1);
        assert_eq!(chunks[0].line_count, 2);
        assert_eq!(chunks[0].lines[0].text, "Pending 1");
        assert_eq!(chunks[0].lines[1].text, "Pending 2");

        service.shutdown();
    }
}
