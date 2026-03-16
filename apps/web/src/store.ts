import { create } from 'zustand';
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

export const useToastStore = create<ToastStore>((set) => ({
  notifications: [],
  _idCounter: 0,
  addNotification: (notification) =>
    set((state) => {
      const newId = `toast-${idCounter++}`;
      return {
        notifications: [
          ...state.notifications,
          { ...notification, id: newId }
        ],
        _idCounter: idCounter
      };
    }),
  removeNotification: (id) =>
    set((state) => ({
      notifications: state.notifications.filter((n) => n.id !== id)
    }))
}));

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
  path: string;
  worktrees: Worktree[];
}

interface WorkspaceState {
  workspaces: Workspace[];
  activeWorktreeId: string | null;
  expandedWorkspaceIds: Set<string>;
  setWorkspaces: (workspaces: Workspace[]) => void;
  setActiveWorktree: (worktreeId: string | null) => void;
  toggleWorkspaceExpanded: (workspaceId: string) => void;
  expandWorkspace: (workspaceId: string) => void;
  collapseWorkspace: (workspaceId: string) => void;
  addWorkspace: (workspace: Workspace) => void;
  removeWorkspace: (workspaceId: string) => void;
  addWorktree: (workspaceId: string, worktree: Worktree) => void;
  removeWorktree: (worktreeId: string) => void;
  updateWorktreeStatus: (worktreeId: string, status: WorktreeStatus) => void;
}

export const useWorkspaceStore = create<WorkspaceState>()(
  persist(
    (set) => ({
      workspaces: [],
      activeWorktreeId: null,
      expandedWorkspaceIds: new Set<string>(),

      setWorkspaces: (workspaces) => set({ workspaces }),

      setActiveWorktree: (worktreeId) => set({ activeWorktreeId: worktreeId }),

      toggleWorkspaceExpanded: (workspaceId) =>
        set((state) => {
          const newExpanded = new Set(state.expandedWorkspaceIds);
          if (newExpanded.has(workspaceId)) {
            newExpanded.delete(workspaceId);
          } else {
            newExpanded.add(workspaceId);
          }
          return { expandedWorkspaceIds: newExpanded };
        }),

      expandWorkspace: (workspaceId) =>
        set((state) => {
          const newExpanded = new Set(state.expandedWorkspaceIds);
          newExpanded.add(workspaceId);
          return { expandedWorkspaceIds: newExpanded };
        }),

      collapseWorkspace: (workspaceId) =>
        set((state) => {
          const newExpanded = new Set(state.expandedWorkspaceIds);
          newExpanded.delete(workspaceId);
          return { expandedWorkspaceIds: newExpanded };
        }),

      addWorkspace: (workspace) =>
        set((state) => ({
          workspaces: [...state.workspaces, workspace],
        })),

      removeWorkspace: (workspaceId) =>
        set((state) => ({
          workspaces: state.workspaces.filter((w) => w.id !== workspaceId),
          activeWorktreeId:
            state.activeWorktreeId &&
            state.workspaces
              .find((w) => w.id === workspaceId)
              ?.worktrees.some((wt) => wt.id === state.activeWorktreeId)
              ? null
              : state.activeWorktreeId,
        })),

      addWorktree: (workspaceId, worktree) =>
        set((state) => ({
          workspaces: state.workspaces.map((w) =>
            w.id === workspaceId
              ? { ...w, worktrees: [...w.worktrees, worktree] }
              : w
          ),
        })),

      removeWorktree: (worktreeId) =>
        set((state) => ({
          workspaces: state.workspaces.map((w) => ({
            ...w,
            worktrees: w.worktrees.filter((wt) => wt.id !== worktreeId),
          })),
          activeWorktreeId:
            state.activeWorktreeId === worktreeId
              ? null
              : state.activeWorktreeId,
        })),

      updateWorktreeStatus: (worktreeId, status) =>
        set((state) => ({
          workspaces: state.workspaces.map((w) => ({
            ...w,
            worktrees: w.worktrees.map((wt) =>
              wt.id === worktreeId ? { ...wt, status } : wt
            ),
          })),
        })),
    }),
    {
      name: 'ymir-workspace-storage',
      partialize: (state) => ({
        expandedWorkspaceIds: Array.from(state.expandedWorkspaceIds),
        activeWorktreeId: state.activeWorktreeId,
      }),
      onRehydrateStorage: () => (state) => {
        if (state) {
          state.expandedWorkspaceIds = new Set(state.expandedWorkspaceIds);
        }
      },
    }
  )
);

// Selectors
export const selectWorkspaces = (state: WorkspaceState) => state.workspaces;
export const selectActiveWorktreeId = (state: WorkspaceState) =>
  state.activeWorktreeId;
export const selectExpandedWorkspaceIds = (state: WorkspaceState) =>
  state.expandedWorkspaceIds;
export const selectActiveWorktree = (state: WorkspaceState) => {
  if (!state.activeWorktreeId) return null;
  for (const workspace of state.workspaces) {
    const worktree = workspace.worktrees.find(
      (wt) => wt.id === state.activeWorktreeId
    );
    if (worktree) return worktree;
  }
  return null;
};
export const selectWorkspaceById = (id: string) => (state: WorkspaceState) =>
  state.workspaces.find((w) => w.id === id);
export const selectWorktreeById = (id: string) => (state: WorkspaceState) => {
  for (const workspace of state.workspaces) {
    const worktree = workspace.worktrees.find((wt) => wt.id === id);
    if (worktree) return worktree;
  }
  return null;
};
