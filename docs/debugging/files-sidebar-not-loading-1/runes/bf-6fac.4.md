# bf-6fac.4 — Tests for error handling and error display

## Status: claimed

## Description
Add tests to verify the server-side error handling and client-side error display work correctly.

## Files
- Backend test module: Create or add to existing test in `crates/ws-server/src/`
- Frontend: Use existing test setup in `apps/web/src/`

## Backend Changes
1. Test: `handle_file_list` returns `FILE_LIST_ERROR` for non-existent worktree path
   - Create an `AppState` with a worktree pointing to `/tmp/nonexistent-path-xyz`
   - Send a `FileList` message
   - Assert response is `ErrorResponse` with `code: "FILE_LIST_ERROR"`
2. Test: `handle_file_list` returns files normally for valid path
   - Create temp directory with files
   - Create worktree pointing to temp dir
   - Assert response is `FileListResult` with expected files

## Frontend Changes
1. Test: ErrorResponse shows error UI with message and retry button
2. Test: Retry button re-sends FileList request

## Success criteria
- All backend tests pass: `cargo test -p ymir-ws-server`
- If no frontend test framework exists, document what's needed and skip frontend tests (mark as out of scope)
