import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { TabHeaderPanel } from '../TabHeaderPanel';
import { PanelDefinition, SidebarTab } from '../../state/types';

const mockPanels: PanelDefinition[] = [
  {
    id: 'workspaces' as SidebarTab,
    title: 'Workspaces',
    icon: () => <svg data-testid="workspaces-icon" />,
    badge: () => null,
    fullRender: () => <div data-testid="workspaces-content">Workspaces Content</div>,
    collapsedRender: () => <div data-testid="workspaces-collapsed">Workspaces Collapsed</div>,
  },
  {
    id: 'notifications' as SidebarTab,
    title: 'Notifications',
    icon: () => <svg data-testid="notifications-icon" />,
    badge: () => ({ count: 5 }),
    fullRender: () => <div data-testid="notifications-content">Notifications Content</div>,
  },
  {
    id: 'git' as SidebarTab,
    title: 'Git',
    icon: () => <svg data-testid="git-icon" />,
    badge: () => ({ count: 150 }),
    fullRender: () => <div data-testid="git-content">Git Content</div>,
  },
  {
    id: 'project' as SidebarTab,
    title: 'Project',
    icon: () => <svg data-testid="project-icon" />,
    badge: () => null,
    fullRender: () => <div data-testid="project-content">Project Content</div>,
  },
];

