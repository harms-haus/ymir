# Fix: Blank/Unresponsive Terminal Tabs — Outline

## Problem
Terminal UI tabs show blank content and don't respond to typing. ghostty-web v0.4.0 is not rendering PTY content.

## Root Causes (from research, ranked)
1. `activeSessionId` is null → Terminal component never mounts (TerminalPane.tsx:43-55)
2. `TerminalOutput` messages not reaching `onMessage` handler due to `payload.type` extraction failure in yws-transport.ts
3. Terminal container has 0px height (CSS chain break)
4. ghostty-web WASM initialization failed silently (no error handling)
5. sessionId instability causing repeated terminal destruction/recreation
6. Output buffer cleared by React StrictMode double-invoke

## Constraints
- PTY sessions are ephemeral, may terminate on idle/tab close
- Terminal tabs must be stateful on server with single PTY session ID
- History and PTY events must be kept with terminal tab storage
- Unmounting terminal tab content should NOT end PTY session (only tab close should)
- Main issue: history and PTY events aren't reaching UI or aren't rendered

---

## Vertical Slice 1: Terminal Mount & Session Lifecycle

### Goal
Ensure terminal tabs reliably mount with a valid `activeSessionId`, and that unmounting a tab's UI does NOT destroy the underlying PTY session.

### Changes
1. **TerminalPane.tsx** — Add fallback rendering when `activeSessionId` is null but tab exists in a `disconnected` state
   - Show a "Reconnecting..." loading state instead of permanent "No session"
   - Auto-retry `TerminalMount` if the tab is `disconnected` and `activeSessionId` is null

2. **TerminalPane.tsx** — Fix remount debounce logic (lines 146-161)
   - The current `remountedTabsRef` uses a `Map<worktreeId, Set<tabId>>` but the effect has `[terminalTabs, worktreeId, client]` deps, causing repeated sends
   - Add a guard to prevent spamming `TerminalMount` when one is already in-flight

3. **store.ts** — `TerminalSessionEnded` handler should set `status: 'disconnected'` but NOT remove the tab
   - Current behavior is correct (calls `clearTabSession` which sets `activeSessionId: null, status: 'disconnected'`)
   - Verify this doesn't cascade into terminal removal

4. **TerminalView.tsx** — `TerminalUnmount` (line 320-331) sends unmount on component cleanup
   - This is correct for tab switching (StrictMode), but must NOT be sent when the tab is being closed
   - The unmount signal should only disconnect the client's interest, NOT kill the PTY session
   - Verify server-side handler distinguishes `TerminalUnmount` (client detached) from `TerminalTabClose` (destroy PTY)

## Vertical Slice 2: Message Routing & Dispatch

### Goal
Ensure `TerminalOutput` and `TerminalTabHistory` messages are correctly extracted from the BridgeEnvelope and dispatched to registered `onMessage` handlers.

### Changes
1. **yws-transport.ts** — Add fallback detection for `TerminalOutput` in `dispatchOnMessageHandlers` (line 530-536)
   - Currently has fallback for `FileListResult` (by `files` array) and `GitStatusResult` (by `entries` array)
   - Add detection: if payload has `sessionId` (string) + `data` (string) → dispatch as `TerminalOutput`
   - Add detection: if payload has `tabId` + `data` (string) → dispatch as `TerminalTabHistory`

2. **yws-transport.ts** — Add logging for terminal message dispatch debugging
   - Log when `terminal_event` envelopes are received but `payload.type` is missing
   - Log the actual payload structure for diagnostics

3. **store.ts** — Verify `handleBridgeMessage` terminal_event handler (line 927-1084) correctly extracts `payload.type`
   - Line 934: `const innerType = payload.type as string | undefined;`
   - Line 936: `const data = (payload.data as ...) ?? payload;`
   - If `payload.type` is missing but `payload.data` contains the terminal fields, the fallback branch (line 938-1006) handles it via heuristics — verify these heuristics cover `TerminalOutput`

## Vertical Slice 3: Ghostty WASM Initialization & Rendering

### Goal
Ensure ghostty-web WASM initializes reliably, terminal container has proper dimensions, and output survives React StrictMode.

### Changes
1. **TerminalView.tsx** — Add error handling around `initializeGhostty()` (line 208-209)
   - Wrap `await initializeGhostty()` in try/catch
   - On failure: show error UI in the terminal container instead of blank div
   - Set an `initFailedRef` so subsequent renders show the error state

2. **TerminalView.tsx** — Add CSS variable validation before passing to GhosttyTerminal (line 214-218)
   - The current code does `hsl(${terminalBgRaw})` which could produce `hsl()` if the raw value is empty
   - Add validation: if CSS var is empty/invalid, use fallback

3. **TerminalView.tsx** — Add `requestAnimationFrame` delay before `fitAddon.fit()` (line 265)
   - Race condition: `term.open()` called before CSS layout is computed
   - `fitAddon.fit()` called immediately after may measure 0x0
   - Wrap in `requestAnimationFrame` to ensure layout is computed

4. **terminal.css** — Ensure `.terminal-container` has explicit minimum dimensions
   - Add `min-height: 100px` as a safety net to prevent 0px rendering
   - Verify CSS chain: `.terminal-pane` → `[data-orientation]` → `.terminal-tab-content` → `.terminal-container`

5. **TerminalView.tsx** — Don't clear `outputBufferRef` on StrictMode cleanup (line 195, 312)
   - The cleanup clears the buffer on every unmount, including StrictMode's synthetic unmount
   - Only clear buffer after successful flush, not on unmount
   - Move buffer clearing to after the flush loop succeeds (line 234)

## Vertical Slice 4: Session ID Stability & PTY Lifecycle

### Goal
Ensure sessionId remains stable across tab switches and that PTY sessions persist independently of component lifecycle.

### Changes
1. **TerminalView.tsx** — Stabilize sessionId before passing to initialization effect
   - The `[sessionId, client]` dependency array causes terminal destruction/recreation on sessionId change
   - Use a stable key that only changes when the session genuinely changes (not during null → UUID transition)
   - Consider using `useRef` to hold the session ID across re-renders without triggering effect re-run

2. **TerminalPane.tsx** — Add visual indicator for session lifecycle states
   - `active` (has sessionId, terminal mounted)
   - `connecting` (tab exists, waiting for TerminalMounted)
   - `disconnected` (session ended, tab preserved for re-mount)

3. **TerminalView.tsx** — Ensure `TerminalRequestHistory` uses stable refs (line 276-289)
   - The `historyRequestedRef` uses `${tabId}:${sessionId}` key which is correct
   - Verify the request is only sent once per session, not on every StrictMode remount
   - Current implementation already deduplicates via the Set — verify it works

---

## Implementation Order (Recommended)
1. **Slice 3.5** — Add diagnostic instrumentation first (console.log at key points) to verify root cause
2. **Slice 1** — Fix terminal mount lifecycle (highest impact, root cause #1)
3. **Slice 2** — Fix message routing dispatch (root cause #2)
4. **Slice 3** — Fix WASM init error handling + CSS height + StrictMode buffer
5. **Slice 4** — Stabilize sessionId + improve session lifecycle UX

## Files to Modify
| File | Slice | Priority |
|------|-------|----------|
| `apps/web/src/components/terminal/TerminalPane.tsx` | 1, 4 | Critical |
| `apps/web/src/components/terminal/TerminalView.tsx` | 1, 3, 4 | Critical |
| `apps/web/src/lib/yws-transport.ts` | 2 | High |
| `apps/web/src/styles/terminal.css` | 3 | Medium |
| `apps/web/src/store.ts` | 1 | Low (verify only) |
