# Draft: WebSocket Core Refactor

## Current Architecture Analysis

### Rust Backend (Tauri 2)
- **Entry Points**: `src-tauri/src/main.rs` → `lib.rs::run()`
- **State**: In-memory DashMap (`PtyState`) with PTY sessions
- **Commands** (23 total, some to remove):
  - **KEEP**: PTY commands (`spawn_pty`, `write_pty`, `resize_pty`, `kill_pty`)
  - **KEEP**: Git commands (`get_git_status`, `stage_file`, etc.)
  - **REMOVE**: Pane commands (`create_pane_in_workspace`, `close_pane`, `focus_pane`)
  - **REMOVE**: Tab commands (currently in frontend, will move to WebSocket)
- **Storage**: Currently NONE - uses Tauri key-value store (`@tauri-apps/plugin-store`)

### Frontend (React + Zustand)
- **State Management**: Zustand with Immer middleware
- **Current State**: Workspaces → Panes → Tabs tree structure
- **Persistence**: Tauri store adapter → `workspace-storage.json`
- **Terminal**: Ghostty-web WASM with Tauri Channel for PTY events

## Requirements Confirmed

### 1. Communication Architecture
- **All communication** via WebSocket (no Tauri invoke for state changes)
- **All state** lives in Turso databases
- Frontend becomes thin client - only UI rendering

### 2. Storage Locations
- **Workspace storage**: `[workspace directory]/.ymir/workspace.db` (Turso)
- **User/Central storage**: `~/.config/ymir/state.db` (Turso)

### 3. Two Execution Modes
- `ymir web --host 127.0.0.1 --port 7139` - Standalone server + open browser. Default host/port shown as flags on this command, but are not necessary unless the user wants to make a change
- `ymir` - Tauri app with embedded core service + WebSocket connection

### 4. Commands to Remove
- All layout manipulation: `splitPane`, `closePane`, `createTab`, `closeTab`
- Clean break - no backwards compatibility needed

### 5. React Service
- WebSocket client service in React app
- Subscribe to state changes
- Send commands to core service

## Technical Decisions Needed

### WebSocket Library Choice
**Recommended**: `axum` + `tokio-tungstenite`
- Axum provides HTTP server foundation
- Built-in WebSocket support
- Request routing for HTTP endpoints (health checks, etc.)
- Easy integration with Tower middleware

**Alternative**: `tokio-tungstenite` standalone
- Simpler, lighter weight
- No HTTP server features (may need separate HTTP for browser mode)

### Turso/libSQL Client
**Recommended**: `libsql-client-rs`
- Official Turso client
- Async support via tokio
- Connection pooling
- Supports both local SQLite and remote Turso

### Message Protocol
**Recommended**: JSON-RPC 2.0 over WebSocket
- Standard request/response pattern
- Built-in error handling
- Easy correlation IDs for async responses
- Broadcast support via `notification` method

### State Synchronization
**Recommended**: Event-sourced approach
- Core service is single source of truth
- Frontend subscribes to state events
- Optimistic UI updates with rollback on error

## Decisions Confirmed

### Architecture Decisions
1. **State Schema**: Normalized (separate tables) ✅
2. **Authentication**: Password system with `--password` flag ✅
3. **Migration**: Fresh start (clean break) ✅
4. **Git Operations**: Core service (no browser filesystem access) ✅
5. **Tab Types**: **Terminal only** - Browser tabs removed for now
6. **Scrollback Storage**: Turso until tab closed, then deleted ✅
7. **Git Polling**: Server-side with push updates ✅

