# Vertical Slices: WebSocket Bridge, Agent Chat, and Terminal Communication

## Overview

This document traces five vertical slices through the ymir codebase to understand how the
current WebSocket bridge, agent chat, and terminal communication work. The goal is to identify
module boundaries, interfaces, and data flows that would need to change when replacing the
current hacky ws-bridge + acp-chat-core + acp-chat-react with proper packages from
`~/acp-chat-ui-react/packages`.

---

## Slice 1: WebSocket Connection

### Entry Point

- **Client**: `apps/web/src/lib/ws.ts` -> `YmirClient` class, instantiated as a singleton via `getWebSocketClient()`
- **Server**: `crates/ws-server/src/main.rs` -> `ws_handler()` on route `/`
- **Proxy**: `apps/web/vite.config.ts` -> `/ws` proxied to `ws://localhost:7319`

### Connection Lifecycle

```
Browser                           Vite Dev Server                    Rust ws-server
  |                                    |                                    |
  |-- ws://host:5173/ws ------------->|                                    |
  |    (rewrite: /ws -> /)           |                                    |
  |                                  |-- ws://localhost:7319/ ----------->|
  |                                  |                                    |-- accept WS
  |                                  |                                    |-- generate client_id (UUID)
  |                                  |                                    |-- state.connect(client_id)
  |                                  |                                    |    creates mpsc channel (256 capacity)
  |                                  |                                    |    registers ClientState{tx, timestamp}
  |                                  |                                    |-- spawn timeout checker (30s)
  |                                  |                                    |
  |<-- binary (MessagePack) --------|<-- binary (MessagePack) -----------|-- send StateSnapshot on connect
  |    StateSnapshot                 |    StateSnapshot                   |
```

### Key Files

| File | Purpose |
|------|---------|
| `apps/web/src/lib/ws.ts` | `YmirClient` class - WebSocket connection, reconnection, heartbeat, message encoding/decoding |
| `apps/web/src/hooks/useWebSocket.ts` | React hooks wrapping the singleton client |
| `crates/ws-server/src/main.rs` | Axum server, WS upgrade handler, message loop |
| `crates/ws-server/src/hub.rs` | `AppState` impl for connect/disconnect/broadcast/send_to |
| `crates/ws-server/src/state.rs` | `AppState` struct with clients `HashMap<Uuid, ClientState>` |
| `apps/web/vite.config.ts` | WS proxy: `/ws` -> `localhost:7319` |

### Protocol Details

- **Wire format**: MessagePack binary (`rmp_serde` on server, `@msgpack/msgpack` on client)
- **Envelope**: `{ version: number, type: string, data: object }` on client side
- **Version check**: Server rejects messages where `client_msg.version != PROTOCOL_VERSION`
- **Heartbeat**: Ping/Pong messages, 15s interval, 5s timeout (client-side)
- **Reconnection**: Exponential backoff (1s, 2s, 4s, 8s, 16s, 30s cap) with 20% jitter

### Connection State Machine

```
closed -> connecting -> open -> [heartbeat loop]
                          |
                          v on close
                       closed -> reconnecting -> connecting -> ...
```

### Module Boundaries

- The `YmirClient` is the sole abstraction between the browser and the Rust server
- `useWebSocket()` hooks expose: `client`, `status`, `error`
- No WebSocket connection abstraction layer exists between the client and React components - components call `client.send()` directly

### Interfaces That Would Change

When integrating `acp-ws-bridge`:
- The current `YmirClient` would be replaced by `WsTransport` from `@harms-haus/acp-ws-bridge`
- The `TransportClient` in acp-ws-bridge manages WS lifecycle similarly (connect, reconnect, status)
- **Key difference**: Current ymir uses MessagePack; acp-ws-bridge uses JSON envelope (`BridgeEnvelope`)
- The acp-ws-bridge envelope format: `{ version, seq, timestamp_ms, type, payload/status/line/code/signal }`
- acp-ws-bridge uses `acp_payload` and `bridge_status` envelope types vs ymir's type-discriminated messages

---

## Slice 2: Agent Chat Flow

### Entry Point

- **UI**: `apps/web/src/components/agent/AgentChat.tsx` -> `AgentChat` component
- **Runtime**: `apps/web/src/components/agent/AgentRuntimeProvider.tsx` -> `AgentRuntimeProvider`

