# ACP Chat React Integration - Orchestrator Notes

## Date: 2026-04-30
## Feature: Replace hacky ws-bridge with acp-chat-core, acp-chat-react, acp-ws-bridge packages

## Research Synthesis Summary

### Key Protocol Mismatch
- **Current**: MessagePack binary with `{version, type, data}` envelope
- **Target**: JSON with `BridgeEnvelope {version, seq, timestamp_ms, type: "acp_payload"|"bridge_status", payload}`
- This affects EVERYTHING: YmirClient, server router, hub, all message handlers

### The Main Challenge Areas

1. **WebSocket Transport Layer**: Complete replacement of YmirClient with WsTransport/TransportClient. The server side must also switch from MessagePack to JSON BridgeEnvelope format.

2. **ACP Session Model**: Current system is worktree-scoped (1 agent per worktree). acp-chat-core is ACP session-scoped. Need a mapping layer or server-side adaptation.

3. **Terminal Creation Model**: Current = client creates PTYs independently. ACP = agent requests terminal creation via JSON-RPC. Need to support both models.

4. **State Accumulator**: The entire acpAccumulatorReducer (500+ lines of state management) would be replaced by SessionController + AcpStore. This is the biggest win.

5. **UI Components**: Replace AgentChat/AgentRuntimeProvider/EventCards with Thread, MessageCard, ToolCall, ThoughtStack, PermissionRequestCard from acp-chat-react.

### What Stays (NOT replaced)
- Workspace/worktree CRUD and UI (sidebar, project panel)
- Terminal ghostty-web rendering (TerminalView)
- File editor (monaco)
- Git operations (diffs, PRs, worktrees)
- DB layer (SQLite)
- AppShell layout (panels, tabs, status bar)
- Rust PTY management (PtyManager)
- Workspace/worktree/workspace protocol types

### What Gets Replaced
- YmirClient -> WsTransport + custom envelope handler
- acpAccumulatorReducer -> SessionController + AcpStore
- AgentChat/AgentRuntimeProvider -> AcpProvider + Thread components
- EventCards -> ToolCall, ThoughtStack, PermissionRequestCard
- Custom ACP event handler system -> AcpStore's built-in handling

### Server-Side Changes
- Add acp-ws-bridge Rust crate as dependency
- Add JSON BridgeEnvelope handling alongside (or replacing) MessagePack
- Bridge ACP JSON-RPC messages through the ws-bridge protocol
- Terminal messages need custom envelope handling (acp-ws-bridge handles ACP + terminal line-based protocol)

## Additional Research Notes (Phase 2 - Protocol Messages)

### Full Protocol Inventory
- **37 client message types** (5 not implemented: WorkspaceRename, WorkspaceUpdate, WorktreeMerge, FileWrite, UpdateSettings)
- **30 server message types**
- All currently use MessagePack binary with `{version, type, data}` envelope
- ALL need to be migrated to JSON BridgeEnvelope format

### Message Categories That Need BridgeEnvelope Wrapping:
1. **Workspace CRUD** (4 types): WorkspaceCreate, WorkspaceDelete, WorkspaceCreated, WorkspaceDeleted
2. **Worktree CRUD** (7 types): WorktreeCreate, WorktreeDelete, WorktreeList, WorktreeChangeBranch, GetWorktreeDetails, WorktreeCreated, WorktreeDeleted, WorktreeChanged, WorktreeListResult, WorktreeDetailsResult, WorktreeStatus
3. **Git Operations** (4 types): GitStatus, GitDiff, GitCommit, CreatePR + GitStatusResult, GitDiffResult
4. **File Operations** (3 types): FileRead, FileList + FileContent, FileListResult
5. **Agent Management** (6 types): AgentSpawn, AgentSend, AgentCancel, AgentSetConfigOption, AgentRename, AgentReorder + AgentStatusUpdate, AgentRemoved, AgentUpdated, AgentOutput, AgentPrompt
6. **State/Settings** (3 types): GetState, StateSnapshot, SettingData
7. **Infrastructure** (4 types): Ping, Pong, Notification, Error, Ack
8. **Terminal** (7 types): TerminalCreate, TerminalInput, TerminalResize, TerminalKill, TerminalRename, TerminalReorder, TerminalRequestHistory + TerminalCreated, TerminalOutput, TerminalRemoved, TerminalUpdated, TerminalHistory
9. **ACP** (via acp-ws-bridge): Already JSON-RPC, needs BridgeEnvelope wrapping

### Key Architectural Decision
The BridgeEnvelope format from acp-ws-bridge is:
```typescript
type BridgeEnvelope = {
  version: number;
  seq: number;
  timestamp_ms: number;
  type: "acp_payload" | "bridge_status" | "stderr" | "process_exit" | "replay_metadata" | "start_agent";
  // plus type-specific fields
}
```

For ymir's existing message types (workspace, worktree, git, file, agent, terminal), we need to ADD new envelope types to this scheme, or embed them as payload within existing types. The cleanest approach is to add new type discriminators: `"workspace_event"`, `"worktree_event"`, `"git_response"`, `"file_response"`, `"agent_event"`, `"terminal_event"`, `"state_snapshot"`, `"notification"`, `"error"`, `"ack"`, `"ping"`, `"pong"`.

### Protocol Migration
- **Approach**: Replace entirely - ditch MessagePack, switch whole server to JSON BridgeEnvelope

### Terminal Integration
- **Approach**: Custom envelope on existing protocol - keep ymir terminal messages but wrap in BridgeEnvelope format. Ymir terminals are separate from ACP terminals for now.

### Workspace/Worktree Mapping
- **Approach**: Server manages session/workspace/worktree relationships. Server is source of truth for all three, client talks through server's abstraction.

### Testing Strategy
- **Approach**: Test-after - write code then tests

### Commit Strategy
- **Approach**: Generate a branch and commit per batch

### Git Worktree
- **Approach**: No worktree usage for parallel implementers
