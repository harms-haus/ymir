# Outline: ACP Chat React Integration

## Tasks

### Task 1: Add acp-ws-bridge Rust crate as workspace dependency
Add the acp-ws-bridge Rust crate from ~/acp-chat-ui-react/crates/acp-ws-bridge to ymir's Cargo.toml workspace members and as a dependency of ws-server. Update the crate's path reference and verify it compiles alongside existing ymir crates.
Dependencies: none
Parallel with: Task 2, Task 3
Tag: infra

### Task 2: Design and extend BridgeEnvelope for ymir protocol messages
Define new BridgeMessage discriminators in the ws-bridge contract to carry all ymir protocol message types beyond the existing six (acp_payload, bridge_status, stderr, process_exit, replay_metadata, start_agent). New discriminators must cover: workspace_event, worktree_event, git_response, file_response, agent_event, terminal_event, state_snapshot, notification, error_response, ack, ping, pong. Each discriminator carries the original MessagePack payload fields as structured JSON within the envelope.
Dependencies: none
Parallel with: Task 1, Task 3
Tag: infra

### Task 3: Define TypeScript types for extended BridgeEnvelope
Create TypeScript type definitions for the new BridgeMessage discriminators and the full BridgeEnvelope with all ymir-specific variants. This includes type guards, union narrowing helpers, and the complete typed union matching the Rust BridgeMessage enum. These types replace the current MessagePack-based protocol types in types/protocol.ts.
Dependencies: Task 2
Parallel with: Task 4
Tag: implementer

### Task 4: Build server-side BridgeEnvelope encoder/decoder
Implement JSON serialization and deserialization for BridgeEnvelope in ws-server. Replace MessagePack (rmp_serde) with serde_json for the WebSocket binary-to-text transition. Build helpers to construct BridgeEnvelope messages from existing handler return types, and parse incoming client messages from JSON into typed payloads. Maintain the existing PROTOCOL_VERSION constant for backward compatibility checks.
Dependencies: Task 1, Task 2
Parallel with: Task 5
Tag: implementer

### Task 5: Build client-side BridgeEnvelope encoder/decoder
Create a JSON-based encode/decode layer that replaces the @msgpack/msgpack pipeline. Build typed constructors for each client message type (all 37) that produce properly structured BridgeEnvelope messages, and parsers that deserialize incoming server envelopes (all 30 types) into typed handler callbacks. This becomes the foundation for the new WsTransport integration.
Dependencies: Task 3
Parallel with: Task 4
Tag: implementer

### Task 6: Replace YmirClient with WsTransport from acp-ws-bridge
Integrate the WsTransport and TransportClient classes from @harms-haus/acp-ws-bridge, replacing the YmirClient singleton. Wire up connection lifecycle (connect, reconnect with exponential backoff, disconnect), status reporting, and message sending. Adapt the heartbeat Ping/Pong mechanism to work through the BridgeEnvelope format. The WsTransport handles the raw WebSocket; the custom envelope handler from Tasks 4-5 handles ymir-specific message routing on top.
Dependencies: Task 4, Task 5
Parallel with: Task 7
Tag: implementer

### Task 7: Migrate WebSocket connection hooks
Update useWebSocket and related hooks to use the new WsTransport instead of YmirClient. Ensure React components receive the same connection status, error, and client references. Adapt any direct client.send() calls throughout the codebase to use the new transport API.
Dependencies: Task 6
Parallel with: Task 8, Task 9
Tag: implementer

### Task 8: Migrate workspace CRUD messages (4 types)
Migrate WorkspaceCreate, WorkspaceDelete, WorkspaceRename, and WorkspaceUpdate client messages, and WorkspaceCreated, WorkspaceDeleted, WorkspaceUpdated server messages to use BridgeEnvelope wrapping. Update the Zustand store handlers (addWorkspace, removeWorkspace) to consume BridgeEnvelope-wrapped responses. The existing Rust workspace handlers remain unchanged except for their serialization format.
Dependencies: Task 4, Task 5
Parallel with: Task 9, Task 10, Task 11, Task 12, Task 13, Task 14, Task 15, Task 16, Task 17, Task 18
Tag: implementer

