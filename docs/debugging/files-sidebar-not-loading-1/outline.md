# Fix: Files Sidebar Not Loading — Outline

## Problem
The Files sidebar (AllFilesTab) shows "No files found" because the ws-server uses developer-machine absolute paths (e.g., `/home/blake/Documents/software/ymir`) stored in the DB that don't exist on the server VM (`/root/ymir`). `handle_file_list` silently returns `files: []` when `std::fs::read_dir` fails, and the client shows "No files found" with no error indication.

## Root Causes (from research, ranked)
1. **Path mismatch** (root): Worktree paths stored in DB as dev-machine absolutes, used verbatim on server VM. `std::fs::read_dir` fails → silent `[]`.
2. **Silent server-side failure**: `handle_file_list` (router.rs:791-816) catches `read_dir` errors by skipping the `if let Ok(...)` block, returning an empty vec with no logging or error response.
3. **Poor client-side error UX**: `AllFilesTab` ErrorResponse handler clears loading but doesn't show error state or update files — user sees "No files found" indistinguishable from a truly empty directory.

## Constraints
- The ws-server is designed as a local desktop component; it assumes paths are valid on the machine running it
- 10+ handlers use `worktree.path` directly for filesystem operations (file list, file read, git status/diff/commit, PR creation, agent spawn, worktree create/delete/branch)
- `expand_tilde()` exists in `workspace/mod.rs:45-56` but is only called during workspace creation, not at DB load time or handler use time
- The DB stores raw absolute paths with no normalization

## Scope
This fix addresses the immediate symptom (empty sidebar + silent failure). A full architectural fix for path portability (e.g., path prefix remapping config, relative path storage) is out of scope for this bug — it would be a separate initiative.

---

## Vertical Slice 1: Server-Side Error Handling in `handle_file_list`

### Goal
Make `handle_file_list` return a proper error response when the worktree directory can't be read, instead of silently returning `files: []`. Add logging for diagnostics.

### Changes
1. **`crates/ws-server/src/router.rs` — `handle_file_list` (lines 789-816)**
   - Wrap the `spawn_blocking` result in a `Result` instead of using `if let Ok(...)` that silently discards errors
   - If `std::fs::read_dir` fails:
     - Log the error with `tracing::warn!` including the `target_path` and error message
     - Return `ServerMessagePayload::Error` with code `FILE_LIST_ERROR` and a descriptive message
   - If `spawn_blocking` itself fails (line 816 `unwrap_or_default()`):
     - Log the panic/error
     - Return `FILE_LIST_ERROR` instead of `[]`

2. **Protocol consistency**: Match the error handling pattern used by `handle_file_read` (lines 873-882) which logs `"Failed to read file: {}"` and returns an error response

### Expected behavior after fix
- When worktree path doesn't exist: Server sends `ErrorResponse { code: "FILE_LIST_ERROR", message: "Failed to list directory: No such file or directory (path=/home/blake/Documents/software/ymir)" }`
- Client's existing ErrorResponse handler fires, clearing loading state (current behavior)
- Server logs the failure for diagnostics

---

## Vertical Slice 2: Server-Side Path Validation on Startup

### Goal
Validate worktree paths exist at server startup time. Log warnings for missing paths so operators can diagnose the issue before any requests are made.

