# Terminal Tab History Bug — Research Findings

## Summary

The "Terminal Output Isolation" fix described in the architecture documentation was **never implemented**. The codebase contains zero evidence of the documented gating pattern. Every PTY output chunk is unconditionally persisted to the database, which means the initial bash prompt emitted by the shell on session creation is stored to history on every mount/refresh.

## Bug Description (from PROMPT.md)

The terminal tab stores the bash prompt to history even when no command has been typed yet. On repeated refreshes, the prompt gets stored again and again, creating duplicate prompt entries in the history buffer.

## Root Cause Analysis

### 1. `broadcast_output()` has NO gating — `output.rs:175-194`

```rust
async fn broadcast_output(state: &AppState, session_id: Uuid, output_data: &str) {
    let output_msg = ServerMessage::new(ServerMessagePayload::TerminalOutput(...));
    state.broadcast(output_msg).await;

    // UNCONDITIONALLY persists every output chunk to DB
    let db = state.db.clone();
    let session_id_str = session_id.to_string();
    let output_data_clone = output_data.to_string();
    tokio::spawn(async move {
        if let Err(e) = db.append_terminal_output(&session_id_str, &output_data_clone).await {
            tracing::error!("Failed to store terminal output: {}", e);
        }
    });
}
```

**Problem:** There is no `user_input_received` check. Every byte of PTY output (including the initial shell prompt) is appended to `terminal_output` in the DB.

### 2. `PtySession` has NO `user_input_received` flag — `mod.rs:38-52`

```rust
pub struct PtySession {
    pub id: Uuid,
    pub tab_id: Option<Uuid>,
    pub worktree_id: Uuid,
    pub shell: String,
    pub label: Option<String>,
    pub start_time: Instant,
    pub last_activity: Arc<Mutex<Instant>>,
    pub is_ended: bool,
    pub ended_reason: Option<String>,
    master: Option<Box<dyn portable_pty::MasterPty + Send>>,
    writer: Option<Box<dyn Write + Send>>,
    _process: Option<Box<dyn portable_pty::Child + Send + Sync>>,
    tx: mpsc::UnboundedSender<Vec<u8>>,
}
```

**Problem:** No `user_input_received: Arc<TokioMutex<bool>>` field exists. The struct has no mechanism to track whether the user has typed anything.

### 3. `PtySession::write()` does NOT set any input-received flag — `mod.rs:84-92`

```rust
pub fn write(&mut self, data: &[u8]) -> Result<()> {
    let writer = self.writer.as_mut().ok_or_else(|| anyhow!("Session is ended"))?;
    writer.write_all(data)?;
    writer.flush()?;
    *self.last_activity.lock().unwrap() = Instant::now();
    Ok(())
}
```

**Problem:** Only updates `last_activity`. Does not set any `user_input_received` flag.

### 4. `handle_terminal_input()` does NOT detect `clear` command — `handler.rs:181-211`

```rust
pub async fn handle_terminal_input(
    state: Arc<AppState>,
    msg: crate::protocol::TerminalInput,
) -> ServerMessage {
    // ... pty_manager lookup ...
    if let Err(e) = pty_manager.write(msg.session_id, &msg.data.into_bytes()) {
        // ... error handling ...
    }
    ServerMessage::new(ServerMessagePayload::Ack(...))
}
```

**Problem:** No inspection of `msg.data` for `clear` command detection. No DB wipe. No ANSI clear escape sent.

### 5. `handle_terminal_mount()` does NOT clear old tab output — `handler.rs:345-459`

The mount handler creates/reuses a PTY session but never clears previous terminal_output for the tab.

**Problem:** On refresh, old history is preserved in DB and the new prompt gets appended on top of it.

### 6. No `clear_terminal_output_for_tab` DB method exists

The DB module (`db/mod.rs`) has:
- `append_terminal_output()` — appends output unconditionally (line 1616)
- `get_terminal_output_by_tab()` — reads output by tab_id (line 1287)
- `delete_terminal_output()` — deletes by session_id (line 1660)
- `close_terminal_tab()` — cascading delete (used only on tab close, line 1269)

