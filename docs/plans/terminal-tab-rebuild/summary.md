# Terminal Tab Rebuild — Implementation Summary

## PR
https://github.com/harms-haus/ymir/pull/1
Branch: `feature/terminal-tab-rebuild`

## What Was Built

Rebuilt the terminal tab system from scratch with **tab-session separation**. Terminal tabs now have stable UUIDs that persist across page refreshes and PTY respawns. PTY sessions are transient and linked to tabs via `tab_id`.

### Architecture

```
TerminalTab (client-owned, stable) ──1──N── PtySession (server-owned, transient)
  tab_id                              session_id
  activeSessionId ──────────────────────> FK to current session
  history (persists with tab, not PTY)
```

### 9 Runes Completed

| Rune | Description | Status |
|------|-------------|--------|
| bf-9427.1 | DB schema migration (tab_id, status, ended_at, ended_reason) | fulfilled |
| bf-9427.2 | New protocol types (9 new message types) | fulfilled |
| bf-9427.3 | PTY manager lifecycle (configurable TTL, reserve/end/kill) | fulfilled |
| bf-9427.4 | Handler rewrite (mount/unmount/close) | fulfilled |
| bf-9427.5 | Router updates for new messages | fulfilled |
| bf-9427.6 | Client store (TerminalTabState, tab CRUD) | fulfilled |
| bf-9427.7 | Client components (TerminalPane, TerminalView) | fulfilled |
| bf-9427.8 | Client protocol types & TypeScript exports | fulfilled |
| bf-9427.9 | Tests | fulfilled |

### Key Features

1. **Tab-Session Separation**: Tabs have stable IDs; PTY sessions are transient
2. **Configurable TTL**: `TERMINAL_SESSION_TTL_SECS` env var (default 180s/3min)
3. **Session Lifecycle**: Mount (find/create), Unmount (graceful end), Close (full cleanup)
4. **History Persistence**: Output stays with tab across PTY respawns
5. **Recovery**: Page refresh → same tab, same or new PTY session, full history restored
6. **All Standard PTY Events**: Proxied through yws-transport unchanged, no extras/filters

### File Changes

- 129 files changed, 4,776 insertions, 789 deletions
- Rust: pty/mod.rs, pty/handler.rs, protocol/terminal.rs, db/mod.rs, router.rs, bridge_codec.rs
- TypeScript: store.ts, TerminalPane.tsx, TerminalView.tsx, protocol.ts, 80+ generated types

### Build Status

- `cargo check -p ymir-ws-server`: passes (1 pre-existing warning)
- `npx tsc --noEmit`: passes (1 pre-existing error: missing BridgeStatus)
