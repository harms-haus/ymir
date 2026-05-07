# Multi-Session Agent Transport

## Goal

Enable multi-session transport for Ymir agent tabs. Ymir must be able to manage multiple agent tabs and keep their events separated such that each agent tab has its own ACP agent server.

## Requirements

1. **Ymir service manages multiple ACP agent processes** — each agent tab maps to a dedicated ACP agent process. The Ymir service manages each process's session ID and links it to the agent tab ID.

2. **One ACP agent process per session ID** — there should not be more than one ACP agent process per ACP session ID.

3. **acp-ws-bridge proxies events with session ID** — the bridge should proxy the events with the session ID so that the agent tab can differentiate which session to accumulate events for.

4. **Each agent tab contains its own state** — managed by `acp-chat-core` by accumulating events and converting them into state.

5. **Shared session reference** — if two tabs use the SAME session ID, they should share the reference (both tabs update the UI at the same time).

6. **Changes may require updates to `acp-chat-core` and related libraries** (in `~/acp-chat-ui-react/`).

## Boundary Constraints

- **Keep Ymir-specific logic in Ymir.**
- **Keep acp-chat logic in acp-chat.** The `acp-chat-core` is a simple library that turns ACP events into ACP state.
- **The `acp-chat-react` takes ACP state and renders it into UI.**
- **The acp-ws-bridge proxies ACP events over websocket.**
- **These boundaries MUST be respected.** Do not mix concerns across layers.

## Architecture Stack

The flow is: Ymir -> acp-chat-core library -> yws-transport -> acp-ws-bridge -> ACP agent.

## Agent Tab Current Architecture

Currently, the Rust server acts as the ACP client (spawning agent processes, managing `ClientSideConnection`), and the client renders from a Zustand accumulator (`acpAccumulator`) that receives `AcpEventEnvelope` events broadcast by the server.

### Current Event Flow

```
AgentPane mounts
  -> sends AgentSpawn { worktreeId, agentType }
  -> Server: handle_agent_spawn()
    -> Creates DB session, broadcasts AgentStatusUpdate(Working), returns Ack
    -> Background task: AcpHandle::spawn_agent()
    -> AcpRuntime spawns agent process via stdio
    -> ClientSideConnection::initialize() + new_session()
    -> On success: broadcasts AgentStatusUpdate(Idle)
  -> Client: handleBridgeMessage -> addAgentSession -> tab created

Server ACP events (ongoing):
  -> Agent process notifications
  -> YmirClientHandler::handle_session_notification()
  -> BroadcastingEventSender::send_event(AcpEventEnvelope)
  -> state.broadcast() as acp_payload BridgeMessage
  -> yws-transport.ts: handleAcpPayload()
    -> dispatchAccumulator({ type: 'EVENT_RECEIVED', envelope, worktreeId })
    -> acpAccumulatorReducer processes into AccumulatedThread
  -> AcpChat reads thread from accumulator
  -> AgentRuntimeProvider wraps @assistant-ui/react
```

## Key Files

- Rust server: `crates/ws-server/`
- Protocol types: `crates/ws-server/src/protocol/*.rs`
- Bridge codec: `crates/ws-server/src/bridge/`
- ACP handle: `crates/ws-server/src/agent/`
- Web client: `apps/web/src/`
- Transport: `apps/web/src/lib/yws-transport.ts`
- Bridge transport: `apps/web/src/lib/bridge-transport.ts`
- Store: `apps/web/src/store.ts`
- Agent pane: `apps/web/src/components/agent/`
- ACP chat core: `~/acp-chat-ui-react/packages/acp-chat-core/`
- ACP chat react: `~/acp-chat-ui-react/packages/acp-chat-react/`
- ACP WS bridge: `~/acp-chat-ui-react/packages/acp-ws-bridge/`
