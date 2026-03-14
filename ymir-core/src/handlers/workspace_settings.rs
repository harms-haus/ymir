use crate::db::client::DatabaseClient;
use crate::server::protocol::ProtocolError;
use crate::settings::yaml::{WorkspaceSettings, WorkspaceSettingsFile};
use crate::types::{CoreError, Result};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::path::PathBuf;
use std::sync::Arc;

fn escape_sql(value: &str) -> String {
    value.replace("'", "''")
}

#[derive(Debug, Clone, Deserialize)]
pub struct GetSettingsInput {
    pub workspace_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GetSettingsOutput {
    pub settings: WorkspaceSettings,
}

#[derive(Debug, Clone, Deserialize)]
pub struct UpdateSettingsInput {
    pub workspace_id: String,
    pub color: Option<String>,
    pub icon: Option<String>,
    pub working_directory: Option<String>,
    pub subtitle: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateSettingsOutput {
    pub settings: WorkspaceSettings,
}

#[derive(Debug, Clone)]
pub struct WorkspaceSettingsHandler {
    db: Arc<DatabaseClient>,
    yaml_path: PathBuf,
}

impl WorkspaceSettingsHandler {
    pub fn new(db: Arc<DatabaseClient>, yaml_path: PathBuf) -> Self {
        Self { db, yaml_path }
    }

    pub async fn get_settings(&self, input: GetSettingsInput) -> Result<GetSettingsOutput> {
        let workspace_id_escaped = escape_sql(&input.workspace_id);
        let sql = format!(
            "SELECT color, icon, working_directory, subtitle FROM workspaces WHERE id = '{}'",
            workspace_id_escaped
        );
        let mut rows = self.db.query(&sql, ()).await?;

        let row = rows
            .next()
            .await
            .map_err(|e| CoreError::Database(e.to_string()))?;

        if row.is_none() {
            return Err(CoreError::InvalidWorkspaceId(format!(
                "Workspace not found: {}",
                input.workspace_id
            )));
        }

        let row = row.unwrap();
        let color: Option<String> = row.get(0).map_err(|e| CoreError::Database(e.to_string()))?;
        let icon: Option<String> = row.get(1).map_err(|e| CoreError::Database(e.to_string()))?;
        let working_directory: Option<String> =
            row.get(2).map_err(|e| CoreError::Database(e.to_string()))?;
        let subtitle: Option<String> =
            row.get(3).map_err(|e| CoreError::Database(e.to_string()))?;

        let settings = WorkspaceSettings {
            color,
            icon,
            working_directory,
            subtitle,
        };

        Ok(GetSettingsOutput { settings })
    }

    pub async fn update_settings(&self, input: UpdateSettingsInput) -> Result<UpdateSettingsOutput> {
        // Validate workspace exists
        let workspace_id_escaped = escape_sql(&input.workspace_id);
        let check_sql = format!(
            "SELECT id FROM workspaces WHERE id = '{}'",
            workspace_id_escaped
        );
        let mut check_rows = self.db.query(&check_sql, ()).await?;

        if check_rows
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

        // Build update SQL with only provided fields
        let mut updates = Vec::new();

        if let Some(ref color) = input.color {
            updates.push(format!("color = '{}'", escape_sql(color)));
        }
        if let Some(ref icon) = input.icon {
            updates.push(format!("icon = '{}'", escape_sql(icon)));
        }
        if let Some(ref working_directory) = input.working_directory {
            updates.push(format!(
                "working_directory = '{}'",
                escape_sql(working_directory)
            ));
        }
        if let Some(ref subtitle) = input.subtitle {
            updates.push(format!("subtitle = '{}'", escape_sql(subtitle)));
        }

        if !updates.is_empty() {
            let update_sql = format!(
                "UPDATE workspaces SET {} WHERE id = '{}'",
                updates.join(", "),
                workspace_id_escaped
            );
            self.db.execute(&update_sql, ()).await?;
        }

        // Get updated settings
        let settings = WorkspaceSettings {
            color: input.color,
            icon: input.icon,
            working_directory: input.working_directory,
            subtitle: input.subtitle,
        };

        // Save to YAML file
        self.save_to_yaml(&input.workspace_id, &settings).await?;

        Ok(UpdateSettingsOutput { settings })
    }

    async fn save_to_yaml(
        &self,
        workspace_id: &str,
        settings: &WorkspaceSettings,
    ) -> Result<()> {
        // Load existing settings file or create new one
        let mut settings_file = if self.yaml_path.exists() {
            crate::settings::yaml::load(&self.yaml_path).await.unwrap_or_else(|_| {
                WorkspaceSettingsFile {
                    workspaces: std::collections::HashMap::new(),
                }
            })
        } else {
            WorkspaceSettingsFile {
                workspaces: std::collections::HashMap::new(),
            }
        };

        // Update the specific workspace settings
        settings_file
            .workspaces
            .insert(workspace_id.to_string(), settings.clone());

        // Save back to file
        crate::settings::yaml::save(&self.yaml_path, &settings_file).await?;

        Ok(())
    }
}

pub struct WorkspaceSettingsRpcHandler {
    inner: WorkspaceSettingsHandler,
}

impl WorkspaceSettingsRpcHandler {
    pub fn new(db: Arc<DatabaseClient>, yaml_path: PathBuf) -> Self {
        Self {
            inner: WorkspaceSettingsHandler::new(db, yaml_path),
        }
    }

