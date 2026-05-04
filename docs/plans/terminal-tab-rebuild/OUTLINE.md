# Terminal Tab Rebuild — Implementation Outline

## Goal
Rebuild the terminal tab system with tab-session separation, configurable TTL (3min default), persistent history, and session lifecycle management (mount → resume/create, unmount → mark ended, close → kill).

---

## Architecture: Tab ↔ Session Separation

The fundamental change is decoupling **tab identity** from **PTY session identity**.

```
TerminalTab (client-owned UUID)
  ├── id: Uuid           // stable tab identity, persists across page refreshes
  ├── worktree_id: Uuid
  ├── label: String
  ├── position: u32
  ├── active_session_id: Option<Uuid>  // currently linked PTY session
  ├── status: TabStatus
  └── created_at: DateTime

PtySession (server-owned, transient)
  ├── id: Uuid           // PTY session identity, changes on respawn
  ├── tab_id: Uuid       // FK back to the tab that owns it
  ├── worktree_id: Uuid
  ├── shell: String
  ├── state: SessionState  // active | ended (unmounted) | expired (TTL)
  ├── started_at: DateTime
  └── ended_at: Option<DateTime>
```

### TabStatus (client-side)
- `active` — tab is open and visible
- `disconnected` — tab exists but no PTY session linked (TTL expired, needs respawn)

### SessionState (server-side)
- `active` — PTY process is running, receiving/sending data
- `ended` — component unmounted, PTY killed but tab still exists
- `expired` — TTL elapsed, PTY killed but tab still exists

---

## Phase 1: Database & Protocol Changes

### 1.1 Database Schema Migration
**File**: `crates/ws-server/src/db/mod.rs`

Changes to `terminal_sessions` table:
- Add `tab_id TEXT` — the stable tab identity
- Add `status TEXT DEFAULT 'active'` — active | ended | expired
- Add `ended_at TEXT` — when session ended/expired
- Add `ended_reason TEXT` — 'unmount' | 'ttl' | 'kill'
- Existing `id` becomes the PTY session ID (transient)
- `terminal_output.session_id` continues to reference the session `id` (for history replay)
- Add index on `tab_id` for efficient tab lookup

Migration SQL:
```sql
-- Rename conceptually: id is PTY session, add tab_id as stable anchor
ALTER TABLE terminal_sessions ADD COLUMN tab_id TEXT;
ALTER TABLE terminal_sessions ADD COLUMN status TEXT DEFAULT 'active';
ALTER TABLE terminal_sessions ADD COLUMN ended_at TEXT;
ALTER TABLE terminal_sessions ADD COLUMN ended_reason TEXT;
CREATE INDEX IF NOT EXISTS idx_terminal_sessions_tab ON terminal_sessions(tab_id);
-- Backfill: existing rows get tab_id = id (migration bridge)
UPDATE terminal_sessions SET tab_id = id WHERE tab_id IS NULL;
-- Update foreign key on terminal_output to use tab_id instead of session_id
-- (or keep session_id FK and use tab_id for logical grouping)
```

**Decision**: Keep `terminal_output.session_id` as-is (FK to terminal_sessions.id). History queries will use `tab_id` to fetch all output rows across all sessions for a given tab (JOIN terminal_sessions ON session_id).

### 1.2 New Protocol Types
**File**: `crates/ws-server/src/protocol/terminal.rs`

New client→server messages:
- `TerminalMount { tab_id, worktree_id, label?, shell? }` — component mount, find reserved or create session
- `TerminalUnmount { tab_id, session_id }` — component unmount, mark session ended
- `TerminalTabClose { tab_id }` — user explicitly closes the tab, kill session + cleanup

Modified messages:
- `TerminalCreate` — deprecated, replaced by `TerminalMount`
- `TerminalKill` — deprecated, replaced by `TerminalTabClose`
- `TerminalRequestHistory { tab_id, session_id, request_id, limit? }` — now uses `tab_id` for lookup
- `TerminalInput { session_id, data }` — unchanged (still needs active session_id)
- `TerminalResize { session_id, cols, rows }` — unchanged
- `TerminalRename { tab_id, new_label, request_id }` — uses `tab_id` instead of `session_id`
- `TerminalReorder { worktree_id, tab_ids[], request_id }` — uses `tab_ids` instead of `session_ids`

