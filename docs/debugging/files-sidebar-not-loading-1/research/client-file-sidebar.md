# Client-Side File Sidebar Rendering Path — Trace Analysis

## Overview

Traces the complete client-side path from WebSocket `FileList` request through to `AllFilesTab` component render, including error handling.

---

## 1. Component Location & Structure

**File:** `apps/web/src/components/project/AllFilesTab.tsx`

The `AllFilesTab` component is rendered inside `ProjectPanel.tsx` (line 92) within a `<Tabs.Panel value="all-files">`.

### Key State (lines 63-77)

```typescript
const activeWorktree = useStore(selectActiveWorktree);
const fileListCache = useStore(selectFileListCache(activeWorktree?.id ?? ''));
const [files, setFiles] = useState(fileListCache?.files ?? []);
const [isLoading, setIsLoading] = useState(!fileListCache);
```

- **`activeWorktree`** — Zustand store selector for the currently selected worktree
- **`fileListCache`** — Per-worktree cached file list from Zustand (`Map<worktreeId, {worktreeId, files, timestamp}>`)
- **`files`** — Local React state, initialized from cache or `[]`
- **`isLoading`** — Local React state, `true` when there's no cache entry (i.e., first load)

---

## 2. Data Flow: WebSocket → Store → Component

### 2.1 Request Initiation

When `AllFilesTab` mounts with an `activeWorktree` and no cache entry (line 182-189):

```typescript
if (!fileListCache) {
  setIsLoading(true);
  pendingFileListWorktreeId.current = activeWorktree.id;
  client.send({ type: 'FileList', worktreeId: activeWorktree.id });
  // 15s timeout set...
}
```

### 2.2 WebSocket Transport Layer

**File:** `apps/web/src/lib/yws-transport.ts`

The `YmirWsTransport` class handles all WebSocket communication:

- **`onMessage(type, callback)`** (line 463-481): Components subscribe to specific `ServerMessage` types (e.g., `'FileListResult'`, `'ErrorResponse'`)
- **`dispatchOnMessageHandlers(decoded)`** (line 485-591): Reconstructs PascalCase `ServerMessage` types from incoming `BridgeEnvelope` and dispatches to registered handlers

**Dispatch logic for `file_response` envelopes** (lines 517-532):
```typescript
} else if (payload?.type && typeof payload.type === "string") {
  // Server passthrough envelopes carry the concrete type in payload.type
  dispatchType = payload.type as string;  // e.g., "FileListResult"
  dispatchMsg = { type: dispatchType, ...(payload.data ?? payload) };
}
```

**Dispatch logic for `error_response` envelopes** (lines 572-577):
```typescript
// Direct messages: envelope type IS the message type
dispatchType = type.replace(/(^|_)([a-z])/g, (_, __, c) => c.toUpperCase());
// "error_response" → "ErrorResponse"
dispatchMsg = { type: dispatchType, ...(payload ?? {}) };
```

**Fallback detection for missing `payload.type`** (lines 536-542):
```typescript
if (payload && Array.isArray(payload.files)) {
  dispatchType = "FileListResult";  // Detected by presence of `files` array
}
```

### 2.3 Store Handler (Zustand)

**File:** `apps/web/src/store.ts`

**`file_response` handler** (lines 1186-1215):
```typescript
case 'file_response': {
  if (!isFileResponse(message)) return;
  const payload = message.payload as Record<string, unknown> | null;
  if (!payload) return;
  const data = payload.data ?? payload;

  if (data.worktreeId !== undefined && data.files !== undefined) {
    // FileListResult
    if (worktreeId && files) {
      useStore.getState().setFileListCache(worktreeId, files);
    }
  }
  // ... also handles FileContent
}
```

**`error_response` handler** (lines 1163-1183):
```typescript
case 'error_response': {
  if (!isErrorResponse(message)) return;
  const payload = message.payload;
  if (!payload) return;
  const data = payload.data ?? (payload.code !== undefined ? payload : undefined);
  if (data) {
    handleError({ type: 'Error', code: error.code, message: error.message, ... });
  }
  // NOTE: Does NOT clear file cache or set any error flag
}
```

**`setFileListCache` action** (lines 870-875):
```typescript
setFileListCache: (worktreeId: string, files: string[]) =>
  set((state) => {
    const newCache = new Map(state.fileListCache);
    newCache.set(worktreeId, { worktreeId, files, timestamp: Date.now() });
    return { fileListCache: newCache };
  }),
```