### Data Flow: User Message to Agent Response

```
User types in Composer
  |
  v
AgentRuntimeProvider.onNew()
  |-- dispatchAccumulator({ type: 'USER_MESSAGE', worktreeId, content })
  |-- onSendMessage(textContent) -- callback from AgentChat
  |    (currently not wired to WS; the actual send happens via AgentChatContent's config selectors)
  |
  v
AgentChatContent: ConfigSelector onChange -> handleConfigChange
  |-- client.send({ type: 'AgentSetConfigOption', worktreeId, configId, value })
  |
  | When user sends a prompt, the actual agent send flow is:
  v
User presses Send in Composer
  |-- AgentRuntimeProvider.onNew() dispatches USER_MESSAGE to accumulator
  |-- But the actual AgentSend happens via...
```

Wait - let me trace the actual prompt send. Looking at the code, `onSendMessage` in `AgentChat` is passed from the parent but the actual prompt sending appears to be disconnected in the current code. The `AgentRuntimeProvider` dispatches `USER_MESSAGE` to the accumulator but the WS `AgentSend` call is not in this chain.

Looking at the protocol types, `AgentSend` is a valid client message type. The runtime provider calls `onSendMessage(textContent)` but the parent needs to wire this to a WS send. The current architecture seems to have a gap - the `onSendMessage` prop is passed down from `AgentPane` but the actual WS sending for prompts may be incomplete or handled elsewhere.

**Correction**: Looking more carefully at the flow, the current AgentChat uses `@assistant-ui/react` primitives. When the user sends a message:

1. `ComposerPrimitive.Send` triggers `AgentRuntimeProvider.onNew()`
2. `onNew()` calls `dispatchAccumulator({ type: 'USER_MESSAGE', ... })` to add the user message to the local accumulator
3. `onNew()` calls `onSendMessage(textContent)` - this callback is expected to trigger the actual WS `AgentSend`

The `onSendMessage` callback is passed from the parent component (`AgentPane` or wherever `AgentChat` is mounted). This callback should call `client.send({ type: 'AgentSend', worktreeId, message })`.

### Agent Response Flow

```
Agent process (claude-agent, opencode, pi-acp)
  |
  |-- via agent_client_protocol SDK (stdio JSON-RPC)
  v
AcpClient (crates/ws-server/src/agent/acp.rs)
  |-- ClientSideConnection handles JSON-RPC over stdio
  |-- YmirClientHandler (adapter.rs) receives session notifications
  |    |-- SessionUpdate::AgentMessageChunk -> AcpEvent::PromptChunk
  |    |-- SessionUpdate::ToolCall -> AcpEvent::ToolUse
  |    |-- SessionUpdate::ConfigOptionUpdate -> AcpEvent::ConfigOptionsUpdate
  |    |-- etc.
  |
  v
YmirClientHandler.send_event()
  |-- Creates AcpEventEnvelope { sequence, correlation_id, timestamp, event }
  |-- Calls BroadcastingEventSender.send_event()
  |
  v
BroadcastingEventSender (acp.rs)
  |-- Wraps envelope in ServerMessagePayload::AcpWireEvent
  |-- Sends via broadcast_tx (broadcast::channel(1024))
  |
  v
AppState broadcast loop (state.rs with_acp)
  |-- Subscribes to broadcast_tx, calls state.broadcast(msg) for each
  |
  v
AppState.broadcast() (hub.rs)
  |-- Iterates all connected clients, sends via each client's mpsc channel
  |
  v
handle_connection_loop (main.rs)
  |-- tokio::select! on rx.recv() and socket.next()
  |-- send_ws_message() serializes to MessagePack binary
  |
  v
Browser: YmirClient.ws.onmessage
  |-- decodeMessage() from ArrayBuffer
  |-- message.type === 'AcpWireEvent' -> decodeAcpEnvelope()
  |-- Calls acpEventHandlers for the eventType
  |-- Buffers event in acpEventBuffer (50ms flush window)
  |
  v
flushAcpBuffer() -> dispatchAccumulator({ type: 'EVENT_RECEIVED', envelope, worktreeId })
  |
  v
acpAccumulatorReducer (store.ts)
  |-- EVENT_RECEIVED case: routes by envelope.eventType
  |    |-- SessionInit -> creates thread, stores acpSessionId, configOptions
  |    |-- SessionStatus -> updates sessionStatus
  |    |-- PromptChunk -> appends text/structured content to last assistant message
  |    |-- PromptComplete -> sets isStreaming=false
  |    |-- ToolUse -> creates/updates tool card in message parts
  |    |-- ContextUpdate -> adds context card to last message
  |    |-- Error -> adds error card
  |    |-- ResumeMarker -> stores checkpoint
  |
  v
Zustand store update -> React re-render
  |-- AgentChatContent reads thread from store: state.acpAccumulator.threads.get(worktreeId)
  |-- ThreadPrimitive.Messages renders messages
  |-- convertAccumulatedMessage() transforms AccumulatedMessage to ThreadMessageLike
  |    |-- text parts -> { type: 'text', text }
  |    |-- tool parts -> { type: 'tool-call', toolCallId, toolName, args, result }
  |    |-- context parts -> { type: 'data', name, data }
  |    |-- permission parts -> { type: 'data', name: 'permission', data }
```

