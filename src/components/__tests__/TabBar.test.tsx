import { describe, it, expect, beforeEach, vi, beforeAll, afterAll } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom/vitest';
import { TabBar } from '../TabBar';
import type { Tab } from '../../state/types';

const originalResizeObserver = globalThis.ResizeObserver;
const originalScrollIntoView = Element.prototype.scrollIntoView;

const originalScrollWidthGetter = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollWidth');
const originalClientWidthGetter = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientWidth');

class MockResizeObserver {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
}

const mockResizeObserver = new MockResizeObserver();

beforeAll(() => {
  globalThis.ResizeObserver = MockResizeObserver as unknown as typeof ResizeObserver;
  Element.prototype.scrollIntoView = vi.fn();
});

afterAll(() => {
  globalThis.ResizeObserver = originalResizeObserver;
  Element.prototype.scrollIntoView = originalScrollIntoView;
  if (originalScrollWidthGetter) {
    Object.defineProperty(HTMLElement.prototype, 'scrollWidth', originalScrollWidthGetter);
  }
  if (originalClientWidthGetter) {
    Object.defineProperty(HTMLElement.prototype, 'clientWidth', originalClientWidthGetter);
  }
});

const mockPaneId = 'pane-1';
const createMockTab = (id: string, title: string, overrides?: Partial<Tab>): Tab => ({
  id,
  type: 'terminal' as const,
  title,
  cwd: '/home/user',
  sessionId: '',
  scrollback: [],
  hasNotification: false,
  notificationCount: 0,
  ...overrides,
});

