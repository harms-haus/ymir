
# Issues - WebSocket Core Refactor

This file records problems, blockers, and gotchas encountered during the refactor.

## Task 2: Core Types and Protocol (Fresh-Session Repair)

### Test Module Corruption

**Issue**: The test module in types.rs became corrupted during a previous session. The first test function header and body were missing, leaving orphaned code fragments.

**Symptoms**:
- Line 252: `mod tests {` followed immediately by `text: "test output".to_string(),`
- Missing test function declaration for ScrollbackLine serialization test
- Orphaned serialization code at lines 358-361 outside any test function
- Incorrect method call syntax using `(SplitNode::is_branch)(&split_node)` instead of `split_node.is_branch()`

**Root Cause**: During a previous stuck session, the test header was partially deleted but the body remained, creating syntax errors.

**Resolution**:
1. Restored complete `test_scrollback_line_serialization_roundtrip()` function with proper header
2. Fixed `test_branch_node_creation()` by removing incorrect `SplitNode::branch()` call
3. Fixed all `test_split_node_is_*` tests to use instance methods instead of function call syntax
4. Removed orphaned serialization code (lines 358-361)
5. Added `use super::*;` to import all parent module types into test scope

**Verification**: All 23 tests pass (11 types::tests + 12 protocol::tests)

### Workspace Configuration Required

**Issue**: ymir-core crate required proper workspace configuration to compile and run tests.

**Symptoms**: cargo failed to parse manifest due to workspace dependency references in ymir-core/Cargo.toml without a corresponding workspace root configuration.

**Resolution**:
1. Created proper workspace Cargo.toml at root with `[workspace]` section
2. Listed ymir-core in workspace members
3. Configured workspace dependencies (serde, serde_json)
4. Updated ymir-core/Cargo.toml to use `workspace = true` for dependencies

**Learning**: Workspace configuration must be complete before nested crates can use workspace dependencies.

## Task 3: Turso Database Schema

### No Issues Encountered

The schema creation proceeded smoothly:
- SQL syntax validated successfully with sqlite3 CLI
- All tables created without errors
- Foreign key constraints verified working with CASCADE DELETE
- Indexes created as expected
- Migration tracking table populated correctly

### SQLite Foreign Keys Note

**Observation**: SQLite disables foreign keys by default. The PRAGMA foreign_keys = ON; in the migration file sets it for that connection, but applications must also enable it when connecting.

**Impact**: If foreign keys aren't enabled at connection time, CASCADE DELETE won't work.

**Mitigation**: Documented in learnings.md - application layer must enable foreign keys.


## Task 4: Migration Scripts

### rusqlite to libsql Migration

**Issue**: Original code used rusqlite blocking API, needed async libsql conversion.

**Changes Required**:
1. Remove `use rusqlite::{params, Connection}`
2. Change all methods to async with `&libsql::Connection` parameter
3. Replace `query_row()` with `query().await` + `rows.next().await`
4. Replace `execute_batch()` with async version
5. Replace `params![]` with `()` or tuples

### include_dir API Changes

**Issue**: Original code used deprecated `entry.as_file()` and `entry.path()` APIs.

**Resolution**: Use pattern matching with `DirEntry::File(file)` and `file.path()`.

### Migration Table Creation Conflict

**Issue**: Migration SQL creates _migrations table, then runner tried to create it again.

**Resolution**: Removed table creation from runner - migration SQL files are responsible for creating their own tracking table. This allows the first migration to define the schema.

### Duplicate Migration Record Insert

**Issue**: Migration SQL inserts its own record, then runner tried to insert again causing primary key conflict.

**Resolution**: Use `INSERT OR IGNORE` in runner to handle case where migration SQL already inserted the record.

## Task 13: Tab/PTY Handlers - Hang Fix

### Root Cause
Tests were hanging because `PtyManager` stores sessions in an internal `DashMap`. When tests created a NEW `PtyManager` instance for cleanup (e.g., `let pty_manager = PtyManager::new();`), that new instance could not see or kill sessions spawned by the original manager. The PTY reader task (spawned via `spawn_blocking`) continued running indefinitely, causing the test to hang.

