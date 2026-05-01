import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { AppState, NotificationState, AgentTab, AlertDialogConfig, AgentSessionState, TerminalSessionState, GitStats } from './types/state';
export type { AgentTab };
import { ServerMessage, TerminalOutput, GitStatusEntry } from './types/protocol';
import type { DecodedBridgeMessage } from './lib/bridge-transport';
import { isWorkspaceEvent, isWorktreeEvent, isGitResponse, isFileResponse, isNotificationMessage, isErrorResponse, isAckMessage, isPingMessage, isPongMessage, isAgentEvent, isTerminalEvent, isStateSnapshotMessage, isAcpPayload } from './types/bridge-envelope';
import { encodePong } from './lib/bridge-transport';
import { handleError } from './lib/error-recovery';
import { showNotification } from './lib/tauri';
import { useUIStore } from './uiStore';
import { acpSessionManager } from './lib/acp-session-manager';
import type { AcpStore } from '@harms-haus/acp-chat-react';

// Stable empty array reference to prevent infinite re-renders
const EMPTY_AGENT_TABS: AgentTab[] = [];
const EMPTY_TERMINAL_SESSIONS: TerminalSessionState[] = [];
const EMPTY_AGENT_SESSIONS: AgentSessionState[] = [];

// Terminal output callback registry (for routing TerminalOutput to TerminalProvider)
let terminalOutputCallback: ((message: TerminalOutput) => void) | null = null;

export function setTerminalOutputCallback(callback: ((message: TerminalOutput) => void) | null): void {
  terminalOutputCallback = callback;
}

export function getTerminalOutputCallback(): ((message: TerminalOutput) => void) | null {
  return terminalOutputCallback;
}

// File content callback registry (for routing FileContent to editor components)
let fileContentCallback: ((message: { worktreeId: string; path: string; content: string }) => void) | null = null;

export function setFileContentCallback(callback: ((message: { worktreeId: string; path: string; content: string }) => void) | null): void {
  fileContentCallback = callback;
}

export function getFileContentCallback(): ((message: { worktreeId: string; path: string; content: string }) => void) | null {
  return fileContentCallback;
}

// ----------------------------------------------------------------------------
// ACP Store helpers (access AcpStore from acpSessionManager)
// ----------------------------------------------------------------------------

/** Get the AcpStore for a worktree, or null if none exists. */
export function getAcpStore(worktreeId: string): AcpStore | null {
  return acpSessionManager.getAcpStore(worktreeId);
}