### Key Files

| File | Purpose |
|------|---------|
| `apps/web/src/components/agent/AgentChat.tsx` | UI: thread, composer, agent selector, config selectors |
| `apps/web/src/components/agent/AgentRuntimeProvider.tsx` | Bridges @assistant-ui/react to ymir's accumulator |
| `apps/web/src/components/agent/EventCards.tsx` | Renders permission cards, tool cards, plan cards, status cards |
| `apps/web/src/components/agent/card-schema.ts` | Schema types for event cards |
| `apps/web/src/store.ts` | Zustand store with `acpAccumulatorReducer` |
| `apps/web/src/types/state.ts` | `AccumulatedThread`, `AccumulatedMessage`, `AccumulatedToolCard`, etc. |
| `apps/web/src/types/protocol.ts` | `AcpEventEnvelope`, `AcpEvent`, all ACP types |
| `crates/ws-server/src/agent/acp.rs` | `AcpClient`, `AcpHandle`, `start_acp_runtime` - manages agent subprocesses |
| `crates/ws-server/src/agent/adapter.rs` | `YmirClientHandler` - translates ACP SDK events to WS-ACP wire types |
| `crates/ws-server/src/agent/handler.rs` | `handle_agent_spawn/send/cancel` - WS message handlers |
| `crates/ws-server/src/protocol/acp.rs` | Rust ACP type definitions (AcpEventEnvelope, AcpEvent, etc.) |

### ACP Event Envelope Format

```rust
// Server-side (Rust)
struct AcpEventEnvelope {
    sequence: u64,              // Monotonically increasing per session
    correlation_id: Option<AcpCorrelationId>,
    timestamp: u64,             // Unix ms
    event: AcpEvent,            // Tagged enum: SessionInit, PromptChunk, ToolUse, etc.
}

// Client-side (TypeScript)
interface AcpEventEnvelope {
    sequence: number;
    correlationId?: { value: string };
    timestamp: number;
    eventType: string;          // Flattened from Rust enum tag
    data: AcpEventData;         // Flattened from Rust enum content
}
```

### Module Boundaries

- **ACP SDK boundary**: `agent_client_protocol` crate (external SDK) <-> `YmirClientHandler` (adapter)
- **WS protocol boundary**: `AcpEventEnvelope` (Rust) <-> `AcpWireEvent` (TS in ServerMessage union)
- **Accumulator boundary**: Raw ACP events -> normalized `AccumulatedMessage` parts
- **UI boundary**: `AccumulatedMessage` -> `ThreadMessageLike` for @assistant-ui/react

### Interfaces That Would Change

- The entire accumulator layer (`acpAccumulatorReducer`, `AccumulatedThread`, etc.) would be replaced by `SessionController` + `AcpStore` from acp-chat-core/acp-chat-react
- `AgentRuntimeProvider` would be replaced by `AssistantRuntimeProvider` from acp-chat-react with a custom transport
- Event card rendering would use acp-chat-react's `ToolCall`, `ThoughtStack`, `PermissionRequestCard` components
- The current `AgentSend` -> `AcpHandle.send_prompt()` path would become `SessionController.sendPrompt()`

