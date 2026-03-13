import { SplitDirection } from '../state/types';
import logger from '../lib/logger';
import { getWebSocketService } from '../services/websocket';
import {
  emitCliNotification,
  getRuntimeSelection,
  setActivePaneSelection,
  setActiveTabSelection,
} from '../lib/runtime-selection';
import { clearTabNotification, markTabNotification } from '../lib/runtime-notifications';

const websocketService = getWebSocketService();

function getSelection() {
  return getRuntimeSelection();
}

export const CLI = {
  split: (_direction: SplitDirection): void => {
    const { activeWorkspaceId } = getSelection();
    if (!activeWorkspaceId) {
      return;
    }

    void websocketService
      .request<{ pane?: { id?: string } }>('pane.create', { workspaceId: activeWorkspaceId })
      .then((result) => {
        if (result.pane?.id) {
          setActivePaneSelection(result.pane.id);
        }
      })
      .catch(() => undefined);
  },

  focus: (_direction: SplitDirection): void => {
  },

  newTab: (cwd?: string): void => {
    const { activeWorkspaceId, activePaneId } = getSelection();
    if (!activeWorkspaceId || !activePaneId) {
      return;
    }

    void websocketService
      .request('tab.create', {
        workspaceId: activeWorkspaceId,
        paneId: activePaneId,
        cwd,
      })
      .catch(() => undefined);
  },

  closeTab: (): void => {
    const { activeTabId } = getSelection();
    if (!activeTabId) {
      return;
    }

    clearTabNotification(activeTabId);
    void websocketService.request('tab.close', { id: activeTabId }).catch(() => undefined);
  },

  closePane: (): void => {
    const { activePaneId } = getSelection();
    if (!activePaneId) {
      return;
    }

    void websocketService.request('pane.delete', { id: activePaneId }).catch(() => undefined);
    setActivePaneSelection(null);
    setActiveTabSelection(null);
  },

  notify: (message: string): void => {
    const { activeWorkspaceId, activePaneId, activeTabId } = getSelection();
    if (!activeWorkspaceId || !activePaneId || !activeTabId) {
      return;
    }

    markTabNotification(
      activeWorkspaceId,
      activePaneId,
      {
        id: activeTabId,
        title: 'bash',
        cwd: '~',
      },
      message,
    );
    emitCliNotification(message);
  },
};

export function initCLI(): void {
  if (typeof window !== 'undefined') {
    (window as Window & { ymir?: YmirCLI }).ymir = CLI;
    logger.info('[ymir] CLI initialized on window.ymir');
  }
}

export type YmirCLI = typeof CLI;

declare global {
  interface Window {
    ymir?: YmirCLI;
  }
}

export default CLI;
