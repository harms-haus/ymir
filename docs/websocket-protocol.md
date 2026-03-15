# WebSocket JSON-RPC Protocol

This document describes the active runtime protocol between the frontend and Rust backend.

## Transport

- Protocol: JSON-RPC 2.0
- Transport: WebSocket
- Endpoint: `/ws`
- Frontend default URL: `ws://127.0.0.1:7144/ws` (`src/services/websocket.ts`)
- Server default port: `7319` (`ymir-core/src/server/mod.rs`)

In development, set `VITE_WEBSOCKET_URL` (or `VITE_YMIR_WS_URL`) so the frontend points at the running server.

## Message Envelopes

### Request

```json
{
  "jsonrpc": "2.0",
  "id": "req-123",
  "method": "workspace.list",
  "params": { "filter": null }
}
```

### Success Response

```json
{
  "jsonrpc": "2.0",
  "id": "req-123",
  "result": {
    "workspaces": []
  }
}
```

### Error Response

```json
{
  "jsonrpc": "2.0",
  "id": "req-123",
  "error": {
    "code": -32602,
    "message": "Invalid params"
  }
}
```

### Notification

```json
{
  "jsonrpc": "2.0",
  "method": "tab.state_change",
  "params": {
    "action": "created",
    "tab": { "id": "tab-1" }
  }
}
```

## Error Codes

Standard JSON-RPC codes from `ymir-core/src/protocol.rs`:

- `-32700` parse error
- `-32600` invalid request
- `-32601` method not found
- `-32602` invalid params
- `-32603` internal error

The frontend also uses `-32603` for client-side request timeout or disconnected transport failures.

## Registered Request Methods

The server registers these JSON-RPC methods at startup in `ServerState::register_runtime_handlers`.

### Auth

- `auth.login` `{ password }`
- `auth.logout` `{ reason? }`
- `auth.status` `{}`

### Workspace

- `workspace.create` `{ name, id? }`
- `workspace.list` `{ filter? }`
- `workspace.rename` `{ id, name }`
- `workspace.delete` `{ id }`

### Pane

- `pane.create` `{ workspaceId, id?, flexRatio? }`
- `pane.list` `{ workspaceId }`
- `pane.delete` `{ id }`

### Tab

- `tab.create` `{ workspaceId, paneId, id?, title?, cwd? }`
- `tab.list` `{ paneId }`
- `tab.close` `{ id }`

`tab.create` auto-spawns a PTY session keyed by the tab id.

### PTY

- `pty.connect` `{ tabId }`
- `pty.write` `{ tabId, data }`
- `pty.resize` `{ tabId, cols, rows }`

### Git

- `git.status` `{ repoPath }`
- `git.stage` `{ repoPath, filePath }`
- `git.unstage` `{ repoPath, filePath }`
- `git.commit` `{ repoPath, message }`
- `git.branches` `{ repoPath }`
- `git.checkout` `{ repoPath, branch }`

## Notifications

Current notification channels used by frontend hooks and terminal components:

- `workspace.state_change`
- `pane.state_change`
- `tab.state_change`
- `git.state_change`
- `pty.output`
- `auth.state_change`

`pty.output` payload type values:

- `output` with terminal bytes/data
- `notification` with OSC-style message text
- `exit` with optional exit code

## Connection Behavior

From `src/services/websocket.ts`:

- Request timeout default: `30_000ms`
- Outbound queue max: `500`
- Reconnect base delay: `500ms`
- Reconnect max delay: `10_000ms`
- Backoff factor: `2`

On reconnect, queued outbound messages flush after `connected` state is restored.
