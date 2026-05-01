# Protocol Message Types Reference

Complete enumeration of all MessagePack wire protocol message types in the ymir codebase, beyond ACP and terminal. Each message currently uses MessagePack (rmp_serde on the Rust side, @msgpack/msgpack on the TypeScript side) and will need to be wrapped in `BridgeEnvelope` format.

## Protocol Envelope

### Rust Wire Format (`crates/ws-server/src/protocol/common.rs`)

All messages are wrapped in a versioned envelope:

```rust
pub const PROTOCOL_VERSION: u32 = 1;

pub struct ClientMessage {
    pub version: u32,
    pub payload: ClientMessagePayload,  // #[serde(flatten)] => { version, type, data }
}

pub struct ServerMessage {
    pub version: u32,
    pub payload: ServerMessagePayload,  // #[serde(flatten)] => { version, type, data }
}
```

Both enums use `#[serde(tag = "type", content = "data")]`, producing JSON like:
```json
{"version": 1, "type": "WorkspaceCreate", "data": {"name": "...", "rootPath": "..."}}
```

### TypeScript Client (`apps/web/src/lib/ws.ts`)

```typescript
// Encoding: { version, type, data: { ...payload } } -> MessagePack -> ArrayBuffer
// Decoding: ArrayBuffer -> MessagePack -> { version, type, data } -> { type, ...data }
```

The TypeScript client at `apps/web/src/lib/ws.ts`:
- Creates a `YmirClient` singleton connecting to `ws://${window.location.host}/ws`
- On connect, immediately sends `{ type: 'GetState', requestId: generateId() }`
- Heartbeat: Ping every 15s, 5s timeout
- Reconnects with exponential backoff (1s, 2s, 4s, 8s, 16s, max 30s)
- Decodes incoming messages, routes `Pong`/`StateSnapshot`/`AcpWireEvent` specially, everything else goes through `updateStateFromServerMessage()`

### Server Dispatch (`crates/ws-server/src/main.rs`)

```
WebSocket Binary -> rmp_serde::from_slice<ClientMessage>
  -> route_message() in router.rs
    -> match on ClientMessagePayload variant
      -> handler function
        -> returns Option<ServerMessage>
          -> state.send_to(client_id, response) or state.broadcast(msg)
```

---

## 1. ClientMessagePayload Enum (Client -> Server)

Source: `crates/ws-server/src/protocol/common.rs:52-88`

| Variant | Request Type | Handler | Status |
|---------|-------------|---------|--------|
| `WorkspaceCreate` | `WorkspaceCreate` | `crate::workspace::create()` | Implemented |
| `WorkspaceDelete` | `WorkspaceDelete` | `crate::workspace::delete()` | Implemented |
| `WorkspaceRename` | `WorkspaceRename` | `not_implemented()` | NOT IMPLEMENTED |
| `WorkspaceUpdate` | `WorkspaceUpdate` | `not_implemented()` | NOT IMPLEMENTED |
| `WorktreeCreate` | `WorktreeCreate` | `crate::worktree::create()` | Implemented |
| `WorktreeDelete` | `WorktreeDelete` | `crate::worktree::delete()` | Implemented |
| `WorktreeMerge` | `WorktreeMerge` | `not_implemented()` | NOT IMPLEMENTED |
| `WorktreeList` | `WorktreeList` | `crate::worktree::list()` | Implemented |
| `WorktreeChangeBranch` | `WorktreeChangeBranch` | `crate::worktree::change_branch()` | Implemented |
| `GetWorktreeDetails` | `GetWorktreeDetails` | `handle_get_worktree_details()` | Implemented |
| `AgentSpawn` | `AgentSpawn` | `handle_agent_spawn()` | Implemented |
| `AgentSend` | `AgentSend` | `handle_agent_send()` | Implemented |
| `AgentCancel` | `AgentCancel` | `handle_agent_cancel()` | Implemented |
| `AgentSetConfigOption` | `AgentSetConfigOption` | `handle_agent_set_config_option()` | Implemented |
| `AgentRename` | `AgentRename` | `handle_agent_rename()` | Implemented |
| `AgentReorder` | `AgentReorder` | `handle_agent_reorder()` | Implemented |
| `TerminalInput` | `TerminalInput` | `handle_terminal_input()` | Implemented |
| `TerminalResize` | `TerminalResize` | `handle_terminal_resize()` | Implemented |
| `TerminalCreate` | `TerminalCreate` | `handle_terminal_create()` | Implemented |
| `TerminalKill` | `TerminalKill` | `handle_terminal_kill()` | Implemented |
| `TerminalRename` | `TerminalRename` | `handle_terminal_rename()` | Implemented |
| `TerminalReorder` | `TerminalReorder` | `handle_terminal_reorder()` | Implemented |
| `TerminalRequestHistory` | `TerminalRequestHistory` | `handle_terminal_request_history()` | Implemented |
| `FileRead` | `FileRead` | `handle_file_read()` | Implemented |
| `FileWrite` | `FileWrite` | `not_implemented()` | NOT IMPLEMENTED |
| `FileList` | `FileList` | `handle_file_list()` | Implemented |
| `GitStatus` | `GitStatus` | `handle_git_status()` | Implemented |
| `GitDiff` | `GitDiff` | `handle_git_diff()` | Implemented |
| `GitCommit` | `GitCommit` | `handle_git_commit()` | Implemented |
| `CreatePR` | `CreatePR` | `handle_create_pr()` | Implemented |
| `GetState` | `GetState` | `handle_get_state()` | Implemented |
| `UpdateSettings` | `UpdateSettings` | `not_implemented()` | NOT IMPLEMENTED |
| `Ping` | `Ping` | inline (updates activity, returns Pong) | Implemented |
| `Pong` | `Pong` | None (no-op) | Implemented |
| `Ack` | `Ack` | `not_implemented()` | NOT IMPLEMENTED |

