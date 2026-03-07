import useWorkspaceStore, { hasNotifications } from '../state/workspace';
import { Workspace } from '../state/types';

interface WorkspaceItemProps {
  workspace: Workspace;
  isActive: boolean;
  index: number;
  collapsed: boolean;
  onClick: () => void;
}

function WorkspaceItem({ workspace, isActive, index, collapsed, onClick }: WorkspaceItemProps) {
  const shortcutNumber = index + 1;

  if (collapsed) {
    return (
      <div
        onClick={onClick}
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
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', overflow: 'hidden' }}>
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

export function WorkspaceSidebar() {
  const {
    workspaces,
    activeWorkspaceId,
    sidebarCollapsed,
    toggleSidebar,
    setActiveWorkspace,
    createWorkspace,
  } = useWorkspaceStore();

  const hasNotifs = hasNotifications();

  const handleCreateWorkspace = () => {
    const nextNumber = workspaces.length + 1;
    createWorkspace(`Workspace ${nextNumber}`);
  };

  const handleWorkspaceClick = (workspaceId: string) => {
    setActiveWorkspace(workspaceId);
  };

  // Limit to 8 workspaces
  const visibleWorkspaces = workspaces.slice(0, 8);

  return (
    <div
      style={{
        width: sidebarCollapsed ? '50px' : '250px',
        minWidth: sidebarCollapsed ? '50px' : '250px',
        height: '100%',
        backgroundColor: '#1e1e1e',
        borderRight: '1px solid #333',
        display: 'flex',
        flexDirection: 'column',
        transition: 'width 0.2s ease, min-width 0.2s ease',
        overflow: 'hidden',
      }}
    >
      {/* Top Section: Notification Bell + Toggle */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: sidebarCollapsed ? 'center' : 'space-between',
          padding: sidebarCollapsed ? '12px 0' : '10px 12px',
          borderBottom: '1px solid #333',
          backgroundColor: '#252526',
        }}
      >
        {/* Notification Bell */}
        <div
          style={{
            position: 'relative',
            cursor: 'pointer',
            padding: '6px',
            borderRadius: '4px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = '#3c3c3c';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = 'transparent';
          }}
          title="Notifications"
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke={hasNotifs ? '#4fc3f7' : '#cccccc'}
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
            <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
          </svg>
          {hasNotifs && (
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

        {/* Toggle Button (hidden when collapsed) */}
        {!sidebarCollapsed && (
          <button
            onClick={toggleSidebar}
            style={{
              background: 'none',
              border: 'none',
              color: '#cccccc',
              cursor: 'pointer',
              fontSize: '14px',
              padding: '4px 8px',
              borderRadius: '4px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = '#3c3c3c';
              e.currentTarget.style.color = '#ffffff';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'transparent';
              e.currentTarget.style.color = '#cccccc';
            }}
            title="Collapse sidebar"
          >
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
              <path d="m11 17-5-5 5-5" />
              <path d="m18 17-5-5 5-5" />
            </svg>
          </button>
        )}
      </div>

      {/* Expand Button (only when collapsed) */}
      {sidebarCollapsed && (
        <button
          onClick={toggleSidebar}
          style={{
            background: 'none',
            border: 'none',
            color: '#cccccc',
            cursor: 'pointer',
            fontSize: '14px',
            padding: '8px 0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderBottom: '1px solid #333',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = '#3c3c3c';
            e.currentTarget.style.color = '#ffffff';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = 'transparent';
            e.currentTarget.style.color = '#cccccc';
          }}
          title="Expand sidebar"
        >
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
            <path d="m13 17 5-5-5-5" />
            <path d="m6 17 5-5-5-5" />
          </svg>
        </button>
      )}

      {/* Separator */}
      <div style={{ borderBottom: '1px solid #333' }} />

      {/* Middle Section: Workspace List */}
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
              collapsed={sidebarCollapsed}
              onClick={() => handleWorkspaceClick(workspace.id)}
            />
          ))
        )}
      </div>

      {/* Separator */}
      <div style={{ borderTop: '1px solid #333' }} />

      {/* Bottom Section: New Workspace Button */}
      <div
        style={{
          padding: sidebarCollapsed ? '12px 0' : '10px 12px',
          backgroundColor: '#252526',
        }}
      >
        <button
          onClick={handleCreateWorkspace}
          disabled={workspaces.length >= 8}
          style={{
            width: '100%',
            background: 'none',
            border: '1px solid #3c3c3c',
            color: workspaces.length >= 8 ? '#666666' : '#cccccc',
            cursor: workspaces.length >= 8 ? 'not-allowed' : 'pointer',
            fontSize: '14px',
            padding: sidebarCollapsed ? '8px 0' : '8px 12px',
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
            e.currentTarget.style.color = workspaces.length >= 8 ? '#666666' : '#cccccc';
            e.currentTarget.style.borderColor = '#3c3c3c';
          }}
          title={workspaces.length >= 8 ? 'Maximum 8 workspaces' : 'New workspace'}
        >
          <span style={{ fontSize: '18px', lineHeight: '1' }}>+</span>
          {!sidebarCollapsed && <span>New</span>}
        </button>
      </div>
    </div>
  );
}