---

## Slice 3: Terminal Flow

### Entry Point

- **UI**: `apps/web/src/components/terminal/TerminalPane.tsx` -> `TerminalPane` component
- **Terminal view**: `apps/web/src/components/terminal/TerminalView.tsx` -> `Terminal` component (ghostty-web)
- **Provider**: `apps/web/src/components/terminal/TerminalProvider.tsx` -> `TerminalProvider`

### Session Creation Flow

```
TerminalPane mounts (worktreeId)
  |-- useEffect: if terminalSessions.length === 0 -> handleCreateTab()
  |
  v
handleCreateTab()
  |-- client.send({ type: 'TerminalCreate', worktreeId, label: 'Terminal N' })
  |
  v
Server: route_message() -> handle_terminal_create()
  |-- Get worktree path from state.worktrees
  |-- pty_manager.spawn(worktree_id, worktree_path, label, shell)
  |    |-- native_pty_system.openpty(PtySize{rows:24, cols:80})
  |    |-- Detect shell (/bin/bash, /bin/zsh, /bin/sh)
  |    |-- Spawn shell in worktree CWD
  |    |-- Create PtySession { master, writer, process, tx channel }
  |    |-- Return (session_id, rx: mpsc::UnboundedReceiver<Vec<u8>>)
  |
  |-- Get session reader: session.take_reader()
  |-- spawn_output_reader(session_id, reader, state) -> background tokio task
  |    |-- Loop: reader.read(buf) -> broadcast TerminalOutput + store to DB
  |
  |-- Create DB record: state.db.create_terminal_session()
  |-- Add to state.terminals HashMap
  |
  v
Server broadcasts: ServerMessagePayload::TerminalCreated { session_id, worktree_id, label, shell }
  |
  v
Browser: YmirClient.onmessage
  |-- updateStateFromServerMessage() -> creates terminal session in store
  |
  v
TerminalPane: useEffect on terminalSessions -> creates new tab
  |-- TerminalPanel renders with sessionId
  |    |-- Terminal component mounts
  |    |-- initializeGhostty()
  |    |-- new GhosttyTerminal() -> term.open(container)
  |    |-- term.onData -> sends TerminalInput to WS
  |    |-- term.onResize -> sends TerminalResize to WS
  |    |-- fitAddon.fit() + ResizeObserver
  |    |-- TerminalRequestHistory -> receives TerminalHistory for replay
```

### Input Flow

```
User types in ghostty-web terminal
  |
  v
GhosttyTerminal.onData(data: string)
  |
  v
TerminalView: wsClientRef.current.send({
    type: 'TerminalInput',
    sessionId: terminalSessionId,
    data,
  })
  |
  v
Server: route_message() -> handle_terminal_input()
  |-- pty_manager.write(session_id, data.as_bytes())
  |    |-- session.lock().write(data)
  |    |-- session.writer.write_all(data).flush()
  |    |-- Updates last_activity timestamp
  |
  v
Returns: Ack { message_id: session_id, status: Success }
```

### Output Flow

```
Shell writes to PTY master
  |
  v
spawn_output_reader() background task
  |-- Loop: reader.read(buf[4096])
  |-- split_at_valid_utf8() -> handle partial UTF-8 sequences
  |-- state.broadcast(TerminalOutput { session_id, data })
  |-- DB: append_terminal_output(session_id, data)
  |
  v
Server: AppState.broadcast() -> all clients receive
  |
  v
Browser: YmirClient.onmessage('TerminalOutput')
  |-- In TerminalPane.TerminalPanel:
  |    client.onMessage('TerminalOutput', (msg) => {
  |      if (msg.sessionId === tab.sessionId)
  |        terminalRef.current.write(msg.data)
  |    })
  |
  v
GhosttyTerminal.write(data) -> renders on screen
```

### Key Files

