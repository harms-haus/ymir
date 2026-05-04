# Terminal Tab Research Report

## Overview

The ymir project has a fully functional terminal tab system spanning both server-side (Rust) and client-side (TypeScript/React). This report maps every component, data flow, and persistence mechanism.

---

## 1. Client-Side (TypeScript/React)

### 1.1 Components

| File | Purpose |
|------|---------|
| `apps/web/src/components/terminal/TerminalPane.tsx` | Main tab container. Manages tab list, active tab state, drag-and-drop reorder, close actions (click, middle-click, context menu), and auto-creation of first tab. Uses `@base-ui/react` Tabs. |
| `apps/web/src/components/terminal/TerminalView.tsx` | Ghostty-web wrapper component. Handles terminal init, resize, data routing, output buffering, sanitization of escape sequences, and history request on mount. |
| `apps/web/src/components/terminal/TerminalSkeleton.tsx` | Shimmer loading placeholder. |

### 1.2 Ghostty Integration

The `TerminalView.tsx` component uses `ghostty-web` (WASM-based terminal emulator):
- `init()` called as singleton via `initializeGhostty()` / `isGhosttyInitialized()`
- `GhosttyTerminal` constructor with font size, theme (bg/fg from CSS vars), font family
- `FitAddon` for auto-resizing
- `ResizeObserver` for container size changes
- `onData` -> sends `TerminalInput` via WebSocket
- `onResize` -> sends `TerminalResize` via WebSocket
- Sanitizes unterminated escape sequences (DCS, OSC, APC, PM, SOS) that crash the parser
- Max write size: 8192 bytes
- Output buffer for data arriving before Ghostty is ready

### 1.3 State Management

**Zustand Store (`store.ts`):**
- `terminalSessions: TerminalSessionState[]` — flat list of all sessions across worktrees
- Selector: `selectTerminalSessionsByWorktreeId(worktreeId)` — filters + sorts by position
- CRUD: `addTerminalSession`, `updateTerminalSession`, `removeTerminalSession`
- Terminal session state shape: `{ id, worktreeId, label, shell, createdAt, position? }`

**UI Store (`uiStore.ts`):**
- `activeTerminalTabIds: Record<string, string>` — maps worktreeId -> active session ID
- Persisted via `tabStorage.ts` (localStorage with per-browser-tab keys using sessionStorage tab ID)
- Actions: `setActiveTerminalTabId`, `removeActiveTerminalTabId`

### 1.4 TerminalPane Flow

1. **Auto-create**: On mount, if no sessions exist for the worktree, sends `TerminalCreate` with label "Terminal N"
2. **Tab sync**: Reads `terminalSessions` from store, maps to `{ sessionId, label, worktreeId }` tabs
3. **Active tab restoration**: Checks `uiStore.activeTerminalTabIds[worktreeId]` on session list changes
4. **Close tab**: Sends `TerminalKill` message with `sessionId`
5. **Reorder tabs**: Local reorder + sends `TerminalReorder` with new sessionIds order
6. **Context menu**: Close, Close Right, Close Left, Close Others (via `TabContextMenu`)

### 1.5 TerminalView Flow

1. **Mount**: Initialize Ghostty WASM, create terminal instance, attach FitAddon, observe container
2. **After init**: Sends `TerminalRequestHistory` with `sessionId`, `requestId`, `limit: 1000`
3. **Message subscriptions**: Registers `onMessage('TerminalHistory')` and `onMessage('TerminalOutput')` handlers
4. **Data input**: Ghostty `onData` -> `TerminalInput { sessionId, data }` -> `client.send()`
5. **Resize**: Ghostty `onResize` -> `TerminalResize { sessionId, cols, rows }` -> `client.send()`
6. **Unmount**: Dispose terminal, FitAddon, clear output buffer, unsubscribe handlers

---

## 2. Server-Side (Rust)

### 2.1 PTY Manager (`crates/ws-server/src/pty/mod.rs`)

**PtySession struct:**
- `id: Uuid`, `worktree_id: Uuid`, `shell: String`, `label: Option<String>`
- `start_time`, `last_activity: Arc<Mutex<Instant>>`
- `master: Box<dyn MasterPty>`, `writer`, `_process`, `tx: UnboundedSender<Vec<u8>>`
- Methods: `write()`, `read()`, `resize()`, `kill()`, `is_expired()`, `output_tx()`, `take_reader()`

