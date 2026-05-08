# Server-Side Review: Agent Tab Lifecycle Fix

**Date:** 2026-05-07
**Reviewer:** Hermes Agent
**Scope:** All server-side changes in `crates/` for the agent tab lifecycle fix

---

## Compilation Status

- `cargo check -p ymir-ws-server` -- **PASS** (0 errors, 9 pre-existing warnings)
- `cargo test -p ymir-ws-server` -- **PASS** (44 tests pass, 1 pre-existing failure in `test_cancel_succeeds_with_valid_session`, 1 pre-existing panic in `test_end_session_updates_last_activity`)
- 4 test compilation errors were found and fixed (missing struct fields for `AgentStatusUpdate` and `AgentSessionData` in test code)

---

## Task-by-Task Verification

### Task 1.1: DB Migration -- agent_tab_id column + get_agent_session_by_tab_id
**Status: COMPLETE**

- Migration added to `SCHEMA_MIGRATIONS`: `ALTER TABLE agent_sessions ADD COLUMN agent_tab_id TEXT` + index
- `AgentSession` struct extended with `agent_tab_id: Option<String>`
- `create_agent_session()` updated to store `agent_tab_id`
- All SELECT queries updated to include `agent_tab_id` column
- `get_agent_session_by_tab_id()` added correctly
- `update_agent_session_acp_id()` extended to optionally update `agent_tab_id`
- `list_agent_sessions()` and `list_all_agent_sessions()` updated

### Task 1.2: handle_agent_spawn stores agent_tab_id
**Status: COMPLETE**

- `AgentSession` construction in `handle_agent_spawn()` includes `agent_tab_id: Some(agent_tab_id.to_string())`

### Task 2.1: AgentStatusUpdate extended with acp_session_id, process_id; AgentStatus::Spawning
**Status: COMPLETE**

- `AgentStatusUpdate` struct has `acp_session_id: Option<String>` and `process_id: Option<u32>`
- `AgentStatus` enum has new `Spawning` variant (first in enum)
- `AgentSessionData` struct has `process_id: Option<u32>`

### Task 2.2: AgentResume protocol message
**Status: COMPLETE**

- `AgentResume` struct added with `worktree_id: Uuid` and `agent_tab_id: Uuid`
- `ClientMessagePayload::AgentResume(AgentResume)` variant added

### Task 3.1-3.3: ACP Client decomposition
**Status: COMPLETE**

- `AcpCommand::Initialize` and `AcpCommand::LoadSession` variants added
- `AcpCommand::SpawnForResume` variant added
- `InitializeResult`, `SessionLoadResult`, `SpawnResult` structs defined
- `AcpClient::initialize()` returns `Result<InitializeResult>` with serialized capabilities
- `AcpClient::load_session()` added, calls `self._connection.load_session()`, emits `SessionInit` event
- `AcpClient::resume()` added -- spawns stdio, calls initialize then load_session
- `AcpHandle::initialize()`, `AcpHandle::load_session()`, `AcpHandle::spawn_agent_for_resume()` added
- Runtime loop arms for all new commands present
- `AcpClient::spawn()` preserved as convenience wrapper (connect -> initialize -> create_session)

### Task 4.1: InitializeResponse ACP event
**Status: COMPLETE**

- `AcpEvent::InitializeResponse(AcpInitializeResponse)` variant added to enum
- `AcpInitializeResponse` struct with `capabilities: serde_json::Value` defined
- `YmirClientHandler::emit_initialize_response()` implemented
- Called from `AcpClient::initialize()` after receiving response

### Task 5.1: handle_agent_spawn uses Spawning status, broadcasts acp_session_id/process_id
**Status: PARTIAL -- see Issue #1 below**

- Initial broadcast uses `AgentStatus::Spawning` with `acp_session_id: None`, `process_id: None`
- Success broadcast includes `spawn_result.acp_session_id` and `spawn_result.process_id`
- `SpawnResult` correctly extracted from `AcpHandle::spawn_agent()`
- **BUG**: The background task does NOT update the DB record with `acp_session_id` after successful spawn. The outline (Task 5.1, step 4b) explicitly says: "On success, updates DB with acp_session_id". Without this, if the server restarts, restored sessions will have `acp_session_id: NULL` in the DB and cannot be resumed.

### Task 6.1: handle_agent_resume() implemented
**Status: COMPLETE**

- Proper error handling for: session not found, no ACP session ID, worktree not found, ACP not initialized
- Inserts into in-memory state with "spawning" status
- Broadcasts `AgentStatusUpdate` with `AgentStatus::Spawning`
- Background task calls `acp_handle.spawn_agent_for_resume()` which internally calls connect -> initialize -> load_session
- On success: updates state to idle, broadcasts with acp_session_id and process_id
- On failure: removes from state, broadcasts `AgentRemoved`

