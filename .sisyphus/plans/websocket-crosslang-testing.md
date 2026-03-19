# Cross-Language WebSocket Testing: ts-rs + Binary Fixtures

## TL;DR
> Implement **ts-rs** for automatic TypeScript type generation from Rust, combined with **binary fixture tests** to validate MessagePack serialization compatibility. Each message type will be discovered individually by analyzing actual usage in both Rust and TypeScript codebases.
>
> **Deliverables**:
> - ts-rs integration in Rust WebSocket server
> - Generated TypeScript types from Rust protocol definitions (42+ types)
> - Binary fixture generator (Rust → .msgpack files)
> - Binary fixture validator (TypeScript decodes fixtures)
> - Migration of manual TS types to generated types
> - Documentation update
>
> **Estimated Effort**: Medium (2-3 days)
> **Parallel Execution**: YES - types can be processed in parallel groups
> **Critical Path**: Setup ts-rs → Discover types (per-type subagent sessions) → Generate → Create fixtures → Validate → Replace manual types

---

## Context

### Original Request
Prevent schema drift between Rust and TypeScript WebSocket message types while avoiding the need to run both servers for every test.

### Current State
**42+ message types** in:
- Rust: `crates/ws-server/src/protocol.rs`
- TypeScript: `apps/web/src/types/protocol.ts`

**Serialization**: MessagePack via `rmp-serde` (Rust) and `@msgpack/msgpack` (TypeScript)

**Key Decision**: Start from Rust protocol types as base. For each type, discover actual usage in BOTH Rust and TypeScript to determine correct schema.

### Discovery Approach
Instead of upfront drift resolution, each type will be processed via **individual subagent sessions** that:
1. **Discover**: Find how the type is USED in Rust code (serialization, handlers, etc.)
2. **Discover**: Find how the type is USED in TypeScript code (API calls, state updates, etc.)
3. **Analyze**: Identify ALL requirements from both sides
4. **Synthesize**: Determine the correct, unified schema
5. **Generate**: Create ts-rs derive macro and TypeScript output

---

## Work Objectives

### Core Objective
Establish compile-time guarantee that TypeScript types match Rust types, with runtime validation that MessagePack serialization is byte-compatible, discovered through actual usage analysis.

### Concrete Deliverables
1. **ts-rs integration**: Generate TypeScript from Rust protocol types
2. **Per-type discovery**: 42+ subagent sessions analyzing usage
3. **Binary fixture system**: Generate and validate MessagePack payloads
4. **Type migration**: Replace manual TS types with generated ones
5. **Documentation**: Update with new workflow

### Definition of Done
- [ ] `cargo test` passes (Rust fixtures validate)
- [ ] `npm run test:run` passes (TypeScript fixtures validate)
- [ ] All 42+ types generate successfully from usage-discovered schemas
- [ ] Binary round-trip test: Rust → MessagePack → TypeScript → MessagePack → Rust succeeds
- [ ] Manual TypeScript types replaced with generated ones

### Must Have
- ts-rs integration in Rust
- Per-type discovery sessions (42+ subagents)
- Binary fixture generator in Rust
- Binary fixture validator in TypeScript
- Atomic migration (no partial state)

### Must NOT Have (Guardrails)
- Upfront drift resolution before discovery
- Changes to MessagePack serialization logic
- Refactoring of protocol module structure
- Addition of new message types during migration
- Generation of types outside protocol.rs
- REST API type migration
- JSON Schema generation
- Protocol version compatibility checks

---

## Verification Strategy

### Test Decision
- **Infrastructure exists**: YES (Vitest + cargo test)
- **Automated tests**: YES (tests-after for new fixtures, existing tests must pass)
- **Framework**: Vitest (TS), cargo test (Rust)
- **Agent-Executed QA**: MANDATORY for all tasks