**PtyManager struct:**
- `sessions: Arc<Mutex<HashMap<Uuid, Arc<Mutex<PtySession>>>>>`
- `output_readers: Arc<Mutex<HashMap<Uuid, JoinHandle<()>>>>`
- `_ttl_handle: JoinHandle<()>` — background TTL checker
- `MAX_SESSIONS_PER_WORKTREE: usize = 10`
- `SESSION_TTL: Duration = 3600s (1 hour)` — NOTE: Not 3min as the prompt requests
- `TTL_CHECK_INTERVAL: Duration = 60s`
- Methods: `new()`, `spawn()`, `get_session()`, `write()`, `resize()`, `kill()`, `register_output_reader()`, `cleanup_on_disconnect()`, `session_count()`, `get_worktree_sessions()`

**Shell detection**: Prefers provided shell, falls back to `/bin/bash`, `/bin/zsh`, `/bin/sh`

### 2.2 Output Reader (`crates/ws-server/src/pty/output.rs`)

- Spawns a `tokio::spawn` task per session
- Reads from PTY master in 4096-byte chunks with 100ms timeout on WouldBlock
- Handles partial UTF-8 with `split_at_valid_utf8()` and leftover byte accumulation
- On each valid read:
  1. Broadcasts `ServerMessagePayload::TerminalOutput` to all clients
  2. Spawns async task to `db.append_terminal_output(session_id, data)`
- On EOF or error: exits loop

### 2.3 Handlers (`crates/ws-server/src/pty/handler.rs`)

| Handler | Input | Action | Response |
|---------|-------|--------|----------|
| `handle_terminal_create` | `TerminalCreate` | Spawn PTY, register output reader, save to DB, save to in-memory state | `TerminalCreated` |
| `handle_terminal_input` | `TerminalInput` | Write data to PTY session | `Ack` |
| `handle_terminal_resize` | `TerminalResize` | Resize PTY + send SIGWINCH | `Ack` |
| `handle_terminal_kill` | `TerminalKill` | Kill PTY, remove from in-memory state, delete from DB (session + output) | `TerminalRemoved` broadcast + `Ack` |
| `handle_terminal_request_history` | `TerminalRequestHistory` | Query `db.get_terminal_output_history()` | `TerminalHistory` |

**Note**: `handle_terminal_rename` and `handle_terminal_reorder` are defined in `router.rs`, not in `handler.rs`.

### 2.4 Router Handlers (in `router.rs`)

- `handle_terminal_rename`: Updates label in DB + in-memory state, broadcasts `TerminalUpdated`
- `handle_terminal_reorder`: Updates positions in DB for each session, broadcasts `TerminalUpdated` for each with new position

### 2.5 Protocol Types (`crates/ws-server/src/protocol/terminal.rs`)

**Client -> Server:**
- `TerminalInput { session_id, data }`
- `TerminalResize { session_id, cols, rows }`
- `TerminalCreate { worktree_id, label?, shell? }`
- `TerminalKill { session_id }`
- `TerminalRename { session_id, new_label, request_id }`
- `TerminalReorder { worktree_id, session_ids[], request_id }`
- `TerminalRequestHistory { session_id, request_id, limit? }`

**Server -> Client:**
- `TerminalOutput { session_id, data }`
- `TerminalCreated { session_id, worktree_id, label?, shell }`
- `TerminalRemoved { session_id }`
- `TerminalUpdated { session_id, worktree_id, label?, position?, request_id }`
- `TerminalHistory { session_id, data }`
- `TerminalSessionData { id, worktree_id, label?, shell, created_at }` (for snapshots)

### 2.6 Database (`crates/ws-server/src/db/mod.rs`)

**Tables:**
- `terminal_sessions`: `id PK, worktree_id FK, label, shell, created_at, position, updated_at`
- `terminal_output`: `id PK AUTOINCREMENT, session_id FK, data, timestamp`
  - Indexed on `session_id` and `timestamp`

**Methods:**
- `create_terminal_session()` — INSERT
- `get_terminal_session()` — SELECT by ID
- `list_terminal_sessions(worktree_id)` — SELECT ordered by position
- `list_all_terminal_sessions()` — SELECT all ordered by position
- `delete_terminal_session()` — DELETE
- `update_terminal_label()` — UPDATE label
- `update_terminal_position()` — UPDATE position
- `clear_all_terminal_sessions()` — DELETE all
- `append_terminal_output()` — INSERT output row
- `get_terminal_output_history(session_id, limit)` — SELECT ordered by id ASC
- `delete_terminal_output(session_id)` — DELETE all output for session

### 2.7 AppState (`crates/ws-server/src/state.rs`)

- `terminals: RwLock<HashMap<Uuid, TerminalState>>` — in-memory registry
- `TerminalState { id, worktree_id, label, shell }`
- `pty_manager: Option<Arc<PtyManager>>` — optional PTY manager

### 2.8 AppState Construction