| File | Purpose |
|------|---------|
| `apps/web/src/components/terminal/TerminalPane.tsx` | Tab management, create/kill/reorder terminals |
| `apps/web/src/components/terminal/TerminalView.tsx` | ghostty-web wrapper, input/output routing |
| `apps/web/src/components/terminal/TerminalProvider.tsx` | Terminal instance registry, output callback routing |
| `crates/ws-server/src/pty/mod.rs` | `PtyManager`, `PtySession` structs |
| `crates/ws-server/src/pty/handler.rs` | `handle_terminal_create/input/kill/resize/request_history` |
| `crates/ws-server/src/pty/output.rs` | `spawn_output_reader` - background PTY read loop |

### Protocol Messages

| Direction | Type | Fields |
|-----------|------|--------|
| Client->Server | TerminalCreate | worktreeId, label?, shell? |
| Client->Server | TerminalInput | sessionId, data |
| Client->Server | TerminalResize | sessionId, cols, rows |
| Client->Server | TerminalKill | sessionId |
| Client->Server | TerminalRename | sessionId, newLabel |
| Client->Server | TerminalReorder | worktreeId, sessionIds |
| Client->Server | TerminalRequestHistory | sessionId, requestId, limit? |
| Server->Client | TerminalCreated | sessionId, worktreeId, label?, shell |
| Server->Client | TerminalOutput | sessionId, data |
| Server->Client | TerminalRemoved | sessionId |
| Server->Client | TerminalUpdated | sessionId, worktreeId, label?, position? |
| Server->Client | TerminalHistory | sessionId, data |

### Module Boundaries

- **PTY boundary**: `portable_pty` crate <-> `PtyManager` <-> `PtySession`
- **Output boundary**: `spawn_output_reader` task reads PTY master, broadcasts via AppState
- **WS boundary**: `TerminalInput`/`TerminalResize`/`TerminalCreate` messages
- **DB boundary**: Terminal sessions and output history stored in SQLite

### Interfaces That Would Change

- In acp-chat-core, terminals are handled via `TerminalSubscriptionManager` in `SessionController`
- The agent requests terminal creation via `terminal/create` JSON-RPC method
- The current ymir model (client creates terminals independently) differs from the ACP model (agent requests terminal creation)
- The `TerminalProvider` registry pattern would need to adapt to the ACP subscription model

---

## Slice 4: Current ACP Integration (WS-ACP Wire Contract)

### How the Current WS-Bridge Works

The current system does NOT use the `acp-ws-bridge` package. Instead, it has a custom wire protocol:

1. **Agent processes** are spawned as subprocesses using stdio JSON-RPC via `agent_client_protocol` SDK
2. **Events are translated** by `YmirClientHandler` (adapter.rs) from ACP SDK types to WS-ACP wire types
3. **Events are broadcast** through `BroadcastingEventSender` -> `broadcast_tx` -> `AppState.broadcast()`
4. **Client receives** `AcpWireEvent` messages wrapped in the standard ServerMessage envelope

### Envelope Format

```
Client Message (MessagePack):
  { version: 1, type: "AgentSpawn", data: { worktreeId, agentType } }

Server Message (MessagePack):
  { version: 1, type: "AcpWireEvent", data: {
      sequence: 42,
      timestamp: 1234567890,
      eventType: "PromptChunk",
      data: { worktreeId, acpSessionId, content: { type: "Text", data: "Hello" }, isFinal: false }
  }}
```

### ACP Event Types (both Rust and TS)

| Event Type | Data Type | Purpose |
|------------|-----------|---------|
| SessionInit | AcpSessionInit | Session created, capabilities + config options |
| ConfigOptionsUpdate | AcpConfigOptionsUpdate | Mode/model/other config options changed |
| SessionStatus | AcpSessionStatusEvent | Working/Waiting/Complete/Cancelled |
| PromptChunk | AcpPromptChunk | Streaming text or structured content |
| PromptComplete | AcpPromptComplete | Prompt finished (Normal/Cancelled/Error) |
| ToolUse | AcpToolUseEvent | Tool call lifecycle (Started->InProgress->Completed/Error) |
| ContextUpdate | AcpContextUpdate | FileRead, FileWritten, CommandExecuted, BrowserAction, MemoryUpdate |
| Error | AcpError | Structured error with code and recoverable flag |
| ResumeMarker | AcpResumeMarker | Checkpoint for replay/resume |

### Key Files

