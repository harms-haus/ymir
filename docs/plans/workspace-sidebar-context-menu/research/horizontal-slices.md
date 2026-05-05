# Horizontal Slices: Codebase Consistency Patterns

## 1. Dialog Pattern

All dialogs use `@base-ui/react/dialog` with the same structure:

### Import Pattern
```typescript
import { Dialog } from '@base-ui/react/dialog';
```

### BaseUI Dialog API
**Package:** `@base-ui/react` (installed at `apps/web/node_modules/@base-ui/react/`)

Available sub-components:
- `Dialog.Root` — Groups all parts. Props: `open`, `defaultOpen`, `onOpenChange`, `modal`, `disablePointerDismissal`, `actionsRef`, `handleRef`
- `Dialog.Portal` — Renders children in a portal
- `Dialog.Backdrop` — Overlay behind the dialog
- `Dialog.Popup` — The dialog content container
- `Dialog.Title` — Accessible title
- `Dialog.Description` — Accessible description
- `Dialog.Close` — Close button
- `Dialog.Trigger` — Open trigger
- `Dialog.Viewport` — Scrollable viewport

### Common Dialog Structure (from all 5 existing dialogs)
```tsx
<Dialog.Root open={open} onOpenChange={onOpenChange}>
  <Dialog.Portal>
    <Dialog.Backdrop
      style={{
        position: 'fixed', inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        zIndex: 9998,
      }}
    />
    <Dialog.Popup
      style={{
        position: 'fixed', top: '50%', left: '50%',
        transform: 'translate(-50%, -50%)',
        backgroundColor: 'hsl(var(--card))',
        border: '1px solid hsl(var(--border))',
        borderRadius: '8px', padding: '24px',
        width: '500px', maxWidth: '90vw',
        maxHeight: '90vh', overflow: 'auto',
        boxShadow: '0 4px 20px rgba(0, 0, 0, 0.3)',
        zIndex: 9999,
      }}
    >
      <Dialog.Title style={{ margin: '0 0 8px 0', fontSize: '18px', fontWeight: 600 }}>
        {/* Dialog title */}
      </Dialog.Title>
      <Dialog.Description style={{ margin: '0 0 20px 0', fontSize: '14px', color: 'hsl(var(--muted-foreground))' }}>
        {/* Dialog description */}
      </Dialog.Description>
      {/* Content */}
    </Dialog.Popup>
  </Dialog.Portal>
</Dialog.Root>
```

### Dialog Variants in Codebase

| Dialog | File | Props | Width | Purpose |
|--------|------|-------|-------|---------|
| CreatePRDialog | `dialogs/CreatePRDialog.tsx` | `{ open, onOpenChange }` | 500px | Create PR with title/body |
| WorkspaceSettingsDialog | `dialogs/WorkspaceSettingsDialog.tsx` | `{ open, onOpenChange, workspaceId }` | 500px | Edit workspace properties |
| ChangeBranchDialog | `dialogs/ChangeBranchDialog.tsx` | `{ open, onOpenChange, worktreeId, currentBranch }` | 480px | Change worktree branch |
| CreateWorktreeDialog | `dialogs/CreateWorktreeDialog.tsx` | Varies | — | Create new worktree |
| MergeDialog | `dialogs/MergeDialog.tsx` | Varies | — | Merge worktree to main |

### Common Patterns Across Dialogs
1. **State management:** All use `useState` for form fields, `useRef` for timeouts/subscriptions
2. **Async operations:** All use WebSocket `client.send()` + `client.onMessage()` pattern
3. **Loading states:** All have `isSubmitting` state with spinner
4. **Error handling:** All listen for `Error` messages with matching `requestId`
5. **Timeouts:** All use 30-second timeout for operations
6. **Cleanup:** All use `useRef` to track subscriptions for cleanup on unmount
7. **Early return guard:** All dialogs have `if (!open || !requiredData) return null;` before rendering
8. **Form submission:** All use `<form onSubmit={handleSubmit}>` pattern
9. **Button layout:** Cancel on left, submit on right, flex-end alignment
10. **Submit button:** Uses `hsl(var(--primary))` background or hardcoded `hsl(142 70% 45%)` (green)
11. **Spinner:** Inline `<span>` with border animation, `animation: 'spin 1s linear infinite'`

### WorkspaceSettingsDialog Delete Confirmation Pattern (lines 652-718)
The dialog already has a built-in confirmation for workspace deletion using `showDeleteConfirm` state:
- Shows "Delete Workspace" button initially
- On click, shows inline confirmation: 'Delete workspace "{workspace.name}"? This cannot be undone.'
- Cancel/Confirm buttons side by side
- This is an INLINE confirmation, NOT a separate dialog

## 2. Context Menu Pattern

**File:** `apps/web/src/components/ui/ContextMenu.tsx`

### Structure
- Uses `@base-ui/react/context-menu` primitives: `Root`, `Portal`, `Positioner`, `Popup`, `Item`
- Manually positioned with `style={{ position: 'fixed', left, top, zIndex: 9999 }}`
- Items filtered by `targetType`
- Destructive items use `hsl(var(--destructive))` color
- Icons via `remixicon` class names (`ri-*`)

### Item Interface
```typescript
export interface ContextMenuItem {
  id: ContextMenuAction
  label: string
  icon?: string
  destructive?: boolean
}
```

