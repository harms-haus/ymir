# Agent Tab Lifecycle Fix -- Implementation Outline

## High-Level Approach

Fix the agent tab lifecycle by decomposing the monolithic `AcpClient::spawn()` into discrete phases, adding a resume flow, extending `AgentStatusUpdate` with missing fields, removing the client-side double-initialize, and fixing the `session/list` relay.

### Key Architectural Decisions (Resolved)

1. **AcpClient::spawn() decomposition**: Break into `connect()` (spawn process + stdio), `initialize()` (ACP initialize, return capabilities), and `create_session()` / `load_session()`. The existing `spawn()` becomes a thin wrapper calling all three in sequence. New `AcpHandle` commands are added: `Initialize` and `LoadSession`. State transitions: `Spawning` → `Connected` → `Initialized` → `SessionReady`.

2. **AgentTabStatus message**: Extend existing `AgentStatusUpdate` in ws-server protocol (`protocol/agent.rs`) with `acp_session_id` and `process_id` fields. Rationale: AgentTabStatus is a ymir-specific lifecycle concept, not a generic bridge concern. The bridge already carries `AgentStatusUpdate` as `BridgeMessage::AgentEvent` with opaque JSON payload. Adding fields to the existing struct avoids polluting the library boundary and maintains backward compatibility via optional/nullable fields.

3. **session/new and session/load in JSON-RPC relay**: Keep rejecting them in the relay ("not supported -- managed by server lifecycle"). The spec explicitly says the SERVER sends these during spawn/resume. They are not client-initiated. The server manages them as internal lifecycle steps and forwards results over the ACP proxy.

4. **Double initialization fix**: Remove the client-side `initialize()` call from AgentPane. The server proxies the real agent capabilities response via a new `InitializeResponse` ACP event emitted after `initialize()` completes. The client-side `acpSessionManager` will still call `initialize()` on `YmirAcpTransport` but the server's relay will now forward the real response instead of returning hardcoded capabilities.

5. **Resume flow message**: New `AgentResume` protocol message with fields `agentTabId` (UUID) and `worktreeId` (UUID). The server looks up the existing session by `agentTabId` in DB, extracts the `acp_session_id`, and uses it for `session/load`.

6. **Database migration**: Add `agent_tab_id TEXT` column to `agent_sessions` table (nullable for backward compatibility). Update existing handler to persist `agent_tab_id`. No `process_id` column -- process IDs are ephemeral OS-level identifiers that don't need persistence.

7. **Library boundary rule**: All new protocol types, ACP lifecycle decomposition, and handler logic belong in ws-server. The `acp-ws-bridge` library remains untouched (no new BridgeMessage variants needed). Client-side changes live in the web app.

---

## Epic 1: Database Schema Migration

### Task 1.1: Add agent_tab_id column to agent_sessions table
- **File**: `crates/ws-server/src/db/mod.rs`
- **Change**: Add migration to `SCHEMA_MIGRATIONS` array:
  ```sql
  ALTER TABLE agent_sessions ADD COLUMN agent_tab_id TEXT;
  CREATE INDEX IF NOT EXISTS idx_agent_sessions_tab ON agent_sessions(agent_tab_id);
  ```
- **Add**: `agent_tab_id: Option<String>` field to `AgentSession` struct
- **Update**: `create_agent_session()` to accept and store `agent_tab_id`
- **Update**: `list_agent_sessions()` to return `agent_tab_id`
- **Update**: `update_agent_session_acp_id()` to also update `agent_tab_id` when setting ACP session ID
- **Risk**: Low. Migration is additive (ALTER TABLE ADD COLUMN). Existing rows get NULL for `agent_tab_id`.
- **Dependency**: None

### Task 1.2: Persist agent_tab_id in handle_agent_spawn
- **File**: `crates/ws-server/src/agent/handler.rs`
- **Change**: Update `AgentSession` construction in `handle_agent_spawn()` to include `agent_tab_id: Some(agent_tab_id.to_string())`
- **Risk**: Low. Backward compatible -- existing DB rows with NULL agent_tab_id still work.
- **Dependency**: Task 1.1

---

## Epic 2: Protocol Extensions

### Task 2.1: Extend AgentStatusUpdate with acp_session_id and process_id
- **File**: `crates/ws-server/src/protocol/agent.rs`
- **Change**: Add fields to `AgentStatusUpdate` struct:
  ```rust
  pub acp_session_id: Option<String>,
  pub process_id: Option<u32>,
  ```
