# Runes for Workspace Worktree Dialogs and Settings

## Rune 1: Add `agent` column to workspaces table

### Files to modify
- `crates/ws-server/src/db/mod.rs`

### Changes
1. Append new migration to `SCHEMA_MIGRATIONS` array:
   ```sql
   ALTER TABLE workspaces ADD COLUMN agent TEXT DEFAULT 'hermes';
   ```

2. Update `Workspace` struct (line ~132):
   ```rust
   pub struct Workspace {
       // ... existing fields ...
       pub agent: String,  // NEW
   }
   ```

3. Update `create_workspace` INSERT query (line ~327):
   - Add `agent` to column list and params

4. Update `get_workspace` SELECT query (line ~351):
   - Add `agent` to column list
   - Add `agent: row.get(N)?` to struct construction

5. Update `list_workspaces` SELECT query (line ~373):
   - Add `agent` to column list
   - Add `agent: row.get(N)?` to struct construction

6. Update `update_workspace` method (line ~394):
   - Add `agent: Option<&str>` parameter
   - Add agent to dynamic UPDATE query builder

---

## Rune 2: Add `color`, `icon`, `agent_type` columns to worktrees table

### Files to modify
- `crates/ws-server/src/db/mod.rs`
- `crates/ws-server/src/worktree/mod.rs`

### Changes (db/mod.rs)
1. Append new migration to `SCHEMA_MIGRATIONS`:
   ```sql
   ALTER TABLE worktrees ADD COLUMN color TEXT DEFAULT NULL;
   ALTER TABLE worktrees ADD COLUMN icon TEXT DEFAULT NULL;
   ALTER TABLE worktrees ADD COLUMN agent_type TEXT DEFAULT NULL;
   ```

2. Update `Worktree` struct (line ~145):
   ```rust
   pub struct Worktree {
       // ... existing fields ...
       pub color: Option<String>,    // NEW
       pub icon: Option<String>,     // NEW
       pub agent_type: Option<String>, // NEW
   }
   ```

3. Update `create_worktree` INSERT query:
   - Add color, icon, agent_type columns and params (NULL defaults)

4. Update all worktree SELECT queries:
   - `get_worktree`: add 3 columns to SELECT and struct construction
   - `list_worktrees`: add 3 columns to SELECT and struct construction
   - `list_all_worktrees`: add 3 columns to SELECT and struct construction

5. Add new method `update_worktree_settings`:
   ```rust
   pub async fn update_worktree_settings(
       &self,
       id: &str,
       color: Option<&str>,
       icon: Option<&str>,
       agent_type: Option<&str>,
   ) -> Result<bool>
   ```
   - Dynamic UPDATE: only include non-None columns
   - Always update `updated_at` if available (note: worktrees table may not have updated_at — add it in migration if needed)

### Changes (worktree/mod.rs)
1. Update `create` function to accept and store color/icon/agent_type from `WorktreeCreate` message
   - Note: `WorktreeCreate` already has `agent_type`; add `color` and `icon` optional fields to the protocol type
2. Update `DbWorktree` construction in `create()` and `create_main()` to include new fields
3. Update `WorktreeData` construction in `create()`, `list()`, `change_branch()` to include new fields
4. Add `update_settings` handler function (see Rune 8)

---

## Rune 3: Create `update_workspace_settings` DB method

### Files to modify
- `crates/ws-server/src/db/mod.rs`

### Changes
Add new method after existing `update_workspace` method:
```rust
pub async fn update_workspace_settings(
    &self,
    id: &str,
    name: Option<&str>,
    color: Option<&str>,
    icon: Option<&str>,
    worktree_base_dir: Option<&str>,
    agent: Option<&str>,
    settings_json: Option<&str>,
) -> Result<bool>
```

Implementation pattern:
- Build dynamic UPDATE query by checking which fields are Some
- Use `SET field = ?` for each provided field
- Always update `updated_at = datetime('now')`
- Return `rows_affected > 0`

