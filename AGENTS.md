# Agent Instructions

## Type Generation Workflow

This project uses [ts-rs](https://github.com/Aleph-Alpha/ts-rs) to generate TypeScript types from Rust structs. Types are organized as one file per type.

### Architecture

**Rust Side** (Domain-based modules):
- `crates/ws-server/src/protocol/mod.rs` — Barrel re-export
- `crates/ws-server/src/protocol/common.rs` — Core message types
- `crates/ws-server/src/protocol/workspace.rs` — Workspace types
- `crates/ws-server/src/protocol/worktree.rs` — Worktree types
- `crates/ws-server/src/protocol/agent.rs` — Agent types
- `crates/ws-server/src/protocol/terminal.rs` — Terminal types
- `crates/ws-server/src/protocol/file.rs` — File types
- `crates/ws-server/src/protocol/git.rs` — Git types
- `crates/ws-server/src/protocol/acp.rs` — ACP wire types
- `crates/ws-server/src/protocol/settings.rs` — Settings types

**TypeScript Side**:
- `apps/web/src/types/protocol.ts` — Manually maintained types with type guards
- `apps/web/src/types/generated/*.ts` — ts-rs generated files (one per type, 80 total)

### Generating Types

Run the sync-types make target to regenerate TypeScript bindings:

```bash
make sync-types
```

This will:
1. Clean old generated files from `apps/web/src/types/generated/`
2. Run `cargo test --features export-types` to generate TypeScript files directly to `apps/web/src/types/generated/`
3. **Important**: The generated files are raw interfaces. The manual `protocol.ts` adds type guards and discriminator fields.

### Type Structure

- **Rust Source**: `crates/ws-server/src/protocol/*.rs` — Domain-organized Rust types
- **Generated**: `apps/web/src/types/generated/*.ts` — Raw ts-rs generated interfaces
- **Protocol Layer**: `apps/web/src/types/protocol.ts` — Manual types with type guards and helpers
- **Configuration**: `.cargo/config.toml` — Sets `TS_RS_EXPORT_DIR` to generate directly to the web app

### Adding New Types

1. Add the Rust struct in the appropriate domain file (e.g., `crates/ws-server/src/protocol/workspace.rs`):
   ```rust
   #[derive(Debug, Clone, Serialize, Deserialize, PartialEq, ts_rs::TS)]
   #[serde(rename_all = "camelCase")]
   #[ts(export)]
   pub struct MyNewType {
       pub field: String,
   }
   ```

2. Run `make sync-types` to generate the TypeScript file

3. If needed, add type guards to `apps/web/src/types/protocol.ts`

4. Import from the protocol module:
   ```typescript
   import { MyNewType } from '../types/protocol';
   ```

### Key Differences

- **Generated types** (`generated/*.ts`): Raw interfaces from Rust, no type field
- **Protocol types** (`protocol.ts`): Extended interfaces with `type` discriminator and type guards for runtime checking

Always import from `types/protocol` to get the full type system including type guards.
