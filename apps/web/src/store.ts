import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { AppState, NotificationState, AgentTab } from './types/state';
export type { AgentTab };
import { ServerMessage, TerminalOutput } from './types/protocol';

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

  // Agent pane tabs (per worktree)
  agentTabs: new Map(),
  activeAgentTabId: new Map(),

  // PR dialog state
  prDialog: {
    isOpen: false,
    title: '',
    body: '',
  },

  // Action implementations
      setWorkspaces: (workspaces) => set({ workspaces }),
      
      setWorktrees: (worktrees) => set({ worktrees }),
      
      setAgentSessions: (agentSessions) => set({ agentSessions }),
      
      setTerminalSessions: (terminalSessions) => set({ terminalSessions }),
      
      setActiveWorktree: (activeWorktreeId) => set({ activeWorktreeId }),
      
      setConnectionStatus: (connectionStatus) => set({ connectionStatus }),
      
      setConnectionError: (connectionError) => set({ connectionError }),

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

export const selectAgentSessionsByWorktreeId = (worktreeId: string) => (state: AppState) =>
  state.agentSessions.filter((as) => as.worktreeId === worktreeId);

export const selectTerminalSessionsByWorktreeId = (worktreeId: string) => (state: AppState) =>
  state.terminalSessions.filter((ts) => ts.worktreeId === worktreeId);

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
  state.agentTabs.get(worktreeId) || [];

export const selectActiveAgentTabId = (worktreeId: string) => (state: AppState) =>
  state.activeAgentTabId.get(worktreeId) || null;

export const selectPRDialog = (state: AppState) => state.prDialog;

export const selectPRDialogOpen = (state: AppState) => state.prDialog.isOpen;

// Helper to update state from ServerMessage
export function updateStateFromServerMessage(message: ServerMessage): void {
  const { addWorkspace, updateWorkspace, removeWorkspace, addWorktree, updateWorktree, removeWorktree } = useStore.getState();
  const { updateAgentSession, addTerminalSession, addNotification } = useStore.getState();

  switch (message.type) {
    case 'WorkspaceCreated':
      addWorkspace(message.workspace);
      break;
    
    case 'WorkspaceUpdated':
      updateWorkspace(message.workspace.id, message.workspace);
      break;
    
    case 'WorkspaceDeleted':
      removeWorkspace(message.id);
      break;
    
    case 'WorktreeCreated':
      addWorktree(message.worktree);
      break;
    
    case 'WorktreeStatus':
      updateWorktree(message.worktree.id, message.worktree);
      break;
    
    case 'WorktreeDeleted':
      removeWorktree(message.id);
      break;
    
    case 'AgentStatusUpdate': {
      const existingSession = useStore.getState().agentSessions.find(as => as.id === message.sessionId);
      if (existingSession) {
        updateAgentSession(message.sessionId, {
          status: message.status,
          ...(message.message ? { message: message.message } : {}),
        } as any);
      }
      break;
    }
    
    case 'AgentOutput':
      // Agent output is handled separately (not stored in main state)
      break;
    
    case 'TerminalCreated':
      addTerminalSession(message.session);
      break;
    
    case 'TerminalOutput':
      // Terminal output is routed to TerminalProvider via callback
      if (terminalOutputCallback) {
        terminalOutputCallback(message);
      }
      break;
    
    case 'Notification':
      addNotification({
        level: message.level,
        message: message.message,
        duration: 5000,
      } as any);
      break;

    case 'Error':
      addNotification({
        level: 'error',
        message: message.message,
        duration: 8000,
      } as any);
      break;
  }
}

// ============================================================================
// Backward Compatibility Exports
// ============================================================================
// These exports maintain compatibility with existing code that expects the old store API
// TODO: Migrate all components to use the new useStore API and remove these exports

import { persist } from 'zustand/middleware';
import { ToastVariant } from './components/ui/Toast';

// Toast store (backward compatibility)
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

// Workspace store (backward compatibility)
export type WorktreeStatus = 'working' | 'waiting' | 'idle';

export interface Worktree {
  id: string;
  branchName: string;
  status: WorktreeStatus;
  workspaceId: string;
}

export interface Workspace {
  id: string;
  name: string;
  rootPath: string;
  color?: string;
  icon?: string;
  worktreeBaseDir?: string;
}

interface WorkspaceStoreState {
  workspaces: Workspace[];
  worktrees: Worktree[];
  activeWorktreeId: string | null;
  expandedWorkspaceIds: Set<string>;
  toggleWorkspaceExpanded: (id: string) => void;
}

export const useWorkspaceStore = create<WorkspaceStoreState>()(
  persist(
    (set) => ({
      workspaces: [],
      worktrees: [],
      activeWorktreeId: null,
      expandedWorkspaceIds: new Set(),
      toggleWorkspaceExpanded: (id: string) =>
        set((state) => {
          const expandedIds = new Set(state.expandedWorkspaceIds)
          if (expandedIds.has(id)) {
            expandedIds.delete(id)
          } else {
            expandedIds.add(id)
          }
          return { expandedWorkspaceIds: expandedIds }
        }),
    }),
    {
      name: 'workspace-storage',
      partialize: (state) => ({
        workspaces: state.workspaces,
        worktrees: state.worktrees,
        activeWorktreeId: state.activeWorktreeId,
        expandedWorkspaceIds: Array.from(state.expandedWorkspaceIds)
      })
    }
  )
);

// Selectors (backward compatibility)
export const selectWorkspaces = (state: WorkspaceStoreState) => state.workspaces;
export const selectActiveWorktreeId = (state: WorkspaceStoreState) => state.activeWorktreeId;
export const selectExpandedWorkspaceIds = (state: WorkspaceStoreState) => state.expandedWorkspaceIds;