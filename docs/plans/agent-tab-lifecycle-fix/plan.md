# Agent Tab Lifecycle Fix — Implementation Plan

**Approach:** D (Accumulator-First UI)
**Date:** 2026-05-06

---

## Problem Summary

Agent tabs render "No ACP session available for this worktree." because:

1. `acp_payload` messages are intercepted by `yws-transport.ts` and routed ONLY to `acpSessionManager`
2. `acpSessionManager` expects raw ACP JSON-RPC (with `id`, `method`, `result`) but receives `AcpEventEnvelope` format (with `sequence`, `eventType`, `data`)
3. No `SessionController` is ever created for agent tabs, so `acpSessionManager.getAcpStore(worktreeId)` returns `null`
4. The Zustand store's `acpAccumulator` — which already handles `AcpEventEnvelope` format correctly — never receives the events

**Key insight:** The server already broadcasts all ACP events as `AcpWireEvent` -> `acp_payload`. The `acpAccumulatorReducer` in `store.ts` already correctly processes these events. We just need to (a) wire the events to the accumulator and (b) render from accumulator state.

---

## Architecture

### Before (broken)
```
Server: AcpWireEvent -> acp_payload (AcpEventEnvelope)
  -> yws-transport intercepts
  -> acpSessionManager.handleAcpPayload()
  -> YmirAcpTransport.receiveAcpPayload() (expects JSON-RPC, drops everything)
  -> NOTHING
```

### After (fixed)
```
Server: AcpWireEvent -> acp_payload (AcpEventEnvelope)
  -> yws-transport intercepts
  -> dispatchAccumulator({ type: 'EVENT_RECEIVED', envelope, worktreeId })  // NEW
  -> acpAccumulatorReducer processes events into AccumulatedThread
  -> AgentRuntimeProvider reads from acpAccumulator.threads
  -> @assistant-ui/react renders Thread

User sends message:
  -> AgentRuntimeProvider.onNew()
  -> dispatchAccumulator({ type: 'USER_MESSAGE', ... })
  -> AgentSend via WebSocket
  -> Server -> ACP runtime -> agent process
  -> ACP events broadcast back -> acp_payload -> accumulator
```

---

## Implementation Phases

### Phase 1: Dispatch acp_payload to Zustand Accumulator

**File:** `apps/web/src/lib/yws-transport.ts`

**Change:** In `handleAcpPayload()`, add accumulator dispatch BEFORE the existing `acpSessionManager` call.

Current code (lines 387-399):
```typescript
private handleAcpPayload(message: BridgeMessage): void {
  const payload = (message as any).payload as Record<string, unknown> | null;
  if (!payload) return;

  // Extract worktreeId from payload data for routing
  const { activeWorktreeId } = useStore.getState();
  const data = (payload.data as Record<string, unknown>) ?? {};
  const worktreeId = (data as any)?.worktreeId ?? activeWorktreeId;

  if (worktreeId) {
    acpSessionManager.handleAcpPayload(worktreeId, payload);
  }
}
```

New code:
```typescript
private handleAcpPayload(message: BridgeMessage): void {
  const payload = (message as any).payload as Record<string, unknown> | null;
  if (!payload) return;

  // Extract worktreeId from payload data for routing
  const { activeWorktreeId } = useStore.getState();
  const data = (payload.data as Record<string, unknown>) ?? {};
  const worktreeId = (data as any)?.worktreeId ?? activeWorktreeId;

  if (worktreeId) {
    // Dispatch to Zustand accumulator (Approach D: accumulator-first)
    // The server serializes AcpEventEnvelope as the payload, which is
    // the exact format acpAccumulatorReducer expects.
    if (payload.eventType && typeof payload.sequence === 'number') {
      useStore.getState().dispatchAccumulator({
        type: 'EVENT_RECEIVED',
        envelope: payload as unknown as AcpEventEnvelope,
        worktreeId,
      });
    }

    // Keep existing routing for backward compatibility
    acpSessionManager.handleAcpPayload(worktreeId, payload);
  }
}
```

**Required import:** Add `AcpEventEnvelope` to imports from `../types/protocol`.

**Rationale:** The server's encoder (`crates/ws-server/src/bridge/encoder.rs` line 29-31) serializes the `AcpEventEnvelope` as the `acp_payload` payload via `serde_json::to_value(&envelope)`. This produces:
```json
{
  "sequence": 1,
  "eventType": "SessionInit",
  "data": { "worktreeId": "...", "acpSessionId": "...", ... },
  "timestamp": 1234567890
}
```
This is exactly the `AcpEventEnvelope` shape the reducer expects.

---

### Phase 2: Rewrite AcpChat.tsx to Use Accumulator

**File:** `apps/web/src/components/agent/AcpChat.tsx`

