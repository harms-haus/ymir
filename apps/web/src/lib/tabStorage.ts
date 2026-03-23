const TAB_ID_KEY = 'ymir-tab-id';
const TAB_STORAGE_KEY_PREFIX = 'ymir-ui-state';

function getTabId(): string {
  let tabId = sessionStorage.getItem(TAB_ID_KEY);
  if (!tabId) {
    tabId = `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
    sessionStorage.setItem(TAB_ID_KEY, tabId);
  }
  return tabId;
}

const tabId = getTabId();

export function getTabStorageKey(propertyName: string): string {
  return `${TAB_STORAGE_KEY_PREFIX}-${tabId}-${propertyName}`;
}

export function getStorageKeyPrefix(): string {
  return `${TAB_STORAGE_KEY_PREFIX}-`;
}

export interface TabStorage {
  sidebarPanelSize: number;
  mainPanelSize: number;
  projectPanelSize: number;
  agentPanelSize: number;
  terminalPanelSize: number;
  activeWorktreeId: string | null;
  activeAgentTabIds: Record<string, string>;
  activeTerminalTabIds: Record<string, string>;
  diffViewMode: 'split' | 'inline';
  changesViewMode: 'flat' | 'grouped';
  expandedWorkspaceIds: string[];
}

export const defaultTabStorageValues: TabStorage = {
  sidebarPanelSize: 20,
  mainPanelSize: 50,
  projectPanelSize: 30,
  agentPanelSize: 60,
  terminalPanelSize: 40,
  activeWorktreeId: null,
  activeAgentTabIds: {},
  activeTerminalTabIds: {},
  diffViewMode: 'split',
  changesViewMode: 'flat',
  expandedWorkspaceIds: [],
};

export function getTabStorageValue<K extends keyof TabStorage>(
  key: K
): TabStorage[K] {
  try {
    const storageKey = getTabStorageKey(key);
    const stored = localStorage.getItem(storageKey);
    if (stored === null) {
      return defaultTabStorageValues[key];
    }
    return JSON.parse(stored) as TabStorage[K];
  } catch {
    return defaultTabStorageValues[key];
  }
}

export function setTabStorageValue<K extends keyof TabStorage>(
  key: K,
  value: TabStorage[K]
): void {
  try {
    const storageKey = getTabStorageKey(key);
    localStorage.setItem(storageKey, JSON.stringify(value));
  } catch (error) {
    console.warn('Failed to write to tab storage:', error);
  }
}

export function clearTabStorage(): void {
  try {
    const prefix = getTabStorageKey('');
    const keysToRemove: string[] = [];
    
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith(prefix)) {
        keysToRemove.push(key);
      }
    }
    
    for (const key of keysToRemove) {
      localStorage.removeItem(key);
    }
  } catch (error) {
    console.warn('Failed to clear tab storage:', error);
  }
}

export function getCurrentTabId(): string {
  return tabId;
}
