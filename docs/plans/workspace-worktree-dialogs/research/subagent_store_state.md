# Subagent: Store/State Research

Investigate the Zustand store and state management in /root/ymir/apps/web/src.

## What to find:

1. **Main store**: Read `store.ts` fully
   - What is the complete store structure?
   - What workspace-related state exists?
   - What worktree-related state exists?
   - What actions exist for workspace settings (save, update, etc.)?
   - What actions exist for worktree settings?
   - How does the store interact with WebSocket messages?

2. **State types**: Read `types/state.ts`
   - What TypeScript types define workspace state?
   - What TypeScript types define worktree state?
   - Are there agent-related types?

3. **Protocol types**: Read `types/protocol.ts`
   - What message types are defined?
   - How are workspace/worktree messages typed?

4. **Generated types**: Look at key generated types:
   - `types/generated/WorkspaceData.ts`
   - `types/generated/WorkspaceUpdate.ts`
   - `types/generated/WorktreeCreate.ts`
   - `types/generated/WorktreeList.ts`
   - `types/generated/GetWorktreeDetails.ts`
   - `types/generated/SettingData.ts`

5. **WebSocket transport**: Read `lib/ws.ts` and `lib/yws-transport.ts`
   - How are messages sent/received?
   - What's the message format?

6. **API client**: Read `lib/api.ts`
   - Are there REST API calls for settings?

Report the complete store interface including all workspace/worktree state fields and actions.
