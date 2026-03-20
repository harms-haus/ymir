# Agent Tab ACP SDK Migration Plan

## TL;DR

> **Quick Summary**: Replace Ymir's custom ACP path with official ACP SDKs plus an anti-lock-in adapter chain. Keep WebSocket as the transport, keep Ymir's app shell and worktree/session ownership, and use `assistant-ui` only as the rendering layer behind `ExternalStoreRuntime`.
>
> **Target Architecture**:
> - Agent -> Rust ACP SDK -> ACP-WS Rust adapter (stateless)
> - WebSocket
> - WS-ACP TypeScript adapter (stateless)
> - ACP event accumulator (connection-scoped accumulation)
> - `assistant-ui` via `ExternalStoreRuntime`
>
> **Deliverables**:
> - Rust ACP bridge + stateless ACP-WS adapter
> - WS-ACP TypeScript adapter
> - ACP event accumulator with reconnect rebuild rules
> - `assistant-ui`-based compact developer session surface
> - Unit-test-only coverage for contracts, adapters, accumulator, and UI integration
>
> **Estimated Effort**: Large
> **Parallel Execution**: YES - 3 waves
> **Critical Path**: Task 1 -> Task 2 -> Task 8 -> Task 9 -> Task 10 -> Task 11 -> Task 12 -> Task 15

---

## Context

### Original Request
Rewrite the migration plan around a lower-lock-in communication path while replacing the current agent tab UI and ACP handling. The user wants the app to stay WebSocket-based, use official ACP SDKs, keep `assistant-ui` as the rendering base, and make future pivoting to AgentPane cheaper.

### Interview Summary
**Key Decisions**:
- Keep the existing WebSocket transport.
- Use official ACP SDKs as the protocol basis.
- Use `assistant-ui` as the UI base, but only as a primitive/rendering layer.
- Use `ExternalStoreRuntime` in production because Ymir owns worktree/tab/session state.
- Split the architecture into explicit seams:
  - Rust ACP bridge + ACP-WS Rust adapter = stateless
  - WS-ACP TypeScript adapter = stateless
  - ACP event accumulator = connection-scoped state accumulation only
- Permission prompts render first as custom event cards, not assistant-ui built-in tool approval.
- Agent processes must launch in the currently selected worktree CWD.
- Unit tests only; no browser/UI automation.

**Research Findings**:
- Official Rust ACP SDK docs/examples are trait/stdIO-focused and do not ship built-in SSE/HTTP/WebSocket transport layers.
- `assistant-ui` is highly customizable and supports host-owned state via `ExternalStoreRuntime`.
- Local Ymir seams that should remain authoritative include `apps/web/src/components/layout/AppShell.tsx`, `apps/web/src/components/main/MainPanel.tsx`, `apps/web/src/store.ts`, and `apps/web/src/lib/ws.ts`.

### Metis Review
**Gaps Resolved in This Rewrite**:
- The prior plan under-specified the adapter boundaries and over-centralized “normalized state.”
- This rewrite explicitly separates wire contract, stateless adapters, stateful accumulation, and rendering.
- Reconnect/rebuild behavior is now a first-class requirement.
- Worktree-CWD launch behavior is now explicit rather than implied.
- Permission prompts are scoped to custom event cards first to avoid premature assistant-ui coupling.

---

## Work Objectives

### Core Objective
Migrate Ymir's ACP execution and agent session UI onto an official-SDK-backed architecture that minimizes UI/runtime lock-in by keeping transport adapters stateless and concentrating connection-scoped accumulation in a single TypeScript seam before `assistant-ui`.

### Concrete Deliverables
- Rust ACP SDK integration in `ws-server`
- ACP-WS Rust adapter that emits stateless wire events over WebSocket
- WS-ACP TypeScript adapter that decodes wire events without owning app state
- ACP event accumulator that reconstructs assistant-ui-ready thread state and custom event cards
- Compact developer-focused `assistant-ui` session UI using `ExternalStoreRuntime`
- Worktree-aware process launch rules that start the agent in the selected worktree CWD
- Unit tests for contracts, adapters, reconnect/rebuild, and UI-facing accumulation

### Definition of Done
- [ ] Rust agent lifecycle uses the official ACP crate and launches in the selected worktree CWD
- [ ] The WebSocket wire contract is stateless and independent of assistant-ui-specific message structures
- [ ] The ACP event accumulator rebuilds state after reconnect without becoming a second source of truth
- [ ] `assistant-ui` consumes accumulated state via `ExternalStoreRuntime`
- [ ] Permission prompts, tool calls, plan/status updates, and streaming text render as compact custom event cards or message parts
- [ ] `cargo test -p ymir-ws-server` and `npm --prefix apps/web run test:run` both pass

### Must Have
- Preserve WebSocket transport
- Use official ACP libraries as the protocol basis
- Keep Rust ACP-WS and TypeScript WS-ACP adapters stateless
- Keep state accumulation isolated to a single `ACP event accumulator`
- Use `assistant-ui` as the rendering base through `ExternalStoreRuntime`
- Start the agent in the currently selected worktree CWD
- Keep verification unit-test-only

### Must NOT Have (Guardrails)
- No WebSocket transport rewrite
- No browser/UI automation work
- No unrelated app-shell redesign
- No assistant-ui-owned session/tab/worktree truth
- No Rust-side accumulation of UI thread state
- No SSE-specific plan assumptions unless upstream SDK evidence appears during implementation
- No feature creep beyond parity-oriented agent session UX

### Lock-in Guards
- **Adapter guard**: ACP-WS Rust adapter and WS-ACP TypeScript adapter remain stateless protocol translators.
- **Accumulator guard**: The ACP event accumulator is connection-scoped only and must flush/rebuild on WebSocket reconnect.
- **Runtime guard**: `assistant-ui` receives already-accumulated state through `ExternalStoreRuntime`; it is never the canonical source of session truth.
- **UI guard**: Permission prompts start as custom event cards; do not force them into assistant-ui-native tool approval until parity pressure justifies it.

### Abort Conditions
- After Task 10, if the accumulator + `assistant-ui` integration requires bypassing most of `assistant-ui`, pivot to AgentPane as the base/example instead.
- If the stateless wire contract cannot remain assistant-ui-agnostic, stop and re-scope before UI work continues.
- If worktree/session semantics cannot be preserved without duplicating canonical state, stop and re-scope before cleanup tasks.

---

## Verification Strategy

> **ZERO HUMAN INTERVENTION** — all verification is agent-executed with unit tests, contract tests, and scriptable adapter/reducer checks only.

### Test Decision
- **Infrastructure exists**: YES
- **Automated tests**: Tests-after, with contract-first test coverage on the risky seams
- **Frameworks**: `cargo test`, `vitest`
- **UI automation**: Explicitly excluded

