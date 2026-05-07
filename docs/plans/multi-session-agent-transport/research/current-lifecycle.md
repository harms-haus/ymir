# Current Agent Tab Lifecycle

## End-to-End Trace: AgentPane Mount to Event Accumulation

### 1. AgentPane Mount (React Component)

**File:** `apps/web/src/components/agent/AgentPane.tsx`

When `AgentPane` mounts for a `worktreeId`:
1. It reads `agentSessions` filtered by `worktreeId` from Zustand store.
2. It reads `agentTabs` (the tab bar state) for the `worktreeId`.
3. If no tabs exist and no agent sessions exist, it **auto-spawns** an agent:
   ```
   handleSpawnAgent() → client.send({ type: 'AgentSpawn', worktreeId, agentType: 'hermes' })
   ```

### 2. AgentSpawn Message → Server

**File:** `crates/ws-server/src/agent/handler.rs` — `handle_agent_spawn()`

The server receives `AgentSpawn`:
1. Validates the worktree exists and gets its CWD path from `state.worktrees`.
2. Creates a DB `AgentSession` record with a new UUID `session_id`.
3. Inserts an `AgentState` into `state.agents` (in-memory registry) with status "spawning".
4. **Broadcasts** `AgentStatusUpdate { status: Working }` to all WebSocket clients.
5. Returns an **Ack** immediately (non-blocking).
6. Spawns a **background tokio task** to do the actual ACP spawn:
   ```
   acp_handle.spawn_agent(worktree_id, agent_type, worktree_path)
   ```

### 3. ACP Runtime Spawn

**File:** `crates/ws-server/src/agent/acp.rs` — `AcpRuntime`

The `start_acp_runtime()` creates a single-threaded tokio runtime with an unbounded command channel. The `AcpHandle` sends `AcpCommand::Spawn` through this channel.

Inside the runtime, `AcpClient::spawn()`:
1. **Spawns the agent process** via `tokio::process::Command` in the worktree CWD (e.g., `hermes acp`).
2. Creates a `ClientSideConnection` over stdio (stdin/stdout).
3. Calls `connection.initialize()` — the ACP `initialize` handshake.
4. Calls `connection.new_session()` — creates an ACP session, gets `SessionId`.
5. Creates a `YmirClientHandler` that holds `worktree_id`, `event_sender`, and `sequence_counter`.

On success:
- Broadcasts `AgentStatusUpdate { status: Idle }` to all clients.
- The agent process runs in the background, sending `SessionNotification`s.

### 4. Client Receives AgentStatusUpdate

**File:** `apps/web/src/store.ts` — `handleBridgeMessage()`

The `AgentStatusUpdate` arrives as `agent_event` BridgeMessage:
1. `handleBridgeMessage()` dispatches to the `agent_event` case.
2. For new sessions: calls `addAgentSession({ id, worktreeId, agentType, status })`.
3. `AgentPane` detects the new `agentSessions` entry in its `useEffect`.
4. Creates an `AgentTab { id: 'agent-${session.id}', type: 'agent', sessionId: session.id }`.
5. Calls `addAgentTab(worktreeId, agentTab)` — tab appears in the UI.

### 5. ACP Events from Agent Process

**File:** `crates/ws-server/src/agent/adapter.rs` — `YmirClientHandler`

The agent sends `SessionNotification`s over stdio. The `ClientSideConnection` dispatches them to `YmirClientHandler::session_notification()`.

Each notification is translated to an `AcpEvent`:
- `AgentMessageChunk` → `AcpEvent::PromptChunk`
- `ToolCall` → `AcpEvent::ToolUse`
- `Plan` → `AcpEvent::ContextUpdate`
- `ConfigOptionUpdate` → `AcpEvent::ConfigOptionsUpdate`
- etc.

The `YmirClientHandler::send_event()` wraps it in an `AcpEventEnvelope`:
```rust
AcpEventEnvelope {
    sequence: self.sequence.next(),
    correlation_id: None,
    timestamp: now_ms(),
    event: event,
}
```

### 6. BroadcastingEventSender

**File:** `crates/ws-server/src/agent/acp.rs` — `BroadcastingEventSender`

The `BroadcastingEventSender::send_event()`:
1. Wraps the envelope in `ServerMessage::new(ServerMessagePayload::AcpWireEvent(envelope))`.
2. Sends it through the `broadcast::Sender<ServerMessage>` channel.
3. All connected WebSocket clients receive it.

### 7. Bridge Encoder

**File:** `crates/ws-server/src/bridge/encoder.rs`

The `server_message_to_envelope()` converts the `ServerMessage`:
- `AcpWireEvent(envelope)` → `BridgeMessage::AcpPayload { payload: serde_json::to_value(&envelope) }`
- Wrapped in a `BridgeEnvelope { version: 1, seq: 0, timestamp_ms: now, type: "acp_payload", payload: <envelope_json> }`.