### QA Policy
Every task includes agent-executed scenarios:
- **Rust side**: Compile, run unit tests, verify fixture generation
- **TypeScript side**: Run Vitest, verify fixture validation, check type generation
- **Evidence**: `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Foundation - can start immediately):
├── Task 1: Add ts-rs dependency to Rust
├── Task 2: Create binary fixture infrastructure (Rust generator)
└── Task 3: Create TypeScript fixture validator

Wave 2 (Per-Type Discovery - 9 sub-waves, max 5 agents at a time):
├── Wave 2.1 (5 agents max):
│   ├── Task 4: WorkspaceCreate
│   ├── Task 5: WorkspaceDelete
│   ├── Task 6: WorkspaceRename
│   ├── Task 7: WorkspaceUpdate
│   └── Task 8: WorktreeCreate
├── Wave 2.2 (5 agents max):
│   ├── Task 9: WorktreeDelete
│   ├── Task 10: WorktreeMerge
│   ├── Task 11: WorktreeList
│   ├── Task 12: AgentSpawn
│   └── Task 13: AgentSend
├── Wave 2.3 (5 agents max):
│   ├── Task 14: AgentCancel
│   ├── Task 15: AgentStatusUpdate
│   ├── Task 16: AgentOutput
│   ├── Task 17: AgentPrompt
│   └── Task 18: TerminalInput
├── Wave 2.4 (5 agents max):
│   ├── Task 19: TerminalResize
│   ├── Task 20: TerminalCreate
│   ├── Task 21: TerminalKill
│   ├── Task 22: TerminalOutput
│   └── Task 23: TerminalCreated
├── Wave 2.5 (5 agents max):
│   ├── Task 24: FileRead
│   ├── Task 25: FileWrite
│   ├── Task 26: FileContent
│   ├── Task 27: GitStatus
│   └── Task 28: GitDiff
├── Wave 2.6 (5 agents max):
│   ├── Task 29: GitCommit
│   ├── Task 30: GitStatusResult
│   ├── Task 31: GitDiffResult
│   ├── Task 32: CreatePR
│   └── Task 33: StateSnapshot
├── Wave 2.7 (5 agents max):
│   ├── Task 34: GetState
│   ├── Task 35: UpdateSettings
│   ├── Task 36: Ping
│   └── Task 37: Pong
├── Wave 2.8 (5 agents max):
│   ├── Task 38: Ack
│   ├── Task 39: Error
│   ├── Task 40: Notification
│   └── Task 41: WorkspaceCreated
└── Wave 2.9 (2 agents):
    ├── Task 42: WorkspaceDeleted
    ├── Task 43: WorkspaceUpdated
    ├── Task 44: WorktreeCreated
    └── Task 45: WorktreeDeleted

Wave 3 (Fixture Verification - after Wave 2):
└── Task 46: Verify all fixtures created and valid

Wave 4 (Migration - after Wave 3):
├── Task 47: Update TypeScript imports
├── Task 48: Atomic replacement of manual types
└── Task 49: Remove manual protocol.ts

Wave 5 (Finalization - after Wave 4):
└── Task 50: Documentation update

Wave FINAL (Verification):
├── Task F1: Full test suite pass (oracle)
├── Task F2: Schema drift check (deep)
└── Task F3: Manual QA validation (unspecified-high)
```

### Dependency Matrix

**Wave 1** (Foundation):
- Task 1 (ts-rs setup) → Blocks all type generation
- Task 2 (fixture infra) → Blocks Tasks 4-45
- Task 3 (validator) → Blocks Tasks 4-45

**Wave 2** (Per-Type Discovery + Fixture Creation - Parallel Groups):
- Tasks 4-45 can run in parallel (each type independent)
- **MAX 5 agents at a time** (resource constraint)
- Each task self-contained: discover → synthesize → create schema → create fixture → validate
- Groups of 5 types will be dispatched in waves:
  - Wave 2.1: Tasks 4-8 (5 types)
  - Wave 2.2: Tasks 9-13 (5 types)
  - Wave 2.3: Tasks 14-18 (5 types)
  - Wave 2.4: Tasks 19-23 (5 types)
  - Wave 2.5: Tasks 24-28 (5 types)
  - Wave 2.6: Tasks 29-33 (5 types)
  - Wave 2.7: Tasks 34-37 (4 types)
  - Wave 2.8: Tasks 38-41 (4 types)
  - Wave 2.9: Tasks 42-45 (4 types)

