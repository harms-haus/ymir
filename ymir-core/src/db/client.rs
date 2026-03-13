//! Database client for ymir-core
//!
//! This module provides a generic database client with:
//! - Path/config resolution for workspace vs user DB targets
//! - Shared connection management via Arc<Mutex<Connection>>
//! - Async query and execute helpers
//! - Transaction support
//!
//! Uses libsql for SQLite/Turso compatibility.

use crate::{CoreError, Result};
use std::path::PathBuf;
use std::sync::Arc;
use tokio::sync::Mutex;

/// Database configuration for path resolution
#[derive(Debug, Clone)]
pub struct DbConfig {
    /// Path to the database file
    pub path: PathBuf,
    /// Whether to enable foreign keys (default: true)
    pub enable_foreign_keys: bool,
}

impl DbConfig {
    /// Create a new database configuration
    pub fn new(path: impl Into<PathBuf>) -> Self {
        Self {
            path: path.into(),
            enable_foreign_keys: true,
        }
    }

    /// Create a configuration for a workspace database
    /// Path: `.ymir/workspace.db` in the workspace directory
    pub fn for_workspace(workspace_path: impl Into<PathBuf>) -> Self {
        let mut path = workspace_path.into();
        path.push(".ymir");
        path.push("workspace.db");
        Self::new(path)
    }

    /// Create a configuration for the user state database
    /// Path: `~/.config/ymir/state.db`
    pub fn for_user_state() -> Self {
        let home = dirs::config_dir().unwrap_or_else(|| PathBuf::from("."));
        let mut path = home;
        path.push("ymir");
        path.push("state.db");
        Self::new(path)
    }
}

/// Database client with shared connection management
///
/// Uses Arc<Mutex<Connection>> for safe async sharing.
/// The Mutex is from tokio::sync::Mutex for async compatibility.
#[derive(Debug, Clone)]
pub struct DatabaseClient {
    /// Shared connection wrapped in Arc<Mutex<>> for thread-safe access
    connection: Arc<Mutex<libsql::Connection>>,
    /// Configuration used to create this client
    config: DbConfig,
}

impl DatabaseClient {
    /// Create a new database client from configuration
    ///
    /// This will:
    /// 1. Create parent directories if they don't exist
    /// 2. Open or create the database file
    /// 3. Enable foreign keys if configured
    pub async fn new(config: DbConfig) -> Result<Self> {
        // Ensure parent directory exists
        if let Some(parent) = config.path.parent() {
            tokio::fs::create_dir_all(parent)
                .await
                .map_err(|e| CoreError::Database(format!("Failed to create directory: {}", e)))?;
        }

        // Build the database
        let db = libsql::Builder::new_local(&config.path)
            .build()
            .await
            .map_err(|e| CoreError::Database(format!("Failed to build database: {}", e)))?;

        // Get connection
        let connection = db
            .connect()
            .map_err(|e| CoreError::Database(format!("Failed to connect: {}", e)))?;

        // Enable foreign keys if configured
        if config.enable_foreign_keys {
            connection
                .execute("PRAGMA foreign_keys = ON;", ())
                .await
                .map_err(|e| CoreError::Database(format!("Failed to enable foreign keys: {}", e)))?;
        }

        Ok(Self {
            connection: Arc::new(Mutex::new(connection)),
            config,
        })
    }

    /// Create an in-memory database client for testing
    pub async fn new_in_memory() -> Result<Self> {
        let db = libsql::Builder::new_local(":memory:")
            .build()
            .await
            .map_err(|e| CoreError::Database(format!("Failed to build in-memory database: {}", e)))?;

        let connection = db
            .connect()
            .map_err(|e| CoreError::Database(format!("Failed to connect: {}", e)))?;

        // Always enable foreign keys for in-memory databases
        connection
            .execute("PRAGMA foreign_keys = ON;", ())
            .await
            .map_err(|e| CoreError::Database(format!("Failed to enable foreign keys: {}", e)))?;

        Ok(Self {
            connection: Arc::new(Mutex::new(connection)),
            config: DbConfig::new(":memory:"),
        })
    }

