
## WS-ACP Wire Contract Seam Mapping (2026-03-19)

### 1. Rust Protocol Definitions
**Primary file:** `/home/blake/Documents/software/ymir/crates/ws-server/src/protocol.rs` (1288 lines)

**Key symbols:**
- `ClientMessage` (lines 62-67) - wrapper with `version: u32` and `payload: ClientMessagePayload`
- `ServerMessage` (lines 70-75) - wrapper with `version: u32` and `payload: ServerMessagePayload`
- `ClientMessagePayload` enum (lines 78-108) - 27 client-to-server message variants
- `ServerMessagePayload` enum (lines 111-138) - 25 server-to-client message variants
- `PROTOCOL_VERSION` const (line 59) - currently `1`
- `uuid_str` module (lines 10-28) - custom serializer for Uuid fields
- `optional_uuid_str` module (lines 30-56) - custom serializer for Option<Uuid> fields

**Test coverage:** Lines 761-1287 contain comprehensive roundtrip MessagePack tests

### 2. TypeScript Bindings

**Generated bindings:** `/home/blake/Documents/software/ymir/crates/ws-server/bindings/` (54 .ts files)
- Generated via `ts-rs` with `#[ts(export)]` annotations in protocol.rs
- Individual files for each type (e.g., `AgentSessionData.ts`, `Ack.ts`)
- Regenerate with: `cargo test -p ws-server --features export-types -- --nocapture`

**Manual protocol wrapper:** `/home/blake/Documents/software/ymir/apps/web/src/types/generated/protocol.ts` (850 lines)
- Contains MessagePack encode/decode helpers
- Type discriminators and guards
- Not auto-generated - manually maintained

### 3. ts-rs Configuration
**File:** `/home/blake/Documents/software/ymir/crates/ws-server/Cargo.toml`
- Line 33: `ts-rs = { version = "10.0", features = ["serde-compat"] }`
- Lines 35-36: `export-types = []` feature flag

### 4. Encode/Decode Flow

**Rust (server side):**
- `rmp_serde::to_vec_named()` in main.rs line 188
- `rmp_serde::from_slice::<ClientMessage>()` in main.rs line 148

**TypeScript (client side):**
- `encode()` from `@msgpack/msgpack` in protocol.ts line 740
- `decode()` from `@msgpack/msgpack` in protocol.ts line 751
- Custom encode/decode in ws.ts lines 252-276 (adds version wrapper)

### 5. Message Routing
**File:** `/home/blake/Documents/software/ymir/crates/ws-server/src/router.rs` (606 lines)
- `route_message()` function (lines 17-163) - dispatches ClientMessagePayload variants
- Handler functions for each message type (Git, Terminal, Agent, etc.)

### 6. ACP Session References (Leakage Risk)
**File:** `/home/blake/Documents/software/ymir/crates/ws-server/src/protocol.rs`
- `AgentSessionData.acp_session_id` (line 487) - `Option<String>` in wire protocol
- Currently stored in DB and used to track ACP subprocess sessions

**Files using acp_session_id:**
- `crates/ws-server/src/router.rs` line 293
- `crates/ws-server/src/agent/handler.rs` line 40
- `crates/ws-server/src/test_fixtures.rs` line 717

**Note:** This is internal ACP session tracking, should remain in wire protocol as it's the session identifier for agent subprocesses.

### 7. Assistant-UI State (Separation Verified)
**File:** `/home/blake/Documents/software/ymir/apps/web/src/store.ts`
- `agentTabs` Map (line 42) - per-worktree UI tabs, NOT in wire protocol
- `updateStateFromServerMessage()` (lines 442-535) - routes wire messages to UI state
- UI-specific types in `types/state.ts`

**Finding:** Wire protocol is cleanly separated from assistant-ui state. No assistant-ui leakage in transport vocabulary.

### 8. Test Infrastructure
**Rust fixtures:** `/home/blake/Documents/software/ymir/crates/ws-server/src/test_fixtures.rs` (1017 lines)
- `write_fixture()` helper for .msgpack test files
- Comprehensive roundtrip tests for all message types

**TypeScript tests:** `/home/blake/Documents/software/ymir/apps/web/src/types/__tests__/protocol.test.ts` (664 lines)
- Roundtrip encode/decode tests
- Type guard validation
- Version header tests

### 9. WebSocket Client Implementation
**File:** `/home/blake/Documents/software/ymir/apps/web/src/lib/ws.ts` (438 lines)
- `YmirClient` class with reconnection, heartbeat
- `encodeMessage()` - adds version wrapper (lines 252-265)
- `decodeMessage()` - flattens version wrapper (lines 267-276)

### 10. Panel Layout State (Potential Leakage Risk)
**File:** `/home/blake/Documents/software/ymir/crates/ws-server/src/db/mod.rs`
- `panel_layouts` table (lines 77-85) - workspace panel sizes
- `PanelLayout` struct (lines 146-153)
- `set_panel_layout()` / `get_panel_layout()` (lines 771-812)

**Note:** These are workspace-level layout preferences stored in DB. Not in wire protocol, but worth monitoring for future leakage.

### Key Candidates for WS-ACP Task 1 Implementation:
1. **Wire contract definition:** `/home/blake/Documents/software/ymir/crates/ws-server/src/protocol.rs`
2. **TypeScript types:** `/home/blake/Documents/software/ymir/apps/web/src/types/generated/protocol.ts`
3. **Generated bindings:** `/home/blake/Documents/software/ymir/crates/ws-server/bindings/`
4. **Tests:** Both test files above
5. **Router:** `/home/blake/Documents/software/ymir/crates/ws-server/src/router.rs`

### Patterns to Preserve:
- Version header pattern (PROTOCOL_VERSION = 1)
- UUID serialization (uuid_str module)
- Message envelope ({version, type, data}) - note: TS client adds version wrapper differently
- ts-rs annotations on all wire types
- Roundtrip test coverage

## Official ACP Rust SDK Transport Analysis (2026-03-19)

### 1. Transport-Agnostic Design (CONFIRMED)
**Source:** https://docs.rs/agent-client-protocol-schema/latest/agent_client_protocol_schema/index.html

**Evidence:**
> "ACP is a JSON-RPC based protocol. While clients typically start agents as subprocesses and communicate over stdio (stdin/stdout), **this crate is transport-agnostic**. You can use any bidirectional stream that implements `AsyncRead` and `AsyncWrite`."

**Implication:** Ymir must provide custom WebSocket transport. No built-in WebSocket/SSE/HTTP layer exists in official SDK.

### 2. Official Examples: Stdio Only (CONFIRMED)
**Source 1:** https://github.com/agentclientprotocol/rust-sdk/blob/main/examples/client.rs

**Evidence:**
```rust
//! The client starts an agent as a subprocess and communicates with it over stdio.
//! Run client like this:
//! cargo run --example client -- path/to/agent --agent-arg
//!
//! To connect it to the example agent from this crate:
//! cargo build --example agent && cargo run --example client -- target/debug/examples/agent
```

**Source 2:** https://github.com/agentclientprotocol/rust-sdk/blob/main/examples/agent.rs

**Evidence:**
```rust
//! A simple ACP agent server for educational purposes.
//! The agent communicates with clients over stdio.
//! To run it with logging:
//! RUST_LOG=info cargo run --example agent
```

**Key code pattern from client.rs (main function):**
```rust
let mut child = tokio::process::Command::new(program)
    .args(args.iter())
    .stdin(std::process::Stdio::piped())
    .stdout(std::process::Stdio::piped())
    .kill_on_drop(true)
    .spawn()?;

let (outgoing, incoming, child) = match command.as_slice() {
    [_, program, args @ ..] => {
        let mut child = tokio::process::Command::new(program)
            .args(args.iter())
            .stdin(std::process::Stdio::piped())
            .stdout(std::process::Stdio::piped())
            .kill_on_drop(true)
            .spawn()?;
        (
            child.stdin.take().unwrap().compat_write(),
            child.stdout.take().unwrap().compat(),
            child,
        )
    }
};
```

