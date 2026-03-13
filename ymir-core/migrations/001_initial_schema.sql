-- Ymir Database Schema - Initial Migration
-- This schema supports the WebSocket-based core service with Turso/libSQL
-- Tables: workspaces, panes, tabs, pty_sessions, scrollback_chunks, git_repos, git_files, settings

-- Enable foreign key support (SQLite/libSQL specific)
PRAGMA foreign_keys = ON;

-- ============================================================================
-- WORKSPACES
-- ============================================================================
-- Stores workspace information. Each workspace can have multiple panes.
CREATE TABLE workspaces (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Index for workspace listing by creation time
CREATE INDEX idx_workspaces_created ON workspaces(created_at);

-- ============================================================================
-- PANES
-- ============================================================================
-- Stores pane information. Simplified structure - no tree structure.
-- Each pane belongs to a workspace and can have multiple tabs.
CREATE TABLE panes (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL,
    flex_ratio REAL DEFAULT 1.0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
);

-- Index for panes by workspace (common query pattern)
CREATE INDEX idx_panes_workspace ON panes(workspace_id);

-- ============================================================================
-- TABS
-- ============================================================================
-- Stores tab information. Each tab belongs to a pane and workspace.
-- 1:1 relationship with pty_sessions (enforced via UNIQUE constraint in pty_sessions).
CREATE TABLE tabs (
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
);

-- Index for tabs by pane (common query pattern)
CREATE INDEX idx_tabs_pane ON tabs(pane_id);

-- Index for tabs by workspace
CREATE INDEX idx_tabs_workspace ON tabs(workspace_id);

-- ============================================================================
-- PTY_SESSIONS
-- ============================================================================
-- Stores PTY session information. 1:1 relationship with tabs.
-- tab_id has UNIQUE constraint to enforce one session per tab.
CREATE TABLE pty_sessions (
    id TEXT PRIMARY KEY,
    tab_id TEXT NOT NULL UNIQUE,
    pid INTEGER,
    cwd TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (tab_id) REFERENCES tabs(id) ON DELETE CASCADE
);

-- Index for PTY session lookup by tab
CREATE INDEX idx_pty_sessions_tab ON pty_sessions(tab_id);

-- ============================================================================
-- SCROLLBACK_CHUNKS
-- ============================================================================
-- Stores terminal scrollback in chunks for efficient retrieval and cleanup.
-- Each chunk contains up to 1000 lines (configurable at application level).
-- Content stored as JSON array of lines.
-- Unique constraint on (tab_id, chunk_number) for idempotent writes.
CREATE TABLE scrollback_chunks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tab_id TEXT NOT NULL,
    chunk_number INTEGER NOT NULL,
    content TEXT NOT NULL,           -- JSON array of scrollback lines
    line_count INTEGER NOT NULL,     -- Number of lines in this chunk
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (tab_id) REFERENCES tabs(id) ON DELETE CASCADE,
    UNIQUE(tab_id, chunk_number)
);

-- Primary index for scrollback retrieval: by tab and chunk number
CREATE INDEX idx_scrollback_tab ON scrollback_chunks(tab_id, chunk_number);

-- Index for chunk cleanup queries
CREATE INDEX idx_scrollback_chunk_num ON scrollback_chunks(chunk_number);

-- ============================================================================
-- GIT_REPOS
-- ============================================================================
-- Stores git repository information for tracking status.
-- Path is unique to prevent duplicate entries for the same repo.
CREATE TABLE git_repos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    path TEXT UNIQUE NOT NULL,
    branch TEXT,
    staged_count INTEGER DEFAULT 0,
    unstaged_count INTEGER DEFAULT 0,
    last_poll_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Index for repo lookup by path (common query pattern)
CREATE INDEX idx_git_repos_path ON git_repos(path);

-- Index for polling queries
CREATE INDEX idx_git_repos_poll ON git_repos(last_poll_at);

-- ============================================================================
-- GIT_FILES
-- ============================================================================
-- Stores file status within git repositories.
-- Supports both staged and unstaged files with their git status.
-- Unique constraint prevents duplicate entries for same file+status.
CREATE TABLE git_files (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    repo_id INTEGER NOT NULL,
    path TEXT NOT NULL,
    status TEXT NOT NULL,            -- 'staged' or 'unstaged'
    file_status TEXT,                -- 'modified', 'added', 'deleted', 'renamed', 'untracked', etc.
    FOREIGN KEY (repo_id) REFERENCES git_repos(id) ON DELETE CASCADE,
    UNIQUE(repo_id, path, status)
);

-- Primary index for git files by repository (common query pattern)
CREATE INDEX idx_git_files_repo ON git_files(repo_id);

-- Index for file path lookups
CREATE INDEX idx_git_files_path ON git_files(path);

-- Index for status filtering
CREATE INDEX idx_git_files_status ON git_files(status);

-- ============================================================================
-- SETTINGS
-- ============================================================================
-- Stores user preferences and application settings.
-- Simple key-value store with automatic timestamp tracking.
CREATE TABLE settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- MIGRATION TRACKING
-- ============================================================================
-- Internal table to track applied migrations.
-- Used by the migration runner to determine which migrations to apply.
CREATE TABLE _migrations (
    version INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Insert record for this migration
INSERT INTO _migrations (version, name) VALUES (1, '001_initial_schema');
