import { useEffect, useMemo, useRef } from 'react';
import { ResizableSidebar } from './ResizableSidebar';
import { SplitPane, findLeftmostPane, findRightmostPane, findTopmostPanes } from './SplitPane';
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts';
import { usePlatformDetection } from '../hooks/usePlatformDetection';
import { useWorkspaces } from '../hooks/useWorkspaces';
import { usePanes } from '../hooks/usePanes';
import { SplitNode } from '../state/types';
import {
  useRuntimeSelection,
  setActivePaneSelection,
  setActiveTabSelection,
  setActiveWorkspaceSelection,
} from '../lib/runtime-selection';
import {
  getWebSocketService,
} from '../services/websocket';

export function Layout() {
  const { workspaces } = useWorkspaces();
  const selectedWorkspaceId = useRuntimeSelection((state) => state.activeWorkspaceId);
  const selectedPaneId = useRuntimeSelection((state) => state.activePaneId);
  const activeWorkspaceId =
    selectedWorkspaceId && workspaces.some((workspace) => workspace.id === selectedWorkspaceId)
      ? selectedWorkspaceId
      : (workspaces[0]?.id ?? null);
  const { panes } = usePanes(activeWorkspaceId);

  const currentWorkspace = useMemo(() => {
    if (!activeWorkspaceId) {
      return null;
    }

    const workspace = workspaces.find((item) => item.id === activeWorkspaceId);
    if (!workspace) {
      return null;
    }

    const activePaneId =
      selectedPaneId && panes.some((pane) => pane.id === selectedPaneId)
        ? selectedPaneId
        : (panes[0]?.id ?? null);

    const root: SplitNode = {
      type: 'leaf',
      paneId: activePaneId ?? 'empty-pane',
    };

    return {
      ...workspace,
      root,
      activePaneId,
    };
  }, [activeWorkspaceId, panes, selectedPaneId, workspaces]);

  const { buttonPosition } = usePlatformDetection();
  const websocketService = useMemo(() => getWebSocketService(), []);
  const bootstrappedWorkspaceRef = useRef<Set<string>>(new Set());

  useKeyboardShortcuts();

  useEffect(() => {
    setActiveWorkspaceSelection(activeWorkspaceId);
  }, [activeWorkspaceId]);

  useEffect(() => {
    setActivePaneSelection(currentWorkspace?.activePaneId ?? null);
    setActiveTabSelection(null);
  }, [currentWorkspace?.activePaneId]);

  useEffect(() => {
    if (!activeWorkspaceId) {
      return;
    }

    if (panes.length > 0) {
      bootstrappedWorkspaceRef.current.delete(activeWorkspaceId);
      return;
    }

    if (bootstrappedWorkspaceRef.current.has(activeWorkspaceId)) {
      return;
    }

    bootstrappedWorkspaceRef.current.add(activeWorkspaceId);

    void websocketService
      .request<{ pane?: { id?: string } }>('pane.create', { workspaceId: activeWorkspaceId })
      .then((result) => {
        if (result?.pane?.id) {
          setActivePaneSelection(result.pane.id);
        }
      })
      .catch(() => {
        bootstrappedWorkspaceRef.current.delete(activeWorkspaceId);
      });
  }, [activeWorkspaceId, panes.length, websocketService]);

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
