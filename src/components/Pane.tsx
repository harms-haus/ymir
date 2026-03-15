import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useTabs } from '../hooks/useTabs';
import { usePanes } from '../hooks/usePanes';
import { getWebSocketService } from '../services/websocket';
import {
  clearTabNotification,
  getTabNotification,
  markTabNotification,
  syncPaneTabs,
  useRuntimeNotifications,
} from '../lib/runtime-notifications';
import {
  useRuntimeSelection,
  setActivePaneSelection,
  setActiveTabSelection,
} from '../lib/runtime-selection';
import { Terminal } from './Terminal';
import { TabBar } from './TabBar';
import { ErrorBoundary } from './ErrorBoundary';

interface PaneProps {
  paneId: string;
  workspaceId: string;
  windowControlsPosition?: 'left' | 'right';
  isTopmost?: boolean;
}

export function Pane({ paneId, workspaceId, windowControlsPosition, isTopmost }: PaneProps) {
  const { tabs, isLoading, refetch: refetchTabs } = useTabs(paneId);
  const { panes } = usePanes(workspaceId);
  const hasReceivedDataRef = useRef(false);
  const selectedPaneId = useRuntimeSelection((state) => state.activePaneId);
  const selectedTabId = useRuntimeSelection((state) => state.activeTabId);
  const websocketService = useMemo(() => getWebSocketService(), []);
  useRuntimeNotifications((snapshot) => snapshot);

  useEffect(() => {
    if (!isLoading && tabs.length > 0) {
      hasReceivedDataRef.current = true;
    }
  }, [isLoading, tabs.length]);

  useEffect(() => {
    syncPaneTabs(workspaceId, paneId, tabs);
  }, [paneId, tabs, workspaceId]);

  const activeTabId = useMemo(() => {
    if (selectedTabId && tabs.some((tab) => tab.id === selectedTabId)) {
      return selectedTabId;
    }

    return tabs[0]?.id ?? null;
  }, [selectedTabId, tabs]);

  useEffect(() => {
    if (selectedPaneId === paneId && activeTabId) {
      setActiveTabSelection(activeTabId);
    }
  }, [activeTabId, paneId, selectedPaneId]);

  useEffect(() => {
    if (isLoading) {
      return;
    }

    if (tabs.length > 0) {
      hasReceivedDataRef.current = true;
      return;
    }

    // Only create initial tab if we've received data but have no tabs
    // This handles both startup and after all tabs are closed
    if (!hasReceivedDataRef.current) {
      return;
    }

    void websocketService
      .request<{ tab?: { id?: string } }>('tab.create', {
        workspaceId,
        paneId,
      })
      .then(async (result) => {
        const createdTabId = result?.tab?.id;
        if (createdTabId) {
          setActivePaneSelection(paneId);
          setActiveTabSelection(createdTabId);
        }
        await refetchTabs();
      })
      .catch(() => undefined);
  }, [isLoading, paneId, refetchTabs, tabs.length, websocketService, workspaceId]);

  const handleCreateTab = useCallback(
    (targetPaneId: string) => {
      void websocketService
        .request<{ tab?: { id?: string } }>('tab.create', {
          workspaceId,
          paneId: targetPaneId,
        })
        .then(async (result) => {
          const createdTabId = result?.tab?.id;
          if (createdTabId && targetPaneId === paneId) {
            setActivePaneSelection(targetPaneId);
            setActiveTabSelection(createdTabId);
          }
          await refetchTabs();
        })
        .catch(() => undefined);
    },
    [paneId, refetchTabs, websocketService, workspaceId],
  );

  const handleCloseTab = useCallback(
    (_paneId: string, tabId: string) => {
      clearTabNotification(tabId);
      
      const status = websocketService.getStatus();
      if (!websocketService.isConnected()) {
        console.error('Cannot close tab: WebSocket not connected', {
          state: status.state,
          error: status.error,
          tabId
        });
        return;
      }
      
      const isLastTab = tabs.length === 1;
      const paneCount = panes.length;
      
      void websocketService
        .request('tab.close', { id: tabId })
        .then(async () => {
          await refetchTabs();
          
          // If this was the last tab in the pane
          if (isLastTab) {
            // If there are other panes, delete this empty pane
            // If this is the only pane, keep it empty (don't delete the last pane)
            if (paneCount > 1) {
              void websocketService
                .request('pane.delete', { id: paneId })
                .catch(() => undefined);
            }
          }
        })
        .catch((error) => {
          console.error('Failed to close tab:', error);
        });
    },
    [websocketService, refetchTabs, tabs.length, panes.length, paneId],
  );

  const handleSelectTab = useCallback((_paneId: string, tabId: string) => {
    setActivePaneSelection(_paneId);
    setActiveTabSelection(tabId);
    clearTabNotification(tabId);
  }, []);

  const handleSplitPane = useCallback(
    async () => {
      const response = await websocketService.request<{ pane?: { id?: string } }>('pane.create', {
        workspaceId,
      });
      if (response?.pane?.id) {
        setActivePaneSelection(response.pane.id);
      }
    },
    [websocketService, workspaceId],
  );

  const tabNotificationHandlers = useMemo(() => {
    const handlers: Record<string, (message: string) => void> = {};
    tabs.forEach((tab) => {
      handlers[tab.id] = (message: string) => {
        markTabNotification(workspaceId, paneId, tab, message);
      };
    });
    return handlers;
  }, [paneId, tabs, workspaceId]);

  const decoratedTabs = useMemo(
    () =>
      tabs.map((tab) => {
        const notification = getTabNotification(tab.id);
        return {
          ...tab,
          hasNotification: notification.count > 0,
          notificationCount: notification.count,
          notificationText: notification.text,
        };
      }),
    [tabs],
  );

  const hasNotification = decoratedTabs.some((tab) => tab.hasNotification);

  if (tabs.length === 0) {
    return (
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          backgroundColor: 'var(--background-hex)',
        }}
      >
        <TabBar
          paneId={paneId}
          tabs={[]}
          activeTabId={null}
          onCreateTab={handleCreateTab}
          onCloseTab={handleCloseTab}
          onSelectTab={handleSelectTab}
          onSplitPane={() => {
            void handleSplitPane();
          }}
          windowControlsPosition={windowControlsPosition}
          isTopmost={isTopmost}
        />
        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--foreground-muted)',
            fontSize: '14px',
            gap: '12px',
          }}
        >
          <span>No tabs</span>
          <button
            onClick={() => handleCreateTab(paneId)}
            type="button"
            style={{
              padding: '8px 16px',
              backgroundColor: 'var(--primary-hex)',
              color: '#fff',
              border: 'none',
              borderRadius: 'var(--radius-sm)',
              fontSize: '12px',
              cursor: 'pointer',
            }}
          >
            New Tab
          </button>
        </div>
      </div>
    );
  }

  return (
    <ErrorBoundary>
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          backgroundColor: 'var(--background-hex)',
          boxShadow: hasNotification ? 'inset 0 0 0 2px var(--notification)' : 'none',
          transition: 'box-shadow 0.2s ease',
        }}
      >
        <TabBar
          paneId={paneId}
          tabs={decoratedTabs}
          activeTabId={activeTabId}
          onCreateTab={handleCreateTab}
          onCloseTab={handleCloseTab}
          onSelectTab={handleSelectTab}
          onSplitPane={() => {
            void handleSplitPane();
          }}
          windowControlsPosition={windowControlsPosition}
          isTopmost={isTopmost}
        />

        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            borderTop: '1px solid var(--border-tertiary)',
            position: 'relative',
          }}
        >
          {decoratedTabs.map((tab) => {
            const isActive = tab.id === activeTabId;
            return (
              <div
                key={tab.id}
                style={{
                  display: 'flex',
                  flex: 1,
                  width: '100%',
                  height: '100%',
                  position: isActive ? 'relative' : 'absolute',
                  top: 0,
                  left: 0,
                  visibility: isActive ? 'visible' : 'hidden',
                  opacity: isActive ? 1 : 0,
                  pointerEvents: isActive ? 'auto' : 'none',
                }}
              >
                <Terminal
                  sessionId={tab.sessionId}
                  tabId={tab.id}
                  paneId={paneId}
                  workspaceId={workspaceId}
                  onNotification={tabNotificationHandlers[tab.id]}
                  hasNotification={tab.hasNotification}
                />
              </div>
            );
          })}
        </div>
      </div>
    </ErrorBoundary>
  );
}
