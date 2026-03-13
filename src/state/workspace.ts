// Workspace state management using Zustand with Immer
// Handles workspace/pane/tab hierarchy with direct mutations
// Includes session persistence via Tauri store plugin

import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { devtools, persist, createJSONStorage } from 'zustand/middleware';
import { invoke } from '@tauri-apps/api/core';
import { load, Store } from '@tauri-apps/plugin-store';
import logger from '../lib/logger';
import gitService from '../lib/git-service';
import { discoverGitRepos } from '../lib/git-discovery';
import { generateUUID } from '../lib/utils';
import {
  MAX_WORKSPACES,
  MAX_PANES,
  PANE_WARNING_THRESHOLD,
  MAX_SCROLLBACK_LINES,
  DEFAULT_FONT_SIZE,
  MIN_FONT_SIZE,
  MAX_FONT_SIZE,
  GIT_POLLING_INTERVAL_MS,
} from '../lib/constants';

import {
  Workspace,
  Pane,
  Tab,
  TabType,
  SplitNode,
  LeafNode,
  BranchNode,
  SplitDirection,
  SplitAxis,
  isBranch,
  isLeaf,
  SidebarTab,
  PanelDefinition,
  GitRepo,
} from './types';

// ============================================================================
// Git Polling State (module-level for interval tracking)
// ============================================================================

const gitPollingIntervals: Record<string, number> = {};

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
  activeTab: SidebarTab | string;
  panels: PanelDefinition[];
  // Mock git state for badge reactivity
  gitStagedCount: number;
  gitChangesCount: number;
  // Terminal font size
  fontSize: number;
  // Git state management
  gitRepos: Record<string, GitRepo>;
  activeRepoPath: string | null;
  isGitLoading: boolean;
  gitError: string | null;
  // Git polling state
  isPolling: Record<string, boolean>;

  createWorkspace: (name: string) => void;
  closeWorkspace: (workspaceId: string) => void;
  setActiveWorkspace: (workspaceId: string) => void;
  createWorkspaceAfter: (workspaceId: string, name: string) => void;
  moveWorkspaceUp: (workspaceId: string) => void;
  moveWorkspaceDown: (workspaceId: string) => void;

  splitPane: (paneId: string, direction: SplitDirection) => void;
  closePane: (paneId: string) => void;
  setActivePane: (paneId: string) => void;

  createTab: (paneId: string, cwd?: string, type?: TabType) => void;
  closeTab: (paneId: string, tabId: string) => void;
  setActiveTab: (paneId: string, tabId: string) => void;
  markNotification: (tabId: string, message: string) => void;
  clearNotification: (tabId: string) => void;
  updateTabSessionId: (paneId: string, tabId: string, sessionId: string) => void;
  updateTabTitle: (paneId: string, tabId: string, title: string) => void;


  toggleSidebar: () => void;
  toggleNotificationPanel: () => void;
  resetState: () => void;

  // Sidebar panel management
  setActiveSidebarTab: (tab: SidebarTab | string) => void;
  registerPanel: (definition: PanelDefinition) => void;

  // Mock git actions for badge testing
  updateGitChanges: (staged: number, changes: number) => void;

  // Terminal zoom actions
  zoomIn: () => void;
  zoomOut: () => void;
  resetZoom: () => void;

  // Git state actions
  setGitRepo: (repoPath: string, repo: GitRepo) => void;
  setActiveRepo: (repoPath: string) => void;
  updateGitFile: (repoPath: string, filePath: string, staged: boolean) => void;
  removeGitRepo: (repoPath: string) => void;
  setGitLoading: (loading: boolean) => void;
  setGitError: (error: string | null) => void;
  // Git polling actions
  startGitPolling: (repoPath: string) => void;
  stopGitPolling: (repoPath: string) => void;
  discoverAndRegisterRepos: (rootPath: string) => Promise<void>;
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

let storeInstance: Store | null = null;

const getStore = async (): Promise<Store | null> => {
  if (typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window) {
    if (!storeInstance) {
      storeInstance = await load('workspace-storage.json', { defaults: {}, autoSave: true });
    }
    return storeInstance;
  }
  return null;
};

