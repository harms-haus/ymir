# File Sidebar Slow Loading Bug — Outline of Changes

## Problem Summary
The file sidebar (All Files tab) is very slow to load and sometimes never loads because:
1. The backend recursively scans the ENTIRE worktree (ignoring the `path` parameter) and does so with blocking I/O on the Tokio event loop
2. The frontend eagerly fetches ALL files on mount, builds the full tree on every render without memoization, and has O(n*m) folder-has-changes checks
3. Large directories like `node_modules`, `target`, `.venv` are not excluded

## Solution: Lazy Loading
Fetch only top-level items initially, then fetch children on-demand when a directory is expanded.

---

# VERTICAL SLICE 1: Backend — Fix `handle_file_list` to Support Path-Specific Listing

## 1.1 Fix: Respect the `path` parameter
**File:** `crates/ws-server/src/router.rs` (lines 709-758)

**Current (line 712):**
```rust
let _path = msg.path.unwrap_or_default();  // BUG: ignored, always scans entire worktree
```

**Change:**
- If `msg.path` is `Some(dir_path)`, resolve it relative to the worktree base and list only that directory's immediate children (files + subdirectory names)
- If `msg.path` is `None`, list only top-level children of the worktree root (NOT recursive)
- This eliminates the recursive `collect_files` function entirely

## 1.2 Fix: Use async-safe I/O via `spawn_blocking`
**File:** `crates/ws-server/src/router.rs`

**Current (lines 731-747):**
```rust
fn collect_files(dir: &std::path::Path, base: &std::path::Path, files: &mut Vec<String>) {
    if let Ok(entries) = std::fs::read_dir(dir) {  // BUG: blocking in async context
        ...
    }
}
```

**Change:**
- Wrap `std::fs::read_dir()` inside `tokio::task::spawn_blocking()` to avoid blocking the Tokio event loop
- This matches the pattern used elsewhere in the codebase for git operations

## 1.3 Fix: Skip known large directories
**Current (line 735):** Only `.git` is excluded.

**Change:**
- Add a comprehensive ignore list: `.git`, `node_modules`, `.venv`, `venv`, `__pycache__`, `target`, `dist`, `build`, `.next`, `out`, `.cache`, `coverage`, `vendor` (Go), `.tox`, `.mypy_cache`, `.pytest_cache`
- Skip these directories at the first level they appear during directory traversal

## 1.4 Fix: Change response semantics
**Current:** Returns a flat `Vec<String>` of ALL file paths in the entire tree.

**Change:**
- Return only immediate children of the requested `path` (or root if `path` is `None`)
- Each entry should include whether it is a directory or a file
- Add `is_directory: bool` field to the response so the frontend knows if a node is expandable

**Protocol change in `crates/ws-server/src/protocol/file.rs`:**
```rust
// Add new struct for individual entries
pub struct FileListEntry {
    pub name: String,       // Just the filename/dirname
    pub path: String,       // Full relative path from worktree root
    pub is_directory: bool,
}

// Update FileListResult
pub struct FileListResult {
    pub worktree_id: Uuid,
    pub path: String,            // The path that was listed (echo back)
    pub entries: Vec<FileListEntry>,
    pub request_id: Option<Uuid>,
}
```

**NOTE:** This is a breaking protocol change. The frontend will need to be updated simultaneously.
Alternatively, to minimize protocol churn, keep `files: Vec<String>` but:
- Only return immediate children (not recursive)
- Use trailing `/` on directory names to distinguish (e.g., `"src/"` vs `"Cargo.toml"`)

**Recommended approach (minimal protocol change):**
Keep the existing `FileListResult { files: Vec<String>, ... }` signature but:
- Return only immediate children
- Append `/` to directory names for distinction
- The frontend already handles this pattern implicitly

---

# VERTICAL SLICE 2: Frontend — Implement Lazy Loading in AllFilesTab

## 2.1 Change: Initial fetch requests root only
**File:** `apps/web/src/components/project/AllFilesTab.tsx` (lines 149-167)

**Current:**
```tsx
const fileListMsg: FileList = {
    type: 'FileList',
    worktreeId: activeWorktree.id,
};
client.send(fileListMsg);  // Gets ALL files
```

**Change:**
```tsx
const fileListMsg: FileList = {
    type: 'FileList',
    worktreeId: activeWorktree.id,
    path: undefined,  // Explicit: root level only
};
client.send(fileListMsg);
```

## 2.2 Change: Implement `onToggle` handler for lazy loading
**File:** `apps/web/src/components/project/AllFilesTab.tsx`

**Current:** No `onToggle` prop passed to `FileTree` (line 242-272).

**Change:** Add an `onToggle` handler that:
1. Checks if the toggled node is a directory
2. Checks if the directory's children have already been loaded (see 2.3)
3. If not loaded, sends a `FileList` message with `path: node.data.id`
4. On `FileListResult` response, merges the new entries into the existing file tree state
5. If already loaded, does nothing (tree handles expand/collapse internally)

