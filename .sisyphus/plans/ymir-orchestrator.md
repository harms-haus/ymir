# Ymir — Worktree/Agent Orchestrator

## TL;DR

> **Quick Summary**: Build a full-featured worktree/agent orchestrator with a Rust WebSocket server (source of truth), a React frontend with three resizable panels (sidebar, main, project), terminal emulation via ghostty-web, code editing via Monaco, and agent management via the Agent Client Protocol (ACP).
> 
> **Deliverables**:
> - Rust WebSocket server on port 7319 with MessagePack protocol
> - React 19 frontend with Base UI + Tailwind + shadcn theme
> - Three-panel resizable layout (sidebar, main, project)
> - ACP-compatible agent spawning and status tracking
> - ghostty-web terminal emulation with multi-tab support
> - Monaco code editor with diff viewing
> - Git worktree management via git2 crate
> - Turso persistence for workspaces and settings
> - Tauri v2 desktop wrapper
> - PR creation and merge workflows
> 
> **Estimated Effort**: XL
> **Parallel Execution**: YES — 7 waves
> **Critical Path**: Protocol + State → PTY Manager → ACP Client → Sidebar → Main Panel → Project Panel → Tauri

---

## Context

### Original Request
Build a worktree/agent orchestrator with a WebSocket host as source of truth, Vite React frontend, Tauri desktop wrapper, Turso persistence, Base UI components, ghostty-web terminals, Monaco editor, and ACP agent integration. Three-panel layout: sidebar (workspaces/worktrees), main (agent + terminal tabs), project (git changes + file browser). All interactions through WebSocket. Fast binary protocol (MessagePack).

### Interview Summary
**Key Discussions**:
- Agent Client Protocol (ACP) at agentclientprotocol.com — JSON-RPC over stdio, with session/update notifications for real-time status
- ghostty-web chosen for terminals (no xterm.js fallback)
- MessagePack for binary WebSocket protocol
- Monaco editor with file content served over WebSocket (not local filesystem)
- Server-authoritative state with optimistic UI
- Tailwind + Base UI + shadcn preset `--preset auHhe6q` + Remix Icon
- notify crate for file watching
- git2 crate for all git operations
- TDD unit tests only, no integration tests
- All performance limits defined (10k files, 5MB max edit, 50 worktrees, etc.)

### Metis Review
**Identified Gaps** (addressed):
- ACP protocol fully documented — JSON-RPC over stdio with typed session updates
- ghostty-web validated (2.1k stars, Coder's Mux uses it, WASM-based)
- Conflict resolution: server always wins (simplest, consistent)
- Monaco file access: WebSocket only (unified approach)
- Git credentials: rely on system git config
- File watcher race conditions: suppress notify events during git operations
- PTY session leaks: TTL and max session count enforcement
- Custom Tree component: performance budget of 10k nodes in <200ms

---

## Work Objectives

### Core Objective
Build a production-quality worktree/agent orchestrator that provides a unified UI for managing git worktrees, running coding agents, editing files, and executing terminal commands — all communicating through a fast binary WebSocket protocol.

### Concrete Deliverables
- `crates/ws-server/` — Full WebSocket server with MessagePack protocol
- `crates/cli/` — CLI binary with serve/kill/config commands
- `apps/web/` — Complete React SPA with three-panel layout
- `apps/tauri/` — Desktop wrapper

### Definition of Done
- [ ] `ymir serve` starts both ws-server and vite, accessible at localhost:7319
- [ ] Create workspace, add worktree, spawn agent, open terminal, edit file, create PR
- [ ] All unit tests pass

### Must Have
- Three resizable panels with persistent sizes
- Workspace/worktree CRUD with context menus
- Agent spawning via ACP with live status tracking (working/waiting/idle)
- Multi-tab ghostty-web terminals (per-worktree)
- Monaco code editor with syntax highlighting
- Diff viewer for git changes
- Git status display with colored indicators
- PR creation dialog with auto-generate via agent CLI
- Merge/squash-merge with delete option
- Alert dialog confirmations for destructive actions
- WebSocket auto-reconnect with state replay
- Turso persistence for all state
- Toast notifications for errors
- Skeleton loading states
- Activity logging throughout

### Must NOT Have (Guardrails)
- ❌ Multi-user support or authentication
- ❌ Remote workspace access (localhost only)
- ❌ AI features beyond agent spawning (no chat, no suggestions)
- ❌ Undo/redo system
- ❌ Custom themes (use preset only)
- ❌ Plugin system
- ❌ Mobile app
- ❌ Cloud sync or offline mode
- ❌ Binary file diff viewing
- ❌ Git rebase/bisect UI
- ❌ Terminal themes/fonts customization
- ❌ Monaco extensions marketplace
- ❌ Keyboard shortcuts (v1)
- ❌ Integration tests
- ❌ Repositories >1GB (no optimization for this)

---

## Verification Strategy

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed.

### Test Decision
- **Infrastructure exists**: NO (needs setup)
- **Automated tests**: TDD — write tests first where practical
- **Framework**: Rust: `cargo test`, Frontend: `vitest`
- **Focus**: Unit tests on straightforward code only

### QA Policy
Every task includes agent-executed QA scenarios with concrete commands, exact values, and evidence paths.
- **Rust**: `cargo test`, `cargo build`, manual verification via curl
- **Frontend**: Playwright for UI, vitest for unit tests
- **WebSocket**: Custom test client or curl with binary payloads

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 0 (Validation — 3 parallel tasks):
├── T1: ghostty-web integration spike [quick]
├── T2: MessagePack Rust+TS round-trip spike [quick]
└── T3: Base UI + Tailwind + shadcn preset setup [quick]

Wave 1 (Foundation — 7 parallel tasks):
├── T4: Turso schema + migrations [quick]
├── T5: MessagePack protocol types (Rust) [unspecified-high]
├── T6: MessagePack protocol types (TypeScript) [unspecified-high]
├── T7: WebSocket server core (Rust) [deep]
├── T8: WebSocket client (React) [unspecified-high]
├── T9: App shell with 3-panel layout [visual-engineering]
└── T10: CSS theme + design tokens [quick]

Wave 2 (Core Features — 7 parallel tasks):
├── T11: Workspace/worktree CRUD (Rust) [unspecified-high]
├── T12: PTY session manager (Rust) [deep]
├── T13: File watcher (Rust) [unspecified-high]
├── T14: Git operations module (Rust) [unspecified-high]
├── T15: Sidebar panel with Tree component [visual-engineering]
├── T16: Context menu system [quick]
└── T17: Toast notification system [quick]

Wave 3 (Main Panel — 6 parallel tasks):
├── T18: ghostty-web terminal component [visual-engineering]
├── T19: Terminal tab management [unspecified-high]
├── T20: ACP client (Rust) [deep]
├── T21: Agent pane with tabs [visual-engineering]
├── T22: Agent status tracking (React) [unspecified-high]
└── T23: PR creation dialog [visual-engineering]

Wave 4 (Project Panel — 5 parallel tasks):
├── T24: Monaco editor integration [visual-engineering]
├── T25: Diff viewer component [visual-engineering]
├── T26: Git changes panel [unspecified-high]
├── T27: File browser with virtual scroll [visual-engineering]
└── T28: Merge/squash-merge workflow [unspecified-high]

Wave 5 (Integration — 6 parallel tasks):
├── T29: Worktree creation flow (agent selector + git) [deep]
├── T30: Workspace settings dialog [unspecified-high]
├── T31: Alert dialog for destructive actions [visual-engineering]
├── T32: WebSocket reconnect + state replay [deep]
├── T33: Error recovery (PTY crash, git failure) [unspecified-high]
└── T34: Status bar (connection indicator) [quick]

Wave 6 (Tauri + Polish — 5 parallel tasks):
├── T35: Tauri build config + proxy setup [quick]
├── T36: Tauri native features (system tray, notifications) [unspecified-high]
├── T37: Skeleton loading states [visual-engineering]
├── T38: Activity logging throughout [deep]
└── T39: CLI serve/kill commands [unspecified-high]

Wave FINAL (Review — 4 parallel):
├── F1: Plan compliance audit [oracle]
├── F2: Code quality review [unspecified-high]
├── F3: Real manual QA [unspecified-high]
└── F4: Scope fidelity check [deep]

Critical Path: T7 → T12 → T20 → T18 → T24 → T29
Parallel Speedup: ~65% faster than sequential
Max Concurrent: 7 (Waves 0, 1, 2)
```

### Dependency Matrix

| Task | Depends On | Blocks |
|------|-----------|--------|
| T1-T3 | — | T9, T15, T18, T20, T24 |
| T4 | — | T11, T38 |
| T5 | — | T7, T8 |
| T6 | — | T8 |
| T7 | T5 | T11, T12, T13, T14 |
| T8 | T5, T6, T9 | T15-23 |
| T9 | T1, T3, T10 | T15, T18, T21, T24, T26, T27 |
| T10 | T3 | T9 |
| T11 | T4, T7 | T15, T29, T30 |
| T12 | T7 | T18, T19, T20 |
| T13 | T7 | T26, T27 |
| T14 | T7 | T26, T28, T29 |
| T15 | T8, T9, T11, T16 | T29, T30 |
| T16 | T9 | T15, T26, T27, T31 |
| T17 | T9 | T33 |
| T18 | T8, T9, T12 | T19, T34 |
| T19 | T8, T18 | — |
| T20 | T7, T12 | T21, T22, T29 |
| T21 | T8, T9, T20, T22 | T23, T29 |
| T22 | T8, T20 | T21 |
| T23 | T8, T9, T14, T16 | — |
| T24 | T8, T9 | T25 |
| T25 | T24 | — |
| T26 | T8, T9, T13, T14, T16 | — |
| T27 | T8, T9, T13, T16 | — |
| T28 | T8, T9, T14, T16, T31 | — |
| T29 | T11, T14, T15, T20, T21 | — |
| T30 | T11, T15 | — |
| T31 | T16 | T28 |
| T32 | T7, T8 | — |
| T33 | T7, T12, T14, T17 | — |
| T34 | T8, T18 | — |
| T35 | T9 | T36 |
| T36 | T35 | — |
| T37 | T9 | — |
| T38 | T4, T7 | — |
| T39 | T7 | — |
| F1-F4 | All tasks | — |

---

## TODOs

- [ ] 1. ghostty-web Integration Spike

  **What to do**:
  - Install ghostty-web (`npm install ghostty-web`) in apps/web/
  - Create a minimal React component that renders a ghostty-web terminal
  - Verify the WASM bundle loads and a terminal renders
  - Test keyboard input → data output round-trip
  - Document any Vite-specific configuration needed (workers, WASM loading)
  - Write unit test verifying the init() function completes

  **Must NOT do**:
  - Do not build the full terminal tab system yet
  - Do not integrate with WebSocket
  - Do not style the terminal (bare minimum to verify it works)

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 0 (with T2, T3)
  - **Blocks**: T9, T18
  - **Blocked By**: None

  **References**:
  - `https://github.com/coder/ghostty-web` — ghostty-web README with usage example
  - `apps/web/vite.config.ts` — Vite config for any WASM/worker setup needed
  - `apps/web/package.json` — Current dependencies (react 19, vite 6)

  **Acceptance Criteria**:
  - [ ] ghostty-web installed and init() completes without errors
  - [ ] Terminal renders a blank shell in the browser
  - [ ] Typing characters into the terminal shows output

  **QA Scenarios (MANDATORY)**:
  ```
  Scenario: ghostty-web renders a terminal
    Tool: Playwright
    Preconditions: dev server running at localhost:5173
    Steps:
      1. Navigate to http://localhost:5173
      2. Wait for element with selector '.terminal-container' to appear
      3. Type "echo hello" into the terminal element
      4. Wait 1 second for output
      5. Assert page contains text "hello"
    Expected Result: Terminal renders and accepts input
    Evidence: .sisyphus/evidence/task-1-ghostty-spike.png
  ```

  **Commit**: YES (groups with T2, T3)
  - Message: `chore(web): add ghostty-web spike for terminal validation`

---

- [ ] 2. MessagePack Rust+TS Round-Trip Spike

  **What to do**:
  - Add `rmp-serde` and `rmpv` to Rust ws-server Cargo.toml
  - Add `@msgpack/msgpack` to apps/web/package.json
  - Define a sample message type (e.g., `PingMessage { id: u64, timestamp: u64 }`)
  - Serialize in Rust, send over WebSocket as binary, deserialize in TypeScript
  - Verify round-trip preserves all fields
  - Benchmark serialization/deserialization speed (1000 iterations)
  - Write unit tests in both Rust and TypeScript

  **Must NOT do**:
  - Do not define the full protocol yet (just validate the library works)
  - Do not implement WebSocket server logic
  - Do not add compression

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 0 (with T1, T3)
  - **Blocks**: T5, T6
  - **Blocked By**: None

  **References**:
  - `crates/ws-server/Cargo.toml` — Add rmp-serde, rmpv dependencies
  - `crates/ws-server/src/main.rs` — Current minimal server
  - `apps/web/src/App.tsx` — Current WebSocket connection code
  - `https://github.com/msgpack/msgpack-javascript` — @msgpack/msgpack docs
  - `https://docs.rs/rmp-serde/latest/rmp_serde/` — rmp-serde Rust docs

  **Acceptance Criteria**:
  - [ ] Rust can serialize/deserialize sample MessagePack payload
  - [ ] TypeScript can serialize/deserialize same payload
  - [ ] Binary round-trip over WebSocket works correctly
  - [ ] 1000 iterations complete in <100ms total

  **QA Scenarios (MANDATORY)**:
  ```
  Scenario: MessagePack round-trip preserves data
    Tool: Bash (cargo test + vitest)
    Preconditions: ws-server running on port 7319
    Steps:
      1. Run: cargo test -p ws-server test_msgpack_roundtrip
      2. Assert exit code 0 with output containing "test result: ok"
      3. Run: cd apps/web && npx vitest run msgpack
      4. Assert exit code 0 with output containing "Tests  2 passed"
    Expected Result: Both test suites pass
    Evidence: .sisyphus/evidence/task-2-msgpack-spike.txt

  Scenario: Binary WebSocket transport works
    Tool: Bash (curl or custom test client)
    Preconditions: ws-server running, test endpoint exists
    Steps:
      1. Send binary MessagePack payload to ws://localhost:7319/test
      2. Receive binary response
      3. Decode and verify fields match
    Expected Result: Fields preserved exactly
    Evidence: .sisyphus/evidence/task-2-binary-ws.txt
  ```

  **Commit**: YES (groups with T1, T3)
  - Message: `chore: add MessagePack validation spike (Rust + TypeScript)`

---

- [ ] 3. Base UI + Tailwind + shadcn Preset Setup

  **What to do**:
  - Install `@base-ui/react` in apps/web/
  - Install Tailwind CSS v4 with Vite plugin
  - Apply shadcn preset `--preset auHhe6q` (fetch the theme configuration)
  - Set up CSS custom properties from the preset
  - Install `remixicon` for icons
  - Create the CSS isolation wrapper (`.root { isolation: isolate }`)
  - Verify Base UI components render: Tabs, ContextMenu, AlertDialog, Collapsible, Toolbar
  - Create a minimal proof-of-concept with one of each component
  - Install `react-resizable-panels` and verify 3-panel layout works

  **Must NOT do**:
  - Do not build the actual layout yet
  - Do not create custom components
  - Do not integrate with WebSocket

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: [`frontend-ui-ux`]

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 0 (with T1, T2)
  - **Blocks**: T9, T10
  - **Blocked By**: None

  **References**:
  - `https://base-ui.com/react/overview/quick-start` — Base UI quick start
  - `https://base-ui.com/react/handbook/styling` — Styling guide
  - `https://base-ui.com/react/components/tabs` — Tabs component
  - `https://base-ui.com/react/components/alert-dialog` — Alert dialog
  - `https://base-ui.com/react/components/context-menu` — Context menu
  - `https://base-ui.com/react/components/toolbar` — Toolbar component
  - `https://base-ui.com/react/components/collapsible` — Collapsible component
  - `https://react-resizable-panels.vercel.app/` — Panel group docs
  - `apps/web/vite.config.ts` — Vite config for Tailwind plugin
  - `apps/web/src/main.tsx` — Entry point for CSS imports
  - `apps/web/src/App.tsx` — Root component for CSS isolation wrapper
  - `apps/web/index.html` — HTML entry point

  **Acceptance Criteria**:
  - [ ] @base-ui/react installed, tree-shaking works
  - [ ] Tailwind CSS v4 configured with Vite
  - [ ] shadcn preset CSS variables applied
  - [ ] Remix Icon installed and renders icons
  - [ ] All 6 Base UI components render correctly
  - [ ] react-resizable-panels renders 3 draggable panels
  - [ ] Build output <500KB gzipped (tree-shaking verification)

  **QA Scenarios (MANDATORY)**:
  ```
  Scenario: Base UI components render
    Tool: Playwright
    Preconditions: dev server running
    Steps:
      1. Navigate to http://localhost:5173
      2. Assert element with selector '[data-panel]' renders (3 panels)
      3. Assert element with selector '[role="tab"]' renders
      4. Assert element with selector '[role="button"]' with text "Open Menu" renders
    Expected Result: All components render
    Evidence: .sisyphus/evidence/task-3-baseui-setup.png

  Scenario: Tailwind preset applied
    Tool: Playwright
    Steps:
      1. Get computed style of .root element
      2. Assert --background CSS variable matches preset values
    Expected Result: Theme variables present
    Evidence: .sisyphus/evidence/task-3-tailwind-theme.txt
  ```

  **Commit**: YES (groups with T1, T2)
   - Message: `chore(web): setup Base UI, Tailwind, shadcn preset, and Remix Icon`

---

- [ ] 4. Turso Schema + Migrations

  **What to do**:
  - Add `libsql` dependency to ws-server (Rust: libsql-client-rs)
  - Define Turso database schema with these tables:
    - `workspaces`: id (TEXT PK), name, root_path, color, icon, worktree_base_dir, settings_json, created_at, updated_at
    - `worktrees`: id (TEXT PK), workspace_id (FK), branch_name, path, status, created_at
    - `agent_sessions`: id (TEXT PK), worktree_id (FK), agent_type, acp_session_id, status, started_at
    - `terminal_sessions`: id (TEXT PK), worktree_id (FK), label, shell, created_at
    - `user_settings`: key (TEXT PK), value (TEXT)
    - `activity_log`: id (INTEGER PK AUTOINCREMENT), timestamp, level (info/warn/error), source, message, metadata_json
    - `panel_layouts`: workspace_id (TEXT PK), sidebar_size, main_size, project_size, main_split_ratio
  - Write migration function using Turso's batch SQL
  - Create a Db struct with connection pooling
  - Write unit tests for CRUD operations on each table

  **Must NOT do**:
  - Do not implement the WebSocket API yet
  - Do not add complex queries (just basic CRUD)
  - Do not set up Turso cloud sync (local file only for now)

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with T5-T10)
  - **Blocks**: T11, T38
  - **Blocked By**: None

  **References**:
  - `https://tursodatabase.com/docs/sdk/rust/libsql-client` — libsql Rust SDK docs
  - `https://docs.rs/libsql-client-rs` — Rust crate docs
  - `/tursodatabase/libsql-client-ts` — TypeScript SDK (for reference on API shape)
  - `crates/ws-server/Cargo.toml` — Add libsql-client-rs dependency

  **Acceptance Criteria**:
  - [ ] All 7 tables created with correct schema
  - [ ] CRUD operations work for workspaces, worktrees, agent_sessions, terminal_sessions
  - [ ] Activity log can insert and query by level
  - [ ] Unit tests pass (create, read, update, delete for each table)

  **QA Scenarios (MANDATORY)**:
  ```
  Scenario: Database schema is correct
    Tool: Bash (cargo test)
    Steps:
      1. Run: cargo test -p ws-server test_db_schema
      2. Assert exit code 0
      3. Assert output contains "7 tables verified"
    Expected Result: All tables exist with correct columns
    Evidence: .sisyphus/evidence/task-4-schema.txt

  Scenario: CRUD operations work
    Tool: Bash (cargo test)
    Steps:
      1. Run: cargo test -p ws-server test_db_crud
      2. Assert exit code 0
      3. Assert output contains "workspace_crud ... ok"
      4. Assert output contains "worktree_crud ... ok"
    Expected Result: All CRUD operations pass
    Evidence: .sisyphus/evidence/task-4-crud.txt
  ```

   **Commit**: YES (groups with T5)
   - Message: `feat(db): add Turso schema, migrations, and CRUD operations`

---

- [ ] 5. MessagePack Protocol Types (Rust)

  **What to do**:
  - Define the complete MessagePack protocol message types in Rust
  - Message categories (each is a struct with a `type` discriminator field):
    - **Client → Server**: `WorkspaceCreate`, `WorkspaceDelete`, `WorkspaceRename`, `WorkspaceUpdate`, `WorktreeCreate`, `WorktreeDelete`, `WorktreeMerge`, `WorktreeList`, `AgentSpawn`, `AgentSend`, `AgentCancel`, `TerminalInput`, `TerminalResize`, `TerminalCreate`, `FileRead`, `FileWrite`, `GitStatus`, `GitDiff`, `GitCommit`, `CreatePR`, `GetState`, `UpdateSettings`, `Ping`
    - **Server → Client**: `StateSnapshot`, `WorkspaceCreated`, `WorkspaceDeleted`, `WorkspaceUpdated`, `WorktreeCreated`, `WorktreeDeleted`, `WorktreeStatus`, `AgentStatusUpdate`, `AgentOutput`, `AgentPrompt`, `TerminalOutput`, `TerminalCreated`, `FileContent`, `GitStatusResult`, `GitDiffResult`, `Error`, `Pong`, `Notification`
    - **Bidirectional**: `Ack`
  - Create a sealed `ClientMessage` and `ServerMessage` enum
  - Implement `Serialize`/`Deserialize` with rmp-serde
  - Add version header to every message for protocol compatibility
  - Write unit tests for serialization round-trips of every message type

  **Must NOT do**:
  - Do not implement message handlers
  - Do not implement the WebSocket router

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with T4, T6-T10)
  - **Blocks**: T7, T8
  - **Blocked By**: None

  **References**:
  - `crates/ws-server/Cargo.toml` — Add rmp-serde dependency
  - `crates/ws-server/src/lib.rs` — Current constants
  - `https://docs.rs/rmp-serde/latest/rmp_serde/` — rmp-serde API reference

  **Acceptance Criteria**:
  - [ ] 40+ message types defined (ClientMessage + ServerMessage enums)
  - [ ] Every message serializes/deserializes correctly
  - [ ] Version header is included in all messages
  - [ ] Unit tests pass for all message types

  **QA Scenarios (MANDATORY)**:
  ```
  Scenario: All message types round-trip
    Tool: Bash (cargo test)
    Steps:
      1. Run: cargo test -p ws-server test_protocol_types
      2. Assert exit code 0
      3. Assert output contains "all message types ... ok"
    Expected Result: Zero serialization failures
    Evidence: .sisyphus/evidence/task-5-protocol-types.txt

  Scenario: Message size is reasonable
    Tool: Bash (cargo test)
    Steps:
      1. Run: cargo test -p ws-server test_protocol_size
      2. Assert largest message < 1KB serialized
    Expected Result: All messages compact
    Evidence: .sisyphus/evidence/task-5-protocol-size.txt
  ```

  **Commit**: YES (groups with T4)
  - Message: `feat(ws): define complete MessagePack protocol types`

---