- **Add**: New `AgentStatus::Spawning` variant to `AgentStatus` enum (distinct from Working).
- **Change**: Update `AgentSessionData` struct to match (same fields for GetState serialization).
- **Risk**: Low. New fields are Option types, backward compatible with existing clients that ignore unknown fields.
- **Dependency**: None

### Task 2.2: Add AgentResume protocol message
- **File**: `crates/ws-server/src/protocol/agent.rs`
- **Add**: New `AgentResume` struct:
  ```rust
  pub struct AgentResume {
      pub worktree_id: Uuid,
      pub agent_tab_id: Uuid,
  }
  ```
- **File**: `crates/ws-server/src/protocol/common.rs`
- **Add**: `AgentResume(AgentResume)` variant to `ClientMessagePayload` enum.
- **Risk**: Low. New enum variant, no breaking changes.
- **Dependency**: Task 2.1

---

## Epic 3: ACP Client Decomposition (Server-Side)

### Task 3.1: Add AcpCommand variants for Initialize and LoadSession
- **File**: `crates/ws-server/src/agent/acp.rs`
- **Add**: New `AcpCommand` variants:
  ```rust
  Initialize {
      agent_tab_id: Uuid,
      respond: oneshot::Sender<Result<InitializeResult>>,
  },
  LoadSession {
      agent_tab_id: Uuid,
      acp_session_id: String,
      respond: oneshot::Sender<Result<SessionLoadResult>>,
  },
  ```
- **Add**: `InitializeResult` struct containing agent capabilities as serde_json::Value.
- **Add**: `SessionLoadResult` struct containing session ID and config options.
- **Risk**: Medium. New command variants require corresponding match arms in the runtime loop.
- **Dependency**: None

### Task 3.2: Decompose AcpClient::spawn() into connect/initialize/session phases
- **File**: `crates/ws-server/src/agent/acp.rs`
- **Change**: Split `AcpClient::spawn()`:
  - New `AcpClient::connect()` -- calls `spawn_stdio()`, returns `Self` with session_id=None
  - `AcpClient::initialize()` -- already exists, but change return type to `Result<InitializeResult>` to return capabilities
  - `AcpClient::create_session()` -- already exists, keep as-is
  - New `AcpClient::load_session()` -- similar to `create_session()` but calls `self._connection.load_session()` with existing session ID, emits `SessionInit` event with modes/slash commands
  - Keep `AcpClient::spawn()` as a convenience wrapper calling connect → initialize → create_session (for backward compat in tests)
- **Change**: `AcpClient::initialize()` to capture and return the capabilities response from `self._connection.initialize()`:
  ```rust
  async fn initialize(&mut self) -> Result<InitializeResult> {
      let request = InitializeRequest::new(ProtocolVersion::V1)
          .client_capabilities(create_client_capabilities())
          .client_info(create_implementation());
      let response = self._connection.initialize(request).await
          .map_err(|e| anyhow!("Initialize failed: {}", e))?;
      // Convert response capabilities to serde_json::Value for forwarding
      Ok(InitializeResult { capabilities: /* serialize response.capabilities */ })
  }
  ```
- **Risk**: High. Core lifecycle change. Requires careful handling of the `ClientSideConnection` state -- initialize must only be called once per connection.
- **Dependency**: Task 3.1

### Task 3.3: Add AcpHandle methods for initialize and load_session
- **File**: `crates/ws-server/src/agent/acp.rs`
- **Add**: `AcpHandle::initialize()` method sending `AcpCommand::Initialize`
- **Add**: `AcpHandle::load_session()` method sending `AcpCommand::LoadSession`
- **Add**: Match arms in `start_acp_runtime()` loop for the new commands:
  ```rust
  AcpCommand::Initialize { agent_tab_id, respond } => {
      let result = if let Some(client) = clients.get_mut(&agent_tab_id) {
          client.initialize().await
      } else { /* error */ };
      let _ = respond.send(result);
  }
  AcpCommand::LoadSession { agent_tab_id, acp_session_id, respond } => {
      let result = if let Some(client) = clients.get_mut(&agent_tab_id) {
          client.load_session(&acp_session_id).await
      } else { /* error */ };
      let _ = respond.send(result);
  }
  ```
