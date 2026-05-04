# Horizontal Patterns: Working ACP Terminal vs Broken Terminal Tabs

## ACP Terminal Data Flow (Working)

ACP (Agent Control Protocol) terminals are agent-requested terminals that use the same underlying PTY system but have a different rendering path.

### How ACP Terminal Create Works

**File**: `apps/web/src/lib/yws-transport.ts:202-227`

```tsx
private async handleAcpTerminalCreate(
  worktreeId: string,
  request: Record<string, unknown>,
): Promise<{ terminalId: string } | null> {
  const terminalId = crypto.randomUUID?.() ?? generateFallbackId();
  const message = {
    type: "TerminalCreate" as const,
    worktreeId,
    label: `agent-terminal-${terminalId.slice(0, 8)}`,
    shell: typeof command === "string" ? command : undefined,
  };
  this.send(message);
  return { terminalId };
}
```

The ACP terminal creation sends a `TerminalCreate` message through the same ymir WebSocket transport. The server responds with `TerminalCreated`. This response goes through the same `terminal_event` → `dispatchOnMessageHandlers()` → `handleBridgeMessage()` pipeline as the regular terminal tabs.

### ACP Terminal Rendering

**Finding**: ACP terminals do NOT render in the UI directly. The `handleAcpTerminalCreate` method creates a PTY session and returns a `terminalId` to the agent. The agent can then interact with this PTY session, but there is **no dedicated ACP terminal UI component** in the web frontend.

The ACP system uses the same PTY sessions as the user's terminal tabs. The difference is:
- **User terminal tabs**: Created by user clicking "+" button → `TerminalMount` → renders in `TerminalView` with ghostty-web
- **ACP terminals**: Created by agent requesting `terminal/create` → `TerminalCreate` → PTY session exists but is NOT rendered in UI

### Key Insight: ACP and Terminal Tabs Share the Same PTY System

Both flows use:
- Same `PtyManager` on the server
- Same `spawn_output_reader` for reading PTY output
- Same `state.broadcast(TerminalOutput)` for distributing output
- Same `terminal_event` BridgeEnvelope for transport
- Same `dispatchOnMessageHandlers()` for routing

The **only difference** is the client-side rendering:
- Terminal tabs: `TerminalView` component with ghostty-web rendering
- ACP: No UI component — agent interacts programmatically

## Comparing Data Flow: Terminal Tab vs ACP

### Message Routing Pipeline (Identical for Both)

```
Server PTY Output
  → state.broadcast(TerminalOutput { session_id, data })
  → BridgeEncoder: { type: "terminal_event", payload: { type: "TerminalOutput", ... } }
  → WebSocket
  → YmirWsTransport.handleEnvelope()
  → decodeBridgeJson()
  → dispatchOnMessageHandlers()
    → Extract payload.type = "TerminalOutput"
    → dispatchMsg = { type: "TerminalOutput", sessionId, data }
    → onMessage('TerminalOutput') handlers
```

Both ACP and terminal tab outputs travel through this **identical pipeline**.

### Where They Diverge

| Aspect | Terminal Tabs | ACP |
|--------|--------------|-----|
| Creation trigger | User clicks "+" or auto-create | Agent requests `terminal/create` |
| Client message | `TerminalMount { tabId, worktreeId }` | `TerminalCreate { worktreeId, shell }` |
| Server handler | `handle_terminal_mount()` | `handle_terminal_create()` |
| Server response | `TerminalMounted { tabId, sessionId }` | `TerminalCreated { sessionId, worktreeId }` |
| Store action | `addTerminalTab` + `setTabSession` | `addTerminalTab` (legacy path) |
| UI rendering | `TerminalView` with ghostty-web | **None** (no UI component) |
| History request | `TerminalRequestHistory { tabId, sessionId }` | N/A |
| History response | `TerminalTabHistory { tabId, data }` | N/A |

### What This Tells Us

Since ACP terminals don't have a UI renderer, we **cannot** compare a "working ACP terminal" against a "broken terminal tab" — the ACP terminal doesn't render anything to compare with.

However, we **can** use ACP as a diagnostic: if an agent creates a terminal and the PTY session works (the agent can read/write to it), then the **server-side PTY system and message routing are working**. The bug would be isolated to the client-side `TerminalView` component or its data flow.

## The Real Working Comparison: Old Session-Based vs New Tab-Based Terminal

The codebase has been through a migration from session-based terminals to tab-based terminals.

### Old Flow (Session-Based — potentially still active for backward compat)

```
UI: TerminalPane.handleCreateTab()
  → client.send(TerminalCreate { worktreeId, label })
  → Server: handle_terminal_create() → spawn PTY
  → Server response: TerminalCreated { sessionId, worktreeId, label, shell }
  → Store: addTerminalTab({ id: `legacy-${sessionId}`, activeSessionId: sessionId })
  → TerminalView mounts with sessionId
  → TerminalView sends: TerminalRequestHistory { sessionId, tabId: legacy-xxx }
  → Server: handle_terminal_request_history → queries DB by tab_id
  → Server response: TerminalTabHistory { tabId, data }
  → TerminalView receives via onMessage('TerminalTabHistory')
```

