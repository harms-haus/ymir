# WebSocket Core Refactor - Comprehensive Work Plan

## TL;DR

> **Objective**: Refactor Ymir to use a WebSocket-based core service with Turso databases for ALL state and communication.
>
> **Deliverables**:
> - Rust core service with WebSocket server (axum + tokio-tungstenite)
> - Turso database schema and client (normalized: workspaces, panes, tabs, pty_sessions, scrollback)
> - Two execution modes: standalone server (`ymir web`) and Tauri embedded
> - React WebSocket client service with reconnection
> - Password authentication for remote hosting
> - PTY auto-spawn on tab creation with tab_id binding
>
> **Estimated Effort**: Large (~40+ tasks)
> **Parallel Execution**: YES - 5 waves with 5-8 tasks each
> **Critical Path**: Core Types → Database Schema → WebSocket Server → React Client → Integration

---

## Context

### Original Request
User wants to move ALL communication and state to a WebSocket-based core service:
1. All communication via WebSocket (no Tauri invoke for state changes)
2. All state in Turso databases
3. Workspace storage: `.ymir/workspace.db`
4. User storage: `~/.config/ymir/state.db`
5. Two modes: `ymir web` (standalone + browser) and `ymir` (Tauri embedded)
6. React WebSocket client service
7. Remove layout commands (splitPane, closePane, createTab, closeTab)
8. Clean break - no backwards compatibility

### Current Architecture
- Rust Tauri app with 23 commands (PTY, Git, Pane management)
- Frontend: React + Zustand + Tauri storage persistence
- Terminal: Ghostty-web WASM with Tauri Channels
- No database - only key-value JSON storage

### Metis Review Findings
**Gaps Addressed**:
1. Scrollback batching: 50 lines or 500ms (not per-line)
2. Chunked storage: 1000 lines per chunk with indexing
3. WebSocket reconnection: exponential backoff
4. Authorization: single password with `--password` flag
5. Orphaned data cleanup: cascade delete on tab close
6. Dual-mode path resolution: Tauri vs standalone path handling

**Guardrails Applied**:
- Keep Ghostty-web WASM (adapt to WebSocket)
- Terminal tabs only (remove browser tabs)
- Normalized database schema
- No backwards compatibility
- Clean break from existing state

---

## Work Objectives

### Core Objective
Build a WebSocket-based core service that is the single source of truth for ALL Ymir state, supporting both standalone server mode and Tauri embedded mode, with Turso databases for persistence.

### Concrete Deliverables
1. `ymir-core` crate: Shared types, database client, WebSocket protocol
2. `ymir-server` crate: Standalone WebSocket server binary
3. `ymir-tauri` crate: Tauri app with embedded core service
4. Turso database migrations (workspaces, panes, tabs, pty_sessions, scrollback, git_repos)
5. React WebSocket client service
6. Password authentication system
7. WebSocket message protocol (JSON-RPC 2.0)

### Definition of Done
- [ ] `cargo run -p ymir-server -- web` starts server and opens browser
- [ ] `cargo tauri dev` starts Tauri app with embedded service
- [ ] All state operations go through WebSocket (no Tauri invoke for state)
- [ ] Terminal tabs work: create, connect, write, resize, close
- [ ] Git operations work via WebSocket commands
- [ ] WebSocket reconnection restores state
- [ ] Password auth works for remote hosting

### Must Have
- WebSocket server with JSON-RPC 2.0 protocol
- Turso database with normalized schema
- Two execution modes (standalone + embedded)
- React WebSocket client with reconnection
- PTY auto-spawn on tab creation
- Password authentication
- Scrollback batching (50 lines or 500ms)
- Tab/PTY lifecycle: create → spawn → connect → close → cleanup

### Must NOT Have (Guardrails)
- NO Tauri invoke for state-changing operations
- NO browser tabs (terminal only)
- NO layout commands (splitPane, closePane, etc.)
- NO backwards compatibility with existing storage
- NO data migration from workspace-storage.json
- NO per-line scrollback writes (batch only)
- NO localStorage or Tauri store for state

---

## Verification Strategy

### Test Decision
- **Infrastructure exists**: NO (new project structure)
- **Automated tests**: Tests after implementation
- **Framework**: Rust: built-in test + tokio-test, TS: Vitest
- **Agent-Executed QA**: MANDATORY for all tasks

### QA Policy
Every task includes agent-executed QA scenarios:
- **Frontend/UI**: Playwright - navigate, interact, assert DOM, screenshot
- **CLI/Server**: tmux/Bash - run commands, validate output, check exit codes
- **API/WebSocket**: Bash (wscat/custom client) - send messages, assert responses
- **Database**: SQL queries - verify schema, data integrity

Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Foundation - types + schema):
├── Task 1: Cargo workspace structure [quick]
├── Task 2: Core types and protocol [quick]
├── Task 3: Turso database schema [unspecified-high]
└── Task 4: Migration scripts [quick]

Wave 2 (Core Service - database + PTY):
├── Task 5: Database client and connection pooling [unspecified-high]
├── Task 6: PTY session manager (adapt from existing) [unspecified-high]
├── Task 7: Scrollback batching service [unspecified-high]
└── Task 8: Git service (move from Tauri commands) [unspecified-high]

Wave 3 (WebSocket Server - protocol + handlers):
├── Task 9: WebSocket server setup (axum) [unspecified-high]
├── Task 10: Message protocol (JSON-RPC 2.0) [quick]
├── Task 11: Workspace handlers [unspecified-high]
├── Task 12: Pane handlers [unspecified-high]
├── Task 13: Tab/PTY handlers (auto-spawn) [unspecified-high]
├── Task 14: Git handlers [unspecified-high]
└── Task 15: Authentication middleware [unspecified-high]

Wave 4 (Execution Modes - server + tauri):
├── Task 16: Standalone server binary (ymir-server) [unspecified-high]
├── Task 17: Tauri embedded service [unspecified-high]
├── Task 18: CLI argument parsing (clap) [quick]
├── Task 19: Browser spawning [quick]
└── Task 20: Sidecar configuration [quick]

Wave 5 (React Client - WebSocket service):
├── Task 21: WebSocket client service [unspecified-high]
├── Task 22: Reconnection logic [unspecified-high]
├── Task 23: State subscription hooks [unspecified-high]
├── Task 24: Terminal adapter (Ghostty-web integration) [unspecified-high]
├── Task 25: Workspace sidebar integration [unspecified-high]
└── Task 26: Git panel integration [unspecified-high]

Wave 6 (Cleanup - remove old code):
├── Task 27: Remove Tauri pane commands [quick]
├── Task 28: Remove Zustand workspace store [quick]
├── Task 29: Remove Tauri storage adapter [quick]
├── Task 30: Remove browser tab support [quick]
└── Task 31: Update documentation [writing]

Wave FINAL (Verification - 4 parallel reviews):
├── Task F1: Plan compliance audit (oracle)
├── Task F2: Code quality review (unspecified-high)
├── Task F3: Integration testing (unspecified-high)
└── Task F4: Performance testing (unspecified-high)

