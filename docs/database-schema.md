# Database Schema

Source of truth: `ymir-core/migrations/001_initial_schema.sql`.

The schema is SQLite/libSQL compatible and is applied by `MigrationRunner` during server startup.

## Overview

Tables:

- `workspaces`
- `panes`
- `tabs`
- `pty_sessions`
- `scrollback_chunks`
- `git_repos`
- `git_files`
- `settings`
- `_migrations`

Foreign keys are enabled with `PRAGMA foreign_keys = ON`.

## Entity Relationships

- One workspace has many panes
- One pane has many tabs
- One tab has one PTY session (`pty_sessions.tab_id` is `UNIQUE`)
- One tab has many scrollback chunks
- One git repo has many git file rows

Cascade deletes:

- Deleting a workspace deletes its panes and tabs
- Deleting a tab deletes `pty_sessions` and `scrollback_chunks` rows for that tab
- Deleting a git repo deletes `git_files` rows for that repo

## Table Notes

### `workspaces`

- Primary key: `id` (`TEXT`)
- Core fields: `name`, `created_at`, `updated_at`
- Index: `idx_workspaces_created`

### `panes`

- Primary key: `id` (`TEXT`)
- FK: `workspace_id -> workspaces(id)`
- Layout field: `flex_ratio` (`REAL`, default `1.0`)
- Index: `idx_panes_workspace`

### `tabs`

- Primary key: `id` (`TEXT`)
- FKs: `workspace_id -> workspaces(id)`, `pane_id -> panes(id)`
- Fields: `title`, `cwd`, `has_notification`, `notification_count`, `notification_text`, `created_at`
- Indexes: `idx_tabs_pane`, `idx_tabs_workspace`

### `pty_sessions`

- Primary key: `id` (`TEXT`)
- FK: `tab_id -> tabs(id)` with `UNIQUE` constraint
- Fields: `pid`, `cwd`, `created_at`
- Index: `idx_pty_sessions_tab`

### `scrollback_chunks`

- Primary key: `id` (`INTEGER AUTOINCREMENT`)
- FK: `tab_id -> tabs(id)`
- Fields: `chunk_number`, `content` (JSON text), `line_count`, `created_at`
- Uniqueness: `(tab_id, chunk_number)`
- Indexes: `idx_scrollback_tab`, `idx_scrollback_chunk_num`

### `git_repos`

- Primary key: `id` (`INTEGER AUTOINCREMENT`)
- Unique: `path`
- Fields: `branch`, `staged_count`, `unstaged_count`, `last_poll_at`, `created_at`
- Indexes: `idx_git_repos_path`, `idx_git_repos_poll`

### `git_files`

- Primary key: `id` (`INTEGER AUTOINCREMENT`)
- FK: `repo_id -> git_repos(id)`
- Fields: `path`, `status` (`staged` or `unstaged`), `file_status`
- Uniqueness: `(repo_id, path, status)`
- Indexes: `idx_git_files_repo`, `idx_git_files_path`, `idx_git_files_status`

### `settings`

- Primary key: `key` (`TEXT`)
- Field: `value` (`TEXT`)
- Metadata: `updated_at`

### `_migrations`

- Internal migration tracking table
- Current initial row: version `1`, name `001_initial_schema`

## Operational Notes

- `tab.close` handler relies on cascade behavior from `tabs` to `pty_sessions` and `scrollback_chunks`
- Schema includes git cache tables even when git polling is optional
- UI theme selection is not persisted in this DB, it is stored in browser `localStorage`