**`selectFileListCache` selector** (lines 976-977):
```typescript
export const selectFileListCache = (worktreeId: string) => (state: AppState) =>
  state.fileListCache.get(worktreeId) ?? null;
```

### 2.4 Component Message Subscribers

**`FileListResult` handler** (lines 142-174):
```typescript
const unsubscribe = client.onMessage('FileListResult', (message) => {
  // Check for lazy-loaded directory response
  if (message.path && pendingDirRequests.current.has(message.path)) {
    // Merge children into loadedChildren map
    setLoadedChildren((prev) => {
      const next = new Map(prev);
      next.set(message.path, message.files);
      return next;
    });
    setLoadingDirs((prev) => { /* remove from loading set */ });
    return;
  }

  // Root-level response
  if (message.worktreeId === activeWorktree.id) {
    setFiles(message.files);                    // ← Local state update
    setFileListCache(activeWorktree.id, message.files);  // ← Store cache update
    setIsLoading(false);                        // ← Clear loading spinner
    pendingFileListWorktreeId.current = null;
  }
  // ... handles stale worktree scenario
});
```

**`ErrorResponse` handler** (lines 135-140):
```typescript
const unsubscribeError = client.onMessage('ErrorResponse', (_message) => {
  console.warn('[AllFilesTab] Received Error message, clearing loading state');
  setIsLoading(false);              // ← Stops showing skeleton
  setLoadingDirs(new Set());        // ← Clears pending dir loads
  pendingDirRequests.current.clear();
  // NOTE: Does NOT update `files` state — remains [] or previous value
});
```

---

## 3. Render Logic

The component has three render paths (lines 269-327):

### 3.1 No Worktree Selected
```typescript
if (!activeWorktree) {
  return <div><i className="ri-folder-warning-line" /> No worktree selected</div>;
}
```

### 3.2 Loading State
```typescript
if (isLoading) {
  return <ProjectSkeleton />;  // Loading skeleton animation
}
```

### 3.3 No Files (Empty Array)
```typescript
if (files.length === 0) {
  return <div><i className="ri-file-search-line" /> No files found</div>;
}
```

### 3.4 Has Files — Render Tree
```typescript
return <FileTree data={treeData} onActivate={handleEdit} ... />;
```

**Key distinction:** `files.length === 0` (empty array) is handled the same as no files received — both show "No files found". There's **no visual distinction** between "truly no files" and "error occurred but files state is empty".

---

## 4. Error Response vs File List Response — Key Differences

| Aspect | FileListResult | ErrorResponse |
|--------|---------------|---------------|
| **Envelope type** | `file_response` (with `payload.type: "FileListResult"`) | `error_response` |
| **Dispatch type** | `FileListResult` | `ErrorResponse` (snake→Pascal conversion) |
| **Store handler** | `setFileListCache(worktreeId, files)` | `handleError()` → toast notification only |
| **Component handler** | `setFiles()`, `setFileListCache()`, `setIsLoading(false)` | `setIsLoading(false)`, `setLoadingDirs(new Set())` |
| **Files state** | Updated to `message.files` (can be `[]`) | **Not touched** — stays at previous value or `[]` |
| **Loading state** | Set to `false` | Set to `false` |
| **Cache updated** | Yes | No |

---

## 5. Empty vs Undefined Files Array

### Initialization
```typescript
const [files, setFiles] = useState(fileListCache?.files ?? []);
```
- If `fileListCache` is `null` (no cache entry) → `files = []`
- If `fileListCache.files` is `[]` (cached empty) → `files = []`
- If `fileListCache.files` is `['a.ts', 'b.ts']` → `files = ['a.ts', 'b.ts']`

