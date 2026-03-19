import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { AppState, NotificationState, AgentTab, AlertDialogConfig, AgentSessionState, TerminalSessionState } from './types/state';
export type { AgentTab };
import { ServerMessage, TerminalOutput } from './types/generated/protocol';
import { handleError } from './lib/error-recovery';
import { showNotification } from './lib/tauri';

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
    expandedWorkspaceIds: new Set<string>(),

  // Agent pane tabs (per worktree)
  agentTabs: new Map(),
  activeAgentTabId: new Map(),

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

  alertDialog: null,

  setWorkspaces: (workspaces) => set({ workspaces }),
      
      setWorktrees: (worktrees) => set({ worktrees }),
      
      setAgentSessions: (agentSessions) => set({ agentSessions }),
      
      setTerminalSessions: (terminalSessions) => set({ terminalSessions }),
      
      setActiveWorktree: (activeWorktreeId) => set({ activeWorktreeId }),
      
      setConnectionStatus: (connectionStatus) => set({ connectionStatus }),
      
      setConnectionError: (connectionError) => set({ connectionError }),

      toggleWorkspaceExpanded: (workspaceId: string) =>
        set((state) => {
          const expandedIds = new Set(state.expandedWorkspaceIds)
          if (expandedIds.has(workspaceId)) {
            expandedIds.delete(workspaceId)
          } else {
            expandedIds.add(workspaceId)
          }
          return { expandedWorkspaceIds: expandedIds }
        }),

      // State management from server snapshot
      stateFromSnapshot: (snapshot) => {
        set({
          workspaces: snapshot.workspaces,
          worktrees: snapshot.worktrees,
          agentSessions: snapshot.agentSessions,
          terminalSessions: snapshot.terminalSessions,
        });
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

      removeTerminalSession: (sessionId) =>
        set((state) => ({
          terminalSessions: state.terminalSessions.filter((ts) => ts.id !== sessionId),
        })),

      // Notification management
      addNotification: (notification) => {
        const id = `notification-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
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

    setActiveAgentTab: (worktreeId, tabId) =>
      set((state) => {
        const newActiveTabId = new Map(state.activeAgentTabId);
        newActiveTabId.set(worktreeId, tabId);
        return { activeAgentTabId: newActiveTabId };
      }),

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

  showAlertDialog: (config: AlertDialogConfig) =>
    set({
      alertDialog: { ...config, open: true, variant: config.variant ?? 'default' },
    }),

  hideAlertDialog: () =>
    set((state) => ({
      alertDialog: state.alertDialog ? { ...state.alertDialog, open: false } : null,
    })),
  }),
  { name: 'ymir-app-store' }
  )
);

// Selectors for derived state
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
  const sessions = state.terminalSessions.filter((ts) => ts.worktreeId === worktreeId);
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
    
    case 'WorktreeDeleted':
      removeWorktree(message.worktreeId);
      break;
    
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