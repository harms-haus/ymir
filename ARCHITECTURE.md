# ymir — Architecture

## Overview

ymir is an agent composer with workspaces. It tracks git worktrees, spawns PTY sessions to run coding agents, and provides a unified UI for managing agent workflows. The architecture follows a hub-and-spoke model: a single WebSocket server acts as the source of truth, and all clients (web UI, Tauri desktop, CLI) communicate through it.

## Communication Flow

```
┌─────────────┐     ws://7319     ┌──────────────┐
│  Tauri App  │ ◄──────────────► │              │
│  (desktop)  │                   │  ws-server   │
└─────────────┘                   │  :7319       │
                                  │              │
┌─────────────┐     ws://7319     │  source of   │
│  Vite React │ ◄──────────────► │  truth       │
│  web :5173  │                   │              │
└─────────────┘                   └──────────────┘
                                          ▲
┌─────────────┐                   ┌───────┘
│  CLI        │ ◄─ spawns ─────── │  PTY sessions
│  ymir       │                   │  agent processes
└─────────────┘                   └──────────────┘
```

- Port **7319** — WebSocket server, the core communication hub
- Port **5173** — Vite dev server (proxied through ws-server in production)

---

## Directory Layout

```
ymir/
├── Makefile
├── Cargo.toml                  # Rust workspace root
├── .gitignore
│
├── crates/
│   ├── cli/                    # The `ymir` CLI binary
│   └── ws-server/              # WebSocket server binary + library
│
└── apps/
    ├── web/                    # Vite + React frontend
    └── tauri/                  # Tauri v2 desktop shell
```

---

## `crates/` — Rust Backend

### `crates/cli/`

The `ymir` binary. Entry point for the user.

**What lives here:**

| Path | Purpose |
|---|---|
| `src/main.rs` | CLI entry point. Uses `clap` with subcommands. |
| `src/main.rs` → `Commands::Serve` | Spawns ws-server and vite dev server as child processes, waits for Ctrl-C, then kills them. |
| `src/main.rs` → `Commands::Kill` | Kills processes on ports 7319 and 5173 via `fuser -k`. |
| `src/main.rs` → `Commands::Config` | Prints current port configuration. |

**Future additions:**

- `src/workspace.rs` — Workspace management (create, list, switch, delete)
- `src/worktree.rs` — Git worktree operations (create, list, track, clean up)
- `src/pty.rs` — PTY session spawning and management
- `src/agent.rs` — Agent lifecycle (spawn, attach, send commands, kill)
- `src/commands/` — Subcommand implementations split into modules
- `src/config.rs` — Config file loading (`~/.config/ymir/config.toml`)
- `src/client.rs` — WebSocket client to communicate with ws-server

---

### `crates/ws-server/`

The WebSocket server. This is the source of truth for the entire system.

**What lives here:**

| Path | Purpose |
|---|---|
| `src/main.rs` | Binds TCP listener on port 7319, accepts connections. |
| `src/lib.rs` | Re-exports constants (`DEFAULT_PORT`, `VITE_PROXY_PORT`). |

**Future additions:**

- `src/server.rs` — WebSocket upgrade and connection management (use `axum` or `tokio-tungstenite`)
- `src/router.rs` — Message routing by type (workspace, worktree, agent, terminal, git)
- `src/state.rs` — Shared application state (`Arc<AppState>`), in-memory workspace registry
- `src/hub.rs` — Client connection hub (broadcast, targeted sends, presence tracking)
- `src/protocol.rs` — Message types, serialization, validation for the WebSocket protocol
- `src/workspace/` — Workspace CRUD, state persistence
- `src/worktree/` — Git worktree tracking, branch management, PR workflows
- `src/pty/` — PTY session management on the host machine
  - `manager.rs` — Spawns/kills PTY sessions, multiplexes I/O
  - `session.rs` — Single PTY session abstraction
- `src/agent/` — Coding agent orchestration
  - `spawner.rs` — Launches agent processes (potentially via ACP)
  - `registry.rs` — Tracks running agents, their worktrees, sessions
- `src/git/` — Git operations (status, diff, commit, PR creation)
- `src/proxy.rs` — Reverse proxy for Vite dev server in production mode
- `src/persistence/` — Disk persistence for workspace state (SQLite or JSON files)
- `src/events.rs` — Event bus for internal pub/sub between modules