**Strategy:** Replace `acpSessionManager.getAcpStore()` + `Thread` from `@harms-haus/acp-chat-react` with `AgentRuntimeProvider` from the existing `AgentRuntimeProvider.tsx` + `@assistant-ui/react` Thread.

The `AgentRuntimeProvider` component already exists and:
- Reads from `useStore((state) => state.acpAccumulator.threads.get(worktreeId))`
- Converts `AccumulatedMessage[]` to `ThreadMessageLike[]` for `@assistant-ui/react`
- Handles `onNew` (send message) via `AgentSend` protocol
- Handles `onCancel` via `AgentCancel` protocol
- Provides streaming state via `isRunning`

**New AcpChat.tsx:**

```typescript
import { useStore } from '../../store';
import { useWebSocketClient } from '../../hooks/useWebSocket';
import { AgentRuntimeProvider } from './AgentRuntimeProvider';
import { Thread as AssistantThread } from '@assistant-ui/react';
import './acp-chat.css';

interface AcpChatProps {
  sessionId: string;
  agentType: string;
  worktreeId: string;
  onSendMessage: (message: string) => void;
}

export function AcpChat({
  sessionId,
  agentType,
  worktreeId,
  onSendMessage,
}: AcpChatProps) {
  const client = useWebSocketClient();

  // Read accumulator state for this worktree
  const thread = useStore((state) => state.acpAccumulator.threads.get(worktreeId));

  // Show empty state while waiting for session init
  if (!thread) {
    return (
      <div className="acp-chat-container">
        <div className="acp-chat-empty">
          <p>Waiting for agent session...</p>
        </div>
      </div>
    );
  }

  return (
    <AgentRuntimeProvider
      worktreeId={worktreeId}
      sessionId={sessionId}
      onSendMessage={onSendMessage}
    >
      <div className="acp-chat-container">
        <div className="acp-chat-thread-wrapper">
          <AssistantThread />
        </div>
      </div>
    </AgentRuntimeProvider>
  );
}
```