### QA Policy
Every task must validate its seam directly:
- **Rust/backend**: contract and unit tests for ACP bridge, handler/router wiring, worktree CWD launch, and reconnect-safe events
- **TypeScript/web**: unit tests for adapters, accumulator reducers, `ExternalStoreRuntime` wiring, and compact event-card rendering
- **Evidence path**: `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`

---

## Execution Strategy

### Parallel Execution Waves

Wave 1 (foundation contracts and seams):
- Task 1: Define the WS-ACP wire contract [unspecified-high]
- Task 2: Define the ACP event accumulator contract [unspecified-high]
- Task 3: Define the assistant-ui runtime boundary [quick]
- Task 4: Define permission-card and event-card schemas [quick]
- Task 5: Define worktree-CWD launch and lifecycle rules [unspecified-high]

Wave 2 (adapter and accumulator implementation):
- Task 6: Build the Rust ACP bridge and ACP-WS adapter [deep]
- Task 7: Integrate Rust handlers/router/persistence with CWD launch [unspecified-high]
- Task 8: Build the WS-ACP TypeScript adapter [quick]
- Task 9: Build the ACP event accumulator [unspecified-high]
- Task 10: Run the adapter-chain spike and abort checkpoint [deep]

Wave 3 (UI integration, parity, cleanup):
- Task 11: Wire `assistant-ui` through `ExternalStoreRuntime` [visual-engineering]
- Task 12: Build compact custom event cards [visual-engineering]
- Task 13: Preserve worktree/tab/diff/editor/terminal integration [quick]
- Task 14: Retire the obsolete custom ACP path and stale bindings [unspecified-high]
- Task 15: Add reconnect/rebuild/error regression coverage and full sweep [quick]

Wave FINAL (after all implementation tasks):
- F1: Plan compliance audit (`oracle`)
- F2: Code quality review (`unspecified-high`)
- F3: Unit-verification execution (`unspecified-high`)
- F4: Scope fidelity check (`deep`)

Critical Path: 1 -> 2 -> 8 -> 9 -> 10 -> 11 -> 12 -> 15 -> F1-F4
Max Concurrent: 5

### Dependency Matrix
- **1**: blocked by none -> blocks 6, 8, 9
- **2**: blocked by 1 -> blocks 9, 10, 11, 12
- **3**: blocked by 1, 2 -> blocks 11
- **4**: blocked by 1, 2 -> blocks 12
- **5**: blocked by 1 -> blocks 7, 10, 13
- **6**: blocked by 1, 5 -> blocks 7, 10, 14
- **7**: blocked by 5, 6 -> blocks 10, 13, 14
- **8**: blocked by 1 -> blocks 9, 10, 11
- **9**: blocked by 1, 2, 8 -> blocks 10, 11, 12, 15
- **10**: blocked by 2, 5, 6, 7, 8, 9 -> blocks 11, 12, 14, 15
- **11**: blocked by 2, 3, 8, 9, 10 -> blocks 12, 13, 15
- **12**: blocked by 2, 4, 9, 10, 11 -> blocks 13, 15
- **13**: blocked by 5, 7, 11, 12 -> blocks 14, 15
- **14**: blocked by 6, 7, 10, 13 -> blocks 15
- **15**: blocked by 9, 10, 11, 12, 13, 14 -> blocks F1-F4

### Agent Dispatch Summary
- **Wave 1**: T1 `unspecified-high`, T2 `unspecified-high`, T3 `quick`, T4 `quick`, T5 `unspecified-high`
- **Wave 2**: T6 `deep`, T7 `unspecified-high`, T8 `quick`, T9 `unspecified-high`, T10 `deep`
- **Wave 3**: T11 `visual-engineering`, T12 `visual-engineering`, T13 `quick`, T14 `unspecified-high`, T15 `quick`
- **FINAL**: F1 `oracle`, F2 `unspecified-high`, F3 `unspecified-high`, F4 `deep`

---

## TODOs


- [x] 1. Define the WS-ACP wire contract

  **What to do**:
  - Define the stateless wire contract between the Rust ACP bridge and the TypeScript side.
  - Separate wire-level event shapes from assistant-ui/runtime-facing accumulated state.
  - Specify ordering, ids, resumability markers, and error envelope shapes.
  - Add contract tests for encode/decode on both sides.

  **Must NOT do**:
  - Do not leak assistant-ui message-part structures into the WebSocket wire format.
  - Do not accumulate thread state in Rust or in the WS-ACP adapter.

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: This is the core anti-lock-in contract for the whole rewrite.
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 2, 3, 4, 5)
  - **Blocks**: 6, 8, 9
  - **Blocked By**: None

  **References**:
  - `crates/ws-server/src/protocol.rs` - Rust wire contract source of truth.
  - `apps/web/src/types/generated/protocol.ts` - Current generated web protocol types that will be rewritten.
  - `apps/web/src/types/__tests__/protocol.test.ts` - Existing encode/decode test patterns.
  - `https://agentclientprotocol.com/libraries/rust` - Official Rust ACP SDK entry point.

  **Acceptance Criteria**:
  - [ ] WS-ACP event types are explicitly defined and stateless.
  - [ ] Ordering/id/idempotency rules are documented in the contract.
  - [ ] Rust and TypeScript contract tests validate the same event vocabulary.

  **QA Scenarios**:
  ```text
  Scenario: WS-ACP contract encodes and decodes cleanly
    Tool: Bash
    Preconditions: Rust/TypeScript contract tests exist
    Steps:
      1. Run `npm --prefix apps/web run test:run -- src/types/__tests__/protocol.test.ts`
      2. Run `cargo test -p ymir-ws-server protocol:: -- --nocapture`
      3. Save output to `.sisyphus/evidence/task-1-wire-contract.txt`
    Expected Result: both wire-contract suites pass with zero failures
    Failure Indicators: mismatched event names, missing ids, decode drift
    Evidence: .sisyphus/evidence/task-1-wire-contract.txt

  Scenario: assistant-ui-specific fields are rejected at wire level
    Tool: Bash
    Preconditions: negative protocol tests exist
    Steps:
      1. Run `npm --prefix apps/web run test:run -- src/types/__tests__/protocol.test.ts`
      2. Assert wire tests reject assistant-ui-only payload shapes
    Expected Result: wire contract stays adapter-agnostic
    Failure Indicators: assistant-ui message parts accepted in WS-ACP payloads
    Evidence: .sisyphus/evidence/task-1-wire-contract-negative.txt
  ```

  **Commit**: YES
  - Message: `refactor(protocol): define ws-acp wire contract`
  - Files: `crates/ws-server/src/protocol.rs`, `apps/web/src/types/generated/protocol.ts`, `apps/web/src/types/__tests__/protocol.test.ts`
  - Pre-commit: `cargo test -p ymir-ws-server protocol:: -- --nocapture && npm --prefix apps/web run test:run -- src/types/__tests__/protocol.test.ts`

