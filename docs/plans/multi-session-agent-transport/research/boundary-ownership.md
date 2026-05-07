# Boundary Ownership

## Principle: Keep Concerns Separated

Each layer owns specific responsibilities. Multi-session support must not leak concerns across boundaries.

## Ownership Table

| Layer | Package/Directory | Current Responsibility | Session ID Role | Changes Needed |
|-------|------------------|----------------------|-----------------|----------------|
| **ACP Agent Process** | External (hermes, claude, etc.) | Runs agent, sends notifications | Owns the ACP `SessionId` | None — already session-aware |
| **ACP Runtime (Rust)** | `crates/ws-server/src/agent/acp.rs` | Spawns/manages agent processes | Routes commands by `worktree_id` only | Must support multiple processes per worktree, route by compound key |
| **ACP Adapter (Rust)** | `crates/ws-server/src/agent/adapter.rs` | Translates ACP SDK → AcpEvent | Embeds `worktree_id` + `acp_session_id` in each event | Minimal — already carries both IDs |
| **Agent Handler (Rust)** | `crates/ws-server/src/agent/handler.rs` | Handles AgentSpawn/Send/Cancel | Routes by `worktree_id` | Must route by session ID |
| **Protocol Types (Rust)** | `crates/ws-server/src/protocol/agent.rs` | Defines AgentSpawn, AgentSend, etc. | AgentSpawn has only `worktree_id` | Add session/tab identifier to AgentSpawn and AgentSend |
| **ACP Protocol Types (Rust)** | `crates/ws-server/src/protocol/acp.rs` | Defines AcpEventEnvelope, AcpEvent | Events carry `acp_session_id` in data | Consider adding `acp_session_id` to envelope for routing |
| **Bridge Encoder (Rust)** | `crates/ws-server/src/bridge/encoder.rs` | ServerMessage → BridgeEnvelope | Passes AcpPayload as opaque JSON | **No changes** — bridge stays session-unaware |
| **Bridge Codec (Rust)** | `crates/ws-server/src/bridge/bridge_codec.rs` | Encode/decode bridge messages | No session concept | **No changes** |
| **acp-ws-bridge (npm)** | `~/acp-chat-ui-react/packages/acp-ws-bridge/` | WebSocket transport, envelope types | No session concept | **No changes** — bridge is transport-only |
| **yws-transport (Ymir)** | `apps/web/src/lib/yws-transport.ts` | Routes envelopes to handlers | Extracts `worktreeId` from payload | Must extract `acpSessionId` and route by it |
| **Zustand Store Accumulator** | `apps/web/src/store.ts` | Accumulates ACP events into state | Threads keyed by `worktreeId` | Must key threads by `acpSessionId` (or compound key) |
| **Accumulator Types** | `apps/web/src/types/state.ts` | AccumulatedThread, actions | `AccumulatedThread` has `acpSessionId` but unused as key | Change Map key, update all action types |
| **acp-session-manager** | `apps/web/src/lib/acp-session-manager.ts` | Manages SessionController instances | One controller per worktree | Must support multiple controllers per worktree |
| **acp-chat-core (npm)** | `~/acp-chat-ui-react/packages/acp-chat-core/` | ACP protocol, normalization | SessionController tracks one session | **No changes** — library is correctly scoped per-session |
| **acp-chat-react (npm)** | `~/acp-chat-ui-react/packages/acp-chat-react/` | React bindings for acp-chat-core | Creates Zustand stores per SessionController | **No changes** — correctly scoped |
| **AgentPane** | `apps/web/src/components/agent/AgentPane.tsx` | Tab management, spawn/close | Tabs have `sessionId` linking to AgentSessionState | Must send session info with AgentSpawn |
| **AcpChat** | `apps/web/src/components/agent/AcpChat.tsx` | Chat UI per tab | Reads accumulator by `worktreeId` (wrong for multi) | Must read accumulator by session key |
| **AgentRuntimeProvider** | `apps/web/src/components/agent/AgentRuntimeProvider.tsx` | Bridges accumulator to @assistant-ui/react | Reads by `worktreeId` | Must read by session key |

## Where NOT to Put Logic

### DO NOT put session routing in:
1. **acp-ws-bridge**: It is a general-purpose WebSocket transport. It must not know about Ymir sessions.
2. **acp-chat-core**: It is a protocol library. It must not know about Ymir's multi-tab architecture.
3. **acp-chat-react**: It is a UI binding layer. It must not know about Ymir's tab management.
4. **Bridge encoder/decoder (Rust)**: The bridge is opaque to ACP semantics. It passes payloads through without interpretation.

### DO NOT mix:
1. **Tab management** (AgentPane concern) with **event routing** (transport/accumulator concern). The tab UI should not decide which events go to which accumulator thread.
2. **Agent process management** (Rust AcpRuntime concern) with **UI state** (Zustand store concern). The Rust server should not need to know about tab IDs.
3. **ACP protocol** (acp-chat-core concern) with **Ymir protocol** (ymir protocol types concern). The ACP event types must stay in the ACP layer.

## Correct Session ID Ownership

| ID Type | Owner | Purpose | Uniqueness Scope |
|---------|-------|---------|-----------------|
| `worktree_id` (UUID) | Ymir server | Identifies a worktree (directory/branch) | Global |
| `session_id` (UUID) | Ymir server (`AgentSessionData.id`) | Identifies a server-side agent session record | Global |
| `acp_session_id` (string) | ACP agent (`SessionId`) | Identifies an ACP protocol session within an agent process | Per agent process |
| `tab_id` (string) | Ymir client (`AgentTab.id`) | Identifies a UI tab | Per client |

### Key Insight: The Routing Key Problem

Currently:
- **Server-side routing**: `worktree_id` → one AcpClient
- **Client-side routing**: `worktree_id` → one AccumulatedThread
- **UI routing**: `tab.sessionId` (server session_id) → one AcpChat

For multi-session:
- **Server-side routing**: needs `worktree_id + session_id` → one AcpClient
- **Client-side routing**: needs `acp_session_id` → one AccumulatedThread (so two tabs sharing a session see the same thread)
- **UI routing**: `tab.sessionId` → lookup `acp_session_id` → read correct thread

The `acp_session_id` is the natural routing key for the accumulator because:
1. It's already carried in every ACP event.
2. It's unique per agent process session.
3. It supports the "shared session reference" requirement (two tabs → same `acp_session_id` → same thread).
4. It doesn't require the bridge to change.

## Proposed Routing Flow

```
AgentPane sends AgentSpawn { worktreeId, agentType, sessionId }
  → Server creates AgentSession, spawns AcpClient
  → AcpClient gets acp_session_id from agent
  → Server broadcasts AgentStatusUpdate { id: sessionId, worktreeId, acpSessionId }
  → Client: addAgentSession({ id, worktreeId, acpSessionId })
  → AgentPane creates tab linked to sessionId

Agent process sends SessionNotification
  → YmirClientHandler emits AcpEventEnvelope (carries acp_session_id in data)
  → BroadcastingEventSender broadcasts as ServerMessage
  → Bridge encoder wraps as AcpPayload BridgeEnvelope
  → WebSocket sends to client

Client receives acp_payload
  → yws-transport: extract acp_session_id from payload data
  → dispatchAccumulator({ type: 'EVENT_RECEIVED', envelope, acpSessionId })
  → acpAccumulatorReducer: threads.get(acpSessionId) → update thread
  → AcpChat: reads thread by acpSessionId (looked up from AgentSessionState)
```
