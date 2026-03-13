

## Task 3: Turso Database Schema

### Decision: Use SQLite-compatible Schema for libSQL/Turso
**Rationale**:
- libSQL is SQLite-compatible, so standard SQLite DDL works
- Schema can be validated locally with sqlite3 CLI
- No Turso-specific extensions needed for the core schema
- Future Turso-specific features (replication, edge) can be added in later migrations

### Decision: TEXT Primary Keys for UUID-style IDs
**Rationale**:
- workspaces, panes, tabs, pty_sessions use TEXT PRIMARY KEY for UUID-style IDs
- These entities are created by the application with UUIDs
- INTEGER AUTOINCREMENT only used for internal entities (scrollback_chunks, git_repos, git_files)
- Consistent with the plan's schema design

### Decision: JSON Array for Scrollback Content
**Rationale**:
- scrollback_chunks.content stores JSON array of lines
- Application serializes/deserializes the array
- SQLite doesn't have native array type, JSON is the standard approach
- line_count column provides quick access to line count without parsing JSON

### Decision: Composite Unique Constraint on Scrollback
**Rationale**:
- UNIQUE(tab_id, chunk_number) enforces one chunk per tab per number
- Prevents duplicate chunks on retry/reconnect scenarios
- Supports idempotent writes (same chunk can be written multiple times safely)
- Matches the plan's requirement for "unique (tab_id, chunk_number)"

### Decision: Include _migrations Table in Schema
**Rationale**:
- Migration tracking table included in initial schema
- Allows migration runner to detect if schema is applied
- Version 1 inserted automatically on schema application
- Pattern supports future migrations (002_, 003_, etc.)

### Decision: Comprehensive Index Strategy
**Rationale**:
- Foreign key columns indexed for join performance
- scrollback_chunks: composite index on (tab_id, chunk_number) for range queries
- git_files: indexes on repo_id, path, and status for common git operations
- git_repos: index on last_poll_at for polling queries
- Settings table has no additional indexes (key-value lookups by primary key)

### Decision: PRAGMA foreign_keys in Migration File
**Rationale**:
- PRAGMA foreign_keys = ON; included at top of migration
- Ensures foreign keys are enabled when migration runs
- Note: Must be set per-connection in SQLite (not persisted)
- Application must also enable foreign keys when connecting

### Decision: No CHECK Constraints on Enumerated Values
**Rationale**:
- git_files.status could have CHECK(status IN ('staged', 'unstaged'))
- git_files.file_status could have CHECK for git status values
- Omitted to allow flexibility if new git statuses are added
- Application layer validates enumerated values
- Easier to extend without schema migrations
## Task 2: Core Types and Protocol

### Decision: Use ID-Based Tree Structure Instead of Recursive Types
**Rationale**:
- Rust compiler cannot handle recursive types with infinite size (BranchNode containing SplitNode)
- Using string IDs (left_id, right_id) breaks the recursive cycle at type level
- This allows serde to serialize/deserialize trees correctly without runtime complexity
- Trade-off: Runtime resolution needed to look up nodes by ID (handled by handlers in later tasks)

### Decision: Remove node_type Fields from Structs Using Serde Tag
**Rationale**:
- Serde's `#[serde(tag = "...")]` provides the discriminant in the enum
- Adding explicit `node_type` fields to struct variants creates duplicate field errors
- Enum's impl block provides `node_type()` method for runtime type checking
- Tests use `split_node.node_type()` method instead of field access

### Decision: Database-Agnostic Type Design
**Rationale**:
- Task explicitly requires keeping types database-agnostic
- No SQL row shapes or database-specific fields in shared types
- Types can be mapped to any storage backend (libsql, SQLite, etc.)
- Allows future flexibility to change storage without breaking protocol

### Decision: TDD Workflow for Types
**Rationale**:
- Write tests first, see them fail, then implement minimal code
- All types have comprehensive serialization round-trip tests
- Tests verify enum discriminators, field serialization, and derive macro behavior
- Ensures serde configuration is correct from the start

### Decision: Serde camelCase rename_all
**Rationale**:
- Matches TypeScript conventions in src/state/types.ts
- Ensures JSON output uses camelCase field names
- Rust struct fields use snake_case, serde handles conversion automatically
- Consistent with existing Tauri command patterns

