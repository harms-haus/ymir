# Synthesis: Terminal UI Tabs Blank and Unresponsive — Root Cause Analysis

## Executive Summary

The terminal UI tabs show blank content and don't respond to typing because the `TerminalView` component is either **not receiving PTY data** or **not rendering it**. After tracing the full data flow from PTY output through WebSocket transport to ghostty-web rendering, the most likely root causes are ranked below.

## Ranked Root Causes

### RANK 1: Terminal Never Mounts Due to `activeSessionId` Being Null (Most Likely)

**Evidence**:
- `TerminalPane.tsx:43-55` — if `tab.activeSessionId` is null, renders "No session" instead of `Terminal`
- The store's `activeSessionId` is set by `setTabSession(tabId, sessionId)` which is triggered by `TerminalMounted` events
- If the `TerminalMounted` event is not received (routing issue, server error, or the tab was created but the session ended before the mount event arrived), the terminal component never mounts

**How to verify**:
1. Open browser dev tools → React DevTools → check if `<Terminal>` component exists under the tab
2. Check Zustand store state: `useStore.getState().terminalTabs` — does `activeSessionId` have a value?
3. Check browser console for any `TerminalMounted` messages

**Fix**: Ensure `TerminalMounted` events are correctly routed through the bridge and processed by `handleBridgeMessage`.

---

### RANK 2: TerminalOutput Messages Not Reaching onMessage Handler

**Evidence**:
- `TerminalOutput` travels through the BridgeEnvelope as `{ type: "terminal_event", payload: { type: "TerminalOutput", sessionId, data } }`
- `dispatchOnMessageHandlers()` in `yws-transport.ts:485-549` extracts `payload.type` and dispatches to registered handlers
- If `payload.type` is missing from the server's serialized response, the dispatch falls through to fallback detection which doesn't recognize TerminalOutput's field pattern
- The message would be dispatched as `"TerminalEvent"` (from envelope type conversion) — a type no one subscribes to

**How to verify**:
1. Add `console.log` in `dispatchOnMessageHandlers` to see what `dispatchType` is computed for terminal events
2. Check browser WebSocket traffic (Network tab → WS) for incoming `terminal_event` messages
3. Verify the payload structure has `payload.type = "TerminalOutput"`

**Fix**: Add fallback detection for TerminalOutput's field pattern (`sessionId` + `data` string) in `dispatchOnMessageHandlers`. Or ensure the server always includes `type` in the payload.

---

### RANK 3: Terminal Container Has Zero Height (CSS/Layout Issue)

