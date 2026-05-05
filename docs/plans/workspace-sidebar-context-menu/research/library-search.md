# Library Search: Dependencies and Components

## 1. baseUI Dialog Component

### Import Path
```typescript
import { Dialog } from '@base-ui/react/dialog';
```

### Package Location
`apps/web/node_modules/@base-ui/react/`

### Dialog Sub-Components (from `index.parts.d.ts`)
| Export | Component | Purpose |
|--------|-----------|---------|
| `Dialog.Root` | Groups all parts | Controls open state, modal behavior |
| `Dialog.Portal` | Portal rendering | Renders outside DOM hierarchy |
| `Dialog.Backdrop` | Overlay | Visual backdrop behind dialog |
| `Dialog.Popup` | Content container | Main dialog content wrapper |
| `Dialog.Title` | Accessible title | Screen reader accessible title |
| `Dialog.Description` | Accessible description | Screen reader accessible description |
| `Dialog.Close` | Close button | Closes dialog on click |
| `Dialog.Trigger` | Open trigger | Opens dialog on click |
| `Dialog.Viewport` | Scrollable viewport | For scrollable content |

### DialogRoot.Props (from `DialogRoot.d.ts`)
| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `open` | `boolean` | — | Controlled open state |
| `defaultOpen` | `boolean` | `false` | Initial open state (uncontrolled) |
| `modal` | `boolean \| 'trap-focus'` | `true` | Modal behavior (focus trap, scroll lock) |
| `onOpenChange` | `(open, eventDetails) => void` | — | Open/close callback |
| `onOpenChangeComplete` | `(open) => void` | — | Post-animation callback |
| `disablePointerDismissal` | `boolean` | `false` | Disable outside click dismissal |
| `actionsRef` | `RefObject<Actions>` | — | Imperative actions (unmount, close) |
| `handleRef` | `RefObject<Handle>` | — | External trigger handle |

### Context Menu Sub-Components (from `@base-ui/react/context-menu`)
| Export | Component |
|--------|-----------|
| `ContextMenu.Root` | Groups all parts |
| `ContextMenu.Portal` | Portal rendering |
| `ContextMenu.Positioner` | Positions the popup |
| `ContextMenu.Popup` | The menu container |
| `ContextMenu.Item` | Individual menu item |

## 2. Other Available baseUI Components

Available in `apps/web/node_modules/@base-ui/react/`:
- `dialog` — Modal dialogs (used)
- `context-menu` — Context menus (used)
- `drawer` — Slide-out drawers
- `toggle-group` — Toggle button groups
- `select` — Select/dropdown (potentially useful for branch picker)
- `popover` — Popover panels
- `tooltip` — Tooltips
- `combobox` — Combobox/autocomplete (useful for branch search)
- `checkbox` — Checkboxes
- And many more

**Note:** `@base-ui/react/select` or `@base-ui/react/combobox` would be ideal for the branch picker dropdown in ChangeBranchDialog, as the PROMPT requires showing all branches.

## 3. Project Dependencies

### Frontend (`apps/web/package.json`)
| Package | Purpose |
|---------|---------|
| `@base-ui/react` | Base UI components (Dialog, ContextMenu, etc.) |
| `react-arborist` | Tree component for file/workspace tree |
| `react-resizable-panels` | Resizable panel layout |
| `@radix-ui/react-dialog@1.1.15` | Radix Dialog (in lockfile but not directly used) |
| `@radix-ui/react-alert-dialog@1.1.15` | Alert dialogs (in lockfile, not directly used) |
| `zustand` | State management (inferred from store pattern) |
| `remixicon` | Icon library (used via `<i className="ri-*">`) |

### Backend (`crates/ws-server/Cargo.toml`)
| Crate | Purpose |
|-------|---------|
| `git2` | Git operations (branch management, checkout) |
| `tokio` | Async runtime |
| `serde`/`serde_json` | Serialization |
| `uuid` | UUID generation |
| `anyhow` | Error handling |
| `tracing` | Logging |
| `sqlite`/`sqlx` | Database |
| `tungstenite`/`tokio-tungstenite` | WebSocket |

## 4. Git Operations Library

**File:** `crates/ws-server/src/git/mod.rs`

