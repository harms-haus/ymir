# Migration Guide: Store/Command Model to WebSocket Core

This guide helps contributors move code and habits from the old architecture to the current runtime.

## What Changed

### Runtime source of truth

- Old: frontend-held workspace runtime state with command bridging into Tauri
- Current: backend-backed runtime via WebSocket JSON-RPC (`workspace.*`, `pane.*`, `tab.*`, `pty.*`, `git.*`)

### Data flow

- Old: action dispatch into frontend store, then command calls
- Current: React hooks call WebSocket requests and refetch on `*.state_change` notifications

### Persistence

- Old: frontend storage adapter model
- Current: Rust-managed persistence in libSQL schema (`ymir-core/migrations/001_initial_schema.sql`)

### Theme persistence

- Old: store adapter-based persistence
- Current: `localStorage` through `src/lib/theme-storage.ts`

### Server lifecycle

- Old: direct command-oriented backend coupling
- Current: `ymir-tauri` starts `ymir-server` sidecar, then frontend talks to `/ws`

## Frontend Migration Patterns

### Replace direct store reads/writes

Use these hooks instead:

- `useWorkspaces()` for `workspace.list`
- `usePanes(workspaceId)` for `pane.list`
- `useTabs(paneId)` for `tab.list`
- `useGit(repoPath)` for `git.status`

### Replace command invocation paths

Use `getWebSocketService().request(method, params)` in UI-side imperative flows.

Examples in code:

- `pane.create` in `src/components/Layout.tsx`
- `tab.create` / `tab.close` in `src/components/Pane.tsx`
- `pty.connect` / `pty.write` / `pty.resize` in `src/components/Terminal.tsx`

### Keep lightweight UI runtime helpers

Use runtime helper modules for local, UI-only state:

- `src/lib/runtime-selection.ts`
- `src/lib/runtime-notifications.ts`
- `src/lib/runtime-ui-state.ts`

Do not treat these helpers as backend data stores.

## Backend Migration Patterns

### Add new behavior

1. Define input/output structs in a handler under `ymir-core/src/handlers/`.
2. Implement business logic in the handler.
3. Expose method in the handler RPC adapter.
4. Register method in `ServerState::register_runtime_handlers`.
5. Add frontend call and hook wiring.

### Notifications

If the method changes state that the UI displays, emit a `*.state_change` notification and have relevant hooks refetch.

### Common Pitfalls

- Assuming frontend runtime helpers are persistent state stores
- Adding new behavior as Tauri-only commands instead of JSON-RPC methods
- Forgetting camelCase JSON field names for handler inputs
- Forgetting to register new methods in server startup router
- Forgetting to update docs when method names or payloads change

### Contributor Checklist

- Backend method exists and is registered
- Method input and output types are documented
- Frontend hook/component uses WebSocket request path
- Notification and refetch behavior is wired where needed
- Docs updated:
  - `docs/websocket-protocol.md`
  - `docs/database-schema.md` if schema changed
  - `README.md` if developer workflow changed