**Total: 37 client message types, 5 not implemented**

---

## 2. ServerMessagePayload Enum (Server -> Client)

Source: `crates/ws-server/src/protocol/common.rs:92-123`

| Variant | Response To | Delivery | Handler |
|---------|-------------|----------|---------|
| `StateSnapshot` | `GetState` | Direct (send_to) | `handle_get_state()` |
| `WorkspaceCreated` | `WorkspaceCreate` | Direct (send_to) | `workspace::create()` |
| `WorkspaceDeleted` | `WorkspaceDelete` | Direct (send_to) | `workspace::delete()` |
| `WorkspaceUpdated` | `WorkspaceUpdate` | N/A (not implemented) | - |
| `WorktreeCreated` | `WorktreeCreate` | Direct (send_to) | `worktree::create()` |
| `WorktreeDeleted` | `WorktreeDelete` | Direct (send_to) | `worktree::delete()` |
| `WorktreeChanged` | `WorktreeChangeBranch` | Direct (send_to) | `worktree::change_branch()` |
| `WorktreeListResult` | `WorktreeList` | Direct (send_to) | `router::route_message()` |
| `WorktreeStatus` | N/A | Broadcast | - |
| `WorktreeDetailsResult` | `GetWorktreeDetails` | Direct (send_to) | `handle_get_worktree_details()` |
| `AgentStatusUpdate` | Agent lifecycle | Broadcast | ACP runtime |
| `AgentOutput` | Agent output | Broadcast | ACP runtime |
| `AgentPrompt` | Agent prompt | Broadcast | ACP runtime |
| `AgentRemoved` | Agent removed | Broadcast | ACP runtime |
| `TerminalOutput` | Terminal output | Broadcast | PTY handler |
| `TerminalCreated` | `TerminalCreate` | Direct (send_to) | `handle_terminal_create()` |
| `TerminalRemoved` | Terminal closed | Broadcast | PTY handler |
| `TerminalUpdated` | `TerminalRename`/`TerminalReorder` | Broadcast | `handle_terminal_rename/reorder()` |
| `TerminalHistory` | `TerminalRequestHistory` | Direct (send_to) | `handle_terminal_request_history()` |
| `AgentUpdated` | `AgentRename`/`AgentReorder` | Broadcast | `handle_agent_rename/reorder()` |
| `FileContent` | `FileRead` | Direct (send_to) | `handle_file_read()` |
| `FileListResult` | `FileList` | Direct (send_to) | `handle_file_list()` |
| `GitStatusResult` | `GitStatus` | Direct (send_to) | `handle_git_status()` |
| `GitDiffResult` | `GitDiff` | Direct (send_to) | `handle_git_diff()` |
| `Error` | Any failure | Direct (send_to) | Various |
| `Ping` | Server-initiated | Broadcast | - |
| `Pong` | `Ping` | Direct (send_to) | `route_message()` |
| `Notification` | `GitCommit`, `CreatePR` | Direct (send_to) | Various |
| `Ack` | Rename/Reorder ops | Direct (send_to) | Various |
| `AcpWireEvent` | ACP events | Broadcast | ACP runtime |

**Total: 30 server message types**

---

## 3. Detailed Message Flow Documentation

### 3.1 Workspace CRUD

#### WorkspaceCreate
- **Direction**: Client -> Server -> Client
- **Client Type**: `WorkspaceCreate` (`apps/web/src/types/protocol.ts:173-180`)
- **Fields**: `{ name: string, rootPath: string, color?: string, icon?: string, worktreeBaseDir?: string }`
- **Rust Type**: `protocol::WorkspaceCreate` (`crates/ws-server/src/protocol/workspace.rs:9-18`)
- **Entry Point**: `router.rs:41-53` -> `workspace::create()`
- **Handler**: `crates/ws-server/src/workspace/mod.rs:91-194`
  - Expands tilde in root path
  - Opens or initializes git repo
  - Creates workspace in DB
  - Creates main worktree via `worktree::create_main()`
  - Broadcasts `WorktreeCreated` for main worktree
  - Returns `WorkspaceCreated` with `WorkspaceData`
