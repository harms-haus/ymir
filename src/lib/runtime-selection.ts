import { useSyncExternalStore } from 'react';

export interface RuntimeSelectionState {
  activeWorkspaceId: string | null;
  activePaneId: string | null;
  activeTabId: string | null;
}

type Listener = () => void;

interface RuntimeSelectionStore {
  selection: RuntimeSelectionState;
  listeners: Set<Listener>;
}

const GLOBAL_SELECTION_STORE_KEY = '__ymirRuntimeSelectionStore__';

function getSelectionStore(): RuntimeSelectionStore {
  const globalObject = globalThis as typeof globalThis & {
    [GLOBAL_SELECTION_STORE_KEY]?: RuntimeSelectionStore;
  };

  if (!globalObject[GLOBAL_SELECTION_STORE_KEY]) {
    globalObject[GLOBAL_SELECTION_STORE_KEY] = {
      selection: {
        activeWorkspaceId: null,
        activePaneId: null,
        activeTabId: null,
      },
      listeners: new Set<Listener>(),
    };
  }

  return globalObject[GLOBAL_SELECTION_STORE_KEY];
}

function notify(): void {
  const { listeners } = getSelectionStore();
  listeners.forEach((listener) => {
    listener();
  });
}

export function setActiveWorkspaceSelection(workspaceId: string | null): void {
  const { selection } = getSelectionStore();
  if (selection.activeWorkspaceId === workspaceId) {
    return;
  }
  selection.activeWorkspaceId = workspaceId;
  notify();
}

export function setActivePaneSelection(paneId: string | null): void {
  const { selection } = getSelectionStore();
  if (selection.activePaneId === paneId) {
    return;
  }
  selection.activePaneId = paneId;
  notify();
}

export function setActiveTabSelection(tabId: string | null): void {
  const { selection } = getSelectionStore();
  if (selection.activeTabId === tabId) {
    return;
  }
  selection.activeTabId = tabId;
  notify();
}

export function subscribeRuntimeSelection(listener: Listener): () => void {
  const { listeners } = getSelectionStore();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getRuntimeSelection(): RuntimeSelectionState {
  return { ...getSelectionStore().selection };
}

export function useRuntimeSelection<T>(selector: (snapshot: RuntimeSelectionState) => T): T {
  return useSyncExternalStore(
    subscribeRuntimeSelection,
    () => selector(getRuntimeSelection()),
    () => selector(getRuntimeSelection()),
  );
}

export function emitCliNotification(message: string): void {
  if (typeof window === 'undefined') {
    return;
  }

  window.dispatchEvent(
    new CustomEvent('ymir:cli-notify', {
      detail: { message },
    }),
  );
}
