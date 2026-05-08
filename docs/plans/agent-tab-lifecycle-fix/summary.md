# Implementation Summary: Agent Tab Lifecycle Fix

## Status: COMPLETE

24 files changed, 632 insertions, 47 deletions. Both `cargo check` and `tsc --noEmit` pass clean.

## What Was Implemented

### Server-Side (ws-server)

1. **Database Migration**: Added `agent_tab_id` column to `agent_sessions` table with index. Added `get_agent_session_by_tab_id()` and `update_agent_session_acp_id()` methods.

2. **Protocol Extensions**: Extended `AgentStatusUpdate` with `acp_session_id` and `process_id` fields. Added `AgentStatus::Spawning` enum variant. Added `AgentResume` protocol message.

3. **ACP Client Decomposition**: Split `AcpClient::spawn()` into discrete phases:
   - `spawn_stdio()` -- just spawns process + establishes stdio
   - `initialize()` -- sends ACP initialize, returns capabilities via `InitializeResult`
   - `create_session()` -- creates new session
   - `load_session()` -- loads existing session (NEW)
   - `resume()` -- convenience combining connect + initialize + load_session (NEW)

4. **ACP Runtime Commands**: Added `Initialize`, `LoadSession`, and `SpawnForResume` command variants with `AcpHandle` methods.

5. **InitializeResponse Event**: New `AcpEvent::InitializeResponse` carries real agent capabilities from server to client via ACP proxy.

6. **Spawn Handler Rewrite**: `handle_agent_spawn()` now broadcasts `Spawning` status, spawns agent, persists `acp_session_id` to DB, then broadcasts `Idle` with actual `acp_session_id` and `process_id`.

7. **Resume Handler**: New `handle_agent_resume()` validates worktree, looks up session by `agent_tab_id`, verifies `acp_session_id`, broadcasts `Spawning`, then spawns background task that calls `spawn_agent_for_resume()` (connect + initialize + load_session).

8. **SpawnResult**: New struct carrying `acp_session_id` and `process_id` back from the ACP runtime.

### Client-Side (web)

1. **Removed Auto-Initialize**: AgentPane no longer calls `acpSessionManager.initialize()` on tab creation. Server handles initialization.

2. **InitializeResponse Handler**: `yws-transport.ts` routes `InitializeResponse` events to `acpSessionManager.handleInitializeResponse()`.

3. **AgentResume Encoder**: `bridge-transport.ts` has `encodeAgentResume()` function.

4. **Resume Flow**: AgentPane detects sessions with `acpSessionId` and sends `AgentResume` message to server.

5. **Spawning UI State**: "Agent is spawning..." spinner shown for sessions with `status === 'spawning'` or tracked in spawning ref set.

6. **Status Handling**: `useAgentStatus.ts` updated with `spawning` status variant. `AgentStatusUpdate` handling processes new `acpSessionId` and `processId` fields.

## Library Boundary

Zero changes to `crates/acp-ws-bridge/`. All changes are within ws-server and web app boundaries, respecting the library separation.

## Reviews

Three review reports written:
- `reviews/phase-1-2-review.md` -- Phase 1 & 2 (PASS with 2 gaps fixed)
- `reviews/gap-fix-review.md` -- Gap fixes (PASS)
- `reviews/server-side-review.md` -- Server-side comprehensive (PASS with 1 gap fixed)
- `reviews/client-side-review.md` -- Client-side (PASS, all 6 tasks)
