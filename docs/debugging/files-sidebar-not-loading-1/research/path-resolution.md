# Path Resolution Research — Worktree Path Mapping Issue

## Executive Summary

The server has **zero path mapping/transformation**. Worktree and workspace paths are stored in the database as absolute paths from the developer's local machine and used verbatim on the server VM. When the server runs on a different machine (VM at `/root/ymir` vs dev machine at `/home/blake/Documents/software/ymir`), every path-dependent operation fails.

## Path Flow: From Creation to Usage

### 1. Workspace Creation (Tauri Desktop App)

**File:** `crates/ws-server/src/workspace/mod.rs` — `create()`

The Tauri app calls `pick_directory()` (via `apps/tauri/src-tauri/src/commands.rs`) which returns an OS-native absolute path like `/home/blake/Documents/software/ymir`. This path is sent to the ws-server as `WorkspaceCreate.root_path`.

The server stores it after only **tilde expansion**:
```rust
// workspace/mod.rs:92
let expanded_root_path = expand_tilde(&msg.root_path);
```

`expand_tilde()` (line 45-56) only replaces `~/` with `$HOME` — **no other transformation**.

### 2. Worktree Path Storage

**File:** `crates/ws-server/src/worktree/mod.rs` — `create()`

When a worktree is created, its path is computed relative to the workspace root:
```rust
// worktree/mod.rs:67-68
let worktree_base_dir = Path::new(&workspace.root_path).join(&workspace.worktree_base_dir);
let worktree_path = worktree_base_dir.join(msg.branch_name.replace('/', "_"));
```

This means:
- Main worktree path = `workspace.root_path` (e.g., `/home/blake/Documents/software/ymir`)
- Feature worktree path = `workspace.root_path + /.git/worktrees/<branch>` (e.g., `/home/blake/Documents/software/ymir/.git/worktrees/feat_test2`)

Both are stored as absolute paths in the `worktrees.path` column.

### 3. Database Schema

**File:** `crates/ws-server/src/db/mod.rs` — `SCHEMA_MIGRATIONS`

```sql
-- workspaces table
root_path TEXT NOT NULL,          -- e.g., /home/blake/Documents/software/ymir
worktree_base_dir TEXT DEFAULT '.git/worktrees',

-- worktrees table  
path TEXT NOT NULL,               -- e.g., /home/blake/Documents/software/ymir/.git/worktrees/feat_test2
```

Both columns store **raw absolute paths with no normalization**.

### 4. Server Startup — Loading Paths into Memory

**File:** `crates/ws-server/src/state.rs` — `initialize_from_db()`

On startup, the server loads all workspaces and worktrees directly from the DB:
```rust
// state.rs:188-199 — workspaces
workspaces.insert(id, WorkspaceState {
    root_path: ws.root_path,  // stored verbatim
    ...
});

// state.rs:210-225 — worktrees  
worktrees.insert(id, WorktreeState {
    path: wt.path,  // stored verbatim
    ...
});
```

**No path validation or transformation occurs.** The paths from the dev machine's DB are loaded as-is.

### 5. File Listing — The Critical Failure Point

**File:** `crates/ws-server/src/router.rs` — `handle_file_list()` (lines 759-824)

```rust
let base_path = std::path::PathBuf::from(worktree.path.clone());  // WRONG PATH
let target_path = match &path {
    Some(p) if !p.is_empty() => base_path.join(p),
    _ => base_path.clone(),
};

let files = tokio::task::spawn_blocking(move || {
    let mut result = Vec::new();
    if let Ok(entries) = std::fs::read_dir(&target_path) {  // FAILS — path doesn't exist
        // ... enumerate entries ...
    }
    result.sort();
    result
})
.await
.unwrap_or_default();  // Returns EMPTY vec on failure
```

**When the path doesn't exist:**
- `std::fs::read_dir()` returns `Err`
- The `if let Ok(...)` block is skipped
- `result` remains empty
- `unwrap_or_default()` returns `[]`
- Client receives `FileListResult { files: [], ... }`

This explains the server log: `FileListResult { worktree_id: cbe3fc9f..., files: [], path: None }`