**Wave 3** (Fixture Verification):
- All Wave 2 tasks → Block Task 46
- Task 46 verifies all fixtures exist and are valid

**Wave 4** (Migration):
- Task 46 → Blocks Task 47-49

**Wave 5** (Finalization):
- All previous → Blocks Task 50

### Agent Dispatch Summary

**Wave 1**: 3 tasks → `quick` (dependency setup) - **3 agents**
**Wave 2**: 42 tasks → `quick` (per-type discovery + fixture creation) - **MAX 5 agents at a time, 9 sub-waves**
**Wave 3**: 1 task → `unspecified-low` (fixture verification) - **1 agent**
**Wave 4**: 3 tasks → `unspecified-low` (refactoring) - **3 agents**
**Wave 5**: 1 task → `writing` (documentation) - **1 agent**
**FINAL**: 3 tasks → `oracle`, `deep`, `unspecified-high` - **3 agents**

**Total Agent Usage**: Never exceeds 5 concurrent agents

---

## TODOs

### Wave 1: Foundation

- [ ] 1. Add ts-rs dependency to Rust

  **What to do**:
  - Add `ts-rs = "10.0"` to `crates/ws-server/Cargo.toml` dev-dependencies
  - Add feature flags: `export = true`, `serde-compat = true`
  - Run `cargo check` to verify dependency resolves

  **Must NOT do**:
  - Do not derive TS on any types yet
  - Do not modify protocol.rs

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []
  - **Rationale**: Simple dependency addition

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1
  - **Blocks**: Tasks 2-50
  - **Blocked By**: None

  **References**:
  - `crates/ws-server/Cargo.toml` - Where to add dependency
  - https://docs.rs/ts-rs/latest/ts_rs/ - ts-rs documentation

  **Acceptance Criteria**:
  - [ ] `cargo check -p ymir-ws-server` passes
  - [ ] ts-rs available in Rust codebase

  **QA Scenarios**:
  ```
  Scenario: Dependency resolves
    Tool: Bash
    Steps:
      1. cd /home/blake/Documents/software/ymir/crates/ws-server
      2. cargo check
    Expected Result: Compiles without errors
    Evidence: .sisyphus/evidence/task-1-cargo-check.txt
  ```

  **Commit**: YES
  - Message: `chore(deps): add ts-rs for TypeScript generation`
  - Files: `crates/ws-server/Cargo.toml`

- [ ] 2. Create binary fixture infrastructure (Rust module)

  **What to do**:
  - Create `crates/ws-server/src/test_fixtures.rs` module
  - Implement helper functions for fixture generation:
    - `fixture_dir() -> PathBuf` - Returns path to `test-fixtures/` directory
    - `write_fixture<T: Serialize>(name: &str, data: &T) -> Result<PathBuf>` - Serializes to MessagePack and writes to file
  - Add `#[cfg(test)]` module with `use super::*;`
  - Create `test-fixtures/` directory in project root
  - Add `test-fixtures/` to `.gitignore`

  **Must NOT do**:
  - Do NOT create a `generate_fixtures()` function that generates all fixtures at once
  - Do NOT generate any actual fixtures yet (each type task creates its own)
  - Do not commit binary files

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []
  - **Rationale**: Infrastructure setup only

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Task 3)
  - **Parallel Group**: Wave 1
  - **Blocks**: Tasks 4-45 (provides infrastructure they use)
  - **Blocked By**: Task 1

  **References**:
  - `crates/ws-server/src/protocol.rs` - Serialization patterns to follow
  - `crates/ws-server/src/protocol.rs` - Existing serialization tests (lines ~900-1100)

  **Acceptance Criteria**:
  - [ ] `test_fixtures.rs` module created with helper functions
  - [ ] Module compiles: `cargo check --lib` passes
  - [ ] `test-fixtures/` directory created
  - [ ] `test-fixtures/` added to `.gitignore`
  - [ ] `write_fixture()` function can serialize any MessagePack-serializable type

  **QA Scenarios**:
  ```
  Scenario: Infrastructure compiles
    Tool: Bash
    Steps:
      1. cargo check --lib
      2. cargo test --lib test_fixtures --no-run
    Expected Result: Compiles successfully
    Evidence: .sisyphus/evidence/task-2-compile.txt
  
  Scenario: write_fixture helper works
    Tool: Bash
    Steps:
      1. Add temporary test using write_fixture
      2. cargo test --lib test_fixtures
    Expected Result: Test passes, file created
    Evidence: .sisyphus/evidence/task-2-helper.txt
  ```

  **Commit**: YES (group with Task 3)
  - Message: `test: add binary fixture infrastructure`
  - Files: 
    - `crates/ws-server/src/test_fixtures.rs`
    - `crates/ws-server/src/lib.rs` (add module)
    - `.gitignore`

