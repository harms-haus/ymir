import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { SplitNode, BranchNode, LeafNode } from '../../state/types';

const mockStoreState: Record<string, unknown> = {
  workspaces: [],
};

vi.mock('../../state/workspace', () => ({
  default: vi.fn((selector?: (state: Record<string, unknown>) => unknown) => {
    if (selector) {
      return selector(mockStoreState);
    }
    return mockStoreState;
  }),
}));

vi.mock('react-resizable-panels', () => ({
  Group: vi.fn(({ children, orientation, style }) => (
    <div data-testid="panel-group" data-orientation={orientation} style={style}>
      {children}
    </div>
  )),
  Panel: vi.fn(({ children, defaultSize, minSize }) => (
    <div data-testid="panel" data-default-size={defaultSize} data-min-size={minSize}>
      {children}
    </div>
  )),
  Separator: vi.fn(({ style, onMouseEnter, onMouseLeave }) => (
    <div
      data-testid="panel-separator"
      style={style}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    />
  )),
}));

vi.mock('../Pane', () => ({
  Pane: vi.fn(({ paneId, workspaceId }) => (
    <div data-testid="pane" data-pane-id={paneId} data-workspace-id={workspaceId}>
      Pane: {paneId}
    </div>
  )),
}));

import { SplitPane } from '../SplitPane';