### 8. WebSocket Transmission

The envelope is serialized as JSON and sent over the WebSocket connection.

### 9. YmirWsTransport Receives Envelope

**File:** `apps/web/src/lib/yws-transport.ts`

The `TransportClient` from `acp-ws-bridge` receives the envelope:
1. `handleEnvelope()` is called.
2. `decodeBridgeJson()` parses it into a `DecodedBridgeMessage`.
3. For `type === "acp_payload"`: calls `handleAcpPayload(decoded.message)`.

### 10. handleAcpPayload

**File:** `apps/web/src/lib/yws-transport.ts` — `handleAcpPayload()`

```typescript
private handleAcpPayload(message: BridgeMessage): void {
    const payload = (message as any).payload;
    const data = payload.data;
    const worktreeId = data?.worktreeId ?? activeWorktreeId;

    // 1. Dispatch to Zustand accumulator
    if (payload.eventType && typeof payload.sequence === 'number') {
        useStore.getState().dispatchAccumulator({
            type: 'EVENT_RECEIVED',
            envelope: payload as AcpEventEnvelope,
            worktreeId,
        });
    }

    // 2. On SessionInit, update acpSessionId on AgentSessionState
    if (payload.eventType === 'SessionInit') {
        const acpSessionId = data?.acpSessionId;
        if (acpSessionId) {
            const session = sessions.find(s => s.worktreeId === worktreeId);
            if (session && !session.acpSessionId) {
                updateAgentSession(session.id, { acpSessionId });
            }
        }
    }

    // 3. Route to acpSessionManager (backward compat)
    acpSessionManager.handleAcpPayload(worktreeId, payload);
}
```

### 11. Zustand Accumulator

**File:** `apps/web/src/store.ts` — `acpAccumulatorReducer()`

The reducer processes `EVENT_RECEIVED`:
- Key: `worktreeId` (the `threads` Map is keyed by `worktreeId`).
- Each `AccumulatedThread` contains `{ worktreeId, acpSessionId, messages[], sessionStatus, isStreaming, configOptions }`.
- `SessionInit` → creates a new thread or updates `acpSessionId`.
- `SessionStatus` → updates `sessionStatus`.
- `PromptChunk` → appends text to the last assistant message.
- `ToolUse` → creates/updates a tool card in the message.
- `ContextUpdate` → appends a context card.
- `Error` → appends an error card.

### 12. AcpChat Reads Accumulated State

**File:** `apps/web/src/components/agent/AcpChat.tsx`

```typescript
const thread = useStore((state) => state.acpAccumulator.threads.get(worktreeId));
```

The `AcpChat` component reads the thread by `worktreeId`.

### 13. AgentRuntimeProvider Bridges to @assistant-ui/react

**File:** `apps/web/src/components/agent/AgentRuntimeProvider.tsx`

```typescript
const thread = useStore((state) => state.acpAccumulator.threads.get(worktreeId));
const messages = thread?.messages ?? [];
const isStreaming = thread?.isStreaming ?? false;

const runtime = useExternalStoreRuntime({
    messages,
    isRunning: isStreaming || sessionStatus === 'Working',
    onNew,
    onCancel,
    convertMessage: (msg, index) => convertAccumulatedMessage(msg, index, messages, isStreaming),
});
```

This creates an `@assistant-ui/react` runtime from the accumulated state.

## Key Observations

### Single-Session-per-Worktree Assumption
- The **accumulator threads Map** is keyed by `worktreeId` — only **one thread per worktree**.
- The **AcpRuntime** (`clients: HashMap<Uuid, AcpClient>`) is keyed by `worktreeId` — only **one agent process per worktree**.
- `AgentSpawn` message only has `{ worktreeId, agentType }` — no session ID.
- `handleAcpPayload` routes by `worktreeId` extracted from the event data.
- `AcpChat` reads by `worktreeId` — no per-tab isolation.

### The One-Session Constraint
- The `+` button in `AgentPane` calls `handleSpawnAgent()` which sends `AgentSpawn`.
- But the server checks for existing agents per worktree implicitly (one `AcpClient` per worktree in `clients` HashMap).
- The `AgentStatusUpdate` handler in the store always creates or updates — never creates a second session for the same worktree.

### SessionController (acp-chat-core) is NOT Used for Agent Tabs
- The `acpSessionManager` creates `SessionController` instances but these are for the **direct JSON-RPC path** (not used by agent tabs).
- Agent tabs use the **accumulator-first** pattern: events flow agent → server → broadcast → Zustand accumulator → UI.
- The `acpSessionManager.handleAcpPayload()` call exists for backward compatibility but is a secondary path.
