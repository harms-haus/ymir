# Cross-Language WebSocket Testing: ts-rs + Binary Fixtures

## TL;DR
> Implement **ts-rs** for automatic TypeScript type generation from Rust, combined with **binary fixture tests** to validate MessagePack serialization compatibility. This provides compile-time drift prevention while preserving existing MessagePack performance.
>
> **Deliverables**:
> - ts-rs integration in Rust WebSocket server
> - Generated TypeScript types from Rust protocol definitions
> - Binary fixture generator (Rust → .msgpack files)
> - Binary fixture validator (TypeScript decodes fixtures)
> - CI verification of type sync
> - Migration of manual TS types to generated types
>
> **Estimated Effort**: Medium (2-3 days)
> **Parallel Execution**: YES - 3 phases
> **Critical Path**: Setup ts-rs → Generate core types → Create fixtures → Validate → Replace manual types → CI integration

---

## Context

### Original Request
Prevent schema drift between Rust and TypeScript WebSocket message types while avoiding the need to run both servers for every test.

### Current State (Identified Issues)
**Critical Schema Drift Already Exists**:
- TypeScript has `requestId` fields on `WorkspaceDelete`, `WorkspaceUpdate`, `WorktreeCreate` that Rust lacks
- TypeScript defines `WorktreeStatus` twice with different shapes
- Manual sync is not working

**Current Architecture**:
- **42+ message types** in `crates/ws-server/src/protocol.rs` (Rust) and `apps/web/src/types/protocol.ts` (TypeScript)
- **MessagePack serialization** via `rmp-serde` (Rust) and `@msgpack/msgpack` (TypeScript)
- **Comprehensive isolated tests** on both sides (no cross-language validation)
- **Vitest** for TypeScript, **cargo test** for Rust
- **No CI/CD** for automated testing

### Metis Review Findings
**Guardrails Applied**:
- Scope locked to `protocol.rs` types only
- Phased rollout required (not big bang)
- Atomic replacement strategy (not gradual)
- Schema drift must be resolved before generation
- Binary fixtures required to validate serialization, not just types

**Key Assumptions Validated**:
- ts-rs supports MessagePack-serializable types
- Binary fixtures catch encoding edge cases ts-rs might miss
- Phased approach reduces review burden

---

## Work Objectives

### Core Objective
Establish compile-time guarantee that TypeScript types match Rust types, with runtime validation that MessagePack serialization is byte-compatible.

### Concrete Deliverables
1. **ts-rs integration**: Generate TypeScript from Rust protocol types
2. **Phase 1**: Setup and proof-of-concept (3 types)
3. **Phase 2**: Core message types (20 types)
4. **Phase 3**: Remaining types + migration (19 types)
5. **Binary fixture system**: Generate and validate MessagePack payloads
6. **CI integration**: Verify types stay in sync

### Definition of Done
- [ ] `cargo test` passes (Rust fixtures validate)
- [ ] `npm run test:run` passes (TypeScript fixtures validate)
- [ ] All 42+ types generate successfully
- [ ] Binary round-trip test: Rust → MessagePack → TypeScript → MessagePack → Rust succeeds
- [ ] Manual TypeScript types replaced with generated ones
- [ ] CI fails if generated types drift from Rust source

### Must Have
- ts-rs integration in Rust
- Binary fixture generator in Rust
- Binary fixture validator in TypeScript
- Resolution of existing schema drift
- Atomic migration (no partial state)
- CI integration

### Must NOT Have (Guardrails)
- Changes to MessagePack serialization logic
- Refactoring of protocol module structure
- Addition of new message types during migration
- Generation of types outside protocol.rs
- Committing generated files without corresponding tests
- REST API type migration
- JSON Schema generation
- Protocol version compatibility checks (future enhancement)

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

### Assumptions to Validate
- [ ] ts-rs supports all Rust type constructs in protocol.rs
- [ ] MessagePack serialization identical between manual and generated types
- [ ] TypeScript project can import generated files without build config changes
- [ ] All 42 types defined in protocol.rs (not spread across modules)

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Foundation - can start immediately):
├── Task 1: Add ts-rs dependency to Rust
├── Task 2: Resolve schema drift (add missing requestId to Rust)
└── Task 3: Create binary fixture infrastructure (Rust generator)

Wave 2 (Proof of Concept - after Wave 1):
├── Task 4: Generate first 3 types with ts-rs
├── Task 5: Create TypeScript fixture validator
├── Task 6: Validate round-trip serialization (3 types)
└── Task 7: Create fixture → TypeScript mapping

Wave 3 (Core Types - after Wave 2):
├── Task 8: Generate next 20 message types
├── Task 8a: Generate client message types (10)
├── Task 8b: Generate server message types (10)
└── Task 9: Generate fixtures for all 23 types

Wave 4 (Remaining Types - after Wave 3):
├── Task 10: Generate final 19 types
├── Task 11: Complete fixture coverage (all 42 types)
└── Task 12: Update TypeScript imports

Wave 5 (Migration - after Wave 4):
├── Task 13: Atomic replacement of manual types
├── Task 14: Update all TypeScript imports
└── Task 15: Remove manual protocol.ts

Wave 6 (Integration - after Wave 5):
├── Task 16: Add CI generation verification
├── Task 17: Add drift detection to CI
└── Task 18: Documentation update

Wave FINAL (Verification):
├── Task F1: Full test suite pass (oracle)
├── Task F2: Schema drift check (deep)
└── Task F3: Manual QA validation (unspecified-high)
```

### Dependency Matrix

**Wave 1** (Foundation):
- Task 2 (resolve drift) → Blocks all generation
- Task 1 (ts-rs setup) → Blocks Task 4
- Task 3 (fixture infra) → Blocks Task 5

**Wave 2** (Proof of Concept):
- Task 4 (3 types) → Blocks Task 6
- Task 5 (validator) → Blocks Task 6
- Task 6 (validation) → Blocks Task 8

**Wave 3** (Core Types):
- Task 8 (20 types) → Blocks Task 9
- Task 9 (fixtures) → Blocks Wave 4

**Wave 4** (Remaining):
- Task 10 (19 types) → Blocks Task 11
- Task 11 (fixtures) → Blocks Task 13

**Wave 5** (Migration):
- Task 12 (imports) → Blocks Task 13
- Task 13 (replacement) → Blocks Task 14

**Wave 6** (Integration):
- All previous → Blocks F1-F3

### Agent Dispatch Summary

**Wave 1**: 3 tasks → `quick` (dependency setup)
**Wave 2**: 4 tasks → `quick` to `unspecified-low` (proof of concept)
**Wave 3**: 4 tasks → `quick` (type generation)
**Wave 4**: 3 tasks → `quick` (type generation)
**Wave 5**: 3 tasks → `unspecified-low` (refactoring)
**Wave 6**: 3 tasks → `quick` (CI config)
**FINAL**: 3 tasks → `oracle`, `deep`, `unspecified-high`

---

## TODOs

