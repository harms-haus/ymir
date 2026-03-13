use crate::db::client::DatabaseClient;
use crate::pty::manager::{PtyConfig, PtyManager, PtyOutput};
use crate::scrollback::service::ScrollbackService;
use crate::server::protocol::{OutgoingMessage, ProtocolError};
use crate::types::{CoreError, Result, ScrollbackLine};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::sync::Arc;
use tokio::sync::broadcast;

fn escape_sql(value: &str) -> String {
    value.replace("'", "''")
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConnectPtyInput {
    pub tab_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConnectPtyOutput {
    pub tab_id: String,
    pub connected: bool,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WritePtyInput {
    pub tab_id: String,
    pub data: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WritePtyOutput {
    pub tab_id: String,
    pub bytes_written: usize,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ResizePtyInput {
    pub tab_id: String,
    pub cols: u16,
    pub rows: u16,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ResizePtyOutput {
    pub tab_id: String,
    pub cols: u16,
    pub rows: u16,
}

#[derive(Debug, Clone, Serialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum PtyNotification {
    Output { tab_id: String, data: String },
    Notification { tab_id: String, message: String },
    Exit { tab_id: String, code: Option<u32> },
}

#[derive(Clone)]
pub struct PtyHandler {
    db: Arc<DatabaseClient>,
    pty_manager: Arc<PtyManager>,
    scrollback_service: Arc<ScrollbackService>,
}

impl PtyHandler {
    pub fn new(
        db: Arc<DatabaseClient>,
        pty_manager: Arc<PtyManager>,
        scrollback_service: Arc<ScrollbackService>,
    ) -> Self {
        Self {
            db,
            pty_manager,
            scrollback_service,
        }
    }

    /// Connect to an existing PTY session and subscribe to output
    pub async fn connect(&self, input: ConnectPtyInput) -> Result<ConnectPtyOutput> {
        let tab_id = &input.tab_id;
        let tab_id_escaped = escape_sql(tab_id);

        // Verify tab exists
        let sql = format!("SELECT id FROM tabs WHERE id = '{}'", tab_id_escaped);
        let mut rows = self.db.query(&sql, ()).await?;

        if rows
            .next()
            .await
            .map_err(|e| CoreError::Database(e.to_string()))?
            .is_none()
        {
            return Err(CoreError::InvalidTabId(format!(
                "Tab not found: {}",
                tab_id
            )));
        }

        // Verify PTY session exists
        if !self.pty_manager.is_alive(tab_id) {
            return Err(CoreError::PtyError(format!(
                "PTY session not found for tab: {}",
                tab_id
            )));
        }

        let _receiver = self.pty_manager.subscribe(tab_id)?;

        Ok(ConnectPtyOutput {
            tab_id: tab_id.clone(),
            connected: true,
        })
    }

    /// Write data to an existing PTY session
    pub async fn write(&self, input: WritePtyInput) -> Result<WritePtyOutput> {
        let tab_id = &input.tab_id;
        let tab_id_escaped = escape_sql(tab_id);

        // Verify tab exists
        let sql = format!("SELECT id FROM tabs WHERE id = '{}'", tab_id_escaped);
        let mut rows = self.db.query(&sql, ()).await?;

        if rows
            .next()
            .await
            .map_err(|e| CoreError::Database(e.to_string()))?
            .is_none()
        {
            return Err(CoreError::InvalidTabId(format!(
                "Tab not found: {}",
                tab_id
            )));
        }

        // Verify PTY session exists
        if !self.pty_manager.is_alive(tab_id) {
            return Err(CoreError::PtyError(format!(
                "PTY session not found for tab: {}",
                tab_id
            )));
        }

        // Write to PTY
        self.pty_manager.write(tab_id, &input.data).await?;

        Ok(WritePtyOutput {
            tab_id: tab_id.clone(),
            bytes_written: input.data.len(),
        })
    }

    /// Resize an existing PTY session
    pub async fn resize(&self, input: ResizePtyInput) -> Result<ResizePtyOutput> {
        let tab_id = &input.tab_id;
        let tab_id_escaped = escape_sql(tab_id);

        // Verify tab exists
        let sql = format!("SELECT id FROM tabs WHERE id = '{}'", tab_id_escaped);
        let mut rows = self.db.query(&sql, ()).await?;

        if rows
            .next()
            .await
            .map_err(|e| CoreError::Database(e.to_string()))?
            .is_none()
        {
            return Err(CoreError::InvalidTabId(format!(
                "Tab not found: {}",
                tab_id
            )));
        }

        // Verify PTY session exists
        if !self.pty_manager.is_alive(tab_id) {
            return Err(CoreError::PtyError(format!(
                "PTY session not found for tab: {}",
                tab_id
            )));
        }

        // Resize PTY
        self.pty_manager
            .resize(tab_id, input.cols, input.rows)
            .await?;

        Ok(ResizePtyOutput {
            tab_id: tab_id.clone(),
            cols: input.cols,
            rows: input.rows,
        })
    }

    /// Spawn a new PTY session (internal use, not exposed as RPC)
    pub async fn spawn(&self, tab_id: &str, config: PtyConfig) -> Result<String> {
        self.pty_manager.spawn(tab_id, config).await
    }

    /// Kill a PTY session (internal use, not exposed as RPC)
    pub async fn kill(&self, tab_id: &str) -> Result<()> {
        self.pty_manager.kill(tab_id).await
    }

    /// Check if PTY session is alive (internal use)
    pub fn is_alive(&self, tab_id: &str) -> bool {
        self.pty_manager.is_alive(tab_id)
    }

    /// Subscribe to PTY output (internal use)
    pub fn subscribe(&self, tab_id: &str) -> Result<broadcast::Receiver<PtyOutput>> {
        self.pty_manager.subscribe(tab_id)
    }

    /// Process PTY output and store in scrollback
    pub async fn process_output(&self, tab_id: &str, data: &str) {
        let lines: Vec<ScrollbackLine> = data
            .lines()
            .map(|line| ScrollbackLine {
                text: line.to_string(),
                ansi: None,
                timestamp: Some(
                    std::time::SystemTime::now()
                        .duration_since(std::time::UNIX_EPOCH)
                        .unwrap_or_default()
                        .as_secs(),
                ),
            })
            .collect();

        self.scrollback_service.add_lines(tab_id, lines);
    }

    pub fn create_notification(&self, notification: PtyNotification) -> OutgoingMessage {
        let method = "pty.output".to_string();
        let params = serde_json::to_value(notification).ok();
        OutgoingMessage::notification(method, params)
    }
}

pub struct PtyRpcHandler {
    inner: PtyHandler,
}

impl PtyRpcHandler {
    pub fn new(
        db: Arc<DatabaseClient>,
        pty_manager: Arc<PtyManager>,
        scrollback_service: Arc<ScrollbackService>,
    ) -> Self {
        Self {
            inner: PtyHandler::new(db, pty_manager, scrollback_service),
        }
    }

    pub async fn handle(
        &self,
        method: &str,
        params: Option<Value>,
    ) -> std::result::Result<Value, ProtocolError> {
        match method {
            "pty.connect" => {
                let input: ConnectPtyInput = params
                    .map(|p| {
                        serde_json::from_value(p)
                            .map_err(|e| ProtocolError::InvalidParams(e.to_string()))
                    })
                    .unwrap_or(Err(ProtocolError::InvalidParams(
                        "Missing params".to_string(),
                    )))?;

                let output = self.inner.connect(input).await.map_err(|e| {
                    ProtocolError::InternalError(format!("Failed to connect to PTY: {}", e))
                })?;

                serde_json::to_value(output)
                    .map_err(|e| ProtocolError::InternalError(e.to_string()))
            }
            "pty.write" => {
                let input: WritePtyInput = params
                    .map(|p| {
                        serde_json::from_value(p)
                            .map_err(|e| ProtocolError::InvalidParams(e.to_string()))
                    })
                    .unwrap_or(Err(ProtocolError::InvalidParams(
                        "Missing params".to_string(),
                    )))?;

                let output = self.inner.write(input).await.map_err(|e| {
                    ProtocolError::InternalError(format!("Failed to write to PTY: {}", e))
                })?;

                serde_json::to_value(output)
                    .map_err(|e| ProtocolError::InternalError(e.to_string()))
            }
            "pty.resize" => {
                let input: ResizePtyInput = params
                    .map(|p| {
                        serde_json::from_value(p)
                            .map_err(|e| ProtocolError::InvalidParams(e.to_string()))
                    })
                    .unwrap_or(Err(ProtocolError::InvalidParams(
                        "Missing params".to_string(),
                    )))?;

                let output = self.inner.resize(input).await.map_err(|e| {
                    ProtocolError::InternalError(format!("Failed to resize PTY: {}", e))
                })?;

                serde_json::to_value(output)
                    .map_err(|e| ProtocolError::InternalError(e.to_string()))
            }
            _ => Err(ProtocolError::MethodNotFound(method.to_string())),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::client::DatabaseClient;

    async fn setup_test_db() -> Arc<DatabaseClient> {
        let client = DatabaseClient::new_in_memory().await.unwrap();

        client
            .execute(
                "CREATE TABLE tabs (
                    id TEXT PRIMARY KEY,
                    workspace_id TEXT NOT NULL,
                    pane_id TEXT NOT NULL,
                    title TEXT DEFAULT 'bash',
                    cwd TEXT,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )",
                (),
            )
            .await
            .unwrap();

        Arc::new(client)
    }

    async fn create_test_tab(db: &DatabaseClient, id: &str) {
        let sql = format!(
            "INSERT INTO tabs (id, workspace_id, pane_id) VALUES ('{}', 'ws-test', 'pane-test')",
            escape_sql(id)
        );
        db.execute(&sql, ()).await.unwrap();
    }

    #[tokio::test]
    async fn test_connect_to_existing_pty() {
        let db = setup_test_db().await;
        let pty_manager = Arc::new(PtyManager::new());
        let scrollback_service = Arc::new(ScrollbackService::new());
        let handler = PtyHandler::new(db.clone(), pty_manager.clone(), scrollback_service);

        create_test_tab(&db, "tab-connect").await;

        // Spawn PTY first
        let config = PtyConfig::new();
        pty_manager.spawn("tab-connect", config).await.unwrap();

        // Connect to existing PTY
        let input = ConnectPtyInput {
            tab_id: "tab-connect".to_string(),
        };
        let output = handler.connect(input).await.unwrap();

        assert_eq!(output.tab_id, "tab-connect");
        assert!(output.connected);

        // Cleanup
        let _ = pty_manager.kill("tab-connect").await;
    }

    #[tokio::test]
    async fn test_connect_tab_not_found() {
        let db = setup_test_db().await;
        let pty_manager = Arc::new(PtyManager::new());
        let scrollback_service = Arc::new(ScrollbackService::new());
        let handler = PtyHandler::new(db, pty_manager, scrollback_service);

        let input = ConnectPtyInput {
            tab_id: "non-existent".to_string(),
        };
        let result = handler.connect(input).await;
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_connect_pty_not_found() {
        let db = setup_test_db().await;
        let pty_manager = Arc::new(PtyManager::new());
        let scrollback_service = Arc::new(ScrollbackService::new());
        let handler = PtyHandler::new(db.clone(), pty_manager, scrollback_service);

        create_test_tab(&db, "tab-no-pty").await;

        let input = ConnectPtyInput {
            tab_id: "tab-no-pty".to_string(),
        };
        let result = handler.connect(input).await;
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_write_to_pty() {
        let db = setup_test_db().await;
        let pty_manager = Arc::new(PtyManager::new());
        let scrollback_service = Arc::new(ScrollbackService::new());
        let handler = PtyHandler::new(db.clone(), pty_manager.clone(), scrollback_service);

        create_test_tab(&db, "tab-write").await;

        // Spawn PTY first
        let config = PtyConfig::new();
        pty_manager.spawn("tab-write", config).await.unwrap();

        // Write to PTY
        let input = WritePtyInput {
            tab_id: "tab-write".to_string(),
            data: "echo hello\n".to_string(),
        };
        let output = handler.write(input).await.unwrap();

        assert_eq!(output.tab_id, "tab-write");
        assert_eq!(output.bytes_written, 11);

        // Cleanup
        let _ = pty_manager.kill("tab-write").await;
    }

    #[tokio::test]
    async fn test_write_tab_not_found() {
        let db = setup_test_db().await;
        let pty_manager = Arc::new(PtyManager::new());
        let scrollback_service = Arc::new(ScrollbackService::new());
        let handler = PtyHandler::new(db, pty_manager, scrollback_service);

        let input = WritePtyInput {
            tab_id: "non-existent".to_string(),
            data: "data".to_string(),
        };
        let result = handler.write(input).await;
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_resize_pty() {
        let db = setup_test_db().await;
        let pty_manager = Arc::new(PtyManager::new());
        let scrollback_service = Arc::new(ScrollbackService::new());
        let handler = PtyHandler::new(db.clone(), pty_manager.clone(), scrollback_service);

        create_test_tab(&db, "tab-resize").await;

        // Spawn PTY first
        let config = PtyConfig::new();
        pty_manager.spawn("tab-resize", config).await.unwrap();

        // Resize PTY
        let input = ResizePtyInput {
            tab_id: "tab-resize".to_string(),
            cols: 100,
            rows: 50,
        };
        let output = handler.resize(input).await.unwrap();

        assert_eq!(output.tab_id, "tab-resize");
        assert_eq!(output.cols, 100);
        assert_eq!(output.rows, 50);

        // Cleanup
        let _ = pty_manager.kill("tab-resize").await;
    }

    #[tokio::test]
    async fn test_resize_tab_not_found() {
        let db = setup_test_db().await;
        let pty_manager = Arc::new(PtyManager::new());
        let scrollback_service = Arc::new(ScrollbackService::new());
        let handler = PtyHandler::new(db, pty_manager, scrollback_service);

        let input = ResizePtyInput {
            tab_id: "non-existent".to_string(),
            cols: 100,
            rows: 50,
        };
        let result = handler.resize(input).await;
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_is_alive() {
        let db = setup_test_db().await;
        let pty_manager = Arc::new(PtyManager::new());
        let scrollback_service = Arc::new(ScrollbackService::new());
        let handler = PtyHandler::new(db.clone(), pty_manager.clone(), scrollback_service);

        create_test_tab(&db, "tab-alive").await;

        assert!(!handler.is_alive("tab-alive"));

        // Spawn PTY
        let config = PtyConfig::new();
        pty_manager.spawn("tab-alive", config).await.unwrap();

        assert!(handler.is_alive("tab-alive"));

        // Cleanup
        let _ = pty_manager.kill("tab-alive").await;
    }

    #[tokio::test]
    async fn test_subscribe_to_output() {
        let db = setup_test_db().await;
        let pty_manager = Arc::new(PtyManager::new());
        let scrollback_service = Arc::new(ScrollbackService::new());
        let handler = PtyHandler::new(db.clone(), pty_manager.clone(), scrollback_service);

        create_test_tab(&db, "tab-subscribe").await;

        // Spawn PTY
        let config = PtyConfig::new();
        pty_manager.spawn("tab-subscribe", config).await.unwrap();

        // Subscribe to output
        let result = handler.subscribe("tab-subscribe");
        assert!(result.is_ok());

        // Cleanup
        let _ = pty_manager.kill("tab-subscribe").await;
    }

    #[tokio::test]
    async fn test_process_output() {
        let db = setup_test_db().await;
        let pty_manager = Arc::new(PtyManager::new());
        let scrollback_service = Arc::new(ScrollbackService::new());
        let handler = PtyHandler::new(db, pty_manager, scrollback_service.clone());

        handler
            .process_output("tab-process", "line 1\nline 2\nline 3")
            .await;

        // Wait for async processing
        tokio::time::sleep(tokio::time::Duration::from_millis(50)).await;

        let scrollback = scrollback_service.get_scrollback("tab-process").await;
        assert_eq!(scrollback.len(), 3);
        assert_eq!(scrollback[0].text, "line 1");
        assert_eq!(scrollback[1].text, "line 2");
        assert_eq!(scrollback[2].text, "line 3");
    }

    #[tokio::test]
    async fn test_create_notification() {
        let db = setup_test_db().await;
        let pty_manager = Arc::new(PtyManager::new());
        let scrollback_service = Arc::new(ScrollbackService::new());
        let handler = PtyHandler::new(db, pty_manager, scrollback_service);

        let notification = PtyNotification::Output {
            tab_id: "tab-1".to_string(),
            data: "test output".to_string(),
        };
        let message = handler.create_notification(notification);

        match message {
            OutgoingMessage::Notification { method, .. } => {
                assert_eq!(method, "pty.output");
            }
            _ => panic!("Expected Notification variant"),
        }
    }

    #[tokio::test]
    async fn test_rpc_handler_connect() {
        let db = setup_test_db().await;
        let pty_manager = Arc::new(PtyManager::new());
        let scrollback_service = Arc::new(ScrollbackService::new());
        let handler = PtyRpcHandler::new(db.clone(), pty_manager.clone(), scrollback_service);

        create_test_tab(&db, "tab-rpc-connect").await;

        // Spawn PTY first
        let config = PtyConfig::new();
        pty_manager.spawn("tab-rpc-connect", config).await.unwrap();

        let params = serde_json::json!({
            "tabId": "tab-rpc-connect"
        });

        let result = handler.handle("pty.connect", Some(params)).await;
        assert!(result.is_ok());

        // Cleanup
        let _ = pty_manager.kill("tab-rpc-connect").await;
    }

    #[tokio::test]
    async fn test_rpc_handler_write() {
        let db = setup_test_db().await;
        let pty_manager = Arc::new(PtyManager::new());
        let scrollback_service = Arc::new(ScrollbackService::new());
        let handler = PtyRpcHandler::new(db.clone(), pty_manager.clone(), scrollback_service);

        create_test_tab(&db, "tab-rpc-write").await;

        // Spawn PTY first
        let config = PtyConfig::new();
        pty_manager.spawn("tab-rpc-write", config).await.unwrap();

        let params = serde_json::json!({
            "tabId": "tab-rpc-write",
            "data": "echo test\n"
        });

        let result = handler.handle("pty.write", Some(params)).await;
        assert!(result.is_ok());

        // Cleanup
        let _ = pty_manager.kill("tab-rpc-write").await;
    }

    #[tokio::test]
    async fn test_rpc_handler_resize() {
        let db = setup_test_db().await;
        let pty_manager = Arc::new(PtyManager::new());
        let scrollback_service = Arc::new(ScrollbackService::new());
        let handler = PtyRpcHandler::new(db.clone(), pty_manager.clone(), scrollback_service);

        create_test_tab(&db, "tab-rpc-resize").await;

        // Spawn PTY first
        let config = PtyConfig::new();
        pty_manager.spawn("tab-rpc-resize", config).await.unwrap();

        let params = serde_json::json!({
            "tabId": "tab-rpc-resize",
            "cols": 120,
            "rows": 60
        });

        let result = handler.handle("pty.resize", Some(params)).await;
        assert!(result.is_ok());

        // Cleanup
        let _ = pty_manager.kill("tab-rpc-resize").await;
    }

    #[tokio::test]
    async fn test_rpc_handler_method_not_found() {
        let db = setup_test_db().await;
        let pty_manager = Arc::new(PtyManager::new());
        let scrollback_service = Arc::new(ScrollbackService::new());
        let handler = PtyRpcHandler::new(db, pty_manager, scrollback_service);

        let result = handler.handle("pty.unknown", None).await;
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_rpc_handler_invalid_params() {
        let db = setup_test_db().await;
        let pty_manager = Arc::new(PtyManager::new());
        let scrollback_service = Arc::new(ScrollbackService::new());
        let handler = PtyRpcHandler::new(db, pty_manager, scrollback_service);

        let result = handler.handle("pty.connect", None).await;
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_pty_full_lifecycle() {
        let db = setup_test_db().await;
        let pty_manager = Arc::new(PtyManager::new());
        let scrollback_service = Arc::new(ScrollbackService::new());
        let handler = PtyHandler::new(db.clone(), pty_manager.clone(), scrollback_service.clone());

        create_test_tab(&db, "tab-lifecycle").await;

        // 1. Spawn PTY
        let config = PtyConfig::new();
        let tab_id = handler.spawn("tab-lifecycle", config).await.unwrap();
        assert_eq!(tab_id, "tab-lifecycle");
        assert!(handler.is_alive("tab-lifecycle"));

        // 2. Connect to PTY
        let connect_input = ConnectPtyInput {
            tab_id: "tab-lifecycle".to_string(),
        };
        let connect_output = handler.connect(connect_input).await.unwrap();
        assert!(connect_output.connected);

        // 3. Write to PTY
        let write_input = WritePtyInput {
            tab_id: "tab-lifecycle".to_string(),
            data: "exit\n".to_string(),
        };
        let write_output = handler.write(write_input).await.unwrap();
        assert_eq!(write_output.bytes_written, 5);

        // 4. Resize PTY
        let resize_input = ResizePtyInput {
            tab_id: "tab-lifecycle".to_string(),
            cols: 100,
            rows: 50,
        };
        let resize_output = handler.resize(resize_input).await.unwrap();
        assert_eq!(resize_output.cols, 100);
        assert_eq!(resize_output.rows, 50);

        // 5. Process output
        handler
            .process_output("tab-lifecycle", "output line 1\noutput line 2")
            .await;
        tokio::time::sleep(tokio::time::Duration::from_millis(50)).await;

        let scrollback = scrollback_service.get_scrollback("tab-lifecycle").await;
        assert_eq!(scrollback.len(), 2);

        // 6. Kill PTY
        handler.kill("tab-lifecycle").await.unwrap();
        assert!(!handler.is_alive("tab-lifecycle"));
    }
}
