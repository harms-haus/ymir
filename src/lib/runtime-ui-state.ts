import { useSyncExternalStore } from 'react';
import { DEFAULT_FONT_SIZE, MAX_FONT_SIZE, MIN_FONT_SIZE } from './constants';
import { SidebarTab } from '../state/types';

interface RuntimeUiState {
  sidebarCollapsed: boolean;
  activeSidebarTab: SidebarTab | string;
  fontSize: number;
}

type Listener = () => void;

const listeners = new Set<Listener>();

const state: RuntimeUiState = {
  sidebarCollapsed: false,
  activeSidebarTab: 'workspaces',
  fontSize: DEFAULT_FONT_SIZE,
};

function notify(): void {
  listeners.forEach((listener) => {
    listener();
  });
}

export function subscribeRuntimeUi(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getRuntimeUiState(): RuntimeUiState {
  return state;
}

export function toggleRuntimeSidebar(): void {
  state.sidebarCollapsed = !state.sidebarCollapsed;
  notify();
}

export function setRuntimeSidebarTab(tab: SidebarTab | string): void {
  if (state.activeSidebarTab === tab) {
    return;
  }
  state.activeSidebarTab = tab;
  notify();
}

export function zoomRuntimeIn(): void {
  const nextSize = Math.min(state.fontSize + 1, MAX_FONT_SIZE);
  if (nextSize === state.fontSize) {
    return;
  }
  state.fontSize = nextSize;
  notify();
}

export function zoomRuntimeOut(): void {
  const nextSize = Math.max(state.fontSize - 1, MIN_FONT_SIZE);
  if (nextSize === state.fontSize) {
    return;
  }
  state.fontSize = nextSize;
  notify();
}

export function resetRuntimeZoom(): void {
  if (state.fontSize === DEFAULT_FONT_SIZE) {
    return;
  }
  state.fontSize = DEFAULT_FONT_SIZE;
  notify();
}

export function useRuntimeUiState<T>(selector: (snapshot: RuntimeUiState) => T): T {
  return useSyncExternalStore(
    subscribeRuntimeUi,
    () => selector(getRuntimeUiState()),
    () => selector(getRuntimeUiState()),
  );
}