---

## Cross-Language Type Safety with ts-rs

The protocol types in `crates/ws-server/src/protocol.rs` are shared between Rust (server) and TypeScript (client). We use [ts-rs](https://github.com/Aleph-Alpha/ts-rs) to generate TypeScript interfaces from Rust structs, ensuring type definitions stay synchronized across the stack.

### Setup

ts-rs is added as a dev-dependency in `crates/ws-server/Cargo.toml`:

```toml
[dev-dependencies]
ts-rs = { version = "10.0", features = ["serde-compat"] }
```

### Derive Macro Pattern

Each protocol struct derives `ts_rs::TS` and uses the `#[ts(export)]` attribute to generate TypeScript bindings:

```rust
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, ts_rs::TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct AgentSpawn {
    #[ts(type = "string")]  // Uuid -> string in TypeScript
    pub worktree_id: Uuid,
    pub agent_type: String,
}
```

Key attributes:

- `#[ts(export)]` - Generates a `.ts` file for this type
- `#[ts(type = "string")]` - Required for `Uuid` fields (TypeScript has no UUID type)
- `#[serde(rename_all = "camelCase")]` - Ensures field names match TypeScript conventions

### Generated Output

TypeScript bindings are generated directly to `apps/web/src/types/generated/`:

```
apps/web/src/types/generated/
├── AgentSpawn.ts
├── TerminalInput.ts
├── GitStatus.ts
├── StateSnapshot.ts
└── ... (74 generated files)
```

Each generated file exports a TypeScript interface:

```typescript
// generated/AgentSpawn.ts
export type AgentSpawn = { worktreeId: string; agentType: string; }
```

### Type Synchronization

Run `make sync-types` to regenerate TypeScript bindings from Rust:

```bash
make sync-types
```

This will:
1. Clean old generated files from `apps/web/src/types/generated/`
2. Generate TypeScript bindings directly to `apps/web/src/types/generated/` via `TS_RS_EXPORT_DIR`

### Type Structure

- **Source**: `crates/ws-server/src/protocol.rs` — Rust types with `#[ts(export)]` attribute
- **Generated**: `apps/web/src/types/generated/*.ts` — Individual TypeScript files (one per type, 74 total)
- **Barrel Export**: `apps/web/src/types/generated/index.ts` — Re-exports all types for convenience
- **Configuration**: `crates/ws-server/.cargo/config.toml` — Sets `TS_RS_EXPORT_DIR` to generate directly to the web app

Import types from the barrel export:

```typescript
import { AgentSpawn, WorkspaceCreate, StateSnapshot } from '../types/generated';
```

### Adding New Types

1. Add the Rust struct in `crates/ws-server/src/protocol.rs` with `#[ts(export)]`:

   ```rust
   #[derive(Debug, Clone, Serialize, Deserialize, PartialEq, ts_rs::TS)]
   #[serde(rename_all = "camelCase")]
   #[ts(export)]
   pub struct MyNewType {
       pub field: String,
   }
   ```

2. Run `make sync-types` to generate the TypeScript file

3. Import from the barrel export:
   ```typescript
   import { MyNewType } from '../types/generated';
   ```

### Binary Fixture Testing

To verify serialization compatibility between Rust and TypeScript, we create MessagePack fixtures:

1. **Infrastructure** (`crates/ws-server/src/test_fixtures.rs`):
   - `fixture_dir()` - Returns path to `test-fixtures/` directory
   - `write_fixture(name, data)` - Serializes data to `.msgpack` file

2. **Test pattern** for each message type:

```rust
#[test]
fn test_agent_spawn_fixture() {
    let msg = AgentSpawn {
        worktree_id: Uuid::nil(),
        agent_type: "claude".to_string(),
    };
    let path = write_fixture("AgentSpawn", &msg).unwrap();
    assert!(path.exists());
}
```

3. **Fixtures stored** in `test-fixtures/` (gitignored):

```
test-fixtures/
├── AgentSpawn.msgpack
├── TerminalInput.msgpack
└── ...
```

The TypeScript client can parse these fixtures to verify deserialization matches Rust.

---

## `apps/` — Frontend

### `apps/web/`

Vite + React + TypeScript single-page application.

**What lives here:**

| Path | Purpose |
|---|---|
| `index.html` | HTML entry point. |
| `package.json` | Dependencies: React 19, Vite, TypeScript. |
| `vite.config.ts` | Dev server on port 5173, proxies `/ws` to `localhost:7319`. |
| `tsconfig.json` | Strict TypeScript config, `react-jsx` transform. |
| `src/main.tsx` | React DOM mount. |
| `src/App.tsx` | Root component. Opens WebSocket, renders connection status. |

**Future additions:**

- `src/lib/` — Shared utilities
  - `ws.ts` — Typed WebSocket client wrapper (reconnect, send, subscribe)
  - `api.ts` — Message helpers matching the ws-server protocol
  - `store.ts` — State management (Zustand or similar)
- `src/components/` — React components
  - `layout/` — App shell, sidebar, header
  - `workspace/` — Workspace list, create form, detail view
  - `worktree/` — Worktree list, branch info, status badges
  - `terminal/` — Terminal emulator (xterm.js or similar)
  - `agent/` — Agent status, session list, command input
  - `git/` — Git status display, diff viewer, commit/PR actions
- `src/hooks/` — React hooks
  - `useWebSocket.ts` — WebSocket connection with auto-reconnect
  - `useWorkspace.ts` — Workspace CRUD operations
  - `useTerminal.ts` — Terminal session management
  - `useAgent.ts` — Agent lifecycle hooks
- `src/types/` — TypeScript types mirroring the Rust protocol types
- `public/` — Static assets (favicon, fonts)

---

### `apps/tauri/`

Tauri v2 desktop application. Wraps the web app in a native window.

**What lives here:**

| Path | Purpose |
|---|---|
| `src-tauri/Cargo.toml` | Tauri 2.x dependencies. |
| `src-tauri/build.rs` | Tauri build script (`tauri_build::build()`). |
| `src-tauri/tauri.conf.json` | Window config (1200x800), bundle settings, `frontendDist` points to `../../web/dist`. |
| `src-tauri/src/main.rs` | Tauri app entry point. |
| `src-tauri/src/lib.rs` | Empty — for future Tauri command extensions. |

**Future additions:**

- `src-tauri/src/commands.rs` — Tauri IPC commands (filesystem access, system tray, notifications)
- `src-tauri/src/updater.rs` — Auto-update support
- `src-tauri/capabilities/` — Tauri capability definitions (permissions for IPC)
- `src-tauri/icons/` — App icons (32, 128, 128@2x, icns, ico)
- `src/` (top-level) — Tauri-specific frontend code if needed (system tray menus, native dialogs)

**Build note:** The Tauri crate is excluded from the Cargo workspace until `apps/web` has been built (`npm run build`). After that, uncomment it in the root `Cargo.toml`.

---

## `Makefile`

| Target | Action |
|---|---|
| `make debug` | Kill ports → `cargo build` → `npm install` → `ymir serve` |
| `make build-prod` | Full release build to `build/` directory |
| `make install-prod` | Build then install binaries to `/usr/local/bin` |
| `make kill` | Kill processes on ports 7319 and 5173 |
| `make clean` | Remove all build artifacts |

---

## Key Design Decisions

### WebSocket as source of truth

All state lives in the ws-server. The web UI is a thin client that renders server state. The CLI sends commands through the same WebSocket. This means:

- No REST API to maintain
- Real-time updates push to all connected clients
- State consistency is trivial (single writer)

### PTY sessions on host

The ws-server manages PTY sessions directly on the host machine. This allows:

- Running any coding agent (Claude Code, Copilot, custom) in a real terminal
- Agents can use host tools (git, compilers, editors) without containerization
- Users can attach to sessions from any client

### Tauri wraps web, not replaces it

The Tauri app renders the same web frontend. No separate UI code. This keeps:

- Single codebase for the UI
- Desktop gets native features (system tray, notifications) via Tauri IPC
- Web-only deployment still works

### Agent integration via ACP

Agents are expected to run via the Agent Client Protocol (ACP), giving each agent a dedicated UI panel while the ws-server orchestrates lifecycle and workspace assignment. The exact ACP integration is TBD.