### Task 9: Migrate worktree CRUD messages (11 types)
Migrate WorktreeCreate, WorktreeDelete, WorktreeMerge, WorktreeList, WorktreeChangeBranch, GetWorktreeDetails client messages, and WorktreeCreated, WorktreeDeleted, WorktreeChanged, WorktreeListResult, WorktreeStatus, WorktreeDetailsResult server messages to BridgeEnvelope. Update store handlers (addWorktree, removeWorktree, updateWorktree) and the lazy-loading pattern where worktrees are fetched via GetWorktreeDetails after StateSnapshot.
Dependencies: Task 4, Task 5
Parallel with: Task 8, Task 10, Task 11, Task 12, Task 13, Task 14, Task 15, Task 16, Task 17, Task 18
Tag: implementer

### Task 10: Migrate git operation messages (6 types)
Migrate GitStatus, GitDiff, GitCommit, CreatePR client messages and GitStatusResult, GitDiffResult server messages to BridgeEnvelope. Update the notification flow where GitCommit and CreatePR return Notification messages on success and Error on failure. Ensure the caching layer for git status and diff results works with the new envelope format.
Dependencies: Task 4, Task 5
Parallel with: Task 8, Task 9, Task 11, Task 12, Task 13, Task 14, Task 15, Task 16, Task 17, Task 18
Tag: implementer

### Task 11: Migrate file operation messages (4 types)
Migrate FileRead, FileWrite, FileList client messages and FileContent, FileListResult server messages to BridgeEnvelope. Update the editor component's onMessage handlers that currently consume FileContent directly. Ensure the file list caching layer (setFileListCache) works with the new envelope format. FileWrite remains not-implemented but must be added to the protocol envelope.
Dependencies: Task 4, Task 5
Parallel with: Task 8, Task 9, Task 10, Task 12, Task 13, Task 14, Task 15, Task 16, Task 17, Task 18
Tag: implementer

### Task 12: Migrate agent management messages (11 types)
Migrate AgentSpawn, AgentSend, AgentCancel, AgentSetConfigOption, AgentRename, AgentReorder client messages and AgentStatusUpdate, AgentRemoved, AgentUpdated, AgentOutput, AgentPrompt server messages to BridgeEnvelope. Update store handlers (addAgentSession, updateAgentSession, removeAgentSession) to consume BridgeEnvelope-wrapped events. AgentRename and AgentReorder return both AgentUpdated (broadcast) and Ack responses. This is a preparatory step before full ACP integration.
Dependencies: Task 4, Task 5
Parallel with: Task 8, Task 9, Task 10, Task 11, Task 13, Task 14, Task 15, Task 16, Task 17, Task 18
Tag: implementer

### Task 13: Migrate terminal protocol messages (12 types)
Migrate TerminalCreate, TerminalInput, TerminalResize, TerminalKill, TerminalRename, TerminalReorder, TerminalRequestHistory client messages and TerminalCreated, TerminalOutput, TerminalRemoved, TerminalUpdated, TerminalHistory server messages to BridgeEnvelope. Keep the existing ymir terminal protocol semantics (client creates PTYs independently) but wrap all messages in BridgeEnvelope. Update the TerminalProvider callback registry and TerminalView's write/read paths to consume enveloped messages.
Dependencies: Task 4, Task 5
Parallel with: Task 8, Task 9, Task 10, Task 11, Task 12, Task 14, Task 15, Task 16, Task 17, Task 18
Tag: implementer