But there is NO method to clear output for a specific tab while keeping the session records intact.

### 7. Client-side: History requested on every mount — `TerminalView.tsx:306-321`

```typescript
if (!historyRequestedRef.current.has(key)) {
    historyRequestedRef.current.add(key);
    const historyRequest: TerminalRequestHistory = {
        type: 'TerminalRequestHistory',
        tabId: tabIdRef.current,
        sessionId: sessionIdRef.current,
        requestId,
        limit: 1000,
    };
    client.send(historyRequest);
}
```

The client requests history on every terminal setup. With the DB containing stale prompt entries, it faithfully renders all the accumulated prompt data.

## What Needs to Be Implemented

### A. Server-side: `user_input_received` flag on PtySession

1. Add `user_input_received: Arc<TokioMutex<bool>>` field to `PtySession`
2. Set it to `true` in `PtySession::write()` (or in `PtyManager::write()`)
3. Pass this flag (or a reference) to `broadcast_output()` so it can gate DB persistence

### B. Server-side: Gate `broadcast_output()` DB writes

In `output.rs`, `broadcast_output()` should:
1. Always broadcast output to WebSocket clients (so the user sees the prompt)
2. Only persist to DB if `user_input_received` is `true` for the session
3. Requires access to the session state or the flag — `broadcast_output` currently only receives `(state, session_id, output_data)`, so it needs an additional parameter or a way to look up the flag

### C. Server-side: `clear` command detection in `handle_terminal_input()`

1. Inspect `msg.data` for the `clear` command (check for `clear\n`, `clear\r`, etc.)
2. On detection: call `db.clear_terminal_output_for_tab(tab_id)` to wipe DB history
3. Send ANSI clear escape (`\x1b[2J\x1b[H`) to the terminal via WebSocket broadcast

### D. Server-side: New DB method `clear_terminal_output_for_tab()`

Add to `Db` impl:
```sql
DELETE FROM terminal_output WHERE session_id IN 
  (SELECT id FROM terminal_sessions WHERE tab_id = ?1)
```

### E. Server-side: Clear old output on fresh mount (optional, for clean slate)

When `handle_terminal_mount()` creates a NEW session for a tab (not reusing existing), consider clearing the previous session's output from DB so refresh doesn't accumulate stale prompts.

## Key Files to Modify

| File | Change |
|------|--------|
| `crates/ws-server/src/pty/mod.rs` | Add `user_input_received` flag to `PtySession`, set in `write()` |
| `crates/ws-server/src/pty/output.rs` | Gate `broadcast_output()` DB persistence on flag |
| `crates/ws-server/src/pty/handler.rs` | Add `clear` command detection, clear old output on mount |
| `crates/ws-server/src/db/mod.rs` | Add `clear_terminal_output_for_tab()` method |
| `apps/web/src/components/terminal/TerminalView.tsx` | Possibly handle clear ANSI escape (likely already works via ghostty-web) |

## Data Flow

```
Shell starts → emits prompt (e.g. "user@host:~$ ")
    → PTY output reader reads it
    → broadcast_output() called
    → CURRENTLY: appended to DB unconditionally  ← BUG
    → FIX: skip DB append if user_input_received == false

User types "ls\n" → TerminalInput sent to server
    → PtySession::write() forwards to PTY
    → PtySession::write() sets user_input_received = true
    → PTY echoes command + output
    → broadcast_output() called
    → FIX: now appends to DB (user_input_received == true)

User types "clear\n"
    → handle_terminal_input() detects "clear"
    → FIX: db.clear_terminal_output_for_tab() wipes history
    → Normal PTY clear happens via shell
```

## Architecture Note

The architecture documentation claims this pattern was already implemented:
> `broadcast_output()` gates DB persistence on `user_input_received` flag
> `PtySession` has `user_input_received: Arc<TokioMutex<bool>>` set in `write()`
> `handle_terminal_mount()` clears old tab output
> `handle_terminal_input()` detects `clear` command and wipes DB + sends ANSI clear escape

**None of these claims are reflected in the current codebase.** The fix was either never committed, was reverted, or was documented aspirationally before implementation.
