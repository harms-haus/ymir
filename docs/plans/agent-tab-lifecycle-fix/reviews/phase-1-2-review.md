# Phase 1 & 2 Review Report

**Date:** 2026-05-07
**Reviewer:** Review Sub-Orchestrator (automated analysis)
**Scope:** Tasks 1.1, 2.1, 2.2, 3.1, 3.2, 3.3

---

## Compilation Status

**Result: PASS** -- `cargo check -p ymir-ws-server` completes with zero new errors. All 9 warnings are pre-existing (unused imports, unreachable patterns, unused variables).

---

## Per-Task Verdict

### Task 1.1: DB Migration -- PASS

**File:** `crates/ws-server/src/db/mod.rs`

| Requirement | Status | Notes |
|---|---|---|
| Migration SQL (ALTER TABLE + CREATE INDEX) | MATCH | Lines 141-144: exact match to outline spec |
| `agent_tab_id: Option<String>` on `AgentSession` struct | MATCH | Line 181 |
| `create_agent_session()` stores `agent_tab_id` | MATCH | Line 755 includes column in INSERT, line 765 binds param |
| `list_agent_sessions()` returns `agent_tab_id` | MATCH | Line 801 SELECT includes column, line 812 maps to struct |
| `update_agent_session_acp_id()` updates `agent_tab_id` | MATCH | Lines 838-873: partial update pattern for both fields |
| `get_agent_session()` reads `agent_tab_id` | BONUS | Not in outline but correctly implemented (line 780) |

### Task 2.1: Extend AgentStatusUpdate -- PASS

**File:** `crates/ws-server/src/protocol/agent.rs`

| Requirement | Status | Notes |
|---|---|---|
| `acp_session_id: Option<String>` on `AgentStatusUpdate` | MATCH | Line 121 |
| `process_id: Option<u32>` on `AgentStatusUpdate` | MATCH | Line 122 |
| `AgentStatus::Spawning` variant | MATCH | Line 98, first variant in enum |
| `AgentSessionData` struct updated with matching fields | MATCH | Lines 88-89: `acp_session_id`, `process_id` present |
| `agent_tab_id: Uuid` on `AgentStatusUpdate` | BONUS | Line 120 -- not in outline but needed for routing |
| ts-rs `#[ts(export)]` on all types | MATCH | All structs/enums have proper ts-rs derive |

### Task 2.2: AgentResume Protocol Message -- PASS

**Files:** `crates/ws-server/src/protocol/agent.rs`, `crates/ws-server/src/protocol/common.rs`

| Requirement | Status | Notes |
|---|---|---|
| `AgentResume` struct with `worktree_id: Uuid` | MATCH | Lines 54-61 in agent.rs |
| `AgentResume` struct with `agent_tab_id: Uuid` | MATCH | Line 59 in agent.rs |
| ts-rs derives + serde annotations | MATCH | Full derive chain present |
| `AgentResume(AgentResume)` in `ClientMessagePayload` | MATCH | Line 75 in common.rs |
| Import in common.rs `use super::agent::...` | MATCH | Line 10 includes `AgentResume` |

### Task 3.1: AcpCommand Variants -- PASS

**File:** `crates/ws-server/src/agent/acp.rs`

| Requirement | Status | Notes |
|---|---|---|
| `Initialize { agent_tab_id, respond }` variant | MATCH | Lines 70-73 |
| `LoadSession { agent_tab_id, acp_session_id, respond }` variant | MATCH | Lines 74-78 |
| `InitializeResult` with `capabilities: serde_json::Value` | MATCH | Lines 82-84 |
| `SessionLoadResult` with `session_id`, `config_options` | MATCH | Lines 87-90 |

### Task 3.2: Decompose AcpClient::spawn() -- PASS

**File:** `crates/ws-server/src/agent/acp.rs`

| Requirement | Status | Notes |
|---|---|---|
| `spawn()` calls `spawn_stdio()` (connect phase) | MATCH | Line 142 |
| `spawn()` calls `initialize()` after connect | MATCH | Line 155 |
| `spawn()` calls `create_session()` after initialize | MATCH | Line 156 |
| `initialize()` returns `Result<InitializeResult>` | MATCH | Lines 216-230 |
| `initialize()` captures capabilities from response | MATCH | Line 226: `serde_json::to_value(&response.agent_capabilities)` |
| `create_session()` kept as-is | MATCH | Lines 232-251: unchanged logic |
| `load_session()` added, calls `load_session()` on connection | MATCH | Lines 253-277 |
| `load_session()` emits `SessionInit` event via handler | MATCH | Line 268: `self.handler.emit_session_init(...)` |

### Task 3.3: AcpHandle Methods -- PASS

**File:** `crates/ws-server/src/agent/acp.rs`