| File | Purpose |
|------|---------|
| `crates/ws-server/src/protocol/acp.rs` | Rust ACP type definitions (375 lines) |
| `crates/ws-server/src/agent/adapter.rs` | Translation from ACP SDK to WS-ACP wire types |
| `crates/ws-server/src/agent/acp.rs` | ACP runtime management, BroadcastingEventSender |
| `apps/web/src/types/protocol.ts` | TypeScript ACP types (lines 559-733) |
| `apps/web/src/store.ts` | `acpAccumulatorReducer` processes AcpEventEnvelope |

### ACP SDK Types Used

The `agent_client_protocol` crate provides:
- `Client` trait - implemented by `YmirClientHandler`
- `ClientSideConnection` - JSON-RPC over stdio
- `SessionUpdate` enum - all notification types from agent
- `RequestPermissionRequest/Response` - permission handling
- `ContentBlock` - text, image, resource, audio content
- `ToolCallStatus` - tool lifecycle states
- `SessionConfigOption` - mode/model configuration

### Comparison with acp-ws-bridge

The target `acp-ws-bridge` package (`~/acp-chat-ui-react/packages/acp-ws-bridge/src/ws-transport.ts`) uses a completely different protocol:

| Aspect | Current Ymir | acp-ws-bridge |
|--------|-------------|---------------|
| Wire format | MessagePack binary | JSON text |
| Envelope | `{ version, type, data }` with ServerMessage union | `BridgeEnvelope { version, seq, timestamp_ms, type, payload }` |
| Event types | Custom AcpEvent enum | Raw ACP JSON-RPC in `acp_payload` |
| Session management | Worktree-scoped, one agent per worktree | ACP session-scoped |
| Transport | Custom YmirClient with heartbeat, reconnect | TransportClient + WsTransport |
| Request/response | Via message type discrimination | JSON-RPC id matching |
| Sequence numbers | Per-session monotonic | Replay-only (zero in live mode) |

### Interfaces That Would Change

- The entire `YmirClient` -> `WsTransport` replacement
- `AcpEventEnvelope` -> `BridgeEnvelope` format change
- `YmirClientHandler` adapter would need rewriting or removal
- The `BroadcastingEventSender` would route through the ws-bridge server instead

---

## Slice 5: Workspace/Multi-tasking (Hub/Workspace)

### Entry Point

- **Rust**: `crates/ws-server/src/hub.rs`, `crates/ws-server/src/workspace/`, `crates/ws-server/src/worktree/`, `crates/ws-server/src/router.rs`
- **Client**: `apps/web/src/store.ts`, `apps/web/src/components/sidebar/WorkspaceTree.tsx`

### Workspace Hierarchy

```
Workspace (project root)
  |-- id, name, rootPath, color, icon, worktreeBaseDir
  |
  +-- Worktree (git worktree)
       |-- id, workspaceId, branchName, path, status, isMain
       |
       +-- AgentSessions (0..N per worktree)
       |    |-- id, worktreeId, agentType, acpSessionId?, status, startedAt
       |    |-- One of: claude, opencode, pi
       |
       +-- TerminalSessions (0..10 per worktree)
            |-- id, worktreeId, label, shell, createdAt
```

### Key Operations Flow

#### Workspace Creation
```
Client: WorkspaceCreate { name, rootPath, color?, icon?, worktreeBaseDir? }
  -> Server: workspace::create()
     -> DB: insert workspace
     -> In-memory: state.workspaces.insert()
  <- Server: WorkspaceCreated { workspace }
```

#### Worktree Creation (spawns agent automatically)
```
Client: WorktreeCreate { workspaceId, branchName, agentType?, useExistingBranch? }
  -> Server: worktree::create()
     -> DB: insert worktree
     -> Git: create worktree
     -> In-memory: state.worktrees.insert()
     -> If agentType provided: spawns agent via AcpHandle
  <- Server: WorktreeCreated { worktree }
```

#### State Synchronization on Connect
```
Client connects
  -> Server: state.connect(client_id) creates mpsc channel
  -> Client sends: GetState { requestId }
  -> Server: handle_get_state()
     -> Lists all workspaces from DB
     -> Loads worktrees, agent sessions, terminal sessions per workspace
     -> Returns: StateSnapshot { workspaces, worktrees: [], agentSessions: [], terminalSessions: [], settings: [] }
        (worktrees/agents/terminals are empty - lazy loaded)
  -> Client sends: GetWorktreeDetails { workspaceId, requestId }
  -> Server: handle_get_worktree_details()
     -> Loads worktrees for workspace
     -> For each worktree: loads agent sessions (only spawned ones), terminal sessions
  <- Server: WorktreeDetailsResult { worktrees, agentSessions, terminalSessions }
```

