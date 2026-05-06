# Agent Tab Lifecycle Research Findings

## Executive Summary

The agent tab lifecycle has a **critical architectural mismatch**: there are **two parallel ACP communication paths** that are never connected. The Rust server manages its own ACP runtime that spawns agent processes and broadcasts ACP events via WebSocket, while the client-side `acpSessionManager` creates its own independent `SessionController` instances that expect to talk directly to an agent process. These two paths never meet, causing the agent tab to appear broken.

---

## 1. Complete Agent Tab Lifecycle Trace

### 1.1 What Happens When a Worktree Gets an Agent Tab

**Step 1: AgentPane mounts** (`apps/web/src/components/agent/AgentPane.tsx`)

- The `AgentPane` component receives a `worktreeId` prop
- On mount, `useEffect` (line 100-107) checks if `tabs.length === 0 && agentSessions.length === 0`
- If no agent sessions exist, it calls `handleSpawnAgent()` which sends an `AgentSpawn` message

**Step 2: AgentSpawn message sent** (`AgentPane.tsx` line 73-83)

```typescript
const message: AgentSpawn = {
  type: 'AgentSpawn',
  worktreeId,
  agentType: 'hermes',
};
client.send(message);
```

- This goes through `YmirWsTransport.send()` -> `encodeClientMessage()` -> `encodeAgentSpawn()` which wraps it as `agent_event` BridgeEnvelope
- The server receives it, decodes it via `decode_bridge_message()` -> `bridge_message_to_client_payload()` -> routes to `handle_agent_spawn()`

**Step 3: Server handles AgentSpawn** (`crates/ws-server/src/agent/handler.rs`)

1. Looks up worktree path from `state.worktrees`
2. Creates DB session record
3. Checks `state.acp_handle` is initialized (it is — `AppState::with_acp()` starts it)
4. Adds agent to `state.agents` with status `"spawning"`
5. Broadcasts `AgentStatusUpdate(Working)` to all clients
6. Returns immediate `Ack(Success)` to the requesting client
7. Spawns background `tokio::spawn` task that calls `acp_handle.spawn_agent()`

**Step 4: ACP runtime spawns agent process** (`crates/ws-server/src/agent/acp.rs`)

- `AcpCommand::Spawn` is sent to the ACP runtime's mpsc channel
- The runtime runs in a `spawn_blocking` + `LocalSet` (single-threaded)
- `AcpClient::spawn()` is called which:
  1. Spawns the agent process (e.g., `hermes acp`) as a child process via stdio
  2. Creates a `ClientSideConnection` (ACP SDK) over stdin/stdout
  3. Calls `initialize()` -> `new_session()` on the ACP connection
  4. On session init, emits `AcpEvent::SessionInit` via the `BroadcastingEventSender`
  5. On success, the future resolves and the `handle_agent_spawn` background task broadcasts `AgentStatusUpdate(Idle)`

**Step 5: ACP events broadcast to clients** (`crates/ws-server/src/agent/acp.rs`)

- `BroadcastingEventSender::send_event()` wraps ACP events as `ServerMessage::AcpWireEvent(envelope)`
- These go through `state.broadcast_tx` -> `state.broadcast()` -> to all connected WebSocket clients
- The bridge encoder maps `AcpWireEvent` -> `BridgeMessage::AcpPayload` (encoder.rs line 29-31)

**Step 6: Client receives messages** (`apps/web/src/lib/yws-transport.ts`)

- `YmirWsTransport.handleEnvelope()` receives the envelope
- For `AgentStatusUpdate` (wrapped as `agent_event`): routes through `handleBridgeMessage()` -> updates Zustand store `agentSessions`
- For `AcpWireEvent` (wrapped as `acp_payload`): routes through `handleAcpPayload()` -> `acpSessionManager.handleAcpPayload()`

**Step 7: AgentPane reacts to store updates** (`AgentPane.tsx`)

- `useEffect` (line 85-98) watches `agentSessions` and creates tabs for new sessions
- Creates an `AgentTab` with `id: 'agent-${session.id}'` and `sessionId: session.id`
- Renders `AcpChat` component when a tab is selected and has a matching session