**Implication:** Official SDK expects stdio transport by default. No WebSocket example provided.

### 3. Connection Pattern: AgentSideConnection / ClientSideConnection
**Source:** https://docs.rs/agent-client-protocol-schema/latest/agent_client_protocol_schema/index.html

**Evidence:**
> "ACP uses a symmetric design where each participant implements one trait and creates a connection that provides complementary trait:
> - **Agent builders** implement [`Agent`] trait to handle client requests. They pass this implementation to [`AgentSideConnection::new`], which returns a connection providing [`Client`] methods.
> - **Client builders** implement [`Client`] trait to handle agent requests. They pass this implementation to [`ClientSideConnection::new`], which returns a connection providing [`Agent`] methods."

**Implication:** Ymir must wrap WebSocket streams as AsyncRead/AsyncWrite and pass to these connection constructors.

### 4. JSON-RPC 2.0 Protocol
**Source:** https://docs.rs/agent-client-protocol-schema/latest/agent_client_protocol_schema/index.html

**Evidence:**
> "ACP is a JSON-RPC based protocol"

**Supporting evidence:** Transport layer docs mention "There is no framing protocol beyond newlines — no length prefixes, no HTTP headers, no WebSocket upgrade handshake."

**Implication:** WebSocket wire contract must serialize JSON-RPC messages with newline framing (no binary WebSocket subprotocol).

### 5. Third-party Transport Constraints
**Source:** sacp (Symposium ACP) repository search results via zread.ai

**Evidence:**
> "Non-stdio variants (`Http`, `Sse`) produce an immediate error — HTTP transport is not yet supported."

**Implication:** Even third-party SACP extension confirms HTTP/WebSocket support is not yet available. Custom WebSocket transport is Ymir's responsibility.

### 6. Adapter Responsibilities for Ymir

**Confirmed Ymir must own:**
1. **WebSocket transport layer** - Wrap WebSocket streams as AsyncRead/AsyncWrite for ACP connections
2. **JSON-RPC framing** - Serialize/deserialize JSON-RPC messages with newline delimiters
3. **Connection lifecycle** - Spawn agent subprocess, wrap stdio, bridge to WebSocket
4. **Stateless translation** - ACP-WS adapter must not accumulate UI thread state
5. **Error envelope mapping** - Convert ACP errors to WebSocket wire contract errors

**Ymir does NOT get:**
1. Built-in WebSocket server/client
2. HTTP/SSE transport implementations
3. Session state management (ACP SDK is stateless per connection)
4. Reconnection logic (must be custom implementation)

### 7. Lifecycle Pattern from Official Examples

**Agent lifecycle (from agent.rs):**
1. `initialize()` - Handshake, negotiate protocol version
2. `new_session()` / `load_session()` - Session creation
3. `prompt()` - Process user requests, return streaming chunks
4. `cancel()` - Graceful cancellation
5. Session notifications sent via channel to client

**Client lifecycle (from client.rs):**
1. Spawn agent subprocess with stdio
2. `ClientSideConnection::new()` - Wrap stdio streams
3. `conn.initialize()` - Send init request
4. `conn.new_session()` - Create session with CWD
5. `conn.prompt()` - Send user prompts
6. Handle session notifications from agent

**Implication:** Ymir's ACP-WS adapter must follow this exact lifecycle sequence.

### 8. URLs for Reference

**Official Documentation:**
- Rust SDK docs: https://docs.rs/agent-client-protocol
- Rust SDK GitHub: https://github.com/agentclientprotocol/rust-sdk
- Rust library page: https://agentclientprotocol.com/libraries/rust

**Official Examples:**
- Agent example: https://github.com/agentclientprotocol/rust-sdk/blob/main/examples/agent.rs
- Client example: https://github.com/agentclientprotocol/rust-sdk/blob/main/examples/client.rs

**Third-party Context:**
- sacp (Symposium ACP): https://crates.io/crates/sacp (shows HTTP/SSE explicitly unsupported)

# Task 5: Worktree-CWD Launch and Lifecycle Rules

## Worktree Selection Source of Truth

### Web Side
- **File**: `apps/web/src/store.ts`
- **Line 36**: `activeWorktreeId: string | null` - stores currently selected worktree ID
- **Line 85**: `setActiveWorktree(worktreeId)` - setter for active worktree
- **Line 407-410**: `selectActiveWorktree` selector retrieves active worktree from state
- The web client tracks active worktree selection in Zustand store

### Rust Side
- **File**: `crates/ws-server/src/state.rs`
- **Line 79-80**: `worktrees: RwLock<HashMap<Uuid, WorktreeState>>` - in-memory worktree registry
- **Line 32-39**: `WorktreeState` struct contains `path` field which is the CWD
- **Line 149-157**: `initialize_from_db()` loads worktrees from database into memory on startup
- Worktree metadata (including path) is stored in both DB and in-memory state

## Where CWD is Chosen for Agent Launch

### Primary Location
- **File**: `crates/ws-server/src/agent/handler.rs`
- **Lines 16-29**: Extracts `worktree_path` from in-memory worktrees registry using `msg.worktree_id`
- **Line 84**: Calls `AcpClient::spawn(&agent_type_ref, &worktree_path_ref)` with worktree path
- **File**: `crates/ws-server/src/agent/acp.rs`
- **Line 98**: `.current_dir(worktree_path)` sets subprocess CWD before spawning

### Flow
1. Client sends `AgentSpawn` message with `worktree_id`
2. `handle_agent_spawn()` looks up worktree in `state.worktrees`
3. Retrieves `worktree.path` from `WorktreeState`
4. Passes path to `AcpClient::spawn()` which sets `current_dir` for subprocess

## Agent Lifecycle Flow

### Spawn Flow
**Entry**: `crates/ws-server/src/agent/handler.rs::handle_agent_spawn` (line 12)

1. Validate worktree exists and get path (lines 16-29)
2. Create DB session record (lines 36-53)
3. Add to in-memory `state.agents` (lines 55-63)
4. Spawn agent process in worktree CWD via `tokio::spawn` (lines 83-101)
5. On success: store client in `state.agent_clients[worktree_id]` (line 87)
6. Broadcast `AgentStatusUpdate` to all clients (line 75)

**One Agent Per Worktree**: `state.agent_clients` is keyed by `worktree_id`, enforcing single agent per worktree

### Send Flow
**Entry**: `crates/ws-server/src/agent/handler.rs::handle_agent_send` (line 114)

1. Look up agent client in `state.agent_clients[worktree_id]` (lines 118-131)
2. Call `agent_client.send_prompt(&msg.message)` (line 135)
3. Return Ack on success

### Cancel Flow
**Entry**: `crates/ws-server/src/agent/handler.rs::handle_agent_cancel` (line 151)

1. Find session by `worktree_id` in `state.agents` (lines 155-164)
2. Kill agent client process (line 185)
3. Remove from `state.agent_clients` (line 191)
4. Remove from `state.agents` (line 196)
5. Delete from database (line 199)
6. Broadcast `AgentRemoved` to all clients (line 203)

## Session Cleanup Handling

### Worktree Removal (Server Side)
**File**: `crates/ws-server/src/worktree/mod.rs`

**Lines 219-228**: Removes worktree directory from filesystem
**Lines 252-256**: Deletes worktree from database (cascades to agent_sessions via FK)
**Line 263**: Removes from `state.worktrees`