### Task 14: Migrate state and settings messages (3 types)
Migrate GetState, UpdateSettings client messages and StateSnapshot server messages to BridgeEnvelope. The StateSnapshot is the first message sent on connection and populates the initial store state (workspaces populated, worktrees/agentSessions/terminalSessions empty for lazy loading). Ensure the GetState auto-send on WebSocket connect uses the new envelope format. Update stateFromSnapshot to handle the BridgeEnvelope wrapper.
Dependencies: Task 4, Task 5
Parallel with: Task 8, Task 9, Task 10, Task 11, Task 12, Task 13, Task 15, Task 16, Task 17, Task 18
Tag: implementer

### Task 15: Migrate infrastructure messages (5 types)
Migrate Ping, Pong, Notification, Error, and Ack messages to BridgeEnvelope. Update the heartbeat mechanism to send Ping through the envelope format and parse Pong responses. Ensure the Error type guard system (isPtyCrashError, isGitFailureError, etc.) works with BridgeEnvelope-wrapped errors. Update the error-recovery module's handleError dispatcher. Notification messages from GitCommit and CreatePR must be properly routed through the toast system.
Dependencies: Task 4, Task 5
Parallel with: Task 8, Task 9, Task 10, Task 11, Task 12, Task 13, Task 14, Task 16, Task 17, Task 18
Tag: implementer

### Task 16: Migrate ACP wire events to BridgeEnvelope
Replace the current AcpWireEvent message type with BridgeEnvelope's acp_payload discriminator. The server's BroadcastingEventSender must wrap ACP JSON-RPC events in BridgeEnvelope instead of ServerMessagePayload::AcpWireEvent. The client must parse acp_payload envelopes and route the raw ACP JSON-RPC to the SessionController instead of the acpAccumulatorReducer. The AcpEventEnvelope (sequence, correlationId, timestamp, event) structure must be preserved within the acp_payload for compatibility with the session replay system.
Dependencies: Task 4, Task 5
Parallel with: Task 8, Task 9, Task 10, Task 11, Task 12, Task 13, Task 14, Task 15, Task 17, Task 18
Tag: implementer

### Task 17: Replace server router MessagePack dispatch with JSON dispatch
Update the ws-server route_message function and all handler entry points to parse JSON BridgeEnvelope messages instead of MessagePack ClientMessage. The router must inspect the BridgeMessage type discriminator and dispatch to the appropriate handler. Existing handler functions (workspace::create, worktree::list, handle_agent_spawn, etc.) remain largely unchanged but their input/output types shift from MessagePack structs to BridgeEnvelope-wrapped JSON.
Dependencies: Task 4
Parallel with: Task 18
Tag: implementer

### Task 18: Update ws-server WebSocket handler for JSON transport
Modify the main WebSocket connection loop in ws-server/src/main.rs to send and receive JSON text frames instead of MessagePack binary frames. Update send_ws_message to serialize BridgeEnvelope to JSON text. Update the receive path to parse JSON text into BridgeEnvelope. Remove all rmp_serde encode/decode calls. Ensure the hub's broadcast and send_to functions work with JSON text messages.
Dependencies: Task 4
Parallel with: Task 17
Tag: implementer

### Task 19: Integrate SessionController from acp-chat-core
Wire up the SessionController from @harms-haus/acp-chat-core as the replacement for the acpAccumulatorReducer. Configure the SessionController to receive ACP events from the BridgeEnvelope acp_payload stream and manage session state. Map ymir's worktree-scoped agent model to acp-chat-core's session-scoped model by creating a SessionController instance per active worktree.
Dependencies: Task 6, Task 16
Parallel with: Task 20, Task 21
Tag: implementer

### Task 20: Replace acpAccumulatorReducer with AcpStore
Remove the acpAccumulatorReducer from the Zustand store and replace it with AcpStore from acp-chat-core. The AcpStore manages thread state, message accumulation, and tool call tracking. Update all store selectors that previously read from acpAccumulator to use the AcpStore interface. Ensure the connection reconnection behavior (flush on reconnect) is handled by SessionController's replay mechanism.
Dependencies: Task 19
Parallel with: Task 21
Tag: implementer

