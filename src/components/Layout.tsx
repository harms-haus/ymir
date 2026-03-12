import { useEffect, useMemo } from 'react';
import { ResizableSidebar } from './ResizableSidebar';
import { SplitPane, findLeftmostPane, findRightmostPane } from './SplitPane';
import useWorkspaceStore, { activeWorkspace } from '../state/workspace';
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts';
import { usePlatformDetection } from '../hooks/usePlatformDetection';

export function Layout() {
  const workspaces = useWorkspaceStore((state) => state.workspaces);
  const activeWorkspaceId = useWorkspaceStore(
    (state) => state.activeWorkspaceId
  );

  const currentWorkspace = activeWorkspace();

  const { buttonPosition } = usePlatformDetection();

  useKeyboardShortcuts();

  // Find the target pane that should display window controls
  // Left-aligned (macOS): top-left-most pane (first child recursively)
  // Right-aligned (Windows/Linux): top-right-most pane (second child recursively)
  const targetPaneId = useMemo(() => {
    if (!currentWorkspace?.root) return null;
    return buttonPosition === 'left'
      ? findLeftmostPane(currentWorkspace.root)
      : findRightmostPane(currentWorkspace.root);
  }, [currentWorkspace?.root, buttonPosition]);

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

  const mainContent = (
    <div
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: 'var(--background-hex)',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {currentWorkspace ? (
        <SplitPane
          node={currentWorkspace.root}
          workspaceId={currentWorkspace.id}
          windowControlsPosition={buttonPosition}
          targetPaneId={targetPaneId}
        />
      ) : (
        <div
        style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--foreground-muted)',
          fontSize: '14px',
        }}
        >
          No active workspace
        </div>
      )}
    </div>
  );

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: buttonPosition === 'left' ? 'row-reverse' : 'row',
        height: '100vh',
        width: '100vw',
        overflow: 'hidden',
        backgroundColor: 'var(--background-hex)',
      }}
    >
      <ResizableSidebar />
      {mainContent}
    </div>
  );
}