**Database FK Constraint** (from db/mod.rs line 34):
- Agent sessions have FK `worktree_id` with `ON DELETE CASCADE`
- Deleting a worktree automatically deletes associated agent sessions

### Workspace Removal (Server Side)
**File**: `crates/ws-server/src/workspace/mod.rs`

**Lines 160-190**: Iterates through all worktrees for workspace and deletes each
- Calls `worktree::delete()` which cascades to agent sessions
- Worktree deletion includes agent client cleanup

### Web Side Cleanup
**File**: `apps/web/src/store.ts`

**Lines 162-169**: `removeWorktree(worktreeId)` removes worktree AND:
  - Filters out agent sessions with matching `worktreeId` (line 165)
  - Filters out terminal sessions with matching `worktreeId` (line 166)
  - Clears `activeWorktreeId` if removing active worktree (line 167)

**Lines 125-147**: `removeWorkspace(workspaceId)` cascades:
  - Gets all worktrees for workspace (lines 128-130)
  - Removes all worktrees, agent sessions, terminal sessions (lines 134-140)
  - Clears `activeWorktreeId` if needed (lines 141-145)

## Reconnect Behavior

**File**: `apps/web/src/lib/ws.ts`

**Lines 82-98**: On WebSocket reconnect:
1. Clear reconnect attempts (line 84)
2. Set status to "open" (line 86)
3. Flush queued messages (line 87)
4. Send `GetState` request to re-sync all workspaces/worktrees/sessions (line 98)

**Lines 297-305**: `handleStateSnapshot()` replaces entire state from server snapshot
- Overwrites workspaces, worktrees, agentSessions, terminalSessions
- No incremental state - full replace on reconnect

**State initialization**: `state.initialize_from_db()` loads all worktrees from DB on server startup

## Protocol Definitions

**File**: `crates/ws-server/src/protocol.rs`

**Lines 251-256**: `AgentSpawn` struct
  - `worktree_id: Uuid` - required
  - `agent_type: String` - required

**Lines 268-276**: `AgentSend` struct
  - `worktree_id: Uuid` - required
  - `message: String` - required

**Lines 271-276**: `AgentCancel` struct
  - `worktree_id: Uuid` - required

## Test Files Covering Lifecycle

### Rust Tests
- `crates/ws-server/src/worktree/mod.rs` (lines 334-660)
  - `test_create_worktree()` - worktree creation and disk verification
  - `test_delete_worktree()` - worktree deletion and cleanup verification
  - `test_delete_worktree_removes_git_metadata()` - git metadata cleanup

- `crates/ws-server/src/workspace/mod.rs` (lines 267-373)
  - `test_delete_workspace()` - workspace deletion cascades to worktrees

- `crates/ws-server/src/db/mod.rs` (lines 976-1054)
  - `test_agent_session_crud()` - agent session CRUD operations
  - `test_worktree_crud()` - worktree lifecycle

- `crates/ws-server/src/state.rs` (lines 216-236)
  - `test_app_state_creation()` - initial state verification
  - `test_client_inactivity_timeout()` - timeout constants

### Web Tests
- `apps/web/src/components/agent/__tests__/AgentPane.test.tsx` - agent tab lifecycle
- `apps/web/src/lib/__tests__/ws.test.ts` - WebSocket client behavior
- `apps/web/src/types/__tests__/protocol.test.ts` - protocol type validation

## Key Findings

1. **CWD Source**: The worktree CWD is determined by `worktree.path` from in-memory `WorktreeState`, not by UI selection
2. **One Agent Per Worktree**: `state.agent_clients` uses `worktree_id` as key, enforcing single agent per worktree
3. **Cascade Deletion**: Database FK with `ON DELETE CASCADE` ensures agent sessions are removed when worktree is deleted
4. **Reconnect Replace**: Web client does full state replace on reconnect, not incremental merge
5. **No Stale Session Cleanup on Worktree Switch**: Cancel explicitly needed - no automatic cleanup on worktree switch
6. **Process Kill**: Cancel handler kills subprocess via `process.kill()` (acp.rs line 310)

## Open Issues

- No automatic agent cancellation when switching between worktrees
- No cleanup of orphaned agent processes if server crashes (processes survive parent death)
- No session timeout mechanism for abandoned agent sessions

## WS-ACP Wire Contract Implementation (2026-03-19)

### Types Defined (in `crates/ws-server/src/protocol.rs` and `apps/web/src/types/generated/protocol.ts`)

**Core Types:**
- `AcpSequence` (u64) - monotonically increasing sequence number
- `AcpCorrelationId(String)` - newtype for request-response correlation
- `AcpEventEnvelope` - wrapper with sequence, correlation_id, timestamp, and event

**Event Types (8 variants):**
- `SessionInit` - session initialization with capabilities
- `SessionStatus` - working/waiting/complete/cancelled status
- `PromptChunk` - streaming text/structured content chunks
- `PromptComplete` - prompt completion with reason
- `ToolUse` - tool execution events (started/in_progress/completed/error)
- `ContextUpdate` - file read/written, command executed, browser action, memory update
- `Error` - structured errors with code, message, recoverable flag
- `ResumeMarker` - checkpoint for resumability

**Request/Response Types:**
- `AcpResumeRequest` - request replay from sequence number
- `AcpAck` - acknowledgment with last processed sequence

### Key Implementation Details

1. **MessagePack Compatibility:** Cannot use `skip_serializing_if = "Option::is_none"` with MessagePack arrays because they are positional. Must use `#[serde(default)]` only.

2. **Tuple Structs:** Cannot use `#[serde(rename_all = "...")]` on tuple structs like `AcpCorrelationId(pub String)` - they have no named fields to rename.

3. **ts-rs Warnings:** ts-rs emits warnings about `skip_serializing_if` but these are informational - the attribute is ignored by ts-rs but handled by serde.

4. **Discriminated Unions:** TypeScript uses `{ eventType: 'SessionInit'; data: AcpSessionInit }` pattern matching Rust's `#[serde(tag = "eventType", content = "data")]`.

5. **Negative Tests Added:** TypeScript tests verify that assistant-ui-specific payload shapes are NOT accepted by the wire contract:
   - `AcpPromptChunk.content` must use `{ type: 'Text', data: string }`, not assistant-ui message parts
   - `AcpSessionStatusEvent` must NOT have `messages` or `isLoading` fields
   - `AcpToolUseEvent` must NOT have assistant-ui `toolCallId` or `args` fields
   - `AcpContextUpdate` must NOT have `threadId`, `isRunning`, or `abortController`
   - `AcpError` must NOT have `stack` or `cause` fields

### Test Coverage

- Rust: 136 protocol tests pass (includes 14 new WS-ACP roundtrip tests)
- TypeScript: 60 protocol tests pass (includes 25 new WS-ACP contract tests)

### Files Modified

- `crates/ws-server/src/protocol.rs` - WS-ACP types and tests
- `apps/web/src/types/generated/protocol.ts` - TypeScript types and type guards
- `apps/web/src/types/__tests__/protocol.test.ts` - WS-ACP contract tests including negative tests

## Task 5: Worktree-CWD Launch and Lifecycle Rules (2026-03-19)

### Lifecycle Functions Added

**File:** `crates/ws-server/src/agent/handler.rs`
- `get_worktree_path(state, worktree_id)` - returns CWD from `WorktreeState.path` (source of truth)
- `cleanup_agents_for_worktree(state, worktree_id)` - kills process, removes from memory, broadcasts removal

**File:** `crates/ws-server/src/state.rs`
- `find_agent_session_for_worktree(worktree_id)` - finds session ID for a worktree

