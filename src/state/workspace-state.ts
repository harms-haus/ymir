import { useSyncExternalStore } from 'react';
import { invoke } from '@tauri-apps/api/core';
import logger from '../lib/logger';
import gitService from '../lib/git-service';
import { discoverGitRepos } from '../lib/git-discovery';
import { generateUUID } from '../lib/utils';
import {
  MAX_WORKSPACES,
  MAX_PANES,
  PANE_WARNING_THRESHOLD,
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
  SplitDirection,
  SplitAxis,
  isBranch,
  isLeaf,
  SidebarTab,
  PanelDefinition,
  GitRepo,
} from './types';

const gitPollingIntervals: Record<string, number> = {};

export interface WorkspaceWithPanes extends Workspace {
  panes: Record<string, Pane>;
}

export interface WorkspaceState {
  workspaces: WorkspaceWithPanes[];
  activeWorkspaceId: string;
  sidebarCollapsed: boolean;
  notificationPanelOpen: boolean;
  activeTab: SidebarTab | string;
  panels: PanelDefinition[];
  gitStagedCount: number;
  gitChangesCount: number;
  fontSize: number;
  gitRepos: Record<string, GitRepo>;
  activeRepoPath: string | null;
  isGitLoading: boolean;
  gitError: string | null;
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

  setActiveSidebarTab: (tab: SidebarTab | string) => void;
  registerPanel: (definition: PanelDefinition) => void;

  updateGitChanges: (staged: number, changes: number) => void;

  zoomIn: () => void;
  zoomOut: () => void;
  resetZoom: () => void;

  setGitRepo: (repoPath: string, repo: GitRepo) => void;
  setActiveRepo: (repoPath: string) => void;
  updateGitFile: (repoPath: string, filePath: string, staged: boolean) => void;
  removeGitRepo: (repoPath: string) => void;
  setGitLoading: (loading: boolean) => void;
  setGitError: (error: string | null) => void;
  startGitPolling: (repoPath: string) => void;
  stopGitPolling: (repoPath: string) => void;
  discoverAndRegisterRepos: (rootPath: string) => Promise<void>;
}

function countPanes(workspaces: WorkspaceWithPanes[]): number {
  return workspaces.reduce((total, workspace) => total + Object.keys(workspace.panes).length, 0);
}

function calculateGitCounts(repos: Record<string, GitRepo>): { staged: number; unstaged: number } {
  const repoList = Object.values(repos);
  return {
    staged: repoList.reduce((sum, repo) => sum + repo.staged.length, 0),
    unstaged: repoList.reduce((sum, repo) => sum + repo.unstaged.length, 0),
  };
}

function createDefaultTab(cwd: string = '~', type: TabType = 'terminal'): Tab {
  return {
    id: generateUUID(),
    title: 'bash',
    type,
    cwd,
    sessionId: '',
    scrollback: [],
    hasNotification: false,
    notificationCount: 0,
  };
}

function createDefaultPane(): Pane {
  const tab = createDefaultTab();
  return {
    id: generateUUID(),
    flexRatio: 1,
    tabs: [tab],
    activeTabId: tab.id,
    hasNotification: false,
  };
}

function createDefaultWorkspace(name = 'Workspace 1', id = 'workspace-1'): WorkspaceWithPanes {
  const pane = createDefaultPane();
  const leaf: LeafNode = {
    type: 'leaf',
    paneId: pane.id,
  };

  return {
    id,
    name,
    root: leaf,
    activePaneId: pane.id,
    hasNotification: false,
    panes: {
      [pane.id]: pane,
    },
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
    return {
      type: 'branch',
      id: generateUUID(),
      axis,
      children: splitIndex === 0 ? [newLeaf, node] : [node, newLeaf],
    };
  }

  if (isBranch(node)) {
    return {
      ...node,
      children: [
        splitNodeRecursive(node.children[0], targetPaneId, newLeaf, axis, splitIndex),
        splitNodeRecursive(node.children[1], targetPaneId, newLeaf, axis, splitIndex),
      ],
    };
  }

  return node;
}

function closePaneInTreeRecursive(node: SplitNode, paneId: string): SplitNode | null {
  if (isLeaf(node) && node.paneId === paneId) {
    return null;
  }

  if (isBranch(node)) {
    const left = closePaneInTreeRecursive(node.children[0], paneId);
    const right = closePaneInTreeRecursive(node.children[1], paneId);

    if (!left) {
      return right;
    }
    if (!right) {
      return left;
    }

    return {
      ...node,
      children: [left, right],
    };
  }

  return node;
}

