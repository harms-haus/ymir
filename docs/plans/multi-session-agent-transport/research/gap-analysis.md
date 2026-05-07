# Gap Analysis: Multi-Session Agent Transport

## Gap 1: Accumulator Thread Key is worktreeId, Not acpSessionId

**Severity: Critical**

### Current State
- `AcpAccumulatorState.threads: Map<string, AccumulatedThread>` keyed by `worktreeId`.
- `AcpAccumulatorAction.EVENT_RECEIVED: { envelope, worktreeId }` routes by `worktreeId`.
- All actions (`USER_MESSAGE`, `FLUSH_THREAD`, `SET_STREAMING`, `REBUILD_FROM_SNAPSHOT`) use `worktreeId`.

### Problem
- Only one thread per worktree. Multiple agent sessions for the same worktree would overwrite each other's events.
- Two tabs sharing the same session (same `acpSessionId`) on different worktrees can't share state.

### Fix Required
1. Change `threads` Map key from `worktreeId` to `acpSessionId`.
2. Update `AccumulatedThread` to still carry `worktreeId` (for reference) but use `acpSessionId` as primary key.
3. Update all `AcpAccumulatorAction` variants to include `acpSessionId` instead of (or in addition to) `worktreeId`.
4. Update `acpAccumulatorReducer` to look up threads by `acpSessionId`.
5. Update all callers of `dispatchAccumulator` to pass the `acpSessionId`.

### Files Affected
- `apps/web/src/types/state.ts` — type definitions
- `apps/web/src/store.ts` — reducer logic
- `apps/web/src/lib/yws-transport.ts` — dispatches EVENT_RECEIVED
- `apps/web/src/components/agent/AgentRuntimeProvider.tsx` — reads from accumulator
- `apps/web/src/components/agent/AcpChat.tsx` — reads from accumulator

---

## Gap 2: AcpRuntime Supports Only One Agent Per Worktree

**Severity: Critical**

### Current State
- `AcpRuntime` maintains `clients: HashMap<Uuid, AcpClient>` keyed by `worktree_id`.
- `AcpCommand::Spawn` uses `worktree_id` as the routing key.
- `AcpHandle::spawn_agent()` takes `worktree_id` — no session/tab identifier.
- If you try to spawn a second agent for the same worktree, it overwrites the first entry.

### Problem
- Cannot run multiple agent processes for the same worktree.
- Cannot route commands (SendPrompt, Cancel, Kill) to a specific agent when multiple exist.

### Fix Required
1. Change `clients` from `HashMap<Uuid, AcpClient>` to `HashMap<(Uuid, Uuid), AcpClient>` where the key is `(worktree_id, session_id)`.
   - OR: Use a nested structure `HashMap<Uuid, HashMap<Uuid, AcpClient>>` (worktree → sessions).
2. Add `session_id` to `AcpCommand::Spawn`.
3. Add `session_id` to all command variants (SendPrompt, Cancel, Kill, SetSessionConfigOption, Status).
4. Update `AcpHandle` methods to accept `session_id`.
5. The `BroadcastingEventSender` doesn't need changes — it already broadcasts everything. Session filtering happens on the client.

### Files Affected
- `crates/ws-server/src/agent/acp.rs` — AcpRuntime, AcpHandle, AcpCommand
- `crates/ws-server/src/agent/handler.rs` — handle_agent_spawn, handle_agent_send, handle_agent_cancel

---

## Gap 3: AgentSpawn Protocol Has No Session/Tab Identifier

**Severity: High**

### Current State
- `AgentSpawn { worktree_id, agent_type }` — only identifies the worktree, not which tab requested the spawn.
- `AgentStatusUpdate { id, worktree_id, agent_type, status, started_at }` — `id` is server-generated, not correlated to the tab.

### Problem
- The client cannot correlate which tab's spawn request resulted in which server-side session.
- When multiple tabs exist for the same worktree, the client can't tell which `AgentStatusUpdate` corresponds to which tab.

### Fix Required
1. Add `session_id` (client-generated UUID) to `AgentSpawn` so the client can correlate spawn requests to responses.
   - OR: Use the existing `Ack { message_id: session_id }` — the server already returns the generated session ID in the Ack's `message_id` field. But this is a server-generated ID, not a client-requested one.