---

## 2. Critical Breakpoint: The Dual ACP Path Problem

### 2.1 Server-Side ACP Path (Working)

The Rust server has a fully functional ACP integration:

```
handle_agent_spawn()
  -> AcpHandle::spawn_agent()  (mpsc command)
  -> AcpRuntime (spawn_blocking + LocalSet)
  -> AcpClient::spawn()  (spawns agent process)
  -> ClientSideConnection (ACP SDK over stdio)
  -> agent process (e.g., "hermes acp")
  -> YmirClientHandler::session_notification() (receives agent events)
  -> BroadcastingEventSender::send_event() (broadcasts as AcpWireEvent)
  -> state.broadcast() (to all WS clients as acp_payload)
```

This path is complete and functional. The server CAN spawn agents and DOES broadcast ACP events.

### 2.2 Client-Side ACP Path (Disconnected)

The client has its own independent ACP session management:

```
acpSessionManager.getOrCreateController(worktreeId, cwd)
  -> new YmirAcpTransport(sendAcpPayload, ...)
  -> new SessionController(transport)  (from @harms-haus/acp-chat-core)
  -> createAcpStore(controller)  (from @harms-haus/acp-chat-react)
```

This creates `SessionController` instances that:
- Have their own `YmirAcpTransport` which sends ACP JSON-RPC via `sendAcpPayload`
- Expect to receive ACP JSON-RPC responses via `receiveAcpPayload()`
- Track pending requests with request IDs
- Manage session state (messages, streaming, etc.)

**THE PROBLEM:** Nobody ever calls `acpSessionManager.getOrCreateController()` for agent tabs!

### 2.3 Where the Two Paths Should Connect But Don't

Looking at `AcpChat.tsx` (line 20):
```typescript
const store = acpSessionManager.getAcpStore(worktreeId);
```

This returns `null` because no controller was ever created for this worktree. The `AcpChat` component then renders:
```tsx
if (!store) {
  return (
    <div className="acp-chat-container">
      <div className="acp-chat-empty">
        <p>No ACP session available for this worktree.</p>
      </div>
    </div>
  );
}
```

**This is the user-visible symptom: "No ACP session available for this worktree."**

### 2.4 The Root Cause: Missing Client-Side Session Creation

The `acpSessionManager` needs to have a controller created and initialized BEFORE it can receive ACP events. The flow should be:

1. Server broadcasts `AgentStatusUpdate(Working)` -> client adds session to store
2. **MISSING STEP:** Client should call `acpSessionManager.getOrCreateController(worktreeId, cwd)` then `acpSessionManager.initialize()` and `acpSessionManager.createSession()`
3. Server broadcasts `AcpWireEvent(SessionInit)` -> client receives via `acpSessionManager.handleAcpPayload()`
4. But the transport expects request-response pairing (request IDs), and the server-side ACP runtime doesn't use the client-side transport's request IDs

### 2.5 The Fundamental Architecture Conflict

The server-side ACP runtime uses the `agent_client_protocol` SDK's `ClientSideConnection` to manage the agent process. This means:

- The **server** is the ACP client (initiating connections, sending requests)
- The **agent process** is the ACP server (responding, sending notifications)
- ACP events flow: agent -> server -> broadcast -> client (as `acp_payload`)

But the client-side `SessionController` from `acp-chat-core` ALSO expects to be an ACP client:

- It wants to send `initialize`, `session/new`, `session/prompt` requests
- It expects responses with matching request IDs
- It manages its own session state

**These two "ACP clients" are fighting over the same conceptual role.** The server has already done the ACP handshake; the client doesn't need to do it again. But the client-side `SessionController` is designed to do exactly that.

---

## 3. Comparison: Terminal Tab Lifecycle (Working Reference)

### 3.1 Terminal Tab Flow