### Decision: JSON-RPC 2.0 Standard Compliance
**Rationale**:
- Must follow JSON-RPC 2.0 specification exactly for interoperability
- Standard error codes (-32700 to -32603) defined in spec
- Notification type (request without id) for server-to-client events
- Separate Request, Response, and Notification types for clarity
- Batch and chunk sizes defined as protocol constants for performance tuning
## Task 2: Core Types and Protocol

### Final Resolution: TS-Compatible Split Tree Structure

**Decision: Use Box-Based Recursive Type Breaking**
**Rationale**: BranchNode contains `children: [Box\<SplitNode>; 2] which directly mirrors TypeScript shape from src/state/types.ts:118. Using string IDs (left_id/right_id) would require runtime ID resolution in handlers, breaking data-shape consistency. The Box\<SplitNode> approach cleanly separates the types while maintaining serializable structure.

**Rationale: Remove Eq from Pane derives**
**Rationale**: f64 does not implement Eq in Rust, so PartialEq alone is sufficient for all test comparisons. Removing Eq prevents compiler errors while maintaining correct equality semantics for tests.

**Rationale: Serde tag-based discriminant without explicit node_type fields**
**Rationale**: Serde's `#[serde(tag = "...")]` on the enum provides the type discriminator via the tag field. Adding explicit `node_type` fields to BranchNode and LeafNode would cause duplicate field errors. The impl block provides helper methods like `node_type()` for runtime type checking.

### Verification Results
- ✅ All 24 tests pass (types::tests and protocol::tests modules)
- ✅ Types serialize/deserialize correctly matching TypeScript structure
- ✅ JSON-RPC 2.0 protocol fully compliant with standard spec
- ✅ Clean LSP diagnostics (errors only in original repo files, not in ymir-core)

### Files Modified
- /ymir-core/src/types.rs: 421 lines (clean implementation, no legacy code)
- /ymir-core/src/protocol.rs: 335 lines (JSON-RPC types, error constructors, constants)
- /ymir-core/src/lib.rs: exports types, protocol, Result, CoreError
- /worktree notepads: learnings.md, decisions.md (updated with resolution details)

### Design Principles Followed
1. TDD workflow - tests written first, implementation follows
2. Database-agnostic - types work with any storage backend
3. TypeScript parity - field names and serialization format match frontend
4. Protocol compliance - JSON-RPC 2.0 standard followed exactly
5. Terminal-first scope - only Terminal tabs, browser tabs excluded per requirements

### Blocker Resolutions
- Fixed infinite type recursion using Box indirection
- Fixed f64 Eq bound by removing unnecessary derive
- Fixed duplicate test functions by clean rewrite
- Fixed serde configuration by removing conflicting node_type fields
## Task 4: Migration Scripts

### Version Tracking Fix
- Changed from `COALESCE(MAX(version), 0)` to `SELECT MAX(version) FROM _migrations`
- Reason: After migration insertion, MAX() returns the applied version correctly, while COALESCE would keep returning 0 for empty table
- This prevents idempotent tests from trying to re-apply already-applied migrations
- Impact: All migration tests now pass (7 passed, 0 failed)

### Cargo.toml Dependencies
- Added `rusqlite = { version = "0.32", features = ["bundled"] }`
- Replaced libsql with rusqlite to use SQLite-compatible synchronous API

## Task 5: Database Client and Connection Pooling

### Decision: Use Arc<Mutex<Connection>> for Shared Access
**Rationale**:
- `Arc<Mutex<libsql::Connection>>` provides safe shared ownership across async contexts
- `tokio::sync::Mutex` chosen over `std::sync::Mutex` because all libsql operations are async
- Cloning the client is cheap (Arc clone) and shares the same underlying connection
- Pattern matches the plan's requirement for "shared connection management"

### Decision: Use libsql Async API Directly
**Rationale**:
- libsql provides native async support via `.await` on all operations
- No need for a separate connection pool crate (deadpool, sqlx, etc.) for current scope
- Single shared connection is sufficient for the core service architecture
- Can add pooling later if performance testing shows it's needed

