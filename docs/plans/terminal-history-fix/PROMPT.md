# Terminal Tab History Fix

## Problem

The terminal tab stores the bash prompt to history even when no command has been typed yet. This causes problems on repeated refreshes: the prompt gets stored again and again, creating a long list of duplicate prompt entries in the history.

## Requirements

1. **Do NOT store the bash prompt to history when no command has been submitted yet.** The prompt should still be shown to the user in the tab UI, but it should not be recorded in the history buffer.
2. **Only store the prompt to history when a command is actually submitted** (for historical reasons — the prompt provides context for the command).
3. **The `clear` command should clear the terminal history.** When the user types `clear`, the history entries should be wiped.

## Context

- This is a terminal tab in a web-based IDE (Ymir project)
- The terminal uses xterm.js on the frontend
- History is managed server-side via WebSocket protocol messages
- The prompt is sent to the client for display but currently also gets persisted to history
