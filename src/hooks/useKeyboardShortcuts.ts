/**
 * useKeyboardShortcuts hook - Global keyboard shortcut management
 *
 * Provides global keyboard shortcut handling for the workspace system.
 * Tracks focused pane state for context-aware shortcuts.
 * All shortcuts use Cmd (Mac) or Ctrl (Windows/Linux) as the modifier.
 *
 * @example
 * ```tsx
 * const { focusedPaneId, setFocusedPaneId } = useKeyboardShortcuts();
 *
 * // In Pane component:
 * <div onClick={() => setFocusedPaneId(paneId)}>...</div>
 * ```
 */

import { useState, useEffect, useCallback } from 'react';
import useWorkspaceStore from '../state/workspace';
import { SplitDirection } from '../state/types';

/**
 * Hook return type for useKeyboardShortcuts
 */
export interface UseKeyboardShortcutsReturn {
  /** ID of the currently focused pane, or null if none focused */
  focusedPaneId: string | null;
  /** Set the focused pane ID (call on pane click) */
  setFocusedPaneId: (paneId: string | null) => void;
}

/**
 * Hook for managing global keyboard shortcuts
 *
 * Handles all workspace shortcuts:
 * - ⌘1-8: Switch to workspace (1-8)
 * - ⌘D: Split pane right
 * - ⌘⇧D: Split pane down
 * - ⌘T: Create new tab in focused/active pane
 * - ⌘W: Close active tab in focused/active pane
 * - ⌘⇧W: Close focused/active pane
 * - ⌘B: Toggle sidebar
 * - ⌘I: Switch to notifications tab
 * - ⌘⇧U: Jump to first unread notification
 *
 * @returns Focus state and setter for UI integration
 */
export function useKeyboardShortcuts(): UseKeyboardShortcutsReturn {
  // Get store state and actions
  const activeWorkspaceId = useWorkspaceStore((state) => state.activeWorkspaceId);
  const workspaces = useWorkspaceStore((state) => state.workspaces);

  const {
    setActiveWorkspace,
    createTab,
    closeTab,
    closePane,
    splitPane,
    setActivePane,
    setActiveTab,
    toggleSidebar,
    setActiveSidebarTab,
    zoomIn,
    zoomOut,
    resetZoom,
  } = useWorkspaceStore.getState();

  // Track focused pane for context-aware shortcuts
  const [focusedPaneId, setFocusedPaneId] = useState<string | null>(null);

  /**
   * Jump to first unread notification across all panes
   */
  const jumpToFirstUnread = useCallback(() => {
    const workspace = workspaces.find((w) => w.id === activeWorkspaceId);
    if (!workspace) return;

    // Find first tab with notification across all panes
    for (const paneId of Object.keys(workspace.panes)) {
      const pane = workspace.panes[paneId];
      const notifiedTab = pane.tabs.find((t) => t.hasNotification);
      if (notifiedTab) {
        setActivePane(paneId);
        setActiveTab(paneId, notifiedTab.id);
        return;
      }
    }
  }, [activeWorkspaceId, workspaces, setActivePane, setActiveTab]);

  // Keyboard shortcut handler
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isCtrl = e.ctrlKey || e.metaKey;
      const isShift = e.shiftKey;

      // Get current workspace
      const workspace = workspaces.find((w) => w.id === activeWorkspaceId);
      if (!workspace) return;

      // Determine target pane (focused or active)
      const currentPaneId = focusedPaneId || workspace.activePaneId;

      // ⌘1-8: Switch to workspace (1-8)
      if (isCtrl && !isShift && /^[1-8]$/.test(e.key)) {
        e.preventDefault();
        const index = parseInt(e.key, 10) - 1;
        if (workspaces[index]) {
          setActiveWorkspace(workspaces[index].id);
        }
        return;
      }

      // ⌘D: Split pane right
      if (isCtrl && !isShift && e.key === 'd') {
        e.preventDefault();
        if (currentPaneId) {
          splitPane(currentPaneId, 'right' as SplitDirection);
        }
        return;
      }

      // ⌘⇧D: Split pane down
      if (isCtrl && isShift && (e.key === 'D' || e.key === 'd')) {
        e.preventDefault();
        if (currentPaneId) {
          splitPane(currentPaneId, 'down' as SplitDirection);
        }
        return;
      }

      // ⌘T: Create new tab
      if (isCtrl && !isShift && e.key === 't') {
        e.preventDefault();
        if (currentPaneId) {
          createTab(currentPaneId);
        }
        return;
      }

      // ⌘W: Close active tab
      if (isCtrl && !isShift && e.key === 'w') {
        e.preventDefault();
        if (currentPaneId) {
          const pane = workspace.panes[currentPaneId];
          if (pane?.activeTabId) {
            closeTab(currentPaneId, pane.activeTabId);
          }
        }
        return;
      }

      // ⌘⇧W: Close pane
      if (isCtrl && isShift && (e.key === 'W' || e.key === 'w')) {
        e.preventDefault();
        if (currentPaneId) {
          closePane(currentPaneId);
        }
        return;
      }

      // ⌘B: Toggle sidebar
      if (isCtrl && !isShift && e.key === 'b') {
        e.preventDefault();
        toggleSidebar();
        return;
      }

      // ⌘I: Toggle notification panel
      if (isCtrl && !isShift && e.key === 'i') {
        e.preventDefault();
    setActiveSidebarTab('notifications');
        return;
      }

      // ⌘⇧U: Jump to first unread notification
      if (isCtrl && isShift && (e.key === 'U' || e.key === 'u')) {
        e.preventDefault();
        jumpToFirstUnread();
        return;
      }

      // ⌘= or ⌘⇧= (⌘+): Zoom in
      if (isCtrl && (e.key === '=' || e.key === '+')) {
        e.preventDefault();
        zoomIn();
        return;
      }

      // ⌘-: Zoom out
      if (isCtrl && e.key === '-') {
        e.preventDefault();
        zoomOut();
        return;
      }

      // ⌘0: Reset zoom
      if (isCtrl && !isShift && e.key === '0') {
        e.preventDefault();
        resetZoom();
        return;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    activeWorkspaceId,
    focusedPaneId,
    workspaces,
    setActiveWorkspace,
    createTab,
    closeTab,
    closePane,
    splitPane,
    toggleSidebar,
    setActiveSidebarTab,
    jumpToFirstUnread,
    zoomIn,
    zoomOut,
    resetZoom,
  ]);

  return { focusedPaneId, setFocusedPaneId };
}

export default useKeyboardShortcuts;