### Decision: Simplified Transaction Drop
**Rationale**:
- Rust doesn't support async Drop, so automatic rollback on drop isn't possible
- Transaction struct tracks committed flag but doesn't auto-rollback
- Explicit commit() or rollback() required - this is clearer than implicit behavior
- Drop implementation is empty; documentation guides users to explicit cleanup

### Decision: Literal SQL Values in Tests
**Rationale**:
- libsql's parameter binding has specific tuple requirements that differ from rusqlite
- Using literal values in test SQL (e.g., `VALUES ('hello')` instead of `VALUES (?)`) avoids parameter binding complexity
- Tests are clearer and less prone to type inference issues
- Production code can still use parameter binding with proper libsql syntax

### Decision: Separate DbConfig from DatabaseClient
**Rationale**:
- DbConfig handles path resolution (workspace vs user state)
- DatabaseClient handles connection management
- Separation allows creating configs without opening connections
- Config can be cloned and reused; client manages the actual connection lifecycle

### Decision: In-Memory Database Support
**Rationale**:
- `new_in_memory()` constructor for tests uses `:memory:` path
- Same foreign key enablement as file databases
- Tests run faster and are isolated
- No file cleanup needed

### Files Created/Modified
- `ymir-core/src/db/client.rs` - Database client with connection management, transactions
- `ymir-core/src/db/mod.rs` - Added client module exports
- `ymir-core/Cargo.toml` - Added `dirs = "5.0"` and `tokio` dependencies

### Dependency Fix
- `tokio` must be in `[dependencies]` not just `[dev-dependencies]` because client.rs uses `tokio::sync::Mutex` and `tokio::fs` in the library code (not just tests)
- Features needed: `rt`, `sync`, `fs` for runtime, synchronization, and filesystem operations

## Task 6: PTY Session Manager

### Decision: Tab ID Binding Replaces Workspace/Pane Model
**Rationale**:
- New architecture simplifies session binding to single `tab_id` identifier
- Old model had workspace_id + pane_id + session_id complexity
- Tab is the atomic unit of terminal session management
- Session ID equals tab_id for direct lookup

### Decision: Use portable_pty for Cross-Platform PTY Support
**Rationale**:
- portable_pty abstracts platform differences (Unix PTY vs Windows ConPTY)
- Same API works on Linux, macOS, and Windows
- Used successfully in existing Tauri backend
- No need for conditional compilation or platform-specific code

### Decision: tokio::sync::broadcast for Output Streaming
**Rationale**:
- Multiple consumers need PTY output (WebSocket handlers, logging, etc.)
- Broadcast channel allows multiple subscribers with single sender
- Buffer size 256 provides backpressure without blocking
- Lagged receivers can skip messages if they fall behind

### Decision: spawn_blocking for PTY Reader Task
**Rationale**:
- PTY read operations are blocking I/O (Read::read blocks until data available)
- Must use `tokio::task::spawn_blocking` not `tokio::spawn` to avoid blocking async runtime
- Pattern matches existing Tauri implementation
- Reader task runs until EOF or error, then cleans up session

### Decision: DashMap for Session Storage
**Rationale**:
- DashMap provides concurrent hash map without Mutex overhead
- Multiple async tasks can read/write sessions concurrently
- Arc<DashMap<...>> pattern allows shared ownership across tasks
- Better performance than Mutex<HashMap> for read-heavy workloads

### Decision: PtyConfig Builder Pattern
**Rationale**:
- Builder pattern provides ergonomic configuration API
- Default values: 24 rows, 80 cols, $SHELL or /bin/bash
- Optional cwd and shell override for flexibility
- Chainable methods: `PtyConfig::new().with_size(50, 100).with_cwd("/tmp")`

### Decision: CoreError::PtyError Variant
**Rationale**:
- PTY operations can fail independently of database/protocol errors
- Dedicated error variant enables specific error handling
- Consistent with existing Database, SerializationError variants
- Error messages include context ("Failed to open PTY: {reason}")

### Files Created/Modified
- `ymir-core/src/pty/mod.rs` - Module exports
- `ymir-core/src/pty/manager.rs` - PTY manager implementation with 23 tests
- `ymir-core/src/lib.rs` - Added `pub mod pty`
- `ymir-core/src/types.rs` - Added `PtyError(String)` variant to CoreError
- `ymir-core/Cargo.toml` - Added portable-pty, dashmap, tracing dependencies

