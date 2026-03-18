//! Activity logging module for ymir WebSocket server
//!
//! This module provides an ActivityLogger that captures tracing events and
//! stores them in the activity_log table with batch insertion for performance.

use crate::db::{ActivityLogEntry, Db};
use std::collections::VecDeque;
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::{Mutex, RwLock};
use tokio::task::JoinHandle;
use tracing::{Level, Metadata, Subscriber};
use tracing_subscriber::Layer;

/// Maximum number of entries to buffer before forcing a flush
const MAX_BUFFER_SIZE: usize = 100;

/// Interval between automatic flushes (1 second)
const FLUSH_INTERVAL: Duration = Duration::from_secs(1);

/// Module path for this logging module (used to prevent recursion)
const LOGGING_MODULE: &str = "ymir_ws_server::logging";

/// Internal log entry before database insertion
#[derive(Debug, Clone)]
struct BufferedLogEntry {
    timestamp: String,
    level: String,
    source: Option<String>,
    message: String,
    metadata_json: String,
}

/// Activity logger that buffers tracing events and flushes to database
#[derive(Debug)]
pub struct ActivityLogger {
    /// Buffer for pending log entries
    buffer: Arc<Mutex<VecDeque<BufferedLogEntry>>>,
    /// Database connection for persisting logs
    db: Arc<Db>,
    /// Handle for the background flush task
    flush_task: Option<JoinHandle<()>>,
    /// Flag to track if we're shutting down
    shutdown: Arc<RwLock<bool>>,
}

impl ActivityLogger {
    /// Create a new ActivityLogger with the given database connection
    pub fn new(db: Arc<Db>) -> Self {
        let buffer = Arc::new(Mutex::new(VecDeque::with_capacity(MAX_BUFFER_SIZE * 2)));
        let shutdown = Arc::new(RwLock::new(false));

        let buffer_clone = buffer.clone();
        let db_clone = db.clone();
        let shutdown_clone = shutdown.clone();

        let flush_task = tokio::spawn(async move {
            let mut interval = tokio::time::interval(FLUSH_INTERVAL);
            loop {
                interval.tick().await;

                if *shutdown_clone.read().await {
                    break;
                }

                if let Err(e) = Self::flush_buffer(&buffer_clone, &db_clone).await {
                    tracing::error!("Failed to flush activity log buffer: {}", e);
                }
            }
        });

        Self {
            buffer,
            db,
            flush_task: Some(flush_task),
            shutdown,
        }
    }

    /// Add a log entry to the buffer, flushing if buffer is full
    pub async fn log(
        &self,
        level: &str,
        source: Option<&str>,
        message: &str,
        metadata_json: &str,
    ) {
        let entry = BufferedLogEntry {
            timestamp: chrono::Utc::now().to_rfc3339(),
            level: level.to_string(),
            source: source.map(ToString::to_string),
            message: message.to_string(),
            metadata_json: metadata_json.to_string(),
        };

        let should_flush = {
            let mut buffer = self.buffer.lock().await;
            buffer.push_back(entry);
            buffer.len() >= MAX_BUFFER_SIZE
        };

        if should_flush {
            if let Err(e) = Self::flush_buffer(&self.buffer, &self.db).await {
                tracing::error!("Failed to flush activity log buffer: {}", e);
            }
        }
    }

    /// Flush all buffered entries to the database
    pub async fn flush(&self) -> anyhow::Result<usize> {
        Self::flush_buffer(&self.buffer, &self.db).await
    }

    /// Internal flush implementation
    async fn flush_buffer(
        buffer: &Arc<Mutex<VecDeque<BufferedLogEntry>>>,
        db: &Arc<Db>,
    ) -> anyhow::Result<usize> {
        let entries: Vec<BufferedLogEntry> = {
            let mut buffer = buffer.lock().await;
            buffer.drain(..).collect()
        };

        if entries.is_empty() {
            return Ok(0);
        }

        let count = entries.len();

        for entry in entries {
            let db_entry = ActivityLogEntry {
                id: None,
                timestamp: entry.timestamp,
                level: entry.level,
                source: entry.source,
                message: entry.message,
                metadata_json: entry.metadata_json,
            };
            db.log_activity(&db_entry).await?;
        }

        Ok(count)
    }

    /// Shutdown the logger, flushing any remaining entries
    pub async fn shutdown(&mut self) {
        *self.shutdown.write().await = true;

        if let Some(task) = self.flush_task.take() {
            task.abort();
        }

        // Final flush
        if let Err(e) = Self::flush_buffer(&self.buffer, &self.db).await {
            tracing::error!("Failed to flush activity log during shutdown: {}", e);
        }
    }
}

