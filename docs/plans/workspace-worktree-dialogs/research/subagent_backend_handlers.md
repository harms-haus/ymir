# Subagent: Backend Handlers Research

Investigate the backend workspace/worktree handlers in /root/ymir/crates/ws-server/src.

## What to find:

1. **Workspace handler**: Read `workspace/mod.rs` fully
   - What WebSocket messages does it handle?
   - How does workspace save/update work?
   - What's the WorkspaceUpdate/WorkspaceRename message structure?
   - Is there a workspace settings save endpoint?

2. **Worktree handler**: Read `worktree/mod.rs` fully
   - What WebSocket messages does it handle?
   - How are worktrees created?
   - How are worktrees updated?
   - Is there a worktree settings update endpoint?
   - What's the WorktreeCreate message structure?

3. **Protocol definitions**: Read these files:
   - `protocol/workspace.rs` - workspace message types
   - `protocol/worktree.rs` - worktree message types
   - `protocol/settings.rs` - settings message types
   - `protocol/mod.rs` - overall protocol structure

4. **Router**: Read `router.rs`
   - How are messages routed to handlers?
   - What's the overall message routing structure?

5. **Hub**: Read `hub.rs`
   - How are connections managed?
   - How are messages dispatched?

6. **State**: Read `state.rs`
   - What in-memory state is maintained?
   - How does it relate to the database?

Report ALL message types, handler functions, and the full flow of how workspace/worktree settings are saved and loaded.
