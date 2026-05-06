# Research Findings: Workspace Worktree Dialogs and Settings Improvements

## 1. DB Schema

### Database Engine
- **Turso (libsql)** - SQLite-compatible embedded database
- Location: `crates/ws-server/src/db/mod.rs`
- Migration-based schema with 17 migrations tracked in `_migrations` table

### Workspace Table
```sql
CREATE TABLE workspaces (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    root_path TEXT NOT NULL,
    color TEXT DEFAULT '#3B82F6',
    icon TEXT DEFAULT 'folder',
    worktree_base_dir TEXT DEFAULT '.git/worktrees',
    settings_json TEXT DEFAULT '{}',  -- JSON blob for arbitrary settings
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

**Rust struct** (`Db::Workspace`):
```rust
pub struct Workspace {
    pub id: String,
    pub name: String,
    pub root_path: String,
    pub color: String,
    pub icon: String,
    pub worktree_base_dir: String,
    pub settings_json: String,  // stored as JSON string, NOT parsed
    pub created_at: String,
    pub updated_at: String,
}
```

**Key finding: NO `agent` field on workspace table.** Agent is NOT stored on workspace.

### Worktree Table
```sql
CREATE TABLE worktrees (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL,
    branch_name TEXT NOT NULL,
    path TEXT NOT NULL,
    status TEXT DEFAULT 'active',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    is_main INTEGER DEFAULT 0,  -- added via migration
    FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
);
```

**Rust struct** (`Db::Worktree`):
```rust
pub struct Worktree {
    pub id: String,
    pub workspace_id: String,
    pub branch_name: String,
    pub path: String,
    pub status: String,
    pub created_at: String,
    pub is_main: bool,
}
```

**Key findings:**
- NO `agent` field on worktree table
- NO `color` or `icon` fields on worktree table
- No dedicated worktree settings columns at all

### Agent Session Table
```sql
CREATE TABLE agent_sessions (
    id TEXT PRIMARY KEY,
    worktree_id TEXT NOT NULL,
    agent_type TEXT NOT NULL,
    acp_session_id TEXT,
    status TEXT DEFAULT 'active',
    started_at TEXT NOT NULL DEFAULT (datetime('now')),
    label TEXT,
    position INTEGER DEFAULT 0,
    updated_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (worktree_id) REFERENCES worktrees(id) ON DELETE CASCADE
);
```

This is where agent_type is currently stored — as a separate session record, NOT as a persistent worktree/workspace setting.

### DB Methods (relevant to our feature)

**Workspace:**
- `create_workspace()` - inserts all fields
- `get_workspace()` / `list_workspaces()` - queries all fields
- `update_workspace(id, name, settings_json)` - can only update name and settings_json (partial update)
- `delete_workspace()` - deletes workspace

**Worktree:**
- `create_worktree()` - inserts all fields
- `get_worktree()` / `list_worktrees()` / `list_all_worktrees()`
- `update_worktree(id, status)` - only updates status
- `update_worktree_branch(id, branch_name)` - only updates branch_name
- `delete_worktree()` - deletes worktree

**GAP: No DB method to update worktree color/icon/agent. No DB method to update workspace color/icon individually (they're only updated via name+settings_json together).**

---

## 2. Create Worktree Flow

### Current Frontend (ALREADY MIGRATED to proper dialog!)
File: `apps/web/src/components/dialogs/CreateWorktreeDialog.tsx`

The dialog has ALREADY been converted from alert()/prompt() to a proper `@base-ui/react/dialog` component. Current fields:
- **Branch name** (text input)
- **Use existing branch** (checkbox)
- **Agent selector** (RadioGroup with options: hermes, claude, opencode, pi, none)

Agent type is defined as:
```typescript
type AgentOption = 'hermes' | 'claude' | 'opencode' | 'pi' | 'none';
```

**Missing from current dialog (per PROMPT.md requirements):**
- Color picker
- Icon selector
- Auto-population from parent workspace settings

### Dialog opens via context menu in WorkspaceTree
File: `apps/web/src/components/sidebar/WorkspaceTree.tsx` (line ~112)

```typescript
onCreateWorktree: (workspaceId: string) => {
  const branchName = prompt('Enter branch name for new worktree:');
  if (branchName && branchName.trim()) {
    createWorktree(workspaceId, branchName.trim());
  }
},
```

**IMPORTANT: The context menu handler in WorkspaceTree STILL uses `prompt()`**, not the CreateWorktreeDialog. The dialog component exists but the context menu action doesn't use it. The dialog must be wired into WorkspaceTree or AppShell.

### WebSocket Message
```typescript
interface WorktreeCreate {
  type: 'WorktreeCreate';
  workspaceId: string;
  branchName: string;
  agentType?: string;       // already supported!
  requestId?: string;
  useExistingBranch?: boolean;
}
```

The `agentType` field already exists in the protocol and is sent to the backend.

### Backend Creation Flow
File: `crates/ws-server/src/worktree/mod.rs`

1. Receives `WorktreeCreate` with `workspace_id`, `branch_name`, `agent_type`
2. Fetches workspace from DB
3. Opens git repo at workspace root_path
4. Creates branch if it doesn't exist (from HEAD)
5. Creates git worktree via `repo.worktree()`
6. Creates worktree DB record (no agent/color/icon fields)
7. Adds to in-memory state
8. Logs activity (agent_type is logged in metadata_json but not stored)
9. Returns `WorktreeCreated` response

**Key finding:** The backend receives `agent_type` in the WorktreeCreate message and logs it in activity metadata, but does NOT persist it to the worktree table. The agent_type is only stored when an agent session is explicitly spawned via `AgentSpawn`.

---

## 3. Workspace Settings

### WorkspaceSettingsDialog
File: `apps/web/src/components/dialogs/WorkspaceSettingsDialog.tsx`

Current fields:
- **Name** (text input)
- **Root path / CWD** (text input, read-only effectively)
- **Color** (preset color swatches: Red, Orange, Yellow, Green, Blue, Purple)
- **Icon** (preset icons from Remix Icon set: 12 options)
- **Worktree base dir** (text input, default: `.worktrees/`)
- **Delete workspace** button (with ConfirmDialog)

**Missing: Agent field** — not in the dialog.

### Save mechanism
The dialog sends `WorkspaceUpdate` WebSocket message:
```typescript
{
  type: 'WorkspaceUpdate',
  workspaceId,
  color,
  icon,
  worktreeBaseDir,
  requestId,
}
```

**CRITICAL FINDING: `WorkspaceUpdate` is NOT IMPLEMENTED on the backend!**

In `crates/ws-server/src/router.rs` line 280:
```rust
ClientMessagePayload::WorkspaceUpdate(_)
| ClientMessagePayload::WorktreeMerge(_)
| ClientMessagePayload::FileWrite(_)
| ClientMessagePayload::UpdateSettings(_) => Some(not_implemented(message.payload)),
```

This means workspace settings (color, icon, worktreeBaseDir) sent from the dialog are silently ignored. They are NOT saved to the database. The dialog listens for `WorkspaceUpdated` response which will never arrive, causing a timeout.

### What IS implemented for workspace settings:
- `WorkspaceRename` - updates name only (works)
- DB `update_workspace(id, name, settings_json)` - can update name and settings_json

### Protocol types
```rust
// Backend protocol/workspace.rs
pub struct WorkspaceUpdate {
    pub workspace_id: Uuid,
    pub color: Option<String>,
    pub icon: Option<String>,
    pub worktree_base_dir: Option<String>,
    pub settings: Option<String>,
    pub request_id: Option<Uuid>,
}

