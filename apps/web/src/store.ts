import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { AppState, WorkspaceState, WorktreeState, AgentSessionState, TerminalSessionState, NotificationState, ConnectionStatus } from './types/state';
import { ServerMessage } from './types/protocol';

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
          ...notification,
          id,
          timestamp: Date.now(),
        };
        
        set((state) => ({
          notifications: [...state.notifications, newNotification],
        }));

        // Auto-remove notifications after duration (default 5 seconds)
        const duration = notification.duration ?? 5000;
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

// Helper to update state from ServerMessage
export function updateStateFromServerMessage(message: ServerMessage): void {
  const { addWorkspace, updateWorkspace, removeWorkspace, addWorktree, updateWorktree, removeWorktree } = useStore.getState();
  const { addAgentSession, updateAgentSession, removeAgentSession } = useStore.getState();
  const { addTerminalSession, removeTerminalSession } = useStore.getState();
  const { addNotification } = useStore.getState();

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
      // Check if session exists to decide between add/update
      const existingSession = useStore.getState().agentSessions.find(as => as.id === message.session.id);
      if (existingSession) {
        updateAgentSession(message.session.id, message.session);
      } else {
        addAgentSession(message.session);
      }
      break;
    }
    
    case 'AgentOutput':
      // Agent output is handled separately (not stored in main state)
      break;
    
    case 'TerminalCreated':
      addTerminalSession(message.terminal);
      break;
    
    case 'TerminalOutput':
      // Terminal output is handled separately (not stored in main state)
      break;
    
    case 'Notification':
      addNotification({
        level: message.level,
        message: message.message,
        duration: 5000,
      });
      break;
    
    case 'Error':
      addNotification({
        level: 'error',
        message: message.message,
        duration: 8000,
      });
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

interface WorkspaceState {
  workspaces: Workspace[];
  worktrees: Worktree[];
  activeWorktreeId: string | null;
  expandedWorkspaceIds: Set<string>;
  toggleWorkspaceExpanded: (id: string) => void;
}

export const useWorkspaceStore = create<WorkspaceState>()(
  persist(
    (set, get) => ({
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
      serialize: (state) => {
        // Convert Set to Array for proper JSON serialization
        return JSON.stringify({
          ...state,
          state: {
            ...state.state,
            expandedWorkspaceIds: Array.from(state.state.expandedWorkspaceIds)
          }
        })
      },
      deserialize: (str) => {
        const parsed = JSON.parse(str)
        // Convert Array back to Set when loading
        return {
          ...parsed,
          state: {
            ...parsed.state,
            expandedWorkspaceIds: new Set(parsed.state.expandedWorkspaceIds)
          }
        }
      }
    }
  )
);

// Selectors (backward compatibility)
export const selectWorkspaces = (state: WorkspaceState) => state.workspaces;
export const selectActiveWorktreeId = (state: WorkspaceState) => state.activeWorktreeId;
export const selectExpandedWorkspaceIds = (state: WorkspaceState) => state.expandedWorkspaceIds;