Critical Path: Task 1 → Task 2 → Task 3 → Task 5 → Task 9 → Task 13 → Task 21 → Task 24 → F1-F4
Parallel Speedup: ~70% faster than sequential
Max Concurrent: 4-7 tasks per wave
```

### Dependency Matrix
| Task | Depends On | Blocks |
|------|-----------|--------|
| 1 | - | 2, 3, 4, 5 |
| 2 | 1 | 5, 10, 11, 12, 13 |
| 3 | 1 | 5 |
| 4 | 1 | - |
| 5 | 2, 3 | 6, 7, 8, 9, 11, 12, 13, 14 |
| 6 | 5 | 13 |
| 7 | 5 | 13 |
| 8 | 5 | 14 |
| 9 | 2, 5 | 10, 11, 12, 13, 14, 15, 16, 17 |
| 10 | 9 | 11, 12, 13, 14, 15 |
| 11 | 5, 9, 10 | 21 |
| 12 | 5, 9, 10 | 21 |
| 13 | 5, 6, 7, 9, 10 | 21, 24 |
| 14 | 5, 8, 9, 10 | 21, 26 |
| 15 | 9, 10 | 16, 17 |
| 16 | 9, 10, 15 | - |
| 17 | 9, 10, 15 | - |
| 18 | - | 16 |
| 19 | - | 16 |
| 20 | - | 17 |
| 21 | 9, 10, 11, 12, 13, 14 | 22, 23, 24, 25, 26 |
| 22 | 21 | 23, 24, 25, 26 |
| 23 | 21, 22 | 24, 25, 26 |
| 24 | 13, 21, 22, 23 | - |
| 25 | 11, 21, 22, 23 | - |
| 26 | 14, 21, 22, 23 | - |
| 27-31 | All above | - |
| F1-F4 | All implementation | - |

### Agent Dispatch Summary
- **Wave 1**: T1 → `quick`, T2 → `quick`, T3 → `unspecified-high`, T4 → `quick`
- **Wave 2**: T5 → `unspecified-high`, T6 → `unspecified-high`, T7 → `unspecified-high`, T8 → `unspecified-high`
- **Wave 3**: T9 → `unspecified-high`, T10 → `quick`, T11-15 → `unspecified-high`
- **Wave 4**: T16 → `unspecified-high`, T17 → `unspecified-high`, T18-20 → `quick`
- **Wave 5**: T21-26 → `unspecified-high` (all can parallel within wave after T21)
- **Wave 6**: T27-31 → `quick`/`writing`
- **Wave FINAL**: F1 → `oracle`, F2 → `unspecified-high`, F3 → `unspecified-high`, F4 → `unspecified-high`

---

## TODOs

### Wave 1: Foundation

- [x] **1. Cargo Workspace Structure**

**What to do**:
- Create new Cargo workspace at project root
- Create three crates: `ymir-core`, `ymir-server`, `ymir-tauri`
- Move existing Tauri code to `ymir-tauri`
- Set up workspace dependencies in root Cargo.toml
- Configure cross-compilation targets for sidecar binaries

**Must NOT do**:
- Don't modify existing src-tauri yet (will move in later task)
- Don't add WebSocket or database dependencies yet

**Recommended Agent Profile**:
- **Category**: `quick`
- **Reason**: File structure and Cargo.toml configuration only
- **Skills**: None required

**Parallelization**:
- **Can Run In Parallel**: YES (Wave 1 starter)
- **Blocks**: Tasks 2, 3, 4, 5
- **Blocked By**: None

**References**:
- Pattern: Rust workspace structure from Tauri docs
- API: Cargo workspace documentation

**Acceptance Criteria**:
- [ ] `Cargo.toml` at root with workspace.members = ["ymir-core", "ymir-server", "ymir-tauri"]
- [ ] Each crate has its own Cargo.toml with proper dependencies
- [ ] `cargo check` passes at workspace root
- [ ] Directory structure matches plan

**QA Scenarios**:
```
Scenario: Workspace compiles
Tool: Bash
Preconditions: Rust toolchain installed
Steps:
  1. cd /home/blake/Documents/software/ymir
  2. cargo check --workspace
Expected: No errors, workspace members recognized
Evidence: .sisyphus/evidence/task-1-workspace-compile.txt
```

**Commit**: YES
- Message: `chore(workspace): initialize cargo workspace structure`
- Files: `Cargo.toml`, `ymir-core/Cargo.toml`, `ymir-server/Cargo.toml`, `ymir-tauri/Cargo.toml`

---

- [x] **2. Core Types and Protocol**

**What to do**:
- Define shared types in `ymir-core/src/types.rs`:
  - Workspace, Pane, Tab structs
  - WebSocket message types (Request, Response, Notification)
  - JSON-RPC 2.0 envelope types
  - Error types
- Define protocol constants (buffer sizes, chunk sizes)
- Add serde derives for all types
- Create `ymir-core/src/protocol.rs` with message definitions

**Must NOT do**:
- Don't implement handlers yet (just types)
- Don't add database-specific types here

**Recommended Agent Profile**:
- **Category**: `quick`
- **Reason**: Type definitions only, no logic
- **Skills**: None required

**Parallelization**:
- **Can Run In Parallel**: YES (Wave 1, after Task 1)
- **Parallel Group**: Wave 1 with Tasks 3, 4
- **Blocks**: Tasks 5, 10, 11, 12, 13
- **Blocked By**: Task 1

**References**:
- Pattern: Existing types in `src/state/types.ts` (port to Rust)
- Pattern: JSON-RPC 2.0 spec (jsonrpc.org)
- Types: `src-tauri/src/state.rs` (PtySession structure)

**Acceptance Criteria**:
- [ ] All Workspace/Pane/Tab types defined with serde::Serialize/Deserialize
- [ ] JSON-RPC 2.0 Request/Response/Notification types defined
- [ ] Error type with standard JSON-RPC error codes
- [ ] Protocol constants (BATCH_SIZE = 50, CHUNK_SIZE = 1000)

**QA Scenarios**:
```
Scenario: Types serialize correctly
Tool: Bash (Rust test)
Preconditions: Task 1 complete
Steps:
  1. cd ymir-core && cargo test types::tests
Expected: All serialization tests pass
Evidence: .sisyphus/evidence/task-2-types-test.txt

Scenario: Protocol types valid
Tool: Bash (Rust test)
Steps:
  1. cargo test protocol::tests
Expected: Request/Response round-trip serialization works
Evidence: .sisyphus/evidence/task-2-protocol-test.txt
```

**Commit**: YES (groups with Task 1)
- Message: `feat(core): add shared types and protocol definitions`
- Files: `ymir-core/src/types.rs`, `ymir-core/src/protocol.rs`, `ymir-core/src/lib.rs`

---

- [x] **3. Turso Database Schema**

**What to do**:
- Create SQL migration files in `ymir-core/migrations/`:
  - `001_initial_schema.sql`: workspaces, panes, tabs, pty_sessions, scrollback, git_repos
- Design normalized schema with foreign keys
- Add indexes for common queries
- Include cascade deletes for tab close cleanup

**Must NOT do**:
- Don't create Rust code yet (just SQL files)
- Don't implement queries yet

**Schema Design**:
```sql
-- workspaces table
CREATE TABLE workspaces (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- panes table (simplified - no tree structure)
CREATE TABLE panes (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  flex_ratio REAL DEFAULT 1.0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
);

-- tabs table (1:1 with pty_sessions)
CREATE TABLE tabs (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  pane_id TEXT NOT NULL,
  title TEXT DEFAULT 'bash',
  cwd TEXT,
  has_notification BOOLEAN DEFAULT FALSE,
  notification_count INTEGER DEFAULT 0,
  notification_text TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
  FOREIGN KEY (pane_id) REFERENCES panes(id) ON DELETE CASCADE
);

-- pty_sessions table (1:1 with tabs)
CREATE TABLE pty_sessions (
  id TEXT PRIMARY KEY,
  tab_id TEXT NOT NULL UNIQUE,
  pid INTEGER,
  cwd TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (tab_id) REFERENCES tabs(id) ON DELETE CASCADE
);

-- scrollback_chunks table (chunked storage)
CREATE TABLE scrollback_chunks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tab_id TEXT NOT NULL,
  chunk_number INTEGER NOT NULL,  -- sequential chunk number
  content TEXT NOT NULL,          -- JSON array of lines
  line_count INTEGER NOT NULL,    -- number of lines in chunk
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (tab_id) REFERENCES tabs(id) ON DELETE CASCADE,
  UNIQUE(tab_id, chunk_number)
);