- **Risk**: Medium. New async message-passing to the ACP runtime. Must handle case where client doesn't exist.
- **Dependency**: Task 3.1, Task 3.2

---

## Epic 4: Forward Initialize Response to Client

### Task 4.1: Emit InitializeResponse ACP event after server-side initialize
- **File**: `crates/ws-server/src/agent/adapter.rs`
- **Add**: `emit_initialize_response()` method to `YmirClientHandler`:
  ```rust
  pub fn emit_initialize_response(&self, capabilities: serde_json::Value) {
      self.send_event(AcpEvent::InitializeResponse(AcpInitializeResponse {
          capabilities,
      }));
  }
  ```
- **File**: `crates/ws-server/src/protocol/acp_events.rs` (or wherever AcpEvent is defined)
- **Add**: `InitializeResponse(AcpInitializeResponse)` variant to `AcpEvent` enum
- **Add**: `AcpInitializeResponse` struct with `capabilities: serde_json::Value`
- **Change**: `AcpClient::initialize()` to call `self.handler.emit_initialize_response(capabilities)` after receiving the response
- **Risk**: Medium. New event type must be serialized through the bridge as `BridgeMessage::AcpPayload`. Client must handle it.
- **Dependency**: Task 3.2

---

## Epic 5: Rewrite Spawn Handler with Phased Lifecycle

### Task 5.1: Rewrite handle_agent_spawn() with phased lifecycle
- **File**: `crates/ws-server/src/agent/handler.rs`
- **Change**: Replace the current `handle_agent_spawn()` with phased approach:
  1. Validate worktree, create DB record (with agent_tab_id)
  2. Add to state with status "spawning"
  3. Broadcast `AgentStatusUpdate` with `AgentStatus::Spawning`, no acp_session_id
  4. Spawn background task that:
     a. Calls `acp_handle.spawn_agent()` (connect + initialize + create_session, done internally by ACP runtime)
     b. On success, updates DB with `acp_session_id`, updates in-memory state
     c. Broadcasts `AgentStatusUpdate` with `AgentStatus::Idle`, `acp_session_id`, and `process_id`
  5. The `spawn_agent()` internally now emits `InitializeResponse` ACP event which the client receives
- **Change**: Use `AgentStatus::Spawning` instead of `AgentStatus::Working` for the initial broadcast
- **Risk**: High. Core handler rewrite. Must coordinate with ACP runtime changes.
- **Dependency**: Task 1.2, Task 2.1, Task 3.2, Task 3.3, Task 4.1

### Task 5.2: Update AcpHandle::spawn_agent() to support phased execution
- **File**: `crates/ws-server/src/agent/acp.rs`
- **Change**: The `spawn_agent()` internal logic now calls connect, then initialize (emitting capabilities event), then create_session (emitting SessionInit event). The broadcast of `InitializeResponse` happens inside the initialize step.
- **Risk**: Medium. Changes the internal flow of spawn_agent.
- **Dependency**: Task 3.2, Task 3.3, Task 4.1

---

## Epic 6: Implement Resume Flow

### Task 6.1: Add handle_agent_resume() handler
- **File**: `crates/ws-server/src/agent/handler.rs`
- **Add**: `handle_agent_resume()` function:
  1. Validate worktree exists
  2. Look up existing agent_session in DB by `agent_tab_id`
  3. If session not found or no `acp_session_id`, return error
  4. Load session from DB, verify `acp_session_id` is present
  5. Add to in-memory state with status "spawning"
  6. Broadcast `AgentStatusUpdate` with `AgentStatus::Spawning`
  7. Spawn background task that:
     a. Calls `acp_handle.connect()` to spawn new process
     b. Calls `acp_handle.initialize()` -- emits `InitializeResponse`
     c. Calls `acp_handle.load_session(acp_session_id)` -- emits `SessionInit` + subsequent `SessionUpdate` events
     d. On success, updates in-memory state to "idle"
     e. Broadcasts `AgentStatusUpdate` with `AgentStatus::Idle`, `acp_session_id`
- **Risk**: High. Entirely new code path.
- **Dependency**: Task 3.2, Task 3.3, Task 4.1, Task 5.2