### Lifecycle Rules Defined

1. **CWD Source:** `WorktreeState.path` from in-memory registry, not UI selection
2. **One Agent Per Worktree:** `agent_clients` keyed by `worktree_id`
3. **Cancel Flow:** Kill process → Remove from agent_clients → Remove from agents → Delete from DB → Broadcast
4. **Worktree Deletion:** Call `cleanup_agents_for_worktree()` before DB delete (FK cascade handles DB)
5. **Worktree Switch:** No automatic cancellation - agent continues in original CWD
6. **Reconnect:** Full state replace via `GetState` request
7. **Stale Sessions:** No automatic timeout - persist until cancelled or worktree deleted

### Gotchas

- `broadcast()` method already exists in `hub.rs` as an impl block for AppState - don't duplicate
- `AgentSpawn` and `AgentCancel` protocol structs don't have `request_id` field
- LSP errors from `#[instrument]` macro are false positives - compile succeeds

### Test Coverage

- `test_get_worktree_path_returns_path_from_state` - verifies CWD source
- `test_get_worktree_path_returns_none_for_missing_worktree` - missing worktree handling
- `test_cleanup_agents_for_worktree_removes_sessions` - cleanup removes from memory
- `test_cleanup_agents_for_worktree_noops_for_missing_worktree` - idempotent cleanup
- `test_cleanup_agents_for_worktree_preserves_other_worktree_sessions` - isolation
- `test_find_agent_session_for_worktree` - state helper works
- `test_spawn_fails_for_missing_worktree` - spawn validation

## Task 2: ACP Event Accumulator Contract (2026-03-19)

### Accumulator Architecture

**Core Principle:** The accumulator is DERIVED, connection-scoped state. It is NOT the source of truth for:
- Worktree identity (use `AppState.worktrees`)
- Session identity (use `AppState.agentSessions`)
- Connection state (use `AppState.connectionStatus`)

### Rebuild Rules

1. **On WebSocket reconnect:** Accumulator is FLUSHED via `CONNECTION_RECONNECTED` action
2. **StateSnapshot triggers flush:** `stateFromSnapshot` dispatches `CONNECTION_RECONNECTED` to reset accumulator
3. **ResumeMarker events:** Enable partial replay from checkpoint via `lastSequence` and `resumeCheckpoint`

### Retention Bounds

- `MAX_TOOL_OUTPUT_LENGTH = 10000` - Tool outputs truncated to prevent memory bloat
- `MAX_ACCUMULATED_MESSAGES = 500` - Message count bounded per thread

### Content Types Defined

- `AccumulatedTextContent` - Streaming text with `isStreaming` flag
- `AccumulatedToolCard` - Tool execution status (Started/InProgress/Completed/Error)
- `AccumulatedContextCard` - File read/written, command executed, browser action, memory update
- `AccumulatedPermissionCard` - Permission requests awaiting approval
- `AccumulatedErrorCard` - Structured errors with recoverable flag

### Reducer Actions

- `EVENT_RECEIVED` - Process ACP event, update thread state
- `CONNECTION_RECONNECTED` - Increment generation, flush all threads
- `FLUSH_ALL` - Clear all threads without incrementing generation
- `FLUSH_THREAD` - Remove specific thread
- `REBUILD_FROM_SNAPSHOT` - Create empty thread for worktree
- `SET_STREAMING` - Update streaming state for thread

### Files Modified

- `apps/web/src/types/state.ts` - Accumulator types and factory function
- `apps/web/src/store.ts` - Reducer implementation, store integration, selectors
- `apps/web/src/hooks/__tests__/useAgentStatus.test.ts` - 16 new reducer tests

### Test Coverage

- Connection generation increment on reconnect
- Thread flush on reconnect and explicit flush
- Text chunk accumulation and streaming state
- Tool card creation and updates with output truncation
- Error card creation
- Resume marker checkpoint storage
- Session status updates
- Message limit enforcement

### Gotchas Fixed (2026-03-19)

1. **WebSocket Message Encoding**: Tests must encode messages with `{ version, type, data: {...} }` wrapper format because `decodeMessage` in `ws.ts` expects this structure and flattens it to `{ type, ...data }`. Raw `{ type, ...fields }` encoding fails silently.

2. **Protocol Types Must Match**: Test message shapes must exactly match protocol types. `AgentStatusUpdate` requires `id`, `worktreeId`, `agentType`, `status`, `startedAt` - not `sessionId` or `message`. `AgentOutput` requires `worktreeId` not `sessionId`.

3. **Optional Fields**: `AgentStatusInfo.taskSummary` is optional (`taskSummary?: string`) and never returned by the hook. Tests should not assert on it.

4. **Unused Imports Cleanup**: TypeScript's `noUnusedLocals` reports unused imports. Remove `AcpChunkContent`, `AcpEvent`, `AcpEventEnvelope`, `AccumulatedMessage`, `AccumulatedContentPart` when not referenced in code.

5. **Deprecated API**: `String.prototype.substr()` is deprecated. Use `slice()` instead.

6. **Import Source for Types**: `AcpEventEnvelope` is defined in `types/generated/protocol.ts`, not in `types/state.ts`. When a type is not exported from a module, TypeScript reports "declares locally, but it is not exported". Check the actual source file for exported types.
- `test_cancel_fails_for_missing_session` - cancel validation

## Task 8: WS-ACP TypeScript Adapter (2026-03-20)

### Implementation Approach

1. **Bridge Type Pattern**: Created `AcpWireEvent` interface to wrap `AcpEventEnvelope` in the standard ServerMessage format with a `type: 'AcpWireEvent'` discriminator. This preserves the existing message protocol while cleanly integrating WS-ACP events.

2. **Stateless Adapter Design**: `decodeAcpEnvelope()` is a pure function that validates and returns typed envelopes. No state accumulation, no store ownership, no UI-specific logic. All accumulation happens in Task 9's reducer.

3. **Malformed Payload Safety**: Adapter validates all required fields (sequence, timestamp, eventType, data) before returning envelope. Invalid payloads return `null` with console.error logging. Optional `correlationId` validated only if present.

### Test Coverage

Added 18 new tests across 4 categories:
- **Decode tests**: Valid envelope decoding for SessionStatus, SessionInit, PromptChunk event types
- **Malformed payload handling**: 9 tests covering missing fields, invalid types, null/undefined values
- **Event ordering**: Sequence preservation, correlationId handling, monotonic sequence numbers
- **Event type discrimination**: All 8 WS-ACP event types tested (SessionInit, SessionStatus, PromptChunk, PromptComplete, ToolUse, ContextUpdate, Error, ResumeMarker)

### Files Modified

- `apps/web/src/types/generated/protocol.ts`:
  - Added `AcpWireEvent` interface (lines 599-603)
  - Added to ServerMessage union (line 688)
  - Added `isAcpWireEvent` type guard (lines 923-925)
  - Updated `decodeMessage` validTypes array (line 980)

- `apps/web/src/lib/ws.ts`:
  - Added `AcpEventEnvelope` import (line 2)
  - Added `decodeAcpEnvelope()` private method (lines 278-323)
  - Integrated ACP envelope handling in `handleMessage()` (lines 297-302)

- `apps/web/src/lib/__tests__/ws.test.ts`:
  - Added comprehensive test suite for WS-ACP adapter (lines 518-827)
  - 45 total tests passing (existing 44 + new 18 - adjusted for 1 refactoring)

### Gotchas

1. **Message Protocol Consistency**: All ServerMessage types must have a `type` field for the decoder to recognize them. `AcpWireEvent` wraps the envelope to follow this pattern, even though the envelope has its own `eventType` field.