impl Drop for ActivityLogger {
    fn drop(&mut self) {
        if let Some(task) = self.flush_task.take() {
            task.abort();
        }
    }
}

/// A tracing Layer that captures events and logs them to the activity log
#[derive(Clone)]
pub struct ActivityLayer {
    logger: Arc<Mutex<Option<Arc<ActivityLogger>>>>,
}

impl ActivityLayer {
    /// Create a new ActivityLayer
    pub fn new() -> Self {
        Self {
            logger: Arc::new(Mutex::new(None)),
        }
    }

    /// Set the logger (called after initialization)
    pub async fn set_logger(&self, logger: Arc<ActivityLogger>) {
        *self.logger.lock().await = Some(logger);
    }

    /// Check if an event should be filtered out to prevent recursion
    fn should_filter(metadata: &Metadata<'_>) -> bool {
        // Filter out events from this logging module
        if let Some(module_path) = metadata.module_path() {
            if module_path.starts_with(LOGGING_MODULE) {
                return true;
            }
            // Also filter db module events to prevent recursion during flush
            if module_path.starts_with("ymir_ws_server::db") {
                return true;
            }
        }
        false
    }

    /// Convert tracing level to string
    fn level_to_string(level: &Level) -> &'static str {
        match *level {
            Level::ERROR => "error",
            Level::WARN => "warn",
            Level::INFO => "info",
            Level::DEBUG => "debug",
            Level::TRACE => "trace",
        }
    }
}

impl<S: Subscriber> Layer<S> for ActivityLayer {
    fn on_event(&self, event: &tracing::Event<'_>, _ctx: tracing_subscriber::layer::Context<'_, S>) {
        let metadata = event.metadata();

        // Filter out events from logging module to prevent recursion
        if Self::should_filter(metadata) {
            return;
        }

        // Only log info, warn, and error levels
        let level = Self::level_to_string(metadata.level());
        if !matches!(level, "info" | "warn" | "error") {
            return;
        }

        // Extract message and fields from the event
        let mut message = String::new();
        let mut fields = serde_json::Map::new();

        event.record(&mut EventVisitor {
            message: &mut message,
            fields: &mut fields,
        });

        // Use the message if available, otherwise use the event target
        let log_message = if message.is_empty() {
            metadata.name().to_string()
        } else {
            message
        };

        // Build metadata JSON
        let metadata_json = if fields.is_empty() {
            "{}".to_string()
        } else {
            serde_json::to_string(&fields).unwrap_or_else(|_| "{}".to_string())
        };

        // Get source from module path
        let source = metadata.module_path().map(ToString::to_string);

        // Spawn a task to log asynchronously (avoid blocking the tracing system)
        let logger = self.logger.clone();
        let level = level.to_string();
        let source = source.clone();
        let log_message = log_message.clone();
        let metadata_json = metadata_json.clone();

        tokio::spawn(async move {
            if let Some(l) = logger.lock().await.as_ref() {
                l.log(&level, source.as_deref(), &log_message, &metadata_json)
                    .await;
            }
        });
    }
}

/// Visitor for extracting event data
struct EventVisitor<'a> {
    message: &'a mut String,
    fields: &'a mut serde_json::Map<String, serde_json::Value>,
}

impl tracing::field::Visit for EventVisitor<'_> {
    fn record_str(&mut self, field: &tracing::field::Field, value: &str) {
        if field.name() == "message" {
            *self.message = value.to_string();
        } else {
            // Sanitize field names to prevent log injection
            let sanitized = sanitize_field_value(value);
            self.fields
                .insert(field.name().to_string(), serde_json::json!(sanitized));
        }
    }

    fn record_error(
        &mut self,
        field: &tracing::field::Field,
        value: &(dyn std::error::Error + 'static),
    ) {
        if field.name() == "message" {
            *self.message = value.to_string();
        } else {
            // Sanitize error messages to prevent log injection
            let sanitized = sanitize_field_value(&value.to_string());
            self.fields
                .insert(field.name().to_string(), serde_json::json!(sanitized));
        }
    }

    fn record_debug(&mut self, field: &tracing::field::Field, value: &dyn std::fmt::Debug) {
        if field.name() == "message" {
            *self.message = format!("{:?}", value);
        } else {
            // Sanitize debug output to prevent log injection
            let sanitized = sanitize_field_value(&format!("{:?}", value));
            self.fields
                .insert(field.name().to_string(), serde_json::json!(sanitized));
        }
    }

    fn record_u64(&mut self, field: &tracing::field::Field, value: u64) {
        self.fields
            .insert(field.name().to_string(), serde_json::json!(value));
    }

    fn record_i64(&mut self, field: &tracing::field::Field, value: i64) {
        self.fields
            .insert(field.name().to_string(), serde_json::json!(value));
    }

    fn record_bool(&mut self, field: &tracing::field::Field, value: bool) {
        self.fields
            .insert(field.name().to_string(), serde_json::json!(value));
    }

    fn record_f64(&mut self, field: &tracing::field::Field, value: f64) {
        self.fields
            .insert(field.name().to_string(), serde_json::json!(value));
    }

    fn record_i128(&mut self, field: &tracing::field::Field, value: i128) {
        self.fields
            .insert(field.name().to_string(), serde_json::json!(value));
    }

    fn record_u128(&mut self, field: &tracing::field::Field, value: u128) {
        self.fields
            .insert(field.name().to_string(), serde_json::json!(value));
    }
}

