# Workspace Sidebar Context Menu Improvements

Implement four dialog-based interactions for the workspace sidebar's context menu:

## 1. Confirm Removal / Delete Dialogs

- **Workspace**: Replace `alert()` with a proper confirmation dialog (using baseUI's Dialog system) for "Remove Workspace" action.
- **Worktree**: Replace `alert()` with a proper confirmation dialog for "Delete Worktree" action.
- Both dialogs should have clear messaging, cancel/confirm buttons, and styled appropriately per baseUI conventions.

## 2. In-Place Rename Flow

- Replace `alert()`-based rename with an in-place rename UI on the workspace name in the sidebar tree.
- The workspace name should become editable inline (like a text input replacing the label).
- On blur or Enter key, save the rename. On Escape, cancel.
- No alert dialogs for this flow.

## 3. Workspace Settings Dialog

- Find the existing workspace settings dialog component (if it exists).
- Hook up the "Edit" / "Settings" button on the context menu to open this dialog.
- If no such dialog exists, create one using baseUI's Dialog system with appropriate settings fields.

## 4. Change Branch Dialog

- Replace any existing branch-changing mechanism with a proper dialog popup (using baseUI's Dialog system).
- Dialog should contain a select/dropdown showing all branches in the repository.
- Must support:
  - Local branches
  - Remote branches (that don't exist locally yet) — selecting one should `git fetch` + `git checkout -b <branch> origin/<branch>`
  - Non-existent branch names — creating a new branch and checking it out
- Saving the selection should execute the appropriate git commands to change the branch on disk.
