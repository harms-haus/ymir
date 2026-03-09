import { useEffect } from 'react';
import { ResizableSidebar } from './ResizableSidebar';
import { SplitPane } from './SplitPane';
import useWorkspaceStore, { activeWorkspace } from '../state/workspace';
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts';

export function Layout() {
  const workspaces = useWorkspaceStore((state) => state.workspaces);
  const activeWorkspaceId = useWorkspaceStore(
    (state) => state.activeWorkspaceId
  );

  // Get the active workspace
  const currentWorkspace = activeWorkspace();

  // Initialize keyboard shortcuts with focus management
  // Hook sets up global listeners; returned values available for Pane focus tracking
  useKeyboardShortcuts();

  // Update window title based on active workspace
  useEffect(() => {
    const ws = workspaces.find((w) => w.id === activeWorkspaceId);
    if (ws) {
      document.title = `${ws.name} - Ymir`;
    } else {
      document.title = 'Ymir';
    }
    return () => {
      document.title = 'Ymir';
    };
  }, [activeWorkspaceId, workspaces]);

  return (
    <div
      style={{
        display: 'flex',
        height: '100vh',
        width: '100vw',
        overflow: 'hidden',
        backgroundColor: '#1e1e1e',
      }}
    >
      {/* Workspace Sidebar */}
      <ResizableSidebar />

      {/* Main Content Area */}
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          backgroundColor: '#1e1e1e',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {currentWorkspace ? (
          <SplitPane
            node={currentWorkspace.root}
            workspaceId={currentWorkspace.id}
          />
        ) : (
          <div
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#666666',
              fontSize: '14px',
            }}
          >
            No active workspace
          </div>
        )}
      </div>

    </div>
  );


}

export default Layout;
