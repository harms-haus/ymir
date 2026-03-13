use crate::db::client::DatabaseClient;
use crate::server::protocol::{OutgoingMessage, ProtocolError};
use crate::types::{CoreError, Pane, Result};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::sync::Arc;

fn escape_sql(value: &str) -> String {
    value.replace("'", "''")
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreatePaneInput {
    pub workspace_id: String,
    pub id: Option<String>,
    pub flex_ratio: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreatePaneOutput {
    pub pane: Pane,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ListPanesInput {
    pub workspace_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ListPanesOutput {
    pub panes: Vec<Pane>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct DeletePaneInput {
    pub id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DeletePaneOutput {
    pub success: bool,
    pub id: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(tag = "action", rename_all = "camelCase")]
pub enum PaneNotification {
    Created { pane: Pane },
    Deleted { id: String },
}

#[derive(Debug, Clone)]
pub struct PaneHandler {
    db: Arc<DatabaseClient>,
}

impl PaneHandler {
    pub fn new(db: Arc<DatabaseClient>) -> Self {
        Self { db }
    }

    pub async fn create(&self, input: CreatePaneInput) -> Result<CreatePaneOutput> {
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

        let id = input.id.unwrap_or_else(|| uuid::Uuid::new_v4().to_string());
        let flex_ratio = input.flex_ratio.unwrap_or(1.0);
        let id_escaped = escape_sql(&id);

        let sql = format!(
            "INSERT INTO panes (id, workspace_id, flex_ratio) VALUES ('{}', '{}', {})",
            id_escaped, workspace_id_escaped, flex_ratio
        );
        self.db.execute(&sql, ()).await?;

        let pane = Pane {
            id: id.clone(),
            flex_ratio,
            tabs: vec![],
            active_tab_id: None,
            has_notification: false,
        };

        Ok(CreatePaneOutput { pane })
    }

    pub async fn list(&self, input: ListPanesInput) -> Result<ListPanesOutput> {
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

        let sql = format!(
            "SELECT id, flex_ratio FROM panes WHERE workspace_id = '{}' ORDER BY created_at",
            workspace_id_escaped
        );
        let mut rows = self.db.query(&sql, ()).await?;

        let mut panes = Vec::new();

        while let Some(row) = rows
            .next()
            .await
            .map_err(|e| CoreError::Database(e.to_string()))?
        {
            let id: String = row.get(0).map_err(|e| CoreError::Database(e.to_string()))?;
            let flex_ratio: f64 = row.get(1).map_err(|e| CoreError::Database(e.to_string()))?;

            let pane = Pane {
                id,
                flex_ratio,
                tabs: vec![],
                active_tab_id: None,
                has_notification: false,
            };

            panes.push(pane);
        }

        Ok(ListPanesOutput { panes })
    }

    pub async fn delete(&self, input: DeletePaneInput) -> Result<DeletePaneOutput> {
        let id_escaped = escape_sql(&input.id);
        let sql = format!("SELECT id FROM panes WHERE id = '{}'", id_escaped);
        let mut rows = self.db.query(&sql, ()).await?;

        if rows
            .next()
            .await
            .map_err(|e| CoreError::Database(e.to_string()))?
            .is_none()
        {
            return Err(CoreError::InvalidPaneId(format!(
                "Pane not found: {}",
                input.id
            )));
        }

        let sql = format!("DELETE FROM panes WHERE id = '{}'", id_escaped);
        self.db.execute(&sql, ()).await?;

        Ok(DeletePaneOutput {
            success: true,
            id: input.id,
        })
    }

    pub fn create_notification(&self, notification: PaneNotification) -> OutgoingMessage {
        let method = "pane.state_change".to_string();
        let params = serde_json::to_value(notification).ok();
        OutgoingMessage::notification(method, params)
    }
}

pub struct PaneRpcHandler {
    inner: PaneHandler,
}

impl PaneRpcHandler {
    pub fn new(db: Arc<DatabaseClient>) -> Self {
        Self {
            inner: PaneHandler::new(db),
        }
    }

    pub async fn handle(
        &self,
        method: &str,
        params: Option<Value>,
    ) -> std::result::Result<Value, ProtocolError> {
        match method {
            "pane.create" => {
                let input: CreatePaneInput = params
                    .map(|p| {
                        serde_json::from_value(p)
                            .map_err(|e| ProtocolError::InvalidParams(e.to_string()))
                    })
                    .unwrap_or(Err(ProtocolError::InvalidParams(
                        "Missing params".to_string(),
                    )))?;

                let output = self.inner.create(input).await.map_err(|e| {
                    ProtocolError::InternalError(format!("Failed to create pane: {}", e))
                })?;

                serde_json::to_value(output)
                    .map_err(|e| ProtocolError::InternalError(e.to_string()))
            }
            "pane.list" => {
                let input: ListPanesInput = params
                    .map(|p| {
                        serde_json::from_value(p)
                            .map_err(|e| ProtocolError::InvalidParams(e.to_string()))
                    })
                    .unwrap_or(Err(ProtocolError::InvalidParams(
                        "Missing params".to_string(),
                    )))?;

                let output = self.inner.list(input).await.map_err(|e| {
                    ProtocolError::InternalError(format!("Failed to list panes: {}", e))
                })?;

                serde_json::to_value(output)
                    .map_err(|e| ProtocolError::InternalError(e.to_string()))
            }
            "pane.delete" => {
                let input: DeletePaneInput = params
                    .map(|p| {
                        serde_json::from_value(p)
                            .map_err(|e| ProtocolError::InvalidParams(e.to_string()))
                    })
                    .unwrap_or(Err(ProtocolError::InvalidParams(
                        "Missing params".to_string(),
                    )))?;

                let output = self.inner.delete(input).await.map_err(|e| {
                    ProtocolError::InternalError(format!("Failed to delete pane: {}", e))
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

        // Create panes table (simplified - no split tree)
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

    #[tokio::test]
    async fn test_create_pane() {
        let db = setup_test_db().await;
        let handler = PaneHandler::new(db.clone());

        create_test_workspace(&db, "ws-test", "Test Workspace").await;

        let input = CreatePaneInput {
            workspace_id: "ws-test".to_string(),
            id: Some("pane-test-123".to_string()),
            flex_ratio: Some(0.5),
        };

        let output = handler.create(input).await.unwrap();

        assert_eq!(output.pane.id, "pane-test-123");
        assert_eq!(output.pane.flex_ratio, 0.5);
    }

    #[tokio::test]
    async fn test_create_pane_generates_id() {
        let db = setup_test_db().await;
        let handler = PaneHandler::new(db.clone());

        create_test_workspace(&db, "ws-test", "Test Workspace").await;

        let input = CreatePaneInput {
            workspace_id: "ws-test".to_string(),
            id: None,
            flex_ratio: None,
        };

        let output = handler.create(input).await.unwrap();
        assert!(!output.pane.id.is_empty());
        assert_eq!(output.pane.flex_ratio, 1.0); // Default value
    }

    #[tokio::test]
    async fn test_create_pane_workspace_not_found() {
        let db = setup_test_db().await;
        let handler = PaneHandler::new(db);

        let input = CreatePaneInput {
            workspace_id: "non-existent".to_string(),
            id: Some("pane-1".to_string()),
            flex_ratio: None,
        };

        let result = handler.create(input).await;
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_list_panes_empty() {
        let db = setup_test_db().await;
        let handler = PaneHandler::new(db.clone());

        create_test_workspace(&db, "ws-test", "Test Workspace").await;

        let input = ListPanesInput {
            workspace_id: "ws-test".to_string(),
        };
        let output = handler.list(input).await.unwrap();

        assert!(output.panes.is_empty());
    }

    #[tokio::test]
    async fn test_list_panes_with_data() {
        let db = setup_test_db().await;
        let handler = PaneHandler::new(db.clone());

        create_test_workspace(&db, "ws-test", "Test Workspace").await;

        handler
            .create(CreatePaneInput {
                workspace_id: "ws-test".to_string(),
                id: Some("pane-1".to_string()),
                flex_ratio: Some(0.5),
            })
            .await
            .unwrap();

        handler
            .create(CreatePaneInput {
                workspace_id: "ws-test".to_string(),
                id: Some("pane-2".to_string()),
                flex_ratio: Some(0.5),
            })
            .await
            .unwrap();

        let input = ListPanesInput {
            workspace_id: "ws-test".to_string(),
        };
        let output = handler.list(input).await.unwrap();

        assert_eq!(output.panes.len(), 2);
    }

    #[tokio::test]
    async fn test_list_panes_workspace_not_found() {
        let db = setup_test_db().await;
        let handler = PaneHandler::new(db);

        let input = ListPanesInput {
            workspace_id: "non-existent".to_string(),
        };

        let result = handler.list(input).await;
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_delete_pane() {
        let db = setup_test_db().await;
        let handler = PaneHandler::new(db.clone());

        create_test_workspace(&db, "ws-test", "Test Workspace").await;

        handler
            .create(CreatePaneInput {
                workspace_id: "ws-test".to_string(),
                id: Some("pane-delete".to_string()),
                flex_ratio: None,
            })
            .await
            .unwrap();

        let input = DeletePaneInput {
            id: "pane-delete".to_string(),
        };
        let output = handler.delete(input).await.unwrap();

        assert!(output.success);

        let list_output = handler
            .list(ListPanesInput {
                workspace_id: "ws-test".to_string(),
            })
            .await
            .unwrap();
        assert!(list_output.panes.is_empty());
    }

    #[tokio::test]
    async fn test_delete_pane_not_found() {
        let db = setup_test_db().await;
        let handler = PaneHandler::new(db);

        let input = DeletePaneInput {
            id: "non-existent".to_string(),
        };

        let result = handler.delete(input).await;
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_create_notification() {
        let db = setup_test_db().await;
        let handler = PaneHandler::new(db);

        let pane = Pane {
            id: "pane-1".to_string(),
            flex_ratio: 1.0,
            tabs: vec![],
            active_tab_id: None,
            has_notification: false,
        };

        let notification = PaneNotification::Created { pane };
        let message = handler.create_notification(notification);

        match message {
            OutgoingMessage::Notification { method, .. } => {
                assert_eq!(method, "pane.state_change");
            }
            _ => panic!("Expected Notification variant"),
        }
    }

    #[tokio::test]
    async fn test_rpc_handler_create() {
        let db = setup_test_db().await;
        let handler = PaneRpcHandler::new(db.clone());

        create_test_workspace(&db, "ws-rpc", "RPC Test Workspace").await;

        let params = serde_json::json!({
            "workspaceId": "ws-rpc",
            "id": "pane-rpc-1",
            "flexRatio": 0.5
        });

        let result = handler.handle("pane.create", Some(params)).await;
        assert!(result.is_ok());
    }

    #[tokio::test]
    async fn test_rpc_handler_list() {
        let db = setup_test_db().await;
        let handler = PaneRpcHandler::new(db.clone());

        create_test_workspace(&db, "ws-list", "List Test Workspace").await;

        let create_params = serde_json::json!({
            "workspaceId": "ws-list",
            "id": "pane-list-1"
        });
        handler
            .handle("pane.create", Some(create_params))
            .await
            .unwrap();

        let list_params = serde_json::json!({
            "workspaceId": "ws-list"
        });
        let result = handler.handle("pane.list", Some(list_params)).await;
        assert!(result.is_ok());
    }

    #[tokio::test]
    async fn test_rpc_handler_delete() {
        let db = setup_test_db().await;
        let handler = PaneRpcHandler::new(db.clone());

        create_test_workspace(&db, "ws-delete", "Delete Test Workspace").await;

        let create_params = serde_json::json!({
            "workspaceId": "ws-delete",
            "id": "pane-delete-1"
        });
        handler
            .handle("pane.create", Some(create_params))
            .await
            .unwrap();

        let delete_params = serde_json::json!({
            "id": "pane-delete-1"
        });
        let result = handler.handle("pane.delete", Some(delete_params)).await;
        assert!(result.is_ok());
    }

    #[tokio::test]
    async fn test_rpc_handler_method_not_found() {
        let db = setup_test_db().await;
        let handler = PaneRpcHandler::new(db);

        let result = handler.handle("pane.unknown", None).await;
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_rpc_handler_invalid_params() {
        let db = setup_test_db().await;
        let handler = PaneRpcHandler::new(db);

        let result = handler.handle("pane.create", None).await;
        assert!(result.is_err());
    }
}