- [ ] 3. Create TypeScript fixture validator

  **What to do**:
  - Create `apps/web/src/test/fixtureValidator.ts`
  - Implement `validateFixture(filePath: string)` that:
    - Reads MessagePack binary file
    - Decodes using @msgpack/msgpack
    - Validates against TypeScript types (using type guards)
    - Returns pass/fail with details
  - Add Vitest test file `fixtureValidator.test.ts`

  **Must NOT do**:
  - Do not validate actual fixtures yet (no fixtures exist)
  - Do not modify existing protocol.ts yet

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []
  - **Rationale**: Infrastructure setup

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Task 2)
  - **Parallel Group**: Wave 1
  - **Blocks**: Task 46
  - **Blocked By**: None

  **References**:
  - `apps/web/src/types/protocol.ts` - Type guards to use
  - `apps/web/src/lib/ws.ts` - MessagePack decode pattern
  - `apps/web/src/types/__tests__/protocol.test.ts` - Test patterns

  **Acceptance Criteria**:
  - [ ] `fixtureValidator.ts` created
  - [ ] `npm run test:run fixtureValidator` passes
  - [ ] Handles missing files gracefully

  **QA Scenarios**:
  ```
  Scenario: Validator handles missing file
    Tool: Bash
    Steps:
      1. npm run test:run fixtureValidator
    Expected Result: Tests pass (handles missing fixtures)
    Evidence: .sisyphus/evidence/task-3-validator.txt
  ```

  **Commit**: YES (group with Task 2)
  - Message: `test: add TypeScript fixture validator`

---

### Wave 2: Per-Type Discovery (Parallel Groups)

**Note**: Tasks 4-45 follow the same pattern. Each type is **self-contained** - it discovers usage, creates the schema, AND generates its own fixture. Each task can run in parallel with other type tasks.

**Subagent Session Pattern for Each Type** (5 steps):
```
session_id = task(
  subagent_type="quick",
  prompt="Discover, generate, and create fixture for {TYPE_NAME}:\n\n" +
         "STEP 1 - Discover Rust usage:\n" +
         "   - Read protocol.rs definition\n" +
         "   - Find handlers using this type (grep/router.rs)\n" +
         "   - Find serialization/deserialization code\n\n" +
         "STEP 2 - Discover TypeScript usage:\n" +
         "   - Read protocol.ts definition\n" +
         "   - Find API calls (grep api.ts)\n" +
         "   - Find state updates (grep store.ts)\n" +
         "   - Find UI components using this type\n\n" +
         "STEP 3 - Synthesize type definition:\n" +
         "   - List ALL required fields from both sides\n" +
         "   - Note optional vs required\n" +
         "   - Identify discrepancies\n" +
         "   - Determine unified schema\n\n" +
         "STEP 4 - Create schema:\n" +
         "   - Add #[derive(TS)] to Rust type (or create if missing)\n" +
         "   - Configure ts-rs attributes for naming\n" +
         "   - Generate TypeScript output\n\n" +
         "STEP 5 - Create fixture:\n" +
         "   - Add test case to test_fixtures.rs for this type\n" +
         "   - Generate sample MessagePack binary\n" +
         "   - Save to test-fixtures/{TYPE_NAME}.msgpack\n" +
         "   - Validate TypeScript can decode\n\n" +
         "Return: file paths modified, fields discovered, fixture path"
)
```

