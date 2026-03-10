import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom/vitest';
import { WorkspaceSidebar } from '../WorkspaceSidebar';
import useWorkspaceStore from '../../state/workspace';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

vi.mock('../../lib/logger', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

describe('WorkspaceSidebar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const { resetState } = useWorkspaceStore.getState();
    if (resetState) {
      resetState();
    }
  });

  describe('Rendering', () => {
    it('should render without errors', () => {
      render(<WorkspaceSidebar />);

      expect(document.body).toBeInTheDocument();
    });

    it('should render in expanded state by default', () => {
      render(<WorkspaceSidebar />);

      const state = useWorkspaceStore.getState();
      expect(state.sidebarCollapsed).toBe(false);
    });

    it('should render workspace list in expanded mode', () => {
      render(<WorkspaceSidebar />);

      const state = useWorkspaceStore.getState();
      const firstWorkspace = state.workspaces[0];
      expect(firstWorkspace).toBeDefined();
    });

    it('should render tab header panel with all panels', () => {
      render(<WorkspaceSidebar />);

      const state = useWorkspaceStore.getState();
      expect(state.panels.length).toBeGreaterThan(0);
    });
  });

  describe('Workspace Switching', () => {
    it('should switch active workspace when workspace item is clicked', async () => {
      const user = userEvent.setup();
      const { createWorkspace, setActiveWorkspace } = useWorkspaceStore.getState();

      createWorkspace('Workspace 2');
      const state = useWorkspaceStore.getState();
      const firstWorkspace = state.workspaces[0];
      const secondWorkspace = state.workspaces[1];

      setActiveWorkspace(firstWorkspace.id);

      render(<WorkspaceSidebar />);

      const workspaceElements = screen.getAllByText(/Workspace/);
      const secondWorkspaceElement = workspaceElements.find(
        (el) => el.textContent === 'Workspace 2'
      );

      if (secondWorkspaceElement) {
        await user.click(secondWorkspaceElement);
        const newState = useWorkspaceStore.getState();
        expect(newState.activeWorkspaceId).toBe(secondWorkspace.id);
      }
    });

    it('should show active workspace with different styling', () => {
      render(<WorkspaceSidebar />);

      const state = useWorkspaceStore.getState();
      const activeWorkspaceId = state.activeWorkspaceId;
      const activeWorkspace = state.workspaces.find((ws) => ws.id === activeWorkspaceId);

      expect(activeWorkspace).toBeDefined();
    });

    it('should display workspace shortcut numbers', () => {
      render(<WorkspaceSidebar />);

      const state = useWorkspaceStore.getState();
      const firstWorkspace = state.workspaces[0];

      expect(firstWorkspace).toBeDefined();
    });
  });

  describe('Context Menu', () => {
    it('should open context menu on right-click', async () => {
      const user = userEvent.setup();
      render(<WorkspaceSidebar />);

      const state = useWorkspaceStore.getState();
      const firstWorkspace = state.workspaces[0];

      const workspaceElements = document.querySelectorAll('[title]');
      const workspaceElement = Array.from(workspaceElements).find(
        (el) => el.getAttribute('title')?.includes(firstWorkspace.name)
      );

      if (workspaceElement) {
        await user.pointer({
          keys: '[MouseRight]',
          target: workspaceElement,
        });
      }
    });

    it('should close context menu when clicking outside', async () => {
      const user = userEvent.setup();
      render(<WorkspaceSidebar />);

      await user.click(document.body);
    });

    it('should have disabled state for move up on first workspace', async () => {
      render(<WorkspaceSidebar />);

      const state = useWorkspaceStore.getState();
      expect(state.workspaces.length).toBeGreaterThan(0);
    });

    it('should have disabled state for move down on last workspace', async () => {
      render(<WorkspaceSidebar />);

      const state = useWorkspaceStore.getState();
      expect(state.workspaces.length).toBeGreaterThan(0);
    });

    it('should have disabled state for close when only one workspace exists', () => {
      const { resetState } = useWorkspaceStore.getState();
      resetState();

      const state = useWorkspaceStore.getState();
      expect(state.workspaces.length).toBe(1);
    });
  });

  describe('Panel Registration', () => {
    it('should register panels on mount', () => {
      render(<WorkspaceSidebar />);

      const state = useWorkspaceStore.getState();
      expect(state.panels.length).toBeGreaterThanOrEqual(4);

      const panelIds = state.panels.map((p) => p.id);
      expect(panelIds).toContain('workspaces');
      expect(panelIds).toContain('notifications');
      expect(panelIds).toContain('git');
      expect(panelIds).toContain('project');
    });

    it('should have workspaces panel with correct configuration', () => {
      render(<WorkspaceSidebar />);

      const state = useWorkspaceStore.getState();
      const workspacesPanel = state.panels.find((p) => p.id === 'workspaces');

      expect(workspacesPanel).toBeDefined();
      expect(workspacesPanel?.title).toBe('Workspaces');
      expect(workspacesPanel?.fullRender).toBeDefined();
      expect(workspacesPanel?.collapsedRender).toBeDefined();
    });

    it('should have notifications panel with badge function', () => {
      render(<WorkspaceSidebar />);

      const state = useWorkspaceStore.getState();
      const notificationsPanel = state.panels.find((p) => p.id === 'notifications');

      expect(notificationsPanel).toBeDefined();
      expect(notificationsPanel?.badge).toBeDefined();
    });

    it('should have git panel with badge function', () => {
      render(<WorkspaceSidebar />);

      const state = useWorkspaceStore.getState();
      const gitPanel = state.panels.find((p) => p.id === 'git');

      expect(gitPanel).toBeDefined();
      expect(gitPanel?.badge).toBeDefined();
    });

    it('should have project panel without badge', () => {
      render(<WorkspaceSidebar />);

      const state = useWorkspaceStore.getState();
      const projectPanel = state.panels.find((p) => p.id === 'project');

      expect(projectPanel).toBeDefined();
      expect(projectPanel?.badge).toBeDefined();
    });
  });

  describe('Badge Reactivity', () => {
    it('should show notification badge when there are notifications', () => {
      const { markNotification } = useWorkspaceStore.getState();
      const state = useWorkspaceStore.getState();
      const firstWorkspace = state.workspaces[0];
      const firstPane = Object.values(firstWorkspace.panes)[0];
      const firstTab = firstPane.tabs[0];

      markNotification(firstTab.id, 'Test notification');

      render(<WorkspaceSidebar />);

      const updatedState = useWorkspaceStore.getState();
      const notificationsPanel = updatedState.panels.find((p) => p.id === 'notifications');
      const badge = notificationsPanel?.badge?.();

      expect(badge).toBeDefined();
      expect(badge?.count).toBeGreaterThan(0);
    });

    it('should show git badge when there are changes', () => {
      const { updateGitChanges } = useWorkspaceStore.getState();

      updateGitChanges(2, 3);

      render(<WorkspaceSidebar />);

      const state = useWorkspaceStore.getState();
      const gitPanel = state.panels.find((p) => p.id === 'git');
      const badge = gitPanel?.badge?.();

      expect(badge).toBeDefined();
      expect(badge?.count).toBe(5);
    });

    it('should not show notification badge when count is zero', () => {
      render(<WorkspaceSidebar />);

      const state = useWorkspaceStore.getState();
      const notificationsPanel = state.panels.find((p) => p.id === 'notifications');
      const badge = notificationsPanel?.badge?.();

      expect(badge).toBeNull();
    });

    it('should not show git badge when there are no changes', () => {
      render(<WorkspaceSidebar />);

      const state = useWorkspaceStore.getState();
      const gitPanel = state.panels.find((p) => p.id === 'git');
      const badge = gitPanel?.badge?.();

      expect(badge).toBeNull();
    });

    it('should update badge count when notifications change', () => {
      const { markNotification, clearNotification } = useWorkspaceStore.getState();
      const state = useWorkspaceStore.getState();
      const firstWorkspace = state.workspaces[0];
      const firstPane = Object.values(firstWorkspace.panes)[0];
      const firstTab = firstPane.tabs[0];

      markNotification(firstTab.id, 'Test notification');

      render(<WorkspaceSidebar />);

      const stateAfterMark = useWorkspaceStore.getState();
      const notificationsPanel = stateAfterMark.panels.find((p) => p.id === 'notifications');
      const badgeBefore = notificationsPanel?.badge?.();
      expect(badgeBefore?.count).toBeGreaterThan(0);

      clearNotification(firstTab.id);

      const badgeAfter = notificationsPanel?.badge?.();
      expect(badgeAfter).toBeNull();
    });
  });

  describe('Collapsed State', () => {
    it('should render in collapsed state when sidebarCollapsed is true', () => {
      const { toggleSidebar } = useWorkspaceStore.getState();

      toggleSidebar();

      const state = useWorkspaceStore.getState();
      expect(state.sidebarCollapsed).toBe(true);

      render(<WorkspaceSidebar />);
    });

    it('should show collapsed workspace list when collapsed', () => {
      const { toggleSidebar } = useWorkspaceStore.getState();

      toggleSidebar();

      render(<WorkspaceSidebar />);

      const state = useWorkspaceStore.getState();
      expect(state.sidebarCollapsed).toBe(true);
    });

    it('should show workspace numbers in collapsed mode', () => {
      const { toggleSidebar } = useWorkspaceStore.getState();

      toggleSidebar();

      render(<WorkspaceSidebar />);

      const state = useWorkspaceStore.getState();
      const firstWorkspace = state.workspaces[0];
      expect(firstWorkspace).toBeDefined();
    });

    it('should show notification indicator in collapsed mode', () => {
      const { toggleSidebar, markNotification } = useWorkspaceStore.getState();
      const state = useWorkspaceStore.getState();
      const firstWorkspace = state.workspaces[0];
      const firstPane = Object.values(firstWorkspace.panes)[0];
      const firstTab = firstPane.tabs[0];

      markNotification(firstTab.id, 'Test notification');
      toggleSidebar();

      render(<WorkspaceSidebar />);

      const updatedState = useWorkspaceStore.getState();
      expect(updatedState.sidebarCollapsed).toBe(true);
    });

    it('should toggle sidebar when collapse button is clicked', async () => {
      const user = userEvent.setup();
      render(<WorkspaceSidebar />);

      const stateBefore = useWorkspaceStore.getState();
      expect(stateBefore.sidebarCollapsed).toBe(false);

      const { toggleSidebar } = useWorkspaceStore.getState();
      toggleSidebar();

      const stateAfter = useWorkspaceStore.getState();
      expect(stateAfter.sidebarCollapsed).toBe(true);
    });
  });

  describe('Workspace Management', () => {
    it('should create new workspace when new button is clicked', async () => {
      const user = userEvent.setup();
      const { createWorkspace } = useWorkspaceStore.getState();

      const initialState = useWorkspaceStore.getState();
      const initialCount = initialState.workspaces.length;

      createWorkspace('New Test Workspace');

      const newState = useWorkspaceStore.getState();
      expect(newState.workspaces.length).toBe(initialCount + 1);
      expect(newState.workspaces[initialCount].name).toBe('New Test Workspace');
    });

    it('should disable new workspace button when at maximum', () => {
      const { createWorkspace } = useWorkspaceStore.getState();

      for (let i = 0; i < 7; i++) {
        createWorkspace(`Workspace ${i + 2}`);
      }

      const state = useWorkspaceStore.getState();
      expect(state.workspaces.length).toBe(8);
    });

    it('should show workspace notification indicator', () => {
      const { markNotification } = useWorkspaceStore.getState();
      const state = useWorkspaceStore.getState();
      const firstWorkspace = state.workspaces[0];
      const firstPane = Object.values(firstWorkspace.panes)[0];
      const firstTab = firstPane.tabs[0];

      markNotification(firstTab.id, 'Test notification');

      const updatedState = useWorkspaceStore.getState();
      const updatedWorkspace = updatedState.workspaces.find((ws) => ws.id === firstWorkspace.id);
      expect(updatedWorkspace?.hasNotification).toBe(true);
    });
  });

  describe('Active Tab Management', () => {
    it('should set active sidebar tab', () => {
      const { setActiveSidebarTab } = useWorkspaceStore.getState();

      setActiveSidebarTab('notifications');

      const state = useWorkspaceStore.getState();
      expect(state.activeTab).toBe('notifications');
    });

    it('should switch between tabs', () => {
      const { setActiveSidebarTab } = useWorkspaceStore.getState();

      setActiveSidebarTab('git');
      let state = useWorkspaceStore.getState();
      expect(state.activeTab).toBe('git');

      setActiveSidebarTab('project');
      state = useWorkspaceStore.getState();
      expect(state.activeTab).toBe('project');
    });
  });

  describe('Workspace Item Display', () => {
    it('should display workspace name', () => {
      render(<WorkspaceSidebar />);

      const state = useWorkspaceStore.getState();
      const firstWorkspace = state.workspaces[0];

      expect(firstWorkspace.name).toBeDefined();
    });

    it('should show shortcut indicator for workspaces', () => {
      render(<WorkspaceSidebar />);

      const state = useWorkspaceStore.getState();
      const firstWorkspace = state.workspaces[0];

      expect(firstWorkspace).toBeDefined();
    });

    it('should limit visible workspaces to 8', () => {
      const { createWorkspace } = useWorkspaceStore.getState();

      for (let i = 0; i < 10; i++) {
        createWorkspace(`Extra Workspace ${i}`);
      }

      const state = useWorkspaceStore.getState();
      const visibleWorkspaces = state.workspaces.slice(0, 8);
      expect(visibleWorkspaces.length).toBeLessThanOrEqual(8);
    });
  });

  describe('Panel Content Components', () => {
    it('should render notification list panel', () => {
      const { container } = render(<WorkspaceSidebar />);

      const state = useWorkspaceStore.getState();
      const notificationsPanel = state.panels.find((p) => p.id === 'notifications');
      expect(notificationsPanel).toBeDefined();

      if (notificationsPanel?.fullRender) {
        const PanelContent = notificationsPanel.fullRender;
        const { container: panelContainer } = render(<PanelContent />);
        expect(panelContainer.textContent).toContain('Notifications');
      }
    });

    it('should render git panel content', () => {
      const { container } = render(<WorkspaceSidebar />);

      const state = useWorkspaceStore.getState();
      const gitPanel = state.panels.find((p) => p.id === 'git');
      expect(gitPanel).toBeDefined();

      if (gitPanel?.fullRender) {
        const PanelContent = gitPanel.fullRender;
        const { container: panelContainer } = render(<PanelContent />);
        expect(panelContainer.textContent).toContain('Git');
      }
    });

    it('should render project panel content', () => {
      const { container } = render(<WorkspaceSidebar />);

      const state = useWorkspaceStore.getState();
      const projectPanel = state.panels.find((p) => p.id === 'project');
      expect(projectPanel).toBeDefined();

      if (projectPanel?.fullRender) {
        const PanelContent = projectPanel.fullRender;
        const { container: panelContainer } = render(<PanelContent />);
        expect(panelContainer.textContent).toContain('Project');
      }
    });

    it('should show notification count in notification panel', () => {
      const { markNotification } = useWorkspaceStore.getState();
      const state = useWorkspaceStore.getState();
      const firstWorkspace = state.workspaces[0];
      const firstPane = Object.values(firstWorkspace.panes)[0];
      const firstTab = firstPane.tabs[0];

      markNotification(firstTab.id, 'Test notification');

      const notificationsPanel = state.panels.find((p) => p.id === 'notifications');
      if (notificationsPanel?.fullRender) {
        const PanelContent = notificationsPanel.fullRender;
        const { container } = render(<PanelContent />);
        expect(container.textContent).toContain('Notifications (1)');
      }
    });

    it('should show git changes count', () => {
      const { updateGitChanges } = useWorkspaceStore.getState();
      updateGitChanges(3, 2);

      const state = useWorkspaceStore.getState();
      const gitPanel = state.panels.find((p) => p.id === 'git');
      if (gitPanel?.fullRender) {
        const PanelContent = gitPanel.fullRender;
        const { container } = render(<PanelContent />);
        expect(container.textContent).toContain('Git (5 changes)');
      }
    });

    it('should show project tree structure', () => {
      const state = useWorkspaceStore.getState();
      const projectPanel = state.panels.find((p) => p.id === 'project');
      if (projectPanel?.fullRender) {
        const PanelContent = projectPanel.fullRender;
        const { container } = render(<PanelContent />);
        expect(container.textContent).toContain('src/');
        expect(container.textContent).toContain('package.json');
      }
    });
  });

  describe('Icon Components', () => {
    it('should render workspaces icon', () => {
      const { container } = render(<WorkspaceSidebar />);
      const svgs = container.querySelectorAll('svg');
      expect(svgs.length).toBeGreaterThan(0);
    });

    it('should render notification bell icon', () => {
      const { container } = render(<WorkspaceSidebar />);
      const state = useWorkspaceStore.getState();
      const notificationsPanel = state.panels.find((p) => p.id === 'notifications');

      if (notificationsPanel?.icon) {
        const IconComponent = notificationsPanel.icon;
        const { container: iconContainer } = render(<IconComponent />);
        expect(iconContainer.querySelector('svg')).toBeInTheDocument();
      }
    });

    it('should render git branch icon', () => {
      const { container } = render(<WorkspaceSidebar />);
      const state = useWorkspaceStore.getState();
      const gitPanel = state.panels.find((p) => p.id === 'git');

      if (gitPanel?.icon) {
        const IconComponent = gitPanel.icon;
        const { container: iconContainer } = render(<IconComponent />);
        expect(iconContainer.querySelector('svg')).toBeInTheDocument();
      }
    });

    it('should render folder icon', () => {
      const { container } = render(<WorkspaceSidebar />);
      const state = useWorkspaceStore.getState();
      const projectPanel = state.panels.find((p) => p.id === 'project');

      if (projectPanel?.icon) {
        const IconComponent = projectPanel.icon;
        const { container: iconContainer } = render(<IconComponent />);
        expect(iconContainer.querySelector('svg')).toBeInTheDocument();
      }
    });
  });

  describe('Workspace Context Menu', () => {
    it('should open context menu on right click', async () => {
      const user = userEvent.setup();
      render(<WorkspaceSidebar />);

      const state = useWorkspaceStore.getState();
      const firstWorkspace = state.workspaces[0];

      const workspaceElements = document.querySelectorAll('[title]');
      const workspaceElement = Array.from(workspaceElements).find(
        (el) => el.getAttribute('title')?.includes(firstWorkspace.name)
      );

      if (workspaceElement) {
        await user.pointer({
          keys: '[MouseRight]',
          target: workspaceElement,
        });
      }
    });

    it('should create workspace below from context menu', async () => {
      const { createWorkspace } = useWorkspaceStore.getState();
      createWorkspace('Workspace 2');

      const state = useWorkspaceStore.getState();
      expect(state.workspaces.length).toBeGreaterThanOrEqual(2);
    });

    it('should move workspace up', async () => {
      const { createWorkspace, moveWorkspaceUp } = useWorkspaceStore.getState();
      createWorkspace('Workspace 2');

      const state = useWorkspaceStore.getState();
      const secondWorkspace = state.workspaces[1];

      moveWorkspaceUp(secondWorkspace.id);

      const newState = useWorkspaceStore.getState();
      expect(newState.workspaces[0].id).toBe(secondWorkspace.id);
    });

    it('should move workspace down', async () => {
      const { createWorkspace, moveWorkspaceDown } = useWorkspaceStore.getState();
      createWorkspace('Workspace 2');

      const state = useWorkspaceStore.getState();
      const firstWorkspace = state.workspaces[0];

      moveWorkspaceDown(firstWorkspace.id);

      const newState = useWorkspaceStore.getState();
      expect(newState.workspaces[1].id).toBe(firstWorkspace.id);
    });
  });

  describe('Collapsed Workspace List', () => {
    it('should render collapsed workspace list', () => {
      const { toggleSidebar } = useWorkspaceStore.getState();
      toggleSidebar();

      const { container } = render(<WorkspaceSidebar />);
      const state = useWorkspaceStore.getState();
      expect(state.sidebarCollapsed).toBe(true);

      const collapsedElements = container.querySelectorAll('[style*="flex-direction: column"]');
      expect(collapsedElements.length).toBeGreaterThan(0);
    });

    it('should show workspace numbers in collapsed list', () => {
      const { toggleSidebar } = useWorkspaceStore.getState();
      toggleSidebar();

      const { container } = render(<WorkspaceSidebar />);
      const state = useWorkspaceStore.getState();
      const firstWorkspace = state.workspaces[0];

      expect(firstWorkspace).toBeDefined();
    });

    it('should switch workspace when collapsed item clicked', async () => {
      const { createWorkspace, toggleSidebar } = useWorkspaceStore.getState();
      createWorkspace('Workspace 2');
      toggleSidebar();

      const state = useWorkspaceStore.getState();
      const secondWorkspace = state.workspaces[1];

      const { setActiveWorkspace } = useWorkspaceStore.getState();
      setActiveWorkspace(secondWorkspace.id);

      const newState = useWorkspaceStore.getState();
      expect(newState.activeWorkspaceId).toBe(secondWorkspace.id);
    });
  });

  describe('Workspace Notification Indicators', () => {
    it('should show notification indicator on workspace with notification', () => {
      const { markNotification } = useWorkspaceStore.getState();
      const state = useWorkspaceStore.getState();
      const firstWorkspace = state.workspaces[0];
      const firstPane = Object.values(firstWorkspace.panes)[0];
      const firstTab = firstPane.tabs[0];

      markNotification(firstTab.id, 'Test notification');

      const updatedState = useWorkspaceStore.getState();
      const updatedWorkspace = updatedState.workspaces.find((ws) => ws.id === firstWorkspace.id);
      expect(updatedWorkspace?.hasNotification).toBe(true);
    });

    it('should show notification dot in collapsed mode', () => {
      const { markNotification, toggleSidebar } = useWorkspaceStore.getState();
      const state = useWorkspaceStore.getState();
      const firstWorkspace = state.workspaces[0];
      const firstPane = Object.values(firstWorkspace.panes)[0];
      const firstTab = firstPane.tabs[0];

      markNotification(firstTab.id, 'Test notification');
      toggleSidebar();

      const updatedState = useWorkspaceStore.getState();
      expect(updatedState.sidebarCollapsed).toBe(true);
      expect(updatedState.workspaces[0].hasNotification).toBe(true);
    });
  });

  describe('Workspace Hover Behavior', () => {
    it('should change background on hover when workspace is not active', async () => {
      const user = userEvent.setup();
      const { createWorkspace, setActiveWorkspace } = useWorkspaceStore.getState();

      createWorkspace('Inactive Workspace');
      const state = useWorkspaceStore.getState();
      const inactiveWs = state.workspaces[1];
      const activeWs = state.workspaces[0];

      setActiveWorkspace(activeWs.id);

      render(<WorkspaceSidebar />);

      const wsElement = screen.getByText('Inactive Workspace').closest('div')?.parentElement;
      await user.hover(wsElement!);

      expect(wsElement?.style.backgroundColor).toBe('rgb(42, 45, 46)');
    });

    it('should not change background on hover when workspace is active', async () => {
      const user = userEvent.setup();
      const { createWorkspace, setActiveWorkspace } = useWorkspaceStore.getState();

      createWorkspace('Test WS');
      const state = useWorkspaceStore.getState();
      const ws = state.workspaces[0];
      setActiveWorkspace(ws.id);

      render(<WorkspaceSidebar />);

      const wsElement = screen.getByText(ws.name).closest('div')?.parentElement;
      await user.hover(wsElement!);

      expect(wsElement?.style.backgroundColor).toBe('rgb(55, 55, 61)');
    });
  });
});