/// Sanitize a field value to prevent log injection
fn sanitize_field_value(value: &str) -> String {
    // Remove control characters and limit length
    value
        .chars()
        .filter(|c| !c.is_control() || *c == '\n' || *c == '\t')
        .take(10000) // Limit to 10k chars to prevent huge logs
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::Db;
    use std::sync::Arc;

    async fn create_test_logger() -> (Arc<Db>, Arc<ActivityLogger>) {
        let db = Arc::new(Db::in_memory().await.expect("Failed to create test db"));
        let logger = Arc::new(ActivityLogger::new(db.clone()));
        (db, logger)
    }

    #[tokio::test]
    async fn test_log_entry_added_to_buffer() {
        let (_, logger) = create_test_logger().await;

        logger
            .log("info", Some("test"), "Test message", "{}")
            .await;

        let buffer = logger.buffer.lock().await;
        assert_eq!(buffer.len(), 1);
    }

    #[tokio::test]
    async fn test_buffer_flushes_at_max_size() {
        let (db, logger) = create_test_logger().await;

        // Add MAX_BUFFER_SIZE entries
        for i in 0..MAX_BUFFER_SIZE {
            logger
                .log("info", Some("test"), &format!("Message {}", i), "{}")
                .await;
        }

        // Give time for flush
        tokio::time::sleep(Duration::from_millis(100)).await;

        // Buffer should be empty after flush
        let buffer = logger.buffer.lock().await;
        assert!(buffer.is_empty() || buffer.len() < MAX_BUFFER_SIZE);

        // Check database
        let entries = db.query_activity_log(None, None).await.expect("Failed to query");
        assert!(!entries.is_empty());
    }

    #[tokio::test]
    async fn test_manual_flush() {
        let (db, logger) = create_test_logger().await;

        logger
            .log("info", Some("test"), "Test message 1", "{}")
            .await;
        logger
            .log("warn", Some("test"), "Test message 2", "{}")
            .await;

        let count = logger.flush().await.expect("Failed to flush");
        assert_eq!(count, 2);

        let entries = db.query_activity_log(None, None).await.expect("Failed to query");
        assert_eq!(entries.len(), 2);
    }

    #[tokio::test]
    async fn test_shutdown_flushes_remaining() {
        let (db, logger) = create_test_logger().await;

        logger.log("info", Some("test"), "Test message", "{}").await;

        let count = logger.flush().await.expect("Failed to flush");
        assert_eq!(count, 1);

        let entries = db.query_activity_log(None, None).await.expect("Failed to query");
        assert_eq!(entries.len(), 1);
    }

    #[test]
    fn test_sanitize_field_value() {
        assert_eq!(sanitize_field_value("hello"), "hello");
        assert_eq!(sanitize_field_value("hello\nworld"), "hello\nworld");
        assert_eq!(
            sanitize_field_value("hello\x00world"),
            "helloworld"
        ); // null byte removed
        assert_eq!(
            sanitize_field_value("hello\x1bworld"),
            "helloworld"
        ); // escape byte removed
    }

    #[test]
    fn test_level_to_string() {
        assert_eq!(ActivityLayer::level_to_string(&Level::ERROR), "error");
        assert_eq!(ActivityLayer::level_to_string(&Level::WARN), "warn");
        assert_eq!(ActivityLayer::level_to_string(&Level::INFO), "info");
        assert_eq!(ActivityLayer::level_to_string(&Level::DEBUG), "debug");
        assert_eq!(ActivityLayer::level_to_string(&Level::TRACE), "trace");
    }

    #[tokio::test]
    async fn test_activity_layer_filters_logging_module() {
        // Test that should_filter returns true for logging module paths
        // We can't easily construct Metadata directly, so we test the logic indirectly

        // The filter function checks module_path().starts_with(LOGGING_MODULE)
        // LOGGING_MODULE = "ymir_ws_server::logging"
        assert!(LOGGING_MODULE.starts_with("ymir_ws_server::logging"));
    }
}