- [ ] 4. WorkspaceCreate - Discover, generate schema, and create fixture

  **What to do**:
  - Spawn subagent session to:
    1. **Discover**: Find WorkspaceCreate usage in Rust (protocol.rs, router.rs) and TypeScript (protocol.ts, api.ts, store.ts)
    2. **Synthesize**: Analyze requirements from both sides, determine unified schema
    3. **Create Schema**: Add `#[derive(TS)]` to WorkspaceCreate struct in Rust, generate TypeScript type
    4. **Create Fixture**: Add test case to `test_fixtures.rs`, generate MessagePack binary to `test-fixtures/WorkspaceCreate.msgpack`
    5. **Validate**: Ensure TypeScript can decode the fixture

  **Must NOT do**:
  - Do not replace manual TS type yet (just generate alongside)
  - Do not modify other types

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []
  - **Rationale**: Requires understanding usage patterns across languages

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 5-45)
  - **Parallel Group**: Wave 2 Group A
  - **Blocks**: None (independent - each task creates its own fixture)
  - **Blocked By**: Task 1 (ts-rs must be available)

  **Subagent Session**:
  ```
  Task: WorkspaceCreate - Full pipeline
  
  Step 1 - Discover Rust:
  - Read protocol.rs WorkspaceCreate definition
  - Find handlers: grep -r "WorkspaceCreate" crates/ws-server/src/
  - Check serialization in router.rs
  
  Step 2 - Discover TypeScript:
  - Read protocol.ts WorkspaceCreate definition
  - Find API calls: grep -r "WorkspaceCreate" apps/web/src/
  - Check store.ts for state updates
  
  Step 3 - Synthesize:
  - List ALL required fields from both sides
  - Note optional vs required
  - Determine unified schema
  
  Step 4 - Create Schema:
  - Add #[derive(TS, Serialize, Deserialize)] to Rust struct
  - Run cargo test to generate TypeScript
  - Validate output matches requirements
  
  Step 5 - Create Fixture:
  - Add test case to test_fixtures.rs
  - Generate MessagePack binary
  - Save to test-fixtures/WorkspaceCreate.msgpack
  - Validate TypeScript can decode
  ```

  **References**:
  - `crates/ws-server/src/protocol.rs` - Search "WorkspaceCreate"
  - `apps/web/src/types/protocol.ts` - Search "WorkspaceCreate"
  - `apps/web/src/lib/api.ts` - API usage
  - `crates/ws-server/src/test_fixtures.rs` - Add fixture here

  **Acceptance Criteria**:
  - [ ] Rust type has #[derive(TS)]
  - [ ] TypeScript type generated in `apps/web/src/types/generated/`
  - [ ] Binary fixture exists at `test-fixtures/WorkspaceCreate.msgpack`
  - [ ] TypeScript validator can decode the fixture

  **QA Scenarios**:
  ```
  Scenario: Generated type matches manual type
    Tool: Bash + diff
    Steps:
      1. Run cargo test to generate TS
      2. Compare generated vs manual WorkspaceCreate
    Expected Result: Structural match
    Evidence: .sisyphus/evidence/task-4-workspace-create.txt
  
  Scenario: Fixture created and valid
    Tool: Bash
    Steps:
      1. ls -la test-fixtures/WorkspaceCreate.msgpack
      2. npm run test:run -- fixtureValidator.test.ts -t "WorkspaceCreate"
    Expected Result: File exists and validates
    Evidence: .sisyphus/evidence/task-4-workspace-create-fixture.txt
  ```

  **Commit**: NO (group with Wave 2 completion)

- [ ] 5. WorkspaceDelete - Discover usage and generate schema
  **Pattern**: Same as Task 4 for WorkspaceDelete
  **Parallel Group**: Wave 2 Group A

- [ ] 6. WorkspaceRename - Discover usage and generate schema
  **Pattern**: Same as Task 4 for WorkspaceRename
  **Parallel Group**: Wave 2 Group A

- [ ] 7. WorkspaceUpdate - Discover usage and generate schema
  **Pattern**: Same as Task 4 for WorkspaceUpdate
  **Parallel Group**: Wave 2 Group A

- [ ] 8. WorktreeCreate - Discover usage and generate schema
  **Pattern**: Same as Task 4 for WorktreeCreate
  **Parallel Group**: Wave 2 Group A

