import { SplitPane } from './components/SplitPane';
import { WorkspaceSidebar } from './components/WorkspaceSidebar';

import useWorkspaceStore from './state/workspace';
import './App.css';

function Layout() {
  const activeWorkspaceId = useWorkspaceStore((state) => state.activeWorkspaceId);
  const workspaces = useWorkspaceStore((state) => state.workspaces);

  const activeWorkspace = workspaces.find((ws) => ws.id === activeWorkspaceId);

  if (!activeWorkspace) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#666' }}>
        No workspace found
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', height: '100vh' }}>
      {/* Sidebar */}
      <WorkspaceSidebar />

      {/* Main content area */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <SplitPane node={activeWorkspace.root} workspaceId={activeWorkspace.id} />
      </div>


    </div>
  );
}

export default Layout;
