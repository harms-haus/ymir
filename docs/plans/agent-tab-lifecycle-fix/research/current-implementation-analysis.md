# Current Implementation Analysis: Agent Tab Lifecycle

## Executive Summary

The current implementation is **partially aligned** with the spec but has significant gaps in both the new agent tab and resume agent tab lifecycle flows. The most critical issues are:

1. **No resume tab flow exists** -- there is no `AgentResume`/`AgentMount` message type or handler
2. **Server-side lifecycle is bundled** -- `AcpClient::spawn()` performs initialize + session/new atomically in `acp.rs`, with no way to separate these steps or support session loading
3. **Session/list is stubbed** -- the JSON-RPC relay returns a hardcoded empty array instead of querying the ACP runtime
4. **No explicit agent tab status envelope** -- the server broadcasts `AgentStatusUpdate` but does NOT send a dedicated envelope containing all 3 IDs (agent_tab_id, process_id, session_id)
5. **Client-side initialization is server-controlled** -- the client does NOT call `initialize()` or `session/new` via the ACP JSON-RPC relay; the server does this internally during `AcpClient::spawn()`

---

## Spec Step-by-Step Comparison

### New Agent Tab Lifecycle

#### Step 1: [UI] Agent tab is created
**Spec**: UI creates an agent tab.

**Current**: `AgentPane.tsx` lines 75-85, 113-119:
- When the pane mounts with no tabs, `handleSpawnAgent()` sends an `AgentSpawn` message
- The "+" button also triggers `handleSpawnAgent()`
- No UI tab is created client-side until the server broadcasts `AgentStatusUpdate`
- **PARTIAL MATCH**: Tab creation is server-driven via the AgentStatusUpdate broadcast

#### Step 2: [Client] An envelope is sent to the ymir server instructing it to spawn a new agent tab (contains worktree id)
**Spec**: Client sends envelope with worktree ID.

**Current**: `yws-transport.ts` line 481+ sends via `send()`, `bridge-transport.ts` lines 299-309 encode as `AgentSpawn` envelope:
```typescript
export function encodeAgentSpawn(data: Omit<AgentSpawn, 'type'>): FullBridgeEnvelope {
  return makeEnvelope('agent_event', {
    payload: { type: 'AgentSpawn', data }
  });
}
```
**Protocol type**: `AgentSpawn` has `worktreeId`, `agentType`, and optional `agentTabId` (`protocol/agent.rs` lines 10-21).
**MATCH**: Client sends the right envelope type with worktree ID.

#### Step 3: [Server] Receives and decodes the envelope: A new tab is requested
**Spec**: Server receives and decodes.

**Current**: `router.rs` lines 35-98 (`route_json_message`) decodes the bridge envelope, routes `AgentSpawn` to `handle_agent_spawn()` at line 271-273.
**MATCH**: Decoding and routing work correctly.

#### Step 4: [Server] A new tab is created and its state is stored in the db. No session id or process id is stored yet.
**Spec**: Create DB record without session_id or process_id.

**Current**: `handler.rs` lines 85-108:
```rust
let acp_session_id = None;  // ✓ No session ID yet
let session_id = Uuid::new_v4();
let agent_tab_id = Uuid::new_v4();
let db_session = AgentSession {
    id: session_id.to_string(),
    worktree_id: msg.worktree_id.to_string(),
    agent_type: msg.agent_type.clone(),
    acp_session_id,  // None ✓
    status: "idle".to_string(),
    started_at: now,
};
state.db.create_agent_session(&db_session).await;
```
**MATCH**: DB record created with `acp_session_id = None`. Status is set to "idle" rather than a "pending" state, but the session_id being None is correct.

#### Step 5: [Server] A new ACP agent process must be spawned according to the current worktree/workspace settings. A new process spawns and the server waits to connect.
**Spec**: Spawn ACP agent process, wait for connection.

