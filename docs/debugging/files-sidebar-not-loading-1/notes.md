# Bug: Files Sidebar Not Loading

## Description
The files sidebar (AllFilesTab) is no longer loading files. It shows empty/loading state indefinitely.

## Server Log Evidence
1. `FileListResult { worktree_id: cbe3fc9f-4eec-4db1-8884-7a980df3849d, files: [], path: None }` — empty file list returned
2. `GIT_STATUS_ERROR: Repository not found: failed to resolve path '/home/blake/Documents/software/ymir': No such file or directory` — the worktree path doesn't exist on the server VM
3. Server VM has the repo at `/root/ymir`, but worktree DB record stores `/home/blake/Documents/software/ymir` (developer's local machine path)

## Client Log Evidence
- `[AllFilesTab] Received Error message, clearing loading state` — error handler fires but sidebar remains empty
- No file tree data received or rendered

## Root Cause (Confirmed by Research)

**Primary**: The ws-server stores absolute developer-machine paths in the DB (`/home/blake/Documents/software/ymir`). When running on the VM, these paths don't exist. `handle_file_list` uses `std::fs::read_dir()` which silently fails → returns `files: []`.

**Secondary (client)**: When `ErrorResponse` arrives, `AllFilesTab` clears loading but doesn't show error state — user sees "No files found" with no indication something went wrong.

**Independence**: File listing and git status are completely independent handlers. Both fail due to the same bad path, but `GIT_STATUS_ERROR` does NOT cause the empty file list.

## Key Question
Is the file listing failing because:
a) The git status error causes the entire file list request to fail?
b) The file listing code uses the wrong path?
c) The error response is handled incorrectly on the client side?

**Answer**: (b) is the root cause. File listing uses wrong path and silently returns []. (c) makes it harder to diagnose but is secondary. (a) is incorrect — they're independent.

## Worktree Data
- Main worktree: id=cbe3fc9f, path=/home/blake/Documents/software/ymir (DON'T EXIST ON VM)
- Secondary worktree: id=d408eeb4, path=/home/blake/Documents/software/ymir/.git/worktrees/feat_test2 (ALSO DOESN'T EXIST)