```tsx
const [expandedDirs, setExpandedDirs] = useState<Set<string>>(new Set());
const [loadedChildren, setLoadedChildren] = useState<Map<string, string[]>>(new Map());

const handleToggle = useCallback((nodeId: string) => {
    if (!expandedDirs.has(nodeId)) {
        // Expanding — fetch children if not already loaded
        if (!loadedChildren.has(nodeId)) {
            const client = getWebSocketClient();
            client.send({
                type: 'FileList',
                worktreeId: activeWorktree.id,
                path: nodeId,
            } as FileList);
        }
        setExpandedDirs(prev => new Set(prev).add(nodeId));
    } else {
        // Collapsing
        setExpandedDirs(prev => {
            const next = new Set(prev);
            next.delete(nodeId);
            return next;
        });
    }
}, [activeWorktree, expandedDirs, loadedChildren]);
```

## 2.3 Change: Handle `FileListResult` for child directory responses
**File:** `apps/web/src/components/project/AllFilesTab.tsx` (lines 123-141)

**Current:** `FileListResult` handler only handles the root-level response.

**Change:** Extend the handler to also process directory-specific responses:
- Check if the response `path` matches a pending directory expansion
- Store children in `loadedChildren` map
- Rebuild tree with new children merged in

## 2.4 Change: Memoize `buildFileTree` with `useMemo`
**File:** `apps/web/src/components/project/AllFilesTab.tsx` (line 212)

**Current:**
```tsx
const treeData = buildFileTree(files, gitStatusMap);  // Runs on EVERY render
```

**Change:**
```tsx
const treeData = useMemo(
    () => buildFileTree(files, gitStatusMap),
    [files, gitStatusMap]
);
```

Also need to memoize `gitStatusMap` (line 207-210):
```tsx
const gitStatusMap = useMemo(() => {
    const map = new Map<string, GitStatusEntry>();
    for (const entry of gitStatusEntries) {
        map.set(entry.path, entry);
    }
    return map;
}, [gitStatusEntries]);
```

## 2.5 Change: Memoize `folderHasChanges`
**File:** `apps/web/src/components/project/AllFilesTab.tsx` (lines 236-238)

**Current:**
```tsx
function folderHasChanges(folderId: string): boolean {
    return gitStatusEntries.some(f => f.path.startsWith(folderId + '/'));
}
```
This is O(n) per call, and is called for every directory node.

**Change:** Pre-compute a `Set<string>` of all directory paths that have changes:
```tsx
const dirsWithChanges = useMemo(() => {
    const dirs = new Set<string>();
    for (const entry of gitStatusEntries) {
        const parts = entry.path.split('/');
        let current = '';
        for (let i = 0; i < parts.length - 1; i++) {
            current = current ? `${current}/${parts[i]}` : parts[i];
            dirs.add(current);
        }
    }
    return dirs;
}, [gitStatusEntries]);
```

Then `folderHasChanges` becomes O(1):
```tsx
const folderHasChanges = useCallback(
    (folderId: string) => dirsWithChanges.has(folderId),
    [dirsWithChanges]
);
```

## 2.6 Change: Pass `onToggle` to `FileTree`
**File:** `apps/web/src/components/project/AllFilesTab.tsx` (lines 242-272)

**Current:**
```tsx
<FileTree
    data={treeData}
    onActivate={handleEdit}
    onContextMenu={handleContextMenu}
    openByDefault={false}
    renderRightContent={...}
/>
```

**Change:**
```tsx
<FileTree
    data={treeData}
    onActivate={handleEdit}
    onContextMenu={handleContextMenu}
    onToggle={handleToggle}
    openByDefault={false}
    renderRightContent={...}
/>
```

## 2.7 Change: Increase timeout to 15 seconds
**File:** `apps/web/src/components/project/AllFilesTab.tsx` (line 166)

**Current:** `}, 8000);`

**Change:** `}, 15000);` (with lazy loading, root-level should be fast, but directory fetches may need more time for very large dirs)

---

# VERTICAL SLICE 3: Frontend — Fix Same Issues in ChangesTab

## 3.1 Move `buildNestedTree` out of component body
**File:** `apps/web/src/components/project/ChangesTab.tsx` (lines 76-133)

**Current:** `buildNestedTree` is defined INSIDE the component function, which recreates it every render.

**Change:** Move it to module scope (outside the component function), same as `buildFileTree` should be moved in AllFilesTab.

## 3.2 Memoize tree building
**File:** `apps/web/src/components/project/ChangesTab.tsx` (lines 66-74)

**Current:**
```tsx
const treeData: FileTreeNode[] = viewMode === 'flat'
    ? files.map(...)
    : buildNestedTree(files);
```

**Change:**
```tsx
const treeData = useMemo(() => {
    if (viewMode === 'flat') {
        return files.map((file) => ({...}));
    }
    return buildNestedTree(files);
}, [files, viewMode]);
```

## 3.3 Memoize `folderHasChanges`
**File:** `apps/web/src/components/project/ChangesTab.tsx` (lines 157-159)

**Current:** Same O(n) per-call pattern as AllFilesTab.

**Change:** Same pre-computed Set approach as AllFilesTab (section 2.5).

