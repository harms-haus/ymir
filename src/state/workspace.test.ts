// Tests for workspace Zustand store

import { describe, it, expect, beforeEach, vi } from 'vitest';
import useWorkspaceStore, {
  activeWorkspace,
  activePane,
  paneCount,
  hasNotifications,
} from './workspace';

// ============================================================================
// Setup
// ============================================================================

beforeEach(() => {
  // Reset store to initial state before each test
  useWorkspaceStore.setState({
    workspaces: [],
    activeWorkspaceId: '',
    sidebarCollapsed: false,
    notificationPanelOpen: false,
  });
});


// ============================================================================
// Initialization Tests
// ============================================================================

describe('Workspace Store - Initialization', () => {
  it('should initialize with one workspace and one pane', () => {
    const state = useWorkspaceStore.getState();

    expect(state.workspaces).toHaveLength(1);
    expect(state.workspaces[0].name).toBe('Workspace 1');
    expect(Object.keys(state.workspaces[0].panes)).toHaveLength(1);
    expect(state.activeWorkspaceId).toBeTruthy();
  });

  it('should have sidebar collapsed as false by default', () => {
    const state = useWorkspaceStore.getState();

    expect(state.sidebarCollapsed).toBe(false);
  });

  it('should have notification panel closed by default', () => {
    const state = useWorkspaceStore.getState();

    expect(state.notificationPanelOpen).toBe(false);
  });
});

// ============================================================================
// Workspace Actions Tests
// ============================================================================

describe('Workspace Store - Workspace Actions', () => {
  it('should create a new workspace', () => {
    const { createWorkspace } = useWorkspaceStore.getState();

    createWorkspace('New Workspace');

    const state = useWorkspaceStore.getState();
    expect(state.workspaces).toHaveLength(2);
    expect(state.workspaces[1].name).toBe('New Workspace');
  });

  it('should close a workspace', () => {
    const { createWorkspace, closeWorkspace } = useWorkspaceStore.getState();

    createWorkspace('Workspace 2');

    expect(useWorkspaceStore.getState().workspaces).toHaveLength(2);

    closeWorkspace(useWorkspaceStore.getState().workspaces[1].id);

    const state = useWorkspaceStore.getState();
    expect(state.workspaces).toHaveLength(1);
  });

  it('should not close the last workspace', () => {
    const { closeWorkspace } = useWorkspaceStore.getState();

    closeWorkspace(useWorkspaceStore.getState().workspaces[0].id);

    const state = useWorkspaceStore.getState();
    expect(state.workspaces).toHaveLength(1);
  });

  it('should set active workspace', () => {
    const { createWorkspace, setActiveWorkspace } = useWorkspaceStore.getState();

    createWorkspace('Workspace 2');
    const ws2Id = useWorkspaceStore.getState().workspaces[1].id;

    setActiveWorkspace(ws2Id);

    const state = useWorkspaceStore.getState();
    expect(state.activeWorkspaceId).toBe(ws2Id);
  });
});

// ============================================================================
// Pane Actions Tests
// ============================================================================

