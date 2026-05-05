# Bug Notes: Missing Sidebar Context Menu

## User Report
Context menu has gone missing on the workspace/worktree sidebar.

## Expected Behavior
- **Workspace** context menu items:
  1. Edit workspace settings
  2. Rename workspace
  3. Add worktree
  4. Remove workspace (NOT delete)

- **Main worktree (CWD)** context menu items:
  1. Change branch (placeholder)

- **Other worktrees** context menu items:
  1. Change branch (placeholder)
  2. Delete worktree (removes and deletes the worktree, MUST HAVE confirmation dialog)

## Actual Behavior
Context menu is missing/not appearing on the sidebar.

## Notes
- Bug was filed 2026-05-04
- Need to investigate when this regressed