### New Flow (Tab-Based)

```
UI: TerminalPane.handleCreateTab()
  → client.send(TerminalMount { tabId, worktreeId, label })
  → Server: handle_terminal_mount() → get_or_create_session
  → Server broadcasts: TerminalMounted { tabId, sessionId, worktreeId }
  → Store: addTerminalTab + setTabSession(tabId, sessionId)
  → TerminalView mounts with tabId + sessionId
  → TerminalView sends: TerminalRequestHistory { tabId, sessionId }
  → Server: handle_terminal_request_history → queries DB by tab_id
  → Server response: TerminalTabHistory { tabId, data }
  → TerminalView receives via onMessage('TerminalTabHistory')
```

The key difference:
- **Old**: `TerminalCreate` → `TerminalCreated` → tab id = `legacy-${sessionId}`
- **New**: `TerminalMount` → `TerminalMounted` → tab id = user-provided UUID

### Potential Bug Source: Message Type Mismatch in History Response

Looking at `handler.rs:11-40`:

```rust
pub async fn handle_terminal_request_history(
    state: Arc<AppState>,
    msg: crate::protocol::TerminalRequestHistory,
) -> ServerMessage {
    let history = match state.db.get_terminal_output_by_tab(&msg.tab_id.to_string(), msg.limit.map(|l| l as i64)).await {
        // ...
    };
    let combined_output = history.join("");
    ServerMessage::new(ServerMessagePayload::TerminalTabHistory(
        crate::protocol::TerminalTabHistory {
            tab_id: msg.tab_id,
            data: combined_output,
        },
    ))
}
```

The server responds with `TerminalTabHistory`, NOT `TerminalHistory`. But `TerminalView.tsx` subscribes to **both** `TerminalHistory` AND `TerminalTabHistory`:

```tsx
const unsubscribeHistory = client.onMessage('TerminalHistory', ...);
const unsubscribeTabHistory = client.onMessage('TerminalTabHistory', ...);
```

So both should work. **However**, the `TerminalHistory` handler filters by `msg.sessionId` while `TerminalTabHistory` filters by `msg.tabId`. If the server sends `TerminalTabHistory` with the correct `tabId`, only the `TerminalTabHistory` handler will match.

## The Critical Difference: What Actually Renders

For the terminal to show content, one of these must happen:

1. **History path**: `TerminalTabHistory` arrives → `safeWrite(terminal, msg.data)` → ghostty renders
2. **Real-time path**: `TerminalOutput` arrives → `safeWrite(terminal, msg.data)` → ghostty renders
3. **Buffered path**: Data arrives before terminal init → buffered → flushed after init

If **none** of these happen, the terminal stays blank.

### Debug Checklist for TerminalOutput Delivery

1. **Is PTY output being generated?** → Check server logs for "Broadcast terminal output"
2. **Is the BridgeEnvelope correct?** → Check WebSocket traffic for `{ type: "terminal_event", payload: { type: "TerminalOutput", ... } }`
3. **Is dispatchOnMessageHandlers extracting the right type?** → Check if `payload.type` = "TerminalOutput"
4. **Is the onMessage handler registered?** → The handler is registered in useEffect with `[]` deps
5. **Does sessionId match?** → `msg.sessionId !== sessionIdRef.current` guard
6. **Is terminalRef.current non-null?** → Terminal must be initialized

### Debug Checklist for TerminalTabHistory Delivery

1. **Is TerminalRequestHistory being sent?** → Check WebSocket traffic for outgoing message
2. **Is the server responding?** → Check server logs, response should be TerminalTabHistory
3. **Does tabId match?** → `msg.tabId !== tabIdRef.current` guard
4. **Is terminalRef.current non-null?** → Terminal must be initialized

## Summary of Horizontal Analysis

| Finding | Detail |
|---------|--------|
| ACP terminals share the same PTY system as user tabs | Confirmed — same server handlers, same broadcast pipeline |
| ACP terminals have NO UI renderer | Agent interacts programmatically, no ghostty-web rendering |
| Old and new terminal flows use different message types | `TerminalCreate`/`TerminalCreated` vs `TerminalMount`/`TerminalMounted` |
| History response is always `TerminalTabHistory` | Not `TerminalHistory` — both handlers are registered but only TabHistory fires |
| The message routing pipeline is shared | Both flows use `terminal_event` → `dispatchOnMessageHandlers` → `onMessage` |
| **Key difference is client-side** | PTY output goes to all connected clients; rendering depends on TerminalView mounting and subscribing |