CREATE INDEX idx_scrollback_tab ON scrollback_chunks(tab_id, chunk_number);

-- git_repos table
CREATE TABLE git_repos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  path TEXT UNIQUE NOT NULL,
  branch TEXT,
  staged_count INTEGER DEFAULT 0,
  unstaged_count INTEGER DEFAULT 0,
  last_poll_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- git_files table
CREATE TABLE git_files (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  repo_id INTEGER NOT NULL,
  path TEXT NOT NULL,
  status TEXT NOT NULL,  -- 'staged' or 'unstaged'
  file_status TEXT,      -- 'modified', 'added', 'deleted', etc
  FOREIGN KEY (repo_id) REFERENCES git_repos(id) ON DELETE CASCADE,
  UNIQUE(repo_id, path, status)
);

CREATE INDEX idx_git_files_repo ON git_files(repo_id);

-- settings table (for user preferences)
CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

**Recommended Agent Profile**:
- **Category**: `unspecified-high`
- **Reason**: Database design requires careful thought about queries and performance
- **Skills**: None required

**Parallelization**:
- **Can Run In Parallel**: YES (Wave 1, after Task 1)
- **Parallel Group**: Wave 1 with Tasks 2, 4
- **Blocks**: Task 5
- **Blocked By**: Task 1

**References**:
- Pattern: Turso/libSQL schema best practices
- Pattern: Chunked storage for large scrollback
- Constraints: CASCADE DELETE for tab close cleanup

**Acceptance Criteria**:
- [ ] SQL files in `ymir-core/migrations/001_initial_schema.sql`
- [ ] All tables created with proper foreign keys
- [ ] Indexes on frequently queried columns
- [ ] CASCADE DELETE on tab close

**QA Scenarios**:
```
Scenario: Schema loads successfully
Tool: Bash (Turso CLI or sqlite3)
Preconditions: Turso CLI installed
Steps:
  1. turso db create test-schema --local
  2. turso db shell test-schema < ymir-core/migrations/001_initial_schema.sql
Expected: All tables created without errors
Evidence: .sisyphus/evidence/task-3-schema-load.txt
```

**Commit**: YES (groups with Task 1)
- Message: `feat(core): add database schema with migrations`
- Files: `ymir-core/migrations/001_initial_schema.sql`

---

- [x] **4. Migration Scripts**

**What to do**:
- Create `ymir-core/src/db/migrations.rs` module
- Implement migration runner that applies SQL files in order
- Store migration version in database
- Add `libsql` crate dependency
- Create test migrations

**Must NOT do**:
- Don't implement full database client yet
- Don't add connection pooling yet

**Recommended Agent Profile**:
- **Category**: `quick`
- **Reason**: Standard migration pattern, straightforward implementation
- **Skills**: None required

**Parallelization**:
- **Can Run In Parallel**: YES (Wave 1, after Task 1)
- **Parallel Group**: Wave 1 with Tasks 2, 3
- **Blocks**: None (enables Task 5)
- **Blocked By**: Task 1

**Acceptance Criteria**:
- [ ] Migration runner implemented
- [ ] Applies migrations in order
- [ ] Stores current version
- [ ] Tests pass

**QA Scenarios**:
```
Scenario: Migrations apply correctly
Tool: Bash (Rust test)
Steps:
  1. cd ymir-core && cargo test migrations::tests
Expected: Migrations apply and version tracked
Evidence: .sisyphus/evidence/task-4-migrations-test.txt
```

**Commit**: YES (groups with Task 1)
- Message: `feat(core): add database migration runner`
- Files: `ymir-core/src/db/migrations.rs`, `ymir-core/src/db/mod.rs`

---

### Wave 2: Core Service - Database + PTY

- [x] **5. Database Client and Connection Pooling**

**What to do**:
- Add `libsql` crate to `ymir-core`
- Create `ymir-core/src/db/client.rs` with connection management
- Implement connection pooling with `Arc<Mutex<Connection>>`
- Create database configuration (path resolution for workspace vs user db)
- Add async query methods
- Implement transaction support

**Must NOT do**:
- Don't implement specific entity queries yet (just generic client)
- Don't add business logic

**Recommended Agent Profile**:
- **Category**: `unspecified-high`
- **Reason**: Database client requires careful async handling and error management
- **Skills**: None required

**Parallelization**:
- **Can Run In Parallel**: NO (Wave 2 starter)
- **Blocks**: Tasks 6, 7, 8, 9, 11, 12, 13, 14
- **Blocked By**: Tasks 2, 3

**References**:
- Pattern: libsql client documentation
- Pattern: Connection pooling best practices
- Pattern: Async database access with tokio

**Acceptance Criteria**:
- [ ] Database client connects to Turso/SQLite
- [ ] Connection pooling works
- [ ] Async queries execute
- [ ] Transactions work

**QA Scenarios**:
```
Scenario: Database client connects
Tool: Bash (Rust test)
Steps:
  1. cd ymir-core && cargo test db::client::tests
Expected: Client connects and executes query
Evidence: .sisyphus/evidence/task-5-db-client-test.txt
```

**Commit**: YES
- Message: `feat(core): add database client with connection pooling`
- Files: `ymir-core/src/db/client.rs`, `ymir-core/src/db/mod.rs`

---

- [x] **6. PTY Session Manager**

**What to do**:
- Port existing PTY logic from `src-tauri/src/commands.rs`
- Create `ymir-core/src/pty/manager.rs`
- Adapt to use tab_id binding (instead of session_id only)
- Implement spawn, write, resize, kill operations
- Integrate with broadcast channels for output streaming
- Add session lifecycle tracking

**Must NOT do**:
- Don't implement WebSocket handlers yet (just PTY operations)
- Don't integrate with database yet

**Recommended Agent Profile**:
- **Category**: `unspecified-high`
- **Reason**: PTY management is complex, needs careful porting from existing code
- **Skills**: None required

**Parallelization**:
- **Can Run In Parallel**: YES (Wave 2, after Task 5)
- **Blocks**: Task 13
- **Blocked By**: Task 5

**References**:
- Pattern: `src-tauri/src/commands.rs` (lines 128-204 spawn_pty, write_pty, resize_pty)
- Pattern: `src-tauri/src/state.rs` (PtySession struct)
- Pattern: `portable-pty` crate usage

**Acceptance Criteria**:
- [ ] PTY spawns with tab_id binding
- [ ] Write/resize/kill operations work
- [ ] Output streams via broadcast channel
- [ ] Session lifecycle tracked

**QA Scenarios**:
```
Scenario: PTY manager spawns session
Tool: Bash (Rust test with mock)
Steps:
  1. cd ymir-core && cargo test pty::manager::tests
Expected: PTY spawned, output received, process exits
Evidence: .sisyphus/evidence/task-6-pty-manager-test.txt
```

**Commit**: YES
- Message: `feat(core): add PTY session manager with tab binding`
- Files: `ymir-core/src/pty/manager.rs`, `ymir-core/src/pty/mod.rs`

---

- [x] **7. Scrollback Batching Service**

