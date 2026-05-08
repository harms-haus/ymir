//! Database module for ymir WebSocket server
//! Uses Turso (libsql) for data persistence

use anyhow::{Context, Result};
use libsql::{Builder, Connection, Database};
use serde::{Deserialize, Serialize};
use std::path::Path;
use std::sync::RwLock;
use tracing::{debug, error, info, Level};
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
    r#"
    CREATE TABLE IF NOT EXISTS terminal_output (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT NOT NULL,
        data TEXT NOT NULL,
        timestamp TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (session_id) REFERENCES terminal_sessions(id) ON DELETE CASCADE
    );
    "#,
    r#"
    CREATE INDEX IF NOT EXISTS idx_terminal_output_session ON terminal_output(session_id);
    "#,
    r#"
    CREATE INDEX IF NOT EXISTS idx_terminal_output_timestamp ON terminal_output(timestamp);
    "#,
    // Phase 1: Tab-Session Separation — add tab_id, status, ended_at, ended_reason to terminal_sessions
    r#"
    ALTER TABLE terminal_sessions ADD COLUMN tab_id TEXT;
    ALTER TABLE terminal_sessions ADD COLUMN status TEXT DEFAULT 'active';
    ALTER TABLE terminal_sessions ADD COLUMN ended_at TEXT;
    ALTER TABLE terminal_sessions ADD COLUMN ended_reason TEXT;
    CREATE INDEX IF NOT EXISTS idx_terminal_sessions_tab ON terminal_sessions(tab_id);
    UPDATE terminal_sessions SET tab_id = id WHERE tab_id IS NULL;
    "#,
    // bf-50cb.1.1: Add agent column to workspaces table
    r#"
    ALTER TABLE workspaces ADD COLUMN agent TEXT DEFAULT 'hermes';
    "#,
    // bf-50cb.1.2: Add color, icon, agent_type to worktrees table
    r#"
    ALTER TABLE worktrees ADD COLUMN color TEXT;
    ALTER TABLE worktrees ADD COLUMN icon TEXT;
    ALTER TABLE worktrees ADD COLUMN agent_type TEXT;
    ALTER TABLE worktrees ADD COLUMN updated_at TEXT DEFAULT (datetime('now'));
    "#,
    // Task 1.1: Add agent_tab_id to agent_sessions table
    r#"
    ALTER TABLE agent_sessions ADD COLUMN agent_tab_id TEXT;
    CREATE INDEX IF NOT EXISTS idx_agent_sessions_tab ON agent_sessions(agent_tab_id);
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
    pub agent: String,
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
    pub color: Option<String>,
    pub icon: Option<String>,
    pub agent_type: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentSession {
    pub id: String,
    pub worktree_id: String,
    pub agent_type: String,
    pub acp_session_id: Option<String>,
    pub agent_tab_id: Option<String>,
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
    pub tab_id: Option<String>,
    pub status: String,
    pub ended_at: Option<String>,
    pub ended_reason: Option<String>,
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

pub struct Db {
    db: Database,
    cached_conn: RwLock<Option<Connection>>,
}

impl std::fmt::Debug for Db {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("Db")
            .field("db", &"<Database>")
            .field("cached_conn", &"<Connection>")
            .finish()
    }
}

impl Db {
    pub async fn in_memory() -> Result<Self> {
        // Use a temporary file-based database for tests
        // In-memory databases in libsql don't share state between connections
        let temp_path = std::env::temp_dir().join(format!("ymir_test_{}.db", uuid::Uuid::new_v4()));
        let path_str = temp_path.to_string_lossy().to_string();
        let db = Builder::new_local(&path_str).build().await?;
        info!("Created temporary database at {}", path_str);
        let db = Self {
            db,
            cached_conn: RwLock::new(None),
        };
        db.migrate().await?;
        Ok(db)
    }

    pub async fn open<P: AsRef<Path>>(path: P) -> Result<Self> {
        let path_str = path.as_ref().to_string_lossy().to_string();
        let db = Builder::new_local(&path_str).build().await?;
        info!("Opened database at {}", path_str);
        let db = Self {
            db,
            cached_conn: RwLock::new(None),
        };
        db.migrate().await?;
        Ok(db)
    }