### 6. Git Status — Secondary Failure

**File:** `crates/ws-server/src/router.rs` — `handle_git_status()` (lines 610-637)

```rust
let repo_path = std::path::PathBuf::from(worktree.path.clone());  // WRONG PATH
match state.git_ops.status(worktree_id, repo_path.as_path()).await {
    Err(e) => ServerMessage::new(ServerMessagePayload::Error(Error {
        code: "GIT_STATUS_ERROR",
        message: e.to_string(),  // "Repository not found: failed to resolve path '/home/blake/...'"
    })),
}
```

**When the path doesn't exist:**
- `git2::Repository::open()` fails with "failed to resolve path"
- Returns `GitError::RepositoryNotFound`
- Client receives `GIT_STATUS_ERROR`

This explains the server log: `GIT_STATUS_ERROR: Repository not found: failed to resolve path '/home/blake/Documents/software/ymir': No such file or directory`

### 7. All Path-Dependent Operations Are Affected

Every operation that resolves a worktree path uses `worktree.path` directly:

| Operation | File | Line | Uses `worktree.path` |
|---|---|---|---|
| File List | `router.rs` | 776 | `PathBuf::from(worktree.path)` |
| File Read | `router.rs` | 844 | `PathBuf::from(worktree.path)` |
| Git Status | `router.rs` | 616 | `PathBuf::from(worktree.path)` |
| Git Diff | `router.rs` | 647 | `PathBuf::from(worktree.path)` |
| Git Commit | `router.rs` | 683 | `PathBuf::from(worktree.path)` |
| Create PR | `router.rs` | 725 | `PathBuf::from(worktree.path)` |
| Agent Spawn | `agent/handler.rs` | 72 | `worktree.path.clone()` |
| Worktree Change Branch | `worktree/mod.rs` | 430 | `Path::new(&worktree.path)` |
| Worktree Delete | `worktree/mod.rs` | 241 | `Path::new(&worktree.path)` |
| Worktree Create | `worktree/mod.rs` | 65-68 | `workspace.root_path` → derived worktree paths |

## Key Architectural Findings

### No Path Mapping Layer Exists

Searched for: `path.*map`, `map.*path`, `path.*transform`, `transform.*path`, `remap`, `prefix`, `/home/blake`, `/root/` — **no results related to path transformation.**

The only path transformation in the entire codebase is `expand_tilde()` in `workspace/mod.rs`, which only handles `~` → `$HOME` substitution during workspace creation.

### Workspace Root Path vs Worktree Path

- **Workspace `root_path`**: The absolute path to the main git repository. Set during workspace creation from the Tauri file picker. Used as the base for computing worktree paths.
- **Worktree `path`**: The absolute path to a specific worktree directory. For main worktrees, this equals `workspace.root_path`. For feature worktrees, this equals `workspace.root_path/.git/worktrees/<name>`.

Both are stored as raw absolute paths and used interchangeably wherever a filesystem path is needed.

### Database Path Origin

The database file (`ymir.db`, configurable via `YMIR_DB_PATH`) is a local SQLite/Turso database. When the Tauri desktop app creates a workspace, it stores the local machine's absolute path. If this database file is then used by a ws-server on a different machine (VM), those paths are invalid.

## Root Cause

The ws-server is **designed as a local desktop component**, not a remote server. It assumes:
1. The ws-server runs on the same machine as the Tauri app
2. The database is created and consumed on the same machine
3. All paths in the database are valid on the machine running the server

When deployed to a remote VM, these assumptions break. The DB contains developer-local paths that don't exist on the VM.

## Implications for Fix

Any fix must address the path at one of these points:
1. **At creation time**: Store paths in a portable/relative format
2. **At load time**: Remap paths during `initialize_from_db()` based on config
3. **At use time**: Apply path transformation in each handler (least ideal)
4. **Database-level**: Add a path mapping configuration (e.g., prefix replacement rules)

The most surgical fix would be adding a configurable path prefix remap at server startup (option 2), replacing the stored developer path prefix with the server's actual path prefix.