- [ ] 9. WorktreeDelete - Discover usage and generate schema
  **Pattern**: Same as Task 4 for WorktreeDelete
  **Parallel Group**: Wave 2 Group A

- [ ] 10. WorktreeMerge - Discover usage and generate schema
  **Pattern**: Same as Task 4 for WorktreeMerge
  **Parallel Group**: Wave 2 Group A

- [ ] 11. WorktreeList - Discover usage and generate schema
  **Pattern**: Same as Task 4 for WorktreeList
  **Parallel Group**: Wave 2 Group A

- [ ] 12. AgentSpawn - Discover usage and generate schema
  **Pattern**: Same as Task 4 for AgentSpawn
  **Parallel Group**: Wave 2 Group A

- [ ] 13. AgentSend - Discover usage and generate schema
  **Pattern**: Same as Task 4 for AgentSend
  **Parallel Group**: Wave 2 Group A

- [ ] 14. AgentCancel - Discover usage and generate schema
  **Pattern**: Same as Task 4 for AgentCancel
  **Parallel Group**: Wave 2 Group A

- [ ] 15. AgentStatusUpdate - Discover usage and generate schema
  **Pattern**: Same as Task 4 for AgentStatusUpdate
  **Parallel Group**: Wave 2 Group A

- [ ] 16. AgentOutput - Discover usage and generate schema
  **Pattern**: Same as Task 4 for AgentOutput
  **Parallel Group**: Wave 2 Group B

- [ ] 17. AgentPrompt - Discover usage and generate schema
  **Pattern**: Same as Task 4 for AgentPrompt
  **Parallel Group**: Wave 2 Group B

- [ ] 18. TerminalInput - Discover usage and generate schema
  **Pattern**: Same as Task 4 for TerminalInput
  **Parallel Group**: Wave 2 Group B

- [ ] 19. TerminalResize - Discover usage and generate schema
  **Pattern**: Same as Task 4 for TerminalResize
  **Parallel Group**: Wave 2 Group B

- [ ] 20. TerminalCreate - Discover usage and generate schema
  **Pattern**: Same as Task 4 for TerminalCreate
  **Parallel Group**: Wave 2 Group B

- [ ] 21. TerminalKill - Discover usage and generate schema
  **Pattern**: Same as Task 4 for TerminalKill
  **Parallel Group**: Wave 2 Group B

- [ ] 22. TerminalOutput - Discover usage and generate schema
  **Pattern**: Same as Task 4 for TerminalOutput
  **Parallel Group**: Wave 2 Group B

- [ ] 23. TerminalCreated - Discover usage and generate schema
  **Pattern**: Same as Task 4 for TerminalCreated
  **Parallel Group**: Wave 2 Group B

- [ ] 24. FileRead - Discover usage and generate schema
  **Pattern**: Same as Task 4 for FileRead
  **Parallel Group**: Wave 2 Group B

- [ ] 25. FileWrite - Discover usage and generate schema
  **Pattern**: Same as Task 4 for FileWrite
  **Parallel Group**: Wave 2 Group B

- [ ] 26. FileContent - Discover usage and generate schema
  **Pattern**: Same as Task 4 for FileContent
  **Parallel Group**: Wave 2 Group B

- [ ] 27. GitStatus - Discover usage and generate schema
  **Pattern**: Same as Task 4 for GitStatus
  **Parallel Group**: Wave 2 Group B

- [ ] 28. GitDiff - Discover usage and generate schema
  **Pattern**: Same as Task 4 for GitDiff
  **Parallel Group**: Wave 2 Group C

- [ ] 29. GitCommit - Discover usage and generate schema
  **Pattern**: Same as Task 4 for GitCommit
  **Parallel Group**: Wave 2 Group C

- [ ] 30. GitStatusResult - Discover usage and generate schema
  **Pattern**: Same as Task 4 for GitStatusResult
  **Parallel Group**: Wave 2 Group C

- [ ] 31. GitDiffResult - Discover usage and generate schema
  **Pattern**: Same as Task 4 for GitDiffResult
  **Parallel Group**: Wave 2 Group C

- [ ] 32. CreatePR - Discover usage and generate schema
  **Pattern**: Same as Task 4 for CreatePR
  **Parallel Group**: Wave 2 Group C