export const useStore = create<AppState>()(
  devtools(
    (set, get) => ({
      // Data slices
      workspaces: [],
      worktrees: [],
      agentSessions: [],
      terminalSessions: [],
      notifications: [],
      
  // UI state
    activeWorktreeId: null,
    connectionStatus: 'closed',
    connectionError: null,
    lastPongTimestamp: 0,
    expandedWorkspaceIds: new Set<string>(),
    isWorkspacesLoading: true,

  // Agent pane tabs (per worktree)
  agentTabs: new Map(),
  activeAgentTabId: new Map(),

  // File cache (caches file listings and git status until worktree changes)
  fileListCache: new Map(),
  gitStatusCache: new Map(),

  // PR dialog state
  prDialog: {
    isOpen: false,
    title: '',
    body: '',
  },

  createWorktreeDialog: {
    isOpen: false,
    workspaceId: null,
  },

  workspaceSettingsDialog: {
    isOpen: false,
    workspaceId: null,
  },

  mergeDialog: {
    isOpen: false,
    worktreeId: null,
    branchName: '',
    mainBranch: 'main',
    mergeType: 'merge',
  },

  dbResetDialog: {
    isOpen: false,
    errorMessage: '',
  },

  changeBranchDialog: {
    isOpen: false,
    worktreeId: null,
    currentBranch: '',
  },

  alertDialog: null,

  setWorkspaces: (workspaces) => set({ workspaces }),
      
      setWorktrees: (worktrees) => set({ worktrees }),
      
      setAgentSessions: (agentSessions) => set({ agentSessions }),
      
      setTerminalSessions: (terminalSessions) => set({ terminalSessions }),
      
      setActiveWorktree: (activeWorktreeId) => {
        useUIStore.getState().setActiveWorktreeId(activeWorktreeId);
        set((state) => {
          if (activeWorktreeId) {
            const worktree = state.worktrees.find(wt => wt.id === activeWorktreeId);
            if (worktree) {
              useUIStore.getState().toggleExpandedWorkspaceId(worktree.workspaceId);
            }
          }
          return { activeWorktreeId };
        });
      },
      
  setConnectionStatus: (connectionStatus) => set((state) => ({
    connectionStatus,
    // Set loading to true only when connecting; clear it on terminal state (closed)
    isWorkspacesLoading: connectionStatus === 'connecting' ? true : connectionStatus === 'closed' ? false : state.isWorkspacesLoading
  })),
      
      setConnectionError: (connectionError) => set({ connectionError }),

      setLastPongTimestamp: (lastPongTimestamp) => set({ lastPongTimestamp }),

      setWorkspacesLoading: (isWorkspacesLoading) => set({ isWorkspacesLoading }),

      toggleWorkspaceExpanded: (workspaceId: string) =>
        set((state) => {
          const expandedIds = new Set(state.expandedWorkspaceIds)
          if (expandedIds.has(workspaceId)) {
            expandedIds.delete(workspaceId)
          } else {
            expandedIds.add(workspaceId)
          }
          useUIStore.getState().toggleExpandedWorkspaceId(workspaceId);
          return { expandedWorkspaceIds: expandedIds }
        }),

      // State management from server snapshot
      stateFromSnapshot: (snapshot) => {
        set((state) => ({
          workspaces: snapshot.workspaces,
          worktrees: snapshot.worktrees,
          agentSessions: snapshot.agentSessions,
          terminalSessions: snapshot.terminalSessions,
          isWorkspacesLoading: false,
        }));
      },

      // Workspace CRUD
      addWorkspace: (workspace) =>
        set((state) => ({
          workspaces: [...state.workspaces, workspace],
        })),

      updateWorkspace: (workspaceId, updates) =>
        set((state) => ({
          workspaces: state.workspaces.map((w) =>
            w.id === workspaceId ? { ...w, ...updates, updatedAt: Date.now() } : w
          ),
        })),

      removeWorkspace: (workspaceId) =>
        set((state) => {
          // Also remove related worktrees, agent sessions, and terminal sessions
          const worktreesToRemove = state.worktrees
            .filter((wt) => wt.workspaceId === workspaceId)
            .map((wt) => wt.id);
          
          return {
            workspaces: state.workspaces.filter((w) => w.id !== workspaceId),
            worktrees: state.worktrees.filter((wt) => wt.workspaceId !== workspaceId),
            agentSessions: state.agentSessions.filter(
              (as) => !worktreesToRemove.includes(as.worktreeId)
            ),
            terminalSessions: state.terminalSessions.filter(
              (ts) => !worktreesToRemove.includes(ts.worktreeId)
            ),
            activeWorktreeId:
              state.activeWorktreeId &&
              worktreesToRemove.includes(state.activeWorktreeId)
                ? null
                : state.activeWorktreeId,
          };
        }),

      // Worktree CRUD
      addWorktree: (worktree) =>
        set((state) => ({
          worktrees: [...state.worktrees, worktree],
        })),

      updateWorktree: (worktreeId, updates) =>
        set((state) => ({
          worktrees: state.worktrees.map((wt) =>
            wt.id === worktreeId ? { ...wt, ...updates } : wt
          ),
        })),

      updateWorktreeGitStats: (worktreeId: string, stats: GitStats) =>
        set((state) => ({
          worktrees: state.worktrees.map((wt) =>
            wt.id === worktreeId ? { ...wt, gitStats: stats } : wt
          ),
        })),

      removeWorktree: (worktreeId) =>
        set((state) => ({
          worktrees: state.worktrees.filter((wt) => wt.id !== worktreeId),
          agentSessions: state.agentSessions.filter((as) => as.worktreeId !== worktreeId),
          terminalSessions: state.terminalSessions.filter((ts) => ts.worktreeId !== worktreeId),
          activeWorktreeId:
            state.activeWorktreeId === worktreeId ? null : state.activeWorktreeId,
        })),

      // Agent session CRUD
      addAgentSession: (session) =>
        set((state) => ({
          agentSessions: [...state.agentSessions, session],
        })),

      updateAgentSession: (sessionId, updates) =>
        set((state) => ({
          agentSessions: state.agentSessions.map((as) =>
            as.id === sessionId ? { ...as, ...updates } : as
          ),
        })),

      removeAgentSession: (sessionId) =>
        set((state) => ({
          agentSessions: state.agentSessions.filter((as) => as.id !== sessionId),
        })),

// Terminal session CRUD
    addTerminalSession: (session) =>
        set((state) => ({
            terminalSessions: [...state.terminalSessions, session],
        })),

  updateTerminalSession: (sessionId, updates) =>
    set((state) => ({
      terminalSessions: state.terminalSessions.map((ts) =>
        ts.id === sessionId
          ? {
              ...ts,
              ...(updates.label != null && { label: updates.label }),
              ...(updates.position != null && { position: updates.position }),
            }
          : ts,
      ),
    })),

    removeTerminalSession: (sessionId) =>
        set((state) => ({
            terminalSessions: state.terminalSessions.filter((ts) => ts.id !== sessionId),
        })),

      // Notification management
      addNotification: (notification) => {
        const id = `notification-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
        const newNotification: NotificationState = {
          level: notification.level,
          message: notification.message,
          id,
          timestamp: Date.now(),
        };

        set((state) => ({
          notifications: [...state.notifications, newNotification],
        }));

        // Auto-remove notifications after duration
        const duration = (notification as any).duration ?? 5000;
        if (duration > 0) {
          setTimeout(() => {
            get().removeNotification(id);
          }, duration);
        }
      },

      removeNotification: (id) =>
        set((state) => ({
          notifications: state.notifications.filter((n) => n.id !== id),
        })),

    clearNotifications: () => set({ notifications: [] }),

  // Agent tab management
  addAgentTab: (worktreeId, tab) =>
    set((state) => {
      const newTabs = new Map(state.agentTabs);
      const existingTabs = newTabs.get(worktreeId) || [];
      // Prevent duplicate tabs
      if (existingTabs.some((t) => t.id === tab.id)) {
        return { agentTabs: state.agentTabs, activeAgentTabId: state.activeAgentTabId };
      }
      newTabs.set(worktreeId, [...existingTabs, tab]);

      const newActiveTabId = new Map(state.activeAgentTabId);
      if (!newActiveTabId.has(worktreeId)) {
        newActiveTabId.set(worktreeId, tab.id);
      }

      return { agentTabs: newTabs, activeAgentTabId: newActiveTabId };
    }),

  removeAgentTab: (worktreeId, tabId) =>
    set((state) => {
      const newTabs = new Map(state.agentTabs);
      const existingTabs = newTabs.get(worktreeId) || [];
      const filteredTabs = existingTabs.filter((t) => t.id !== tabId);

      if (filteredTabs.length === 0) {
        newTabs.delete(worktreeId);
      } else {
        newTabs.set(worktreeId, filteredTabs);
      }

      const newActiveTabId = new Map(state.activeAgentTabId);
      if (newActiveTabId.get(worktreeId) === tabId) {
        if (filteredTabs.length > 0) {
          newActiveTabId.set(worktreeId, filteredTabs[0].id);
        } else {
          newActiveTabId.delete(worktreeId);
        }
      }

      return { agentTabs: newTabs, activeAgentTabId: newActiveTabId };
    }),

  removeAgentTabsRightOf: (worktreeId, tabId) =>
    set((state) => {
      const newTabs = new Map(state.agentTabs);
      const existingTabs = newTabs.get(worktreeId) || [];
      const tabIndex = existingTabs.findIndex((t) => t.id === tabId);
      if (tabIndex === -1) return state;
      const filteredTabs = existingTabs.slice(0, tabIndex + 1);
      newTabs.set(worktreeId, filteredTabs);
      return { agentTabs: newTabs };
    }),

  removeAgentTabsLeftOf: (worktreeId, tabId) =>
    set((state) => {
      const newTabs = new Map(state.agentTabs);
      const existingTabs = newTabs.get(worktreeId) || [];
      const tabIndex = existingTabs.findIndex((t) => t.id === tabId);
      if (tabIndex === -1) return state;
      const filteredTabs = existingTabs.slice(tabIndex);
      newTabs.set(worktreeId, filteredTabs);
      return { agentTabs: newTabs };
    }),

  removeAgentTabsOthers: (worktreeId, tabId) =>
    set((state) => {
      const newTabs = new Map(state.agentTabs);
      const existingTabs = newTabs.get(worktreeId) || [];
      const filteredTabs = existingTabs.filter((t) => t.id === tabId);
      newTabs.set(worktreeId, filteredTabs);
      const newActiveTabId = new Map(state.activeAgentTabId);
      newActiveTabId.set(worktreeId, tabId);
      return { agentTabs: newTabs, activeAgentTabId: newActiveTabId };
    }),

setActiveAgentTab: (worktreeId, tabId) => {
        useUIStore.getState().setActiveAgentTabId(worktreeId, tabId);
        set((state) => {
          const newActiveTabId = new Map(state.activeAgentTabId);
          newActiveTabId.set(worktreeId, tabId);
          return { activeAgentTabId: newActiveTabId };
        });
      },

  updateAgentTab: (worktreeId, tabId, updates) =>
    set((state) => {
      const newTabs = new Map(state.agentTabs);
      const existingTabs = newTabs.get(worktreeId) || [];
      const updatedTabs = existingTabs.map((t) =>
        t.id === tabId ? { ...t, ...updates } : t
      );
      newTabs.set(worktreeId, updatedTabs);
      return { agentTabs: newTabs };
    }),

  reorderAgentTabs: (worktreeId, sourceIndex, targetIndex) =>
    set((state) => {
      const newTabs = new Map(state.agentTabs);
      const existingTabs = newTabs.get(worktreeId) || [];
      if (sourceIndex < 0 || sourceIndex >= existingTabs.length || targetIndex < 0 || targetIndex >= existingTabs.length) {
        return state;
      }
      const newOrder = [...existingTabs];
      const [movedTab] = newOrder.splice(sourceIndex, 1);
      newOrder.splice(targetIndex, 0, movedTab);
      newTabs.set(worktreeId, newOrder);
      return { agentTabs: newTabs };
    }),

  setPRDialogOpen: (isOpen) =>
      set((state) => ({
        prDialog: { ...state.prDialog, isOpen },
      })),

  setPRDialogTitle: (title) =>
      set((state) => ({
        prDialog: { ...state.prDialog, title },
      })),

  setPRDialogBody: (body) =>
      set((state) => ({
        prDialog: { ...state.prDialog, body },
      })),

  resetPRDialog: () =>
      set({
        prDialog: { isOpen: false, title: '', body: '' },
      }),

  setCreateWorktreeDialogOpen: (isOpen, workspaceId) =>
      set((state) => ({
        createWorktreeDialog: {
          ...state.createWorktreeDialog,
          isOpen,
          workspaceId: workspaceId ?? state.createWorktreeDialog.workspaceId,
        },
      })),

  resetCreateWorktreeDialog: () =>
      set({
        createWorktreeDialog: { isOpen: false, workspaceId: null },
      }),

  setWorkspaceSettingsDialogOpen: (isOpen, workspaceId) =>
      set((state) => ({
        workspaceSettingsDialog: {
          ...state.workspaceSettingsDialog,
          isOpen,
          workspaceId: workspaceId ?? state.workspaceSettingsDialog.workspaceId,
        },
      })),

  resetWorkspaceSettingsDialog: () =>
      set({
        workspaceSettingsDialog: { isOpen: false, workspaceId: null },
      }),

  setMergeDialogOpen: (isOpen, worktreeId, branchName, mainBranch, mergeType) =>
      set((state) => ({
        mergeDialog: {
          ...state.mergeDialog,
          isOpen,
          worktreeId: worktreeId ?? state.mergeDialog.worktreeId,
          branchName: branchName ?? state.mergeDialog.branchName,
          mainBranch: mainBranch ?? state.mergeDialog.mainBranch,
          mergeType: mergeType ?? state.mergeDialog.mergeType,
        },
      })),

  resetMergeDialog: () =>
      set({
        mergeDialog: { isOpen: false, worktreeId: null, branchName: '', mainBranch: 'main', mergeType: 'merge' },
      }),

  setDbResetDialogOpen: (isOpen, errorMessage) =>
      set((state) => ({
        dbResetDialog: {
          ...state.dbResetDialog,
          isOpen,
          errorMessage: errorMessage ?? state.dbResetDialog.errorMessage,
        },
      })),

  resetDbResetDialog: () =>
    set({
      dbResetDialog: { isOpen: false, errorMessage: '' },
    }),

  setChangeBranchDialogOpen: (isOpen, worktreeId, currentBranch) =>
    set((state) => ({
      changeBranchDialog: {
        ...state.changeBranchDialog,
        isOpen,
        worktreeId: worktreeId ?? state.changeBranchDialog.worktreeId,
        currentBranch: currentBranch ?? state.changeBranchDialog.currentBranch,
      },
    })),

  resetChangeBranchDialog: () =>
    set({
      changeBranchDialog: { isOpen: false, worktreeId: null, currentBranch: '' },
    }),

  showAlertDialog: (config: AlertDialogConfig) =>
    set({
      alertDialog: { ...config, open: true, variant: config.variant ?? 'default' },
    }),

  hideAlertDialog: () =>
    set((state) => ({
      alertDialog: state.alertDialog ? { ...state.alertDialog, open: false } : null,
    })),

  // File cache actions
  setFileListCache: (worktreeId: string, files: string[]) =>
    set((state) => {
      const newCache = new Map(state.fileListCache);
      newCache.set(worktreeId, { worktreeId, files, timestamp: Date.now() });
      return { fileListCache: newCache };
    }),

  clearFileListCache: (worktreeId: string) =>
    set((state) => {
      const newCache = new Map(state.fileListCache);
      newCache.delete(worktreeId);
      return { fileListCache: newCache };
    }),

  setGitStatusCache: (worktreeId: string, entries: GitStatusEntry[]) =>
    set((state) => {
      const newCache = new Map(state.gitStatusCache);
      newCache.set(worktreeId, { worktreeId, entries, timestamp: Date.now() });
      return { gitStatusCache: newCache };
    }),

  clearGitStatusCache: (worktreeId: string) =>
    set((state) => {
      const newCache = new Map(state.gitStatusCache);
      newCache.delete(worktreeId);
      return { gitStatusCache: newCache };
    }),

  clearAllFileCaches: () =>
    set(() => ({
      fileListCache: new Map(),
      gitStatusCache: new Map(),
    })),
}),
  { name: 'ymir-app-store' }
  )
);

// Selectors for derived state
export const selectIsWorkspacesLoading = (state: AppState) => state.isWorkspacesLoading;

export const selectWorkspaceById = (workspaceId: string) => (state: AppState) =>
  state.workspaces.find((w) => w.id === workspaceId);

export const selectWorktreeById = (worktreeId: string) => (state: AppState) =>
  state.worktrees.find((wt) => wt.id === worktreeId);

export const selectWorktreesByWorkspaceId = (workspaceId: string) => (state: AppState) =>
  state.worktrees.filter((wt) => wt.workspaceId === workspaceId);

export const selectAgentSessionById = (sessionId: string) => (state: AppState) =>
  state.agentSessions.find((as) => as.id === sessionId);

export const selectAgentSessionsByWorktreeId = (worktreeId: string) => (state: AppState) => {
  const sessions = state.agentSessions.filter((as) => as.worktreeId === worktreeId);
  return sessions.length > 0 ? sessions : EMPTY_AGENT_SESSIONS;
};

export const selectTerminalSessionsByWorktreeId = (worktreeId: string) => (state: AppState) => {
  const sessions = [...state.terminalSessions]
    .filter((ts) => ts.worktreeId === worktreeId)
    .sort((a, b) => {
      const posA = a.position ?? 0;
      const posB = b.position ?? 0;
      return posA - posB;
    });
  return sessions.length > 0 ? sessions : EMPTY_TERMINAL_SESSIONS;
};

export const selectActiveWorktree = (state: AppState) => {
  if (!state.activeWorktreeId) return null;
  return state.worktrees.find((wt) => wt.id === state.activeWorktreeId) || null;
};

export const selectActiveWorkspace = (state: AppState) => {
  const activeWorktree = selectActiveWorktree(state);
  if (!activeWorktree) return null;
  return state.workspaces.find((w) => w.id === activeWorktree.workspaceId) || null;
};

export const selectAgentTabsByWorktreeId = (worktreeId: string) => (state: AppState) =>
  state.agentTabs.get(worktreeId) ?? EMPTY_AGENT_TABS;

export const selectActiveAgentTabId = (worktreeId: string) => (state: AppState) =>
  state.activeAgentTabId.get(worktreeId) || null;

export const selectPRDialog = (state: AppState) => state.prDialog;

export const selectPRDialogOpen = (state: AppState) => state.prDialog.isOpen;

export const selectCreateWorktreeDialog = (state: AppState) => state.createWorktreeDialog;

export const selectCreateWorktreeDialogOpen = (state: AppState) => state.createWorktreeDialog.isOpen;

export const selectWorkspaceSettingsDialog = (state: AppState) => state.workspaceSettingsDialog;

export const selectWorkspaceSettingsDialogOpen = (state: AppState) => state.workspaceSettingsDialog.isOpen;

export const selectDbResetDialog = (state: AppState) => state.dbResetDialog;

export const selectDbResetDialogOpen = (state: AppState) => state.dbResetDialog.isOpen;

export const selectAlertDialog = (state: AppState) => state.alertDialog;

// ACP Store selectors (read from AcpStore via acpSessionManager)
export const selectAcpStoreForWorktree = (worktreeId: string) => (): ReturnType<typeof getAcpStore> => {
  return getAcpStore(worktreeId);
};

// File cache selectors
export const selectFileListCache = (worktreeId: string) => (state: AppState) =>
  state.fileListCache.get(worktreeId) ?? null;

export const selectGitStatusCache = (worktreeId: string) => (state: AppState) =>
  state.gitStatusCache.get(worktreeId) ?? null;

export function updateStateFromServerMessage(message: ServerMessage): void {
  const { addWorkspace, updateWorkspace, removeWorkspace, addWorktree, updateWorktree, removeWorktree } = useStore.getState();
  const { updateAgentSession, addTerminalSession, removeTerminalSession, addNotification } = useStore.getState();

  switch (message.type) {
    case 'WorkspaceCreated':
      addWorkspace(message.workspace);
      break;
    
    case 'WorkspaceUpdated':
      updateWorkspace(message.workspace.id, message.workspace);
      break;
    
    case 'WorkspaceDeleted':
      removeWorkspace(message.workspaceId);
      break;
    
    case 'WorktreeCreated':
      addWorktree(message.worktree);
      break;
    
    case 'WorktreeStatus':
      updateWorktree(message.worktree.id, message.worktree);
      break;
    
    case 'WorktreeChanged':
      updateWorktree(message.worktree.id, message.worktree);
      // Clear file caches when worktree changes (files modified on disk)
      useStore.getState().clearFileListCache(message.worktree.id);
      useStore.getState().clearGitStatusCache(message.worktree.id);
      break;

    case 'WorktreeDeleted':
      removeWorktree(message.worktreeId);
      // Clear caches for deleted worktree
      useStore.getState().clearFileListCache(message.worktreeId);
      useStore.getState().clearGitStatusCache(message.worktreeId);
      break;

    case 'WorktreeDetailsResult': {
      const { addAgentSession, addWorktree } = useStore.getState();
      message.worktrees.forEach((worktree) => { addWorktree(worktree); });
      message.agentSessions.forEach((session) => { addAgentSession(session as any); });
      message.terminalSessions.forEach((session) => { addTerminalSession(session); });
      break;
    }

    case 'AgentStatusUpdate': {
      const existingSession = useStore.getState().agentSessions.find(as => as.id === message.id);
      if (existingSession) {
        updateAgentSession(message.id, {
          status: message.status,
        } as any);
      } else {
        const addAgentSession = useStore.getState().addAgentSession;
        addAgentSession({
          id: message.id,
          worktreeId: message.worktreeId,
          agentType: message.agentType,
          status: message.status,
          acpSessionId: undefined,
          startedAt: message.startedAt,
        } as any);
      }
      break;
    }
    
    case 'AgentOutput':
      // Agent output is handled separately (not stored in main state)
      break;
    
    case 'AgentRemoved': {
      const removeAgentSession = useStore.getState().removeAgentSession;
      removeAgentSession(message.id);
      break;
    }
    
    case 'TerminalCreated':
      addTerminalSession({
        id: message.sessionId,
        worktreeId: message.worktreeId,
        label: message.label ?? 'Terminal',
        shell: message.shell,
        createdAt: Date.now(),
      });
      break;
    
    case 'TerminalOutput':
      // Terminal output is routed to TerminalProvider via callback
      if (terminalOutputCallback) {
        terminalOutputCallback(message);
      }
      break;

case 'TerminalRemoved':
            removeTerminalSession(message.sessionId);
            break;

case 'TerminalUpdated': {
  const { updateTerminalSession } = useStore.getState();
  updateTerminalSession(message.sessionId, {
    ...(message.label != null && { label: message.label }),
    ...(message.position != null && { position: message.position }),
  });
  break;
}

        case 'AgentUpdated': {
            const { updateAgentSession } = useStore.getState();
            updateAgentSession(message.sessionId, {
                ...(message.label !== undefined && { label: message.label }),
                ...(message.position !== undefined && { position: message.position }),
            });
            break;
        }

        case 'Notification':
      addNotification({
        level: message.level,
        message: message.message,
        duration: 5000,
      } as any);
      showNotification(message.title, message.message);
      break;

    case 'Error':
      handleError(message);
      break;

    case 'AcpWireEvent': {
      const { activeWorktreeId } = useStore.getState();
      const data = (message as unknown as Record<string, unknown>).data as Record<string, unknown> | undefined;
      const worktreeId = (data?.worktreeId as string) ?? activeWorktreeId;
      if (worktreeId) {
        acpSessionManager.handleAcpPayload(worktreeId, message as unknown as Record<string, unknown>);
      }
      break;
    }
  }
}

/**
 * Handle a decoded BridgeEnvelope message from the bridge transport.
 * This is an alternative path to updateStateFromServerMessage for messages
 * that arrive wrapped in BridgeEnvelope format rather than raw MessagePack.
 *
 * For workspace_event messages, the payload contains:
 *   { originalType: "WorkspaceCreated" | "WorkspaceDeleted" | ..., data: {...} }
 * where data is the serde_json::Value that needs to be cast to the expected type.
 */
export function handleBridgeMessage(decoded: DecodedBridgeMessage, sendFn?: (envelope: unknown) => void): void {
  const { type, message } = decoded;

  switch (type) {
    case 'workspace_event': {
      if (!isWorkspaceEvent(message)) return;

      const payload = message.payload as Record<string, unknown> | null;
      if (!payload) return;

      const originalType = payload.originalType as string | undefined;
      const data = payload.data as Record<string, unknown> | undefined;

      switch (originalType) {
        case 'WorkspaceCreated': {
          const workspace = (data as any)?.workspace;
          if (workspace) {
            useStore.getState().addWorkspace(workspace);
          }
          break;
        }
        case 'WorkspaceDeleted': {
          const workspaceId = (data as any)?.workspaceId as string | undefined;
          if (workspaceId) {
            useStore.getState().removeWorkspace(workspaceId);
          }
          break;
        }
        case 'WorkspaceUpdated': {
          const workspaceData = (data as any)?.workspace;
          if (workspaceData?.id) {
            useStore.getState().updateWorkspace(workspaceData.id, workspaceData);
          }
          break;
        }
        // Other workspace event types (WorkspaceRename) can be added here
        default:
          break;
      }
      break;
    }

    case 'worktree_event': {
      if (!isWorktreeEvent(message)) return;

      const payload = message.payload as Record<string, unknown> | null;
      if (!payload) return;

      const originalType = payload.originalType as string | undefined;
      const data = payload.data as Record<string, unknown> | undefined;

      switch (originalType) {
        case 'WorktreeCreated': {
          const worktree = (data as any)?.worktree;
          if (worktree) {
            useStore.getState().addWorktree(worktree);
          }
          break;
        }
        case 'WorktreeDeleted': {
          const worktreeId = (data as any)?.worktreeId as string | undefined;
          if (worktreeId) {
            useStore.getState().removeWorktree(worktreeId);
            useStore.getState().clearFileListCache(worktreeId);
            useStore.getState().clearGitStatusCache(worktreeId);
          }
          break;
        }
        case 'WorktreeChanged': {
          const worktree = (data as any)?.worktree;
          if (worktree?.id) {
            useStore.getState().updateWorktree(worktree.id, worktree);
            useStore.getState().clearFileListCache(worktree.id);
            useStore.getState().clearGitStatusCache(worktree.id);
          }
          break;
        }
        case 'WorktreeListResult': {
          const worktrees = (data as any)?.worktrees as Array<any> | undefined;
          if (worktrees) {
            worktrees.forEach((worktree) => {
              useStore.getState().addWorktree(worktree);
            });
          }
          break;
        }
        case 'WorktreeDetailsResult': {
          const { addAgentSession, addTerminalSession } = useStore.getState();
          const worktrees = (data as any)?.worktrees as Array<any> | undefined;
          const agentSessions = (data as any)?.agentSessions as Array<any> | undefined;
          const terminalSessions = (data as any)?.terminalSessions as Array<any> | undefined;

          if (worktrees) {
            worktrees.forEach((worktree) => {
              useStore.getState().addWorktree(worktree);
            });
          }
          if (agentSessions) {
            agentSessions.forEach((session) => {
              addAgentSession(session as any);
            });
          }
          if (terminalSessions) {
            terminalSessions.forEach((session) => {
              addTerminalSession(session);
            });
          }
          break;
        }
        case 'WorktreeStatus': {
          const worktree = (data as any)?.worktree;
          if (worktree?.id) {
            useStore.getState().updateWorktree(worktree.id, worktree);
          }
          break;
        }
        default:
          break;
      }
      break;
    }

    case 'git_response': {
      if (!isGitResponse(message)) return;

      const payload = message.payload as Record<string, unknown> | null;
      if (!payload) return;

      const originalType = payload.originalType as string | undefined;
      const data = payload.data as Record<string, unknown> | undefined;

      switch (originalType) {
        case 'GitStatusResult': {
          const worktreeId = (data as any)?.worktreeId as string | undefined;
          const entries = (data as any)?.entries as Array<{ path: string; statusCode: string }> | undefined;
          if (worktreeId && entries) {
            const transformed = entries.map((entry) => {
              const statusCode = entry.statusCode;
              let status: GitStatusEntry['status'] = 'modified';
              let staged = false;

              if (statusCode === '??') {
                status = 'untracked';
                staged = false;
              } else if (statusCode.length >= 2) {
                const stagedChar = statusCode[0];
                const unstagedChar = statusCode[1];
                if (stagedChar === 'A') { status = 'added'; staged = true; }
                else if (stagedChar === 'D') { status = 'deleted'; staged = true; }
                else if (stagedChar === 'R') { status = 'renamed'; staged = true; }
                else if (stagedChar === 'M') { status = 'modified'; staged = true; }
                else if (unstagedChar === 'M') { status = 'modified'; staged = false; }
                else if (unstagedChar === 'D') { status = 'deleted'; staged = false; }
              }

              return { path: entry.path, status, staged } as GitStatusEntry;
            });
            useStore.getState().setGitStatusCache(worktreeId, transformed);
          }
          break;
        }
        case 'GitDiffResult': {
          // GitDiffResult carries raw diff text; no store cache setter exists yet.
          // Log for debugging; DiffTab consumes this via wsClient.onMessage.
          const worktreeId = (data as any)?.worktreeId as string | undefined;
          const filePath = (data as any)?.filePath as string | undefined;
          const diff = (data as any)?.diff as string | undefined;
          if (worktreeId && filePath && diff) {
            // Future: dispatch to a gitDiffCache or UI handler when available.
          }
          break;
        }
        default:
          break;
      }
      break;
    }

    case 'notification': {
      if (!isNotificationMessage(message)) return;

      const payload = message.payload as Record<string, unknown> | null;
      if (!payload) return;

      const data = payload.data as Record<string, unknown> | undefined;

      // Handle notification (GitCommit/CreatePR success, info/warning/error)
      const level = (data as any)?.level as 'info' | 'warning' | 'error' | undefined;
      const title = (data as any)?.title as string | undefined;
      const msg = (data as any)?.message as string | undefined;

      if (level && msg) {
        const notificationLevel = level === 'warning' ? 'warning' : level === 'error' ? 'error' : 'info';
        useStore.getState().addNotification({
          level: notificationLevel,
          message: title ? `${title}: ${msg}` : msg,
          duration: 5000,
        } as any);
        if (title) {
          showNotification(title, msg);
        }
      }
      break;
    }

    case 'error_response': {
      if (!isErrorResponse(message)) return;

      const payload = message.payload as Record<string, unknown> | null;
      if (!payload) return;

      const data = payload.data as Record<string, unknown> | undefined;

      if (data) {
        const error = data as any;
        handleError({
          type: 'Error',
          code: error.code ?? 'unknown',
          message: error.message ?? 'Unknown error',
          details: error.details,
          requestId: error.request_id,
        });
      }
      break;
    }

    case 'file_response': {
      if (!isFileResponse(message)) return;

      const payload = message.payload as Record<string, unknown> | null;
      if (!payload) return;

      const originalType = payload.originalType as string | undefined;
      const data = payload.data as Record<string, unknown> | undefined;

      switch (originalType) {
        case 'FileListResult': {
          const worktreeId = (data as any)?.worktreeId as string | undefined;
          const files = (data as any)?.files as string[] | undefined;
          if (worktreeId && files) {
            useStore.getState().setFileListCache(worktreeId, files);
          }
          break;
        }
        case 'FileContent': {
          const worktreeId = (data as any)?.worktreeId as string | undefined;
          const path = (data as any)?.path as string | undefined;
          const content = (data as any)?.content as string | undefined;
          if (worktreeId && path && content !== undefined) {
            const cb = getFileContentCallback();
            if (cb) {
              cb({ worktreeId, path, content });
            }
          }
          break;
        }
        default:
          break;
      }
      break;
    }

    case 'agent_event': {
      if (!isAgentEvent(message)) return;

      const payload = message.payload as Record<string, unknown> | null;
      if (!payload) return;

      const originalType = payload.originalType as string | undefined;
      const data = payload.data as Record<string, unknown> | undefined;

      switch (originalType) {
        case 'AgentStatusUpdate': {
          const id = (data as any)?.id as string | undefined;
          if (!id) break;
          const existingSession = useStore.getState().agentSessions.find(as => as.id === id);
          if (existingSession) {
            useStore.getState().updateAgentSession(id, {
              status: (data as any)?.status,
            } as any);
          } else {
            useStore.getState().addAgentSession({
              id,
              worktreeId: (data as any)?.worktreeId,
              agentType: (data as any)?.agentType,
              status: (data as any)?.status,
              acpSessionId: undefined,
              startedAt: (data as any)?.startedAt,
            } as any);
          }
          break;
        }
        case 'AgentRemoved': {
          const id = (data as any)?.id as string | undefined;
          if (id) {
            useStore.getState().removeAgentSession(id);
          }
          break;
        }
        case 'AgentUpdated': {
          const sessionId = (data as any)?.sessionId as string | undefined;
          if (sessionId) {
            useStore.getState().updateAgentSession(sessionId, {
              ...((data as any)?.label !== undefined && { label: (data as any)?.label }),
              ...((data as any)?.position !== undefined && { position: (data as any)?.position }),
            });
          }
          break;
        }
        default:
          break;
      }
      break;
    }

    case 'terminal_event': {
      if (!isTerminalEvent(message)) return;

      const payload = message.payload as Record<string, unknown> | null;
      if (!payload) return;

      const originalType = payload.originalType as string | undefined;
      const data = payload.data as Record<string, unknown> | undefined;

      switch (originalType) {
        case 'TerminalCreated': {
          const sessionId = (data as any)?.sessionId as string | undefined;
          const worktreeId = (data as any)?.worktreeId as string | undefined;
          const label = (data as any)?.label as string | null | undefined;
          const shell = (data as any)?.shell as string | undefined;
          if (sessionId && worktreeId && shell) {
            useStore.getState().addTerminalSession({
              id: sessionId,
              worktreeId,
              label: label ?? 'Terminal',
              shell,
              createdAt: Date.now(),
            });
          }
          break;
        }
        case 'TerminalOutput': {
          const sessionId = (data as any)?.sessionId as string | undefined;
          const outputData = (data as any)?.data as string | undefined;
          if (sessionId && outputData !== undefined) {
            if (terminalOutputCallback) {
              terminalOutputCallback({ type: 'TerminalOutput', sessionId, data: outputData });
            }
          }
          break;
        }
        case 'TerminalRemoved': {
          const sessionId = (data as any)?.sessionId as string | undefined;
          if (sessionId) {
            useStore.getState().removeTerminalSession(sessionId);
          }
          break;
        }
        case 'TerminalUpdated': {
          const sessionId = (data as any)?.sessionId as string | undefined;
          if (sessionId) {
            useStore.getState().updateTerminalSession(sessionId, {
              ...((data as any)?.label !== undefined && { label: (data as any)?.label ?? undefined }),
              ...((data as any)?.position !== undefined && { position: (data as any)?.position ?? undefined }),
            });
          }
          break;
        }
        case 'TerminalHistory': {
          const sessionId = (data as any)?.sessionId as string | undefined;
          const historyData = (data as any)?.data as string | undefined;
          if (sessionId && historyData !== undefined) {
            if (terminalOutputCallback) {
              terminalOutputCallback({ type: 'TerminalOutput', sessionId, data: historyData });
            }
          }
          break;
        }
        default:
          break;
      }
      break;
    }

    case 'state_snapshot': {
      if (!isStateSnapshotMessage(message)) return;

      const payload = message.payload as Record<string, unknown> | null;
      if (!payload) return;

      const data = payload.data as Record<string, unknown> | undefined;
      if (!data) return;

      const { stateFromSnapshot } = useStore.getState();
      stateFromSnapshot({
        workspaces: data.workspaces as any[],
        worktrees: data.worktrees as any[],
        agentSessions: data.agentSessions as any[],
        terminalSessions: data.terminalSessions as any[],
      });
      break;
    }

    // Additional BridgeMessage types can be handled here as needed.
    // Existing MessagePack handling remains in updateStateFromServerMessage.

    case 'ping': {
      if (!isPingMessage(message)) return;
      const payload = message.payload as Record<string, unknown> | null;
      const timestamp = (payload?.timestamp as number) ?? Date.now();
      if (sendFn) {
        sendFn(encodePong({ timestamp }));
      }
      break;
    }

    case 'pong': {
      if (!isPongMessage(message)) return;
      useStore.getState().setLastPongTimestamp(Date.now());
      break;
    }

    case 'ack': {
      if (!isAckMessage(message)) return;
      // Acknowledgment for rename/reorder ops — no state update needed,
      // but handled here to complete the migration from legacy path.
      break;
    }

    case 'acp_payload': {
      if (!isAcpPayload(message)) return;

      const payload = message.payload as Record<string, unknown> | null;
      if (!payload) return;

      // Route through acpSessionManager which feeds the raw ACP JSON-RPC payload
      // to the appropriate SessionController via its transport.
      const { activeWorktreeId } = useStore.getState();
      const data = (payload.data as Record<string, unknown>) ?? {};
      const worktreeId = (data as any)?.worktreeId ?? activeWorktreeId;
      if (worktreeId) {
        acpSessionManager.handleAcpPayload(worktreeId, payload);
      }
      break;
    }

    default:
      break;
  }
}

import { persist } from 'zustand/middleware';
import { ToastVariant } from './components/ui/Toast';

export interface Notification {
  id: string;
  variant: ToastVariant;
  title: string;
  description?: string;
  duration?: number;
}

interface ToastStore {
  notifications: Notification[];
  addNotification: (notification: Omit<Notification, 'id'>) => void;
  removeNotification: (id: string) => void;
  _idCounter: number;
}

let idCounter = 0;

export const useToastStore = create<ToastStore>()(
  persist(
    (set) => ({
      notifications: [],
      _idCounter: 0,
      addNotification: (notification) =>
        set((state) => {
          const newId = `toast-${idCounter++}`;
          return {
            notifications: [...state.notifications, { ...notification, id: newId }],
            _idCounter: idCounter,
          };
        }),
      removeNotification: (id) =>
        set((state) => ({
          notifications: state.notifications.filter((n) => n.id !== id),
        })),
    }),
    { name: 'toast-storage' }
  )
);
