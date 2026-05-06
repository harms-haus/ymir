# Workspace Worktree Dialogs and Settings Improvements

## 1. Create Worktree Dialog

Replace the current `alert()`/`prompt()` dialog for creating a worktree with a proper dialog (using baseUI's Dialog system). The dialog should ask the user for:

- **Worktree/Branch name**: A single input field where the value serves as both the branch name and worktree directory name
- **Default agent**: A selector/dropdown (hermes, opencode, claude, etc.)
- **Color**: A color picker/selector
- **Icon**: An icon selector

All values should be auto-populated to match the parent workspace's current settings (agent, color, icon), with the branch/worktree name left empty for user input.

## 2. Workspace Settings — Full Persistence

Make workspace settings work completely. The following values must save and persist with the workspace:

- **Name**: Already exists in settings dialog
- **CWD**: Already exists
- **Color**: Already exists
- **Icon**: Already exists
- **Agent**: NEW — must be added to the dialog UI. This is a default agent that all worktrees inherit, but each worktree can override with its own agent setting.

All settings must be saved via WebSocket and persisted in the database.

## 3. Worktree Settings Dialog

Create a proper worktree settings dialog that supports:

- **Icon**: Selectable
- **Color**: Selectable
- **Agent**: Selectable (hermes, opencode, claude, etc.)
- **Name/Branch/Directory**: Read-only (set at creation, not changeable later)

Default values should be inherited from the workspace's settings. Worktree settings must also persist in the database (save, retrieve, update).

The worktree's context menu should have an "Edit Settings" item that opens this dialog.