pub struct WorkspaceData {
    pub id: Uuid,
    pub name: String,
    pub root_path: String,
    pub color: Option<String>,
    pub icon: Option<String>,
    pub worktree_base_dir: Option<String>,
    pub settings: Option<String>,
    pub created_at: u64,
    pub updated_at: u64,
}
```

Note: `WorkspaceData` does NOT have an `agent` field.

---

## 4. Worktree Settings

### Current State: NO worktree settings dialog exists
There is no `WorktreeSettingsDialog` component.

### Worktree context menu
In `apps/web/src/components/ui/ContextMenu.tsx`, the worktree context menu items are:
- `change-branch` - opens ChangeBranchDialog
- `delete-worktree` - opens ConfirmDialog (only for non-main worktrees)
- `open-in-file-manager` - conditional on targetPath
- `copy-path` - conditional on targetPath

**No "Edit Settings" item exists.**

### Worktree DB fields available
- id, workspace_id, branch_name, path, status, created_at, is_main
- **No color, icon, or agent fields**

### Protocol `WorktreeData`
```rust
pub struct WorktreeData {
    pub id: Uuid,
    pub workspace_id: Uuid,
    pub branch_name: String,
    pub path: String,
    pub status: String,
    pub created_at: u64,
    pub is_main: bool,
    pub git_stats: Option<GitStats>,
}
```
No color, icon, or agent fields.

### What would need to be added:
1. DB migration: add `color`, `icon`, `agent_type` columns to worktrees table
2. DB methods: `update_worktree_settings(id, color, icon, agent_type)`
3. Protocol: new `WorktreeUpdate` message type
4. Backend handler: implement worktree update
5. Frontend: create `WorktreeSettingsDialog` component
6. Frontend: add "Edit Settings" to worktree context menu

---

## 5. Agent Types

### Supported agents (frontend)
Defined in `CreateWorktreeDialog.tsx`:
```typescript
type AgentOption = 'hermes' | 'claude' | 'opencode' | 'pi' | 'none';