- `AppState::new()` — no PTY manager
- `AppState::with_pty_manager()` — includes PTY manager
- `AppState::with_acp()` — includes ACP runtime + PTY manager (production path)

---

## 3. Transport Layer (yws-transport)

### 3.1 YmirWsTransport (`apps/web/src/lib/yws-transport.ts`)

- Wraps `TransportClient` from `@harms-haus/acp-ws-bridge`
- Encodes outgoing messages via `encodeClientMessage()` into BridgeEnvelope format
- Decodes incoming BridgeEnvelopes via `decodeBridgeJson()`
- Terminal messages travel through `terminal_event` BridgeMessage type
- `dispatchOnMessageHandlers()` reconstructs PascalCase message types from envelope payloads
- `onMessage<T>()` subscription pattern for typed message handlers
- Message queueing for offline messages, flushed on reconnect
- Heartbeat Ping/Pong with timeout

### 3.2 Bridge Envelope Flow

```
Client Message (e.g. TerminalCreate)
  -> encodeClientMessage() -> BridgeEnvelope { version, seq, timestamp_ms, type: "client_request", payload: { originalType: "TerminalCreate", data: {...} } }
  -> WebSocket -> Server
  
Server Response (e.g. TerminalCreated)
  -> ServerMessagePayload::TerminalCreated
  -> BridgeEnvelope { type: "terminal_event", payload: { type: "TerminalCreated", data: {...} } }
  -> WebSocket -> Client
  -> decodeBridgeJson() -> dispatchOnMessageHandlers() -> onMessage('TerminalCreated') handler
```

### 3.3 Store Message Handling (`store.ts` handleBridgeMessage)

Terminal events processed in `case 'terminal_event':`:
- `TerminalCreated` -> `addTerminalSession()`
- `TerminalRemoved` -> `removeTerminalSession()`
- `TerminalUpdated` -> `updateTerminalSession()` (label and/or position)
- `TerminalOutput` / `TerminalHistory` -> No store mutation (delivered via `onMessage` to TerminalView)

---

## 4. Complete Event Flow: UI -> Transport -> Server -> PTY -> Transport -> UI

### 4.1 Terminal Creation
```
UI: TerminalPane.handleCreateTab() 
  -> client.send({ type: 'TerminalCreate', worktreeId, label })
  -> YmirWsTransport.sendRaw() 
  -> encodeClientMessage() -> BridgeEnvelope -> WebSocket
  -> Server: route_json_message() -> route_message() -> ClientMessagePayload::TerminalCreate
  -> handle_terminal_create()
    -> pty_manager.spawn(worktree_id, path, label, shell) -> (session_id, rx)
    -> spawn_output_reader(session_id, reader, state) -> broadcasts TerminalOutput
    -> db.create_terminal_session()
    -> state.terminals.insert(session_id, TerminalState)
    -> response: ServerMessagePayload::TerminalCreated
  -> BridgeEnvelope { type: "terminal_event" } -> WebSocket
  -> Client: decodeBridgeJson() -> handleBridgeMessage('terminal_event')
    -> useStore.getState().addTerminalSession({ id, worktreeId, label, shell, createdAt })
  -> TerminalPane: terminalSessions changes -> new tab appears
  -> TerminalView: mounts -> requests TerminalRequestHistory
```

### 4.2 Terminal Input
```
UI: Ghostty.onData(data) 
  -> client.send({ type: 'TerminalInput', sessionId, data })
  -> Server: handle_terminal_input() -> pty_manager.write(session_id, data)
  -> response: Ack
```

### 4.3 Terminal Output
```
PTY: output_reader reads data from PTY master
  -> state.broadcast(ServerMessagePayload::TerminalOutput { session_id, data })
  -> db.append_terminal_output(session_id, data)
  -> BridgeEnvelope { type: "terminal_event" } -> WebSocket
  -> Client: dispatchOnMessageHandlers() -> onMessage('TerminalOutput') handler
  -> TerminalView: safeWrite(terminal, data) -> renders in Ghostty
```

### 4.4 Terminal History (Page Refresh Recovery)
```
UI: TerminalView mount -> after Ghostty init
  -> client.send({ type: 'TerminalRequestHistory', sessionId, requestId, limit: 1000 })
  -> Server: handle_terminal_request_history()
    -> db.get_terminal_output_history(session_id, limit) -> Vec<String>
    -> combined = history.join("")
    -> response: ServerMessagePayload::TerminalHistory { session_id, data: combined }
  -> Client: onMessage('TerminalHistory') -> safeWrite(terminal, msg.data)
```

