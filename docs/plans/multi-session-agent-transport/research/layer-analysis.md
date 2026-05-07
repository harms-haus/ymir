# Layer Analysis

## Layer 1: Rust Server — Agent Process Management

### Files
- `crates/ws-server/src/agent/acp.rs` — AcpHandle, AcpClient, AcpRuntime
- `crates/ws-server/src/agent/handler.rs` — handle_agent_spawn, handle_agent_send, handle_agent_cancel
- `crates/ws-server/src/agent/adapter.rs` — YmirClientHandler, BroadcastingEventSender

### Current Capabilities
- **One agent process per worktree**: The `clients: HashMap<Uuid, AcpClient>` maps `worktree_id → AcpClient`.
- **Commands via worktree_id**: All `AcpCommand` variants (Spawn, SendPrompt, Cancel, Kill) use `worktree_id` as the key.
- **BroadcastingEventSender**: Sends all events through a single `broadcast::Sender<ServerMessage>`. No session ID filtering.
- **YmirClientHandler**: Stores `worktree_id` on construction. Every event it emits includes `worktree_id` in the event data.

### Session ID Support
- **AcpClient** stores `session_id: Option<SessionId>` internally — the ACP `SessionId` from `new_session()`.
- The `session_id` is used internally for `send_prompt()`, `cancel()`, `set_config_option()` — but it's NOT exposed in the command interface.
- The `acp_session_id` is emitted in the `SessionInit` event data — clients see it but can't route by it.
- **No multi-session routing**: The runtime can't spawn two agents for the same worktree.

### Changes Needed
1. **Change `AcpCommand` routing key**: Instead of `worktree_id: Uuid`, use a compound key or add `session_id` alongside `worktree_id`.
2. **Allow multiple AcpClients per worktree**: Change `HashMap<Uuid, AcpClient>` to `HashMap<(Uuid, Uuid), AcpClient>` (worktree_id + session_id) or similar.
3. **Add session ID to AgentSpawn**: The `AgentSpawn` protocol type needs a way to identify which session tab this is for.
4. **BroadcastingEventSender needs session ID awareness**: Events should carry the session ID so the client can route them.
5. **handle_agent_send/cancel need session routing**: Currently find agent by worktree_id; need to find by session_id or compound key.

## Layer 2: Rust Server — Protocol Types

### Files
- `crates/ws-server/src/protocol/agent.rs` — AgentSpawn, AgentSend, AgentCancel, AgentStatusUpdate, etc.
- `crates/ws-server/src/protocol/acp.rs` — AcpEventEnvelope, AcpEvent, all ACP wire types

### Current Capabilities
- `AgentSpawn { worktree_id, agent_type }` — no session/tab identifier.
- `AgentSend { worktree_id, message }` — routes by worktree only.
- `AgentCancel { worktree_id, session_id }` — already has session_id but uses worktree_id for finding the agent.
- `AgentStatusUpdate { id, worktree_id, agent_type, status, started_at }` — `id` is the server-generated session UUID.
- `AcpEventEnvelope` carries `AcpEvent` which all include `worktree_id` and `acp_session_id` in their data.
- The envelope uses `#[serde(flatten)]` on the `event` field, so `eventType` + `data` are at the top level.

### Session ID Support
- **ACP events already carry acp_session_id**: Every `AcpPromptChunk`, `AcpToolUseEvent`, `AcpContextUpdate`, etc. has `worktree_id` and `acp_session_id`.
- **AcpEventEnvelope does NOT have a top-level session ID field**. The session ID is inside the flattened event data.
- The `AcpEvent::SessionInit` carries the `acp_session_id` which the client uses to populate `AgentSessionState.acpSessionId`.

### Changes Needed
1. **Add optional session/tab ID to AgentSpawn**: So the client can correlate which tab requested the spawn.
2. **AgentSend may need session targeting**: When multiple agents exist for one worktree, prompts need to target a specific session.
3. **AgentStatusUpdate should include the acp_session_id**: Currently only has the server's `id` (UUID). The `acpSessionId` is set later via SessionInit event.
4. **Consider adding a top-level session ID to AcpEventEnvelope**: For routing without deserializing the inner event.

## Layer 3: Rust Server — Bridge Encoder