2. `AgentStatusUpdate` already includes `id` (the session UUID) — the client can use this to create tabs.
3. **Better approach**: Let the server generate the `session_id` as it does now, but ensure the `AgentStatusUpdate` is the single source of truth for tab creation. The `Ack` already returns `message_id = session_id`, which the client could use proactively.
4. For multi-session: The client needs to include the `acpSessionId` in `AgentStatusUpdate` (it's currently only available later via `SessionInit` event). Consider including `acpSessionId: null` in the initial update and populating it later.

### Files Affected
- `crates/ws-server/src/protocol/agent.rs` — AgentSpawn type
- `crates/ws-server/src/agent/handler.rs` — handle_agent_spawn
- `apps/web/src/types/protocol.ts` (generated) — TS type for AgentSpawn

---

## Gap 4: handleAcpPayload Routes Only by worktreeId

**Severity: Critical**

### Current State
```typescript
// yws-transport.ts: handleAcpPayload()
const data = (payload.data as Record<string, unknown>) ?? {};
const worktreeId = data?.worktreeId ?? activeWorktreeId;

// Routes to accumulator by worktreeId
dispatchAccumulator({ type: 'EVENT_RECEIVED', envelope: payload, worktreeId });
```

### Problem
- Events from different agent sessions for the same worktree all go to the same accumulator thread.
- The `acpSessionId` is available in `payload.data` but is only used for the `SessionInit` handler (to update `AgentSessionState.acpSessionId`).

### Fix Required
1. Extract `acpSessionId` from the payload data.
2. Pass it to `dispatchAccumulator` as the routing key.
3. Handle the `SessionInit` case where `acpSessionId` isn't known yet (the first event might be `SessionInit` itself, which carries the `acpSessionId`).
4. For events before `SessionInit` (like `AgentStatusUpdate` which is a separate BridgeMessage, not an ACP event), the routing is already separate — `AgentStatusUpdate` comes through `agent_event`, not `acp_payload`.

### Files Affected
- `apps/web/src/lib/yws-transport.ts` — handleAcpPayload

---

## Gap 5: AcpChat and AgentRuntimeProvider Read by worktreeId

**Severity: High**

### Current State
```typescript
// AcpChat.tsx
const thread = useStore((state) => state.acpAccumulator.threads.get(worktreeId));

// AgentRuntimeProvider.tsx
const thread = useStore((state) => state.acpAccumulator.threads.get(worktreeId));
```

### Problem
- If the accumulator threads are keyed by `acpSessionId`, these components need to know which `acpSessionId` to look up.
- The `AgentSessionState` has `acpSessionId` but it's populated asynchronously (after `SessionInit`).

### Fix Required
1. Change `AcpChat` to receive `acpSessionId` as a prop (or derive it from `AgentSessionState`).
2. Change lookup: `threads.get(acpSessionId)` instead of `threads.get(worktreeId)`.
3. The `AgentPane` already passes `sessionId` (the server session UUID) to `AcpChat`. Need to also pass (or look up) the `acpSessionId`.

### Files Affected
- `apps/web/src/components/agent/AcpChat.tsx`
- `apps/web/src/components/agent/AgentRuntimeProvider.tsx`
- `apps/web/src/components/agent/AgentPane.tsx` (may need to pass acpSessionId)

---

## Gap 6: AgentSend Targets Only by worktreeId

**Severity: High**

### Current State
- `AgentSend { worktree_id, message }` — no session targeting.
- `handle_agent_send()` finds the agent by `worktree_id` in `state.agents`.
- `AcpHandle::send_prompt()` takes only `worktree_id`.

### Problem
- With multiple agents per worktree, the server can't know which agent should receive the prompt.

### Fix Required
1. Add `session_id` to `AgentSend` protocol type.
2. `handle_agent_send()` should look up the agent by `(worktree_id, session_id)` or by `session_id` alone.
3. `AcpHandle::send_prompt()` needs the session ID to route to the correct `AcpClient`.
4. Client-side: `AgentPane.handleSendMessage()` must include the current tab's session ID.

### Files Affected
- `crates/ws-server/src/protocol/agent.rs` — AgentSend type
- `crates/ws-server/src/agent/handler.rs` — handle_agent_send
- `crates/ws-server/src/agent/acp.rs` — AcpHandle::send_prompt
- `apps/web/src/types/protocol.ts` — TS type
- `apps/web/src/components/agent/AgentPane.tsx` — handleSendMessage

---

## Gap 7: Shared Session Reference Not Supported

**Severity: Medium**

### Current State
- Each `AgentTab` has a `sessionId` pointing to an `AgentSessionState`.
- The accumulator is keyed by `worktreeId` — only one thread exists per worktree.
- There's no concept of two tabs sharing the same ACP session.

### Problem
- The PROMPT.md requirement says: "if two tabs use the SAME session ID, they should share the reference (both tabs update the UI at the same time)."
- Currently, each tab creates its own agent session — sharing doesn't exist.

### Fix Required
1. When accumulator is keyed by `acpSessionId`, two tabs reading the same `acpSessionId` automatically share the same `AccumulatedThread`.
2. The `AcpChat` component subscribes to the thread by `acpSessionId` — both tabs get re-rendered when the thread updates.
3. The UI layer needs to support the concept of "connecting to an existing session" vs "creating a new session."

### Files Affected
- `apps/web/src/components/agent/AgentPane.tsx` — tab creation logic
- `apps/web/src/components/agent/AcpChat.tsx` — reads by acpSessionId
- `apps/web/src/store.ts` — tab-to-session mapping

---

## Gap 8: acpSessionId Not Available at Tab Creation Time

**Severity: Medium**

### Current State
- `AgentStatusUpdate` (from `agent_event` BridgeMessage) creates the `AgentSessionState` with `acpSessionId: undefined`.
- The `acpSessionId` is only populated later when the `SessionInit` ACP event arrives (via `acp_payload`).
- The tab is created before `acpSessionId` is known.

### Problem
- The accumulator needs `acpSessionId` as the routing key, but it's not available when the first events arrive.
- Events between agent spawn and `SessionInit` (like early status events) would need a temporary key.

### Fix Required
1. Use the server-generated `session_id` (UUID) as the initial key until `acpSessionId` is available.
2. When `SessionInit` arrives, re-key the thread from `session_id` to `acpSessionId`.
3. OR: Have the server include the `acpSessionId` in the `AgentStatusUpdate` (requires server to wait for ACP session init before broadcasting, which adds latency).
4. OR: Use a composite key that includes both: `{worktreeId}:{serverSessionId}` initially, then switch to `acpSessionId`.

### Recommended Approach
- Use `acpSessionId` as the primary key in the accumulator.
- For the brief period between agent spawn and `SessionInit`, buffer early events or use the server `session_id` as a temporary key.
- On `SessionInit`, if a temporary thread exists, migrate it to the `acpSessionId` key.

---

## Gap 9: handle_agent_cancel Routes Only by worktreeId

**Severity: Medium**

### Current State
- `AgentCancel { worktree_id, session_id }` — has both fields but `handle_agent_cancel()` uses `worktree_id` to find the agent.
- `AcpHandle::kill()` takes only `worktree_id`.

### Problem
- If multiple agents exist for a worktree, cancel would kill the wrong one (or the first one found).

### Fix Required
1. Route by `session_id` in `handle_agent_cancel()`.
2. `AcpHandle::kill()` needs the session ID.

### Files Affected
- `crates/ws-server/src/agent/handler.rs` — handle_agent_cancel
- `crates/ws-server/src/agent/acp.rs` — AcpHandle::kill

---

## Summary: Priority Order

| Priority | Gap | Impact | Status |
|----------|-----|--------|--------|
| P0 | Gap 2: AcpRuntime one agent per worktree | Cannot spawn multiple agents | RESOLVED: Multi-session spawn supported |
| P0 | Gap 1: Accumulator keyed by worktreeId | Cannot separate per-session events | RESOLVED: Accumulator keyed by threadId |
| P0 | Gap 4: handleAcpPayload routes by worktreeId | Events go to wrong thread | RESOLVED: Routes by agentTabId with worktreeId fallback |
| P1 | Gap 3: AgentSpawn has no session identifier | Cannot correlate spawn to tab | RESOLVED: agentTabId assigned on spawn |
| P1 | Gap 6: AgentSend targets by worktreeId only | Cannot send prompt to specific agent | RESOLVED: AgentSend uses agentTabId |
| P1 | Gap 5: AcpChat reads by worktreeId | UI shows wrong thread | RESOLVED: AcpChat uses threadId |
| P2 | Gap 8: acpSessionId not available at tab creation | Temporary key needed | RESOLVED: Uses sessionId as thread key |
| P2 | Gap 7: Shared session reference | Feature requirement | RESOLVED |
| P2 | Gap 9: AgentCancel routes by worktreeId | Cancels wrong agent | RESOLVED: AgentCancel uses agentTabId |
