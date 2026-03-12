// SplitPane recursive component using react-resizable-panels
// Renders workspace split tree structure with horizontal/vertical splits

import { Group, Panel, Separator, type Orientation } from 'react-resizable-panels';
import { SplitNode, BranchNode, LeafNode, isBranch, isLeaf } from '../state/types';
import useWorkspaceStore from '../state/workspace';
import { Pane } from './Pane';

// ============================================================================
// Types
// ============================================================================

interface SplitPaneProps {
  node: SplitNode;
  workspaceId: string;
  windowControlsPosition?: 'left' | 'right';
  targetPaneId?: string | null;
}

interface BranchPaneProps {
  node: BranchNode;
  workspaceId: string;
  targetPaneId?: string | null;
}

interface LeafPaneProps {
  node: LeafNode;
  workspaceId: string;
  windowControlsPosition?: 'left' | 'right';
  targetPaneId?: string | null;
}

export function findLeftmostPane(node: SplitNode): string | null {
  if (isLeaf(node)) return node.paneId;
  return findLeftmostPane(node.children[0]);
}

export function findRightmostPane(node: SplitNode): string | null {
  if (isLeaf(node)) return node.paneId;
  return findRightmostPane(node.children[1]);
}

const MIN_PANEL_SIZE_PERCENTAGE = 10;

function LeafPane({ node, workspaceId, windowControlsPosition, targetPaneId }: LeafPaneProps) {
  const workspace = useWorkspaceStore((state) =>
    state.workspaces.find((ws) => ws.id === workspaceId)
  );
  const pane = workspace?.panes[node.paneId];

  if (!pane) {
    return (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: 'var(--background-hex)',
          color: 'var(--foreground-muted)',
          fontSize: '14px',
        }}
      >
        Pane not found: {node.paneId}
      </div>
    );
  }

  const controlsPosition = node.paneId === targetPaneId ? windowControlsPosition : undefined;

  return (
    <Pane
      paneId={node.paneId}
      workspaceId={workspaceId}
      windowControlsPosition={controlsPosition}
    />
  );
}

function BranchPane({ node, workspaceId, targetPaneId }: BranchPaneProps) {
  const orientation: Orientation =
    node.axis === 'horizontal' ? 'horizontal' : 'vertical';

  return (
    <Group
      orientation={orientation}
      style={{
        width: '100%',
        height: '100%',
      }}
    >
      {/* First child */}
      <Panel
        defaultSize={50}
        minSize={MIN_PANEL_SIZE_PERCENTAGE}
        style={{
          display: 'flex',
          overflow: 'hidden',
        }}
      >
        <SplitPane node={node.children[0]} workspaceId={workspaceId} targetPaneId={targetPaneId} />
      </Panel>

      {/* Resize handle */}
    <Separator
      style={{
        backgroundColor: 'var(--border-tertiary)',
        transition: 'background-color 0.15s ease',
        ...(orientation === 'horizontal'
          ? {
              width: '4px',
              cursor: 'col-resize',
            }
          : {
              height: '4px',
              cursor: 'row-resize',
            }),
      }}
      onMouseEnter={(e) => {
        const target = e.target as HTMLElement;
        target.style.backgroundColor = 'hsl(var(--primary))';
      }}
      onMouseLeave={(e) => {
        const target = e.target as HTMLElement;
        target.style.backgroundColor = 'var(--border-tertiary)';
      }}
    />

      {/* Second child */}
      <Panel
        defaultSize={50}
        minSize={MIN_PANEL_SIZE_PERCENTAGE}
        style={{
          display: 'flex',
          overflow: 'hidden',
        }}
      >
        <SplitPane node={node.children[1]} workspaceId={workspaceId} targetPaneId={targetPaneId} />
      </Panel>
    </Group>
  );
}

export function SplitPane({ node, workspaceId, windowControlsPosition, targetPaneId }: SplitPaneProps) {
  if (isBranch(node)) {
    return <BranchPane node={node} workspaceId={workspaceId} targetPaneId={targetPaneId} />;
  }

  if (isLeaf(node)) {
    return <LeafPane node={node} workspaceId={workspaceId} windowControlsPosition={windowControlsPosition} targetPaneId={targetPaneId} />;
  }

  // Fallback for unknown node types
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'var(--background-hex)',
        color: 'var(--destructive-hex)',
        fontSize: '14px',
      }}
    >
      Unknown node type
    </div>
  );
}

export default SplitPane;