### Files
- `crates/ws-server/src/bridge/encoder.rs` — server_message_to_envelope()
- `crates/ws-server/src/bridge/bridge_codec.rs` — payload_to_bridge_message()
- `crates/ws-server/src/bridge/decoder.rs` — decode_bridge_message()

### Current Capabilities
- `AcpWireEvent(envelope)` → `BridgeMessage::AcpPayload { payload: serde_json::to_value(&envelope) }`
- The `BridgeMessage::AcpPayload` carries an opaque `JsonValue` payload.
- The bridge **does not interpret ACP semantics** — it just passes through the serialized `AcpEventEnvelope`.
- The `BridgeEnvelope` format: `{ version, seq, timestamp_ms, type: "acp_payload", payload: {...} }`.

### Session ID Support
- The bridge is **intentionally session-unaware** — it passes ACP events as opaque payloads.
- Session ID information is **already inside the payload** (the `AcpEventEnvelope` contains `acp_session_id` in the event data).
- The bridge envelope itself has no session ID field.

### Changes Needed
- **Minimal to no changes needed** at the bridge layer. The bridge already passes through session ID via the opaque payload.
- If we want envelope-level session routing (to avoid deserializing the payload on the client), we could add an optional `sessionId` field to `BridgeEnvelope`. But this violates the "bridge does not interpret" principle.
- **Recommendation**: Keep the bridge session-unaware. Session routing should happen at the Ymir transport layer (yws-transport.ts) after decoding the payload.

## Layer 4: acp-ws-bridge (npm package)

### Files
- `packages/acp-ws-bridge/src/generated/BridgeEnvelope.ts`
- `packages/acp-ws-bridge/src/generated/BridgeMessage.ts`
- `packages/acp-ws-bridge/src/client.ts` — TransportClient
- `packages/acp-ws-bridge/src/ws-transport.ts` — WebSocket transport

### Current Capabilities
- `BridgeEnvelope` type: `{ version, seq, timestamp_ms, extraData?, type, payload/status/etc }`
- `BridgeMessage` type: discriminated union with `"acp_payload"`, `"bridge_status"`, `"stderr"`, etc.
- `TransportClient` connects, sends/receives envelopes, emits events.
- The `TransportClient` emits `"envelope"` events which `YmirWsTransport` handles.

### Session ID Support
- **No session ID concept** in the bridge. It's a general-purpose WebSocket transport.
- The `AcpPayload` variant carries an opaque `JsonValue` — no session ID extraction.

### Changes Needed
- **No changes needed**. The bridge correctly passes through opaque payloads. Session routing is a Ymir concern.

## Layer 5: yws-transport.ts (Ymir Transport Layer)

### File
- `apps/web/src/lib/yws-transport.ts` — YmirWsTransport

### Current Capabilities
- Wraps `TransportClient` from acp-ws-bridge.
- `handleEnvelope()` routes incoming messages:
  - `acp_payload` → `handleAcpPayload()`
  - Migrated types → `handleBridgeMessage()`
- `handleAcpPayload()`:
  1. Extracts `worktreeId` from `payload.data.worktreeId` or falls back to `activeWorktreeId`.
  2. Dispatches `EVENT_RECEIVED` to the accumulator with `{ envelope, worktreeId }`.
  3. On `SessionInit`, populates `acpSessionId` on the matching `AgentSessionState`.
  4. Routes to `acpSessionManager.handleAcpPayload(worktreeId, payload)`.

### Session ID Support
- **Routes by worktreeId only**. The `handleAcpPayload` extracts `worktreeId` from the event data.
- The `acpSessionId` is available in the payload data but is only used for updating `AgentSessionState.acpSessionId` — not for routing.
- **Does NOT support per-session routing**: If two agents exist for the same worktree, their events go to the same accumulator thread.

### Changes Needed
1. **Extract session ID from payload**: Parse `acpSessionId` from the event data for routing.
2. **Route to per-session accumulator threads**: Instead of `threads.get(worktreeId)`, use a compound key like `threads.get(`${worktreeId}:${acpSessionId}`)` or `threads.get(acpSessionId)`.
3. **Handle shared session references**: If two tabs share the same session ID, route events to both.

## Layer 6: Zustand Store — Accumulator