- [x] 2. Define the ACP event accumulator contract

  **What to do**:
  - Define the accumulator's input/output contract, including connection-scoped rebuild rules.
  - Specify how ACP events become accumulated thread/message/card state for assistant-ui.
  - Define flush/rebuild behavior on WebSocket reconnect and replay.
  - Add reducer/state-transition tests for accumulator rules.

  **Must NOT do**:
  - Do not make the accumulator a canonical source of worktree/session truth.
  - Do not assume infinite message history or unbounded retention.

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: This is the riskiest stateful seam in the rewritten architecture.
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 3, 4, 5)
  - **Blocks**: 9, 10, 11, 12
  - **Blocked By**: 1

  **References**:
  - `apps/web/src/store.ts` - Existing host-owned state patterns and selectors.
  - `apps/web/src/types/state.ts` - Existing worktree/session state types to keep authoritative.
  - `https://www.assistant-ui.com/docs/runtimes/pick-a-runtime` - `ExternalStoreRuntime` guidance for host-owned state.

  **Acceptance Criteria**:
  - [ ] Accumulator state is explicitly marked connection-scoped and rebuildable.
  - [ ] Flush/rebuild rules on reconnect are specified and unit-tested.
  - [ ] Permission cards, tool cards, and streamed text all have deterministic accumulator outputs.

  **QA Scenarios**:
  ```text
  Scenario: accumulator rebuild rules are deterministic
    Tool: Bash
    Preconditions: accumulator tests exist
    Steps:
      1. Run `npm --prefix apps/web run test:run -- src/hooks/__tests__/useAgentStatus.test.ts`
      2. Assert reducer-style tests cover reconnect flush and rebuild semantics
      3. Save output to `.sisyphus/evidence/task-2-accumulator-contract.txt`
    Expected Result: reconnect/rebuild state tests pass deterministically
    Failure Indicators: stale cards after reconnect, duplicated messages, state drift
    Evidence: .sisyphus/evidence/task-2-accumulator-contract.txt

  Scenario: accumulator does not become canonical app state
    Tool: Bash
    Preconditions: negative tests exist for duplicated ownership
    Steps:
      1. Run `npm --prefix apps/web run test:run -- src/hooks/__tests__/useAgentStatus.test.ts`
      2. Assert accumulator output can be cleared/rebuilt from adapter input without breaking host state
    Expected Result: accumulator behaves like rebuildable derived state
    Failure Indicators: tabs/worktrees/session truth lost when accumulator resets
    Evidence: .sisyphus/evidence/task-2-accumulator-contract-negative.txt
  ```

  **Commit**: YES
  - Message: `refactor(store): define acp event accumulator contract`
  - Files: `apps/web/src/store.ts`, `apps/web/src/types/state.ts`, accumulator test files
  - Pre-commit: `npm --prefix apps/web run test:run -- src/hooks/__tests__/useAgentStatus.test.ts`

- [ ] 3. Define the assistant-ui runtime boundary

  **What to do**:
  - Define the exact boundary between host-owned Ymir state and `assistant-ui` `ExternalStoreRuntime` inputs.
  - Specify which features remain disabled or custom (editing, approval, branching) in the first cut.
  - Document the shape of accumulated state handed into `assistant-ui`.
  - Add small unit tests around runtime-boundary mapping helpers.

  **Must NOT do**:
  - Do not allow `assistant-ui` to own worktree, tab, or session identity.
  - Do not adopt assistant-ui built-in backend runtimes.

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Focused boundary definition with lightweight mapping tests.
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 2, 4, 5)
  - **Blocks**: 11
  - **Blocked By**: 1, 2

  **References**:
  - `apps/web/src/store.ts` - Existing host-owned worktree/session state.
  - `https://www.assistant-ui.com/docs/runtimes/pick-a-runtime` - Confirms `ExternalStoreRuntime` for host-owned state.

  **Acceptance Criteria**:
  - [ ] The assistant-ui boundary is documented as render-only.
  - [ ] Unsupported or deferred runtime features are explicitly listed.
  - [ ] Mapping helpers from accumulator output to runtime input are unit-tested.

  **QA Scenarios**:
  ```text
  Scenario: assistant-ui boundary mapping stays render-only
    Tool: Bash
    Preconditions: runtime-boundary tests exist
    Steps:
      1. Run `npm --prefix apps/web run test:run -- src/components/agent/__tests__/AgentChat.test.tsx`
      2. Assert runtime-boundary helpers never own worktree/tab/session identifiers
      3. Save output to `.sisyphus/evidence/task-3-runtime-boundary.txt`
    Expected Result: runtime-boundary tests pass with host-owned identifiers preserved
    Failure Indicators: assistant-ui-specific state becoming canonical
    Evidence: .sisyphus/evidence/task-3-runtime-boundary.txt

  Scenario: deferred assistant-ui features are not accidentally enabled
    Tool: Bash
    Preconditions: negative mapping tests exist
    Steps:
      1. Run `npm --prefix apps/web run test:run -- src/components/agent/__tests__/AgentChat.test.tsx`
      2. Assert unsupported runtime features remain disabled/custom in the first cut
    Expected Result: first-cut runtime scope remains constrained
    Failure Indicators: approval/editing/branching enabled without matching adapters
    Evidence: .sisyphus/evidence/task-3-runtime-boundary-negative.txt
  ```

  **Commit**: YES
  - Message: `refactor(agent-ui): define external-store runtime boundary`
  - Files: runtime-boundary helper files, related tests, plan-referenced documentation comments if needed
  - Pre-commit: `npm --prefix apps/web run test:run -- src/components/agent/__tests__/AgentChat.test.tsx`