- **Response**: `ServerMessagePayload::WorkspaceCreated` -> Client `updateStateFromServerMessage()` calls `addWorkspace()`
- **Store Setter**: `useStore.addWorkspace(workspace)`

#### WorkspaceDelete
- **Direction**: Client -> Server -> Client
- **Client Type**: `WorkspaceDelete` (field: `workspaceId: string`)
- **Rust Type**: `protocol::WorkspaceDelete` (`workspace.rs:20-27`)
- **Entry Point**: `router.rs:55-67` -> `workspace::delete()`
- **Handler**: `workspace/mod.rs:198-283`
  - Fetches workspace from DB
  - Lists and deletes all worktrees (forced)
  - Deletes workspace from DB
  - Removes from in-memory state
  - Returns `WorkspaceDeleted`
- **Response**: `ServerMessagePayload::WorkspaceDeleted`
- **Store Setter**: `useStore.removeWorkspace(workspaceId)` - also cascades to remove worktrees, agent sessions, terminal sessions

#### WorkspaceRename
- **Direction**: Client -> Server
- **Status**: NOT IMPLEMENTED - returns `NOT_IMPLEMENTED` error
- **Client Type**: `WorkspaceRename` (`workspaceId: string, newName: string`)

#### WorkspaceUpdate
- **Direction**: Client -> Server
- **Status**: NOT IMPLEMENTED - returns `NOT_IMPLEMENTED` error
- **Client Type**: `WorkspaceUpdate` (`workspaceId, color?, icon?, worktreeBaseDir?, settings?, requestId?`)

---

### 3.2 Worktree CRUD

#### WorktreeCreate
- **Direction**: Client -> Server -> Client
- **Client Type**: `WorktreeCreate` (`workspaceId, branchName, agentType?, requestId?, useExistingBranch?`)
- **Rust Type**: `protocol::WorktreeCreate` (`worktree.rs:19-32`)
- **Entry Point**: `router.rs:69-81` -> `worktree::create()`
- **Handler**: `worktree/mod.rs:53-196`
  - Opens git repo, creates branch if needed
  - Creates git worktree at `<workspace>/.git/worktrees/<name>/<branch>`
  - Creates DB record, in-memory state
  - Returns `WorktreeCreated` with `WorktreeData`
- **Response**: `ServerMessagePayload::WorktreeCreated`
- **Store Setter**: `useStore.addWorktree(worktree)`

#### WorktreeDelete
- **Direction**: Client -> Server -> Client
- **Client Type**: `WorktreeDelete` (`worktreeId: string`)
- **Rust Type**: `protocol::WorktreeDelete` (`worktree.rs:34-41`)
- **Entry Point**: `router.rs:83-95` -> `worktree::delete()`
- **Handler**: `worktree/mod.rs:200-308` (via `delete_internal(force=false)`)
  - Prevents deletion of main worktrees
  - Removes git worktree directory and metadata
  - Deletes from DB and in-memory state
  - Returns `WorktreeDeleted`
- **Response**: `ServerMessagePayload::WorktreeDeleted`
- **Store Setter**: `useStore.removeWorktree(worktreeId)` - also removes agent/terminal sessions, clears file/git caches

#### WorktreeMerge
- **Direction**: Client -> Server
- **Status**: NOT IMPLEMENTED
- **Client Type**: `WorktreeMerge` (`worktreeId, squash: bool, deleteAfter: bool`)

#### WorktreeList
- **Direction**: Client -> Server -> Client
- **Client Type**: `WorktreeList` (`workspaceId: string`)
- **Entry Point**: `router.rs:97-113` -> `worktree::list()`
- **Handler**: `worktree/mod.rs:312-392`
  - Lists worktrees from DB
  - Auto-migrates: creates main worktree if missing
  - Sorts: main worktree first, then by created_at
  - Returns `WorktreeListResult` (NOT in ServerMessagePayload enum directly - uses `WorktreeListResult`)
- **Response**: `ServerMessagePayload::WorktreeListResult`
  - Fields: `{ workspaceId, worktrees: Vec<WorktreeData> }`
- **Store Setter**: Not directly handled in `updateStateFromServerMessage()`. Results are used internally.

#### WorktreeChangeBranch
- **Direction**: Client -> Server -> Client
- **Client Type**: `WorktreeChangeBranch` (`worktreeId, newBranchName, requestId?`)
- **Entry Point**: `router.rs:115-127` -> `worktree::change_branch()`
- **Handler**: `worktree/mod.rs:414-463`
  - Calls `git_ops.change_branch()`
  - Updates DB and in-memory state
  - Returns `WorktreeChanged`
