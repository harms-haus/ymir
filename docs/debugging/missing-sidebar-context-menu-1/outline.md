# Debug Fix Outline: Missing Sidebar Context Menu

## Root Cause

The context menu on the workspace/worktree sidebar is missing because the entire wiring chain is absent — this is an **omission bug**, not a regression. Three pieces of infrastructure exist but are disconnected:

1. **`useContextMenu` hook** (`hooks/useContextMenu.ts`) — fully implemented with `openMenu`, `closeMenu`, `handleAction`, and callbacks for all workspace/worktree actions
2. **`ContextMenu` component** (`components/ui/ContextMenu.tsx`) — fully functional, renders menu items filtered by target type
3. **`FileTree.onContextMenu` prop** (`components/ui/FileTree.tsx:19`) — accepts and wires `onContextMenu` handlers to each tree row

But **`WorkspaceTree.tsx`** never imports the hook, never calls it, never passes `onContextMenu` to `<FileTree>`, and never renders a `<ContextMenu>` component. **`SidebarPanel.tsx`** also never imports or renders anything related to context menus.

Additionally, `FileTree.tsx` calls `e.preventDefault()` unconditionally in its context menu handler even when no `onContextMenu` callback is provided, making right-click silently do nothing. And `ContextMenu.tsx`'s item filtering logic doesn't cover "Rename workspace" or "Remove workspace" items.

## Changes

### Vertical Slice 1: Wire context menu in WorkspaceTree

This is the primary fix. Follow the working pattern established in `TerminalPane.tsx` (lines 310-321, 431, 462-466) and `AgentPane.tsx` (lines 147-160, 228, 299-303).

1. **Add `useContextMenu` hook and `ContextMenu` rendering to `WorkspaceTree.tsx`** -- `apps/web/src/components/sidebar/WorkspaceTree.tsx`
   - Import `useContextMenu` from `../../hooks/useContextMenu` and `ContextMenu` from `../ui/ContextMenu`
   - Instantiate the hook with callbacks for workspace/worktree actions:
     - `onCreateWorktree` → call `createWorktree(workspaceId, ...)` from `../../lib/api`
     - `onDeleteWorktree` → show confirmation dialog, then call `deleteWorktree(worktreeId)` from `../../lib/api`
     - `onChangeBranch` → placeholder for now (log to console)
     - `onSettings` → open workspace settings (reuse existing dialog mechanism or log)
   - Create a `handleContextMenu` callback that determines target type (`'workspace'` for directories, `'worktree'` for files) and calls `openMenu(e, node.data.id, type, node.data.data?.path as string)`
   - Pass `onContextMenu={handleContextMenu}` to the `<FileTree>` component
   - Define the `ContextMenuItem[]` array with all expected items:
     - `{ id: 'settings', label: 'Edit workspace settings', icon: 'ri-settings-3-line' }`
     - `{ id: 'rename-workspace', label: 'Rename workspace', icon: 'ri-edit-line' }`
     - `{ id: 'create-worktree', label: 'Add worktree', icon: 'ri-folder-add-line' }`
     - `{ id: 'remove-workspace', label: 'Remove workspace', icon: 'ri-folder-remove-line', destructive: true }`
     - `{ id: 'change-branch', label: 'Change branch', icon: 'ri-git-branch-line' }`
     - `{ id: 'delete-worktree', label: 'Delete worktree', icon: 'ri-delete-bin-line', destructive: true }`
   - Render `<ContextMenu state={state} items={menuItems} onAction={handleAction} closeMenu={closeMenu} />` at the bottom of the component
   - Add handlers for the new action types (`rename-workspace`, `remove-workspace`) in the hook callbacks:
     - `rename-workspace` → prompt user, call `renameWorkspace(workspaceId, newName)` from `../../lib/api`
     - `remove-workspace` → call `deleteWorkspace(workspaceId)` from `../../lib/api` (note: the bug spec says "Remove" not "Delete" — use `deleteWorkspace` API which removes from the workspace list)

### Vertical Slice 2: Fix `ContextMenu.tsx` item filtering

The `ContextMenu` component's filtering logic (lines 27-43) doesn't cover the new sidebar menu items.

2. **Update item filtering in `ContextMenu.tsx`** -- `apps/web/src/components/ui/ContextMenu.tsx`
   - The workspace filter (line 28-29) currently only allows `create-worktree` and `settings`. Add `rename-workspace` and `remove-workspace` to the allowed list for `targetType === 'workspace'`
   - The worktree filter (lines 31-38) should allow `change-branch` and `delete-worktree` for worktree targets. Currently it only excludes `create-worktree` and `settings` and conditionally shows `open-in-file-manager`/`copy-path`. This should work as-is for `change-branch` and `delete-worktree` since the filter returns `true` for anything not explicitly excluded. Verify this is correct.
   - Add `rename-workspace` to `ContextMenuAction` type in `useContextMenu.ts` if not already present, and add corresponding callback (`onRenameWorkspace`) to `ContextMenuCallbacks` interface
   - Add `remove-workspace` to `ContextMenuAction` type and `onRemoveWorkspace` callback if not present

### Vertical Slice 3: Fix `FileTree.tsx` unconditional `e.preventDefault()`

3. **Fix `e.preventDefault()` in `FileTree.tsx`** -- `apps/web/src/components/ui/FileTree.tsx`
   - Line 44: `e.preventDefault()` is called unconditionally before checking if `onContextMenu` is provided
   - Change to only call `e.preventDefault()` when `onContextMenu` is defined:
     ```tsx
     const handleContextMenu = (e: React.MouseEvent) => {
       if (onContextMenu) {
         e.preventDefault();
         onContextMenu(e, node);
       }
     };
     ```

## Pitfalls to Avoid

- **Don't put context menu state in SidebarPanel.** The working pattern puts `useContextMenu` in the same component that renders the tree (`WorkspaceTree`), analogous to how `TerminalPane` owns both the tab rendering and context menu. Moving it to `SidebarPanel` would create unnecessary prop drilling.
- **Delete worktree MUST have a confirmation dialog.** The bug spec explicitly requires this. Use `window.confirm()` or the existing dialog pattern. Don't delete without confirmation.
- **"Remove workspace" vs "Delete workspace".** The bug spec says the workspace menu item should say "Remove workspace" (not "Delete"). The underlying API function is `deleteWorkspace` — use that, but label the menu item "Remove workspace" to match the spec.
- **`ContextMenuAction` type union needs updating.** The new actions `rename-workspace` and `remove-workspace` must be added to the `ContextMenuAction` type in `useContextMenu.ts` before they can be used in menu items or `handleAction` switch cases.
- **`handleAction` in `useContextMenu` needs new cases.** The switch statement in `handleAction` must handle `rename-workspace` and `remove-workspace` actions, calling the appropriate callbacks.

## Verification

- Right-click on a workspace node (directory) → context menu appears with: Edit workspace settings, Rename workspace, Add worktree, Remove workspace
- Right-click on a main worktree node (file, first child) → context menu appears with: Change branch
- Right-click on a non-main worktree node (file, subsequent child) → context menu appears with: Change branch, Delete worktree
- Selecting "Delete worktree" → shows confirmation dialog before deleting
- Selecting "Rename workspace" → prompts for new name, workspace is renamed
- Selecting "Remove workspace" → removes the workspace (not a destructive delete)
- Right-clicking on a FileTree in a component that does NOT pass `onContextMenu` → browser's native context menu appears (no longer silently suppressed)
- Existing terminal/agent tab context menus still work (no regression)
