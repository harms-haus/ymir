//! Migration runner for ymir-core database schema
//!
//! This module provides a lightweight migration runner that:
//! - Discovers embedded SQL migration files
//! - Applies them in version order
//! - Tracks applied migrations in _migrations table
//!
//! Uses libSQL compatible syntax.

use crate::Result;

/// Embedded migration SQL files
const MIGRATION_001: &str = include_str!("../../migrations/001_initial_schema.sql");

/// Represents a single migration with its version number and SQL content
#[derive(Debug, Clone)]
pub struct Migration {
    pub version: i32,
    pub name: String,
    pub sql: String,
}

/// Migration runner for applying schema changes
pub struct MigrationRunner;

impl MigrationRunner {
    /// Apply all pending migrations to database
    pub async fn apply_migrations(db: &libsql::Connection) -> Result<()> {
        let migrations = Self::discover_migrations()?;
        let current_version = Self::get_current_version(db).await?;

        for migration in migrations {
            if migration.version > current_version {
                Self::apply_migration(db, &migration).await?;
            }
        }

        Ok(())
    }

    /// Get current migration version from database
    /// Returns 0 if _migrations table does not exist yet
    pub async fn get_current_version(db: &libsql::Connection) -> Result<i32> {
        // Check if _migrations table exists by querying sqlite_master
        let mut rows = db
            .query(
                "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = '_migrations'",
                (),
            )
            .await
            .map_err(|e| {
                crate::CoreError::Database(format!("Failed to check _migrations table: {}", e))
            })?;

        let table_exists: i64 = rows
            .next()
            .await
            .map_err(|e| crate::CoreError::Database(format!("Failed to fetch: {}", e)))?
            .map(|row| row.get(0).unwrap_or(0))
            .unwrap_or(0);

        if table_exists == 0 {
            return Ok(0);
        }

        let mut rows = db
            .query("SELECT COALESCE(MAX(version), 0) FROM _migrations", ())
            .await
            .map_err(|e| {
                crate::CoreError::Database(format!("Failed to get current version: {}", e))
            })?;

        let version: i32 = rows
            .next()
            .await
            .map_err(|e| crate::CoreError::Database(format!("Failed to fetch version: {}", e)))?
            .map(|row| row.get(0).unwrap_or(0))
            .unwrap_or(0);

        Ok(version)
    }

    /// Discover all embedded migrations
    fn discover_migrations() -> Result<Vec<Migration>> {
        // Return migrations in version order (ordered list)
        let migrations = vec![Migration {
            version: 1,
            name: "001_initial_schema".to_string(),
            sql: MIGRATION_001.to_string(),
        }];

        if migrations.is_empty() {
            return Err(crate::CoreError::Database(
                "No migration files found".to_string(),
            ));
        }

        Ok(migrations)
    }