**Evidence**:
- Terminal container has `flex: 1` and `overflow: hidden` — requires parent to have explicit height
- CSS chain: `.terminal-pane` → `[data-orientation]` → `.terminal-tab-content` → `.terminal-container`
- If any ancestor lacks a defined height (e.g., the parent panel doesn't stretch), the terminal renders at 0x0
- Ghostty-web would render the terminal canvas, but it would be invisible

**How to verify**:
1. Open browser dev tools → Elements → inspect the `.terminal-container` div
2. Check computed height — if 0, the terminal is rendering but invisible
3. Check parent containers' computed heights

**Fix**: Ensure all parent containers in the flex chain have explicit heights. The `.terminal-tab-content` may need `height: 100%` instead of or in addition to `flex: 1`.

---

### RANK 4: ghostty-web WASM Initialization Failed

**Evidence**:
- `initializeGhostty()` is a singleton — if the first `init()` call fails, all subsequent calls return the rejected promise
- No error handling around `await initializeGhostty()` in `setupTerminal()` — if it rejects, the function silently returns
- `terminalRef.current` stays null, so all PTY output goes to the buffer but is never rendered
- User input (onData callback) is never registered, so typing doesn't work

**How to verify**:
1. Check browser console for WASM loading errors (CORS, MIME type, network errors)
2. Add error handling: `await initializeGhostty().catch(e => console.error('Ghostty init failed:', e))`
3. Check if `.terminal-container` div exists but has no child canvas element

**Fix**: Add error handling around WASM initialization. Show a fallback message if ghostty-web fails to load.

---

### RANK 5: sessionId Mismatch Between Store and Component

**Evidence**:
- `TerminalView` uses `sessionIdRef.current` for filtering incoming messages
- The ref is updated on every render: `sessionIdRef.current = sessionId`
- If the store's `activeSessionId` changes between render cycles (e.g., `null` → `uuid` → `null` → `uuid`), the component may re-initialize with the wrong session ID
- The initialization effect depends on `[sessionId, client]` — a sessionId change destroys the old terminal and creates a new one

**How to verify**:
1. Add `console.log` in TerminalView: `console.log('[Terminal] sessionId changed:', sessionId)`
2. Check if the terminal is being recreated multiple times
3. Add logging to the `onMessage` handlers to see what `sessionId` values are being filtered

**Fix**: Stabilize the sessionId before passing to TerminalView. Consider using a key prop to force remount only when sessionId legitimately changes.

---

### RANK 6: Output Buffer Cleared by StrictMode Double-Invoke

**Evidence**:
- React StrictMode (enabled in development) mounts → unmounts → remounts components
- The cleanup function clears `outputBufferRef.current = []` on unmount
- If PTY output arrives between the initial mount and the StrictMode unmount (during WASM loading), the buffer is cleared
- Data is lost before the terminal is ready

**How to verify**:
1. Check if the bug only occurs in development mode
2. Temporarily disable StrictMode and see if terminals work
3. Add logging to the buffer flush to see if it's empty when terminal initializes

**Fix**: Don't clear the buffer on cleanup — only clear it after successful flush. Or move buffer management outside the component lifecycle.

---

## Recommended Debugging Steps

### Step 1: Verify Terminal Component is Mounted
```
Browser DevTools → Elements → look for <div class="terminal-container">
  - If missing → Terminal component never mounted → RANK 1
  - If present but no <canvas> child → WASM init failed → RANK 4
  - If present with <canvas> but 0px height → CSS issue → RANK 3
```

### Step 2: Verify WebSocket Message Flow
```
Browser DevTools → Network → WS → inspect incoming messages
  - Look for terminal_event envelopes with payload.type = "TerminalOutput"
  - If missing → Server not sending PTY output
  - If present but payload.type is missing → RANK 2
```

### Step 3: Verify Store State
```
Browser console:
  JSON.stringify(useStore.getState().terminalTabs.map(t => ({
    id: t.id,
    activeSessionId: t.activeSessionId,
    status: t.status,
    label: t.label
  })))
  - If activeSessionId is null → RANK 1
  - If activeSessionId has a value → Terminal should be mounting
```

### Step 4: Verify WASM Loading
```
Browser console → check for errors related to .wasm files
Network tab → check if ghostty-web WASM file loaded successfully (200, correct MIME type)
```

### Step 5: Add Instrumentation
Add console.log statements at these critical points:
1. `TerminalPane.tsx` — when `TerminalPanel` renders with/without `activeSessionId`
2. `TerminalView.tsx:208` — when `setupTerminal` starts
3. `TerminalView.tsx:230` — when `terminalRef.current` is set
4. `TerminalView.tsx:151-175` — when `TerminalOutput` handler fires
5. `yws-transport.ts:539-548` — when messages are dispatched to handlers
6. `TerminalView.tsx:232-241` — when output buffer is flushed

## File Inventory for Fix

| File | Issue | Priority |
|------|-------|----------|
| `apps/web/src/components/terminal/TerminalPane.tsx` | Gatekeeper — activeSessionId null = no render | RANK 1 |
| `apps/web/src/lib/yws-transport.ts` | Message dispatch — payload.type extraction | RANK 2 |
| `apps/web/src/styles/terminal.css` | CSS chain for container height | RANK 3 |
| `apps/web/src/components/terminal/TerminalView.tsx` | WASM init error handling | RANK 4 |
| `apps/web/src/components/terminal/TerminalView.tsx` | sessionId stability | RANK 5 |
| `apps/web/src/components/terminal/TerminalView.tsx` | Buffer clearing on unmount | RANK 6 |

## Conclusion

The most likely root cause is **RANK 1**: the terminal component never mounts because `activeSessionId` is null in the store. This could be caused by:
1. The `TerminalMounted` event not being received (message routing issue)
2. The `TerminalSessionEnded` event clearing the session before the terminal mounts
3. The tab being created but the PTY session failing to start on the server

The second most likely cause is **RANK 2**: TerminalOutput messages are not reaching the `onMessage('TerminalOutput')` handler due to incorrect `payload.type` extraction in the dispatch logic.

These two issues account for both symptoms — blank content (no data received/rendered) and unresponsive typing (terminal never initialized so `onData` callback never registered).