### Task 6.2: AgentResume wired in router
**Status: COMPLETE**

- `handle_agent_resume` imported and exported from `agent` module
- Router dispatches `ClientMessagePayload::AgentResume(msg)` -> `handle_agent_resume(state.clone(), msg)`
- Also added to `not_implemented()` match arm

### Task 7.1: session/list fix
**Status: PARTIAL (as expected)**

- Kept as stub returning empty array (as noted in the task list: "partial - kept as stub, needs async fix")
- Non-blocking, avoids ACP runtime contention
- Client discovers sessions through `SessionInit` broadcast events

---

## Issues Found

### Issue #1 (MEDIUM): DB not updated with acp_session_id after spawn success

**File:** `crates/ws-server/src/agent/handler.rs`, `handle_agent_spawn()` background task
**Outline reference:** Task 5.1, step 4b: "On success, updates DB with acp_session_id"

The background task's success branch updates in-memory state and broadcasts, but does NOT call `state.db.update_agent_session_acp_id()` to persist the `acp_session_id`. This means:

1. After spawn, the DB row still has `acp_session_id = NULL`
2. On server restart, `handle_get_state` loads sessions from DB with `acp_session_id = NULL`
3. `handle_agent_resume` will reject resuming these sessions (step 2 checks for `acp_session_id`)

**Fix:** Add after the in-memory state update in the success branch:
```rust
let _ = state_ref.db.update_agent_session_acp_id(
    &session_id_ref.to_string(),
    spawn_result.acp_session_id.as_deref(),
    Some(&agent_tab_id_ref.to_string()),
).await;
```

Note: `update_agent_session_acp_id()` already exists (added in Task 1.1) and supports updating both fields.

### Issue #2 (LOW): session/load error message not updated per outline

**File:** `crates/ws-server/src/agent/jsonrpc_relay.rs`
**Outline reference:** Task 7.2: Update error message to "not supported -- managed by server lifecycle (use AgentSpawn or AgentResume)"

Current message is just `"not supported"`. The outline specifies it should be clarified to guide users toward the correct flow.

### Issue #3 (LOW): No guard against duplicate resume for active agent

**File:** `crates/ws-server/src/agent/handler.rs`, `handle_agent_resume()`

If `handle_agent_resume` is called for an agent tab that already has an active in-memory entry (e.g., user clicks resume while agent is already running), the function does not check `state.agents` before inserting. The HashMap `insert` will silently overwrite the existing entry, potentially orphaning the running process.

This is an edge case and the outline does not explicitly address it, but it's worth noting.

### Issue #4 (INFORMATIONAL): _io_task field naming

**File:** `crates/ws-server/src/agent/acp.rs`

The `_io_task` field in `AcpClient` has an underscore prefix suggesting it's unused, but it IS actually used -- it keeps the `JoinHandle` alive which keeps the I/O task running. This is correct behavior, but the naming is misleading. The task is NOT discarded; it's properly kept alive by storing the JoinHandle in the struct.

---

## Summary

| Criteria | Status |
|----------|--------|
| Does the diff compile? | YES (after fixing 4 test compilation errors) |
| Any obvious bugs? | 1 MEDIUM (DB not updated post-spawn), 2 LOW, 1 INFORMATIONAL |
| Missing pieces from outline? | Task 5.1 DB update step 4b is missing |
| handle_agent_resume error handling? | GOOD -- covers all expected error paths |
| AcpClient::resume() calls initialize then load_session? | YES |
| _io_task discarded in resume? | NO -- correctly stored in struct |

### Files Modified (server-side)

1. `crates/ws-server/src/agent/acp.rs` -- ACP decomposition, new commands, resume flow
2. `crates/ws-server/src/agent/adapter.rs` -- emit_initialize_response
3. `crates/ws-server/src/agent/handler.rs` -- spawn rewrite, handle_agent_resume
4. `crates/ws-server/src/agent/mod.rs` -- export handle_agent_resume
5. `crates/ws-server/src/agent/jsonrpc_relay.rs` -- session/list stub (no change)
6. `crates/ws-server/src/db/mod.rs` -- migration, new queries
7. `crates/ws-server/src/protocol/acp.rs` -- InitializeResponse event
8. `crates/ws-server/src/protocol/agent.rs` -- AgentResume, Spawning status, new fields
9. `crates/ws-server/src/protocol/common.rs` -- ClientMessagePayload::AgentResume
10. `crates/ws-server/src/router.rs` -- AgentResume routing, handle_get_state updates

### Files Fixed During Review

1. `crates/ws-server/src/bridge/bridge_codec.rs` -- test missing struct fields
2. `crates/ws-server/src/protocol/tests.rs` -- test missing struct fields
3. `crates/ws-server/src/test_fixtures.rs` -- test missing struct fields (2 locations)
