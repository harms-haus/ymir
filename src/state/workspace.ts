// Workspace state management using Zustand with Immer
// Handles workspace/pane/tab hierarchy with direct mutations
// Includes session persistence via Tauri storage

import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { devtools, persist, createJSONStorage } from 'zustand/middleware';
import { invoke } from '@tauri-apps/api/core';

import {
  Workspace,
  Pane,
  Tab,
  SplitNode,
  LeafNode,
  BranchNode,
  SplitDirection,
  SplitAxis,
  isBranch,
  isLeaf,
  SidebarTab,
  PanelDefinition,
} from './types';
import { MAX_PANES, MAX_SCROLLBACK_LINES } from './types';

// ============================================================================
// Extended Workspace with Pane Map
// ============================================================================

interface WorkspaceWithPanes extends Workspace {
  panes: Record<string, Pane>;
}

// ============================================================================
// Store State Interface
// ============================================================================

interface WorkspaceState {
  workspaces: WorkspaceWithPanes[];
  activeWorkspaceId: string;
  sidebarCollapsed: boolean;
  notificationPanelOpen: boolean;
  activeTab: SidebarTab;
  panels: PanelDefinition[];
  // Mock git state for badge reactivity
  gitStagedCount: number;
  gitChangesCount: number;

  createWorkspace: (name: string) => void;
  closeWorkspace: (workspaceId: string) => void;
  setActiveWorkspace: (workspaceId: string) => void;

  splitPane: (paneId: string, direction: SplitDirection) => void;
  closePane: (paneId: string) => void;
  setActivePane: (paneId: string) => void;

  createTab: (paneId: string, cwd?: string) => void;
  closeTab: (paneId: string, tabId: string) => void;
  setActiveTab: (paneId: string, tabId: string) => void;
  markNotification: (tabId: string, message: string) => void;
  clearNotification: (tabId: string) => void;
  updateTabSessionId: (paneId: string, tabId: string, sessionId: string) => void;


  toggleSidebar: () => void;
  toggleNotificationPanel: () => void;
  resetState: () => void;

  // Sidebar panel management
  setActiveSidebarTab: (tab: SidebarTab) => void;
  registerPanel: (definition: PanelDefinition) => void;

  // Mock git actions for badge testing
  updateGitChanges: (staged: number, changes: number) => void;
}

// ============================================================================
// Persisted State Interface (without PTY sessions)
// ============================================================================

interface PersistedWorkspaceState {
  workspaces: WorkspaceWithPanes[];
  activeWorkspaceId: string;
  sidebarCollapsed: boolean;
  notificationPanelOpen: boolean;
}

// ============================================================================
// Tauri Storage Adapter for Session Persistence
// ============================================================================

/**
 * Custom storage adapter using Tauri invoke commands.
 * Persists session data to Tauri's native storage.
 */
const tauriStorage = {
getItem: async (name: string): Promise<string | null> => {
    try {
      // Check if Tauri is available (not available in tests)
      if (typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window) {
        const data = await invoke<string>('load_session', { name });
        return data;
      }
      return null;
    } catch (error) {
      if (import.meta.env.DEV) {
        console.error('[Storage] getItem failed:', { key: name, error });
      }
      return null;
    }
  },
setItem: async (name: string, value: string): Promise<void> => {
    try {
      // Check if Tauri is available (not available in tests)
      if (typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window) {
        await invoke('save_session', { name, data: value });
      }
    } catch (error) {
      if (import.meta.env.DEV) {
        console.error('[Storage] setItem failed:', { key: name, error });
      }
    }
  },
removeItem: async (name: string): Promise<void> => {
    try {
      // Check if Tauri is available (not available in tests)
      if (typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window) {
        await invoke('delete_session', { name });
      }
    } catch (error) {
      if (import.meta.env.DEV) {
        console.error('[Storage] removeItem failed:', { key: name, error });
      }
    }
  },
};

/**
 * Truncates scrollback to MAX_SCROLLBACK_LINES for persistence.
 * Removes PTY session IDs (cannot persist processes).
 */
function prepareStateForPersistence(state: WorkspaceState): PersistedWorkspaceState {
  return {
    workspaces: state.workspaces.map((ws) => ({
      ...ws,
      panes: Object.fromEntries(
        Object.entries(ws.panes).map(([paneId, pane]) => [
          paneId,
          {
            ...pane,
            tabs: pane.tabs.map((tab) => ({
              ...tab,
              // Exclude PTY session ID - cannot persist processes
              sessionId: '',
              // Truncate scrollback to limit
              scrollback: tab.scrollback.slice(-MAX_SCROLLBACK_LINES),
            })),
          },
        ])
      ),
    })),
    activeWorkspaceId: state.activeWorkspaceId,
    sidebarCollapsed: state.sidebarCollapsed,
    notificationPanelOpen: state.notificationPanelOpen,
  };
}

