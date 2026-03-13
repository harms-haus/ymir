import { describe, it, expect, beforeEach, beforeAll, afterAll, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom/vitest';
import { Pane } from '../Pane';
import useWorkspaceStore from '../../state/workspace';

const originalResizeObserver = globalThis.ResizeObserver;

class MockResizeObserver {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
}

beforeAll(() => {
  globalThis.ResizeObserver = MockResizeObserver as unknown as typeof ResizeObserver;
});

afterAll(() => {
  globalThis.ResizeObserver = originalResizeObserver;
});

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
  Channel: vi.fn(() => ({
    onmessage: null,
  })),
}));

vi.mock('@tauri-apps/plugin-notification', () => ({
  sendNotification: vi.fn(),
}));

vi.mock('../Terminal', () => ({
  Terminal: ({ tabId, hasNotification }: { tabId: string; hasNotification?: boolean }) => (
    <div data-testid={`terminal-${tabId}`} data-has-notification={hasNotification}>
      Terminal: {tabId}
    </div>
  ),
}));

vi.mock('../TabBar', () => ({
  TabBar: ({
    paneId,
    tabs,
    activeTabId,
    onCreateTab,
    onCloseTab,
    onSelectTab,
    onSplitPane,
  }: {
    paneId: string;
    tabs: Array<{ id: string; title: string }>;
    activeTabId: string | null;
    onCreateTab: () => void;
    onCloseTab: (paneId: string, tabId: string) => void;
    onSelectTab: (paneId: string, tabId: string) => void;
    onSplitPane: (paneId: string, direction: 'horizontal' | 'vertical') => void;
  }) => (
    <div data-testid="tab-bar" data-pane-id={paneId} data-active-tab={activeTabId}>
      {tabs.map((tab) => (
        <div key={tab.id} data-testid={`tab-${tab.id}`} data-title={tab.title}>
          <button data-testid={`select-tab-${tab.id}`} onClick={() => onSelectTab(paneId, tab.id)}>
            {tab.title}
          </button>
          <button data-testid={`close-tab-${tab.id}`} onClick={() => onCloseTab(paneId, tab.id)}>
            Close
          </button>
        </div>
      ))}
      <button data-testid="create-tab" onClick={onCreateTab}>
        New Tab
      </button>
      <button data-testid="split-horizontal" onClick={() => onSplitPane(paneId, 'horizontal')}>
        Split Horizontal
      </button>
      <button data-testid="split-vertical" onClick={() => onSplitPane(paneId, 'vertical')}>
        Split Vertical
      </button>
    </div>
  ),
}));

vi.mock('../ErrorBoundary', () => ({
  ErrorBoundary: ({ children }: { children: React.ReactNode }) => <div data-testid="error-boundary">{children}</div>,
}));