Alternative: Extend existing `update_workspace` to accept all optional fields instead of creating separate method.

---

## Rune 4: Extend protocol types for workspace

### Files to modify
- `crates/ws-server/src/protocol/workspace.rs`

### Changes
1. Add `agent` to `WorkspaceUpdate` (line ~42):
   ```rust
   pub struct WorkspaceUpdate {
       // ... existing fields ...
       pub agent: Option<String>,  // NEW
   }
   ```

2. Add `agent` to `WorkspaceData` (line ~58):
   ```rust
   pub struct WorkspaceData {
       // ... existing fields ...
       pub agent: Option<String>,  // NEW
   }
   ```

---

## Rune 5: Create `WorktreeUpdate` protocol types

### Files to modify
- `crates/ws-server/src/protocol/worktree.rs`
- `crates/ws-server/src/protocol/mod.rs`

### Changes (worktree.rs)
Add new structs at end of file:
```rust
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct WorktreeUpdate {
    #[serde(with = "uuid_serde")]
    #[ts(type = "string")]
    pub worktree_id: Uuid,
    pub color: Option<String>,
    pub icon: Option<String>,
    pub agent_type: Option<String>,
    #[serde(with = "optional_uuid_serde")]
    #[ts(type = "string")]
    pub request_id: Option<Uuid>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct WorktreeUpdated {
    pub worktree: WorktreeData,
}
```

Also add optional `color`, `icon`, `agent_type` fields to `WorktreeCreate` so they can be passed at creation time:
```rust
pub struct WorktreeCreate {
    // ... existing fields ...
    pub color: Option<String>,       // NEW
    pub icon: Option<String>,        // NEW
}
```

Update `WorktreeData` to include new fields:
```rust
pub struct WorktreeData {
    // ... existing fields ...
    pub color: Option<String>,       // NEW
    pub icon: Option<String>,        // NEW
    pub agent_type: Option<String>,  // NEW
}
```

### Changes (mod.rs)
1. Add `WorktreeUpdate` and `WorktreeUpdated` to exports
2. Add variants to `ClientMessagePayload` and `ServerMessagePayload` enums

---

## Rune 6: Extend in-memory state structs

### Files to modify
- `crates/ws-server/src/state.rs`

### Changes
1. `WorkspaceState` (line ~22):
   ```rust
   pub struct WorkspaceState {
       // ... existing fields ...
       pub agent: Option<String>,  // NEW
   }
   ```

2. `WorktreeState` (line ~33):
   ```rust
   pub struct WorktreeState {
       // ... existing fields ...
       pub color: Option<String>,       // NEW
       pub icon: Option<String>,        // NEW
       pub agent_type: Option<String>,  // NEW
   }
   ```

3. `initialize_from_db` (line ~182):
   - Update `WorkspaceState` construction to map `agent` field
   - Update `WorktreeState` construction to map `color`, `icon`, `agent_type` fields

---

## Rune 7: Implement `WorkspaceUpdate` handler

### Files to modify
- `crates/ws-server/src/workspace/mod.rs`
- `crates/ws-server/src/router.rs`

### Changes (workspace/mod.rs)
Add new `update` function after `rename`:
```rust
#[instrument(skip(state), fields(workspace_id = %msg.workspace_id))]
pub async fn update(state: Arc<AppState>, msg: WorkspaceUpdate) -> Result<WorkspaceUpdated> {
    // Get workspace from DB
    // Call db.update_workspace_settings() with provided fields
    // Update in-memory state (each field individually if Some)
    // Fetch updated workspace from DB for fresh timestamps
    // Convert to WorkspaceData and return WorkspaceUpdated
}
```