const AGENT_OPTIONS = [
  { value: 'hermes', icon: 'ri-robot-line', label: 'Hermes', description: 'Self-improving AI agent...' },
  { value: 'claude', icon: 'ri-robot-line', label: 'Claude', description: 'Via ACP adapter' },
  { value: 'opencode', icon: 'ri-terminal-box-line', label: 'Opencode', description: 'Native ACP support' },
  { value: 'pi', icon: 'ri-code-s-slash-line', label: 'Pi', description: 'Via pi-acp adapter' },
  { value: 'none', icon: 'ri-forbid-line', label: 'No agent', description: 'Start with terminal only' },
];
```

### Backend agent handling
File: `crates/ws-server/src/agent/`

- Agents are spawned via `AgentSpawn` message with `agent_type: String`
- Agent type is stored as a plain string in `agent_sessions.agent_type`
- The ACP runtime (`acp_handle.spawn_agent(worktree_id, &agent_type, &worktree_path)`) uses the agent_type string to determine which agent to launch
- No enum/type validation on backend — agent_type is just a String

### Agent storage
- **NOT stored on workspace** — no agent field in workspace table
- **NOT stored on worktree** — no agent field in worktree table
- Stored as `agent_sessions.agent_type` — but this is a runtime session, not a persistent setting
- When creating a worktree, `agent_type` is passed in `WorktreeCreate` but only logged, not persisted

### For the feature:
- Need to add `agent` field to workspace table (default agent, inherited by worktrees)
- Need to add `agent` field to worktree table (override per worktree)
- Need to add `agent` field to WorkspaceUpdate protocol
- Need to add `agent` field to new WorktreeUpdate protocol

---

## 6. Dialog Patterns

### Base UI Library
- `@base-ui/react` (not @vibrant-minds/baseui)
- Dialog: `Dialog.Root`, `Dialog.Portal`, `Dialog.Backdrop`, `Dialog.Popup`, `Dialog.Title`, `Dialog.Description`
- AlertDialog: `BaseAlertDialog.Root`, `.Portal`, `.Backdrop`, `.Viewport`, `.Popup`, `.Title`, `.Description`, `.Close`
- ContextMenu: `BaseContextMenu.Root`, `.Portal`, `.Positioner`, `.Popup`, `.Item`
- RadioGroup: `RadioGroup` from `@base-ui/react/radio-group`
- Combobox: `Combobox.Root`, `.Input`, `.Portal`, `.Positioner`, `.Popup`, `.List`, `.Group`, `.GroupLabel`, `.Item`, `.Empty`

### Common dialog pattern (used by CreateWorktreeDialog, WorkspaceSettingsDialog, ChangeBranchDialog)

All follow the same pattern:
1. Props: `{ open: boolean; onOpenChange: (open: boolean) => void; workspaceId/worktreeId: string | null }`
2. State from store on open (populating form fields)
3. Reset state when dialog opens
4. Form with controlled inputs
5. Submit handler that:
   - Generates a requestId
   - Sets up WebSocket response listeners (success + error)
   - Sends WebSocket message
   - Sets up timeout (30 seconds)
   - On success: closes dialog, shows notification
   - On error: shows error notification
6. Uses `useRef` for subscription cleanup
7. Inline styles (no CSS modules or styled-components)

### ConfirmDialog pattern
- Uses `AlertDialog` component
- Config-driven: `{ title, description, confirmLabel, destructive, onConfirm }`
- Stored in Zustand store as `confirmDialog: ConfirmDialogConfig | null`

### Store dialog state
```typescript
createWorktreeDialog: { isOpen: false, workspaceId: null },
workspaceSettingsDialog: { isOpen: false, workspaceId: null },
changeBranchDialog: { isOpen: false, worktreeId: null, currentBranch: '' },
mergeDialog: { isOpen: false, worktreeId: null, branchName: '', mainBranch: 'main', mergeType: 'merge' },
alertDialog: null,
confirmDialog: null,
```

Actions:
- `setCreateWorktreeDialogOpen(open, workspaceId)`
- `setWorkspaceSettingsDialogOpen(open, workspaceId)`
- `setChangeBranchDialogOpen(open, worktreeId, currentBranch)`
- `showAlertDialog(config)` / `hideAlertDialog()`
- `setConfirmDialog(config)` / `hideConfirmDialog()`

---

## 7. Store/State Summary

### Workspace state (TypeScript)
```typescript
interface Workspace {
  id: string;
  name: string;
  rootPath: string;
  color?: string;
  icon?: string;
  worktreeBaseDir?: string;
  settings?: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
}
```

### Worktree state (TypeScript)
```typescript
interface Worktree {
  id: string;
  workspaceId: string;
  branchName: string;
  path: string;
  status: 'active' | 'inactive' | 'orphaned';
  isMain: boolean;
  gitStats?: GitStats;
  createdAt: number;
}
```

### Store actions (relevant)
- `setWorkspaces`, `setWorktrees` — bulk set from snapshot
- `addWorkspace`, `updateWorkspace`, `removeWorkspace`
- `addWorktree`, `updateWorktree`, `updateWorktreeGitStats`, `removeWorktree`
- `setActiveWorktree`
- Dialog open/close actions

### In-memory state (backend)
```rust
// state.rs
pub struct WorkspaceState {
    pub id: Uuid,
    pub name: String,
    pub root_path: String,
    pub color: Option<String>,
    pub icon: Option<String>,
    pub worktree_base_dir: Option<String>,
}

