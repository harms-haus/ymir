# Vertical Slice: TerminalView Data Flow — PTY Events → Ghostty Rendering

## Data Flow Trace

### 1. Component Mount Sequence

```
TerminalPane renders
  └── TerminalPanel(tab={id, activeSessionId, ...})
       └── If activeSessionId: <Terminal tabId sessionId ref />
       └── If no activeSessionId: "No session" empty state
```

**File**: `apps/web/src/components/terminal/TerminalPane.tsx:40-65`

The `TerminalPanel` component is the gatekeeper: if `tab.activeSessionId` is null/undefined, it renders an empty state instead of the Terminal. **This is critical** — if the store never sets `activeSessionId`, the Terminal component never mounts and ghostty-web is never initialized.

### 2. TerminalView.tsx Initialization

**File**: `apps/web/src/components/terminal/TerminalView.tsx`

#### Phase A: Message Subscription (useEffect line 150-198)
- Registers `onMessage('TerminalHistory')`, `onMessage('TerminalOutput')`, `onMessage('TerminalTabHistory')` handlers
- Uses `sessionIdRef.current` / `tabIdRef.current` for filtering (refs updated on every render)
- **Empty dependency array `[]`**: handlers registered once, survive StrictMode remounts
- On cleanup: unsubscribes all handlers and clears output buffer

#### Phase B: Ghostty WASM Init (useEffect line 204-314)
1. `await initializeGhostty()` — singleton WASM load, runs once globally
2. Read CSS custom properties for theme (`--terminal-bg`, `--terminal-fg`, `--font-mono`)
3. `new GhosttyTerminal({ fontSize, theme, fontFamily })`
4. `term.open(containerRef.current)` — attaches to DOM
5. `terminalRef.current = term` — this makes the terminal "ready"
6. Flush `outputBufferRef.current` — data that arrived during init
7. `term.onData()` → `TerminalInput` via WebSocket
8. `term.onResize()` → `TerminalResize` via WebSocket
9. `fitAddon.fit()` — auto-size to container
10. **Send `TerminalRequestHistory`** with `tabId`, `sessionId`, `requestId`, `limit: 1000`
11. Dependencies: `[sessionId, client]` — re-runs when sessionId changes

#### Phase C: Unmount (useEffect line 320-331)
- Sends `TerminalUnmount { tabId, sessionId }` via WebSocket
- Empty dependency array — only fires on true unmount

### 3. PTY Output Flow (TerminalOutput)

```
PTY process writes to master fd
  → output.rs: spawn_output_reader reads 4096-byte chunks
  → state.broadcast(TerminalOutput { session_id, data })
  → DB: append_terminal_output(session_id, data)
  → Server: BridgeEnvelope { type: "terminal_event", payload: { type: "TerminalOutput", data: { sessionId, data } } }
  → WebSocket → Client
  → yws-transport.ts: handleEnvelope() → decodeBridgeJson() → dispatchOnMessageHandlers()
  → Extracts payload.type = "TerminalOutput"
  → dispatchMsg = { type: "TerminalOutput", sessionId, data }
  → onMessage('TerminalOutput') handler fires
  → TerminalView: if msg.sessionId === sessionIdRef.current → safeWrite(terminalRef.current, data)
```

### 4. History Flow (TerminalTabHistory)

```
TerminalView mounted → sends TerminalRequestHistory { tabId, sessionId, requestId, limit: 1000 }
  → Server: handler.rs: handle_terminal_request_history()
  → DB: get_terminal_output_by_tab(tabId, limit)
  → Returns: TerminalTabHistory { tabId, data }
  → BridgeEnvelope { type: "terminal_event", payload: { type: "TerminalTabHistory", data: { tabId, data } } }
  → WebSocket → Client
  → dispatchOnMessageHandlers() → onMessage('TerminalTabHistory') fires
  → TerminalView: if msg.tabId === tabIdRef.current → safeWrite(terminalRef.current, data)
```

### 5. User Input Flow

```
User types in terminal
  → Ghostty.onData(data) callback
  → TerminalView: TerminalInput { sessionId: sessionIdRef.current, data }
  → client.send() → YmirWsTransport.sendRaw() → encodeClientMessage() → BridgeEnvelope → WebSocket
  → Server: handle_terminal_input() → pty_manager.write(sessionId, data)
  → PTY process receives input → produces output → loops back to step 3
```

## Identified Issues

### ISSUE V1: Empty activeSessionId = Terminal Never Mounts
**Location**: `TerminalPane.tsx:43-55`