**Changes from current:**
- Removes dependency on `acpSessionManager` entirely for agent tabs
- Removes `Thread` from `@harms-haus/acp-chat-react` (no longer needed for agent tabs)
- Removes `AcpChatComposer` (the `@assistant-ui/react` Thread includes its own composer)
- Uses `AgentRuntimeProvider` which wraps `@assistant-ui/react`'s `AssistantRuntimeProvider`
- Empty state changes from "No ACP session available" to "Waiting for agent session..." (more accurate — it's a timing issue, not a permanent failure)

**Note:** The `AgentRuntimeProvider` component at `AgentRuntimeProvider.tsx` is already fully functional. It:
- Reads thread state from the Zustand accumulator (line 82-84)
- Converts messages (line 29-69)
- Handles send via `onNew` callback (line 88-97)
- Handles cancel via `onCancel` callback (line 99-102)

---

### Phase 3: Remove Dead acp_payload Handler in handleBridgeMessage

**File:** `apps/web/src/store.ts` (lines 1584-1598)

The `case 'acp_payload'` in `handleBridgeMessage()` is dead code — `yws-transport.ts` intercepts `acp_payload` before it reaches `handleBridgeMessage`. However, this dead code would become relevant if we ever stop intercepting in `yws-transport`.

**Change:** Update the dead code handler to also dispatch to the accumulator (same logic as Phase 1), so both paths are consistent:

```typescript
case 'acp_payload': {
  if (!isAcpPayload(message)) return;

  const payload = message.payload as Record<string, unknown> | null;
  if (!payload) return;

  const { activeWorktreeId } = useStore.getState();
  const data = (payload.data as Record<string, unknown>) ?? {};
  const worktreeId = (data as any)?.worktreeId ?? activeWorktreeId;

  if (worktreeId) {
    // Dispatch to accumulator if this looks like an AcpEventEnvelope
    if (payload.eventType && typeof payload.sequence === 'number') {
      useStore.getState().dispatchAccumulator({
        type: 'EVENT_RECEIVED',
        envelope: payload as unknown as AcpEventEnvelope,
        worktreeId,
      });
    }

    // Also route through acpSessionManager for backward compat
    acpSessionManager.handleAcpPayload(worktreeId, payload);
  }
  break;
}
```

This ensures both code paths dispatch to the accumulator consistently.

---

### Phase 4: Handle AgentSessionState.acpSessionId Population

**File:** `apps/web/src/store.ts` (lines 1250-1295, `case 'agent_event'`)

Currently, when `AgentStatusUpdate` arrives, the session is created with `acpSessionId: undefined` (line 1274). But the ACP session init event carries the `acpSessionId` in the accumulator's thread state.

**Change:** When the accumulator receives a `SessionInit` event and creates a thread, also update the corresponding `AgentSessionState.acpSessionId`. This can be done in one of two ways:

**Option A (Preferred):** In `acpAccumulatorReducer`, dispatch a side effect to update `agentSessions`. However, reducers should be pure — so instead, add the side effect in `yws-transport.ts` after dispatching:

In `handleAcpPayload()`, after `dispatchAccumulator()`, check if the event is `SessionInit` and update the agent session:
```typescript
if (payload.eventType === 'SessionInit') {
  const acpSessionId = (data as any)?.acpSessionId;
  // Update agentSessions if we have a matching session for this worktree
  const sessions = useStore.getState().agentSessions;
  const session = sessions.find(s => s.worktreeId === worktreeId);
  if (session && !session.acpSessionId && acpSessionId) {
    useStore.getState().updateAgentSession(session.id, { acpSessionId });
  }
}
```

**Option B:** Leave as-is — the `acpSessionId` on `AgentSessionState` is optional and the UI doesn't depend on it for the accumulator approach. The accumulator tracks the `acpSessionId` in its own `AccumulatedThread.acpSessionId` field.

---

### Phase 5: Cleanup Dead AcpChatComposer

**File:** `apps/web/src/components/agent/AcpChat.tsx`

The current `AcpChatComposer` component (lines 98-223) is only used inside `AcpChat.tsx`. Once `AcpChat` switches to `@assistant-ui/react` Thread (which has its own composer), the `AcpChatComposer` component becomes dead code.

**Action:** Remove the `AcpChatComposer` function component from `AcpChat.tsx` after Phase 2 is complete.

Also remove the now-unused CSS classes in `apps/web/src/components/agent/acp-chat.css` that were specific to `AcpChatComposer` (`.acp-composer-*` classes).

---

## Files Changed Summary

| File | Phase | Change Type | Description |
|------|-------|-------------|-------------|
| `apps/web/src/lib/yws-transport.ts` | 1, 4 | MODIFY | Add accumulator dispatch + SessionInit side effect in `handleAcpPayload()` |
| `apps/web/src/components/agent/AcpChat.tsx` | 2, 5 | REWRITE | Replace acpSessionManager with accumulator + AgentRuntimeProvider |
| `apps/web/src/store.ts` | 3 | MODIFY | Add accumulator dispatch in dead `acp_payload` handler |
| `apps/web/src/components/agent/acp-chat.css` | 5 | MODIFY | Remove dead AcpChatComposer styles |

**Files NOT changed (by design):**
- `crates/ws-server/` — Server-side ACP is already working correctly
- `~/acp-chat-ui-react/` — No contamination of upstream library
- `apps/web/src/lib/acp-session-manager.ts` — Kept for backward compatibility
- `apps/web/src/components/agent/AgentRuntimeProvider.tsx` — Already correct, no changes needed
- `apps/web/src/components/agent/AgentPane.tsx` — No changes needed (lifecycle already works)

---

## Verification Checklist

After implementation, verify these lifecycle steps work end-to-end:

1. **Mount:** AgentPane mounts -> sends AgentSpawn -> server creates session -> broadcasts AgentStatusUpdate(Working) -> client adds to agentSessions -> tab created
2. **ACP Init:** Server ACP runtime spawns agent process -> SessionInit event -> broadcast as acp_payload -> accumulator creates thread -> AcpChat shows "Thread" instead of empty state
3. **Send Message:** User types in composer -> AgentRuntimeProvider.onNew() -> dispatchAccumulator(USER_MESSAGE) + AgentSend via WS -> server sends to ACP runtime -> agent processes
4. **Receive Response:** Agent produces output -> PromptChunk events -> broadcast as acp_payload -> accumulator appends to messages -> @assistant-ui/react Thread renders streaming text
5. **Complete:** Agent finishes -> PromptComplete event -> accumulator sets isStreaming=false -> Thread shows complete message
6. **Cancel:** User clicks stop -> AgentRuntimeProvider.onCancel() -> AgentCancel via WS -> server kills agent process
7. **Tab Close:** User closes tab -> AgentPane.handleCloseTab -> AgentCancel + removeAgentTab

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| @assistant-ui/react Thread styling doesn't match existing design | Medium | Low | Custom CSS overrides in acp-chat.css |
| Accumulator events arrive before tab renders | Low | Low | Accumulator is global state, persists across renders |
| worktreeId extraction from payload fails | Low | Medium | Fallback to activeWorktreeId (existing behavior) |
| acpSessionManager.handleAcpPayload throws on unexpected format | Low | Low | Keep try/catch, it already silently drops unknown payloads |

---

## Implementation Order

Execute phases in order: 1 -> 2 -> 3 -> 4 -> 5

Phase 1 and 2 are the minimum viable fix. Phases 3-5 are cleanup.
