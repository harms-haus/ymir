# Task 10: Adapter-Chain Spike Evidence

**Date**: 2026-03-20
**Status**: CONTINUE to assistant-ui integration
**Final Verified**: 2026-03-20 (full green checkpoint)

## Test Results Summary

### Rust Tests (261 passed)
```
cargo test -p ymir-ws-server -- --nocapture
test result: ok. 261 passed; 0 failed; 0 ignored
```

Key test categories:
- Agent adapter tests: 18 passed (Task 6)
- Protocol tests: 136 passed (including 14 WS-ACP tests)
- Handler/router tests: All passed (Task 7)
- Lifecycle tests: All passed (Task 5)

### Web Tests (550 passed)

Full test suite verified:
```
npm --prefix apps/web run test:run
Test Files  30 passed (30)
Tests       550 passed (550)
```

Covers:
- Accumulator reducer (60 tests): all event types, reconnect, rebuild
- WS adapter (45 tests): envelope decoding, malformed handling
- Protocol (60 tests): wire contract, negative tests
- AgentChat (67 tests): assistant-ui integration, message rendering
- AgentPane (5 tests): tab rendering, agent spawning
- All dialog, project, editor, and terminal tests now pass

## Abort Conditions Evaluation

### Condition 1: Bypassing Most of assistant-ui?
**Status**: PASSED - CONTINUE

Analysis:
- We'd use assistant-ui for: message rendering, markdown, code highlighting, streaming animation
- We'd NOT use: backend runtimes, session management, worktree/tab concepts
- The accumulator produces `AccumulatedMessage` with `parts` compatible with assistant-ui's message model
- `ExternalStoreRuntime` allows host-owned state, which matches our architecture

Value added by assistant-ui:
1. Message rendering with proper scrolling
2. Markdown and code block rendering
3. Streaming text animation
4. Tool call visualization primitives
5. Accessibility support

**Conclusion**: assistant-ui adds sufficient rendering value to justify integration.

### Condition 2: Wire Contract assistant-ui-agnostic?
**Status**: PASSED

Evidence:
- Protocol tests explicitly reject assistant-ui-specific fields:
  - `AcpPromptChunk.content` must use `{ type: 'Text', data: string }`, not assistant-ui message parts
  - `AcpSessionStatusEvent` must NOT have `messages` or `isLoading` fields
  - `AcpToolUseEvent` must NOT have assistant-ui `toolCallId` or `args` fields
  - `AcpContextUpdate` must NOT have `threadId`, `isRunning`, or `abortController`
  - `AcpError` must NOT have `stack` or `cause` fields

The wire contract is stateless and assistant-ui-agnostic.

### Condition 3: State Duplication Risk?
**Status**: PASSED

Evidence:
- Accumulator stores `worktreeId` and `acpSessionId` as REFERENCES, not duplicating state
- Canonical state remains in:
  - `AppState.worktrees` (worktree identity)
  - `AppState.agentSessions` (session identity)
  - `AppState.connectionStatus` (connection state)
- Accumulator is explicitly marked as DERIVED, connection-scoped state
- Reconnect flushes accumulator and rebuilds from replay
- `stateFromSnapshot()` dispatches `CONNECTION_RECONNECTED` to reset accumulator

No state duplication detected.

## Chain Architecture Verification

```
┌─────────────────────────────────────────────────────────────────┐
│                        RUST SIDE                                │
├─────────────────────────────────────────────────────────────────┤
│  Agent Process ──► ACP SDK ──► YmirClientHandler                │
│                                │                                │
│                                ▼                                │
│                      BroadcastingEventSender                    │
│                                │                                │
│                                ▼                                │
│                      ServerMessagePayload::AcpWireEvent         │
└─────────────────────────────────────────────────────────────────┘
                                  │
                                  │ WebSocket
                                  ▼
┌─────────────────────────────────────────────────────────────────┐
│                     TYPESCRIPT SIDE                             │
├─────────────────────────────────────────────────────────────────┤
│  YmirClient.handleMessage() ──► decodeAcpEnvelope()             │
│                                       │                         │
│                                       ▼                         │
│                        updateStateFromServerMessage()            │
│                                       │                         │
│                                       ▼                         │
│                        acpAccumulatorReducer()                   │
│                                       │                         │
│                                       ▼                         │
│                        AccumulatedThread                         │
│                          (messages, parts, cards)                │
└─────────────────────────────────────────────────────────────────┘
                                  │
                                  │ ExternalStoreRuntime (Task 11)
                                  ▼
┌─────────────────────────────────────────────────────────────────┐
│                     assistant-ui                                 │
│  - Message rendering                                             │
│  - Markdown/code blocks                                          │
│  - Streaming animation                                           │
│  - Tool call visualization                                       │
└─────────────────────────────────────────────────────────────────┘
```

## Decision

**CONTINUE** to Task 11 (Wire assistant-ui through ExternalStoreRuntime)

The adapter chain is viable and passes all abort condition checks:
1. assistant-ui adds sufficient rendering value
2. Wire contract is clean and assistant-ui-agnostic
3. No state duplication detected

The architecture preserves Ymir's ownership of worktree/session identity while leveraging assistant-ui for rendering.

### Verified Checkpoint Commands

- `cargo test -p ymir-ws-server -- --nocapture`: **PASS** (261 tests)
- `npm --prefix apps/web run test:run`: **PASS** (30 test files, 550 tests)