- [ ] 6. MessagePack Protocol Types (TypeScript)

  **What to do**:
  - Mirror the Rust protocol types in TypeScript
  - Create `apps/web/src/types/protocol.ts` with:
    - `ClientMessage` discriminated union (same types as Rust)
    - `ServerMessage` discriminated union (same types as Rust)
    - Shared utility types referenced by messages
  - Add `@msgpack/msgpack` and create encode/decode functions
  - Add runtime type validation (type guards for each message variant)
  - Write unit tests verifying TypeScript types match Rust types (manual parity check)
  - Ensure decode handles unknown message types gracefully

  **Must NOT do**:
  - Do not build the WebSocket client yet
  - Do not add React hooks

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with T4, T5, T7-T10)
  - **Blocks**: T8
  - **Blocked By**: None

  **References**:
  - `apps/web/package.json` — Add @msgpack/msgpack
  - `apps/web/src/App.tsx` — Current WebSocket code for reference
  - `apps/web/tsconfig.json` — TypeScript config (strict mode)
  - Task T5 output — Rust protocol types (mirror these exactly)

  **Acceptance Criteria**:
  - [ ] TypeScript types match all Rust protocol types
  - [ ] encode/decode functions work for all message types
  - [ ] Unknown message types return `UnknownMessage` variant (don't throw)
  - [ ] Unit tests pass with vitest

  **QA Scenarios (MANDATORY)**:
  ```
  Scenario: TypeScript types match Rust types
    Tool: Bash (vitest)
    Steps:
      1. Run: cd apps/web && npx vitest run protocol
      2. Assert exit code 0
      3. Assert output contains "message count matches Rust: 40+"
    Expected Result: Type parity confirmed
    Evidence: .sisyphus/evidence/task-6-ts-protocol.txt

  Scenario: Decode handles unknown messages
    Tool: Bash (vitest)
    Steps:
      1. Run: cd apps/web && npx vitest run protocol-unknown
      2. Assert output contains "UnknownMessage"
    Expected Result: Graceful degradation
    Evidence: .sisyphus/evidence/task-6-unknown-msg.txt
  ```

  **Commit**: YES (groups with T4, T5)
     - Message: `feat(web): define TypeScript MessagePack protocol types`

---

- [ ] 7. WebSocket Server Core (Rust)

  **What to do**:
  - Add `axum`, `tokio-tungstenite`, `tower-http`, and `tracing` dependencies to `crates/ws-server/Cargo.toml`
  - Create `crates/ws-server/src/state.rs` with `AppState` struct containing:
    - `db: Arc<Db>` (shared database connection from Task T4)
    - `workspaces: RwLock<HashMap<String, WorkspaceState>>` (in-memory workspace registry)
    - `worktrees: RwLock<HashMap<String, WorktreeState>>` (active worktrees)
    - `agents: RwLock<HashMap<String, AgentState>>` (running agent sessions)
    - `terminals: RwLock<HashMap<String, TerminalState>>` (active PTY sessions)
    - `clients: RwLock<HashMap<Uuid, mpsc::Sender<ServerMessage>>>` (connected WebSocket clients)
    - `broadcast: broadcast::Sender<ServerMessage>` (for messages to all clients)
    - `shutdown: watch::Receiver<bool>` (graceful shutdown signal)
  - Create `crates/ws-server/src/router.rs` with the message dispatch function:
    - Receive raw WebSocket bytes → decode as MessagePack `ClientMessage`
    - Match on message type → call appropriate handler
    - Handler returns `ServerMessage` or error → encode as MessagePack → send to client
    - Broadcast state changes to all connected clients
  - Create `crates/ws-server/src/hub.rs` with client connection management:
    - `connect()`: Register client, send `StateSnapshot` on join
    - `disconnect()`: Unregister client, clean up subscriptions
    - `broadcast()`: Send message to all connected clients
    - `send_to()`: Send message to specific client by ID
    - `presence()`: Track which clients are online
  - Create `crates/ws-server/src/main.rs` updates:
    - Bind TCP listener on port 7319
    - Spawn `axum::Server` with WebSocket upgrade route at `/`
    - Add `/health` HTTP GET endpoint returning `{"status":"ok"}`
    - Spawn Tokio task for each WebSocket connection
    - Implement graceful shutdown on Ctrl-C (drain connections, then exit)
  - Add `tracing` spans to all handlers (connection lifecycle, message routing, handler execution)
  - Implement heartbeat: server sends `Ping` every 30 seconds, client must respond with `Pong` within 5 seconds or connection is closed
  - Write unit tests for: connection lifecycle, message routing dispatch, broadcast delivery, heartbeat timeout, graceful shutdown

  **Must NOT do**:
  - Do not implement workspace/worktree/agent/terminal handlers (just routing and connection management)
  - Do not implement the Vite reverse proxy (that comes in T35)
  - Do not implement file operations or git operations

  **Recommended Agent Profile**:
  - **Category**: `deep`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with T4-T6, T8-T10)
  - **Blocks**: T11, T12, T13, T14
  - **Blocked By**: T5

  **References**:
  - `crates/ws-server/src/main.rs` — Current minimal server that binds port 7319
  - `crates/ws-server/src/lib.rs` — Current constants (`DEFAULT_PORT=7319`, `VITE_PROXY_PORT=5173`)
  - `crates/ws-server/Cargo.toml` — Add axum, tokio-tungstenite, tower-http, tracing dependencies
  - `Cargo.toml` — Workspace root (tokio, serde, serde_json, tracing are workspace dependencies)
  - `ARCHITECTURE.md:86-96` — Planned module structure: server.rs, router.rs, state.rs, hub.rs, protocol.rs
  - `ARCHITECTURE.md:16-23` — Communication flow diagram showing Tauri + Web connecting to ws-server
  - Task T5 output — Rust protocol types that the router will match on

  **Acceptance Criteria**:
  - [ ] Server binds to port 7319 and accepts TCP connections
  - [ ] WebSocket upgrade succeeds at path `/`
  - [ ] ClientMessage from binary payload dispatches to correct handler (handler returns NotImplemented for now)
  - [ ] ServerMessage is encoded as MessagePack binary and sent to the originating client
  - [ ] `broadcast()` sends ServerMessage to all connected clients
  - [ ] `send_to()` sends ServerMessage to specific client by UUID
  - [ ] Ping/Pong heartbeat: server sends Ping every 30s, client has 5s to respond
  - [ ] `/health` endpoint returns 200 OK with JSON body `{"status":"ok"}`
  - [ ] Client disconnect removes from registry and cleans up subscriptions
  - [ ] Ctrl-C triggers graceful shutdown (all connections drained)
  - [ ] Unit tests pass for connection lifecycle, routing, broadcast, heartbeat, shutdown

  **QA Scenarios (MANDATORY)**:
  ```
  Scenario: WebSocket server accepts connections and routes messages
    Tool: Bash (cargo test + custom test client)
    Preconditions: ws-server binary built
    Steps:
      1. Run: cargo test -p ws-server test_connection_lifecycle
      2. Assert exit code 0
      3. Assert output contains "test_connection_lifecycle ... ok"
      4. Run: cargo test -p ws-server test_message_routing
      5. Assert exit code 0
    Expected Result: All connection and routing tests pass
    Evidence: .sisyphus/evidence/task-7-ws-server-tests.txt

  Scenario: Health endpoint returns OK
    Tool: Bash (curl)
    Preconditions: ws-server running on port 7319
    Steps:
      1. Run: cargo run -p ws-server &
      2. Run: curl -s http://localhost:7319/health
      3. Assert response body contains "ok"
      4. Assert HTTP status is 200
    Expected Result: 200 OK with {"status":"ok"}
    Evidence: .sisyphus/evidence/task-7-health.txt

  Scenario: Heartbeat disconnects unresponsive clients
    Tool: Bash (cargo test)
    Steps:
      1. Run: cargo test -p ws-server test_heartbeat_timeout
      2. Assert exit code 0
    Expected Result: Unresponsive client disconnected after 5s
    Evidence: .sisyphus/evidence/task-7-heartbeat.txt
  ```

  **Commit**: YES (groups with T4-T6)
  - Message: `feat(ws): WebSocket server core with routing, hub, and heartbeat`

---

- [ ] 8. WebSocket Client (React)

  **What to do**:
  - Install `zustand` and `@msgpack/msgpack` in apps/web/
  - Create `apps/web/src/lib/ws.ts` — Typed WebSocket client wrapper class `YmirClient`:
    - Constructor takes WebSocket URL, auto-connects on instantiation
    - `send(message: ClientMessage)` — encodes via MessagePack, sends as binary ArrayBuffer
    - `onMessage(type: ServerMessage['type'], callback)` — subscribe to specific message types
    - `onDisconnect(callback)` — called when connection is lost
    - `onReconnect(callback)` — called when reconnection succeeds
    - Internal reconnection logic: exponential backoff starting at 1s, doubling to 2s, 4s, 8s, then cap at 30s
    - On reconnect: automatically send `GetState` message to request full state replay from server
    - Queue outgoing messages during disconnect period, flush on reconnect
    - Close cleanly on `window.beforeunload`
  - Create `apps/web/src/lib/api.ts` — typed helper functions:
    - `createWorkspace(name, rootPath, color, icon)` → sends WorkspaceCreate
    - `deleteWorkspace(id)` → sends WorkspaceDelete
    - `createWorktree(workspaceId, branchName, agentType)` → sends WorktreeCreate
    - `deleteWorktree(id)` → sends WorktreeDelete
    - `mergeWorktree(id, squash, deleteAfter)` → sends WorktreeMerge
    - `listWorktrees(workspaceId)` → sends WorktreeList
    - `sendToAgent(worktreeId, message)` → sends AgentSend
    - `cancelAgent(worktreeId)` → sends AgentCancel
    - `createTerminal(worktreeId, label)` → sends TerminalCreate
    - `sendTerminalInput(sessionId, data)` → sends TerminalInput
    - `readFile(worktreeId, path)` → sends FileRead
    - `writeFile(worktreeId, path, content)` → sends FileWrite
    - `getGitStatus(worktreeId)` → sends GitStatus
    - `getGitDiff(worktreeId, filePath)` → sends GitDiff
    - `createPR(worktreeId, title, body)` → sends CreatePR
    - `updateSettings(key, value)` → sends UpdateSettings
  - Create `apps/web/src/hooks/useWebSocket.ts` — React hook:
    - Returns: `{ client, status, error }` where status is 'connecting' | 'open' | 'closed' | 'reconnecting'
    - Creates singleton YmirClient instance
    - Subscribes to connection state changes, triggers re-renders
  - Create `apps/web/src/store.ts` — Zustand store with:
    - `workspaces: Workspace[]` — array of all workspaces
    - `worktrees: Worktree[]` — array of all worktrees
    - `activeWorktreeId: string | null` — currently selected worktree
    - `agentSessions: AgentSession[]` — running agent sessions
    - `terminalSessions: TerminalSession[]` — running terminal sessions
    - `notifications: Notification[]` — pending toast notifications
    - Actions to update each slice from incoming ServerMessages
    - `stateFromSnapshot(snapshot)` — replaces entire store from StateSnapshot message
  - Create `apps/web/src/types/state.ts` — TypeScript interfaces for all state shapes
  - Write unit tests for: encode/decode round-trip, reconnection backoff logic, state update from messages, message queue during disconnect

  **Must NOT do**:
  - Do not build UI components that consume the store
  - Do not implement feature-specific hooks (useWorkspace, useTerminal, etc.)
  - Do not add any visual rendering

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with T4-T7, T9, T10)
  - **Blocks**: T15, T16, T17, T18, T19, T20, T21, T22, T23
  - **Blocked By**: T5, T6

  **References**:
  - `apps/web/src/App.tsx` — Current basic WebSocket connection (replace with typed client)
  - `apps/web/package.json` — Add zustand, @msgpack/msgpack
  - `apps/web/tsconfig.json` — Strict TypeScript config, ES2020 target
  - Task T6 output — TypeScript protocol types (import ClientMessage, ServerMessage)
  - Task T5 output — Rust protocol types (for verifying parity)

  **Acceptance Criteria**:
  - [ ] WebSocket connects to `ws://localhost:7319` on instantiation
  - [ ] Binary MessagePack messages sent as ArrayBuffer (not stringified JSON)
  - [ ] ServerMessage decoded from binary and routed to correct subscriber
  - [ ] Auto-reconnect fires on disconnect: 1s, 2s, 4s, 8s, 30s max
  - [ ] GetState message sent automatically on successful reconnect
  - [ ] Outgoing messages queued during disconnect, flushed on reconnect
  - [ ] Zustand store updates from incoming ServerMessages
  - [ ] StateSnapshot replaces entire store contents
  - [ ] Unit tests pass (encode/decode, backoff, state updates, queue)

  **QA Scenarios (MANDATORY)**:
  ```
  Scenario: WebSocket client connects and receives messages
    Tool: Bash (vitest)
    Preconditions: ws-server running on port 7319
    Steps:
      1. Run: cd apps/web && npx vitest run ws-client
      2. Assert exit code 0
      3. Assert output contains "connects successfully ... ok"
      4. Assert output contains "receives binary messages ... ok"
    Expected Result: Client connects and receives messages
    Evidence: .sisyphus/evidence/task-8-ws-client.txt

  Scenario: Reconnection works correctly
    Tool: Bash (vitest)
    Steps:
      1. Run: cd apps/web && npx vitest run ws-reconnect
      2. Assert exit code 0
      3. Assert output contains "exponential backoff ... ok"
      4. Assert output contains "sends GetState on reconnect ... ok"
    Expected Result: Reconnection with proper backoff
    Evidence: .sisyphus/evidence/task-8-reconnect.txt

  Scenario: Message queue preserves offline messages
    Tool: Bash (vitest)
    Steps:
      1. Run: cd apps/web && npx vitest run ws-queue
      2. Assert output contains "queue messages during disconnect ... ok"
      3. Assert output contains "flush on reconnect ... ok"
    Expected Result: Messages queued and flushed
    Evidence: .sisyphus/evidence/task-8-queue.txt
  ```

  **Commit**: YES (groups with T4-T7)
  - Message: `feat(web): typed WebSocket client with reconnect and Zustand store`

---

- [ ] 9. App Shell with 3-Panel Layout

  **What to do**:
  - Install `react-resizable-panels` in apps/web/
  - Create `apps/web/src/components/layout/AppShell.tsx` — the main layout component:
    - Outer wrapper div with class `.root` and `isolation: isolate` (Base UI portal requirement)
    - `PanelGroup(direction="horizontal", autoSaveId="ymir-panels")` as the root
    - Left Panel: `Panel(id="sidebar", defaultSize=20, minSize={200})` — Sidebar panel
    - First resize handle: `PanelResizeHandle(id="sidebar-main", className="panel-handle")`
    - Center Panel: `Panel(id="main", defaultSize=50, minSize={300})` — Main panel
    - Second resize handle: `PanelResizeHandle(id="main-project", className="panel-handle")`
    - Right Panel: `Panel(id="project", defaultSize=30, minSize={200})` — Project panel
  - Create placeholder components for each panel:
    - `apps/web/src/components/sidebar/SidebarPanel.tsx` — Renders: "Sidebar" header, empty workspace list area
    - `apps/web/src/components/main/MainPanel.tsx` — Renders: vertical split placeholder with upper "Agent" area and lower "Terminal" area, connected by a vertical `PanelGroup(direction="vertical")` with default 60/40 split
    - `apps/web/src/components/project/ProjectPanel.tsx` — Renders: "Project" header, empty file list area
  - Style resize handles in `apps/web/src/styles/panels.css`:
    - Thin gray line: `width: 4px`, `background: hsl(var(--border))`, `cursor: col-resize`
    - On hover/focus: `background: hsl(var(--accent))` (highlight color)
    - Minimum hit area: `width: 8px` with `margin-left: -2px` (center the 4px line on the 8px hit area)
  - Create `apps/web/src/components/layout/StatusBar.tsx` — minimal status bar at bottom showing connection status (placeholder text for now, wired up in T34)
  - Update `apps/web/src/App.tsx`:
    - Import AppShell and wrap entire app
    - Wrap with useWebSocket provider for WebSocket context
    - Render `AppShell` as root component

  **Must NOT do**:
  - Do not add actual workspace lists, terminal rendering, or file trees
  - Do not add keyboard shortcuts
  - Do not implement panel collapse functionality
  - Do not persist panel sizes to Turso (react-resizable-panels autoSaveId handles localStorage persistence; Turso persistence comes later)

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
  - **Skills**: [`frontend-ui-ux`]

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with T4-T8, T10)
  - **Blocks**: T15, T18, T21, T24, T26, T27
  - **Blocked By**: T1, T3, T10

  **References**:
  - `https://react-resizable-panels.vercel.app/` — API docs: PanelGroup, Panel, PanelResizeHandle
  - `apps/web/src/App.tsx` — Current root component (rewrite to use AppShell)
  - `apps/web/src/main.tsx` — DOM mount point
  - `apps/web/index.html` — HTML root element (where .root class goes)
  - `apps/web/vite.config.ts` — Vite config
  - Task T3 output — Base UI and Tailwind setup
  - Task T10 output — CSS theme variables
  - `ARCHITECTURE.md:110-119` — Planned frontend component structure

  **Acceptance Criteria**:
  - [ ] Three panels render side by side with correct proportions (20/50/30)
  - [ ] Two horizontal resize handles visible between panels (thin gray lines)
  - [ ] One vertical resize handle visible inside main panel (between agent and terminal)
  - [ ] Panels cannot resize below their minimum pixel constraints (200px sidebar, 300px main, 200px project)
  - [ ] Dragging resize handles changes panel sizes smoothly
  - [ ] Panel sizes persist across page refresh (via react-resizable-panels autoSaveId)
  - [ ] StatusBar renders at the bottom of the app
  - [ ] Dark theme background applied from CSS variables
  - [ ] Build succeeds: `npm run build` completes without errors

  **QA Scenarios (MANDATORY)**:
  ```
  Scenario: Three-panel layout renders correctly
    Tool: Playwright
    Preconditions: dev server running at localhost:5173
    Steps:
      1. Navigate to http://localhost:5173
      2. Assert 3 elements with attribute [data-panel] exist
      3. Assert 2 elements with attribute [data-panel-resize-handle] exist (horizontal)
      4. Assert 1 element with attribute [data-panel-resize-handle] exists inside main panel (vertical)
      5. Measure width of sidebar panel — assert approximately 20% of window width
      6. Measure width of main panel — assert approximately 50% of window width
      7. Measure width of project panel — assert approximately 30% of window width
    Expected Result: 3 panels with correct proportions and resize handles
    Evidence: .sisyphus/evidence/task-9-layout.png

  Scenario: Panels resize on drag
    Tool: Playwright
    Steps:
      1. Get initial width of sidebar panel
      2. Drag first resize handle 200px to the right
      3. Get new width of sidebar panel
      4. Assert new width is approximately (initial + 200) pixels
      5. Assert main panel width decreased by approximately 200 pixels
    Expected Result: Dragging resize handle changes panel sizes
    Evidence: .sisyphus/evidence/task-9-resize.png

  Scenario: Minimum panel width enforced
    Tool: Playwright
    Steps:
      1. Drag sidebar resize handle far left (toward 0 width)
      2. Stop dragging
      3. Assert sidebar panel width is >= 200px
      4. Drag project resize handle far right
      5. Assert project panel width is >= 200px
    Expected Result: Panels don't collapse below minimum
    Evidence: .sisyphus/evidence/task-9-min-width.png

  Scenario: Panel sizes persist across refresh
    Tool: Playwright
    Steps:
      1. Drag sidebar resize handle to a specific position
      2. Record sidebar panel width
      3. Reload the page (navigate to same URL)
      4. Wait for panels to render
      5. Assert sidebar panel width matches recorded value (within 2px tolerance)
    Expected Result: Sizes survive page reload
    Evidence: .sisyphus/evidence/task-9-persist.png
  ```

  **Commit**: YES (groups with T4-T8)
  - Message: `feat(web): 3-panel resizable layout with vertical split in main panel`

---

