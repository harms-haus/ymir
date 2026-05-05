# Vertical Slice Failure Analysis: Missing Sidebar Context Menu

## Root Cause

**The context menu is missing because `WorkspaceTree` and `SidebarPanel` have ZERO context menu integration.** The entire wiring is absent — not broken, not misconfigured, just never connected.

## Trace: Data Flow from Right-Click to Menu Rendering

### Step 1: Sidebar Component (SidebarPanel.tsx)

`SidebarPanel` (line 266) renders `<WorkspaceTree />` with **no props** and **no context menu state**:

```tsx
// SidebarPanel.tsx:266
<WorkspaceTree />
```

There is no `useContextMenu` hook imported or called, no `ContextMenu` component rendered, and no `WorkspaceContextMenu` variant exists anywhere in the codebase.

### Step 2: WorkspaceTree Component (WorkspaceTree.tsx)

`WorkspaceTree` (line 186-197) renders a `<FileTree>` but passes **no `onContextMenu` handler**:

```tsx
// WorkspaceTree.tsx:188-195
<FileTree
  data={treeData}
  onSelect={handleSelect}
  onToggle={handleToggle}
  selection={activeWorktreeId || undefined}
  openByDefault={false}
  initialOpenState={initialOpenState}
/>
// Note: NO onContextMenu prop
```

`WorkspaceTree` does not import `useContextMenu` and does not manage any context menu state.

### Step 3: FileTree Component (FileTree.tsx)

`FileTree` **does** support `onContextMenu` — it accepts it as a prop (line 19), passes it down to the `FileTreeNodeRenderer` (line 196), and the renderer attaches it as an `onContextMenu` handler on each tree row (line 67):

```tsx
// FileTree.tsx:19
onContextMenu?: (e: React.MouseEvent, node: NodeApi<FileTreeNode>) => void;

// FileTree.tsx:67
onContextMenu={handleContextMenu}  // on the row div
```

So the infrastructure is ready and functional — the prop is just never passed in.

### Step 4: ContextMenu Component (ContextMenu.tsx)

The `ContextMenu` component exists and is fully functional. It:
- Accepts a `ContextMenuState` object, an array of `ContextMenuItem[]`, an `onAction` callback, and a `closeMenu` callback.
- Renders using `@base-ui/react/context-menu` primitives.
- Filters menu items based on `targetType` (workspace vs worktree vs tab).

But it is **never rendered inside `SidebarPanel` or `WorkspaceTree`**.

### Step 5: useContextMenu Hook (useContextMenu.ts)

The hook is fully implemented with:
- `openMenu(e, id, type, path?)` — opens the menu at click position
- `closeMenu()` — resets state
- `handleAction(action)` — dispatches the appropriate callback
- Supports all needed callbacks: `onCreateWorktree`, `onDeleteWorktree`, `onChangeBranch`, `onSettings`, etc.

But it is **never imported or called** in `WorkspaceTree.tsx` or `SidebarPanel.tsx`.

## Missing Code Checklist

What should exist but doesn't:

1. **In `SidebarPanel.tsx` or `WorkspaceTree.tsx`**: 
   - `import { useContextMenu } from '../../hooks/useContextMenu'` — **MISSING**
   - `const { state, openMenu, closeMenu, handleAction } = useContextMenu({ ...callbacks })` — **MISSING**
   - `<ContextMenu state={state} items={...} onAction={handleAction} closeMenu={closeMenu} />` — **MISSING**

2. **In `WorkspaceTree.tsx`**:
   - An `onContextMenu` handler that calls `openMenu(e, node.data.id, node.data.type === 'directory' ? 'workspace' : 'worktree', node.data.data?.path)` — **MISSING**
   - Passing `onContextMenu={handleContextMenu}` to `<FileTree>` — **MISSING**

## Conclusion

The context menu infrastructure (`useContextMenu` hook, `ContextMenu` component, `FileTree`'s `onContextMenu` prop support) all exist and work. The bug is simply that `WorkspaceTree` and `SidebarPanel` were never wired up to use them. This is an **omission bug** — the feature was never connected, not that something broke.