### Changes (router.rs)
1. Import the new update function at top of file
2. Replace the `not_implemented` arm (line ~280):
   ```rust
   // BEFORE:
   ClientMessagePayload::WorkspaceUpdate(_) => Some(not_implemented(message.payload)),

   // AFTER:
   ClientMessagePayload::WorkspaceUpdate(msg) => {
       match crate::workspace::update(state.clone(), msg).await {
           Ok(result) => Some(ServerMessage::new(ServerMessagePayload::WorkspaceUpdated(result))),
           Err(e) => Some(ServerMessage::new(ServerMessagePayload::Error(Error {
               code: "WORKSPACE_UPDATE_ERROR".to_string(),
               message: e.to_string(),
           }))),
       }
   }
   ```
3. Remove `WorkspaceUpdate(_)` from the `not_implemented` match arm pattern

---

## Rune 8: Implement `WorktreeUpdate` handler

### Files to modify
- `crates/ws-server/src/worktree/mod.rs`
- `crates/ws-server/src/router.rs`

### Changes (worktree/mod.rs)
Add new `update_settings` function:
```rust
#[instrument(skip(state), fields(worktree_id = %msg.worktree_id))]
pub async fn update_settings(state: Arc<AppState>, msg: WorktreeUpdate) -> Result<WorktreeUpdated> {
    // Get worktree from DB
    // Call db.update_worktree_settings() with provided fields
    // Update in-memory state
    // Fetch updated worktree from DB
    // Convert to WorktreeData and return WorktreeUpdated
}
```

### Changes (router.rs)
Add new handler arm:
```rust
ClientMessagePayload::WorktreeUpdate(msg) => {
    match crate::worktree::update_settings(state.clone(), msg).await {
        Ok(result) => Some(ServerMessage::new(ServerMessagePayload::WorktreeUpdated(result))),
        Err(e) => Some(ServerMessage::new(ServerMessagePayload::Error(Error {
            code: "WORKTREE_UPDATE_ERROR".to_string(),
            message: e.to_string(),
        }))),
    }
}
```

---

## Rune 9: Update data conversion functions

### Files to modify
- `crates/ws-server/src/workspace/mod.rs`
- `crates/ws-server/src/worktree/mod.rs`

### Changes (workspace/mod.rs)
Update `workspace_data_from_db` (line ~28):
```rust
fn workspace_data_from_db(ws: DbWorkspace) -> Result<WorkspaceData> {
    // ...
    Ok(WorkspaceData {
        // ... existing fields ...
        agent: Some(ws.agent),  // NEW
    })
}
```

Update `create` function's `WorkspaceData` construction (line ~183) to include `agent`.
Update workspace state construction (line ~141) to include `agent`.

### Changes (worktree/mod.rs)
Update all `WorktreeData` constructions throughout the file to include `color`, `icon`, `agent_type`.
Update `create_main` to accept and store default color/icon/agent from workspace.

---

## Rune 10: Frontend types and store

### Files to modify
- `apps/web/src/types/state.ts` (or equivalent type definitions)
- `apps/web/src/types/protocol.ts`
- `apps/web/src/store.ts`
- `apps/web/src/types/generated/*` (auto-generated, rebuilt via cargo)

### Changes
1. Run `cargo build` in `crates/ws-server/` to regenerate TypeScript types via ts_rs
2. Update manual type definitions if any exist outside generated types:
   - Add `agent?: string` to `Workspace` interface
   - Add `color?: string`, `icon?: string`, `agentType?: string` to `Worktree` interface
   - Add `WorktreeUpdate` and `WorktreeUpdated` message types
3. Add to Zustand store:
   ```typescript
   worktreeSettingsDialog: { isOpen: false, worktreeId: null as string | null },
   ```
   Action:
   ```typescript
   setWorktreeSettingsDialogOpen: (open: boolean, worktreeId: string | null) => void,
   ```

---

## Rune 11: Add agent selector to WorkspaceSettingsDialog

### Files to modify
- `apps/web/src/components/dialogs/WorkspaceSettingsDialog.tsx`

### Changes
1. Import or define `AGENT_OPTIONS` array (copy from CreateWorktreeDialog or extract to shared module)
2. Add state: `const [agent, setAgent] = useState('');`
3. Populate from workspace on dialog open: `setAgent(workspace?.agent || 'hermes');`
4. Add RadioGroup UI section for agent selection (reuse pattern from CreateWorktreeDialog)
5. Include `agent` field in `WorkspaceUpdate` WebSocket message sent on save