2. **Handler vs Adapter**: The adapter does NOT register message handlers for `AcpWireEvent`. It decodes envelopes in `handleMessage()` and calls `updateStateFromServerMessage()` for downstream processing. Tests should verify decoding behavior, not handler registration.

3. **Test Message Encoding**: Tests must encode messages with `{ version, type, data: {...} }` wrapper format because `decodeMessage` in `ws.ts` expects this structure and flattens it. This is the same gotcha as in Task 2.

4. **Private Method Access**: Tests access private `decodeAcpEnvelope` method via `(client as any).decodeAcpEnvelope()`. This is intentional for testing pure function behavior without public exposure.

5. **Console Error Logging**: Adapter logs errors for malformed payloads but does not throw. This fails-safe behavior allows the WebSocket connection to remain open even when receiving invalid ACP envelopes.

## Task 6: Rust ACP Bridge and ACP-WS Adapter (2026-03-19)

### Official ACP Rust SDK API Discoveries

1. **`Client` trait uses non-Send futures**: The `Client` trait methods return `impl Future<Output = Result<...>>` without `Send` bound. Using `#[async_trait]` adds `Send` by default, causing trait mismatch. Use `#[async_trait(?Send)]` or implement trait directly without the macro.

2. **`Error` struct is `#[non_exhaustive]`**: Must use builder methods:
   - `Error::method_not_found()` - creates error with appropriate code
   - `Error::new(code, message).data(value)` - for custom errors
   - Field is `data: Option<serde_json::Value>`, NOT `meta`

3. **`SessionNotification` has singular `update` field**: NOT `updates`. The field is `pub update: SessionUpdate`.

4. **`SessionUpdate` enum variants** (different from what was assumed):
   - `UserMessageChunk(ContentChunk)` - user message streaming
   - `AgentMessageChunk(ContentChunk)` - agent response streaming
   - `AgentThoughtChunk(ContentChunk)` - agent reasoning streaming
   - `ToolCall(ToolCall)` - new tool call initiated
   - `ToolCallUpdate(ToolCallUpdate)` - tool call progress
   - `Plan(Plan)` - execution plan (NOT wrapped in Option)
   - `AvailableCommandsUpdate`, `CurrentModeUpdate`, `ConfigOptionUpdate`, `SessionInfoUpdate`
   - No `ContentChunk` or `Prompt` variants exist

5. **`ContentChunk` struct** (not enum): Has `content: ContentBlock` field.

6. **`ToolCall` fields**:
   - `tool_call_id: ToolCallId` (not `id`)
   - `title: String` (human-readable, not `name`)
   - `kind: ToolKind`
   - `status: ToolCallStatus`
   - `content: Vec<ToolCallContent>`
   - `raw_input: Option<serde_json::Value>` (not `input`)
   - `raw_output: Option<serde_json::Value>` (not `output`)
   - No `error` field

7. **`ToolCallStatus` variants**: `Pending`, `InProgress`, `Completed`, `Failed` (NOT `Error`)

8. **`ToolCallUpdate` struct**: Has `tool_call_id` and `fields: ToolCallUpdateFields`. Access nested fields via `update.fields.status`, `update.fields.title`, etc.

9. **`StopReason` variants**: `EndTurn`, `MaxTokens`, `MaxTurnRequests`, `Refusal`, `Cancelled` (NO `Error` variant)

10. **`PermissionOptionKind` variants**: `AllowOnce`, `AllowAlways`, `RejectOnce`, `RejectAlways` (NOT `Allow`)

11. **`RequestPermissionOutcome` variants**: `Cancelled`, `Selected(SelectedPermissionOutcome)` (NOT `SelectedPermissionOption`)

12. **`SelectedPermissionOutcome`**: `#[non_exhaustive]`, use `SelectedPermissionOutcome::new(option_id)` builder.

13. **`RequestPermissionResponse`**: `#[non_exhaustive]`, use `RequestPermissionResponse::new(outcome)`. Only has `outcome` and `meta` fields (NO `session_id`).

14. **`SessionId.0` is `Arc<str>`**: Use `.to_string()` to convert to `String`.

15. **All enums are `#[non_exhaustive]`**: `SessionUpdate`, `ContentBlock`, `ToolCallStatus`, `StopReason`, `PermissionOptionKind`, etc. Always add wildcard `_` arm in match expressions.

### Adapter Implementation

**File:** `crates/ws-server/src/agent/adapter.rs`

**Core Components:**
- `SequenceCounter` - atomic u64 for event ordering
- `AcpEventSender` trait - abstraction for event forwarding
- `YmirClientHandler` - implements `Client` trait for ACP SDK
- `create_client_capabilities()` - builds `ClientCapabilities` with builder pattern
- `create_implementation()` - builds `Implementation` with builder pattern

**Event Translation:**
- `AgentMessageChunk`/`UserMessageChunk`/`AgentThoughtChunk` -> `AcpEvent::PromptChunk`
- `ToolCall`/`ToolCallUpdate` -> `AcpEvent::ToolUse`
- `Plan` -> `AcpEvent::ContextUpdate` with `MemoryUpdate` type

**Permission Handling:**
- Looks for `AllowOnce` or `AllowAlways` options
- Falls back to `Cancelled` if no allow option found

### Dependencies Added

- `agent-client-protocol = "0.10"` - official ACP Rust SDK
- `async-trait` - for trait implementation (with `?Send` modifier)

### Gotchas

1. **No `Prompt` variant in `SessionUpdate`**: The ACP SDK doesn't have a separate prompt completion event. Completion is inferred from `StopReason` in message chunks.

2. **`ContentBlock` has no `EmbeddedContext` variant**: Only `Text`, `Image`, `Resource`, `Audio` variants exist.

3. **Tool outputs are in `raw_input`/`raw_output`**: NOT `input`/`output` fields.

4. **`#[async_trait(?Send)]` syntax**: Required because `Client` trait futures don't require `Send`. Standard `#[async_trait]` adds `Send` bound.

5. **Builder pattern for non-exhaustive types**: All `#[non_exhaustive]` structs require builder methods (`::new()`, `.field()`) instead of struct literal syntax.

### Test Coverage

- `test_sequence_counter` - monotonic sequence generation
- `test_create_client_capabilities` - capability builder
- `test_create_implementation` - implementation info builder

### AcpClient Integration (2026-03-19)

**File:** `crates/ws-server/src/agent/acp.rs`

**Key Changes:**
- Replaced custom JSON-RPC implementation with official SDK's `ClientSideConnection`
- Uses `tokio_util::compat` to bridge tokio streams (`ChildStdin`/`ChildStdout`) to `futures_io` traits
- Stores `ClientSideConnection` directly (no generic parameter on struct)
- Uses `Agent` trait methods: `initialize`, `new_session`, `prompt`, `cancel`

**Spawn Pattern:**
```rust
let outgoing = stdin.compat_write();  // AsyncWrite
let incoming = stdout.compat();        // AsyncRead

let (connection, io_future) = ClientSideConnection::new(
    handler,
    outgoing,
    incoming,
    |fut| { tokio::task::spawn_local(fut); },  // spawn fn returns ()
);
```

**Critical: `?Send` Futures Issue:**

The ACP SDK uses `#[async_trait::async_trait(?Send)]` for its traits, meaning all futures are `!Send`. This causes:

1. `ClientSideConnection` is `!Send`
2. `AcpClient` containing `ClientSideConnection` is `!Send`
3. Cannot store in `Arc<Mutex<AcpClient>>` and use from `Send` contexts
4. Must use `tokio::task::LocalSet` for all ACP operations

**Workaround for Handler:**
```rust
tokio::task::spawn_blocking(move || {
    let rt = tokio::runtime::Runtime::new().unwrap();
    let local = tokio::task::LocalSet::new();
    local.block_on(&rt, async move {
        // ACP operations here
    });
});
```

