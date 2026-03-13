#!/bin/bash
# Handles Wayland/X11 compatibility for WebKitGTK/Tauri
# Usage: ./scripts/tauri-dev.sh [dev|build]

set -e

# Kill any process using port 5173 (Vite dev server)
kill_port_5173() {
    local pid=$(lsof -t -i :5173 2>/dev/null || true)
    if [ -n "$pid" ]; then
        echo "Killing process $pid on port 5173..."
        kill $pid 2>/dev/null || true
        sleep 1
    fi
}

# Only kill port 5173 for dev command
if [ "$1" = "dev" ]; then
    kill_port_5173
fi

# WebKitGTK environment variables for better Wayland/X11 compatibility
# Disable DMABUF renderer which can cause issues on some Wayland setups
export WEBKIT_DISABLE_DMABUF_RENDERER=1

# Determine display backend strategy
if [ -n "$WAYLAND_DISPLAY" ] && [ -z "$GDK_BACKEND" ]; then
    # Wayland is available and no backend forced
    # Try wayland first, fall back to x11
    echo "Detected Wayland session, trying Wayland with X11 fallback..."
    export GDK_BACKEND="wayland,x11"
elif [ -n "$DISPLAY" ] && [ -z "$GDK_BACKEND" ]; then
    # X11 only
    echo "Detected X11 session"
    export GDK_BACKEND="x11"
elif [ -n "$GDK_BACKEND" ]; then
    echo "Using explicit GDK_BACKEND=$GDK_BACKEND"
else
    echo "Warning: No display detected, defaulting to X11"
    export GDK_BACKEND="x11"
fi

# Execute tauri command
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
WORKTREE_ROOT="$(cd -- "$SCRIPT_DIR/.." && pwd)"

cd "$WORKTREE_ROOT/ymir-tauri"

exec npx tauri "$@"
