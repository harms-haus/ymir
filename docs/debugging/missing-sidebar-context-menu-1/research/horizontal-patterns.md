# Horizontal Pattern Search: Working Context Menu Implementations

## Working Context Menu Pattern (TerminalPane / AgentPane)

Both `TerminalPane.tsx` and `AgentPane.tsx` implement context menus using an identical pattern. Here is the working blueprint:

### 1. Import the hook and menu component

```tsx
// TerminalPane.tsx:12-13
import { useContextMenu } from '../../hooks/useContextMenu';
import { TabContextMenu } from '../ui/TabContextMenu';
```

### 2. Instantiate the hook with callbacks

```tsx
// TerminalPane.tsx:310-317
const { state: contextMenuState, openMenu, closeMenu, handleAction } = useContextMenu({
  onClose: (tabId: string) => handleCloseTab(tabId),
  onCloseRight: (tabId: string) => handleCloseRight(tabId),
  onCloseLeft: (tabId: string) => handleCloseLeft(tabId),
  onCloseOthers: (tabId: string) => handleCloseOthers(tabId),
});
```

### 3. Wire `openMenu` to the tab component's `onContextMenu` prop

```tsx
// TerminalPane.tsx:431
onContextMenu={openMenu}
```

The tab component internally calls it as:
```tsx
// TerminalPane.tsx:548
onContextMenu={(e) => onContextMenu(e, tab.id, 'terminal-tab')}
```

### 4. Render the ContextMenu component at the bottom

```tsx
// TerminalPane.tsx:462-465
<TabContextMenu
  state={contextMenuState}
  onAction={handleAction}
  closeMenu={closeMenu}
/>
```

## Contrast: Sidebar Implementation (WorkspaceTree / SidebarPanel)

### SidebarPanel.tsx — Missing Everything

| Step | TerminalPane (WORKING) | SidebarPanel (BROKEN) |
|------|----------------------|----------------------|
| Import hook | `import { useContextMenu }` | ❌ Not imported |
| Import menu component | `import { TabContextMenu }` | ❌ Not imported |
| Hook instantiation | `useContextMenu({...})` | ❌ Never called |
| Wire openMenu | `onContextMenu={openMenu}` | ❌ Never wired |
| Render menu | `<TabContextMenu ... />` | ❌ Never rendered |

### WorkspaceTree.tsx — Missing onContextMenu on FileTree

`WorkspaceTree` renders `<FileTree>` with 6 props (`data`, `onSelect`, `onToggle`, `selection`, `onToggle`, `openByDefault`, `initialOpenState`) but **no `onContextMenu`**.

Compare to `AllFilesTab.tsx` which does wire it up:

```tsx
// AllFilesTab.tsx:329-333
<FileTree
  data={treeData}
  onActivate={handleEdit}
  onContextMenu={handleContextMenu}  // ✅ wired (though just logs)
  onToggle={handleToggle}
  openByDefault={false}
  ...
/>
```

Note: `AllFilesTab`'s `handleContextMenu` is a stub (`console.log`), but at least the wiring exists.

## Context Menu Item Definitions

The `ContextMenu` component (`ContextMenu.tsx:27-43`) filters items based on `targetType`:

- **Workspace** target → shows: `create-worktree`, `settings`
- **Worktree** target → excludes `create-worktree`/`settings`, conditionally shows `open-in-file-manager`/`copy-path` only if `targetPath` is set
- **Tab** target → shows: `rename`, `close`, `close-right`, `close-left`, `close-others`

### Expected Sidebar Menu Items (per bug description)

| Target | Expected Items | Supported by ContextMenu? |
|--------|---------------|--------------------------|
| Workspace | Edit workspace settings, Rename workspace, Add worktree, Remove workspace | Partial — only `create-worktree` and `settings` currently supported. Missing: "Rename workspace", "Remove workspace" |
| Main worktree (CWD) | Change branch | Supported — `change-branch` callback exists |
| Other worktrees | Change branch, Delete worktree (with confirmation) | Supported — both `change-branch` and `delete-worktree` callbacks exist |

**Secondary finding**: Even if the wiring were added, the `ContextMenu` component's item filtering logic doesn't match the expected items. The `ContextMenu` component doesn't have menu items for "Rename workspace" or "Remove workspace". It only filters on `create-worktree` and `settings` for workspace targets.

## Available Context Menu Components

| Component | Location | Purpose |
|-----------|----------|---------|
| `ContextMenu` | `components/ui/ContextMenu.tsx` | Generic context menu with dynamic items |
| `TabContextMenu` | `components/ui/TabContextMenu.tsx` | Specialized for agent/terminal tabs |
| (none) | — | **No `WorkspaceContextMenu` exists** |

The working pattern requires a menu component that passes the appropriate `items` array. `TabContextMenu` hardcodes tab items. A new `WorkspaceContextMenu` (or inline items in `SidebarPanel`) would be needed.

## FileTree onContextMenu Prop

The `FileTree` component already supports `onContextMenu` as a prop (line 19 in `FileTree.tsx`), so no changes are needed there. The prop signature is:

```tsx
onContextMenu?: (e: React.MouseEvent, node: NodeApi<FileTreeNode>) => void;
```

This is exactly what `useContextMenu.openMenu` can handle with a small adapter.
