import React from 'react';
import useWorkspaceStore from '../state/workspace';
import { Tab } from '../state/types';
import { PanelDefinition } from '../state/types';

interface NotificationItemProps {
  tab: Tab;
  paneId: string;
  workspaceId: string;
  onClick: () => void;
  onClear: (e: React.MouseEvent) => void;
}

function NotificationItem({
  tab,
  onClick,
  onClear,
}: NotificationItemProps) {
  return (
    <div
      onClick={onClick}
      style={{
        padding: '12px',
        cursor: 'pointer',
        borderBottom: '1px solid #1e1e1e',
        backgroundColor: 'transparent',
        transition: 'background-color 0.15s ease',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.backgroundColor = '#2a2d2e';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.backgroundColor = 'transparent';
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: '8px',
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: '13px',
              fontWeight: 600,
              color: '#ffffff',
              marginBottom: '4px',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {tab.title}
          </div>
          <div
            style={{
              fontSize: '12px',
              color: '#4fc3f7',
              marginBottom: '4px',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
              lineHeight: '1.4',
            }}
          >
            {tab.notificationText || 'New notification'}
          </div>
          <div
            style={{
              fontSize: '11px',
              color: '#666666',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {tab.cwd}
          </div>
        </div>
        <button
          onClick={onClear}
          style={{
            background: 'none',
            border: 'none',
            color: '#cccccc',
            cursor: 'pointer',
            fontSize: '12px',
            padding: '4px 8px',
            borderRadius: '3px',
            flexShrink: 0,
            opacity: 0.7,
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = '#c75450';
            e.currentTarget.style.color = '#ffffff';
            e.currentTarget.style.opacity = '1';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = 'transparent';
            e.currentTarget.style.color = '#cccccc';
            e.currentTarget.style.opacity = '0.7';
          }}
          title="Clear notification"
        >
          Clear
        </button>
      </div>
    </div>
  );
}

interface NotificationTabInfo {
  tab: Tab;
  paneId: string;
  workspaceId: string;
}

function NotificationsPanelContent() {
  const workspaces = useWorkspaceStore((state) => state.workspaces);
  const activeWorkspaceId = useWorkspaceStore(
    (state) => state.activeWorkspaceId
  );
  const { setActiveWorkspace, setActivePane, setActiveTab, clearNotification } =
    useWorkspaceStore.getState();

  // Collect all tabs with notifications across all workspaces
  const getNotificationTabs = (): NotificationTabInfo[] => {
    const notificationTabs: NotificationTabInfo[] = [];
    for (const ws of workspaces) {
      for (const paneId of Object.keys(ws.panes)) {
        const pane = ws.panes[paneId];
        for (const tab of pane.tabs) {
          if (tab.hasNotification) {
            notificationTabs.push({
              tab,
              paneId,
              workspaceId: ws.id,
            });
          }
        }
      }
    }
    return notificationTabs;
  };

  const notificationTabs = getNotificationTabs();

  const handleItemClick = (
    tabId: string,
    paneId: string,
    workspaceId: string
  ) => {
    // Switch to the workspace containing the notification
    if (workspaceId !== activeWorkspaceId) {
      setActiveWorkspace(workspaceId);
    }
    // Activate the pane and tab
    setActivePane(paneId);
    setActiveTab(paneId, tabId);
  };

  const handleClear = (e: React.MouseEvent, tabId: string) => {
    e.stopPropagation();
    clearNotification(tabId);
  };

  const handleClearAll = () => {
    // Clear all notifications
    for (const { tab } of notificationTabs) {
      clearNotification(tab.id);
    }
  };

  const handleJumpToFirstUnread = () => {
    const firstUnread = notificationTabs[0];
    if (firstUnread) {
      handleItemClick(
        firstUnread.tab.id,
        firstUnread.paneId,
        firstUnread.workspaceId
      );
    }
  };

  return (
    <>
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 16px',
          borderBottom: '1px solid #1e1e1e',
          backgroundColor: '#2d2d30',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span
            style={{
              fontSize: '13px',
              fontWeight: 600,
              color: '#ffffff',
            }}
          >
            Notifications
          </span>
          {notificationTabs.length > 0 && (
            <span
              style={{
                fontSize: '11px',
                color: '#4fc3f7',
                backgroundColor: 'rgba(79, 195, 247, 0.1)',
                padding: '2px 8px',
                borderRadius: '10px',
              }}
            >
              {notificationTabs.length}
            </span>
          )}
        </div>
        {notificationTabs.length > 0 && (
          <button
            onClick={handleJumpToFirstUnread}
            style={{
              background: 'none',
              border: 'none',
              color: '#4fc3f7',
              cursor: 'pointer',
              fontSize: '12px',
              padding: '4px 8px',
              borderRadius: '3px',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = '#3c3c3c';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'transparent';
            }}
            title="Jump to first unread (⌘⇧U)"
          >
            Jump to Unread
          </button>
        )}
      </div>

      {/* Notification List */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          overflowX: 'hidden',
        }}
      >
        {notificationTabs.length === 0 ? (
          <div
            style={{
              padding: '40px 20px',
              textAlign: 'center',
              color: '#666666',
              fontSize: '13px',
            }}
          >
            No notifications
          </div>
        ) : (
          notificationTabs.map(({ tab, paneId, workspaceId }) => (
            <NotificationItem
              key={tab.id}
              tab={tab}
              paneId={paneId}
              workspaceId={workspaceId}
              onClick={() => handleItemClick(tab.id, paneId, workspaceId)}
              onClear={(e) => handleClear(e, tab.id)}
            />
          ))
        )}
      </div>

      {/* Footer with Clear All */}
      {notificationTabs.length > 0 && (
        <div
          style={{
            padding: '12px 16px',
            borderTop: '1px solid #1e1e1e',
            backgroundColor: '#2d2d30',
          }}
        >
          <button
            onClick={handleClearAll}
            style={{
              width: '100%',
              backgroundColor: '#37373d',
              border: '1px solid #1e1e1e',
              color: '#cccccc',
              cursor: 'pointer',
              fontSize: '12px',
              padding: '8px 12px',
              borderRadius: '3px',
              transition: 'background-color 0.15s ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = '#3c3c3c';
              e.currentTarget.style.color = '#ffffff';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = '#37373d';
              e.currentTarget.style.color = '#cccccc';
            }}
          >
            Clear All
          </button>
        </div>
      )}
    </>
  );
}

export const notificationsPanelDefinition: PanelDefinition = {
  id: 'notifications',
  title: 'Notifications',
  icon: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  ),
  badge: () => {
    const getTotalNotificationCount = () => {
      const store = useWorkspaceStore.getState();
      let count = 0;
      for (const ws of store.workspaces) {
        for (const paneId of Object.keys(ws.panes)) {
          const pane = ws.panes[paneId];
          for (const tab of pane.tabs) {
            if (tab.hasNotification) {
              count++;
            }
          }
        }
      }
      return count;
    };

    const count = getTotalNotificationCount();
    return count > 0 ? { count } : null;
  },
  fullRender: () => <NotificationsPanelContent />,
};

export default notificationsPanelDefinition;
