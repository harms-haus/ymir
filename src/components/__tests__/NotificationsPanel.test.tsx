import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { NotificationsPanelContent } from '../NotificationsPanel';
import useWorkspaceStore from '../../state/workspace';
import {
  createMockTab,
  createMockPane,
  createMockWorkspace,
  resetIdCounter,
} from '../../test-utils';

vi.mock('../lib/logger', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

describe('NotificationsPanel Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetIdCounter();

    const { resetState } = useWorkspaceStore.getState();
    if (resetState) {
      resetState();
    }
  });

  describe('Rendering with Notifications', () => {
    it('should render with notifications', () => {
      const tab1 = createMockTab({
        id: 'tab-1',
        title: 'Build Complete',
        hasNotification: true,
        notificationText: 'Build finished successfully',
      });

      const pane1 = createMockPane({
        id: 'pane-1',
        tabs: [tab1],
        activeTabId: tab1.id,
      });

      const workspace = createMockWorkspace({
        id: 'ws-1',
        panes: { 'pane-1': pane1 },
        activePaneId: 'pane-1',
      });

      useWorkspaceStore.setState({
        workspaces: [workspace],
        activeWorkspaceId: 'ws-1',
      });

      render(<NotificationsPanelContent />);

      expect(screen.getByText('Notifications')).toBeInTheDocument();
      expect(screen.getByText('1')).toBeInTheDocument();
    });

    it('should render notification list display', () => {
      const tab1 = createMockTab({
        id: 'tab-1',
        title: 'Build Complete',
        hasNotification: true,
        notificationText: 'Build finished successfully',
      });

      const pane1 = createMockPane({
        id: 'pane-1',
        tabs: [tab1],
        activeTabId: tab1.id,
      });

      const workspace = createMockWorkspace({
        id: 'ws-1',
        panes: { 'pane-1': pane1 },
        activePaneId: 'pane-1',
      });

      useWorkspaceStore.setState({
        workspaces: [workspace],
        activeWorkspaceId: 'ws-1',
      });

      render(<NotificationsPanelContent />);

      expect(screen.getByText('Build Complete')).toBeInTheDocument();
      expect(screen.getByText('Build finished successfully')).toBeInTheDocument();
    });

    it('should render multiple notifications', () => {
      const tab1 = createMockTab({
        id: 'tab-1',
        title: 'Build Complete',
        hasNotification: true,
        notificationText: 'Build finished successfully',
      });

      const tab2 = createMockTab({
        id: 'tab-2',
        title: 'Test Failed',
        hasNotification: true,
        notificationText: '3 tests failed',
      });

      const pane1 = createMockPane({
        id: 'pane-1',
        tabs: [tab1, tab2],
        activeTabId: tab1.id,
      });

      const workspace = createMockWorkspace({
        id: 'ws-1',
        panes: { 'pane-1': pane1 },
        activePaneId: 'pane-1',
      });

      useWorkspaceStore.setState({
        workspaces: [workspace],
        activeWorkspaceId: 'ws-1',
      });

      render(<NotificationsPanelContent />);

      expect(screen.getByText('2')).toBeInTheDocument();
      expect(screen.getByText('Build Complete')).toBeInTheDocument();
      expect(screen.getByText('Test Failed')).toBeInTheDocument();
    });
  });

  describe('Clear Notification', () => {
    it('should clear individual notification', () => {
      const tab1 = createMockTab({
        id: 'tab-1',
        title: 'Build Complete',
        hasNotification: true,
        notificationText: 'Build finished successfully',
      });

      const pane1 = createMockPane({
        id: 'pane-1',
        tabs: [tab1],
        activeTabId: tab1.id,
      });

      const workspace = createMockWorkspace({
        id: 'ws-1',
        panes: { 'pane-1': pane1 },
        activePaneId: 'pane-1',
      });

      useWorkspaceStore.setState({
        workspaces: [workspace],
        activeWorkspaceId: 'ws-1',
      });

      const clearNotificationSpy = vi.spyOn(useWorkspaceStore.getState(), 'clearNotification');

      render(<NotificationsPanelContent />);

      const clearButton = screen.getAllByText('Clear')[0];
      clearButton.click();

      expect(clearNotificationSpy).toHaveBeenCalledWith('tab-1');
    });

    it('should clear all notifications', () => {
      const tab1 = createMockTab({
        id: 'tab-1',
        title: 'Build Complete',
        hasNotification: true,
        notificationText: 'Build finished successfully',
      });

      const tab2 = createMockTab({
        id: 'tab-2',
        title: 'Test Failed',
        hasNotification: true,
        notificationText: '3 tests failed',
      });

      const pane1 = createMockPane({
        id: 'pane-1',
        tabs: [tab1, tab2],
        activeTabId: tab1.id,
      });

      const workspace = createMockWorkspace({
        id: 'ws-1',
        panes: { 'pane-1': pane1 },
        activePaneId: 'pane-1',
      });

      useWorkspaceStore.setState({
        workspaces: [workspace],
        activeWorkspaceId: 'ws-1',
      });

      const clearNotificationSpy = vi.spyOn(useWorkspaceStore.getState(), 'clearNotification');

      render(<NotificationsPanelContent />);

      const clearAllButton = screen.getByText('Clear All');
      clearAllButton.click();

      expect(clearNotificationSpy).toHaveBeenCalledWith('tab-1');
      expect(clearNotificationSpy).toHaveBeenCalledWith('tab-2');
    });
  });

  describe('Empty State', () => {
    it('should render empty state when no notifications', () => {
      const tab1 = createMockTab({
        id: 'tab-1',
        title: 'Terminal',
        hasNotification: false,
      });

      const pane1 = createMockPane({
        id: 'pane-1',
        tabs: [tab1],
        activeTabId: tab1.id,
      });

      const workspace = createMockWorkspace({
        id: 'ws-1',
        panes: { 'pane-1': pane1 },
        activePaneId: 'pane-1',
      });

      useWorkspaceStore.setState({
        workspaces: [workspace],
        activeWorkspaceId: 'ws-1',
      });

      render(<NotificationsPanelContent />);

      expect(screen.getByText('No notifications')).toBeInTheDocument();
    });

    it('should not render clear all button when empty', () => {
      const tab1 = createMockTab({
        id: 'tab-1',
        title: 'Terminal',
        hasNotification: false,
      });

      const pane1 = createMockPane({
        id: 'pane-1',
        tabs: [tab1],
        activeTabId: tab1.id,
      });

      const workspace = createMockWorkspace({
        id: 'ws-1',
        panes: { 'pane-1': pane1 },
        activePaneId: 'pane-1',
      });

      useWorkspaceStore.setState({
        workspaces: [workspace],
        activeWorkspaceId: 'ws-1',
      });

      render(<NotificationsPanelContent />);

      expect(screen.queryByText('Clear All')).not.toBeInTheDocument();
    });

    it('should not render jump to unread button when empty', () => {
      const tab1 = createMockTab({
        id: 'tab-1',
        title: 'Terminal',
        hasNotification: false,
      });

      const pane1 = createMockPane({
        id: 'pane-1',
        tabs: [tab1],
        activeTabId: tab1.id,
      });

      const workspace = createMockWorkspace({
        id: 'ws-1',
        panes: { 'pane-1': pane1 },
        activePaneId: 'pane-1',
      });

      useWorkspaceStore.setState({
        workspaces: [workspace],
        activeWorkspaceId: 'ws-1',
      });

      render(<NotificationsPanelContent />);

      expect(screen.queryByText('Jump to Unread')).not.toBeInTheDocument();
    });
  });

  describe('Header Actions', () => {
    it('should render notification count badge', () => {
      const tab1 = createMockTab({
        id: 'tab-1',
        title: 'Build Complete',
        hasNotification: true,
        notificationText: 'Build finished successfully',
      });

      const pane1 = createMockPane({
        id: 'pane-1',
        tabs: [tab1],
        activeTabId: tab1.id,
      });

      const workspace = createMockWorkspace({
        id: 'ws-1',
        panes: { 'pane-1': pane1 },
        activePaneId: 'pane-1',
      });

      useWorkspaceStore.setState({
        workspaces: [workspace],
        activeWorkspaceId: 'ws-1',
      });

      render(<NotificationsPanelContent />);

      const countBadge = screen.getByText('1');
      expect(countBadge).toBeInTheDocument();
      expect(countBadge).toHaveStyle({ color: '#4fc3f7' });
    });

    it('should render jump to unread button', () => {
      const tab1 = createMockTab({
        id: 'tab-1',
        title: 'Build Complete',
        hasNotification: true,
        notificationText: 'Build finished successfully',
      });

      const pane1 = createMockPane({
        id: 'pane-1',
        tabs: [tab1],
        activeTabId: tab1.id,
      });

      const workspace = createMockWorkspace({
        id: 'ws-1',
        panes: { 'pane-1': pane1 },
        activePaneId: 'pane-1',
      });

      useWorkspaceStore.setState({
        workspaces: [workspace],
        activeWorkspaceId: 'ws-1',
      });

      render(<NotificationsPanelContent />);

      expect(screen.getByText('Jump to Unread')).toBeInTheDocument();
    });
  });

  describe('Notification Item Display', () => {
    it('should display tab title', () => {
      const tab1 = createMockTab({
        id: 'tab-1',
        title: 'Custom Title',
        hasNotification: true,
        notificationText: 'Notification message',
      });

      const pane1 = createMockPane({
        id: 'pane-1',
        tabs: [tab1],
        activeTabId: tab1.id,
      });

      const workspace = createMockWorkspace({
        id: 'ws-1',
        panes: { 'pane-1': pane1 },
        activePaneId: 'pane-1',
      });

      useWorkspaceStore.setState({
        workspaces: [workspace],
        activeWorkspaceId: 'ws-1',
      });

      render(<NotificationsPanelContent />);

      expect(screen.getByText('Custom Title')).toBeInTheDocument();
    });

    it('should display notification text', () => {
      const tab1 = createMockTab({
        id: 'tab-1',
        title: 'Notification',
        hasNotification: true,
        notificationText: 'This is a custom notification message',
      });

      const pane1 = createMockPane({
        id: 'pane-1',
        tabs: [tab1],
        activeTabId: tab1.id,
      });

      const workspace = createMockWorkspace({
        id: 'ws-1',
        panes: { 'pane-1': pane1 },
        activePaneId: 'pane-1',
      });

      useWorkspaceStore.setState({
        workspaces: [workspace],
        activeWorkspaceId: 'ws-1',
      });

      render(<NotificationsPanelContent />);

      expect(screen.getByText('This is a custom notification message')).toBeInTheDocument();
    });

    it('should display cwd path', () => {
      const tab1 = createMockTab({
        id: 'tab-1',
        title: 'Notification',
        hasNotification: true,
        notificationText: 'Message',
        cwd: '/custom/path/to/project',
      });

      const pane1 = createMockPane({
        id: 'pane-1',
        tabs: [tab1],
        activeTabId: tab1.id,
      });

      const workspace = createMockWorkspace({
        id: 'ws-1',
        panes: { 'pane-1': pane1 },
        activePaneId: 'pane-1',
      });

      useWorkspaceStore.setState({
        workspaces: [workspace],
        activeWorkspaceId: 'ws-1',
      });

      render(<NotificationsPanelContent />);

      expect(screen.getByText('/custom/path/to/project')).toBeInTheDocument();
    });

    it('should display default notification text when not provided', () => {
      const tab1 = createMockTab({
        id: 'tab-1',
        title: 'Notification',
        hasNotification: true,
      });

      const pane1 = createMockPane({
        id: 'pane-1',
        tabs: [tab1],
        activeTabId: tab1.id,
      });

      const workspace = createMockWorkspace({
        id: 'ws-1',
        panes: { 'pane-1': pane1 },
        activePaneId: 'pane-1',
      });

      useWorkspaceStore.setState({
        workspaces: [workspace],
        activeWorkspaceId: 'ws-1',
      });

      render(<NotificationsPanelContent />);

      expect(screen.getByText('New notification')).toBeInTheDocument();
    });
  });
});
