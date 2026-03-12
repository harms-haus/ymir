import React, { useEffect, useMemo, useState, useCallback } from 'react';
import useWorkspaceStore, {
  getTotalNotificationCount,
} from '../state/workspace';
import { PanelDefinition, SidebarTab } from '../state/types';
import { TabHeaderPanel } from './TabHeaderPanel';
import { gitPanelDefinition } from './GitPanel';
import { TabsRoot, TabsList, TabsTab } from './ui/Tabs';
import { Button } from './ui/Button';
import { MenuRoot, MenuPortal, MenuPositioner, MenuPopup, MenuItem } from './ui/Menu';
import { Tooltip } from './ui/Tooltip';

// ============================================================================
// Panel Content Components
// ============================================================================

interface WorkspaceListProps {
  collapsed: boolean;
}

function WorkspaceList({ collapsed }: WorkspaceListProps) {
  const {
    workspaces,
    activeWorkspaceId,
    setActiveWorkspace,
    createWorkspace,
    createWorkspaceAfter,
    moveWorkspaceUp,
    moveWorkspaceDown,
    closeWorkspace,
  } = useWorkspaceStore();

  const visibleWorkspaces = useMemo(() => workspaces.slice(0, 8), [workspaces]);

  const [contextMenuOpen, setContextMenuOpen] = useState(false);
  const [contextMenuPosition, setContextMenuPosition] = useState<{ x: number; y: number } | null>(null);
  const [contextMenuAnchor, setContextMenuAnchor] = useState<{ workspaceId: string; index: number } | null>(null);

  const handleCreateWorkspace = () => {
    const nextNumber = workspaces.length + 1;
    createWorkspace(`Workspace ${nextNumber}`);
  };

  const handleContextMenu = (e: React.MouseEvent, workspaceId: string, index: number) => {
    e.preventDefault();
    setContextMenuPosition({ x: e.clientX, y: e.clientY });
    setContextMenuAnchor({ workspaceId, index });
    setContextMenuOpen(true);
  };

  const handleNewWorkspaceBelow = () => {
    if (contextMenuAnchor) {
      const nextNumber = workspaces.length + 1;
      createWorkspaceAfter(contextMenuAnchor.workspaceId, `Workspace ${nextNumber}`);
      setContextMenuOpen(false);
    }
  };

  const handleMoveUp = () => {
    if (contextMenuAnchor && contextMenuAnchor.index > 0) {
      moveWorkspaceUp(contextMenuAnchor.workspaceId);
      setContextMenuOpen(false);
    }
  };

  const handleMoveDown = () => {
    if (contextMenuAnchor && contextMenuAnchor.index < workspaces.length - 1) {
      moveWorkspaceDown(contextMenuAnchor.workspaceId);
      setContextMenuOpen(false);
    }
  };

  const handleCloseWorkspace = () => {
    if (contextMenuAnchor && workspaces.length > 1) {
      closeWorkspace(contextMenuAnchor.workspaceId);
      setContextMenuOpen(false);
    }
  };

  const isFirst = contextMenuAnchor ? contextMenuAnchor.index === 0 : false;
  const isLast = contextMenuAnchor ? contextMenuAnchor.index === workspaces.length - 1 : false;
  const isOnly = workspaces.length === 1;

  return (
    <TabsRoot
      value={activeWorkspaceId}
      onValueChange={(value) => setActiveWorkspace(value as string)}
      className="workspace-tabs-root"
    >
      <TabsList className="workspace-tabs-list">
        {visibleWorkspaces.length === 0 ? (
          <div className="workspace-empty-state">
            No workspaces
          </div>
        ) : (
          visibleWorkspaces.map((workspace, index) => (
            <TabsTab
              key={workspace.id}
              value={workspace.id}
              className={`workspace-tab ${
                workspace.hasNotification ? 'has-notification' : ''
              }`}
              onContextMenu={(e) => handleContextMenu(e, workspace.id, index)}
            >
              <div className="workspace-tab-content">
                <span className="workspace-number-badge">
                  {index + 1}
                </span>
                <span className="workspace-name">
                  {workspace.name}
                </span>
              </div>
              <div className="workspace-tab-right">
                {workspace.hasNotification && (
                  <span className="workspace-notification-dot" />
                )}
                <span className="workspace-shortcut">
                  {String.fromCharCode(8984)}{index + 1}
                </span>
              </div>
            </TabsTab>
          ))
        )}
      </TabsList>

      {!collapsed && (
        <div className="workspace-new-button-container">
          <Tooltip content={workspaces.length >= 8 ? 'Maximum 8 workspaces' : 'New workspace'}>
            <Button
              variant="ghost"
              onClick={handleCreateWorkspace}
              disabled={workspaces.length >= 8}
              className="new-workspace-button"
            >
              <span className="new-workspace-icon">+</span>
              <span>New</span>
            </Button>
          </Tooltip>
        </div>
      )}

      {/* Context Menu using Base-UI Menu primitive */}
      <MenuRoot open={contextMenuOpen} onOpenChange={setContextMenuOpen}>
        <MenuPortal>
          <MenuPositioner
            anchor={
              contextMenuPosition
                ? {
                    getBoundingClientRect: () => ({
                      x: contextMenuPosition.x,
                      y: contextMenuPosition.y,
                      width: 0,
                      height: 0,
                      top: contextMenuPosition.y,
                      left: contextMenuPosition.x,
                      right: contextMenuPosition.x,
                      bottom: contextMenuPosition.y,
                      toJSON: () => '',
                    }),
                  }
                : null
            }
            align="start"
            sideOffset={0}
          >
            <MenuPopup className="context-menu">
              <MenuItem className="context-menu-item" onClick={handleNewWorkspaceBelow}>
                New Workspace Below
              </MenuItem>
              <MenuItem
                className={`context-menu-item ${isFirst ? 'disabled' : ''}`}
                onClick={handleMoveUp}
                disabled={isFirst}
              >
                Move Up
              </MenuItem>
              <MenuItem
                className={`context-menu-item ${isLast ? 'disabled' : ''}`}
                onClick={handleMoveDown}
                disabled={isLast}
              >
                Move Down
              </MenuItem>
              <div className="context-menu-separator" />
              <MenuItem
                className={`context-menu-item context-menu-item-danger ${isOnly ? 'disabled' : ''}`}
                onClick={handleCloseWorkspace}
                disabled={isOnly}
              >
                Close Workspace
              </MenuItem>
            </MenuPopup>
          </MenuPositioner>
        </MenuPortal>
      </MenuRoot>
    </TabsRoot>
  );
}

