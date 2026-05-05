# Vertical Slices: Workspace Sidebar Context Menu Improvements

## 1. Workspace Sidebar Component (`WorkspaceTree.tsx`)

**File:** `apps/web/src/components/sidebar/WorkspaceTree.tsx`

### Component Structure
- Uses `react-arborist`'s `Tree` via a wrapper `FileTree` component
- Renders workspace directories (type: 'directory') and worktree files (type: 'file')
- Already has full context menu wiring via `useContextMenu` hook and `ContextMenu` component

### Context Menu Actions (lines 119-151)
```typescript
const { state: contextMenuState, openMenu, closeMenu, handleAction } = useContextMenu({
    onCreateWorktree: (workspaceId: string) => {
      const branchName = prompt('Enter branch name for new worktree:');
      if (branchName && branchName.trim()) {
        createWorktree(workspaceId, branchName.trim());
      }
    },
    onDeleteWorktree: (worktreeId: string) => {
      if (window.confirm('Are you sure you want to delete this worktree?')) {
        deleteWorktree(worktreeId);
      }
    },
    onChangeBranch: (worktreeId: string) => {
      console.log('Change branch for worktree:', worktreeId);
      // TODO: Implement branch change dialog
    },
    onSettings: (workspaceId: string) => {
      console.log('Open settings for workspace:', workspaceId);
      // TODO: Open workspace settings dialog
    },
    onRenameWorkspace: (workspaceId: string) => {
      const newName = prompt('Enter new workspace name:');
      if (newName && newName.trim()) {
        renameWorkspace(workspaceId, newName.trim());
      }
    },
    onRemoveWorkspace: (workspaceId: string) => {
      if (window.confirm('Are you sure you want to remove this workspace?')) {
        useStore.getState().removeWorkspace(workspaceId);
        removeWorkspace(workspaceId);
      }
    },
  });
```

### Alert/Prompt Calls to Replace
| Line | Action | Current Implementation | Required Replacement |
|------|--------|----------------------|---------------------|
| 121 | Create worktree | `prompt('Enter branch name...')` | Keep as-is (not in PROMPT scope) |
| 127 | Delete worktree | `window.confirm('Are you sure...')` | Replace with Dialog confirmation |
| 131-133 | Change branch | `console.log` + TODO | Replace with ChangeBranchDialog |
| 135-137 | Settings | `console.log` + TODO | Wire up WorkspaceSettingsDialog |
| 140-141 | Rename workspace | `prompt('Enter new workspace name:')` | Replace with in-place rename in tree |
| 146-147 | Remove workspace | `window.confirm('Are you sure...')` | Replace with Dialog confirmation |

### Menu Items (lines 162-169)
```typescript
const menuItems: ContextMenuItem[] = [
    { id: 'settings', label: 'Edit workspace settings', icon: 'ri-settings-3-line' },
    { id: 'rename-workspace', label: 'Rename workspace', icon: 'ri-edit-line' },
    { id: 'create-worktree', label: 'Add worktree', icon: 'ri-folder-add-line' },
    { id: 'remove-workspace', label: 'Remove workspace', icon: 'ri-folder-remove-line', destructive: true },
    { id: 'change-branch', label: 'Change branch', icon: 'ri-git-branch-line' },
    { id: 'delete-worktree', label: 'Delete worktree', icon: 'ri-delete-bin-line', destructive: true },
];
```

### Tree Node Rendering
- Workspace names are rendered by `FileTreeNodeRenderer` in `FileTree.tsx` (line 117): `{node.data.name}`
- The name is rendered inside a `<span>` with text-overflow ellipsis
- For in-place rename, we'll need to replace this span with an editable input when in rename mode

## 2. Context Menu Hook (`useContextMenu.ts`)

**File:** `apps/web/src/hooks/useContextMenu.ts`

### State Shape
```typescript
export interface ContextMenuState {
  isOpen: boolean
  x: number
  y: number
  targetId: string | null
  targetType: 'workspace' | 'worktree' | 'agent-tab' | 'terminal-tab' | null
  targetPath: string | null
  isMain: boolean
}
```

### Action Types
```typescript
export type ContextMenuAction =
  | 'create-worktree'
  | 'delete-worktree'
  | 'change-branch'
  | 'merge'
  | 'view-diff'
  | 'settings'
  | 'open-in-file-manager'
  | 'copy-path'
  | 'rename'
  | 'rename-workspace'
  | 'remove-workspace'
  | 'close'
  | 'close-right'
  | 'close-left'
  | 'close-others'
```

### Callbacks Interface
```typescript
export interface ContextMenuCallbacks {
  onCreateWorktree?: (workspaceId: string) => void
  onDeleteWorktree?: (worktreeId: string) => void
  onChangeBranch?: (worktreeId: string) => void
  onMerge?: (worktreeId: string) => void
  onViewDiff?: (worktreeId: string) => void
  onSettings?: (workspaceId: string) => void
  onRenameWorkspace?: (workspaceId: string) => void
  onRemoveWorkspace?: (workspaceId: string) => void
  // ... tab-related callbacks
}
```

## 3. Context Menu Component (`ContextMenu.tsx`)

**File:** `apps/web/src/components/ui/ContextMenu.tsx`

- Uses `@base-ui/react/context-menu` primitives
- Filters visible items based on `targetType` (workspace vs worktree)
- Workspace items: `['create-worktree', 'settings', 'rename-workspace', 'remove-workspace']`
- Worktree items: `change-branch` (always), `delete-worktree` (not on main worktree)

## 4. FileTree Component (`FileTree.tsx`)