describe('Workspace Store - Pane Actions', () => {
  it('should split a pane to the right', () => {
    const state = useWorkspaceStore.getState();
    const initialPaneCount = paneCount();
    const paneId = Object.keys(state.workspaces[0].panes)[0];

    const { splitPane } = useWorkspaceStore.getState();
    splitPane(paneId, 'right');

    expect(paneCount()).toBe(initialPaneCount + 1);
  });

  it('should split a pane to the left', () => {
    const state = useWorkspaceStore.getState();
    const initialPaneCount = paneCount();
    const paneId = Object.keys(state.workspaces[0].panes)[0];

    const { splitPane } = useWorkspaceStore.getState();
    splitPane(paneId, 'left');

    expect(paneCount()).toBe(initialPaneCount + 1);
  });

  it('should split a pane down', () => {
    const state = useWorkspaceStore.getState();
    const initialPaneCount = paneCount();
    const paneId = Object.keys(state.workspaces[0].panes)[0];

    const { splitPane } = useWorkspaceStore.getState();
    splitPane(paneId, 'down');

    expect(paneCount()).toBe(initialPaneCount + 1);
  });

  it('should split a pane up', () => {
    const state = useWorkspaceStore.getState();
    const initialPaneCount = paneCount();
    const paneId = Object.keys(state.workspaces[0].panes)[0];

    const { splitPane } = useWorkspaceStore.getState();
    splitPane(paneId, 'up');

    expect(paneCount()).toBe(initialPaneCount + 1);
  });

  it('should enforce pane limit at 20', () => {
    const consoleSpy = vi.spyOn(console, 'warn');

    const { splitPane } = useWorkspaceStore.getState();
    const state = useWorkspaceStore.getState();
    const paneId = Object.keys(state.workspaces[0].panes)[0];

    // Try to create 25 panes (should stop at 20)
    for (let i = 0; i < 25; i++) {
      splitPane(paneId, 'right');
    }

    expect(paneCount()).toBeLessThanOrEqual(20);
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Maximum 20 panes reached'));
  });

  it('should warn at 15 panes', () => {
    const consoleSpy = vi.spyOn(console, 'warn');

    const { splitPane } = useWorkspaceStore.getState();
    const state = useWorkspaceStore.getState();
    const paneId = Object.keys(state.workspaces[0].panes)[0];

    // Create 16 panes (should trigger warning at 15)
    for (let i = 0; i < 16; i++) {
      splitPane(paneId, 'right');
    }

    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('Warning:'),
    );
  });

  it('should close a pane', () => {
    const { splitPane, closePane } = useWorkspaceStore.getState();
    const state = useWorkspaceStore.getState();
    const paneId = Object.keys(state.workspaces[0].panes)[0];

    // Create a split first
    splitPane(paneId, 'right');

    const beforeCount = paneCount();

    // Get the new pane ID (second pane)
    const newState = useWorkspaceStore.getState();
    const panes = Object.keys(newState.workspaces[0].panes);
    const paneToClose = panes[panes.length - 1];

    closePane(paneToClose);

    expect(paneCount()).toBe(beforeCount - 1);
  });

  it('should not close the last pane', () => {
    const { closePane } = useWorkspaceStore.getState();
    const state = useWorkspaceStore.getState();
    const paneId = Object.keys(state.workspaces[0].panes)[0];

    const beforeCount = paneCount();

    closePane(paneId);

    expect(paneCount()).toBe(beforeCount);
  });

  it('should set active pane', () => {
    const { splitPane, setActivePane } = useWorkspaceStore.getState();
    const state = useWorkspaceStore.getState();
    const paneId = Object.keys(state.workspaces[0].panes)[0];

    splitPane(paneId, 'right');

    const newState = useWorkspaceStore.getState();
    const newPaneId = Object.keys(newState.workspaces[0].panes)[1];

    setActivePane(newPaneId);

    expect(useWorkspaceStore.getState().workspaces[0].activePaneId).toBe(newPaneId);
  });
});

// ============================================================================
// Tab Actions Tests
// ============================================================================