- [ ] 4. Define permission-card and event-card schemas

  **What to do**:
  - Define compact custom card schemas for permission prompts, tool calls, plan updates, and status events.
  - Keep permission prompts separate from assistant-ui built-in tool approval in the first cut.
  - Specify required fields for rendering, action dispatch, and replay safety.
  - Add unit tests for card-schema validation and fallback behavior.

  **Must NOT do**:
  - Do not bind permissions to assistant-ui-native approval primitives yet.
  - Do not allow card schemas to diverge from accumulator event names.

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Schema definition and validation with small surface area.
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 2, 3, 5)
  - **Blocks**: 12
  - **Blocked By**: 1, 2

  **References**:
  - `apps/web/src/components/agent/AgentChat.tsx` - Current minimal card/message surface being replaced.
  - `https://github.com/assistant-ui/assistant-ui` - Message-part and custom part rendering primitives.

  **Acceptance Criteria**:
  - [ ] Permission cards, tool cards, plan cards, and status cards have explicit schemas.
  - [ ] Schemas support action dispatch fields needed for permissions.
  - [ ] Unit tests validate unknown-card fallback behavior.

  **QA Scenarios**:
  ```text
  Scenario: event-card schemas validate expected ACP UI events
    Tool: Bash
    Preconditions: card-schema tests exist
    Steps:
      1. Run `npm --prefix apps/web run test:run -- src/components/agent/__tests__/AgentChat.test.tsx`
      2. Assert permission/tool/plan/status card schemas validate correctly
      3. Save output to `.sisyphus/evidence/task-4-event-card-schema.txt`
    Expected Result: valid card schemas render through the tested mapping layer
    Failure Indicators: missing fields, invalid actions, schema drift
    Evidence: .sisyphus/evidence/task-4-event-card-schema.txt

  Scenario: unknown card types degrade safely
    Tool: Bash
    Preconditions: fallback tests exist
    Steps:
      1. Run `npm --prefix apps/web run test:run -- src/components/agent/__tests__/AgentChat.test.tsx`
      2. Assert unknown cards render a safe fallback instead of crashing
    Expected Result: schema evolution remains safe for the UI
    Failure Indicators: uncaught render errors for unknown card types
    Evidence: .sisyphus/evidence/task-4-event-card-schema-negative.txt
  ```

  **Commit**: YES
  - Message: `refactor(agent-ui): define event card schemas`
  - Files: card-schema helper files, related tests
  - Pre-commit: `npm --prefix apps/web run test:run -- src/components/agent/__tests__/AgentChat.test.tsx`

- [x] 5. Define worktree-CWD launch and lifecycle rules

  **What to do**:
  - Define exactly how agent start/stop/restart behaves per selected worktree.
  - Specify that new agent processes launch in the currently selected worktree CWD.
  - Define what happens on worktree switch, cancellation, reconnect, and stale-session cleanup.
  - Add unit tests for lifecycle helpers and state transitions affected by these rules.

  **Must NOT do**:
  - Do not silently reuse the wrong worktree CWD.
  - Do not preserve orphaned process/session state after cancellation or worktree removal.

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: This affects lifecycle correctness and process safety.
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 2, 3, 4)
  - **Blocks**: 6, 7, 10, 13
  - **Blocked By**: 1

  **References**:
  - `apps/web/src/store.ts` - Existing selected-worktree and session state patterns.
  - `crates/ws-server/src/agent/handler.rs` - Current spawn/send/cancel lifecycle.
  - `crates/ws-server/src/state.rs` - Active session tracking.

  **Acceptance Criteria**:
  - [ ] Launch rules explicitly require the selected worktree CWD.
  - [ ] Worktree switch/cancel/removal behavior is documented and unit-tested.
  - [ ] Stale-session cleanup rules are explicit.

  **QA Scenarios**:
  ```text
  Scenario: selected worktree CWD launch rule is enforced
    Tool: Bash
    Preconditions: Rust or helper tests exist for launch rules
    Steps:
      1. Run `cargo test -p ymir-ws-server agent:: -- --nocapture`
      2. Assert launch-rule tests verify selected-worktree CWD usage
      3. Save output to `.sisyphus/evidence/task-5-worktree-cwd.txt`
    Expected Result: agent launch helpers always target the selected worktree CWD
    Failure Indicators: fallback to repo root or stale worktree path
    Evidence: .sisyphus/evidence/task-5-worktree-cwd.txt

  Scenario: stale sessions are cleaned on worktree removal/cancel
    Tool: Bash
    Preconditions: lifecycle cleanup tests exist
    Steps:
      1. Run `cargo test -p ymir-ws-server agent:: -- --nocapture`
      2. Assert cancellation/removal tests clear stale process and session state
    Expected Result: no orphaned sessions survive lifecycle cleanup
    Failure Indicators: leaked state maps, stale session metadata, wrong cleanup path
    Evidence: .sisyphus/evidence/task-5-worktree-cwd-negative.txt
  ```

  **Commit**: YES
  - Message: `refactor(agent): define worktree cwd launch rules`
  - Files: lifecycle helper files, `crates/ws-server/src/agent/handler.rs`, related tests
  - Pre-commit: `cargo test -p ymir-ws-server agent:: -- --nocapture`


- [x] 6. Build the Rust ACP bridge and ACP-WS adapter

  **What to do**:
  - Integrate the official Rust ACP crate into `ws-server`.
  - Build a stateless ACP-WS adapter that forwards ACP events onto the WebSocket wire contract from Task 1.
  - Keep launch/bootstrap and protocol translation separate from UI accumulation.
  - Add Rust unit tests around startup, event forwarding, and failure handling.

  **Must NOT do**:
  - Do not accumulate assistant-ui thread state in Rust.
  - Do not assume the Rust SDK provides built-in SSE/HTTP/WebSocket transport.

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Highest-risk protocol and lifecycle seam on the backend.
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 7, 8, 9, 10)
  - **Blocks**: 7, 10, 14
  - **Blocked By**: 1, 5

  **References**:
  - `crates/ws-server/src/agent/acp.rs` - Current custom ACP path being retired.
  - `crates/ws-server/src/agent/mod.rs` - ACP-related exports.
  - `https://github.com/agentclientprotocol/rust-sdk/blob/main/examples/agent.rs` - Official stdio example.
  - `https://github.com/agentclientprotocol/rust-sdk/blob/main/examples/client.rs` - Official client-side example.

  **Acceptance Criteria**:
  - [ ] Rust agent lifecycle uses the official ACP crate.
  - [ ] ACP-WS output matches Task 1 wire events and stays stateless.
  - [ ] Rust tests cover startup, event forwarding, and controlled failures.

  **QA Scenarios**:
  ```text
  Scenario: Rust ACP bridge forwards stateless wire events
    Tool: Bash
    Preconditions: Rust bridge tests exist
    Steps:
      1. Run `cargo test -p ymir-ws-server agent:: -- --nocapture`
      2. Assert ACP bridge tests cover startup and stateless event forwarding
      3. Save output to `.sisyphus/evidence/task-6-rust-acp-ws.txt`
    Expected Result: backend bridge tests pass with official ACP crate in active use
    Failure Indicators: custom handshake path still active, missing event forwarding, startup panic
    Evidence: .sisyphus/evidence/task-6-rust-acp-ws.txt

  Scenario: Rust bridge fails predictably on unsupported startup
    Tool: Bash
    Preconditions: negative startup tests exist
    Steps:
      1. Run `cargo test -p ymir-ws-server agent:: -- --nocapture`
      2. Assert invalid startup cases fail cleanly without leaking state
    Expected Result: backend startup failures are controlled and testable
    Failure Indicators: leaked process, panic, stale session data
    Evidence: .sisyphus/evidence/task-6-rust-acp-ws-negative.txt
  ```

  **Commit**: YES
  - Message: `refactor(ws-server): add stateless acp-ws adapter`
  - Files: `crates/ws-server/src/agent/`, `crates/ws-server/Cargo.toml`
  - Pre-commit: `cargo test -p ymir-ws-server agent:: -- --nocapture`