### Task 6.2: Wire AgentResume in router
- **File**: `crates/ws-server/src/router.rs`
- **Add**: Import `handle_agent_resume`
- **Add**: Route `ClientMessagePayload::AgentResume(msg)` → `handle_agent_resume(state, msg)`
- **File**: `crates/ws-server/src/agent/mod.rs`
- **Add**: Export `handle_agent_resume` from handler module
- **Risk**: Low. Simple wiring.
- **Dependency**: Task 6.1

---

## Epic 7: Fix JSON-RPC Relay

### Task 7.1: Fix session/list to return real data
- **File**: `crates/ws-server/src/agent/jsonrpc_relay.rs`
- **Change**: `handle_session_list()` to call `self.acp_handle.list_sessions().await` and construct a proper response:
  ```rust
  async fn handle_session_list(&self) -> Value {
      let sessions = self.acp_handle.list_sessions().await;
      let sessions_json: Vec<Value> = sessions.iter().map(|s| {
          serde_json::json!({
              "sessionId": s.acp_session_id,
              "agentTabId": s.agent_tab_id.to_string(),
          })
      }).collect();
      serde_json::json!({ "sessions": sessions_json })
  }
  ```
- **Change**: Make `handle_session_list` async. Update `dispatch()` to `.await` it.
- **Address blocking concern**: The original comment explains that calling `list_sessions()` was blocking the ACP runtime channel. The new approach uses `.await` on the oneshot channel, which is non-blocking for the relay's async context. The ACP runtime's `ListSessions` command is a simple HashMap iteration -- it is O(n) and should be fast enough.
- **Risk**: Medium. The original blocking issue was real. If the ACP runtime is busy, the await could delay other relay operations. Consider adding a timeout fallback: if `list_sessions()` doesn't respond within 5 seconds, return empty array.
- **Dependency**: Task 3.1

### Task 7.2: Keep session/new and session/load rejected in relay
- **File**: `crates/ws-server/src/agent/jsonrpc_relay.rs`
- **Decision**: No change. Keep returning `CODE_METHOD_NOT_FOUND` for `session/new` and `session/load`. These are managed by the server lifecycle, not by client-initiated JSON-RPC calls. Update error message to clarify: "not supported -- managed by server lifecycle (use AgentSpawn or AgentResume)".
- **Risk**: None. No behavior change.
- **Dependency**: None

### Task 7.3: Update handle_initialize to forward real capabilities (optional path)
- **Decision**: Since we're removing the client-side `initialize()` call (Task 8.1), the relay's `handle_initialize()` is no longer called during normal lifecycle. Keep it as-is (returns hardcoded response) as a fallback for any ad-hoc client-side initialize calls. The real capabilities come via the `InitializeResponse` ACP event (Task 4.1).
- **Risk**: None. No behavior change during normal lifecycle.
- **Dependency**: Task 8.1

---

## Epic 8: Client-Side Changes (Web App)

### Task 8.1: Remove automatic initialize() call from AgentPane
- **File**: `apps/web/src/components/agent/AgentPane.tsx`
- **Change**: Remove the `acpSessionManager.initialize()` call that happens automatically when a new tab is created. The server now handles initialization and forwards the response via ACP proxy.
- **Change**: The `YmirAcpTransport.initialize()` method should still exist but the call should be triggered only when the client receives the `InitializeResponse` ACP event, not proactively on tab creation.
- **Risk**: Medium. Must ensure no other code path depends on the auto-initialize. The client needs to be ready to receive and process `InitializeResponse` events.
- **Dependency**: Task 4.1

### Task 8.2: Handle InitializeResponse ACP event
- **File**: `apps/web/src/lib/yws-transport.ts` (or equivalent)
- **Add**: Handler for `eventType === 'InitializeResponse'`:
  1. Extract `agentTabId` from envelope metadata
  2. Extract `capabilities` from event payload
  3. Store capabilities in the SessionController or acp-session-manager
  4. Mark the agent tab as "initialized"
- **Risk**: Medium. New event handler. Must route by agentTabId correctly.
- **Dependency**: Task 4.1

### Task 8.3: Implement AgentResume message encoder
- **File**: `apps/web/src/lib/bridge-transport.ts`
- **Add**: `encodeAgentResume(data: { agentTabId: string; worktreeId: string })`:
  ```typescript
  export function encodeAgentResume(data: Omit<AgentResume, 'type'>): FullBridgeEnvelope {
      return makeEnvelope('agent_event', {
          payload: { type: 'AgentResume', data }
      });
  }
  ```