- **Response**: `ServerMessagePayload::WorktreeChanged`
- **Store Setter**: `useStore.updateWorktree(worktree.id, worktree)` + clears file/git caches

#### WorktreeRename
- **Direction**: Not a protocol message type
- **Note**: There is NO `WorktreeRename` type. Renaming worktrees is not supported as a protocol operation.

#### GetWorktreeDetails
- **Direction**: Client -> Server -> Client
- **Client Type**: `GetWorktreeDetails` (`workspaceId, requestId?`)
- **Entry Point**: `router.rs:189-191` -> `handle_get_worktree_details()`
- **Handler**: `router.rs:391-500`
  - Lists worktrees for workspace
  - For each worktree, loads agent sessions (only spawned ones) and terminal sessions from DB
  - Returns `WorktreeDetailsResult`
- **Response**: `ServerMessagePayload::WorktreeDetailsResult`
  - Fields: `{ requestId?, worktrees[], agentSessions[], terminalSessions[] }`
- **Store Setter**: `addWorktree()` for each worktree, `addAgentSession()` for each agent, `addTerminalSession()` for each terminal

#### WorktreeStatus
- **Direction**: Server -> Client (broadcast)
- **Rust Type**: `WorktreeStatus` (`worktreeId, status`)
- **Note**: No client request type. Appears to be unused in routing.
- **Store Setter**: `updateWorktree(message.worktree.id, message.worktree)`

---

### 3.3 Git Operations

#### GitStatus
- **Direction**: Client -> Server -> Client
- **Client Type**: `GitStatus` (`worktreeId: string`)
- **Rust Type**: `protocol::GitStatus` (`git.rs:22-29`)
- **Entry Point**: `router.rs:199` -> `handle_git_status()`
- **Handler**: `router.rs:503-530`
  - Looks up worktree path from in-memory state
  - Calls `state.git_ops.status()`
  - Returns `GitStatusResult`
- **Response**: `ServerMessagePayload::GitStatusResult`
  - Fields: `{ worktreeId, entries: Vec<GitStatusEntry> }`
  - `GitStatusEntry`: `{ path: string, statusCode: string }` (raw git porcelain XY codes)
- **Store Setter**: Not handled in `updateStateFromServerMessage()`. Results cached via `setGitStatusCache()`.

#### GitDiff
- **Direction**: Client -> Server -> Client
- **Client Type**: `GitDiff` (`worktreeId, filePath?`)
- **Rust Type**: `protocol::GitDiff` (`git.rs:31-39`)
- **Entry Point**: `router.rs:201` -> `handle_git_diff()`
- **Handler**: `router.rs:533-565`
  - Looks up worktree path
  - Calls `state.git_ops.diff()`
  - Returns `GitDiffResult`
- **Response**: `ServerMessagePayload::GitDiffResult`
  - Fields: `{ worktreeId, filePath?, diff: string }` (raw diff string)
- **Store Setter**: Not handled in `updateStateFromServerMessage()`.

#### GitCommit
- **Direction**: Client -> Server -> Client
- **Client Type**: `GitCommit` (`worktreeId, message: string, files?: string[]`)
- **Rust Type**: `protocol::GitCommit` (`git.rs:41-50`)
- **Entry Point**: `router.rs:203` -> `handle_git_commit()`
- **Handler**: `router.rs:568-607`
  - Looks up worktree path
  - Calls `state.git_ops.commit()`
  - On success: returns `Notification` with "Commit Created"
  - On failure: returns `Error`
- **Response**: `ServerMessagePayload::Notification` (success) or `ServerMessagePayload::Error` (failure)
- **Store Setter**: `addNotification()` + `showNotification()` via Tauri

#### CreatePR
- **Direction**: Client -> Server -> Client
- **Client Type**: `CreatePR` (`worktreeId, title: string, body?: string`)
- **Rust Type**: `protocol::CreatePR` (`git.rs:52-61`)
- **Entry Point**: `router.rs:205` -> `handle_create_pr()`
- **Handler**: `router.rs:610-649`
  - Looks up worktree path
  - Calls `state.git_ops.create_pr()`
  - On success: returns `Notification` with "Pull Request Created"
  - On failure: returns `Error`
- **Response**: `ServerMessagePayload::Notification` or `ServerMessagePayload::Error`
- **Store Setter**: `addNotification()` + `showNotification()`

#### GitStats
- **Direction**: Not a protocol message type
- **Type**: Data type only (`GitStats`: `{ modified, added, deleted }`)
- **Used in**: `WorktreeData.git_stats` field
- **Note**: No `GitStats` request/response pair. Stats are populated when worktrees are listed.

---

### 3.4 File Operations