New server→client messages:
- `TerminalMounted { tab_id, session_id, worktree_id, label?, shell }` — session linked to tab
- `TerminalSessionEnded { tab_id, session_id, reason }` — session ended (TTL or unmount)
- `TerminalTabHistory { tab_id, data }` — history response (uses tab_id)
- `TerminalTabList { worktree_id, tabs: Vec<TabSessionData> }` — list tabs with active session info

Removed server→client messages:
- `TerminalCreated` — replaced by `TerminalMounted`
- `TerminalRemoved` — replaced by `TerminalTabClosed { tab_id }`

### 1.3 DB Layer Methods
**File**: `crates/ws-server/src/db/mod.rs`

New/modified methods:
- `create_terminal_tab(tab_id, worktree_id, label, shell)` — INSERT tab record
- `get_active_tab_session(tab_id)` — SELECT most recent active session for tab
- `get_ended_tab_session(tab_id)` — SELECT most recent ended session (for respawn context)
- `link_tab_session(tab_id, session_id)` — UPDATE tab's active session
- `end_tab_session(session_id, reason)` — UPDATE status + ended_at + ended_reason
- `close_terminal_tab(tab_id)` — end current session + mark tab closed
- `get_terminal_output_by_tab(tab_id, limit)` — JOIN output with sessions by tab_id
- `list_terminal_tabs(worktree_id)` — SELECT tabs with active session info

---

## Phase 2: Server-Side PTY Manager Changes

### 2.1 Configurable TTL
**File**: `crates/ws-server/src/pty/mod.rs`

- Replace `SESSION_TTL: Duration = Duration::from_secs(3600)` with configurable value
- Default: `Duration::from_secs(180)` (3 minutes)
- TTL can be read from config/env: `TERMINAL_SESSION_TTL_SECS`
- TTL check interval: reduce from 60s to 30s for tighter TTL enforcement
- On TTL expiry: kill PTY, update session status to 'expired', broadcast `TerminalSessionEnded`

### 2.2 Session Lifecycle in PtyManager

New methods:
- `reserve_session(tab_id, worktree_id, label, shell) -> (session_id, rx)` — creates PTY and links to tab
- `get_or_create_session(tab_id, worktree_id, label, shell) -> (session_id, rx)` — checks if active session exists for tab, creates if not
- `end_session(session_id, reason)` — kills PTY but keeps session record, marks ended
- `is_session_alive(session_id) -> bool` — checks if session exists and is not ended/expired

Modified methods:
- `spawn()` → renamed to `reserve_session()` — now accepts `tab_id` parameter
- `kill()` → split into `kill_session()` (full cleanup) and `end_session()` (graceful end, keep record)
- `check_ttl()` — on expiry, broadcasts `TerminalSessionEnded` instead of silent kill

### 2.3 Handler Rewrite
**File**: `crates/ws-server/src/pty/handler.rs`

- `handle_terminal_mount()` — new handler for mount flow:
  1. Check if tab exists in DB
  2. Check if active PTY session exists for tab
  3. If yes: return `TerminalMounted` with existing session_id
  4. If no: spawn new PTY, link to tab, return `TerminalMounted`
  5. Fetch and send history via `TerminalTabHistory`

- `handle_terminal_unmount()` — new handler:
  1. Mark session as 'ended' in DB
  2. Kill PTY process
  3. Broadcast `TerminalSessionEnded`

- `handle_terminal_tab_close()` — new handler (replaces kill):
  1. Kill PTY
  2. Remove session from in-memory state
  3. Delete tab record from DB (cascades to sessions)
  4. Broadcast `TerminalTabClosed`

- `handle_terminal_request_history()` — modified:
  1. Query by `tab_id` (JOIN terminal_sessions)
  2. Returns all output for the tab across all sessions

- `handle_terminal_input()` — modified:
  1. If session not found, return error (client should mount first)
  2. Update `last_activity` on successful write (for TTL)

### 2.4 Router Updates
**File**: `crates/ws-server/src/router.rs`

- Route `TerminalMount` → `handle_terminal_mount`
- Route `TerminalUnmount` → `handle_terminal_unmount`
- Route `TerminalTabClose` → `handle_terminal_tab_close`
- Route `TerminalRename` → uses `tab_id`
- Route `TerminalReorder` → uses `tab_ids`
- Route `TerminalRequestHistory` → uses `tab_id`