function CollapsedWorkspaceList() {
  const { workspaces, activeWorkspaceId, setActiveWorkspace } = useWorkspaceStore();
  const visibleWorkspaces = useMemo(() => workspaces.slice(0, 8), [workspaces]);

  return (
    <TabsRoot
      value={activeWorkspaceId}
      onValueChange={(value) => setActiveWorkspace(value as string)}
      className="workspace-tabs-collapsed"
    >
      <TabsList className="workspace-tabs-collapsed-list">
        {visibleWorkspaces.map((workspace, index) => (
          <Tooltip
            key={workspace.id}
            content={`${workspace.name} (${String.fromCharCode(8984)}${index + 1})`}
          >
            <TabsTab
              value={workspace.id}
              className="workspace-tab-collapsed"
            >
              {index + 1}
              {workspace.hasNotification && (
                <span className="workspace-notification-dot" />
              )}
            </TabsTab>
          </Tooltip>
        ))}
      </TabsList>
    </TabsRoot>
  );
}

function NotificationList() {
  const notificationCount = getTotalNotificationCount();

  return (
    <div
      style={{
        padding: '16px',
        color: 'var(--foreground-hex)',
        fontSize: '13px',
      }}
    >
      <div
        style={{
          marginBottom: '12px',
          fontWeight: 600,
          borderBottom: '1px solid var(--border-tertiary)',
          paddingBottom: '8px',
        }}
      >
        Notifications ({notificationCount})
      </div>
      {notificationCount === 0 ? (
        <div style={{ color: 'var(--foreground-muted)', textAlign: 'center', padding: '20px 0' }}>
          No notifications
        </div>
      ) : (
        <div style={{ color: 'var(--foreground-secondary)' }}>
          Notification items will be displayed here
        </div>
      )}
    </div>
  );
}

