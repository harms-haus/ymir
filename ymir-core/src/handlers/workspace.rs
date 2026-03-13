use crate::db::client::DatabaseClient;
use crate::server::protocol::{OutgoingMessage, ProtocolError};
use crate::types::{CoreError, Result, Workspace};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::sync::Arc;

fn escape_sql(value: &str) -> String {
    value.replace("'", "''")
}

#[derive(Debug, Clone, Deserialize)]
pub struct CreateWorkspaceInput {
    pub name: String,
    pub id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateWorkspaceOutput {
    pub workspace: Workspace,
}

#[derive(Debug, Clone, Deserialize)]
pub struct ListWorkspacesInput {
    pub filter: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ListWorkspacesOutput {
    pub workspaces: Vec<Workspace>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct DeleteWorkspaceInput {
    pub id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DeleteWorkspaceOutput {
    pub success: bool,
    pub id: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct RenameWorkspaceInput {
    pub id: String,
    pub name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RenameWorkspaceOutput {
    pub workspace: Workspace,
}

#[derive(Debug, Clone, Serialize)]
#[serde(tag = "action", rename_all = "camelCase")]
pub enum WorkspaceNotification {
    Created { workspace: Workspace },
    Deleted { id: String },
    Renamed { workspace: Workspace },
}

#[derive(Debug, Clone)]
pub struct WorkspaceHandler {
    db: Arc<DatabaseClient>,
}

impl WorkspaceHandler {
    pub fn new(db: Arc<DatabaseClient>) -> Self {
        Self { db }
    }

    pub async fn create(&self, input: CreateWorkspaceInput) -> Result<CreateWorkspaceOutput> {
        let id = input.id.unwrap_or_else(|| uuid::Uuid::new_v4().to_string());
        let name_escaped = escape_sql(&input.name);
        let id_escaped = escape_sql(&id);

        let sql = format!(
            "INSERT INTO workspaces (id, name) VALUES ('{}', '{}')",
            id_escaped, name_escaped
        );
        self.db.execute(&sql, ()).await?;

        let workspace = Workspace {
            id: id.clone(),
            name: input.name,
            root: crate::types::SplitNode::Leaf(crate::types::LeafNode::new(format!(
                "pane-{}",
                uuid::Uuid::new_v4()
            ))),
            active_pane_id: None,
            has_notification: false,
        };

        Ok(CreateWorkspaceOutput { workspace })
    }

    pub async fn list(&self, _input: ListWorkspacesInput) -> Result<ListWorkspacesOutput> {
        let mut rows = self
            .db
            .query("SELECT id, name FROM workspaces ORDER BY id", ())
            .await?;

        let mut workspaces = Vec::new();

        while let Some(row) = rows.next().await.map_err(|e| CoreError::Database(e.to_string()))? {
            let id: String = row.get(0).map_err(|e| CoreError::Database(e.to_string()))?;
            let name: String = row.get(1).map_err(|e| CoreError::Database(e.to_string()))?;

            let workspace = Workspace {
                id,
                name,
                root: crate::types::SplitNode::Leaf(crate::types::LeafNode::new(format!(
                    "pane-{}",
                    uuid::Uuid::new_v4()
                ))),
                active_pane_id: None,
                has_notification: false,
            };

            workspaces.push(workspace);
        }

        Ok(ListWorkspacesOutput { workspaces })
    }

    pub async fn delete(&self, input: DeleteWorkspaceInput) -> Result<DeleteWorkspaceOutput> {
        let id_escaped = escape_sql(&input.id);
        let sql = format!("SELECT id FROM workspaces WHERE id = '{}'", id_escaped);
        let mut rows = self.db.query(&sql, ()).await?;

        if rows.next().await.map_err(|e| CoreError::Database(e.to_string()))?.is_none() {
            return Err(CoreError::InvalidWorkspaceId(format!(
                "Workspace not found: {}",
                input.id
            )));
        }

        let sql = format!("DELETE FROM workspaces WHERE id = '{}'", id_escaped);
        self.db.execute(&sql, ()).await?;

        Ok(DeleteWorkspaceOutput {
            success: true,
            id: input.id,
        })
    }

    pub async fn rename(&self, input: RenameWorkspaceInput) -> Result<RenameWorkspaceOutput> {
        let id_escaped = escape_sql(&input.id);
        let sql = format!("SELECT id, name FROM workspaces WHERE id = '{}'", id_escaped);
        let mut rows = self.db.query(&sql, ()).await?;

        let (id, _old_name) = match rows.next().await.map_err(|e| CoreError::Database(e.to_string()))? {
            Some(row) => {
                let id: String = row.get(0).map_err(|e| CoreError::Database(e.to_string()))?;
                let name: String = row.get(1).map_err(|e| CoreError::Database(e.to_string()))?;
                (id, name)
            }
            None => {
                return Err(CoreError::InvalidWorkspaceId(format!(
                    "Workspace not found: {}",
                    input.id
                )));
            }
        };

        let name_escaped = escape_sql(&input.name);
        let sql = format!(
            "UPDATE workspaces SET name = '{}' WHERE id = '{}'",
            name_escaped, id_escaped
        );
        self.db.execute(&sql, ()).await?;

        let workspace = Workspace {
            id: id.clone(),
            name: input.name,
            root: crate::types::SplitNode::Leaf(crate::types::LeafNode::new(format!(
                "pane-{}",
                uuid::Uuid::new_v4()
            ))),
            active_pane_id: None,
            has_notification: false,
        };

        Ok(RenameWorkspaceOutput { workspace })
    }

    pub fn create_notification(&self, notification: WorkspaceNotification) -> OutgoingMessage {
        let method = "workspace.state_change".to_string();
        let params = serde_json::to_value(notification).ok();
        OutgoingMessage::notification(method, params)
    }
}

pub struct WorkspaceRpcHandler {
    inner: WorkspaceHandler,
}

impl WorkspaceRpcHandler {
    pub fn new(db: Arc<DatabaseClient>) -> Self {
        Self {
            inner: WorkspaceHandler::new(db),
        }
    }

    pub async fn handle(&self, method: &str, params: Option<Value>) -> std::result::Result<Value, ProtocolError> {
        match method {
            "workspace.create" => {
                let input: CreateWorkspaceInput = params
                    .map(|p| serde_json::from_value(p).map_err(|e| ProtocolError::InvalidParams(e.to_string())))
                    .unwrap_or(Err(ProtocolError::InvalidParams("Missing params".to_string())))?;

                let output = self.inner.create(input).await.map_err(|e| {
                    ProtocolError::InternalError(format!("Failed to create workspace: {}", e))
                })?;

                serde_json::to_value(output).map_err(|e| ProtocolError::InternalError(e.to_string()))
            }
            "workspace.list" => {
                let input: ListWorkspacesInput = params
                    .map(|p| serde_json::from_value(p).unwrap_or(ListWorkspacesInput { filter: None }))
                    .unwrap_or(ListWorkspacesInput { filter: None });

                let output = self.inner.list(input).await.map_err(|e| {
                    ProtocolError::InternalError(format!("Failed to list workspaces: {}", e))
                })?;

                serde_json::to_value(output).map_err(|e| ProtocolError::InternalError(e.to_string()))
            }
            "workspace.delete" => {
                let input: DeleteWorkspaceInput = params
                    .map(|p| serde_json::from_value(p).map_err(|e| ProtocolError::InvalidParams(e.to_string())))
                    .unwrap_or(Err(ProtocolError::InvalidParams("Missing params".to_string())))?;

                let output = self.inner.delete(input).await.map_err(|e| {
                    ProtocolError::InternalError(format!("Failed to delete workspace: {}", e))
                })?;

                serde_json::to_value(output).map_err(|e| ProtocolError::InternalError(e.to_string()))
            }
            "workspace.rename" => {
                let input: RenameWorkspaceInput = params
                    .map(|p| serde_json::from_value(p).map_err(|e| ProtocolError::InvalidParams(e.to_string())))
                    .unwrap_or(Err(ProtocolError::InvalidParams("Missing params".to_string())))?;

                let output = self.inner.rename(input).await.map_err(|e| {
                    ProtocolError::InternalError(format!("Failed to rename workspace: {}", e))
                })?;

                serde_json::to_value(output).map_err(|e| ProtocolError::InternalError(e.to_string()))
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
                "CREATE TABLE workspaces (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL
                )",
                (),
            )
            .await
            .unwrap();

        Arc::new(client)
    }

    #[tokio::test]
    async fn test_create_workspace() {
        let db = setup_test_db().await;
        let handler = WorkspaceHandler::new(db);

        let input = CreateWorkspaceInput {
            name: "Test Workspace".to_string(),
            id: Some("ws-test-123".to_string()),
        };

        let output = handler.create(input).await.unwrap();

        assert_eq!(output.workspace.id, "ws-test-123");
        assert_eq!(output.workspace.name, "Test Workspace");
    }

    #[tokio::test]
    async fn test_create_workspace_generates_id() {
        let db = setup_test_db().await;
        let handler = WorkspaceHandler::new(db);

        let input = CreateWorkspaceInput {
            name: "Auto ID Workspace".to_string(),
            id: None,
        };

        let output = handler.create(input).await.unwrap();
        assert!(!output.workspace.id.is_empty());
    }

    #[tokio::test]
    async fn test_list_workspaces_empty() {
        let db = setup_test_db().await;
        let handler = WorkspaceHandler::new(db);

        let input = ListWorkspacesInput { filter: None };
        let output = handler.list(input).await.unwrap();

        assert!(output.workspaces.is_empty());
    }

    #[tokio::test]
    async fn test_list_workspaces_with_data() {
        let db = setup_test_db().await;
        let handler = WorkspaceHandler::new(db);

        handler
            .create(CreateWorkspaceInput {
                name: "Workspace 1".to_string(),
                id: Some("ws-1".to_string()),
            })
            .await
            .unwrap();

        handler
            .create(CreateWorkspaceInput {
                name: "Workspace 2".to_string(),
                id: Some("ws-2".to_string()),
            })
            .await
            .unwrap();

        let input = ListWorkspacesInput { filter: None };
        let output = handler.list(input).await.unwrap();

        assert_eq!(output.workspaces.len(), 2);
    }

    #[tokio::test]
    async fn test_delete_workspace() {
        let db = setup_test_db().await;
        let handler = WorkspaceHandler::new(db.clone());

        handler
            .create(CreateWorkspaceInput {
                name: "To Delete".to_string(),
                id: Some("ws-delete".to_string()),
            })
            .await
            .unwrap();

        let input = DeleteWorkspaceInput {
            id: "ws-delete".to_string(),
        };
        let output = handler.delete(input).await.unwrap();

        assert!(output.success);

        let list_output = handler.list(ListWorkspacesInput { filter: None }).await.unwrap();
        assert!(list_output.workspaces.is_empty());
    }

    #[tokio::test]
    async fn test_delete_workspace_not_found() {
        let db = setup_test_db().await;
        let handler = WorkspaceHandler::new(db);

        let input = DeleteWorkspaceInput {
            id: "non-existent".to_string(),
        };

        let result = handler.delete(input).await;
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_rename_workspace() {
        let db = setup_test_db().await;
        let handler = WorkspaceHandler::new(db);

        handler
            .create(CreateWorkspaceInput {
                name: "Old Name".to_string(),
                id: Some("ws-rename".to_string()),
            })
            .await
            .unwrap();

        let input = RenameWorkspaceInput {
            id: "ws-rename".to_string(),
            name: "New Name".to_string(),
        };
        let output = handler.rename(input).await.unwrap();

        assert_eq!(output.workspace.name, "New Name");
    }

    #[tokio::test]
    async fn test_rename_workspace_not_found() {
        let db = setup_test_db().await;
        let handler = WorkspaceHandler::new(db);

        let input = RenameWorkspaceInput {
            id: "non-existent".to_string(),
            name: "New Name".to_string(),
        };

        let result = handler.rename(input).await;
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_create_notification() {
        let db = setup_test_db().await;
        let handler = WorkspaceHandler::new(db);

        let workspace = Workspace {
            id: "ws-1".to_string(),
            name: "Test".to_string(),
            root: crate::types::SplitNode::Leaf(crate::types::LeafNode::new("pane-1".to_string())),
            active_pane_id: None,
            has_notification: false,
        };

        let notification = WorkspaceNotification::Created { workspace };
        let message = handler.create_notification(notification);

        match message {
            OutgoingMessage::Notification { method, .. } => {
                assert_eq!(method, "workspace.state_change");
            }
            _ => panic!("Expected Notification variant"),
        }
    }

    #[tokio::test]
    async fn test_rpc_handler_create() {
        let db = setup_test_db().await;
        let handler = WorkspaceRpcHandler::new(db);

        let params = serde_json::json!({
            "name": "RPC Test",
            "id": "ws-rpc-1"
        });

        let result = handler.handle("workspace.create", Some(params)).await;
        assert!(result.is_ok());
    }

    #[tokio::test]
    async fn test_rpc_handler_list() {
        let db = setup_test_db().await;
        let handler = WorkspaceRpcHandler::new(db.clone());

        let create_params = serde_json::json!({
            "name": "List Test",
            "id": "ws-list-1"
        });
        handler.handle("workspace.create", Some(create_params)).await.unwrap();

        let result = handler.handle("workspace.list", None).await;
        assert!(result.is_ok());
    }

    #[tokio::test]
    async fn test_rpc_handler_delete() {
        let db = setup_test_db().await;
        let handler = WorkspaceRpcHandler::new(db.clone());

        let create_params = serde_json::json!({
            "name": "Delete Test",
            "id": "ws-delete-1"
        });
        handler.handle("workspace.create", Some(create_params)).await.unwrap();

        let delete_params = serde_json::json!({
            "id": "ws-delete-1"
        });
        let result = handler.handle("workspace.delete", Some(delete_params)).await;
        assert!(result.is_ok());
    }

    #[tokio::test]
    async fn test_rpc_handler_rename() {
        let db = setup_test_db().await;
        let handler = WorkspaceRpcHandler::new(db.clone());

        let create_params = serde_json::json!({
            "name": "Rename Test",
            "id": "ws-rename-1"
        });
        handler.handle("workspace.create", Some(create_params)).await.unwrap();

        let rename_params = serde_json::json!({
            "id": "ws-rename-1",
            "name": "Renamed Workspace"
        });
        let result = handler.handle("workspace.rename", Some(rename_params)).await;
        assert!(result.is_ok());
    }

    #[tokio::test]
    async fn test_rpc_handler_method_not_found() {
        let db = setup_test_db().await;
        let handler = WorkspaceRpcHandler::new(db);

        let result = handler.handle("workspace.unknown", None).await;
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_rpc_handler_invalid_params() {
        let db = setup_test_db().await;
        let handler = WorkspaceRpcHandler::new(db);

        let result = handler.handle("workspace.create", None).await;
        assert!(result.is_err());
    }
}
