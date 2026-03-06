import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';

export interface Tab {
  id: string;
  title: string;
  gitBranch?: string;
  hasNotification: boolean;
  notificationCount: number;
  notificationText?: string;
  cwd: string;
  sessionId: string;
}

interface TabsState {
  tabs: Tab[];
  activeTabId: string | null;
  panelOpen: boolean;
  addTab: () => Promise<void>;
  closeTab: (id: string) => Promise<void>;
  setActiveTab: (id: string) => void;
  markNotification: (tabId: string, message: string) => void;
  clearNotification: (tabId: string) => void;
  togglePanel: () => void;
  clearAllNotifications: () => void;
}

export const useTabsStore = create<TabsState>((set, get) => ({
  tabs: [],
  activeTabId: null,
  panelOpen: false,

  addTab: async () => {
    const sessionId = crypto.randomUUID();
    const newTab: Tab = {
      id: crypto.randomUUID(),
      title: 'bash',
      hasNotification: false,
      notificationCount: 0,
      cwd: '~',
      sessionId,
    };
    set((state) => ({
      tabs: [...state.tabs, newTab],
      activeTabId: newTab.id,
    }));
  },

  closeTab: async (id) => {
    const tab = get().tabs.find((t) => t.id === id);
    if (tab) {
      await invoke('kill_pty', { sessionId: tab.sessionId });
    }
    set((state) => {
      const newTabs = state.tabs.filter((t) => t.id !== id);
      const newActiveId = state.activeTabId === id
        ? newTabs[newTabs.length - 1]?.id || null
        : state.activeTabId;
      return {
        tabs: newTabs,
        activeTabId: newActiveId,
      };
    });
  },

  setActiveTab: (id) => {
    set({ activeTabId: id });
    get().clearNotification(id);
  },

  markNotification: (tabId: string, message: string) => {
    set((state) => ({
      tabs: state.tabs.map((tab) =>
        tab.id === tabId
          ? {
              ...tab,
              hasNotification: true,
              notificationCount: tab.notificationCount + 1,
              notificationText: message,
            }
          : tab
      ),
    }));
  },

  clearNotification: (tabId: string) => {
    set((state) => ({
      tabs: state.tabs.map((tab) =>
        tab.id === tabId
          ? {
              ...tab,
              hasNotification: false,
              notificationCount: 0,
              notificationText: undefined,
            }
          : tab
      ),
    }));
  },

  togglePanel: () => set((state) => ({ panelOpen: !state.panelOpen })),

  clearAllNotifications: () => {
    set((state) => ({
      tabs: state.tabs.map((tab) => ({
        ...tab,
        hasNotification: false,
        notificationCount: 0,
        notificationText: undefined,
      })),
    }));
  },
}));
