import { useEffect, useMemo, useState, useRef } from 'react';
import useWorkspaceStore, {
  getTotalNotificationCount,
  getGitChangesCount,
} from '../state/workspace';
import { Workspace, PanelDefinition, SidebarTab } from '../state/types';
import { TabHeaderPanel } from './TabHeaderPanel';

import './TabBar.css';

// ============================================================================
// Workspace Item Component (for Workspaces panel content)
// ============================================================================

interface WorkspaceItemProps {
  workspace: Workspace;
  isActive: boolean;
  index: number;
  collapsed: boolean;
  onClick: () => void;
  onContextMenu?: (e: React.MouseEvent) => void;
}

function WorkspaceItem({
  workspace,
  isActive,
  index,
  collapsed,
  onClick,
  onContextMenu,
}: WorkspaceItemProps) {
  const shortcutNumber = index + 1;

  if (collapsed) {
    return (
      <div
        onClick={onClick}
        onContextMenu={onContextMenu}
        style={{ 
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '12px 0',
          cursor: 'pointer',
          backgroundColor: isActive ? '#37373d' : 'transparent',
          borderLeft: workspace.hasNotification
            ? '3px solid #4fc3f7'
            : isActive
              ? '2px solid #007acc'
              : '2px solid transparent',
          transition: 'background-color 0.15s ease',
          position: 'relative',
        }}
        onMouseEnter={(e) => {
          if (!isActive) {
            e.currentTarget.style.backgroundColor = '#2a2d2e';
          }
        }}
        onMouseLeave={(e) => {
          if (!isActive) {
            e.currentTarget.style.backgroundColor = 'transparent';
          }
        }}
        title={`${workspace.name} (⌘${shortcutNumber})`}
      >
        <span
          style={{
            width: '28px',
            height: '28px',
            borderRadius: '6px',
            backgroundColor: isActive ? '#007acc' : '#3c3c3c',
            color: '#ffffff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '12px',
            fontWeight: 600,
          }}
        >
          {shortcutNumber}
        </span>
        {workspace.hasNotification && (
          <span
            style={{
              position: 'absolute',
              top: '8px',
              right: '8px',
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              backgroundColor: '#4fc3f7',
            }}
          />
        )}
      </div>
    );
  }

  return (
    <div
      onClick={onClick}
      onContextMenu={onContextMenu}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '10px 12px',
        cursor: 'pointer',
        backgroundColor: isActive ? '#37373d' : 'transparent',
        borderLeft: workspace.hasNotification
          ? '3px solid #4fc3f7'
          : isActive
          ? '2px solid #007acc'
          : '2px solid transparent',
        transition: 'background-color 0.15s ease',
        fontSize: '13px',
        color: isActive ? '#ffffff' : '#cccccc',
        userSelect: 'none',
      }}
      onMouseEnter={(e) => {
        if (!isActive) {
          e.currentTarget.style.backgroundColor = '#2a2d2e';
        }
      }}
      onMouseLeave={(e) => {
        if (!isActive) {
          e.currentTarget.style.backgroundColor = 'transparent';
        }
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          overflow: 'hidden',
        }}
      >
        <span
          style={{
            width: '24px',
            height: '24px',
            borderRadius: '4px',
            backgroundColor: isActive ? '#007acc' : '#3c3c3c',
            color: '#ffffff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '11px',
            fontWeight: 600,
            flexShrink: 0,
          }}
        >
          {shortcutNumber}
        </span>
        <span
          style={{
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {workspace.name}
        </span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
        {workspace.hasNotification && (
          <span
            style={{
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              backgroundColor: '#4fc3f7',
            }}
          />
        )}
        <span
          style={{
            color: '#858585',
            fontSize: '11px',
            padding: '2px 6px',
            backgroundColor: '#2d2d30',
            borderRadius: '4px',
          }}
        >
          ⌘{shortcutNumber}
        </span>
      </div>
    </div>
  );
}

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

  const visibleWorkspaces = workspaces.slice(0, 8);

  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    workspaceId: string;
    index: number;
  } | null>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);

  // Close context menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        contextMenu &&
        !contextMenuRef.current?.contains(e.target as Node)
      ) {
        setContextMenu(null);
      }
    };

    if (contextMenu) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      if (contextMenu) {
        document.removeEventListener('mousedown', handleClickOutside);
      }
    };
  }, [contextMenu]);

  const handleCreateWorkspace = () => {
    const nextNumber = workspaces.length + 1;
    createWorkspace(`Workspace ${nextNumber}`);
  };

  const handleContextMenu = (e: React.MouseEvent, workspaceId: string, index: number) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, workspaceId, index });
  };

  const handleNewWorkspaceBelow = () => {
    if (contextMenu) {
      const nextNumber = workspaces.length + 1;
      createWorkspaceAfter(contextMenu.workspaceId, `Workspace ${nextNumber}`);
      setContextMenu(null);
    }
  };

  const handleMoveUp = () => {
    if (contextMenu && contextMenu.index > 0) {
      moveWorkspaceUp(contextMenu.workspaceId);
      setContextMenu(null);
    }
  };

  const handleMoveDown = () => {
    if (contextMenu && contextMenu.index < workspaces.length - 1) {
      moveWorkspaceDown(contextMenu.workspaceId);
      setContextMenu(null);
    }
  };

  const handleCloseWorkspace = () => {
    if (contextMenu && workspaces.length > 1) {
      closeWorkspace(contextMenu.workspaceId);
      setContextMenu(null);
    }
  };

  const isFirst = contextMenu ? contextMenu.index === 0 : false;
  const isLast = contextMenu ? contextMenu.index === workspaces.length - 1 : false;
  const isOnly = workspaces.length === 1;

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
      }}
    >
      {/* Workspace List */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          overflowX: 'hidden',
        }}
      >
        {visibleWorkspaces.length === 0 ? (
          <div
            style={{
              padding: '20px 12px',
              textAlign: 'center',
              color: '#666666',
              fontSize: '12px',
            }}
          >
            No workspaces
          </div>
        ) : (
          visibleWorkspaces.map((workspace, index) => (
            <WorkspaceItem
              key={workspace.id}
              workspace={workspace}
              isActive={workspace.id === activeWorkspaceId}
              index={index}
              collapsed={collapsed}
              onClick={() => setActiveWorkspace(workspace.id)}
              onContextMenu={(e) => handleContextMenu(e, workspace.id, index)}
            />
          ))
        )}
      </div>

      {/* New Workspace Button */}
      {!collapsed && (
        <div
          style={{
            padding: '10px 12px',
            backgroundColor: '#252526',
            borderTop: '1px solid #333',
          }}
        >
          <button
            type="button"
            onClick={handleCreateWorkspace}
            disabled={workspaces.length >= 8}
            style={{
              width: '100%',
              background: 'none',
              border: '1px solid #3c3c3c',
              color: workspaces.length >= 8 ? '#666666' : '#cccccc',
              cursor: workspaces.length >= 8 ? 'not-allowed' : 'pointer',
              fontSize: '14px',
              padding: '8px 12px',
              borderRadius: '4px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              transition: 'all 0.15s ease',
            }}
            onMouseEnter={(e) => {
              if (workspaces.length < 8) {
                e.currentTarget.style.backgroundColor = '#3c3c3c';
                e.currentTarget.style.color = '#ffffff';
                e.currentTarget.style.borderColor = '#007acc';
              }
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'transparent';
              e.currentTarget.style.color =
                workspaces.length >= 8 ? '#666666' : '#cccccc';
              e.currentTarget.style.borderColor = '#3c3c3c';
            }}
            title={workspaces.length >= 8 ? 'Maximum 8 workspaces' : 'New workspace'}
          >
            <span style={{ fontSize: '18px', lineHeight: '1' }}>+</span>
            <span>New</span>
          </button>
        </div>
      )}

      {/* Context Menu */}
      {contextMenu && (
        <>
          <div
            className="context-menu-backdrop"
            onClick={() => setContextMenu(null)}
          />
          <div
            ref={contextMenuRef}
            className="context-menu"
            style={{ left: contextMenu.x, top: contextMenu.y }}
          >
            <div
              className="context-menu-item"
              onClick={handleNewWorkspaceBelow}
            >
              New Workspace Below
            </div>
            <div
              className={`context-menu-item ${isFirst ? 'disabled' : ''}`}
              onClick={handleMoveUp}
              style={{ opacity: isFirst ? 0.4 : 1, cursor: isFirst ? 'not-allowed' : 'pointer' }}
            >
              Move Up
            </div>
            <div
              className={`context-menu-item ${isLast ? 'disabled' : ''}`}
              onClick={handleMoveDown}
              style={{ opacity: isLast ? 0.4 : 1, cursor: isLast ? 'not-allowed' : 'pointer' }}
            >
              Move Down
            </div>
            <div className="context-menu-separator" />
            <div
              className={`context-menu-item context-menu-item-danger ${isOnly ? 'disabled' : ''}`}
              onClick={handleCloseWorkspace}
              style={{ opacity: isOnly ? 0.4 : 1, cursor: isOnly ? 'not-allowed' : 'pointer' }}
            >
              Close Workspace
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function CollapsedWorkspaceList() {
  const { workspaces, activeWorkspaceId, setActiveWorkspace } = useWorkspaceStore();
  const visibleWorkspaces = workspaces.slice(0, 8);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        padding: '4px 0',
        gap: '4px',
      }}
    >
      {visibleWorkspaces.map((workspace, index) => (
        <div
          key={workspace.id}
          onClick={() => setActiveWorkspace(workspace.id)}
          style={{
            width: '40px',
            height: '40px',
            borderRadius: '6px',
            backgroundColor: workspace.id === activeWorkspaceId ? '#007acc' : '#3c3c3c',
            color: '#ffffff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '12px',
            fontWeight: 600,
            cursor: 'pointer',
            position: 'relative',
            transition: 'background-color 0.15s ease',
          }}
          onMouseEnter={(e) => {
            if (workspace.id !== activeWorkspaceId) {
              e.currentTarget.style.backgroundColor = '#2a2d2e';
            }
          }}
          onMouseLeave={(e) => {
            if (workspace.id !== activeWorkspaceId) {
              e.currentTarget.style.backgroundColor = '#3c3c3c';
            }
          }}
          title={`${workspace.name} (⌘${index + 1})`}
        >
          {index + 1}
          {workspace.hasNotification && (
            <span
              style={{
                position: 'absolute',
                top: '2px',
                right: '2px',
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                backgroundColor: '#4fc3f7',
              }}
            />
          )}
        </div>
      ))}
    </div>
  );
}