function countPanes(workspaces: WorkspaceWithPanes[]): number {
  let count = 0;
  for (const ws of workspaces) {
    count += Object.keys(ws.panes).length;
  }
  return count;
}

function createDefaultTab(cwd: string = '~'): Tab {
  return {
    id: crypto.randomUUID(),
    title: 'bash',
    cwd,
    sessionId: '', // Empty until PTY is spawned
    scrollback: [],
    hasNotification: false,
    notificationCount: 0,
  };
}

function createDefaultPane(): Pane {
  const tab = createDefaultTab();
  return {
    id: crypto.randomUUID(),
    flexRatio: 1.0,
    tabs: [tab],
    activeTabId: tab.id,
    hasNotification: false,
  };
}

function getSplitAxisAndIndex(direction: SplitDirection): { axis: SplitAxis; splitIndex: number } {
  switch (direction) {
    case 'left':
      return { axis: 'horizontal', splitIndex: 0 };
    case 'right':
      return { axis: 'horizontal', splitIndex: 1 };
    case 'up':
      return { axis: 'vertical', splitIndex: 0 };
    case 'down':
      return { axis: 'vertical', splitIndex: 1 };
  }
}

function splitNodeRecursive(
  node: SplitNode,
  targetPaneId: string,
  newLeaf: LeafNode,
  axis: SplitAxis,
  splitIndex: number,
): SplitNode {
  if (isLeaf(node) && node.paneId === targetPaneId) {
    const branch: BranchNode = {
      type: 'branch',
      id: crypto.randomUUID(),
      axis,
      children: splitIndex === 0 ? [newLeaf, node] : [node, newLeaf],
    };
    return branch;
  }

  if (isBranch(node)) {
    node.children[0] = splitNodeRecursive(node.children[0], targetPaneId, newLeaf, axis, splitIndex);
    node.children[1] = splitNodeRecursive(node.children[1], targetPaneId, newLeaf, axis, splitIndex);
  }

  return node;
}

function closePaneInTreeRecursive(node: SplitNode, paneId: string): SplitNode | null {
  if (isLeaf(node) && node.paneId === paneId) {
    return null;
  }

  if (isBranch(node)) {
    const leftResult = closePaneInTreeRecursive(node.children[0], paneId);
    const rightResult = closePaneInTreeRecursive(node.children[1], paneId);

    if (!leftResult) {
      return rightResult;
    }
    if (!rightResult) {
      return leftResult;
    }

    // Both are non-null now, safe to assign
    node.children[0] = leftResult;
    node.children[1] = rightResult;
  }

  return node;
}

function findFirstPaneInTree(node: SplitNode): string | null {
  if (isLeaf(node)) return node.paneId;
  return findFirstPaneInTree(node.children[0]);
}