#### FileRead
- **Direction**: Client -> Server -> Client
- **Client Type**: `FileRead` (`worktreeId, path: string`)
- **Rust Type**: `protocol::FileRead` (`file.rs:9-17`)
- **Entry Point**: `router.rs:173-175` -> `handle_file_read()`
- **Handler**: `router.rs:703-759`
  - Looks up worktree path
  - Security check: canonicalize path, ensure within worktree
  - Reads file with `tokio::fs::read_to_string()`
  - Returns `FileContent`
- **Response**: `ServerMessagePayload::FileContent`
  - Fields: `{ worktreeId, path, content }`
- **Store Setter**: Not handled in `updateStateFromServerMessage()`. Used by editor components directly via `onMessage` handlers.

#### FileWrite
- **Direction**: Client -> Server
- **Status**: NOT IMPLEMENTED
- **Client Type**: `FileWrite` (`worktreeId, path, content: string`)
- **Rust Type**: `protocol::FileWrite` (`file.rs:19-28`)

#### FileList
- **Direction**: Client -> Server -> Client
- **Client Type**: `FileList` (`worktreeId, path?`)
- **Rust Type**: `protocol::FileList` (`file.rs:30-38`)
- **Entry Point**: `router.rs:169-171` -> `handle_file_list()`
- **Handler**: `router.rs:652-700`
  - Looks up worktree path
  - Recursively collects files (skipping `.git/`)
  - Returns sorted `FileListResult`
- **Response**: `ServerMessagePayload::FileListResult`
  - Fields: `{ worktreeId, files: Vec<String>, requestId? }`
- **Store Setter**: Not handled in `updateStateFromServerMessage()`. Results cached via `setFileListCache()`.

---

### 3.5 Agent Session Management

#### AgentSpawn
- **Direction**: Client -> Server -> Client
- **Client Type**: `AgentSpawn` (`worktreeId, agentType: string`)
- **Rust Type**: `protocol::AgentSpawn` (`agent.rs:9-17`)
- **Entry Point**: `router.rs:145-147` -> `handle_agent_spawn()`
- **Handler**: `agent/handler.rs` (via `start_acp_runtime` in state)
- **Response**: May trigger `AgentStatusUpdate` broadcast via ACP runtime
- **Store Setter**: `updateAgentSession()` or `addAgentSession()` (via `AgentStatusUpdate`)

#### AgentSend
- **Direction**: Client -> Server
- **Client Type**: `AgentSend` (`worktreeId, message: string`)
- **Rust Type**: `protocol::AgentSend` (`agent.rs:19-27`)
- **Entry Point**: `router.rs:149-151` -> `handle_agent_send()`
- **Response**: Triggers ACP events (`AcpWireEvent` stream)

#### AgentCancel
- **Direction**: Client -> Server
- **Client Type**: `AgentCancel` (`worktreeId, sessionId`)
- **Rust Type**: `protocol::AgentCancel` (`agent.rs:29-39`)
- **Entry Point**: `router.rs:153-155` -> `handle_agent_cancel()`

#### AgentSetConfigOption
- **Direction**: Client -> Server
- **Client Type**: `AgentSetConfigOption` (`worktreeId, configId, value`)
- **Rust Type**: `protocol::AgentSetConfigOption` (`agent.rs:41-50`)
- **Entry Point**: `router.rs:157-159` -> `handle_agent_set_config_option()`

#### AgentRename
- **Direction**: Client -> Server -> Client
- **Client Type**: `AgentRename` (`sessionId, newLabel, requestId`)
- **Rust Type**: `protocol::AgentRename` (`agent.rs:125-136`)
- **Entry Point**: `router.rs:161-163` -> `handle_agent_rename()`
- **Handler**: `router.rs:848-894`
  - Updates DB label
  - Broadcasts `AgentUpdated`
  - Returns `Ack`
- **Response**: `ServerMessagePayload::AgentUpdated` (broadcast) + `ServerMessagePayload::Ack`
- **Store Setter**: `updateAgentSession(sessionId, { label, position })`

#### AgentReorder
- **Direction**: Client -> Server -> Client
- **Client Type**: `AgentReorder` (`worktreeId, sessionIds[], requestId`)
- **Rust Type**: `protocol::AgentReorder` (`agent.rs:138-150`)
- **Entry Point**: `router.rs:165-167` -> `handle_agent_reorder()`
- **Handler**: `router.rs:897-932`
  - Updates positions in DB
  - Broadcasts `AgentUpdated` for each session
  - Returns `Ack`
- **Response**: Multiple `AgentUpdated` broadcasts + `Ack`
- **Store Setter**: `updateAgentSession(sessionId, { position })`

#### AgentStatusUpdate (Server -> Client)
- **Direction**: Server -> Client (broadcast)
- **Rust Type**: `protocol::AgentStatusUpdate` (`agent.rs:77-91`)
  - Fields: `{ id, worktreeId, agentType, status: AgentStatus, startedAt }`
  - `AgentStatus`: `Working | Waiting | Idle`