pub struct WorktreeState {
    pub id: Uuid,
    pub workspace_id: Uuid,
    pub branch_name: String,
    pub path: String,
    pub status: String,
    pub is_main: bool,
}

pub struct AgentState {
    pub id: Uuid,
    pub worktree_id: Uuid,
    pub agent_type: String,
    pub status: String,
}
```

---

## 8. Summary of Gaps and Required Changes

### Gaps found:

1. **WorkspaceUpdate not implemented** — Backend router returns `not_implemented` for WorkspaceUpdate. Settings sent from WorkspaceSettingsDialog are lost.

2. **No agent on workspace** — Workspace table/schema has no agent field. WorkspaceSettingsDialog has no agent selector.

3. **No worktree settings dialog** — No WorktreeSettingsDialog component exists.

4. **No worktree color/icon/agent in DB** — Worktree table lacks these columns.

5. **No WorktreeUpdate protocol/handler** — No message type or handler for updating worktree settings.

6. **Context menu uses prompt()** — WorkspaceTree's `onCreateWorktree` handler uses `prompt()`, not the existing CreateWorktreeDialog.

### What needs to be created/modified:

#### Database
- Migration: add `agent` column to `workspaces` table
- Migration: add `color`, `icon`, `agent_type` columns to `worktrees` table
- DB methods: `update_workspace_settings()`, `update_worktree_settings()`

#### Backend Protocol (crates/ws-server/src/protocol/)
- Add `agent` field to `WorkspaceUpdate`
- Add `agent` field to `WorkspaceData`
- Create `WorktreeUpdate` message type
- Add color/icon/agent to `WorktreeData`

#### Backend Router/Handlers (crates/ws-server/src/)
- Implement `WorkspaceUpdate` handler in router.rs
- Create worktree update handler
- Update in-memory state structs

#### Frontend Components (apps/web/src/components/)
- Add agent selector to WorkspaceSettingsDialog
- Create WorktreeSettingsDialog (color, icon, agent; read-only name/branch/path)
- Wire CreateWorktreeDialog to context menu (replace prompt())
- Add "Edit Settings" to worktree context menu
- Auto-populate CreateWorktreeDialog with parent workspace settings

#### Frontend Store (apps/web/src/store.ts, types/state.ts, types/protocol.ts)
- Add agent to Workspace/Worktree types
- Add worktreeSettingsDialog to store state
- Add updateWorktreeSettings action
- Add WorktreeUpdate message type
