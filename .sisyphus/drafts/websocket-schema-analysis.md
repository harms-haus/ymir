# WebSocket Schema Cross-Language Testing Analysis

## Executive Summary

The ymir project has **excellent but isolated** protocol testing on both Rust and TypeScript sides. The gap is cross-language validation—ensuring the implementations are actually compatible.

**Key Finding:** There IS a more efficient way to test without running both servers—using shared test fixtures, property-based testing, and schema-driven validation.

---

## Current State

### Rust Side (`crates/ws-server`)
- **42+ message types** defined in `protocol.rs` (1047 lines)
- **MessagePack serialization** via `rmp-serde`
- **Comprehensive roundtrip tests** for all message types
- **Protocol version**: 1
- **Test utilities**: `AppState::new_test()` for in-memory testing

### TypeScript Side (`apps/web`)
- **42+ message types** mirroring Rust in `types/protocol.ts` (803 lines)
- **MessagePack via `@msgpack/msgpack`**
- **Discriminated unions** with type guards
- **Comprehensive tests** in `protocol.test.ts` (664 lines)
- **WebSocket client tests** with mocks in `ws.test.ts` (532 lines)

### The Problem
Both sides test in isolation. No validation that a message serialized in TypeScript deserializes correctly in Rust (or vice versa).

---

## Recommended Testing Strategy (No Full Server Startup Required)

### Approach 1: Shared Binary Test Fixtures (Fastest)

**Concept**: Generate canonical MessagePack payloads in Rust, save to files, validate in TypeScript.

**Implementation**:
```rust
// In Rust tests - generate fixtures
#[test]
fn generate_test_fixtures() {
    let messages = vec![
        ClientMessage::WorkspaceCreate { name: "test".into() },
        ClientMessage::AgentSpawn { agent_type: "coder".into() },
        // ... all 42 types
    ];
    
    for (i, msg) in messages.iter().enumerate() {
        let bytes = rmp_serde::to_vec(&msg).unwrap();
        std::fs::write(
            format!("../test-fixtures/msg_{:03}.bin", i),
            bytes
        ).unwrap();
    }
}
```

```typescript
// In TypeScript tests - validate fixtures
import * as msgpack from "@msgpack/msgpack";

for (const fixture of fixtures) {
    const data = fs.readFileSync(fixture);
    const decoded = msgpack.decode(data);
    // Validate against TypeScript schema
    expect(() => ClientMessageSchema.parse(decoded)).not.toThrow();
}
```

**Pros**:
- Fast (no server startup)
- Catches format drift immediately
- Can be run in CI
- Uses actual binary payloads

**Cons**:
- One-way validation (TypeScript consuming Rust fixtures)
- Requires fixture regeneration when protocol changes

---

### Approach 2: Property-Based Cross-Language Testing

**Concept**: Generate random valid messages, serialize in Rust, verify TypeScript can parse.

**Rust side** (using `proptest`):
```rust
use proptest::prelude::*;

proptest! {
    #[test]
    fn typescript_compatibility(msg in any::<ClientMessage>()) {
        let serialized = rmp_serde::to_vec(&msg).unwrap();
        // Write to shared file or stdout
        fs::write("/tmp/test_msg.bin", serialized).unwrap();
        
        // Run TypeScript validation
        let output = Command::new("node")
            .args(&["validate.ts", "/tmp/test_msg.bin"])
            .output()
            .expect("failed to execute");
            
        assert!(output.status.success());
    }
}
```

**TypeScript side**:
```typescript
// validate.ts - run as child process
const data = fs.readFileSync(process.argv[2]);
const decoded = decodeMessage(data);
// Will throw if invalid
decodeServerMessage(decoded);
console.log("Valid");
```

**Pros**:
- Generates hundreds of test cases automatically
- Finds edge cases
- No manual fixture maintenance

**Cons**:
- Slower than fixtures
- Requires property testing setup
- More complex to debug failures

---

### Approach 3: Schema-Driven Code Generation (Long-term Best)

**Concept**: Define protocol once, generate both Rust and TypeScript code.

**Options**:

**A. Protocol Buffers**
- Define `.proto` files
- Generate Rust with `prost`
- Generate TypeScript with `ts-proto`
- Already recommended by librarian research

**B. JSON Schema**
- Define canonical JSON Schema
- Generate TypeScript with `json-schema-to-typescript`
- Validate Rust with `jsonschema` crate
- Runtime validation on both sides

**C. zod_gen (Rust-first)**
- Derive macro generates Zod schemas from Rust types
- Zero runtime overhead
- Single source of truth in Rust

**Pros**:
- Eliminates manual sync
- Guaranteed compatibility
- Type-safe across languages

**Cons**:
- Migration effort
- May not support all MessagePack features
- Build step required

---

### Approach 4: Contract Testing with Pact

**Concept**: Consumer (TypeScript) defines expectations, Provider (Rust) verifies.

**Setup**:
```typescript
// TypeScript consumer test
const messagePact = new MessagePact({
  consumer: 'ymir-web',
  provider: 'ymir-ws-server'
});

messagePact
  .expectsToReceive('StateSnapshot message')
  .withContent({
    version: 1,
    type: 'StateSnapshot',
    data: {
      workspaces: [],
      worktrees: [],
      // ...
    }
  })
  .verify();
```

**Pros**:
- Catches breaking changes early
- Consumer-driven
- Pact Broker for contract sharing

**Cons**:
- WebSocket support limited
- Pact Broker infrastructure needed
- Overkill for single codebase

---

## Recommended Immediate Actions

### Phase 1: Shared Fixtures (This Week)
1. Create `test-fixtures/` directory at repo root
2. Add Rust test to generate all message types as `.bin` files
3. Add TypeScript test to validate all fixtures decode correctly
4. Add to CI

### Phase 2: Property Testing (Next Sprint)
1. Add `proptest` to Rust dev-dependencies
2. Add `fast-check` to TypeScript dev-dependencies
3. Create property tests for roundtrip serialization
4. Run cross-language validation

### Phase 3: Schema Generation (Long-term)
1. Evaluate Protocol Buffers vs JSON Schema
2. Migrate to schema-first approach
3. Remove manual type maintenance

---

## Efficiency Comparison

| Approach | Setup Time | Runtime | Maintenance | Drift Detection |
|----------|-----------|---------|-------------|-----------------|
| Current (isolated tests) | Low | Fast | High | None |
| Shared Fixtures | Low | Very Fast | Medium | One-way |
| Property Testing | Medium | Medium | Low | Automatic |
| Schema Generation | High | Fast | Very Low | Compile-time |
| Contract Testing | High | Medium | Medium | Broker-based |

**Recommendation**: Start with **Shared Fixtures** (fastest ROI), then move to **Property Testing** for edge cases.

---

## Files to Reference

- Rust Protocol: `crates/ws-server/src/protocol.rs`
- TypeScript Protocol: `apps/web/src/types/protocol.ts`
- Rust Tests: `crates/ws-server/src/protocol.rs` (#[cfg(test)] module)
- TypeScript Tests: `apps/web/src/types/__tests__/protocol.test.ts`
- WebSocket Client: `apps/web/src/lib/ws.ts`
- WebSocket Tests: `apps/web/src/lib/__tests__/ws.test.ts`
