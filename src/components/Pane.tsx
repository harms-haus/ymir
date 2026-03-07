import useWorkspaceStore from '../state/workspace';
import { Terminal } from './Terminal';
import { TabBar } from './TabBar';

interface PaneProps {
  paneId: string;
  workspaceId: string;
}

export function Pane({ paneId, workspaceId }: PaneProps) {
  const workspace = useWorkspaceStore((state) =>
    state.workspaces.find((ws) => ws.id === workspaceId)
  );

  const pane = workspace?.panes[paneId];

  if (!workspace || !pane) {
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

  const activeTab = pane.activeTabId
    ? pane.tabs.find((t) => t.id === pane.activeTabId)
    : null;

  const handleCreateTab = () => {
    useWorkspaceStore.getState().createTab(paneId);
  };

  const handleCloseTab = (_paneId: string, tabId: string) => {
    useWorkspaceStore.getState().closeTab(_paneId, tabId);
  };

  const handleSelectTab = (_paneId: string, tabId: string) => {
    useWorkspaceStore.getState().setActiveTab(_paneId, tabId);
  };

  return (
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
      />

      {/* Terminal content area */}
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          borderTop: '1px solid #333',
        }}
      >
        {activeTab ? (
          <Terminal
            sessionId={activeTab.sessionId}
            onNotification={(message) => {
              // Notification handling is managed by the workspace store
              // This callback allows Terminal to trigger notifications
              const { markNotification } = useWorkspaceStore.getState();
              markNotification(activeTab.id, message);
            }}
            hasNotification={activeTab.hasNotification}
          />
        ) : (
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
            No tabs
          </div>
        )}
      </div>
    </div>
  );
}
