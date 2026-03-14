import React, { useMemo, useState, useCallback, useEffect } from 'react';
import { PanelDefinition, SidebarTab } from '../state/types';
import { useWorkspaces } from '../hooks/useWorkspaces';
import {
  type ConnectionStatus,
  getWebSocketService,
} from '../services/websocket';
import { TabHeaderPanel } from './TabHeaderPanel';
import { gitPanelDefinition } from './GitPanel';
import { TabsRoot, TabsList, TabsTab } from './ui/Tabs';
import { Button } from './ui/Button';
import { MenuRoot, MenuPortal, MenuPositioner, MenuPopup, MenuItem } from './ui/Menu';
import { Tooltip } from './ui/Tooltip';
import {
  useRuntimeSelection,
  setActivePaneSelection,
  setActiveTabSelection,
  setActiveWorkspaceSelection,
} from '../lib/runtime-selection';
import {
  getTotalNotificationCount,
  getWorkspaceNotificationCount,
  useRuntimeNotifications,
} from '../lib/runtime-notifications';
import {
  setRuntimeSidebarTab,
  toggleRuntimeSidebar,
  useRuntimeUiState,
} from '../lib/runtime-ui-state';

interface WorkspaceListProps {
  collapsed: boolean;
}

interface CreateWorkspaceOutput {
  workspace?: {
    id: string;
  };
}

function getErrorMessage(error: unknown): string {
  if (!error || typeof error !== 'object') {
    return String(error);
  }

  const errorCandidate = error as { message?: unknown };
  if (typeof errorCandidate.message === 'string' && errorCandidate.message.length > 0) {
    return errorCandidate.message;
  }

  try {
    return JSON.stringify(error);
  } catch {
    return 'Workspace action failed';
  }
}

