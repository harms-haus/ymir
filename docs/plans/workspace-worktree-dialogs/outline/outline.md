# Implementation Outline: Workspace Worktree Dialogs and Settings

## Overview
Replace prompt()-based worktree creation with a proper dialog, implement full workspace settings persistence, create a worktree settings dialog, and wire up all missing backend handlers.

---

## Phase 1: Database Schema (Layer 1)
**Goal: Add missing columns to workspace and worktree tables**

### Step 1.1: Add `agent` column to workspaces table
- New migration: `ALTER TABLE workspaces ADD COLUMN agent TEXT DEFAULT 'hermes';`
- Update `Workspace` DB struct with `agent: String` field
- Update `create_workspace` SQL to include agent
- Update `get_workspace` / `list_workspaces` SELECT queries to include agent

### Step 1.2: Add `color`, `icon`, `agent_type` columns to worktrees table
- New migration: three `ALTER TABLE worktrees ADD COLUMN` statements
- Update `Worktree` DB struct with `color: Option<String>`, `icon: Option<String>`, `agent_type: Option<String>`
- Update `create_worktree` SQL to include new columns
- Update all worktree SELECT queries to include new columns
- Update `WorktreeCreate` handler to persist color/icon/agent_type from the message

### Step 1.3: Add `update_workspace_settings` DB method
- New method: `update_workspace_settings(id, name, color, icon, worktree_base_dir, agent, settings_json)`
- Partial update — only modifies non-None fields
- Updates `updated_at` timestamp

### Step 1.4: Add `update_worktree_settings` DB method
- New method: `update_worktree_settings(id, color, icon, agent_type)`
- Partial update — only modifies non-None fields
- Updates `updated_at` timestamp

---

## Phase 2: Backend Protocol Types (Layer 2)
**Goal: Extend protocol structs to carry new fields**

### Step 2.1: Add `agent` field to `WorkspaceUpdate`
- Add `agent: Option<String>` to `WorkspaceUpdate` struct in `protocol/workspace.rs`

### Step 2.2: Add `agent` field to `WorkspaceData`
- Add `agent: Option<String>` to `WorkspaceData` struct in `protocol/workspace.rs`

### Step 2.3: Create `WorktreeUpdate` protocol type
- New struct `WorktreeUpdate` with: `worktree_id`, `color`, `icon`, `agent_type`, `request_id`
- New struct `WorktreeUpdated` with: `worktree: WorktreeData`

### Step 2.4: Extend `WorktreeData` with color/icon/agent_type
- Add `color: Option<String>`, `icon: Option<String>`, `agent_type: Option<String>` to `WorktreeData`

### Step 2.5: Add `WorktreeUpdate` and `WorktreeUpdated` to protocol module
- Export new types in `protocol/mod.rs`
- Add `WorktreeUpdate` variant to `ClientMessagePayload` enum
- Add `WorktreeUpdated` variant to `ServerMessagePayload` enum

---

## Phase 3: Backend State & Handlers (Layer 3)
**Goal: Implement handlers and extend in-memory state**

### Step 3.1: Extend `WorkspaceState` and `WorktreeState`
- Add `agent: Option<String>` to `WorkspaceState` in `state.rs`
- Add `color`, `icon`, `agent_type` to `WorktreeState` in `state.rs`
- Update `initialize_from_db` to load new fields

### Step 3.2: Implement `WorkspaceUpdate` handler
- New function `update()` in `workspace/mod.rs`
- Calls `db.update_workspace_settings()` with provided fields
- Updates in-memory state
- Broadcasts `WorkspaceUpdated` to all clients
- Replace `not_implemented` in router.rs with call to this handler

### Step 3.3: Implement `WorktreeUpdate` handler
- New function `update_settings()` in `worktree/mod.rs`
- Validates worktree exists
- Calls `db.update_worktree_settings()`
- Updates in-memory state
- Broadcasts `WorktreeUpdated` to all clients

### Step 3.4: Wire `WorktreeUpdate` in router
- Add `ClientMessagePayload::WorktreeUpdate(msg)` arm to router
- Returns `ServerMessagePayload::WorktreeUpdated` or `Error`

