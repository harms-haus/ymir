# Research Synthesis: Workspace Sidebar Context Menu Improvements

## Key Findings

### Codebase Impact

**Existing Infrastructure (Already in place):**
- `WorkspaceTree.tsx` — Already has full context menu wiring with `useContextMenu` hook and `ContextMenu` component
- `useContextMenu.ts` — Already has all action types and callbacks defined (`onRenameWorkspace`, `onRemoveWorkspace`, `onDeleteWorktree`, `onChangeBranch`, `onSettings`)
- `ContextMenu.tsx` — Already filters menu items correctly for workspace vs worktree targets
- `FileTree.tsx` — Already supports `onContextMenu` prop and custom node rendering

**Existing Dialog Components (Not mounted):**
- `WorkspaceSettingsDialog.tsx` — Fully built, supports color/icon/worktree-dir editing, save via WebSocket. Props: `{ open, onOpenChange, workspaceId }`. **NOT MOUNTED** in AppShell or SidebarPanel.
- `ChangeBranchDialog.tsx` — Built with text input for branch name, sends `WorktreeChangeBranch` via WebSocket. Props: `{ open, onOpenChange, worktreeId, currentBranch }`. **NOT MOUNTED** in AppShell or SidebarPanel.

**What Needs to Change:**

| Feature | Current State | Required Change | Files Affected |
|---------|--------------|----------------|----------------|
| Confirm Remove Workspace | `window.confirm()` at line 146 | Replace with Dialog confirmation | `WorkspaceTree.tsx` |
| Confirm Delete Worktree | `window.confirm()` at line 127 | Replace with Dialog confirmation | `WorkspaceTree.tsx` |
| In-Place Rename | `prompt()` at line 140 | Replace with inline edit in tree | `WorkspaceTree.tsx`, `FileTree.tsx` |
| Settings Dialog | `console.log()` + TODO at line 135-137 | Mount + open `WorkspaceSettingsDialog` | `SidebarPanel.tsx` or `AppShell.tsx`, `WorkspaceTree.tsx` |
| Change Branch Dialog | `console.log()` + TODO at line 131-133 | Mount + open `ChangeBranchDialog` | `SidebarPanel.tsx` or `AppShell.tsx`, `WorkspaceTree.tsx` |

### Library Landscape

**Existing dependencies that can be leveraged:**
- `@base-ui/react/dialog` — Already used by 5 dialog components. Props: `open`, `onOpenChange`, `modal`, `disablePointerDismissal`. Sub-components: `Root`, `Portal`, `Backdrop`, `Popup`, `Title`, `Description`, `Close`, `Trigger`, `Viewport`.
- `@base-ui/react/context-menu` — Already used for the sidebar context menu.
- `@base-ui/react/combobox` — Available for the branch picker dropdown.
- `@radix-ui/react-alert-dialog@1.1.15` — In lockfile but not used. Could be used for confirmation dialogs.

**No new libraries needed** — everything required is already available.

### Patterns to Follow

**Dialog Pattern (from 5 existing dialogs):**
```tsx
<Dialog.Root open={open} onOpenChange={onOpenChange}>
  <Dialog.Portal>
    <Dialog.Backdrop style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0, 0, 0, 0.5)', zIndex: 9998 }} />
    <Dialog.Popup style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', ... }}>
      <Dialog.Title>...</Dialog.Title>
      <Dialog.Description>...</Dialog.Description>
      {/* Content */}
    </Dialog.Popup>
  </Dialog.Portal>
</Dialog.Root>
```

**State Management Pattern:**
- Store-level: `workspaceSettingsDialog: { isOpen: false, workspaceId: null }` with setters `setWorkspaceSettingsDialogOpen`, `resetWorkspaceSettingsDialog`
- Component-level: `useState` for form fields, `useRef` for cleanup

**API Pattern:**
- All operations use WebSocket: `client.send({ type: 'MessageType', ... })`
- Async responses via `client.onMessage('ResultType', ...)` with `requestId` correlation
- 30-second timeout for all operations

### Technical Considerations

**Backend Limitation for Change Branch:**
The `change_branch` function in `crates/ws-server/src/git/mod.rs` (line 336) **only supports switching to existing local branches**. It uses:
```rust
repo.find_branch(new_branch_name, BranchType::Local)
```

This means the PROMPT requirements for:
- Remote branches (fetch + checkout tracking)
- Non-existent branch names (create new branch)

**Cannot be fulfilled without backend changes.** Two options:
1. Extend the backend `change_branch` function to handle all three cases
2. Add a `list_branches` endpoint for branch enumeration
3. Both are needed for full PROMPT compliance

**In-Place Rename Implementation:**
- `react-arborist` Tree component supports custom node renderers
- The `FileTreeNodeRenderer` in `FileTree.tsx` renders the name as `<span>{node.data.name}</span>` at line 117
- Can add `renamingId` state and conditionally render `<input>` when the node is being renamed
- Handle blur (save), Enter (save), Escape (cancel)

**WorkspaceSettingsDialog Already Has Delete Confirmation:**
- Lines 652-718 show an inline delete confirmation using `showDeleteConfirm` state
- This could potentially replace the need for a separate "Remove Workspace" confirmation dialog
- However, the PROMPT specifically asks for a confirmation dialog for the context menu "Remove Workspace" action

### Decisions for the Planner

1. **Confirmation Dialogs — Two approaches:**
   - **Option A:** Create dedicated `ConfirmDialog` component (generic) and use for both Remove Workspace and Delete Worktree
   - **Option B:** Use the existing inline confirmation pattern (like WorkspaceSettingsDialog's delete) by keeping the dialogs open and showing inline confirmation
   - **Option C:** Use `@radix-ui/react-alert-dialog` (already in lockfile) for a quick implementation
   - **Recommendation:** Option A — a simple generic ConfirmDialog is most reusable

2. **Dialog Mounting Location:**
   - **Option A:** Mount WorkspaceSettingsDialog and ChangeBranchDialog in `SidebarPanel.tsx` (co-located with sidebar)
   - **Option B:** Mount them in `AppShell.tsx` (central location, analogous to how CreatePRDialog is in ProjectPanel)
   - **Recommendation:** Option B — AppShell is the central layout, making it the right place for global dialogs

3. **Change Branch Dialog — Full vs Partial Implementation:**
   - **Option A:** Only enhance frontend (use existing text input), backend handles only existing local branches (current behavior)
   - **Option B:** Full implementation with backend changes (list_branches, enhanced change_branch)
   - **Recommendation:** Document as requiring backend work; frontend can start with Option A

4. **In-Place Rename — Where to implement:**
   - **Option A:** Modify `FileTree.tsx` to support a `renamingId` prop and inline input
   - **Option B:** Create a separate `InlineRenameInput` component and use `renderRightContent`
   - **Recommendation:** Option A — modifying FileTree is cleaner since it owns the rendering

### Gaps and Uncertainties

1. **No branch listing API exists** — Backend needs `list_branches` endpoint for the branch dropdown/select
2. **Backend `change_branch` doesn't support remote branches or new branch creation** — Needs enhancement
3. **No existing confirmation dialog component** — Must create one
4. **No existing in-place editing pattern** — Must create from scratch
5. **WorkspaceSettingsDialog name field is readOnly** — The PROMPT asks for in-place rename, which is a different UX from the settings dialog's name field
6. **`removeWorkspace` vs `deleteWorkspace`** — The context menu uses `removeWorkspace` (soft removal, sends `WorkspaceRemove`) while the settings dialog uses `WorkspaceDelete` (hard delete via WebSocket). These are semantically different operations.