function ProjectTree() {
  return (
    <div
      style={{
        padding: '16px',
        color: 'var(--foreground-hex)',
        fontSize: '13px',
      }}
    >
      <div
        style={{
          marginBottom: '12px',
          fontWeight: 600,
          borderBottom: '1px solid var(--border-tertiary)',
          paddingBottom: '8px',
        }}
      >
        Project
      </div>
      <div style={{ color: 'var(--foreground-secondary)' }}>
        <div style={{ marginBottom: '4px' }}>📁 src/</div>
        <div style={{ marginLeft: '16px', marginBottom: '4px' }}>📁 components/</div>
        <div style={{ marginLeft: '16px', marginBottom: '4px' }}>📁 state/</div>
        <div style={{ marginBottom: '4px' }}>📄 package.json</div>
        <div style={{ marginBottom: '4px' }}>📄 README.md</div>
      </div>
    </div>
  );
}

// ============================================================================
// Icon Components
// ============================================================================

const WorkspacesIcon = React.memo(function WorkspacesIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="3" y="3" width="7" height="7" />
      <rect x="14" y="3" width="7" height="7" />
      <rect x="14" y="14" width="7" height="7" />
      <rect x="3" y="14" width="7" height="7" />
    </svg>
  );
});

const BellIcon = React.memo(function BellIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
      <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
    </svg>
  );
});

const FolderIcon = React.memo(function FolderIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
    </svg>
  );
});

// ============================================================================
// WorkspaceSidebar Component
// ============================================================================

export function WorkspaceSidebar() {
  const {
    sidebarCollapsed,
    toggleSidebar,
    activeTab,
    setActiveSidebarTab,
    registerPanel,
  } = useWorkspaceStore();

  const panels: PanelDefinition[] = useMemo(() => {
    const staticPanels: PanelDefinition[] = [
      {
        id: 'workspaces' as SidebarTab,
        title: 'Workspaces',
        icon: () => <WorkspacesIcon />,
        badge: () => null,
        fullRender: () => <WorkspaceList collapsed={false} />,
        collapsedRender: () => <CollapsedWorkspaceList />,
      },
      {
        id: 'notifications' as SidebarTab,
        title: 'Notifications',
        icon: () => <BellIcon />,
        badge: () => {
          const count = getTotalNotificationCount();
          return count > 0 ? { count } : null;
        },
        fullRender: () => <NotificationList />,
      },
      gitPanelDefinition as PanelDefinition,
      {
        id: 'project' as SidebarTab,
        title: 'Project',
        icon: () => <FolderIcon />,
        badge: () => null,
        fullRender: () => <ProjectTree />,
      },
    ];

    return staticPanels;
  }, []);

  useEffect(() => {
    panels.forEach((panel) => {
      registerPanel(panel);
    });
  }, [panels, registerPanel]);

  const handleTabClick = (tab: SidebarTab | string) => {
    setActiveSidebarTab(tab);
  };

  return (
    <div
      style={{
        width: sidebarCollapsed ? '50px' : '100%',
        height: '100%',
        backgroundColor: 'var(--background-hex)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      <TabHeaderPanel
        panels={panels}
        activeTab={activeTab}
        isCollapsed={sidebarCollapsed}
        onTabClick={handleTabClick}
        onToggleSidebar={toggleSidebar}
      />
    </div>
  );
}

export default WorkspaceSidebar;