- **Origin**: ACP runtime broadcasts via `state.broadcast()`
- **Store Setter**: `updateAgentSession()` (update) or `addAgentSession()` (new)

#### AgentRemoved (Server -> Client)
- **Direction**: Server -> Client (broadcast)
- **Rust Type**: `protocol::AgentRemoved` (`agent.rs:93-103`)
  - Fields: `{ id, worktreeId }`
- **Store Setter**: `removeAgentSession(id)`

#### AgentOutput (Server -> Client)
- **Direction**: Server -> Client (broadcast)
- **Rust Type**: `protocol::AgentOutput` (`agent.rs:105-113`)
  - Fields: `{ worktreeId, output: string }`
- **Store Setter**: Not stored in main state (handled separately)

#### AgentUpdated (Server -> Client)
- **Direction**: Server -> Client (broadcast)
- **Rust Type**: `protocol::AgentUpdated` (`agent.rs:152-169`)
  - Fields: `{ sessionId, worktreeId, label?, position?, requestId }`
- **Triggered by**: `AgentRename`, `AgentReorder`
- **Store Setter**: `updateAgentSession(sessionId, { label?, position? })`

---

### 3.6 State Snapshot

#### GetState (Client -> Server)
- **Direction**: Client -> Server -> Client
- **Client Type**: `GetState` (`requestId: string`)
- **Rust Type**: `protocol::GetState` (`settings.rs:9-16`)
- **Triggered**: Automatically on WebSocket connect (`ws.ts:104`)
- **Entry Point**: `router.rs:37-39` -> `handle_get_state()`
- **Handler**: `router.rs:275-388`
  - Lists all workspaces
  - Lists all worktrees (but returns EMPTY in snapshot)
  - Lists all agent/terminal sessions (but returns EMPTY in snapshot)
  - Returns `StateSnapshot` with workspaces populated, arrays empty for lazy loading
- **Response**: `ServerMessagePayload::StateSnapshot`
  - Fields: `{ requestId, workspaces[], worktrees[], agentSessions[], terminalSessions[], settings[] }`
  - Note: worktrees, agentSessions, terminalSessions are returned EMPTY - loaded lazily via `GetWorktreeDetails`
- **Store Setter**: `stateFromSnapshot({ workspaces, worktrees, agentSessions, terminalSessions })`
  - Sets `isWorkspacesLoading: false`
  - Triggers `CONNECTION_RECONNECTED` accumulator action

---

### 3.7 Settings

#### UpdateSettings
- **Direction**: Client -> Server
- **Status**: NOT IMPLEMENTED
- **Client Type**: `UpdateSettings` (`key: string, value: string`)
- **Rust Type**: `protocol::UpdateSettings` (`settings.rs:18-24`)

#### SettingData
- **Type**: Data type only (`{ key: string, value: string }`)
- **Used in**: `StateSnapshot.settings` field

---

### 3.8 Notifications / Error / Heartbeat

#### Ping
- **Direction**: Client -> Server
- **Client Type**: `Ping` (`timestamp: number`)
- **Rust Type**: `protocol::Ping` (`common.rs:142-148`)
- **Handler**: `router.rs:25-32` (inline)
  - Updates client activity timestamp
  - Returns `Pong` with same timestamp

#### Pong
- **Direction**: Server -> Client (in response to Ping)
- **Server Type**: `Pong` (`timestamp: number`)
- **Rust Type**: `protocol::Pong` (`common.rs:150-156`)
- **Client Handler**: `ws.ts:247-252` (`handlePong()`) - clears heartbeat timeout timer
- **Note**: Also a client message type (server can ping client)

#### Notification
- **Direction**: Server -> Client
- **Rust Type**: `protocol::Notification` (`common.rs:196-211`)
  - Fields: `{ level: NotificationLevel, title: string, message: string }`
  - `NotificationLevel`: `Info | Warning | Error`
- **Triggered by**: `GitCommit` (success), `CreatePR` (success)
- **Store Setter**: `addNotification()` + `showNotification()` via Tauri system notification

#### Error
- **Direction**: Server -> Client
- **Rust Type**: `protocol::Error` (`common.rs:172-193`)
  - Fields: `{ code: string, message: string, details?: string, requestId?: string }`
- **Triggered by**: Any handler failure, `not_implemented()` fallback
- **Client Handler**: `store.ts:1138` -> `handleError(message)`
- **Error codes in TypeScript**: `PTY_CRASH`, `GIT_FAILURE`, `AGENT_CRASH`, `DB_ERROR`

#### Ack
- **Direction**: Bidirectional
- **Rust Type**: `protocol::Ack` (`common.rs:125-133`)
  - Fields: `{ message_id: Uuid, status: AckStatus }`
  - `AckStatus`: `Success | Error(String)`