- [ ] 7. Integrate Rust handlers, router, and persistence with CWD launch

  **What to do**:
  - Route spawn/send/cancel through the new Rust bridge.
  - Enforce that agent processes launch in the selected worktree CWD.
  - Update router/persistence/session metadata for the new bridge path.
  - Add unit tests for CWD launch behavior, cleanup, and state snapshot updates.

  **Must NOT do**:
  - Do not reuse stale worktree paths.
  - Do not preserve orphaned session/process state on cancellation or worktree removal.

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Crosses lifecycle, routing, and persistence boundaries.
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 6, 8, 9, 10)
  - **Blocks**: 10, 13, 14
  - **Blocked By**: 5, 6

  **References**:
  - `crates/ws-server/src/agent/handler.rs` - Current lifecycle routing.
  - `crates/ws-server/src/router.rs` - WebSocket router.
  - `crates/ws-server/src/db/mod.rs` - Session persistence.
  - `crates/ws-server/src/state.rs` - In-memory tracking.

  **Acceptance Criteria**:
  - [ ] Spawn/send/cancel flows operate through the official ACP bridge.
  - [ ] Launch helpers use the selected worktree CWD.
  - [ ] Cleanup and persistence tests cover worktree switch/removal and cancellation.

  **QA Scenarios**:
  ```text
  Scenario: handler/router path uses selected worktree CWD
    Tool: Bash
    Preconditions: Rust handler/router tests exist
    Steps:
      1. Run `cargo test -p ymir-ws-server -- --nocapture`
      2. Assert lifecycle tests verify selected-worktree CWD on launch
      3. Save output to `.sisyphus/evidence/task-7-cwd-launch.txt`
    Expected Result: active lifecycle tests pass with correct worktree launch semantics
    Failure Indicators: repo-root launch, stale path reuse, persistence mismatch
    Evidence: .sisyphus/evidence/task-7-cwd-launch.txt

  Scenario: cancellation/removal cleans state correctly
    Tool: Bash
    Preconditions: cleanup tests exist
    Steps:
      1. Run `cargo test -p ymir-ws-server -- --nocapture`
      2. Assert cancelled/removed worktrees clear process and session state cleanly
    Expected Result: no orphaned process or stale session metadata remains
    Failure Indicators: leaked state map entries or stale DB rows
    Evidence: .sisyphus/evidence/task-7-cwd-launch-negative.txt
  ```

  **Commit**: YES
  - Message: `refactor(ws-server): enforce worktree cwd launch rules`
  - Files: `crates/ws-server/src/agent/handler.rs`, `crates/ws-server/src/router.rs`, `crates/ws-server/src/db/mod.rs`, `crates/ws-server/src/state.rs`
  - Pre-commit: `cargo test -p ymir-ws-server -- --nocapture`

- [x] 8. Build the WS-ACP TypeScript adapter

  **What to do**:
  - Build a stateless TypeScript adapter that decodes WebSocket wire events into ACP event objects for the accumulator.
  - Keep this layer free of app-state ownership and assistant-ui-specific structures.
  - Add focused unit tests for decode, event ordering, and malformed payload handling.

  **Must NOT do**:
  - Do not spread WS-ACP translation across components or hooks.
  - Do not let this layer accumulate thread/card state.

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Focused TypeScript adapter extraction and test work.
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 6, 7, 9, 10)
  - **Blocks**: 9, 10, 11
  - **Blocked By**: 1

  **References**:
  - `apps/web/src/lib/ws.ts` - Current WebSocket decode/dispatch path.
  - `apps/web/src/lib/__tests__/ws.test.ts` - Existing WebSocket test patterns.
  - `apps/web/src/types/generated/protocol.ts` - Current web protocol unions.

  **Acceptance Criteria**:
  - [ ] WS-ACP adapter decodes wire events into adapter-level ACP events.
  - [ ] The adapter remains stateless and assistant-ui-agnostic.
  - [ ] Unit tests cover malformed payloads and ordering-sensitive events.

  **QA Scenarios**:
  ```text
  Scenario: WS-ACP adapter decodes wire events correctly
    Tool: Bash
    Preconditions: adapter and ws tests exist
    Steps:
      1. Run `npm --prefix apps/web run test:run -- src/lib/__tests__/ws.test.ts`
      2. Assert WebSocket payloads become ACP events without accumulated UI state
      3. Save output to `.sisyphus/evidence/task-8-ws-acp-adapter.txt`
    Expected Result: stateless WS-ACP adapter tests pass cleanly
    Failure Indicators: UI-specific accumulation in adapter, decode mismatch, dropped ordering markers
    Evidence: .sisyphus/evidence/task-8-ws-acp-adapter.txt

  Scenario: malformed payloads are rejected safely
    Tool: Bash
    Preconditions: negative adapter tests exist
    Steps:
      1. Run `npm --prefix apps/web run test:run -- src/lib/__tests__/ws.test.ts`
      2. Assert malformed events are ignored or surfaced safely without state mutation
    Expected Result: client remains stable on bad WS-ACP payloads
    Failure Indicators: uncaught exception or accidental state ownership
    Evidence: .sisyphus/evidence/task-8-ws-acp-adapter-negative.txt
  ```

  **Commit**: YES
  - Message: `refactor(web): add stateless ws-acp adapter`
  - Files: `apps/web/src/lib/ws.ts`, adapter helper files, `apps/web/src/lib/__tests__/ws.test.ts`
  - Pre-commit: `npm --prefix apps/web run test:run -- src/lib/__tests__/ws.test.ts`

- [ ] 9. Build the ACP event accumulator

  **What to do**:
  - Implement the connection-scoped ACP event accumulator.
  - Convert ACP events into accumulated message parts, custom cards, and runtime-ready thread state.
  - Enforce flush/rebuild on reconnect and bounded retention.
  - Add reducer/state-transition tests for all supported event categories.

  **Must NOT do**:
  - Do not let accumulator state outlive the connection without explicit rebuild.
  - Do not couple accumulator output to unsupported assistant-ui runtime features.

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Main stateful seam with high parity risk.
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 6, 7, 8, 10)
  - **Blocks**: 10, 11, 12, 15
  - **Blocked By**: 1, 2, 8

  **References**:
  - `apps/web/src/store.ts` - Existing host-owned state.
  - `apps/web/src/hooks/useAgentStatus.ts` - Existing status derivation patterns.
  - `apps/web/src/hooks/__tests__/useAgentStatus.test.ts` - Reducer/selectors test patterns.

  **Acceptance Criteria**:
  - [ ] Accumulator builds runtime-ready thread state from ACP events.
  - [ ] Reconnect flush/rebuild behavior is implemented and tested.
  - [ ] Retention remains bounded and deterministic.

  **QA Scenarios**:
  ```text
  Scenario: accumulator produces stable thread state from ACP events
    Tool: Bash
    Preconditions: accumulator tests exist
    Steps:
      1. Run `npm --prefix apps/web run test:run -- src/hooks/__tests__/useAgentStatus.test.ts`
      2. Assert streaming text, status, tool calls, permission cards, and plan cards accumulate correctly
      3. Save output to `.sisyphus/evidence/task-9-event-accumulator.txt`
    Expected Result: accumulator tests pass with deterministic runtime-ready output
    Failure Indicators: duplicated cards, missing tool updates, wrong status after replay
    Evidence: .sisyphus/evidence/task-9-event-accumulator.txt

  Scenario: reconnect flushes and rebuilds cleanly
    Tool: Bash
    Preconditions: reconnect tests exist
    Steps:
      1. Run `npm --prefix apps/web run test:run -- src/hooks/__tests__/useAgentStatus.test.ts`
      2. Assert reconnect tests clear connection-scoped state and rebuild from incoming events
    Expected Result: reconnect does not leave stale cards or duplicated messages
    Failure Indicators: stale permission prompts, duplicate output, state drift across reconnects
    Evidence: .sisyphus/evidence/task-9-event-accumulator-negative.txt
  ```

  **Commit**: YES
  - Message: `refactor(store): implement acp event accumulator`
  - Files: accumulator files, `apps/web/src/store.ts`, related tests
  - Pre-commit: `npm --prefix apps/web run test:run -- src/hooks/__tests__/useAgentStatus.test.ts`