### Step 3.5: Update `workspace_data_from_db` and worktree conversion
- Map new `agent` field from DB struct to protocol struct
- Map new color/icon/agent_type fields from DB to protocol

### Step 3.6: Update `WorktreeCreate` to persist agent/color/icon
- Pass agent_type from message into DB record creation
- Support color/icon fields if provided in create message

---

## Phase 4: Frontend Types & Store (Layer 4)
**Goal: Update TypeScript types and Zustand store**

### Step 4.1: Regenerate TypeScript types
- Run `cargo build` to trigger ts_rs export of updated types
- Verify generated types in `apps/web/src/types/generated/`

### Step 4.2: Update frontend Workspace/Worktree interfaces
- Add `agent?: string` to `Workspace` interface in `types/state.ts`
- Add `color?`, `icon?`, `agentType?` to `Worktree` interface
- Add `WorktreeUpdate` message type in `types/protocol.ts`

### Step 4.3: Add worktree settings dialog state to store
- Add `worktreeSettingsDialog: { isOpen: boolean; worktreeId: string | null }` to store
- Add `setWorktreeSettingsDialogOpen(open, worktreeId)` action

### Step 4.4: Add store actions for updating worktree settings
- Add `updateWorktreeSettings(worktreeId, color?, icon?, agentType?)` action
- Sends `WorktreeUpdate` WebSocket message
- Handles `WorktreeUpdated` response, updates store

---

## Phase 5: Frontend Components (Layer 5)
**Goal: Build/modify dialogs and wire context menus**

### Step 5.1: Add agent selector to `WorkspaceSettingsDialog`
- Import agent options from CreateWorktreeDialog or create shared config
- Add RadioGroup for agent selection (hermes, claude, opencode, pi, none)
- Default to workspace's current agent or workspace default
- Include agent in `WorkspaceUpdate` message sent on save

### Step 5.2: Create `WorktreeSettingsDialog` component
- New file: `components/dialogs/WorktreeSettingsDialog.tsx`
- Follow same pattern as WorkspaceSettingsDialog
- Fields: color picker, icon selector, agent RadioGroup
- Name/branch/path shown as read-only
- Inherits defaults from parent workspace settings
- Sends `WorktreeUpdate` WebSocket message
- On success: closes dialog, shows notification

### Step 5.3: Wire `CreateWorktreeDialog` to context menu
- In `WorkspaceTree.tsx`, replace `prompt()` call with `setCreateWorktreeDialogOpen(true, workspaceId)`
- Auto-populate dialog with parent workspace settings (color, icon, agent)
- Pass workspace settings as props or read from store

### Step 5.4: Add "Edit Settings" to worktree context menu
- In `ContextMenu.tsx`, add `edit-worktree-settings` menu item
- Only shown for worktree items
- Triggers `setWorktreeSettingsDialogOpen(true, worktreeId)`

### Step 5.5: Mount `WorktreeSettingsDialog` in AppShell or root component
- Add dialog rendering alongside other dialogs
- Controlled by store state

---

## Phase 6: Testing & Verification (Layer 6)
**Goal: Verify end-to-end functionality**

### Step 6.1: Backend compilation
- `cargo check` and `cargo build` for ws-server

### Step 6.2: Frontend compilation
- TypeScript type checking
- Component compilation

### Step 6.3: Manual verification checklist
- Workspace settings (including agent) save and persist
- Worktree creation uses dialog with pre-filled workspace defaults
- Worktree settings dialog opens from context menu
- Worktree settings (color, icon, agent) save and persist
- Settings survive server restart (DB persistence)

---

## Dependencies & Ordering
```
Phase 1 (DB) → Phase 2 (Protocol) → Phase 3 (Handlers) → Phase 4 (TS Types) → Phase 5 (Components) → Phase 6 (Test)
```
Phases must be done in order. Within phases, steps are mostly independent except where noted.

## Risk Areas
1. **ts_rs type regeneration** — must rebuild Rust to regenerate TS types before frontend changes
2. **DB migration ordering** — new migrations append to SCHEMA_MIGRATIONS array
3. **Backward compatibility** — new columns have defaults, existing records unaffected
4. **WorkspaceUpdate handler** — largest single gap; this handler is the linchpin for workspace settings persistence