### Fix Applied
Changed tests to use the SAME `PtyManager` instance for cleanup:
- `test_create_tab`: Changed from creating new `PtyManager` for cleanup to using `pty_manager.clone()` in handler and `pty_manager.kill()` for cleanup
- `test_rpc_handler_list`: Same fix - use cloned Arc for handler, then kill via original Arc

### Pattern Established
When testing PTY-related handlers:
1. Create `Arc<PtyManager>` once: `let pty_manager = Arc::new(PtyManager::new());`
2. Pass clone to handler: `TabHandler::new(db.clone(), pty_manager.clone(), ...)`
3. Cleanup via original Arc: `let _ = pty_manager.kill("tab-id").await;`

### Test Results After Fix
- `handlers::tab::tests`: 15 passed (previously hanging on `test_create_tab` and `test_rpc_handler_list`)
- `handlers::pty::tests`: 17 passed (no regression)


## Task 13: Second Hang Fix - Serde Deserialization

### Root Cause
`test_rpc_handler_list` was failing (not hanging) due to missing `#[serde(rename_all = "camelCase")]` attribute on `ListTabsInput` struct. The JSON-RPC client sends camelCase field names (`paneId`), but the struct expected snake_case (`pane_id`), causing deserialization to fail with:
```
missing field `pane_id`
```

### Fix Applied
Added `#[serde(rename_all = "camelCase")]` to `ListTabsInput` struct at line 29:
```rust
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ListTabsInput {
    pub pane_id: String,
}
```

### Pattern Check
Verified all other input structs in tab.rs have proper serde attributes:
- `CreateTabInput`: Has `#[serde(rename_all = "camelCase")]` ✓
- `CreateTabOutput`: No rename needed (output serialization) ✓
- `ListTabsInput`: Fixed ✓
- `ListTabsOutput`: No rename needed ✓
- `CloseTabInput`: Has `#[serde(rename_all = "camelCase")]` ✓
- `CloseTabOutput`: No rename needed ✓

### Test Results After Fix
- `handlers::tab::tests`: 15 passed (was failing on `test_rpc_handler_list`)
- `handlers::pty::tests`: 17 passed (no regression)
- Full `ymir-core` suite: 176 passed


## Task 13: Third Fix - Parallel Test Hang (PTY Reader Thread Leak)

### Root Cause
Parallel tests were hanging because PTY reader threads (spawned via `tokio::task::spawn_blocking`) were not exiting when the child process was killed. The reader thread blocks on `read()` from the PTY master, and killing the child process does not close the master, so the reader stays blocked indefinitely.

The `spawn_blocking` tasks run on a dedicated thread pool, and the test runner waits for all threads to complete. When multiple tests spawn PTYs in parallel, the blocked reader threads accumulate and eventually exhaust the blocking thread pool, causing tests to hang.

### Fix Applied
Modified `PtyManager::kill()` in `ymir-core/src/pty/manager.rs` to close the PTY master BEFORE killing the child process:

```rust
pub async fn kill(&self, tab_id: &str) -> crate::Result<()> {
    info!(tab_id = %tab_id, "Killing PTY session");
    if let Some((_, session)) = self.sessions.remove(tab_id) {
        // Close the PTY master first to unblock the reader thread
        drop(session.master.lock().await);
        // Kill the child process
        if let Err(e) = session.child.lock().await.kill() {
            warn!(error = %e, "Failed to kill child process");
        }
    }
    Ok(())
}
```

The order matters:
1. Closing the PTY master causes the reader thread to get EOF and exit cleanly
2. Then killing the child process cleans up the shell

### Why This Works
- The PTY reader thread blocks on `read()` from the master
- When the master is closed (dropped), `read()` returns EOF (0 bytes)
- The reader thread detects EOF, sends an Exit event, and breaks its loop
- The `spawn_blocking` task completes, freeing the thread pool thread

### Test Results After Fix
- `cargo test -p ymir-core handlers::tab::tests`: 15 passed (parallel execution)
- `cargo test -p ymir-core`: 176 passed (full suite, parallel execution)
- No `--test-threads=1` workaround needed

