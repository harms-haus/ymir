# Ymir

Ymir is a tabbed, split-pane terminal UI built with React and Ghostty Web. The current runtime architecture is WebSocket + JSON-RPC, backed by Rust services in `ymir-core` and `ymir-server`.

## Runtime Architecture

The app runs as a multi-layer system:

1. **Frontend (`src/`)**
   - React UI and terminal rendering (`ghostty-web`)
   - WebSocket transport in `src/services/websocket.ts`
   - Data hooks that fetch and refetch over JSON-RPC (`useWorkspaces`, `usePanes`, `useTabs`, `useGit`)
   - Lightweight runtime helpers in `src/lib/runtime-*.ts` for selection, notifications, and UI state

2. **Transport (`/ws`)**
   - JSON-RPC 2.0 over WebSocket
   - Client uses request/response for commands and notifications for state changes and PTY output

3. **Rust Core (`ymir-core/`)**
   - JSON-RPC protocol types and server router
   - Handlers for `auth.*`, `workspace.*`, `pane.*`, `tab.*`, `pty.*`, and `git.*`
   - PTY process manager and scrollback service
   - libSQL/Turso-compatible schema and migrations

4. **Server and Host**
   - `ymir-server` hosts the WebSocket endpoint
   - `ymir-tauri` starts and stops `ymir-server` as a sidecar for desktop runs

Important: the active architecture is WebSocket-driven. It does not use the old frontend workspace store as the runtime source of truth, and it does not use the old pane-command bridge as the primary execution path.

## Key Capabilities

- Multi-workspace, multi-pane, multi-tab terminal workflow
- PTY lifecycle over JSON-RPC: connect, write, resize, close
- Scrollback capture and replay via Rust scrollback service
- Git status and actions via server handlers
- Runtime notifications and keyboard shortcuts in the frontend
- Theme persistence via `localStorage` (`src/lib/theme-storage.ts`)

## Development Setup

### Prerequisites

- Node.js and npm
- Rust toolchain and Cargo
- Tauri system dependencies for your platform

### Install

```bash
npm install
```

### Run Frontend Only

```bash
npm run dev
```

If you connect this frontend to `ymir-server`, set the WebSocket URL first:

```bash
export VITE_WEBSOCKET_URL="ws://127.0.0.1:7139/ws"
```

### Run Rust WebSocket Server

```bash
cargo run -p ymir-server -- web --host 127.0.0.1 --port 7139
```

### Run Tauri Desktop App

```bash
npm run tauri:dev
```

This uses `scripts/tauri-dev.sh`, which sets Linux display compatibility flags and launches `ymir-tauri`, which then starts the embedded `ymir-server` sidecar.

### Test and Build

```bash
npm test
npm run build
cargo test --workspace
```

## Documentation

- WebSocket / JSON-RPC protocol: `docs/websocket-protocol.md`
- Database schema summary: `docs/database-schema.md`
- Current setup and workflows: `docs/development-setup.md`
- Refactor migration notes: `docs/migration-guide.md`
- Window close behavior test guide: `docs/window-close-testing.md`

## Workspace Layout

```text
src/          Frontend UI, hooks, transport, runtime helper modules
ymir-core/    Shared Rust core, JSON-RPC handlers, DB, PTY, scrollback
ymir-server/  Standalone WebSocket server binary
ymir-tauri/   Desktop host that manages ymir-server sidecar lifecycle
docs/         Developer and architecture documentation
```

## License

MIT