const tauriStorage = {
  getItem: async (name: string): Promise<string | null> => {
    try {
      const store = await getStore();
      if (store) {
        const value = await store.get<string>(name);
        return value ?? null;
      }
      return null;
    } catch (error) {
      if (import.meta.env.DEV) {
        logger.error('[Storage] getItem failed', { key: name, error });
      }
      return null;
    }
  },
  setItem: async (name: string, value: string): Promise<void> => {
    try {
      const store = await getStore();
      if (store) {
        await store.set(name, value);
      }
    } catch (error) {
      if (import.meta.env.DEV) {
        logger.error('[Storage] setItem failed', { key: name, error });
      }
    }
  },
  removeItem: async (name: string): Promise<void> => {
    try {
      const store = await getStore();
      if (store) {
        await store.delete(name);
      }
    } catch (error) {
      if (import.meta.env.DEV) {
        logger.error('[Storage] removeItem failed', { key: name, error });
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

function calculateGitCounts(repos: Record<string, GitRepo>): { staged: number; unstaged: number } {
  const repoList = Object.values(repos);
  return {
    staged: repoList.reduce((sum, r) => sum + r.staged.length, 0),
    unstaged: repoList.reduce((sum, r) => sum + r.unstaged.length, 0),
  };
}

function createDefaultTab(cwd: string = '~', type: TabType = 'terminal'): Tab {
  return {
    id: generateUUID(),
    title: 'bash',
    type,
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
    id: generateUUID(),
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
      id: generateUUID(),
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
  fontSize: 14,
  // Initialize git state
  gitRepos: {},
  activeRepoPath: null,
  isGitLoading: false,
  gitError: null,
  // Initialize polling state
  isPolling: {},

        createWorkspace: (name: string) =>
          set((state) => {
            const pane = createDefaultPane();
            const leaf: LeafNode = {
              type: 'leaf',
              paneId: pane.id,
            };
            const newWorkspace: WorkspaceWithPanes = {
              id: generateUUID(),
              name,
              root: leaf,
              activePaneId: pane.id,
              hasNotification: false,
              panes: {
                [pane.id]: pane,
              },
            };
            state.workspaces.push(newWorkspace);
            logger.info('[Workspace] Created workspace', { workspaceId: newWorkspace.id, name });
          }),

        closeWorkspace: (workspaceId: string) =>
          set((state) => {
            const index = state.workspaces.findIndex((ws) => ws.id === workspaceId);
            if (index >= 0 && state.workspaces.length > 1) {
              state.workspaces.splice(index, 1);
              if (state.activeWorkspaceId === workspaceId) {
                state.activeWorkspaceId = state.workspaces[0].id;
              }
              logger.info('[Workspace] Closed workspace', { workspaceId });
            }
          }),

        setActiveWorkspace: (workspaceId: string) =>
          set((state) => {
            const exists = state.workspaces.find((ws) => ws.id === workspaceId);
            if (exists) {
              state.activeWorkspaceId = workspaceId;
              logger.info('[Workspace] Set active workspace', { workspaceId });
            }
          }),

        createWorkspaceAfter: (workspaceId: string, name: string) =>
          set((state) => {
            if (state.workspaces.length >= MAX_WORKSPACES) return;
            const index = state.workspaces.findIndex((ws) => ws.id === workspaceId);
            if (index < 0) return;

            const pane = createDefaultPane();
            const leaf: LeafNode = { type: 'leaf', paneId: pane.id };
            const newWorkspace: WorkspaceWithPanes = {
              id: generateUUID(),
              name,
              root: leaf,
              activePaneId: pane.id,
              hasNotification: false,
              panes: { [pane.id]: pane },
            };
            state.workspaces.splice(index + 1, 0, newWorkspace);
            logger.info('[Workspace] Created workspace after', { afterId: workspaceId, newId: newWorkspace.id });
          }),

        moveWorkspaceUp: (workspaceId: string) =>
          set((state) => {
            const index = state.workspaces.findIndex((ws) => ws.id === workspaceId);
            if (index <= 0) return;
            [state.workspaces[index - 1], state.workspaces[index]] = [
              state.workspaces[index],
              state.workspaces[index - 1],
            ];
          }),

        moveWorkspaceDown: (workspaceId: string) =>
          set((state) => {
            const index = state.workspaces.findIndex((ws) => ws.id === workspaceId);
            if (index < 0 || index >= state.workspaces.length - 1) return;
            [state.workspaces[index], state.workspaces[index + 1]] = [
              state.workspaces[index + 1],
              state.workspaces[index],
            ];
          }),

        splitPane: (paneId: string, direction: SplitDirection) =>
          set((state) => {
            const currentPaneCount = countPanes(state.workspaces);
            if (currentPaneCount >= MAX_PANES) {
              logger.warn('Maximum 20 panes reached. Cannot create more panes.');
              return;
            }

            if (currentPaneCount >= PANE_WARNING_THRESHOLD) {
              logger.warn(`Warning: ${currentPaneCount} panes in use. Approaching maximum of 20 panes.`);
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
            if (countPanes(state.workspaces) >= MAX_PANES) {
              logger.warn('Maximum 20 panes reached. Cannot create more panes.');
            }
            logger.info('[Pane] Split pane', { paneId, direction, newPaneId: newPane.id });
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
              logger.info('[Pane] Closed pane', { paneId });
            }
          }),

        setActivePane: (paneId: string) =>
          set((state) => {
            const workspace = state.workspaces.find((ws) => ws.id === state.activeWorkspaceId);
            if (workspace && workspace.panes[paneId]) {
              workspace.activePaneId = paneId;
              logger.debug('[Pane] Set active pane', { paneId });
            }
          }),

        createTab: (paneId: string, cwd?: string, type?: TabType) =>
          set((state) => {
            const workspace = state.workspaces.find((ws) => ws.id === state.activeWorkspaceId);
            if (!workspace) return;

            const pane = workspace.panes[paneId];
            if (!pane) return;

            const newTab = createDefaultTab(cwd, type);
            pane.tabs.push(newTab);
            pane.activeTabId = newTab.id;
            logger.info('[Tab] Created tab', { paneId, tabId: newTab.id, type });
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
              logger.error('Failed to kill PTY session', { error, sessionId: tabToClose.sessionId });
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

            // If no tabs left, close the pane (unless it's the only pane)
            if (pane.tabs.length === 0) {
              // Only close if there's more than one pane in the workspace
              if (Object.keys(workspace.panes).length > 1) {
                delete workspace.panes[paneId];

                const newRoot = closePaneInTreeRecursive(workspace.root, paneId);
                if (newRoot) {
                  workspace.root = newRoot;

                  if (workspace.activePaneId === paneId) {
                    workspace.activePaneId = findFirstPaneInTree(newRoot);
                  }
                }
              }
            }
          });
          logger.info('[Tab] Closed tab', { paneId, tabId });
        },

        setActiveTab: (paneId: string, tabId: string) =>
          set((state) => {
            const workspace = state.workspaces.find((ws) => ws.id === state.activeWorkspaceId);
            if (!workspace) return;

            const pane = workspace.panes[paneId];
            if (pane && pane.tabs.some((t) => t.id === tabId)) {
              pane.activeTabId = tabId;
              get().clearNotification(tabId);
              logger.debug('[Tab] Set active tab', { paneId, tabId });
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

        updateTabTitle: (paneId: string, tabId: string, title: string) =>
          set((state) => {
            for (const workspace of state.workspaces) {
              const pane = workspace.panes[paneId];
              if (pane) {
                const tab = pane.tabs.find((t) => t.id === tabId);
                if (tab) {
                  tab.title = title;
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
            state.gitRepos = {};
            state.activeRepoPath = null;
            state.isGitLoading = false;
            state.gitError = null;
            state.isPolling = {};
          }),

  setActiveSidebarTab: (tab: SidebarTab | string) =>
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

        zoomIn: () =>
          set((state) => {
            state.fontSize = Math.min(state.fontSize + 1, MAX_FONT_SIZE);
          }),

        zoomOut: () =>
          set((state) => {
            state.fontSize = Math.max(state.fontSize - 1, MIN_FONT_SIZE);
          }),

  resetZoom: () =>
    set((state) => {
      state.fontSize = DEFAULT_FONT_SIZE;
    }),

  setGitRepo: (repoPath: string, repo: GitRepo) =>
    set((state) => {
      state.gitRepos[repoPath] = repo;
      const counts = calculateGitCounts(state.gitRepos);
      state.gitStagedCount = counts.staged;
      state.gitChangesCount = counts.unstaged;
    }),

  setActiveRepo: (repoPath: string) =>
    set((state) => {
      if (state.gitRepos[repoPath]) {
        state.activeRepoPath = repoPath;
      }
    }),

  updateGitFile: (repoPath: string, filePath: string, staged: boolean) =>
    set((state) => {
      const repo = state.gitRepos[repoPath];
      if (!repo) return;

      const file = repo.staged.find((f) => f.path === filePath) ||
        repo.unstaged.find((f) => f.path === filePath);
      if (!file) return;

      file.staged = staged;

      if (staged) {
        if (!repo.staged.some((f) => f.path === filePath)) {
          repo.staged.push(file);
        }
        repo.unstaged = repo.unstaged.filter((f) => f.path !== filePath);
      } else {
        if (!repo.unstaged.some((f) => f.path === filePath)) {
          repo.unstaged.push(file);
        }
        repo.staged = repo.staged.filter((f) => f.path !== filePath);
      }

      const counts = calculateGitCounts(state.gitRepos);
      state.gitStagedCount = counts.staged;
      state.gitChangesCount = counts.unstaged;
    }),

  removeGitRepo: (repoPath: string) =>
    set((state) => {
      delete state.gitRepos[repoPath];
      if (state.activeRepoPath === repoPath) {
        const remainingRepos = Object.keys(state.gitRepos);
        state.activeRepoPath = remainingRepos.length > 0 ? remainingRepos[0] : null;
      }
      const counts = calculateGitCounts(state.gitRepos);
      state.gitStagedCount = counts.staged;
      state.gitChangesCount = counts.unstaged;
    }),

  setGitLoading: (loading: boolean) =>
    set((state) => {
      state.isGitLoading = loading;
    }),

  setGitError: (error: string | null) =>
    set((state) => {
      state.gitError = error;
    }),

  startGitPolling: (repoPath: string) => {
    const state = get();

    if (state.isPolling[repoPath]) {
      return;
    }

    set((state) => {
      state.isPolling[repoPath] = true;
    });

    const poll = async () => {
      try {
        const repo = await gitService.getGitStatus(repoPath);
        set((state) => {
          state.gitRepos[repoPath] = repo;
          const counts = calculateGitCounts(state.gitRepos);
          state.gitStagedCount = counts.staged;
          state.gitChangesCount = counts.unstaged;
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
logger.error('Git polling failed', { repoPath, error: message });
    }
  };

  poll();
  gitPollingIntervals[repoPath] = window.setInterval(poll, GIT_POLLING_INTERVAL_MS);
},

  stopGitPolling: (repoPath: string) => {
    if (gitPollingIntervals[repoPath]) {
      window.clearInterval(gitPollingIntervals[repoPath]);
      delete gitPollingIntervals[repoPath];
    }

    set((state) => {
      state.isPolling[repoPath] = false;
    });
  },

  discoverAndRegisterRepos: async (rootPath: string) => {
    const repos = await discoverGitRepos(rootPath);

    for (const repoPath of repos) {
      try {
        const repo = await gitService.getGitStatus(repoPath);
        set((state) => {
          state.gitRepos[repoPath] = repo;
          const counts = calculateGitCounts(state.gitRepos);
          state.gitStagedCount = counts.staged;
          state.gitChangesCount = counts.unstaged;
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logger.error('Failed to register git repository', { repoPath, error: message });
      }
    }
  },
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

// Git state selectors
export const getAllGitRepos = () => {
  const { gitRepos } = useWorkspaceStore.getState();
  return Object.values(gitRepos);
};

export const getGitError = () => {
  const { gitError } = useWorkspaceStore.getState();
  return gitError;
};

export default useWorkspaceStore;
export type { WorkspaceState, WorkspaceWithPanes };