**Current**: `handler.rs` lines 157-203 -- spawns in background via `tokio::spawn`, calls `acp_handle.spawn_agent()`.
`acp.rs` lines 108-137 (`AcpClient::spawn()`):
```rust
let (connection, _io_task, child) = Self::spawn_stdio(agent_type, worktree_path, handler.clone()).await?;
// ...
client.initialize().await?;       // ← IMMEDIATELY initializes
client.create_session(worktree_path).await?;  // ← IMMEDIATELY creates session
```
**GAP**: The server does NOT wait for the agent to connect -- it spawns the process and immediately runs `initialize()` and `create_session()` as part of `AcpClient::spawn()`. The "wait to connect" step is implicit (the `ClientSideConnection::new()` establishes the stdio connection), but there is no separate "waiting for agent" status broadcast BEFORE initialization happens.

#### Step 6: [Server] Sends the new agent tab information including the process ID and status: waiting for agent.
**Spec**: Server sends agent tab info with process ID and "waiting for agent" status.

**Current**: `handler.rs` lines 137-147 -- broadcasts `AgentStatusUpdate` with `AgentStatus::Working`:
```rust
let spawning_msg = ServerMessage::new(ServerMessagePayload::AgentStatusUpdate(
    AgentStatusUpdate {
        id: session_id,
        worktree_id: msg.worktree_id,
        agent_tab_id,
        agent_type: msg.agent_type.clone(),
        status: AgentStatus::Working,  // ← Should be "spawning" / "waiting"
        started_at,
    },
));
state.broadcast(spawning_msg).await;
```
**GAP**: Status is `Working` instead of a distinct "spawning" or "waiting for agent" status. The `AgentStatus` enum (`protocol/agent.rs` lines 84-88) has `Working`, `Waiting`, `Idle` -- `Waiting` exists but is not used for spawn. Also, **no process_id is included** in the `AgentStatusUpdate` -- the protocol type does not have a `process_id` field.

#### Step 7: [Client] Receives and decodes the new agent tab information and updates the status.
**Spec**: Client receives and updates status.

**Current**: `yws-transport.ts` lines 361-386 -- `agent_event` messages go through `handleBridgeMessage()`. `AgentPane.tsx` lines 87-110 listens to `agentSessions` from the store:
```typescript
agentSessions.forEach((session) => {
    if (!addedTabsRef.current.has(session.id) && !tabSessionIds.has(session.id)) {
        // creates tab, gets/creates controller, initializes ACP
    }
});
```
**GAP**: The client creates a tab and immediately calls `acpSessionManager.initialize()` (line 104-106), which sends an ACP `initialize` JSON-RPC request. But the server already ran `initialize()` internally during `AcpClient::spawn()`. This creates a double-initialize scenario.

#### Step 8: [UI] Updates the rendered agent tab content to show "Agent is spawning"
**Spec**: UI shows "Agent is spawning".

**Current**: No dedicated "spawning" UI state exists. The `AgentStatus::Working` status is used, and the UI does not distinguish between "spawning" and "working on a task".
**GAP**: Missing UI state for "agent is spawning".

#### Step 9: [Server] The ACP agent connects
**Spec**: ACP agent connects to server.

**Current**: `acp.rs` lines 139-192 (`spawn_stdio`) -- spawns subprocess with stdio pipes, creates `ClientSideConnection`.
**MATCH**: The agent connects via stdio (not network). This happens automatically when the subprocess starts.

#### Step 10: [Server] Sends the initialize event to the ACP agent which replies with its capabilities
**Spec**: Server sends ACP `initialize` to agent, agent replies with capabilities.

**Current**: `acp.rs` lines 194-205 (`initialize()`):
```rust
let request = InitializeRequest::new(ProtocolVersion::V1)
    .client_capabilities(create_client_capabilities())
    .client_info(create_implementation());
self._connection.initialize(request).await?;
```
**GAP**: This happens INSIDE `AcpClient::spawn()` -- it is NOT a separate server-side step that can be independently observed or forwarded. The capabilities response is received by the SDK but NOT forwarded to the client via the ACP proxy at this point. The server-side initialize response is NOT sent over the bridge.

#### Step 11: [Server] Sends the response of the initialize event over the ACP proxy
**Spec**: Server forwards initialize response to client via ACP proxy.