- **File**: TypeScript type definitions (generated by ts-rs from ws-server protocol)
- **Note**: Types are auto-generated via ts-rs from the Rust structs. When `AgentResume` is added to ws-server protocol, run the type generation.
- **Risk**: Low. Simple encoder function.
- **Dependency**: Task 2.2

### Task 8.4: Call AgentResume when mounting existing agent tab
- **File**: `apps/web/src/components/agent/AgentPane.tsx` (or relevant mount component)
- **Add**: When an existing agent tab (with `acp_session_id`) is mounted/navigated to:
  1. Send `AgentResume` message to server
  2. Show "Agent is spawning" UI state
  3. Wait for `InitializeResponse` + `SessionInit` events
  4. Resume rendering session history from `session/update` events
- **Risk**: High. New UI flow. Must coordinate with the existing tab lifecycle.
- **Dependency**: Task 6.1, Task 8.2, Task 8.3

### Task 8.5: Add "Agent is spawning" UI state
- **File**: `apps/web/src/components/agent/AgentPane.tsx`
- **Change**: Add UI state for `AgentStatus::Spawning` -- show "Agent is spawning" spinner/message
- **Change**: Update status handling to distinguish between `Spawning`, `Working`, `Waiting`, and `Idle`
- **Risk**: Low. UI-only change.
- **Dependency**: Task 2.1

### Task 8.6: Handle updated AgentStatusUpdate with acp_session_id
- **File**: `apps/web/src/lib/yws-transport.ts`
- **Change**: Update `handleBridgeMessage()` for `AgentStatusUpdate` events to process the new `acpSessionId` and `processId` fields
- **Change**: Update store to store `acpSessionId` on the agent session record
- **Risk**: Low. Fields are optional, backward compatible.
- **Dependency**: Task 2.1

---

## Epic 9: GetState Integration

### Task 9.1: Update handle_get_state to include agent_tab_id
- **File**: `crates/ws-server/src/router.rs`
- **Change**: In `handle_get_state()`, when restoring agent sessions from DB:
  1. Use the stored `agent_tab_id` instead of generating a new placeholder UUID
  2. If `agent_tab_id` is NULL in DB (legacy data), generate a new UUID and log a warning
  3. Set process_id to None for restored sessions (no active process)
  4. Include `acp_session_id` in the returned `AgentSessionData`
- **Risk**: Medium. Affects reconnect behavior.
- **Dependency**: Task 1.1, Task 1.2, Task 2.1

---

## Epic 10: Export and Module Updates

### Task 10.1: Update agent module exports
- **File**: `crates/ws-server/src/agent/mod.rs`
- **Add**: Export `handle_agent_resume` from handler module
- **Risk**: Low. Simple re-export.
- **Dependency**: Task 6.1

### Task 10.2: Update protocol module exports
- **File**: `crates/ws-server/src/protocol/mod.rs`
- **Add**: Ensure `AgentResume` is exported from the agent submodule
- **Risk**: Low. Simple re-export.
- **Dependency**: Task 2.2

---

## Dependency Graph (Execution Order)

```
Phase 1: Foundation (can be done first, all parallelizable)
├── Task 1.1: DB migration (agent_tab_id column)
├── Task 2.1: Protocol extensions (AgentStatusUpdate fields, Spawning status)
└── Task 2.2: AgentResume protocol message

Phase 2: ACP Runtime (depends on Phase 1 protocol types)
├── Task 3.1: New AcpCommand variants
├── Task 3.2: Decompose AcpClient::spawn()
└── Task 3.3: AcpHandle methods for initialize/load_session

Phase 3: Event Forwarding (depends on Phase 2)
├── Task 4.1: Emit InitializeResponse ACP event

Phase 4: Handler Rewrites (depends on Phase 2, 3, and Phase 1)
├── Task 5.1: Rewrite handle_agent_spawn()
├── Task 5.2: Update AcpHandle::spawn_agent() internal flow
├── Task 6.1: Implement handle_agent_resume()
└── Task 6.2: Wire AgentResume in router

Phase 5: JSON-RPC Relay (depends on Phase 2)
├── Task 7.1: Fix session/list
├── Task 7.2: Keep session/new/load rejected
└── Task 7.3: handle_initialize (no-op)

Phase 6: Client-Side (depends on Phase 3, 4)
├── Task 8.1: Remove auto-initialize from AgentPane
├── Task 8.2: Handle InitializeResponse event
├── Task 8.3: AgentResume encoder
├── Task 8.4: Call AgentResume on mount
├── Task 8.5: "Spawning" UI state
└── Task 8.6: Handle updated AgentStatusUpdate

Phase 7: Integration (depends on Phase 1, 4)
├── Task 9.1: Update handle_get_state
├── Task 10.1: Update agent module exports
└── Task 10.2: Update protocol module exports
```

