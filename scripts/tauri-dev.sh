#!/bin/bash
# Handles Wayland/X11 compatibility for WebKitGTK/Tauri
# Usage: ./scripts/tauri-dev.sh [dev|build]

set -e

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
exec npx tauri "$@"