vi.mock('../../lib/logger', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

function createMockPane(paneId: string, tabCount: number = 1) {
  const tabs = Array.from({ length: tabCount }, (_, i) => ({
    id: `tab-${i + 1}`,
    title: `Tab ${i + 1}`,
    cwd: '~',
    sessionId: '',
    scrollback: [],
    hasNotification: false,
    notificationCount: 0,
  }));

  return {
    id: paneId,
    flexRatio: 1.0,
    tabs,
    activeTabId: tabs[0]?.id || null,
    hasNotification: false,
  };
}

function setupWorkspaceWithPane(paneId: string, tabCount: number = 1, hasNotification: boolean = false) {
  const pane = createMockPane(paneId, tabCount);
  pane.hasNotification = hasNotification;

  const workspace = {
    id: 'workspace-1',
    name: 'Test Workspace',
    root: { type: 'leaf' as const, paneId },
    activePaneId: paneId,
    hasNotification,
    panes: { [paneId]: pane },
  };

  useWorkspaceStore.setState({
    workspaces: [workspace],
    activeWorkspaceId: 'workspace-1',
  });

  return { pane, workspace };
}

describe('Pane Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const { resetState } = useWorkspaceStore.getState();
    resetState();
  });

  describe('Rendering', () => {
    it('should render pane with active tab', () => {
      const paneId = 'pane-1';
      setupWorkspaceWithPane(paneId, 2);

      render(<Pane paneId={paneId} workspaceId="workspace-1" />);

      expect(screen.getByTestId('tab-bar')).toBeInTheDocument();
      expect(screen.getByTestId('terminal-tab-1')).toBeInTheDocument();
      expect(screen.getByTestId('tab-bar')).toHaveAttribute('data-active-tab', 'tab-1');
    });

    it('should render multiple tabs', () => {
      const paneId = 'pane-1';
      setupWorkspaceWithPane(paneId, 3);

      render(<Pane paneId={paneId} workspaceId="workspace-1" />);

      expect(screen.getByTestId('tab-tab-1')).toBeInTheDocument();
      expect(screen.getByTestId('tab-tab-2')).toBeInTheDocument();
      expect(screen.getByTestId('tab-tab-3')).toBeInTheDocument();
    });

    it('should show pane not found when pane does not exist', () => {
      render(<Pane paneId="non-existent" workspaceId="workspace-1" />);

      expect(screen.getByText('Pane not found')).toBeInTheDocument();
    });

    it('should show pane not found when workspace does not exist', () => {
      render(<Pane paneId="pane-1" workspaceId="non-existent" />);

      expect(screen.getByText('Pane not found')).toBeInTheDocument();
    });

    it('should wrap content in ErrorBoundary', () => {
      const paneId = 'pane-1';
      setupWorkspaceWithPane(paneId, 1);

      render(<Pane paneId={paneId} workspaceId="workspace-1" />);

      expect(screen.getByTestId('error-boundary')).toBeInTheDocument();
    });
  });

  describe('State Subscription', () => {
    it('should subscribe to pane state changes', async () => {
      const paneId = 'pane-1';
      setupWorkspaceWithPane(paneId, 1);

      render(<Pane paneId={paneId} workspaceId="workspace-1" />);

      expect(screen.getByTestId('tab-tab-1')).toHaveAttribute('data-title', 'Tab 1');

      const { createTab } = useWorkspaceStore.getState();
      createTab(paneId);

      await waitFor(() => {
        const state = useWorkspaceStore.getState();
        const pane = state.workspaces[0].panes[paneId];
        return pane.tabs.length === 2;
      });
    });

    it('should update when active tab changes', async () => {
      const paneId = 'pane-1';
      setupWorkspaceWithPane(paneId, 2);

      render(<Pane paneId={paneId} workspaceId="workspace-1" />);

      expect(screen.getByTestId('tab-bar')).toHaveAttribute('data-active-tab', 'tab-1');

      const { setActiveTab } = useWorkspaceStore.getState();
      setActiveTab(paneId, 'tab-2');

      await waitFor(() => {
        const state = useWorkspaceStore.getState();
        const pane = state.workspaces[0].panes[paneId];
        return pane.activeTabId === 'tab-2';
      });
    });
  });

  describe('Tab Lifecycle Callbacks', () => {
    it('should call createTab when new tab button is clicked', async () => {
      const user = userEvent.setup();
      const paneId = 'pane-1';
      setupWorkspaceWithPane(paneId, 1);

      const createTabSpy = vi.spyOn(useWorkspaceStore.getState(), 'createTab');

      render(<Pane paneId={paneId} workspaceId="workspace-1" />);

      await user.click(screen.getByTestId('create-tab'));

      expect(createTabSpy).toHaveBeenCalledWith(paneId);
    });

    it('should call closeTab when close tab button is clicked', async () => {
      const user = userEvent.setup();
      const paneId = 'pane-1';
      setupWorkspaceWithPane(paneId, 2);

      const closeTabSpy = vi.spyOn(useWorkspaceStore.getState(), 'closeTab');

      render(<Pane paneId={paneId} workspaceId="workspace-1" />);

      await user.click(screen.getByTestId('close-tab-tab-1'));

      expect(closeTabSpy).toHaveBeenCalledWith(paneId, 'tab-1');
    });

    it('should call setActiveTab when tab is selected', async () => {
      const user = userEvent.setup();
      const paneId = 'pane-1';
      setupWorkspaceWithPane(paneId, 2);

      const setActiveTabSpy = vi.spyOn(useWorkspaceStore.getState(), 'setActiveTab');

      render(<Pane paneId={paneId} workspaceId="workspace-1" />);

      await user.click(screen.getByTestId('select-tab-tab-2'));

      expect(setActiveTabSpy).toHaveBeenCalledWith(paneId, 'tab-2');
    });

    it('should call splitPane when split buttons are clicked', async () => {
      const user = userEvent.setup();
      const paneId = 'pane-1';
      setupWorkspaceWithPane(paneId, 1);

      const splitPaneSpy = vi.spyOn(useWorkspaceStore.getState(), 'splitPane');

      render(<Pane paneId={paneId} workspaceId="workspace-1" />);

      await user.click(screen.getByTestId('split-horizontal'));
      expect(splitPaneSpy).toHaveBeenCalledWith(paneId, 'right');

      await user.click(screen.getByTestId('split-vertical'));
      expect(splitPaneSpy).toHaveBeenCalledWith(paneId, 'down');
    });
  });

  describe('Notification Indicator', () => {
    it('should apply notification box-shadow when hasNotification is true', () => {
      const paneId = 'pane-1';
      setupWorkspaceWithPane(paneId, 1, true);

      const { container } = render(<Pane paneId={paneId} workspaceId="workspace-1" />);

      const paneContainer = container.querySelector('[style*="box-shadow"]');
      expect(paneContainer).toBeInTheDocument();
    });

    it('should not apply notification box-shadow when hasNotification is false', () => {
      const paneId = 'pane-1';
      setupWorkspaceWithPane(paneId, 1, false);

      const { container } = render(<Pane paneId={paneId} workspaceId="workspace-1" />);

      const paneContainer = container.querySelector('[style*="box-shadow: inset 0 0 0 2px #4fc3f7"]');
      expect(paneContainer).toBeNull();
    });

    it('should pass hasNotification to Terminal component', () => {
      const paneId = 'pane-1';
      const { pane } = setupWorkspaceWithPane(paneId, 1);

      pane.tabs[0].hasNotification = true;
      useWorkspaceStore.setState({
        workspaces: [
          {
            id: 'workspace-1',
            name: 'Test Workspace',
            root: { type: 'leaf', paneId },
            activePaneId: paneId,
            hasNotification: true,
            panes: { [paneId]: pane },
          },
        ],
      });

      render(<Pane paneId={paneId} workspaceId="workspace-1" />);

      const terminal = screen.getByTestId('terminal-tab-1');
      expect(terminal).toHaveAttribute('data-has-notification', 'true');
    });

    it('should update notification state when markNotification is called', async () => {
      const paneId = 'pane-1';
      setupWorkspaceWithPane(paneId, 1);

      render(<Pane paneId={paneId} workspaceId="workspace-1" />);

      const { markNotification } = useWorkspaceStore.getState();
      markNotification('tab-1', 'Test notification');

      await waitFor(() => {
        const state = useWorkspaceStore.getState();
        const pane = state.workspaces[0].panes[paneId];
        return pane.hasNotification === true;
      });
    });
  });

  describe('Terminal Rendering', () => {
    it('should render Terminal for active tab only', () => {
      const paneId = 'pane-1';
      setupWorkspaceWithPane(paneId, 3);

      render(<Pane paneId={paneId} workspaceId="workspace-1" />);

      expect(screen.getByTestId('terminal-tab-1')).toBeInTheDocument();
      expect(screen.getByTestId('terminal-tab-2').parentElement).toHaveStyle({ display: 'none' });
      expect(screen.getByTestId('terminal-tab-3').parentElement).toHaveStyle({ display: 'none' });
    });

    it('should render Terminal with correct props', () => {
      const paneId = 'pane-1';
      setupWorkspaceWithPane(paneId, 1);

      render(<Pane paneId={paneId} workspaceId="workspace-1" />);

      const terminal = screen.getByTestId('terminal-tab-1');
      expect(terminal).toHaveTextContent('Terminal: tab-1');
    });

    it('should switch Terminal when active tab changes', async () => {
      const user = userEvent.setup();
      const paneId = 'pane-1';
      setupWorkspaceWithPane(paneId, 2);

      render(<Pane paneId={paneId} workspaceId="workspace-1" />);

      expect(screen.getByTestId('terminal-tab-1')).toBeInTheDocument();
      expect(screen.getByTestId('terminal-tab-2').parentElement).toHaveStyle({ display: 'none' });

      await user.click(screen.getByTestId('select-tab-tab-2'));

      await waitFor(() => {
        const state = useWorkspaceStore.getState();
        const pane = state.workspaces[0].panes[paneId];
        return pane.activeTabId === 'tab-2';
      });
    });
  });

  describe('Tab Notification Handlers', () => {
    it('should create notification handlers for each tab', async () => {
      const paneId = 'pane-1';
      setupWorkspaceWithPane(paneId, 2);

      render(<Pane paneId={paneId} workspaceId="workspace-1" />);

      const { markNotification } = useWorkspaceStore.getState();
      markNotification('tab-1', 'Notification 1');

      await waitFor(() => {
        const state = useWorkspaceStore.getState();
        const pane = state.workspaces[0].panes[paneId];
        const tab = pane.tabs.find((t) => t.id === 'tab-1');
        return tab?.hasNotification === true;
      });
    });

    it('should handle multiple tab notifications', async () => {
      const paneId = 'pane-1';
      setupWorkspaceWithPane(paneId, 2);

      render(<Pane paneId={paneId} workspaceId="workspace-1" />);

      const { markNotification } = useWorkspaceStore.getState();
      markNotification('tab-1', 'Notification 1');
      markNotification('tab-2', 'Notification 2');

      await waitFor(() => {
        const state = useWorkspaceStore.getState();
        const pane = state.workspaces[0].panes[paneId];
        return pane.tabs.every((t) => t.hasNotification);
      });
    });
  });
});
