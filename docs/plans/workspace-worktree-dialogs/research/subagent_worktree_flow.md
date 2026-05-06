# Subagent: Worktree Creation Flow & Agent Types Research

Investigate how worktrees are created and how agent types are defined in /root/ymir.

## What to find:

1. **Worktree creation flow** (FRONTEND):
   - Trace from the UI click "Create Worktree" to the actual creation
   - What happens in WorkspaceTree.tsx when creating a worktree?
   - Is there an alert()/prompt() call? Where exactly?
   - What WebSocket message is sent to create a worktree?

2. **Worktree creation flow** (BACKEND):
   - In `crates/ws-server/src/worktree/mod.rs`, how is a worktree created?
   - Does it call `git worktree add`?
   - How is the new branch created?
   - How is it stored in the database?

3. **Agent types**:
   - Search for "agent" type definitions across the codebase
   - What agents are supported? (hermes, opencode, claude, etc.)
   - Where is the agent enum/type defined?
   - In the frontend: how is agent selected/used?
   - In the backend: how is agent stored/used?
   - Look at `crates/ws-server/src/agent/` - what's there?
   - Look at `types/generated/AgentSpawn.ts`, `types/generated/AgentStatusUpdate.ts`, etc.

4. **Agent in workspace/worktree context**:
   - Is agent currently stored on workspace records?
   - Is agent currently stored on worktree records?
   - How is agent passed to ACP sessions?
   - Read `types/generated/AcpSessionInit.ts` and `types/generated/AcpSessionConfigOption.ts`

5. **Git worktree operations**:
   - Read `crates/ws-server/src/git/mod.rs`
   - What git operations are supported?
   - Is there a worktree-specific git operation?

Report the complete worktree creation flow from UI to DB, and all agent-related types and usage.