describe('TabHeaderPanel', () => {
  const mockOnTabClick = vi.fn();
  const mockOnToggleSidebar = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Expanded State', () => {
    it('should render in expanded state', () => {
      const { container } = render(
        <TabHeaderPanel
          panels={mockPanels}
          activeTab="workspaces"
          isCollapsed={false}
          onTabClick={mockOnTabClick}
          onToggleSidebar={mockOnToggleSidebar}
        />
      );

      expect(container.querySelector('.tab-header-panel')).not.toHaveClass('collapsed');
    });

    it('should render horizontal tab headers when expanded', () => {
      const { container } = render(
        <TabHeaderPanel
          panels={mockPanels}
          activeTab="workspaces"
          isCollapsed={false}
          onTabClick={mockOnTabClick}
          onToggleSidebar={mockOnToggleSidebar}
        />
      );

      expect(container.querySelector('.tab-headers-horizontal')).toBeInTheDocument();
    });

    it('should render all panel tabs', () => {
      render(
        <TabHeaderPanel
          panels={mockPanels}
          activeTab="workspaces"
          isCollapsed={false}
          onTabClick={mockOnTabClick}
          onToggleSidebar={mockOnToggleSidebar}
        />
      );

      expect(screen.getByTestId('workspaces-icon')).toBeInTheDocument();
      expect(screen.getByTestId('notifications-icon')).toBeInTheDocument();
      expect(screen.getByTestId('git-icon')).toBeInTheDocument();
      expect(screen.getByTestId('project-icon')).toBeInTheDocument();
    });

    it('should mark active tab', () => {
      const { container } = render(
        <TabHeaderPanel
          panels={mockPanels}
          activeTab="notifications"
          isCollapsed={false}
          onTabClick={mockOnTabClick}
          onToggleSidebar={mockOnToggleSidebar}
        />
      );

      const buttons = container.querySelectorAll('.tab-button');
      expect(buttons[1]).toHaveClass('active');
    });

    it('should call onTabClick when tab is clicked', () => {
      const { container } = render(
        <TabHeaderPanel
          panels={mockPanels}
          activeTab="workspaces"
          isCollapsed={false}
          onTabClick={mockOnTabClick}
          onToggleSidebar={mockOnToggleSidebar}
        />
      );

      const tabButtons = container.querySelectorAll('.tab-button');
      fireEvent.click(tabButtons[1]);

      expect(mockOnTabClick).toHaveBeenCalledWith('notifications');
    });

    it('should call onToggleSidebar when collapse button clicked', () => {
      const { container } = render(
        <TabHeaderPanel
          panels={mockPanels}
          activeTab="workspaces"
          isCollapsed={false}
          onTabClick={mockOnTabClick}
          onToggleSidebar={mockOnToggleSidebar}
        />
      );

      const collapseButton = container.querySelector('.collapse-button');
      if (collapseButton) {
        fireEvent.click(collapseButton);
        expect(mockOnToggleSidebar).toHaveBeenCalled();
      }
    });

    it('should render full panel content', () => {
      const { container } = render(
        <TabHeaderPanel
          panels={mockPanels}
          activeTab="workspaces"
          isCollapsed={false}
          onTabClick={mockOnTabClick}
          onToggleSidebar={mockOnToggleSidebar}
        />
      );

      expect(container.querySelector('.tab-panel-content')).toBeInTheDocument();
    });
  });

  describe('Collapsed State', () => {
    it('should render in collapsed state', () => {
      const { container } = render(
        <TabHeaderPanel
          panels={mockPanels}
          activeTab="workspaces"
          isCollapsed={true}
          onTabClick={mockOnTabClick}
          onToggleSidebar={mockOnToggleSidebar}
        />
      );

      expect(container.querySelector('.tab-header-panel')).toHaveClass('collapsed');
    });

    it('should render vertical tab headers when collapsed', () => {
      const { container } = render(
        <TabHeaderPanel
          panels={mockPanels}
          activeTab="workspaces"
          isCollapsed={true}
          onTabClick={mockOnTabClick}
          onToggleSidebar={mockOnToggleSidebar}
        />
      );

      expect(container.querySelector('.tab-headers-vertical')).toBeInTheDocument();
    });

    it('should render collapse button in collapsed state', () => {
      const { container } = render(
        <TabHeaderPanel
          panels={mockPanels}
          activeTab="workspaces"
          isCollapsed={true}
          onTabClick={mockOnTabClick}
          onToggleSidebar={mockOnToggleSidebar}
        />
      );

      const collapseButton = container.querySelector('.collapse-button');
      expect(collapseButton).toBeInTheDocument();
    });

    it('should call onToggleSidebar when expand button clicked', () => {
      const { container } = render(
        <TabHeaderPanel
          panels={mockPanels}
          activeTab="workspaces"
          isCollapsed={true}
          onTabClick={mockOnTabClick}
          onToggleSidebar={mockOnToggleSidebar}
        />
      );

      const collapseButton = container.querySelector('.collapse-button');
      if (collapseButton) {
        fireEvent.click(collapseButton);
        expect(mockOnToggleSidebar).toHaveBeenCalled();
      }
    });

    it('should render collapsed panel content when collapsedRender exists', () => {
      const { container } = render(
        <TabHeaderPanel
          panels={mockPanels}
          activeTab="workspaces"
          isCollapsed={true}
          onTabClick={mockOnTabClick}
          onToggleSidebar={mockOnToggleSidebar}
        />
      );

      expect(screen.getByTestId('workspaces-collapsed')).toBeInTheDocument();
    });

    it('should render null content when no collapsedRender and collapsed', () => {
      const { container } = render(
        <TabHeaderPanel
          panels={mockPanels}
          activeTab="notifications"
          isCollapsed={true}
          onTabClick={mockOnTabClick}
          onToggleSidebar={mockOnToggleSidebar}
        />
      );

      const panelContent = container.querySelector('.tab-panel-content');
      expect(panelContent).toBeNull();
    });
  });

  describe('Badge Display', () => {
    it('should display badge count for notifications', () => {
      const { container } = render(
        <TabHeaderPanel
          panels={mockPanels}
          activeTab="workspaces"
          isCollapsed={false}
          onTabClick={mockOnTabClick}
          onToggleSidebar={mockOnToggleSidebar}
        />
      );

      const badges = container.querySelectorAll('.tab-badge');
      expect(badges.length).toBeGreaterThan(0);
      expect(badges[0]).toHaveTextContent('5');
    });

    it('should display "99+" for counts over 99', () => {
      const { container } = render(
        <TabHeaderPanel
          panels={mockPanels}
          activeTab="workspaces"
          isCollapsed={false}
          onTabClick={mockOnTabClick}
          onToggleSidebar={mockOnToggleSidebar}
        />
      );

      const badges = container.querySelectorAll('.tab-badge');
      const gitBadge = Array.from(badges).find(badge => badge.textContent === '99+');
      expect(gitBadge).toBeDefined();
    });

    it('should not show badge when count is undefined', () => {
      const panelsWithoutBadge: PanelDefinition[] = [
        {
          id: 'test' as SidebarTab,
          title: 'Test',
          icon: () => <svg data-testid="test-icon" />,
          badge: () => ({ count: undefined as unknown as number }),
          fullRender: () => <div>Test Content</div>,
        },
      ];

      const { container } = render(
        <TabHeaderPanel
          panels={panelsWithoutBadge}
          activeTab="test"
          isCollapsed={false}
          onTabClick={mockOnTabClick}
          onToggleSidebar={mockOnToggleSidebar}
        />
      );

      const badges = container.querySelectorAll('.tab-badge');
      expect(badges.length).toBe(0);
    });

    it('should not show badge when badge function returns null', () => {
      const { container } = render(
        <TabHeaderPanel
          panels={mockPanels}
          activeTab="workspaces"
          isCollapsed={false}
          onTabClick={mockOnTabClick}
          onToggleSidebar={mockOnToggleSidebar}
        />
      );

      const tabButtons = container.querySelectorAll('.tab-button');
      const projectButton = tabButtons[3];
      const badge = projectButton.querySelector('.tab-badge');
      expect(badge).toBeNull();
    });
  });

  describe('Auto-expand Behavior', () => {
    it('should auto-expand sidebar when clicking tab without collapsedRender while collapsed', () => {
      const { container } = render(
        <TabHeaderPanel
          panels={mockPanels}
          activeTab="workspaces"
          isCollapsed={true}
          onTabClick={mockOnTabClick}
          onToggleSidebar={mockOnToggleSidebar}
        />
      );

      const tabButtons = container.querySelectorAll('.tab-button-vertical');
      const notificationsButton = tabButtons[1];
      fireEvent.click(notificationsButton);

      expect(mockOnToggleSidebar).toHaveBeenCalled();
      expect(mockOnTabClick).toHaveBeenCalledWith('notifications');
    });

    it('should not auto-expand when tab has collapsedRender', () => {
      const { container } = render(
        <TabHeaderPanel
          panels={mockPanels}
          activeTab="notifications"
          isCollapsed={true}
          onTabClick={mockOnTabClick}
          onToggleSidebar={mockOnToggleSidebar}
        />
      );

      const tabButtons = container.querySelectorAll('.tab-button-vertical');
      const workspacesButton = tabButtons[0];
      fireEvent.click(workspacesButton);

      expect(mockOnToggleSidebar).not.toHaveBeenCalled();
      expect(mockOnTabClick).toHaveBeenCalledWith('workspaces');
    });

    it('should not auto-expand when not collapsed', () => {
      const { container } = render(
        <TabHeaderPanel
          panels={mockPanels}
          activeTab="workspaces"
          isCollapsed={false}
          onTabClick={mockOnTabClick}
          onToggleSidebar={mockOnToggleSidebar}
        />
      );

      const tabButtons = container.querySelectorAll('.tab-button');
      const notificationsButton = tabButtons[1];
      fireEvent.click(notificationsButton);

      expect(mockOnToggleSidebar).not.toHaveBeenCalled();
    });
  });

  describe('Double Click', () => {
    it('should toggle sidebar on double click', () => {
      const { container } = render(
        <TabHeaderPanel
          panels={mockPanels}
          activeTab="workspaces"
          isCollapsed={false}
          onTabClick={mockOnTabClick}
          onToggleSidebar={mockOnToggleSidebar}
        />
      );

      const panel = container.querySelector('.tab-header-panel');
      if (panel) {
        fireEvent.doubleClick(panel);
        expect(mockOnToggleSidebar).toHaveBeenCalled();
      }
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty panels array', () => {
      const { container } = render(
        <TabHeaderPanel
          panels={[]}
          activeTab="workspaces"
          isCollapsed={false}
          onTabClick={mockOnTabClick}
          onToggleSidebar={mockOnToggleSidebar}
        />
      );

      expect(container.querySelector('.tab-header-panel')).toBeInTheDocument();
    });

    it('should handle active tab not in panels', () => {
      const { container } = render(
        <TabHeaderPanel
          panels={mockPanels}
          activeTab={"nonexistent" as SidebarTab}
          isCollapsed={false}
          onTabClick={mockOnTabClick}
          onToggleSidebar={mockOnToggleSidebar}
        />
      );

      expect(container.querySelector('.tab-panel-content')).toBeNull();
    });

    it('should render vertical tabs in collapsed mode with badges', () => {
      const { container } = render(
        <TabHeaderPanel
          panels={mockPanels}
          activeTab="workspaces"
          isCollapsed={true}
          onTabClick={mockOnTabClick}
          onToggleSidebar={mockOnToggleSidebar}
        />
      );

      const verticalButtons = container.querySelectorAll('.tab-button-vertical');
      expect(verticalButtons.length).toBe(4);

      const badges = container.querySelectorAll('.tab-badge');
      expect(badges.length).toBeGreaterThan(0);
    });
  });
});