    /// Execute a SQL statement without returning rows
    ///
    /// Returns the number of rows affected
    pub async fn execute(&self, sql: &str, params: impl libsql::params::IntoParams) -> Result<u64> {
        let conn = self.connection.lock().await;
        conn.execute(sql, params)
            .await
            .map_err(|e| CoreError::Database(format!("Execute failed: {}", e)))
    }

    /// Query rows from the database
    ///
    /// Returns a Rows iterator that must be consumed
    pub async fn query(
        &self,
        sql: &str,
        params: impl libsql::params::IntoParams,
    ) -> Result<libsql::Rows> {
        let conn = self.connection.lock().await;
        conn.query(sql, params)
            .await
            .map_err(|e| CoreError::Database(format!("Query failed: {}", e)))
    }

    /// Get the database path
    pub fn path(&self) -> &PathBuf {
        &self.config.path
    }

    /// Get a reference to the shared connection
    pub async fn connection(&self) -> tokio::sync::MutexGuard<'_, libsql::Connection> {
        self.connection.lock().await
    }
}

/// Transaction handle for database operations
///
/// Provides a simple transaction wrapper.
pub struct Transaction<'a> {
    /// Reference to the client
    client: &'a DatabaseClient,
    /// Whether the transaction has been committed
    committed: bool,
}

impl<'a> Transaction<'a> {
    /// Begin a new transaction
    pub async fn begin(client: &'a DatabaseClient) -> Result<Self> {
        let conn = client.connection.lock().await;
        conn.execute("BEGIN TRANSACTION;", ())
            .await
            .map_err(|e| CoreError::Database(format!("Failed to begin transaction: {}", e)))?;
        Ok(Self {
            client,
            committed: false,
        })
    }

    /// Commit the transaction
    pub async fn commit(mut self) -> Result<()> {
        let conn = self.client.connection.lock().await;
        conn.execute("COMMIT;", ())
            .await
            .map_err(|e| CoreError::Database(format!("Failed to commit transaction: {}", e)))?;
        self.committed = true;
        Ok(())
    }

    /// Rollback the transaction
    pub async fn rollback(mut self) -> Result<()> {
        let conn = self.client.connection.lock().await;
        conn.execute("ROLLBACK;", ())
            .await
            .map_err(|e| CoreError::Database(format!("Failed to rollback transaction: {}", e)))?;
        self.committed = true;
        Ok(())
    }

    /// Execute within the transaction
    pub async fn execute(&self, sql: &str, params: impl libsql::params::IntoParams) -> Result<u64> {
        let conn = self.client.connection.lock().await;
        conn.execute(sql, params)
            .await
            .map_err(|e| CoreError::Database(format!("Transaction execute failed: {}", e)))
    }
}

