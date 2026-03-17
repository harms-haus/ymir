# T20: ACP Client (Rust) - Implementation Summary

## Implementation Status: ✅ COMPLETE

## Files Created/Modified
- `crates/ws-server/src/agent/acp.rs` - Full ACP client implementation
- `crates/ws-server/src/agent/mod.rs` - Exports AcpClient and AgentStatus

## Key Components Implemented

### 1. AgentStatus Enum
- `Working { task_summary: String }` - Agent is executing a task
- `Waiting { prompt: String }` - Agent waiting for user input
- `Idle` - Agent is idle, ready for new prompts

### 2. AcpClient Struct
- `process: Child` - Agent subprocess handle
- `stdin: ChildStdin` - For sending JSON-RPC messages
- `stdout_reader: JoinHandle` - Tokio task reading stdout line-by-line
- `pending_requests: Arc<Mutex<HashMap<...>>>` - Request/response correlation
- `session_id: Arc<Mutex<Option<String>>>` - ACP session ID after session/new
- `status: Arc<RwLock<AgentStatus>>` - Current agent status
- `_output_tx: mpsc::UnboundedSender<String>` - For streaming output to frontend

### 3. AcpClient::spawn()
- Agent type mapping:
  - `"claude"` → `claude-agent`
  - `"opencode"` → `opencode`
  - `"pi"` → `pi-acp`
- Spawns subprocess with tokio::process::Command
- stdin/stdout as pipes, stderr captured
- current_dir set to worktree_path
- Performs initialize handshake (protocolVersion=1)
- Creates session with session/new (cwd=worktree_path)
- Returns connected AcpClient

### 4. AcpClient::send_prompt()
- Sends session/prompt notification with content blocks
- Response streamed via session/update notifications

### 5. AcpClient::cancel()
- Sends session/cancel notification

### 6. Background stdout_reader Task
Continuous message routing:
- Reads lines from stdout
- Parses JSON-RPC messages
- Routes based on method:
  - `session/update` with `plan` (status=pending/in_progress) → Working
  - `session/update` with `tool_call` (status=pending/in_progress) → Working
  - `session/update` with `tool_call_update` (status=in_progress) → Working
  - `session/update` with `session/request_permission` → Waiting
  - `session/update` with `session/prompt` (stopReason=end_turn/cancelled/max_tokens) → Idle
  - `agent_message_chunk` → stream content to frontend
  - `tool_call_update` (status=completed) → continue monitoring

### 7. AcpClient::status()
- Returns current AgentStatus enum

### 8. AcpClient::kill()
- Kills subprocess
- Aborts stdout_reader task
- Cleans up resources

## Unit Tests
All tests passing (4 tests):

1. **test_acp_handshake** ✅
   - Validates initialize request structure
   - Verifies JSON-RPC format

2. **test_acp_status_transitions** ✅
   - plan_pending → Working
   - tool_call_in_progress → Working
   - request_permission → Waiting
   - stopReason_end_turn → Idle

3. **test_request_id_generation** ✅
   - UUID-based request IDs
   - Unique IDs for each request

4. **test_json_rpc_structures** ✅
   - Request structure validation
   - Notification structure validation
   - JSON serialization

## Build Status
✅ `cargo build` - SUCCESS (only unused struct warnings)
✅ `cargo test` - ALL 103 TESTS PASSING
✅ `cargo clippy` - Only warnings, no errors

## ACP Protocol Compliance
- ✅ JSON-RPC 2.0 specification
- ✅ initialize handshake with protocolVersion=1
- ✅ session/new for creating sessions
- ✅ session/prompt for sending prompts
- ✅ session/cancel for cancellation
- ✅ session/update notifications for status detection

## Integration Points
- Ready for integration with AppState from T7
- Compatible with WebSocket server from T7
- AgentStatus enum can be sent as ServerMessage (T5)

## Next Steps
- T21: UI rendering for agent output
- T22: Agent lifecycle integration into router
- T23: WebSocket handler for agent messages

## Evidence Files
- `.sisyphus/evidence/task-20-acp-handshake.txt` - Handshake test output
- `.sisyphus/evidence/task-20-acp-status.txt` - Status detection test output
