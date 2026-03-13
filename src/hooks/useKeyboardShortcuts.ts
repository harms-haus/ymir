import { useState, useEffect, useCallback, useMemo } from 'react';
import { useWorkspaces } from './useWorkspaces';
import { usePanes } from './usePanes';
import { useTabs } from './useTabs';
import { getWebSocketService } from '../services/websocket';
import {
  clearTabNotification,
  useRuntimeNotifications,
} from '../lib/runtime-notifications';
import {
  useRuntimeSelection,
  setActivePaneSelection,
  setActiveTabSelection,
  setActiveWorkspaceSelection,
} from '../lib/runtime-selection';
import {
  resetRuntimeZoom,
  setRuntimeSidebarTab,
  toggleRuntimeSidebar,
  zoomRuntimeIn,
  zoomRuntimeOut,
} from '../lib/runtime-ui-state';

export interface UseKeyboardShortcutsReturn {
  focusedPaneId: string | null;
  setFocusedPaneId: (paneId: string | null) => void;
}

export function useKeyboardShortcuts(): UseKeyboardShortcutsReturn {
  const { workspaces } = useWorkspaces();
  const selectionWorkspaceId = useRuntimeSelection((state) => state.activeWorkspaceId);
  const selectionPaneId = useRuntimeSelection((state) => state.activePaneId);
  const selectionTabId = useRuntimeSelection((state) => state.activeTabId);
  const activeWorkspaceId =
    selectionWorkspaceId && workspaces.some((workspace) => workspace.id === selectionWorkspaceId)
      ? selectionWorkspaceId
      : (workspaces[0]?.id ?? null);
  const { panes } = usePanes(activeWorkspaceId);
  const currentPaneId =
    selectionPaneId && panes.some((pane) => pane.id === selectionPaneId)
      ? selectionPaneId
      : (panes[0]?.id ?? null);
  const { tabs } = useTabs(currentPaneId);
  const notifications = useRuntimeNotifications((snapshot) => snapshot);
  const websocketService = useMemo(() => getWebSocketService(), []);

  const [focusedPaneId, setFocusedPaneId] = useState<string | null>(null);

  const jumpToFirstUnread = useCallback(() => {
    const firstUnread = Object.values(notifications)
      .filter((entry) => entry.count > 0)
      .sort((a, b) => b.count - a.count)[0];

    if (!firstUnread) {
      return;
    }

    setActiveWorkspaceSelection(firstUnread.workspaceId);
    setActivePaneSelection(firstUnread.paneId);
    setActiveTabSelection(firstUnread.tabId);
    clearTabNotification(firstUnread.tabId);
  }, [notifications]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isCtrl = e.ctrlKey || e.metaKey;
      const isShift = e.shiftKey;
      const targetPaneId = focusedPaneId || currentPaneId;

      if (isCtrl && !isShift && /^[1-8]$/.test(e.key)) {
        e.preventDefault();
        const index = parseInt(e.key, 10) - 1;
        const workspace = workspaces[index];
        if (workspace) {
          setActiveWorkspaceSelection(workspace.id);
          setActivePaneSelection(null);
          setActiveTabSelection(null);
        }
        return;
      }

      if (isCtrl && !isShift && e.key === 'd') {
        e.preventDefault();
        if (activeWorkspaceId) {
          void websocketService
            .request<{ pane?: { id?: string } }>('pane.create', { workspaceId: activeWorkspaceId })
            .then((result) => {
              if (result.pane?.id) {
                setActivePaneSelection(result.pane.id);
              }
            })
            .catch(() => undefined);
        }
        return;
      }

      if (isCtrl && isShift && (e.key === 'D' || e.key === 'd')) {
        e.preventDefault();
        if (activeWorkspaceId) {
          void websocketService
            .request<{ pane?: { id?: string } }>('pane.create', { workspaceId: activeWorkspaceId })
            .then((result) => {
              if (result.pane?.id) {
                setActivePaneSelection(result.pane.id);
              }
            })
            .catch(() => undefined);
        }
        return;
      }

      if (isCtrl && !isShift && e.key === 't') {
        e.preventDefault();
        if (activeWorkspaceId && targetPaneId) {
          void websocketService
            .request('tab.create', {
              workspaceId: activeWorkspaceId,
              paneId: targetPaneId,
            })
            .catch(() => undefined);
        }
        return;
      }

      if (isCtrl && !isShift && e.key === 'w') {
        e.preventDefault();
        const activeTabId =
          selectionTabId && tabs.some((tab) => tab.id === selectionTabId)
            ? selectionTabId
            : (tabs[0]?.id ?? null);
        if (activeTabId) {
          clearTabNotification(activeTabId);
          void websocketService.request('tab.close', { id: activeTabId }).catch(() => undefined);
        }
        return;
      }

      if (isCtrl && isShift && (e.key === 'W' || e.key === 'w')) {
        e.preventDefault();
        if (targetPaneId) {
          void websocketService.request('pane.delete', { id: targetPaneId }).catch(() => undefined);
          setActivePaneSelection(null);
          setActiveTabSelection(null);
        }
        return;
      }

      if (isCtrl && !isShift && e.key === 'b') {
        e.preventDefault();
        toggleRuntimeSidebar();
        return;
      }

      if (isCtrl && !isShift && e.key === 'i') {
        e.preventDefault();
        setRuntimeSidebarTab('notifications');
        return;
      }

      if (isCtrl && isShift && (e.key === 'U' || e.key === 'u')) {
        e.preventDefault();
        jumpToFirstUnread();
        return;
      }

      if (isCtrl && (e.key === '=' || e.key === '+')) {
        e.preventDefault();
        zoomRuntimeIn();
        return;
      }

      if (isCtrl && e.key === '-') {
        e.preventDefault();
        zoomRuntimeOut();
        return;
      }

      if (isCtrl && !isShift && e.key === '0') {
        e.preventDefault();
        resetRuntimeZoom();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    activeWorkspaceId,
    currentPaneId,
    focusedPaneId,
    jumpToFirstUnread,
    selectionTabId,
    tabs,
    websocketService,
    workspaces,
  ]);

  return { focusedPaneId, setFocusedPaneId };
}

export default useKeyboardShortcuts;