- [ ] 10. Run the adapter-chain spike and abort checkpoint

  **What to do**:
  - Validate the full chain from Rust ACP bridge through WS-ACP and the accumulator before deep UI work.
  - Confirm assistant-ui still adds net value once the real adapter and accumulator seams exist.
  - Decide continue vs. pivot using the explicit abort conditions in this plan.
  - Capture findings in tests and evidence artifacts rather than hand-wavy notes.

  **Must NOT do**:
  - Do not continue to deep UI work if the adapter chain is already heavier than the value assistant-ui adds.
  - Do not ignore state-ownership drift discovered during the spike.

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: This is the architectural go/no-go checkpoint.
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 6, 7, 8, 9)
  - **Blocks**: 11, 12, 14, 15
  - **Blocked By**: 2, 5, 6, 7, 8, 9

  **References**:
  - `.sisyphus/plans/agent-tab-acp-sdk-migration.md` - Abort conditions and architecture targets.
  - `apps/web/src/lib/ws.ts` - Web transport seam.
  - `apps/web/src/store.ts` - Host-owned state seam.

  **Acceptance Criteria**:
  - [ ] The adapter-chain spike proves the explicit architecture is viable.
  - [ ] Continue/pivot decision is evidenced by test results and not left implicit.
  - [ ] If continuing, assistant-ui value is validated against the real seams.

  **QA Scenarios**:
  ```text
  Scenario: full adapter chain passes spike tests
    Tool: Bash
    Preconditions: Rust and web adapter/accumulator tests exist
    Steps:
      1. Run `cargo test -p ymir-ws-server -- --nocapture`
      2. Run `npm --prefix apps/web run test:run`
      3. Save output to `.sisyphus/evidence/task-10-adapter-spike.txt`
    Expected Result: chain-level contract tests pass and justify proceeding to assistant-ui integration
    Failure Indicators: state duplication, adapter drift, CWD launch failures, missing rebuild guarantees
    Evidence: .sisyphus/evidence/task-10-adapter-spike.txt

  Scenario: abort conditions can be explicitly evaluated
    Tool: Bash
    Preconditions: targeted spike assertions exist
    Steps:
      1. Run targeted adapter/accumulator test subsets
      2. Assert results are sufficient to answer continue vs. pivot
    Expected Result: the architecture checkpoint is evidence-backed and binary
    Failure Indicators: unresolved ambiguity about assistant-ui value after spike
    Evidence: .sisyphus/evidence/task-10-adapter-spike-negative.txt
  ```

  **Commit**: YES
  - Message: `test(adapter): validate anti-lock-in chain spike`
  - Files: relevant Rust/web test files and tiny supporting helpers
  - Pre-commit: `cargo test -p ymir-ws-server -- --nocapture && npm --prefix apps/web run test:run`


- [ ] 11. Wire `assistant-ui` through `ExternalStoreRuntime`

  **What to do**:
  - Integrate `assistant-ui` using `ExternalStoreRuntime` fed from the accumulator output.
  - Keep Ymir shell, worktree selection, and tab/session ownership outside the runtime.
  - Build the first compact developer-focused session shell around the real adapter chain.
  - Add unit tests for runtime wiring and render-only ownership.

  **Must NOT do**:
  - Do not use assistant-ui built-in backend runtimes.
  - Do not let runtime wiring become a second source of canonical state.

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: UI integration work with strong runtime-boundary constraints.
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with Tasks 12, 13, 14, 15)
  - **Blocks**: 12, 13, 15
  - **Blocked By**: 2, 3, 8, 9, 10

  **References**:
  - `apps/web/src/components/layout/AppShell.tsx` - Shell that remains authoritative.
  - `apps/web/src/components/main/MainPanel.tsx` - Panel composition that remains authoritative.
  - `apps/web/src/store.ts` - Host-owned worktree/tab/session state.
  - `https://www.assistant-ui.com/docs/runtimes/pick-a-runtime` - `ExternalStoreRuntime` guidance.

  **Acceptance Criteria**:
  - [ ] `assistant-ui` is wired through `ExternalStoreRuntime` only.
  - [ ] Worktree/tab/session ownership remains in Ymir.
  - [ ] Runtime wiring tests prove render-only ownership.

  **QA Scenarios**:
  ```text
  Scenario: assistant-ui runtime wiring uses external store only
    Tool: Bash
    Preconditions: runtime wiring tests exist
    Steps:
      1. Run `npm --prefix apps/web run test:run -- src/components/agent/__tests__/AgentPane.test.tsx`
      2. Assert assistant-ui integration reads accumulated state without owning session truth
      3. Save output to `.sisyphus/evidence/task-11-external-store-runtime.txt`
    Expected Result: runtime wiring tests pass with Ymir retaining canonical state ownership
    Failure Indicators: assistant-ui runtime mutates worktree/tab/session truth or bypasses accumulator
    Evidence: .sisyphus/evidence/task-11-external-store-runtime.txt

  Scenario: runtime reconnect uses rebuilt accumulator output
    Tool: Bash
    Preconditions: reconnect/runtime tests exist
    Steps:
      1. Run `npm --prefix apps/web run test:run -- src/components/agent/__tests__/AgentPane.test.tsx`
      2. Assert rebuilt accumulator state is accepted by the runtime without stale UI state leakage
    Expected Result: reconnect produces clean rendering from rebuilt data
    Failure Indicators: stale UI state survives reconnect or runtime drift appears
    Evidence: .sisyphus/evidence/task-11-external-store-runtime-negative.txt
  ```

  **Commit**: YES
  - Message: `refactor(agent-ui): wire assistant-ui through external store`
  - Files: assistant-ui runtime wrapper files, `apps/web/src/components/agent/AgentPane.tsx`, related tests
  - Pre-commit: `npm --prefix apps/web run test:run -- src/components/agent/__tests__/AgentPane.test.tsx`

