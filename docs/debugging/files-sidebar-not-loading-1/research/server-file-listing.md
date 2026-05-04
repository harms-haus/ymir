# Server-Side File Listing Failure Path Analysis

## Summary

The files sidebar shows empty because `handle_file_list` silently returns `files: []` when the worktree directory doesn't exist or can't be read. This is a **silent failure fallback**, not a genuine empty directory result.

## Code Path: File List Request

### 1. Entry Point
- **File:** `crates/ws-server/src/router.rs:228-229`
- `ClientMessagePayload::FileList(msg)` → `handle_file_list(state, msg)`

### 2. Handler: `handle_file_list` (router.rs:759-824)

```
FileList request (worktree_id, path)
  └─→ Lookup worktree in state.worktrees (read lock)
       └─→ If not found → WORKTREE_NOT_FOUND error
       └─→ If found → use worktree.path as base_path
  └─→ target_path = base_path.join(path)  (or base_path if no path)
  └─→ spawn_blocking {
       std::fs::read_dir(&target_path)
         └─→ If Ok: iterate entries, skip large dirs, collect names
         └─→ If Err: SILENTLY RETURNS EMPTY Vec  ← BUG
       result.sort()
     }
     .await.unwrap_or_default()  ← Second silent fallback
  └─→ Return FileListResult { files, path, worktree_id }
```

### 3. Critical Silent Failure Points

**Point A — `std::fs::read_dir` failure (line 791):**
```rust
if let Ok(entries) = std::fs::read_dir(&target_path) {
    // ... iterate
}
// If Err: result stays empty, no error logged, no error returned
```
If `target_path` doesn't exist, is a file (not directory), or has permission issues — the handler returns `files: []` with no indication of failure.

**Point B — `spawn_blocking` failure (line 816):**
```rust
.await.unwrap_or_default()
```
If the blocking task panics, this also returns an empty vec silently.

## Git Status Error is SEPARATE

The `GIT_STATUS_ERROR: Repository not found` is from a **completely different handler**:

- **File:** `crates/ws-server/src/router.rs:610-636` — `handle_git_status`
- Calls `state.git_ops.status(worktree_id, repo_path)` → `open_repo(repo_path)` 
- **File:** `crates/ws-server/src/git/mod.rs:398-400`
  ```rust
  fn open_repo(path: &Path) -> Result<Repository, GitError> {
      Repository::open(path).map_err(|e| GitError::RepositoryNotFound(e.to_string()))
  }
  ```

The file listing (`handle_file_list`) does **NOT** depend on git operations succeeding. It uses plain `std::fs::read_dir`. The two errors share the same root cause (bad worktree path) but are independent failures.

## Root Cause: Worktree Path Resolution

### How the path is stored:

1. **Main worktree** (`worktree/mod.rs:467-541` — `create_main`):
   - Path = `workspace.root_path` (from DB, stored as-is)

2. **Branch worktree** (`worktree/mod.rs:53-196` — `create`):
   - Path = `workspace.root_path / worktree_base_dir / branch_name_replaced`

3. **Loaded at startup** (`state.rs:206-230` — `initialize_from_db`):
   - Paths loaded directly from DB with **no validation or tilde expansion**

### Why the path fails:

The error shows: `failed to resolve path '/home/blake/Documents/software/ymir'`

This path comes from the worktree record in the database. Possible causes:
- Path belongs to a different user/machine
- The directory was moved or deleted
- Path contains `~` that was never expanded (tilde expansion exists in `workspace/mod.rs:45-56` but only applies during workspace creation, not during DB loading or file listing)

## File Listing vs Git: Independence

| Aspect | File Listing | Git Status |
|--------|-------------|------------|
| Handler | `handle_file_list` | `handle_git_status` |
| Method | `std::fs::read_dir()` | `git2::Repository::open()` |
| Depends on git? | **No** | Yes |
| Error on failure | **Silent** → `files: []` | Error response `GIT_STATUS_ERROR` |
| Validates path exists? | No | Yes (git2 fails) |

## Key Findings

1. **`files: []` is a silent fallback** — the handler never returns an error when the directory doesn't exist. It just returns an empty list.

2. **No error logging in `handle_file_list`** — unlike `handle_file_read` which logs `"Failed to read file: {}"`, the file list handler has zero logging on failure.

3. **No error response** — unlike git operations which return `GIT_STATUS_ERROR`, file listing always returns success with whatever it found (even if nothing).

4. **Git errors and file listing errors are independent** — the `GIT_STATUS_ERROR` does not cause the empty file list. Both are symptoms of the same bad worktree path, but the file listing would be empty even if git status were never called.

5. **Path validation gap** — worktree paths are loaded from DB into memory at startup with no existence check. There's no validation that the path actually exists before using it.

## Recommended Fixes

1. **Add error handling in `handle_file_list`**: Return an error response (e.g., `FILE_LIST_ERROR`) when `std::fs::read_dir` fails, instead of silently returning `[]`.

2. **Add logging**: Log the failure when the directory can't be read, including the target path.

3. **Add path validation on startup**: During `initialize_from_db`, check that each worktree path exists and log warnings for missing paths.

4. **Consider tilde expansion**: Ensure `~` in stored paths is expanded before use, since `expand_tilde` exists but is only called during workspace creation.