    /// Apply a single migration
    /// The migration SQL is responsible for creating/updating schema AND recording itself in _migrations
    async fn apply_migration(db: &libsql::Connection, migration: &Migration) -> Result<()> {
        // Filter out comment lines before processing
        let cleaned_sql: String = migration
            .sql
            .lines()
            .filter(|line| {
                let trimmed = line.trim();
                !trimmed.is_empty() && !trimmed.starts_with("--")
            })
            .collect::<Vec<_>>()
            .join("\n");

        // Execute each statement in the migration
        for statement in cleaned_sql.split(';') {
            let stmt = statement.trim();
            if !stmt.is_empty() {
                db.execute(stmt, ()).await.map_err(|e| {
                    crate::CoreError::Database(format!(
                        "Failed to apply migration {}: {}",
                        migration.name, e
                    ))
                })?;
            }
        }

        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    async fn setup_test_db() -> libsql::Connection {
        let db = libsql::Builder::new_local(":memory:")
            .build()
            .await
            .expect("Failed to create in-memory database");
        let conn = db.connect().expect("Failed to get connection");
        conn.execute("PRAGMA foreign_keys = ON;", ())
            .await
            .expect("Failed to enable foreign keys");
        conn
    }

    #[tokio::test]
    async fn test_get_current_version_no_migrations() {
        let db = setup_test_db().await;

        let version = MigrationRunner::get_current_version(&db).await.unwrap();
        assert_eq!(version, 0, "Initial version should be 0");
    }

    #[tokio::test]
    async fn test_apply_initial_schema_migration() {
        let db = setup_test_db().await;

        MigrationRunner::apply_migrations(&db).await.unwrap();

        let mut rows = db
            .query("SELECT COUNT(*) FROM _migrations", ())
            .await
            .unwrap();
        let count: i64 = rows.next().await.unwrap().unwrap().get(0).unwrap();
        assert_eq!(count, 1, "Should have 1 migration record");

        let version = MigrationRunner::get_current_version(&db).await.unwrap();
        assert_eq!(version, 1, "Current version should be 1");

        let mut rows = db
            .query("SELECT name FROM _migrations WHERE version = 1", ())
            .await
            .unwrap();
        let name: String = rows.next().await.unwrap().unwrap().get(0).unwrap();
        assert_eq!(name, "001_initial_schema");

        let mut rows = db
            .query(
                "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'",
                (),
            )
            .await
            .unwrap();
        let table_count: i64 = rows.next().await.unwrap().unwrap().get(0).unwrap();
        assert!(table_count > 0, "Schema tables should be created");
    }

    #[tokio::test]
    async fn test_apply_migrations_idempotent() {
        let db = setup_test_db().await;

        MigrationRunner::apply_migrations(&db).await.unwrap();
        MigrationRunner::apply_migrations(&db).await.unwrap();

        let mut rows = db
            .query("SELECT COUNT(*) FROM _migrations", ())
            .await
            .unwrap();
        let count: i64 = rows.next().await.unwrap().unwrap().get(0).unwrap();
        assert_eq!(count, 1, "Should not re-apply migrations");
    }

    #[tokio::test]
    async fn test_get_current_version_after_migration() {
        let db = setup_test_db().await;

        MigrationRunner::apply_migrations(&db).await.unwrap();

        let version = MigrationRunner::get_current_version(&db).await.unwrap();
        assert_eq!(version, 1);
    }

    #[tokio::test]
    async fn test_migration_enables_foreign_keys() {
        let db = setup_test_db().await;

        MigrationRunner::apply_migrations(&db).await.unwrap();

        db.execute(
            "INSERT INTO workspaces (id, name) VALUES ('ws-1', 'Test')",
            (),
        )
        .await
        .unwrap();
        db.execute(
            "INSERT INTO panes (id, workspace_id) VALUES ('pane-1', 'ws-1')",
            (),
        )
        .await
        .unwrap();
        db.execute(
            "INSERT INTO tabs (id, workspace_id, pane_id) VALUES ('tab-1', 'ws-1', 'pane-1')",
            (),
        )
        .await
        .unwrap();

        db.execute("DELETE FROM workspaces WHERE id = 'ws-1'", ())
            .await
            .unwrap();

        let mut rows = db.query("SELECT COUNT(*) FROM panes", ()).await.unwrap();
        let pane_count: i64 = rows.next().await.unwrap().unwrap().get(0).unwrap();
        assert_eq!(pane_count, 0, "Panes should cascade delete");

        let mut rows = db.query("SELECT COUNT(*) FROM tabs", ()).await.unwrap();
        let tab_count: i64 = rows.next().await.unwrap().unwrap().get(0).unwrap();
        assert_eq!(tab_count, 0, "Tabs should cascade delete");
    }

    #[tokio::test]
    async fn test_migration_creates_settings_table() {
        let db = setup_test_db().await;

        MigrationRunner::apply_migrations(&db).await.unwrap();

        let mut rows = db
            .query(
                "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = 'settings'",
                (),
            )
            .await
            .unwrap();
        let exists: i64 = rows.next().await.unwrap().unwrap().get(0).unwrap();
        assert_eq!(exists, 1, "Settings table should exist");

        db.execute(
            "INSERT INTO settings (key, value) VALUES ('test_key', 'test_value')",
            (),
        )
        .await
        .unwrap();

        let mut rows = db
            .query("SELECT value FROM settings WHERE key = 'test_key'", ())
            .await
            .unwrap();
        let value: String = rows.next().await.unwrap().unwrap().get(0).unwrap();
        assert_eq!(value, "test_value");
    }

    #[tokio::test]
    async fn test_migration_creates_git_tables() {
        let db = setup_test_db().await;

        MigrationRunner::apply_migrations(&db).await.unwrap();

        let mut rows = db
            .query(
                "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = 'git_repos'",
                (),
            )
            .await
            .unwrap();
        let git_repos_exists: i64 = rows.next().await.unwrap().unwrap().get(0).unwrap();
        assert_eq!(git_repos_exists, 1, "git_repos table should exist");

        let mut rows = db
            .query(
                "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = 'git_files'",
                (),
            )
            .await
            .unwrap();
        let git_files_exists: i64 = rows.next().await.unwrap().unwrap().get(0).unwrap();
        assert_eq!(git_files_exists, 1, "git_files table should exist");
    }
}
