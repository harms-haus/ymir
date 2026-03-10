import type { Workspace, Pane, Tab, SplitNode, LeafNode, BranchNode, TabType } from '../state/types';

let idCounter = 0;

/**
 * Generate a unique ID with an optional prefix
 */
function generateId(prefix = 'id'): string {
  idCounter += 1;
  return `${prefix}-${idCounter}`;
}

/**
 * Reset the ID counter (useful for test isolation)
 */
export function resetIdCounter(): void {
  idCounter = 0;
}

/**
 * Create a mock Tab with sensible defaults
 */
export function createMockTab(overrides?: Partial<Tab>): Tab {
  const id = overrides?.id ?? generateId('tab');
  return {
    id,
    type: 'terminal' as TabType,
    title: 'bash',
    cwd: '/home/user',
    sessionId: crypto.randomUUID(),
    scrollback: [],
    hasNotification: false,
    notificationCount: 0,
    ...overrides,
  };
}

/**
 * Create a mock Pane with sensible defaults
 */
export function createMockPane(overrides?: Partial<Pane>): Pane {
  const id = overrides?.id ?? generateId('pane');
  const tab = createMockTab();
  return {
    id,
    tabs: [tab],
    activeTabId: tab.id,
    flexRatio: 1,
    hasNotification: false,
    ...overrides,
  };
}

/**
 * Create a mock LeafNode
 */
export function createMockLeafNode(paneId?: string): LeafNode {
  return {
    type: 'leaf',
    paneId: paneId ?? generateId('pane'),
  };
}

/**
 * Create a mock BranchNode
 */
export function createMockBranchNode(
  children?: [SplitNode, SplitNode],
  axis?: 'horizontal' | 'vertical'
): BranchNode {
  return {
    type: 'branch',
    id: generateId('branch'),
    axis: axis ?? 'horizontal',
    children: children ?? [createMockLeafNode(), createMockLeafNode()],
  };
}

/**
 * Create a mock SplitNode (leaf by default)
 */
export function createMockSplitNode(
  type?: 'leaf' | 'branch',
  overrides?: { paneId?: string; children?: [SplitNode, SplitNode]; axis?: 'horizontal' | 'vertical' }
): SplitNode {
  if (type === 'branch') {
    return createMockBranchNode(overrides?.children, overrides?.axis);
  }
  return createMockLeafNode(overrides?.paneId);
}

/**
 * Create a mock Workspace with sensible defaults
 */
export function createMockWorkspace(overrides?: Partial<Workspace>): Workspace {
  const id = overrides?.id ?? generateId('workspace');
  const pane = createMockPane();
  
  return {
    id,
    name: `Workspace ${id}`,
    root: {
      type: 'leaf',
      paneId: pane.id,
    },
    activePaneId: pane.id,
    hasNotification: false,
    ...overrides,
  };
}

/**
 * Create a mock workspace with multiple panes
 */
export function createMockWorkspaceWithPanes(paneCount: number): { workspace: Workspace; panes: Pane[] } {
  const workspaceId = generateId('workspace');
  const panes: Pane[] = [];
  
  for (let i = 0; i < paneCount; i++) {
    panes.push(createMockPane());
  }
  
  const workspace: Workspace = {
    id: workspaceId,
    name: `Workspace ${workspaceId}`,
    root: {
      type: 'leaf',
      paneId: panes[0].id,
    },
    activePaneId: panes[0].id,
    hasNotification: false,
  };
  
  return { workspace, panes };
}