- [ ] 10. CSS Theme + Design Tokens

  **What to do**:
  - Create `apps/web/src/styles/theme.css` — the complete CSS custom property definition file
  - Extract the shadcn `--preset auHhe6q` color tokens and map them to semantic names:
    - **Background**: `--background` (dark navy/charcoal), `--foreground` (light text)
    - **Surfaces**: `--card` (panel background), `--card-foreground` (text on cards)
    - **Primary**: `--primary` (main accent), `--primary-foreground` (text on primary)
    - **Muted**: `--muted` (subtle background), `--muted-foreground` (secondary text)
    - **Accent**: `--accent` (hover/active states), `--accent-foreground`
    - **Destructive**: `--destructive` (red for delete/error), `--destructive-foreground`
    - **Border**: `--border` (panel borders, resize handles)
    - **Input**: `--input` (form field borders)
    - **Ring**: `--ring` (focus ring color)
    - **Radius**: `--radius` (border radius for rounded elements)
  - Add application-specific tokens:
    - **Status dots**: `--status-working` (#22c55e green), `--status-idle` (#71717a gray), `--status-waiting` (#eab308 yellow)
    - **Panel backgrounds**: `--panel-sidebar` (slightly lighter), `--panel-main` (slightly darker), `--panel-project` (slightly lighter)
    - **Terminal**: `--terminal-bg` (dark background), `--terminal-fg` (light text)
    - **Font**: `--font-sans` (system UI font stack), `--font-mono` (monospace stack for terminal and code)
    - **Spacing**: `--spacing-xs` (4px), `--spacing-sm` (8px), `--spacing-md` (16px), `--spacing-lg` (24px), `--spacing-xl` (32px)
  - Import `theme.css` in `apps/web/src/main.tsx` BEFORE any component imports
  - Ensure all component CSS uses `hsl(var(--token-name))` format (shadcn convention)
  - Do NOT use hardcoded color values anywhere in component code
  - Write a simple unit test (vitest + jsdom) verifying that CSS variables are present on the document root after the app mounts

  **Must NOT do**:
  - Do NOT add light mode (app is dark-only per requirements)
  - Do NOT add theme switching logic or provider
  - Do NOT customize Monaco or ghostty-web themes yet (those are separate concerns)
  - Do NOT use any Tailwind color utility classes directly (use CSS variables)

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: [`frontend-ui-ux`]

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with T4-T9)
  - **Blocks**: T9
  - **Blocked By**: T3

  **References**:
  - `https://ui.shadcn.com/themes` — shadcn theme system documentation (CSS variable conventions)
  - `apps/web/src/main.tsx` — Where to import theme.css (before other imports)
  - Task T3 output — Base UI + Tailwind setup (verify Tailwind v4 config matches CSS variables)

  **Acceptance Criteria**:
  - [ ] `theme.css` contains all listed CSS custom properties
  - [ ] All color tokens use HSL format: `hsl(var(--token-name))`
  - [ ] Status dot colors match requirements: green (#22c55e), gray (#71717a), yellow (#eab308)
  - [ ] Panel backgrounds have subtle visual differentiation (not all same shade)
  - [ ] Font stacks defined for sans-serif and monospace
  - [ ] Spacing tokens defined at all 5 levels
  - [ ] Unit test passes: CSS variables present on document.documentElement after mount
  - [ ] No hardcoded color values exist in any component CSS file (search confirms)

  **QA Scenarios (MANDATORY)**:
  ```
  Scenario: CSS theme variables applied correctly
    Tool: Bash (vitest)
    Steps:
      1. Run: cd apps/web && npx vitest run theme
      2. Assert exit code 0
      3. Assert output contains "theme variables ... ok"
      4. Assert output contains "no hardcoded colors ... ok"
    Expected Result: Theme applied, no hardcoded colors
    Evidence: .sisyphus/evidence/task-10-theme-test.txt

  Scenario: Theme visible in browser
    Tool: Playwright
    Preconditions: dev server running
    Steps:
      1. Navigate to http://localhost:5173
      2. Run: getComputedStyle(document.documentElement).getPropertyValue('--background')
      3. Assert value is non-empty (contains HSL values)
      4. Run: getComputedStyle(document.documentElement).getPropertyValue('--status-working')
      5. Assert value contains "142" (green hue in HSL)
    Expected Result: All variables present and contain expected values
    Evidence: .sisyphus/evidence/task-10-theme-browser.png
  ```

  **Commit**: YES (groups with T4-T9)
     - Message: `feat(web): apply shadcn preset theme with semantic design tokens`

---

## Wave 2: Core Features

- [ ] 11. Workspace/Worktree CRUD (Rust)

  **What to do**:
  - Add `git2` crate dependency to `crates/ws-server/Cargo.toml`
  - Create `crates/ws-server/src/workspace/mod.rs`:
    - `WorkspaceState` struct: id, name, root_path, color, icon, worktree_base_dir, settings
    - `create(db, msg)` — validate inputs, insert into Turso `workspaces` table, return WorkspaceCreated message
    - `delete(db, msg)` — verify no active worktrees, delete from Turso, return WorkspaceDeleted
    - `rename(db, msg)` — update name in Turso, return WorkspaceUpdated
    - `update(db, msg)` — update settings (color, icon, worktree_base_dir) in Turso, return WorkspaceUpdated
    - All functions log to `activity_log` table
    - Write unit tests for each CRUD operation (use in-memory SQLite for test isolation)
  - Create `crates/ws-server/src/worktree/mod.rs`:
    - `WorktreeState` struct: id, workspace_id, branch_name, path, status, created_at
    - `create(db, git, msg)` — use `git2::Repository::worktree_add()` to create actual git worktree, compute path from workspace settings (default: `${root_path}/.worktrees/${branch_name}`), insert into Turso, return WorktreeCreated
    - `delete(db, git, msg)` — use `git2::Repository::worktree_remove()` to delete worktree, remove from Turso, return WorktreeDeleted
    - `list(db, msg)` — query Turso for worktrees belonging to workspace, return WorktreeList message
    - `status(db, git, msg)` — call `git2::Repository::worktree_list()` and compare with Turso entries, detect orphaned worktrees
    - Handle edge cases: branch already has worktree, worktree directory already exists, git operation fails
    - Write unit tests for each operation

  **Must NOT do**:
  - Do not implement WebSocket message sending (handlers only — router calls these)
  - Do not spawn agents or terminals when creating worktrees (that's T29)
  - Do not implement merge operations (that's T14 + T28)
  - Do not implement file watching or change detection

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with T12-T17)
  - **Blocks**: T15, T29, T30
  - **Blocked By**: T4, T7

  **References**:
  - `ARCHITECTURE.md:67-73` — Planned workspace.rs and worktree.rs modules
  - `https://docs.rs/git2/latest/git2/` — git2 crate documentation
  - `https://docs.rs/git2/latest/git2/struct.Repository.html#method.worktree_add` — git worktree_add API
  - `https://docs.rs/git2/latest/git2/struct.Repository.html#method.worktree_remove` — git worktree_remove API
  - Task T4 output — Database schema for workspaces and worktrees tables
  - Task T5 output — WorkspaceCreate, WorkspaceDelete, WorkspaceRename, WorkspaceUpdate, WorktreeCreate, WorktreeDelete, WorktreeList message types

  **Acceptance Criteria**:
  - [ ] `create workspace` inserts into Turso and returns WorkspaceCreated with full object
  - [ ] `delete workspace` fails gracefully if worktrees exist (returns error with message)
  - [ ] `create worktree` creates actual git worktree on disk AND inserts into Turso
  - [ ] `delete worktree` removes actual git worktree from disk AND removes from Turso
  - [ ] `list worktrees` returns all worktrees for a workspace sorted by created_at
  - [ ] Unit tests pass for all CRUD operations on both workspaces and worktrees
  - [ ] Activity log entries created for each operation

  **QA Scenarios (MANDATORY)**:
  ```
  Scenario: Workspace CRUD operations work
    Tool: Bash (cargo test)
    Steps:
      1. Run: cargo test -p ws-server test_workspace_crud
      2. Assert exit code 0
      3. Assert output contains "create_workspace ... ok"
      4. Assert output contains "delete_workspace ... ok"
      5. Assert output contains "rename_workspace ... ok"
      6. Assert output contains "update_workspace ... ok"
    Expected Result: All workspace CRUD operations pass
    Evidence: .sisyphus/evidence/task-11-workspace-crud.txt

  Scenario: Worktree creates actual git worktree
    Tool: Bash (cargo test)
    Steps:
      1. Run: cargo test -p ws-server test_worktree_create
      2. Assert exit code 0
      3. Assert test output contains "git worktree created on disk"
      4. Assert test output contains "worktree inserted in database"
    Expected Result: Both disk and database operations succeed
    Evidence: .sisyphus/evidence/task-11-worktree-create.txt

  Scenario: Cannot delete workspace with active worktrees
    Tool: Bash (cargo test)
    Steps:
      1. Run: cargo test -p ws-server test_workspace_delete_with_worktrees
      2. Assert exit code 0
      3. Assert output contains "delete blocked: workspace has 2 worktrees"
    Expected Result: Graceful error, no database corruption
    Evidence: .sisyphus/evidence/task-11-delete-blocked.txt
  ```

  **Commit**: YES (groups with T12-T14)
  - Message: `feat(ws): workspace and worktree CRUD with git2 integration`

---

- [ ] 12. PTY Session Manager (Rust)

  **What to do**:
  - Add `portable-pty` crate dependency to `crates/ws-server/Cargo.toml`
  - Create `crates/ws-server/src/pty/mod.rs`:
    - `PtySession` struct:
      - `id: Uuid` — unique session identifier
      - `worktree_id: String` — parent worktree
      - `label: String` — display label ("Terminal 1", etc.)
      - `shell: String` — shell executable path (auto-detect: `$SHELL` or fallback to `/bin/sh`)
      - `pid: u32` — process ID of the child process
      - `pair: portable_pty::PtyPair` — the PTY read/write pair
      - `alive: AtomicBool` — whether session is still running
      - `created_at: DateTime<Utc>` — when session was created
      - `last_activity: AtomicU64` — Unix timestamp of last I/O (for TTL)
    - `PtyManager` struct:
      - `sessions: RwLock<HashMap<Uuid, PtySession>>` — all active sessions
      - `max_sessions: usize` — hardcoded to 20 (from requirements)
      - `shutdown: watch::Receiver<bool>` — graceful shutdown signal
    - `PtyManager::create(worktree_path, label)` — spawn PTY with shell in worktree directory, register session, return TerminalCreated message with session ID
    - `PtyManager::write(session_id, data)` — write bytes to PTY stdin (from TerminalInput message)
    - `PtyManager::read(session_id)` — async reader that reads PTY stdout and emits TerminalOutput messages (Tokio task per session)
    - `PtyManager::resize(session_id, cols, rows)` — resize PTY terminal (from TerminalResize message)
    - `PtyManager::kill(session_id)` — kill PTY process, clean up session
    - `PtyManager::cleanup_dead()` — remove sessions where alive=false, called periodically
    - Spawn a Tokio task per session that continuously reads PTY stdout and broadcasts TerminalOutput to all connected clients
    - Implement TTL: if no I/O for 30 minutes on a session, kill it and log warning
    - On graceful shutdown: kill all PTY sessions before exiting
  - Write unit tests for: create session, write/read round-trip, resize, kill, max sessions enforced, TTL cleanup

  **Must NOT do**:
  - Do not integrate with ghostty-web rendering (that's the frontend's job)
  - Do not implement WebSocket message sending (manager only handles PTY lifecycle)
  - Do not implement scrollback buffering (not needed per requirements)
  - Do not add session persistence across restarts (new PTY on restart)

  **Recommended Agent Profile**:
  - **Category**: `deep`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with T11, T13-T17)
  - **Blocks**: T18, T19, T20
  - **Blocked By**: T7

  **References**:
  - `https://docs.rs/portable-pty/latest/portable_pty/` — portable-pty crate docs
  - `https://docs.rs/portable-pty/latest/portable_pty/trait.PtyPair.html` — PtyPair API
  - `ARCHITECTURE.md:97-100` — Planned PTY module: manager.rs, session.rs
  - Task T7 output — AppState struct (PtyManager will be a field)
  - Task T5 output — TerminalInput, TerminalResize, TerminalOutput, TerminalCreated message types

  **Acceptance Criteria**:
  - [ ] PTY sessions spawn in the correct working directory
  - [ ] Writing to session stdin produces expected stdout output
  - [ ] Resizing PTY works (verified by checking terminal dimensions)
  - [ ] Max 20 sessions enforced (attempting 21st returns error)
  - [ ] Dead sessions cleaned up on next `cleanup_dead()` call
  - [ ] TTL kills sessions after 30 minutes of inactivity
  - [ ] Graceful shutdown kills all sessions before exit
  - [ ] Unit tests pass for all operations

  **QA Scenarios (MANDATORY)**:
  ```
  Scenario: PTY session works correctly
    Tool: Bash (cargo test)
    Steps:
      1. Run: cargo test -p ws-server test_pty_session
      2. Assert exit code 0
      3. Assert output contains "create_session ... ok"
      4. Assert output contains "write_read_roundtrip ... ok"
      5. Assert output contains "resize ... ok"
      6. Assert output contains "kill ... ok"
    Expected Result: All PTY operations work
    Evidence: .sisyphus/evidence/task-12-pty-tests.txt

  Scenario: Max sessions enforced
    Tool: Bash (cargo test)
    Steps:
      1. Run: cargo test -p ws-server test_pty_max_sessions
      2. Assert exit code 0
      3. Assert output contains "20 sessions created"
      4. Assert output contains "21st session rejected"
    Expected Result: 20th session OK, 21st rejected
    Evidence: .sisyphus/evidence/task-12-max-sessions.txt

  Scenario: TTL cleanup works
    Tool: Bash (cargo test)
    Steps:
      1. Run: cargo test -p ws-server test_pty_ttl
      2. Assert exit code 0
      3. Assert output contains "session killed after inactivity"
    Expected Result: Inactive sessions cleaned up
    Evidence: .sisyphus/evidence/task-12-ttl.txt
  ```

  **Commit**: YES (groups with T11, T13, T14)
  - Message: `feat(ws): PTY session manager with TTL and max session enforcement`

---

- [ ] 13. File Watcher (Rust)

  **What to do**:
  - Add `notify` crate dependency (with `serde` feature) to `crates/ws-server/Cargo.toml`
  - Create `crates/ws-server/src/watcher/mod.rs`:
    - `FileWatcher` struct:
      - `notify_watcher: RecommendedWatcher` — the notify crate watcher
      - `broadcast: mpsc::Sender<FileChangeEvent>` — channel to send change events
      - `locked: Arc<AtomicBool>` — when true, suppress all events (for git operations)
      - `debounce: DebounceState` — event deduplication state
    - `FileChangeEvent` struct: path, event_type (created/modified/deleted/renamed), timestamp
    - `FileWatcher::new(broadcast)` — create watcher instance
    - `FileWatcher::watch(path)` — start watching a directory recursively
    - `FileWatcher::unwatch(path)` — stop watching a directory
    - `FileWatcher::lock()` — suppress events (called before git operations like merge, checkout)
    - `FileWatcher::unlock()` — resume event processing (called after git operations complete)
    - Event filtering: ignore paths containing `.git/`, `node_modules/`, `.DS_Store`, and other common ignore patterns
    - Debounce: group rapid events (within 100ms) for the same file into a single FileChangeEvent
    - Create a background Tokio task that receives events from notify, applies filters/debounce, and sends to broadcast channel
  - Integrate with AppState: add `file_watcher: Arc<FileWatcher>` field
  - When worktree is created: automatically start watching its directory
  - When worktree is deleted: stop watching its directory
  - Write unit tests for: watch/unwatch, lock/unlock suppression, debounce, event filtering

  **Must NOT do**:
  - Do not implement the React frontend integration (that's T26/T27)
  - Do not modify file content (watcher is read-only)
  - Do not implement git diff computation (that's T14)
  - Do not store events in database (real-time only)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with T11, T12, T14-T17)
  - **Blocks**: T26, T27
  - **Blocked By**: T7

  **References**:
  - `https://docs.rs/notify/latest/notify/` — notify crate documentation
  - `https://docs.rs/notify/latest/notify/struct.RecommendedWatcher.html` — RecommendedWatcher API
  - `ARCHITECTURE.md` — No specific watcher section, but aligns with planned state.rs and events.rs
  - Task T7 output — AppState where FileWatcher will be integrated

  **Acceptance Criteria**:
  - [ ] FileWatcher detects file creation, modification, and deletion
  - [ ] Events are debounced (rapid changes to same file = single event)
  - [ ] `.git/`, `node_modules/` paths are filtered out
  - [ ] `lock()` suppresses all events while locked
  - [ ] `unlock()` resumes event processing
  - [ ] Multiple directories can be watched simultaneously
  - [ ] Unit tests pass for all operations

  **QA Scenarios (MANDATORY)**:
  ```
  Scenario: File watcher detects changes
    Tool: Bash (cargo test)
    Steps:
      1. Run: cargo test -p ws-server test_watcher_detect
      2. Assert exit code 0
      3. Assert output contains "file_create ... ok"
      4. Assert output contains "file_modify ... ok"
      5. Assert output contains "file_delete ... ok"
    Expected Result: All change types detected
    Evidence: .sisyphus/evidence/task-13-watcher.txt

  Scenario: Debounce filters rapid events
    Tool: Bash (cargo test)
    Steps:
      1. Run: cargo test -p ws-server test_watcher_debounce
      2. Assert exit code 0
      3. Assert output contains "10 rapid writes → 1 event"
    Expected Result: Debounce working correctly
    Evidence: .sisyphus/evidence/task-13-debounce.txt

  Scenario: Lock suppresses events
    Tool: Bash (cargo test)
    Steps:
      1. Run: cargo test -p ws-server test_watcher_lock
      2. Assert exit code 0
      3. Assert output contains "events suppressed while locked"
      4. Assert output contains "events resumed after unlock"
    Expected Result: Lock/unlock works correctly
    Evidence: .sisyphus/evidence/task-13-lock.txt
  ```

  **Commit**: YES (groups with T11, T12, T14)
  - Message: `feat(ws): file watcher with debouncing and git-operation suppression`

---

- [ ] 14. Git Operations Module (Rust)

  **What to do**:
  - Create `crates/ws-server/src/git/mod.rs` using `git2` crate:
    - `GitOps` struct: takes workspace root path, provides all git operations
    - `status(repo_path)` → `GitStatusResult`:
      - Call `git2::Repository::statuses()` to get working tree status
      - Parse into: file path, change type (Added/Modified/Deleted/Untracked/Renamed/Copied), staged flag
      - Group by directory for folder-based display
    - `diff(repo_path, file_path)` → `GitDiffResult`:
      - Call `git2::Repository::diff_tree_to_workdir_with_index()`
      - Parse diff output into line-by-line: added, removed, context
      - For binary files: return "Binary file differs" message
    - `commit(repo_path, message, files)`:
      - Stage specified files with `Index::add_path()`
      - Create commit with `Repository::commit()`
      - Return success/error
    - `merge(repo_path, branch, squash)`:
      - Call `Repository::merge()` for regular merge
      - For squash: merge with `MergeFlags::NO_COMMIT`, then single commit with squash message
      - Handle conflicts: return error with conflict details
    - `log(repo_path, count)` — recent commit history (sha, author, message, timestamp)
    - `current_branch(repo_path)` — get current branch name
    - `create_pr(title, body)` — shell out to `gh pr create --title "..." --body "..."` using `std::process::Command`:
      - Capture stdout (PR URL) and stderr (errors)
      - Return success with PR URL or error with stderr message
      - Check `gh` is installed first (run `gh --version`), return descriptive error if not
    - All operations must call `FileWatcher::lock()` before starting and `unlock()` after completion (to prevent watcher flicker during git operations)
  - Write unit tests for each operation using a temporary git repository (create tempdir, init git, create files, test operations)

  **Must NOT do**:
  - Do not implement WebSocket message sending (GitOps returns data, router sends messages)
  - Do not implement PR dialog UI (that's T23)
  - Do not implement merge confirmation dialog (that's T28)
  - Do not handle git credentials (assumes system git config)
  - Do not implement rebase or bisect

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with T11-T13, T15-T17)
  - **Blocks**: T26, T28, T29
  - **Blocked By**: T7

  **References**:
  - `https://docs.rs/git2/latest/git2/struct.Repository.html` — git2 Repository API
  - `https://docs.rs/git2/latest/git2/struct.Statuses.html` — Statuses for git status
  - `https://docs.rs/git2/latest/git2/struct.Diff.html` — Diff for git diff
  - `https://docs.rs/git2/latest/git2/struct.Index.html` — Index for staging
  - `https://cli.github.com/manual/gh_pr_create` — gh pr create documentation
  - Task T5 output — GitStatus, GitDiff, GitCommit, CreatePR message types
  - Task T13 output — FileWatcher::lock/unlock integration point

  **Acceptance Criteria**:
  - [ ] `status()` returns accurate file change list (Added, Modified, Deleted, Untracked)
  - [ ] `diff()` returns line-by-line diff for specified file
  - [ ] `commit()` stages files and creates commit with correct message
  - [ ] `merge()` performs regular merge, returns success
  - [ ] `merge(squash=true)` performs squash merge into single commit
  - [ ] `log()` returns recent commits with sha, author, message, timestamp
  - [ ] `current_branch()` returns correct branch name
  - [ ] `create_pr()` shells out to `gh` and returns PR URL on success
  - [ ] `create_pr()` returns descriptive error when `gh` is not installed
  - [ ] File watcher locked during all git operations
  - [ ] Unit tests pass for all operations

  **QA Scenarios (MANDATORY)**:
  ```
  Scenario: Git status returns correct file list
    Tool: Bash (cargo test)
    Steps:
      1. Run: cargo test -p ws-server test_git_status
      2. Assert exit code 0
      3. Assert output contains "detect_added_file ... ok"
      4. Assert output contains "detect_modified_file ... ok"
      5. Assert output contains "detect_deleted_file ... ok"
      6. Assert output contains "detect_untracked_file ... ok"
    Expected Result: All status types detected
    Evidence: .sisyphus/evidence/task-14-git-status.txt

  Scenario: Git commit works
    Tool: Bash (cargo test)
    Steps:
      1. Run: cargo test -p ws-server test_git_commit
      2. Assert exit code 0
      3. Assert output contains "staged and committed"
      4. Assert output contains "commit message correct"
    Expected Result: Commit created successfully
    Evidence: .sisyphus/evidence/task-14-git-commit.txt

  Scenario: PR creation handles missing gh
    Tool: Bash (cargo test)
    Steps:
      1. Run: cargo test -p ws-server test_create_pr_no_gh
      2. Assert exit code 0
      3. Assert output contains "gh not installed"
    Expected Result: Graceful error message
    Evidence: .sisyphus/evidence/task-14-pr-no-gh.txt
  ```

  **Commit**: YES (groups with T11-T13)
  - Message: `feat(ws): git operations module with status, diff, commit, merge, and PR creation`

---

- [ ] 15. Sidebar Panel with Tree Component

  **What to do**:
  - Install `react-window` and `@tanstack/react-virtual` in apps/web/ (for virtual scrolling in the custom tree)
  - Create `apps/web/src/components/sidebar/WorkspaceTree.tsx` — the main tree component:
    - Uses `VariableSizeList` from `react-window` for virtual scrolling
    - Each row renders either a WorkspaceNode or WorktreeNode based on flattened tree structure
    - Flattened data structure: `[WorkspaceNode, WorktreeNode, WorktreeNode, WorkspaceNode, ...]` computed from workspaces + worktrees
    - Node types:
      - **WorkspaceNode**: Remix Icon (ri-folder-line or custom workspace icon), workspace name, status summary ("3 worktrees, 1 active"), expand/collapse arrow (▶/▼), right-aligned "New Worktree" button (ri-add-line icon)
      - **WorktreeNode**: Status dot (animated), worktree/branch name, selected highlight background
    - Status dot component (`apps/web/src/components/sidebar/StatusDot.tsx`):
      - CSS animation: `@keyframes pulse` for yellow (waiting): opacity 0.4→1.0 every 1.5s
      - CSS animation: `@keyframes flash` for green (working): opacity 0.3→1.0 every 0.8s
      - Static gray for idle
      - Hover tooltip showing status text: "Agent working...", "Waiting for input", "Idle"
    - Click worktree → dispatch setActiveWorktree(store action) → main + project panels update
    - Click workspace header → toggle expand/collapse → store persisted in Zustand
    - State persistence: expanded workspace IDs stored in Zustand, restored on mount
  - Create `apps/web/src/components/sidebar/SidebarPanel.tsx` — wrapper:
    - "Workspaces" header
    - WorkspaceTree component
    - Empty state: "No workspaces" with "Create Workspace" CTA button
    - "Create Workspace" button at bottom (opens workspace creation dialog — placeholder for now)
  - Wire up: subscribe to Zustand store for workspaces and worktrees arrays
  - Write unit tests for: tree flattening logic, node rendering, expand/collapse, active selection

  **Must NOT do**:
  - Do not implement context menus (that's T16)
  - Do not implement workspace creation dialog (that's T30)
  - Do not implement worktree creation dialog (that's T29)
  - Do not add drag-and-drop

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
  - **Skills**: [`frontend-ui-ux`]

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with T11-T14, T16, T17)
  - **Blocks**: T29, T30
  - **Blocked By**: T8, T9, T11, T16

  **References**:
  - `https://react-window.vercel.app/#/api/VariableSizeList` — react-window API for virtual scrolling
  - `https://remixicon.com/` — Remix Icon library (ri-folder-line, ri-add-line, etc.)
  - Task T9 output — AppShell layout where SidebarPanel is used
  - Task T8 output — Zustand store for workspaces/worktrees data
  - Task T3 output — Base UI + Tailwind setup (styling patterns)

  **Acceptance Criteria**:
  - [ ] Workspace nodes render with icon, name, and status summary
  - [ ] Worktree nodes render with status dot and branch name
  - [ ] Clicking worktree node dispatches setActiveWorktree action
  - [ ] Expanding/collapsing workspace persists across page refresh
  - [ ] "New Worktree" button appears right-aligned on expanded workspace headers
  - [ ] Empty state shows "Create Workspace" CTA when no workspaces exist
  - [ ] Virtual scrolling handles 10,000+ items without performance degradation
  - [ ] Active worktree has highlighted background
  - [ ] Unit tests pass for tree logic and rendering

  **QA Scenarios (MANDATORY)**:
  ```
  Scenario: Tree renders workspaces and worktrees
    Tool: Playwright
    Preconditions: dev server running, test workspace with 3 worktrees in Zustand store
    Steps:
      1. Navigate to http://localhost:5173
      2. Assert workspace header renders with name and status summary "3 worktrees"
      3. Assert 3 worktree nodes render below workspace
      4. Assert each worktree has a status dot element
    Expected Result: Tree renders correctly with all data
    Evidence: .sisyphus/evidence/task-15-tree-render.png

  Scenario: Click worktree changes active selection
    Tool: Playwright
    Steps:
      1. Click on "worktree-b" node
      2. Assert "worktree-b" has highlighted background class
      3. Assert Zustand store state: activeWorktreeId === "worktree-b-id"
    Expected Result: Click selects worktree and updates store
    Evidence: .sisyphus/evidence/task-15-selection.png

  Scenario: Expand/collapse persists
    Tool: Playwright
    Steps:
      1. Click workspace header to collapse
      2. Assert worktree nodes are hidden
      3. Reload page
      4. Assert workspace is still collapsed (worktree nodes hidden)
    Expected Result: Expansion state persisted
    Evidence: .sisyphus/evidence/task-15-persist.png

  Scenario: Status dot animation works
    Tool: Playwright
    Preconditions: One worktree with status "working"
    Steps:
      1. Get computed style of status dot for "working" worktree
      2. Assert animation property contains "flash" keyframe
    Expected Result: Animated status dots
    Evidence: .sisyphus/evidence/task-15-animation.png
  ```

  **Commit**: YES (groups with T11, T16)
  - Message: `feat(web): sidebar panel with virtual-scrolling workspace/worktree tree`

---

- [ ] 16. Context Menu System

  **What to do**:
  - Create `apps/web/src/components/ui/ContextMenu.tsx` — reusable context menu component wrapping Base UI's `ContextMenu`:
    - Props:
      - `items: ContextMenuItem[]` — array of menu items
      - Each item: `{ label: string, icon?: RemixIconName, onClick: () => void, disabled?: boolean, danger?: boolean, separator?: boolean }`
      - `position: { x: number, y: number }` — click position (for positioning)
    - Renders using Base UI ContextMenu:
      - `ContextMenu.Root` wraps the trigger area
      - `ContextMenu.Trigger` — the element that receives right-click
      - `ContextMenu.Portal` with `ContextMenu.Positioner`
      - `ContextMenu.Popup` styled with theme CSS variables
      - Items rendered as `ContextMenu.Item` with icon (Remix Icon) + label
      - `ContextMenu.Separator` for separator items
      - Danger items styled with `--destructive` color
      - Disabled items with reduced opacity, no click handler
    - Custom positioning: `alignOffset` and `sideOffset` to appear at cursor position
    - Click outside closes menu, Escape key closes menu
  - Register context menus for specific components:
    - **Workspace node**: Right-click → "New Worktree" | "Settings" | separator | "Rename" | "Delete"
    - **Worktree node**: Right-click → "Open in File Manager" | "Copy Path" | separator | "Rename" | "Delete"
    - **Change file** (in project panel): Right-click → "Edit" | "View Diff" | separator | "Open External" | "Copy Path"
    - **All Files node**: Right-click → "Edit" | "Open External" | "Copy Path"
    - **Tab** (in main panel): Right-click → "Close" | "Close Others" | "Close All"
  - Create `apps/web/src/hooks/useContextMenu.ts` hook:
    - Returns: `{ show, hide, visible, position }`
    - Attaches `onContextMenu` event listener to target element
    - Prevents default browser context menu
    - Calculates menu position from mouse event
  - Write unit tests for: rendering, item click, disabled state, separator rendering, close on Escape

  **Must NOT do**:
  - Do not implement the actual rename/delete/settings functionality (those are separate tasks)
  - Do not add nested submenus
  - Do not add icons for all menu items (just workspace and worktree menus)
  - Do not add keyboard navigation (keyboard shortcuts excluded from scope)

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with T11-T15, T17)
  - **Blocks**: T15, T26, T27, T31
  - **Blocked By**: T9

  **References**:
  - `https://base-ui.com/react/components/context-menu` — Base UI ContextMenu component docs
  - `https://remixicon.com/` — Remix Icon names for menu icons
  - Task T9 output — AppShell layout (where context menus will be used)
  - Task T15 output — Sidebar panel (workspace/worktree nodes need context menus)

  **Acceptance Criteria**:
  - [ ] Right-click on workspace node shows 5-item menu (New Worktree, Settings, separator, Rename, Delete)
  - [ ] Right-click on worktree node shows 5-item menu (Open in File Manager, Copy Path, separator, Rename, Delete)
  - [ ] Menu appears at cursor position
  - [ ] Clicking menu item fires onClick callback
  - [ ] Disabled items do not fire onClick
  - [ ] Danger items (Delete) styled in red
  - [ ] Escape key closes menu
  - [ ] Click outside menu closes it
  - [ ] Unit tests pass

  **QA Scenarios (MANDATORY)**:
  ```
  Scenario: Context menu renders on right-click
    Tool: Playwright
    Preconditions: sidebar panel with workspace node
    Steps:
      1. Right-click on workspace node
      2. Assert menu popup appears with 5 items
      3. Assert "New Worktree" item visible
      4. Assert "Settings" item visible
      5. Assert "Delete" item has red/destructive styling
    Expected Result: Context menu appears with correct items
    Evidence: .sisyphus/evidence/task-16-context-menu.png

  Scenario: Menu closes on Escape
    Tool: Playwright
    Steps:
      1. Right-click on workspace node
      2. Assert menu is visible
      3. Press Escape key
      4. Assert menu is not visible
    Expected Result: Menu closes on Escape
    Evidence: .sisyphus/evidence/task-16-escape.png

  Scenario: Menu item click fires callback
    Tool: Bash (vitest)
    Steps:
      1. Run: cd apps/web && npx vitest run context-menu
      2. Assert output contains "item click fires callback ... ok"
      3. Assert output contains "disabled item ignores click ... ok"
    Expected Result: Callbacks work correctly
    Evidence: .sisyphus/evidence/task-16-callback.txt
  ```

  **Commit**: YES (groups with T11-T15)
  - Message: `feat(web): reusable context menu system with Base UI`

---

- [ ] 17. Toast Notification System

  **What to do**:
  - Create `apps/web/src/components/ui/Toast.tsx` — toast notification component:
    - Uses Base UI's `Toast` component
    - Props: `{ variant: 'error' | 'success' | 'info', title: string, description?: string, duration?: number }`
    - Default duration: 5000ms (5 seconds) for error, 3000ms for success/info
    - Auto-dismiss after duration
    - Manual dismiss: close button (× icon)
    - Position: top-right corner of viewport
    - Styling: `--destructive` background for errors, `--primary` for success, `--muted` for info
    - Icon: Remix Icon (ri-error-warning-line for error, ri-check-line for success, ri-information-line for info)
    - Entrance animation: slide in from right
    - Exit animation: fade out
  - Create `apps/web/src/components/ui/ToastContainer.tsx` — container for multiple toasts:
    - Renders list of pending toasts from Zustand store
    - Maximum 5 toasts visible at once
    - Older toasts stack below newer ones
    - Uses `Toast.Provider` from Base UI
  - Add to Zustand store:
    - `notifications: Notification[]` — queue of pending toasts
    - `addNotification(notification)` — add new toast to queue
    - `removeNotification(id)` — remove toast from queue
  - Create `apps/web/src/hooks/useToast.ts` — convenience hook:
    - `toast.error(title, description?)` — add error notification
    - `toast.success(title, description?)` — add success notification
    - `toast.info(title, description?)` — add info notification
  - NOTE: Per requirements, only errors should be shown. But the system supports all three variants. Only `toast.error()` will be called in the initial implementation.
  - Write unit tests for: rendering, auto-dismiss, manual dismiss, variant styling

  **Must NOT do**:
  - Do not add notification sounds
  - Do not add notification persistence in database
  - Do not add notification history panel
  - Do not implement success/info toasts in any feature yet (only errors per requirements)

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with T11-T16)
  - **Blocks**: T33
  - **Blocked By**: T9

  **References**:
  - `https://base-ui.com/react/components/toast` — Base UI Toast component docs
  - `https://remixicon.com/` — Remix Icon names (ri-error-warning-line, ri-check-line, ri-information-line)
  - Task T8 output — Zustand store integration
  - Task T10 output — CSS theme variables for styling

  **Acceptance Criteria**:
  - [ ] Error toast appears with red/destructive background and error icon
  - [ ] Toast auto-dismisses after 5 seconds (error)
  - [ ] Close button dismisses toast immediately
  - [ ] Multiple toasts stack in top-right corner
  - [ ] Maximum 5 toasts visible at once
  - [ ] `useToast()` hook works from any component
  - [ ] Unit tests pass

  **QA Scenarios (MANDATORY)**:
  ```
  Scenario: Error toast appears and auto-dismisses
    Tool: Playwright
    Preconditions: dev server running
    Steps:
      1. Trigger an error (simulate via Zustand store)
      2. Assert toast appears with "error" variant
      3. Assert error icon visible
      4. Assert title matches expected text
      5. Wait 5 seconds
      6. Assert toast is no longer visible
    Expected Result: Toast appears and auto-dismisses
    Evidence: .sisyphus/evidence/task-17-toast.png

  Scenario: Manual dismiss works
    Tool: Playwright
    Steps:
      1. Trigger error toast
      2. Click close button (×)
      3. Assert toast immediately disappears
    Expected Result: Close button works
    Evidence: .sisyphus/evidence/task-17-dismiss.png

  Scenario: Multiple toasts stack
    Tool: Bash (vitest)
    Steps:
      1. Run: cd apps/web && npx vitest run toast
      2. Assert output contains "multiple toasts render ... ok"
      3. Assert output contains "max 5 toasts ... ok"
    Expected Result: Toast stacking works
    Evidence: .sisyphus/evidence/task-17-stack.txt
  ```

  **Commit**: YES (groups with T11-T16)
     - Message: `feat(web): toast notification system with Base UI`

---

## Wave 3: Main Panel

- [ ] 18. ghostty-web Terminal Component

  **What to do**:
  - Install `ghostty-web` in apps/web/ (per verified spike from T1)
  - Create `apps/web/src/components/terminal/Terminal.tsx` — core terminal wrapper:
    - On mount:
      - Call `await init()` from ghostty-web to load WASM module
      - Create `new Terminal({ fontSize: 13, theme: { background: getComputedStyle(root).getPropertyValue('--terminal-bg'), foreground: getComputedStyle(root).getPropertyValue('--terminal-fg') }, fontFamily: 'var(--font-mono)' })`
      - Call `term.open(containerRef.current)` to render into DOM
      - Set up `term.onData((data) => ...)` to send data via WebSocket: `client.send({ type: 'TerminalInput', sessionId, data })`
    - On unmount: call `term.dispose()` to clean up
    - Expose `write(data: string)` method via ref — used by parent to write WebSocket TerminalOutput data
    - Expose `resize(cols, rows)` method via ref — used when panel resizes
    - Resize observer: use `ResizeObserver` on container div to calculate terminal dimensions and send `TerminalResize` message
    - Pass `terminalSessionId` as prop (links terminal to backend PTY session)
    - Styled with `--terminal-bg` and `--terminal-fg` theme variables
    - No header visible (the terminal just fills the container)
    - Font: monospace stack from `--font-mono` CSS variable
  - Create `apps/web/src/components/terminal/TerminalProvider.tsx` — context provider:
    - Manages ghostty-web initialization (singleton — only init once)
    - Tracks active terminal sessions
    - Provides `writeToTerminal(sessionId, data)` function for routing TerminalOutput messages from WebSocket to correct terminal instance
  - Wire up WebSocket message routing:
    - Subscribe to `TerminalOutput` messages in Zustand store
    - Route data to correct terminal instance based on sessionId
  - Write unit tests for: init, data round-trip, resize, dispose

  **Must NOT do**:
  - Do not implement the tab bar (that's T19)
  - Do not implement PTY creation (that's T12 on backend)
  - Do not add terminal theming customization
  - Do not add scrollback buffer management (not needed)

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with T19-T23)
  - **Blocks**: T19, T34
  - **Blocked By**: T1, T8, T9, T12

  **References**:
  - `https://github.com/coder/ghostty-web` — ghostty-web README and API reference
  - Task T1 output — ghostty-web spike results (Vite config notes, WASM setup)
  - Task T8 output — WebSocket client for sending TerminalInput/TerminalResize
  - Task T10 output — CSS theme variables for terminal colors
  - Task T12 output — PTY session ID that links to terminal instance

  **Acceptance Criteria**:
  - [ ] Terminal renders with dark background and light text
  - [ ] `init()` called once on first terminal mount
  - [ ] Typing in terminal sends TerminalInput message via WebSocket
  - [ ] Writing data from WebSocket renders in terminal
  - [ ] Terminal resizes correctly when panel is resized
  - [ ] `dispose()` cleans up terminal instance on unmount
  - [ ] Font uses monospace stack
  - [ ] Unit tests pass

  **QA Scenarios (MANDATORY)**:
  ```
  Scenario: Terminal renders and accepts input
    Tool: Playwright
    Preconditions: dev server running, PTY session active on backend
    Steps:
      1. Navigate to http://localhost:5173
      2. Wait for terminal element to render
      3. Type "ls" into terminal
      4. Wait for output
      5. Assert terminal contains directory listing
    Expected Result: Terminal renders and works
    Evidence: .sisyphus/evidence/task-18-terminal.png

  Scenario: Terminal resizes on panel resize
    Tool: Playwright
    Steps:
      1. Measure terminal dimensions (cols x rows)
      2. Resize parent panel smaller
      3. Assert terminal dimensions updated
    Expected Result: Terminal adapts to panel size
    Evidence: .sisyphus/evidence/task-18-resize.png
  ```

  **Commit**: YES (groups with T19)
  - Message: `feat(web): ghostty-web terminal component with WebSocket I/O`

---

- [ ] 19. Terminal Tab Management

  **What to do**:
  - Create `apps/web/src/components/terminal/TerminalPane.tsx` — the complete terminal pane component:
    - Tab bar using Base UI `Tabs` component:
      - Tab list at top of pane
      - Each tab: Remix Icon (ri-terminal-box-line), label ("Terminal 1", "Terminal 2", etc.), ghost close button (no background/border, just × icon, subtle opacity)
      - Close button hover: full opacity, pointer cursor
      - Middle-click on tab: close tab
      - "+" button at end of tab list: create new terminal session
      - Active tab highlighted with accent color
    - Tab content area: renders `Terminal` component for active tab only (other tabs' terminals remain alive but not rendered — ghostty keeps them alive via WebSocket PTY)
    - Create terminal session flow:
      - User clicks "+"
      - Generate label: "Terminal N" where N is next available number
      - Send `TerminalCreate` message via WebSocket
      - Receive `TerminalCreated` with session ID
      - Add new tab to tab list
      - Activate new tab
    - Close terminal session flow:
      - User clicks "×" or middle-clicks tab
      - Send `TerminalKill` message via WebSocket
      - Remove tab from tab list
      - If closing active tab, switch to nearest remaining tab
      - If last tab, show empty state: "No terminals. Click + to create one."
    - Tab state management:
      - Use Zustand store: `terminalTabs: { sessionId: string, label: string, worktreeId: string }[]`
      - Persist tab labels and order per worktree in store (reset on worktree switch)
    - Wire up: subscribe to `TerminalOutput` messages → route to correct terminal instance via sessionId
  - Write unit tests for: tab creation, tab closing, active tab switching, middle-click close, label generation

  **Must NOT do**:
  - Do not implement terminal theming
  - Do not add keyboard shortcuts for tab management
  - Do not persist tabs across worktree switches (new session each worktree)
  - Do not implement drag-and-drop tab reordering

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with T18, T20-T23)
  - **Blocks**: —
  - **Blocked By**: T8, T18

  **References**:
  - `https://base-ui.com/react/components/tabs` — Base UI Tabs component API
  - `https://remixicon.com/` — ri-terminal-box-line icon
  - Task T18 output — Terminal component to render inside each tab
  - Task T8 output — WebSocket client for TerminalCreate/TerminalKill messages
  - Task T12 output — PTY session creation on backend

  **Acceptance Criteria**:
  - [ ] Tab bar renders with Terminal 1 tab by default
  - [ ] "+" button creates new tab with incremented label (Terminal 2, Terminal 3...)
  - [ ] Each tab renders its own Terminal instance
  - [ ] Switching tabs shows correct terminal content
  - [ ] "×" close button removes tab and switches to nearest remaining
  - [ ] Middle-click closes tab
  - [ ] Last tab closing shows empty state message
  - [ ] Tabs persist while switching between panels (but not between worktrees)
  - [ ] Unit tests pass

  **QA Scenarios (MANDATORY)**:
  ```
  Scenario: Terminal tabs work correctly
    Tool: Playwright
    Preconditions: dev server running
    Steps:
      1. Assert 1 terminal tab ("Terminal 1") renders
      2. Click "+" button
      3. Assert 2 tabs now visible ("Terminal 1", "Terminal 2")
      4. Click "Terminal 1" tab
      5. Assert "Terminal 1" content visible
      6. Close "Terminal 2" with × button
      7. Assert only "Terminal 1" tab remains
    Expected Result: Tab management works
    Evidence: .sisyphus/evidence/task-19-tabs.png

  Scenario: Middle-click closes tab
    Tool: Playwright
    Steps:
      1. Create 2 tabs
      2. Middle-click on "Terminal 2" tab
      3. Assert "Terminal 2" tab removed
      4. Assert "Terminal 1" still active
    Expected Result: Middle-click close works
    Evidence: .sisyphus/evidence/task-19-middle-click.png
  ```

  **Commit**: YES (groups with T18)
  - Message: `feat(web): terminal tab management with multi-session support`

---

- [ ] 20. ACP Client (Rust)

  **What to do**:
  - Create `crates/ws-server/src/agent/acp.rs` — the ACP protocol client:
    - `AcpClient` struct:
      - `process: Child` — the agent subprocess handle
      - `stdin: ChildStdin` — for sending JSON-RPC messages
      - `stdout_reader: JoinHandle` — Tokio task reading stdout line-by-line
      - `pending_requests: Arc<Mutex<HashMap<RequestId, oneshot::Sender>>>` — request/response correlation
      - `session_id: Option<String>` — ACP session ID after session/new
      - `status: Arc<RwLock<AgentStatus>>` — current agent status
    - `AcpClient::spawn(agent_type, worktree_path)`:
      - Agent type → executable mapping:
        - `"claude"` → `claude-agent` (via Zed's ACP adapter)
        - `"opencode"` → `opencode` (native ACP support)
        - `"pi"` → `pi-acp` (via pi-acp adapter)
      - Spawn subprocess with `tokio::process::Command`:
        - stdin/stdout as pipes
        - stderr captured for logging
        - `current_dir` set to worktree_path
      - Send `initialize` JSON-RPC request: protocolVersion=1, clientCapabilities (fs: true, terminal: true), clientInfo (name: "ymir", version)
      - Read `initialize` response, verify protocol version
      - Send `session/new` with cwd=worktree_path
      - Read `session/new` response, store session_id
      - Return connected AcpClient
    - `AcpClient::send_prompt(content)`:
      - Send `session/prompt` with content blocks
      - Response streamed via session/update notifications
    - `AcpClient::cancel()`:
      - Send `session/cancel` notification
    - Background stdout reader task (continuous):
      - Read lines from stdout
      - Parse as JSON-RPC messages
      - Route based on method:
        - `session/update` with `sessionUpdate`:
          - `"plan"` entries with status=pending/in_progress → set status to Working
          - `"tool_call"` with status=pending/in_progress → set status to Working
          - `"tool_call_update"` with status=in_progress → set status to Working
          - `"session/request_permission"` → set status to Waiting (user input needed)
          - `"agent_message_chunk"` → stream content to frontend
          - `"tool_call_update"` with status=completed → continue monitoring
        - `session/prompt` response with `stopReason`:
          - `"end_turn"` → set status to Idle
          - `"cancelled"` → set status to Idle
          - `"max_tokens"` → set status to Idle (with warning)
    - `AcpClient::status()` → return current AgentStatus enum
    - `AcpClient::kill()` — kill subprocess, clean up resources
    - `AgentStatus` enum: `Working { task_summary: String }`, `Waiting { prompt: String }`, `Idle`
  - Write unit tests for: initialize flow, status detection from session/update, kill

  **Must NOT do**:
  - Do not implement the UI rendering for agent output (that's T21)
  - Do not implement MCP server forwarding (future feature)
  - Do not implement multi-agent orchestration
  - Do not store conversation history in Turso

  **Recommended Agent Profile**:
  - **Category**: `deep`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with T18, T19, T21, T22, T23)
  - **Blocks**: T21, T22, T29
  - **Blocked By**: T7, T12

  **References**:
  - `https://agentclientprotocol.com/protocol/initialization` — ACP initialization flow
  - `https://agentclientprotocol.com/protocol/session-setup` — session/new, session/load
  - `https://agentclientprotocol.com/protocol/prompt-turn` — session/prompt, session/update, stopReason
  - `https://agentclientprotocol.com/protocol/transports` — stdio transport details
  - `https://agentclientprotocol.com/protocol/session-list` — session/list discovery
  - `https://agentclientprotocol.com/get-started/agents` — List of ACP-compatible agents
  - `https://agentclientprotocol.com/api-reference/openapi.json` — OpenAPI spec
  - Task T7 output — AppState where ACP clients will be registered
  - Task T12 output — PTY session working directory pattern

  **Acceptance Criteria**:
  - [ ] `initialize` handshake completes successfully
  - [ ] `session/new` creates session with correct cwd
  - [ ] `session/prompt` sends user message to agent
  - [ ] `session/update` notifications parsed correctly for status detection
  - [ ] Agent status transitions: Idle → Working → Waiting → Working → Idle
  - [ ] `session/cancel` sends correctly
  - [ ] `kill()` terminates subprocess cleanly
  - [ ] Unit tests pass

  **QA Scenarios (MANDATORY)**:
  ```
  Scenario: ACP handshake works
    Tool: Bash (cargo test)
    Steps:
      1. Run: cargo test -p ws-server test_acp_handshake
      2. Assert exit code 0
      3. Assert output contains "initialize ... ok"
      4. Assert output contains "session/new ... ok"
    Expected Result: Handshake completes
    Evidence: .sisyphus/evidence/task-20-acp-handshake.txt

  Scenario: Status detection from session/update
    Tool: Bash (cargo test)
    Steps:
      1. Run: cargo test -p ws-server test_acp_status
      2. Assert exit code 0
      3. Assert output contains "plan_pending → Working ... ok"
      4. Assert output contains "tool_call_in_progress → Working ... ok"
      5. Assert output contains "request_permission → Waiting ... ok"
      6. Assert output contains "stopReason_end_turn → Idle ... ok"
    Expected Result: All status transitions detected
    Evidence: .sisyphus/evidence/task-20-acp-status.txt
  ```

  **Commit**: YES (groups with T18, T19)
  - Message: `feat(ws): ACP client for agent lifecycle and status detection`

---

- [ ] 21. Agent Pane with Tabs

  **What to do**:
  - Create `apps/web/src/components/agent/AgentPane.tsx` — the agent pane component:
    - Tab bar using Base UI `Tabs`:
      - Each tab: icon + label + ghost close button
      - Tab type icons:
        - Agent tab: `ri-robot-line`
        - Diff tab: `ri-git-diff-line`
        - Editor tab: `ri-code-line`
      - Close button: ghost icon button (no border/background), "×" icon, middle-click also closes
      - Active tab highlighted with accent
    - Tab content area (renders content based on tab type):
      - **Agent tab**: AgentChat component (see below)
      - **Diff tab**: DiffViewer component (placeholder — will be T25)
      - **Editor tab**: MonacoEditor component (placeholder — will be T24)
    - Create `apps/web/src/components/agent/AgentChat.tsx` — the agent conversation UI:
      - No branding header (clean, no "opencode" text)
      - Message history area: scrollable, shows agent output chunks
      - Input box at bottom:
        - Placeholder: "Ask {agent-name}..." (dynamically shows agent type: "Ask claude...", "Ask opencode...")
        - Agent name labels below: "Claude (Plan Builder)", "GLM-5 (Coding)", etc.
        - Left border accent: uses `--primary` color
        - Helper text right-aligned: "tab: switch agents" (gray, small)
      - On submit: send `AgentSend` message via WebSocket
      - Tip area at bottom: "Tip: Use instructions in config to load additional rules files"
      - Status indicator: shows current agent status (working/waiting/idle) matching sidebar status dots
    - Tab state: stored in Zustand per worktree as `agentTabs: { id, type: 'agent'|'diff'|'editor', sessionId?, filePath? }[]`
    - Click file in project panel → opens diff/editor tab in this pane
  - Wire up: subscribe to `AgentOutput`, `AgentStatusUpdate`, `AgentPrompt` messages from WebSocket
  - Write unit tests for: tab creation, tab switching, tab closing, agent message rendering

  **Must NOT do**:
  - Do not implement Monaco editor rendering (placeholder only — that's T24)
  - Do not implement diff viewer rendering (placeholder only — that's T25)
  - Do not implement agent spawning dialog (that's T29)
  - Do not add real-time typing indicators

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with T18-T20, T22, T23)
  - **Blocks**: T23, T29
  - **Blocked By**: T8, T9, T20, T22

  **References**:
  - `https://base-ui.com/react/components/tabs` — Base UI Tabs API
  - `https://remixicon.com/` — ri-robot-line, ri-git-diff-line, ri-code-line icons
  - Task T9 output — AppShell main panel layout where AgentPane renders
  - Task T8 output — WebSocket client for AgentSend/AgentOutput messages
  - Task T20 output — ACP client backend for agent session data
  - Task T22 output — Agent status tracking hook

  **Acceptance Criteria**:
  - [ ] Agent tab renders with robot icon and clean input box (no branding)
  - [ ] Agent name placeholder is dynamic based on agent type
  - [ ] Sending message dispatches AgentSend via WebSocket
  - [ ] Agent output renders as messages in the chat area
  - [ ] Multiple tabs can be opened (agent + diff + editor)
  - [ ] Ghost close button removes tab
  - [ ] Middle-click removes tab
  - [ ] Unit tests pass

  **QA Scenarios (MANDATORY)**:
  ```
  Scenario: Agent pane renders correctly
    Tool: Playwright
    Preconditions: dev server running, agent spawned for active worktree
    Steps:
      1. Navigate to http://localhost:5173
      2. Assert agent pane renders with input box
      3. Assert placeholder text contains "Ask" and agent name
      4. Assert no branding text visible
      5. Type "Hello" in input and press Enter
      6. Assert AgentSend message dispatched (check console/network)
    Expected Result: Agent pane renders and sends messages
    Evidence: .sisyphus/evidence/task-21-agent-pane.png

  Scenario: Tab types render with correct icons
    Tool: Playwright
    Steps:
      1. Open 3 tabs: agent, diff, editor
      2. Assert agent tab has robot icon
      3. Assert diff tab has diff icon
      4. Assert editor tab has code icon
    Expected Result: Correct icons per tab type
    Evidence: .sisyphus/evidence/task-21-tab-icons.png
  ```

  **Commit**: YES (groups with T18-T20)
  - Message: `feat(web): agent pane with multi-type tabs and chat interface`

---

- [ ] 22. Agent Status Tracking (React)

  **What to do**:
  - Create `apps/web/src/hooks/useAgentStatus.ts` — React hook for agent status:
    - Subscribe to `AgentStatusUpdate` and `AgentOutput` messages from WebSocket via Zustand
    - Derive per-worktree status:
      - `status: 'working' | 'waiting' | 'idle'`
      - `task_summary: string` — current task description (from ACP plan entries)
      - `last_activity: Date` — timestamp of last status change
      - `agent_type: string` — which agent is running
    - Map ACP notification types to status:
      - `plan` with `status=pending/in_progress` → `working`
      - `tool_call` with `status=pending/in_progress` → `working`
      - `session/request_permission` → `waiting`
      - `session/prompt` response with `stopReason` → `idle`
      - `error` → `idle` (with error state)
    - Return: `{ status, taskSummary, lastActivity, agentType } | null` (null if no agent for worktree)
  - Create `apps/web/src/hooks/useAgentList.ts` — React hook for all agent sessions:
    - Subscribe to `agentSessions` from Zustand store
    - Return: `AgentSession[]` for current worktree
  - Integrate with Sidebar status dots:
    - StatusDot component uses `useAgentStatus(worktreeId)` to determine dot color and animation
    - Status changes trigger re-render of sidebar dots in real-time
  - Integrate with AgentPane status indicator:
    - AgentChat component uses `useAgentStatus(activeWorktreeId)` to show status text
  - Write unit tests for: status mapping, worktree status derivation, null case

  **Must NOT do**:
  - Do not implement agent spawning (that's T20 backend + T29 frontend)
  - Do not implement status persistence in database (real-time only)
  - Do not add status change notifications/toasts
  - Do not implement agent output history storage

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with T18-T21, T23)
  - **Blocks**: T21
  - **Blocked By**: T8, T20

  **References**:
  - `https://agentclientprotocol.com/protocol/prompt-turn` — session/update types that map to status
  - Task T8 output — Zustand store for agent session state
  - Task T20 output — ACP client status detection logic (frontend mirrors this)
  - Task T15 output — Sidebar StatusDot component that consumes this hook

  **Acceptance Criteria**:
  - [ ] `useAgentStatus` returns correct status based on ACP notifications
  - [ ] Status transitions: idle → working → waiting → working → idle
  - [ ] `taskSummary` extracted from ACP plan entries
  - [ ] `null` returned when no agent exists for worktree
  - [ ] Sidebar status dots update in real-time
  - [ ] AgentPane status indicator reflects current status
  - [ ] Unit tests pass for all status mappings

  **QA Scenarios (MANDATORY)**:
  ```
  Scenario: Status detection works
    Tool: Bash (vitest)
    Steps:
      1. Run: cd apps/web && npx vitest run agent-status
      2. Assert exit code 0
      3. Assert output contains "plan pending → working ... ok"
      4. Assert output contains "request_permission → waiting ... ok"
      5. Assert output contains "end_turn → idle ... ok"
      6. Assert output contains "no agent → null ... ok"
    Expected Result: All status transitions work
    Evidence: .sisyphus/evidence/task-22-status.txt

  Scenario: Sidebar dots update in real-time
    Tool: Playwright
    Preconditions: agent running for worktree-a
    Steps:
      1. Assert worktree-a status dot has green flashing animation
      2. Simulate agent waiting for input (send request_permission notification)
      3. Assert status dot changes to yellow pulsing animation
    Expected Result: Real-time dot updates
    Evidence: .sisyphus/evidence/task-22-dots.png
  ```

  **Commit**: YES (groups with T18-T21)
  - Message: `feat(web): agent status tracking with real-time UI updates`

---

- [ ] 23. PR Creation Dialog

  **What to do**:
  - Create `apps/web/src/components/dialogs/CreatePRDialog.tsx` — PR creation dialog using Base UI Dialog:
    - `Dialog.Root` wrapping the entire component
    - `Dialog.Trigger` — "PR" button in project panel toolbar (blue styled button, `ri-git-pull-request-line` icon)
    - `Dialog.Portal` with `Dialog.Popup`:
      - `Dialog.Title`: "Create Pull Request"
      - `Dialog.Description`: "Create a PR for the current worktree changes"
      - Form fields:
        - Title (text input, pre-filled with branch name or first commit message)
        - Body (textarea, empty or with generated description)
      - Buttons:
        - "Auto-generate" button (ri-magic-line icon) — sends request to server which runs a one-off agent prompt to generate PR title/body
        - "Create PR" (primary, green) — sends CreatePR message via WebSocket
        - "Cancel" (secondary, gray) — closes dialog
    - Auto-generate flow:
      - Click "Auto-generate"
      - Button shows loading spinner
      - Server sends one-off prompt to agent: "Generate a pull request title and description based on current git diff"
      - Response populates title and body fields
      - Button returns to normal state
    - PR creation flow:
      - Click "Create PR"
      - Server runs `gh pr create --title "..." --body "..."` via GitOps
      - On success: close dialog, show success toast with PR URL
      - On error: show error toast with error message (e.g., "gh not installed", "branch has no remote")
    - Dialog state: stored in Zustand (`prDialogOpen: boolean, prTitle: string, prBody: string`)
  - Wire up: subscribe to PR response/error messages from WebSocket
  - Write unit tests for: dialog rendering, form validation, auto-generate flow

  **Must NOT do**:
  - Do not implement merge workflow (that's T28)
  - Do not add PR template selection
  - Do not add draft PR option
  - Do not add reviewer selection

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with T18-T22)
  - **Blocks**: —
  - **Blocked By**: T8, T9, T14, T16

  **References**:
  - `https://base-ui.com/react/components/dialog` — Base UI Dialog API
  - `https://remixicon.com/` — ri-git-pull-request-line, ri-magic-line icons
  - `https://cli.github.com/manual/gh_pr_create` — gh pr create command reference
  - Task T8 output — WebSocket client for CreatePR message
  - Task T14 output — GitOps::create_pr backend implementation
  - Task T16 output — ContextMenu system (PR button will also be in project panel toolbar)

  **Acceptance Criteria**:
  - [ ] PR dialog opens when clicking "PR" button
  - [ ] Title field pre-filled with branch name
  - [ ] Body textarea empty by default
  - [ ] "Auto-generate" button shows loading state and populates fields
  - [ ] "Create PR" sends CreatePR message via WebSocket
  - [ ] Success closes dialog and shows toast with PR URL
  - [ ] Error shows toast with error message (dialog stays open)
  - [ ] "Cancel" closes dialog without action
  - [ ] Unit tests pass

  **QA Scenarios (MANDATORY)**:
  ```
  Scenario: PR dialog renders and submits
    Tool: Playwright
    Preconditions: dev server running, worktree with changes
    Steps:
      1. Click "PR" button in project panel toolbar
      2. Assert dialog appears with title "Create Pull Request"
      3. Assert title input is pre-filled
      4. Fill body: "This PR adds feature X"
      5. Click "Create PR"
      6. Assert WebSocket message sent: { type: "CreatePR", title: "...", body: "..." }
    Expected Result: Dialog opens, submits correctly
    Evidence: .sisyphus/evidence/task-23-pr-dialog.png

  Scenario: Auto-generate populates fields
    Tool: Playwright
    Steps:
      1. Open PR dialog
      2. Click "Auto-generate" button
      3. Assert button shows loading spinner
      4. Wait for agent response
      5. Assert title field populated
      6. Assert body field populated
    Expected Result: Auto-generate works
    Evidence: .sisyphus/evidence/task-23-auto-generate.png
  ```

  **Commit**: YES (groups with T18-T22)
     - Message: `feat(web): PR creation dialog with auto-generate via agent CLI`

---

## Wave 4: Project Panel

- [ ] 24. Monaco Editor Integration

  **What to do**:
  - Install `@monaco-editor/react` and `monaco-editor` in apps/web/
  - Configure Monaco workers in `apps/web/src/lib/monaco.ts`:
    - Import worker types: `editor.worker`, `ts.worker`, `json.worker`, `css.worker`, `html.worker`
    - Set `self.MonacoEnvironment = { getWorker(_, label) { ... } }` mapping labels to correct worker
    - This runs once at app startup (imported in main.tsx)
  - Create `apps/web/src/components/editor/EditorTab.tsx` — Monaco editor wrapper:
    - Props: `{ filePath: string, worktreeId: string, sessionId: string }`
    - On mount: send `FileRead` message via WebSocket with filePath and worktreeId
    - Receive `FileContent` response with file content
    - Render `<Editor>` from @monaco-editor/react:
      - `path={filePath}` (unique model identifier for state preservation)
      - `defaultValue={fileContent}`
      - `defaultLanguage={detectLanguage(filePath)}` (from file extension: .ts → typescript, .tsx → typescript, .rs → rust, etc.)
      - `theme="ymir-dark"` (custom theme matching app)
      - `saveViewState={true}` (preserve cursor, scroll position on tab switch)
      - `options={{ automaticLayout: true, minimap: { enabled: false }, fontSize: 13, fontFamily: 'var(--font-mono)' }}`
    - On content change: debounce 1s, then send `FileWrite` message with updated content
    - Max file size: 5MB — if FileContent response exceeds, show toast "File too large to edit (5MB max)" and render read-only view
  - Create custom Monaco theme in `apps/web/src/lib/monaco-theme.ts`:
    - `defineTheme('ymir-dark', { ... })` — dark theme matching shadcn preset colors:
      - `editor.background` → `--background` color
      - `editor.foreground` → `--foreground` color
      - Line numbers: `--muted-foreground`
      - Selection: `--primary` with transparency
      - Cursor: `--primary`
    - Call `loader.config({ monaco })` with custom theme definition
  - Create `apps/web/src/lib/language-detect.ts` — file extension → Monaco language mapping:
    - Map common extensions: .ts/.tsx → typescript, .js/.jsx → javascript, .rs → rust, .py → python, .md → markdown, .json → json, .css → css, .html → html, .toml → toml, .yaml → yaml, .sh → shell, etc.
    - Default: plaintext for unknown extensions
  - Write unit tests for: language detection, theme definition, file size check

  **Must NOT do**:
  - Do not implement diff editor view (that's T25)
  - Do not implement Monaco extensions or IntelliSense beyond basic syntax
  - Do not implement file save to disk via Monaco's save command
  - Do not add search/replace functionality beyond Monaco's built-in

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 4 (with T25-T28)
  - **Blocks**: T25
  - **Blocked By**: T8, T9

  **References**:
  - `https://www.npmjs.com/package/@monaco-editor/react` — @monaco-editor/react docs
  - `https://github.com/suren-atoyan/monaco-react` — React wrapper with multi-model support
  - Task T8 output — WebSocket client for FileRead/FileWrite messages
  - Task T10 output — CSS theme variables for Monaco theme definition
  - Task T9 output — AppShell layout where editor renders in main panel

  **Acceptance Criteria**:
  - [ ] Monaco editor renders with correct file content
  - [ ] Syntax highlighting works for TypeScript, Rust, Python, Markdown
  - [ ] Custom dark theme matches app theme
  - [ ] File edits auto-save via WebSocket after 1s debounce
  - [ ] Cursor and scroll position preserved when switching tabs
  - [ ] Files >5MB show error toast and render read-only
  - [ ] No minimap shown
  - [ ] Font uses monospace stack
  - [ ] Unit tests pass

  **QA Scenarios (MANDATORY)**:
  ```
  Scenario: Monaco editor opens and edits file
    Tool: Playwright
    Preconditions: dev server running, worktree active with test.ts file
    Steps:
      1. Click test.ts in project panel file browser
      2. Assert editor tab opens in main panel
      3. Assert syntax highlighting visible (keywords colored)
      4. Type "// test comment" at start of file
      5. Wait 1 second (debounce)
      6. Assert FileWrite message sent via WebSocket with updated content
    Expected Result: Editor works correctly
    Evidence: .sisyphus/evidence/task-24-editor.png

  Scenario: Theme matches app
    Tool: Playwright
    Steps:
      1. Open editor
      2. Get editor background color
      3. Assert matches --background CSS variable value
    Expected Result: Theme synchronized
    Evidence: .sisyphus/evidence/task-24-theme.png

  Scenario: Large file rejected
    Tool: Playwright
    Preconditions: worktree with 6MB test file
    Steps:
      1. Click large file in project panel
      2. Assert toast appears: "File too large to edit (5MB max)"
      3. Assert editor does not open (or shows read-only placeholder)
    Expected Result: Large files handled gracefully
    Evidence: .sisyphus/evidence/task-24-large-file.png
  ```

  **Commit**: YES (groups with T25)
  - Message: `feat(web): Monaco editor integration with WebSocket file access`

---

- [ ] 25. Diff Viewer Component

  **What to do**:
  - Install `react-diff-viewer-continued` in apps/web/ (actively maintained fork of react-diff-viewer)
  - Create `apps/web/src/components/editor/DiffTab.tsx` — diff viewer component:
    - Props: `{ filePath: string, worktreeId: string, sessionId: string }`
    - On mount: send `GitDiff` message via WebSocket for specific file
    - Receive `GitDiffResult` with original and modified content
    - Render `<ReactDiffViewer>`:
      - `oldValue={original}` — file content from git HEAD
      - `newValue={modified}` — current working tree content
      - `splitView={true}` — side-by-side diff view
      - `useDarkTheme={true}` — dark theme to match app
      - `hideLineNumbers={false}` — show line numbers
      - `showDiffOnly={false}` — show full file with changes highlighted
    - Sync scroll between original and modified panes
    - File change type indicator at top: added (green "A"), modified (yellow "M"), deleted (red "D")
    - Syntax-aware diff: detect language from file extension (reuse `detectLanguage()` from T24) and apply basic CSS-based highlighting via react-diff-viewer's `renderContent` prop
  - Wire up: when user clicks file in Changes view (project panel), open DiffTab in main panel agent pane
  - Write unit tests for: rendering, split/inline toggle, change type indicator

  **Must NOT do**:
  - Do not implement edit mode (diff is read-only)
  - Do not implement git staging from diff view
  - Do not implement merge conflict resolution
  - Do not add word-level diff (line-level only)

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 4 (with T24, T26-T28)
  - **Blocks**: —
  - **Blocked By**: T24

  **References**:
  - `https://github.com/praneshr/react-diff-viewer` — react-diff-viewer docs (API reference)
  - `https://github.com/nickreese/react-diff-viewer-continued` — maintained fork
  - Task T8 output — WebSocket client for GitDiff messages
  - Task T14 output — GitOps::diff backend implementation
  - Task T24 output — language detection utility (reuse)

  **Acceptance Criteria**:
  - [ ] Diff renders side-by-side view
  - [ ] Added lines highlighted in green
  - [ ] Removed lines highlighted in red
  - [ ] Change type indicator shows correct letter (A/M/D)
  - [ ] Line numbers visible
  - [ ] Dark theme matches app
  - [ ] Clicking change file in project panel opens diff tab
  - [ ] Unit tests pass

  **QA Scenarios (MANDATORY)**:
  ```
  Scenario: Diff viewer shows changes correctly
    Tool: Playwright
    Preconditions: dev server running, worktree with modified file
    Steps:
      1. Click modified file in Changes view
      2. Assert diff tab opens in main panel
      3. Assert side-by-side view visible
      4. Assert added lines have green background
      5. Assert removed lines have red background
      6. Assert line numbers visible on both sides
    Expected Result: Diff renders correctly
    Evidence: .sisyphus/evidence/task-25-diff.png

  Scenario: Change type indicator correct
    Tool: Playwright
    Steps:
      1. Click added file → assert "A" indicator
      2. Click modified file → assert "M" indicator
      3. Click deleted file → assert "D" indicator
    Expected Result: Change type indicators match git status
    Evidence: .sisyphus/evidence/task-25-indicators.png
  ```

  **Commit**: YES (groups with T24)
  - Message: `feat(web): diff viewer component with side-by-side comparison`

---

- [ ] 26. Git Changes Panel

  **What to do**:
  - Create `apps/web/src/components/project/ProjectPanel.tsx` — the complete project panel component:
    - Tab bar using Base UI `Tabs`:
      - Two tabs: "Changes" and "All Files" (aligned left)
      - Right side of tab bar: toolbar with "PR" button (ri-git-pull-request-line, blue) and "Merge" dropdown button (green with ▼ arrow)
    - **Changes Tab** (`apps/web/src/components/project/ChangesTab.tsx`):
      - Toggle at top: "Flat" / "Grouped by folder" (Base UI Toggle Group)
      - Flat view: list of changed files with colored dots:
        - Green dot → added file
        - Yellow dot → modified file
        - Red dot → deleted file
        - Gray dot → untracked file
      - Grouped view: collapsible folders containing changed files (using Base UI Collapsible)
      - Click file → opens DiffTab in main panel (sends GitDiff via WebSocket)
      - Subscribe to `GitStatusResult` messages from WebSocket
      - Auto-refresh: trigger GitStatus on file watcher change events
      - Empty state: checkmark icon + "No changes"
    - **All Files Tab** (`apps/web/src/components/project/AllFilesTab.tsx`):
      - Virtual-scrolling file tree (reuse approach from T15/T27)
      - Collapsible folders, top folders open by default
      - State persisted per worktree in Zustand (expanded folders, scroll position)
      - File type icons from Remix Icon (ri-file-line, ri-file-code-line, ri-markdown-line, etc.)
      - Click file → opens EditorTab in main panel (sends FileRead via WebSocket)
      - Context menu on files: "Edit" (opens editor), "Open External", "Copy Path"
  - Create `apps/web/src/components/project/Toolbar.tsx` — the project panel toolbar:
    - "PR" button → opens CreatePRDialog (T23)
    - "Merge" button → dropdown with options: "Merge" | "Squash & Merge" (handled in T28)
  - Wire up: subscribe to GitStatusResult, FileChange events from WebSocket
  - Write unit tests for: toggle flat/grouped, file selection, empty state, tab switching

  **Must NOT do**:
  - Do not implement the diff view (that's T25)
  - Do not implement the editor view (that's T24)
  - Do not implement merge workflow (that's T28)
  - Do not implement staging/unstaging files

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 4 (with T24, T25, T27, T28)
  - **Blocks**: —
  - **Blocked By**: T8, T9, T13, T14, T16

  **References**:
  - `https://base-ui.com/react/components/tabs` — Base UI Tabs API
  - `https://base-ui.com/react/components/collapsible` — Base UI Collapsible for grouped view
  - `https://base-ui.com/react/components/toggle` — Base UI Toggle for flat/grouped switch
  - `https://remixicon.com/` — ri-git-pull-request-line, file type icons
  - Task T8 output — WebSocket client for GitStatus messages
  - Task T14 output — GitOps::status backend implementation
  - Task T16 output — Context menu system (file context menus)
  - Task T23 output — CreatePRDialog (triggered by PR button)

  **Acceptance Criteria**:
  - [ ] Changes tab shows list of changed files with colored dots
  - [ ] Flat/Grouped toggle switches display mode
  - [ ] Empty state shows when no changes
  - [ ] All Files tab shows virtual-scrolling file tree
  - [ ] Click change file opens DiffTab in main panel
  - [ ] Click all-files file opens EditorTab in main panel
  - [ ] PR button opens PR dialog
  - [ ] Merge dropdown shows Merge and Squash & Merge options
  - [ ] Tab bar aligned left, toolbar aligned right
  - [ ] Auto-refresh on file watcher events
  - [ ] Unit tests pass

  **QA Scenarios (MANDATORY)**:
  ```
  Scenario: Changes tab shows git status
    Tool: Playwright
    Preconditions: dev server running, worktree with modified files
    Steps:
      1. Navigate to project panel
      2. Assert "Changes" tab active by default
      3. Assert modified files listed with yellow dots
      4. Assert added files have green dots
      5. Click toggle to "Grouped" view
      6. Assert files grouped by parent folder
    Expected Result: Git status displayed correctly
    Evidence: .sisyphus/evidence/task-26-changes.png

  Scenario: All Files tab shows file tree
    Tool: Playwright
    Steps:
      1. Click "All Files" tab
      2. Assert file tree renders with folders
      3. Click folder to expand
      4. Assert child files visible
      5. Click file
      6. Assert EditorTab opens in main panel
    Expected Result: File browser works
    Evidence: .sisyphus/evidence/task-26-all-files.png
  ```

  **Commit**: YES (groups with T24, T25, T27, T28)
  - Message: `feat(web): project panel with git changes and file browser tabs`

---

- [ ] 27. File Browser with Virtual Scroll

  **What to do**:
  - Install `react-window` (if not already installed from T15) and `@tanstack/react-virtual` in apps/web/
  - Create `apps/web/src/components/project/FileTree.tsx` — the virtual-scrolling file tree component:
    - Props: `{ files: FileNode[], onFileClick: (path: string) => void }`
    - `FileNode` type: `{ name: string, path: string, type: 'file' | 'directory', children?: FileNode[], expanded?: boolean }`
    - Uses `VariableSizeList` from react-window for virtual scrolling:
      - Row height varies based on indentation level (directory = 28px, file = 24px)
      - Each row: indentation (depth * 16px), directory/file icon, name
      - File icons from Remix Icon: `ri-folder-line` for directories, `ri-file-line` for generic files, `ri-file-code-line` for code files (.ts/.tsx/.js/.jsx/.py/.rs), `ri-markdown-line` for .md, `ri-file-image-line` for images, etc.
    - Directory expand/collapse:
      - Click directory → toggle expanded state
      - Chevron icon (▶/▼) next to directory name
      - Expanded state stored in Zustand per worktree
    - Performance budget: 10,000 nodes rendered in <200ms
      - Flat node array computed from tree structure (flattened with expanded state)
      - Only visible rows rendered by react-window
    - Lazy loading: directory contents not loaded until expanded (send request via WebSocket for directory listing)
    - Empty directory state: grayed "empty" text
  - Write unit tests for: flattening logic, expand/collapse, icon mapping, scroll position

  **Must NOT do**:
  - Do not implement file creation/deletion (future feature)
  - Do not implement drag-and-drop file reordering
  - Do not implement file search/filter
  - Do not implement breadcrumb navigation

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 4 (with T24-T26, T28)
  - **Blocks**: —
  - **Blocked By**: T8, T9, T13, T16

  **References**:
  - `https://react-window.vercel.app/#/api/VariableSizeList` — VariableSizeList API
  - `https://remixicon.com/` — File type icons
  - Task T26 output — AllFilesTab that uses FileTree component
  - Task T13 output — FileWatcher that triggers tree refresh on changes

  **Acceptance Criteria**:
  - [ ] File tree renders with correct icons for each file type
  - [ ] Directories expand/collapse on click
  - [ ] Expanded state persists across page refresh (per worktree)
  - [ ] Virtual scrolling handles 10,000+ items smoothly
  - [ ] Clicking file calls onFileClick callback
  - [ ] Empty directories show "empty" text
  - [ ] Performance: 10,000 nodes render in <200ms (measured)
  - [ ] Unit tests pass

  **QA Scenarios (MANDATORY)**:
  ```
  Scenario: File tree renders with virtual scrolling
    Tool: Playwright
    Preconditions: dev server running, worktree with large file tree
    Steps:
      1. Navigate to All Files tab
      2. Assert file tree renders with folders at top
      3. Assert file type icons match extensions (.ts → code icon, .md → markdown icon)
      4. Click directory to expand
      5. Assert child nodes appear
      6. Scroll down rapidly
      7. Assert no visible lag or stuttering
    Expected Result: File tree scrolls smoothly
    Evidence: .sisyphus/evidence/task-27-file-tree.png

  Scenario: Expand state persists
    Tool: Playwright
    Steps:
      1. Expand "src" folder
      2. Expand "src/components" folder
      3. Reload page
      4. Assert "src" and "src/components" still expanded
    Expected Result: Expansion state persisted
    Evidence: .sisyphus/evidence/task-27-persist.png
  ```

  **Commit**: YES (groups with T24-T26)
  - Message: `feat(web): virtual-scrolling file browser tree with lazy loading`

---

- [ ] 28. Merge/Squash-Merge Workflow

  **What to do**:
  - Create `apps/web/src/components/dialogs/MergeDialog.tsx` — merge confirmation dialog using Base UI AlertDialog:
    - Triggered by Merge dropdown in project panel toolbar (from T26)
    - Props: `{ worktreeId: string, mergeType: 'merge' | 'squash' }`
    - `AlertDialog.Root` with `AlertDialog.Trigger` (the dropdown items)
    - `AlertDialog.Portal` with `AlertDialog.Popup`:
      - `AlertDialog.Title`: "Merge worktree" or "Squash & Merge worktree"
      - `AlertDialog.Description`: "Merge branch '{branchName}' into '{mainBranch}'? This will combine the changes from this worktree."
      - Checkbox: "Delete worktree after merge" (Base UI Checkbox)
      - Warning text when checkbox checked: "This will permanently delete the worktree directory."
      - Buttons:
        - "Merge" or "Squash & Merge" (primary, green)
        - "Cancel" (secondary, gray)
    - On confirm:
      - Send `WorktreeMerge` message via WebSocket with: worktreeId, squash (boolean), deleteAfter (boolean)
      - Show loading state on confirm button
      - On success: close dialog, show success toast "Branch merged successfully", refresh worktree list
      - If deleteAfter: show additional toast "Worktree deleted"
      - On error: show error toast with error message (e.g., "Merge conflict detected", "Branch not up to date")
    - If delete checkbox is checked AND merge succeeds: show confirmation alert dialog "Worktree merged and deleted"
    - Error handling: merge conflicts returned as error with details → show in toast
  - Wire up: subscribe to WorktreeMerge response/error messages from WebSocket
  - Write unit tests for: dialog rendering, checkbox state, confirm flow, error handling

  **Must NOT do**:
  - Do not implement conflict resolution UI (show error toast only)
  - Do not implement merge history/audit log
  - Do not implement branch selection (branch comes from worktree settings)
  - Do not implement force merge option

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 4 (with T24-T27)
  - **Blocks**: —
  - **Blocked By**: T8, T9, T14, T16, T31

  **References**:
  - `https://base-ui.com/react/components/alert-dialog` — Base UI AlertDialog API
  - `https://base-ui.com/react/components/checkbox` — Base UI Checkbox for delete option
  - Task T8 output — WebSocket client for WorktreeMerge message
  - Task T14 output — GitOps::merge backend implementation
  - Task T31 output — AlertDialog wrapper (can use or extend)

  **Acceptance Criteria**:
  - [ ] Merge dialog opens from dropdown menu
  - [ ] Dialog shows correct merge type (regular vs squash)
  - [ ] Delete checkbox toggles warning text visibility
  - [ ] Confirm sends WorktreeMerge message via WebSocket
  - [ ] Success shows toast and refreshes worktree list
  - [ ] Error shows toast with error message (dialog stays open)
  - [ ] Merge conflict returns descriptive error
  - [ ] Delete after merge removes worktree from sidebar
  - [ ] Unit tests pass

  **QA Scenarios (MANDATORY)**:
  ```
  Scenario: Merge workflow completes
    Tool: Playwright
    Preconditions: dev server running, worktree with changes to merge
    Steps:
      1. Click "Merge" dropdown in project panel toolbar
      2. Click "Merge" option
      3. Assert merge dialog appears with "Merge" title
      4. Assert checkbox unchecked by default
      5. Click "Merge" button
      6. Assert success toast appears
      7. Assert worktree still exists in sidebar
    Expected Result: Merge completes without delete
    Evidence: .sisyphus/evidence/task-28-merge.png

  Scenario: Merge with delete
    Tool: Playwright
    Steps:
      1. Open merge dialog
      2. Check "Delete worktree after merge"
      3. Assert warning text appears
      4. Click "Merge"
      5. Assert success toast
      6. Assert worktree removed from sidebar
    Expected Result: Merge and delete completes
    Evidence: .sisyphus/evidence/task-28-merge-delete.png

  Scenario: Merge conflict shows error
    Tool: Bash (vitest + test setup)
    Preconditions: worktree with conflicting changes
    Steps:
      1. Trigger merge
      2. Assert error toast appears with "conflict" text
      3. Assert dialog stays open
    Expected Result: Conflict handled gracefully
    Evidence: .sisyphus/evidence/task-28-conflict.png
  ```

  **Commit**: YES (groups with T24-T27)
     - Message: `feat(web): merge/squash-merge workflow with confirmation dialog`

---

## Wave 5: Integration

- [ ] 29. Worktree Creation Flow

  **What to do**:
  - Create `apps/web/src/components/dialogs/CreateWorktreeDialog.tsx` — new worktree dialog using Base UI Dialog:
    - `Dialog.Root` wrapping component
    - `Dialog.Trigger` — the "New Worktree" button on workspace header in sidebar (from T15)
    - `Dialog.Portal` with `Dialog.Popup`:
      - `Dialog.Title`: "New Worktree"
      - `Dialog.Description`: "Create a new git worktree for this workspace"
      - Form fields:
        - Branch name (text input, required) — placeholder: "feature/my-branch"
        - "Use existing branch" checkbox — when checked, shows branch dropdown fetched via WebSocket
      - Agent selector section:
        - Label: "Start with agent"
        - Radio group (Base UI Radio) with options:
          - **Claude** (ri-robot-line icon + "Claude" label + "Via ACP adapter" description)
          - **Opencode** (ri-terminal-box-line icon + "Opencode" label + "Native ACP support" description)
          - **Pi** (ri-code-s-slash-line icon + "Pi" label + "Via pi-acp adapter" description)
          - **None** (ri-forbid-line icon + "No agent" label + "Start with terminal only" description)
        - Default: None selected (user must choose)
      - Buttons:
        - "Create" (primary, green) — validates form, sends WorktreeCreate via WebSocket
        - "Cancel" (secondary, gray)
    - Creation flow:
      - Validate: branch name not empty, agent selected
      - Send `WorktreeCreate` message: { workspaceId, branchName, agentType }
      - Server creates git worktree via git2 (T11)
      - If agent selected: server spawns ACP client for that agent type (T20)
      - Server creates default terminal session (T12)
      - On success: close dialog, show toast "Worktree created", worktree appears in sidebar, main + project panels switch to new worktree
      - On error: show error toast (e.g., "Branch already has worktree", "Agent not found")
    - Dialog state in Zustand: `createWorktreeDialogOpen: boolean`
  - Wire up: subscribe to WorktreeCreated, WorktreeError messages
  - Write unit tests for: form validation, agent selection, submit flow

  **Must NOT do**:
  - Do not implement workspace creation dialog (that's T30)
  - Do not implement branch browsing (just text input + existing branch checkbox)
  - Do not add worktree templates or presets
  - Do not implement worktree cloning from existing worktree

  **Recommended Agent Profile**:
  - **Category**: `deep`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 5 (with T30-T34)
  - **Blocks**: —
  - **Blocked By**: T11, T14, T15, T20, T21

  **References**:
  - `https://base-ui.com/react/components/dialog` — Base UI Dialog API
  - `https://base-ui.com/react/components/radio` — Base UI Radio for agent selector
  - `https://base-ui.com/react/components/checkbox` — Base UI Checkbox for existing branch
  - `https://remixicon.com/` — ri-robot-line, ri-terminal-box-line, ri-code-s-slash-line, ri-forbid-line icons
  - `https://agentclientprotocol.com/get-started/agents` — List of ACP agents (Claude, Opencode, Pi)
  - Task T11 output — Workspace/Worktree CRUD backend
  - Task T15 output — Sidebar "New Worktree" button
  - Task T20 output — ACP client spawn flow
  - Task T21 output — AgentPane that will show the new agent tab

  **Acceptance Criteria**:
  - [ ] Dialog opens from "New Worktree" button on workspace header
  - [ ] Branch name input required (shows validation error if empty)
  - [ ] Agent selector shows 4 options with icons and descriptions
  - [ ] "Create" button disabled until branch name filled AND agent selected
  - [ ] Send WorktreeCreate message with correct fields
  - [ ] On success: dialog closes, toast shows, worktree appears in sidebar
  - [ ] On error: error toast shows, dialog stays open
  - [ ] Unit tests pass

  **QA Scenarios (MANDATORY)**:
  ```
  Scenario: Worktree creation flow
    Tool: Playwright
    Preconditions: dev server running, workspace exists
    Steps:
      1. Click "New Worktree" button on workspace header
      2. Assert dialog appears with title "New Worktree"
      3. Fill branch name: "feature/test-branch"
      4. Select agent: "Claude" (radio)
      5. Click "Create"
      6. Assert dialog closes
      7. Assert success toast appears
      8. Assert "feature/test-branch" appears in sidebar under workspace
    Expected Result: Worktree created and visible
    Evidence: .sisyphus/evidence/task-29-create.png

  Scenario: Validation prevents empty submission
    Tool: Playwright
    Steps:
      1. Open create dialog
      2. Leave branch name empty
      3. Select agent
      4. Assert "Create" button is disabled
      5. Fill branch name
      6. Leave agent unselected
      7. Assert "Create" button is disabled
    Expected Result: Both fields required
    Evidence: .sisyphus/evidence/task-29-validation.png
  ```

  **Commit**: YES (groups with T30, T31)
  - Message: `feat(web): worktree creation flow with agent selector dialog`

---

- [ ] 30. Workspace Settings Dialog

  **What to do**:
  - Create `apps/web/src/components/dialogs/WorkspaceSettingsDialog.tsx` — workspace settings dialog using Base UI Dialog:
    - Triggered by "Settings" context menu item on workspace node (from T16)
    - `Dialog.Portal` with `Dialog.Popup`:
      - `Dialog.Title`: "Workspace Settings"
      - Form fields:
        - Name (text input, pre-filled with current name)
        - Root path (text input, read-only with "Change" button — directory picker via Tauri or manual entry)
        - Color (6 preset colors: red, orange, yellow, green, blue, purple — click to select)
        - Icon (Remix Icon selector — grid of 12 common icons: ri-folder-line, ri-code-box-line, ri-bug-line, ri-git-branch-line, etc.)
        - Worktree base directory (text input, default: `.worktrees/`) — relative to root path
      - "Danger Zone" section (red border):
        - "Delete Workspace" button (red, destructive)
      - Buttons:
        - "Save" (primary) — sends WorkspaceUpdate via WebSocket
        - "Cancel" (secondary) — closes without saving
    - Delete workspace flow:
      - Click "Delete Workspace"
      - Show confirmation AlertDialog: "Delete workspace '{name}'? This cannot be undone."
      - If worktrees exist: "This workspace has {N} worktrees. Delete all worktrees first."
      - On confirm: send WorkspaceDelete via WebSocket
      - On success: close all dialogs, workspace removed from sidebar, toast "Workspace deleted"
    - Update flow:
      - Click "Save"
      - Send WorkspaceUpdate with all field values
      - On success: close dialog, toast "Settings saved", workspace header updates in sidebar
      - On error: error toast
  - Wire up: subscribe to WorkspaceUpdated, WorkspaceDeleted messages
  - Write unit tests for: form pre-fill, update flow, delete confirmation

  **Must NOT do**:
  - Do not implement workspace creation (existing workspace only)
  - Do not add git remote configuration
  - Do not add workspace import/export

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 5 (with T29, T31-T34)
  - **Blocks**: —
  - **Blocked By**: T11, T15

  **References**:
  - `https://base-ui.com/react/components/dialog` — Base UI Dialog API
  - `https://base-ui.com/react/components/alert-dialog` — Base UI AlertDialog for delete confirmation
  - `https://remixicon.com/` — Icon selector options
  - Task T11 output — Workspace CRUD backend
  - Task T16 output — Context menu "Settings" item
  - Task T15 output — Workspace header in sidebar that updates on save

  **Acceptance Criteria**:
  - [ ] Settings dialog opens from context menu "Settings" item
  - [ ] All fields pre-filled with current workspace values
  - [ ] Color picker shows 6 preset options with current selected
  - [ ] Icon selector shows 12 icons with current selected
  - [ ] "Save" sends WorkspaceUpdate with all values
  - [ ] Success closes dialog and updates sidebar header
  - [ ] "Delete Workspace" shows confirmation AlertDialog
  - [ ] Delete blocked if worktrees exist (with count)
  - [ ] Successful delete removes workspace from sidebar
  - [ ] Unit tests pass

  **QA Scenarios (MANDATORY)**:
  ```
  Scenario: Settings dialog updates workspace
    Tool: Playwright
    Preconditions: workspace exists in sidebar
    Steps:
      1. Right-click workspace, click "Settings"
      2. Assert dialog pre-filled with current values
      3. Change name to "My Project"
      4. Change color to blue
      5. Click "Save"
      6. Assert dialog closes
      7. Assert sidebar header shows "My Project" with blue indicator
    Expected Result: Settings update correctly
    Evidence: .sisyphus/evidence/task-30-settings.png

  Scenario: Delete blocked with active worktrees
    Tool: Playwright
    Preconditions: workspace with 2 worktrees
    Steps:
      1. Open workspace settings
      2. Click "Delete Workspace"
      3. Assert AlertDialog shows: "This workspace has 2 worktrees"
      4. Assert delete is blocked or shows error
    Expected Result: Delete protected by worktree check
    Evidence: .sisyphus/evidence/task-30-delete-blocked.png
  ```

  **Commit**: YES (groups with T29, T31)
  - Message: `feat(web): workspace settings dialog with danger zone`

---

- [ ] 31. Alert Dialog for Destructive Actions

  **What to do**:
  - Create `apps/web/src/components/ui/AlertDialog.tsx` — reusable confirmation dialog wrapping Base UI AlertDialog:
    - Props:
      - `title: string` — dialog title
      - `description: string` — warning text
      - `confirmLabel: string` — confirm button text (e.g., "Delete", "Merge", "Discard")
      - `cancelLabel?: string` — cancel button text (default: "Cancel")
      - `variant: 'default' | 'destructive'` — destructive adds red styling to confirm button
      - `onConfirm: () => void` — callback when confirmed
      - `onCancel?: () => void` — callback when cancelled
      - `open: boolean` — controlled open state
      - `onOpenChange: (open: boolean) => void` — controlled open change handler
    - Renders Base UI AlertDialog:
      - `AlertDialog.Root` with `open` and `onOpenChange`
      - `AlertDialog.Portal` with `AlertDialog.Popup`
      - `AlertDialog.Title` with icon (ri-alert-line for destructive, ri-question-line for default)
      - `AlertDialog.Description`
      - Buttons:
        - `AlertDialog.Cancel` — gray/secondary button
        - `AlertDialog.Action` — confirm button (red for destructive, green for default)
    - Backdrop: semi-transparent overlay blocking interaction
    - Escape key: closes dialog (triggers onCancel)
    - Click outside: does NOT close (must explicitly cancel or confirm)
  - Used by: T28 (merge), T30 (delete workspace), T33 (reset database), and future destructive actions
  - Wire up to Zustand store: `alertDialog: { open, title, description, ... } | null`
  - Convenience function: `showAlertDialog(config)` — sets store state to open dialog
  - Write unit tests for: rendering, confirm/cancel callbacks, variant styling, escape key

  **Must NOT do**:
  - Do not add custom form fields inside alert dialog (use regular Dialog for that)
  - Do not add animation beyond Base UI defaults
  - Do not implement undo functionality

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 5 (with T29-T30, T32-T34)
  - **Blocks**: T28
  - **Blocked By**: T16

  **References**:
  - `https://base-ui.com/react/components/alert-dialog` — Base UI AlertDialog API
  - `https://remixicon.com/` — ri-alert-line, ri-question-line icons
  - Task T10 output — CSS theme variables for button styling
  - Task T8 output — Zustand store integration

  **Acceptance Criteria**:
  - [ ] Alert dialog renders with title, description, and two buttons
  - [ ] Confirm button fires onConfirm callback
  - [ ] Cancel button fires onCancel callback
  - [ ] Escape key triggers onCancel
  - [ ] Click outside does NOT close dialog
  - [ ] Destructive variant has red confirm button
  - [ ] Default variant has green confirm button
  - [ ] Backdrop blocks interaction with content behind
  - [ ] Unit tests pass

  **QA Scenarios (MANDATORY)**:
  ```
  Scenario: Alert dialog renders correctly
    Tool: Playwright
    Steps:
      1. Trigger alert dialog (via store action)
      2. Assert dialog visible with title and description
      3. Assert "Cancel" button visible
      4. Assert "Confirm" button visible (red for destructive)
      5. Click backdrop
      6. Assert dialog still visible (doesn't close)
    Expected Result: Dialog behaves correctly
    Evidence: .sisyphus/evidence/task-31-alert.png

  Scenario: Escape key closes dialog
    Tool: Playwright
    Steps:
      1. Open alert dialog
      2. Press Escape
      3. Assert dialog closed
      4. Assert onCancel called
    Expected Result: Escape closes and fires callback
    Evidence: .sisyphus/evidence/task-31-escape.png
  ```

  **Commit**: YES (groups with T29-T30)
  - Message: `feat(web): reusable alert dialog component for destructive confirmations`

---

- [ ] 32. WebSocket Reconnect + State Replay

  **What to do**:
  - Update `apps/web/src/lib/ws.ts` (from T8) with full reconnection logic:
    - Exponential backoff: 1s → 2s → 4s → 8s → 16s → 30s (cap)
    - Jitter: add random ±20% to each delay to prevent thundering herd
    - On disconnect:
      - Update connection status to 'closed'
      - Start backoff timer
      - Queue outgoing messages in `pendingMessages: ClientMessage[]`
    - On reconnect attempt:
      - Update status to 'reconnecting'
      - Attempt WebSocket connection
      - On success:
        - Send `GetState` message to request full state snapshot
        - Receive `StateSnapshot` → call `store.stateFromSnapshot(snapshot)` to replace entire store
        - Flush `pendingMessages` queue (send all queued messages)
        - Clear queue
        - Update status to 'open'
        - Show success toast "Reconnected"
      - On failure:
        - Schedule next backoff attempt
    - Maximum retry attempts: unlimited (keep trying until success)
    - On `window.beforeunload`: cleanly close WebSocket with code 1000
  - Update Zustand store with: `connectionStatus: 'connecting' | 'open' | 'closed' | 'reconnecting'`
  - Write unit tests for: backoff calculation, jitter range, queue flush, state replay

  **Must NOT do**:
  - Do not implement offline mode
  - Do not cache files locally
  - Do not implement conflict resolution for queued messages
  - Do not add connection quality indicator

  **Recommended Agent Profile**:
  - **Category**: `deep`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 5 (with T29-T31, T33, T34)
  - **Blocks**: —
  - **Blocked By**: T7, T8

  **References**:
  - Task T8 output — WebSocket client with basic reconnection (this extends it)
  - Task T7 output — Server-side GetState/StateSnapshot message handlers
  - Task T5 output — GetState and StateSnapshot message types

  **Acceptance Criteria**:
  - [ ] Exponential backoff: 1s, 2s, 4s, 8s, 16s, 30s cap
  - [ ] Jitter applied: ±20% variation on each delay
  - [ ] GetState sent on successful reconnect
  - [ ] StateSnapshot replaces entire Zustand store
  - [ ] Queued messages flushed on reconnect
  - [ ] Status updates: open → closed → reconnecting → open
  - [ ] Toast notification on reconnect success
  - [ ] Unlimited retry attempts (never gives up)
  - [ ] Unit tests pass

  **QA Scenarios (MANDATORY)**:
  ```
  Scenario: Reconnect with state replay
    Tool: Playwright + Bash
    Preconditions: dev server running, ws-server on :7319
    Steps:
      1. Connect to app (status: open)
      2. Kill ws-server process
      3. Wait 2 seconds (status should be: reconnecting)
      4. Restart ws-server
      5. Wait for reconnect (max 10 seconds)
      6. Assert status: open
      7. Assert state snapshot received (store has data)
      8. Assert success toast shown
    Expected Result: Reconnects and replays state
    Evidence: .sisyphus/evidence/task-32-reconnect.png

  Scenario: Exponential backoff timing
    Tool: Bash (vitest)
    Steps:
      1. Run: cd apps/web && npx vitest run ws-backoff
      2. Assert output contains "backoff sequence correct"
      3. Assert output contains "jitter applied"
    Expected Result: Backoff timing correct
    Evidence: .sisyphus/evidence/task-32-backoff.txt
  ```

  **Commit**: YES (groups with T29-T31)
  - Message: `feat: WebSocket reconnect with exponential backoff and full state replay`

---

- [ ] 33. Error Recovery (PTY Crash, Git Failure)

  **What to do**:
  - Create `apps/web/src/lib/error-recovery.ts` — centralized error handling:
    - `handleError(error: ServerErrorMessage)` — dispatches to specific handler based on error type
    - Error categories and actions:
      - **`pty_crash`**: Show toast "Terminal session crashed — restarting...", send TerminalCreate to restart PTY, update terminal tab to new session ID
      - **`git_failure`**: Show toast with specific error (e.g., "Merge conflict in src/app.ts"), do NOT auto-retry, log to activity_log
      - **`agent_crash`**: Show toast "Agent '{name}' crashed", update agent status to idle (gray dot)
      - **`db_error`**: Show alert dialog "Database error — Reset database?" with Reset/Continue buttons
  - PTY crash: auto-restart new PTY for same worktree, clear terminal content
  - Git failure: user must fix the issue manually
  - Agent crash: user can restart via worktree context menu
  - Database: Reset button sends ResetDb message → server recreates tables
  - All errors logged to activity_log table
  - Write unit tests for: each error handler, toast messages, recovery actions

  **Must NOT do**:
  - Do not implement automatic retry for git operations
  - Do not implement error reporting to external service
  - Do not implement error history panel
  - Do not implement crash report collection

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 5 (with T29-T32, T34)
  - **Blocks**: —
  - **Blocked By**: T7, T12, T14, T17

  **References**:
  - Task T7 output — Server error message types
  - Task T12 output — PTY crash detection
  - Task T14 output — Git error handling
  - Task T17 output — Toast notification system
  - Task T31 output — AlertDialog for database reset
  - Task T4 output — activity_log table

  **Acceptance Criteria**:
  - [ ] PTY crash shows toast and auto-restarts terminal
  - [ ] Git failure shows descriptive error toast
  - [ ] Agent crash shows toast and resets status to idle
  - [ ] Database error shows alert dialog with reset option
  - [ ] All errors logged to activity_log table
  - [ ] Unit tests pass for all error handlers

  **QA Scenarios (MANDATORY)**:
  ```
  Scenario: PTY crash auto-restarts
    Tool: Playwright
    Preconditions: terminal running in worktree
    Steps:
      1. Kill PTY process on backend (simulate crash)
      2. Assert error toast appears: "Terminal session crashed"
      3. Assert new terminal session starts automatically
      4. Assert terminal accepts input again
    Expected Result: Terminal recovered automatically
    Evidence: .sisyphus/evidence/task-33-pty-crash.png

  Scenario: Git failure shows error
    Tool: Playwright
    Preconditions: worktree with merge conflict
    Steps:
      1. Trigger merge operation
      2. Assert error toast appears with "conflict" text
      3. Assert toast does NOT auto-retry
    Expected Result: Error shown, no auto-retry
    Evidence: .sisyphus/evidence/task-33-git-error.png

  Scenario: Database error dialog
    Tool: Playwright
    Steps:
      1. Simulate database error (send DbError message)
      2. Assert alert dialog appears with "Database error" title
      3. Assert "Reset Database" button visible
      4. Assert "Continue" button visible
    Expected Result: Database error handled with reset option
    Evidence: .sisyphus/evidence/task-33-db-error.png
  ```

  **Commit**: YES (groups with T29-T32)
  - Message: `feat: error recovery for PTY crashes, git failures, and database errors`

---

- [ ] 34. Status Bar (Connection Indicator)

  **What to do**:
  - Update `apps/web/src/components/layout/StatusBar.tsx` (placeholder from T9) with connection indicator:
    - Layout: single row at bottom of app, height 24px, background `--muted`, border-top `--border`
    - Left side: connection status indicator:
      - Green dot (● `--status-working`) + "Online" text → when `connectionStatus === 'open'`
      - Gray dot (● `--status-idle`) + "Offline" text → when `connectionStatus === 'closed'`
      - Amber spinning dot (⟳ `--status-waiting` with spin animation) + "Reconnecting..." text → when `connectionStatus === 'reconnecting'`
      - Connecting state: same as reconnecting but "Connecting..."
    - Dot + text styled small (font-size: 11px, muted foreground color)
    - All other status bar content removed per requirements (minimal — connection only)
  - Subscribe to `connectionStatus` from Zustand store
  - Animation for reconnecting: CSS `@keyframes spin` rotating the ⟳ icon
  - Write unit tests for: status rendering for each state

  **Must NOT do**:
  - Do not add git branch indicator
  - Do not add agent count
  - Do not add file change count
  - Do not add workspace/worktree name
  - Do not make status bar interactive (no click actions)

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 5 (with T29-T33)
  - **Blocks**: —
  - **Blocked By**: T8, T18

  **References**:
  - Task T9 output — StatusBar placeholder component
  - Task T10 output — CSS theme variables (--status-working, --status-idle, --status-waiting)
  - Task T8 output — Zustand store connectionStatus field
  - Task T32 output — Connection state management (open/closed/reconnecting)

  **Acceptance Criteria**:
  - [ ] Status bar renders at bottom of app
  - [ ] "Online" with green dot when connected
  - [ ] "Offline" with gray dot when disconnected
  - [ ] "Reconnecting..." with spinning amber dot when reconnecting
  - [ ] Status bar height 24px, not resizable
  - [ ] No other content in status bar
  - [ ] Unit tests pass

  **QA Scenarios (MANDATORY)**:
  ```
  Scenario: Status bar shows correct state
    Tool: Playwright
    Preconditions: dev server running, ws-server on :7319
    Steps:
      1. Assert status bar shows "Online" with green dot
      2. Kill ws-server
      3. Wait for status to update
      4. Assert status bar shows "Reconnecting..." with spinning dot
      5. Restart ws-server
      6. Wait for reconnect
      7. Assert status bar shows "Online" with green dot
    Expected Result: Status updates correctly
    Evidence: .sisyphus/evidence/task-34-status-bar.png
  ```

  **Commit**: YES (groups with T29-T33)
  - Message: `feat(web): minimal status bar with connection indicator`

---

## Wave 6: Tauri + Polish

- [ ] 35. Tauri Build Config + Proxy Setup

  **What to do**:
  - Update `apps/tauri/src-tauri/tauri.conf.json`:
    - `app.windows[0].title` → `"Ymir"`
    - `app.windows[0].width` → `1400`, `app.windows[0].height` → `900`
    - `app.windows[0].minWidth` → `1200`, `app.windows[0].minHeight` → `800`
    - `app.windows[0].center` → `true`
    - `app.windows[0].resizable` → `true`
    - `app.bundle.identifier` → `"com.ymir.app"`
    - `app.security.csp` → `"default-src 'self'; connect-src 'self' ws://localhost:7319; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-eval' 'unsafe-inline'; worker-src 'self' blob:; img-src 'self' data: blob:; font-src 'self' data:;"`
    - `app.security.dangerousDisableAssetCspModification` → `true` (needed for Monaco workers)
  - Create `apps/tauri/src-tauri/capabilities/default.json` (Tauri v2 capability system):
    - `identifier`: `"default"`
    - `windows`: `["main"]`
    - `permissions`: `["core:default", "core:window:allow-start-dragging", "core:webview:allow-set-webview-size", "shell:allow-open", "fs:allow-read-text-file", "fs:allow-read-dir", "fs:allow-exists", "dialog:allow-open", "clipboard-manager:allow-write-text"]`
    - `remote.domain`: `["localhost"]`
  - Update `apps/tauri/src-tauri/src/lib.rs`:
    - Change `run()` to `Builder::default().run(tauri::generate_context!())`
    - Register IPC commands (empty for now, T36 will add them)
  - Create `apps/tauri/src-tauri/icons/` directory with placeholder icons:
    - 32x32.png, 128x128.png, 128x128@2x.png, icon.icns (macOS), icon.ico (Windows)
    - Use a simple design: letter "Y" on dark background
    - Generate via `cargo tauri icon` or use existing assets if available
  - Add build scripts to root `Makefile`:
    - `make dev-tauri`: `cd apps/web && npm run dev & cd apps/tauri/src-tauri && cargo tauri dev` (concurrently)
    - `make build-tauri`: `cd apps/web && npm run build && cd apps/tauri/src-tauri && cargo tauri build --release`
    - `make build-web-only`: `cd apps/web && npm run build` (for web deployment without Tauri)
  - Verify Vite dev proxy still works in Tauri context:
    - `cargo tauri dev` should launch a window pointing to Vite dev server
    - WebSocket messages flow through the window to ws-server on :7319
    - CSP does not block WebSocket connections
  - Write build verification test: `apps/tauri/tests/build.rs` that checks tauri.conf.json is valid, icons exist, capabilities are correct

  **Must NOT do**:
  - Do not implement Tauri IPC commands (that's T36)
  - Do not add auto-update functionality
  - Do not implement system tray (that's T36)
  - Do not add deep linking or protocol handlers
  - Do not add multi-window support
  - Do not modify the web app code (only Tauri wrapper config)

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 6 (with T36-T39)
  - **Blocks**: T36
  - **Blocked By**: T9

  **References**:
  - `apps/tauri/src-tauri/tauri.conf.json` — Current Tauri v2 config (needs updating)
  - `apps/tauri/src-tauri/Cargo.toml` — Current Tauri dependencies
  - `apps/tauri/src-tauri/src/lib.rs` — Current Tauri entry point (empty, needs Builder)
  - `apps/tauri/src-tauri/build.rs` — Tauri build script
  - `Cargo.toml` — Workspace root (Tauri currently commented out under [workspace] members)
  - `ARCHITECTURE.md:150-172` — Planned Tauri module structure
  - `https://v2.tauri.app/reference/config/` — Tauri v2 configuration reference
  - `https://v2.tauri.app/security/csp/` — Tauri v2 CSP configuration
  - `https://v2.tauri.app/reference/permissions/` — Tauri v2 capability/permissions system
  - Task T9 output — AppShell layout that Tauri wraps

  **Acceptance Criteria**:
  - [ ] `cargo tauri dev` launches window titled "Ymir"
  - [ ] Window default size is 1400x900, minimum is 1200x800
  - [ ] Window is resizable and centered on launch
  - [ ] WebSocket connects to ws://localhost:7319 through Tauri window (CSP allows it)
  - [ ] Monaco editor loads without CSP errors (workers, styles, eval allowed)
  - [ ] App icons appear in window title bar, dock/taskbar, and Alt+Tab
  - [ ] `make build-tauri` produces release binary in `target/release/`
  - [ ] `make dev-tauri` starts Vite dev server and Tauri window concurrently
  - [ ] Build verification test passes

  **QA Scenarios (MANDATORY)**:
  ```
  Scenario: Tauri app launches and connects WebSocket
    Tool: Bash + Playwright (Tauri devtools)
    Preconditions: ws-server running on :7319
    Steps:
      1. Run: cargo tauri dev (from apps/tauri/src-tauri/)
      2. Wait for window to appear
      3. Assert window title is "Ymir"
      4. Assert window is resizable (drag corner to resize)
      5. Open DevTools (F12 in dev mode)
      6. Assert WebSocket status is "open" in status bar
      7. Assert no CSP errors in console
    Expected Result: Tauri app launches, connects, no errors
    Evidence: .sisyphus/evidence/task-35-tauri-launch.png

  Scenario: Build produces valid binary
    Tool: Bash
    Steps:
      1. Run: make build-tauri
      2. Assert exit code 0
      3. Assert binary exists at apps/tauri/src-tauri/target/release/ymir (or .exe on Windows)
      4. Run binary and assert window opens
    Expected Result: Release build works
    Evidence: .sisyphus/evidence/task-35-build.txt

  Scenario: Icons render correctly
    Tool: Bash + Playwright
    Steps:
      1. Run: ls apps/tauri/src-tauri/icons/
      2. Assert at least 5 icon files exist
      3. Launch app
      4. Assert window title bar shows Ymir icon
    Expected Result: Icons present and rendering
    Evidence: .sisyphus/evidence/task-35-icons.txt
  ```

  **Commit**: YES (groups with T36)
  - Message: `feat(tauri): v2 build configuration, CSP, capabilities, and app icons`

---

- [ ] 36. Tauri Native Features

  **What to do**:
  - Add IPC commands in `apps/tauri/src-tauri/src/commands.rs`:
    - `#[tauri::command] fn reveal_in_file_manager(path: String) -> Result<(), String>`:
      - Use `open::that(path)` crate to open OS file manager at the given directory
      - On Windows: opens Explorer, macOS: opens Finder, Linux: opens xdg-open
      - Return error if path does not exist or is not a directory
    - `#[tauri::command] fn copy_to_clipboard(text: String) -> Result<(), String>`:
      - Use Tauri's clipboard manager plugin: `app.clipboard().write_text(text)`
      - Return success/error
    - `#[tauri::command] fn show_notification(title: String, body: String) -> Result<(), String>`:
      - Use Tauri's notification plugin: `app.notification().builder().title(title).body(body).show()`
      - Request notification permission on first use
    - `#[tauri::command] fn pick_directory() -> Result<Option<String>, String>`:
      - Use Tauri's dialog plugin: `FileDialogBuilder::new().pick_folder()`
      - Return selected path or None if cancelled
  - Register commands in `apps/tauri/src-tauri/src/lib.rs`:
    - `.invoke_handler(tauri::generate_handler![reveal_in_file_manager, copy_to_clipboard, show_notification, pick_directory])`
  - Add required dependencies to `apps/tauri/src-tauri/Cargo.toml`:
    - `open = "5"` (file manager opening)
    - `tauri-plugin-clipboard-manager` (clipboard)
    - `tauri-plugin-notification` (notifications)
    - `tauri-plugin-dialog` (directory picker)
    - `tauri-plugin-fs` (filesystem operations)
    - Register plugins: `.plugin(tauri_plugin_clipboard_manager::init())` etc.
  - Create system tray in `apps/tauri/src-tauri/src/tray.rs`:
    - Create tray icon from app icon (32x32 version)
    - Build tray menu:
      - `MenuItem::with_id("show", "Show Ymir", true, None::<&str>)` — brings window to front
      - `PredefinedMenuItem::separator()` — visual separator
      - `MenuItem::with_id("quit", "Quit", true, None::<&str>)` — exits application
    - Handle tray events in `on_tray_icon_event`:
      - `TrayIconEvent::Click` (left click, non-menu): toggle window visibility
        - If window is visible: `window.hide()`
        - If window is hidden: `window.show(); window.set_focus()`
      - `TrayIconEvent::DoubleClick`: always show and focus window
    - Handle menu events in `on_menu_event`:
      - `"show"` → `window.show(); window.set_focus()`
      - `"quit"` → `app.exit(0)`
    - Keep tray icon alive when window is closed (prevent app exit on window close if tray is active)
  - Create frontend helper `apps/web/src/lib/tauri.ts`:
    - `const isTauri = typeof window.__TAURI__ !== 'undefined';`
    - `export async function revealInFileManager(path: string): Promise<void>`:
      - If Tauri: `await invoke('reveal_in_file_manager', { path })`
      - If web: `window.open('file://' + path, '_blank')` (limited, browser security restrictions)
    - `export async function copyToClipboard(text: string): Promise<void>`:
      - If Tauri: `await invoke('copy_to_clipboard', { text })`
      - If web: `await navigator.clipboard.writeText(text)`
    - `export async function showNotification(title: string, body: string): Promise<void>`:
      - If Tauri: `await invoke('show_notification', { title, body })`
      - If web: `new Notification(title, { body })` (with permission check)
    - `export async function pickDirectory(): Promise<string | null>`:
      - If Tauri: `await invoke('pick_directory')`
      - If web: show manual text input dialog (no native directory picker in browser)
  - Wire up context menu items from T16:
    - Worktree context menu "Open in File Manager" → `revealInFileManager(worktreePath)`
    - Worktree context menu "Copy Path" → `copyToClipboard(worktreePath)`
    - All Files file context menu "Copy Path" → `copyToClipboard(filePath)`
  - Wire up notifications from T33:
    - Agent crash → `showNotification("Agent Crashed", "Agent '{name}' has stopped")`
    - PR created (from T23) → `showNotification("PR Created", "Pull request created: {url}")`
    - Merge complete (from T28) → `showNotification("Merge Complete", "Branch merged successfully")`
  - Add window close behavior:
    - When user clicks X on window: hide to tray instead of quitting (if tray is active)
    - Add "Quit" option to tray menu for actual exit
  - Write unit tests for: Tauri detection, fallback functions, command registration

  **Must NOT do**:
  - Do not implement auto-update functionality
  - Do not add deep linking or custom protocol handlers
  - Do not add global keyboard shortcuts (excluded from scope)
  - Do not implement multi-window support
  - Do not implement drag-and-drop file upload

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 6 (with T35, T37-T39)
  - **Blocks**: —
  - **Blocked By**: T35

  **References**:
  - `https://v2.tauri.app/features/system-tray/` — Tauri v2 system tray documentation
  - `https://v2.tauri.app/features/notifications/` — Tauri v2 notification plugin
  - `https://v2.tauri.app/features/dialog/` — Tauri v2 dialog plugin
  - `https://v2.tauri.app/features/clipboard/` — Tauri v2 clipboard manager plugin
  - `https://v2.tauri.app/features/shell/` — Tauri v2 shell/open functionality
  - `https://v2.tauri.app/reference/javascript/api/namespacecore/` — Tauri v2 JS API reference
  - `apps/tauri/src-tauri/src/lib.rs` — Current Tauri lib.rs (from T35)
  - `apps/tauri/src-tauri/Cargo.toml` — Current dependencies (needs new plugins)
  - Task T16 output — Context menu items that trigger Tauri commands
  - Task T23 output — PR creation dialog (notification on success)
  - Task T28 output — Merge dialog (notification on success)
  - Task T33 output — Error recovery (notification on agent crash)
  - Task T35 output — Tauri config and capabilities setup

  **Acceptance Criteria**:
  - [ ] "Open in File Manager" opens OS file manager at worktree path (macOS Finder, Windows Explorer, Linux file manager)
  - [ ] "Copy Path" copies path to system clipboard and works across apps
  - [ ] Native notifications appear for agent crash, PR created, merge complete
  - [ ] Directory picker opens native OS dialog for workspace root path selection
  - [ ] System tray icon visible in menu bar (macOS) or system tray (Windows/Linux)
  - [ ] Tray menu shows "Show Ymir" and "Quit" with separator
  - [ ] Left-click tray icon toggles window visibility
  - [ ] Double-click tray icon shows and focuses window
  - [ ] Window X button hides to tray (does not quit)
  - [ ] Frontend `isTauri` detection works correctly
  - [ ] All functions gracefully fall back in web mode
  - [ ] Unit tests pass for Tauri detection and fallback behavior

  **QA Scenarios (MANDATORY)**:
  ```
  Scenario: Native file manager opens
    Tool: Playwright (Tauri context)
    Preconditions: Tauri dev mode running, worktree exists
    Steps:
      1. Right-click worktree in sidebar
      2. Click "Open in File Manager" in context menu
      3. Assert OS file manager window opens
      4. Assert file manager shows worktree directory contents
    Expected Result: File manager opens at correct path
    Evidence: .sisyphus/evidence/task-36-file-manager.png

  Scenario: Copy path to clipboard
    Tool: Playwright (Tauri context)
    Steps:
      1. Right-click worktree → "Copy Path"
      2. Open a text editor (or use clipboard read API)
      3. Paste
      4. Assert pasted text matches worktree path
    Expected Result: Path copied correctly
    Evidence: .sisyphus/evidence/task-36-clipboard.txt

  Scenario: System tray works
    Tool: Bash (manual verification instructions)
    Steps:
      1. Assert Ymir icon visible in system tray/menu bar
      2. Right-click tray icon
      3. Assert menu shows "Show Ymir" and "Quit" with separator
      4. Click window X button
      5. Assert window hides (not quits) — app still running in tray
      6. Left-click tray icon
      7. Assert window reappears
    Expected Result: Tray behavior correct
    Evidence: .sisyphus/evidence/task-36-tray.txt

  Scenario: Web fallbacks work
    Tool: Playwright (web mode, not Tauri)
    Preconditions: dev server at localhost:5173
    Steps:
      1. Open app in browser (not Tauri window)
      2. Trigger copyToClipboard("test-path")
      3. Assert navigator.clipboard.writeText called
      4. Assert no Tauri-specific errors in console
    Expected Result: Graceful degradation in browser
    Evidence: .sisyphus/evidence/task-36-web-fallback.txt
  ```

  **Commit**: YES (groups with T35)
  - Message: `feat(tauri): system tray, IPC commands, notifications, and native integrations`

---

- [ ] 37. Skeleton Loading States

  **What to do**:
  - Create `apps/web/src/components/ui/Skeleton.tsx` — reusable skeleton component:
    - Props: `{ width?: string, height?: string, variant?: 'text' | 'circular' | 'rectangular', className?: string }`
    - Base div with CSS: default `width: 100%`, `height: 1em`, `border-radius: 4px`
    - Variants: text (1em height, rounded), circular (border-radius 50%, for icons), rectangular (no radius, for cards)
    - Shimmer animation (pure CSS):
      - `background: linear-gradient(90deg, hsl(var(--muted)) 25%, hsl(var(--muted) / 0.6) 50%, hsl(var(--muted)) 75%)`
      - `background-size: 200% 100%`
      - `@keyframes shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }`
      - `animation: shimmer 1.5s ease-in-out infinite`
  - Create `apps/web/src/components/sidebar/SidebarSkeleton.tsx`:
    - 3 workspace headers: circular icon (24x24) + text (60% width, 16px) + status summary (40% width, 12px)
    - Each with 2-3 worktree placeholders: dot (8x8 circular) + text (80% width, 14px, indented 16px)
    - Total: ~9-12 skeleton elements
  - Create `apps/web/src/components/agent/AgentSkeleton.tsx`:
    - Tab bar: 1 rectangular tab (100px, 28px)
    - Input box: full width rectangular (40px height, rounded)
    - Message area: 4-5 text lines (90%, 75%, 85%, 50% widths, 14px height, 8px gap)
    - Tip area: 60% width, 12px height
  - Create `apps/web/src/components/terminal/TerminalSkeleton.tsx`:
    - Dark background: `var(--terminal-bg)`
    - Tab bar: 1 tab placeholder (80px, 28px)
    - Terminal: 10-12 green-tinted lines using `hsl(var(--status-working) / 0.15)` base, varying widths (100%, 80%, 60%, 90%...), 13px height, 3px gap
  - Create `apps/web/src/components/editor/EditorSkeleton.tsx`:
    - Left column (line numbers): narrow skeleton (30px width) with 15 small placeholders (10px each)
    - Right column (code): 15 lines with varying widths and indentation (80% indented 16px, 60% indented 32px, 90% no indent...)
    - Background: `hsl(var(--background))`
  - Create `apps/web/src/components/project/ProjectSkeleton.tsx`:
    - Tab bar: 2 tab placeholders (70px each, left-aligned)
    - Toolbar: 2 button skeletons (60px, right-aligned)
    - File list: 6 entries: icon (16x16 circular) + text (varying: 70%, 85%, 60%...), 20px height
  - Trigger logic in Zustand: `loading: { workspaces: boolean, worktree: boolean, file: boolean }`
    - Initial load: all skeletons until StateSnapshot received
    - Worktree switch: sidebar + main + project skeletons until new state
    - File open: editor skeleton until FileContent received
  - Transition: skeleton opacity 1→0 (200ms), content opacity 0→1 (200ms, staggered 50ms per element), CSS transitions only
  - Write unit tests for: rendering with different props, variant styles, animation CSS

  **Must NOT do**:
  - Do not add skeleton for real-time data (agent output, terminal output)
  - Do not add skeleton for dialogs (PR, settings, alert)
  - Do not make skeletons interactive (no hover, click, purely visual)
  - Do not add loading progress indicators or percentage
  - Do not add skeleton for WebSocket connection (status bar handles this)

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 6 (with T35, T36, T38, T39)
  - **Blocks**: —
  - **Blocked By**: T9

  **References**:
  - Task T10 output — CSS theme variables (--muted, --accent, --status-working, --terminal-bg, --background)
  - Task T15 output — Sidebar workspace/worktree tree structure
  - Task T21 output — Agent pane layout (tabs + input + messages)
  - Task T26 output — Project panel layout (tabs + toolbar + file list)
  - Task T24 output — Monaco editor layout (line numbers + code area)
  - Task T18 output — Terminal layout

  **Acceptance Criteria**:
  - [ ] Skeleton component renders text, circular, rectangular variants
  - [ ] Shimmer animation CSS-only, smooth (no JS animation loops)
  - [ ] Sidebar skeleton matches workspace/worktree layout
  - [ ] Agent skeleton matches agent pane layout
  - [ ] Terminal skeleton has green-tinted text lines
  - [ ] Editor skeleton has line numbers column + code area with indentation
  - [ ] Project skeleton has tab bar + toolbar + file list
  - [ ] Skeletons fade out on data arrival (200ms)
  - [ ] Loading state tracked in Zustand
  - [ ] No skeletons for real-time data
  - [ ] Unit tests pass

  **QA Scenarios (MANDATORY)**:
  ```
  Scenario: Skeleton displays during initial load
    Tool: Playwright
    Preconditions: dev server, slow network (throttle 3G)
    Steps:
      1. Navigate to http://localhost:5173
      2. Immediately screenshot (before data)
      3. Assert shimmer in sidebar, main, project areas
      4. Wait for StateSnapshot
      5. Assert skeletons fade out
      6. Assert real content fades in
    Expected Result: Skeleton loading smooth
    Evidence: .sisyphus/evidence/task-37-skeleton-load.png

  Scenario: Terminal skeleton is green-tinted
    Tool: Playwright
    Steps:
      1. Navigate before data loads
      2. Get background-color of terminal skeleton lines
      3. Assert green component higher than red or blue
    Expected Result: Green tint present
    Evidence: .sisyphus/evidence/task-37-terminal-green.txt

  Scenario: Editor skeleton matches Monaco layout
    Tool: Playwright
    Steps:
      1. Click file (slow network)
      2. Assert narrow left column skeleton (line numbers)
      3. Assert wide right column skeleton (code)
      4. Assert varying indentation in right column
    Expected Result: Editor skeleton correct
    Evidence: .sisyphus/evidence/task-37-editor.png
  ```

  **Commit**: YES (groups with T35, T36)
  - Message: `feat(web): skeleton loading states with shimmer animation for all panels`

---

- [ ] 38. Activity Logging Throughout

  **What to do**:
  - Add `tracing` crate to `crates/ws-server/Cargo.toml`:
    - `tracing = "0.1"`, `tracing-subscriber = { version = "0.3", features = ["json", "env-filter"] }`, `tracing-appender = "0.2"`
  - Configure tracing subscriber in `crates/ws-server/src/main.rs`:
    - JSON format output for structured logging (parseable by log aggregators)
    - Environment filter: `RUST_LOG=ymir=info` by default, override with env var
    - Dual output: stdout (for CLI) + custom writer that batches to Turso `activity_log` table
  - Create `crates/ws-server/src/logging.rs`:
    - `ActivityLogger` struct:
      - `buffer: Arc<Mutex<Vec<LogEntry>>>` — batch buffer
      - `db: Arc<Db>` — Turso connection
      - `flush_interval: Duration` — 1 second
      - `max_buffer_size: usize` — 100 entries
    - `LogEntry` struct: timestamp (DateTime<Utc>), level (info/warn/error), source (module name), message, metadata_json (optional)
    - `ActivityLogger::log(level, source, message, metadata)` — push to buffer, flush if buffer full
    - `ActivityLogger::flush()` — batch insert all buffered entries to activity_log table, clear buffer
    - Background Tokio task: tick every 1 second, call flush if buffer non-empty
    - Implement `tracing::Layer` trait to intercept tracing events and forward to ActivityLogger
    - Prevent infinite recursion: do NOT log the logging operation itself (filter out logging.rs events)
  - Add `#[tracing::instrument]` spans to all critical functions:
    - WebSocket: `#[instrument(skip(self), fields(client_id = %client_id))]` on connection handler, message dispatcher
    - Workspace: `#[instrument(skip(db), fields(workspace_id = %id))]` on create, delete, rename, update
    - Worktree: `#[instrument(skip(db, git), fields(worktree_id = %id))]` on create, delete, merge, list
    - Agent: `#[instrument(skip(acp), fields(agent_type = %agent_type, worktree_id = %id))]` on spawn, send, cancel, kill
    - PTY: `#[instrument(skip(manager), fields(session_id = %id))]` on create, write, resize, kill
    - Git: `#[instrument(skip(ops), fields(worktree_id = %id, operation = %op))]` on status, diff, commit, merge, create_pr
    - File watcher: `#[instrument(skip(watcher), fields(path = %path))]` on watch, unwatch, lock, unlock
    - Database: `#[instrument(skip(db), fields(table = %table))]` on CRUD operations
  - Add `tracing::info!` for normal operations:
    - "workspace created", "workspace deleted", "workspace renamed"
    - "worktree created", "worktree deleted", "worktree merged"
    - "agent spawned", "agent status changed to working/waiting/idle", "agent killed"
    - "terminal created", "terminal killed"
    - "git status completed", "git diff completed", "git commit created", "PR created", "merge completed"
    - "file watcher started", "file watcher event received"
    - "client connected", "client disconnected"
  - Add `tracing::warn!` for recoverable issues:
    - "terminal crashed, restarting", "agent timeout", "file watcher missed event"
    - "reconnect attempt N", "debounce applied to N events"
  - Add `tracing::error!` for failures:
    - "git operation failed: {error}", "database error: {error}", "agent crash: {reason}"
    - "PTY spawn failed: {error}", "file watcher error: {error}"
  - Log filtering rules:
    - DO log: all lifecycle events, all errors, all state transitions
    - DO NOT log: file contents, terminal output, WebSocket message payloads, credentials, API keys
    - DO NOT log: per-key-press terminal input (only session-level events)
  - Create optional debug panel `apps/web/src/components/debug/ActivityLog.tsx`:
    - Only visible in development mode (`import.meta.env.DEV`)
    - Toggled with Ctrl+Shift+L (add to document keydown listener, only in dev)
    - Fixed position overlay: bottom-right, 400x300px, scrollable
    - Shows last 100 log entries from Turso (fetched via WebSocket LogQuery message)
    - Each entry: timestamp, level-colored dot (info=blue, warn=yellow, error=red), source, message
    - Auto-scroll to bottom on new entries
    - Close button (×) or Ctrl+Shift+L to dismiss
  - Write unit tests for: log entry creation, batch flush triggers, buffer overflow, Turso insert, recursion prevention

  **Must NOT do**:
  - Do not log sensitive data (file contents, credentials, API keys, environment variables with secrets)
  - Do not log PTY output content (only PTY lifecycle events)
  - Do not implement log rotation (Turso table has no size limit for MVP)
  - Do not implement log export/download functionality
  - Do not add remote logging (local Turso only)
  - Do not log WebSocket binary payloads (only message types and metadata)

  **Recommended Agent Profile**:
  - **Category**: `deep`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 6 (with T35-T37, T39)
  - **Blocks**: —
  - **Blocked By**: T4, T7

  **References**:
  - `https://docs.rs/tracing/latest/tracing/` — tracing crate API
  - `https://docs.rs/tracing/latest/tracing/attr.instrument.html` — #[instrument] macro
  - `https://docs.rs/tracing-subscriber/latest/tracing_subscriber/` — subscriber setup, JSON format, env filter
  - `https://docs.rs/tracing-subscriber/latest/tracing_subscriber/fmt/struct.Layer.html` — custom Layer implementation
  - `ARCHITECTURE.md:106` — Planned events.rs module
  - Task T4 output — activity_log table schema (id, timestamp, level, source, message, metadata_json)
  - Task T7 output — AppState structure where ActivityLogger will be a field
  - Task T11-T14, T20, T12 output — Handler functions to instrument

  **Acceptance Criteria**:
  - [ ] All WebSocket connections logged with client_id
  - [ ] All message types logged with handler execution
  - [ ] All CRUD operations logged (workspace, worktree, agent, terminal)
  - [ ] All git operations logged (status, diff, commit, merge, PR)
  - [ ] All errors logged with error level and error details
  - [ ] Logs written to both stdout (JSON format) and Turso activity_log table
  - [ ] Batch flush triggers at 100 entries OR 1 second interval
  - [ ] No infinite recursion (logging.rs events filtered out)
  - [ ] Sensitive data NOT logged (verified by searching log output for file contents, credentials)
  - [ ] Debug panel shows recent logs in development mode
  - [ ] Debug panel hidden in production mode
  - [ ] Ctrl+Shift+L toggles debug panel
  - [ ] Unit tests pass for logging, flushing, and recursion prevention

  **QA Scenarios (MANDATORY)**:
  ```
  Scenario: Activity logging works end-to-end
    Tool: Bash (cargo test)
    Steps:
      1. Run: cargo test -p ws-server test_activity_logging
      2. Assert exit code 0
      3. Assert output contains "log_entry_created ... ok"
      4. Assert output contains "batch_flush ... ok"
      5. Assert output contains "turso_insert ... ok"
      6. Assert output contains "no_infinite_recursion ... ok"
    Expected Result: All logging tests pass
    Evidence: .sisyphus/evidence/task-38-logging-tests.txt

  Scenario: Logs appear in stdout as JSON
    Tool: Bash
    Preconditions: ws-server running with RUST_LOG=ymir=info
    Steps:
      1. Run: cargo run -p ws-server 2>&1 | head -20
      2. Create a workspace via WebSocket
      3. Assert stdout contains JSON log with "workspace created" message
      4. Assert log has fields: timestamp, level, source, message
    Expected Result: JSON logs visible in stdout
    Evidence: .sisyphus/evidence/task-38-json-logs.txt

  Scenario: Debug panel shows logs
    Tool: Playwright
    Preconditions: dev mode running
    Steps:
      1. Press Ctrl+Shift+L
      2. Assert debug panel appears (bottom-right overlay)
      3. Create a workspace
      4. Assert "workspace created" entry appears in panel
      5. Assert entry has blue dot (info level)
      6. Press Ctrl+Shift+L again
      7. Assert panel disappears
    Expected Result: Debug panel works
    Evidence: .sisyphus/evidence/task-38-debug-panel.png

  Scenario: Sensitive data not logged
    Tool: Bash (cargo test)
    Steps:
      1. Run: cargo test -p ws-server test_no_sensitive_logging
      2. Assert output contains "no_file_contents_logged ... ok"
      3. Assert output contains "no_credentials_logged ... ok"
    Expected Result: Sensitive data filtered
    Evidence: .sisyphus/evidence/task-38-sensitive.txt
  ```

  **Commit**: YES (groups with T35-T37, T39)
  - Message: `feat: structured activity logging with tracing, Turso persistence, and debug panel`
  - Optional debug panel (Ctrl+Shift+L, dev mode only)
  - No sensitive data in logs

  **Must NOT do**: No log rotation, no remote logging, no PTY output content logging

  **Recommended Agent Profile**: `deep` | **Skills**: []
  **Parallelization**: Wave 6 | **Blocks**: — | **Blocked By**: T4, T7
  **Commit**: `feat: structured activity logging with tracing and Turso persistence`

---

- [ ] 39. CLI Serve/Kill Commands

  **What to do**:
  - Update `crates/cli/src/main.rs` with full command implementations using `clap`:
    - Define CLI structure with `#[derive(Parser)]`:
      - `#[command(name = "ymir", about = "Worktree/agent orchestrator", version = "0.1.0")]`
      - `#[command(subcommand)]` on `command: Commands` enum
      - Commands enum: `Serve(ServeArgs)`, `Kill`, `Config`, `Status`
  - Implement `ymir serve` (`ServeArgs` struct with `--dev` flag, `--port` override):
    - Port conflict detection:
      - Attempt TCP connect to `127.0.0.1:7319` — if succeeds, port in use
      - Attempt TCP connect to `127.0.0.1:5173` — if succeeds, port in use
      - If either in use: print error "Port {port} already in use. Run 'ymir kill' first or use --port to override." and exit with code 1
    - Spawn ws-server as child process:
      - `Command::new("cargo").args(["run", "-p", "ws-server", "--release"])`
      - Pipe stdout/stderr to parent's stdout/stderr (inherit)
      - Capture child process handle for management
    - In `--dev` mode: also spawn vite dev server:
      - `Command::new("npm").args(["run", "dev"]).current_dir("apps/web")`
      - Pipe stdout/stderr to parent
    - In production mode (no `--dev`): ws-server serves static files from `apps/web/dist/`
    - Print startup banner:
      ```
      ╔═══════════════════════════════════════════╗
      ║  Ymir v0.1.0 — Worktree Orchestrator     ║
      ╠═══════════════════════════════════════════╣
      ║  WebSocket: ws://localhost:7319            ║
      ║  Web UI:    http://localhost:5173          ║
      ║  Database:  ~/.ymir/ymir.db                ║
      ║  Press Ctrl+C to stop                     ║
      ╚═══════════════════════════════════════════╝
      ```
    - Wait for Ctrl-C signal using `tokio::signal::ctrl_c()`:
      - On Ctrl-C: print "Shutting down..."
      - Send SIGTERM to all child processes (ws-server, vite if dev mode)
      - Wait for each child to exit (with 5 second timeout, then SIGKILL)
      - Print "ymir stopped"
      - Exit with code 0
    - Handle child process crashes:
      - If ws-server exits unexpectedly: kill vite (if running), print error, exit with code 1
      - If vite exits unexpectedly: kill ws-server, print error, exit with code 1
      - Monitor child processes with `tokio::spawn` + `child.wait()`
    - `--port` override: set environment variable `YMIR_PORT` for ws-server to read instead of hardcoded 7319
  - Implement `ymir kill`:
    - Use `std::process::Command::new("fuser").args(["-k", "7319/tcp", "5173/tcp"])`:
      - On Linux: `fuser -k` works
      - On macOS: `lsof -ti:7319 | xargs kill`, `lsof -ti:5173 | xargs kill`
      - On Windows: `netstat -ano | findstr :7319` then `taskkill /PID {pid} /F`
      - Detect OS with `cfg!(target_os)` and use appropriate command
    - Print result:
      - "Killed processes on ports 7319 and 5173" (if processes found)
      - "No processes found on ymir ports" (if nothing to kill)
    - Exit with code 0
  - Implement `ymir config`:
    - Print current configuration:
      ```
      Ymir Configuration
      ─────────────────────────────────────────
      Version:           0.1.0
      WebSocket Port:    7319 (override: YMIR_PORT env)
      Vite Proxy Port:   5173
      Database Path:     ~/.ymir/ymir.db
      Log Level:         info (override: RUST_LOG env)
      Config File:       ~/.ymir/config.toml (not yet implemented)
      ```
    - Read from environment variables where applicable (YMIR_PORT, RUST_LOG, DATABASE_URL)
    - Print default values if env vars not set
  - Implement `ymir status`:
    - Attempt TCP connect to `127.0.0.1:7319`:
      - If connects: print "ymir: running (WebSocket on :7319, Web UI on :5173)"
      - If fails: print "ymir: stopped"
    - If running, also send HTTP GET to `/health` and print response
    - Exit with code 0 if running, code 1 if stopped
  - Implement `ymir doctor` (bonus diagnostic command):
    - Check: Rust version (`rustc --version`), Node version (`node --version`), npm version (`npm --version`), git version (`git --version`), gh CLI installed (`gh --version`)
    - Check: ports 7319 and 5173 availability
    - Check: ~/.ymir/ directory exists, database file exists and is valid
    - Print pass/fail for each check with ✓ or ✗
  - Update root `Makefile`:
    - `make debug`: `cargo run -p cli -- kill; cargo build -p cli; cd apps/web && npm install && npm run build; cargo run -p cli -- serve --dev`
    - `make build-prod`: `cd apps/web && npm run build && cargo build -p cli --release && cargo build -p ws-server --release`
    - `make install-prod`: `make build-prod; cp target/release/ymir /usr/local/bin/; cp target/release/ws-server /usr/local/bin/`
  - Write unit tests for: port checking, OS detection for kill, config output, status detection

  **Must NOT do**:
  - Do not implement background daemon mode (foreground only for MVP)
  - Do not implement configuration file loading (YAML/TOML config files)
  - Do not implement plugin loading system
  - Do not implement remote server management
  - Do not implement automatic updates for ymir binary itself
  - Do not implement multi-instance management

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 6 (with T35-T38)
  - **Blocks**: —
  - **Blocked By**: T7

  **References**:
  - `crates/cli/src/main.rs` — Current CLI skeleton with Commands enum (Serve, Kill, Config)
  - `crates/cli/Cargo.toml` — Current dependencies (clap = { features = ["derive"] }, tokio, anyhow, tracing)
  - `Cargo.toml` — Workspace root with cli and ws-server members
  - `Makefile` — Current build targets (make debug, make build-prod, make install-prod)
  - `ARCHITECTURE.md:53-73` — Planned CLI structure with serve/kill/config
  - `https://docs.rs/clap/latest/clap/derive/index.html` — Clap derive macros
  - `https://docs.rs/tokio/latest/tokio/signal/fn.ctrl_c.html` — Tokio Ctrl-C signal handling
  - Task T7 output — ws-server binary name and startup behavior

  **Acceptance Criteria**:
  - [ ] `ymir serve` starts ws-server process and prints startup banner
  - [ ] `ymir serve --dev` starts both ws-server and vite dev server
  - [ ] Ctrl-C gracefully shuts down both servers with "ymir stopped" message
  - [ ] Port conflict detection prevents double-start (prints error, exits code 1)
  - [ ] `ymir kill` kills processes on ports 7319 and 5173
  - [ ] `ymir kill` handles case where no processes are running
  - [ ] `ymir config` prints all configuration values correctly
  - [ ] `ymir status` correctly reports running/stopped
  - [ ] `ymir doctor` shows diagnostic pass/fail
  - [ ] Child process crash detected and causes parent to exit with error
  - [ ] Help text (`ymir --help`) is clear and descriptive
  - [ ] Unit tests pass for port checking and OS detection

  **QA Scenarios (MANDATORY)**:
  ```
  Scenario: ymir serve starts servers
    Tool: Bash
    Steps:
      1. Run: cargo run -p cli -- serve --dev
      2. Wait for startup banner
      3. Assert banner contains "WebSocket: ws://localhost:7319"
      4. Assert banner contains "Web UI: http://localhost:5173"
      5. Run: curl -s http://localhost:7319/health
      6. Assert response contains "ok"
      7. Press Ctrl-C
      8. Assert "Shutting down..." prints
      9. Assert "ymir stopped" prints
      10. Assert exit code 0
    Expected Result: Full serve lifecycle works
    Evidence: .sisyphus/evidence/task-39-serve.txt

  Scenario: Port conflict detection
    Tool: Bash
    Preconditions: ws-server already running on :7319
    Steps:
      1. Run: cargo run -p cli -- serve
      2. Assert error message contains "Port 7319 already in use"
      3. Assert error message contains "Run 'ymir kill' first"
      4. Assert exit code 1
    Expected Result: Conflict detected and reported
    Evidence: .sisyphus/evidence/task-39-conflict.txt

  Scenario: ymir kill works
    Tool: Bash
    Preconditions: ymir serve running
    Steps:
      1. Run: cargo run -p cli -- kill
      2. Assert "Killed processes on ports 7319 and 5173" prints
      3. Run: curl -s http://localhost:7319/health
      4. Assert connection refused (exit code 7)
    Expected Result: Kill works correctly
    Evidence: .sisyphus/evidence/task-39-kill.txt

  Scenario: ymir config prints settings
    Tool: Bash
    Steps:
      1. Run: cargo run -p cli -- config
      2. Assert output contains "WebSocket Port: 7319"
      3. Assert output contains "Vite Proxy Port: 5173"
      4. Assert output contains "Database Path:"
      5. Assert output contains "Version: 0.1.0"
    Expected Result: Config printed correctly
    Evidence: .sisyphus/evidence/task-39-config.txt

  Scenario: ymir status detects running
    Tool: Bash
    Preconditions: ymir serve running
    Steps:
      1. Run: cargo run -p cli -- status
      2. Assert output contains "ymir: running"
      3. Assert exit code 0
    Precondition: Stop ymir
    Steps:
      1. Run: cargo run -p cli -- status
      2. Assert output contains "ymir: stopped"
      3. Assert exit code 1
    Expected Result: Status detection works
    Evidence: .sisyphus/evidence/task-39-status.txt
  ```

  **Commit**: YES (groups with T35-T38)
  - Message: `feat(cli): serve, kill, config, status, and doctor commands with signal handling`

---

## Final Verification Wave (MANDATORY — after ALL implementation tasks)

> 4 review agents run in PARALLEL. ALL must APPROVE.

- [ ] F1. **Plan Compliance Audit** — `oracle`
  Read the plan end-to-end. For each "Must Have": verify implementation exists. For each "Must NOT Have": search codebase for forbidden patterns. Check evidence files exist. Compare deliverables against plan.
  Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [ ] F2. **Code Quality Review** — `unspecified-high`
  Run `cargo clippy`, `cargo test`, `vitest`, `tsc --noEmit`. Review for `as any`, empty catches, console.log in prod, commented-out code, unused imports, AI slop patterns.
  Output: `Build [PASS/FAIL] | Lint [PASS/FAIL] | Tests [N pass/N fail] | Files [N clean/N issues] | VERDICT`

- [ ] F3. **Real Manual QA** — `unspecified-high`
  Execute every QA scenario. Test cross-task integration. Test edge cases: empty workspace, no changes, 50 worktrees, rapid switching.
  Output: `Scenarios [N/N pass] | Integration [N/N] | Edge Cases [N tested] | VERDICT`

- [ ] F4. **Scope Fidelity Check** — `deep`
  For each task: read spec, read diff. Verify 1:1 mapping. Check "Must NOT do" compliance. Detect cross-task contamination.
  Output: `Tasks [N/N compliant] | Contamination [CLEAN/N] | Unaccounted [CLEAN/N] | VERDICT`

---

## Commit Strategy

| Commit | Message | Key Files |
|--------|---------|-----------|
| 1 | `feat(ws): MessagePack protocol types + WebSocket server core` | crates/ws-server/src/ |
| 2 | `feat(ws): PTY session manager` | crates/ws-server/src/pty/ |
| 3 | `feat(ws): ACP client for agent management` | crates/ws-server/src/agent/ |
| 4 | `feat(ws): workspace, worktree, and git modules` | crates/ws-server/src/{workspace,worktree,git}/ |
| 5 | `feat(web): app shell, theme, and 3-panel layout` | apps/web/src/{App,components/layout,styles}/ |
| 6 | `feat(web): sidebar with workspace/worktree tree` | apps/web/src/components/sidebar/ |
| 7 | `feat(web): ghostty-web terminal component` | apps/web/src/components/terminal/ |
| 8 | `feat(web): agent pane with ACP status` | apps/web/src/components/agent/ |
| 9 | `feat(web): project panel with git changes + Monaco` | apps/web/src/components/project/ |
| 10 | `feat(web): PR creation + merge workflow dialogs` | apps/web/src/components/dialogs/ |
| 11 | `feat(tauri): desktop wrapper + native features` | apps/tauri/ |
| 12 | `chore: activity logging + error recovery + polish` | crates/, apps/ |

---

## Success Criteria

### Verification Commands
```bash
# Rust backend
cargo build --workspace          # Expected: compiles with 0 errors
cargo test --workspace           # Expected: all unit tests pass
cargo clippy --workspace -- -D warnings  # Expected: no warnings

# Frontend
cd apps/web && npm run build     # Expected: builds with 0 errors
cd apps/web && npx vitest run    # Expected: all unit tests pass

# Integration
ymir serve                       # Expected: starts on :7319, vite on :5173
curl -s http://localhost:7319/health  # Expected: {"status":"ok"}
```

### Final Checklist
- [ ] All "Must Have" present
- [ ] All "Must NOT Have" absent
- [ ] All unit tests pass
- [ ] ghostty-web terminals render and accept input
- [ ] ACP agents can be spawned and status updates stream
- [ ] Git worktrees can be created and listed
- [ ] Monaco editor opens and edits files
- [ ] Diff viewer shows git changes
- [ ] PR dialog creates PR via gh CLI
- [ ] Merge dialog merges and optionally deletes worktree
- [ ] Panels resize and persist sizes
- [ ] WebSocket reconnects after disconnect