function findFirstPaneInTree(node: SplitNode): string | null {
  if (isLeaf(node)) {
    return node.paneId;
  }

  return findFirstPaneInTree(node.children[0]);
}

type Listener = () => void;

const listeners = new Set<Listener>();

function createInitialState(): Omit<WorkspaceState, keyof WorkspaceStateActions> {
  const workspace = createDefaultWorkspace();
  return {
    workspaces: [workspace],
    activeWorkspaceId: workspace.id,
    sidebarCollapsed: false,
    notificationPanelOpen: false,
    activeTab: 'workspaces',
    panels: [],
    gitStagedCount: 0,
    gitChangesCount: 0,
    fontSize: DEFAULT_FONT_SIZE,
    gitRepos: {},
    activeRepoPath: null,
    isGitLoading: false,
    gitError: null,
    isPolling: {},
  };
}

type WorkspaceStateActions = Pick<WorkspaceState,
  | 'createWorkspace'
  | 'closeWorkspace'
  | 'setActiveWorkspace'
  | 'createWorkspaceAfter'
  | 'moveWorkspaceUp'
  | 'moveWorkspaceDown'
  | 'splitPane'
  | 'closePane'
  | 'setActivePane'
  | 'createTab'
  | 'closeTab'
  | 'setActiveTab'
  | 'markNotification'
  | 'clearNotification'
  | 'updateTabSessionId'
  | 'updateTabTitle'
  | 'toggleSidebar'
  | 'toggleNotificationPanel'
  | 'resetState'
  | 'setActiveSidebarTab'
  | 'registerPanel'
  | 'updateGitChanges'
  | 'zoomIn'
  | 'zoomOut'
  | 'resetZoom'
  | 'setGitRepo'
  | 'setActiveRepo'
  | 'updateGitFile'
  | 'removeGitRepo'
  | 'setGitLoading'
  | 'setGitError'
  | 'startGitPolling'
  | 'stopGitPolling'
  | 'discoverAndRegisterRepos'
>;

let state = createInitialState() as WorkspaceState;

function notify(): void {
  listeners.forEach((listener) => {
    listener();
  });
}

function cloneState(previous: WorkspaceState): WorkspaceState {
  return {
    ...previous,
    workspaces: structuredClone(previous.workspaces),
    panels: [...previous.panels],
    gitRepos: structuredClone(previous.gitRepos),
    isPolling: { ...previous.isPolling },
  };
}

function mutate(recipe: (draft: WorkspaceState) => void): void {
  const draft = cloneState(state);
  recipe(draft);
  state = draft;
  notify();
}