function WorkspaceList({ collapsed }: WorkspaceListProps) {
  const { workspaces, isLoading, error, refetch } = useWorkspaces();
  useRuntimeNotifications((snapshot) => snapshot);
  const websocketService = useMemo(() => getWebSocketService(), []);
  const [contextMenuOpen, setContextMenuOpen] = useState(false);
  const [contextMenuPosition, setContextMenuPosition] = useState<{ x: number; y: number } | null>(null);
  const [contextMenuAnchor, setContextMenuAnchor] = useState<{ workspaceId: string } | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const selectedWorkspaceId = useRuntimeSelection((state) => state.activeWorkspaceId);
  const visibleWorkspaces = useMemo(() => workspaces.slice(0, 8), [workspaces]);
  const activeWorkspaceId =
    selectedWorkspaceId && visibleWorkspaces.some((workspace) => workspace.id === selectedWorkspaceId)
      ? selectedWorkspaceId
      : (visibleWorkspaces[0]?.id ?? null);

  const switchWorkspace = useCallback((workspaceId: string) => {
    setActiveWorkspaceSelection(workspaceId);
    setActivePaneSelection(null);
    setActiveTabSelection(null);
  }, []);

  const handleCreateWorkspace = useCallback(async () => {
    if (workspaces.length >= 8) {
      return;
    }

    setActionError(null);
    try {
      const result = await websocketService.request<CreateWorkspaceOutput>('workspace.create', {
        name: `Workspace ${workspaces.length + 1}`,
      });
      if (result.workspace?.id) {
        switchWorkspace(result.workspace.id);
      }
      await refetch();
    } catch (requestError) {
      setActionError(getErrorMessage(requestError));
    }
  }, [refetch, switchWorkspace, websocketService, workspaces.length]);

  const handleContextMenu = useCallback((e: React.MouseEvent, workspaceId: string) => {
    e.preventDefault();
    setContextMenuPosition({ x: e.clientX, y: e.clientY });
    setContextMenuAnchor({ workspaceId });
    setContextMenuOpen(true);
  }, []);

  const handleRenameWorkspace = useCallback(async () => {
    if (!contextMenuAnchor) {
      return;
    }

    const targetWorkspace = workspaces.find((workspace) => workspace.id === contextMenuAnchor.workspaceId);
    if (!targetWorkspace) {
      setContextMenuOpen(false);
      return;
    }

    const nextName = window.prompt('Rename workspace', targetWorkspace.name)?.trim();
    if (!nextName || nextName === targetWorkspace.name) {
      setContextMenuOpen(false);
      return;
    }

    setActionError(null);
    try {
      await websocketService.request('workspace.rename', {
        id: targetWorkspace.id,
        name: nextName,
      });
      await refetch();
    } catch (requestError) {
      setActionError(getErrorMessage(requestError));
    } finally {
      setContextMenuOpen(false);
    }
  }, [contextMenuAnchor, refetch, websocketService, workspaces]);

  const handleDeleteWorkspace = useCallback(async () => {
    if (!contextMenuAnchor || workspaces.length <= 1) {
      return;
    }

    const targetWorkspace = workspaces.find((workspace) => workspace.id === contextMenuAnchor.workspaceId);
    if (!targetWorkspace) {
      setContextMenuOpen(false);
      return;
    }

    const shouldDelete = window.confirm(`Delete workspace "${targetWorkspace.name}"?`);
    if (!shouldDelete) {
      setContextMenuOpen(false);
      return;
    }

    setActionError(null);

    try {
      await websocketService.request('workspace.delete', { id: targetWorkspace.id });
      if (targetWorkspace.id === activeWorkspaceId) {
        const fallbackWorkspace = visibleWorkspaces.find((workspace) => workspace.id !== targetWorkspace.id);
        if (fallbackWorkspace) {
          switchWorkspace(fallbackWorkspace.id);
        }
      }
      await refetch();
    } catch (requestError) {
      setActionError(getErrorMessage(requestError));
    } finally {
      setContextMenuOpen(false);
    }
  }, [activeWorkspaceId, contextMenuAnchor, refetch, switchWorkspace, visibleWorkspaces, websocketService, workspaces]);

  const isOnly = workspaces.length <= 1;

  return (
    <TabsRoot
      value={activeWorkspaceId ?? ''}
      onValueChange={(value) => switchWorkspace(value as string)}
      className="workspace-tabs-root"
    >
      <TabsList className="workspace-tabs-list">
        {isLoading ? (
          <div className="workspace-empty-state">Loading workspaces...</div>
        ) : visibleWorkspaces.length === 0 ? (
          <div className="workspace-empty-state">No workspaces</div>
        ) : (
          visibleWorkspaces.map((workspace, index) => {
            const hasNotification = getWorkspaceNotificationCount(workspace.id) > 0;
            return (
              <TabsTab
                key={workspace.id}
                value={workspace.id}
                className={`workspace-tab ${hasNotification ? 'has-notification' : ''}`}
                onContextMenu={(e) => handleContextMenu(e, workspace.id)}
              >
                <div className="workspace-tab-content">
                  <span className="workspace-number-badge">{index + 1}</span>
                  <span className="workspace-name">{workspace.name}</span>
                </div>
                <div className="workspace-tab-right">
                  {hasNotification && <span className="workspace-notification-dot" />}
                  <span className="workspace-shortcut">{String.fromCharCode(8984)}{index + 1}</span>
                </div>
              </TabsTab>
            );
          })
        )}
      </TabsList>

      {(error || actionError) && (
        <div className="workspace-empty-state" style={{ color: 'var(--status-deleted)' }}>
          {actionError ?? error}
        </div>
      )}

      {!collapsed && (
        <div className="workspace-new-button-container">
          <Tooltip content={workspaces.length >= 8 ? 'Maximum 8 workspaces' : 'New workspace'}>
            <Button
              variant="ghost"
              onClick={() => {
                void handleCreateWorkspace();
              }}
              disabled={workspaces.length >= 8}
              className="new-workspace-button"
            >
              <span className="new-workspace-icon">+</span>
              <span>New</span>
            </Button>
          </Tooltip>
        </div>
      )}

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
              <MenuItem
                className="context-menu-item"
                onClick={() => {
                  void handleCreateWorkspace();
                  setContextMenuOpen(false);
                }}
              >
                New Workspace
              </MenuItem>
              <MenuItem className="context-menu-item" onClick={() => void handleRenameWorkspace()}>
                Rename Workspace
              </MenuItem>
              <div className="context-menu-separator" />
              <MenuItem
                className={`context-menu-item context-menu-item-danger ${isOnly ? 'disabled' : ''}`}
                onClick={() => void handleDeleteWorkspace()}
                disabled={isOnly}
              >
                Delete Workspace
              </MenuItem>
            </MenuPopup>
          </MenuPositioner>
        </MenuPortal>
      </MenuRoot>
    </TabsRoot>
  );
}

