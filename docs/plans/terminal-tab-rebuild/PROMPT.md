# Terminal Tab Feature: Rebuild from Scratch

## User's Request

Review the existing terminal tab feature (the tab in the pane on the UI, NOT the ACP terminals) and rebuild it from scratch.

### Requirements

1. **PTY Session Architecture**: PTY sessions run on the server end, with all PTY events piped through yws-transport as custom events. These should be standard events — no extras, no filters.

2. **Tab-Session Synchronization**: Terminal tabs are synchronized to PTY sessions on the server and remain active until explicitly closed.

3. **Recovery from Page Refresh**: When recovering from a page refresh, the same PTY session should be used for the same tab if still available; otherwise a new session should be started.

4. **History Tracking**: Each terminal tab tracks its history, transmitted upon loading the tab from a refresh.

5. **Session Lifecycle**:
   - Fresh terminal tab gets its own PTY session, active until the terminal is closed
   - Component unmount → alert server that the session has ended
   - Component remount → resume same PTY session (until tab is explicitly closed)
   - PTY sessions linked to terminal tabs via IDs

6. **Inactivity Timeout**: PTY sessions terminate after a configurable amount of time (default: 3min) of inactivity. When new events arrive for that tab, a new PTY session may be spawned and linked.

7. **History Persistence**: Terminal tab history remains with the terminal tab's storage logic (not tied to PTY session lifecycle).

8. **Component Mount Flow**:
   - Find reserved PTY session (if available) or create new one
   - Receive history from terminal tab's storage
   - Events from Ghostty UI routed through yws-transport to server → proxied to PTY session
   - If PTY session doesn't exist, create and link it
   - Resulting events passed through yws-transport to Ghostty UI

### Key Principles
- All standard PTY events, just proxied through yws-transport
- No extras, no filters on PTY events
- Terminal tabs and PTY sessions linked by IDs
- History stays with tab storage, not PTY session