```
TerminalPane mounts
  -> useEffect sends TerminalMount { tabId, worktreeId }
  -> Server: handle_terminal_mount()
    -> pty_manager.get_or_create_session(tabId, worktreeId, ...)
    -> Spawns PTY process
    -> Creates DB session
    -> Broadcasts TerminalMounted { tabId, sessionId, worktreeId, ... }
  -> Client: handleBridgeMessage() case 'TerminalMounted'
    -> addTerminalTab({ id: tabId, activeSessionId: sessionId, status: 'active' })
  -> TerminalView renders with sessionId
    -> TerminalOutput events flow via onMessage handlers
```

### 3.2 Key Differences

| Aspect | Terminal Tab | Agent Tab |
|--------|-------------|-----------|
| **Initiator** | UI sends `TerminalMount` | UI sends `AgentSpawn` |
| **Process spawn** | Server spawns PTY | Server spawns agent via ACP |
| **Session ID** | Server creates and returns in `TerminalMounted` | Server creates and returns in `AgentStatusUpdate` |
| **Tab creation** | Server response includes tabId mapping | Client creates tab from agentSessions |
| **Data flow** | `TerminalOutput` events via `onMessage` handler | `AcpWireEvent` events via `acp_payload` bridge |
| **Store** | Simple `TerminalTabState` | Complex `AcpStore` / `SessionController` |
| **State management** | Direct Zustand store | Two competing state managers |

### 3.3 Why Terminal Works

The terminal lifecycle is simple because:
1. The PTY is a dumb byte stream — no protocol negotiation
2. Output is delivered via `onMessage('TerminalOutput')` callbacks, not through a secondary state manager
3. The store just tracks `activeSessionId` and `status`
4. There's no separate "session controller" layer

---

## 4. The ACP Event Routing Problem

### 4.1 Server-Side ACP Events

When the server-side ACP runtime broadcasts events:

```
agent process notification
  -> YmirClientHandler::handle_session_notification()
  -> self.send_event(AcpEvent::PromptChunk { ... })
  -> BroadcastingEventSender::send_event(envelope)
  -> broadcast_tx.send(ServerMessage::AcpWireEvent(envelope))
```

The `AcpEventEnvelope` is serialized as:
```json
{
  "sequence": 1,
  "eventType": "PromptChunk",
  "data": { "worktreeId": "...", "acpSessionId": "...", "content": ..., "isFinal": false }
}
```

### 4.2 Client-Side Reception

In `store.ts` `handleBridgeMessage()` case `'acp_payload'` (line 1584-1598):

```typescript
case 'acp_payload': {
  if (!isAcpPayload(message)) return;
  const payload = message.payload as Record<string, unknown> | null;
  if (!payload) return;
  const { activeWorktreeId } = useStore.getState();
  const data = (payload.data as Record<string, unknown>) ?? {};
  const worktreeId = (data as any)?.worktreeId ?? activeWorktreeId;
  if (worktreeId) {
    acpSessionManager.handleAcpPayload(worktreeId, payload);
  }
  break;
}
```

### 4.3 The Disconnect

The `acpSessionManager.handleAcpPayload()` (acp-session-manager.ts line 549-565) calls:
```typescript
session.transport.receiveAcpPayload(payload);
```

But this expects `payload` to be raw ACP JSON-RPC (with `id`, `method`, `params`/`result`). What the server actually sends is an `AcpEventEnvelope` — a WS-ACP wire contract type, NOT raw JSON-RPC.

The server's `BroadcastingEventSender` serializes `AcpEventEnvelope` objects, not raw JSON-RPC messages. The `YmirAcpTransport.receiveAcpPayload()` tries to match `payload.id` as a number to resolve pending requests, but the `AcpEventEnvelope` has `sequence` (not `id`), and `eventType` (not `method`).

**Result:** All incoming ACP events are dropped by `receiveAcpPayload()` because:
1. No `id` field matches pending requests (the server's events don't use request-response IDs)
2. They're emitted as "notifications" to handlers that don't understand the WS-ACP envelope format

---

## 5. Specific Issues Identified

### Issue 1: No SessionController Created for Agent Tabs

**Severity: CRITICAL**
**File:** `apps/web/src/components/agent/AcpChat.tsx` line 20