If the Zustand store has a terminal tab with `activeSessionId: null`, the `TerminalPanel` renders the "No session" empty state. The `Terminal` component is never mounted, ghostty-web never initializes, no history is requested, and no onMessage handlers are registered.

The store's `setTabSession` and `clearTabSession` control this:
- `TerminalMounted` event → `setTabSession(tabId, sessionId)` → `activeSessionId` becomes set → Terminal mounts
- `TerminalSessionEnded` event → `clearTabSession(tabId)` → `activeSessionId` becomes null → Terminal unmounts

**Risk**: If `TerminalMounted` is never received (e.g., server-side mount handler fails or event routing broken), the terminal stays in empty state forever.

### ISSUE V2: sessionId Ref vs Prop Synchronization
**Location**: `TerminalView.tsx:136-137`

The component uses `sessionIdRef.current` for message filtering. The ref is updated synchronously on every render:
```tsx
const sessionIdRef = useRef(sessionId);
sessionIdRef.current = sessionId;
```

This is correct pattern — the ref always has the current value even in closure-captured handlers. However, the initialization effect has `[sessionId, client]` as dependencies. When `sessionId` changes (e.g., from null → actual UUID), the effect re-runs, destroying the old terminal and creating a new one.

**Risk**: If the store briefly sets then clears `activeSessionId` (race condition between `TerminalMounted` and `TerminalSessionEnded`), the terminal gets destroyed mid-initialization.

### ISSUE V3: TerminalOutput Message Routing Through Bridge
**Location**: `yws-transport.ts:485-549`

`TerminalOutput` travels through the BridgeEnvelope as `terminal_event`. The dispatch logic extracts the message type from `payload.type`. If `payload.type` is missing or wrong (e.g., undefined, or the wrong casing), the message gets dispatched under the wrong type and the `onMessage('TerminalOutput')` handler never fires.

The dispatch logic has three paths:
1. `payload.originalType` — for wrapped client responses
2. `payload.type` — for server passthrough (TerminalOutput should take this path)
3. Fallback detection by field presence (e.g., `files` array → FileListResult)

For `TerminalOutput`, the Rust encoder produces:
```json
{ "type": "terminal_event", "payload": { "type": "TerminalOutput", "sessionId": "...", "data": "..." } }
```

The TypeScript dispatch should hit path #2: `payload.type` = `"TerminalOutput"`, then `dispatchType = "TerminalOutput"`, and the `innerData` branch spreads into `{ type: "TerminalOutput", sessionId: "...", data: "..." }`.

**Risk**: If the server-side serialization doesn't include `type` in the payload (e.g., serde skips it), the dispatch falls through to path #3. There's no fallback detection for TerminalOutput's field pattern (`sessionId` + `data`), so it would use the envelope type converted to PascalCase: `"terminal_event"` → `"TerminalEvent"` — which no handler subscribes to. **Messages would be silently dropped.**

### ISSUE V4: WASM Initialization Failure
**Location**: `TerminalView.tsx:68-73, 208-209`

`initializeGhostty()` is a singleton. If the initial `init()` call rejects or hangs:
- `initPromise` is set to the rejected promise
- All subsequent calls return the same rejected promise
- `setupTerminal()` silently returns (no error handling around the await)
- `terminalRef.current` stays null forever
- All output goes to `outputBufferRef.current` but is never rendered

**Risk**: A single WASM load failure permanently breaks all terminal tabs until page refresh.

### ISSUE V5: Output Buffer Not Surviving StrictMode Remount
**Location**: `TerminalView.tsx:195, 312`

The cleanup function clears `outputBufferRef.current = []`. In React StrictMode (development), components mount → unmount → remount. If PTY output arrives between the initial mount and the StrictMode unmount, the buffer is cleared during unmount and the data is lost.

The `onMessage` handlers also unsubscribe during the StrictMode unmount. However, since the handlers are registered in a separate `useEffect` with empty deps `[]`, they unregister on the StrictMode cleanup. The terminal is also disposed.

**Risk**: In development mode, first batch of PTY output is lost on StrictMode double-invoke.

### ISSUE V6: Container Height May Be Zero
**Location**: `TerminalView.tsx:358-366`, `terminal.css`

The terminal container div has `flex: 1` and `overflow: hidden`. If the parent `Tabs.Panel` (`terminal-tab-content`) doesn't have a computed height, the terminal container has 0 height and the canvas renders invisibly.

CSS chain: `.terminal-pane` → `[data-orientation]` → `.terminal-tab-content` → `.terminal-container`

All have `flex: 1` or `height: 100%` set up the chain, but if any ancestor lacks a defined height, the chain breaks.