- [ ] 12. Build compact custom event cards

  **What to do**:
  - Implement compact custom cards for permissions, tools, plans, and status updates on top of assistant-ui primitives.
  - Keep the styling dense and developer-tool oriented.
  - Render permission prompts first as custom event cards using accumulator output.
  - Add unit tests for card rendering and event-action dispatch.

  **Must NOT do**:
  - Do not fall back to generic consumer-chat visuals.
  - Do not force permissions into assistant-ui built-in tool approval in the first cut.

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: Compact UX rendering work tied to custom message parts/cards.
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with Tasks 11, 13, 14, 15)
  - **Blocks**: 13, 15
  - **Blocked By**: 2, 4, 9, 10, 11

  **References**:
  - `apps/web/src/components/agent/AgentChat.tsx` - Existing minimal chat surface being replaced.
  - `https://github.com/assistant-ui/assistant-ui` - Custom message-part and card rendering primitives.
  - `https://www.agentpane.dev/` - Compact developer-agent interaction reference.

  **Acceptance Criteria**:
  - [ ] Permission, tool, plan, and status cards render compactly from accumulator output.
  - [ ] Permission card actions dispatch correctly.
  - [ ] Unit tests cover card rendering and fallback behavior.

  **QA Scenarios**:
  ```text
  Scenario: compact custom cards render from accumulator output
    Tool: Bash
    Preconditions: event-card rendering tests exist
    Steps:
      1. Run `npm --prefix apps/web run test:run -- src/components/agent/__tests__/AgentChat.test.tsx`
      2. Assert permission/tool/plan/status cards render compactly and correctly
      3. Save output to `.sisyphus/evidence/task-12-event-cards.txt`
    Expected Result: card rendering tests pass with compact ACP-specific UI
    Failure Indicators: generic chat rendering, missing actions, invalid card grouping
    Evidence: .sisyphus/evidence/task-12-event-cards.txt

  Scenario: permission cards dispatch safe actions only
    Tool: Bash
    Preconditions: permission action tests exist
    Steps:
      1. Run `npm --prefix apps/web run test:run -- src/components/agent/__tests__/AgentChat.test.tsx`
      2. Assert permission actions dispatch correctly and unknown actions fail safely
    Expected Result: permission cards are interactive but controlled
    Failure Indicators: wrong dispatch payloads or unsafe fallback behavior
    Evidence: .sisyphus/evidence/task-12-event-cards-negative.txt
  ```

  **Commit**: YES
  - Message: `refactor(agent-ui): add compact acp event cards`
  - Files: `apps/web/src/components/agent/AgentChat.tsx`, card component files, related tests
  - Pre-commit: `npm --prefix apps/web run test:run -- src/components/agent/__tests__/AgentChat.test.tsx`

- [ ] 13. Preserve worktree/tab/diff/editor/terminal integration

  **What to do**:
  - Keep the new assistant-ui session surface interoperable with existing worktree tabs and adjacent diff/editor/terminal flows.
  - Update tab orchestration to work with accumulator-backed sessions.
  - Add unit tests for worktree scoping and cross-panel tab behavior.

  **Must NOT do**:
  - Do not redesign unrelated project or terminal panels.
  - Do not let diff/editor actions corrupt session truth.

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Integration glue across a small number of UI/state files.
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with Tasks 11, 12, 14, 15)
  - **Blocks**: 14, 15
  - **Blocked By**: 5, 7, 11, 12

  **References**:
  - `apps/web/src/components/agent/AgentPane.tsx` - Existing worktree/tab seam.
  - `apps/web/src/components/project/ChangesTab.tsx` - Diff-tab creation.
  - `apps/web/src/components/editor/DiffTab.tsx` - Existing diff rendering.
  - `apps/web/src/components/terminal/TerminalPane.tsx` - Adjacent terminal surface.

  **Acceptance Criteria**:
  - [ ] Agent/diff/editor/terminal coexist correctly under worktree-scoped tab management.
  - [ ] Cross-panel actions keep the correct worktree/session context.
  - [ ] Unit tests cover tab coexistence and active-tab behavior.

  **QA Scenarios**:
  ```text
  Scenario: worktree tabs coexist across agent, diff, editor, and terminal
    Tool: Bash
    Preconditions: pane integration tests exist
    Steps:
      1. Run `npm --prefix apps/web run test:run -- src/components/agent/__tests__/AgentPane.test.tsx`
      2. Assert tab coexistence and switching remain deterministic for one worktree
      3. Save output to `.sisyphus/evidence/task-13-worktree-integration.txt`
    Expected Result: pane integration tests pass with no session-truth corruption
    Failure Indicators: wrong active tab, wrong worktree routing, broken diff/editor coexistence
    Evidence: .sisyphus/evidence/task-13-worktree-integration.txt

  Scenario: cross-panel actions preserve correct session context
    Tool: Bash
    Preconditions: targeted integration tests exist
    Steps:
      1. Run `npm --prefix apps/web run test:run -- src/components/agent/__tests__/AgentPane.test.tsx`
      2. Assert diff/editor open actions preserve the correct worktree/session mapping
    Expected Result: cross-panel actions stay additive and deterministic
    Failure Indicators: session corruption or wrong worktree routing
    Evidence: .sisyphus/evidence/task-13-worktree-integration-negative.txt
  ```

  **Commit**: YES
  - Message: `refactor(agent-pane): preserve worktree and panel integration`
  - Files: `apps/web/src/components/agent/AgentPane.tsx`, related panel files, relevant tests
  - Pre-commit: `npm --prefix apps/web run test:run -- src/components/agent/__tests__/AgentPane.test.tsx`