function NotificationList() {
  const notificationCount = getTotalNotificationCount();

  return (
    <div
      style={{
        padding: '16px',
        color: '#cccccc',
        fontSize: '13px',
      }}
    >
      <div
        style={{
          marginBottom: '12px',
          fontWeight: 600,
          borderBottom: '1px solid #333',
          paddingBottom: '8px',
        }}
      >
        Notifications ({notificationCount})
      </div>
      {notificationCount === 0 ? (
        <div style={{ color: '#666666', textAlign: 'center', padding: '20px 0' }}>
          No notifications
        </div>
      ) : (
        <div style={{ color: '#858585' }}>
          Notification items will be displayed here
        </div>
      )}
    </div>
  );
}

function GitPanelContent() {
  const changesCount = getGitChangesCount();

  return (
    <div
      style={{
        padding: '16px',
        color: '#cccccc',
        fontSize: '13px',
      }}
    >
      <div
        style={{
          marginBottom: '12px',
          fontWeight: 600,
          borderBottom: '1px solid #333',
          paddingBottom: '8px',
        }}
      >
        Git ({changesCount} changes)
      </div>
      <div style={{ marginBottom: '12px' }}>
        <div style={{ color: '#858585', marginBottom: '4px' }}>Branch</div>
        <div style={{ color: '#4fc3f7' }}>main</div>
      </div>
      <div style={{ marginBottom: '12px' }}>
        <div style={{ color: '#858585', marginBottom: '4px' }}>Staged</div>
        <div>0 files</div>
      </div>
      <div>
        <div style={{ color: '#858585', marginBottom: '4px' }}>Changes</div>
        <div>{changesCount} files</div>
      </div>
    </div>
  );
}

