# Outline: Workspace Sidebar Context Menu Improvements

## Core Thesis

Replace all browser-native `alert()`, `prompt()`, and `console.log()` placeholder calls in the workspace sidebar context menu with proper, accessible dialog-driven interactions using baseUI components. This proves that a polished, user-friendly context menu experience can be achieved by mounting existing but unused dialog components, creating a reusable confirmation dialog, and enhancing the change-branch flow with full backend support for listing and switching branches.

## Phase 1: Prototype (Vertical Slice) — ConfirmDialog + Remove Workspace

This vertical slice proves the thesis by replacing one `window.confirm()` call with a proper dialog, establishing the reusable ConfirmDialog pattern that will be used for both destructive actions.

### Task 1: Create ConfirmDialog Component
Create a generic, reusable confirmation dialog component using `@base-ui/react/dialog`. It should accept title, description, confirm/cancel labels, and an `onConfirm` callback. Follow the established dialog pattern (Backdrop + Popup + Title + Description + Buttons) used by all 5 existing dialogs in the codebase. The confirm button should support a `destructive` variant for dangerous actions.
Dependencies: none

### Task 2: Wire Up Remove Workspace Action
Replace the `window.confirm()` call in `WorkspaceTree.tsx` for the "Remove Workspace" context menu action. Use the new ConfirmDialog with destructive styling. The action should trigger `removeWorkspace` (soft removal via `WorkspaceRemove` WebSocket message), distinct from `deleteWorkspace` (hard removal via `WorkspaceDelete`).
Dependencies: Task 1

### Task 3: Wire Up Delete Worktree Action
Replace the `window.confirm()` call for "Delete Worktree" in `WorkspaceTree.tsx`. Reuse the ConfirmDialog component from Task 1 with destructive styling. This validates the reusability of the ConfirmDialog pattern.
Dependencies: Task 1
Can run parallel with: Task 2

## Phase 2: Horizontal Expansion — Dialog Mounting & Settings

Mount the two existing but unmounted dialog components and wire them to their respective context menu actions.

### Task 4: Mount WorkspaceSettingsDialog in AppShell
Mount the existing `WorkspaceSettingsDialog` component in `AppShell.tsx`, connected to the store's `workspaceSettingsDialog` state. This follows the same pattern as `CreatePRDialog` mounted in `ProjectPanel`. The dialog already supports color, icon, and worktree directory editing with save via WebSocket, and has inline delete confirmation.
Dependencies: none (can start in parallel with Phase 1)

### Task 5: Wire Up Settings Context Menu Action
Replace the `console.log()` placeholder for "Edit workspace settings" in `WorkspaceTree.tsx` with a call to open the `WorkspaceSettingsDialog` via the store setter (`setWorkspaceSettingsDialogOpen`).
Dependencies: Task 4

### Task 6: Mount ChangeBranchDialog in AppShell
Mount the existing `ChangeBranchDialog` component in `AppShell.tsx`, connected to the store's `changeBranchDialog` state. The dialog currently uses a plain text input; it will be enhanced later with a combobox for branch selection.
Dependencies: none (can start in parallel with Phase 1)

### Task 7: Wire Up Change Branch Context Menu Action (Frontend)
Replace the `console.log()` placeholder for "Change branch" in `WorkspaceTree.tsx` with a call to open the `ChangeBranchDialog` via the store setter. Pass the worktree ID and current branch name.
Dependencies: Task 6

## Phase 3: In-Place Rename

Replace the `prompt()`-based rename flow with an inline editing experience directly in the workspace tree.

### Task 8: Add Renaming State to FileTree
Extend `FileTree.tsx` to support a `renamingId` prop (or internal state) that tracks which tree node is currently being renamed. When a node is in renaming mode, conditionally render an `<input>` element instead of the `<span>` that displays the node name.
Dependencies: none (can start in parallel with Phase 2)

### Task 9: Wire Up In-Place Rename Interaction
In `WorkspaceTree.tsx`, replace the `prompt()` call for "Rename workspace" with logic that sets the `renamingId` on the target node. Handle keyboard events: Enter saves (calls `renameWorkspace` API), Escape cancels, blur saves on focus loss. The rename should be persisted via the `WorkspaceRename` WebSocket message.
Dependencies: Task 8

## Phase 4: Change Branch — Full Backend + Frontend

This is the most complex feature, requiring backend changes to support branch listing and enhanced branch switching, plus a combobox-based frontend UI.

### Task 10: Add list_branches Backend Endpoint
Add a new backend endpoint (WebSocket message handler) in `crates/ws-server/src/git/mod.rs` that lists all branches for a given repository. Use `git2::Repository::branches()` for local branches and `git2::Repository::branches(BranchType::Remote)` for remote branches. Return branch names with metadata (local/remote, current, tracking info). Also add the corresponding protocol message types in `apps/web/src/types/protocol.ts`.
Dependencies: none (can start in parallel with Phase 1-3)

### Task 11: Enhance change_branch Backend Function
Extend the existing `change_branch` function in `crates/ws-server/src/git/mod.rs` (line 336) to handle three cases: (1) existing local branch — current behavior, (2) remote branch that doesn't exist locally — fetch and create tracking branch, (3) non-existent branch — create new branch from HEAD. Use `git2` crate's `BranchType` enum and repository operations.
Dependencies: Task 10

### Task 12: Add list_branches Frontend API
Add a frontend API function in `apps/web/src/lib/api.ts` that sends a `GitListBranches` WebSocket message and listens for the response. Add corresponding types in the protocol types file. This provides the data layer for the branch combobox.
Dependencies: Task 10 (backend endpoint must exist)

