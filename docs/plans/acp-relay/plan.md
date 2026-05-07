# ACP JSON-RPC Relay — Implementation Plan

## Branch: `feat/acp-jsonrpc-relay`

---

## R1: ACP JSON-RPC Dispatcher Module

**File**: `crates/ws-server/src/agent/jsonrpc_relay.rs`

Create a new module that:
1. Takes an inbound JSON-RPC value from `BridgeMessage::AcpPayload { payload }`
2. Extracts `method` and `id` from the JSON-RPC envelope
3. Dispatches to the appropriate handler
4. Returns a JSON-RPC response value

### JSON-RPC Method Handlers

| Method | Action | Response |
|--------|--------|----------|
| `initialize` | Return static capabilities | `{ capabilities: { supports_tool_use: true, supports_context_update: true, supports_cancellation: true }, sessionId: null }` |
| `session/list` | Query AcpHandle for active sessions | `{ sessions: [] }` (or list of active agent tabs) |
| `session/new` | Map to AcpHandle::Spawn | `{ sessionId: "<agent_tab_id>" }` |
| `session/load` | Resume existing session | `{ sessionId: "<id>" }` |
| `session/prompt` | Map to AcpHandle::SendPrompt | `{ sessionId: "<id>" }` |
| `session/cancel` | Map to AcpHandle::Cancel | `{}` |
| `session/set_config_option` | Map to AcpHandle::SetSessionConfigOption | `{}` |

### Struct Design

```rust
pub struct AcpJsonRpcRelay {
    acp_handle: AcpHandle,
}

impl AcpJsonRpcRelay {
    pub fn new(acp_handle: AcpHandle) -> Self;
    
    pub async fn handle_request(
        &self,
        client_id: Uuid,
        payload: serde_json::Value,
    ) -> Option<serde_json::Value>;
}
```

### Key Considerations
- `initialize` and `session/list` can be handled synchronously without AcpHandle
- `session/prompt`, `session/cancel`, `session/set_config_option` need AcpHandle
- `session/new` needs worktree_id from the client context — the relay needs access to AppState to look up which worktree the client is in
- JSON-RPC `id` must be echoed back in responses
- JSON-RPC notifications (no `id` field) like `session/cancel` don't need responses

---

## R2: Router Integration

**File**: `crates/ws-server/src/router.rs`

Change the `DecodedMessage::NonClient` branch from dropping to dispatching:

```rust
DecodedMessage::NonClient(msg) => {
    match &msg {
        BridgeMessage::AcpPayload { payload } => {
            state.acp_relay()
                .handle_request(client_id, payload.clone())
                .await
                .map(|response_payload| {
                    ServerMessage::new(
                        ServerMessagePayload::AcpWireEvent(
                            // Create response envelope with the JSON-RPC response
                        )
                    )
                })
        }
        _ => {
            tracing::debug!(...);
            None
        }
    }
}
```

### Key Changes
- `route_json_message` needs `&Arc<AppState>` (already has it via `state.clone()`)
- AppState needs to hold `AcpJsonRpcRelay` or expose it
- The relay response must be wrapped in `BridgeMessage::AcpPayload` → `BridgeEnvelope` → sent back to client

---

## R3: AcpHandle Extensions

**File**: `crates/ws-server/src/agent/acp.rs`

Add new `AcpCommand` variants:

```rust
enum AcpCommand {
    // ... existing variants ...
    
    /// List all active agent_tab_ids and their session info
    ListSessions {
        respond: oneshot::Sender<Vec<SessionInfo>>,
    },
}

pub struct SessionInfo {
    pub agent_tab_id: Uuid,
    pub worktree_id: Uuid,
    pub status: AgentStatus,
    pub acp_session_id: Option<String>,
}
```

The runtime loop handles `ListSessions` by iterating `clients` map.

---

## R4: Wire Dispatcher to AcpHandle + AppState

**File**: `crates/ws-server/src/state.rs`, `crates/ws-server/src/agent/mod.rs`

1. Create `AcpJsonRpcRelay` alongside `AcpHandle` in `AppState::new()`
2. Store relay in `AppState` (or expose via method)
3. The relay needs to know which worktree a client is associated with
   - Option A: Query hub for client→worktree mapping
   - Option B: Include worktree_id in a new envelope field
   - Option C: Use existing session tracking to find the worktree

### Client→Worktree Resolution
The hub already tracks client connections. When a client sends an `acp_payload`, we need to know which worktree's agent to route to. The simplest approach:
- Each client is associated with exactly one active worktree (from the UI)
- The relay queries the hub/client state for the client's active worktree
- Falls back to the first (or only) worktree if not explicitly set

---

## R5: Integration Verification

1. Start server + client
2. Open agent tab
3. Verify Composer transitions from `disconnected` → `connected` → `initialized`
4. Send a prompt through the Composer
5. Verify the agent receives the prompt and responds
6. Verify existing `AgentSend` message type still works (backward compat)
7. Check settings row loads model/mode options from `configOptionsChange`

---

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| JSON-RPC `session/new` needs worktree context | Query client state for worktree association |
| AcpClient uses stdio/ACP SDK, not JSON-RPC | We translate JSON-RPC → AcpHandle commands, don't bypass the SDK |
| SessionController expects specific response shapes | Match the ACP protocol response format exactly |
| Concurrent requests from multiple tabs | Each agent_tab_id has its own AcpClient; relay routes by worktree/tab |
| Breaking existing AgentSend path | Both paths coexist — the relay is additive, not replacing |

---

## Out of Scope
- `session/load` with full history replay
- Agent-initiated filesystem/terminal JSON-RPC requests (already handled via existing mechanism)
- `session/update` notification routing (already works via broadcast)