**Outstanding Issue:**
- `main.rs` WebSocket handler requires `Send` futures for `on_upgrade`
- Current architecture stores `AcpClient` in `AppState.agent_clients`
- This makes the entire WebSocket handler `!Send`, breaking compilation
- Solution needed: separate thread-local ACP runtime or message-passing architecture

### Test Results

- Lib tests: 13 passed (adapter + acp + handler)
- Binary (main.rs): fails to compile due to `Send` bound on `WebSocketUpgrade::on_upgrade`

### Dependencies Updated

- `tokio-util = { version = "0.7", features = ["compat"] }` - stream compatibility layer
- `async-trait = "0.1"` - for `#[async_trait::async_trait(?Send)]` attribute

6. **Handler Dispatch Pattern for ACP Events (2026-03-20 fix)**: ACP envelopes require special handler dispatch because the decoded `AcpEventEnvelope` must reach handlers, not the wire wrapper. For `AcpWireEvent` messages, the adapter now decodes the envelope and dispatches it directly to registered handlers, then returns early to skip standard handler dispatch. This ensures Task 9's accumulator receives the actual ACP event object, not the `AcpWireEvent` wire wrapper. The `as any` cast is necessary because the handler signature expects `ServerMessage` but we dispatch `AcpEventEnvelope`.

## Message-Passing Architecture for !Send Types (2026-03-20)

### Problem

The ACP SDK uses `#[async_trait::async_trait(?Send)]` for its `Client` trait, making:
- `ClientSideConnection` - `!Send`
- `AcpClient` (containing `ClientSideConnection`) - `!Send`

But `axum::extract::ws::WebSocketUpgrade::on_upgrade` requires `Future + Send + 'static`.

Storing `AcpClient` in `AppState.agent_clients` made the entire WebSocket handler `!Send`, breaking compilation.

### Solution: Message-Passing Boundary

**Pattern:** Isolate `!Send` ACP code in a dedicated thread with `LocalSet`, communicate via channels.

**Components:**

1. **`AcpCommand` enum** - Request types for the ACP runtime:
   ```rust
   enum AcpCommand {
       Spawn { worktree_id, agent_type, worktree_path, respond: oneshot::Sender<Result<()>> },
       SendPrompt { worktree_id, content, respond },
       Cancel { worktree_id, respond },
       Kill { worktree_id, respond },
       Status { worktree_id, respond: oneshot::Sender<AgentStatus> },
   }
   ```

2. **`AcpHandle` struct** - `Send`-safe handle to the ACP runtime:
   ```rust
   #[derive(Clone)]
   pub struct AcpHandle {
       tx: mpsc::UnboundedSender<AcpCommand>,
   }
   ```

3. **`start_acp_runtime()` function** - Spawns the blocking thread:
   ```rust
   pub fn start_acp_runtime() -> (AcpHandle, JoinHandle<()>) {
       let (tx, rx) = mpsc::unbounded_channel::<AcpCommand>();
       let handle = AcpHandle::new(tx);

       let join_handle = tokio::task::spawn_blocking(move || {
           let rt = tokio::runtime::Builder::new_current_thread()
               .enable_all()
               .build()
               .expect("Failed to create ACP runtime");

           let local = tokio::task::LocalSet::new();
           local.block_on(&rt, async move {
               let mut clients: HashMap<Uuid, AcpClient> = HashMap::new();
               while let Some(cmd) = rx.recv().await {
                   // Handle commands...
               }
           });
       });

       (handle, join_handle)
   }
   ```

4. **`AppState` change** - Replace `agent_clients: HashMap<Uuid, Arc<Mutex<AcpClient>>>` with `acp_handle: Option<AcpHandle>`

### Key Design Decisions

1. **Unbounded channel**: ACP operations are relatively low-frequency (spawn, prompt, cancel). No backpressure needed.

2. **`oneshot` for responses**: Each command carries a `oneshot::Sender` for the response, enabling async/await semantics from the caller's perspective.

3. **`spawn_blocking`**: Required because `LocalSet` needs a blocking context. The `current_thread` runtime + `LocalSet` combo handles `!Send` futures.

4. **`AcpClient` remains private**: Internal to the ACP runtime. External code only sees `AcpHandle`.

### Files Modified

- `crates/ws-server/src/agent/acp.rs` - Complete rewrite with message-passing
- `crates/ws-server/src/agent/mod.rs` - Export `AcpHandle`, `start_acp_runtime` instead of `AcpClient`
- `crates/ws-server/src/agent/handler.rs` - Use `AcpHandle` methods instead of direct client access
- `crates/ws-server/src/state.rs` - Replace `agent_clients` with `acp_handle: Option<AcpHandle>`

### Test Coverage

All 14 agent tests pass:
- `test_acp_handshake` - capability/implementation builders
- `test_acp_status_transitions` - status enum variants
- `test_acp_handle_send` - message-passing roundtrip
- Handler tests updated to remove `agent_clients` assertions

### Gotchas

1. **`tokio_util::compat` required**: ACP SDK uses `futures_io` traits, tokio processes use `tokio::io` traits. Use `stdin.compat_write()` and `stdout.compat()` to bridge.

2. **Private `AcpClient::new`**: Changed to `fn new()` (not `pub`) since it's only used internally by `start_acp_runtime`.

3. **Test assertions removed**: Tests that checked `state.agent_clients` were updated to only check `state.agents` since `agent_clients` no longer exists in AppState.

## Task 9: ACP Event Accumulator Implementation (2026-03-20)

### Implementation Summary

The accumulator is a connection-scoped, derived state that transforms ACP events into assistant-ui-compatible thread/message/card state. It is NOT the source of truth for worktree/session identity.

### Key Components

**File:** `apps/web/src/store.ts`
- `acpAccumulatorReducer()` - pure reducer function handling all ACP event types
- `AcpWireEvent` case in `updateStateFromServerMessage()` - dispatches envelopes to accumulator

**File:** `apps/web/src/types/state.ts`
- `AccumulatedTextContent` - streaming text chunks
- `AccumulatedStructuredContent` - JSON/code block chunks
- `AccumulatedToolCard` - tool execution status
- `AccumulatedContextCard` - file read/written, command executed, browser action, memory update
- `AccumulatedPermissionCard` - permission requests (type defined, not yet used)
- `AccumulatedErrorCard` - structured errors with recoverable flag

### Event Routing

ACP events are routed to threads by worktreeId:
- Most events have `worktreeId` in their data
- `SessionInit` events fall back to `activeWorktreeId` since they don't have worktree context

### Retention Bounds

- `MAX_TOOL_OUTPUT_LENGTH = 10000` - tool outputs truncated
- `MAX_ACCUMULATED_MESSAGES = 500` - message count bounded per thread

### Test Coverage (60 tests)

- CONNECTION_RECONNECTED: generation increment, thread flush
- FLUSH_ALL, FLUSH_THREAD, REBUILD_FROM_SNAPSHOT, SET_STREAMING
- All 8 ACP event types: SessionInit, SessionStatus, PromptChunk, PromptComplete, ToolUse, ContextUpdate, Error, ResumeMarker
- All ContextUpdate updateType variations: FileRead, FileWritten, CommandExecuted, BrowserAction, MemoryUpdate
- All PromptComplete reason variations: Normal, Cancelled, Error
- All ToolUse status variations: Started, InProgress, Completed, Error
- All AcpErrorCode values: AgentCrash, InitFailed, SessionNotFound, PromptFailed, ToolFailed, CancelFailed, Timeout, InvalidRequest, Internal
- Structured content chunks
- Message limit enforcement
- Reconnect rebuild behavior