**Current**: The initialize response from the agent is handled by the `agent_client_protocol` SDK internally. The `YmirClientHandler` (`adapter.rs`) only implements `request_permission`, `session_notification`, `read_text_file`, and `write_text_file`. It does NOT receive or forward the initialize response.
**GAP**: Initialize response is NOT forwarded to the client. The client-side `acpSessionManager.initialize()` call in `AgentPane.tsx` sends its OWN initialize request, which the server's `AcpJsonRpcRelay` handles by returning a hardcoded response (`jsonrpc_relay.rs` lines 198-206):
```rust
fn handle_initialize(&self) -> Value {
    serde_json::json!({
        "capabilities": {
            "supportsToolUse": true,
            "supportsContextUpdate": true,
            "supportsCancellation": true,
        }
    })
}
```
This is a HARDCODED response, not the actual agent capabilities.

#### Step 12: [Client] Receives the response of the initialize event through the ACP proxy
**Spec**: Client receives initialize response.

**Current**: The client's `acpSessionManager.initialize()` sends a JSON-RPC `initialize` request through the ACP payload channel. The server's `AcpJsonRpcRelay.handle_initialize()` returns a hardcoded capabilities object. The `YmirAcpTransport` resolves this as a pending request.
**PARTIAL MATCH**: Client receives A response, but it's hardcoded, not the real agent capabilities.

#### Step 13: [Server] Sends the new session event to the ACP agent which replies with the new session ID.
**Spec**: Server sends `session/new` to agent, agent replies with session ID.

**Current**: `acp.rs` lines 207-226 (`create_session()`):
```rust
let request = NewSessionRequest::new(worktree_path);
let response = self._connection.new_session(request).await?;
self.session_id = Some(response.session_id.clone());
let config_options = merge_session_setup_options(
    response.config_options.as_deref(),
    response.modes.as_ref(),
    response.models.as_ref(),
);
self.handler.emit_session_init(response.session_id.to_string(), config_options);
```
**GAP**: This happens INSIDE `AcpClient::spawn()` alongside initialize. The session creation is NOT a separate, observable step. It runs automatically and the session ID is stored internally.

#### Step 14: [Server] Sends the response of the new session event over the ACP proxy
**Spec**: Server forwards session/new response to client (may include modes, slash commands).

**Current**: The `YmirClientHandler.emit_session_init()` (`adapter.rs` lines 190-204) broadcasts a `SessionInit` ACP event:
```rust
pub fn emit_session_init(&self, acp_session_id: String, config_options: Vec<AcpSessionConfigOption>) {
    self.send_event(AcpEvent::SessionInit(AcpSessionInit {
        acp_session_id,
        capabilities: AcpAgentCapabilities { ... },
        config_options,
    }));
}
```
This goes through `BroadcastingEventSender` (`acp.rs` lines 90-96) as `ServerMessagePayload::AcpWireEvent(envelope)`, which maps to `BridgeMessage::AcpPayload` in the encoder.
**PARTIAL MATCH**: The session info IS forwarded via `SessionInit` event, but this happens inside `AcpClient::spawn()`, not as a separate forwardable step. The modes/slash commands are merged into config_options but not explicitly separated.

#### Step 15: [Client] Receives the response of the new session event through the ACP proxy
**Spec**: Client receives session/new response.

**Current**: `yws-transport.ts` lines 442-461 -- when `eventType === 'SessionInit'`, the client:
1. Updates the agent session with `acpSessionId`
2. Calls `acpSessionManager.handleSessionInit(agentTabId, acpSessionId, configOptions)`
**MATCH**: Client receives and processes SessionInit correctly.

#### Step 16: [Server] Sends the agent tab status in the bridge envelope (not ACP proxy) which should include the agent tab id, process ID, and the new session ID
**Spec**: Dedicated bridge envelope with all 3 IDs.

**Current**: NO dedicated envelope exists. After `create_session()`, the server:
1. Updates `AgentState.status` to "idle" (`handler.rs` lines 163-168)
2. Broadcasts `AgentStatusUpdate` with `AgentStatus::Idle` (`handler.rs` lines 171-181)

The `AgentStatusUpdate` (`protocol/agent.rs` lines 93-107) contains: `id`, `worktree_id`, `agent_type`, `status`, `started_at`, `agent_tab_id`. It does NOT contain:
- `acp_session_id` / `session_id`
- `process_id`

**CRITICAL GAP**: There is no message type that sends `agent_tab_id`, `process_id`, and `session_id` together in a bridge envelope. The `AgentStatusUpdate` has `agent_tab_id` and `id` (session_id) but no `process_id` and it's sent as an AgentEvent, not a dedicated "agent tab status" envelope.