### Task 21: Build custom ACP transport adapter
Create a transport adapter that bridges the WsTransport (Task 6) to the SessionController (Task 19). This adapter receives BridgeEnvelope messages, extracts acp_payload content, and feeds raw ACP JSON-RPC to the SessionController. It also sends outbound ACP messages (prompts, config changes, terminal creation requests) from the SessionController back through the WsTransport as BridgeEnvelope messages.
Dependencies: Task 6, Task 19
Parallel with: Task 20
Tag: implementer

### Task 22: Replace AgentChat with acp-chat-react Thread components
Replace the AgentChat, AgentRuntimeProvider, and EventCards components with acp-chat-react's Thread, MessageCard, ToolCall, ThoughtStack, and PermissionRequestCard components. Wrap them in the AcpProvider configured with the custom transport adapter (Task 21). Apply simple default styles as specified (no old agent styling preserved). Ensure the component works within the existing AgentPane tab structure.
Dependencies: Task 20, Task 21
Parallel with: Task 23, Task 24
Tag: implementer

### Task 23: Wire up Composer and prompt sending through AcpStore
Replace the current prompt sending flow (AgentRuntimeProvider.onNew -> dispatchAccumulator -> onSendMessage) with the AcpStore's sendPrompt interface. The Composer input must create messages through the AcpStore, which routes them through the transport adapter to the server. Config selector changes (AgentSetConfigOption) must also flow through the new transport.
Dependencies: Task 20, Task 21
Parallel with: Task 22, Task 24
Tag: implementer

### Task 24: Integrate ACP terminal creation model
Bridge the gap between ymir's client-initiated terminal creation and acp-chat-core's agent-requested terminal creation model. When the agent requests a terminal via JSON-RPC terminal/create, the transport adapter must create a ymir terminal session through the existing PTY manager (which stays unchanged). The terminal output must flow back through the BridgeEnvelope terminal_event discriminator to the agent's SessionController.
Dependencies: Task 13, Task 21
Parallel with: Task 22, Task 23
Tag: implementer

### Task 25: Remove old MessagePack protocol types and utilities
Delete the MessagePack encoding/decoding helpers from types/protocol.ts, remove @msgpack/msgpack from package.json dependencies, and clean up the fixture validator (fixtureValidator.ts) that validates MessagePack fixtures. Remove the old YmirClient class, the AcpEventEnvelope TypeScript type, and all MessagePack-specific type guards. Keep hand-written types that are still needed for the BridgeEnvelope system.
Dependencies: Task 8, Task 9, Task 10, Task 11, Task 12, Task 13, Task 14, Task 15, Task 16, Task 17, Task 18
Parallel with: none
Tag: implementer

### Task 26: Remove old agent chat components and accumulator
Delete AgentChat.tsx, AgentRuntimeProvider.tsx, EventCards.tsx, card-schema.ts, and runtimeBoundary.ts. Remove the acpAccumulatorReducer, AccumulatedThread, AccumulatedMessage, and related types from the Zustand store and types/state.ts. Clean up the old agent.css stylesheet. Ensure no import references to removed files remain in the codebase.
Dependencies: Task 22, Task 23
Parallel with: none
Tag: implementer

### Task 27: Update Zustand store for new message flow
Refactor the Zustand store's updateStateFromServerMessage function to handle BridgeEnvelope-wrapped messages instead of raw MessagePack messages. Replace the direct store setter pattern with a message routing system that dispatches to domain-specific handlers based on the BridgeMessage type discriminator. Ensure the store maintains backward compatibility with existing UI components during the transition.
Dependencies: Task 8, Task 9, Task 10, Task 11, Task 12, Task 13, Task 14, Task 15
Parallel with: none
Tag: implementer

