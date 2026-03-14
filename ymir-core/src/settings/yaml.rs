use crate::types::CoreError;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::Path;

#[derive(Serialize, Deserialize, Debug, Default, Clone, PartialEq)]
pub struct WorkspaceSettingsFile {
    pub workspaces: HashMap<String, WorkspaceSettings>,
}

#[derive(Serialize, Deserialize, Debug, Default, Clone, PartialEq)]
pub struct WorkspaceSettings {
    #[serde(default)]
    pub color: Option<String>,
    #[serde(default)]
    pub icon: Option<String>,
    #[serde(default)]
    pub working_directory: Option<String>,
    #[serde(default)]
    pub subtitle: Option<String>,
}

pub async fn load(path: &Path) -> Result<WorkspaceSettingsFile, CoreError> {
    let content = tokio::fs::read_to_string(path)
        .await
        .map_err(|e| CoreError::Other(format!("Failed to read settings file: {}", e)))?;

    serde_yaml::from_str(&content)
        .map_err(|e| CoreError::DeserializationError(format!("Failed to parse YAML: {}", e)))
}

pub async fn save(path: &Path, settings: &WorkspaceSettingsFile) -> Result<(), CoreError> {
    let yaml_content = serde_yaml::to_string(settings)
        .map_err(|e| CoreError::SerializationError(format!("Failed to serialize settings: {}", e)))?;

    let temp_path = path.with_extension("yaml.tmp");

    tokio::fs::write(&temp_path, &yaml_content)
        .await
        .map_err(|e| CoreError::Other(format!("Failed to write temp file: {}", e)))?;

    tokio::fs::rename(&temp_path, path)
        .await
        .map_err(|e| CoreError::Other(format!("Failed to rename temp file: {}", e)))?;

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::NamedTempFile;

    #[tokio::test]
    async fn test_empty_settings_serialization_roundtrip() {
        let settings = WorkspaceSettingsFile {
            workspaces: HashMap::new(),
        };

        let temp_file = NamedTempFile::new().unwrap();
        let path = temp_file.path();

        save(path, &settings).await.unwrap();
        let loaded = load(path).await.unwrap();

        assert_eq!(settings.workspaces, loaded.workspaces);
    }

    #[tokio::test]
    async fn test_workspace_settings_with_all_fields() {
        let mut workspaces = HashMap::new();
        workspaces.insert(
            "workspace-1".to_string(),
            WorkspaceSettings {
                color: Some("#ef4444".to_string()),
                icon: Some("terminal".to_string()),
                working_directory: Some("/home/user/project".to_string()),
                subtitle: Some("Development Workspace".to_string()),
            },
        );

        let settings = WorkspaceSettingsFile { workspaces };

        let temp_file = NamedTempFile::new().unwrap();
        let path = temp_file.path();

        save(path, &settings).await.unwrap();
        let loaded = load(path).await.unwrap();

        assert_eq!(settings.workspaces, loaded.workspaces);
    }

    #[tokio::test]
    async fn test_workspace_settings_partial_fields() {
        let mut workspaces = HashMap::new();
        workspaces.insert(
            "workspace-1".to_string(),
            WorkspaceSettings {
                color: Some("#3b82f6".to_string()),
                icon: None,
                working_directory: Some("/home/user/another".to_string()),
                subtitle: None,
            },
        );

        let settings = WorkspaceSettingsFile { workspaces };

        let temp_file = NamedTempFile::new().unwrap();
        let path = temp_file.path();

        save(path, &settings).await.unwrap();
        let loaded = load(path).await.unwrap();

        assert_eq!(settings.workspaces, loaded.workspaces);
    }

    #[tokio::test]
    async fn test_multiple_workspaces() {
        let mut workspaces = HashMap::new();
        workspaces.insert(
            "workspace-1".to_string(),
            WorkspaceSettings {
                color: Some("#ef4444".to_string()),
                icon: Some("terminal".to_string()),
                working_directory: None,
                subtitle: None,
            },
        );
        workspaces.insert(
            "workspace-2".to_string(),
            WorkspaceSettings {
                color: Some("#22c55e".to_string()),
                icon: Some("folder".to_string()),
                working_directory: Some("/home/user/docs".to_string()),
                subtitle: Some("Documentation".to_string()),
            },
        );

        let settings = WorkspaceSettingsFile { workspaces };

        let temp_file = NamedTempFile::new().unwrap();
        let path = temp_file.path();

        save(path, &settings).await.unwrap();
        let loaded = load(path).await.unwrap();

        assert_eq!(settings.workspaces, loaded.workspaces);
    }

    #[tokio::test]
    async fn test_load_nonexistent_file_returns_error() {
        let path = Path::new("/tmp/nonexistent_settings_file.yaml");
        let result = load(path).await;

        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_yaml_output_format() {
        let mut workspaces = HashMap::new();
        workspaces.insert(
            "workspace-1".to_string(),
            WorkspaceSettings {
                color: Some("#ef4444".to_string()),
                icon: Some("terminal".to_string()),
                working_directory: Some("/home/user/project".to_string()),
                subtitle: Some("Dev Workspace".to_string()),
            },
        );

        let settings = WorkspaceSettingsFile { workspaces };

        let temp_file = NamedTempFile::new().unwrap();
        let path = temp_file.path();

        save(path, &settings).await.unwrap();

        let yaml_content = tokio::fs::read_to_string(path).await.unwrap();

        assert!(yaml_content.contains("workspaces:"));
        assert!(yaml_content.contains("workspace-1:"));
        assert!(yaml_content.contains("color:"));
        assert!(yaml_content.contains("icon:"));
        assert!(yaml_content.contains("working_directory:"));
        assert!(yaml_content.contains("subtitle:"));
    }
}