- **Used by**: `AgentRename`, `AgentReorder`, `TerminalRename`, `TerminalReorder`
- **Note**: Client sends `Ack` but it returns `NOT_IMPLEMENTED` error

---

## 4. Summary of All Message Types

### ClientMessagePayload (37 types)

| # | Type | Direction | Implemented | Response Type |
|---|------|-----------|-------------|---------------|
| 1 | `WorkspaceCreate` | C->S | Yes | `WorkspaceCreated` |
| 2 | `WorkspaceDelete` | C->S | Yes | `WorkspaceDeleted` |
| 3 | `WorkspaceRename` | C->S | **No** | - |
| 4 | `WorkspaceUpdate` | C->S | **No** | - |
| 5 | `WorktreeCreate` | C->S | Yes | `WorktreeCreated` |
| 6 | `WorktreeDelete` | C->S | Yes | `WorktreeDeleted` |
| 7 | `WorktreeMerge` | C->S | **No** | - |
| 8 | `WorktreeList` | C->S | Yes | `WorktreeListResult` |
| 9 | `WorktreeChangeBranch` | C->S | Yes | `WorktreeChanged` |
| 10 | `GetWorktreeDetails` | C->S | Yes | `WorktreeDetailsResult` |
| 11 | `AgentSpawn` | C->S | Yes | `AgentStatusUpdate` |
| 12 | `AgentSend` | C->S | Yes | `AcpWireEvent` stream |
| 13 | `AgentCancel` | C->S | Yes | `AcpWireEvent` |
| 14 | `AgentSetConfigOption` | C->S | Yes | `AcpConfigOptionsUpdate` |
| 15 | `AgentRename` | C->S | Yes | `AgentUpdated` + `Ack` |
| 16 | `AgentReorder` | C->S | Yes | `AgentUpdated` + `Ack` |
| 17 | `TerminalInput` | C->S | Yes | `TerminalOutput` |
| 18 | `TerminalResize` | C->S | Yes | - |
| 19 | `TerminalCreate` | C->S | Yes | `TerminalCreated` |
| 20 | `TerminalKill` | C->S | Yes | `TerminalRemoved` |
| 21 | `TerminalRename` | C->S | Yes | `TerminalUpdated` + `Ack` |
| 22 | `TerminalReorder` | C->S | Yes | `TerminalUpdated` + `Ack` |
| 23 | `TerminalRequestHistory` | C->S | Yes | `TerminalHistory` |
| 24 | `FileRead` | C->S | Yes | `FileContent` |
| 25 | `FileWrite` | C->S | **No** | - |
| 26 | `FileList` | C->S | Yes | `FileListResult` |
| 27 | `GitStatus` | C->S | Yes | `GitStatusResult` |
| 28 | `GitDiff` | C->S | Yes | `GitDiffResult` |
| 29 | `GitCommit` | C->S | Yes | `Notification` |
| 30 | `CreatePR` | C->S | Yes | `Notification` |
| 31 | `GetState` | C->S | Yes | `StateSnapshot` |
| 32 | `UpdateSettings` | C->S | **No** | - |
| 33 | `Ping` | C->S | Yes | `Pong` |
| 34 | `Pong` | C->S | Yes | - |
| 35 | `Ack` | C->S | **No** | - |

### ServerMessagePayload (30 types)

| # | Type | Direction | Trigger |
|---|------|-----------|---------|
| 1 | `StateSnapshot` | S->C | `GetState` response |
| 2 | `WorkspaceCreated` | S->C | `WorkspaceCreate` response |
| 3 | `WorkspaceDeleted` | S->C | `WorkspaceDelete` response |
| 4 | `WorkspaceUpdated` | S->C | Not implemented |
| 5 | `WorktreeCreated` | S->C | `WorktreeCreate` / auto-migration |
| 6 | `WorktreeDeleted` | S->C | `WorktreeDelete` response |
| 7 | `WorktreeChanged` | S->C | `WorktreeChangeBranch` response |
| 8 | `WorktreeListResult` | S->C | `WorktreeList` response |
| 9 | `WorktreeStatus` | S->C | Broadcast (unused) |
| 10 | `WorktreeDetailsResult` | S->C | `GetWorktreeDetails` response |
| 11 | `AgentStatusUpdate` | S->C | ACP runtime broadcast |
| 12 | `AgentOutput` | S->C | ACP runtime broadcast |
| 13 | `AgentPrompt` | S->C | ACP runtime broadcast |
| 14 | `AgentRemoved` | S->C | ACP runtime broadcast |
| 15 | `TerminalOutput` | S->C | PTY broadcast |
| 16 | `TerminalCreated` | S->C | `TerminalCreate` response |
| 17 | `TerminalRemoved` | S->C | PTY broadcast |
| 18 | `TerminalUpdated` | S->C | Rename/Reorder broadcast |
| 19 | `TerminalHistory` | S->C | `TerminalRequestHistory` response |
| 20 | `AgentUpdated` | S->C | Rename/Reorder broadcast |
| 21 | `FileContent` | S->C | `FileRead` response |
| 22 | `FileListResult` | S->C | `FileList` response |
| 23 | `GitStatusResult` | S->C | `GitStatus` response |
| 24 | `GitDiffResult` | S->C | `GitDiff` response |
| 25 | `Error` | S->C | Any failure |
| 26 | `Ping` | S->C | Server-initiated heartbeat |
| 27 | `Pong` | S->C | `Ping` response |
| 28 | `Notification` | S->C | Git operations, system events |
| 29 | `Ack` | S->C | Rename/Reorder confirmation |
| 30 | `AcpWireEvent` | S->C | ACP event stream |

