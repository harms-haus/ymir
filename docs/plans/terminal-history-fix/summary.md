# Terminal Tab History Fix — Implementation Summary

## Problem
Terminal tab stored the bash prompt to history on every session mount/refresh, even before any user command was typed. Repeated refreshes caused unbounded prompt accumulation. The `clear` command did not wipe history.

## Root Cause
The documented "Terminal Output Isolation" pattern from the architecture docs was never actually implemented. `broadcast_output()` unconditionally persisted every PTY output chunk to the database, including the initial shell prompt.

## Changes Made

### 1. PtySession user_input_received flag (`crates/ws-server/src/pty/mod.rs`)
- Added `user_input_received: Arc<tokio::sync::Mutex<bool>>` field
- Initialized to `false`, set to `true` in `PtySession::write()` via `try_lock()` (sync context)
- Added public getter for use by output reader

### 2. broadcast_output DB gating (`crates/ws-server/src/pty/output.rs`)
- `broadcast_output()` now accepts `user_input_received: Arc<TokioMutex<bool>>`
- WebSocket broadcast always happens (user always sees output)
- DB persistence only happens when `user_input_received` is `true`

### 3. Clear command detection (`crates/ws-server/src/pty/handler.rs`)
- Added `input_line_buffer: std::sync::Mutex<String>` to PtySession
- `append_to_line_buffer()` accumulates chars until \n/\r, returns complete line
- `handle_terminal_input()` detects completed "clear" lines (case-insensitive)
- Triggers `db.clear_terminal_output_for_tab()` to wipe history

### 4. DB clear method (`crates/ws-server/src/db/mod.rs`)
- Added `clear_terminal_output_for_tab(tab_id)` — deletes all terminal_output rows for sessions belonging to the tab

### 5. Double mutex lock consolidation (`crates/ws-server/src/pty/handler.rs`)
- All 4 double-lock patterns consolidated to single lock scope

## Files Modified
- `crates/ws-server/src/pty/mod.rs`
- `crates/ws-server/src/pty/output.rs`
- `crates/ws-server/src/pty/handler.rs`
- `crates/ws-server/src/db/mod.rs`

## Known Limitations (non-blocking)
- Line buffer does not handle backspace/DEL or escape sequences (arrow keys, tab completion). If a user typos `clear` and corrects with backspace, the DB history won't be cleared. The shell's visual clear still works normally.