`acpSessionManager.getAcpStore(worktreeId)` always returns `null` because nobody calls `getOrCreateController()`. The `AcpChat` component renders "No ACP session available" instead of the chat UI.

### Issue 2: Dual ACP Client Conflict

**Severity: CRITICAL**
**Files:** `crates/ws-server/src/agent/acp.rs` vs `apps/web/src/lib/acp-session-manager.ts`

The server is already the ACP client (using `ClientSideConnection`). The client-side `SessionController` also wants to be the ACP client. They cannot both fulfill this role.

### Issue 3: ACP Event Format Mismatch

**Severity: CRITICAL**
**Files:** `crates/ws-server/src/agent/adapter.rs` vs `apps/web/src/lib/acp-session-manager.ts`

Server sends `AcpEventEnvelope` (WS-ACP wire format with `eventType`, `sequence`, `data`). Client `YmirAcpTransport.receiveAcpPayload()` expects raw ACP JSON-RPC (with `id`, `method`, `result`/`params`). These formats are incompatible.

### Issue 4: Store Accumulator vs AcpStore Duplication

**Severity: MODERATE**
**Files:** `apps/web/src/store.ts` (acpAccumulatorReducer) vs `apps/web/src/lib/acp-session-manager.ts` (AcpStore)

There are two competing state accumulation systems:
1. The Zustand store's `acpAccumulator` (store.ts) — processes `AcpEventEnvelope` events via `dispatchAccumulator()`
2. The `AcpStore` from `acp-chat-react` — managed by `SessionController` from `acp-chat-core`

Neither is fully functional. The accumulator receives events but nobody renders from it (the `AgentRuntimeProvider` exists but is not used by `AcpChat`). The `AcpStore` is never initialized.

### Issue 5: AgentRuntimeProvider Not Used

**Severity: MODERATE**
**File:** `apps/web/src/components/agent/AcpChat.tsx`

`AcpChat` imports and uses `Thread` from `@harms-haus/acp-chat-react` (not the `AgentRuntimeProvider`). The `AgentRuntimeProvider` component (which uses `@assistant-ui/react`) exists but is not rendered anywhere in the agent tab. There are two different chat UI approaches that are both partially implemented but neither works.

### Issue 6: `acp_payload` Event Routing Uses Active Worktree Fallback

**Severity: MINOR**
**File:** `apps/web/src/store.ts` line 1592-1594

The `acp_payload` handler falls back to `activeWorktreeId` when the payload doesn't contain a `worktreeId`. But the ACP event envelope has `worktreeId` inside `data`, which requires knowing the envelope structure. The current extraction tries `(data as any)?.worktreeId` but the envelope format nests it differently depending on event type.

---

## 6. ACP Chat Core Library Structure

The `~/acp-chat-ui-react/` monorepo contains:

- `packages/acp-chat-core/` — Core library with `SessionController`, `Transport` interface, types
- `packages/acp-chat-react/` — React bindings with `AcpStore`, `Thread` component, `createAcpStore`
- `packages/acp-ws-bridge/` — WebSocket bridge transport

Key interfaces from `acp-chat-core`:
- `Transport` — Interface for sending/receiving ACP JSON-RPC
- `SessionController` — Manages ACP protocol lifecycle (initialize, createSession, sendPrompt, etc.)
- `ACPRequest` / `ACPResponse` / `ACPNotification` — JSON-RPC message types

The `YmirAcpTransport` in `acp-session-manager.ts` implements this `Transport` interface, but it's designed for direct agent-to-client communication. The server's ACP runtime breaks this model by acting as an intermediary.

---

## 7. Recommended Fix Approaches

### Approach A: Client-Driven ACP (Remove Server ACP Runtime)

**Concept:** Remove the server-side ACP runtime entirely. Let the client's `SessionController` manage ACP directly.

**How:**
1. Server spawns agent process but doesn't create `ClientSideConnection`
2. Server pipes agent stdin/stdout to WebSocket
3. Client's `YmirAcpTransport` talks directly to agent via WebSocket relay
4. `SessionController` manages the full ACP protocol