function CollapsedWorkspaceList() {
  const { workspaces, isLoading } = useWorkspaces();
  useRuntimeNotifications((snapshot) => snapshot);
  const visibleWorkspaces = useMemo(() => workspaces.slice(0, 8), [workspaces]);
  const selectedWorkspaceId = useRuntimeSelection((state) => state.activeWorkspaceId);
  const activeWorkspaceId =
    selectedWorkspaceId && visibleWorkspaces.some((workspace) => workspace.id === selectedWorkspaceId)
      ? selectedWorkspaceId
      : (visibleWorkspaces[0]?.id ?? null);

  return (
    <TabsRoot
      value={activeWorkspaceId ?? ''}
      onValueChange={(value) => setActiveWorkspaceSelection(value as string)}
      className="workspace-tabs-collapsed"
    >
      <TabsList className="workspace-tabs-collapsed-list">
        {isLoading && <div className="workspace-empty-state">...</div>}
        {visibleWorkspaces.map((workspace, index) => (
          <Tooltip
            key={workspace.id}
            content={`${workspace.name} (${String.fromCharCode(8984)}${index + 1})`}
          >
            <TabsTab value={workspace.id} className="workspace-tab-collapsed">
              {index + 1}
              {getWorkspaceNotificationCount(workspace.id) > 0 && (
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
      <title>Workspaces</title>
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
      <title>Notifications</title>
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
      <title>Project</title>
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
    </svg>
  );
});

export function WorkspaceSidebar() {
  useRuntimeNotifications((snapshot) => snapshot);
  const sidebarCollapsed = useRuntimeUiState((state) => state.sidebarCollapsed);
  const activeTab = useRuntimeUiState((state) => state.activeSidebarTab);

  const websocketService = useMemo(() => getWebSocketService(), []);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>(
    () => websocketService.getStatus()
  );

  useEffect(() => {
    return websocketService.onConnectionChange((nextStatus) => {
      setConnectionStatus(nextStatus);
    });
  }, [websocketService]);

  const connectionIndicator = useMemo(() => {
    const stateLabels: Record<ConnectionStatus['state'], string> = {
      connected: 'Connected',
      connecting: 'Connecting',
      reconnecting: 'Reconnecting',
      disconnecting: 'Disconnecting',
      disconnected: 'Offline',
    };

    const stateColors: Record<ConnectionStatus['state'], string> = {
      connected: 'var(--status-added)',
      connecting: 'var(--status-modified)',
      reconnecting: 'var(--status-modified)',
      disconnecting: 'var(--foreground-secondary)',
      disconnected: 'var(--status-deleted)',
    };

    return {
      label: stateLabels[connectionStatus.state],
      color: stateColors[connectionStatus.state],
    };
  }, [connectionStatus.state]);

  const panels: PanelDefinition[] = useMemo(
    () => [
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
    ],
    [],
  );

  const handleTabClick = useCallback((tab: SidebarTab | string) => {
    setRuntimeSidebarTab(tab);
  }, []);

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
        onToggleSidebar={toggleRuntimeSidebar}
      />
      <div
        title={connectionStatus.error ?? connectionIndicator.label}
        style={{
          marginTop: 'auto',
          padding: '16px 0',
          display: 'flex',
          justifyContent: 'center',
        }}
      >
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            padding: '4px 8px',
            borderRadius: '999px',
            fontSize: '10px',
            letterSpacing: '0.04em',
            textTransform: 'uppercase',
            backgroundColor: 'rgba(0, 0, 0, 0.28)',
            border: '1px solid var(--border-secondary)',
            color: 'var(--foreground-hex)',
            pointerEvents: 'none',
          }}
        >
          <span
            style={{
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              backgroundColor: connectionIndicator.color,
              boxShadow: `0 0 0 1px ${connectionIndicator.color}55`,
            }}
          />
          <span>{connectionIndicator.label}</span>
        </div>
      </div>
    </div>
  );
}

export default WorkspaceSidebar;
