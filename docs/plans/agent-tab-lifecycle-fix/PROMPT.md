# Fix Agent Tab Lifecycle to Match Spec

## Original Request

Review the implemented agent tab lifecycle (vertical slices) and fix it so that it works exactly like the lifecycle described in `docs/agent-tab-lifecycle.md`.

## Key Constraints

1. **Library boundaries must be respected**: The `acp-chat-core` (NPM package, used on client) and `acp-ws-bridge` (Rust crate at `crates/acp-ws-bridge/`) libraries are NOT set in stone. They may be modified, but:
   - NO ymir-only features should leak into these libraries
   - Systematic changes ARE allowed so they follow the lifecycle described
   - Existing features may be enhanced, private features may be exposed if needed for the lifecycle
   - Ymir should employ these libraries as best it can
   - Generic features should NOT be implemented in Ymir if they belong within the library boundaries
   - DO NOT wrap the libraries' classes if the functionality belongs within the libraries' boundaries anyway

2. **Two lifecycle flows to implement**:
   - **New agent tab**: Create tab → spawn agent process → initialize → session/new → session/list
   - **Resume agent tab**: Mount tab → spawn agent process → initialize → session/load → receive session history updates → session/list

## Files to Research

- Server: `crates/ws-server/src/agent/`, `crates/ws-server/src/bridge/`, `crates/ws-server/src/protocol/`, `crates/acp-ws-bridge/src/`
- Client: `apps/web/src/lib/acp-session-manager.ts`, `apps/web/src/lib/bridge-transport.ts`, `apps/web/src/lib/ws.ts`, `apps/web/src/components/agent/`
- Spec: `docs/agent-tab-lifecycle.md`

## Lifecycle Spec Summary

### New Agent Tab Flow:
1. UI creates agent tab
2. Client sends envelope to server (contains worktree ID)
3. Server decodes envelope, creates tab in DB (no session_id or process_id yet)
4. Server spawns ACP agent process, waits to connect
5. Server sends agent tab info (process ID, status: waiting for agent)
6. Client receives and updates status, UI shows "Agent is spawning"
7. ACP agent connects
8. Server sends ACP `initialize` → agent replies with capabilities
9. Server forwards initialize response over ACP proxy
10. Client receives initialize response
11. Server sends ACP `session/new` → agent replies with session ID (may include modes, slash commands)
12. Server forwards session/new response over ACP proxy
13. Server sends agent tab status in bridge envelope (agent_tab_id, process_id, session_id)
14. Client receives session/new response and agent tab status with all 3 IDs
15. Server sends ACP `session/list` → agent replies
16. Server forwards session/list response
17. Client receives session list response

### Resume Agent Tab Flow:
1. UI mounts agent tab content
2. Client sends envelope indicating tab loaded, awaiting connection
3. Server decodes envelope, loads tab from DB, sets process_id to null
4. Server spawns ACP agent process, waits to connect
5. Server sends agent tab info (process ID, status: waiting for agent)
6. Client receives and updates status, UI shows "Agent is spawning"
7. ACP agent connects
8. Server sends ACP `initialize` → agent replies with capabilities
9. Server forwards initialize response over ACP proxy
10. Client receives initialize response
11. Server sends ACP `session/load` with session ID from DB → agent begins sending session/update events
12. Server forwards session/load response (may include modes, slash commands)
13. Server receives session/update events from agent loading history
14. Server forwards each session/update event over ACP proxy
15. Client receives each session/update event
16. Client updates renderable state through acp-chat-core
17. UI renders each item in thread
18. Server sends ACP `session/list` → agent replies
19. Server forwards session/list response
20. Client receives session list response

End state for both: server and client have session ID, modes, slash commands, models?, sessions list (plus session history for resume).