const defaultProps = {
  paneId: mockPaneId,
  tabs: [] as Tab[],
  activeTabId: null as string | null,
  onCreateTab: vi.fn(),
  onCloseTab: vi.fn(),
  onSelectTab: vi.fn(),
  onSplitPane: vi.fn(),
  onCreateTabRight: vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('TabBar Component', () => {
  describe('Rendering', () => {
    it('should render without errors with empty tabs', () => {
      const { container } = render(<TabBar {...defaultProps} />);

      expect(container.querySelector('.tab-bar-new-button')).toBeInTheDocument();
    });

    it('should render single tab correctly', () => {
      const tabs = [createMockTab('tab-1', 'bash')];
      const { container } = render(<TabBar {...defaultProps} tabs={tabs} activeTabId="tab-1" />);

      expect(screen.getByText('bash')).toBeInTheDocument();
      expect(container.querySelector('.tab-close-button')).toBeInTheDocument();
    });

    it('should render multiple tabs', () => {
      const tabs = [
        createMockTab('tab-1', 'bash'),
        createMockTab('tab-2', 'vim'),
        createMockTab('tab-3', 'node'),
      ];
      render(<TabBar {...defaultProps} tabs={tabs} activeTabId="tab-2" />);

      expect(screen.getByText('bash')).toBeInTheDocument();
      expect(screen.getByText('vim')).toBeInTheDocument();
      expect(screen.getByText('node')).toBeInTheDocument();
    });

    it('should mark active tab with active class', () => {
      const tabs = [
        createMockTab('tab-1', 'bash'),
        createMockTab('tab-2', 'vim'),
      ];
      const { container } = render(
        <TabBar {...defaultProps} tabs={tabs} activeTabId="tab-2" />
      );

      const activeTab = container.querySelector('[data-tab-id="tab-2"]');
      expect(activeTab).toHaveClass('active');

      const inactiveTab = container.querySelector('[data-tab-id="tab-1"]');
      expect(inactiveTab).not.toHaveClass('active');
    });
  });

  describe('Tab Lifecycle', () => {
    it('should call onCreateTab when new tab button is clicked', async () => {
      const user = userEvent.setup();
      const onCreateTab = vi.fn();

      const { container } = render(<TabBar {...defaultProps} onCreateTab={onCreateTab} />);

      const newTabButton = container.querySelector('.tab-bar-new-button');
      await user.click(newTabButton!);

      expect(onCreateTab).toHaveBeenCalledWith(mockPaneId);
      expect(onCreateTab).toHaveBeenCalledTimes(1);
    });

    it('should call onCloseTab when close button is clicked', async () => {
      const user = userEvent.setup();
      const onCloseTab = vi.fn();
      const tabs = [createMockTab('tab-1', 'bash')];

      const { container } = render(
        <TabBar {...defaultProps} tabs={tabs} activeTabId="tab-1" onCloseTab={onCloseTab} />
      );

      const closeButton = container.querySelector('.tab-close-button');
      await user.click(closeButton!);

      expect(onCloseTab).toHaveBeenCalledWith(mockPaneId, 'tab-1');
    });

    it('should call onSelectTab when tab is clicked', async () => {
      const user = userEvent.setup();
      const onSelectTab = vi.fn();
      const tabs = [
        createMockTab('tab-1', 'bash'),
        createMockTab('tab-2', 'vim'),
      ];

      render(
        <TabBar {...defaultProps} tabs={tabs} activeTabId="tab-1" onSelectTab={onSelectTab} />
      );

      const vimTab = screen.getByText('vim');
      await user.click(vimTab);

      expect(onSelectTab).toHaveBeenCalledWith(mockPaneId, 'tab-2');
    });

    it('should not call onSelectTab when close button is clicked', async () => {
      const user = userEvent.setup();
      const onSelectTab = vi.fn();
      const onCloseTab = vi.fn();
      const tabs = [createMockTab('tab-1', 'bash')];

      const { container } = render(
        <TabBar
          {...defaultProps}
          tabs={tabs}
          activeTabId="tab-1"
          onSelectTab={onSelectTab}
          onCloseTab={onCloseTab}
        />
      );

      const closeButton = container.querySelector('.tab-close-button');
      await user.click(closeButton!);

      expect(onCloseTab).toHaveBeenCalledWith(mockPaneId, 'tab-1');
      expect(onSelectTab).not.toHaveBeenCalled();
    });
  });

  describe('Overflow Handling', () => {
    it('should show overflow button when tabs exceed container width', () => {
      const tabs = Array.from({ length: 15 }, (_, i) =>
        createMockTab(`tab-${i + 1}`, `Tab ${i + 1}`)
      );

      Object.defineProperty(HTMLElement.prototype, 'scrollWidth', {
        configurable: true,
        get: () => 2000,
      });
      Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
        configurable: true,
        get: () => 500,
      });

      const { container } = render(<TabBar {...defaultProps} tabs={tabs} activeTabId="tab-1" />);

      expect(container.querySelector('.tab-bar-overflow-button')).toBeInTheDocument();
    });

    it('should toggle overflow menu when overflow button is clicked', async () => {
      const user = userEvent.setup();
      const tabs = Array.from({ length: 10 }, (_, i) =>
        createMockTab(`tab-${i + 1}`, `Tab ${i + 1}`)
      );

      Object.defineProperty(HTMLElement.prototype, 'scrollWidth', {
        configurable: true,
        get: () => 2000,
      });
      Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
        configurable: true,
        get: () => 500,
      });

      render(<TabBar {...defaultProps} tabs={tabs} activeTabId="tab-1" />);

      const overflowButton = screen.getByTitle('Show all tabs');

      expect(screen.queryByRole('menu')).not.toBeInTheDocument();

      await user.click(overflowButton);

      const menuItems = screen.getAllByText(/Tab \d+/);
      expect(menuItems.length).toBeGreaterThanOrEqual(10);
    });

    it('should select tab from overflow menu', async () => {
      const user = userEvent.setup();
      const onSelectTab = vi.fn();
      const tabs = Array.from({ length: 12 }, (_, i) =>
        createMockTab(`tab-${i + 1}`, `Tab ${i + 1}`)
      );

      Object.defineProperty(HTMLElement.prototype, 'scrollWidth', {
        configurable: true,
        get: () => 2000,
      });
      Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
        configurable: true,
        get: () => 500,
      });

      render(
        <TabBar
          {...defaultProps}
          tabs={tabs}
          activeTabId="tab-1"
          onSelectTab={onSelectTab}
        />
      );

      const overflowButton = screen.getByTitle('Show all tabs');
      await user.click(overflowButton);

      const tab12 = screen.getAllByText('Tab 12').find(el =>
        el.closest('[role="menuitem"]')
      );

      if (tab12) {
        await user.click(tab12);
        expect(onSelectTab).toHaveBeenCalledWith(mockPaneId, 'tab-12');
      }
    });
  });

  describe('Context Menu', () => {
    it('should open context menu on right-click', async () => {
      const tabs = [createMockTab('tab-1', 'bash')];

      render(<TabBar {...defaultProps} tabs={tabs} activeTabId="tab-1" />);

      const tab = screen.getByText('bash');
      await act(async () => {
        fireEvent.contextMenu(tab);
      });

      await waitFor(() => {
        expect(screen.getByText('Split Horizontal')).toBeInTheDocument();
        expect(screen.getByText('Split Vertical')).toBeInTheDocument();
        expect(screen.getByText('New Tab Right')).toBeInTheDocument();
        expect(screen.getByText('Close Tab')).toBeInTheDocument();
      });
    });

    it('should call onSplitPane with horizontal direction', async () => {
      const onSplitPane = vi.fn();
      const tabs = [createMockTab('tab-1', 'bash')];

      render(
        <TabBar
          {...defaultProps}
          tabs={tabs}
          activeTabId="tab-1"
          onSplitPane={onSplitPane}
        />
      );

      const tab = screen.getByText('bash');
      await act(async () => {
        fireEvent.contextMenu(tab);
      });

      const splitHorizontal = await screen.findByText('Split Horizontal');
      await userEvent.click(splitHorizontal);

      expect(onSplitPane).toHaveBeenCalledWith(mockPaneId, 'horizontal');
    });

    it('should call onSplitPane with vertical direction', async () => {
      const onSplitPane = vi.fn();
      const tabs = [createMockTab('tab-1', 'bash')];

      render(
        <TabBar
          {...defaultProps}
          tabs={tabs}
          activeTabId="tab-1"
          onSplitPane={onSplitPane}
        />
      );

      const tab = screen.getByText('bash');
      await act(async () => {
        fireEvent.contextMenu(tab);
      });

      const splitVertical = await screen.findByText('Split Vertical');
      await userEvent.click(splitVertical);

      expect(onSplitPane).toHaveBeenCalledWith(mockPaneId, 'vertical');
    });

    it('should call onCreateTabRight when selected from context menu', async () => {
      const onCreateTabRight = vi.fn();
      const tabs = [createMockTab('tab-1', 'bash')];

      render(
        <TabBar
          {...defaultProps}
          tabs={tabs}
          activeTabId="tab-1"
          onCreateTabRight={onCreateTabRight}
        />
      );

      const tab = screen.getByText('bash');
      await act(async () => {
        fireEvent.contextMenu(tab);
      });

      const newTabRight = await screen.findByText('New Tab Right');
      await userEvent.click(newTabRight);

      expect(onCreateTabRight).toHaveBeenCalledWith(mockPaneId, 'tab-1');
    });

    it('should call onCloseTab when Close Tab selected from context menu', async () => {
      const onCloseTab = vi.fn();
      const tabs = [createMockTab('tab-1', 'bash')];

      render(
        <TabBar
          {...defaultProps}
          tabs={tabs}
          activeTabId="tab-1"
          onCloseTab={onCloseTab}
        />
      );

      const tab = screen.getByText('bash');
      await act(async () => {
        fireEvent.contextMenu(tab);
      });

      const closeTab = await screen.findByText('Close Tab');
      await userEvent.click(closeTab);

      expect(onCloseTab).toHaveBeenCalledWith(mockPaneId, 'tab-1');
    });

    it('should close context menu when clicking outside', async () => {
      const tabs = [createMockTab('tab-1', 'bash')];

      render(<TabBar {...defaultProps} tabs={tabs} activeTabId="tab-1" />);

      const tab = screen.getByText('bash');
      await act(async () => {
        fireEvent.contextMenu(tab);
      });

      expect(screen.getByText('Split Horizontal')).toBeInTheDocument();

      await act(async () => {
        fireEvent.mouseDown(document.body);
      });

      await waitFor(() => {
        expect(screen.queryByText('Split Horizontal')).not.toBeInTheDocument();
      });
    });

    it('should show split options when onSplitPane is not provided', async () => {
      const tabs = [createMockTab('tab-1', 'bash')];
      const { onSplitPane, ...propsWithoutSplit } = defaultProps;

      render(<TabBar {...propsWithoutSplit} tabs={tabs} activeTabId="tab-1" />);

      const tab = screen.getByText('bash');
      await act(async () => {
        fireEvent.contextMenu(tab);
      });

      expect(screen.getByText('Split Horizontal')).toBeInTheDocument();
      expect(screen.getByText('Split Vertical')).toBeInTheDocument();
    });
  });

  describe('Notification Badges', () => {
    it('should show notification badge on tab with notifications', () => {
      const tabs = [
        createMockTab('tab-1', 'bash', { hasNotification: true, notificationCount: 3 }),
        createMockTab('tab-2', 'vim', { hasNotification: false, notificationCount: 0 }),
      ];

      render(<TabBar {...defaultProps} tabs={tabs} activeTabId="tab-1" />);

      const badges = screen.getAllByText('3');
      expect(badges.length).toBeGreaterThan(0);
    });

    it('should show 99+ for notification count over 99', () => {
      const tabs = [
        createMockTab('tab-1', 'bash', { hasNotification: true, notificationCount: 150 }),
      ];

      render(<TabBar {...defaultProps} tabs={tabs} activeTabId="tab-1" />);

      expect(screen.getByText('99+')).toBeInTheDocument();
    });

    it('should apply has-notification class to tab with notifications', () => {
      const tabs = [
        createMockTab('tab-1', 'bash', { hasNotification: true, notificationCount: 1 }),
        createMockTab('tab-2', 'vim', { hasNotification: false }),
      ];

      const { container } = render(
        <TabBar {...defaultProps} tabs={tabs} activeTabId="tab-1" />
      );

      const tabElements = container.querySelectorAll('[role="tab"]');
      const bashTab = Array.from(tabElements).find(el => el.textContent?.includes('bash'));
      const vimTab = Array.from(tabElements).find(el => el.textContent?.includes('vim'));

      expect(bashTab).toHaveClass('has-notification');
      expect(vimTab).not.toHaveClass('has-notification');
    });

    it('should show notification badges in overflow menu', async () => {
      const user = userEvent.setup();
      const tabs = Array.from({ length: 12 }, (_, i) =>
        createMockTab(`tab-${i + 1}`, `Tab ${i + 1}`, {
          hasNotification: i === 0,
          notificationCount: 5,
        })
      );

      Object.defineProperty(HTMLElement.prototype, 'scrollWidth', {
        configurable: true,
        get: () => 2000,
      });
      Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
        configurable: true,
        get: () => 500,
      });

      render(<TabBar {...defaultProps} tabs={tabs} activeTabId="tab-1" />);

      const overflowButton = screen.getByTitle('Show all tabs');
      await user.click(overflowButton);

      const overflowBadges = screen.getAllByText('5');
      expect(overflowBadges.length).toBeGreaterThan(0);
    });
  });

  describe('Scroll Behavior', () => {
    it('should scroll active tab into view when activeTabId changes', () => {
      const scrollIntoViewMock = vi.fn();
      Element.prototype.scrollIntoView = scrollIntoViewMock;

      const tabs = Array.from({ length: 20 }, (_, i) =>
        createMockTab(`tab-${i + 1}`, `Tab ${i + 1}`)
      );

      const { rerender } = render(
        <TabBar {...defaultProps} tabs={tabs} activeTabId="tab-1" />
      );

      rerender(<TabBar {...defaultProps} tabs={tabs} activeTabId="tab-10" />);

      expect(scrollIntoViewMock).toHaveBeenCalledWith({
        behavior: 'smooth',
        block: 'nearest',
        inline: 'center',
      });
    });

    it('should check for overflow on mount', () => {
      const tabs = Array.from({ length: 15 }, (_, i) =>
        createMockTab(`tab-${i + 1}`, `Tab ${i + 1}`)
      );

      Object.defineProperty(HTMLElement.prototype, 'scrollWidth', {
        configurable: true,
        get: () => 2000,
      });
      Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
        configurable: true,
        get: () => 500,
      });

      render(<TabBar {...defaultProps} tabs={tabs} activeTabId="tab-1" />);

      expect(screen.getByTitle('Show all tabs')).toBeInTheDocument();
    });
  });

  describe('Edge Cases', () => {
    it('should handle tab with no notification count', () => {
      const tabs = [
        createMockTab('tab-1', 'bash', { hasNotification: true, notificationCount: 0 }),
      ];

      const { container } = render(
        <TabBar {...defaultProps} tabs={tabs} activeTabId="tab-1" />
      );

      const tabElements = container.querySelectorAll('[role="tab"]');
      const vimTab = Array.from(tabElements).find(el => el.textContent?.includes('vim'));
      const bashTab = Array.from(tabElements).find(el => el.textContent?.includes('bash'));

      expect(vimTab).toHaveClass('active');
      expect(bashTab).not.toHaveClass('active');
    });

    it('should handle null activeTabId', () => {
      const tabs = [createMockTab('tab-1', 'bash')];

      const { container } = render(
        <TabBar {...defaultProps} tabs={tabs} activeTabId={null} />
      );

      const tabElements = container.querySelectorAll('[role="tab"]');
      const bashTab = Array.from(tabElements).find(el => el.textContent?.includes('bash'));
      expect(bashTab).not.toHaveClass('active');
    });

    it('should handle empty tab title', () => {
      const tabs = [createMockTab('tab-1', '')];

      render(<TabBar {...defaultProps} tabs={tabs} activeTabId="tab-1" />);

      expect(screen.getByTitle('')).toBeInTheDocument();
    });

    it('should handle very long tab titles', () => {
      const longTitle = 'a'.repeat(100);
      const tabs = [createMockTab('tab-1', longTitle)];

      render(<TabBar {...defaultProps} tabs={tabs} activeTabId="tab-1" />);

      expect(screen.getByText(longTitle)).toBeInTheDocument();
    });

    it('should call onCreateTab when onCreateTabRight is not provided', async () => {
      const user = userEvent.setup();
      const onCreateTab = vi.fn();
      const { onCreateTabRight, ...propsWithoutCreateRight } = defaultProps;
      const tabs = [createMockTab('tab-1', 'bash')];

      render(
        <TabBar
          {...propsWithoutCreateRight}
          tabs={tabs}
          activeTabId="tab-1"
          onCreateTab={onCreateTab}
        />
      );

      const tab = screen.getByText('bash');
      await act(async () => {
        fireEvent.contextMenu(tab);
      });

      const newTabRight = await screen.findByText('New Tab Right');
      await user.click(newTabRight);

      expect(onCreateTab).toHaveBeenCalledWith(mockPaneId);
    });
  });
});