---

## Phase 3: Client-Side Changes

### 3.1 Zustand Store Updates
**File**: `apps/web/src/store.ts`

New terminal tab state shape:
```typescript
interface TerminalTabState {
  id: string;           // stable tab UUID
  worktreeId: string;
  label: string;
  position: number;
  activeSessionId: string | null;  // current PTY session
  status: 'active' | 'disconnected';
  createdAt: number;
}
```

New store actions:
- `addTerminalTab(tab)` — add a new tab
- `updateTerminalTab(tabId, updates)` — update tab fields
- `removeTerminalTab(tabId)` — remove tab
- `setTabSession(tabId, sessionId)` — link a PTY session to a tab
- `clearTabSession(tabId)` — unlink session (disconnected state)

Updated `handleBridgeMessage` for `terminal_event`:
- `TerminalMounted` → `addTerminalTab` + `setTabSession`
- `TerminalSessionEnded` → `clearTabSession`
- `TerminalTabClosed` → `removeTerminalTab`
- `TerminalTabList` → bulk sync tabs
- `TerminalTabHistory` → delivers to TerminalView via onMessage

### 3.2 TerminalPane Rewrite
**File**: `apps/web/src/components/terminal/TerminalPane.tsx`

Changes:
- Tabs now use `tab.id` as their identity (not `session_id`)
- `TerminalPanel` receives `tabId` + `activeSessionId`
- On mount with no tabs: send `TerminalMount` to create first tab
- On create new tab: send `TerminalMount { tab_id: newUuid(), ... }`
- On close tab: send `TerminalTabClose { tab_id }`
- On reorder: send `TerminalReorder { tab_ids: [...] }`
- Tab state restored from `tabStorage` (active tab ID per worktree)

### 3.3 TerminalView Rewrite
**File**: `apps/web/src/components/terminal/TerminalView.tsx`

Changes:
- Props: `tabId: string` + `sessionId: string` (both required)
- On mount:
  1. If `sessionId` is present and alive → request history with `TerminalRequestHistory { tab_id, session_id }`
  2. Write history to Ghostty terminal
  3. Subscribe to `TerminalOutput` for this session
- On unmount:
  1. Send `TerminalUnmount { tab_id, session_id }`
  2. Dispose Ghostty, clear buffers
- On `sessionId` change (session respawn after TTL):
  1. Request history from new session start point
  2. Subscribe to new session's output

### 3.4 Protocol Type Updates
**File**: `apps/web/src/types/protocol.ts`

- Export new types from Rust via ts-rs (auto-generated on build)
- Add `TerminalMount`, `TerminalUnmount`, `TerminalTabClose`, `TerminalMounted`, `TerminalSessionEnded`, `TerminalTabHistory`, `TerminalTabList`, `TerminalTabClosed`
- Update existing types to use `tabId` where appropriate

---

## Phase 4: Event Flow (New)

### 4.1 Tab Creation / First Mount
```
UI: TerminalPane -> generate tabId -> send TerminalMount { tabId, worktreeId, label }
  -> Server: handle_terminal_mount
    -> No existing session for tab -> pty_manager.reserve_session(tabId, ...)
    -> db.create_terminal_tab(tabId, ...)
    -> db.create_terminal_session(sessionId, tabId, ...)
    -> spawn_output_reader(sessionId, ...)
    -> response: TerminalMounted { tabId, sessionId, ... }
  -> Client: handleBridgeMessage -> addTerminalTab + setTabSession
  -> TerminalView mounts with sessionId -> requests TerminalRequestHistory
  -> Server: returns empty history (new session)
  -> Client: onMessage('TerminalTabHistory') -> safeWrite(terminal, data)
```

### 4.2 Component Unmount (Tab Still Exists)
```
UI: TerminalView unmounts -> send TerminalUnmount { tabId, sessionId }
  -> Server: handle_terminal_unmount
    -> pty_manager.end_session(sessionId, 'unmount')
    -> db.end_tab_session(sessionId, 'unmount')
    -> broadcast: TerminalSessionEnded { tabId, sessionId, reason: 'unmount' }
  -> Client: clearTabSession(tabId) -> tab status = 'disconnected'
```