### Loading State
```typescript
const [isLoading, setIsLoading] = useState(!fileListCache);
```
- `fileListCache = null` → `isLoading = true` (will fetch)
- `fileListCache = {files: []}` → `isLoading = false` (won't fetch, shows "No files found")
- `fileListCache = {files: ['a.ts']}` → `isLoading = false` (shows tree)

### After ErrorResponse
- `isLoading` set to `false`
- `files` unchanged (remains `[]` if it was `[]`)
- Render path: `files.length === 0` → "No files found"

---

## 6. Potential Issues Identified

### Issue 1: No Visual Distinction Between "No Files" and "Error Occurred"

When an `ErrorResponse` arrives for a `FileList` request, the component:
1. Logs `"[AllFilesTab] Received Error message, clearing loading state"`
2. Sets `isLoading = false`
3. Leaves `files` as `[]`
4. Renders "No files found"

**Problem:** The user sees "No files found" which is ambiguous — it could mean the worktree truly has no files, or it could mean an error prevented loading. There's no error indicator, retry button, or error message shown in the sidebar itself.

**The store's `error_response` handler only dispatches a toast notification via `handleError()`**, which may be easy to miss or may have already been dismissed by the time the user looks at the sidebar.

### Issue 2: Store Cache Not Updated on Error

The `error_response` handler in `store.ts` does NOT:
- Clear the file list cache for the affected worktree
- Set any error flag in the store
- Trigger a retry

This means if the component remounts or the worktree changes and back, it will attempt to fetch again (which is correct), but the error state is not persisted anywhere.

### Issue 3: Store Handler Truthiness Check for `files` Array

In `store.ts` line 1199:
```typescript
if (worktreeId && files) {
  useStore.getState().setFileListCache(worktreeId, files);
}
```

In JavaScript, an empty array `[]` is **truthy**, so `if (files)` passes for `files = []`. This is correct behavior — empty file lists ARE cached. However, this is a subtle pattern that could mislead developers who might expect `if (files)` to check for non-empty arrays. If this ever changes to `if (files && files.length > 0)`, empty directory results would no longer be cached, causing infinite re-fetching.

### Issue 4: Timeout Clears Cache But Doesn't Reset Files State

The 15s timeout handler (lines 192-199):
```typescript
fileListTimeoutRef.current = setTimeout(() => {
  setFileListCache(activeWorktree.id, []);  // Caches empty array
  setIsLoading(false);
  pendingFileListWorktreeId.current = null;
}, 15000);
```

This caches an empty array `[]` instead of clearing the cache. On subsequent mounts, the component would see `fileListCache = {files: []}` and skip fetching entirely, permanently showing "No files found" even if files actually exist. This differs from the `ErrorResponse` handler which does NOT touch the cache at all.

---

## 7. Complete Flow Diagram

```
User opens "All Files" tab
    │
    ▼
AllFilesTab component mounts
    │
    ├── activeWorktree = null? → Show "No worktree selected"
    │
    ├── fileListCache hit? → Initialize from cache, skip fetch
    │
    └── No cache → setIsLoading(true)
    │       │
    │       ▼
    │   Send {type: 'FileList', worktreeId: '...'}
    │   Set 15s timeout
    │
    ▼
Server Response
    │
    ├── FileListResult arrives
    │   ├── dispatchOnMessageHandlers → dispatchType = "FileListResult"
    │   ├── Component handler: setFiles(files), setFileListCache(), setIsLoading(false)
    │   ├── Store handler: setFileListCache(worktreeId, files)
    │   └── Render: files.length > 0 → <FileTree>, else → "No files found"
    │
    ├── ErrorResponse arrives
    │   ├── dispatchOnMessageHandlers → dispatchType = "ErrorResponse" (snake→Pascal)
    │   ├── Component handler: setIsLoading(false), clear pending dirs
    │   ├── Store handler: handleError() → toast notification only
    │   └── Render: files.length === 0 → "No files found" (NO ERROR INDICATOR)
    │
    └── Timeout (15s)
        ├── setFileListCache(worktreeId, [])
        ├── setIsLoading(false)
        └── Render: "No files found"
```

---

## 8. Files Referenced

| File | Purpose |
|------|---------|
| `apps/web/src/components/project/AllFilesTab.tsx` | Main component (327 lines) |
| `apps/web/src/components/project/ProjectPanel.tsx` | Parent component, renders AllFilesTab in tab |
| `apps/web/src/store.ts` | Zustand store: file cache state, actions, selectors, bridge message handlers |
| `apps/web/src/lib/yws-transport.ts` | WebSocket transport: onMessage, dispatch, envelope decoding |
| `apps/web/src/types/protocol.ts` | Protocol types: FileList, FileListResult, ErrorResponse, ServerMessage |
| `apps/web/src/types/bridge-envelope.ts` | Bridge envelope types: BridgeMessage variants, type guards |
| `apps/web/src/lib/error-recovery.ts` | Error handling: handleError(), type-specific recovery |
| `apps/web/src/components/project/ProjectSkeleton.tsx` | Loading skeleton component |
