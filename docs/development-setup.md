# Development Setup

This guide describes the current setup for the WebSocket/Rust-core architecture.

## Prerequisites

- Node.js + npm
- Rust toolchain + Cargo
- Tauri v2 build dependencies for your OS

## Install Dependencies

```bash
npm install
```

## Run Modes

### 1) Frontend only

```bash
npm run dev
```

The frontend will start on port `5173` by default.

If you want live backend data, point it at a running `ymir-server` instance:

```bash
export VITE_WEBSOCKET_URL="ws://127.0.0.1:7139/ws"
npm run dev
```

### 2) Run standalone WebSocket server

```bash
cargo run -p ymir-server -- web --host 127.0.0.1 --port 7139
```

Optional auth:

```bash
cargo run -p ymir-server -- web --host 127.0.0.1 --port 7139 --password "dev-password"
```

### 3) Run desktop app with embedded sidecar

```bash
npm run tauri:dev
```

What happens:

- `scripts/tauri-dev.sh` sets Linux WebKit compatibility env vars
- Script changes into `ymir-tauri/` and runs `npx tauri dev`
- `ymir-tauri` starts `ymir-server` sidecar with:
  - host `127.0.0.1`
  - port `7139`
- Sidecar is stopped on window close and app exit events

## Build and Test

Frontend:

```bash
npm test
npm run build
```

Rust workspace:

```bash
cargo test --workspace
```

## Useful Environment Variables

- `VITE_WEBSOCKET_URL`: preferred frontend WebSocket endpoint
- `VITE_YMIR_WS_URL`: fallback frontend WebSocket endpoint
- `VITE_LOG_LEVEL`: frontend log level
- `RUST_LOG`: Rust log level

## Common Workflow

1. Start backend (`ymir-server`) or Tauri sidecar mode.
2. Start frontend (`npm run dev`) if not in Tauri mode.
3. Validate WebSocket connection state indicator in UI.
4. Exercise workspace, pane, tab, and PTY actions.
5. Run tests before pushing changes.

## Troubleshooting

### Frontend shows Offline

- Confirm server is running and listening on expected host/port
- Check `VITE_WEBSOCKET_URL` points to `/ws`
- Verify no firewall or port conflict blocks connection

### Tauri fails on Linux display backend

- Use `npm run tauri:dev` so `scripts/tauri-dev.sh` sets `GDK_BACKEND` and `WEBKIT_DISABLE_DMABUF_RENDERER`

### Stale dev server on port 5173

- `scripts/tauri-dev.sh dev` already kills existing `5173` process before launch
- For manual runs, stop old Vite instances before restarting
