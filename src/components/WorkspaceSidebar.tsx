import React, { useEffect, useMemo, useState, useCallback } from 'react';
import useWorkspaceStore, {
  getTotalNotificationCount,
  type WorkspaceWithPanes,
} from '../state/workspace';
import { PanelDefinition, SidebarTab } from '../state/types';
import { useWorkspaces } from '../hooks/useWorkspaces';
import { getWebSocketService } from '../services/websocket';
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

interface CreateWorkspaceOutput {
  workspace?: {
    id: string;
  };
}

function createFallbackWorkspace(workspaceId: string, workspaceName: string, hasNotification: boolean): WorkspaceWithPanes {
  const paneId = `pane-${workspaceId}`;
  const tabId = `tab-${workspaceId}`;

  return {
    id: workspaceId,
    name: workspaceName,
    root: {
      type: 'leaf',
      paneId,
    },
    activePaneId: paneId,
    hasNotification,
    panes: {
      [paneId]: {
        id: paneId,
        flexRatio: 1,
        activeTabId: tabId,
        hasNotification: false,
        tabs: [
          {
            id: tabId,
            type: 'terminal',
            title: 'bash',
            cwd: '~',
            sessionId: '',
            hasNotification: false,
            notificationCount: 0,
            scrollback: [],
          },
        ],
      },
    },
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
  const activeWorkspaceId = useWorkspaceStore((state) => state.activeWorkspaceId);
  const setActiveWorkspace = useWorkspaceStore((state) => state.setActiveWorkspace);
  const storeWorkspaceSignature = useWorkspaceStore((state) =>
    state.workspaces
      .map((workspace) => `${workspace.id}:${workspace.name}:${workspace.hasNotification ? '1' : '0'}`)
      .join('|'),
  );
  const { workspaces, isLoading, error, refetch } = useWorkspaces();
  const websocketService = useMemo(() => getWebSocketService(), []);

  const visibleWorkspaces = useMemo(() => workspaces.slice(0, 8), [workspaces]);

  const [contextMenuOpen, setContextMenuOpen] = useState(false);
  const [contextMenuPosition, setContextMenuPosition] = useState<{ x: number; y: number } | null>(null);
  const [contextMenuAnchor, setContextMenuAnchor] = useState<{ workspaceId: string; index: number } | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [pendingActiveWorkspaceId, setPendingActiveWorkspaceId] = useState<string | null>(null);

  const reconcileStoreWorkspaces = useCallback((serverWorkspaces: typeof workspaces) => {
    const storeState = useWorkspaceStore.getState();
    const existingById = new Map(storeState.workspaces.map((workspace) => [workspace.id, workspace]));

    const nextWorkspaces = serverWorkspaces.map((workspace) => {
      const existing = existingById.get(workspace.id);
      if (!existing) {
        return createFallbackWorkspace(workspace.id, workspace.name, workspace.hasNotification);
      }

      if (existing.name === workspace.name && existing.hasNotification === workspace.hasNotification) {
        return existing;
      }

      return {
        ...existing,
        name: workspace.name,
        hasNotification: workspace.hasNotification,
      };
    });

    let nextActiveWorkspaceId = storeState.activeWorkspaceId;
    if (
      nextWorkspaces.length > 0 &&
      !nextWorkspaces.some((workspace) => workspace.id === nextActiveWorkspaceId)
    ) {
      nextActiveWorkspaceId = nextWorkspaces[0].id;
    }

    const hasWorkspaceShapeChanges =
      nextWorkspaces.length !== storeState.workspaces.length ||
      nextWorkspaces.some((workspace, index) => workspace !== storeState.workspaces[index]);

    if (!hasWorkspaceShapeChanges && nextActiveWorkspaceId === storeState.activeWorkspaceId) {
      return;
    }

    useWorkspaceStore.setState({
      workspaces: nextWorkspaces,
      activeWorkspaceId: nextActiveWorkspaceId,
    });
  }, []);

  const updateActiveWorkspace = useCallback((workspaceId: string) => {
    setActiveWorkspace(workspaceId);
  }, [setActiveWorkspace]);

  useEffect(() => {
    if (isLoading) {
      return;
    }

    void storeWorkspaceSignature;
    reconcileStoreWorkspaces(workspaces);
  }, [isLoading, reconcileStoreWorkspaces, storeWorkspaceSignature, workspaces]);

  useEffect(() => {
    if (!pendingActiveWorkspaceId) {
      return;
    }

    const hasPendingWorkspace = workspaces.some(
      (workspace) => workspace.id === pendingActiveWorkspaceId,
    );

    if (!hasPendingWorkspace) {
      return;
    }

    updateActiveWorkspace(pendingActiveWorkspaceId);
    setPendingActiveWorkspaceId(null);
  }, [pendingActiveWorkspaceId, updateActiveWorkspace, workspaces]);

  const handleCreateWorkspace = useCallback(async () => {
    if (workspaces.length >= 8) {
      return;
    }

    const nextNumber = workspaces.length + 1;
    setActionError(null);

    try {
      const result = await websocketService.request<CreateWorkspaceOutput>('workspace.create', {
        name: `Workspace ${nextNumber}`,
      });

      if (result.workspace?.id) {
        setPendingActiveWorkspaceId(result.workspace.id);
      }

      await refetch();
    } catch (requestError) {
      setActionError(getErrorMessage(requestError));
    }
  }, [refetch, websocketService, workspaces.length]);

  const handleContextMenu = useCallback((e: React.MouseEvent, workspaceId: string, index: number) => {
    e.preventDefault();
    setContextMenuPosition({ x: e.clientX, y: e.clientY });
    setContextMenuAnchor({ workspaceId, index });
    setContextMenuOpen(true);
  }, []);

  const handleRenameWorkspace = useCallback(async () => {
    if (!contextMenuAnchor) {
      return;
    }

    const targetWorkspace = workspaces.find(
      (workspace) => workspace.id === contextMenuAnchor.workspaceId,
    );
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

    const targetWorkspace = workspaces.find(
      (workspace) => workspace.id === contextMenuAnchor.workspaceId,
    );
    if (!targetWorkspace) {
      setContextMenuOpen(false);
      return;
    }

    const shouldDelete = window.confirm(
      `Delete workspace \"${targetWorkspace.name}\"?`,
    );
    if (!shouldDelete) {
      setContextMenuOpen(false);
      return;
    }

    setActionError(null);

    try {
      await websocketService.request('workspace.delete', {
        id: targetWorkspace.id,
      });

      if (targetWorkspace.id === activeWorkspaceId) {
        const fallbackWorkspace = visibleWorkspaces.find(
          (workspace) => workspace.id !== targetWorkspace.id,
        );
        if (fallbackWorkspace) {
          updateActiveWorkspace(fallbackWorkspace.id);
        }
      }

      await refetch();
    } catch (requestError) {
      setActionError(getErrorMessage(requestError));
    } finally {
      setContextMenuOpen(false);
    }
  }, [
    activeWorkspaceId,
    contextMenuAnchor,
    refetch,
    updateActiveWorkspace,
    visibleWorkspaces,
    websocketService,
    workspaces,
  ]);

  const handleSwitchWorkspace = useCallback((workspaceId: string) => {
    updateActiveWorkspace(workspaceId);
  }, [updateActiveWorkspace]);

  useEffect(() => {
    if (contextMenuAnchor && !workspaces.some((workspace) => workspace.id === contextMenuAnchor.workspaceId)) {
      setContextMenuOpen(false);
      setContextMenuAnchor(null);
    }
  }, [contextMenuAnchor, workspaces]);

  const isOnly = workspaces.length === 1;

  return (
    <TabsRoot
      value={activeWorkspaceId}
      onValueChange={(value) => handleSwitchWorkspace(value as string)}
      className="workspace-tabs-root"
    >
      <TabsList className="workspace-tabs-list">
        {isLoading ? (
          <div className="workspace-empty-state">Loading workspaces...</div>
        ) : visibleWorkspaces.length === 0 ? (
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
              <MenuItem
                className="context-menu-item"
                onClick={() => {
                  void handleCreateWorkspace();
                  setContextMenuOpen(false);
                }}
              >
                New Workspace
              </MenuItem>
              <MenuItem
                className="context-menu-item"
                onClick={() => {
                  void handleRenameWorkspace();
                }}
              >
                Rename Workspace
              </MenuItem>
              <div className="context-menu-separator" />
              <MenuItem
                className={`context-menu-item context-menu-item-danger ${isOnly ? 'disabled' : ''}`}
                onClick={() => {
                  void handleDeleteWorkspace();
                }}
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
  const activeWorkspaceId = useWorkspaceStore((state) => state.activeWorkspaceId);
  const setActiveWorkspace = useWorkspaceStore((state) => state.setActiveWorkspace);
  const visibleWorkspaces = useMemo(() => workspaces.slice(0, 8), [workspaces]);

  const handleSwitchWorkspace = useCallback((workspaceId: string) => {
    setActiveWorkspace(workspaceId);
  }, [setActiveWorkspace]);

  return (
    <TabsRoot
      value={activeWorkspaceId}
      onValueChange={(value) => handleSwitchWorkspace(value as string)}
      className="workspace-tabs-collapsed"
    >
      <TabsList className="workspace-tabs-collapsed-list">
        {isLoading && <div className="workspace-empty-state">...</div>}
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

  const handleTabClick = useCallback((tab: SidebarTab | string) => {
    setActiveSidebarTab(tab);
  }, [setActiveSidebarTab]);

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