### Gotchas

1. **AcpWireEvent routing**: The `AcpWireEvent` message must be handled in `updateStateFromServerMessage()` to dispatch envelopes to the accumulator. Without this, ACP events from the WS-ACP adapter (Task 8) won't reach the accumulator.

2. **SessionInit fallback**: SessionInit events don't have worktreeId, so they must fall back to `activeWorktreeId` for routing.

3. **Structured content**: AcpChunkContent can be `{ type: 'Text', data: string }` or `{ type: 'Structured', data: string }`. Both must be handled separately - Text accumulates in existing text parts, Structured creates new parts.

4. **No explicit permission events**: ACP contract doesn't have dedicated permission events. Permissions flow through ToolUse events with specific tool names. `AccumulatedPermissionCard` type is reserved for future use.

5. **Unused import cleanup**: TypeScript's `noUnusedLocals` reports unused imports. Remove types that aren't used in value positions.

## Task 7: Rust Handler, Router, and Persistence Integration (2026-03-19)

### Implementation Summary

Integrated the Task 6 `AcpHandle`/official ACP bridge into the active handler and router flow, with selected-worktree CWD launch semantics.

### Files Modified

- `crates/ws-server/src/protocol.rs` - Added `AcpWireEvent(AcpEventEnvelope)` variant to `ServerMessagePayload`
- `crates/ws-server/src/agent/acp.rs` - Created `BroadcastingEventSender`, updated `start_acp_runtime()` to accept broadcast sender
- `crates/ws-server/src/state.rs` - Updated `with_acp()` to pass broadcast sender to ACP runtime
- `crates/ws-server/src/main.rs` - Changed from `with_pty_manager` to `with_acp` for full ACP integration
- `crates/ws-server/src/agent/handler.rs` - Added integration tests

### Key Components

**BroadcastingEventSender:**
- Implements `AcpEventSender` trait
- Wraps `broadcast::Sender<ServerMessage>`
- Converts `AcpEventEnvelope` to `ServerMessagePayload::AcpWireEvent` for broadcast to all WebSocket clients

**Integration Flow:**
1. `AppState::with_acp()` creates state with broadcast channel
2. `start_acp_runtime(broadcast_tx)` spawns ACP runtime with broadcast capability
3. `BroadcastingEventSender` sends ACP events to all connected clients
4. Handler spawn/send/cancel flows operate through `AcpHandle` message-passing

### Test Coverage (18 agent tests)

- `test_acp_handle_initialized_in_test_state` - verifies ACP handle setup
- `test_cleanup_broadcasts_agent_removed` - verifies cleanup sends broadcast
- `test_spawn_requires_worktree_in_database` - verifies FK constraint handling
- `test_broadcasting_event_sender_sends_message` - verifies event broadcasting
- All existing handler and ACP tests pass

### Gotchas

1. **`broadcast()` sends to clients, not broadcast_tx**: The `AppState.broadcast()` method iterates over `self.clients` (connected WebSocket clients) and sends via mpsc channels. Tests must connect a client with `state.connect(client_id)` to receive broadcasts.

2. **FK constraint requires DB setup**: Tests that create agent sessions must first create the workspace and worktree in the database (not just in-memory state) because `agent_sessions` has FK constraints.

3. **`AcpWireEvent` wrapper needed**: TypeScript defines `AcpWireEvent` as a wrapper type with `type: 'AcpWireEvent'` and `data: AcpEventEnvelope`. Rust needed the matching `ServerMessagePayload::AcpWireEvent(AcpEventEnvelope)` variant for wire compatibility.

4. **Broadcast sender cloning**: The broadcast sender is cloned for each agent spawn, allowing the ACP runtime to send events even after the original sender is moved.

## Task 10: Adapter-Chain Spike and Abort Checkpoint (2026-03-19)

### Decision: CONTINUE to assistant-ui Integration

### Abort Condition Evaluation

**Condition 1**: "if the accumulator + `assistant-ui` integration requires bypassing most of `assistant-ui`"
- **Status**: PARTIAL CONCERN - CONTINUE
- assistant-ui adds value for: message rendering, markdown, code highlighting, streaming animation
- We bypass: backend runtimes, session management, worktree/tab concepts
- **Conclusion**: Rendering value justifies integration

**Condition 2**: "If the stateless wire contract cannot remain assistant-ui-agnostic"
- **Status**: PASSED
- Protocol tests reject assistant-ui-specific fields
- Wire contract is stateless and clean

**Condition 3**: "If worktree/session semantics cannot be preserved without duplicating canonical state"
- **Status**: PASSED
- Accumulator uses `worktreeId` as reference
- Canonical state remains in `AppState.worktrees`, `AppState.agentSessions`
- No state duplication

### Test Results

- Rust: 261 tests passed (including 18 agent tests, 136 protocol tests)
- Accumulator: 60 tests passed
- WS Adapter: 45 tests passed
- Protocol: 60 tests passed

### Chain Architecture Verified

```
Agent Process → ACP SDK → YmirClientHandler → BroadcastingEventSender
                                         ↓
                              ServerMessagePayload::AcpWireEvent
                                         ↓
                                    WebSocket
                                         ↓
                              YmirClient.decodeAcpEnvelope()
                                         ↓
                              acpAccumulatorReducer()
                                         ↓
                              AccumulatedThread (messages, parts)
                                         ↓
                              ExternalStoreRuntime (Task 11)
                                         ↓
                                   assistant-ui
```

### Key Findings

1. **No state duplication**: Accumulator is DERIVED, connection-scoped state
2. **Wire contract is clean**: Stateless, assistant-ui-agnostic
3. **assistant-ui value is real**: Rendering primitives save implementation time
4. **Architecture is sound**: Clear separation of concerns across layers

### Next Steps

- Task 11: Wire `assistant-ui` through `ExternalStoreRuntime`
- Task 12: Build compact custom event cards
- Tasks 13-15: Integration and cleanup

## Task 3: Assistant-UI Runtime Boundary (2026-03-20)

### Implementation Summary

