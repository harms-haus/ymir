// SplitPane recursive component using react-resizable-panels
// Renders workspace split tree structure with horizontal/vertical splits

import { useCallback, useRef } from 'react';
import {
  Group,
  Panel,
  Separator,
  type Orientation,
} from 'react-resizable-panels';
import {
  SplitNode,
  BranchNode,
  LeafNode,
  isBranch,
  isLeaf,
} from '../state/types';
import useWorkspaceStore, { type WorkspaceWithPanes } from '../state/workspace';

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

// ============================================================================
// Constants
// ============================================================================

/** Minimum panel size as percentage (10% = ~100px at typical sizes) */
const MIN_PANEL_SIZE_PERCENTAGE = 10;

/** Debounce delay for resize updates in milliseconds */
const RESIZE_DEBOUNCE_MS = 100;

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Get workspace from store by ID
 */
function getWorkspace(workspaceId: string): WorkspaceWithPanes | undefined {
  const { workspaces } = useWorkspaceStore.getState();
  return workspaces.find((ws) => ws.id === workspaceId);
}

// ============================================================================
// Leaf Pane Component
// ============================================================================

/**
 * LeafPane renders a terminal pane
 * Placeholder for actual Pane component (Task 7)
 */
function LeafPane({ node, workspaceId }: LeafPaneProps) {
  const workspace = getWorkspace(workspaceId);
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

  // Placeholder for actual Pane component
  // Task 7 will implement the full Pane component with tabs
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: '#1e1e1e',
        border: '1px solid #333333',
      }}
    >
      {/* Tab bar placeholder */}
      <div
        style={{
          height: '32px',
          display: 'flex',
          alignItems: 'center',
          padding: '0 8px',
          backgroundColor: '#252526',
          borderBottom: '1px solid #333333',
          gap: '4px',
        }}
      >
        {pane.tabs.map((tab) => (
          <div
            key={tab.id}
            style={{
              padding: '4px 12px',
              fontSize: '12px',
              color: tab.id === pane.activeTabId ? '#ffffff' : '#969696',
              backgroundColor:
                tab.id === pane.activeTabId ? '#1e1e1e' : 'transparent',
              borderRadius: '3px 3px 0 0',
              borderBottom:
                tab.id === pane.activeTabId
                  ? '2px solid #007acc'
                  : '2px solid transparent',
            }}
          >
            {tab.title}
            {tab.hasNotification && (
              <span
                style={{
                  display: 'inline-block',
                  width: '6px',
                  height: '6px',
                  borderRadius: '50%',
                  backgroundColor: '#ffcc00',
                  marginLeft: '6px',
                }}
              />
            )}
          </div>
        ))}
      </div>

      {/* Terminal content placeholder */}
      <div
        style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#666666',
          fontSize: '14px',
          fontFamily: 'monospace',
        }}
      >
        Terminal: {pane.id}
      </div>
    </div>
  );
}

// ============================================================================
// Branch Pane Component
// ============================================================================

/**
 * BranchPane renders a split container with two children
 * Uses react-resizable-panels for resize functionality
 */
function BranchPane({ node, workspaceId }: BranchPaneProps) {
  const resizeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /**
   * Handle layout changes from resize operations
   * Debounced to prevent excessive store updates
   */
  const handleLayout = useCallback(
    (layout: { [panelId: string]: number }) => {
      // Clear existing timeout
      if (resizeTimeoutRef.current) {
        clearTimeout(resizeTimeoutRef.current);
      }

      // Debounce the store update
      resizeTimeoutRef.current = setTimeout(() => {
        // Update flex ratios in store based on new sizes
        // Layout comes as percentages from react-resizable-panels
        const sizes = Object.values(layout);
        const [size1, size2] = sizes;

        if (size1 !== undefined && size2 !== undefined) {
          useWorkspaceStore.setState((state) => {
            const workspace = state.workspaces.find(
              (ws) => ws.id === workspaceId
            );
            if (!workspace) return;

            // Update pane flex ratios based on the split
            // This is a simplified update - in a full implementation,
            // we'd traverse the tree and update the specific panes
            const updateFlexRatios = (n: SplitNode): void => {
              if (isBranch(n) && n.id === node.id) {
                // Update children based on sizes
                // Convert percentage to flex ratio (0-1 range)
                const ratio1 = size1 / 100;
                const ratio2 = size2 / 100;

                // Update leaf pane flex ratios
                const updateLeafRatio = (
                  leafNode: SplitNode,
                  ratio: number
                ) => {
                  if (isLeaf(leafNode)) {
                    const pane = workspace.panes[leafNode.paneId];
                    if (pane) {
                      pane.flexRatio = ratio;
                    }
                  } else {
                    // For branches, update all descendant leaves proportionally
                    updateLeafRatio(leafNode.children[0], ratio * 0.5);
                    updateLeafRatio(leafNode.children[1], ratio * 0.5);
                  }
                };

                updateLeafRatio(n.children[0], ratio1);
                updateLeafRatio(n.children[1], ratio2);
              } else if (isBranch(n)) {
                updateFlexRatios(n.children[0]);
                updateFlexRatios(n.children[1]);
              }
            };

            updateFlexRatios(workspace.root);
          });
        }
      }, RESIZE_DEBOUNCE_MS);
    },
    [workspaceId, node.id]
  );

  const orientation: Orientation =
    node.axis === 'horizontal' ? 'horizontal' : 'vertical';

  return (
    <Group
      orientation={orientation}
      onLayoutChanged={handleLayout}
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