**File:** `apps/web/src/components/ui/FileTree.tsx`

- Uses `react-arborist` Tree component
- Node renderer at line 30-126: `FileTreeNodeRenderer`
- **Key for in-place rename:** The name is rendered at line 117:
  ```tsx
  <span style={{...}}>{node.data.name}</span>
  ```
- Has `renderRightContent` prop that could be used for the inline edit UI
- The `FileTreeNode` interface supports a `data` field for arbitrary metadata

## 5. Existing Dialog Components

### WorkspaceSettingsDialog (EXISTS)
**File:** `apps/web/src/components/dialogs/WorkspaceSettingsDialog.tsx`

- Import: `import { Dialog } from '@base-ui/react/dialog';`
- Props: `{ open: boolean; onOpenChange: (open: boolean) => void; workspaceId: string | null; }`
- Already implements:
  - Name display (readOnly — "Name editing is not supported")
  - Root path display (readOnly)
  - Color picker (6 preset colors)
  - Icon picker (12 preset icons)
  - Worktree base directory (editable)
  - Save via `WorkspaceUpdate` WebSocket message
  - Delete confirmation (inline within the dialog, not separate dialog)
- **NOT CURRENTLY MOUNTED** anywhere in the app — exists but not wired into the sidebar
- Store state: `workspaceSettingsDialog: { isOpen: false, workspaceId: null }`
- Store setters: `setWorkspaceSettingsDialogOpen`, `resetWorkspaceSettingsDialog`

### ChangeBranchDialog (EXISTS)
**File:** `apps/web/src/components/dialogs/ChangeBranchDialog.tsx`

- Import: `import { Dialog } from '@base-ui/react/dialog';`
- Props: `{ open: boolean; onOpenChange: (open: boolean) => void; worktreeId: string | null; currentBranch: string; }`
- Currently just a text input for branch name — no dropdown/select
- Sends `WorktreeChangeBranch` WebSocket message
- Listens for `WorktreeChanged` and `Error` messages
- **NOT CURRENTLY MOUNTED** anywhere in the app — exists but not wired into the sidebar
- Store state: `changeBranchDialog: { isOpen: false, worktreeId: null, currentBranch: '' }`
- Store setters: `setChangeBranchDialogOpen`, `resetChangeBranchDialog`

### CreatePRDialog (MOUNTED)
**File:** `apps/web/src/components/dialogs/CreatePRDialog.tsx`

- Mounted in `ProjectPanel.tsx`
- Good reference for dialog patterns

### CreateWorktreeDialog (EXISTS)
**File:** `apps/web/src/components/dialogs/CreateWorktreeDialog.tsx`

### MergeDialog (EXISTS)
**File:** `apps/web/src/components/dialogs/MergeDialog.tsx`

## 6. App Mount Point

**File:** `apps/web/src/components/layout/AppShell.tsx`

- AppShell renders SidebarPanel, MainPanel, ProjectPanel
- Dialogs should be mounted here (or in SidebarPanel for sidebar-specific dialogs)
- Currently NO workspace dialogs are mounted — WorkspaceSettingsDialog and ChangeBranchDialog exist but are never rendered

## 7. API Layer

**File:** `apps/web/src/lib/api.ts`

Key functions:
- `deleteWorkspace(workspaceId)` — sends `WorkspaceDelete`
- `removeWorkspace(workspaceId)` — sends `WorkspaceRemove` (softer removal)
- `renameWorkspace(workspaceId, name)` — sends `WorkspaceRename`
- `deleteWorktree(worktreeId)` — sends `WorktreeDelete`
- `createWorktree(workspaceId, branchName, agentType?)` — sends `WorktreeCreate`
- `updateWorkspace(workspaceId, updates)` — sends `WorkspaceUpdate`

All use WebSocket (`getWebSocketClient().send(message)`)

## 8. Backend Git Operations

### `change_branch` (Backend)
**File:** `crates/ws-server/src/git/mod.rs` (lines 336-375)

- **Current limitation:** Only supports switching to EXISTING LOCAL branches
- Uses `repo.find_branch(new_branch_name, BranchType::Local)` — fails for remote or new branches
- Does NOT support:
  - Creating new branches from scratch
  - Fetching and tracking remote branches

### `change_branch` (Worktree handler)
**File:** `crates/ws-server/src/worktree/mod.rs` (lines 414-463)

- Receives `WorktreeChangeBranch` message
- Calls `git_ops.change_branch()` 
- Updates DB via `update_worktree_branch()`
- Broadcasts `WorktreeChanged`

### No branch listing API exists
- There is no endpoint or WebSocket message to list branches (local or remote)
- Would need to add: `GitListBranches` request → `BranchListResult` response
- Backend would use `git2::Repository::branches()` for local and `git2::Repository::branches(BranchType::Remote)` for remote

## 9. Store State for Dialogs

**File:** `apps/web/src/store.ts` (lines 396-418)

```typescript
workspaceSettingsDialog: { isOpen: false, workspaceId: null },
changeBranchDialog: { isOpen: false, worktreeId: null, currentBranch: '' },
```

Selectors available:
- `selectWorkspaceSettingsDialog` / `selectWorkspaceSettingsDialogOpen`
- `selectChangeBranchDialog` (need to verify)

Setters available:
- `setWorkspaceSettingsDialogOpen(isOpen, workspaceId?)`
- `setChangeBranchDialogOpen(isOpen, worktreeId?, currentBranch?)`
- `resetWorkspaceSettingsDialog()`
- `resetChangeBranchDialog()`