#### Step 17: [Client] Receives the response of the new session event through the ACP proxy
**Spec**: Client receives agent tab status with all 3 IDs.

**Current**: Because Step 16 is missing, this step doesn't happen. The client infers the session ID from the `SessionInit` ACP event (`yws-transport.ts` line 443) and the agent_tab_id from the envelope's routing metadata (line 419).
**GAP**: Client never receives a dedicated status message with all 3 IDs.

#### Step 18: [Server] Sends the session/list event to the ACP agent which replies with the session list
**Spec**: Server sends `session/list` to agent.

**Current**: `jsonrpc_relay.rs` lines 162-163 and 220-222:
```rust
"session/list" => Ok(self.handle_session_list()),
// ...
fn handle_session_list(&self) -> Value {
    serde_json::json!({ "sessions": [] })
}
```
**CRITICAL GAP**: `session/list` returns a HARD CODED empty array. The comment explains this was done to avoid blocking when the ACP runtime was busy, but it means the client NEVER receives the actual session list from the agent. The `AcpHandle.list_sessions()` method exists (`acp.rs` lines 377-381) and could be used, but the relay deliberately doesn't call it.

#### Step 19: [Server] Sends the response of the session/list event over the ACP proxy
**Spec**: Server forwards session/list response.

**Current**: The hardcoded empty array is returned as a JSON-RPC response via `AcpJsonRpcResponse` payload.
**GAP**: Response is hardcoded, not from the actual agent.

#### Step 20: [Client] Receives the session list response
**Spec**: Client receives session list.

**Current**: Client receives an empty sessions list.
**GAP**: Client never gets the real session list.

---

### Resume Agent Tab Lifecycle

#### Step 1: [UI] Agent tab content mounts
**Spec**: UI mounts agent tab content.

**Current**: `AgentPane.tsx` lines 87-110 -- on reconnect, `agentSessions` are populated from the `GetState` response. The store's `agentSessions` array is populated with sessions from DB.
**PARTIAL MATCH**: Resumed tabs appear from the state snapshot, but there is no explicit "mount" message.

#### Step 2: [Client] An envelope is sent to the ymir server instructing it that the agent tab has loaded and is awaiting connection to the agent
**Spec**: Client sends "tab loaded" envelope.

**Current**: NO SUCH MESSAGE EXISTS. There is no `AgentMount`/`AgentResume`/`TabLoaded` message type in the protocol.
**CRITICAL GAP**: Entirely missing.

#### Step 3: [Server] Receives and decodes the envelope: A resumed tab is requested
**Spec**: Server receives resume request.

**Current**: N/A -- no message type exists.
**CRITICAL GAP**: Entirely missing.

#### Step 4: [Server] The agent tab is loaded from the database. Process ID is set to null.
**Spec**: Load from DB, clear process_id.

**Current**: `router.rs` lines 486-500 (`handle_get_state`) -- during state initialization from DB:
```rust
for session in &db_agent_sessions {
    if session.acp_session_id.is_some() {
        // restore session with placeholder agent_tab_id
        agents.insert(session_id, AgentState {
            agent_tab_id: Uuid::new_v4(), // placeholder
            ...
        });
    } else {
        // Clean up stale session from DB
        let _ = state.db.delete_agent_session(&session.id).await;
    }
}
```
**PARTIAL MATCH**: Sessions with `acp_session_id` are restored, but there's no explicit "process_id = null" concept (the `AgentState` struct doesn't have a `process_id` field). A new placeholder `agent_tab_id` is generated on each restore, which loses the original tab-to-session mapping.

#### Step 5: [Server] A new ACP agent process must be spawned
**Spec**: Spawn new ACP agent process.

**Current**: No respawn happens on tab resume. The agent is only spawned via `AgentSpawn`.
**CRITICAL GAP**: No mechanism to respawn an agent for a resumed tab.

#### Steps 6-20: Remaining resume steps
**Current**: Since there's no resume flow, none of these steps are implemented. The `session/load` ACP method is explicitly rejected in `jsonrpc_relay.rs` lines 170-173:
```rust
"session/load" => Err(DispatchError::new(
    CODE_METHOD_NOT_FOUND,
    "not supported",
)),
```
**CRITICAL GAP**: `session/load` is not supported. `session/new` is also rejected (line 165-168). The server-side `AcpClient` only has `create_session()` (new), not a `load_session()` method.