**What to do**:
- Create `ymir-core/src/scrollback/service.rs`
- Implement batch buffering (50 lines or 500ms)
- Implement chunked storage (1000 lines per chunk)
- Add batch flush timer
- Implement scrollback retrieval with chunk merging
- Optimize for performance (don't store per-line)

**Must NOT do**:
- Don't implement per-line writes (use batching only)
- Don't integrate with PTY yet

**Recommended Agent Profile**:
- **Category**: `unspecified-high`
- **Reason**: Performance-critical, requires careful buffering and batching
- **Skills**: None required

**Parallelization**:
- **Can Run In Parallel**: YES (Wave 2, after Task 5)
- **Blocks**: Task 13
- **Blocked By**: Task 5

**Acceptance Criteria**:
- [ ] Buffers accumulate 50 lines or 500ms
- [ ] Flushes to database in chunks
- [ ] Retrieval merges chunks
- [ ] Performance acceptable (<100ms for 1000 lines)

**QA Scenarios**:
```
Scenario: Scrollback batches correctly
Tool: Bash (Rust test)
Steps:
  1. cd ymir-core && cargo test scrollback::tests
Expected: Lines batched, chunks created, retrieval works
Evidence: .sisyphus/evidence/task-7-scrollback-test.txt
```

**Commit**: YES
- Message: `feat(core): add scrollback batching service`
- Files: `ymir-core/src/scrollback/service.rs`, `ymir-core/src/scrollback/mod.rs`

---

- [x] **8. Git Service**

**What to do**:
- Port existing git logic from `src-tauri/src/git.rs`
- Create `ymir-core/src/git/service.rs`
- Adapt commands to work in core service context
- Implement repository discovery
- Add status polling with configurable interval
- Store results in database

**Must NOT do**:
- Don't add WebSocket push yet (just service layer)
- Don't remove original git.rs yet

**Recommended Agent Profile**:
- **Category**: `unspecified-high`
- **Reason**: Git operations are complex, need careful porting
- **Skills**: None required

**Parallelization**:
- **Can Run In Parallel**: YES (Wave 2, after Task 5)
- **Blocks**: Task 14
- **Blocked By**: Task 5

**References**:
- Pattern: `src-tauri/src/git.rs` (949 lines of git operations)
- Pattern: `git2` crate usage

**Acceptance Criteria**:
- [ ] Git status retrieval works
- [ ] Stage/unstage/commit operations work
- [ ] Branch operations work
- [ ] Results stored in database

**QA Scenarios**:
```
Scenario: Git service operations
Tool: Bash (Rust test with temp repo)
Steps:
  1. cd ymir-core && cargo test git::service::tests
Expected: All git operations work
Evidence: .sisyphus/evidence/task-8-git-service-test.txt
```

**Commit**: YES
- Message: `feat(core): add git service layer`
- Files: `ymir-core/src/git/service.rs`, `ymir-core/src/git/mod.rs`

---

### Wave 3: WebSocket Server

- [x] **9. WebSocket Server Setup**

**What to do**:
- Add `axum` and `tokio-tungstenite` to `ymir-core`
- Create `ymir-core/src/server/mod.rs`
- Implement WebSocket upgrade handler
- Add connection state management (connected clients)
- Implement ping/pong for keepalive
- Add graceful shutdown handling

**Must NOT do**:
- Don't implement message handlers yet (just server setup)
- Don't add authentication yet

**Recommended Agent Profile**:
- **Category**: `unspecified-high`
- **Reason**: WebSocket server needs careful async handling
- **Skills**: None required

**Parallelization**:
- **Can Run In Parallel**: NO (Wave 3 starter)
- **Blocks**: Tasks 10, 11, 12, 13, 14, 15, 16, 17
- **Blocked By**: Tasks 2, 5

**Acceptance Criteria**:
- [ ] Server starts and accepts connections
- [ ] WebSocket upgrade works
- [ ] Keepalive pings work
- [ ] Graceful shutdown works

**QA Scenarios**:
```
Scenario: Server accepts WebSocket
Tool: Bash (wscat or websocat)
Steps:
  1. Start server: cargo run -p ymir-server
  2. Connect: wscat -c ws://127.0.0.1:7139/ws
Expected: Connection accepted, ping/pong works
Evidence: .sisyphus/evidence/task-9-server-connect.txt
```

**Commit**: YES
- Message: `feat(core): add WebSocket server foundation`
- Files: `ymir-core/src/server/mod.rs`, `ymir-core/src/server/websocket.rs`

---

- [x] **10. Message Protocol (JSON-RPC 2.0)**

**What to do**:
- Implement JSON-RPC 2.0 message parsing
- Create request/response routing
- Add correlation ID tracking
- Implement notification broadcasting
- Add error handling with standard codes

**Must NOT do**:
- Don't implement specific method handlers yet
- Don't add business logic

**Recommended Agent Profile**:
- **Category**: `quick`
- **Reason**: Protocol parsing is straightforward
- **Skills**: None required

**Parallelization**:
- **Can Run In Parallel**: YES (Wave 3, after Task 9)
- **Blocks**: Tasks 11, 12, 13, 14, 15
- **Blocked By**: Task 9

**Acceptance Criteria**:
- [ ] JSON-RPC 2.0 messages parse correctly
- [ ] Request/response routing works
- [ ] Notifications broadcast
- [ ] Error responses valid

**QA Scenarios**:
```
Scenario: JSON-RPC round-trip
Tool: Bash (wscat + JSON)
Steps:
  1. Send: {"jsonrpc":"2.0","method":"ping","id":"1"}
  2. Receive response
Expected: Valid JSON-RPC response
Evidence: .sisyphus/evidence/task-10-protocol-roundtrip.txt
```

**Commit**: YES
- Message: `feat(core): add JSON-RPC 2.0 protocol handling`
- Files: `ymir-core/src/server/protocol.rs`

---

- [x] **11. Workspace Handlers**

**What to do**:
- Implement `workspace.create` handler
- Implement `workspace.list` handler
- Implement `workspace.delete` handler
- Implement `workspace.rename` handler
- Add workspace state change notifications
- Integrate with database

**Must NOT do**:
- Don't implement pane/tab handlers here

**Recommended Agent Profile**:
- **Category**: `unspecified-high`
- **Reason**: Business logic with database operations
- **Skills**: None required

**Parallelization**:
- **Can Run In Parallel**: YES (Wave 3, after Task 9, 10)
- **Blocks**: Task 21
- **Blocked By**: Tasks 5, 9, 10

**Acceptance Criteria**:
- [ ] Create/list/delete/rename operations work
- [ ] Notifications broadcast to clients
- [ ] Database operations succeed

**QA Scenarios**:
```
Scenario: Workspace CRUD
Tool: Bash (wscat)
Steps:
  1. Send create request
  2. Verify response
  3. Send list request
  4. Verify workspace in list
Expected: All operations work
Evidence: .sisyphus/evidence/task-11-workspace-handlers.txt
```

**Commit**: YES
- Message: `feat(core): add workspace handlers`
- Files: `ymir-core/src/handlers/workspace.rs`

---

- [x] **12. Pane Handlers**

**What to do**:
- Implement `pane.create` handler (simplified, no splits)
- Implement `pane.delete` handler
- Implement `pane.list` handler
- Add pane state change notifications
- Integrate with database

**Must NOT do**:
- Don't implement split operations (removed per requirements)
- Don't implement complex layout algorithms

**Recommended Agent Profile**:
- **Category**: `unspecified-high`
- **Reason**: Business logic with database operations
- **Skills**: None required

**Parallelization**:
- **Can Run In Parallel**: YES (Wave 3, after Task 9, 10)
- **Blocks**: Task 21
- **Blocked By**: Tasks 5, 9, 10

**Acceptance Criteria**:
- [ ] Create/delete/list operations work
- [ ] Notifications broadcast
- [ ] Database operations succeed

**QA Scenarios**:
```
Scenario: Pane operations
Tool: Bash (wscat)
Steps:
  1. Create workspace
  2. Create pane in workspace
  3. List panes
  4. Delete pane
Expected: All operations work
Evidence: .sisyphus/evidence/task-12-pane-handlers.txt
```

**Commit**: YES
- Message: `feat(core): add pane handlers`
- Files: `ymir-core/src/handlers/pane.rs`

---

- [x] **13. Tab/PTY Handlers (Auto-Spawn)**

**What to do**:
- Implement `tab.create` handler that AUTO-SPAWNS PTY:
  1. Create tab in database
  2. Spawn PTY session
  3. Bind PTY to tab_id
  4. Start output streaming
  5. Return tab with session_id
- Implement `pty.connect` handler
- Implement `pty.write` handler
- Implement `pty.resize` handler
- Implement `tab.close` handler with cascade:
  1. Kill PTY
  2. Delete scrollback
  3. Delete tab
  4. Broadcast confirmation
- Integrate scrollback batching

**Must NOT do**:
- Don't implement separate `pty.spawn` (auto-spawn only)
- Don't forget scrollback cleanup

**Recommended Agent Profile**:
- **Category**: `unspecified-high`
- **Reason**: Complex lifecycle with PTY integration
- **Skills**: None required

**Parallelization**:
- **Can Run In Parallel**: YES (Wave 3, after Task 9, 10)
- **Blocks**: Tasks 21, 24
- **Blocked By**: Tasks 5, 6, 7, 9, 10

**Acceptance Criteria**:
- [ ] tab.create auto-spawns PTY
- [ ] pty.connect works for existing sessions
- [ ] Output streams to WebSocket
- [ ] tab.close cascade works
- [ ] Scrollback batching works

**QA Scenarios**:
```
Scenario: Tab/PTY full lifecycle
Tool: Bash (wscat)
Steps:
  1. Send tab.create
  2. Verify PTY spawned, output streaming
  3. Send pty.write with command
  4. Verify output received
  5. Send tab.close
  6. Verify cascade cleanup
Expected: Full lifecycle works
Evidence: .sisyphus/evidence/task-13-tab-pty-lifecycle.txt
```

**Commit**: YES
- Message: `feat(core): add tab/PTY handlers with auto-spawn`
- Files: `ymir-core/src/handlers/tab.rs`, `ymir-core/src/handlers/pty.rs`

---

- [x] **14. Git Handlers**

**What to do**:
- Implement `git.status` handler
- Implement `git.stage`, `git.unstage` handlers
- Implement `git.commit` handler
- Implement `git.branches` handler
- Implement `git.checkout` handler
- Add git polling service (server-side)
- Push git updates via WebSocket notifications
- Integrate with database

**Must NOT do**:
- Don't use client-side polling

**Recommended Agent Profile**:
- **Category**: `unspecified-high`
- **Reason**: Git operations + polling service
- **Skills**: None required

**Parallelization**:
- **Can Run In Parallel**: YES (Wave 3, after Task 9, 10)
- **Blocks**: Tasks 21, 26
- **Blocked By**: Tasks 5, 8, 9, 10

**Acceptance Criteria**:
- [ ] All git operations work
- [ ] Server-side polling active
- [ ] Updates push via WebSocket
- [ ] Database stores status

**QA Scenarios**:
```
Scenario: Git operations
Tool: Bash (wscat)
Steps:
  1. Send git.status with repo path
  2. Verify status returned
  3. Make change, wait for poll
  4. Verify update notification received
Expected: Git operations + polling work
Evidence: .sisyphus/evidence/task-14-git-handlers.txt
```

**Commit**: YES
- Message: `feat(core): add git handlers with server polling`
- Files: `ymir-core/src/handlers/git.rs`, `ymir-core/src/services/git_polling.rs`

---

- [x] **15. Authentication Middleware**

**What to do**:
- Implement password-based auth
- Add `auth.login` handler
- Create auth middleware for protected routes
- Handle authentication errors
- Support `--password` CLI flag

**Must NOT do**:
- Don't implement complex auth (JWT, OAuth, etc.)
- Don't require auth for localhost (optional)

**Recommended Agent Profile**:
- **Category**: `unspecified-high`
- **Reason**: Security-critical code
- **Skills**: None required

**Parallelization**:
- **Can Run In Parallel**: YES (Wave 3, after Task 9, 10)
- **Blocks**: Tasks 16, 17
- **Blocked By**: Tasks 9, 10

**Acceptance Criteria**:
- [ ] Password auth works
- [ ] Middleware protects routes
- [ ] Login/logout works
- [ ] Errors handled properly

**QA Scenarios**:
```
Scenario: Authentication flow
Tool: Bash (wscat)
Steps:
  1. Connect without auth
  2. Verify error on protected request
  3. Send auth.login with password
  4. Verify token received
  5. Make protected request
Expected: Auth flow works
Evidence: .sisyphus/evidence/task-15-auth-flow.txt
```

**Commit**: YES
- Message: `feat(core): add password authentication`
- Files: `ymir-core/src/server/auth.rs`, `ymir-core/src/handlers/auth.rs`

---

### Wave 4: Execution Modes

- [x] **16. Standalone Server Binary**

**What to do**:
- Create `ymir-server/src/main.rs`
- Implement `ymir web` subcommand with clap
- Add `--host` and `--port` arguments (default: 127.0.0.1:7139)
- Add `--password` argument
- Implement browser spawning
- Add signal handling for graceful shutdown

**Must NOT do**:
- Don't add Tauri-specific code
- Don't hardcode paths

**Recommended Agent Profile**:
- **Category**: `unspecified-high`
- **Reason**: CLI + server integration
- **Skills**: None required

**Parallelization**:
- **Can Run In Parallel**: NO (Wave 4 starter)
- **Blocks**: None
- **Blocked By**: Tasks 9, 10, 15

**Acceptance Criteria**:
- [ ] `ymir web --host 127.0.0.1 --port 7139` works
- [ ] Browser opens automatically
- [ ] Graceful shutdown works
- [ ] Password auth works

**QA Scenarios**:
```
Scenario: Standalone server starts
Tool: Bash
Steps:
  1. cargo run -p ymir-server -- web --port 7139
  2. Verify server starts
  3. Verify browser opens (mock if headless)
Expected: Server starts, browser opens
Evidence: .sisyphus/evidence/task-16-standalone-server.txt
```

**Commit**: YES
- Message: `feat(server): add standalone server binary`
- Files: `ymir-server/src/main.rs`

---

- [x] **17. Tauri Embedded Service**

**What to do**:
- Move existing Tauri code to `ymir-tauri`
- Integrate core service into Tauri
- Spawn core service as sidecar
- Configure WebSocket connection in Tauri
- Handle Tauri window events (cleanup on close)

**Must NOT do**:
- Don't remove existing Tauri code (move it)
- Don't duplicate core service logic

**Recommended Agent Profile**:
- **Category**: `unspecified-high`
- **Reason**: Tauri integration is complex
- **Skills**: None required

**Parallelization**:
- **Can Run In Parallel**: YES (Wave 4, after Task 16)
- **Blocks**: None
- **Blocked By**: Tasks 9, 10, 15

**Acceptance Criteria**:
- [ ] Tauri app starts core service
- [ ] WebSocket connects
- [ ] Cleanup on window close
- [ ] Sidecar configuration works

**QA Scenarios**:
```
Scenario: Tauri embedded mode
Tool: Playwright or manual
Steps:
  1. cargo tauri dev
  2. Verify core service started
  3. Verify WebSocket connection
  4. Close window, verify cleanup
Expected: Embedded mode works
Evidence: .sisyphus/evidence/task-17-tauri-embedded.txt
```

**Commit**: YES
- Message: `feat(tauri): add embedded core service integration`
- Files: `ymir-tauri/src/main.rs`, `ymir-tauri/tauri.conf.json`

---

- [x] **18. CLI Argument Parsing**

**What to do**:
- Add `clap` dependency
- Create CLI structure for `ymir` and `ymir web`
- Add `--host`, `--port`, `--password` arguments
- Add help text and documentation
- Handle argument validation

**Must NOT do**:
- Don't add complex CLI features yet

**Recommended Agent Profile**:
- **Category**: `quick`
- **Reason**: Standard clap usage
- **Skills**: None required

**Parallelization**:
- **Can Run In Parallel**: YES (Wave 4, with Task 16)
- **Blocks**: Task 16
- **Blocked By**: None

**Acceptance Criteria**:
- [ ] CLI help works
- [ ] Arguments parse correctly
- [ ] Validation works

**QA Scenarios**:
```
Scenario: CLI parsing
Tool: Bash
Steps:
  1. cargo run -p ymir-server -- --help
  2. cargo run -p ymir-server -- web --help
  3. Test various argument combinations
Expected: CLI works correctly
Evidence: .sisyphus/evidence/task-18-cli-parsing.txt
```

**Commit**: YES (groups with Task 16)
- Message: `feat(server): add CLI argument parsing`
- Files: `ymir-server/src/cli.rs`

---

- [x] **19. Browser Spawning**

**What to do**:
- Add `webbrowser` crate
- Implement browser opening for standalone mode
- Handle browser launch failures
- Support custom browser (optional)

**Must NOT do**:
- Don't spawn browser in Tauri mode

**Recommended Agent Profile**:
- **Category**: `quick`
- **Reason**: Simple crate usage
- **Skills**: None required

**Parallelization**:
- **Can Run In Parallel**: YES (Wave 4, with Task 16)
- **Blocks**: Task 16
- **Blocked By**: None

**Acceptance Criteria**:
- [ ] Browser opens when server starts
- [ ] Correct URL (ws://host:port)
- [ ] Failures handled gracefully

**QA Scenarios**:
```
Scenario: Browser spawning
Tool: Bash (mock in CI)
Steps:
  1. Start server
  2. Verify browser.open called
Expected: Browser spawn works
Evidence: .sisyphus/evidence/task-19-browser-spawn.txt
```

**Commit**: YES (groups with Task 16)
- Message: `feat(server): add browser spawning`
- Files: `ymir-server/src/browser.rs`

---

- [x] **20. Sidecar Configuration**

**What to do**:
- Configure Tauri for sidecar binary
- Add externalBin to tauri.conf.json
- Set up build scripts for cross-compilation
- Document sidecar binary naming

**Must NOT do**:
- Don't forget platform-specific naming

**Recommended Agent Profile**:
- **Category**: `quick`
- **Reason**: Tauri configuration
- **Skills**: None required

**Parallelization**:
- **Can Run In Parallel**: YES (Wave 4, with Task 17)
- **Blocks**: Task 17
- **Blocked By**: None

**Acceptance Criteria**:
- [ ] tauri.conf.json has externalBin
- [ ] Build scripts work
- [ ] Sidecar loads correctly

**QA Scenarios**:
```
Scenario: Sidecar configuration
Tool: Bash
Steps:
  1. Check tauri.conf.json
  2. Verify externalBin configuration
Expected: Configuration valid
Evidence: .sisyphus/evidence/task-20-sidecar-config.txt
```

**Commit**: YES (groups with Task 17)
- Message: `chore(tauri): configure sidecar binary`
- Files: `ymir-tauri/tauri.conf.json`

---

### Wave 5: React Client

- [x] **21. WebSocket Client Service**

**What to do**:
- Create `src/services/websocket.ts`
- Implement WebSocket connection management
- Add JSON-RPC message sending/receiving
- Implement message correlation (track request IDs)
- Add message queue for offline buffering

**Must NOT do**:
- Don't implement reconnection yet (next task)
- Don't add business logic yet

**Recommended Agent Profile**:
- **Category**: `unspecified-high`
- **Reason**: Core client infrastructure
- **Skills**: None required

**Parallelization**:
- **Can Run In Parallel**: NO (Wave 5 starter)
- **Blocks**: Tasks 22, 23, 24, 25, 26
- **Blocked By**: Tasks 9, 10, 11, 12, 13, 14

**References**:
- Pattern: Replace Tauri invoke calls with WebSocket equivalents
- Pattern: `src/state/workspace.ts` current actions (port to WebSocket)

**Acceptance Criteria**:
- [ ] WebSocket connects
- [ ] Messages send/receive
- [ ] Correlation IDs work
- [ ] Message queue works

**QA Scenarios**:
```
Scenario: WebSocket client connects
Tool: Playwright
Steps:
  1. Start server
  2. Open frontend
  3. Verify WebSocket connection
  4. Send ping, receive pong
Expected: Connection works
Evidence: .sisyphus/evidence/task-21-ws-client-connect.png
```

**Commit**: YES
- Message: `feat(react): add WebSocket client service`
- Files: `src/services/websocket.ts`

---

- [x] **22. Reconnection Logic**

**What to do**:
- Implement exponential backoff reconnection
- Add connection state tracking
- Restore state after reconnection
- Handle reconnection during operations
- Add visual indicator for connection status

**Must NOT do**:
- Don't lose user data during reconnection
- Don't infinite loop on auth failures

**Recommended Agent Profile**:
- **Category**: `unspecified-high`
- **Reason**: Complex stateful logic
- **Skills**: None required

**Parallelization**:
- **Can Run In Parallel**: YES (Wave 5, after Task 21)
- **Blocks**: Tasks 23, 24, 25, 26
- **Blocked By**: Task 21

**Acceptance Criteria**:
- [ ] Reconnects with exponential backoff
- [ ] State restored after reconnect
- [ ] Visual indicator shows status
- [ ] No data loss

**QA Scenarios**:
```
Scenario: Reconnection
Tool: Playwright
Steps:
  1. Connect to server
  2. Kill server
  3. Verify reconnection attempts with backoff
  4. Restart server
  5. Verify reconnected and state restored
Expected: Reconnection works
Evidence: .sisyphus/evidence/task-22-reconnection.mp4
```

**Commit**: YES
- Message: `feat(react): add reconnection with exponential backoff`
- Files: `src/services/websocket.ts` (reconnection logic)

---

- [x] **23. State Subscription Hooks**

**What to do**:
- Create React hooks for WebSocket state:
  - `useWorkspaces()` - subscribe to workspace changes
  - `usePanes(workspaceId)` - subscribe to pane changes
  - `useTabs(paneId)` - subscribe to tab changes
  - `useGit(repoPath)` - subscribe to git updates
- Replace Zustand subscriptions with WebSocket subscriptions
- Add loading states
- Handle errors

**Must NOT do**:
- Don't use Zustand for server state anymore
- Don't forget cleanup on unmount

**Recommended Agent Profile**:
- **Category**: `unspecified-high`
- **Reason**: React hooks + WebSocket integration
- **Skills**: None required

**Parallelization**:
- **Can Run In Parallel**: YES (Wave 5, after Task 21, 22)
- **Blocks**: Tasks 24, 25, 26
- **Blocked By**: Tasks 21, 22

**References**:
- Pattern: `src/state/workspace.ts` current selectors

**Acceptance Criteria**:
- [ ] Hooks subscribe to changes
- [ ] Updates received via WebSocket
- [ ] Loading states work
- [ ] Cleanup on unmount

**QA Scenarios**:
```
Scenario: State subscriptions
Tool: Playwright
Steps:
  1. Mount component with useWorkspaces
  2. Create workspace via WebSocket
  3. Verify component updates
  4. Unmount component
  5. Verify unsubscribed
Expected: Subscriptions work
Evidence: .sisyphus/evidence/task-23-subscriptions.png
```

**Commit**: YES
- Message: `feat(react): add WebSocket state subscription hooks`
- Files: `src/hooks/useWebSocketWorkspaces.ts`, etc.

---

- [x] **24. Terminal Adapter**

**What to do**:
- Adapt `src/components/Terminal.tsx` to use WebSocket
- Replace Tauri Channel with WebSocket messages:
  - `pty.connect` instead of `attach_pty_channel`
  - `pty.write` instead of `invoke('write_pty')`
  - `pty.resize` instead of `invoke('resize_pty')`
- Keep Ghostty-web WASM terminal component
- Handle PTY output streaming
- Manage scrollback via WebSocket

**Must NOT do**:
- Don't replace Ghostty-web (keep it)
- Don't break terminal functionality

**Recommended Agent Profile**:
- **Category**: `unspecified-high`
- **Reason**: Critical UI component, complex integration
- **Skills**: None required

**Parallelization**:
- **Can Run In Parallel**: YES (Wave 5, after Task 21, 22, 23)
- **Blocks**: None
- **Blocked By**: Tasks 13, 21, 22, 23

**References**:
- Pattern: `src/components/Terminal.tsx` (250 lines)
- Pattern: Tauri Channel usage in existing code

**Acceptance Criteria**:
- [ ] Terminal connects via WebSocket
- [ ] PTY output streams correctly
- [ ] Write/resize operations work
- [ ] Scrollback loads via WebSocket

**QA Scenarios**:
```
Scenario: Terminal via WebSocket
Tool: Playwright
Steps:
  1. Create tab (auto-spawns PTY)
  2. Type command in terminal
  3. Verify output displays
  4. Resize terminal
  5. Verify PTY resized
  6. Close tab
  7. Verify cleanup
Expected: Terminal works via WebSocket
Evidence: .sisyphus/evidence/task-24-terminal-websocket.png
```

**Commit**: YES
- Message: `feat(react): adapt Terminal to WebSocket`
- Files: `src/components/Terminal.tsx`

---

- [x] **25. Workspace Sidebar Integration**

**What to do**:
- Update `src/components/WorkspaceSidebar.tsx`
- Replace Zustand actions with WebSocket commands
- Use `useWorkspaces()` hook
- Handle workspace CRUD via WebSocket
- Update Pane component if needed

**Must NOT do**:
- Don't use old Zustand workspace actions
- Don't implement split/close pane (removed)

**Recommended Agent Profile**:
- **Category**: `unspecified-high`
- **Reason**: UI integration with WebSocket
- **Skills**: None required

**Parallelization**:
- **Can Run In Parallel**: YES (Wave 5, after Task 21, 22, 23)
- **Blocks**: None
- **Blocked By**: Tasks 11, 21, 22, 23

**Acceptance Criteria**:
- [ ] Workspace list loads via WebSocket
- [ ] Create/rename/delete work
- [ ] Active workspace switches
- [ ] Real-time updates

**QA Scenarios**:
```
Scenario: Workspace sidebar
Tool: Playwright
Steps:
  1. Open sidebar
  2. Create new workspace
  3. Verify appears in list
  4. Switch workspaces
  5. Delete workspace
Expected: Sidebar works via WebSocket
Evidence: .sisyphus/evidence/task-25-sidebar-websocket.png
```

**Commit**: YES
- Message: `feat(react): integrate WorkspaceSidebar with WebSocket`
- Files: `src/components/WorkspaceSidebar.tsx`

---

- [x] **26. Git Panel Integration**

**What to do**:
- Update `src/components/GitPanel.tsx`
- Replace polling with WebSocket subscriptions
- Use `useGit(repoPath)` hook
- Handle git operations via WebSocket commands
- Handle server-pushed updates

**Must NOT do**:
- Don't use client-side polling anymore

**Recommended Agent Profile**:
- **Category**: `unspecified-high`
- **Reason**: UI integration with server-pushed updates
- **Skills**: None required

**Parallelization**:
- **Can Run In Parallel**: YES (Wave 5, after Task 21, 22, 23)
- **Blocks**: None
- **Blocked By**: Tasks 14, 21, 22, 23

**Acceptance Criteria**:
- [ ] Git status loads via WebSocket
- [ ] Stage/unstage/commit work
- [ ] Server pushes updates
- [ ] Real-time status changes

**QA Scenarios**:
```
Scenario: Git panel
Tool: Playwright
Steps:
  1. Open git panel
  2. Make file change
  3. Verify server pushes update
  4. Stage file via UI
  5. Verify status updates
Expected: Git panel works via WebSocket
Evidence: .sisyphus/evidence/task-26-git-panel-websocket.png
```

**Commit**: YES
- Message: `feat(react): integrate GitPanel with WebSocket`
- Files: `src/components/GitPanel.tsx`

---

### Wave 6: Cleanup

- [x] **27. Remove Tauri Pane Commands**

**What to do**:
- Remove `create_pane_in_workspace` from commands.rs
- Remove `close_pane` from commands.rs
- Remove `focus_pane` from commands.rs
- Remove `get_pane_cwd` from commands.rs
- Remove `set_environment_context` from commands.rs
- Update lib.rs command registrations
- Update any remaining references

**Must NOT do**:
- Don't remove PTY commands (keep spawn_pty, write_pty, etc.)
- Don't remove Git commands

**Recommended Agent Profile**:
- **Category**: `quick`
- **Reason**: Code deletion, low risk
- **Skills**: None required

**Parallelization**:
- **Can Run In Parallel**: YES (Wave 6, after Wave 5)
- **Blocks**: None
- **Blocked By**: All implementation tasks

**Acceptance Criteria**:
- [ ] Pane commands removed
- [ ] Code compiles
- [ ] No references remain

**QA Scenarios**:
```
Scenario: Pane commands removed
Tool: Bash
Steps:
  1. grep -r "create_pane_in_workspace\|close_pane\|focus_pane" src-tauri/
Expected: No matches found
Evidence: .sisyphus/evidence/task-27-pane-commands-removed.txt
```

**Commit**: YES
- Message: `refactor(tauri): remove pane management commands`
- Files: `src-tauri/src/commands.rs`, `src-tauri/src/lib.rs`

---

- [x] **28. Remove Zustand Workspace Store**

**What to do**:
- Remove `src/state/workspace.ts`
- Update imports in all components
- Remove Zustand and Immer dependencies (if no longer needed)
- Remove Tauri storage adapter

**Must NOT do**:
- Don't remove types.ts (keep type definitions)

**Recommended Agent Profile**:
- **Category**: `quick`
- **Reason**: Code deletion, low risk
- **Skills**: None required

**Parallelization**:
- **Can Run In Parallel**: YES (Wave 6, after Wave 5)
- **Blocks**: None
- **Blocked By**: All implementation tasks

**Acceptance Criteria**:
- [ ] Zustand store removed
- [ ] Components use new hooks
- [ ] Package.json updated

**QA Scenarios**:
```
Scenario: Zustand removed
Tool: Bash
Steps:
  1. grep -r "useWorkspaceStore\|create.*zustand" src/
Expected: No matches found
Evidence: .sisyphus/evidence/task-28-zustand-removed.txt
```

**Commit**: YES
- Message: `refactor(react): remove Zustand workspace store`
- Files: `src/state/workspace.ts`, `package.json`

---

- [x] **29. Remove Tauri Storage Adapter**

**What to do**:
- Remove Tauri storage adapter code
- Remove `@tauri-apps/plugin-store` dependency
- Clean up storage-related code
- Remove workspace-storage.json references

**Must NOT do**:
- Don't break Tauri integration (keep core Tauri)

**Recommended Agent Profile**:
- **Category**: `quick`
- **Reason**: Code deletion
- **Skills**: None required

**Parallelization**:
- **Can Run In Parallel**: YES (Wave 6, after Wave 5)
- **Blocks**: None
- **Blocked By**: All implementation tasks

**Acceptance Criteria**:
- [ ] Storage adapter removed
- [ ] Dependencies updated
- [ ] Code compiles

**QA Scenarios**:
```
Scenario: Storage adapter removed
Tool: Bash
Steps:
  1. grep -r "plugin-store\|tauriStorage" src/
Expected: No matches found
Evidence: .sisyphus/evidence/task-29-storage-adapter-removed.txt
```

**Commit**: YES
- Message: `refactor(react): remove Tauri storage adapter`
- Files: Various

---

- [x] **30. Remove Browser Tab Support**

**What to do**:
- Remove browser tab type from types
- Remove browser-specific code in Pane.tsx
- Remove Browser component
- Remove browser-related styles

**Must NOT do**:
- Don't remove terminal tab support

**Recommended Agent Profile**:
- **Category**: `quick`
- **Reason**: Code deletion
- **Skills**: None required

**Parallelization**:
- **Can Run In Parallel**: YES (Wave 6, after Wave 5)
- **Blocks**: None
- **Blocked By**: All implementation tasks

**Acceptance Criteria**:
- [ ] Browser tab type removed
- [ ] Browser component removed
- [ ] Only terminal tabs work

**QA Scenarios**:
```
Scenario: Browser support removed
Tool: Bash
Steps:
  1. grep -r "browser\|Browser" src/ --include="*.tsx"
Expected: Only terminal references remain
Evidence: .sisyphus/evidence/task-30-browser-removed.txt
```

**Commit**: YES
- Message: `refactor(react): remove browser tab support`
- Files: `src/components/Browser.tsx`, `src/state/types.ts`

---

- [x] **31. Update Documentation**

**What to do**:
- Update README.md with new architecture
- Document WebSocket protocol
- Document database schema
- Update development setup instructions
- Add migration guide (for developers)

**Must NOT do**:
- Don't document old architecture

**Recommended Agent Profile**:
- **Category**: `writing`
- **Reason**: Documentation writing
- **Skills**: None required

**Parallelization**:
- **Can Run In Parallel**: YES (Wave 6, after Wave 5)
- **Blocks**: None
- **Blocked By**: All implementation tasks

**Acceptance Criteria**:
- [ ] README updated
- [ ] Architecture documented
- [ ] Protocol documented
- [ ] Setup instructions current

**QA Scenarios**:
```
Scenario: Documentation complete
Tool: Manual review
Steps:
  1. Read README.md
  2. Verify new architecture described
  3. Verify protocol documented
Expected: Documentation complete
Evidence: .sisyphus/evidence/task-31-documentation.md
```

**Commit**: YES
- Message: `docs: update README with WebSocket architecture`
- Files: `README.md`, `docs/`

---

## Final Verification Wave

- [ ] **F1. Plan Compliance Audit**

**What to do**:
- Review all Must Have items
- Verify Must NOT HAVE items absent
- Check all TODOs completed
- Verify evidence files exist
- Validate commit messages follow convention

**Recommended Agent Profile**:
- **Category**: `oracle`
- **Reason**: Independent review
- **Skills**: None required

**Acceptance Criteria**:
- [ ] All Must Have present
- [ ] No Must NOT HAVE violations
- [ ] All evidence files exist
- [ ] Commits follow convention

**QA Scenarios**:
```
Scenario: Compliance audit
Tool: Custom script
Steps:
  1. Check Must Have list
  2. Check Must NOT HAVE list
  3. Verify TODOs
  4. Check evidence files
Expected: All checks pass
Evidence: .sisyphus/evidence/f1-compliance-report.txt
```

---

- [ ] **F2. Code Quality Review**

**What to do**:
- Run `cargo clippy` on all crates
- Run `cargo fmt` check
- Run TypeScript type checking
- Run ESLint on React code
- Check for TODO/FIXME comments
- Review for AI slop patterns

**Recommended Agent Profile**:
- **Category**: `unspecified-high`
- **Reason**: Quality assurance
- **Skills**: None required

**Acceptance Criteria**:
- [ ] Clippy passes with no warnings
- [ ] TypeScript compiles
- [ ] ESLint passes
- [ ] No TODO/FIXME remaining

**QA Scenarios**:
```
Scenario: Quality checks
Tool: Bash
Steps:
  1. cargo clippy --workspace
  2. npx tsc --noEmit
  3. npx eslint src/
Expected: All checks pass
Evidence: .sisyphus/evidence/f2-quality-report.txt
```

---

- [ ] **F3. Integration Testing**

**What to do**:
- Test full workflow: server → WebSocket → tab → PTY → output
- Test Tauri embedded mode
- Test reconnection
- Test authentication
- Test git operations
- Test scrollback

**Recommended Agent Profile**:
- **Category**: `unspecified-high`
- **Reason**: End-to-end testing
- **Skills**: None required

**Acceptance Criteria**:
- [ ] Full workflow works
- [ ] Both modes work
- [ ] Reconnection works
- [ ] Auth works
- [ ] Git operations work

**QA Scenarios**:
```
Scenario: Full integration test
Tool: Playwright + Bash
Steps:
  1. Start server
  2. Open browser
  3. Create workspace
  4. Create tab
  5. Type command
  6. Verify output
  7. Test reconnection
  8. Test auth
Expected: All integration works
Evidence: .sisyphus/evidence/f3-integration-test.mp4
```

---

- [ ] **F4. Performance Testing**

**What to do**:
- Measure WebSocket latency
- Test scrollback performance (1000+ lines)
- Test reconnection speed
- Test memory usage
- Test concurrent clients
- Verify batching works

**Recommended Agent Profile**:
- **Category**: `unspecified-high`
- **Reason**: Performance validation
- **Skills**: None required

**Acceptance Criteria**:
- [ ] Latency < 50ms for operations
- [ ] Scrollback loads < 500ms
- [ ] Memory stable
- [ ] Concurrent clients work

**QA Scenarios**:
```
Scenario: Performance benchmarks
Tool: Custom benchmark script
Steps:
  1. Measure operation latency
  2. Test large scrollback
  3. Test concurrent clients
Expected: Performance within targets
Evidence: .sisyphus/evidence/f4-performance-report.txt
```

---

## Commit Strategy

**Commit Message Format**:
```
type(scope): description

[optional body]

[optional footer]
```

**Types**:
- `feat`: New feature
- `fix`: Bug fix
- `refactor`: Code restructuring
- `chore`: Maintenance
- `docs`: Documentation
- `test`: Tests

**Scopes**:
- `core`: ymir-core crate
- `server`: ymir-server crate
- `tauri`: ymir-tauri crate
- `react`: React frontend
- `workspace`: Build/config
- `docs`: Documentation

**Examples**:
- `feat(core): add WebSocket server with axum`
- `fix(react): handle reconnection errors`
- `refactor(tauri): remove pane management commands`

---

## Success Criteria

### Verification Commands
```bash
# Build everything
cargo build --workspace
cd ymir-tauri && cargo tauri build

# Run tests
cargo test --workspace
npm test

# Start standalone server
cargo run -p ymir-server -- web --port 7139

# Start Tauri app
cargo tauri dev
```

### Final Checklist
- [ ] All Must Have present
- [ ] All Must NOT HAVE absent
- [ ] Tests pass
- [ ] Documentation complete
- [ ] Code quality checks pass
- [ ] Integration tests pass
- [ ] Performance acceptable

---

## Summary

This plan refactors Ymir from a Tauri-centric app to a WebSocket-based architecture with:
- **Core Service**: Rust WebSocket server using axum + tokio-tungstenite
- **Database**: Turso (libSQL) with normalized schema
- **Two Modes**: Standalone server and Tauri embedded
- **Client**: React with WebSocket service and reconnection
- **Clean Break**: No backwards compatibility, layout commands removed

**Estimated Timeline**: 4-6 weeks with parallel execution
**Risk Areas**: PTY lifecycle, WebSocket reconnection, scrollback performance
**Success Metrics**: All acceptance criteria pass, performance within targets