describe('Workspace Store - Tab Actions', () => {
  it('should create a tab in a pane', () => {
    const { createTab } = useWorkspaceStore.getState();
    const state = useWorkspaceStore.getState();
    const paneId = Object.keys(state.workspaces[0].panes)[0];

    const beforeTabCount = state.workspaces[0].panes[paneId].tabs.length;

    createTab(paneId);

    const newState = useWorkspaceStore.getState();
    expect(newState.workspaces[0].panes[paneId].tabs.length).toBe(
      beforeTabCount + 1,
    );
  });

  it('should create a tab with custom cwd', () => {
    const { createTab } = useWorkspaceStore.getState();
    const state = useWorkspaceStore.getState();
    const paneId = Object.keys(state.workspaces[0].panes)[0];

    createTab(paneId, '/custom/path');

    const newState = useWorkspaceStore.getState();
    const tabs = newState.workspaces[0].panes[paneId].tabs;
    const newTab = tabs[tabs.length - 1];
    expect(newTab.cwd).toBe('/custom/path');
  });

  it('should set active tab', () => {
    const { createTab, setActiveTab } = useWorkspaceStore.getState();
    const state = useWorkspaceStore.getState();
    const paneId = Object.keys(state.workspaces[0].panes)[0];

    createTab(paneId);
    const newState = useWorkspaceStore.getState();
    const tabs = newState.workspaces[0].panes[paneId].tabs;
    const newTabId = tabs[tabs.length - 1].id;

    setActiveTab(paneId, newTabId);

    expect(useWorkspaceStore.getState().workspaces[0].panes[paneId].activeTabId).toBe(newTabId);
  });

  it('should close a tab', () => {
    const { createTab, closeTab } = useWorkspaceStore.getState();
    const state = useWorkspaceStore.getState();
    const paneId = Object.keys(state.workspaces[0].panes)[0];

    createTab(paneId);

    const beforeTabCount = useWorkspaceStore.getState().workspaces[0].panes[paneId].tabs.length;
    const tabs = useWorkspaceStore.getState().workspaces[0].panes[paneId].tabs;
    const tabToClose = tabs[tabs.length - 1].id;

    closeTab(paneId, tabToClose);

    expect(useWorkspaceStore.getState().workspaces[0].panes[paneId].tabs.length).toBe(
      beforeTabCount - 1,
    );
  });

  it('should close pane when last tab is closed', () => {
    const { createTab, closeTab } = useWorkspaceStore.getState();
    const state = useWorkspaceStore.getState();
    const paneId = Object.keys(state.workspaces[0].panes)[0];

    // Add a second tab
    createTab(paneId);

    // Close all tabs in the pane
    const tabs = useWorkspaceStore.getState().workspaces[0].panes[paneId].tabs;
    const beforePaneCount = paneCount();

    for (const tab of tabs) {
      closeTab(paneId, tab.id);
    }

    expect(paneCount()).toBeLessThan(beforePaneCount);
  });
});

// ============================================================================
// Notification Tests
// ============================================================================

describe('Workspace Store - Notification Actions', () => {
  it('should mark notification on a tab', () => {
    const { markNotification } = useWorkspaceStore.getState();
    const state = useWorkspaceStore.getState();
    const paneId = Object.keys(state.workspaces[0].panes)[0];
    const tabId = state.workspaces[0].panes[paneId].tabs[0].id;

    markNotification(tabId, 'Test notification');

    const newState = useWorkspaceStore.getState();
    const tab = newState.workspaces[0].panes[paneId].tabs[0];
    expect(tab.hasNotification).toBe(true);
    expect(tab.notificationText).toBe('Test notification');
  });

  it('should increment notification count', () => {
    const { markNotification } = useWorkspaceStore.getState();
    const state = useWorkspaceStore.getState();
    const paneId = Object.keys(state.workspaces[0].panes)[0];
    const tabId = state.workspaces[0].panes[paneId].tabs[0].id;

    markNotification(tabId, 'First notification');
    markNotification(tabId, 'Second notification');

    const newState = useWorkspaceStore.getState();
    const tab = newState.workspaces[0].panes[paneId].tabs[0];
    expect(tab.notificationCount).toBe(2);
  });

  it('should clear notification on a tab', () => {
    const { markNotification, clearNotification } = useWorkspaceStore.getState();
    const state = useWorkspaceStore.getState();
    const paneId = Object.keys(state.workspaces[0].panes)[0];
    const tabId = state.workspaces[0].panes[paneId].tabs[0].id;

    markNotification(tabId, 'Test notification');
    clearNotification(tabId);

    const newState = useWorkspaceStore.getState();
    const tab = newState.workspaces[0].panes[paneId].tabs[0];
    expect(tab.hasNotification).toBe(false);
    expect(tab.notificationCount).toBe(0);
    expect(tab.notificationText).toBeUndefined();
  });

  it('should set workspace notification flag when tab has notification', () => {
    const { markNotification } = useWorkspaceStore.getState();
    const state = useWorkspaceStore.getState();
    const paneId = Object.keys(state.workspaces[0].panes)[0];
    const tabId = state.workspaces[0].panes[paneId].tabs[0].id;

    expect(state.workspaces[0].hasNotification).toBe(false);

    markNotification(tabId, 'Test notification');

    expect(useWorkspaceStore.getState().workspaces[0].hasNotification).toBe(true);
  });
});

