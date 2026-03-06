#!/bin/bash
# Ymir Tauri Startup Script
# Handles Wayland/X11 compatibility for WebKitGTK

set -e

# WebKitGTK environment variables for better Wayland/X11 compatibility
export WEBKIT_DISABLE_DMABUF_RENDERER=1

# Determine display backend
if [ -n "$WAYLAND_DISPLAY" ] && [ -z "$GDK_BACKEND" ]; then
    # Wayland is available, try it first with X11 fallback
    echo "Detected Wayland session, trying Wayland with X11 fallback..."
    export GDK_BACKEND="wayland,x11"
elif [ -z "$DISPLAY" ] && [ -z "$WAYLAND_DISPLAY" ]; then
    echo "Warning: No display detected"
fi

# If GDK_BACKEND is already set, respect it
if [ -n "$GDK_BACKEND" ]; then
    echo "Using GDK_BACKEND=$GDK_BACKEND"
fi

# Run Tauri
exec npx tauri "$@"