### Hook Pattern (`useContextMenu`)
```typescript
const { state, openMenu, closeMenu, handleAction } = useContextMenu({
  onCreateWorktree: (workspaceId) => { /* ... */ },
  onDeleteWorktree: (worktreeId) => { /* ... */ },
  // ... all callbacks
});
```

### FileTree Integration
- `FileTree` accepts `onContextMenu?: (e: React.MouseEvent, node: NodeApi<FileTreeNode>) => void`
- Renderer attaches handler to each row's `<div onContextMenu={handleContextMenu}>`
- Only calls `e.preventDefault()` when `onContextMenu` is provided (fixed in the debugging session)

## 3. Confirmation Dialog Pattern

**No dedicated confirmation dialog component exists.**

Current patterns:
1. **`window.confirm()`** — Used in `WorkspaceTree.tsx` for delete/remove (lines 127, 146)
2. **Inline confirmation** — `WorkspaceSettingsDialog` has inline delete confirmation using `showDeleteConfirm` state

For the confirmation dialogs required by the PROMPT (Remove Workspace, Delete Worktree), the recommended pattern is:
- Create small Dialog components similar to existing ones but simpler
- Or use the inline confirmation pattern from WorkspaceSettingsDialog
- OR use `@radix-ui/react-alert-dialog` (available in pnpm-lock.yaml v1.1.15) — but no existing usage found

## 4. In-Place Editing Pattern

**No existing in-place editing patterns found in the codebase.**

The `FileTree` component has a `renderRightContent` prop but no inline editing support.
The `react-arborist` Tree library supports custom node renderers, so in-place rename can be achieved by:
1. Adding a `renamingId` state to track which node is being renamed
2. Conditionally rendering an `<input>` instead of `<span>` in the renderer
3. Handling blur/Enter/Escape events

## 5. State Management Patterns

### Store Layer (`store.ts`)
- Uses `zustand` (inferred from `create` pattern)
- Dialog state stored in the main AppState
- Setters follow naming: `set{Xxx}DialogOpen(isOpen, ...ids)`
- Reset functions: `reset{Xxx}Dialog()`
- Selectors: `select{Xxx}Dialog`, `select{Xxx}DialogOpen`

### Local Component State
- Dialogs use `useState` for form fields
- `useRef` for subscription cleanup and timeouts
- No custom hooks for form state

## 6. API Layer Patterns

**File:** `apps/web/src/lib/api.ts`

### Function Pattern
```typescript
export function operationName(params: ParamType): void {
  const client = getWebSocketClient();
  const message: MessageType = {
    type: 'MessageType',
    // params...
  };
  client.send(message);
}
```

### Async Response Pattern (in dialogs)
```typescript
const requestId = generateId(); // or `operation-${Date.now()}-${random}`
currentRequestIdRef.current = requestId;

const unsubscribe = client.onMessage('ResultMessage', (msg) => {
  if (msg.someField === targetId) {
    // success
  }
});

const errorUnsubscribe = client.onMessage('Error', (msg) => {
  if (msg.requestId !== requestId) return;
  // error handling
});

client.send({ type: 'RequestType', ..., requestId });

// Timeout
setTimeoutRef.current = setTimeout(() => { /* cleanup */ }, 30000);
```

### Protocol Types
- Defined in `apps/web/src/types/protocol.ts`
- Client messages: `WorkspaceUpdate`, `WorkspaceDelete`, `WorkspaceRemove`, `WorkspaceRename`, `WorktreeChangeBranch`, etc.
- Server messages: `WorkspaceUpdated`, `WorkspaceDeleted`, `WorktreeChanged`, `Error`, etc.

## 7. Naming Conventions

| Layer | Pattern | Examples |
|-------|---------|----------|
| Components | PascalCase + descriptive | `WorkspaceSettingsDialog`, `ChangeBranchDialog` |
| Store state | camelCase + "Dialog" suffix | `workspaceSettingsDialog`, `changeBranchDialog` |
| Setters | `set{Xxx}DialogOpen` | `setWorkspaceSettingsDialogOpen` |
| Resetters | `reset{Xxx}Dialog` | `resetWorkspaceSettingsDialog` |
| Selectors | `select{Xxx}Dialog` | `selectWorkspaceSettingsDialog` |
| Context menu actions | kebab-case strings | `'rename-workspace'`, `'remove-workspace'` |
| Protocol message types | PascalCase | `WorkspaceUpdate`, `WorktreeChangeBranch` |
| API functions | camelCase | `deleteWorkspace`, `renameWorkspace` |

## 8. Styling Patterns

### Dialog Popup
- `backgroundColor: 'hsl(var(--card))'`
- `border: '1px solid hsl(var(--border))'`
- `borderRadius: '8px'`
- `padding: '24px'`
- `zIndex: 9999`
- `boxShadow: '0 4px 20px rgba(0, 0, 0, 0.3)'`

### Inputs
- `padding: '10px 12px'`
- `borderRadius: '6px'`
- `border: '1px solid hsl(var(--border))'`
- `backgroundColor: 'hsl(var(--input))'`
- `color: 'hsl(var(--foreground))'`
- `fontSize: '14px'`

### Buttons
- Primary: `backgroundColor: 'hsl(var(--primary))'`, `color: 'hsl(var(--primary-foreground))'`
- Secondary: `backgroundColor: 'transparent'`, `border: '1px solid hsl(var(--border))'`
- Destructive: `backgroundColor: 'hsl(var(--destructive))'` or `color: 'hsl(var(--destructive))'`
- Disabled: `opacity: 0.6`, `cursor: 'not-allowed'`