---

## Risk Assessment

| Task | Risk | Mitigation |
|------|------|------------|
| 1.1 DB migration | Low | Additive-only migration. NULL default for new column. |
| 2.1 Protocol extensions | Low | Optional fields, backward compatible. ts-rs auto-generates TS types. |
| 2.2 AgentResume message | Low | Simple struct addition. |
| 3.1 New AcpCommand variants | Medium | Requires match arms in runtime loop. Add unit tests for each command path. |
| 3.2 Decompose AcpClient::spawn() | **High** | Core lifecycle change. The `ClientSideConnection::initialize()` can only be called once. Must ensure no double-initialize. Test with mock agent. |
| 3.3 AcpHandle methods | Medium | New message-passing paths. Add timeout handling. |
| 4.1 InitializeResponse event | Medium | New event type. Must be serializable through the bridge. Test end-to-end. |
| 5.1 Rewrite handle_agent_spawn() | **High** | Core handler. Must not break existing spawn behavior. Keep old behavior behind a feature flag during transition if needed. |
| 5.2 Update spawn_agent internal | Medium | Changes the internal spawn flow. Test with real agent processes. |
| 6.1 handle_agent_resume() | **High** | Entirely new code path. Must handle missing sessions, stale data, and process failures. |
| 6.2 Wire AgentResume | Low | Simple routing addition. |
| 7.1 Fix session/list | Medium | Original blocking concern. Add timeout fallback. Monitor for ACP runtime contention. |
| 8.1 Remove auto-initialize | Medium | Could break if server-side initialize isn't working. Keep as fallback. |
| 8.2 InitializeResponse handler | Medium | New client-side event handler. Must route correctly by agentTabId. |
| 8.3 AgentResume encoder | Low | Simple TypeScript function. |
| 8.4 AgentResume on mount | **High** | New UI flow. Must handle race conditions (mount before server responds). |
| 8.5 Spawning UI state | Low | UI-only change. |
| 8.6 Updated AgentStatusUpdate | Low | Optional fields, backward compatible. |
| 9.1 handle_get_state | Medium | Affects reconnect. Test with existing DB records. |
| 10.1-10.2 Module exports | Low | Simple re-exports. |

---

## File Change Summary

| File | Change Type | Tasks |
|------|-------------|-------|
| `crates/ws-server/src/db/mod.rs` | Modify | 1.1 |
| `crates/ws-server/src/protocol/agent.rs` | Modify | 2.1, 2.2 |
| `crates/ws-server/src/protocol/common.rs` | Modify | 2.2 |
| `crates/ws-server/src/protocol/acp_events.rs` | Modify | 4.1 |
| `crates/ws-server/src/agent/acp.rs` | Modify | 3.1, 3.2, 3.3, 5.2 |
| `crates/ws-server/src/agent/adapter.rs` | Modify | 4.1 |
| `crates/ws-server/src/agent/handler.rs` | Modify | 1.2, 5.1, 6.1 |
| `crates/ws-server/src/agent/mod.rs` | Modify | 6.2, 10.1 |
| `crates/ws-server/src/agent/jsonrpc_relay.rs` | Modify | 7.1, 7.2 |
| `crates/ws-server/src/router.rs` | Modify | 6.2, 9.1 |
| `crates/acp-ws-bridge/src/contract/message.rs` | **No change** | -- |
| `apps/web/src/lib/bridge-transport.ts` | Add | 8.3 |
| `apps/web/src/lib/yws-transport.ts` | Modify | 8.2, 8.6 |
| `apps/web/src/components/agent/AgentPane.tsx` | Modify | 8.1, 8.4, 8.5 |
| `crates/ws-server/src/state.rs` | Modify (minor) | 9.1 -- may need process_id field in AgentState if desired |

**Note**: The `acp-ws-bridge` library requires zero changes. All new protocol types and lifecycle logic are within ws-server boundaries. This respects the library boundary constraint.