| Requirement | Status | Notes |
|---|---|---|
| `AcpHandle::initialize()` sends `AcpCommand::Initialize` | MATCH | Lines 443-448 |
| `AcpHandle::load_session()` sends `AcpCommand::LoadSession` | MATCH | Lines 450-458 |
| Match arm for `Initialize` in runtime loop | MATCH | Lines 548-554 |
| Match arm for `LoadSession` in runtime loop | MATCH | Lines 556-563 |
| Error handling when client not found | MATCH | Both arms return descriptive `anyhow!` errors |

---

## Gaps Found

### GAP-1: `agent_tab_id` not persisted to DB in `handle_agent_spawn` (MINOR)

**File:** `crates/ws-server/src/agent/handler.rs`, lines 91-99

The handler generates a fresh `agent_tab_id = Uuid::new_v4()` (line 87) but stores `agent_tab_id: None` in the `AgentSession` DB record (line 96). The generated `agent_tab_id` is used for in-memory state and broadcasts, but never written to the database.

**Impact:** Low. The `agent_tab_id` can be stored in the DB record by changing line 96 to:
```rust
agent_tab_id: Some(agent_tab_id.to_string()),
```

**Also relevant:** The incoming `AgentSpawn` message has an `agent_tab_id: Option<Uuid>` field (from Task 2.1 extension), but the handler ignores it and always generates a new UUID. The outline says the client sends the agent tab ID with the spawn message -- the server should use the client-provided ID when available.

### GAP-2: `acp_session_id` and `process_id` not populated after spawn (MEDIUM)

**File:** `crates/ws-server/src/agent/handler.rs`, lines 174-185

The success broadcast after `spawn_agent()` completes sends `AgentStatusUpdate` with `acp_session_id: None` and `process_id: None` (lines 182-183). Per the outline (Task 5.1), these should contain the actual session ID and process PID after successful spawn.

**Impact:** Medium. Clients won't receive the actual `acp_session_id` or `process_id` after spawn completes. This is partially a Task 5.2 concern (updating `spawn_agent()` internal flow) but the handler should extract and forward these values.

### GAP-3: `handle_agent_resume` not implemented (OUT OF SCOPE)

The `AgentResume` message type is correctly defined (Task 2.2 PASS) and added to the `ClientMessagePayload` enum, but the router dispatches it to `not_implemented()` (router.rs line 354). No `handle_agent_resume()` function exists.

**Assessment:** This is **expected** -- `handle_agent_resume` is Epic 6 (Phase 4+), not part of Phase 1/2. The protocol types being in place is the correct foundation. No action needed for this review.

### GAP-4: `AgentResume` not exported from `agent/mod.rs` (MINOR)

**File:** `crates/ws-server/src/agent/mod.rs`

The `AgentResume` struct is not re-exported from the agent module. It's importable via `crate::protocol::AgentResume` through common.rs, which works. The outline (Task 10.2) calls for ensuring `AgentResume` is exported, but this is a Phase 7 item.

**Assessment:** Not a Phase 1/2 gap. Deferred to Phase 7 (Task 10.2).

---

## Code Quality Notes

1. **Good:** The decomposed `spawn()` maintains backward compatibility -- existing code calling `AcpClient::spawn()` still works as a convenience wrapper.

2. **Good:** `InitializeResult` and `SessionLoadResult` use `serde_json::Value` for capabilities rather than requiring a specific type, making them flexible for forwarding through the bridge.

3. **Good:** `update_agent_session_acp_id()` uses a partial update pattern (only non-None fields), avoiding accidental NULL overwrites.

4. **Minor:** The `load_session()` method duplicates significant logic from `create_session()` (config option merging, session init emission). Could be extracted but not critical.

5. **Minor:** The `AcpClient` struct now has a `session_id: Option<SessionId>` field that starts as `None` after `spawn_stdio()` but the `spawn()` wrapper guarantees it gets set. If callers use the decomposed methods directly, they must ensure the proper sequence.

---

## Summary

| Task | Verdict | Notes |
|------|---------|-------|
| 1.1 DB migration | **PASS** | All requirements met |
| 2.1 Protocol extensions | **PASS** | All requirements met, bonus fields added |
| 2.2 AgentResume message | **PASS** | Struct and enum variant correct |
| 3.1 AcpCommand variants | **PASS** | All variants and result types present |
| 3.2 spawn() decomposition | **PASS** | connect/initialize/create_session/load_session all implemented |
| 3.3 AcpHandle methods | **PASS** | initialize/load_session methods + runtime match arms complete |

**Overall: PASS with 2 minor gaps (GAP-1, GAP-2) that should be addressed before Phase 3/4 integration.**

- GAP-1 is a one-line fix in `handle_agent_spawn` to persist `agent_tab_id` to the DB.
- GAP-2 requires updating the spawn success path to extract and broadcast `acp_session_id` and `process_id` -- partially overlaps with Task 5.2.