    pub fn conn(&self) -> Result<Connection> {
        // Check if we have a cached connection
        if let Some(conn) = self.cached_conn.read().unwrap().as_ref() {
            return Ok(conn.clone());
        }

        // Create new connection and cache it
        let conn = self.db.connect()?;
        *self.cached_conn.write().unwrap() = Some(conn.clone());
        Ok(conn)
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
            INSERT INTO workspaces (id, name, root_path, color, icon, worktree_base_dir, settings_json, agent, created_at, updated_at)
            VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)
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
            workspace.agent.as_str(),
            workspace.created_at.as_str(),
            workspace.updated_at.as_str(),
        ])
        .await?;

        debug!("Created workspace: {}", workspace.name);
        Ok(())
    }

    pub async fn get_workspace(&self, id: &str) -> Result<Option<Workspace>> {
        let conn = self.conn()?;
        let mut stmt = conn.prepare("SELECT id, name, root_path, color, icon, worktree_base_dir, settings_json, agent, created_at, updated_at FROM workspaces WHERE id = ?1").await?;
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
                agent: row.get(7)?,
                created_at: row.get(8)?,
                updated_at: row.get(9)?,
            }))
        } else {
            Ok(None)
        }
    }

    pub async fn list_workspaces(&self) -> Result<Vec<Workspace>> {
        let conn = self.conn()?;
        let mut stmt = conn.prepare("SELECT id, name, root_path, color, icon, worktree_base_dir, settings_json, agent, created_at, updated_at FROM workspaces ORDER BY created_at DESC").await?;
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
                agent: row.get(7)?,
                created_at: row.get(8)?,
                updated_at: row.get(9)?,
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
        let now_rfc3339 = chrono::Utc::now().to_rfc3339();

        let rows_affected = if let (Some(n), Some(s)) = (name, settings_json) {
            conn.execute(
                "UPDATE workspaces SET name = ?1, settings_json = ?2, updated_at = ?3 WHERE id = ?4",
                libsql::params![n, s, now_rfc3339, id]
            ).await?
        } else if let Some(n) = name {
            conn.execute(
                "UPDATE workspaces SET name = ?1, updated_at = ?2 WHERE id = ?3",
                libsql::params![n, now_rfc3339, id],
            )
            .await?
        } else if let Some(s) = settings_json {
            conn.execute(
                "UPDATE workspaces SET settings_json = ?1, updated_at = ?2 WHERE id = ?3",
                libsql::params![s, now_rfc3339, id]
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

    /// Partial update of workspace fields. Only non-None fields are modified.
    /// Always updates the updated_at timestamp. Returns Ok(false) if all params
    /// are None or if the workspace ID does not exist.
    pub async fn update_workspace_settings(
        &self,
        id: &str,
        name: Option<&str>,
        color: Option<&str>,
        icon: Option<&str>,
        worktree_base_dir: Option<&str>,
        agent: Option<&str>,
        settings_json: Option<&str>,
    ) -> Result<bool> {
        // Collect fields to update
        let mut set_clauses: Vec<&str> = Vec::new();
        let mut values: Vec<&str> = Vec::new();

        if let Some(v) = name {
            set_clauses.push("name = ?");
            values.push(v);
        }
        if let Some(v) = color {
            set_clauses.push("color = ?");
            values.push(v);
        }
        if let Some(v) = icon {
            set_clauses.push("icon = ?");
            values.push(v);
        }
        if let Some(v) = worktree_base_dir {
            set_clauses.push("worktree_base_dir = ?");
            values.push(v);
        }
        if let Some(v) = agent {
            set_clauses.push("agent = ?");
            values.push(v);
        }
        if let Some(v) = settings_json {
            set_clauses.push("settings_json = ?");
            values.push(v);
        }

        // If no fields to update, return early
        if set_clauses.is_empty() {
            return Ok(false);
        }

        let conn = self.conn()?;
        let now_rfc3339 = chrono::Utc::now().to_rfc3339();

        // Build dynamic query: always update updated_at
        let param_count = set_clauses.len() + 1; // +1 for updated_at
        let mut params: Vec<libsql::Value> = Vec::with_capacity(param_count + 1); // +1 for id

        for v in &values {
            params.push(libsql::Value::Text(v.to_string()));
        }
        params.push(libsql::Value::Text(now_rfc3339));
        params.push(libsql::Value::Text(id.to_string()));

        let set_clause = set_clauses.join(", ");
        let query = format!(
            "UPDATE workspaces SET {}, updated_at = ? WHERE id = ?",
            set_clause
        );

        let rows_affected = conn
            .execute(&query, libsql::params_from_iter(params))
            .await?;

        debug!(
            "Updated workspace settings {} (rows affected: {})",
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
            INSERT INTO worktrees (id, workspace_id, branch_name, path, status, created_at, is_main, color, icon, agent_type)
            VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)
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
            worktree.color.as_deref(),
            worktree.icon.as_deref(),
            worktree.agent_type.as_deref(),
        ))
        .await?;

        debug!("Created worktree: {}", worktree.branch_name);
        Ok(())
    }

    pub async fn get_worktree(&self, id: &str) -> Result<Option<Worktree>> {
        let conn = self.conn()?;
        let mut stmt = conn.prepare("SELECT id, workspace_id, branch_name, path, status, created_at, COALESCE(is_main, 0), color, icon, agent_type FROM worktrees WHERE id = ?1").await?;
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
                color: row.get(7)?,
                icon: row.get(8)?,
                agent_type: row.get(9)?,
            }))
        } else {
            Ok(None)
        }
    }

    pub async fn list_worktrees(&self, workspace_id: &str) -> Result<Vec<Worktree>> {
        let conn = self.conn()?;
        let mut stmt = conn.prepare(
            "SELECT id, workspace_id, branch_name, path, status, created_at, COALESCE(is_main, 0), color, icon, agent_type FROM worktrees WHERE workspace_id = ?1 ORDER BY created_at DESC"
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
                color: row.get(7)?,
                icon: row.get(8)?,
                agent_type: row.get(9)?,
            });
        }

        Ok(worktrees)
    }

    pub async fn list_all_worktrees(&self) -> Result<Vec<Worktree>> {
        let conn = self.conn()?;
        let mut stmt = conn.prepare(
            "SELECT id, workspace_id, branch_name, path, status, created_at, COALESCE(is_main, 0), color, icon, agent_type FROM worktrees ORDER BY created_at DESC"
        ).await?;
        let mut rows = stmt.query(()).await?;
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
                color: row.get(7)?,
                icon: row.get(8)?,
                agent_type: row.get(9)?,
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

    pub async fn update_worktree_settings(
        &self,
        id: &str,
        color: Option<&str>,
        icon: Option<&str>,
        agent_type: Option<&str>,
    ) -> Result<bool> {
        let conn = self.conn()?;

        if color.is_none() && icon.is_none() && agent_type.is_none() {
            return Ok(false);
        }

        let now_rfc3339 = chrono::Utc::now().to_rfc3339();

        let mut set_parts: Vec<String> = Vec::new();
        let mut params: Vec<libsql::Value> = Vec::new();
        let mut param_idx = 1usize;

        if let Some(c) = color {
            set_parts.push(format!("color = ?{}", param_idx));
            params.push(libsql::Value::Text(c.to_string()));
            param_idx += 1;
        }
        if let Some(i) = icon {
            set_parts.push(format!("icon = ?{}", param_idx));
            params.push(libsql::Value::Text(i.to_string()));
            param_idx += 1;
        }
        if let Some(a) = agent_type {
            set_parts.push(format!("agent_type = ?{}", param_idx));
            params.push(libsql::Value::Text(a.to_string()));
            param_idx += 1;
        }

        set_parts.push(format!("updated_at = ?{}", param_idx));
        params.push(libsql::Value::Text(now_rfc3339));

        let set_clause = set_parts.join(", ");
        let sql = format!("UPDATE worktrees SET {} WHERE id = ?{}", set_clause, param_idx + 1);
        params.push(libsql::Value::Text(id.to_string()));

        info!("Executing worktree update: sql={} params={:?}", sql, params);
        let result = conn.execute(&sql, params).await;
        match result {
            Ok(rows_affected) => {
                info!(
                    "Updated worktree {} settings (rows affected: {})",
                    id, rows_affected
                );
                Ok(rows_affected > 0)
            }
            Err(e) => {
                error!("Failed to update worktree {}: {}", id, e);
                Err(e.into())
            }
        }
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
            INSERT INTO agent_sessions (id, worktree_id, agent_type, acp_session_id, agent_tab_id, status, started_at)
            VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
            "#,
        ).await?;

        stmt.execute((
            session.id.as_str(),
            session.worktree_id.as_str(),
            session.agent_type.as_str(),
            session.acp_session_id.as_deref(),
            session.agent_tab_id.as_deref(),
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
        let mut stmt = conn.prepare("SELECT id, worktree_id, agent_type, acp_session_id, agent_tab_id, status, started_at FROM agent_sessions WHERE id = ?1").await?;
        let mut rows = stmt.query([id]).await?;

        if let Some(row) = rows.next().await? {
            Ok(Some(AgentSession {
                id: row.get(0)?,
                worktree_id: row.get(1)?,
                agent_type: row.get(2)?,
                acp_session_id: row.get(3)?,
                agent_tab_id: row.get(4)?,
                status: row.get(5)?,
                started_at: row.get(6)?,
            }))
        } else {
            Ok(None)
        }
    }

    pub async fn get_agent_session_by_tab_id(&self, agent_tab_id: &str) -> Result<Option<AgentSession>> {
        let conn = self.conn()?;
        let mut stmt = conn.prepare("SELECT id, worktree_id, agent_type, acp_session_id, agent_tab_id, status, started_at FROM agent_sessions WHERE agent_tab_id = ?1").await?;
        let mut rows = stmt.query([agent_tab_id]).await?;

        if let Some(row) = rows.next().await? {
            Ok(Some(AgentSession {
                id: row.get(0)?,
                worktree_id: row.get(1)?,
                agent_type: row.get(2)?,
                acp_session_id: row.get(3)?,
                agent_tab_id: row.get(4)?,
                status: row.get(5)?,
                started_at: row.get(6)?,
            }))
        } else {
            Ok(None)
        }
    }

    pub async fn list_agent_sessions(&self, worktree_id: &str) -> Result<Vec<AgentSession>> {
        let conn = self.conn()?;
        let mut stmt = conn.prepare(
            "SELECT id, worktree_id, agent_type, acp_session_id, agent_tab_id, status, started_at FROM agent_sessions WHERE worktree_id = ?1 ORDER BY started_at DESC"
        ).await?;
        let mut rows = stmt.query([worktree_id]).await?;
        let mut sessions = Vec::new();

        while let Some(row) = rows.next().await? {
            sessions.push(AgentSession {
                id: row.get(0)?,
                worktree_id: row.get(1)?,
                agent_type: row.get(2)?,
                acp_session_id: row.get(3)?,
                agent_tab_id: row.get(4)?,
                status: row.get(5)?,
                started_at: row.get(6)?,
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

    /// Update the ACP session ID and optionally the agent_tab_id for a session.
    /// Only non-None fields are updated.
    pub async fn update_agent_session_acp_id(
        &self,
        id: &str,
        acp_session_id: Option<&str>,
        agent_tab_id: Option<&str>,
    ) -> Result<bool> {
        let conn = self.conn()?;
        let mut set_clauses: Vec<&str> = Vec::new();
        let mut params: Vec<libsql::Value> = Vec::new();

        if let Some(v) = acp_session_id {
            set_clauses.push("acp_session_id = ?");
            params.push(v.into());
        }
        if let Some(v) = agent_tab_id {
            set_clauses.push("agent_tab_id = ?");
            params.push(v.into());
        }

        if set_clauses.is_empty() {
            return Ok(false);
        }

        params.push(id.into());
        let query = format!(
            "UPDATE agent_sessions SET {} WHERE id = ?",
            set_clauses.join(", ")
        );

        let rows_affected = conn.execute(&query, params).await?;
        debug!(
            "Updated agent session {} acp/tab info (rows affected: {})",
            id, rows_affected
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

    pub async fn list_all_agent_sessions(&self) -> Result<Vec<AgentSession>> {
        let conn = self.conn()?;
        let mut stmt = conn.prepare(
            "SELECT id, worktree_id, agent_type, acp_session_id, agent_tab_id, status, started_at FROM agent_sessions ORDER BY started_at DESC"
        ).await?;
        let mut rows = stmt.query(()).await?;
        let mut sessions = Vec::new();

        while let Some(row) = rows.next().await? {
            sessions.push(AgentSession {
                id: row.get(0)?,
                worktree_id: row.get(1)?,
                agent_type: row.get(2)?,
                acp_session_id: row.get(3)?,
                agent_tab_id: row.get(4)?,
                status: row.get(5)?,
                started_at: row.get(6)?,
            });
        }

  Ok(sessions)
  }

  pub async fn clear_all_agent_sessions(&self) -> Result<usize> {
    let conn = self.conn()?;
    let rows_affected = conn
      .execute("DELETE FROM agent_sessions", ())
      .await?;
    Ok(rows_affected as usize)
  }
}

impl Db {
  pub async fn create_terminal_session(&self, session: &TerminalSession) -> Result<()> {
        let conn = self.conn()?;
        let mut stmt = conn
            .prepare(
                r#"
            INSERT INTO terminal_sessions (id, worktree_id, label, shell, created_at, tab_id, status)
            VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
            "#,
            )
            .await?;

        stmt.execute((
            session.id.as_str(),
            session.worktree_id.as_str(),
            session.label.as_deref(),
            session.shell.as_str(),
            session.created_at.as_str(),
            session.tab_id.as_deref().unwrap_or(session.id.as_str()),
            session.status.as_str(),
        ))
        .await?;

        debug!("Created terminal session: {}", session.id);
        Ok(())
    }

    pub async fn get_terminal_session(&self, id: &str) -> Result<Option<TerminalSession>> {
let conn = self.conn()?;
    let mut stmt = conn.prepare("SELECT id, worktree_id, label, shell, created_at, COALESCE(position, 0), tab_id, status, ended_at, ended_reason FROM terminal_sessions WHERE id = ?1").await?;
    let mut rows = stmt.query([id]).await?;

    if let Some(row) = rows.next().await? {
      Ok(Some(TerminalSession {
        id: row.get(0)?,
        worktree_id: row.get(1)?,
        label: row.get(2)?,
        shell: row.get(3)?,
        created_at: row.get(4)?,
        position: row.get(5)?,
        tab_id: row.get(6)?,
        status: row.get(7)?,
        ended_at: row.get(8)?,
        ended_reason: row.get(9)?,
      }))
    } else {
      Ok(None)
    }
    }

pub async fn list_terminal_sessions(&self, worktree_id: &str) -> Result<Vec<TerminalSession>> {
    let conn = self.conn()?;
    let mut stmt = conn.prepare(
      "SELECT id, worktree_id, label, shell, created_at, COALESCE(position, 0), tab_id, status, ended_at, ended_reason FROM terminal_sessions WHERE worktree_id = ?1 ORDER BY COALESCE(position, 0) ASC"
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
        tab_id: row.get(6)?,
        status: row.get(7)?,
        ended_at: row.get(8)?,
        ended_reason: row.get(9)?,
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

    pub async fn list_all_terminal_sessions(&self) -> Result<Vec<TerminalSession>> {
        let conn = self.conn()?;
        let mut stmt = conn.prepare(
            "SELECT id, worktree_id, label, shell, created_at, COALESCE(position, 0), tab_id, status, ended_at, ended_reason FROM terminal_sessions ORDER BY COALESCE(position, 0) ASC"
        ).await?;
        let mut rows = stmt.query(()).await?;
        let mut sessions = Vec::new();

        while let Some(row) = rows.next().await? {
            sessions.push(TerminalSession {
                id: row.get(0)?,
                worktree_id: row.get(1)?,
                label: row.get(2)?,
                shell: row.get(3)?,
                created_at: row.get(4)?,
                position: row.get(5)?,
                tab_id: row.get(6)?,
                status: row.get(7)?,
                ended_at: row.get(8)?,
                ended_reason: row.get(9)?,
            });
        }

  Ok(sessions)
  }

  pub async fn clear_all_terminal_sessions(&self) -> Result<usize> {
    let conn = self.conn()?;
    let rows_affected = conn
      .execute("DELETE FROM terminal_sessions", ())
      .await?;
    Ok(rows_affected as usize)
  }

  // --- Tab-Session Separation methods (Phase 1) ---

  /// Create a terminal tab record. The tab is the stable identity that persists
  /// across page refreshes. A session is created alongside it.
  pub async fn create_terminal_tab(
    &self,
    tab_id: &str,
    worktree_id: &str,
    label: Option<&str>,
    shell: &str,
  ) -> Result<String> {
    let conn = self.conn()?;
    let session_id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now().to_rfc3339();

    let mut stmt = conn
      .prepare(
        r#"
        INSERT INTO terminal_sessions (id, worktree_id, label, shell, created_at, tab_id, status)
        VALUES (?1, ?2, ?3, ?4, ?5, ?6, 'active')
        "#,
      )
      .await?;

    stmt.execute((
      session_id.as_str(),
      worktree_id,
      label,
      shell,
      now.as_str(),
      tab_id,
    ))
    .await?;

    debug!("Created terminal tab {} with session {}", tab_id, session_id);
    Ok(session_id)
  }

  /// Get the most recent active session for a given tab_id.
  pub async fn get_active_tab_session(&self, tab_id: &str) -> Result<Option<TerminalSession>> {
    let conn = self.conn()?;
    let mut stmt = conn
      .prepare(
        r#"
        SELECT id, worktree_id, label, shell, created_at, COALESCE(position, 0), tab_id, status, ended_at, ended_reason
        FROM terminal_sessions
        WHERE tab_id = ?1 AND status = 'active'
        ORDER BY created_at DESC
        LIMIT 1
        "#,
      )
      .await?;
    let mut rows = stmt.query([tab_id]).await?;

    if let Some(row) = rows.next().await? {
      Ok(Some(TerminalSession {
        id: row.get(0)?,
        worktree_id: row.get(1)?,
        label: row.get(2)?,
        shell: row.get(3)?,
        created_at: row.get(4)?,
        position: row.get(5)?,
        tab_id: row.get(6)?,
        status: row.get(7)?,
        ended_at: row.get(8)?,
        ended_reason: row.get(9)?,
      }))
    } else {
      Ok(None)
    }
  }

  /// Get the most recent ended session for a given tab_id (for respawn context).
  pub async fn get_ended_tab_session(&self, tab_id: &str) -> Result<Option<TerminalSession>> {
    let conn = self.conn()?;
    let mut stmt = conn
      .prepare(
        r#"
        SELECT id, worktree_id, label, shell, created_at, COALESCE(position, 0), tab_id, status, ended_at, ended_reason
        FROM terminal_sessions
        WHERE tab_id = ?1 AND status != 'active'
        ORDER BY created_at DESC
        LIMIT 1
        "#,
      )
      .await?;
    let mut rows = stmt.query([tab_id]).await?;

    if let Some(row) = rows.next().await? {
      Ok(Some(TerminalSession {
        id: row.get(0)?,
        worktree_id: row.get(1)?,
        label: row.get(2)?,
        shell: row.get(3)?,
        created_at: row.get(4)?,
        position: row.get(5)?,
        tab_id: row.get(6)?,
        status: row.get(7)?,
        ended_at: row.get(8)?,
        ended_reason: row.get(9)?,
      }))
    } else {
      Ok(None)
    }
  }

  /// Link a session to a tab by updating the tab_id on a session row.
  /// Used when a new PTY session is spawned for an existing tab.
  pub async fn link_tab_session(&self, tab_id: &str, session_id: &str) -> Result<bool> {
    let conn = self.conn()?;
    let rows_affected = conn
      .execute(
        "UPDATE terminal_sessions SET tab_id = ?1, status = 'active', ended_at = NULL, ended_reason = NULL, updated_at = datetime('now') WHERE id = ?2",
        libsql::params![tab_id, session_id],
      )
      .await?;
    debug!(
      "Linked tab {} to session {} (rows affected: {})",
      tab_id, session_id, rows_affected
    );
    Ok(rows_affected > 0)
  }

  /// End a session by setting status, ended_at, and ended_reason.
  pub async fn end_tab_session(&self, session_id: &str, reason: &str) -> Result<bool> {
    let conn = self.conn()?;
    let rows_affected = conn
      .execute(
        "UPDATE terminal_sessions SET status = 'ended', ended_at = datetime('now'), ended_reason = ?1, updated_at = datetime('now') WHERE id = ?2",
        libsql::params![reason, session_id],
      )
      .await?;
    debug!(
      "Ended session {} with reason '{}' (rows affected: {})",
      session_id, reason, rows_affected
    );
    Ok(rows_affected > 0)
  }

  /// Close a terminal tab: end its active session and mark the tab as closed.
  /// This effectively removes the tab's identity from the active set.
  pub async fn close_terminal_tab(&self, tab_id: &str) -> Result<bool> {
    let conn = self.conn()?;
    // Delete all output for sessions belonging to this tab
    conn.execute(
      "DELETE FROM terminal_output WHERE session_id IN (SELECT id FROM terminal_sessions WHERE tab_id = ?1)",
      libsql::params![tab_id],
    ).await?;
    // Delete all sessions for this tab
    conn.execute(
      "DELETE FROM terminal_sessions WHERE tab_id = ?1",
      libsql::params![tab_id],
    ).await?;
    debug!("Deleted tab {} and all its sessions", tab_id);
    Ok(true)
  }

  /// Get terminal output for a tab by JOINing terminal_output with terminal_sessions
  /// on session_id, filtering by tab_id. Returns all output across all sessions for
  /// the given tab.
  pub async fn get_terminal_output_by_tab(
    &self,
    tab_id: &str,
    limit: Option<i64>,
  ) -> Result<Vec<String>> {
    let conn = self.conn()?;
    let limit = limit.unwrap_or(1000);

    let mut stmt = conn
      .prepare(
        r#"
        SELECT o.data FROM terminal_output o
        INNER JOIN terminal_sessions s ON o.session_id = s.id
        WHERE s.tab_id = ?1
        ORDER BY o.id ASC
        LIMIT ?2
        "#,
      )
      .await?;

    let mut rows = stmt
      .query((tab_id, limit.to_string().as_str()))
      .await?;
    let mut output = Vec::new();

    while let Some(row) = rows.next().await? {
      output.push(row.get::<String>(0)?);
    }

    debug!(
      "Retrieved {} output rows for tab {}",
      output.len(),
      tab_id
    );
    Ok(output)
  }

  /// List all terminal sessions for a given tab_id.
  pub async fn list_terminal_sessions_for_tab(&self, tab_id: &str) -> Result<Vec<TerminalSession>> {
    let conn = self.conn()?;
    let mut stmt = conn
      .prepare(
        r#"
        SELECT id, worktree_id, label, shell, created_at, COALESCE(position, 0), tab_id, status, ended_at, ended_reason
        FROM terminal_sessions
        WHERE tab_id = ?1
        ORDER BY created_at ASC
        "#,
      )
      .await?;
    let mut rows = stmt.query([tab_id]).await?;
    let mut sessions = Vec::new();

    while let Some(row) = rows.next().await? {
      sessions.push(TerminalSession {
        id: row.get(0)?,
        worktree_id: row.get(1)?,
        label: row.get(2)?,
        shell: row.get(3)?,
        created_at: row.get(4)?,
        position: row.get(5)?,
        tab_id: row.get(6)?,
        status: row.get(7)?,
        ended_at: row.get(8)?,
        ended_reason: row.get(9)?,
      });
    }

    debug!(
      "Retrieved {} sessions for tab {}",
      sessions.len(),
      tab_id
    );
    Ok(sessions)
  }

  /// List all tabs for a worktree, returning the most recent session info per tab.
  /// Only returns tabs with at least one session (active or recently ended).
  pub async fn list_terminal_tabs(&self, worktree_id: &str) -> Result<Vec<TerminalSession>> {
    let conn = self.conn()?;
    let mut stmt = conn
      .prepare(
        r#"
        SELECT s.id, s.worktree_id, s.label, s.shell, s.created_at, COALESCE(s.position, 0), s.tab_id, s.status, s.ended_at, s.ended_reason
        FROM terminal_sessions s
        INNER JOIN (
          SELECT tab_id, MAX(created_at) as max_created
          FROM terminal_sessions
          WHERE worktree_id = ?1
          GROUP BY tab_id
        ) latest ON s.tab_id = latest.tab_id AND s.created_at = latest.max_created
        WHERE s.worktree_id = ?1
        ORDER BY COALESCE(s.position, 0) ASC
        "#,
      )
      .await?;
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
        tab_id: row.get(6)?,
        status: row.get(7)?,
        ended_at: row.get(8)?,
        ended_reason: row.get(9)?,
      });
    }

    debug!("Listed {} terminal tabs for worktree {}", sessions.len(), worktree_id);
    Ok(sessions)
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

impl Db {
    pub async fn append_terminal_output(&self, session_id: &str, data: &str) -> Result<()> {
        let conn = self.conn()?;
        let mut stmt = conn
            .prepare(
                r#"
                INSERT INTO terminal_output (session_id, data, timestamp)
                VALUES (?1, ?2, datetime('now'))
                "#,
            )
            .await?;

        stmt.execute((session_id, data)).await?;
        Ok(())
    }

    pub async fn get_terminal_output_history(
        &self,
        session_id: &str,
        limit: Option<i64>,
    ) -> Result<Vec<String>> {
        let conn = self.conn()?;
        let limit = limit.unwrap_or(1000);

        let mut stmt = conn
            .prepare(
                r#"
                SELECT data FROM terminal_output
                WHERE session_id = ?1
                ORDER BY id ASC
                LIMIT ?2
                "#,
            )
            .await?;

        let mut rows = stmt.query([session_id, limit.to_string().as_str()]).await?;
        let mut output = Vec::new();

        while let Some(row) = rows.next().await? {
            output.push(row.get::<String>(0)?);
        }

        Ok(output)
    }

    pub async fn delete_terminal_output(&self, session_id: &str) -> Result<u64> {
        let conn = self.conn()?;
        let rows_affected = conn
            .execute(
                "DELETE FROM terminal_output WHERE session_id = ?1",
                libsql::params![session_id],
            )
            .await?;
        debug!(
            "Deleted terminal output for session {} (rows affected: {})",
            session_id, rows_affected
        );
        Ok(rows_affected)
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

    /// Create a workspace and worktree to satisfy foreign key constraints
    /// for terminal_sessions (which references worktrees).
    async fn setup_worktree(db: &Db) -> String {
        let workspace_id = generate_uuid();
        let workspace = Workspace {
            id: workspace_id.clone(),
            name: "Test Workspace".to_string(),
            root_path: "/test/path".to_string(),
            color: "#FF0000".to_string(),
            icon: "folder".to_string(),
            worktree_base_dir: ".git/worktrees".to_string(),
            settings_json: "{}".to_string(),
            agent: "hermes".to_string(),
            created_at: chrono::Utc::now().to_rfc3339(),
            updated_at: chrono::Utc::now().to_rfc3339(),
        };
        db.create_workspace(&workspace)
            .await
            .expect("Failed to create workspace");

        let worktree_id = generate_uuid();
        let worktree = Worktree {
            id: worktree_id.clone(),
            workspace_id: workspace_id.clone(),
            branch_name: "main".to_string(),
            path: "/test/path".to_string(),
            status: "active".to_string(),
            created_at: chrono::Utc::now().to_rfc3339(),
            is_main: true,
            color: None,
            icon: None,
            agent_type: None,
        };
        db.create_worktree(&worktree)
            .await
            .expect("Failed to create worktree");

        worktree_id
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
            agent: "hermes".to_string(),
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
            agent: "hermes".to_string(),
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
            color: None,
            icon: None,
            agent_type: None,
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
            agent: "hermes".to_string(),
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
            color: None,
            icon: None,
            agent_type: None,
        };
        db.create_worktree(&worktree)
            .await
            .expect("Failed to create worktree");

        let session = AgentSession {
            id: generate_uuid(),
            worktree_id: worktree_id.clone(),
            agent_type: "explore".to_string(),
            acp_session_id: Some("acp-123".to_string()),
            agent_tab_id: None,
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
            agent: "hermes".to_string(),
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
            color: None,
            icon: None,
            agent_type: None,
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
            tab_id: None,
            status: "active".to_string(),
            ended_at: None,
            ended_reason: None,
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
            agent: "hermes".to_string(),
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

    // --- Terminal Tab-Session Separation Tests (Phase 9) ---

    #[tokio::test]
    async fn test_create_terminal_tab() {
        let db = create_test_db().await;

        let tab_id = generate_uuid();
        let worktree_id = generate_uuid();

        let session_id = db
            .create_terminal_tab(&tab_id, &worktree_id, Some("Test Tab"), "bash")
            .await
            .expect("Failed to create terminal tab");

        // Verify session was created and linked to tab
        let session = db
            .get_terminal_session(&session_id)
            .await
            .expect("Failed to get session");
        assert!(session.is_some());
        let session = session.unwrap();
        assert_eq!(session.tab_id, Some(tab_id.clone()));
        assert_eq!(session.status, "active");
        assert_eq!(session.worktree_id, worktree_id);
    }

    #[tokio::test]
    async fn test_get_active_tab_session() {
        let db = create_test_db().await;

        let tab_id = generate_uuid();
        let worktree_id = generate_uuid();

        // Create an active session for the tab
        let _session_id = db
            .create_terminal_tab(&tab_id, &worktree_id, Some("Active Tab"), "bash")
            .await
            .expect("Failed to create terminal tab");

        // Should find the active session
        let active = db
            .get_active_tab_session(&tab_id)
            .await
            .expect("Failed to get active tab session");
        assert!(active.is_some());
        let active = active.unwrap();
        assert_eq!(active.tab_id, Some(tab_id.clone()));
        assert_eq!(active.status, "active");

        // Non-existent tab should return None
        let nonexistent = db
            .get_active_tab_session(&generate_uuid())
            .await
            .expect("Failed to query nonexistent tab");
        assert!(nonexistent.is_none());
    }

    #[tokio::test]
    async fn test_get_ended_tab_session() {
        let db = create_test_db().await;

        let tab_id = generate_uuid();
        let worktree_id = generate_uuid();

        // Create and then end a session
        let session_id = db
            .create_terminal_tab(&tab_id, &worktree_id, Some("Ended Tab"), "bash")
            .await
            .expect("Failed to create terminal tab");

        db.end_tab_session(&session_id, "unmount")
            .await
            .expect("Failed to end session");

        // Should find the ended session
        let ended = db
            .get_ended_tab_session(&tab_id)
            .await
            .expect("Failed to get ended tab session");
        assert!(ended.is_some());
        let ended = ended.unwrap();
        assert_eq!(ended.tab_id, Some(tab_id.clone()));
        assert_eq!(ended.status, "ended");
        assert_eq!(ended.ended_reason, Some("unmount".to_string()));

        // Active session should not be returned by get_ended_tab_session
        let tab_id2 = generate_uuid();
        let _session_id2 = db
            .create_terminal_tab(&tab_id2, &worktree_id, Some("Active Tab"), "bash")
            .await
            .expect("Failed to create terminal tab");

        let active = db
            .get_ended_tab_session(&tab_id2)
            .await
            .expect("Failed to query active tab");
        assert!(active.is_none());
    }

    #[tokio::test]
    async fn test_link_tab_session() {
        let db = create_test_db().await;

        let tab_id = generate_uuid();
        let worktree_id = generate_uuid();

        // Create initial session
        let session_id_1 = db
            .create_terminal_tab(&tab_id, &worktree_id, Some("Tab"), "bash")
            .await
            .expect("Failed to create terminal tab");

        // End the first session
        db.end_tab_session(&session_id_1, "ttl")
            .await
            .expect("Failed to end session");

        // Create a new session (simulating respawn)
        let session_id_2 = generate_uuid();
        let new_session = TerminalSession {
            id: session_id_2.clone(),
            worktree_id: worktree_id.clone(),
            label: Some("Tab".to_string()),
            shell: "bash".to_string(),
            created_at: chrono::Utc::now().to_rfc3339(),
            position: 0,
            tab_id: None,
            status: "active".to_string(),
            ended_at: None,
            ended_reason: None,
        };
        db.create_terminal_session(&new_session)
            .await
            .expect("Failed to create session");

        // Link new session to tab
        let linked = db
            .link_tab_session(&tab_id, &session_id_2)
            .await
            .expect("Failed to link session");
        assert!(linked);

        // Verify the session is now linked and active
        let session = db
            .get_terminal_session(&session_id_2)
            .await
            .expect("Failed to get session");
        assert!(session.is_some());
        let session = session.unwrap();
        assert_eq!(session.tab_id, Some(tab_id));
        assert_eq!(session.status, "active");
        assert!(session.ended_at.is_none());
        assert!(session.ended_reason.is_none());
    }

    #[tokio::test]
    async fn test_end_tab_session() {
        let db = create_test_db().await;

        let tab_id = generate_uuid();
        let worktree_id = generate_uuid();

        let session_id = db
            .create_terminal_tab(&tab_id, &worktree_id, Some("Tab"), "bash")
            .await
            .expect("Failed to create terminal tab");

        // End with unmount reason
        let ended = db
            .end_tab_session(&session_id, "unmount")
            .await
            .expect("Failed to end session");
        assert!(ended);

        let session = db
            .get_terminal_session(&session_id)
            .await
            .expect("Failed to get session");
        assert!(session.is_some());
        let session = session.unwrap();
        assert_eq!(session.status, "ended");
        assert_eq!(session.ended_reason, Some("unmount".to_string()));
        assert!(session.ended_at.is_some());

        // End with TTL reason
        let session_id2 = db
            .create_terminal_tab(&generate_uuid(), &worktree_id, Some("Tab2"), "bash")
            .await
            .expect("Failed to create terminal tab");

        db.end_tab_session(&session_id2, "ttl")
            .await
            .expect("Failed to end session");

        let session2 = db
            .get_terminal_session(&session_id2)
            .await
            .expect("Failed to get session");
        assert_eq!(session2.unwrap().ended_reason, Some("ttl".to_string()));
    }

    #[tokio::test]
    async fn test_close_terminal_tab() {
        let db = create_test_db().await;

        let tab_id = generate_uuid();
        let worktree_id = generate_uuid();

        // Create tab with session
        let _session_id = db
            .create_terminal_tab(&tab_id, &worktree_id, Some("Tab"), "bash")
            .await
            .expect("Failed to create terminal tab");

        // Close the tab
        let closed = db
            .close_terminal_tab(&tab_id)
            .await
            .expect("Failed to close tab");
        assert!(closed);

        // Session should be ended
        let active = db
            .get_active_tab_session(&tab_id)
            .await
            .expect("Failed to check active session");
        assert!(active.is_none());

        // Ended session should exist
        let ended = db
            .get_ended_tab_session(&tab_id)
            .await
            .expect("Failed to check ended session");
        assert!(ended.is_some());
        assert_eq!(ended.unwrap().ended_reason, Some("close".to_string()));

        // Closing a tab with no active sessions should return false
        let closed_again = db
            .close_terminal_tab(&tab_id)
            .await
            .expect("Failed to close tab again");
        assert!(!closed_again);
    }

    #[tokio::test]
    async fn test_get_terminal_output_by_tab() {
        let db = create_test_db().await;

        let tab_id = generate_uuid();
        let worktree_id = generate_uuid();

        // Create first session and add output
        let session_id_1 = db
            .create_terminal_tab(&tab_id, &worktree_id, Some("Tab"), "bash")
            .await
            .expect("Failed to create terminal tab");

        db.append_terminal_output(&session_id_1, "output line 1\n")
            .await
            .expect("Failed to append output");
        db.append_terminal_output(&session_id_1, "output line 2\n")
            .await
            .expect("Failed to append output");

        // End first session and create second (simulating TTL respawn)
        db.end_tab_session(&session_id_1, "ttl")
            .await
            .expect("Failed to end session");

        let session_id_2 = generate_uuid();
        let session_2 = TerminalSession {
            id: session_id_2.clone(),
            worktree_id: worktree_id.clone(),
            label: Some("Tab".to_string()),
            shell: "bash".to_string(),
            created_at: chrono::Utc::now().to_rfc3339(),
            position: 0,
            tab_id: Some(tab_id.clone()),
            status: "active".to_string(),
            ended_at: None,
            ended_reason: None,
        };
        db.create_terminal_session(&session_2)
            .await
            .expect("Failed to create session");

        db.append_terminal_output(&session_id_2, "output line 3\n")
            .await
            .expect("Failed to append output");

        // Query output by tab — should include output from both sessions
        let output = db
            .get_terminal_output_by_tab(&tab_id, None)
            .await
            .expect("Failed to get output by tab");
        assert_eq!(output.len(), 3);
        assert_eq!(output[0], "output line 1\n");
        assert_eq!(output[1], "output line 2\n");
        assert_eq!(output[2], "output line 3\n");

        // Test with limit
        let output_limited = db
            .get_terminal_output_by_tab(&tab_id, Some(2))
            .await
            .expect("Failed to get limited output");
        assert_eq!(output_limited.len(), 2);

        // Non-existent tab should return empty
        let empty = db
            .get_terminal_output_by_tab(&generate_uuid(), None)
            .await
            .expect("Failed to query nonexistent tab");
        assert!(empty.is_empty());
    }

    #[tokio::test]
    async fn test_list_terminal_tabs() {
        let db = create_test_db().await;

        let worktree_id = generate_uuid();

        // Create multiple tabs
        let tab_id_1 = generate_uuid();
        let tab_id_2 = generate_uuid();

        db.create_terminal_tab(&tab_id_1, &worktree_id, Some("Tab 1"), "bash")
            .await
            .expect("Failed to create tab 1");
        db.create_terminal_tab(&tab_id_2, &worktree_id, Some("Tab 2"), "zsh")
            .await
            .expect("Failed to create tab 2");

        // List tabs for worktree
        let tabs = db
            .list_terminal_tabs(&worktree_id)
            .await
            .expect("Failed to list tabs");
        assert_eq!(tabs.len(), 2);

        // Verify both tabs are present
        let tab_ids: Vec<&String> = tabs.iter().filter_map(|t| t.tab_id.as_ref()).collect();
        assert!(tab_ids.iter().any(|t| **t == tab_id_1));
        assert!(tab_ids.iter().any(|t| **t == tab_id_2));

        // Different worktree should have no tabs
        let empty = db
            .list_terminal_tabs(&generate_uuid())
            .await
            .expect("Failed to list tabs for empty worktree");
        assert!(empty.is_empty());
    }

    #[tokio::test]
    async fn test_list_terminal_sessions_for_tab() {
        let db = create_test_db().await;

        let tab_id = generate_uuid();
        let worktree_id = generate_uuid();

        // Create a session
        let session_id_1 = db
            .create_terminal_tab(&tab_id, &worktree_id, Some("Tab"), "bash")
            .await
            .expect("Failed to create tab");

        // End it and create another
        db.end_tab_session(&session_id_1, "unmount")
            .await
            .expect("Failed to end session");

        let session_id_2 = generate_uuid();
        let session_2 = TerminalSession {
            id: session_id_2.clone(),
            worktree_id: worktree_id.clone(),
            label: Some("Tab".to_string()),
            shell: "bash".to_string(),
            created_at: chrono::Utc::now().to_rfc3339(),
            position: 0,
            tab_id: Some(tab_id.clone()),
            status: "active".to_string(),
            ended_at: None,
            ended_reason: None,
        };
        db.create_terminal_session(&session_2)
            .await
            .expect("Failed to create session");

        // List all sessions for tab
        let sessions = db
            .list_terminal_sessions_for_tab(&tab_id)
            .await
            .expect("Failed to list sessions for tab");
        assert_eq!(sessions.len(), 2);

        // Verify both sessions are present and ordered by creation
        assert_eq!(sessions[0].id, session_id_1);
        assert_eq!(sessions[1].id, session_id_2);

        // Verify statuses
        assert_eq!(sessions[0].status, "ended");
        assert_eq!(sessions[1].status, "active");

        // Non-existent tab should return empty
        let empty = db
            .list_terminal_sessions_for_tab(&generate_uuid())
            .await
            .expect("Failed to list sessions for nonexistent tab");
        assert!(empty.is_empty());
    }

    #[tokio::test]
    async fn test_tab_session_multiple_respawns() {
        let db = create_test_db().await;

        let tab_id = generate_uuid();
        let worktree_id = generate_uuid();

        // Simulate multiple respawns (TTL cycles)
        for i in 0..3 {
            let session = TerminalSession {
                id: generate_uuid(),
                worktree_id: worktree_id.clone(),
                label: Some(format!("Tab respawn {}", i)),
                shell: "bash".to_string(),
                created_at: chrono::Utc::now().to_rfc3339(),
                position: 0,
                tab_id: Some(tab_id.clone()),
                status: "active".to_string(),
                ended_at: None,
                ended_reason: None,
            };
            db.create_terminal_session(&session)
                .await
                .expect("Failed to create session");
        }

        // All sessions should be retrievable
        let sessions = db
            .list_terminal_sessions_for_tab(&tab_id)
            .await
            .expect("Failed to list sessions");
        assert_eq!(sessions.len(), 3);

        // Only active sessions should be returned by get_active_tab_session
        let active = db
            .get_active_tab_session(&tab_id)
            .await
            .expect("Failed to get active session");
        assert!(active.is_some());
        assert_eq!(active.unwrap().status, "active");

        // list_terminal_tabs should return the most recent session
        let tabs = db
            .list_terminal_tabs(&worktree_id)
            .await
            .expect("Failed to list tabs");
        assert_eq!(tabs.len(), 1);
        assert_eq!(tabs[0].status, "active");
    }

    #[tokio::test]
    async fn test_create_terminal_tab_creates_tab_and_session() {
        let db = create_test_db().await;
        let worktree_id = setup_worktree(&db).await;
        let tab_id = generate_uuid();

        // Create a terminal tab — this should create both tab record and session
        let session_id = db
            .create_terminal_tab(&tab_id, &worktree_id, Some("New Tab"), "bash")
            .await
            .expect("Failed to create terminal tab");

        // Session should exist and be linked to the tab
        let session = db
            .get_terminal_session(&session_id)
            .await
            .expect("Failed to get session");
        assert!(session.is_some());
        let session = session.unwrap();
        assert_eq!(session.tab_id, Some(tab_id.clone()));
        assert_eq!(session.worktree_id, worktree_id);
        assert_eq!(session.shell, "bash");
        assert_eq!(session.label, Some("New Tab".to_string()));
        assert_eq!(session.status, "active");
    }

    #[tokio::test]
    async fn test_get_active_tab_session_returns_active() {
        let db = create_test_db().await;
        let worktree_id = setup_worktree(&db).await;
        let tab_id = generate_uuid();

        // Create an active session for the tab
        let _session_id = db
            .create_terminal_tab(&tab_id, &worktree_id, Some("Active"), "bash")
            .await
            .expect("Failed to create terminal tab");

        // get_active_tab_session should return the active session
        let active = db
            .get_active_tab_session(&tab_id)
            .await
            .expect("Failed to get active session");
        assert!(active.is_some());
        let active = active.unwrap();
        assert_eq!(active.status, "active");
        assert_eq!(active.tab_id, Some(tab_id.clone()));
    }

    #[tokio::test]
    async fn test_get_active_tab_session_returns_none_when_ended() {
        let db = create_test_db().await;
        let worktree_id = setup_worktree(&db).await;
        let tab_id = generate_uuid();

        // Create a session and then end it
        let session_id = db
            .create_terminal_tab(&tab_id, &worktree_id, Some("To Be Ended"), "bash")
            .await
            .expect("Failed to create terminal tab");

        db.end_tab_session(&session_id, "user_closed")
            .await
            .expect("Failed to end session");

        // get_active_tab_session should return None for an ended session
        let active = db
            .get_active_tab_session(&tab_id)
            .await
            .expect("Failed to query active session");
        assert!(active.is_none(), "Should return None when session is ended");

        // Non-existent tab should also return None
        let nonexistent = db
            .get_active_tab_session(&generate_uuid())
            .await
            .expect("Failed to query nonexistent tab");
        assert!(nonexistent.is_none());
    }

    #[tokio::test]
    async fn test_end_tab_session_updates_status() {
        let db = create_test_db().await;
        let worktree_id = setup_worktree(&db).await;
        let tab_id = generate_uuid();

        // Create a session
        let session_id = db
            .create_terminal_tab(&tab_id, &worktree_id, Some("End Test"), "bash")
            .await
            .expect("Failed to create terminal tab");

        // Verify initial status is active
        let session = db
            .get_terminal_session(&session_id)
            .await
            .expect("Failed to get session")
            .unwrap();
        assert_eq!(session.status, "active");
        assert!(session.ended_at.is_none());
        assert!(session.ended_reason.is_none());

        // End the session
        let result = db
            .end_tab_session(&session_id, "ttl_expired")
            .await
            .expect("Failed to end session");
        assert!(result, "end_tab_session should return true");

        // Verify status and metadata are updated
        let session = db
            .get_terminal_session(&session_id)
            .await
            .expect("Failed to get session")
            .unwrap();
        assert_eq!(session.status, "ended");
        assert_eq!(session.ended_reason, Some("ttl_expired".to_string()));
        assert!(session.ended_at.is_some(), "ended_at should be set");
    }

    #[tokio::test]
    async fn test_list_terminal_tabs_empty_and_with_data() {
        let db = create_test_db().await;

        let worktree_id = generate_uuid();

        // Empty worktree should return no tabs
        let empty = db
            .list_terminal_tabs(&worktree_id)
            .await
            .expect("Failed to list tabs for empty worktree");
        assert!(empty.is_empty(), "Expected empty list for new worktree");

        // Create tabs
        let tab_id_1 = generate_uuid();
        let tab_id_2 = generate_uuid();

        db.create_terminal_tab(&tab_id_1, &worktree_id, Some("Tab 1"), "bash")
            .await
            .expect("Failed to create tab 1");
        db.create_terminal_tab(&tab_id_2, &worktree_id, Some("Tab 2"), "zsh")
            .await
            .expect("Failed to create tab 2");

        // Should now return both tabs
        let tabs = db
            .list_terminal_tabs(&worktree_id)
            .await
            .expect("Failed to list tabs");
        assert_eq!(tabs.len(), 2);

        // Verify tab data
        let tab_ids: Vec<_> = tabs.iter().filter_map(|t| t.tab_id.as_ref()).collect();
        assert!(tab_ids.iter().any(|id| **id == tab_id_1));
        assert!(tab_ids.iter().any(|id| **id == tab_id_2));

        // Different worktree should still be empty
        let other_worktree = generate_uuid();
        let other_tabs = db
            .list_terminal_tabs(&other_worktree)
            .await
            .expect("Failed to list tabs for other worktree");
        assert!(other_tabs.is_empty());
    }

    #[tokio::test]
    async fn test_get_terminal_output_by_tab_multi_session() {
        let db = create_test_db().await;

        let tab_id = generate_uuid();
        let worktree_id = generate_uuid();

        // Create first session and add output
        let session_id_1 = db
            .create_terminal_tab(&tab_id, &worktree_id, Some("Multi Session"), "bash")
            .await
            .expect("Failed to create terminal tab");

        db.append_terminal_output(&session_id_1, "line1\n")
            .await
            .expect("Failed to append output");
        db.append_terminal_output(&session_id_1, "line2\n")
            .await
            .expect("Failed to append output");

        // End first session (simulating TTL expiry)
        db.end_tab_session(&session_id_1, "ttl")
            .await
            .expect("Failed to end session");

        // Create second session for the same tab
        let session_id_2 = generate_uuid();
        let session_2 = TerminalSession {
            id: session_id_2.clone(),
            worktree_id: worktree_id.clone(),
            label: Some("Multi Session".to_string()),
            shell: "bash".to_string(),
            created_at: chrono::Utc::now().to_rfc3339(),
            position: 0,
            tab_id: Some(tab_id.clone()),
            status: "active".to_string(),
            ended_at: None,
            ended_reason: None,
        };
        db.create_terminal_session(&session_2)
            .await
            .expect("Failed to create session 2");

        db.append_terminal_output(&session_id_2, "line3\n")
            .await
            .expect("Failed to append output");

        // Query all output for the tab — should include both sessions
        let output = db
            .get_terminal_output_by_tab(&tab_id, None)
            .await
            .expect("Failed to get output by tab");
        assert_eq!(output.len(), 3);
        assert_eq!(output[0], "line1\n");
        assert_eq!(output[1], "line2\n");
        assert_eq!(output[2], "line3\n");

        // Test with limit
        let limited = db
            .get_terminal_output_by_tab(&tab_id, Some(2))
            .await
            .expect("Failed to get limited output");
        assert_eq!(limited.len(), 2);
    }
}