- [ ] 14. Retire the obsolete custom ACP path and stale bindings

  **What to do**:
  - Remove or quarantine the old custom ACP implementation once the new chain is active.
  - Delete stale helpers, fixtures, and bindings tied only to the retired path.
  - Keep the surviving protocol/binding files aligned with the rewritten contract.

  **Must NOT do**:
  - Do not remove coverage for active migrated behavior.
  - Do not leave dead custom ACP code in the active execution path.

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Cleanup spans both Rust and TypeScript and can easily regress the migration.
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with Tasks 11, 12, 13, 15)
  - **Blocks**: 15
  - **Blocked By**: 6, 7, 10, 13

  **References**:
  - `crates/ws-server/src/agent/acp.rs` - Legacy custom ACP path.
  - `apps/web/src/types/generated/protocol.ts` - Current web bindings to update or rewrite.
  - `crates/ws-server/src/test_fixtures.rs` - Existing legacy fixtures.
  - `apps/web/src/test/fixtureValidator.test.ts` - Existing fixture validation patterns.

  **Acceptance Criteria**:
  - [ ] No active production path depends on the retired custom ACP implementation.
  - [ ] Stale fixtures/tests/bindings are removed or rewritten.
  - [ ] Final bindings match the rewritten WS-ACP contract.

  **QA Scenarios**:
  ```text
  Scenario: obsolete custom ACP path is no longer active
    Tool: Bash
    Preconditions: cleanup is complete and tests updated
    Steps:
      1. Run `cargo test -p ymir-ws-server -- --nocapture`
      2. Run `npm --prefix apps/web run test:run`
      3. Save output to `.sisyphus/evidence/task-14-cleanup.txt`
    Expected Result: full suites pass with the obsolete custom ACP path retired
    Failure Indicators: unresolved imports, stale fixtures, or hidden dependency on old ACP path
    Evidence: .sisyphus/evidence/task-14-cleanup.txt

  Scenario: rewritten bindings reject legacy-only assumptions
    Tool: Bash
    Preconditions: fixture validation tests exist
    Steps:
      1. Run `npm --prefix apps/web run test:run -- src/test/fixtureValidator.test.ts`
      2. Assert legacy-only payload expectations are gone
    Expected Result: fixture validation aligns with the rewritten contract
    Failure Indicators: validation still depends on retired custom event names
    Evidence: .sisyphus/evidence/task-14-cleanup-negative.txt
  ```

  **Commit**: YES
  - Message: `refactor(acp): remove retired custom path`
  - Files: retired ACP Rust files, bindings, fixtures, related tests
  - Pre-commit: `cargo test -p ymir-ws-server -- --nocapture && npm --prefix apps/web run test:run`

- [ ] 15. Add reconnect/rebuild/error regression coverage and full sweep

  **What to do**:
  - Add final unit coverage for reconnect, rebuild, cancellation, error envelopes, and parity-critical flows.
  - Run targeted and full unit suites for Rust and web.
  - Capture evidence that the anti-lock-in chain preserves parity within the unit-test-only scope.

  **Must NOT do**:
  - Do not leave reconnect or rebuild behavior untested.
  - Do not leave parity-critical flows implied instead of verified.

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Final consolidation of coverage and evidence.
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with Tasks 11, 12, 13, 14)
  - **Blocks**: F1, F2, F3, F4
  - **Blocked By**: 9, 10, 11, 12, 13, 14

  **References**:
  - `apps/web/package.json` - Web unit commands.
  - `apps/web/vitest.config.ts` - Web test runner config.
  - `crates/ws-server/Cargo.toml` - Rust package under test.
  - `apps/web/src/components/agent/__tests__/AgentPane.test.tsx` - Pane regression suite.
  - `apps/web/src/components/agent/__tests__/AgentChat.test.tsx` - Chat/event-card suite.
  - `apps/web/src/hooks/__tests__/useAgentStatus.test.ts` - Store/accumulator suite.
  - `apps/web/src/lib/__tests__/ws.test.ts` - WS adapter suite.

  **Acceptance Criteria**:
  - [ ] Full Rust unit suite passes.
  - [ ] Full web unit suite passes.
  - [ ] Reconnect/rebuild/error flows are explicitly covered.

  **QA Scenarios**:
  ```text
  Scenario: full Rust and web suites pass
    Tool: Bash
    Preconditions: all migration tasks are complete
    Steps:
      1. Run `cargo test -p ymir-ws-server`
      2. Run `npm --prefix apps/web run test:run`
      3. Save output to `.sisyphus/evidence/task-15-full-regression.txt`
    Expected Result: both full suites pass with zero failures
    Failure Indicators: any failing Rust/web unit test or reconnect parity regression
    Evidence: .sisyphus/evidence/task-15-full-regression.txt

  Scenario: targeted anti-lock-in seams pass in isolation
    Tool: Bash
    Preconditions: targeted suites remain available
    Steps:
      1. Run `npm --prefix apps/web run test:run -- src/lib/__tests__/ws.test.ts src/hooks/__tests__/useAgentStatus.test.ts src/components/agent/__tests__/AgentPane.test.tsx src/components/agent/__tests__/AgentChat.test.tsx`
      2. Run `cargo test -p ymir-ws-server agent:: protocol::`
      3. Save output to `.sisyphus/evidence/task-15-targeted-regression.txt`
    Expected Result: critical adapter/accumulator/runtime seams pass independently
    Failure Indicators: hidden dependency between seams or reconnect parity breakage
    Evidence: .sisyphus/evidence/task-15-targeted-regression.txt
  ```

  **Commit**: YES
  - Message: `test(agent): cover reconnect and parity regressions`
  - Files: affected Rust/web test files and tiny supporting fixes
  - Pre-commit: `cargo test -p ymir-ws-server && npm --prefix apps/web run test:run`

---

## Final Verification Wave

> 4 review agents run in parallel. All must approve. Present consolidated results and wait for explicit user okay.

- [ ] F1. **Plan Compliance Audit** - `oracle`
  Verify the delivered system preserves the explicit adapter chain, keeps accumulation only in the ACP event accumulator, launches agents in the selected worktree CWD, and avoids assistant-ui state ownership drift.

- [ ] F2. **Code Quality Review** - `unspecified-high`
  Run `cargo test -p ymir-ws-server`, `npm --prefix apps/web run test:run`, and inspect touched Rust/TypeScript files for dead custom ACP paths, weak typing, or accidental state duplication.

- [ ] F3. **Unit-Verification Execution** - `unspecified-high`
  Execute every task-level QA scenario and confirm evidence files exist under `.sisyphus/evidence/`.

- [ ] F4. **Scope Fidelity Check** - `deep`
  Confirm the work stayed within ACP bridge, adapter chain, accumulator, assistant-ui integration, and worktree-CWD lifecycle scope.

---

## Commit Strategy

- **Wave 1**: `refactor(protocol): define anti-lock-in acp contracts`
- **Wave 2**: `refactor(adapter): build stateless acp wire layers`
- **Wave 3**: `refactor(agent-ui): wire assistant-ui through accumulator`
- **Final cleanup**: `test(agent): cover reconnect and parity regressions`

---

## Success Criteria

### Verification Commands
```bash
cargo test -p ymir-ws-server
npm --prefix apps/web run test:run
```

### Final Checklist
- [ ] All Must Have items are present
- [ ] All Must NOT Have items remain absent
- [ ] Rust bridge uses the official ACP crate in the active path
- [ ] Rust and TypeScript adapters remain stateless
- [ ] ACP event accumulator is rebuildable and connection-scoped only
- [ ] Agent launch uses the selected worktree CWD
- [ ] `assistant-ui` consumes accumulated state via `ExternalStoreRuntime`
- [ ] All unit tests pass