### PTY Lifecycle (Optimized)
**Command Flow:**
```
Client Request                    Server Action
────────────────────────────────────────────────────
tab.create { workspace_id }  →    1. Create tab in DB
                                 2. Spawn PTY with default CWD
                                 3. Bind PTY session to tab_id
                                 4. Start streaming output
                                 5. Return tab { id, session_id }

pty.connect { tab_id }       →    1. Lookup existing PTY session
                                 2. Subscribe client to output stream
                                 3. Return session info

pty.write { tab_id, data }   →    1. Write to PTY master

pty.resize { tab_id, cols,   →    1. Resize PTY
            rows }

tab.close { tab_id }         →    1. Kill PTY process
                                 2. Delete scrollback from DB
                                 3. Delete tab from DB
                                 4. Broadcast tab.closed event

────────────────────────────────────────────────────
**All PTY spawn happens automatically on tab.create**
**No separate pty.spawn command needed**
```

**Database Schema:**
```sql
CREATE TABLE tabs (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  pane_id TEXT NOT NULL,
  title TEXT DEFAULT 'bash',
  cwd TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
  FOREIGN KEY (pane_id) REFERENCES panes(id) ON DELETE CASCADE
);

CREATE TABLE pty_sessions (
  id TEXT PRIMARY KEY,
  tab_id TEXT NOT NULL UNIQUE,  -- 1:1 relationship
  pid INTEGER,
  cwd TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (tab_id) REFERENCES tabs(id) ON DELETE CASCADE
);

CREATE TABLE scrollback (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tab_id TEXT NOT NULL,
  line_number INTEGER,
  content TEXT,
  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (tab_id) REFERENCES tabs(id) ON DELETE CASCADE
);

CREATE INDEX idx_scrollback_tab ON scrollback(tab_id, line_number);
```

### Tab/PTY Lifecycle Flow
1. **Creation**:
   - Client: `tab.create { workspace_id, pane_id }`
   - Server: Create tab → Spawn PTY → Store session → Stream starts
   - Server → Client: `tab.created { tab: Tab, session_id }`

2. **Connection**:
   - Client: `pty.connect { tab_id }`
   - Server: Lookup session → Subscribe to output → Send recent scrollback
   - Server → Client: `pty.connected { session_id }` + `scrollback.batch { lines }`

3. **Operation**:
   - Client: `pty.write { tab_id, data }`
   - Server → All clients: `pty.output { tab_id, data }`
   - Server: Store output in scrollback table

4. **Closure**:
   - Client: `tab.close { tab_id }`
   - Server: Kill PTY → Delete scrollback → Delete tab → Broadcast
   - Server → Client: `tab.closed { tab_id }` (confirmation)

## Scope Boundaries

### IN SCOPE
- WebSocket server with message protocol
- Turso database schema and client
- Core service binary (standalone mode)
- Tauri integration (embedded mode)
- React WebSocket client service
- State synchronization protocol
- Database migrations
- Remote access through `--host [host ip]` and `--port [port id]`

### OUT OF SCOPE
- Layout commands (explicitly removed)
- Backwards compatibility
- Data migration from existing storage

## Research Findings

### Tauri + Embedded Service Pattern
- Use Cargo workspace: `ymir-core`, `ymir-server`, `ymir-tauri`
- Shared core library with both binaries
- Tauri spawns sidecar process for server
- Use `webbrowser` crate to open browser in standalone mode

### WebSocket Patterns
- Request/response correlation via UUID
- Broadcast channels for multi-client sync
- Connection state management
- Reconnection with exponential backoff

### Turso Integration
- Local SQLite files with libSQL extensions
- Schema migrations via SQL files
- Async client with connection pooling
- Same API for local and remote (when needed)

## Files to Analyze
- `/home/blake/Documents/software/ymir/src-tauri/src/commands.rs` - Commands to keep/remove
- `/home/blake/Documents/software/ymir/src-tauri/src/state.rs` - Current state structure
- `/home/blake/Documents/software/ymir/src/state/workspace.ts` - Frontend state (becomes server-side)
- `/home/blake/Documents/software/ymir/src/components/Terminal.tsx` - Channel usage to replace

## Next Steps
- Answer open questions
- Consult Metis for gap analysis
- Generate comprehensive work plan
