import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useTabs } from '../hooks/useTabs';
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
  const hasSeenTabsRef = useRef(false);
  const hasReceivedDataRef = useRef(false);
  const selectedPaneId = useRuntimeSelection((state) => state.activePaneId);
  const selectedTabId = useRuntimeSelection((state) => state.activeTabId);
  const websocketService = useMemo(() => getWebSocketService(), []);
  useRuntimeNotifications((snapshot) => snapshot);

  useEffect(() => {
    if (!isLoading && tabs.length > 0) {
      hasSeenTabsRef.current = true;
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
      return;
    }

    if (hasSeenTabsRef.current) {
      return;
    }

    if (!hasReceivedDataRef.current) {
      return;
    }

    hasSeenTabsRef.current = true;
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
      .catch(() => {
        hasSeenTabsRef.current = false;
      });
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
      
      console.log('Closing tab:', { tabId, connectionState: status.state });
      void websocketService
        .request('tab.close', { id: tabId })
        .then((result) => {
          console.log('Tab close successful:', { tabId, result });
          void refetchTabs();
        })
        .catch((error) => {
          console.error('Failed to close tab:', error);
        });
    },
    [websocketService, refetchTabs],
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

  const activeTab = useMemo(
    () => decoratedTabs.find((tab) => tab.id === activeTabId) ?? null,
    [activeTabId, decoratedTabs],
  );

  const hasNotification = decoratedTabs.some((tab) => tab.hasNotification);

  if (tabs.length === 0) {
    return (
      <div
        style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: 'var(--background-hex)',
          color: 'var(--foreground-muted)',
          fontSize: '14px',
        }}
      >
        Initializing pane...
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
          }}
        >
          {activeTab && (
            <div
              key={activeTab.id}
              style={{
                display: 'flex',
                flex: 1,
                width: '100%',
                height: '100%',
              }}
            >
              <Terminal
                sessionId={activeTab.sessionId}
                tabId={activeTab.id}
                paneId={paneId}
                workspaceId={workspaceId}
                onNotification={tabNotificationHandlers[activeTab.id]}
                hasNotification={activeTab.hasNotification}
              />
            </div>
          )}
        </div>
      </div>
    </ErrorBoundary>
  );
}