### GitOperations struct
- `change_branch(worktree_id, repo_path, new_branch_name)` — Switch to existing local branch only
- `merge_branches(...)` — Merge feature branch into main
- `get_status(...)` — Git status
- `get_diff(...)` — Git diff
- `commit(...)` — Git commit
- `create_pr(...)` — Create pull request

### Key Limitation for ChangeBranchDialog
The current `change_branch` implementation ONLY supports existing local branches:
```rust
let branch = repo.find_branch(new_branch_name, BranchType::Local)
    .map_err(|e| GitError::BranchNotFound(...))?;
```

**Missing functionality:**
- No `list_branches()` method exists
- No support for remote branches
- No support for creating new branches from scratch
- No `git fetch` integration

### Branch Types Used
```rust
use git2::{BranchType, ...};
// BranchType::Local — local branches
// BranchType::Remote — remote tracking branches
```

### Required Backend Additions
1. **`list_branches(repo_path)`** — Return both local and remote branches
   - Use `repo.branches(BranchType::Local)` and `repo.branches(BranchType::Remote)`
   - Return branch names as strings
2. **`checkout_or_create_branch(repo_path, branch_name)`** — Checkout existing or create new
   - If branch exists locally: checkout
   - If branch exists remotely: `git checkout -b <branch> origin/<branch>`
   - If branch doesn't exist: create and checkout

## 5. Select/Dropdown Components

### No existing select/dropdown patterns found
- The ChangeBranchDialog currently uses a plain `<input type="text">` for branch name
- For the PROMPT requirements (show all branches, select from list, create new), a combobox/autocomplete would be ideal
- `@base-ui/react/combobox` is available in the baseUI package
- Alternatively, a simple `<select>` or custom dropdown could work

### Existing input pattern for branch name
From `ChangeBranchDialog.tsx` (lines 218-235):
```tsx
<input
  id="branch-name"
  type="text"
  value={newBranchName}
  onChange={(e) => setNewBranchName(e.target.value)}
  placeholder="feature/new-branch"
  disabled={isSubmitting}
  style={{
    width: '100%', padding: '10px 12px', borderRadius: '6px',
    border: '1px solid hsl(var(--border))', backgroundColor: 'hsl(var(--input))',
    color: 'hsl(var(--foreground))', fontSize: '14px', boxSizing: 'border-box',
  }}
/>
```

## 6. Protocol Message Types

**File:** `apps/web/src/types/protocol.ts`

### Client-to-Server Messages (relevant)
| Type | Fields | Purpose |
|------|--------|---------|
| `WorkspaceUpdate` | `workspaceId, color?, icon?, worktreeBaseDir?, requestId?` | Update workspace settings |
| `WorkspaceDelete` | `workspaceId` | Delete workspace (hard) |
| `WorkspaceRemove` | `workspaceId` | Remove workspace (soft) |
| `WorkspaceRename` | `workspaceId, newName` | Rename workspace |
| `WorktreeChangeBranch` | `worktreeId, newBranchName, requestId?` | Change worktree branch |
| `WorktreeDelete` | `worktreeId` | Delete worktree |
| `WorktreeCreate` | `workspaceId, branchName, agentType?` | Create worktree |

### Server-to-Client Messages (relevant)
| Type | Fields | Purpose |
|------|--------|---------|
| `WorkspaceUpdated` | `workspace` | Confirmation of workspace update |
| `WorkspaceDeleted` | `workspaceId` | Confirmation of workspace deletion |
| `WorktreeChanged` | `worktree` | Confirmation of branch change |
| `WorktreeCreated` | `worktree` | Confirmation of worktree creation |
| `Error` | `message, requestId?, worktreeId?` | Error response |

## 7. Recommendations

### For Confirmation Dialogs
- Create simple Dialog components with minimal UI
- Follow the established Dialog pattern (Backdrop + Popup + Title + Description + Buttons)
- OR use the inline confirmation pattern from WorkspaceSettingsDialog (no new component needed)

### For Change Branch Dialog Enhancement
- Backend changes needed: add `list_branches` endpoint and enhance `change_branch`
- Frontend: Add a combobox/autocomplete to the existing ChangeBranchDialog
- Consider `@base-ui/react/combobox` for the branch picker with search/filter

### For In-Place Rename
- No library support needed
- Modify `FileTree.tsx` renderer to conditionally show `<input>` when in rename mode
- Or use `renderRightContent` prop to add an edit button next to the name
