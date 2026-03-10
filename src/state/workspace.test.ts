// Tests for workspace Zustand store

import { describe, it, expect, beforeEach, vi } from 'vitest';
import useWorkspaceStore, {
  activeWorkspace,
  activePane,
  paneCount,
  hasNotifications,
  getActivePanel,
  getPanel,
  getTotalNotificationCount,
  getGitChangesCount,
} from './workspace';

// ============================================================================
// Setup
// ============================================================================

beforeEach(() => {
  // Reset store to initial state before each test
  const { resetState } = useWorkspaceStore.getState();
  if (resetState) {
    resetState();
  }

  // Clear all console spies
  vi.clearAllMocks();
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

  it('should not close last pane when last tab is closed', () => {
    const { createTab, closeTab } = useWorkspaceStore.getState();
    let state = useWorkspaceStore.getState();
    const paneId = Object.keys(state.workspaces[0].panes)[0];

    // Add a second tab
    createTab(paneId);

    // Close all tabs in the pane
    const tabs = useWorkspaceStore.getState().workspaces[0].panes[paneId].tabs;
    const beforePaneCount = paneCount();

    for (const tab of tabs) {
      closeTab(paneId, tab.id);
    }

    // Pane should NOT be closed when it's the last pane in workspace
    // (The workspace must have at least one pane)
    expect(paneCount()).toBe(beforePaneCount);
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

// ============================================================================
// Edge Case Tests - Concurrent Operations
// ============================================================================

describe('Workspace Store - Edge Cases: Concurrent Operations', () => {
  it('should handle multiple rapid splits without corruption', () => {
    const { splitPane } = useWorkspaceStore.getState();
    const state = useWorkspaceStore.getState();
    const initialPaneId = Object.keys(state.workspaces[0].panes)[0];

    // Rapidly split the same pane multiple times
    for (let i = 0; i < 5; i++) {
      splitPane(initialPaneId, 'right');
    }

    const finalState = useWorkspaceStore.getState();
    const paneIds = Object.keys(finalState.workspaces[0].panes);

    // Should have created panes (up to limit)
    expect(paneIds.length).toBeGreaterThan(1);
    expect(paneIds.length).toBeLessThanOrEqual(20);

    // All pane IDs should be unique
    expect(new Set(paneIds).size).toBe(paneIds.length);
  });

  it('should handle rapid pane creation and closure', () => {
    const { splitPane, closePane } = useWorkspaceStore.getState();
    const state = useWorkspaceStore.getState();
    const initialPaneId = Object.keys(state.workspaces[0].panes)[0];

    // Create several panes
    for (let i = 0; i < 5; i++) {
      splitPane(initialPaneId, 'right');
    }

    const afterCreation = useWorkspaceStore.getState();
    const paneIds = Object.keys(afterCreation.workspaces[0].panes);
    const createdCount = paneIds.length;

    // Close all but one pane
    for (const paneId of paneIds) {
      if (paneId !== initialPaneId) {
        closePane(paneId);
      }
    }

    const afterClose = useWorkspaceStore.getState();
    expect(Object.keys(afterClose.workspaces[0].panes).length).toBe(1);
    expect(afterClose.workspaces[0].activePaneId).toBeTruthy();
  });

  it('should handle rapid workspace creation and closure', () => {
    const { createWorkspace, closeWorkspace } = useWorkspaceStore.getState();

    // Create multiple workspaces rapidly
    const createdIds: string[] = [];
    for (let i = 0; i < 5; i++) {
      createWorkspace(`Workspace ${i + 2}`);
      createdIds.push(useWorkspaceStore.getState().workspaces[useWorkspaceStore.getState().workspaces.length - 1].id);
    }

    expect(useWorkspaceStore.getState().workspaces.length).toBe(6);

    // Close them rapidly
    for (const id of createdIds) {
      closeWorkspace(id);
    }

    expect(useWorkspaceStore.getState().workspaces.length).toBe(1);
  });

  it('should handle concurrent tab operations in multiple panes', () => {
    const { splitPane, createTab, closeTab } = useWorkspaceStore.getState();
    const state = useWorkspaceStore.getState();
    const initialPaneId = Object.keys(state.workspaces[0].panes)[0];

    // Create multiple panes
    splitPane(initialPaneId, 'right');
    splitPane(initialPaneId, 'down');

    const newState = useWorkspaceStore.getState();
    const paneIds = Object.keys(newState.workspaces[0].panes);

    // Create tabs in each pane
    for (const paneId of paneIds) {
      createTab(paneId);
      createTab(paneId);
    }

    const afterTabs = useWorkspaceStore.getState();
    for (const paneId of paneIds) {
      expect(afterTabs.workspaces[0].panes[paneId].tabs.length).toBeGreaterThanOrEqual(2);
    }

    // Close tabs rapidly
    for (const paneId of paneIds) {
      const tabs = afterTabs.workspaces[0].panes[paneId].tabs;
      for (const tab of tabs.slice(1)) {
        closeTab(paneId, tab.id);
      }
    }

    const finalState = useWorkspaceStore.getState();
    for (const paneId of paneIds) {
      expect(finalState.workspaces[0].panes[paneId].tabs.length).toBe(1);
    }
  });
});

// ============================================================================
// Edge Case Tests - Deep Tree Structures
// ============================================================================

describe('Workspace Store - Edge Cases: Deep Tree Structures', () => {
  it('should create 3+ levels of nested splits', () => {
    const { splitPane } = useWorkspaceStore.getState();
    const state = useWorkspaceStore.getState();
    let currentPaneId = Object.keys(state.workspaces[0].panes)[0];

    // Create deep nesting: split right, then split down the new pane, then split right again
    splitPane(currentPaneId, 'right');
    const afterFirst = useWorkspaceStore.getState();
    const paneIds1 = Object.keys(afterFirst.workspaces[0].panes);
    const secondPaneId = paneIds1.find(id => id !== currentPaneId)!;

    splitPane(secondPaneId, 'down');
    const afterSecond = useWorkspaceStore.getState();
    const paneIds2 = Object.keys(afterSecond.workspaces[0].panes);
    const thirdPaneId = paneIds2.find(id => id !== currentPaneId && id !== secondPaneId)!;

    splitPane(thirdPaneId, 'right');
    const afterThird = useWorkspaceStore.getState();

    // Should have 4 panes total
    expect(Object.keys(afterThird.workspaces[0].panes).length).toBe(4);

    // Verify the tree structure is valid by checking root
    const root = afterThird.workspaces[0].root;
    expect(root.type).toBe('branch');
  });

  it('should handle closing panes in deeply nested structures', () => {
    const { splitPane, closePane } = useWorkspaceStore.getState();
    const state = useWorkspaceStore.getState();
    const initialPaneId = Object.keys(state.workspaces[0].panes)[0];

    // Create a complex tree structure
    splitPane(initialPaneId, 'right');
    const afterFirst = useWorkspaceStore.getState();
    const paneIds1 = Object.keys(afterFirst.workspaces[0].panes);
    const secondPaneId = paneIds1.find(id => id !== initialPaneId)!;

    splitPane(secondPaneId, 'down');
    const afterSecond = useWorkspaceStore.getState();
    const paneIds2 = Object.keys(afterSecond.workspaces[0].panes);
    const thirdPaneId = paneIds2.find(id => id !== initialPaneId && id !== secondPaneId)!;

    splitPane(thirdPaneId, 'left');
    const afterThird = useWorkspaceStore.getState();
    const paneIds3 = Object.keys(afterThird.workspaces[0].panes);
    const fourthPaneId = paneIds3.find(id => !paneIds2.includes(id))!;

    // Close a middle pane
    closePane(secondPaneId);

    const afterClose = useWorkspaceStore.getState();
    const remainingPanes = Object.keys(afterClose.workspaces[0].panes);

    // Should have 3 panes remaining
    expect(remainingPanes.length).toBe(3);
    expect(remainingPanes).not.toContain(secondPaneId);

    // Tree should still be valid
    expect(afterClose.workspaces[0].root.type).toBe('branch');
  });

  it('should maintain tree integrity with asymmetric splits', () => {
    const { splitPane, createTab } = useWorkspaceStore.getState();
    const state = useWorkspaceStore.getState();
    const initialPaneId = Object.keys(state.workspaces[0].panes)[0];

    // Create asymmetric tree: split one side multiple times
    splitPane(initialPaneId, 'right');
    const afterFirst = useWorkspaceStore.getState();
    const paneIds1 = Object.keys(afterFirst.workspaces[0].panes);
    const rightPaneId = paneIds1.find(id => id !== initialPaneId)!;

    // Split the right pane again
    splitPane(rightPaneId, 'right');
    const afterSecond = useWorkspaceStore.getState();
    const paneIds2 = Object.keys(afterSecond.workspaces[0].panes);
    const farRightPaneId = paneIds2.find(id => id !== initialPaneId && id !== rightPaneId)!;

    // Split the far right pane vertically
    splitPane(farRightPaneId, 'down');
    const afterThird = useWorkspaceStore.getState();

    // Verify tree structure
    expect(Object.keys(afterThird.workspaces[0].panes).length).toBe(4);
    expect(afterThird.workspaces[0].root.type).toBe('branch');

    // All panes should be functional
    for (const paneId of Object.keys(afterThird.workspaces[0].panes)) {
      createTab(paneId);
      const currentState = useWorkspaceStore.getState();
      expect(currentState.workspaces[0].panes[paneId].tabs.length).toBeGreaterThanOrEqual(1);
    }
  });

  it('should handle active pane updates in deep trees', () => {
    const { splitPane, setActivePane } = useWorkspaceStore.getState();
    const state = useWorkspaceStore.getState();
    const initialPaneId = Object.keys(state.workspaces[0].panes)[0];

    // Create deep structure
    splitPane(initialPaneId, 'right');
    const afterFirst = useWorkspaceStore.getState();
    const paneIds1 = Object.keys(afterFirst.workspaces[0].panes);
    const secondPaneId = paneIds1.find(id => id !== initialPaneId)!;

    splitPane(secondPaneId, 'down');
    const afterSecond = useWorkspaceStore.getState();
    const paneIds2 = Object.keys(afterSecond.workspaces[0].panes);
    const thirdPaneId = paneIds2.find(id => id !== initialPaneId && id !== secondPaneId)!;

    // Set each pane as active
    for (const paneId of paneIds2) {
      setActivePane(paneId);
      expect(useWorkspaceStore.getState().workspaces[0].activePaneId).toBe(paneId);
    }
  });
});

// ============================================================================
// Edge Case Tests - Session Persistence
// ============================================================================

describe('Workspace Store - Edge Cases: Session Persistence', () => {
  it('should handle empty scrollback arrays', () => {
    const { createTab } = useWorkspaceStore.getState();
    const state = useWorkspaceStore.getState();
    const paneId = Object.keys(state.workspaces[0].panes)[0];

    createTab(paneId);
    const newState = useWorkspaceStore.getState();
    const tabs = newState.workspaces[0].panes[paneId].tabs;
    const newTab = tabs[tabs.length - 1];

    // Scrollback should be empty array by default
    expect(newTab.scrollback).toEqual([]);
    expect(Array.isArray(newTab.scrollback)).toBe(true);
  });

  it('should handle tabs with empty session IDs', () => {
    const { createTab } = useWorkspaceStore.getState();
    const state = useWorkspaceStore.getState();
    const paneId = Object.keys(state.workspaces[0].panes)[0];

    createTab(paneId);
    const newState = useWorkspaceStore.getState();
    const tabs = newState.workspaces[0].panes[paneId].tabs;
    const newTab = tabs[tabs.length - 1];

    // Session ID should be empty string for new tabs
    expect(newTab.sessionId).toBe('');
  });

  it('should handle workspace with multiple panes and tabs', () => {
    const { splitPane, createTab, markNotification } = useWorkspaceStore.getState();
    const state = useWorkspaceStore.getState();
    const initialPaneId = Object.keys(state.workspaces[0].panes)[0];

    // Create complex workspace state
    splitPane(initialPaneId, 'right');
    const afterSplit = useWorkspaceStore.getState();
    const paneIds = Object.keys(afterSplit.workspaces[0].panes);

    for (const paneId of paneIds) {
      createTab(paneId, `/path/${paneId}`);
      const currentState = useWorkspaceStore.getState();
      const tabs = currentState.workspaces[0].panes[paneId].tabs;
      const newTab = tabs[tabs.length - 1];
      markNotification(newTab.id, `Notification for ${paneId}`);
    }

    const finalState = useWorkspaceStore.getState();
    expect(finalState.workspaces[0].hasNotification).toBe(true);
    expect(Object.keys(finalState.workspaces[0].panes).length).toBe(2);

    // Verify each pane has correct state
    for (const paneId of Object.keys(finalState.workspaces[0].panes)) {
      const pane = finalState.workspaces[0].panes[paneId];
      expect(pane.tabs.length).toBeGreaterThanOrEqual(2);
      expect(pane.hasNotification).toBe(true);
    }
  });

  it('should handle notification state serialization', () => {
    const { markNotification, clearNotification } = useWorkspaceStore.getState();
    const state = useWorkspaceStore.getState();
    const paneId = Object.keys(state.workspaces[0].panes)[0];
    const tabId = state.workspaces[0].panes[paneId].tabs[0].id;

    // Mark notification
    markNotification(tabId, 'Test message');
    const withNotification = useWorkspaceStore.getState();
    const tab = withNotification.workspaces[0].panes[paneId].tabs[0];

    expect(tab.hasNotification).toBe(true);
    expect(tab.notificationCount).toBe(1);
    expect(tab.notificationText).toBe('Test message');

    // Clear notification
    clearNotification(tabId);
    const cleared = useWorkspaceStore.getState();
    const clearedTab = cleared.workspaces[0].panes[paneId].tabs[0];

    expect(clearedTab.hasNotification).toBe(false);
    expect(clearedTab.notificationCount).toBe(0);
    expect(clearedTab.notificationText).toBeUndefined();
  });

  it('should handle multiple workspaces with different states', () => {
    const { createWorkspace, setActiveWorkspace, splitPane, markNotification } = useWorkspaceStore.getState();
    const state = useWorkspaceStore.getState();

    // Create multiple workspaces with different configurations
    createWorkspace('Workspace 2');
    const ws2Id = useWorkspaceStore.getState().workspaces[1].id;

    createWorkspace('Workspace 3');
    const ws3Id = useWorkspaceStore.getState().workspaces[2].id;

    // Configure workspace 2 with splits
    setActiveWorkspace(ws2Id);
    const ws2PaneId = Object.keys(useWorkspaceStore.getState().workspaces[1].panes)[0];
    splitPane(ws2PaneId, 'right');

    // Configure workspace 3 with notifications
    setActiveWorkspace(ws3Id);
    const ws3PaneId = Object.keys(useWorkspaceStore.getState().workspaces[2].panes)[0];
    const ws3TabId = useWorkspaceStore.getState().workspaces[2].panes[ws3PaneId].tabs[0].id;
    markNotification(ws3TabId, 'WS3 notification');

    const finalState = useWorkspaceStore.getState();

    // Verify workspace states
    expect(finalState.workspaces[0].name).toBe('Workspace 1');
    expect(finalState.workspaces[1].name).toBe('Workspace 2');
    expect(Object.keys(finalState.workspaces[1].panes).length).toBe(2);
    expect(finalState.workspaces[2].name).toBe('Workspace 3');
    expect(finalState.workspaces[2].hasNotification).toBe(true);
  });
});

// ============================================================================
// Edge Case Tests - Notification Propagation
// ============================================================================

describe('Workspace Store - Edge Cases: Notification Propagation', () => {
  it('should propagate notifications across multiple panes in same workspace', () => {
    const { splitPane, createTab, markNotification } = useWorkspaceStore.getState();
    const state = useWorkspaceStore.getState();
    const initialPaneId = Object.keys(state.workspaces[0].panes)[0];

    // Create multiple panes
    splitPane(initialPaneId, 'right');
    splitPane(initialPaneId, 'down');

    const afterSplits = useWorkspaceStore.getState();
    const paneIds = Object.keys(afterSplits.workspaces[0].panes);

    // Create tabs in each pane and mark notifications
    for (let i = 0; i < paneIds.length; i++) {
      createTab(paneIds[i]);
      const currentState = useWorkspaceStore.getState();
      const tabs = currentState.workspaces[0].panes[paneIds[i]].tabs;
      markNotification(tabs[tabs.length - 1].id, `Notification ${i}`);
    }

    const finalState = useWorkspaceStore.getState();

    // Workspace should have notification flag
    expect(finalState.workspaces[0].hasNotification).toBe(true);

    // Each pane with notifications should be marked
    let panesWithNotifications = 0;
    for (const paneId of paneIds) {
      if (finalState.workspaces[0].panes[paneId].hasNotification) {
        panesWithNotifications++;
      }
    }
    expect(panesWithNotifications).toBeGreaterThan(0);
  });

  it('should handle notification count accumulation', () => {
    const { markNotification } = useWorkspaceStore.getState();
    const state = useWorkspaceStore.getState();
    const paneId = Object.keys(state.workspaces[0].panes)[0];
    const tabId = state.workspaces[0].panes[paneId].tabs[0].id;

    // Mark multiple notifications
    for (let i = 0; i < 10; i++) {
      markNotification(tabId, `Message ${i}`);
    }

    const finalState = useWorkspaceStore.getState();
    const tab = finalState.workspaces[0].panes[paneId].tabs[0];

    expect(tab.notificationCount).toBe(10);
    expect(tab.notificationText).toBe('Message 9'); // Last message
  });

  it('should clear notifications only on target tab', () => {
    const { splitPane, createTab, markNotification, clearNotification } = useWorkspaceStore.getState();
    const state = useWorkspaceStore.getState();
    const initialPaneId = Object.keys(state.workspaces[0].panes)[0];

    // Create multiple panes with tabs
    splitPane(initialPaneId, 'right');
    const afterSplit = useWorkspaceStore.getState();
    const paneIds = Object.keys(afterSplit.workspaces[0].panes);

    const tabIds: string[] = [];
    for (const paneId of paneIds) {
      createTab(paneId);
      const currentState = useWorkspaceStore.getState();
      const tabs = currentState.workspaces[0].panes[paneId].tabs;
      const newTabId = tabs[tabs.length - 1].id;
      tabIds.push(newTabId);
      markNotification(newTabId, `Notification for ${paneId}`);
    }

    // Clear only the first tab's notification
    clearNotification(tabIds[0]);

    const finalState = useWorkspaceStore.getState();

    // First tab should be cleared
    const firstPaneId = paneIds[0];
    const firstTab = finalState.workspaces[0].panes[firstPaneId].tabs.find(t => t.id === tabIds[0])!;
    expect(firstTab.hasNotification).toBe(false);

    // Other tabs should still have notifications
    for (let i = 1; i < paneIds.length; i++) {
      const tab = finalState.workspaces[0].panes[paneIds[i]].tabs.find(t => t.id === tabIds[i])!;
      expect(tab.hasNotification).toBe(true);
    }
  });

  it('should update workspace notification flag when all notifications cleared', () => {
    const { markNotification, clearNotification } = useWorkspaceStore.getState();
    const state = useWorkspaceStore.getState();
    const paneId = Object.keys(state.workspaces[0].panes)[0];
    const tabId = state.workspaces[0].panes[paneId].tabs[0].id;

    markNotification(tabId, 'Test');
    expect(useWorkspaceStore.getState().workspaces[0].hasNotification).toBe(true);

    clearNotification(tabId);
    expect(useWorkspaceStore.getState().workspaces[0].hasNotification).toBe(false);
  });

  it('should handle notifications across multiple workspaces', () => {
    const { createWorkspace, setActiveWorkspace, markNotification } = useWorkspaceStore.getState();

    // Create multiple workspaces
    createWorkspace('Workspace 2');
    const ws2Id = useWorkspaceStore.getState().workspaces[1].id;

    // Mark notification in first workspace
    const ws1PaneId = Object.keys(useWorkspaceStore.getState().workspaces[0].panes)[0];
    const ws1TabId = useWorkspaceStore.getState().workspaces[0].panes[ws1PaneId].tabs[0].id;
    markNotification(ws1TabId, 'WS1 notification');

    // Mark notification in second workspace
    setActiveWorkspace(ws2Id);
    const ws2PaneId = Object.keys(useWorkspaceStore.getState().workspaces[1].panes)[0];
    const ws2TabId = useWorkspaceStore.getState().workspaces[1].panes[ws2PaneId].tabs[0].id;
    markNotification(ws2TabId, 'WS2 notification');

    const finalState = useWorkspaceStore.getState();

    // Both workspaces should have notifications
    expect(finalState.workspaces[0].hasNotification).toBe(true);
    expect(finalState.workspaces[1].hasNotification).toBe(true);
    expect(hasNotifications()).toBe(true);
  });
});

// ============================================================================
// Edge Case Tests - Pane Limit Enforcement
// ============================================================================

describe('Workspace Store - Edge Cases: Pane Limit Enforcement', () => {
  it('should enforce limit when creating panes across multiple workspaces', () => {
    const { createWorkspace, setActiveWorkspace, splitPane } = useWorkspaceStore.getState();
    const consoleSpy = vi.spyOn(console, 'warn');

    // Create multiple workspaces
    for (let i = 0; i < 3; i++) {
      createWorkspace(`Workspace ${i + 2}`);
    }

    const state = useWorkspaceStore.getState();
    const workspaceIds = state.workspaces.map(ws => ws.id);

    // Try to create panes in each workspace
    let totalSplits = 0;
    for (const wsId of workspaceIds) {
      setActiveWorkspace(wsId);
      const currentState = useWorkspaceStore.getState();
      const paneId = Object.keys(currentState.workspaces.find(ws => ws.id === wsId)!.panes)[0];

      // Try to create many panes in this workspace
      for (let i = 0; i < 10; i++) {
        splitPane(paneId, 'right');
        totalSplits++;
      }
    }

    // Total pane count should not exceed 20
    expect(paneCount()).toBeLessThanOrEqual(20);
    // Should have logged warnings about approaching and reaching limit
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Maximum 20 panes reached'));
  });

  it('should warn at 15 panes across all workspaces', () => {
    const { createWorkspace, setActiveWorkspace, splitPane } = useWorkspaceStore.getState();
    const consoleSpy = vi.spyOn(console, 'warn');

    // Create multiple workspaces
    createWorkspace('Workspace 2');

    const state = useWorkspaceStore.getState();
    const workspaceIds = state.workspaces.map(ws => ws.id);

    // Create panes until we hit the warning threshold
    for (const wsId of workspaceIds) {
      setActiveWorkspace(wsId);

      while (paneCount() < 16) {
        const currentState = useWorkspaceStore.getState();
        const ws = currentState.workspaces.find(w => w.id === wsId)!;
        const paneId = Object.keys(ws.panes)[0];
        splitPane(paneId, 'right');

        if (paneCount() >= 16) break;
      }
    }

    // Should have triggered warning at 15 panes
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Warning:'));
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('15'));
  });

  it('should allow operations after closing panes near limit', () => {
    const { splitPane, closePane } = useWorkspaceStore.getState();
    const state = useWorkspaceStore.getState();
    const initialPaneId = Object.keys(state.workspaces[0].panes)[0];

    // Create many panes
    const createdPaneIds: string[] = [];
    for (let i = 0; i < 15; i++) {
      const beforeState = useWorkspaceStore.getState();
      const paneId = Object.keys(beforeState.workspaces[0].panes)[0];
      splitPane(paneId, 'right');

      const afterState = useWorkspaceStore.getState();
      const newPaneIds = Object.keys(afterState.workspaces[0].panes).filter(
        id => !createdPaneIds.includes(id) && id !== initialPaneId
      );
      if (newPaneIds.length > 0) {
        createdPaneIds.push(...newPaneIds);
      }
    }

    const atLimit = useWorkspaceStore.getState();
    const countAtLimit = Object.keys(atLimit.workspaces[0].panes).length;

    // Close several panes
    for (let i = 0; i < 5 && i < createdPaneIds.length; i++) {
      closePane(createdPaneIds[i]);
    }

    const afterClose = useWorkspaceStore.getState();
    const countAfterClose = Object.keys(afterClose.workspaces[0].panes).length;

    expect(countAfterClose).toBe(countAtLimit - 5);

    // Should be able to create new panes again
    const remainingPaneId = Object.keys(afterClose.workspaces[0].panes)[0];
    splitPane(remainingPaneId, 'right');

    const finalState = useWorkspaceStore.getState();
    expect(Object.keys(finalState.workspaces[0].panes).length).toBe(countAfterClose + 1);
  });

  it('should handle edge case of exactly 20 panes', () => {
    const { splitPane } = useWorkspaceStore.getState();
    const consoleSpy = vi.spyOn(console, 'warn');
    const state = useWorkspaceStore.getState();
    const initialPaneId = Object.keys(state.workspaces[0].panes)[0];

    // Create exactly 19 more panes (to reach 20 total)
    for (let i = 0; i < 19; i++) {
      const currentState = useWorkspaceStore.getState();
      const paneId = Object.keys(currentState.workspaces[0].panes)[0];
      splitPane(paneId, 'right');
    }

    expect(paneCount()).toBe(20);

    // Try to create one more - should be blocked
    const beforeAttempt = paneCount();
    splitPane(initialPaneId, 'right');
    expect(paneCount()).toBe(beforeAttempt);
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Maximum 20 panes reached'));
  });

  it('should handle rapid split/close cycles near limit', () => {
    const { splitPane, closePane } = useWorkspaceStore.getState();
    const state = useWorkspaceStore.getState();
    const initialPaneId = Object.keys(state.workspaces[0].panes)[0];

    // Create panes near limit
    for (let i = 0; i < 18; i++) {
      const currentState = useWorkspaceStore.getState();
      const paneId = Object.keys(currentState.workspaces[0].panes)[0];
      splitPane(paneId, 'right');
    }

    expect(paneCount()).toBe(19);

    // Rapidly create and close panes
    for (let cycle = 0; cycle < 5; cycle++) {
      const currentState = useWorkspaceStore.getState();
      const paneIds = Object.keys(currentState.workspaces[0].panes);
      const lastPaneId = paneIds[paneIds.length - 1];

      // Close last pane
      closePane(lastPaneId);
      expect(paneCount()).toBe(18);

      // Create new pane
      const remainingPaneId = Object.keys(useWorkspaceStore.getState().workspaces[0].panes)[0];
      splitPane(remainingPaneId, 'right');
      expect(paneCount()).toBe(19);
    }

    // Final state should be consistent
    const finalState = useWorkspaceStore.getState();
    expect(Object.keys(finalState.workspaces[0].panes).length).toBe(19);
  });
});

describe('Workspace Store - Edge Cases: Additional Concurrent Sequences', () => {
  it('should keep state consistent across interleaved split and close operations', () => {
    const { splitPane, closePane } = useWorkspaceStore.getState();
    const initialPaneId = Object.keys(useWorkspaceStore.getState().workspaces[0].panes)[0];

    splitPane(initialPaneId, 'right');
    splitPane(initialPaneId, 'down');

    const afterSplit = useWorkspaceStore.getState();
    const paneIds = Object.keys(afterSplit.workspaces[0].panes).filter((id) => id !== initialPaneId);

    closePane(paneIds[0]);
    splitPane(initialPaneId, 'left');
    closePane(paneIds[1]);

    const finalState = useWorkspaceStore.getState();
    const finalPaneIds = Object.keys(finalState.workspaces[0].panes);

    expect(finalPaneIds.length).toBe(2);
    expect(new Set(finalPaneIds).size).toBe(2);
    expect(finalState.workspaces[0].activePaneId).toBeTruthy();
  });
});

describe('Workspace Store - Edge Cases: Deep Tree Manipulation', () => {
  it('should preserve a valid tree after 4-level nesting and selective closes', () => {
    const { splitPane, closePane } = useWorkspaceStore.getState();
    const rootPaneId = Object.keys(useWorkspaceStore.getState().workspaces[0].panes)[0];

    splitPane(rootPaneId, 'right');
    let paneIds = Object.keys(useWorkspaceStore.getState().workspaces[0].panes);
    const level1PaneId = paneIds.find((id) => id !== rootPaneId)!;

    splitPane(level1PaneId, 'down');
    paneIds = Object.keys(useWorkspaceStore.getState().workspaces[0].panes);
    const level2PaneId = paneIds.find((id) => id !== rootPaneId && id !== level1PaneId)!;

    splitPane(level2PaneId, 'left');
    paneIds = Object.keys(useWorkspaceStore.getState().workspaces[0].panes);
    const level3PaneId = paneIds.find(
      (id) => id !== rootPaneId && id !== level1PaneId && id !== level2PaneId,
    )!;

    splitPane(level3PaneId, 'up');

    const beforeClose = useWorkspaceStore.getState();
    expect(Object.keys(beforeClose.workspaces[0].panes)).toHaveLength(5);

    closePane(level2PaneId);
    closePane(level3PaneId);

    const afterClose = useWorkspaceStore.getState();
    const workspace = afterClose.workspaces[0];

    const countLeafNodes = (node: { type: 'leaf'; paneId: string } | { type: 'branch'; children: [any, any] }): number => {
      if (node.type === 'leaf') {
        return 1;
      }
      return countLeafNodes(node.children[0]) + countLeafNodes(node.children[1]);
    };

    expect(workspace.root.type).toBe('branch');
    expect(countLeafNodes(workspace.root)).toBe(Object.keys(workspace.panes).length);
  });
});

describe('Workspace Store - Edge Cases: Persistence Partialization', () => {
  it('should sanitize session ids and truncate scrollback during persistence serialization', () => {
    const { createTab, updateTabSessionId } = useWorkspaceStore.getState();
    const paneId = Object.keys(useWorkspaceStore.getState().workspaces[0].panes)[0];

    createTab(paneId, '/persist/check');

    const withTabState = useWorkspaceStore.getState();
    const tab = withTabState.workspaces[0].panes[paneId].tabs[withTabState.workspaces[0].panes[paneId].tabs.length - 1];

    updateTabSessionId(paneId, tab.id, 'session-123');

    useWorkspaceStore.setState((state) => {
      const targetTab = state.workspaces[0].panes[paneId].tabs.find((t) => t.id === tab.id)!;
      targetTab.scrollback = Array.from({ length: 1100 }, (_, i) => ({ text: `line-${i}` }));
    });

    const partialize = (
      useWorkspaceStore as unknown as {
        persist: {
          getOptions: () => {
            partialize: (state: ReturnType<typeof useWorkspaceStore.getState>) => {
              workspaces: Array<{ panes: Record<string, { tabs: Array<{ id: string; cwd: string; sessionId: string; scrollback: Array<{ text: string }> }> }> }>;
            };
          };
        };
      }
    ).persist.getOptions().partialize;

    const persisted = partialize(useWorkspaceStore.getState());
    const persistedTab = persisted.workspaces[0].panes[paneId].tabs.find((t) => t.id === tab.id)!;

    expect(persistedTab.cwd).toBe('/persist/check');
    expect(persistedTab.sessionId).toBe('');
    expect(persistedTab.scrollback).toHaveLength(1000);
    expect(persistedTab.scrollback[0].text).toBe('line-100');
    expect(persistedTab.scrollback[999].text).toBe('line-1099');
  });
});

describe('Workspace Store - Edge Cases: Notification Propagation Across Panes', () => {
  it('should retain workspace notification flag until notifications are cleared in all panes', () => {
    const { splitPane, markNotification, clearNotification } = useWorkspaceStore.getState();
    const firstPaneId = Object.keys(useWorkspaceStore.getState().workspaces[0].panes)[0];

    splitPane(firstPaneId, 'right');

    const stateAfterSplit = useWorkspaceStore.getState();
    const paneIds = Object.keys(stateAfterSplit.workspaces[0].panes);
    const firstTabId = stateAfterSplit.workspaces[0].panes[paneIds[0]].tabs[0].id;
    const secondTabId = stateAfterSplit.workspaces[0].panes[paneIds[1]].tabs[0].id;

    markNotification(firstTabId, 'pane-1-message');
    markNotification(secondTabId, 'pane-2-message');
    clearNotification(firstTabId);

    expect(useWorkspaceStore.getState().workspaces[0].hasNotification).toBe(true);

    clearNotification(secondTabId);

    const finalState = useWorkspaceStore.getState();
    expect(finalState.workspaces[0].hasNotification).toBe(false);
    expect(finalState.workspaces[0].panes[paneIds[0]].hasNotification).toBe(false);
    expect(finalState.workspaces[0].panes[paneIds[1]].hasNotification).toBe(false);
  });
});

describe('Workspace Store - Edge Cases: Pane Limits at Various States', () => {
  it('should allow new splits after reducing pane count from max limit', () => {
    const consoleSpy = vi.spyOn(console, 'warn');
    const { splitPane, closePane } = useWorkspaceStore.getState();
    const initialPaneId = Object.keys(useWorkspaceStore.getState().workspaces[0].panes)[0];

    for (let i = 0; i < 19; i++) {
      const firstPane = Object.keys(useWorkspaceStore.getState().workspaces[0].panes)[0];
      splitPane(firstPane, 'right');
    }

    expect(paneCount()).toBe(20);

    const blockedAttemptCount = paneCount();
    splitPane(initialPaneId, 'right');
    expect(paneCount()).toBe(blockedAttemptCount);

    const paneIds = Object.keys(useWorkspaceStore.getState().workspaces[0].panes);
    closePane(paneIds[paneIds.length - 1]);
    closePane(paneIds[paneIds.length - 2]);

    expect(paneCount()).toBe(18);

    splitPane(initialPaneId, 'down');
    splitPane(initialPaneId, 'left');

    expect(paneCount()).toBe(20);
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Maximum 20 panes reached'));
  });
});

describe('Workspace Store - Additional Branch Coverage', () => {
  it('should keep workspace list unchanged when closing a non-existent workspace', () => {
    const { closeWorkspace } = useWorkspaceStore.getState();
    const beforeIds = useWorkspaceStore.getState().workspaces.map((ws) => ws.id);

    closeWorkspace('workspace-does-not-exist');

    expect(useWorkspaceStore.getState().workspaces.map((ws) => ws.id)).toEqual(beforeIds);
  });

  it('should create workspace after a specific workspace and respect max workspace limit', () => {
    const { createWorkspaceAfter } = useWorkspaceStore.getState();
    const firstId = useWorkspaceStore.getState().workspaces[0].id;

    createWorkspaceAfter(firstId, 'After First');

    expect(useWorkspaceStore.getState().workspaces[1].name).toBe('After First');

    for (let i = 0; i < 12; i++) {
      const anchorId = useWorkspaceStore.getState().workspaces[0].id;
      createWorkspaceAfter(anchorId, `Extra ${i}`);
    }

    expect(useWorkspaceStore.getState().workspaces.length).toBe(8);
  });

  it('should not create workspace after an unknown workspace id', () => {
    const { createWorkspaceAfter } = useWorkspaceStore.getState();
    const beforeCount = useWorkspaceStore.getState().workspaces.length;

    createWorkspaceAfter('unknown-workspace-id', 'Should Not Exist');

    expect(useWorkspaceStore.getState().workspaces.length).toBe(beforeCount);
  });

  it('should move workspaces up and down with boundary no-ops', () => {
    const { createWorkspace, moveWorkspaceUp, moveWorkspaceDown } = useWorkspaceStore.getState();

    createWorkspace('Workspace 2');
    createWorkspace('Workspace 3');

    const stateAfterCreate = useWorkspaceStore.getState();
    const firstId = stateAfterCreate.workspaces[0].id;
    const secondId = stateAfterCreate.workspaces[1].id;
    const thirdId = stateAfterCreate.workspaces[2].id;

    moveWorkspaceUp(firstId);
    expect(useWorkspaceStore.getState().workspaces.map((ws) => ws.id)).toEqual([firstId, secondId, thirdId]);

    moveWorkspaceDown(thirdId);
    expect(useWorkspaceStore.getState().workspaces.map((ws) => ws.id)).toEqual([firstId, secondId, thirdId]);

    moveWorkspaceUp(thirdId);
    expect(useWorkspaceStore.getState().workspaces.map((ws) => ws.id)).toEqual([firstId, thirdId, secondId]);

    moveWorkspaceDown(firstId);
    expect(useWorkspaceStore.getState().workspaces.map((ws) => ws.id)).toEqual([thirdId, firstId, secondId]);

    moveWorkspaceDown('unknown-workspace-id');
    expect(useWorkspaceStore.getState().workspaces.map((ws) => ws.id)).toEqual([thirdId, firstId, secondId]);
  });

  it('should set active sidebar tab and register panels with replacement behavior', () => {
    const { setActiveSidebarTab, registerPanel } = useWorkspaceStore.getState();

    const gitPanel = {
      id: 'git' as const,
      title: 'Git',
      icon: () => null,
      fullRender: () => null,
    };

    const gitPanelUpdated = {
      id: 'git' as const,
      title: 'Git Updated',
      icon: () => null,
      fullRender: () => null,
    };

    setActiveSidebarTab('notifications');
    expect(useWorkspaceStore.getState().activeTab).toBe('notifications');

    registerPanel(gitPanel);
    expect(useWorkspaceStore.getState().panels).toHaveLength(1);
    expect(useWorkspaceStore.getState().panels[0].title).toBe('Git');

    registerPanel(gitPanelUpdated);
    expect(useWorkspaceStore.getState().panels).toHaveLength(1);
    expect(useWorkspaceStore.getState().panels[0].title).toBe('Git Updated');
  });

  it('should update git badge counts and selectors correctly', () => {
    const { updateGitChanges } = useWorkspaceStore.getState();

    updateGitChanges(3, 7);

    const state = useWorkspaceStore.getState();
    expect(state.gitStagedCount).toBe(3);
    expect(state.gitChangesCount).toBe(7);
    expect(getGitChangesCount()).toBe(10);
  });

  it('should clamp zoom actions to configured min and max values', () => {
    const { zoomIn, zoomOut, resetZoom } = useWorkspaceStore.getState();

    for (let i = 0; i < 100; i++) {
      zoomIn();
    }
    expect(useWorkspaceStore.getState().fontSize).toBe(32);

    for (let i = 0; i < 100; i++) {
      zoomOut();
    }
    expect(useWorkspaceStore.getState().fontSize).toBe(8);

    resetZoom();
    expect(useWorkspaceStore.getState().fontSize).toBe(14);
  });

  it('should handle selector fallbacks for active and missing sidebar panels', () => {
    const { registerPanel } = useWorkspaceStore.getState();

    expect(getActivePanel()).toBeNull();
    expect(getPanel('project')).toBeNull();

    registerPanel({
      id: 'project',
      title: 'Project',
      icon: () => null,
      fullRender: () => null,
    });
    registerPanel({
      id: 'notifications',
      title: 'Notifications',
      icon: () => null,
      fullRender: () => null,
    });

    useWorkspaceStore.getState().setActiveSidebarTab('project');

    expect(getPanel('project')?.title).toBe('Project');
    expect(getActivePanel()?.id).toBe('project');
  });

  it('should compute total notification count across all panes and tabs', () => {
    const { splitPane, createTab, markNotification } = useWorkspaceStore.getState();
    const initialPaneId = Object.keys(useWorkspaceStore.getState().workspaces[0].panes)[0];

    splitPane(initialPaneId, 'right');

    const stateAfterSplit = useWorkspaceStore.getState();
    const paneIds = Object.keys(stateAfterSplit.workspaces[0].panes);

    createTab(paneIds[0]);
    createTab(paneIds[1]);

    const withTabs = useWorkspaceStore.getState();
    const paneOneTabs = withTabs.workspaces[0].panes[paneIds[0]].tabs;
    const paneTwoTabs = withTabs.workspaces[0].panes[paneIds[1]].tabs;

    markNotification(paneOneTabs[0].id, 'n1');
    markNotification(paneOneTabs[0].id, 'n2');
    markNotification(paneOneTabs[1].id, 'n3');
    markNotification(paneTwoTabs[0].id, 'n4');

    expect(getTotalNotificationCount()).toBe(4);
  });

  it('should ignore updateTabSessionId for unknown pane and tab ids', () => {
    const { updateTabSessionId } = useWorkspaceStore.getState();
    const paneId = Object.keys(useWorkspaceStore.getState().workspaces[0].panes)[0];
    const tabId = useWorkspaceStore.getState().workspaces[0].panes[paneId].tabs[0].id;

    updateTabSessionId('missing-pane-id', tabId, 'session-x');
    expect(useWorkspaceStore.getState().workspaces[0].panes[paneId].tabs[0].sessionId).toBe('');

    updateTabSessionId(paneId, 'missing-tab-id', 'session-y');
    expect(useWorkspaceStore.getState().workspaces[0].panes[paneId].tabs[0].sessionId).toBe('');
  });
});