    pub async fn handle(
        &self,
        method: &str,
        params: Option<Value>,
    ) -> std::result::Result<Value, ProtocolError> {
        match method {
            "workspace.getSettings" => {
                let input: GetSettingsInput = params
                    .map(|p| {
                        serde_json::from_value(p)
                            .map_err(|e| ProtocolError::InvalidParams(e.to_string()))
                    })
                    .unwrap_or(Err(ProtocolError::InvalidParams(
                        "Missing params".to_string(),
                    )))?;

                let output = self.inner.get_settings(input).await.map_err(|e| {
                    ProtocolError::InternalError(format!("Failed to get settings: {}", e))
                })?;

                serde_json::to_value(output)
                    .map_err(|e| ProtocolError::InternalError(e.to_string()))
            }
            "workspace.updateSettings" => {
                let input: UpdateSettingsInput = params
                    .map(|p| {
                        serde_json::from_value(p)
                            .map_err(|e| ProtocolError::InvalidParams(e.to_string()))
                    })
                    .unwrap_or(Err(ProtocolError::InvalidParams(
                        "Missing params".to_string(),
                    )))?;

                let output = self.inner.update_settings(input).await.map_err(|e| {
                    ProtocolError::InternalError(format!("Failed to update settings: {}", e))
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
    use tempfile::NamedTempFile;

    async fn setup_test_db() -> Arc<DatabaseClient> {
        let client = DatabaseClient::new_in_memory().await.unwrap();

        client
            .execute(
                "CREATE TABLE workspaces (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    color TEXT,
                    icon TEXT,
                    working_directory TEXT,
                    subtitle TEXT
                )",
                (),
            )
            .await
            .unwrap();

        Arc::new(client)
    }

    fn setup_test_yaml_path() -> PathBuf {
        let temp_file = NamedTempFile::new().unwrap();
        temp_file.path().to_path_buf()
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
    async fn test_get_settings() {
        let db = setup_test_db().await;
        let yaml_path = setup_test_yaml_path();
        let handler = WorkspaceSettingsHandler::new(db.clone(), yaml_path);

        create_test_workspace(&db, "ws-test", "Test Workspace").await;

        // Update settings first
        let update_input = UpdateSettingsInput {
            workspace_id: "ws-test".to_string(),
            color: Some("#ef4444".to_string()),
            icon: Some("terminal".to_string()),
            working_directory: Some("/home/user/project".to_string()),
            subtitle: Some("Development".to_string()),
        };
        handler.update_settings(update_input).await.unwrap();

        // Get settings
        let get_input = GetSettingsInput {
            workspace_id: "ws-test".to_string(),
        };
        let output = handler.get_settings(get_input).await.unwrap();

        assert_eq!(output.settings.color, Some("#ef4444".to_string()));
        assert_eq!(output.settings.icon, Some("terminal".to_string()));
        assert_eq!(
            output.settings.working_directory,
            Some("/home/user/project".to_string())
        );
        assert_eq!(output.settings.subtitle, Some("Development".to_string()));
    }

    #[tokio::test]
    async fn test_get_settings_not_found() {
        let db = setup_test_db().await;
        let yaml_path = setup_test_yaml_path();
        let handler = WorkspaceSettingsHandler::new(db, yaml_path);

        let get_input = GetSettingsInput {
            workspace_id: "non-existent".to_string(),
        };
        let result = handler.get_settings(get_input).await;
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_update_settings() {
        let db = setup_test_db().await;
        let yaml_path = setup_test_yaml_path();
        let handler = WorkspaceSettingsHandler::new(db.clone(), yaml_path.clone());

        create_test_workspace(&db, "ws-update", "Update Test").await;

        let input = UpdateSettingsInput {
            workspace_id: "ws-update".to_string(),
            color: Some("#3b82f6".to_string()),
            icon: Some("folder".to_string()),
            working_directory: Some("/home/user/docs".to_string()),
            subtitle: Some("Documentation".to_string()),
        };

        let output = handler.update_settings(input).await.unwrap();

        assert_eq!(output.settings.color, Some("#3b82f6".to_string()));
        assert_eq!(output.settings.icon, Some("folder".to_string()));
        assert_eq!(
            output.settings.working_directory,
            Some("/home/user/docs".to_string())
        );
        assert_eq!(output.settings.subtitle, Some("Documentation".to_string()));

        // Verify YAML file was created
        assert!(yaml_path.exists());
    }

    #[tokio::test]
    async fn test_update_settings_partial() {
        let db = setup_test_db().await;
        let yaml_path = setup_test_yaml_path();
        let handler = WorkspaceSettingsHandler::new(db.clone(), yaml_path);

        create_test_workspace(&db, "ws-partial", "Partial Test").await;

        // Update only color
        let input = UpdateSettingsInput {
            workspace_id: "ws-partial".to_string(),
            color: Some("#22c55e".to_string()),
            icon: None,
            working_directory: None,
            subtitle: None,
        };

        let output = handler.update_settings(input).await.unwrap();

        assert_eq!(output.settings.color, Some("#22c55e".to_string()));
        assert_eq!(output.settings.icon, None);
        assert_eq!(output.settings.working_directory, None);
        assert_eq!(output.settings.subtitle, None);
    }

    #[tokio::test]
    async fn test_update_settings_not_found() {
        let db = setup_test_db().await;
        let yaml_path = setup_test_yaml_path();
        let handler = WorkspaceSettingsHandler::new(db, yaml_path);

        let input = UpdateSettingsInput {
            workspace_id: "non-existent".to_string(),
            color: Some("#000000".to_string()),
            icon: None,
            working_directory: None,
            subtitle: None,
        };

        let result = handler.update_settings(input).await;
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_yaml_persistence() {
        let db = setup_test_db().await;
        let yaml_path = setup_test_yaml_path();
        let handler = WorkspaceSettingsHandler::new(db.clone(), yaml_path.clone());

        create_test_workspace(&db, "ws-yaml", "YAML Test").await;

        // Update settings
        let input = UpdateSettingsInput {
            workspace_id: "ws-yaml".to_string(),
            color: Some("#a855f7".to_string()),
            icon: Some("code".to_string()),
            working_directory: Some("/home/user/code".to_string()),
            subtitle: Some("Code Workspace".to_string()),
        };
        handler.update_settings(input).await.unwrap();

        // Load YAML and verify
        let loaded = crate::settings::yaml::load(&yaml_path).await.unwrap();
        let settings = loaded.workspaces.get("ws-yaml").unwrap();

        assert_eq!(settings.color, Some("#a855f7".to_string()));
        assert_eq!(settings.icon, Some("code".to_string()));
        assert_eq!(settings.working_directory, Some("/home/user/code".to_string()));
        assert_eq!(settings.subtitle, Some("Code Workspace".to_string()));
    }

    #[tokio::test]
    async fn test_rpc_handler_get_settings() {
        let db = setup_test_db().await;
        let yaml_path = setup_test_yaml_path();
        let handler = WorkspaceSettingsRpcHandler::new(db.clone(), yaml_path);

        create_test_workspace(&db, "ws-rpc", "RPC Test").await;

        // First update settings
        let update_params = serde_json::json!({
            "workspace_id": "ws-rpc",
            "color": "#f59e0b",
            "icon": "star",
        });
        handler
            .handle("workspace.updateSettings", Some(update_params))
            .await
            .unwrap();

        // Then get settings
        let get_params = serde_json::json!({
            "workspace_id": "ws-rpc",
        });
        let result = handler
            .handle("workspace.getSettings", Some(get_params))
            .await;

        assert!(result.is_ok());
        let output: GetSettingsOutput = serde_json::from_value(result.unwrap()).unwrap();
        assert_eq!(output.settings.color, Some("#f59e0b".to_string()));
        assert_eq!(output.settings.icon, Some("star".to_string()));
    }

    #[tokio::test]
    async fn test_rpc_handler_update_settings() {
        let db = setup_test_db().await;
        let yaml_path = setup_test_yaml_path();
        let handler = WorkspaceSettingsRpcHandler::new(db.clone(), yaml_path);

        create_test_workspace(&db, "ws-rpc-update", "RPC Update Test").await;

        let params = serde_json::json!({
            "workspace_id": "ws-rpc-update",
            "color": "#ec4899",
            "icon": "heart",
            "working_directory": "/home/user/heart",
            "subtitle": "Favorite Workspace",
        });

        let result = handler
            .handle("workspace.updateSettings", Some(params))
            .await;

        assert!(result.is_ok());
        let output: UpdateSettingsOutput = serde_json::from_value(result.unwrap()).unwrap();
        assert_eq!(output.settings.color, Some("#ec4899".to_string()));
        assert_eq!(output.settings.icon, Some("heart".to_string()));
    }

    #[tokio::test]
    async fn test_rpc_handler_method_not_found() {
        let db = setup_test_db().await;
        let yaml_path = setup_test_yaml_path();
        let handler = WorkspaceSettingsRpcHandler::new(db, yaml_path);

        let result = handler.handle("workspace.unknownMethod", None).await;
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_rpc_handler_invalid_params() {
        let db = setup_test_db().await;
        let yaml_path = setup_test_yaml_path();
        let handler = WorkspaceSettingsRpcHandler::new(db, yaml_path);

        let result = handler.handle("workspace.getSettings", None).await;
        assert!(result.is_err());
    }
}