### Test Results
- 23 PTY manager tests pass
- Tests cover: spawn, write, resize, kill, subscribe, notification parsing
- No compiler warnings after unused import fix
- All existing tests continue to pass (38 filtered out, 23 PTY tests run)

## Task 8: Git Service

### Decision: SQL String Interpolation for libsql Compatibility
**Rationale**: libsql's `IntoParams` trait doesn't support single-value tuples like `(i64,)` or `(&str,)`. Rather than fighting the type system, we use SQL string interpolation with a simple `escape_sql()` helper to escape single quotes. This is acceptable for internal service use where inputs are controlled.

### Decision: Optional Database Persistence
**Rationale**: GitService can be constructed with `new()` for standalone use or `with_db()` for persistence. This allows the service to be used in contexts where database access isn't available (e.g., CLI tools) while still supporting caching when needed.

### Decision: Delete-and-Insert Pattern for File Records
**Rationale**: On each status update, we delete all file records for the repo and re-insert them. This is simpler than computing diffs and handles cases where files change status (staged -> unstaged) cleanly. The operation is within a single repo context so the scope is bounded.

### Decision: Git2 Synchronous in Async Context
**Rationale**: git2 operations are fast file system operations that don't need spawn_blocking. The Repository handle is not Send/Sync, but since we don't hold it across await points, this is safe. Each operation opens the repo, performs work, and closes it.

### Decision: Port All Original Git Operations
**Rationale**: The original src-tauri/src/git.rs had comprehensive git operations. We ported all of them: status, stage/unstage, discard, commit, branches (list/create/delete/checkout), and stage_all/unstage_all. This maintains feature parity.

### Files Created/Modified
- `ymir-core/src/git/mod.rs` - Git types (GitError, FileStatus, GitFile, BranchInfo, GitStatus, RepoInfo, RepoFileInfo)
- `ymir-core/src/git/service.rs` - GitService with 11 passing tests
- `ymir-core/Cargo.toml` - Added git2 = "0.19" and tempfile = "3" dependencies
- `ymir-core/src/lib.rs` - Added pub mod git

### Test Results
- 11 tests pass covering all major git operations
- Tests verify: empty repo, stage/commit, unstage, discard changes, branch CRUD, error cases, DB persistence

## Task 12: Pane Handlers

### Decision: Simplified Pane Model Without Split Operations
**Rationale**: Per Task 12 requirements, split operations are explicitly excluded. The simplified model treats panes as flat records in the database without tree structure. This keeps the implementation minimal while remaining compatible with future split functionality.

### Decision: Reuse Workspace Handler Architecture
**Rationale**: The two-layer pattern (Handler + RpcHandler) proven in Task 11 provides clean separation between business logic and JSON-RPC concerns. Reusing this pattern ensures consistency across all handlers.

### Decision: CamelCase Serde Rename for Input Structs
**Rationale**: JSON-RPC clients (TypeScript frontend) use camelCase conventions. Adding `#[serde(rename_all = "camelCase")]` to input structs ensures seamless JSON deserialization without manual field mapping.

### Decision: Workspace Existence Validation
**Rationale**: All pane operations validate that the referenced workspace exists before proceeding. This prevents orphaned pane records and provides clear error messages to clients.

### Decision: PaneNotification with Action Tag
**Rationale**: Following the workspace notification pattern, PaneNotification uses `#[serde(tag = "action", rename_all = "camelCase")]` for discriminated union serialization. This allows clients to type-switch on the action field.

### Decision: No Pane Update Operation
**Rationale**: The simplified model only supports create, list, and delete. Updates (like flex_ratio changes) can be added later if needed. This keeps the initial implementation minimal.

### Files Created
- `ymir-core/src/handlers/pane.rs` - 525 lines with 14 passing tests
- Updated `ymir-core/src/handlers/mod.rs` - Added pane module exports

### Test Results
- 14 tests pass covering all CRUD operations and RPC handling
- Tests verify workspace existence validation
- Tests verify proper JSON-RPC error responses