### Task 28: End-to-end integration testing
Test the complete message flow for all 37 client and 30 server message types through the new BridgeEnvelope protocol. Verify workspace creation, worktree operations, git commands, file reads, agent spawning, terminal sessions, ACP conversations, state snapshots, heartbeat, and error handling all work end-to-end. Test reconnection behavior and state recovery.
Dependencies: Task 25, Task 26, Task 27, Task 22, Task 23, Task 24
Parallel with: Task 29
Tag: tester

### Task 29: Write post-implementation tests
Write tests for the BridgeEnvelope encoder/decoder, the WsTransport integration, each domain message migration, the SessionController adapter, and the React component replacements. Follow the existing vitest + testing-library conventions (co-located __tests__ directories, vi.mock patterns, jsdom environment). Test-after strategy as specified.
Dependencies: Task 25, Task 26, Task 27, Task 22, Task 23, Task 24
Parallel with: Task 28
Tag: tester

### Task 30: Feature branch and per-phase commits
Create the feature branch `feat/acp-chat-react-integration` at the start of Phase 1. After each phase completes, commit all changes from that phase with a descriptive commit message. Phases: (1) Foundation Tasks 1-3, (2) Encoders + Transport Tasks 4-7, (3) Domain Migrations Tasks 8-18, (4) ACP Integration Tasks 19-24, (5) Cleanup Tasks 25-27, (6) Testing Tasks 28-29. Ensure each phase compiles before committing.

### Parallelism Constraint
Only 3 subagents can run concurrently. Phase 3's 11 parallel tasks will be executed in 4 batches of 3:
- Batch A: Task 8 (workspace), Task 9 (worktree), Task 10 (git)
- Batch B: Task 11 (file), Task 12 (agent mgmt), Task 13 (terminal)
- Batch C: Task 14 (state/settings), Task 15 (infrastructure), Task 16 (ACP wire)
- Batch D: Task 17 (router), Task 18 (WS handler)
Phase 4's ACP integration tasks will be executed in 2 batches of 3:
- Batch E: Task 19 (SessionController), Task 20 (AcpStore), Task 21 (transport adapter)
- Batch F: Task 22 (React components), Task 23 (Composer), Task 24 (ACP terminals)

## Dependency Graph Summary

Phase 1 - Foundation (can run in parallel):
  Task 1 (Rust crate) || Task 2 (BridgeEnvelope design) || Task 3 (TS types)
  Task 2 -> Task 3, Task 4, Task 5

Phase 2 - Transport Layer:
  Task 4 (server encoder) || Task 5 (client encoder) [both depend on Task 2]
  Task 4 + Task 5 -> Task 6 (WsTransport)
  Task 6 -> Task 7 (hooks)

Phase 3 - Domain Migrations (ALL run in parallel with each other):
  Task 8 (workspace) || Task 9 (worktree) || Task 10 (git) || Task 11 (file)
  || Task 12 (agent management) || Task 13 (terminal) || Task 14 (state/settings)
  || Task 15 (infrastructure) || Task 16 (ACP wire) || Task 17 (router) || Task 18 (WS handler)
  All depend on Task 4 + Task 5

Phase 4 - ACP Integration (partial parallelism):
  Task 19 (SessionController) || Task 21 (transport adapter) [depend on Task 6 + Task 16]
  Task 19 -> Task 20 (AcpStore)
  Task 19 + Task 21 -> Task 23 (Composer)
  Task 20 + Task 21 -> Task 22 (React components)
  Task 13 + Task 21 -> Task 24 (ACP terminals)

Phase 5 - Cleanup (sequential):
  Task 8-18 complete -> Task 25 (remove MessagePack)
  Task 22 + Task 23 complete -> Task 26 (remove old components)
  Task 8-15 complete -> Task 27 (store refactor)

Phase 6 - Testing:
  Task 25 + Task 26 + Task 27 + Task 22 + Task 23 + Task 24 complete -> Task 28 + Task 29