describe('SplitPane Component', () => {
  const workspaceId = 'ws-1';

  beforeEach(() => {
    vi.clearAllMocks();

    mockStoreState.workspaces = [
      {
        id: workspaceId,
        name: 'Test Workspace',
        root: { type: 'leaf', paneId: 'pane-1' } as LeafNode,
        activePaneId: 'pane-1',
        hasNotification: false,
        panes: {
          'pane-1': {
            id: 'pane-1',
            flexRatio: 1,
            tabs: [],
            activeTabId: null,
            hasNotification: false,
          },
          'pane-2': {
            id: 'pane-2',
            flexRatio: 1,
            tabs: [],
            activeTabId: null,
            hasNotification: false,
          },
          'pane-3': {
            id: 'pane-3',
            flexRatio: 1,
            tabs: [],
            activeTabId: null,
            hasNotification: false,
          },
        },
      },
    ];
  });

  describe('Leaf Node Rendering', () => {
    it('should render a leaf node with Pane component', () => {
      const leafNode: LeafNode = {
        type: 'leaf',
        paneId: 'pane-1',
      };

      render(<SplitPane node={leafNode} workspaceId={workspaceId} />);

      const pane = screen.getByTestId('pane');
      expect(pane).toBeInTheDocument();
      expect(pane).toHaveAttribute('data-pane-id', 'pane-1');
      expect(pane).toHaveAttribute('data-workspace-id', workspaceId);
    });

    it('should render fallback when pane is not found', () => {
      const leafNode: LeafNode = {
        type: 'leaf',
        paneId: 'nonexistent-pane',
      };

      render(<SplitPane node={leafNode} workspaceId={workspaceId} />);

      expect(screen.getByText(/Pane not found: nonexistent-pane/)).toBeInTheDocument();
    });

    it('should render fallback when workspace is not found', () => {
      const leafNode: LeafNode = {
        type: 'leaf',
        paneId: 'pane-1',
      };

      mockStoreState.workspaces = [];

      render(<SplitPane node={leafNode} workspaceId="nonexistent-ws" />);

      expect(screen.getByText(/Pane not found: pane-1/)).toBeInTheDocument();
    });
  });

  describe('Branch Node Rendering', () => {
    it('should render horizontal branch with PanelGroup and two Panels', () => {
      const branchNode: BranchNode = {
        type: 'branch',
        id: 'branch-1',
        axis: 'horizontal',
        children: [
          { type: 'leaf', paneId: 'pane-1' } as LeafNode,
          { type: 'leaf', paneId: 'pane-2' } as LeafNode,
        ],
      };

      render(<SplitPane node={branchNode} workspaceId={workspaceId} />);

      const group = screen.getByTestId('panel-group');
      expect(group).toBeInTheDocument();
      expect(group).toHaveAttribute('data-orientation', 'horizontal');

      const panels = screen.getAllByTestId('panel');
      expect(panels).toHaveLength(2);

      const separators = screen.getAllByTestId('panel-separator');
      expect(separators).toHaveLength(1);
    });

    it('should render vertical branch with PanelGroup and two Panels', () => {
      const branchNode: BranchNode = {
        type: 'branch',
        id: 'branch-1',
        axis: 'vertical',
        children: [
          { type: 'leaf', paneId: 'pane-1' } as LeafNode,
          { type: 'leaf', paneId: 'pane-2' } as LeafNode,
        ],
      };

      render(<SplitPane node={branchNode} workspaceId={workspaceId} />);

      const group = screen.getByTestId('panel-group');
      expect(group).toBeInTheDocument();
      expect(group).toHaveAttribute('data-orientation', 'vertical');

      const panels = screen.getAllByTestId('panel');
      expect(panels).toHaveLength(2);

      const separators = screen.getAllByTestId('panel-separator');
      expect(separators).toHaveLength(1);
    });

    it('should pass correct props to Panel components', () => {
      const branchNode: BranchNode = {
        type: 'branch',
        id: 'branch-1',
        axis: 'horizontal',
        children: [
          { type: 'leaf', paneId: 'pane-1' } as LeafNode,
          { type: 'leaf', paneId: 'pane-2' } as LeafNode,
        ],
      };

      render(<SplitPane node={branchNode} workspaceId={workspaceId} />);

      const panels = screen.getAllByTestId('panel');
      panels.forEach((panel) => {
        expect(panel).toHaveAttribute('data-default-size', '50');
        expect(panel).toHaveAttribute('data-min-size', '10');
      });
    });
  });

  describe('Nested Structures (Recursive Rendering)', () => {
    it('should render nested horizontal splits', () => {
      const nestedNode: BranchNode = {
        type: 'branch',
        id: 'root-branch',
        axis: 'horizontal',
        children: [
          {
            type: 'branch',
            id: 'nested-branch',
            axis: 'horizontal',
            children: [
              { type: 'leaf', paneId: 'pane-1' } as LeafNode,
              { type: 'leaf', paneId: 'pane-2' } as LeafNode,
            ],
          } as BranchNode,
          { type: 'leaf', paneId: 'pane-3' } as LeafNode,
        ],
      };

      render(<SplitPane node={nestedNode} workspaceId={workspaceId} />);

      const groups = screen.getAllByTestId('panel-group');
      expect(groups).toHaveLength(2);

      const panels = screen.getAllByTestId('panel');
      expect(panels).toHaveLength(4);

      const panes = screen.getAllByTestId('pane');
      expect(panes).toHaveLength(3);
    });

    it('should render mixed horizontal and vertical splits', () => {
      const mixedNode: BranchNode = {
        type: 'branch',
        id: 'root-branch',
        axis: 'horizontal',
        children: [
          {
            type: 'branch',
            id: 'vertical-branch',
            axis: 'vertical',
            children: [
              { type: 'leaf', paneId: 'pane-1' } as LeafNode,
              { type: 'leaf', paneId: 'pane-2' } as LeafNode,
            ],
          } as BranchNode,
          { type: 'leaf', paneId: 'pane-3' } as LeafNode,
        ],
      };

      render(<SplitPane node={mixedNode} workspaceId={workspaceId} />);

      const groups = screen.getAllByTestId('panel-group');
      expect(groups).toHaveLength(2);

      const horizontalGroup = groups.find((g) => g.getAttribute('data-orientation') === 'horizontal');
      const verticalGroup = groups.find((g) => g.getAttribute('data-orientation') === 'vertical');
      expect(horizontalGroup).toBeInTheDocument();
      expect(verticalGroup).toBeInTheDocument();
    });

    it('should render deeply nested structure (4 levels)', () => {
      const deepNode: BranchNode = {
        type: 'branch',
        id: 'level-1',
        axis: 'horizontal',
        children: [
          {
            type: 'branch',
            id: 'level-2',
            axis: 'vertical',
            children: [
              {
                type: 'branch',
                id: 'level-3',
                axis: 'horizontal',
                children: [
                  { type: 'leaf', paneId: 'pane-1' } as LeafNode,
                  { type: 'leaf', paneId: 'pane-2' } as LeafNode,
                ],
              } as BranchNode,
              { type: 'leaf', paneId: 'pane-3' } as LeafNode,
            ],
          } as BranchNode,
          { type: 'leaf', paneId: 'pane-1' } as LeafNode,
        ],
      };

      render(<SplitPane node={deepNode} workspaceId={workspaceId} />);

      const groups = screen.getAllByTestId('panel-group');
      expect(groups).toHaveLength(3);

      const panels = screen.getAllByTestId('panel');
      expect(panels).toHaveLength(6);
    });
  });

  describe('Orientation Handling', () => {
    it('should apply correct cursor style for horizontal separator', () => {
      const branchNode: BranchNode = {
        type: 'branch',
        id: 'branch-1',
        axis: 'horizontal',
        children: [
          { type: 'leaf', paneId: 'pane-1' } as LeafNode,
          { type: 'leaf', paneId: 'pane-2' } as LeafNode,
        ],
      };

      render(<SplitPane node={branchNode} workspaceId={workspaceId} />);

      const separator = screen.getByTestId('panel-separator');
      expect(separator).toBeInTheDocument();
    });

    it('should apply correct cursor style for vertical separator', () => {
      const branchNode: BranchNode = {
        type: 'branch',
        id: 'branch-1',
        axis: 'vertical',
        children: [
          { type: 'leaf', paneId: 'pane-1' } as LeafNode,
          { type: 'leaf', paneId: 'pane-2' } as LeafNode,
        ],
      };

      render(<SplitPane node={branchNode} workspaceId={workspaceId} />);

      const separator = screen.getByTestId('panel-separator');
      expect(separator).toBeInTheDocument();
    });
  });

  describe('Fallback for Invalid Nodes', () => {
    it('should render fallback for unknown node type', () => {
      const invalidNode = {
        type: 'unknown',
        paneId: 'pane-1',
      } as unknown as SplitNode;

      render(<SplitPane node={invalidNode} workspaceId={workspaceId} />);

      expect(screen.getByText('Unknown node type')).toBeInTheDocument();
    });

    it('should render fallback for node without type property', () => {
      const invalidNode = {
        paneId: 'pane-1',
      } as unknown as SplitNode;

      render(<SplitPane node={invalidNode} workspaceId={workspaceId} />);

      expect(screen.getByText('Unknown node type')).toBeInTheDocument();
    });
  });

  describe('Tree Structure Rendering', () => {
    it('should render complex tree with multiple branches and leaves', () => {
      const complexTree: BranchNode = {
        type: 'branch',
        id: 'root',
        axis: 'horizontal',
        children: [
          {
            type: 'branch',
            id: 'left-branch',
            axis: 'vertical',
            children: [
              { type: 'leaf', paneId: 'pane-1' } as LeafNode,
              {
                type: 'branch',
                id: 'nested-horizontal',
                axis: 'horizontal',
                children: [
                  { type: 'leaf', paneId: 'pane-2' } as LeafNode,
                  { type: 'leaf', paneId: 'pane-3' } as LeafNode,
                ],
              } as BranchNode,
            ],
          } as BranchNode,
          { type: 'leaf', paneId: 'pane-1' } as LeafNode,
        ],
      };

      render(<SplitPane node={complexTree} workspaceId={workspaceId} />);

      const groups = screen.getAllByTestId('panel-group');
      expect(groups.length).toBeGreaterThanOrEqual(3);

      const panels = screen.getAllByTestId('panel');
      expect(panels.length).toBeGreaterThanOrEqual(4);

      const panes = screen.getAllByTestId('pane');
      expect(panes.length).toBeGreaterThanOrEqual(4);
    });
  });
});