function ProjectTree() {
  return (
    <div
      style={{
        padding: '16px',
        color: '#cccccc',
        fontSize: '13px',
      }}
    >
      <div
        style={{
          marginBottom: '12px',
          fontWeight: 600,
          borderBottom: '1px solid #333',
          paddingBottom: '8px',
        }}
      >
        Project
      </div>
      <div style={{ color: '#858585' }}>
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

function WorkspacesIcon() {
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
}

function BellIcon() {
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
}

function GitBranchIcon() {
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
      <line x1="6" y1="3" x2="6" y2="15" />
      <circle cx="18" cy="6" r="3" />
      <circle cx="6" cy="18" r="3" />
      <path d="M18 9a9 9 0 0 1-9 9" />
    </svg>
  );
}

function FolderIcon() {
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
}

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

  // Create panel definitions with reactive badges
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
      {
        id: 'git' as SidebarTab,
        title: 'Git',
        icon: () => <GitBranchIcon />,
        badge: () => {
          const count = getGitChangesCount();
          return count > 0 ? { count } : null;
        },
        fullRender: () => <GitPanelContent />,
      },
      {
        id: 'project' as SidebarTab,
        title: 'Project',
        icon: () => <FolderIcon />,
        badge: () => null,
        fullRender: () => <ProjectTree />,
      },
    ],
    // Note: We intentionally don't include getTotalNotificationCount or getGitChangesCount
    // in dependencies because they are selectors that read from store state on each call.
    // The useMemo is mainly for panel definition stability.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  // Register panels on mount
  useEffect(() => {
    panels.forEach((panel) => {
      registerPanel(panel);
    });
  }, [panels, registerPanel]);

  const handleTabClick = (tab: SidebarTab) => {
    setActiveSidebarTab(tab);
  };

  return (
    <div
      style={{
        width: sidebarCollapsed ? '50px' : '100%',
        height: '100%',
        backgroundColor: '#1e1e1e',
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