### Files
- `apps/web/src/store.ts` — acpAccumulatorReducer, store actions
- `apps/web/src/types/state.ts` — AccumulatedThread, AcpAccumulatorState, AcpAccumulatorAction

### Current Capabilities
- `AcpAccumulatorState`: `{ connectionGeneration, threads: Map<string, AccumulatedThread>, pendingCorrelations, lastFlushTimestamp }`
- `AccumulatedThread`: `{ worktreeId, acpSessionId, messages[], sessionStatus, lastSequence, isStreaming, configOptions, resumeCheckpoint }`
- `threads` Map is keyed by `worktreeId` — **one thread per worktree**.
- `AcpAccumulatorAction.EVENT_RECEIVED`: `{ type, envelope, worktreeId }` — routes by worktreeId.

### Session ID Support
- `AccumulatedThread` stores `acpSessionId` but it's informational, not used as a routing key.
- The `threads` Map uses `worktreeId` as the key.
- `FLUSH_THREAD` uses `worktreeId`.
- `REBUILD_FROM_SNAPSHOT` uses `worktreeId`.
- `USER_MESSAGE` uses `worktreeId`.

### Changes Needed
1. **Change thread Map key**: From `worktreeId` to a session-aware key (e.g., `acpSessionId` or compound key).
2. **Update all accumulator actions**: `EVENT_RECEIVED`, `USER_MESSAGE`, `FLUSH_THREAD`, `REBUILD_FROM_SNAPSHOT`, `SET_STREAMING` all need session ID.
3. **Support shared session references**: When two tabs use the same session, both should see the same thread data.

## Layer 7: acp-chat-core (npm package)

### Files
- `packages/acp-chat-core/src/session/controller.ts` — SessionController
- `packages/acp-chat-core/src/normalization/store.ts` — NormalizedState, applySessionUpdate

### Current Capabilities
- `SessionController`: Manages a single ACP session over a `Transport`.
  - Has `state.sessionId: string | null` — the ACP session ID.
  - Emits `sessionUpdate` events with `{ sessionId, update }` params.
  - The `NormalizedState` is a flat structure: `{ messages, thoughts, toolCalls, permissionRequests, timelineOrder }`.
- `applySessionUpdate()`: Takes `SessionUpdateParams { sessionId?, update? }` and applies it to a `NormalizedState`.
- The normalization is **per-session** — it creates messages, tool calls, etc. within a single state object.

### Session ID Support
- **SessionController already tracks sessionId** — it's a first-class concept.
- **Normalization is session-scoped** — `applySessionUpdate()` operates on a single `NormalizedState`.
- **No multi-session support** in the normalization layer — each `NormalizedState` represents one session.
- The `SessionController` is designed for **one session per controller instance**.

### Changes Needed
- **No changes to acp-chat-core for multi-session**. The library is correctly scoped to one session.
- Ymir needs to create multiple `SessionController` instances (or use the accumulator pattern) for multi-session.
- The **accumulator approach** (already in use) is better suited than `SessionController` for multi-session because it's a simple reducer.

## Layer 8: Agent UI Components

### Files
- `apps/web/src/components/agent/AgentPane.tsx` — tab container
- `apps/web/src/components/agent/AcpChat.tsx` — chat UI
- `apps/web/src/components/agent/AgentRuntimeProvider.tsx` — @assistant-ui/react bridge

### Current Capabilities
- `AgentPane`: Manages tabs per worktree. Each tab has a `sessionId` linking it to an `AgentSessionState`.
- `AcpChat`: Reads `acpAccumulator.threads.get(worktreeId)` — by worktree, not by tab session.
- `AgentRuntimeProvider`: Also reads accumulator by `worktreeId`.

### Session ID Support
- **Tabs have a `sessionId`** (the server-generated UUID), but the chat UI reads from the accumulator by `worktreeId`.
- This means **all tabs for the same worktree show the same thread** — a bug once multi-session is enabled.

### Changes Needed
1. **AcpChat must read by session ID, not worktree ID**: `acpAccumulator.threads.get(acpSessionId)` or similar.
2. **AgentRuntimeProvider must receive the correct thread**: Pass `acpSessionId` instead of just `worktreeId`.
3. **AgentPane must correlate tabs to sessions**: Each tab's `sessionId` should map to an `acpSessionId` in the accumulator.