impl<'a> Drop for Transaction<'a> {
    fn drop(&mut self) {
        // Async drop not supported - transactions should be explicitly committed or rolled back
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_client_connects_to_in_memory_db() {
        let client = DatabaseClient::new_in_memory().await;
        assert!(client.is_ok(), "Should create in-memory database client");
    }

    #[tokio::test]
    async fn test_client_executes_sql() {
        let client = DatabaseClient::new_in_memory().await.unwrap();

        // Create a test table
        let result = client
            .execute("CREATE TABLE test (id INTEGER PRIMARY KEY, name TEXT)", ())
            .await;
        assert!(result.is_ok(), "Should create table");

        // Insert a row using string interpolation for test simplicity
        let rows_affected = client
            .execute("INSERT INTO test (name) VALUES ('hello')", ())
            .await
            .unwrap();
        assert_eq!(rows_affected, 1, "Should affect 1 row");
    }

    #[tokio::test]
    async fn test_client_queries_rows() {
        let client = DatabaseClient::new_in_memory().await.unwrap();

        // Setup
        client
            .execute("CREATE TABLE test (id INTEGER PRIMARY KEY, name TEXT)", ())
            .await
            .unwrap();
        client
            .execute("INSERT INTO test (id, name) VALUES (1, 'hello')", ())
            .await
            .unwrap();

        // Query
        let mut rows = client.query("SELECT name FROM test WHERE id = 1", ()).await.unwrap();
        let row = rows.next().await.unwrap().unwrap();
        let name: String = row.get(0).unwrap();
        assert_eq!(name, "hello");
    }

    #[tokio::test]
    async fn test_foreign_keys_enabled() {
        let client = DatabaseClient::new_in_memory().await.unwrap();

        // Create tables with foreign key
        client
            .execute(
                "CREATE TABLE parent (id TEXT PRIMARY KEY)",
                (),
            )
            .await
            .unwrap();
        client
            .execute(
                "CREATE TABLE child (id TEXT PRIMARY KEY, parent_id TEXT REFERENCES parent(id) ON DELETE CASCADE)",
                (),
            )
            .await
            .unwrap();

        // Insert parent
        client
            .execute("INSERT INTO parent (id) VALUES ('parent-1')", ())
            .await
            .unwrap();

        // Insert child
        client
            .execute("INSERT INTO child (id, parent_id) VALUES ('child-1', 'parent-1')", ())
            .await
            .unwrap();

        // Delete parent - should cascade
        client
            .execute("DELETE FROM parent WHERE id = 'parent-1'", ())
            .await
            .unwrap();

        // Verify child is gone
        let mut rows = client
            .query("SELECT COUNT(*) FROM child", ())
            .await
            .unwrap();
        let count: i64 = rows.next().await.unwrap().unwrap().get(0).unwrap();
        assert_eq!(count, 0, "Child should be cascade deleted");
    }

    #[tokio::test]
    async fn test_transaction_commit() {
        let client = DatabaseClient::new_in_memory().await.unwrap();

        // Setup
        client
            .execute("CREATE TABLE test (id INTEGER PRIMARY KEY, name TEXT)", ())
            .await
            .unwrap();

        // Begin transaction and commit
        let tx = Transaction::begin(&client).await.unwrap();
        tx.execute("INSERT INTO test (name) VALUES ('tx-test')", ())
            .await
            .unwrap();
        tx.commit().await.unwrap();

        // Verify data exists
        let mut rows = client
            .query("SELECT name FROM test WHERE name = 'tx-test'", ())
            .await
            .unwrap();
        let row = rows.next().await.unwrap().unwrap();
        let name: String = row.get(0).unwrap();
        assert_eq!(name, "tx-test");
    }

    #[tokio::test]
    async fn test_transaction_rollback() {
        let client = DatabaseClient::new_in_memory().await.unwrap();

        // Setup
        client
            .execute("CREATE TABLE test (id INTEGER PRIMARY KEY, name TEXT)", ())
            .await
            .unwrap();

        // Begin transaction and rollback
        let tx = Transaction::begin(&client).await.unwrap();
        tx.execute("INSERT INTO test (name) VALUES ('rollback-test')", ())
            .await
            .unwrap();
        tx.rollback().await.unwrap();

        // Verify data does not exist
        let mut rows = client
            .query("SELECT COUNT(*) FROM test WHERE name = 'rollback-test'", ())
            .await
            .unwrap();
        let count: i64 = rows.next().await.unwrap().unwrap().get(0).unwrap();
        assert_eq!(count, 0, "Rolled back data should not exist");
    }

    #[tokio::test]
    async fn test_db_config_workspace_path() {
        let config = DbConfig::for_workspace("/home/user/myproject");
        assert!(config.path.to_string_lossy().contains(".ymir"));
        assert!(config.path.to_string_lossy().contains("workspace.db"));
    }

    #[tokio::test]
    async fn test_shared_connection_access() {
        let client = DatabaseClient::new_in_memory().await.unwrap();

        // Create table
        client
            .execute("CREATE TABLE test (id INTEGER PRIMARY KEY)", ())
            .await
            .unwrap();

        // Clone the client (shares the same connection)
        let client2 = client.clone();

        // Insert from first client
        client.execute("INSERT INTO test DEFAULT VALUES", ()).await.unwrap();

        // Query from second client (same underlying connection)
        let mut rows = client2.query("SELECT COUNT(*) FROM test", ()).await.unwrap();
        let count: i64 = rows.next().await.unwrap().unwrap().get(0).unwrap();
        assert_eq!(count, 1, "Both clients should see the same data");
    }
}
