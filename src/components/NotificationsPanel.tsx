import React, { useMemo, useCallback } from 'react';
import useWorkspaceStore from '../state/workspace';
import { Tab } from '../state/types';
import { PanelDefinition } from '../state/types';
import { Button } from './ui/Button';
import { Tooltip } from './ui/Tooltip';
import './NotificationsPanel.css';

interface NotificationItemProps {
  tab: Tab;
  paneId: string;
  workspaceId: string;
  onClick: () => void;
  onClear: (e: React.MouseEvent) => void;
}

const NotificationItem = React.memo(function NotificationItem({
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
        borderBottom: '1px solid var(--border-hex)',
        backgroundColor: 'transparent',
        transition: 'background-color 0.15s ease',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.backgroundColor = 'var(--background-hover)';
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
            color: 'var(--foreground-active)',
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
            color: 'var(--notification)',
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
            color: 'var(--foreground-muted)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {tab.cwd}
        </div>
      </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={onClear}
          type="button"
          style={{ color: 'var(--destructive)' }}
          className="hover:text-white hover:bg-[var(--destructive)]"
        >
          Clear
        </Button>
      </div>
    </div>
  );
});

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
  const notificationTabs = useMemo((): NotificationTabInfo[] => {
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
  }, [workspaces]);

  const handleItemClick = useCallback((
    tabId: string,
    paneId: string,
    workspaceId: string
  ) => {
    // Switch to workspace containing notification
    if (workspaceId !== activeWorkspaceId) {
      setActiveWorkspace(workspaceId);
    }
    // Activate pane and tab
    setActivePane(paneId);
    setActiveTab(paneId, tabId);
  }, [activeWorkspaceId, setActiveWorkspace, setActivePane, setActiveTab]);

  const handleClear = useCallback((e: React.MouseEvent, tabId: string) => {
    e.stopPropagation();
    clearNotification(tabId);
  }, [clearNotification]);

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
        borderBottom: '1px solid var(--border-hex)',
        backgroundColor: 'var(--background-tertiary)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <span
          style={{
            fontSize: '13px',
            fontWeight: 600,
            color: 'var(--foreground-active)',
          }}
        >
          Notifications
        </span>
        {notificationTabs.length > 0 && (
          <span
            style={{
              fontSize: '11px',
              color: 'var(--notification)',
              backgroundColor: 'hsl(var(--primary) / 0.1)',
              padding: '2px 8px',
              borderRadius: '10px',
            }}
          >
            {notificationTabs.length}
          </span>
        )}
      </div>
        {notificationTabs.length > 0 && (
          <Tooltip content="Jump to first unread (⌘⇧U)">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleJumpToFirstUnread}
              type="button"
              style={{ color: 'var(--primary)' }}
            >
              Jump to Unread
            </Button>
          </Tooltip>
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
          color: 'var(--foreground-muted)',
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
          borderTop: '1px solid var(--border-hex)',
          backgroundColor: 'var(--background-tertiary)',
        }}
      >
          <Button
            variant="secondary"
            size="sm"
            onClick={handleClearAll}
            type="button"
            style={{ width: '100%' }}
          >
            Clear All
          </Button>
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
export { NotificationsPanelContent };
