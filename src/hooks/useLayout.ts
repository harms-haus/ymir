/**
 * useLayout hook - Manages workspace layout state and pane operations
 *
 * Provides reactive access to workspace data, active pane/tab state,
 * and pane ratio management for the resizable panel system.
 *
 * @example
 * ```tsx
 * const { workspace, activePane, activeTab, getPaneRatio, setPaneRatio } = useLayout('workspace-1');
 * ```
 */

import { useMemo, useCallback } from 'react';
import useWorkspaceStore, { WorkspaceWithPanes } from '../state/workspace';
import { Pane, Tab } from '../state/types';

/**
 * Hook return type for useLayout
 */
export interface UseLayoutReturn {
  /** Current workspace with panes map, or null if not found */
  workspace: WorkspaceWithPanes | null;
  /** Currently active pane in the workspace, or null */
  activePane: Pane | null;
  /** Currently active tab in the active pane, or null */
  activeTab: Tab | null;
  /** Get the flex ratio for a specific pane (returns 1.0 as default if not found) */
  getPaneRatio: (paneId: string) => number;
  /** Set the flex ratio for a specific pane */
  setPaneRatio: (paneId: string, ratio: number) => void;
  /** Total number of panes in the workspace */
  paneCount: number;
  /** Whether any tab in the workspace has notifications */
  hasNotifications: boolean;
}

/**
 * Hook for managing workspace layout state
 *
 * @param workspaceId - The ID of the workspace to manage (optional, uses active workspace if not provided)
 * @returns Layout state and operations for the workspace
 */
export function useLayout(workspaceId?: string): UseLayoutReturn {
  // Subscribe to store state
  const workspaces = useWorkspaceStore((state) => state.workspaces);
  const activeWorkspaceId = useWorkspaceStore((state) => state.activeWorkspaceId);

  // Get the target workspace ID (use provided or fall back to active)
  const targetWorkspaceId = workspaceId ?? activeWorkspaceId;

  // Memoize the workspace lookup
  const workspace = useMemo(() => {
    return workspaces.find((ws) => ws.id === targetWorkspaceId) ?? null;
  }, [workspaces, targetWorkspaceId]);

  // Memoize the active pane
  const activePane = useMemo(() => {
    if (!workspace || !workspace.activePaneId) return null;
    return workspace.panes[workspace.activePaneId] ?? null;
  }, [workspace]);

  // Memoize the active tab
  const activeTab = useMemo(() => {
    if (!activePane || !activePane.activeTabId) return null;
    return activePane.tabs.find((t) => t.id === activePane.activeTabId) ?? null;
  }, [activePane]);

  // Memoize pane count
  const paneCount = useMemo(() => {
    if (!workspace) return 0;
    return Object.keys(workspace.panes).length;
  }, [workspace]);

  // Memoize notifications state
  const hasNotifications = useMemo(() => {
    if (!workspace) return false;
    return workspace.hasNotification;
  }, [workspace]);

  /**
   * Get the flex ratio for a specific pane
   * Returns 1.0 as default if pane not found
   */
  const getPaneRatio = useCallback(
    (paneId: string): number => {
      if (!workspace) return 1.0;
      const pane = workspace.panes[paneId];
      return pane?.flexRatio ?? 1.0;
    },
    [workspace]
  );

  /**
   * Set the flex ratio for a specific pane
   * Uses Immer for immutable updates via Zustand
   */
  const setPaneRatio = useCallback(
    (paneId: string, ratio: number): void => {
      if (!workspace) return;

      // Validate ratio is positive
      if (ratio <= 0) {
        console.warn(`Invalid pane ratio: ${ratio}. Must be positive.`);
        return;
      }

      // Update the pane's flexRatio in the store
      useWorkspaceStore.setState((state) => {
        const ws = state.workspaces.find((w) => w.id === targetWorkspaceId);
        if (ws && ws.panes[paneId]) {
          ws.panes[paneId].flexRatio = ratio;
        }
      });
    },
    [workspace, targetWorkspaceId]
  );

  return {
    workspace,
    activePane,
    activeTab,
    getPaneRatio,
    setPaneRatio,
    paneCount,
    hasNotifications,
  };
}

export default useLayout;
