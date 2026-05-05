# React-Specific Checks

## Rules of Hooks Violations

### WorkspaceTree.tsx — No Hook Violations

All hooks in `WorkspaceTree` are called at the top level of the component, unconditionally:
- `useStore` (lines 21-27) — called unconditionally
- `useMemo` (lines 29, 37) — called unconditionally
- `useCallback` (lines 94, 103) — called unconditionally
- `useEffect` (lines 114, 155) — called unconditionally

**Verdict: No Rules of Hooks violations.**

### SidebarPanel.tsx — No Hook Violations

- `useStore` (lines 185-186) — called unconditionally
- `useState` (line 187) — called unconditionally
- `useCallback` (line 189) — called unconditionally
- `useEffect` (line 18, inside `CreateWorkspaceModal`) — called unconditionally

**Verdict: No Rules of Hooks violations.**

## Orphaned Context Providers

The app uses Zustand stores (`useStore`, `useUIStore`), not React Context. There are no orphaned React Context Providers related to context menus.

The `useContextMenu` hook is a standalone Zustand-free hook that uses `useState`/`useCallback` internally. It does not depend on any context provider.

**Verdict: No orphaned context provider issue.**

## StrictMode Double-Mounting

React 18 StrictMode double-mounts effects in development. This could theoretically cause issues with:
1. WebSocket subscriptions being set up twice
2. State being initialized twice

The `WorkspaceTree` has two `useEffect` hooks:
- Line 114: WebSocket `onMessage` subscription + auto-select
- Line 155: Auto-select when worktrees arrive

Both have proper cleanup functions (`return () => { unsubscribe() }`), so double-mount would just create a second subscription that gets cleaned up on the first unmount.

**However**: This is NOT the cause of the missing context menu. The context menu isn't broken by StrictMode — it simply doesn't exist in the rendering path.

**Verdict: StrictMode is not the cause.**

## Subscribe-Before-Send Race Conditions

The `WorkspaceTree` has an interesting pattern in its first `useEffect` (line 114-151):
1. It subscribes to `StateSnapshot` WebSocket messages
2. It immediately calls `tryAutoSelect()` 

This is actually a "subscribe-before-send" anti-pattern in reverse — it subscribes and then reads state synchronously. The `tryAutoSelect` function reads from `useStore.getState()`, which is synchronous, so there's no race.

**Verdict: No race condition affecting context menus.**

## Double Subscriptions

The two `useEffect` hooks in `WorkspaceTree` both do auto-selection logic:
1. First effect (line 114): Subscribes to `StateSnapshot`, calls `tryAutoSelect()`
2. Second effect (line 155): Triggers when `worktrees.length` changes, calls auto-select

Both have early returns (`if (state.activeWorktreeId) return;`) so they won't double-set the active worktree. This is a bit redundant but not harmful.

**Verdict: Redundant auto-select logic but not harmful. Not related to context menus.**

## FileTree Component — Potential Issue

`FileTree.tsx` line 43-46 defines `handleContextMenu` inline in the renderer:

```tsx
const handleContextMenu = (e: React.MouseEvent) => {
  e.preventDefault();
  onContextMenu?.(e, node);
};
```

This calls `e.preventDefault()` unconditionally before forwarding to the parent's `onContextMenu`. If the parent doesn't pass an `onContextMenu`, the default is still prevented — this means **right-click is always suppressed** on FileTree items even when no context menu handler is provided.

This is a **secondary bug**: Right-clicking on workspace/worktree items does nothing visible because `e.preventDefault()` fires (blocking the browser's native context menu), but no custom menu is rendered either because `onContextMenu` is undefined.

**Verdict: FileTree prevents native context menu even when no handler is passed. This is why right-click "silently" does nothing.**

## Conditional Rendering Concern

`WorkspaceTree` returns `null` if `workspaces.length === 0` (line 182-184). This means:
- When there are no workspaces, the tree doesn't render at all
- When workspaces exist, the tree renders normally

This is not the cause of the bug since the tree does render (workspaces are loaded), but it's worth noting that context menu logic would need to handle the empty state in `SidebarPanel`'s empty state UI.

## Summary of React Checks

| Check | Result | Impact |
|-------|--------|--------|
| Rules of Hooks violations | None | N/A |
| Orphaned Context Providers | None (uses Zustand) | N/A |
| StrictMode double-mounting | Proper cleanup in effects | Not the cause |
| Subscribe-before-send races | None detected | Not the cause |
| Double subscriptions | Redundant auto-select | Not the cause |
| FileTree e.preventDefault() | **Blocks native menu even without handler** | Secondary issue |
| Conditional rendering | Null return when no workspaces | Not the cause |
