# GAP-1 and GAP-2 Fix Review

**Date:** 2026-05-07
**Reviewer:** Hermes Agent
**Scope:** GAP-1 (agent_tab_id persistence) and GAP-2 (SpawnResult struct)

---

## Compilation

`cargo check -p ymir-ws-server` — **PASSED**

Only pre-existing warnings (unused imports, unreachable patterns in bridge_codec/encoder, unused variables). No warnings or errors introduced by these changes.

---

## GAP-1: `agent_tab_id: Some(agent_tab_id.to_string())` in handler.rs

**File:** `crates/ws-server/src/agent/handler.rs`, line 96

**Change:** The `AgentSession` DB record now stores `agent_tab_id` as `Some(agent_tab_id.to_string())` instead of `None`.

**Verdict: CORRECT**

The `agent_tab_id` is generated at line 87 (`let agent_tab_id = Uuid::new_v4()`) and is now persisted into the `AgentSession` record at spawn time. This ensures the agent tab ID survives across server restarts and can be reconstructed from the database. The field was already `Option<String>` in the schema, so wrapping it in `Some()` is the right fix.

---

## GAP-2: SpawnResult struct with acp_session_id and process_id

**Files:**
- `crates/ws-server/src/agent/acp.rs` — SpawnResult definition, AcpCommand::Spawn, runtime loop
- `crates/ws-server/src/agent/handler.rs` — handler usage in broadcast

### SpawnResult Definition (acp.rs lines 92-96)

```rust
pub struct SpawnResult {
    pub acp_session_id: Option<String>,
    pub process_id: Option<u32>,
}
```

**Verdict: CORRECT** — Both fields are `Option` which is appropriate since `session_id` might not be set and `process.id()` can return `None` before the process is fully initialized.

### AcpCommand::Spawn Variant (acp.rs lines 32-38)

```rust
Spawn {
    agent_tab_id: Uuid,
    worktree_id: Uuid,
    agent_type: String,
    worktree_path: String,
    respond: oneshot::Sender<Result<SpawnResult>>,
},
```

**Verdict: CORRECT** — The respond channel carries `Result<SpawnResult>`, matching the return type of `AcpHandle::spawn_agent()`.

### AcpHandle::spawn_agent() (acp.rs line 374)

```rust
pub async fn spawn_agent(&self, ...) -> Result<SpawnResult>
```

**Verdict: CORRECT** — Returns `Result<SpawnResult>` as specified.

### Runtime Loop Construction (acp.rs lines 492-497)

```rust
let _ = respond.send(result.map(|client| {
    let acp_session_id = client.session_id.as_ref().map(|s| s.to_string());
    let process_id = client.process.id();
    clients.insert(agent_tab_id, client);
    SpawnResult { acp_session_id, process_id }
}));
```

**Verdict: CORRECT** — The `SpawnResult` is properly constructed after `AcpClient::spawn()` succeeds:
- `acp_session_id` is extracted from `client.session_id` (set by `create_session()` at line 246).
- `process_id` is extracted from `client.process.id()`.
- The client is inserted into the `clients` HashMap before being dropped from scope.
- The `result.map()` ensures the error path propagates cleanly without constructing a `SpawnResult`.

### Handler Usage (handler.rs lines 161-186)

```rust
match acp_handle.spawn_agent(...).await {
    Ok(spawn_result) => {
        // ...
        let success_msg = ServerMessage::new(ServerMessagePayload::AgentStatusUpdate(
            AgentStatusUpdate {
                // ...
                acp_session_id: spawn_result.acp_session_id,
                process_id: spawn_result.process_id,
            },
        ));
    }
    // ...
}
```

**Verdict: CORRECT** — The handler extracts `acp_session_id` and `process_id` from the `SpawnResult` and includes them in the `AgentStatusUpdate` broadcast to clients. The spawning status broadcast (lines 138-150) correctly uses `None` for both fields since they aren't yet available at that point.

---

## Summary

| Gap | Status | Notes |
|-----|--------|-------|
| GAP-1 | PASS | `agent_tab_id` correctly persisted in DB record |
| GAP-2 | PASS | `SpawnResult` properly defined, constructed in runtime loop, and consumed in handler broadcast |

**No issues found.** Both fixes are correct, minimal, and consistent with existing patterns in the codebase.