const actions: WorkspaceStateActions = {
  createWorkspace: (name: string) => {
    mutate((draft) => {
      if (draft.workspaces.length >= MAX_WORKSPACES) {
        return;
      }
      draft.workspaces.push(createDefaultWorkspace(name, generateUUID()));
    });
  },

  closeWorkspace: (workspaceId: string) => {
    mutate((draft) => {
      const index = draft.workspaces.findIndex((workspace) => workspace.id === workspaceId);
      if (index < 0 || draft.workspaces.length <= 1) {
        return;
      }

      draft.workspaces.splice(index, 1);
      if (draft.activeWorkspaceId === workspaceId) {
        draft.activeWorkspaceId = draft.workspaces[0].id;
      }
    });
  },

  setActiveWorkspace: (workspaceId: string) => {
    mutate((draft) => {
      if (draft.workspaces.some((workspace) => workspace.id === workspaceId)) {
        draft.activeWorkspaceId = workspaceId;
      }
    });
  },

  createWorkspaceAfter: (workspaceId: string, name: string) => {
    mutate((draft) => {
      if (draft.workspaces.length >= MAX_WORKSPACES) {
        return;
      }
      const index = draft.workspaces.findIndex((workspace) => workspace.id === workspaceId);
      if (index < 0) {
        return;
      }
      draft.workspaces.splice(index + 1, 0, createDefaultWorkspace(name, generateUUID()));
    });
  },

  moveWorkspaceUp: (workspaceId: string) => {
    mutate((draft) => {
      const index = draft.workspaces.findIndex((workspace) => workspace.id === workspaceId);
      if (index <= 0) {
        return;
      }
      [draft.workspaces[index - 1], draft.workspaces[index]] = [
        draft.workspaces[index],
        draft.workspaces[index - 1],
      ];
    });
  },

  moveWorkspaceDown: (workspaceId: string) => {
    mutate((draft) => {
      const index = draft.workspaces.findIndex((workspace) => workspace.id === workspaceId);
      if (index < 0 || index >= draft.workspaces.length - 1) {
        return;
      }
      [draft.workspaces[index], draft.workspaces[index + 1]] = [
        draft.workspaces[index + 1],
        draft.workspaces[index],
      ];
    });
  },

  splitPane: (paneId: string, direction: SplitDirection) => {
    mutate((draft) => {
      const currentPaneCount = countPanes(draft.workspaces);
      if (currentPaneCount >= MAX_PANES) {
        logger.warn('Maximum panes reached. Cannot create more panes.');
        return;
      }

      if (currentPaneCount >= PANE_WARNING_THRESHOLD) {
        logger.warn(`Warning: ${currentPaneCount} panes in use. Approaching maximum of ${MAX_PANES} panes.`);
      }

      const workspace = draft.workspaces.find((item) => item.id === draft.activeWorkspaceId);
      if (!workspace || !workspace.panes[paneId]) {
        return;
      }

      const { axis, splitIndex } = getSplitAxisAndIndex(direction);
      const newPane = createDefaultPane();
      const newLeaf: LeafNode = {
        type: 'leaf',
        paneId: newPane.id,
      };

      workspace.panes[newPane.id] = newPane;
      workspace.root = splitNodeRecursive(workspace.root, paneId, newLeaf, axis, splitIndex);
    });
  },

  closePane: (paneId: string) => {
    mutate((draft) => {
      const workspace = draft.workspaces.find((item) => item.id === draft.activeWorkspaceId);
      if (!workspace || Object.keys(workspace.panes).length <= 1) {
        return;
      }

      delete workspace.panes[paneId];
      const nextRoot = closePaneInTreeRecursive(workspace.root, paneId);
      if (!nextRoot) {
        return;
      }

      workspace.root = nextRoot;
      if (workspace.activePaneId === paneId) {
        workspace.activePaneId = findFirstPaneInTree(nextRoot);
      }
    });
  },

  setActivePane: (paneId: string) => {
    mutate((draft) => {
      const workspace = draft.workspaces.find((item) => item.id === draft.activeWorkspaceId);
      if (workspace && workspace.panes[paneId]) {
        workspace.activePaneId = paneId;
      }
    });
  },

  createTab: (paneId: string, cwd?: string, type?: TabType) => {
    mutate((draft) => {
      const workspace = draft.workspaces.find((item) => item.id === draft.activeWorkspaceId);
      const pane = workspace?.panes[paneId];
      if (!pane) {
        return;
      }

      const newTab = createDefaultTab(cwd, type);
      pane.tabs.push(newTab);
      pane.activeTabId = newTab.id;
    });
  },

  closeTab: (paneId: string, tabId: string) => {
    const previousState = state;
    const workspace = previousState.workspaces.find((item) => item.id === previousState.activeWorkspaceId);
    const pane = workspace?.panes[paneId];
    const tabToClose = pane?.tabs.find((tab) => tab.id === tabId);

    if (tabToClose?.sessionId) {
      void invoke('kill_pty', { sessionId: tabToClose.sessionId }).catch((error) => {
        logger.error('Failed to kill PTY session', { error, sessionId: tabToClose.sessionId });
      });
    }

    mutate((draft) => {
      const activeWorkspace = draft.workspaces.find((item) => item.id === draft.activeWorkspaceId);
      const activePane = activeWorkspace?.panes[paneId];
      if (!activePane || !activeWorkspace) {
        return;
      }

      activePane.tabs = activePane.tabs.filter((tab) => tab.id !== tabId);

      if (activePane.activeTabId === tabId) {
        activePane.activeTabId = activePane.tabs[activePane.tabs.length - 1]?.id ?? null;
      }

      if (activePane.tabs.length !== 0 || Object.keys(activeWorkspace.panes).length <= 1) {
        return;
      }

      delete activeWorkspace.panes[paneId];
      const nextRoot = closePaneInTreeRecursive(activeWorkspace.root, paneId);
      if (!nextRoot) {
        return;
      }

      activeWorkspace.root = nextRoot;
      if (activeWorkspace.activePaneId === paneId) {
        activeWorkspace.activePaneId = findFirstPaneInTree(nextRoot);
      }
    });
  },

  setActiveTab: (paneId: string, tabId: string) => {
    mutate((draft) => {
      const workspace = draft.workspaces.find((item) => item.id === draft.activeWorkspaceId);
      const pane = workspace?.panes[paneId];
      if (!pane || !pane.tabs.some((tab) => tab.id === tabId)) {
        return;
      }

      pane.activeTabId = tabId;
      actions.clearNotification(tabId);
    });
  },

  markNotification: (tabId: string, message: string) => {
    mutate((draft) => {
      for (const workspace of draft.workspaces) {
        for (const pane of Object.values(workspace.panes)) {
          const tab = pane.tabs.find((item) => item.id === tabId);
          if (!tab) {
            continue;
          }

          tab.hasNotification = true;
          tab.notificationCount = tab.notificationCount + 1;
          tab.notificationText = message;
          pane.hasNotification = true;
          workspace.hasNotification = true;
        }
      }
    });
  },

  clearNotification: (tabId: string) => {
    mutate((draft) => {
      for (const workspace of draft.workspaces) {
        let workspaceHasNotification = false;
        for (const pane of Object.values(workspace.panes)) {
          const tab = pane.tabs.find((item) => item.id === tabId);
          if (tab) {
            tab.hasNotification = false;
            tab.notificationCount = 0;
            tab.notificationText = undefined;
          }

          pane.hasNotification = pane.tabs.some((item) => item.hasNotification);
          if (pane.hasNotification) {
            workspaceHasNotification = true;
          }
        }

        workspace.hasNotification = workspaceHasNotification;
      }
    });
  },

  updateTabSessionId: (paneId: string, tabId: string, sessionId: string) => {
    mutate((draft) => {
      for (const workspace of draft.workspaces) {
        const pane = workspace.panes[paneId];
        const tab = pane?.tabs.find((item) => item.id === tabId);
        if (tab) {
          tab.sessionId = sessionId;
        }
      }
    });
  },

  updateTabTitle: (paneId: string, tabId: string, title: string) => {
    mutate((draft) => {
      for (const workspace of draft.workspaces) {
        const pane = workspace.panes[paneId];
        const tab = pane?.tabs.find((item) => item.id === tabId);
        if (tab) {
          tab.title = title;
        }
      }
    });
  },

  toggleSidebar: () => {
    mutate((draft) => {
      draft.sidebarCollapsed = !draft.sidebarCollapsed;
    });
  },

  toggleNotificationPanel: () => {
    mutate((draft) => {
      draft.notificationPanelOpen = !draft.notificationPanelOpen;
    });
  },

  resetState: () => {
    state = {
      ...createInitialState(),
      ...actions,
    };
    notify();
  },

  setActiveSidebarTab: (tab: SidebarTab | string) => {
    mutate((draft) => {
      draft.activeTab = tab;
    });
  },

  registerPanel: (definition: PanelDefinition) => {
    mutate((draft) => {
      const index = draft.panels.findIndex((panel) => panel.id === definition.id);
      if (index >= 0) {
        draft.panels[index] = definition;
      } else {
        draft.panels.push(definition);
      }
    });
  },

  updateGitChanges: (staged: number, changes: number) => {
    mutate((draft) => {
      draft.gitStagedCount = staged;
      draft.gitChangesCount = changes;
    });
  },

  zoomIn: () => {
    mutate((draft) => {
      draft.fontSize = Math.min(draft.fontSize + 1, MAX_FONT_SIZE);
    });
  },

  zoomOut: () => {
    mutate((draft) => {
      draft.fontSize = Math.max(draft.fontSize - 1, MIN_FONT_SIZE);
    });
  },

  resetZoom: () => {
    mutate((draft) => {
      draft.fontSize = DEFAULT_FONT_SIZE;
    });
  },

  setGitRepo: (repoPath: string, repo: GitRepo) => {
    mutate((draft) => {
      draft.gitRepos[repoPath] = repo;
      const counts = calculateGitCounts(draft.gitRepos);
      draft.gitStagedCount = counts.staged;
      draft.gitChangesCount = counts.unstaged;
    });
  },

  setActiveRepo: (repoPath: string) => {
    mutate((draft) => {
      if (draft.gitRepos[repoPath]) {
        draft.activeRepoPath = repoPath;
      }
    });
  },

  updateGitFile: (repoPath: string, filePath: string, staged: boolean) => {
    mutate((draft) => {
      const repo = draft.gitRepos[repoPath];
      if (!repo) {
        return;
      }

      const file = repo.staged.find((item) => item.path === filePath) ?? repo.unstaged.find((item) => item.path === filePath);
      if (!file) {
        return;
      }

      file.staged = staged;
      if (staged) {
        if (!repo.staged.some((item) => item.path === filePath)) {
          repo.staged.push(file);
        }
        repo.unstaged = repo.unstaged.filter((item) => item.path !== filePath);
      } else {
        if (!repo.unstaged.some((item) => item.path === filePath)) {
          repo.unstaged.push(file);
        }
        repo.staged = repo.staged.filter((item) => item.path !== filePath);
      }

      const counts = calculateGitCounts(draft.gitRepos);
      draft.gitStagedCount = counts.staged;
      draft.gitChangesCount = counts.unstaged;
    });
  },

  removeGitRepo: (repoPath: string) => {
    mutate((draft) => {
      delete draft.gitRepos[repoPath];
      if (draft.activeRepoPath === repoPath) {
        draft.activeRepoPath = Object.keys(draft.gitRepos)[0] ?? null;
      }
      const counts = calculateGitCounts(draft.gitRepos);
      draft.gitStagedCount = counts.staged;
      draft.gitChangesCount = counts.unstaged;
    });
  },

  setGitLoading: (loading: boolean) => {
    mutate((draft) => {
      draft.isGitLoading = loading;
    });
  },

  setGitError: (error: string | null) => {
    mutate((draft) => {
      draft.gitError = error;
    });
  },

  startGitPolling: (repoPath: string) => {
    const snapshot = state;
    if (snapshot.isPolling[repoPath]) {
      return;
    }

    mutate((draft) => {
      draft.isPolling[repoPath] = true;
    });

    const poll = async () => {
      try {
        const repo = await gitService.getGitStatus(repoPath);
        actions.setGitRepo(repoPath, repo);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logger.error('Git polling failed', { repoPath, error: message });
      }
    };

    void poll();
    gitPollingIntervals[repoPath] = window.setInterval(() => {
      void poll();
    }, GIT_POLLING_INTERVAL_MS);
  },

  stopGitPolling: (repoPath: string) => {
    if (gitPollingIntervals[repoPath]) {
      window.clearInterval(gitPollingIntervals[repoPath]);
      delete gitPollingIntervals[repoPath];
    }

    mutate((draft) => {
      draft.isPolling[repoPath] = false;
    });
  },

  discoverAndRegisterRepos: async (rootPath: string) => {
    const repos = await discoverGitRepos(rootPath);

    for (const repoPath of repos) {
      try {
        const repo = await gitService.getGitStatus(repoPath);
        actions.setGitRepo(repoPath, repo);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logger.error('Failed to register git repository', { repoPath, error: message });
      }
    }
  },
};

