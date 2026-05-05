# Synthesis: Missing Sidebar Context Menu

## Executive Summary

The context menu on the workspace/worktree sidebar is missing because **the entire wiring chain is absent**. This is an **omission bug** — the feature was never connected, not a regression.

## Root Cause

Three pieces of infrastructure exist but are disconnected:

1. **`useContextMenu` hook** (`hooks/useContextMenu.ts`) — fully implemented with `openMenu`, `closeMenu`, `handleAction`, and callbacks for all workspace/worktree actions
2. **`ContextMenu` component** (`components/ui/ContextMenu.tsx`) — fully implemented, renders menu items, filters by target type
3. **`FileTree.onContextMenu` prop** (`components/ui/FileTree.tsx:19`) — accepts and wires `onContextMenu` handlers to each tree row

But **`WorkspaceTree.tsx`** and **`SidebarPanel.tsx`**:
- ❌ Never import `useContextMenu`
- ❌ Never instantiate the hook
- ❌ Never pass `onContextMenu` to `FileTree`
- ❌ Never render a `ContextMenu` component

## The Complete Missing Chain

```
User right-clicks
  → FileTree row catches event (on line 67 of FileTree.tsx)
  → e.preventDefault() fires (native menu blocked)
  → handleContextMenu calls onContextMenu?.(e, node)
  → onContextMenu is undefined → nothing happens
  → No context menu state is set → ContextMenu never renders
```

## Working Pattern (from TerminalPane/AgentPane)

```tsx
// 1. Import
import { useContextMenu } from '../../hooks/useContextMenu';
import { ContextMenu } from '../ui/ContextMenu';

// 2. Instantiate hook with callbacks
const { state, openMenu, closeMenu, handleAction } = useContextMenu({
  onCreateWorktree: (id) => { /* ... */ },
  onDeleteWorktree: (id) => { /* ... */ },
  onChangeBranch: (id) => { /* ... */ },
  onSettings: (id) => { /* ... */ },
});

// 3. Create onContextMenu handler
const handleContextMenu = useCallback((e: React.MouseEvent, node: NodeApi<FileTreeNode>) => {
  const type = node.data.type === 'directory' ? 'workspace' : 'worktree';
  openMenu(e, node.data.id, type, node.data.data?.path as string);
}, [openMenu]);

// 4. Pass to FileTree
<FileTree onContextMenu={handleContextMenu} ... />

// 5. Render menu component
<ContextMenu state={state} items={menuItems} onAction={handleAction} closeMenu={closeMenu} />
```

## Secondary Issue: Silent Right-Click

`FileTree.tsx:44` calls `e.preventDefault()` unconditionally, even when no `onContextMenu` callback is provided. This means:
- Right-click does nothing visible (no native menu, no custom menu)
- Users see no feedback that anything happened

This should be fixed by only calling `e.preventDefault()` when `onContextMenu` is provided.

## Secondary Issue: Menu Item Coverage

The `ContextMenu` component's current item filtering (`ContextMenu.tsx:27-43`) doesn't match the expected menu items:

| Expected | Supported by current code |
|----------|--------------------------|
| Workspace: Edit workspace settings | `settings` ✅ |
| Workspace: Rename workspace | ❌ Missing |
| Workspace: Add worktree | `create-worktree` ✅ |
| Workspace: Remove workspace | ❌ Missing |
| Main worktree: Change branch | `change-branch` ✅ (callback exists, no menu item defined) |
| Other worktree: Change branch | `change-branch` ✅ |
| Other worktree: Delete worktree | `delete-worktree` ✅ |

The `ContextMenu` component needs new menu items and filtering logic to match the expected behavior.

## Files to Modify

1. **`components/sidebar/WorkspaceTree.tsx`** — Add `useContextMenu` hook, create `handleContextMenu` callback, pass to `FileTree`, render `ContextMenu`
2. **`components/sidebar/SidebarPanel.tsx`** — Or handle context menu here (decide whether logic belongs in WorkspaceTree or SidebarPanel)
3. **`components/ui/ContextMenu.tsx`** — Add missing menu items (Rename workspace, Remove workspace, Change branch), fix item filtering logic
4. **`components/ui/FileTree.tsx`** — Fix: only call `e.preventDefault()` when `onContextMenu` is provided

## Files Read (No Changes Made)

- `apps/web/src/components/sidebar/WorkspaceTree.tsx`
- `apps/web/src/components/sidebar/SidebarPanel.tsx`
- `apps/web/src/components/ui/ContextMenu.tsx`
- `apps/web/src/components/ui/TabContextMenu.tsx`
- `apps/web/src/components/ui/FileTree.tsx`
- `apps/web/src/hooks/useContextMenu.ts`
- `apps/web/src/components/project/AllFilesTab.tsx`
- `apps/web/src/components/terminal/TerminalPane.tsx`
- `apps/web/src/components/agent/AgentPane.tsx`