---

## Rune 12: Create WorktreeSettingsDialog component

### Files to create
- `apps/web/src/components/dialogs/WorktreeSettingsDialog.tsx`

### Implementation pattern
Follow the same pattern as `WorkspaceSettingsDialog` and `CreateWorktreeDialog`:
- Props: `{ open: boolean; onOpenChange: (open: boolean) => void; worktreeId: string | null }`
- Fetch worktree from store on open
- Auto-populate color/icon/agent from worktree (fallback to parent workspace defaults)
- Color picker: reuse `PRESET_COLORS` from WorkspaceSettingsDialog
- Icon selector: reuse `PRESET_ICONS` from WorkspaceSettingsDialog
- Agent selector: reuse `AGENT_OPTIONS` from CreateWorktreeDialog
- Name/branch/path shown as read-only info text
- Submit: send `WorktreeUpdate` WebSocket message with requestId
- Response handling: listen for `WorktreeUpdated`, close dialog, show notification
- Timeout: 30 seconds, show error on timeout

---

## Rune 13: Wire CreateWorktreeDialog to context menu

### Files to modify
- `apps/web/src/components/sidebar/WorkspaceTree.tsx`
- `apps/web/src/components/AppShell.tsx` (or wherever dialogs are mounted)

### Changes (WorkspaceTree.tsx)
1. Find the `onCreateWorktree` callback (line ~112)
2. Replace `prompt()` with store action:
   ```typescript
   onCreateWorktree: (workspaceId: string) => {
     setCreateWorktreeDialogOpen(true, workspaceId);
   },
   ```
3. Ensure the store action is available via `useStore`

### Changes (CreateWorktreeDialog.tsx)
1. On dialog open, read parent workspace from store
2. Auto-populate color, icon, agent from workspace settings
3. These should be sent in `WorktreeCreate` message

### Changes (AppShell or root component)
1. Ensure `CreateWorktreeDialog` is mounted and controlled by store state
2. Check that it's not already mounted elsewhere; if it is, just ensure the wiring works

---

## Rune 14: Add "Edit Settings" to worktree context menu

### Files to modify
- `apps/web/src/components/ui/ContextMenu.tsx`
- `apps/web/src/components/AppShell.tsx` (or wherever dialogs are mounted)

### Changes (ContextMenu.tsx)
1. Find worktree context menu item definitions
2. Add new item:
   ```
   { id: 'edit-worktree-settings', label: 'Edit Settings', icon: 'ri-settings-3-line' }
   ```
3. Add handler that calls `setWorktreeSettingsDialogOpen(true, worktreeId)`

### Changes (AppShell or root component)
1. Mount `WorktreeSettingsDialog` controlled by store state:
   ```tsx
   <WorktreeSettingsDialog
     open={worktreeSettingsDialog.isOpen}
     onOpenChange={(open) => setWorktreeSettingsDialogOpen(open, worktreeSettingsDialog.worktreeId)}
     worktreeId={worktreeSettingsDialog.worktreeId}
   />
   ```

---

## Rune 15: Build and verify

### Commands
```bash
# Backend
cd /root/ymir/crates/ws-server && cargo check
cd /root/ymir/crates/ws-server && cargo build

# Frontend
cd /root/ymir/apps/web && npx tsc --noEmit
```

### Verification checklist
1. All Rust code compiles without errors
2. All TypeScript types are valid
3. DB migrations apply cleanly (test with fresh DB)
4. Existing workspaces get `agent` = 'hermes' default
5. Existing worktrees get NULL for color/icon/agent_type
6. WorkspaceUpdate saves color, icon, agent, worktreeBaseDir to DB
7. WorktreeUpdate saves color, icon, agent_type to DB
8. CreateWorktreeDialog auto-populates from parent workspace
9. WorktreeSettingsDialog shows current values and saves correctly