### Task 13: Enhance ChangeBranchDialog with Combobox
Replace the plain text input in `ChangeBranchDialog.tsx` with a branch selection UI using `@base-ui/react/combobox`. The combobox should display all local and remote branches (fetched via the new `list_branches` API), support filtering/search, and allow entering a new branch name. Visual indicators should distinguish local branches, remote branches, and the current branch.
Dependencies: Task 12

## Phase 5: Cleanup & Polish

Final integration work to ensure everything works together seamlessly.

### Task 14: Remove All Legacy alert/prompt/console.log Calls
Audit `WorkspaceTree.tsx` to confirm all 5 legacy calls (2x `window.confirm`, 1x `prompt`, 2x `console.log`) have been replaced. Remove the `onCreateWorktree` `prompt()` only if it falls within scope; otherwise leave it as-is since the PROMPT doesn't cover it.
Dependencies: Tasks 2, 3, 5, 7, 9

### Task 15: Verify WorkspaceSettingsDialog Delete vs Remove Semantics
Ensure the WorkspaceSettingsDialog's existing inline delete confirmation uses `WorkspaceDelete` (hard delete) while the context menu's Remove Workspace action uses `WorkspaceRemove` (soft removal). Confirm these two different operations are clearly differentiated in the UI messaging.
Dependencies: Tasks 2, 5

## Expected Outcomes

### Features to Complete
- Generic ConfirmDialog component for destructive action confirmations
- WorkspaceSettingsDialog mounted and accessible from context menu
- ChangeBranchDialog mounted with combobox-based branch picker (local + remote branches)
- In-place rename for workspace names in the tree UI
- Backend `list_branches` endpoint for branch enumeration
- Enhanced `change_branch` supporting remote branches and new branch creation
- All 5 alert/prompt/console.log calls replaced with proper UI

### Required Refactorings
- **FileTree.tsx**: Add `renamingId` state/prop and conditional inline input rendering in the node renderer — this establishes a reusable pattern for future in-place editing needs
- **WorkspaceTree.tsx**: Refactor context menu callbacks from inline `alert`/`prompt`/`console.log` to store-based dialog open calls and state-driven rename flow

### Pitfalls to Avoid
- **WorkspaceRemove vs WorkspaceDelete**: These are semantically different operations (soft removal from sidebar vs hard deletion from disk). Don't conflate them — the context menu uses Remove (soft), the settings dialog uses Delete (hard).
- **Backend change_branch limitation**: The current implementation only finds existing local branches. Without the backend enhancement (Task 11), selecting remote or new branches will silently fail.
- **Dialog mounting**: Ensure dialogs are mounted in `AppShell.tsx` (central layout), not `SidebarPanel.tsx`, to avoid rendering issues and follow the established pattern (CreatePRDialog in ProjectPanel).
- **Combobox vs Select**: Use `@base-ui/react/combobox` not `@base-ui/react/select` — the combobox supports both selecting from a list and entering a new branch name, which is required by the PROMPT.
- **react-arborist custom rendering**: The in-place rename must work within `react-arborist`'s rendering pipeline — don't break the existing tree behavior (expand/collapse, drag-and-drop).

### Excluded Scope
- **Create Worktree prompt**: The `prompt('Enter branch name for new worktree:')` in the `onCreateWorktree` callback is NOT in the PROMPT scope. Leave as-is.
- **Tab context menu actions**: Actions like close/close-right/close-left/close-others for agent/terminal tabs are NOT in scope.
- **Merge/View Diff context menu actions**: These worktree actions already have their own dialog implementations (MergeDialog) and are outside this plan's scope.
- **Workspace name editing in SettingsDialog**: The settings dialog intentionally shows the name as read-only with "Name editing is not supported" — in-place rename is the designated UX for renaming, handled separately in the tree.

## Dependency & Parallelism Summary

```
Phase 1 (Prototype):
  Task 1 (ConfirmDialog) → Task 2 (Remove Workspace)
                      ↘→ Task 3 (Delete Worktree)
  [Task 2 and Task 3 can run in parallel]

Phase 2 (Dialog Mounting):
  Task 4 (Mount SettingsDialog) → Task 5 (Wire Settings Action)
  Task 6 (Mount ChangeBranchDialog) → Task 7 (Wire Change Branch Action)
  [Phase 2 can run in parallel with Phase 1]
  [Task 4/5 and Task 6/7 can run in parallel with each other]

Phase 3 (In-Place Rename):
  Task 8 (FileTree renaming state) → Task 9 (Wire Rename Interaction)
  [Phase 3 can run in parallel with Phases 1 and 2]

Phase 4 (Change Branch Full):
  Task 10 (Backend list_branches) → Task 11 (Enhance change_branch)
                               ↘→ Task 12 (Frontend list_branches API) → Task 13 (Combobox UI)
  [Task 10 can start in parallel with Phases 1-3]
  [Task 11 and Task 12 can run in parallel after Task 10]

Phase 5 (Cleanup):
  Task 14 (Remove legacy calls) — blocked by Tasks 2, 3, 5, 7, 9
  Task 15 (Verify delete/remove semantics) — blocked by Tasks 2, 5
```

## Recommended Parallel Execution Groups

| Group | Tasks | Prerequisites |
|-------|-------|---------------|
| A | Task 1, Task 4, Task 6, Task 8, Task 10 | None — all can start immediately |
| B | Task 2, Task 3, Task 5, Task 7 | Group A (specific tasks) |
| C | Task 9 | Task 8 (Group A) |
| D | Task 11, Task 12 | Task 10 (Group A) |
| E | Task 13 | Task 12 (Group D) |
| F | Task 14, Task 15 | All preceding tasks |