### Changes
1. **`crates/ws-server/src/state.rs` — `initialize_from_db()` (lines 206-230)**
   - After loading each worktree into the map, check `std::path::Path::new(&wt.path).exists()`
   - If the path doesn't exist, log a `tracing::warn!` with the worktree ID, branch name, stored path, and a hint that the path may be from a different machine
   - Still insert the worktree (don't skip it) — some operations may not need filesystem access

2. **`crates/ws-server/src/state.rs` — Workspace loading (lines 188-204)**
   - Same validation pattern: check `workspace.root_path` exists, warn if not

### Expected behavior after fix
- On server startup, logs show: `"Worktree path does not exist: id=cbe3fc9f, branch=main, path=/home/blake/Documents/software/ymir — path may be from a different machine"`
- Provides early diagnostic signal before any file operations are attempted

---

## Vertical Slice 3: Client-Side Error State in AllFilesTab

### Goal
When a `FILE_LIST_ERROR` (or any ErrorResponse) arrives for a FileList request, show a clear error state in the sidebar with the error message and a retry button, instead of the ambiguous "No files found".

### Changes
1. **`apps/web/src/components/project/AllFilesTab.tsx` — Add error state**
   - Add `const [error, setError] = useState<string | null>(null);`
   - Update ErrorResponse handler (line 135-140):
     - Extract error message from the ErrorResponse payload
     - Set `setError(errorMessage)` in addition to clearing loading
     - Clear `error` on successful FileListResult

2. **`apps/web/src/components/project/AllFilesTab.tsx` — Add error render path**
   - Add error render between loading and "no files" paths:
     ```tsx
     if (error) {
       return <div>
         <i className="ri-error-warning-line" />
         <p>Failed to load files: {error}</p>
         <button onClick={handleRetry}>Retry</button>
       </div>;
     }
     ```

3. **`apps/web/src/components/project/AllFilesTab.tsx` — Add retry handler**
   - `handleRetry`: clear `error`, set `isLoading = true`, resend FileList request
   - Reset `pendingFileListWorktreeId` for the retry flow

4. **`apps/web/src/components/project/AllFilesTab.tsx` — Clear error on worktree switch**
   - In the existing `activeWorktree` change effect, clear `error` to avoid showing stale errors

### Expected behavior after fix
- User sees: "Failed to load files: Failed to list directory: No such file or directory (path=/home/blake/Documents/software/ymir)" with a Retry button
- Distinguishable from "No files found" (truly empty directory)
- Retry button allows re-attempting without page reload

---

## Vertical Slice 4: Tests

### Goal
Verify the error handling and error display work correctly.

### Changes
1. **Backend test** (`crates/ws-server/src/router.rs` or test module)
   - Test that `handle_file_list` returns `FILE_LIST_ERROR` when the worktree path doesn't exist
   - Test that the error message includes the path and OS error
   - Test that a valid path still returns files normally

2. **Frontend test** (`apps/web/src/__tests__/` or component test)
   - Test that ErrorResponse with FILE_LIST_ERROR shows error UI with message and retry button
   - Test that retry clears error and re-sends FileList request
   - Test that successful FileListResult after error clears the error state

---

## Implementation Order (Recommended)
1. **Slice 1** — Add error handling in `handle_file_list` (server-side, isolated change, no client dependency)
2. **Slice 2** — Add path validation on startup (server-side, diagnostic only, no behavioral change)
3. **Slice 3** — Add error state in AllFilesTab (client-side, depends on Slice 1 for the error response)
4. **Slice 4** — Tests (after all code changes are in place)

## Files to Modify
| File | Slice | Priority |
|------|-------|----------|
| `crates/ws-server/src/router.rs` | 1 | Critical — `handle_file_list` error handling |
| `crates/ws-server/src/state.rs` | 2 | High — startup path validation |
| `apps/web/src/components/project/AllFilesTab.tsx` | 3 | High — error UI + retry |
| `crates/ws-server/src/` test module | 4 | Medium — backend tests |
| `apps/web/src/__tests__/` | 4 | Medium — frontend tests |

## Risk Assessment
- **Low risk**: Slice 2 (startup validation — logging only, no behavioral change)
- **Low risk**: Slice 3 (client-side error UI — additive change, existing error path still works)
- **Medium risk**: Slice 1 (changes `handle_file_list` to return errors instead of `[]` — the client must handle the ErrorResponse, but the existing handler already clears loading state; no new protocol types needed)
- **Low risk**: Slice 4 (tests only)

## Out of Scope
- Configurable path prefix remapping (e.g., replace `/home/blake/` → `/root/` at startup) — separate architectural initiative
- Relative path storage in DB — separate architectural initiative
- Tilde expansion at DB load time — the `expand_tilde` function exists but this bug's path doesn't contain `~`; out of scope but noted
