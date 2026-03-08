// CLI commands for agent access via window.ymir
// Provides programmatic control over workspace/pane/tab operations

import useWorkspaceStore from '../state/workspace';
import { SplitDirection } from '../state/types';

/**
 * CLI command interface for Ymir window system
 * Exposed on window.ymir for agent/script access
 *
 * @example
 * // Split the active pane to the right
 * window.ymir.split('right');
 *
 * // Create a new tab in the active pane
 * window.ymir.newTab('/home/user/projects');
 *
 * // Close the active tab
 * window.ymir.closeTab();
 */
export const CLI = {
  /**
   * Split the active pane in the specified direction
   *
   * @param direction - Direction to split: 'left', 'right', 'up', or 'down'
   * @example
   * window.ymir.split('right'); // Split to the right
   * window.ymir.split('down');  // Split below
   */
  split: (direction: SplitDirection): void => {
    const state = useWorkspaceStore.getState();
    const { activeWorkspaceId, splitPane } = state;

    const workspace = state.workspaces.find((w) => w.id === activeWorkspaceId);
    if (!workspace) {
      return;
    }

    const { activePaneId } = workspace;
    if (!activePaneId) {
      return;
    }

    splitPane(activePaneId, direction);
  },

  /**
   * Focus a pane in the specified direction (Phase 2)
   *
   * @param direction - Direction to navigate: 'left', 'right', 'up', or 'down'
   * @deprecated Currently uses click-to-focus. Arrow key navigation coming in Phase 2.
   * @example
   * window.ymir.focus('right'); // Focus pane to the right
   */
  focus: (_direction: SplitDirection): void => {
    // Phase 2 - use click-to-focus for now
  },

  /**
   * Create a new tab in the active pane
   *
   * @param cwd - Optional current working directory for the new tab
   * @example
   * window.ymir.newTab();              // Create tab with default cwd
   * window.ymir.newTab('/home/user');  // Create tab with specific cwd
   */
  newTab: (cwd?: string): void => {
    const state = useWorkspaceStore.getState();
    const { activeWorkspaceId, createTab } = state;

    const workspace = state.workspaces.find((w) => w.id === activeWorkspaceId);
    if (!workspace) {
      return;
    }

    const { activePaneId } = workspace;
    if (!activePaneId) {
      return;
    }

    createTab(activePaneId, cwd);
  },

  /**
   * Close the active tab in the active pane
   *
   * @example
   * window.ymir.closeTab(); // Close the currently active tab
   */
  closeTab: (): void => {
    const state = useWorkspaceStore.getState();
    const { activeWorkspaceId, closeTab } = state;

    const workspace = state.workspaces.find((w) => w.id === activeWorkspaceId);
    if (!workspace) {
      return;
    }

    const { activePaneId } = workspace;
    if (!activePaneId) {
      return;
    }

    const pane = workspace.panes[activePaneId];
    if (!pane) {
      return;
    }

    const { activeTabId } = pane;
    if (!activeTabId) {
      return;
    }

    closeTab(activePaneId, activeTabId);
  },

  /**
   * Close the active pane
   *
   * @example
   * window.ymir.closePane(); // Close the currently active pane
   */
  closePane: (): void => {
    const state = useWorkspaceStore.getState();
    const { activeWorkspaceId, closePane } = state;

    const workspace = state.workspaces.find((w) => w.id === activeWorkspaceId);
    if (!workspace) {
      return;
    }

    const { activePaneId } = workspace;
    if (!activePaneId) {
      return;
    }

    closePane(activePaneId);
  },

  /**
   * Mark the active pane as having a notification
   *
   * @param message - Notification message to display
   * @example
   * window.ymir.notify('Build complete');
   * window.ymir.notify('Error: Connection failed');
   */
  notify: (message: string): void => {
    const state = useWorkspaceStore.getState();
    const { activeWorkspaceId, markNotification } = state;

    const workspace = state.workspaces.find((w) => w.id === activeWorkspaceId);
    if (!workspace) {
      return;
    }

    const { activePaneId } = workspace;
    if (!activePaneId) {
      return;
    }

    const pane = workspace.panes[activePaneId];
    if (!pane) {
      return;
    }

    const { activeTabId } = pane;
    if (!activeTabId) {
      return;
    }

    markNotification(activeTabId, message);
  },
};

/**
 * Initialize CLI by exposing it on window.ymir
 * Call this once during app initialization (e.g., in main.tsx)
 *
 * @example
 * // In main.tsx or App.tsx
 * import { initCLI } from './cli/commands';
 * initCLI();
 */
export function initCLI(): void {
  if (typeof window !== 'undefined') {
    (window as Window & { ymir?: YmirCLI }).ymir = CLI;
    console.log('[ymir] CLI initialized on window.ymir');
  }
}

/**
 * Type definition for the Ymir CLI interface
 * Useful for TypeScript consumers
 */
export type YmirCLI = typeof CLI;

/**
 * Global window interface extension for TypeScript
 * @internal
 */
declare global {
  interface Window {
    /** Ymir CLI interface for programmatic window control */
    ymir?: YmirCLI;
  }
}

export default CLI;