### Broadcasting Model

All state changes are broadcast to ALL connected clients:

```rust
// hub.rs
pub async fn broadcast(&self, message: ServerMessage) {
    let clients: Vec<_> = self.clients.read().await.iter()...collect();
    for (client_id, tx) in clients {
        let _ = tx.send(message.clone()).await;
    }
}
```

This means every client receives every workspace's events. There is no per-workspace or per-client filtering at the server level.

### Key Files

| File | Purpose |
|------|---------|
| `crates/ws-server/src/hub.rs` | Client connection management, broadcasting |
| `crates/ws-server/src/workspace/mod.rs` | Workspace CRUD operations |
| `crates/ws-server/src/worktree/mod.rs` | Worktree CRUD, git integration |
| `crates/ws-server/src/router.rs` | Message dispatch (1000+ lines) |
| `crates/ws-server/src/state.rs` | `AppState` struct and in-memory registries |
| `apps/web/src/store.ts` | Zustand store - workspace/worktree/agent/terminal state |
| `apps/web/src/components/sidebar/WorkspaceTree.tsx` | Workspace tree UI |
| `apps/web/src/uiStore.ts` | UI-only state (active worktree, expanded workspaces) |

### AppState Structure

```rust
pub struct AppState {
    pub db: Arc<Db>,
    pub git_ops: Arc<GitOps>,
    pub workspaces: RwLock<HashMap<Uuid, WorkspaceState>>,
    pub worktrees: RwLock<HashMap<Uuid, WorktreeState>>,
    pub agents: RwLock<HashMap<Uuid, AgentState>>,
    pub acp_handle: Option<AcpHandle>,          // ACP runtime handle
    pub terminals: RwLock<HashMap<Uuid, TerminalState>>,
    pub clients: RwLock<HashMap<Uuid, ClientState>>,
    pub broadcast_tx: broadcast::Sender<ServerMessage>,
    pub shutdown_rx: watch::Receiver<bool>,
    pub pty_manager: Option<Arc<PtyManager>>,
}
```

### Module Boundaries

- **DB boundary**: SQLite persistence, FK cascades for workspace->worktree->sessions
- **In-memory boundary**: RwLock-protected HashMaps for fast lookups
- **Broadcast boundary**: `broadcast::channel(1024)` for fan-out to all clients
- **ACP runtime boundary**: `AcpHandle` message-passing interface to `start_acp_runtime` task
- **PTY boundary**: `PtyManager` with TTL cleanup and per-worktree session limits

### Interfaces That Would Change

- The workspace/worktree model is ymir-specific and would likely remain
- The agent session model (one per worktree) differs from ACP's session model (multiple sessions per workspace)
- The terminal model (client-created) differs from ACP's model (agent-requested)
- The hub's broadcast-all model would need filtering for multi-tenant scenarios
- `AppState` with `acp_handle` and `pty_manager` would need refactoring for the new transport

---

## Summary: Key Integration Challenges

1. **Protocol mismatch**: Current ymir uses MessagePack with custom envelope; acp-ws-bridge uses JSON with `BridgeEnvelope`
2. **Session model**: Ymir uses worktree-scoped agents (1 per worktree); ACP uses independent sessions
3. **Terminal model**: Ymir has client-created PTYs; ACP has agent-requested terminals via JSON-RPC
4. **Event accumulation**: Ymir has a custom accumulator reducer; ACP has `SessionController` + `AcpStore`
5. **UI components**: Ymir uses @assistant-ui/react primitives directly; ACP provides higher-level components (Thread, Composer, ToolCall, etc.)
6. **Permission handling**: Ymir auto-approves permissions in adapter.rs; ACP has proper permission request/response flow
7. **Reconnection**: Ymir accumulators are flushed on reconnect; ACP has replay markers for state recovery
8. **Transport lifecycle**: Ymir singleton client vs ACP's per-session transport