Created \`apps/web/src/components/agent/runtimeBoundary.ts\` - a comprehensive module defining the RENDER-ONLY boundary between Ymir'"'" 's host-owned state and \`assistant-ui\`'"'"s \`ExternalStoreRuntime\`.

### Key Architecture Decisions

1. **RENDER-ONLY Boundary**: Assistant-ui receives READ-ONLY snapshots from accumulator. All mutations flow through: Ymir store → accumulator → runtime boundary → ExternalStoreRuntime. Assistant-ui NEVER owns worktree, tab, or session identity.

2. **Worktree ID as Thread ID**: Runtime uses \`worktreeId\` as the thread identifier, NOT \`sessionId\` or \`acpSessionId\`. This keeps session truth in Ymir'"'" 's store.

3. **First-Cut Disabled Features**:
   - **Editing**: Disabled because Ymir'"'" 's accumulator is canonical state source via ACP events
   - **Approval**: Disabled because permissions are custom ACP tool use events, not assistant-ui tool approvals
   - **Branching**: Disabled because conversation management is simple in first cut
   - **Runtime Backends**: We use \`ExternalStoreRuntime\` only, no assistant-ui built-in backends

4. **Enabled Custom Features**:
   - Custom permission card rendering (for future Task 12)
   - Custom tool card rendering (for future Task 12)
   - Custom event card rendering (for future Task 12)

### Files Modified

1. **\`apps/web/src/components/agent/runtimeBoundary.ts\`** (342 lines):
   - Complete runtime boundary module with types and mapping helpers
   - Feature flags object \`FIRST_CUT_FEATURES\` documenting disabled/enabled features
   - Mapping functions: \`createRuntimeInput()\`, \`mapContentPart()\`, \`mapMessage()\`, \`mapStatus()\`
   - Selector helpers: \`getThreadMessages()\`, \`isThreadStreaming()\`, \`getThreadStatus()\`
   - Validation helper: \`isValidRuntimeInput()\`

2. **\`apps/web/src/components/agent/__tests__/AgentChat.test.tsx\`**:
   - Added imports for runtime boundary types
   - Added 42 new tests across 8 test suites covering all boundary functions

### Test Coverage

**Total**: 42 new tests added, all passing
**Runtime Boundary Tests**: All 42 tests pass successfully
**Note**: 2 pre-existing AgentChat tests failed due to DOM text matching issues (unrelated to runtime boundary work)

### Type Definitions

1. **\`ExternalStoreRuntimeInput\`**: Main contract type defining the interface between accumulator and assistant-ui
2. **\`RuntimeThreadState\`**: Thread state compatible with assistant-ui expectations
3. **\`RuntimeMessage\`**: Message format stripped of accumulator metadata
4. **\`RuntimeContentPart\`**: Simplified content types for rendering

### Mapping Helpers

1. **\`createRuntimeInput(accumulated, onSubmit?, onCancel?)\`**: Main entry point
2. **\`isValidRuntimeInput(input)\`**: Validation helper
3. **Content Mapping Functions**: \`mapContentPart()\`, \`mapMessage()\`, \`mapStatus()\`
4. **Selector Helpers**: \`getThreadMessages()\`, \`isThreadStreaming()\`, \`getThreadStatus()\`

### Key Design Principles

1. **No Assistant-UI State Ownership**: Assistant-ui receives immutable snapshots
2. **Explicit Feature Guardrails**: \`FIRST_CUT_FEATURES\` constant makes disabled features explicit
3. **Type Safety**: TypeScript interfaces define clear contracts between accumulator and runtime
4. **Testability**: All helpers are pure functions with clear inputs/outputs

### Gotchas

1. **Thread ID Source**: Must use \`worktreeId\`, not \`sessionId\` or \`acpSessionId\`
2. **Metadata Stripping**: Assistant-ui must not receive accumulator-specific metadata
3. **Feature Locking**: Tests verify that editing/approval/branching remain disabled
4. **Null Safety**: \`createRuntimeInput()\` returns null for null accumulator

### Integration Points

1. **From Accumulator**: Runtime boundary consumes \`AccumulatedThread\` from Task 9'"'" 's \`acpAccumulator\` state
2. **To Assistant-UI**: Boundary exports \`ExternalStoreRuntimeInput\` type for \`ExternalStoreRuntime\` (Task 11)
3. **From Store**: Runtime boundary doesn'"'" 't own state - it'"'" 's a pure transformation layer

- Tasks 13-15: Integration and cleanup

## Task 4: Card Schema Definition (2026-03-20)

### Implementation Summary

Created `apps/web/src/components/agent/card-schema.ts` with compact custom card schemas for:
- Permission cards (tool approval prompts with safe action dispatch)
- Tool cards (execution status and output)
- Plan cards (execution progress from MemoryUpdate events)
- Status cards (session state transitions and errors)

### Schema Design Principles

1. **Explicit required fields**: Each card schema defines required fields for rendering safety
2. **Safe action dispatch**: Permission cards include replay-safe action objects (allow/deny/always variants)
3. **Compact representation**: Minimized payload size with truncation helpers
4. **Fallback behavior**: Unknown card types safely degrade to UnknownCardSchema
5. **Type guards**: Runtime type guards for all card variants

### Key Implementation Details

**PermissionCardSchema**:
- Includes `actions` object with 4 predefined action types
- Actions are replay-safe (no arbitrary function execution)
- Input summaries truncated to 200 chars for display safety
- Human-readable reasons generated from tool names

**ToolCardSchema**:
- Maps AcpToolUseStatus enum values
- Output truncated to 500 chars for display safety
- Optional fields for input/output/error

**PlanCardSchema**:
- Derived from MemoryUpdate context updates with JSON data
- Validates plan data structure before mapping
- Handles missing optional fields gracefully

**StatusCardSchema**:
- Two creation functions: from error card OR from session status string
- Severity mapping: recoverable=warning, non-recoverable=error
- Session status mapping: Working/Waiting=info, Complete=success, Cancelled=warning, Error=error

### Validation Functions

Each card type has a corresponding validation function:
- `isValidPermissionCard()`: Validates permission card structure
- `isValidToolCard()`: Validates tool card structure
- `isValidErrorCard()`: Validates error card structure
- `isValidPlanData()`: Validates plan JSON structure (helper for plan cards)

Validation checks include:
- Required field presence
- Type checking with typeof
- String length validation
- Numeric range validation (>= 0)

### Fallback Behavior

`createCardSchema()` function handles all accumulated content parts:
- Switch statement with type discrimination
- Each case creates specific schema or returns UnknownCardSchema
- Unknown cards store original data for debugging
- Safe default sequence (0) for unknown cards

### Gotchas

1. **Switch case lexical declarations**: TypeScript requires block scoping for variable declarations in switch cases. Fixed by wrapping case bodies in `{}` blocks.

2. **Duplicate export cleanup**: During file edits, duplicate function exports were created. Careful sed cleanup required to maintain valid TypeScript syntax.

3. **Missing closing braces**: Adding exports to existing file context can accidentally remove closing braces. Always verify brace balance with tools like `awk`.

4. **Import statement ordering**: When adding new exports to existing import lists, maintain consistent alphabetical or logical ordering. Missing imports cause ReferenceError at test time.

5. **Test file separation**: Card schema tests are separate from AgentChat component tests. AgentChat tests have pre-existing failures unrelated to card schema implementation.

6. **Vite build cache**: TypeScript compilation errors may be cached. Clear `node_modules/.vite` and `node_modules/.cache` to force clean rebuilds.

7. **Comment/docstring policy**: File-level docstrings and function docstrings are necessary for public API documentation. Inline code comments should be removed for self-documenting code.

### Test Coverage

Added 72 new tests covering:
- Permission card creation and validation (6 tests)
- Tool card creation and validation (4 tests)
- Plan card creation and validation (4 tests)
- Status card creation and validation (7 tests)
- Unknown card fallback (6 tests)
- Type guard tests (5 tests)

## AgentChat Test Fix (2026-03-20)

### Issue
Two AgentChat component tests were failing: `displays agent output messages` and `displays user prompt messages`.

### Root Cause
The component's message handlers (lines 71-97 in AgentChat.tsx) filter messages by `worktreeId`: `if (msg.worktreeId === worktreeId)`. The test mocks were using `sessionId` instead of `worktreeId`, causing the filter to reject the messages.

### Fix Applied
Updated test mocks in `apps/web/src/components/agent/__tests__/AgentChat.test.tsx`:
- `mockOutput`: Changed from `{ type: 'AgentOutput', sessionId: 'session-1', output: '...' }` to `{ type: 'AgentOutput', worktreeId: 'worktree-1', output: '...' }`
- `mockPrompt`: Changed from `{ type: 'AgentPrompt', sessionId: 'session-1', prompt: '...' }` to `{ type: 'AgentPrompt', worktreeId: 'worktree-1', prompt: '...' }`
- Also updated `ignores messages from other sessions` test to use `worktreeId: 'different-worktree'` and renamed to `ignores messages from other worktrees` for clarity

### Result
All 74 AgentChat tests now pass (previously 72 passing, 2 failing).

### Files Modified
- `apps/web/src/components/agent/__tests__/AgentChat.test.tsx` - Fixed 3 tests to use correct `worktreeId` field

