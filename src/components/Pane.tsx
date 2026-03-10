import { useCallback, useMemo } from 'react';
import useWorkspaceStore from '../state/workspace';
import { Terminal } from './Terminal';
import { Browser } from './Browser';
import { TabBar } from './TabBar';
import { ErrorBoundary } from './ErrorBoundary';

interface PaneProps {
  paneId: string;
  workspaceId: string;
}

export function Pane({ paneId, workspaceId }: PaneProps) {
  // Select only the specific pane to prevent re-renders when other parts of the store change
  // The selector creates a new object each time, but that's okay - React's diffing will handle it
  // The key is we don't subscribe to ALL store changes, just this workspace's pane
  const pane = useWorkspaceStore((state) => {
    const workspace = state.workspaces.find((ws) => ws.id === workspaceId);
    const pane = workspace?.panes[paneId];
    if (!pane) return null;
    // Return only the data we need - this prevents re-renders from unrelated store changes
    return {
      id: pane.id,
      activeTabId: pane.activeTabId,
      tabs: pane.tabs,
      hasNotification: pane.hasNotification,
    };
  });

  if (!pane) {
    return (
      <div
        style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#1e1e1e',
          color: '#666666',
          fontSize: '14px',
        }}
      >
        Pane not found
      </div>
    );
  }

  const handleCreateTab = useCallback(() => {
    useWorkspaceStore.getState().createTab(paneId);
  }, [paneId]);

  const handleCloseTab = useCallback(
    (_paneId: string, tabId: string) => {
      useWorkspaceStore.getState().closeTab(_paneId, tabId);
    },
    []
  );

  const handleSelectTab = useCallback(
    (_paneId: string, tabId: string) => {
      useWorkspaceStore.getState().setActiveTab(_paneId, tabId);
    },
    []
  );

  // Convert UI direction to store direction
  const handleSplitPane = useCallback(
    (_paneId: string, direction: 'horizontal' | 'vertical') => {
      // 'horizontal' split creates panes side by side -> 'right'
      // 'vertical' split creates panes stacked -> 'down'
      const storeDirection = direction === 'horizontal' ? 'right' : 'down';
      useWorkspaceStore.getState().splitPane(_paneId, storeDirection);
    },
    []
  );

  const tabNotificationHandlers = useMemo(() => {
    const handlers: Record<string, (message: string) => void> = {};
    pane.tabs.forEach((tab) => {
      handlers[tab.id] = (message: string) => {
        const { markNotification } = useWorkspaceStore.getState();
        markNotification(tab.id, message);
      };
    });
    return handlers;
  }, [pane.tabs]);

  return (
    <ErrorBoundary>
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          backgroundColor: '#1e1e1e',
          boxShadow: pane.hasNotification ? 'inset 0 0 0 2px #4fc3f7' : 'none',
          transition: 'box-shadow 0.2s ease',
        }}
      >
        {/* TabBar at top */}
        <TabBar
          paneId={paneId}
          tabs={pane.tabs}
          activeTabId={pane.activeTabId}
          onCreateTab={handleCreateTab}
          onCloseTab={handleCloseTab}
          onSelectTab={handleSelectTab}
          onSplitPane={handleSplitPane}
        />

        {/* Tab content area */}
        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            borderTop: '1px solid #333',
          }}
        >
          {pane.tabs.map((tab) => (
            <div
              key={tab.id}
              style={{
                display: tab.id === pane.activeTabId ? 'flex' : 'none',
                flex: 1,
                width: '100%',
                height: '100%',
              }}
            >
              {tab.type === 'browser' ? (
                <Browser
                  tabId={tab.id}
                  url={tab.url || 'about:blank'}
                  paneId={paneId}
                />
              ) : (
                <Terminal
                  sessionId={tab.sessionId}
                  tabId={tab.id}
                  paneId={paneId}
                  onNotification={tabNotificationHandlers[tab.id]}
                  hasNotification={tab.hasNotification}
                />
              )}
            </div>
          ))}
        </div>
      </div>
    </ErrorBoundary>
  );
}
