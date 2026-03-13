use crate::db::client::DatabaseClient;
use crate::pty::manager::{PtyConfig, PtyManager, PtyOutput};
use crate::scrollback::service::ScrollbackService;
use crate::server::protocol::{OutgoingMessage, ProtocolError};
use crate::types::{CoreError, Result, ScrollbackLine, Tab, TabType};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::sync::Arc;
use tokio::sync::broadcast;

fn escape_sql(value: &str) -> String {
    value.replace("'", "''")
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateTabInput {
    pub workspace_id: String,
    pub pane_id: String,
    pub id: Option<String>,
    pub title: Option<String>,
    pub cwd: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateTabOutput {
    pub tab: Tab,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ListTabsInput {
    pub pane_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ListTabsOutput {
    pub tabs: Vec<Tab>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct CloseTabInput {
    pub id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CloseTabOutput {
    pub success: bool,
    pub id: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(tag = "action", rename_all = "camelCase")]
pub enum TabNotification {
    Created { tab: Tab },
    Closed { id: String },
}

#[derive(Clone)]
pub struct TabHandler {
    db: Arc<DatabaseClient>,
    pty_manager: Arc<PtyManager>,
    scrollback_service: Arc<ScrollbackService>,
}

impl TabHandler {
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

    /// Create a new tab with auto-spawned PTY
    pub async fn create(&self, input: CreateTabInput) -> Result<CreateTabOutput> {
        // Verify workspace exists
        let workspace_id_escaped = escape_sql(&input.workspace_id);
        let sql = format!(
            "SELECT id FROM workspaces WHERE id = '{}'",
            workspace_id_escaped
        );
        let mut rows = self.db.query(&sql, ()).await?;

        if rows
            .next()
            .await
            .map_err(|e| CoreError::Database(e.to_string()))?
            .is_none()
        {
            return Err(CoreError::InvalidWorkspaceId(format!(
                "Workspace not found: {}",
                input.workspace_id
            )));
        }

        // Verify pane exists
        let pane_id_escaped = escape_sql(&input.pane_id);
        let sql = format!("SELECT id FROM panes WHERE id = '{}'", pane_id_escaped);
        let mut rows = self.db.query(&sql, ()).await?;

        if rows
            .next()
            .await
            .map_err(|e| CoreError::Database(e.to_string()))?
            .is_none()
        {
            return Err(CoreError::InvalidPaneId(format!(
                "Pane not found: {}",
                input.pane_id
            )));
        }

        let tab_id = input.id.unwrap_or_else(|| uuid::Uuid::new_v4().to_string());
        let title = input.title.unwrap_or_else(|| "bash".to_string());
        let cwd = input
            .cwd
            .unwrap_or_else(|| std::env::var("HOME").unwrap_or_else(|_| "/".to_string()));

        let tab_id_escaped = escape_sql(&tab_id);
        let title_escaped = escape_sql(&title);
        let cwd_escaped = escape_sql(&cwd);

        // Create tab record in database
        let sql = format!(
            "INSERT INTO tabs (id, workspace_id, pane_id, title, cwd) VALUES ('{}', '{}', '{}', '{}', '{}')",
            tab_id_escaped, workspace_id_escaped, pane_id_escaped, title_escaped, cwd_escaped
        );
        self.db.execute(&sql, ()).await?;

        // Auto-spawn PTY bound to tab_id
        let pty_config = PtyConfig::new().with_cwd(&cwd);

        self.pty_manager.spawn(&tab_id, pty_config).await?;

        let mut output_rx = self.pty_manager.subscribe(&tab_id)?;
        let scrollback_service = self.scrollback_service.clone();
        let output_tab_id = tab_id.clone();
        tokio::spawn(async move {
            loop {
                match output_rx.recv().await {
                    Ok(PtyOutput::Output { data }) => {
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

                        if !lines.is_empty() {
                            scrollback_service.add_lines(output_tab_id.clone(), lines);
                        }
                    }
                    Ok(PtyOutput::Notification { .. }) => {}
                    Ok(PtyOutput::Exit { .. }) => break,
                    Err(broadcast::error::RecvError::Lagged(_)) => continue,
                    Err(broadcast::error::RecvError::Closed) => break,
                }
            }
        });

        // Create pty_sessions record
        let sql = format!(
            "INSERT INTO pty_sessions (id, tab_id, cwd) VALUES ('{}', '{}', '{}')",
            tab_id_escaped, tab_id_escaped, cwd_escaped
        );
        self.db.execute(&sql, ()).await?;

        let tab = Tab {
            id: tab_id.clone(),
            tab_type: TabType::Terminal,
            title: title.clone(),
            cwd: cwd.clone(),
            session_id: tab_id.clone(),
            git_branch: None,
            has_notification: false,
            notification_count: 0,
            notification_text: None,
            scrollback: vec![],
        };

        Ok(CreateTabOutput { tab })
    }

    pub async fn list(&self, input: ListTabsInput) -> Result<ListTabsOutput> {
        // Verify pane exists
        let pane_id_escaped = escape_sql(&input.pane_id);
        let sql = format!("SELECT id FROM panes WHERE id = '{}'", pane_id_escaped);
        let mut rows = self.db.query(&sql, ()).await?;

        if rows
            .next()
            .await
            .map_err(|e| CoreError::Database(e.to_string()))?
            .is_none()
        {
            return Err(CoreError::InvalidPaneId(format!(
                "Pane not found: {}",
                input.pane_id
            )));
        }

        let sql = format!(
            "SELECT id, title, cwd FROM tabs WHERE pane_id = '{}' ORDER BY created_at",
            pane_id_escaped
        );
        let mut rows = self.db.query(&sql, ()).await?;

        let mut tabs = Vec::new();

        while let Some(row) = rows
            .next()
            .await
            .map_err(|e| CoreError::Database(e.to_string()))?
        {
            let id: String = row.get(0).map_err(|e| CoreError::Database(e.to_string()))?;
            let title: String = row.get(1).map_err(|e| CoreError::Database(e.to_string()))?;
            let cwd: String = row.get(2).map_err(|e| CoreError::Database(e.to_string()))?;
            let scrollback = self.scrollback_service.get_scrollback(&id).await;

            let tab = Tab {
                id: id.clone(),
                tab_type: TabType::Terminal,
                title,
                cwd,
                session_id: id,
                git_branch: None,
                has_notification: false,
                notification_count: 0,
                notification_text: None,
                scrollback,
            };

            tabs.push(tab);
        }

        Ok(ListTabsOutput { tabs })
    }

    /// Close tab with cascade cleanup: kill PTY, clear scrollback, delete tab
    pub async fn close(&self, input: CloseTabInput) -> Result<CloseTabOutput> {
        let tab_id = &input.id;
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
                input.id
            )));
        }

        // Step 1: Kill PTY session
        let _ = self.pty_manager.kill(tab_id).await;

        // Step 2: Clear scrollback
        self.scrollback_service.clear_tab(tab_id);

        // Step 3: Delete tab (cascade deletes pty_sessions and scrollback_chunks via foreign keys)
        let sql = format!("DELETE FROM tabs WHERE id = '{}'", tab_id_escaped);
        self.db.execute(&sql, ()).await?;

        Ok(CloseTabOutput {
            success: true,
            id: input.id.clone(),
        })
    }

    pub fn create_notification(&self, notification: TabNotification) -> OutgoingMessage {
        let method = "tab.state_change".to_string();
        let params = serde_json::to_value(notification).ok();
        OutgoingMessage::notification(method, params)
    }
}

pub struct TabRpcHandler {
    inner: TabHandler,
}

impl TabRpcHandler {
    pub fn new(
        db: Arc<DatabaseClient>,
        pty_manager: Arc<PtyManager>,
        scrollback_service: Arc<ScrollbackService>,
    ) -> Self {
        Self {
            inner: TabHandler::new(db, pty_manager, scrollback_service),
        }
    }

    pub async fn handle(
        &self,
        method: &str,
        params: Option<Value>,
    ) -> std::result::Result<Value, ProtocolError> {
        match method {
            "tab.create" => {
                let input: CreateTabInput = params
                    .map(|p| {
                        serde_json::from_value(p)
                            .map_err(|e| ProtocolError::InvalidParams(e.to_string()))
                    })
                    .unwrap_or(Err(ProtocolError::InvalidParams(
                        "Missing params".to_string(),
                    )))?;

                let output = self.inner.create(input).await.map_err(|e| {
                    ProtocolError::InternalError(format!("Failed to create tab: {}", e))
                })?;

                serde_json::to_value(output)
                    .map_err(|e| ProtocolError::InternalError(e.to_string()))
            }
            "tab.list" => {
                let input: ListTabsInput = params
                    .map(|p| {
                        serde_json::from_value(p)
                            .map_err(|e| ProtocolError::InvalidParams(e.to_string()))
                    })
                    .unwrap_or(Err(ProtocolError::InvalidParams(
                        "Missing params".to_string(),
                    )))?;

                let output = self.inner.list(input).await.map_err(|e| {
                    ProtocolError::InternalError(format!("Failed to list tabs: {}", e))
                })?;

                serde_json::to_value(output)
                    .map_err(|e| ProtocolError::InternalError(e.to_string()))
            }
            "tab.close" => {
                let input: CloseTabInput = params
                    .map(|p| {
                        serde_json::from_value(p)
                            .map_err(|e| ProtocolError::InvalidParams(e.to_string()))
                    })
                    .unwrap_or(Err(ProtocolError::InvalidParams(
                        "Missing params".to_string(),
                    )))?;

                let output = self.inner.close(input).await.map_err(|e| {
                    ProtocolError::InternalError(format!("Failed to close tab: {}", e))
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

        // Create workspaces table
        client
            .execute(
                "CREATE TABLE workspaces (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL
                )",
                (),
            )
            .await
            .unwrap();

        // Create panes table
        client
            .execute(
                "CREATE TABLE panes (
                    id TEXT PRIMARY KEY,
                    workspace_id TEXT NOT NULL,
                    flex_ratio REAL DEFAULT 1.0,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
                )",
                (),
            )
            .await
            .unwrap();

        // Create tabs table
        client
            .execute(
                "CREATE TABLE tabs (
                    id TEXT PRIMARY KEY,
                    workspace_id TEXT NOT NULL,
                    pane_id TEXT NOT NULL,
                    title TEXT DEFAULT 'bash',
                    cwd TEXT,
                    has_notification BOOLEAN DEFAULT FALSE,
                    notification_count INTEGER DEFAULT 0,
                    notification_text TEXT,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
                    FOREIGN KEY (pane_id) REFERENCES panes(id) ON DELETE CASCADE
                )",
                (),
            )
            .await
            .unwrap();

        // Create pty_sessions table
        client
            .execute(
                "CREATE TABLE pty_sessions (
                    id TEXT PRIMARY KEY,
                    tab_id TEXT NOT NULL UNIQUE,
                    pid INTEGER,
                    cwd TEXT,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (tab_id) REFERENCES tabs(id) ON DELETE CASCADE
                )",
                (),
            )
            .await
            .unwrap();

        Arc::new(client)
    }

    async fn create_test_workspace(db: &DatabaseClient, id: &str, name: &str) {
        let sql = format!(
            "INSERT INTO workspaces (id, name) VALUES ('{}', '{}')",
            escape_sql(id),
            escape_sql(name)
        );
        db.execute(&sql, ()).await.unwrap();
    }

    async fn create_test_pane(db: &DatabaseClient, id: &str, workspace_id: &str) {
        let sql = format!(
            "INSERT INTO panes (id, workspace_id) VALUES ('{}', '{}')",
            escape_sql(id),
            escape_sql(workspace_id)
        );
        db.execute(&sql, ()).await.unwrap();
    }

    #[tokio::test]
    async fn test_create_tab() {
        let db = setup_test_db().await;
        let pty_manager = Arc::new(PtyManager::new());
        let scrollback_service = Arc::new(ScrollbackService::new());
        let handler = TabHandler::new(db.clone(), pty_manager.clone(), scrollback_service);

        create_test_workspace(&db, "ws-test", "Test Workspace").await;
        create_test_pane(&db, "pane-test", "ws-test").await;

        let input = CreateTabInput {
            workspace_id: "ws-test".to_string(),
            pane_id: "pane-test".to_string(),
            id: Some("tab-test-123".to_string()),
            title: Some("Test Tab".to_string()),
            cwd: Some("/tmp".to_string()),
        };

        let output = handler.create(input).await.unwrap();

        assert_eq!(output.tab.id, "tab-test-123");
        assert_eq!(output.tab.title, "Test Tab");
        assert_eq!(output.tab.cwd, "/tmp");
        assert_eq!(output.tab.tab_type, TabType::Terminal);

        // Cleanup PTY using the same manager instance
        let _ = pty_manager.kill("tab-test-123").await;
    }

    #[tokio::test]
    async fn test_create_tab_generates_id() {
        let db = setup_test_db().await;
        let pty_manager = Arc::new(PtyManager::new());
        let scrollback_service = Arc::new(ScrollbackService::new());
        let handler = TabHandler::new(db.clone(), pty_manager.clone(), scrollback_service);

        create_test_workspace(&db, "ws-test", "Test Workspace").await;
        create_test_pane(&db, "pane-test", "ws-test").await;

        let input = CreateTabInput {
            workspace_id: "ws-test".to_string(),
            pane_id: "pane-test".to_string(),
            id: None,
            title: None,
            cwd: None,
        };

        let output = handler.create(input).await.unwrap();
        assert!(!output.tab.id.is_empty());
        assert_eq!(output.tab.title, "bash"); // Default title

        // Cleanup PTY
        let _ = pty_manager.kill(&output.tab.id).await;
    }

    #[tokio::test]
    async fn test_create_tab_workspace_not_found() {
        let db = setup_test_db().await;
        let pty_manager = Arc::new(PtyManager::new());
        let scrollback_service = Arc::new(ScrollbackService::new());
        let handler = TabHandler::new(db, pty_manager, scrollback_service);

        let input = CreateTabInput {
            workspace_id: "non-existent".to_string(),
            pane_id: "pane-test".to_string(),
            id: Some("tab-1".to_string()),
            title: None,
            cwd: None,
        };

        let result = handler.create(input).await;
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_create_tab_pane_not_found() {
        let db = setup_test_db().await;
        let pty_manager = Arc::new(PtyManager::new());
        let scrollback_service = Arc::new(ScrollbackService::new());
        let handler = TabHandler::new(db.clone(), pty_manager, scrollback_service);

        create_test_workspace(&db, "ws-test", "Test Workspace").await;

        let input = CreateTabInput {
            workspace_id: "ws-test".to_string(),
            pane_id: "non-existent".to_string(),
            id: Some("tab-1".to_string()),
            title: None,
            cwd: None,
        };

        let result = handler.create(input).await;
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_list_tabs_empty() {
        let db = setup_test_db().await;
        let pty_manager = Arc::new(PtyManager::new());
        let scrollback_service = Arc::new(ScrollbackService::new());
        let handler = TabHandler::new(db.clone(), pty_manager, scrollback_service);

        create_test_workspace(&db, "ws-test", "Test Workspace").await;
        create_test_pane(&db, "pane-test", "ws-test").await;

        let input = ListTabsInput {
            pane_id: "pane-test".to_string(),
        };
        let output = handler.list(input).await.unwrap();

        assert!(output.tabs.is_empty());
    }

    #[tokio::test]
    async fn test_list_tabs_with_data() {
        let db = setup_test_db().await;
        let pty_manager = Arc::new(PtyManager::new());
        let scrollback_service = Arc::new(ScrollbackService::new());
        let handler = TabHandler::new(db.clone(), pty_manager.clone(), scrollback_service);

        create_test_workspace(&db, "ws-test", "Test Workspace").await;
        create_test_pane(&db, "pane-test", "ws-test").await;

        handler
            .create(CreateTabInput {
                workspace_id: "ws-test".to_string(),
                pane_id: "pane-test".to_string(),
                id: Some("tab-1".to_string()),
                title: Some("Tab 1".to_string()),
                cwd: None,
            })
            .await
            .unwrap();

        handler
            .create(CreateTabInput {
                workspace_id: "ws-test".to_string(),
                pane_id: "pane-test".to_string(),
                id: Some("tab-2".to_string()),
                title: Some("Tab 2".to_string()),
                cwd: None,
            })
            .await
            .unwrap();

        let input = ListTabsInput {
            pane_id: "pane-test".to_string(),
        };
        let output = handler.list(input).await.unwrap();

        assert_eq!(output.tabs.len(), 2);

        // Cleanup PTYs
        let _ = pty_manager.kill("tab-1").await;
        let _ = pty_manager.kill("tab-2").await;
    }

    #[tokio::test]
    async fn test_list_tabs_includes_scrollback_data() {
        let db = setup_test_db().await;
        let pty_manager = Arc::new(PtyManager::new());
        let scrollback_service = Arc::new(ScrollbackService::new());
        let handler = TabHandler::new(db.clone(), pty_manager.clone(), scrollback_service.clone());

        create_test_workspace(&db, "ws-scrollback", "Scrollback Workspace").await;
        create_test_pane(&db, "pane-scrollback", "ws-scrollback").await;

        handler
            .create(CreateTabInput {
                workspace_id: "ws-scrollback".to_string(),
                pane_id: "pane-scrollback".to_string(),
                id: Some("tab-scrollback".to_string()),
                title: Some("Scrollback Tab".to_string()),
                cwd: None,
            })
            .await
            .unwrap();

        pty_manager
            .write("tab-scrollback", "echo restored-line\n")
            .await
            .unwrap();

        let mut attempts = 0;
        loop {
            let current = scrollback_service.get_scrollback("tab-scrollback").await;
            if current
                .iter()
                .any(|line| line.text.contains("restored-line"))
            {
                break;
            }

            attempts += 1;
            assert!(
                attempts < 40,
                "expected PTY output to reach scrollback service"
            );
            tokio::time::sleep(tokio::time::Duration::from_millis(50)).await;
        }

        let output = handler
            .list(ListTabsInput {
                pane_id: "pane-scrollback".to_string(),
            })
            .await
            .unwrap();

        let tab = output
            .tabs
            .iter()
            .find(|candidate| candidate.id == "tab-scrollback")
            .expect("tab-scrollback missing from tab.list output");

        assert!(
            tab.scrollback
                .iter()
                .any(|line| line.text.contains("restored-line")),
            "tab.list should include persisted PTY output scrollback"
        );

        let _ = pty_manager.kill("tab-scrollback").await;
    }

    #[tokio::test]
    async fn test_close_tab() {
        let db = setup_test_db().await;
        let pty_manager = Arc::new(PtyManager::new());
        let scrollback_service = Arc::new(ScrollbackService::new());
        let handler = TabHandler::new(db.clone(), pty_manager.clone(), scrollback_service.clone());

        create_test_workspace(&db, "ws-test", "Test Workspace").await;
        create_test_pane(&db, "pane-test", "ws-test").await;

        handler
            .create(CreateTabInput {
                workspace_id: "ws-test".to_string(),
                pane_id: "pane-test".to_string(),
                id: Some("tab-close".to_string()),
                title: None,
                cwd: None,
            })
            .await
            .unwrap();

        // Add some scrollback
        scrollback_service.add_lines(
            "tab-close",
            vec![crate::types::ScrollbackLine {
                text: "test line".to_string(),
                ansi: None,
                timestamp: None,
            }],
        );

        let input = CloseTabInput {
            id: "tab-close".to_string(),
        };
        let output = handler.close(input).await.unwrap();

        assert!(output.success);
        assert_eq!(output.id, "tab-close");

        // Verify tab is deleted
        let list_output = handler
            .list(ListTabsInput {
                pane_id: "pane-test".to_string(),
            })
            .await
            .unwrap();
        assert!(list_output.tabs.is_empty());

        // Verify scrollback is cleared
        let scrollback = scrollback_service.get_scrollback("tab-close").await;
        assert!(scrollback.is_empty());
    }

    #[tokio::test]
    async fn test_close_tab_not_found() {
        let db = setup_test_db().await;
        let pty_manager = Arc::new(PtyManager::new());
        let scrollback_service = Arc::new(ScrollbackService::new());
        let handler = TabHandler::new(db, pty_manager, scrollback_service);

        let input = CloseTabInput {
            id: "non-existent".to_string(),
        };

        let result = handler.close(input).await;
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_create_notification() {
        let db = setup_test_db().await;
        let pty_manager = Arc::new(PtyManager::new());
        let scrollback_service = Arc::new(ScrollbackService::new());
        let handler = TabHandler::new(db, pty_manager, scrollback_service);

        let tab = Tab {
            id: "tab-1".to_string(),
            tab_type: TabType::Terminal,
            title: "bash".to_string(),
            cwd: "/home".to_string(),
            session_id: "tab-1".to_string(),
            git_branch: None,
            has_notification: false,
            notification_count: 0,
            notification_text: None,
            scrollback: vec![],
        };

        let notification = TabNotification::Created { tab };
        let message = handler.create_notification(notification);

        match message {
            OutgoingMessage::Notification { method, .. } => {
                assert_eq!(method, "tab.state_change");
            }
            _ => panic!("Expected Notification variant"),
        }
    }

    #[tokio::test]
    async fn test_rpc_handler_create() {
        let db = setup_test_db().await;
        let pty_manager = Arc::new(PtyManager::new());
        let scrollback_service = Arc::new(ScrollbackService::new());
        let handler = TabRpcHandler::new(db.clone(), pty_manager.clone(), scrollback_service);

        create_test_workspace(&db, "ws-rpc", "RPC Test Workspace").await;
        create_test_pane(&db, "pane-rpc", "ws-rpc").await;

        let params = serde_json::json!({
            "workspaceId": "ws-rpc",
            "paneId": "pane-rpc",
            "id": "tab-rpc-1",
            "title": "RPC Tab"
        });

        let result = handler.handle("tab.create", Some(params)).await;
        assert!(result.is_ok());

        // Cleanup PTY
        let _ = pty_manager.kill("tab-rpc-1").await;
    }

    #[tokio::test]
    async fn test_rpc_handler_list() {
        let db = setup_test_db().await;
        let pty_manager = Arc::new(PtyManager::new());
        let scrollback_service = Arc::new(ScrollbackService::new());
        let handler = TabRpcHandler::new(db.clone(), pty_manager.clone(), scrollback_service);

        create_test_workspace(&db, "ws-list", "List Test Workspace").await;
        create_test_pane(&db, "pane-list", "ws-list").await;

        let create_params = serde_json::json!({
            "workspaceId": "ws-list",
            "paneId": "pane-list",
            "id": "tab-list-1"
        });
        handler
            .handle("tab.create", Some(create_params))
            .await
            .unwrap();

        let list_params = serde_json::json!({
            "paneId": "pane-list"
        });
        let result = handler.handle("tab.list", Some(list_params)).await;
        assert!(result.is_ok(), "tab.list failed: {:?}", result);

        // Cleanup PTY using the same manager instance
        let _ = pty_manager.kill("tab-list-1").await;
    }

    #[tokio::test]
    async fn test_rpc_handler_close() {
        let db = setup_test_db().await;
        let pty_manager = Arc::new(PtyManager::new());
        let scrollback_service = Arc::new(ScrollbackService::new());
        let handler = TabRpcHandler::new(db.clone(), pty_manager.clone(), scrollback_service);

        create_test_workspace(&db, "ws-close", "Close Test Workspace").await;
        create_test_pane(&db, "pane-close", "ws-close").await;

        let create_params = serde_json::json!({
            "workspaceId": "ws-close",
            "paneId": "pane-close",
            "id": "tab-close-1"
        });
        handler
            .handle("tab.create", Some(create_params))
            .await
            .unwrap();

        let close_params = serde_json::json!({
            "id": "tab-close-1"
        });
        let result = handler.handle("tab.close", Some(close_params)).await;
        assert!(result.is_ok());
    }

    #[tokio::test]
    async fn test_rpc_handler_method_not_found() {
        let db = setup_test_db().await;
        let pty_manager = Arc::new(PtyManager::new());
        let scrollback_service = Arc::new(ScrollbackService::new());
        let handler = TabRpcHandler::new(db, pty_manager, scrollback_service);

        let result = handler.handle("tab.unknown", None).await;
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_rpc_handler_invalid_params() {
        let db = setup_test_db().await;
        let pty_manager = Arc::new(PtyManager::new());
        let scrollback_service = Arc::new(ScrollbackService::new());
        let handler = TabRpcHandler::new(db, pty_manager, scrollback_service);

        let result = handler.handle("tab.create", None).await;
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_tab_full_lifecycle() {
        let db = setup_test_db().await;
        let pty_manager = Arc::new(PtyManager::new());
        let scrollback_service = Arc::new(ScrollbackService::new());
        let handler = TabHandler::new(db.clone(), pty_manager.clone(), scrollback_service.clone());

        create_test_workspace(&db, "ws-lifecycle", "Lifecycle Test").await;
        create_test_pane(&db, "pane-lifecycle", "ws-lifecycle").await;

        // 1. Create tab (auto-spawns PTY)
        let create_input = CreateTabInput {
            workspace_id: "ws-lifecycle".to_string(),
            pane_id: "pane-lifecycle".to_string(),
            id: Some("tab-lifecycle".to_string()),
            title: Some("Lifecycle Tab".to_string()),
            cwd: Some("/tmp".to_string()),
        };
        let create_output = handler.create(create_input).await.unwrap();
        assert_eq!(create_output.tab.id, "tab-lifecycle");

        // Verify PTY is spawned
        assert!(pty_manager.is_alive("tab-lifecycle"));

        // 2. Add scrollback
        scrollback_service.add_lines(
            "tab-lifecycle",
            vec![
                crate::types::ScrollbackLine {
                    text: "line 1".to_string(),
                    ansi: None,
                    timestamp: None,
                },
                crate::types::ScrollbackLine {
                    text: "line 2".to_string(),
                    ansi: None,
                    timestamp: None,
                },
            ],
        );

        // 3. Close tab (cascade cleanup)
        let close_input = CloseTabInput {
            id: "tab-lifecycle".to_string(),
        };
        let close_output = handler.close(close_input).await.unwrap();
        assert!(close_output.success);

        // 4. Verify PTY is killed
        assert!(!pty_manager.is_alive("tab-lifecycle"));

        // 5. Verify scrollback is cleared
        let scrollback = scrollback_service.get_scrollback("tab-lifecycle").await;
        assert!(scrollback.is_empty());

        // 6. Verify tab is deleted
        let list_output = handler
            .list(ListTabsInput {
                pane_id: "pane-lifecycle".to_string(),
            })
            .await
            .unwrap();
        assert!(list_output.tabs.is_empty());
    }
}
