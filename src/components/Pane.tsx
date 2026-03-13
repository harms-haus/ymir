import { useCallback, useMemo } from 'react';
import { useWorkspaceState, workspaceStateStore } from '../state/workspace-state';
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
  const pane = useWorkspaceState((state) => {
    const workspace = state.workspaces.find((ws) => ws.id === workspaceId);
    return workspace?.panes[paneId] || null;
  });

  if (!pane) {
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
        Pane not found
      </div>
    );
  }

  const handleCreateTab = useCallback(() => {
    workspaceStateStore.getState().createTab(paneId);
  }, [paneId]);

  const handleCloseTab = useCallback(
    (_paneId: string, tabId: string) => {
      workspaceStateStore.getState().closeTab(_paneId, tabId);
    },
    []
  );

  const handleSelectTab = useCallback(
    (_paneId: string, tabId: string) => {
      workspaceStateStore.getState().setActiveTab(_paneId, tabId);
    },
    []
  );

  // Convert UI direction to store direction
  const handleSplitPane = useCallback(
    (_paneId: string, direction: 'horizontal' | 'vertical') => {
      // 'horizontal' split creates panes side by side -> 'right'
      // 'vertical' split creates panes stacked -> 'down'
      const storeDirection = direction === 'horizontal' ? 'right' : 'down';
      workspaceStateStore.getState().splitPane(_paneId, storeDirection);
    },
    []
  );

  const tabNotificationHandlers = useMemo(() => {
    const handlers: Record<string, (message: string) => void> = {};
    pane.tabs.forEach((tab) => {
      handlers[tab.id] = (message: string) => {
        const { markNotification } = workspaceStateStore.getState();
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
          backgroundColor: 'var(--background-hex)',
          boxShadow: pane.hasNotification ? 'inset 0 0 0 2px var(--notification)' : 'none',
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
          windowControlsPosition={windowControlsPosition}
          isTopmost={isTopmost}
        />

      {/* Tab content area */}
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          borderTop: '1px solid var(--border-tertiary)',
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
              <Terminal
                sessionId={tab.sessionId}
                tabId={tab.id}
                paneId={paneId}
                onNotification={tabNotificationHandlers[tab.id]}
                hasNotification={tab.hasNotification}
              />
            </div>
          ))}
        </div>
      </div>
    </ErrorBoundary>
  );
}