- [ ] 33. StateSnapshot - Discover usage and generate schema
  **Pattern**: Same as Task 4 for StateSnapshot
  **Parallel Group**: Wave 2 Group C

- [ ] 34. GetState - Discover usage and generate schema
  **Pattern**: Same as Task 4 for GetState
  **Parallel Group**: Wave 2 Group C

- [ ] 35. UpdateSettings - Discover usage and generate schema
  **Pattern**: Same as Task 4 for UpdateSettings
  **Parallel Group**: Wave 2 Group C

- [ ] 36. Ping - Discover usage and generate schema
  **Pattern**: Same as Task 4 for Ping
  **Parallel Group**: Wave 2 Group C

- [ ] 37. Pong - Discover usage and generate schema
  **Pattern**: Same as Task 4 for Pong
  **Parallel Group**: Wave 2 Group C

- [ ] 38. Ack - Discover usage and generate schema
  **Pattern**: Same as Task 4 for Ack
  **Parallel Group**: Wave 2 Group C

- [ ] 39. Error - Discover usage and generate schema
  **Pattern**: Same as Task 4 for Error
  **Parallel Group**: Wave 2 Group C

- [ ] 40. Notification - Discover usage and generate schema
  **Pattern**: Same as Task 4 for Notification
  **Parallel Group**: Wave 2 Group C

- [ ] 41. WorkspaceCreated - Discover usage and generate schema
  **Pattern**: Same as Task 4 for WorkspaceCreated
  **Parallel Group**: Wave 2 Group C

- [ ] 42. WorkspaceDeleted - Discover usage and generate schema
  **Pattern**: Same as Task 4 for WorkspaceDeleted
  **Parallel Group**: Wave 2 Group C

- [ ] 43. WorkspaceUpdated - Discover usage and generate schema
  **Pattern**: Same as Task 4 for WorkspaceUpdated
  **Parallel Group**: Wave 2 Group C

- [ ] 44. WorktreeCreated - Discover usage and generate schema
  **Pattern**: Same as Task 4 for WorktreeCreated
  **Parallel Group**: Wave 2 Group C

- [ ] 45. WorktreeDeleted - Discover usage and generate schema
  **Pattern**: Same as Task 4 for WorktreeDeleted
  **Parallel Group**: Wave 2 Group C

---

### Wave 3: Fixture Verification

