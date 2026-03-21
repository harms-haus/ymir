//! Database module for ymir WebSocket server
//! Uses Turso (libsql) for data persistence

use anyhow::{Context, Result};
use libsql::{Builder, Connection, Database};
use serde::{Deserialize, Serialize};
use std::path::Path;
use tracing::{debug, info, Level};
#[cfg(test)]
use uuid::Uuid;

const SCHEMA_MIGRATIONS: &[&str] = &[
    r#"
    CREATE TABLE IF NOT EXISTS workspaces (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        root_path TEXT NOT NULL,
        color TEXT DEFAULT '#3B82F6',
        icon TEXT DEFAULT 'folder',
        worktree_base_dir TEXT DEFAULT '.git/worktrees',
        settings_json TEXT DEFAULT '{}',
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    "#,
    r#"
    CREATE TABLE IF NOT EXISTS worktrees (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL,
        branch_name TEXT NOT NULL,
        path TEXT NOT NULL,
        status TEXT DEFAULT 'active',
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
    );
    "#,
    r#"
    CREATE TABLE IF NOT EXISTS agent_sessions (
        id TEXT PRIMARY KEY,
        worktree_id TEXT NOT NULL,
        agent_type TEXT NOT NULL,
        acp_session_id TEXT,
        status TEXT DEFAULT 'active',
        started_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (worktree_id) REFERENCES worktrees(id) ON DELETE CASCADE
    );
    "#,
    r#"
    CREATE TABLE IF NOT EXISTS terminal_sessions (
        id TEXT PRIMARY KEY,
        worktree_id TEXT NOT NULL,
        label TEXT,
        shell TEXT DEFAULT 'bash',
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (worktree_id) REFERENCES worktrees(id) ON DELETE CASCADE
    );
    "#,
    r#"
    CREATE TABLE IF NOT EXISTS user_settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
    );
    "#,
    r#"
    CREATE TABLE IF NOT EXISTS activity_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp TEXT NOT NULL DEFAULT (datetime('now')),
        level TEXT NOT NULL CHECK(level IN ('info', 'warn', 'error')),
        source TEXT,
        message TEXT NOT NULL,
        metadata_json TEXT DEFAULT '{}'
    );
    CREATE INDEX IF NOT EXISTS idx_activity_log_timestamp ON activity_log(timestamp DESC);
    CREATE INDEX IF NOT EXISTS idx_activity_log_level ON activity_log(level);
    "#,
    r#"
    CREATE TABLE IF NOT EXISTS panel_layouts (
        workspace_id TEXT PRIMARY KEY,
        sidebar_size INTEGER DEFAULT 300,
        main_size INTEGER DEFAULT 500,
        project_size INTEGER DEFAULT 300,
        main_split_ratio REAL DEFAULT 0.5,
        FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
    );
    "#,
    r#"
    ALTER TABLE terminal_sessions ADD COLUMN position INTEGER DEFAULT 0;
    "#,
    r#"
    ALTER TABLE terminal_sessions ADD COLUMN updated_at TEXT DEFAULT (datetime('now'));
    "#,
    r#"
    ALTER TABLE agent_sessions ADD COLUMN label TEXT;
    "#,
    r#"
    ALTER TABLE agent_sessions ADD COLUMN position INTEGER DEFAULT 0;
    "#,
    r#"
    ALTER TABLE agent_sessions ADD COLUMN updated_at TEXT DEFAULT (datetime('now'));
    "#,
    r#"
    ALTER TABLE worktrees ADD COLUMN is_main INTEGER DEFAULT 0;
    "#,
];

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Workspace {
    pub id: String,
    pub name: String,
    pub root_path: String,
    pub color: String,
    pub icon: String,
    pub worktree_base_dir: String,
    pub settings_json: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Worktree {
    pub id: String,
    pub workspace_id: String,
    pub branch_name: String,
    pub path: String,
    pub status: String,
    pub created_at: String,
    pub is_main: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentSession {
    pub id: String,
    pub worktree_id: String,
    pub agent_type: String,
    pub acp_session_id: Option<String>,
    pub status: String,
    pub started_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TerminalSession {
    pub id: String,
    pub worktree_id: String,
    pub label: Option<String>,
    pub shell: String,
    pub created_at: String,
    pub position: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UserSetting {
    pub key: String,
    pub value: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ActivityLogEntry {
    pub id: Option<i64>,
    pub timestamp: String,
    pub level: String,
    pub source: Option<String>,
    pub message: String,
    pub metadata_json: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PanelLayout {
    pub workspace_id: String,
    pub sidebar_size: i64,
    pub main_size: i64,
    pub project_size: i64,
    pub main_split_ratio: f64,
}

#[derive(Debug)]
pub struct Db {
    db: Database,
}

impl Db {
    pub async fn in_memory() -> Result<Self> {
        // Use a temporary file-based database for tests
        // In-memory databases in libsql don't share state between connections
        let temp_path = std::env::temp_dir().join(format!("ymir_test_{}.db", uuid::Uuid::new_v4()));
        let path_str = temp_path.to_string_lossy().to_string();
        let db = Builder::new_local(&path_str).build().await?;
        info!("Created temporary database at {}", path_str);
        let db = Self { db };
        db.migrate().await?;
        Ok(db)
    }

    pub async fn open<P: AsRef<Path>>(path: P) -> Result<Self> {
        let path_str = path.as_ref().to_string_lossy().to_string();
        let db = Builder::new_local(&path_str).build().await?;
        info!("Opened database at {}", path_str);
        let db = Self { db };
        db.migrate().await?;
        Ok(db)
    }

    pub fn conn(&self) -> Result<Connection> {
        Ok(self.db.connect()?)
    }

    pub async fn migrate(&self) -> Result<()> {
        let _span = tracing::span!(Level::INFO, "db_migrate").entered();
        let conn = self
            .conn()
            .context("Failed to get connection for migration")?;

        conn.execute("CREATE TABLE IF NOT EXISTS _migrations (id INTEGER PRIMARY KEY, executed_at TEXT DEFAULT (datetime('now')))", libsql::params![]).await?;

        for (idx, migration) in SCHEMA_MIGRATIONS.iter().enumerate() {
            let mut stmt = conn.prepare("SELECT 1 FROM _migrations WHERE id = ?1").await?;
            let mut rows = stmt.query([idx as i64]).await?;
            let exists = rows.next().await?.is_some();

            if exists {
                debug!("Migration {} already executed, skipping", idx);
                continue;
            }

            debug!("Executing migration {} (bytes: {})", idx, migration.len());
            match conn.execute_batch(migration).await {
                Ok(_) => {}
                Err(e) => {
                    let err_msg = e.to_string();
                    if err_msg.contains("duplicate column name") {
                        debug!("Migration {} column already exists, marking as complete", idx);
                    } else {
                        return Err(e).with_context(|| format!("Failed to execute migration {}", idx))?;
                    }
                }
            }

            conn.execute("INSERT INTO _migrations (id) VALUES (?1)", libsql::params![idx as i64]).await?;

            debug!("Migration {} completed", idx);
        }

        info!(
            "All {} migrations completed successfully",
            SCHEMA_MIGRATIONS.len()
        );
        Ok(())
    }

    pub async fn verify_schema(&self) -> Result<usize> {
        let conn = self
            .conn()
            .context("Failed to get connection for schema verification")?;
        let mut stmt = conn
            .prepare("SELECT name FROM sqlite_master WHERE type='table'")
            .await?;
        let mut rows = stmt.query(()).await?;
        let mut table_count = 0;

        while let Some(row) = rows.next().await? {
            let _name: String = row.get(0)?;
            debug!("Found table: {}", _name);
            table_count += 1;
        }

        info!("Verified {} tables in database", table_count);
        Ok(table_count)
    }
}

impl Db {
    pub async fn create_workspace(&self, workspace: &Workspace) -> Result<()> {
        let conn = self.conn()?;
        let mut stmt = conn.prepare(
            r#"
            INSERT INTO workspaces (id, name, root_path, color, icon, worktree_base_dir, settings_json, created_at, updated_at)
            VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
            "#,
        ).await?;

        stmt.execute(libsql::params![
            workspace.id.as_str(),
            workspace.name.as_str(),
            workspace.root_path.as_str(),
            workspace.color.as_str(),
            workspace.icon.as_str(),
            workspace.worktree_base_dir.as_str(),
            workspace.settings_json.as_str(),
            workspace.created_at.as_str(),
            workspace.updated_at.as_str(),
        ])
        .await?;

        debug!("Created workspace: {}", workspace.name);
        Ok(())
    }

    pub async fn get_workspace(&self, id: &str) -> Result<Option<Workspace>> {
        let conn = self.conn()?;
        let mut stmt = conn.prepare("SELECT id, name, root_path, color, icon, worktree_base_dir, settings_json, created_at, updated_at FROM workspaces WHERE id = ?1").await?;
        let mut rows = stmt.query([id]).await?;

        if let Some(row) = rows.next().await? {
            Ok(Some(Workspace {
                id: row.get(0)?,
                name: row.get(1)?,
                root_path: row.get(2)?,
                color: row.get(3)?,
                icon: row.get(4)?,
                worktree_base_dir: row.get(5)?,
                settings_json: row.get(6)?,
                created_at: row.get(7)?,
                updated_at: row.get(8)?,
            }))
        } else {
            Ok(None)
        }
    }

    pub async fn list_workspaces(&self) -> Result<Vec<Workspace>> {
        let conn = self.conn()?;
        let mut stmt = conn.prepare("SELECT id, name, root_path, color, icon, worktree_base_dir, settings_json, created_at, updated_at FROM workspaces ORDER BY created_at DESC").await?;
        let mut rows = stmt.query(()).await?;
        let mut workspaces = Vec::new();

        while let Some(row) = rows.next().await? {
            workspaces.push(Workspace {
                id: row.get(0)?,
                name: row.get(1)?,
                root_path: row.get(2)?,
                color: row.get(3)?,
                icon: row.get(4)?,
                worktree_base_dir: row.get(5)?,
                settings_json: row.get(6)?,
                created_at: row.get(7)?,
                updated_at: row.get(8)?,
            });
        }

        Ok(workspaces)
    }

    pub async fn update_workspace(
        &self,
        id: &str,
        name: Option<&str>,
        settings_json: Option<&str>,
    ) -> Result<bool> {
        let conn = self.conn()?;

        let rows_affected = if let (Some(n), Some(s)) = (name, settings_json) {
            conn.execute(
                "UPDATE workspaces SET name = ?1, settings_json = ?2, updated_at = datetime('now') WHERE id = ?3",
                libsql::params![n, s, id]
            ).await?
        } else if let Some(n) = name {
            conn.execute(
                "UPDATE workspaces SET name = ?1, updated_at = datetime('now') WHERE id = ?2",
                libsql::params![n, id],
            )
            .await?
        } else if let Some(s) = settings_json {
            conn.execute(
                "UPDATE workspaces SET settings_json = ?1, updated_at = datetime('now') WHERE id = ?2",
                libsql::params![s, id]
            ).await?
        } else {
            return Ok(false);
        };

        debug!(
            "Updated workspace {} (rows affected: {})",
            id, rows_affected
        );
        Ok(rows_affected > 0)
    }

    pub async fn delete_workspace(&self, id: &str) -> Result<bool> {
        let conn = self.conn()?;
        let rows_affected = conn
            .execute("DELETE FROM workspaces WHERE id = ?1", libsql::params![id])
            .await?;
        debug!(
            "Deleted workspace {} (rows affected: {})",
            id, rows_affected
        );
        Ok(rows_affected > 0)
    }
}

impl Db {
    pub async fn create_worktree(&self, worktree: &Worktree) -> Result<()> {
        let conn = self.conn()?;
        let mut stmt = conn
            .prepare(
                r#"
            INSERT INTO worktrees (id, workspace_id, branch_name, path, status, created_at, is_main)
            VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
            "#,
            )
            .await?;

        stmt.execute((
            worktree.id.as_str(),
            worktree.workspace_id.as_str(),
            worktree.branch_name.as_str(),
            worktree.path.as_str(),
            worktree.status.as_str(),
            worktree.created_at.as_str(),
            worktree.is_main as i32,
        ))
        .await?;

        debug!("Created worktree: {}", worktree.branch_name);
        Ok(())
    }

    pub async fn get_worktree(&self, id: &str) -> Result<Option<Worktree>> {
        let conn = self.conn()?;
        let mut stmt = conn.prepare("SELECT id, workspace_id, branch_name, path, status, created_at, COALESCE(is_main, 0) FROM worktrees WHERE id = ?1").await?;
        let mut rows = stmt.query([id]).await?;

        if let Some(row) = rows.next().await? {
            Ok(Some(Worktree {
                id: row.get(0)?,
                workspace_id: row.get(1)?,
                branch_name: row.get(2)?,
                path: row.get(3)?,
                status: row.get(4)?,
                created_at: row.get(5)?,
                is_main: row.get::<i32>(6)? != 0,
            }))
        } else {
            Ok(None)
        }
    }

    pub async fn list_worktrees(&self, workspace_id: &str) -> Result<Vec<Worktree>> {
        let conn = self.conn()?;
        let mut stmt = conn.prepare(
            "SELECT id, workspace_id, branch_name, path, status, created_at, COALESCE(is_main, 0) FROM worktrees WHERE workspace_id = ?1 ORDER BY created_at DESC"
        ).await?;
        let mut rows = stmt.query([workspace_id]).await?;
        let mut worktrees = Vec::new();

        while let Some(row) = rows.next().await? {
            worktrees.push(Worktree {
                id: row.get(0)?,
                workspace_id: row.get(1)?,
                branch_name: row.get(2)?,
                path: row.get(3)?,
                status: row.get(4)?,
                created_at: row.get(5)?,
                is_main: row.get::<i32>(6)? != 0,
            });
        }

        Ok(worktrees)
    }

    pub async fn update_worktree(&self, id: &str, status: Option<&str>) -> Result<bool> {
        let conn = self.conn()?;

        if status.is_none() {
            return Ok(false);
        }

        let rows_affected = conn
            .execute(
                "UPDATE worktrees SET status = ?1 WHERE id = ?2",
                libsql::params![status.unwrap(), id],
            )
            .await?;
        debug!("Updated worktree {} (rows affected: {})", id, rows_affected);
        Ok(rows_affected > 0)
    }

    pub async fn update_worktree_branch(&self, id: &str, branch_name: &str) -> Result<bool> {
        let conn = self.conn()?;
        let rows_affected = conn
            .execute(
                "UPDATE worktrees SET branch_name = ?1 WHERE id = ?2",
                libsql::params![branch_name, id],
            )
            .await?;
        debug!(
            "Updated worktree {} branch to {} (rows affected: {})",
            id, branch_name, rows_affected
        );
        Ok(rows_affected > 0)
    }

    pub async fn delete_worktree(&self, id: &str) -> Result<bool> {
        let conn = self.conn()?;
        let rows_affected = conn
            .execute("DELETE FROM worktrees WHERE id = ?1", libsql::params![id])
            .await?;
        debug!("Deleted worktree {} (rows affected: {})", id, rows_affected);
        Ok(rows_affected > 0)
    }
}

impl Db {
    pub async fn create_agent_session(&self, session: &AgentSession) -> Result<()> {
        let conn = self.conn()?;
        let mut stmt = conn.prepare(
            r#"
            INSERT INTO agent_sessions (id, worktree_id, agent_type, acp_session_id, status, started_at)
            VALUES (?1, ?2, ?3, ?4, ?5, ?6)
            "#,
        ).await?;

        stmt.execute((
            session.id.as_str(),
            session.worktree_id.as_str(),
            session.agent_type.as_str(),
            session.acp_session_id.as_deref(),
            session.status.as_str(),
            session.started_at.as_str(),
        ))
        .await?;

        debug!(
            "Created agent session: {} (type: {})",
            session.id, session.agent_type
        );
        Ok(())
    }

    pub async fn get_agent_session(&self, id: &str) -> Result<Option<AgentSession>> {
        let conn = self.conn()?;
        let mut stmt = conn.prepare("SELECT id, worktree_id, agent_type, acp_session_id, status, started_at FROM agent_sessions WHERE id = ?1").await?;
        let mut rows = stmt.query([id]).await?;

        if let Some(row) = rows.next().await? {
            Ok(Some(AgentSession {
                id: row.get(0)?,
                worktree_id: row.get(1)?,
                agent_type: row.get(2)?,
                acp_session_id: row.get(3)?,
                status: row.get(4)?,
                started_at: row.get(5)?,
            }))
        } else {
            Ok(None)
        }
    }

    pub async fn list_agent_sessions(&self, worktree_id: &str) -> Result<Vec<AgentSession>> {
        let conn = self.conn()?;
        let mut stmt = conn.prepare(
            "SELECT id, worktree_id, agent_type, acp_session_id, status, started_at FROM agent_sessions WHERE worktree_id = ?1 ORDER BY started_at DESC"
        ).await?;
        let mut rows = stmt.query([worktree_id]).await?;
        let mut sessions = Vec::new();

        while let Some(row) = rows.next().await? {
            sessions.push(AgentSession {
                id: row.get(0)?,
                worktree_id: row.get(1)?,
                agent_type: row.get(2)?,
                acp_session_id: row.get(3)?,
                status: row.get(4)?,
                started_at: row.get(5)?,
            });
        }

        Ok(sessions)
    }

    pub async fn update_agent_session(&self, id: &str, status: &str) -> Result<bool> {
        let conn = self.conn()?;
        let rows_affected = conn
            .execute(
                "UPDATE agent_sessions SET status = ?1 WHERE id = ?2",
                libsql::params![status, id],
            )
            .await?;
        debug!(
            "Updated agent session {} (status: {}, rows affected: {})",
            id, status, rows_affected
        );
        Ok(rows_affected > 0)
    }

    pub async fn delete_agent_session(&self, id: &str) -> Result<bool> {
        let conn = self.conn()?;
        let rows_affected = conn
            .execute(
                "DELETE FROM agent_sessions WHERE id = ?1",
                libsql::params![id],
            )
            .await?;
        debug!(
            "Deleted agent session {} (rows affected: {})",
            id, rows_affected
        );
        Ok(rows_affected > 0)
    }
}

impl Db {
    pub async fn create_terminal_session(&self, session: &TerminalSession) -> Result<()> {
        let conn = self.conn()?;
        let mut stmt = conn
            .prepare(
                r#"
            INSERT INTO terminal_sessions (id, worktree_id, label, shell, created_at)
            VALUES (?1, ?2, ?3, ?4, ?5)
            "#,
            )
            .await?;

        stmt.execute((
            session.id.as_str(),
            session.worktree_id.as_str(),
            session.label.as_deref(),
            session.shell.as_str(),
            session.created_at.as_str(),
        ))
        .await?;

        debug!("Created terminal session: {}", session.id);
        Ok(())
    }

    pub async fn get_terminal_session(&self, id: &str) -> Result<Option<TerminalSession>> {
let conn = self.conn()?;
    let mut stmt = conn.prepare("SELECT id, worktree_id, label, shell, created_at, COALESCE(position, 0) FROM terminal_sessions WHERE id = ?1").await?;
    let mut rows = stmt.query([id]).await?;

    if let Some(row) = rows.next().await? {
      Ok(Some(TerminalSession {
        id: row.get(0)?,
        worktree_id: row.get(1)?,
        label: row.get(2)?,
        shell: row.get(3)?,
        created_at: row.get(4)?,
        position: row.get(5)?,
      }))
    } else {
      Ok(None)
    }
    }

pub async fn list_terminal_sessions(&self, worktree_id: &str) -> Result<Vec<TerminalSession>> {
    let conn = self.conn()?;
    let mut stmt = conn.prepare(
      "SELECT id, worktree_id, label, shell, created_at, COALESCE(position, 0) FROM terminal_sessions WHERE worktree_id = ?1 ORDER BY COALESCE(position, 0) ASC"
    ).await?;
    let mut rows = stmt.query([worktree_id]).await?;
    let mut sessions = Vec::new();

    while let Some(row) = rows.next().await? {
      sessions.push(TerminalSession {
        id: row.get(0)?,
        worktree_id: row.get(1)?,
        label: row.get(2)?,
        shell: row.get(3)?,
        created_at: row.get(4)?,
        position: row.get(5)?,
      });
    }

    Ok(sessions)
  }

    pub async fn delete_terminal_session(&self, id: &str) -> Result<bool> {
        let conn = self.conn()?;
        let rows_affected = conn
            .execute(
                "DELETE FROM terminal_sessions WHERE id = ?1",
                libsql::params![id],
            )
            .await?;
        debug!(
            "Deleted terminal session {} (rows affected: {})",
            id, rows_affected
        );
        Ok(rows_affected > 0)
    }

    pub async fn update_terminal_label(&self, id: &str, label: &str) -> Result<bool> {
        let conn = self.conn()?;
        let rows_affected = conn
            .execute(
                "UPDATE terminal_sessions SET label = ?1, updated_at = datetime('now') WHERE id = ?2",
                libsql::params![label, id],
            )
            .await?;
        debug!(
            "Updated terminal {} label (rows affected: {})",
            id, rows_affected
        );
        Ok(rows_affected > 0)
    }

    pub async fn update_terminal_position(&self, id: &str, position: i64) -> Result<bool> {
        let conn = self.conn()?;
        let rows_affected = conn
            .execute(
                "UPDATE terminal_sessions SET position = ?1, updated_at = datetime('now') WHERE id = ?2",
                libsql::params![position, id],
            )
            .await?;
        debug!(
            "Updated terminal {} position (rows affected: {})",
            id, rows_affected
        );
        Ok(rows_affected > 0)
    }

    pub async fn update_agent_label(&self, id: &str, label: &str) -> Result<bool> {
        let conn = self.conn()?;
        let rows_affected = conn
            .execute(
                "UPDATE agent_sessions SET label = ?1, updated_at = datetime('now') WHERE id = ?2",
                libsql::params![label, id],
            )
            .await?;
        debug!(
            "Updated agent {} label (rows affected: {})",
            id, rows_affected
        );
        Ok(rows_affected > 0)
    }

    pub async fn update_agent_position(&self, id: &str, position: i64) -> Result<bool> {
        let conn = self.conn()?;
        let rows_affected = conn
            .execute(
                "UPDATE agent_sessions SET position = ?1, updated_at = datetime('now') WHERE id = ?2",
                libsql::params![position, id],
            )
            .await?;
        debug!(
            "Updated agent {} position (rows affected: {})",
            id, rows_affected
        );
        Ok(rows_affected > 0)
    }
}

impl Db {
    pub async fn set_user_setting(&self, key: &str, value: &str) -> Result<()> {
        let conn = self.conn()?;
        conn.execute(
            "INSERT OR REPLACE INTO user_settings (key, value) VALUES (?1, ?2)",
            libsql::params![key, value],
        )
        .await?;
        debug!("Set user setting: {}", key);
        Ok(())
    }

    pub async fn get_user_setting(&self, key: &str) -> Result<Option<String>> {
        let conn = self.conn()?;
        let mut stmt = conn
            .prepare("SELECT value FROM user_settings WHERE key = ?1")
            .await?;
        let mut rows = stmt.query([key]).await?;

        if let Some(row) = rows.next().await? {
            Ok(Some(row.get(0)?))
        } else {
            Ok(None)
        }
    }

    pub async fn list_user_settings(&self) -> Result<Vec<UserSetting>> {
        let conn = self.conn()?;
        let mut stmt = conn
            .prepare("SELECT key, value FROM user_settings ORDER BY key ASC")
            .await?;
        let mut rows = stmt.query(()).await?;
        let mut settings = Vec::new();

        while let Some(row) = rows.next().await? {
            settings.push(UserSetting {
                key: row.get(0)?,
                value: row.get(1)?,
            });
        }

        Ok(settings)
    }

    pub async fn delete_user_setting(&self, key: &str) -> Result<bool> {
        let conn = self.conn()?;
        let rows_affected = conn
            .execute(
                "DELETE FROM user_settings WHERE key = ?1",
                libsql::params![key],
            )
            .await?;
        debug!(
            "Deleted user setting: {} (rows affected: {})",
            key, rows_affected
        );
        Ok(rows_affected > 0)
    }
}

impl Db {
    pub async fn log_activity(&self, entry: &ActivityLogEntry) -> Result<i64> {
        let conn = self.conn()?;
        let mut stmt = conn
            .prepare(
                r#"
            INSERT INTO activity_log (timestamp, level, source, message, metadata_json)
            VALUES (?1, ?2, ?3, ?4, ?5)
            "#,
            )
            .await?;

        stmt.execute((
            entry.timestamp.as_str(),
            entry.level.as_str(),
            entry.source.as_deref(),
            entry.message.as_str(),
            entry.metadata_json.as_str(),
        ))
        .await?;

        let id = conn.last_insert_rowid();
        debug!("Logged activity (id: {}, level: {})", id, entry.level);
        Ok(id)
    }

    pub async fn query_activity_log(
        &self,
        level: Option<&str>,
        limit: Option<i64>,
    ) -> Result<Vec<ActivityLogEntry>> {
        let conn = self.conn()?;

        let sql = if let Some(lvl) = level {
            let mut stmt = conn.prepare("SELECT id, timestamp, level, source, message, metadata_json FROM activity_log WHERE level = ?1 ORDER BY timestamp DESC").await?;
            let mut rows = stmt.query([lvl]).await?;
            let mut entries = Vec::new();

            while let Some(row) = rows.next().await? {
                entries.push(ActivityLogEntry {
                    id: Some(row.get(0)?),
                    timestamp: row.get(1)?,
                    level: row.get(2)?,
                    source: row.get(3)?,
                    message: row.get(4)?,
                    metadata_json: row.get(5)?,
                });
            }

            debug!("Queried activity log: {} entries", entries.len());
            return Ok(entries);
        } else {
            "SELECT id, timestamp, level, source, message, metadata_json FROM activity_log ORDER BY timestamp DESC"
        };

        let sql = match limit {
            Some(limit_val) => format!("{} LIMIT {}", sql, limit_val),
            None => sql.to_string(),
        };

        let mut stmt = conn.prepare(&sql).await?;
        let mut rows = stmt.query(()).await?;
        let mut entries = Vec::new();

        while let Some(row) = rows.next().await? {
            entries.push(ActivityLogEntry {
                id: Some(row.get(0)?),
                timestamp: row.get(1)?,
                level: row.get(2)?,
                source: row.get(3)?,
                message: row.get(4)?,
                metadata_json: row.get(5)?,
            });
        }

        debug!("Queried activity log: {} entries", entries.len());
        Ok(entries)
    }

    pub async fn clear_activity_log(&self) -> Result<u64> {
        let conn = self.conn()?;
        let rows_affected = conn
            .execute("DELETE FROM activity_log", libsql::params![])
            .await?;
        debug!("Cleared activity log (rows affected: {})", rows_affected);
        Ok(rows_affected)
    }
}

impl Db {
    pub async fn set_panel_layout(&self, layout: &PanelLayout) -> Result<()> {
        let conn = self.conn()?;
        let workspace_id = layout.workspace_id.clone();
        let sidebar_size = layout.sidebar_size.to_string();
        let main_size = layout.main_size.to_string();
        let project_size = layout.project_size.to_string();
        let main_split_ratio = layout.main_split_ratio.to_string();

        conn.execute(
            r#"
            INSERT OR REPLACE INTO panel_layouts (workspace_id, sidebar_size, main_size, project_size, main_split_ratio)
            VALUES (?1, ?2, ?3, ?4, ?5)
            "#,
            libsql::params![
                workspace_id.clone(),
                sidebar_size.clone(),
                main_size.clone(),
                project_size.clone(),
                main_split_ratio.clone(),
            ],
        ).await?;
        debug!("Set panel layout for workspace: {}", layout.workspace_id);
        Ok(())
    }

    pub async fn get_panel_layout(&self, workspace_id: &str) -> Result<Option<PanelLayout>> {
        let conn = self.conn()?;
        let mut stmt = conn.prepare("SELECT workspace_id, sidebar_size, main_size, project_size, main_split_ratio FROM panel_layouts WHERE workspace_id = ?1").await?;
        let mut rows = stmt.query([workspace_id]).await?;

        if let Some(row) = rows.next().await? {
            Ok(Some(PanelLayout {
                workspace_id: row.get(0)?,
                sidebar_size: row.get(1)?,
                main_size: row.get(2)?,
                project_size: row.get(3)?,
                main_split_ratio: row.get(4)?,
            }))
        } else {
            Ok(None)
        }
    }

    pub async fn delete_panel_layout(&self, workspace_id: &str) -> Result<bool> {
        let conn = self.conn()?;
        let rows_affected = conn
            .execute(
                "DELETE FROM panel_layouts WHERE workspace_id = ?1",
                libsql::params![workspace_id],
            )
            .await?;
        debug!(
            "Deleted panel layout for workspace: {} (rows affected: {})",
            workspace_id, rows_affected
        );
        Ok(rows_affected > 0)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    async fn create_test_db() -> Db {
        Db::in_memory()
            .await
            .expect("Failed to create in-memory db")
    }

    fn generate_uuid() -> String {
        Uuid::new_v4().to_string()
    }

    #[tokio::test]
    async fn test_db_schema() {
        let db = create_test_db().await;
        let table_count = db.verify_schema().await.expect("Failed to verify schema");
        // libsql may create internal tables, so we just verify we have at least our 7 tables
        assert!(
            table_count >= 7,
            "Expected at least 7 tables, found {}",
            table_count
        );
    }

    #[tokio::test]
    async fn test_workspace_crud() {
        let db = create_test_db().await;

        let workspace = Workspace {
            id: generate_uuid(),
            name: "Test Workspace".to_string(),
            root_path: "/test/path".to_string(),
            color: "#FF0000".to_string(),
            icon: "folder-open".to_string(),
            worktree_base_dir: ".git/worktrees".to_string(),
            settings_json: r#"{"theme": "dark"}"#.to_string(),
            created_at: chrono::Utc::now().to_rfc3339(),
            updated_at: chrono::Utc::now().to_rfc3339(),
        };
        db.create_workspace(&workspace)
            .await
            .expect("Failed to create workspace");

        let retrieved = db
            .get_workspace(&workspace.id)
            .await
            .expect("Failed to get workspace");
        assert!(retrieved.is_some(), "Workspace not found");
        let retrieved = retrieved.unwrap();
        assert_eq!(retrieved.name, workspace.name);
        assert_eq!(retrieved.root_path, workspace.root_path);

        let workspaces = db
            .list_workspaces()
            .await
            .expect("Failed to list workspaces");
        assert_eq!(workspaces.len(), 1, "Expected 1 workspace");

        db.update_workspace(&workspace.id, Some("Updated Workspace"), None)
            .await
            .expect("Failed to update workspace");
        let updated = db
            .get_workspace(&workspace.id)
            .await
            .expect("Failed to get updated workspace")
            .unwrap();
        assert_eq!(updated.name, "Updated Workspace");

        db.delete_workspace(&workspace.id)
            .await
            .expect("Failed to delete workspace");
        let deleted = db
            .get_workspace(&workspace.id)
            .await
            .expect("Failed to check deletion");
        assert!(deleted.is_none(), "Workspace should be deleted");
    }

    #[tokio::test]
    async fn test_worktree_crud() {
        let db = create_test_db().await;

        let workspace_id = generate_uuid();
        let workspace = Workspace {
            id: workspace_id.clone(),
            name: "Test Workspace".to_string(),
            root_path: "/test/path".to_string(),
            color: "#FF0000".to_string(),
            icon: "folder".to_string(),
            worktree_base_dir: ".git/worktrees".to_string(),
            settings_json: "{}".to_string(),
            created_at: chrono::Utc::now().to_rfc3339(),
            updated_at: chrono::Utc::now().to_rfc3339(),
        };
        db.create_workspace(&workspace)
            .await
            .expect("Failed to create workspace");

        let worktree = Worktree {
            id: generate_uuid(),
            workspace_id: workspace_id.clone(),
            branch_name: "feature/test".to_string(),
            path: "/test/path/.git/worktrees/feature/test".to_string(),
            status: "active".to_string(),
            created_at: chrono::Utc::now().to_rfc3339(),
            is_main: false,
        };
        db.create_worktree(&worktree)
            .await
            .expect("Failed to create worktree");

        let retrieved = db
            .get_worktree(&worktree.id)
            .await
            .expect("Failed to get worktree");
        assert!(retrieved.is_some(), "Worktree not found");
        let retrieved = retrieved.unwrap();
        assert_eq!(retrieved.branch_name, worktree.branch_name);

        let worktrees = db
            .list_worktrees(&workspace_id)
            .await
            .expect("Failed to list worktrees");
        assert_eq!(worktrees.len(), 1, "Expected 1 worktree");

        db.update_worktree(&worktree.id, Some("inactive"))
            .await
            .expect("Failed to update worktree");
        let updated = db
            .get_worktree(&worktree.id)
            .await
            .expect("Failed to get updated worktree")
            .unwrap();
        assert_eq!(updated.status, "inactive");

        db.delete_worktree(&worktree.id)
            .await
            .expect("Failed to delete worktree");
        let deleted = db
            .get_worktree(&worktree.id)
            .await
            .expect("Failed to check deletion");
        assert!(deleted.is_none(), "Worktree should be deleted");
    }

    #[tokio::test]
    async fn test_agent_session_crud() {
        let db = create_test_db().await;

        let workspace_id = generate_uuid();
        let worktree_id = generate_uuid();

        let workspace = Workspace {
            id: workspace_id.clone(),
            name: "Test Workspace".to_string(),
            root_path: "/test/path".to_string(),
            color: "#FF0000".to_string(),
            icon: "folder".to_string(),
            worktree_base_dir: ".git/worktrees".to_string(),
            settings_json: "{}".to_string(),
            created_at: chrono::Utc::now().to_rfc3339(),
            updated_at: chrono::Utc::now().to_rfc3339(),
        };
        db.create_workspace(&workspace)
            .await
            .expect("Failed to create workspace");

        let worktree = Worktree {
            id: worktree_id.clone(),
            workspace_id: workspace_id.clone(),
            branch_name: "main".to_string(),
            path: "/test/path".to_string(),
            status: "active".to_string(),
            created_at: chrono::Utc::now().to_rfc3339(),
            is_main: true,
        };
        db.create_worktree(&worktree)
            .await
            .expect("Failed to create worktree");

        let session = AgentSession {
            id: generate_uuid(),
            worktree_id: worktree_id.clone(),
            agent_type: "explore".to_string(),
            acp_session_id: Some("acp-123".to_string()),
            status: "active".to_string(),
            started_at: chrono::Utc::now().to_rfc3339(),
        };
        db.create_agent_session(&session)
            .await
            .expect("Failed to create agent session");

        let retrieved = db
            .get_agent_session(&session.id)
            .await
            .expect("Failed to get agent session");
        assert!(retrieved.is_some(), "Agent session not found");
        let retrieved = retrieved.unwrap();
        assert_eq!(retrieved.agent_type, session.agent_type);

        let sessions = db
            .list_agent_sessions(&worktree_id)
            .await
            .expect("Failed to list agent sessions");
        assert_eq!(sessions.len(), 1, "Expected 1 agent session");

        db.update_agent_session(&session.id, "completed")
            .await
            .expect("Failed to update agent session");
        let updated = db
            .get_agent_session(&session.id)
            .await
            .expect("Failed to get updated agent session")
            .unwrap();
        assert_eq!(updated.status, "completed");

        db.delete_agent_session(&session.id)
            .await
            .expect("Failed to delete agent session");
        let deleted = db
            .get_agent_session(&session.id)
            .await
            .expect("Failed to check deletion");
        assert!(deleted.is_none(), "Agent session should be deleted");
    }

    #[tokio::test]
    async fn test_terminal_session_crud() {
        let db = create_test_db().await;

        let workspace_id = generate_uuid();
        let worktree_id = generate_uuid();

        let workspace = Workspace {
            id: workspace_id.clone(),
            name: "Test Workspace".to_string(),
            root_path: "/test/path".to_string(),
            color: "#FF0000".to_string(),
            icon: "folder".to_string(),
            worktree_base_dir: ".git/worktrees".to_string(),
            settings_json: "{}".to_string(),
            created_at: chrono::Utc::now().to_rfc3339(),
            updated_at: chrono::Utc::now().to_rfc3339(),
        };
        db.create_workspace(&workspace)
            .await
            .expect("Failed to create workspace");

        let worktree = Worktree {
            id: worktree_id.clone(),
            workspace_id: workspace_id.clone(),
            branch_name: "main".to_string(),
            path: "/test/path".to_string(),
            status: "active".to_string(),
            created_at: chrono::Utc::now().to_rfc3339(),
            is_main: false,
        };
        db.create_worktree(&worktree)
            .await
            .expect("Failed to create worktree");

        let session = TerminalSession {
            id: generate_uuid(),
            worktree_id: worktree_id.clone(),
            label: Some("Main Terminal".to_string()),
            shell: "bash".to_string(),
            created_at: chrono::Utc::now().to_rfc3339(),
            position: 0,
        };
        db.create_terminal_session(&session)
            .await
            .expect("Failed to create terminal session");

        let retrieved = db
            .get_terminal_session(&session.id)
            .await
            .expect("Failed to get terminal session");
        assert!(retrieved.is_some(), "Terminal session not found");
        let retrieved = retrieved.unwrap();
        assert_eq!(retrieved.shell, session.shell);

        let sessions = db
            .list_terminal_sessions(&worktree_id)
            .await
            .expect("Failed to list terminal sessions");
        assert_eq!(sessions.len(), 1, "Expected 1 terminal session");

        db.delete_terminal_session(&session.id)
            .await
            .expect("Failed to delete terminal session");
        let deleted = db
            .get_terminal_session(&session.id)
            .await
            .expect("Failed to check deletion");
        assert!(deleted.is_none(), "Terminal session should be deleted");
    }

    #[tokio::test]
    async fn test_user_settings_crud() {
        let db = create_test_db().await;

        db.set_user_setting("theme", "dark")
            .await
            .expect("Failed to set user setting");
        db.set_user_setting("language", "en")
            .await
            .expect("Failed to set user setting");

        let theme = db
            .get_user_setting("theme")
            .await
            .expect("Failed to get user setting");
        assert_eq!(theme, Some("dark".to_string()));

        let missing = db
            .get_user_setting("nonexistent")
            .await
            .expect("Failed to get user setting");
        assert_eq!(missing, None);

        let settings = db
            .list_user_settings()
            .await
            .expect("Failed to list user settings");
        assert_eq!(settings.len(), 2, "Expected 2 settings");

        db.delete_user_setting("theme")
            .await
            .expect("Failed to delete user setting");
        let deleted = db
            .get_user_setting("theme")
            .await
            .expect("Failed to check deletion");
        assert_eq!(deleted, None);
    }

    #[tokio::test]
    async fn test_activity_log_crud() {
        let db = create_test_db().await;

        let entry1 = ActivityLogEntry {
            id: None,
            timestamp: chrono::Utc::now().to_rfc3339(),
            level: "info".to_string(),
            source: Some("test".to_string()),
            message: "Test message".to_string(),
            metadata_json: "{}".to_string(),
        };
        let id1 = db
            .log_activity(&entry1)
            .await
            .expect("Failed to log activity");

        let entry2 = ActivityLogEntry {
            id: None,
            timestamp: chrono::Utc::now().to_rfc3339(),
            level: "error".to_string(),
            source: Some("test".to_string()),
            message: "Error message".to_string(),
            metadata_json: r#"{"error": "test"}"#.to_string(),
        };
        let id2 = db
            .log_activity(&entry2)
            .await
            .expect("Failed to log activity");

        assert!(id1 > 0, "Expected positive id");
        assert!(id2 > id1, "Expected id2 > id1");

        let all = db
            .query_activity_log(None, None)
            .await
            .expect("Failed to query activity log");
        assert_eq!(all.len(), 2, "Expected 2 entries");

        let errors = db
            .query_activity_log(Some("error"), None)
            .await
            .expect("Failed to query activity log by level");
        assert_eq!(errors.len(), 1, "Expected 1 error entry");
        assert_eq!(errors[0].level, "error");

        db.clear_activity_log()
            .await
            .expect("Failed to clear activity log");
        let cleared = db
            .query_activity_log(None, None)
            .await
            .expect("Failed to query cleared log");
        assert_eq!(cleared.len(), 0, "Expected 0 entries after clear");
    }

    #[tokio::test]
    async fn test_panel_layout_crud() {
        let db = create_test_db().await;

        let workspace_id = generate_uuid();
        let workspace = Workspace {
            id: workspace_id.clone(),
            name: "Test Workspace".to_string(),
            root_path: "/test/path".to_string(),
            color: "#FF0000".to_string(),
            icon: "folder".to_string(),
            worktree_base_dir: ".git/worktrees".to_string(),
            settings_json: "{}".to_string(),
            created_at: chrono::Utc::now().to_rfc3339(),
            updated_at: chrono::Utc::now().to_rfc3339(),
        };
        db.create_workspace(&workspace)
            .await
            .expect("Failed to create workspace");

        let layout = PanelLayout {
            workspace_id: workspace_id.clone(),
            sidebar_size: 300,
            main_size: 500,
            project_size: 300,
            main_split_ratio: 0.6,
        };
        db.set_panel_layout(&layout)
            .await
            .expect("Failed to set panel layout");

        let retrieved = db
            .get_panel_layout(&workspace_id)
            .await
            .expect("Failed to get panel layout");
        assert!(retrieved.is_some(), "Panel layout not found");
        let retrieved = retrieved.unwrap();
        assert_eq!(retrieved.sidebar_size, 300);
        assert_eq!(retrieved.main_split_ratio, 0.6);

        let updated_layout = PanelLayout {
            workspace_id: workspace_id.clone(),
            sidebar_size: 350,
            main_size: 600,
            project_size: 350,
            main_split_ratio: 0.5,
        };
        db.set_panel_layout(&updated_layout)
            .await
            .expect("Failed to update panel layout");
        let updated = db
            .get_panel_layout(&workspace_id)
            .await
            .expect("Failed to get updated panel layout")
            .unwrap();
        assert_eq!(updated.sidebar_size, 350);

        db.delete_panel_layout(&workspace_id)
            .await
            .expect("Failed to delete panel layout");
        let deleted = db
            .get_panel_layout(&workspace_id)
            .await
            .expect("Failed to check deletion");
        assert!(deleted.is_none(), "Panel layout should be deleted");
    }
}