---

## Key Structural Gaps

### 1. Server-Side ACP Lifecycle is Monolithic
**File**: `crates/ws-server/src/agent/acp.rs`

`AcpClient::spawn()` (lines 108-137) performs these steps atomically:
1. Spawn subprocess + establish stdio connection
2. `initialize()` -- sends ACP initialize
3. `create_session()` -- sends ACP session/new

This means:
- The "waiting for agent" state cannot exist separately from initialization
- Initialize response cannot be forwarded independently
- Session creation cannot be replaced with session loading
- The lifecycle cannot be paused between steps

**Needed**: Break `AcpClient::spawn()` into discrete phases:
- `AcpClient::connect()` -- just spawn and connect
- `AcpClient::initialize()` -- send initialize, return capabilities
- `AcpClient::create_session()` / `AcpClient::load_session()` -- session management

### 2. No Agent Tab Status Envelope
**Files**: `crates/ws-server/src/protocol/agent.rs`, `crates/ws-server/src/bridge/bridge_codec.rs`

The `AgentStatusUpdate` type lacks:
- `acp_session_id` field
- `process_id` field (or PID)

There is no `AgentTabStatus` message type that bundles `agent_tab_id`, `process_id`, and `session_id` together.

**Needed**: Either add fields to `AgentStatusUpdate` or create a new `AgentTabStatus` message type.

### 3. session/list is Hardcoded
**File**: `crates/ws-server/src/agent/jsonrpc_relay.rs` lines 220-222

```rust
fn handle_session_list(&self) -> Value {
    serde_json::json!({ "sessions": [] })
}
```

**Needed**: Call `self.acp_handle.list_sessions().await` and return real data. The original blocking issue should be addressed with a different approach (e.g., async with timeout, or a dedicated session list endpoint).

### 4. session/new and session/load Rejected
**File**: `crates/ws-server/src/agent/jsonrpc_relay.rs` lines 165-173

Both `session/new` and `session/load` return "not supported". The server-side ACP lifecycle manages sessions internally rather than delegating to client-initiated JSON-RPC calls.

**Needed**: Either:
- Implement `session/new` and `session/load` in the relay to call the ACP runtime
- Or restructure the lifecycle so the server manages these steps explicitly and forwards results

### 5. No Resume Flow
**Missing entirely**: No `AgentResume`/`AgentMount` message, no handler, no `load_session()` in ACP client.

**Needed**: 
- New `AgentResume` protocol message
- `handle_agent_resume()` handler
- `AcpClient::load_session()` method
- Resume flow in the ACP runtime

### 6. Double Initialization
**Issue**: The server initializes the ACP connection internally (`acp.rs` line 133), AND the client sends its own `initialize()` request (`AgentPane.tsx` line 104). The server's `AcpJsonRpcRelay.handle_initialize()` returns a hardcoded response, not the agent's actual capabilities.

**Needed**: Remove client-side `initialize()` call, or have the server proxy the real initialize response to the client.

### 7. Database Schema Missing Fields
**File**: `crates/ws-server/src/db/mod.rs` lines 39-47

The `agent_sessions` table has:
- `id` (TEXT PRIMARY KEY)
- `worktree_id` (TEXT)
- `agent_type` (TEXT)
- `acp_session_id` (TEXT, nullable)
- `status` (TEXT)
- `started_at` (TEXT)
- `label` (TEXT, added later)
- `position` (INTEGER, added later)
- `updated_at` (TEXT, added later)

**Missing**: No `agent_tab_id` column (the tab ID is generated in-memory and not persisted). No `process_id` column.

**Needed**: Add `agent_tab_id` column to persist the tab-to-session mapping. Optionally add `process_id` if OS-level process tracking is desired.

---

## acp-ws-bridge Library Assessment

**File**: `crates/acp-ws-bridge/src/`

The library provides:
- `BridgeEnvelope` -- versioned envelope with `version`, `seq`, `timestamp_ms`, `extra_data`, `message`
- `BridgeMessage` -- enum with all message variants (AcpPayload, BridgeStatus, AgentEvent, etc.)
- `TransportClient` -- WebSocket client for the bridge protocol
- `ServerConfig` / `run_server` -- generic WS server