### 4.5 Terminal Kill
```
UI: TerminalPane.handleCloseTab(sessionId)
  -> client.send({ type: 'TerminalKill', sessionId })
  -> Server: handle_terminal_kill()
    -> pty_manager.kill(session_id)
    -> state.terminals.remove(session_id)
    -> db.delete_terminal_session(session_id)
    -> db.delete_terminal_output(session_id)
    -> broadcast: ServerMessagePayload::TerminalRemoved { session_id }
    -> response: Ack
  -> Client: handleBridgeMessage -> removeTerminalSession(sessionId)
  -> TerminalPane: tab removed from UI
```

---

## 5. ACP Terminal Types (What NOT to Use)

The ACP system has its own terminal model in `@harms-haus/acp-chat-core`:
- `CreateTerminalRequest` / `CreateTerminalResponse` — agent-initiated terminal creation
- `TerminalCreateHandler` — callback subscribed via `controller.subscribeToTerminalCreate()`
- Types imported from `@harms-haus/acp-chat-core` in `acp-session-manager.ts`

The ACP terminal flow is: agent requests terminal/create JSON-RPC -> SessionController calls handler -> `handleAcpTerminalCreate()` in yws-transport -> sends `TerminalCreate` through ymir's existing PTY system.

**Key distinction**: ACP terminals are agent-requested and use the same underlying PTY system. They should NOT be conflated with the user-initiated terminal tabs. The rebuild should use ymir's native PTY protocol types, not ACP terminal types.

---

## 6. Current Gaps vs Requirements

| Requirement | Current State | Gap |
|------------|--------------|-----|
| PTY sessions on server via yws-transport | Done | - |
| Tab-session synchronization | Tabs = sessions (1:1 mapping) | Sessions are server-side UUIDs; tabs derive from store |
| Recovery from page refresh | History requested on mount | No session resume logic — always requests history but PTY may be dead |
| History tracking per tab | `terminal_output` table | History tied to PTY session, deleted on kill |
| Session lifecycle (mount/unmount) | TerminalView requests history on mount | No explicit "session still alive" check on remount |
| Inactivity timeout (3min default) | TTL is 3600s (1hr), checked every 60s | Wrong timeout value; no auto-spawn on new events after TTL |
| History persistence separate from PTY lifecycle | History deleted on `TerminalKill` | **Critical**: `handle_terminal_kill` calls `db.delete_terminal_output()` |
| Component mount: find reserved session or create | Always creates new | No reserved/pre-warmed session concept |

---

## 7. File Inventory

### Client-Side
- `apps/web/src/components/terminal/TerminalPane.tsx` — Tab UI component
- `apps/web/src/components/terminal/TerminalView.tsx` — Ghostty wrapper
- `apps/web/src/components/terminal/TerminalSkeleton.tsx` — Loading skeleton
- `apps/web/src/components/terminal/__tests__/TerminalPane.test.tsx` — Tests
- `apps/web/src/components/terminal/__tests__/Terminal.test.tsx` — Tests
- `apps/web/src/styles/terminal.css` — Terminal styles
- `apps/web/src/store.ts` — Zustand store (terminal session CRUD + message handling)
- `apps/web/src/uiStore.ts` — UI state (active terminal tab persistence)
- `apps/web/src/lib/tabStorage.ts` — Per-browser-tab localStorage key generation
- `apps/web/src/lib/yws-transport.ts` — WebSocket transport + BridgeEnvelope handling
- `apps/web/src/types/protocol.ts` — Client-side protocol type definitions
- `apps/web/src/types/state.ts` — AppState type definitions
- `apps/web/src/types/bridge-envelope.ts` — BridgeEnvelope/BridgeMessage types

### Server-Side
- `crates/ws-server/src/pty/mod.rs` — PtyManager and PtySession
- `crates/ws-server/src/pty/handler.rs` — Terminal message handlers
- `crates/ws-server/src/pty/output.rs` — PTY output reader task
- `crates/ws-server/src/protocol/terminal.rs` — Terminal protocol types
- `crates/ws-server/src/protocol/mod.rs` — Protocol module exports
- `crates/ws-server/src/router.rs` — Message routing + terminal rename/reorder handlers
- `crates/ws-server/src/state.rs` — AppState with terminals registry
- `crates/ws-server/src/db/mod.rs` — Database layer (terminal_sessions + terminal_output tables)

### ACP (Reference Only — NOT to be used)
- `crates/ws-server/src/protocol/acp.rs` — ACP event types
- `crates/acp-ws-bridge/src/contract/message.rs` — BridgeMessage types
- `apps/web/src/lib/acp-session-manager.ts` — ACP session manager
- `apps/web/src/components/agent/AgentPane.tsx` — Agent tab pattern (reference for tab UI)
