-- Migration: Add workspace settings columns
-- Version: 2

-- Enable foreign key support (SQLite/libSQL specific)
PRAGMA foreign_keys = ON;

-- ============================================================================
-- WORKSPACES - ADD SETTINGS COLUMNS
-- ============================================================================
-- Add workspace customization columns for color, icon, working directory, and subtitle

ALTER TABLE workspaces ADD COLUMN color TEXT;
ALTER TABLE workspaces ADD COLUMN icon TEXT;
ALTER TABLE workspaces ADD COLUMN working_directory TEXT;
ALTER TABLE workspaces ADD COLUMN subtitle TEXT;

-- Index for color-based queries (workspace filtering by color)
CREATE INDEX idx_workspaces_color ON workspaces(color);

-- ============================================================================
-- MIGRATION TRACKING
-- ============================================================================

INSERT INTO _migrations (version, name) VALUES (2, '002_workspace_settings');