// ============================================================================
// UI Actions Tests
// ============================================================================

describe('Workspace Store - UI Actions', () => {
  it('should toggle sidebar', () => {
    const { toggleSidebar } = useWorkspaceStore.getState();

    const beforeState = useWorkspaceStore.getState().sidebarCollapsed;

    toggleSidebar();

    expect(useWorkspaceStore.getState().sidebarCollapsed).toBe(!beforeState);

    toggleSidebar();

    expect(useWorkspaceStore.getState().sidebarCollapsed).toBe(beforeState);
  });

  it('should toggle notification panel', () => {
    const { toggleNotificationPanel } = useWorkspaceStore.getState();

    const beforeState = useWorkspaceStore.getState().notificationPanelOpen;

    toggleNotificationPanel();

    expect(useWorkspaceStore.getState().notificationPanelOpen).toBe(!beforeState);

    toggleNotificationPanel();

    expect(useWorkspaceStore.getState().notificationPanelOpen).toBe(beforeState);
  });
});

// ============================================================================
// Derived Getters Tests
// ============================================================================

describe('Workspace Store - Derived Getters', () => {
  it('should return active workspace', () => {
    const ws = activeWorkspace();

    expect(ws).toBeTruthy();
    expect(ws?.id).toBe(useWorkspaceStore.getState().activeWorkspaceId);
  });

  it('should return null for active workspace when none active', () => {
    useWorkspaceStore.setState({ activeWorkspaceId: '', workspaces: [] });

    const ws = activeWorkspace();

    expect(ws).toBeNull();
  });

  it('should return active pane', () => {
    const pane = activePane();

    expect(pane).toBeTruthy();
    expect(pane?.id).toBe(useWorkspaceStore.getState().workspaces[0].activePaneId);
  });

  it('should return null for active pane when none active', () => {
    useWorkspaceStore.setState({
      workspaces: [{
        id: 'ws-1',
        name: 'Test',
        root: { type: 'leaf', paneId: 'pane-1' },
        activePaneId: null,
        hasNotification: false,
        panes: {},
      }],
      activeWorkspaceId: 'ws-1',
    });

    const pane = activePane();

    expect(pane).toBeNull();
  });

  it('should return correct pane count', () => {
    const count = paneCount();

    expect(count).toBeGreaterThanOrEqual(1);
    expect(count).toBe(Object.keys(useWorkspaceStore.getState().workspaces[0].panes).length);
  });

  it('should return hasNotifications correctly when no notifications', () => {
    const hasNotif = hasNotifications();

    expect(hasNotif).toBe(false);
  });

  it('should return hasNotifications correctly when notifications exist', () => {
    const { markNotification } = useWorkspaceStore.getState();
    const state = useWorkspaceStore.getState();
    const paneId = Object.keys(state.workspaces[0].panes)[0];
    const tabId = state.workspaces[0].panes[paneId].tabs[0].id;

    markNotification(tabId, 'Test');

    expect(hasNotifications()).toBe(true);
  });
});