**What it provides that's sufficient**:
- Envelope format supports arbitrary metadata via `extra_data`
- `AcpPayload` variant carries opaque JSON-RPC payloads
- TypeScript types are exported via ts-rs

**What it's missing for the lifecycle**:
- No dedicated `AgentTabStatus` message variant in `BridgeMessage`
- No special handling for agent lifecycle state transitions

**Library boundary note**: Adding an `AgentTabStatus` variant would be a legitimate library enhancement since it's a generic bridge message type, not ymir-specific.

---

## Client-Side Assessment

### acp-session-manager.ts
**What works**:
- `getOrCreateController()` -- creates SessionController per agent tab
- `initialize()` -- sends ACP initialize JSON-RPC
- `createSession()` -- sends ACP session/new JSON-RPC
- `loadSession()` -- sends ACP session/load JSON-RPC
- `handleAcpPayloadByAgentTabId()` -- routes ACP payloads by agent_tab_id
- `handleSessionInit()` -- sets session ID on controller
- `YmirAcpTransport` -- bridges ymir WS to SessionController Transport interface

**Issues**:
- `AgentPane.tsx` calls `initialize()` automatically on tab creation (line 104), which conflicts with the server-side initialize
- No mechanism to coordinate client-side session creation with server-side spawning

### yws-transport.ts
**What works**:
- `handleEnvelope()` correctly routes `acp_payload` messages
- `handleAcpPayload()` extracts `agentTabId` from envelope metadata
- SessionInit handler updates both store and SessionController
- `broadcastJsonRpcResponse()` fans out responses to all transports

**Issues**:
- No handling for a dedicated "agent tab status" envelope
- No `AgentResume` message encoder

### AgentPane.tsx
**What works**:
- Creates tabs when `agentSessions` appear in store
- Calls `handleSpawnAgent()` to create new agents
- Cleans up SessionController on tab close

**Issues**:
- No "spawning" UI state
- No resume/mount flow
- Calls `initialize()` automatically, causing double-init

---

## Summary of Required Changes

### Server-Side (ws-server)

| Priority | Change | Files |
|----------|--------|-------|
| P0 | Break `AcpClient::spawn()` into connect → initialize → create_session phases | `agent/acp.rs` |
| P0 | Add `AgentTabStatus` message type with agent_tab_id, process_id, session_id | `protocol/agent.rs`, `bridge/bridge_codec.rs` |
| P0 | Send `AgentTabStatus` after session creation with all 3 IDs | `agent/handler.rs`, `agent/acp.rs` |
| P0 | Forward real initialize response to client via ACP proxy | `agent/acp.rs`, `agent/adapter.rs` |
| P0 | Implement `session/load` in AcpClient and jsonrpc_relay | `agent/acp.rs`, `agent/jsonrpc_relay.rs` |
| P1 | Fix `session/list` to return real data from ACP runtime | `agent/jsonrpc_relay.rs` |
| P1 | Add `AgentResume` message type and handler | `protocol/agent.rs`, `agent/handler.rs`, `router.rs` |
| P1 | Add `agent_tab_id` column to `agent_sessions` DB table | `db/mod.rs` |
| P2 | Add distinct "spawning" status to AgentStatus enum | `protocol/agent.rs` |

### Client-Side (web)

| Priority | Change | Files |
|----------|--------|-------|
| P0 | Remove automatic `initialize()` call from AgentPane | `components/agent/AgentPane.tsx` |
| P0 | Implement resume/mount flow with AgentResume message | `components/agent/AgentPane.tsx`, `lib/bridge-transport.ts` |
| P1 | Add "Agent is spawning" UI state | `components/agent/AgentPane.tsx` |
| P1 | Handle AgentTabStatus envelope in yws-transport | `lib/yws-transport.ts` |
| P2 | Add AgentResume encoder to bridge-transport | `lib/bridge-transport.ts` |

### Library (acp-ws-bridge)

| Priority | Change | Files |
|----------|--------|-------|
| P1 | Add `AgentTabStatus` BridgeMessage variant (optional -- can be done in ws-server AgentEvent) | `contract/message.rs` |
