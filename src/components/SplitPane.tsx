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
  /** Split node to render (Branch or Leaf) */
  node: SplitNode;
  /** Workspace ID for state updates */
  workspaceId: string;
}

interface BranchPaneProps {
  /** Branch node containing split children */
  node: BranchNode;
  /** Workspace ID for state updates */
  workspaceId: string;
}

interface LeafPaneProps {
  /** Leaf node referencing a pane */
  node: LeafNode;
  /** Workspace ID for state updates */
  workspaceId: string;
}

/** Minimum panel size as percentage */
const MIN_PANEL_SIZE_PERCENTAGE = 10;

// ============================================================================
// Leaf Pane Component
// ============================================================================

/**
 * LeafPane renders a terminal pane using the actual Pane component
 */
function LeafPane({ node, workspaceId }: LeafPaneProps) {
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
          backgroundColor: '#1e1e1e',
          color: '#666666',
          fontSize: '14px',
        }}
      >
        Pane not found: {node.paneId}
      </div>
    );
  }

  return <Pane paneId={node.paneId} workspaceId={workspaceId} />;
}

// ============================================================================
// Branch Pane Component
// ============================================================================

/**
 * BranchPane renders a split container with two children
 * Uses react-resizable-panels for resize functionality
 * Note: Panel sizes are managed internally by react-resizable-panels
 * to avoid re-renders during resize
 */
function BranchPane({ node, workspaceId }: BranchPaneProps) {
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
        <SplitPane node={node.children[0]} workspaceId={workspaceId} />
      </Panel>

      {/* Resize handle */}
      <Separator
        style={{
          backgroundColor: '#333333',
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
          target.style.backgroundColor = '#007acc';
        }}
        onMouseLeave={(e) => {
          const target = e.target as HTMLElement;
          target.style.backgroundColor = '#333333';
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
        <SplitPane node={node.children[1]} workspaceId={workspaceId} />
      </Panel>
    </Group>
  );
}

// ============================================================================
// Main SplitPane Component
// ============================================================================

/**
 * SplitPane recursively renders the workspace split tree
 * Supports horizontal and vertical splits via react-resizable-panels
 */
export function SplitPane({ node, workspaceId }: SplitPaneProps) {
  if (isBranch(node)) {
    return <BranchPane node={node} workspaceId={workspaceId} />;
  }

  if (isLeaf(node)) {
    return <LeafPane node={node} workspaceId={workspaceId} />;
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
        backgroundColor: '#1e1e1e',
        color: '#ff6b6b',
        fontSize: '14px',
      }}
    >
      Unknown node type
    </div>
  );
}

export default SplitPane;