### 4.3 Component Remount (After Page Refresh or Navigation)
```
UI: TerminalPane restores tabs from store/storage
    -> For each tab: checks if activeSessionId exists
    -> If activeSessionId set -> TerminalView mounts with existing sessionId
    -> If no activeSessionId -> sends TerminalMount { tabId } (tab already in DB)
  -> Server: handle_terminal_mount
    -> Finds tab in DB -> no active session -> reserve_session(tabId, ...)
    -> db.link_tab_session(tabId, newSessionId)
    -> response: TerminalMounted { tabId, sessionId, ... }
  -> Client: setTabSession(tabId, sessionId)
  -> TerminalView mounts -> requests history -> gets full tab history
```

### 4.4 TTL Expiry
```
Server: TTL checker runs (every 30s)
  -> Finds session with last_activity > 180s ago
  -> pty_manager.end_session(sessionId, 'ttl')
  -> db.end_tab_session(sessionId, 'ttl')
  -> broadcast: TerminalSessionEnded { tabId, sessionId, reason: 'ttl' }
  -> Client: clearTabSession(tabId) -> tab status = 'disconnected'

Later: User switches to tab or sends input
  -> If tab has no active session -> TerminalMount triggers new session spawn
  -> History is loaded from DB (all previous sessions' output for this tab)
```

### 4.5 Tab Close (Explicit Kill)
```
UI: TerminalPane.handleCloseTab(tabId)
  -> send TerminalTabClose { tabId }
  -> Server: handle_terminal_tab_close
    -> pty_manager.kill_session(sessionId)
    -> db.close_terminal_tab(tabId)  // deletes tab + cascades sessions
    -> broadcast: TerminalTabClosed { tabId }
  -> Client: removeTerminalTab(tabId) -> tab removed from UI
```

---

## Phase 5: Testing Strategy

### 5.1 Unit Tests (Rust)
- PtyManager: `reserve_session`, `end_session`, `is_session_alive`
- Handler: `handle_terminal_mount` (create new, resume existing, tab not found)
- Handler: `handle_terminal_unmount` (session ended, session not found)
- Handler: `handle_terminal_tab_close` (full cleanup)
- TTL: configurable value, expiry triggers correct broadcast
- DB: `get_terminal_output_by_tab` (multi-session history)

### 5.2 Integration Tests
- Full mount → input → output → unmount → remount → history cycle
- TTL expiry → auto-spawn on new mount
- Page refresh → tab state restoration → session resume
- Multiple tabs per worktree
- Tab close → full cleanup

### 5.3 E2E Tests
- Create tab → type command → see output → refresh page → verify history persists
- Create tab → wait 3min + input → verify new PTY spawned
- Create tab → unmount (navigate away) → remount → verify session resumed
- Close tab → verify tab removed from UI and DB

---

## Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| DB migration breaks existing sessions | High | Backfill tab_id = id for all existing rows; graceful fallback |
| History JOIN performance degrades | Medium | Add composite index on (tab_id, timestamp); limit history queries |
| Race condition: mount + TTL expire simultaneously | Medium | Atomic check-and-create in handler; lock on tab_id |
| ts-rs type export breaks TypeScript build | Low | Manual type definitions as fallback; regenerate on build |
| Ghostty WASM history replay with large output | Medium | Cap history at reasonable size (e.g. 100KB); progressive load |

---

## File Change Summary

| File | Change Type | Description |
|------|-------------|-------------|
| `crates/ws-server/src/db/mod.rs` | Modify | Schema migration, new tab methods |
| `crates/ws-server/src/pty/mod.rs` | Modify | Configurable TTL, session lifecycle |
| `crates/ws-server/src/pty/handler.rs` | Modify | New mount/unmount/close handlers |
| `crates/ws-server/src/protocol/terminal.rs` | Modify | New protocol types |
| `crates/ws-server/src/router.rs` | Modify | Route new messages |
| `apps/web/src/store.ts` | Modify | Tab state shape, new actions |
| `apps/web/src/components/terminal/TerminalPane.tsx` | Modify | Tab identity, mount/close flow |
| `apps/web/src/components/terminal/TerminalView.tsx` | Modify | Tab/session props, unmount handler |
| `apps/web/src/types/protocol.ts` | Modify | New type definitions |
| `apps/web/src/lib/yws-transport.ts` | No change | Already handles terminal_event |
