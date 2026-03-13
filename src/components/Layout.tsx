import { useEffect, useMemo, useState } from 'react';
import { ResizableSidebar } from './ResizableSidebar';
import { SplitPane, findLeftmostPane, findRightmostPane, findTopmostPanes } from './SplitPane';
import useWorkspaceStore, { activeWorkspace } from '../state/workspace';
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts';
import { usePlatformDetection } from '../hooks/usePlatformDetection';
import {
  type ConnectionStatus,
  getWebSocketService,
} from '../services/websocket';

export function Layout() {
  const workspaces = useWorkspaceStore((state) => state.workspaces);
  const activeWorkspaceId = useWorkspaceStore(
    (state) => state.activeWorkspaceId
  );

  const currentWorkspace = activeWorkspace();

  const { buttonPosition } = usePlatformDetection();
  const websocketService = useMemo(() => getWebSocketService(), []);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>(
    () => websocketService.getStatus()
  );

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

  // Panes whose tab bars should be draggable (topmost in window = no pane above them)
  const topmostPaneIds = useMemo(() => {
    if (!currentWorkspace?.root) return new Set<string>();
    return findTopmostPanes(currentWorkspace.root);
  }, [currentWorkspace?.root]);

  useEffect(() => {
    return websocketService.onConnectionChange((nextStatus) => {
      setConnectionStatus(nextStatus);
    });
  }, [websocketService]);

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
      <div
        title={connectionStatus.error ?? connectionIndicator.label}
        style={{
          position: 'absolute',
          top: '8px',
          right: buttonPosition === 'left' ? '8px' : '18px',
          zIndex: 10,
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
      {currentWorkspace ? (
        <SplitPane
          node={currentWorkspace.root}
          workspaceId={currentWorkspace.id}
          windowControlsPosition={buttonPosition}
          targetPaneId={targetPaneId}
          topmostPaneIds={topmostPaneIds}
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