const useWorkspaceStore = create<WorkspaceState>()(
  devtools(
    persist(
      immer((set, get) => ({
        workspaces: (() => {
          const pane = createDefaultPane();
          const leaf: LeafNode = {
            type: 'leaf',
            paneId: pane.id,
          };
          const ws: WorkspaceWithPanes = {
            id: 'workspace-1',
            name: 'Workspace 1',
            root: leaf,
            activePaneId: pane.id,
            hasNotification: false,
            panes: {
              [pane.id]: pane,
            },
          };
          return [ws];
        })(),
        activeWorkspaceId: 'workspace-1',
        sidebarCollapsed: false,
        notificationPanelOpen: false,
        activeTab: 'workspaces',
        panels: [],
        // Initialize mock git state
        gitStagedCount: 0,
        gitChangesCount: 0,

        createWorkspace: (name: string) =>
          set((state) => {
            const pane = createDefaultPane();
            const leaf: LeafNode = {
              type: 'leaf',
              paneId: pane.id,
            };
            const newWorkspace: WorkspaceWithPanes = {
              id: crypto.randomUUID(),
              name,
              root: leaf,
              activePaneId: pane.id,
              hasNotification: false,
              panes: {
                [pane.id]: pane,
              },
            };
            state.workspaces.push(newWorkspace);
          }),

        closeWorkspace: (workspaceId: string) =>
          set((state) => {
            const index = state.workspaces.findIndex((ws) => ws.id === workspaceId);
            if (index >= 0 && state.workspaces.length > 1) {
              state.workspaces.splice(index, 1);
              if (state.activeWorkspaceId === workspaceId) {
                state.activeWorkspaceId = state.workspaces[0].id;
              }
            }
          }),

        setActiveWorkspace: (workspaceId: string) =>
          set((state) => {
            const exists = state.workspaces.find((ws) => ws.id === workspaceId);
            if (exists) {
              state.activeWorkspaceId = workspaceId;
            }
          }),

        splitPane: (paneId: string, direction: SplitDirection) =>
          set((state) => {
            const currentPaneCount = countPanes(state.workspaces);
            if (currentPaneCount >= MAX_PANES) {
              return;
            }

            const { axis, splitIndex } = getSplitAxisAndIndex(direction);

            const workspace = state.workspaces.find((ws) => ws.id === state.activeWorkspaceId);
            if (!workspace) return;

            if (!workspace.panes[paneId]) return;

            const newPane = createDefaultPane();
            const newLeaf: LeafNode = {
              type: 'leaf',
              paneId: newPane.id,
            };

            workspace.panes[newPane.id] = newPane;

            workspace.root = splitNodeRecursive(workspace.root, paneId, newLeaf, axis, splitIndex);
          }),

        closePane: (paneId: string) =>
          set((state) => {
            const workspace = state.workspaces.find((ws) => ws.id === state.activeWorkspaceId);
            if (!workspace) return;

            if (Object.keys(workspace.panes).length <= 1) return;

            delete workspace.panes[paneId];

            const newRoot = closePaneInTreeRecursive(workspace.root, paneId);
            if (newRoot) {
              workspace.root = newRoot;

              if (workspace.activePaneId === paneId) {
                workspace.activePaneId = findFirstPaneInTree(newRoot);
              }
            }
          }),

        setActivePane: (paneId: string) =>
          set((state) => {
            const workspace = state.workspaces.find((ws) => ws.id === state.activeWorkspaceId);
            if (workspace && workspace.panes[paneId]) {
              workspace.activePaneId = paneId;
            }
          }),

        createTab: (paneId: string, cwd?: string) =>
          set((state) => {
            const workspace = state.workspaces.find((ws) => ws.id === state.activeWorkspaceId);
            if (!workspace) return;

            const pane = workspace.panes[paneId];
            if (!pane) return;

            const newTab = createDefaultTab(cwd);
            pane.tabs.push(newTab);
            pane.activeTabId = newTab.id;
          }),

        closeTab: async (paneId: string, tabId: string) => {
          // First, find the tabToClose and sessionId from current state
          const state = get();
          const workspace = state.workspaces.find((ws) => ws.id === state.activeWorkspaceId);
          if (!workspace) return;

          const pane = workspace.panes[paneId];
          if (!pane) return;

          const tabToClose = pane.tabs.find((t) => t.id === tabId);

          // Kill the PTY session with await and proper error handling
          if (tabToClose?.sessionId) {
            try {
              await invoke('kill_pty', { sessionId: tabToClose.sessionId });
            } catch (error) {
              if (import.meta.env.DEV) {
                console.error('[closeTab] Failed to kill PTY session:', { sessionId: tabToClose.sessionId, error });
              }
              // Preserve original error handling behavior
            }
          }

          // Now update state after PTY is killed
          set((state) => {
            const workspace = state.workspaces.find((ws) => ws.id === state.activeWorkspaceId);
            if (!workspace) return;

            const pane = workspace.panes[paneId];
            if (!pane) return;

            pane.tabs = pane.tabs.filter((t) => t.id !== tabId);

            if (pane.activeTabId === tabId) {
              const lastTab = pane.tabs[pane.tabs.length - 1];
              pane.activeTabId = lastTab ? lastTab.id : null;
            }

            if (pane.tabs.length === 0) {
              get().closePane(paneId);
            }
          });
        },

        setActiveTab: (paneId: string, tabId: string) =>
          set((state) => {
            const workspace = state.workspaces.find((ws) => ws.id === state.activeWorkspaceId);
            if (!workspace) return;

            const pane = workspace.panes[paneId];
            if (pane && pane.tabs.some((t) => t.id === tabId)) {
              pane.activeTabId = tabId;
              get().clearNotification(tabId);
            }
          }),

        markNotification: (tabId: string, message: string) =>
          set((state) => {
            for (const workspace of state.workspaces) {
              for (const pane of Object.values(workspace.panes)) {
                const tab = pane.tabs.find((t) => t.id === tabId);
                if (tab) {
                  tab.hasNotification = true;
                  tab.notificationCount = tab.notificationCount + 1;
                  tab.notificationText = message;
                  pane.hasNotification = true;
                  workspace.hasNotification = true;
                }
              }
            }
          }),

        clearNotification: (tabId: string) =>
          set((state) => {
            for (const workspace of state.workspaces) {
              let workspaceHasNotification = false;
              for (const pane of Object.values(workspace.panes)) {
                const tab = pane.tabs.find((t) => t.id === tabId);
                if (tab) {
                  tab.hasNotification = false;
                  tab.notificationCount = 0;
                  tab.notificationText = undefined;
                }

                pane.hasNotification = pane.tabs.some((t) => t.hasNotification);
                if (pane.hasNotification) {
                  workspaceHasNotification = true;
                }
              }
              workspace.hasNotification = workspaceHasNotification;
            }
          }),

        updateTabSessionId: (paneId: string, tabId: string, sessionId: string) =>
          set((state) => {
            for (const workspace of state.workspaces) {
              const pane = workspace.panes[paneId];
              if (pane) {
                const tab = pane.tabs.find((t) => t.id === tabId);
                if (tab) {
                  tab.sessionId = sessionId;
                }
              }
            }
          }),

        toggleSidebar: () =>
          set((state) => {
            state.sidebarCollapsed = !state.sidebarCollapsed;
          }),

        toggleNotificationPanel: () =>
          set((state) => {
            state.notificationPanelOpen = !state.notificationPanelOpen;
          }),

        resetState: () =>
          set((state) => {
            const pane = createDefaultPane();
            const leaf: LeafNode = {
              type: 'leaf',
              paneId: pane.id,
            };
            const ws: WorkspaceWithPanes = {
              id: 'workspace-1',
              name: 'Workspace 1',
              root: leaf,
              activePaneId: pane.id,
              hasNotification: false,
              panes: {
                [pane.id]: pane,
              },
            };
            state.workspaces = [ws];
            state.activeWorkspaceId = ws.id;
            state.sidebarCollapsed = false;
            state.notificationPanelOpen = false;
            state.activeTab = 'workspaces';
            state.panels = [];
            state.gitStagedCount = 0;
            state.gitChangesCount = 0;
          }),

        setActiveSidebarTab: (tab: SidebarTab) =>
          set((state) => {
            state.activeTab = tab;
          }),

        registerPanel: (definition: PanelDefinition) =>
          set((state) => {
            // Check if panel with this ID already exists
            const existingIndex = state.panels.findIndex((p) => p.id === definition.id);
            if (existingIndex >= 0) {
              // Replace existing panel
              state.panels[existingIndex] = definition;
            } else {
              // Add new panel
              state.panels.push(definition);
            }
          }),

        updateGitChanges: (staged: number, changes: number) =>
          set((state) => {
            state.gitStagedCount = staged;
            state.gitChangesCount = changes;
          }),
      })),
      {
        name: 'workspace-storage',
        storage: createJSONStorage(() => tauriStorage),
        partialize: (state) => prepareStateForPersistence(state),
      }
    ),
    { name: 'WorkspaceStore' },
  ),
);