- [ ] 46. Verify all fixtures created and valid

  **What to do**:
  - Verify all 42+ `.msgpack` fixture files exist in `test-fixtures/`
  - Run `cargo test` to ensure all fixtures are valid
  - Run TypeScript validator on all fixtures
  - Report any missing or invalid fixtures

  **Note**: Fixtures are created by Tasks 4-45 (each type creates its own fixture). This task verifies completeness.

  **Must NOT do**:
  - Do not regenerate fixtures (they should already exist from Wave 2)
  - Do not commit fixtures to git (keep in .gitignore)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-low`
  - **Skills**: []
  - **Rationale**: Verification task

  **Parallelization**:
  - **Can Run In Parallel**: NO (sequential)
  - **Blocks**: Tasks 47-49
  - **Blocked By**: Tasks 4-45

  **Acceptance Criteria**:
  - [ ] 42+ `.msgpack` files exist in `test-fixtures/`
  - [ ] All files non-empty and valid MessagePack
  - [ ] TypeScript validator passes for all fixtures

  **QA Scenarios**:
  ```
  Scenario: All fixtures exist
    Tool: Bash
    Steps:
      1. ls test-fixtures/*.msgpack | wc -l
      2. cargo test --test fixtures
      3. npm run test:run -- fixtureValidator.test.ts
    Expected Result: 42+ files, all tests pass
    Evidence: .sisyphus/evidence/task-46-verification.txt
  ```

  **Commit**: NO (fixtures are generated artifacts)

---

### Wave 4: Migration

- [ ] 47. Update TypeScript imports

  **What to do**:
  - Update all imports in `apps/web/src/` to use generated types
  - Change `from '../types/protocol'` to `from '../types/generated/protocol'`
  - Ensure type guards still work

  **Must NOT do**:
  - Do not delete manual protocol.ts yet

  **Recommended Agent Profile**:
  - **Category**: `unspecified-low`
  - **Skills**: []
  - **Rationale**: Import updates

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Blocks**: Task 48
  - **Blocked By**: Task 46

  **Acceptance Criteria**:
  - [ ] All imports updated
  - [ ] TypeScript compiles

  **Commit**: YES (group with 48, 49)

- [ ] 48. Atomic replacement of manual types

  **What to do**:
  - Rename `apps/web/src/types/protocol.ts` to `protocol.ts.bak`
  - Update index exports to point to generated types
  - Verify all tests pass

  **Must NOT do**:
  - Do not keep both versions active

  **Recommended Agent Profile**:
  - **Category**: `unspecified-low`
  - **Skills**: []
  - **Rationale**: Atomic swap

  **Acceptance Criteria**:
  - [ ] Manual types removed from active codebase
  - [ ] Tests pass with generated types only

  **Commit**: YES (group with 47, 49)

- [ ] 49. Remove manual protocol.ts

  **What to do**:
  - Delete `apps/web/src/types/protocol.ts.bak`
  - Delete `apps/web/src/types/protocol.ts` if still exists

  **Must NOT do**:
  - Do not delete if any imports still reference manual types

  **Recommended Agent Profile**:
  - **Category**: `unspecified-low`
  - **Skills**: []
  - **Rationale**: Cleanup

  **Acceptance Criteria**:
  - [ ] Manual protocol.ts removed
  - [ ] No references to manual types remain

  **Commit**: YES (group with 47, 48)
  - Message: `refactor(types): migrate to ts-rs generated types`

---

### Wave 5: Finalization

- [ ] 50. Documentation update

  **What to do**:
  - Update ARCHITECTURE.md with ts-rs workflow
  - Document how to add new message types
  - Add " regenerating types" to developer docs

  **Recommended Agent Profile**:
  - **Category**: `writing`
  - **Skills**: []
  - **Rationale**: Documentation

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Blocks**: None
  - **Blocked By**: Task 49

  **Acceptance Criteria**:
  - [ ] ARCHITECTURE.md updated
  - [ ] New type workflow documented

  **QA Scenarios**:
  ```
  Scenario: Docs are clear
    Tool: Manual review
    Steps:
      1. Read ARCHITECTURE.md
      2. Follow "Adding a new message type" instructions
    Expected Result: Clear, actionable steps
  ```

  **Commit**: YES
  - Message: `docs: update architecture with ts-rs workflow`

---

## Final Verification Wave

- [ ] F1. **Full test suite pass** - `oracle`
  - Run complete test suite: `cargo test --workspace`
  - Run TypeScript tests: `npm run test:run`
  - Verify no regressions
  - Output: All tests pass

- [ ] F2. **Schema drift check** - `deep`
  - Generate fresh TypeScript from Rust
  - Compare against committed types
  - Verify no uncommitted drift
  - Output: `No drift detected`

- [ ] F3. **Manual QA validation** - `unspecified-high`
  - Start development servers
  - Test WebSocket connection
  - Send/receive each message type
  - Verify end-to-end functionality
  - Output: All message types work

---

## Commit Strategy

- **Task 1**: `chore(deps): add ts-rs for TypeScript generation` - Cargo.toml
- **Tasks 2-3**: `test: add binary fixture infrastructure` - test files
- **Tasks 4-45**: Group by wave, commit message: `feat(types): generate {N} message types via ts-rs`
- **Tasks 47-49**: `refactor(types): migrate to ts-rs generated types` - type replacement
- **Task 50**: `docs: update architecture with ts-rs workflow` - docs

---

## Success Criteria

### Verification Commands
```bash
# Rust tests pass
cargo test --workspace

# TypeScript tests pass
npm run test:run

# Types generate correctly
cargo test --test generate_types

# No schema drift
git diff --exit-code apps/web/src/types/generated/
```

### Final Checklist
- [ ] All 42+ types generate from Rust
- [ ] Binary fixtures validate round-trip
- [ ] Manual TypeScript types replaced
- [ ] All tests pass
- [ ] Documentation updated