state = {
  ...state,
  ...actions,
};

export const workspaceStateStore = {
  subscribe(listener: Listener): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },

  getState(): WorkspaceState {
    return state;
  },

  setState(
    update: Partial<WorkspaceState> | ((draft: WorkspaceState) => void),
  ): void {
    if (typeof update === 'function') {
      mutate(update);
      return;
    }

    mutate((draft) => {
      Object.assign(draft, update);
    });
  },
};

export function useWorkspaceState<T>(selector: (snapshot: WorkspaceState) => T): T {
  return useSyncExternalStore(
    workspaceStateStore.subscribe,
    () => selector(workspaceStateStore.getState()),
    () => selector(workspaceStateStore.getState()),
  );
}

export const activeWorkspace = () => {
  const snapshot = workspaceStateStore.getState();
  return snapshot.workspaces.find((workspace) => workspace.id === snapshot.activeWorkspaceId) ?? null;
};

export const activePane = () => {
  const workspace = activeWorkspace();
  if (!workspace || !workspace.activePaneId) {
    return null;
  }
  return workspace.panes[workspace.activePaneId] ?? null;
};

export const paneCount = () => countPanes(workspaceStateStore.getState().workspaces);

export const hasNotifications = () => workspaceStateStore.getState().workspaces.some((workspace) => workspace.hasNotification);

export const getActivePanel = () => {
  const snapshot = workspaceStateStore.getState();
  return snapshot.panels.find((panel) => panel.id === snapshot.activeTab) ?? null;
};

export const getPanel = (id: SidebarTab) => {
  return workspaceStateStore.getState().panels.find((panel) => panel.id === id) ?? null;
};

export const getTotalNotificationCount = () => {
  let total = 0;
  for (const workspace of workspaceStateStore.getState().workspaces) {
    for (const pane of Object.values(workspace.panes)) {
      for (const tab of pane.tabs) {
        total += tab.notificationCount;
      }
    }
  }
  return total;
};

export const getGitChangesCount = () => {
  const snapshot = workspaceStateStore.getState();
  return snapshot.gitStagedCount + snapshot.gitChangesCount;
};

export const getAllGitRepos = () => Object.values(workspaceStateStore.getState().gitRepos);

export const getGitError = () => workspaceStateStore.getState().gitError;
