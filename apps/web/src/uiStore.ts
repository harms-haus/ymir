import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { getTabStorageKey, defaultTabStorageValues } from './lib/tabStorage';

export interface UIState {
  sidebarPanelSize: number;
  mainPanelSize: number;
  projectPanelSize: number;
  agentPanelSize: number;
  terminalPanelSize: number;
  setPanelSizes: (sizes: Partial<Omit<UIState, 
    | 'setPanelSizes' 
    | 'setActiveWorktreeId' 
    | 'setActiveAgentTabId' 
    | 'removeActiveAgentTabId'
    | 'setActiveTerminalTabId' 
    | 'removeActiveTerminalTabId'
    | 'setDiffViewMode'
    | 'setChangesViewMode'
    | 'expandedWorkspaceIds'
    | 'setExpandedWorkspaceIds'
    | 'toggleExpandedWorkspaceId'
    | 'activeWorktreeId'
    | 'activeAgentTabIds'
    | 'activeTerminalTabIds'
    | 'diffViewMode'
    | 'changesViewMode'
  >>) => void;

  activeWorktreeId: string | null;
  setActiveWorktreeId: (worktreeId: string | null) => void;

  activeAgentTabIds: Record<string, string>;
  setActiveAgentTabId: (worktreeId: string, tabId: string) => void;
  removeActiveAgentTabId: (worktreeId: string) => void;

  activeTerminalTabIds: Record<string, string>;
  setActiveTerminalTabId: (worktreeId: string, tabId: string) => void;
  removeActiveTerminalTabId: (worktreeId: string) => void;

  diffViewMode: 'split' | 'inline';
  setDiffViewMode: (mode: 'split' | 'inline') => void;

  changesViewMode: 'flat' | 'grouped';
  setChangesViewMode: (mode: 'flat' | 'grouped') => void;

  expandedWorkspaceIds: string[];
  setExpandedWorkspaceIds: (ids: string[]) => void;
  toggleExpandedWorkspaceId: (id: string) => void;
}

const tabStorage = {
  getItem: (name: string): string | null => {
    const key = getTabStorageKey(name.replace('ymir-ui-state-', ''));
    return localStorage.getItem(key);
  },
  setItem: (name: string, value: string): void => {
    const key = getTabStorageKey(name.replace('ymir-ui-state-', ''));
    localStorage.setItem(key, value);
  },
  removeItem: (name: string): void => {
    const key = getTabStorageKey(name.replace('ymir-ui-state-', ''));
    localStorage.removeItem(key);
  },
};

export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      sidebarPanelSize: defaultTabStorageValues.sidebarPanelSize,
      mainPanelSize: defaultTabStorageValues.mainPanelSize,
      projectPanelSize: defaultTabStorageValues.projectPanelSize,
      agentPanelSize: defaultTabStorageValues.agentPanelSize,
      terminalPanelSize: defaultTabStorageValues.terminalPanelSize,
      setPanelSizes: (sizes) => set((state) => ({ ...state, ...sizes })),

      activeWorktreeId: defaultTabStorageValues.activeWorktreeId,
      setActiveWorktreeId: (worktreeId) => set({ activeWorktreeId: worktreeId }),

      activeAgentTabIds: defaultTabStorageValues.activeAgentTabIds,
      setActiveAgentTabId: (worktreeId, tabId) =>
        set((state) => ({
          activeAgentTabIds: { ...state.activeAgentTabIds, [worktreeId]: tabId },
        })),
      removeActiveAgentTabId: (worktreeId) =>
        set((state) => {
          const newTabIds = { ...state.activeAgentTabIds };
          delete newTabIds[worktreeId];
          return { activeAgentTabIds: newTabIds };
        }),

      activeTerminalTabIds: defaultTabStorageValues.activeTerminalTabIds,
      setActiveTerminalTabId: (worktreeId, tabId) =>
        set((state) => ({
          activeTerminalTabIds: { ...state.activeTerminalTabIds, [worktreeId]: tabId },
        })),
      removeActiveTerminalTabId: (worktreeId) =>
        set((state) => {
          const newTabIds = { ...state.activeTerminalTabIds };
          delete newTabIds[worktreeId];
          return { activeTerminalTabIds: newTabIds };
        }),

      diffViewMode: defaultTabStorageValues.diffViewMode,
      setDiffViewMode: (mode) => set({ diffViewMode: mode }),

      changesViewMode: defaultTabStorageValues.changesViewMode,
      setChangesViewMode: (mode) => set({ changesViewMode: mode }),

      expandedWorkspaceIds: defaultTabStorageValues.expandedWorkspaceIds,
      setExpandedWorkspaceIds: (ids) => set({ expandedWorkspaceIds: ids }),
      toggleExpandedWorkspaceId: (id) =>
        set((state) => {
          const currentIds = new Set(state.expandedWorkspaceIds);
          if (currentIds.has(id)) {
            currentIds.delete(id);
          } else {
            currentIds.add(id);
          }
          return { expandedWorkspaceIds: Array.from(currentIds) };
        }),
    }),
    {
      name: 'ymir-ui-state',
      storage: createJSONStorage(() => tabStorage),
    }
  )
);