---

# VERTICAL SLICE 4: Frontend — Store Cache Improvements

## 4.1 Change: Support per-path caching instead of per-worktree only
**File:** `apps/web/src/store.ts` (lines 74, 535-540, 645-646)

**Current:** Cache is keyed by `worktreeId` only, storing a flat `files: string[]`.

**Change:** Change cache structure to support path-specific entries:
```typescript
interface FileListCacheEntry {
    worktreeId: string;
    path: string;  // '' for root, or directory path
    files: string[];
    timestamp: number;
}

fileListCache: Map<string, FileListCacheEntry>();  // key: `${worktreeId}::${path}`
```

Or simpler: nest by worktreeId then path:
```typescript
fileListCache: Map<string, Map<string, { files: string[], timestamp: number }>>();
// Outer key: worktreeId, inner key: path ('' for root)
```

**Update selectors and actions accordingly:**
- `selectFileListCache(worktreeId, path?)` 
- `setFileListCache(worktreeId, path, files)`

## 4.2 Change: Keep root cache on worktree switch
**File:** `apps/web/src/store.ts` (lines 136-137)

**Current:**
```typescript
newFileListCache.delete(activeWorktreeId);
newGitStatusCache.delete(activeWorktreeId);
```

**Change:** 
- With lazy loading, the root-level file list is small and fast to compute — keep it cached
- Only invalidate directory-specific caches (or keep those too, they're cheap)
- This prevents the flash of loading state when switching back to a previously-visited worktree

---

# VERTICAL SLICE 5: Protocol Changes (If Needed)

## 5.1 Option A: Minimal change (trailing `/` convention)
No protocol struct changes needed. Backend uses trailing `/` on directory names:
- `"src/"` = directory
- `"Cargo.toml"` = file

Frontend strips trailing `/` for display and knows the node is expandable.

## 5.2 Option B: Structured entries (cleaner, more work)
**Files:**
- `crates/ws-server/src/protocol/file.rs` — Add `FileListEntry` struct, update `FileListResult`
- TypeScript types auto-regenerate via `ts-rs`
- Frontend types in `apps/web/src/types/protocol.ts` — update to match
- All `FileListResult` consumers updated (AllFilesTab, bridge codec, tests)

---

# VERTICAL SLICE 6: Tests

## 6.1 Backend tests
**File:** `crates/ws-server/src/router.rs` or `crates/ws-server/src/` test module
- Test that `path=None` returns only root-level children
- Test that `path="src"` returns only immediate children of `src/`
- Test that `node_modules` is excluded
- Test that blocking I/O doesn't block event loop (integration test)

## 6.2 Frontend tests
**File:** `apps/web/src/__tests__/store-bridge-messages.test.ts`
- Update existing `FileListResult` tests if protocol changes
- Add tests for lazy directory loading flow

**File:** `apps/web/src/components/project/__tests__/` (new or existing)
- Test that initial mount only requests root
- Test that expanding a directory triggers a new `FileList` request
- Test that already-loaded directories don't re-fetch

---

# IMPLEMENTATION ORDER (Recommended)

1. **Backend first (Slice 1)** — Fix `handle_file_list` to respect `path`, skip large dirs, use `spawn_blocking`
2. **Protocol (Slice 5, Option A)** — Use trailing `/` convention for directories (minimal change)
3. **Frontend lazy loading (Slice 2)** — Implement `onToggle`, path-specific requests, memoization
4. **Frontend ChangesTab (Slice 3)** — Same memoization fixes
5. **Store cache (Slice 4)** — Support per-path caching
6. **Tests (Slice 6)** — Add/update tests

---

# ESTIMATED FILES CHANGED

| File | Change Type |
|------|-------------|
| `crates/ws-server/src/router.rs` | Rewrite `handle_file_list` (lines 709-758) |
| `crates/ws-server/src/protocol/file.rs` | Optional: add `FileListEntry` |
| `apps/web/src/components/project/AllFilesTab.tsx` | Major: lazy loading, memoization, onToggle |
| `apps/web/src/components/project/ChangesTab.tsx` | Moderate: memoization, move buildNestedTree |
| `apps/web/src/components/ui/FileTree.tsx` | Minor: verify onToggle prop wiring (already exists) |
| `apps/web/src/store.ts` | Moderate: per-path cache support |
| `apps/web/src/types/protocol.ts` | Optional: update if protocol struct changes |
| `apps/web/src/__tests__/store-bridge-messages.test.ts` | Update tests |

---

# RISK ASSESSMENT

- **Low risk:** Memoization fixes (Slices 2.4, 2.5, 3.2, 3.3) — pure performance improvements, no behavior change
- **Medium risk:** Backend `handle_file_list` rewrite (Slice 1) — changes response content, must coordinate with frontend
- **Medium risk:** Lazy loading implementation (Slice 2) — changes loading UX, need to handle error/loading states for directory fetches
- **Low risk:** Store cache changes (Slice 4) — additive changes to cache structure
- **Low risk:** ChangesTab fixes (Slice 3) — same pattern as AllFilesTab