**Pros:** Clean architecture, `acp-chat-core` works as designed
**Cons:** Major refactoring of the server, WebSocket relay complexity, latency

### Approach B: Server-Driven ACP (Remove Client SessionController)

**Concept:** Keep the server-side ACP runtime. Remove the client-side `SessionController` layer. Use only the accumulator + custom UI.

**How:**
1. Keep server's `AcpClient` and `YmirClientHandler` as-is
2. Remove `acpSessionManager` dependency from agent UI
3. Use the Zustand store's `acpAccumulator` as the sole state source
4. Render chat UI directly from accumulated messages (using `AgentRuntimeProvider` or custom components)
5. Send messages via `AgentSend` (existing working path)

**Pros:** Minimal changes, server already works, simpler client
**Cons:** Doesn't use `acp-chat-core` features, custom UI maintenance

### Approach C: Bridge the Two Paths (Adapter Pattern)

**Concept:** Keep both paths but create an adapter that translates server broadcasts into the format `SessionController` expects.

**How:**
1. On `AgentStatusUpdate`, create `SessionController` via `acpSessionManager`
2. On `AcpWireEvent(SessionInit)`, translate to `SessionController`-compatible notifications
3. Map server's `AcpEvent` types to raw ACP JSON-RPC notifications
4. Feed translated events to `YmirAcpTransport.receiveAcpPayload()`

**Pros:** Uses `acp-chat-core` features, `Thread` component works
**Cons:** Complex adapter layer, format translation is fragile, bidirectional ACP issues

### Approach D: Accumulator-First UI (Recommended)

**Concept:** Use the existing accumulator in the Zustand store as the primary state source. The server already broadcasts all ACP events as `AcpWireEvent` -> `acp_payload` -> `dispatchAccumulator()`. Wire the UI to render from accumulator state.

**How:**
1. Fix `acp_payload` handling in `handleBridgeMessage()` to properly dispatch to the accumulator
2. Use `AgentRuntimeProvider` (already exists, uses `@assistant-ui/react`) or custom rendering
3. Send messages via `AgentSend` protocol message
4. The `acpSessionManager` and `SessionController` are NOT used for agent tabs
5. The `AcpChat` component renders from accumulator state instead of `AcpStore`

**Pros:** Least code changes, leverages existing accumulator, server works
**Cons:** Doesn't use `acp-chat-core` for agent tabs (acceptable since server is the ACP client)

---

## 8. Key Files Reference

| File | Role |
|------|------|
| `crates/ws-server/src/agent/handler.rs` | Server agent spawn/cancel/send handlers |
| `crates/ws-server/src/agent/acp.rs` | Server ACP runtime (process management) |
| `crates/ws-server/src/agent/adapter.rs` | ACP event translation layer |
| `crates/ws-server/src/protocol/agent.rs` | Agent protocol types |
| `crates/ws-server/src/protocol/acp.rs` | WS-ACP wire types |
| `crates/ws-server/src/bridge/encoder.rs` | Server->client message encoding |
| `crates/ws-server/src/bridge/decoder.rs` | Client->server message decoding |
| `crates/ws-server/src/router.rs` | Message routing/dispatch |
| `crates/ws-server/src/state.rs` | AppState with ACP handle |
| `apps/web/src/store.ts` | Zustand store + handleBridgeMessage + acpAccumulator |
| `apps/web/src/lib/bridge-transport.ts` | Client encoder/decoder |
| `apps/web/src/lib/yws-transport.ts` | WebSocket transport |
| `apps/web/src/lib/acp-session-manager.ts` | Client ACP session management |
| `apps/web/src/components/agent/AgentPane.tsx` | Agent tab container |
| `apps/web/src/components/agent/AcpChat.tsx` | Agent chat UI (currently broken) |
| `apps/web/src/components/agent/AgentRuntimeProvider.tsx` | Assistant-UI runtime (unused) |
| `apps/web/src/types/bridge-envelope.ts` | Bridge message types |