### WS-ACP Event Types (inside `AcpWireEvent`)

| Event Type | Data Type | Description |
|------------|-----------|-------------|
| `SessionInit` | `AcpSessionInit` | Session initialized with capabilities and config options |
| `ConfigOptionsUpdate` | `AcpConfigOptionsUpdate` | Config options changed |
| `SessionStatus` | `AcpSessionStatusEvent` | Working/Waiting/Complete/Cancelled |
| `PromptChunk` | `AcpPromptChunk` | Streaming text/structured content |
| `PromptComplete` | `AcpPromptComplete` | Normal/Cancelled/Error |
| `ToolUse` | `AcpToolUseEvent` | Started/InProgress/Completed/Error |
| `ContextUpdate` | `AcpContextUpdate` | FileRead/FileWritten/CommandExecuted/BrowserAction/MemoryUpdate |
| `Error` | `AcpError` | Structured ACP error |
| `ResumeMarker` | `AcpResumeMarker` | Checkpoint for resumption |

---

## 5. Key Files Reference

| File | Purpose |
|------|---------|
| `crates/ws-server/src/protocol/common.rs` | ClientMessagePayload, ServerMessagePayload enums + shared types |
| `crates/ws-server/src/protocol/workspace.rs` | Workspace CRUD types |
| `crates/ws-server/src/protocol/worktree.rs` | Worktree CRUD types |
| `crates/ws-server/src/protocol/agent.rs` | Agent session types |
| `crates/ws-server/src/protocol/file.rs` | File operation types |
| `crates/ws-server/src/protocol/git.rs` | Git operation types |
| `crates/ws-server/src/protocol/settings.rs` | Settings and state types |
| `crates/ws-server/src/protocol/terminal.rs` | Terminal types |
| `crates/ws-server/src/protocol/acp.rs` | WS-ACP wire contract types |
| `crates/ws-server/src/router.rs` | Message dispatch (route_message) |
| `crates/ws-server/src/main.rs` | WebSocket handler, MessagePack decode/encode |
| `crates/ws-server/src/state.rs` | AppState, in-memory registries |
| `crates/ws-server/src/workspace/mod.rs` | Workspace handlers |
| `crates/ws-server/src/worktree/mod.rs` | Worktree handlers |
| `crates/ws-server/src/agent/handler.rs` | Agent handlers |
| `crates/ws-server/src/pty/handler.rs` | Terminal handlers |
| `crates/ws-server/src/git/mod.rs` | Git operations |
| `apps/web/src/types/protocol.ts` | TypeScript protocol types (1218 lines) |
| `apps/web/src/lib/ws.ts` | WebSocket client (YmirClient) |
| `apps/web/src/store.ts` | Zustand store + updateStateFromServerMessage() |
| `apps/web/src/types/generated/*.ts` | ts-rs generated types from Rust |

---

## 6. Not Implemented Operations (5 total)

These exist in the protocol enum but return `NOT_IMPLEMENTED` errors:

1. **WorkspaceRename** - `WorkspaceRename` message type exists but handler returns error
2. **WorkspaceUpdate** - `WorkspaceUpdate` message type exists but handler returns error
3. **WorktreeMerge** - `WorktreeMerge` message type exists but handler returns error
4. **FileWrite** - `FileWrite` message type exists but handler returns error
5. **UpdateSettings** - `UpdateSettings` message type exists but handler returns error
6. **Ack** (client->server) - Client can send `Ack` but it returns error

---

## 7. Wire Encoding Details

### MessagePack Format
- **Rust**: `rmp_serde::to_vec_named(&msg)` / `rmp_serde::from_slice::<ClientMessage>(&data)`
- **TypeScript**: `encode(message)` / `decode(data)` from `@msgpack/msgpack`

### Serde Serialization
- `#[serde(tag = "type", content = "data")]` on both enums
- `#[serde(rename_all = "camelCase")]` on all structs
- UUIDs serialized as strings via custom `uuid_serde` module
- Optional UUIDs via `optional_uuid_serde`

### Protocol Version
- Current: `PROTOCOL_VERSION = 1`
- Both sides validate version on connect
- Messages carry `version` field at top level