export const activeWorkspace = () => {
  const { workspaces, activeWorkspaceId } = useWorkspaceStore.getState();
  return workspaces.find((ws) => ws.id === activeWorkspaceId) || null;
};

export const activePane = () => {
  const ws = activeWorkspace();
  if (!ws || !ws.activePaneId) return null;
  return ws.panes[ws.activePaneId] || null;
};

export const paneCount = () => {
  const { workspaces } = useWorkspaceStore.getState();
  return countPanes(workspaces);
};

export const hasNotifications = () => {
  const { workspaces } = useWorkspaceStore.getState();
  return workspaces.some((ws) => ws.hasNotification);
};

export const getActivePanel = () => {
  const { activeTab, panels } = useWorkspaceStore.getState();
  return panels.find((p) => p.id === activeTab) || null;
};

export const getPanel = (id: SidebarTab) => {
  const { panels } = useWorkspaceStore.getState();
  return panels.find((p) => p.id === id) || null;
};

// Badge selectors for reactive badge counts
export const getTotalNotificationCount = () => {
  const { workspaces } = useWorkspaceStore.getState();
  let total = 0;
  for (const ws of workspaces) {
    for (const pane of Object.values(ws.panes)) {
      for (const tab of pane.tabs) {
        total += tab.notificationCount;
      }
    }
  }
  return total;
};

export const getGitChangesCount = () => {
  const { gitStagedCount, gitChangesCount } = useWorkspaceStore.getState();
  return gitStagedCount + gitChangesCount;
};

export default useWorkspaceStore;
export type { WorkspaceState, WorkspaceWithPanes };
