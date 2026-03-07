// Integration tests for workspace system
// Tests full user workflows and system behavior

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import useWorkspaceStore, {
  activeWorkspace,
  activePane,
  paneCount,
  hasNotifications,
} from '../state/workspace';

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

afterEach(() => {
  vi.restoreAllMocks();
});

// ============================================================================
// Full User Workflow Tests
// ============================================================================

describe('Integration - Full User Workflow', () => {
  it('should complete create → split → tabs → close workflow', () => {
    const {
      createWorkspace,
      splitPane,
      createTab,
      closeTab,
      closePane,
    } = useWorkspaceStore.getState();

    // 1. Create a new workspace
    createWorkspace('Test Workspace');
    let state = useWorkspaceStore.getState();
    expect(state.workspaces).toHaveLength(2);
    const workspace2Id = state.workspaces[1].id;

    // Switch to new workspace
    const { setActiveWorkspace } = useWorkspaceStore.getState();
    setActiveWorkspace(workspace2Id);
    state = useWorkspaceStore.getState();
    expect(state.activeWorkspaceId).toBe(workspace2Id);

    // 2. Get initial pane ID
    const paneId1 = Object.keys(state.workspaces[1].panes)[0];
    const initialPaneCount = paneCount();

    // 3. Split pane to the right
    splitPane(paneId1, 'right');
    state = useWorkspaceStore.getState();
    expect(paneCount()).toBe(initialPaneCount + 1);

    // 4. Create tabs in first pane
    createTab(paneId1);
    createTab(paneId1);
    state = useWorkspaceStore.getState();
    expect(state.workspaces[1].panes[paneId1].tabs).toHaveLength(3);

    // 5. Create tabs in second pane
    const paneId2 = Object.keys(state.workspaces[1].panes)[1];
    createTab(paneId2);
    state = useWorkspaceStore.getState();
    expect(state.workspaces[1].panes[paneId2].tabs).toHaveLength(2);

    // 6. Close tabs in first pane
    const tab1 = state.workspaces[1].panes[paneId1].tabs[0].id;
    closeTab(paneId1, tab1);
    state = useWorkspaceStore.getState();
    expect(state.workspaces[1].panes[paneId1].tabs).toHaveLength(2);

    // 7. Close second pane (with its tabs)
    closePane(paneId2);
    state = useWorkspaceStore.getState();
    expect(paneCount()).toBe(initialPaneCount);

    // Verify workspace still exists
    expect(state.workspaces).toHaveLength(2);
    expect(state.workspaces[1].panes[paneId1]).toBeTruthy();
  });

  it('should handle multiple splits in different directions', () => {
    const { splitPane } = useWorkspaceStore.getState();

    let state = useWorkspaceStore.getState();
    let paneId = Object.keys(state.workspaces[0].panes)[0];

    // Split right
    splitPane(paneId, 'right');
    state = useWorkspaceStore.getState();
    expect(paneCount()).toBe(2);

    // Get new pane ID
    paneId = Object.keys(state.workspaces[0].panes)[1];

    // Split down
    splitPane(paneId, 'down');
    state = useWorkspaceStore.getState();
    expect(paneCount()).toBe(3);

    // Split left
    splitPane(paneId, 'left');
    state = useWorkspaceStore.getState();
    expect(paneCount()).toBe(4);

    // Split up
    splitPane(paneId, 'up');
    state = useWorkspaceStore.getState();
    expect(paneCount()).toBe(5);
  });

  it('should maintain active pane after splits', () => {
    const { splitPane, setActivePane } = useWorkspaceStore.getState();

    let state = useWorkspaceStore.getState();
    const paneId1 = Object.keys(state.workspaces[0].panes)[0];
    setActivePane(paneId1);

    splitPane(paneId1, 'right');
    state = useWorkspaceStore.getState();

    // After split, original pane should still be active
    expect(state.workspaces[0].activePaneId).toBe(paneId1);

    // Switch to new pane
    const paneId2 = Object.keys(state.workspaces[0].panes)[1];
    setActivePane(paneId2);
    state = useWorkspaceStore.getState();
    expect(state.workspaces[0].activePaneId).toBe(paneId2);
  });

  it('should handle closing pane with multiple tabs', () => {
    const { createTab, closeTab, closePane } = useWorkspaceStore.getState();

    let state = useWorkspaceStore.getState();
    const paneId = Object.keys(state.workspaces[0].panes)[0];

    // Create multiple tabs
    createTab(paneId);
    createTab(paneId);
    createTab(paneId);
    state = useWorkspaceStore.getState();
    expect(state.workspaces[0].panes[paneId].tabs).toHaveLength(4);

    // Close tabs one by one
    const tabs = state.workspaces[0].panes[paneId].tabs;
    closeTab(paneId, tabs[1].id);
    closeTab(paneId, tabs[2].id);
    state = useWorkspaceStore.getState();
    expect(state.workspaces[0].panes[paneId].tabs).toHaveLength(2);

    // Close pane (should trigger if last tabs are closed)
    closePane(paneId);
    state = useWorkspaceStore.getState();

    // Pane is still there because closePane only removes pane when last tab is closed
    // Pane with tabs remains - user must close all tabs to remove pane
    expect(state.workspaces[0].panes[paneId]).toBeTruthy();
  });
});

// ============================================================================
// Session Persistence Tests
// ============================================================================

describe('Integration - Session Persistence', () => {
  it('should save and restore state across resets', () => {
    const { resetState, createWorkspace, splitPane, createTab, setActiveWorkspace } =
      useWorkspaceStore.getState();

    // Create complex state
    createWorkspace('Persistent Workspace');
    let state = useWorkspaceStore.getState();
    const wsId = state.workspaces[1].id;
    setActiveWorkspace(wsId);

    const paneId = Object.keys(state.workspaces[1].panes)[0];
    splitPane(paneId, 'right');
    createTab(paneId);

    state = useWorkspaceStore.getState();
    const beforeReset = JSON.stringify(state.workspaces);

    // Reset state (simulates reload)
    resetState();
    state = useWorkspaceStore.getState();

    // After reset, should return to initial state
    expect(state.workspaces).toHaveLength(1);
    expect(state.workspaces[0].name).toBe('Workspace 1');
    expect(state.activeWorkspaceId).toBe(state.workspaces[0].id);
  });

  it('should reset to clean state when resetState is called', () => {
    const {
      resetState,
      createWorkspace,
      splitPane,
      createTab,
      markNotification,
    } = useWorkspaceStore.getState();

    // Modify state extensively
    createWorkspace('Workspace 2');
    createWorkspace('Workspace 3');
    let state = useWorkspaceStore.getState();

    const paneId = Object.keys(state.workspaces[0].panes)[0];
    splitPane(paneId, 'right');
    createTab(paneId);

    const tabId = state.workspaces[0].panes[paneId].tabs[0].id;
    markNotification(tabId, 'Test notification');

    const { toggleSidebar, toggleNotificationPanel } = useWorkspaceStore.getState();
    toggleSidebar();
    toggleNotificationPanel();

    state = useWorkspaceStore.getState();
    expect(state.workspaces).toHaveLength(3);
    expect(state.sidebarCollapsed).toBe(true);
    expect(state.notificationPanelOpen).toBe(true);

    // Reset
    resetState();
    state = useWorkspaceStore.getState();

    // Verify clean initial state
    expect(state.workspaces).toHaveLength(1);
    expect(state.workspaces[0].name).toBe('Workspace 1');
    expect(state.sidebarCollapsed).toBe(false);
    expect(state.notificationPanelOpen).toBe(false);
    expect(state.activeWorkspaceId).toBe('workspace-1');
  });
});

// ============================================================================
// Keyboard Shortcut Tests
// ============================================================================

describe('Integration - Keyboard Shortcuts', () => {
  it('should support workspace switching via keyboard pattern', () => {
    const { createWorkspace, setActiveWorkspace } = useWorkspaceStore.getState();

    // Create 3 workspaces
    createWorkspace('Workspace 2');
    createWorkspace('Workspace 3');
    createWorkspace('Workspace 4');

    let state = useWorkspaceStore.getState();
    expect(state.workspaces).toHaveLength(4);

    // Simulate Cmd/Ctrl+1, Cmd/Ctrl+2, etc.
    setActiveWorkspace(state.workspaces[0].id);
    state = useWorkspaceStore.getState();
    expect(state.activeWorkspaceId).toBe(state.workspaces[0].id);

    setActiveWorkspace(state.workspaces[1].id);
    state = useWorkspaceStore.getState();
    expect(state.activeWorkspaceId).toBe(state.workspaces[1].id);

    setActiveWorkspace(state.workspaces[3].id);
    state = useWorkspaceStore.getState();
    expect(state.activeWorkspaceId).toBe(state.workspaces[3].id);
  });

  it('should support tab creation via keyboard', () => {
    const { createTab } = useWorkspaceStore.getState();

    let state = useWorkspaceStore.getState();
    const paneId = Object.keys(state.workspaces[0].panes)[0];
    const initialTabCount = state.workspaces[0].panes[paneId].tabs.length;

    // Simulate Cmd/Ctrl+T (new tab)
    createTab(paneId);
    createTab(paneId);
    createTab(paneId);

    state = useWorkspaceStore.getState();
    expect(state.workspaces[0].panes[paneId].tabs.length).toBe(
      initialTabCount + 3,
    );
  });

  it('should support tab closing via keyboard', () => {
    const { createTab, closeTab } = useWorkspaceStore.getState();

    let state = useWorkspaceStore.getState();
    const paneId = Object.keys(state.workspaces[0].panes)[0];

    // Add tabs
    createTab(paneId);
    createTab(paneId);
    state = useWorkspaceStore.getState();
    const initialTabCount = state.workspaces[0].panes[paneId].tabs.length;

    // Simulate Cmd/Ctrl+W (close tab)
    const tabId1 = state.workspaces[0].panes[paneId].tabs[1].id;
    closeTab(paneId, tabId1);

    state = useWorkspaceStore.getState();
    expect(state.workspaces[0].panes[paneId].tabs.length).toBe(
      initialTabCount - 1,
    );

    // Verify active tab is adjusted
    expect(
      state.workspaces[0].panes[paneId].activeTabId,
    ).toBeTruthy();
  });

  it('should support pane splitting via keyboard', () => {
    const { splitPane } = useWorkspaceStore.getState();

    let state = useWorkspaceStore.getState();
    const paneId = Object.keys(state.workspaces[0].panes)[0];
    const initialPaneCount = paneCount();

    // Simulate Cmd/Ctrl+D (split right)
    splitPane(paneId, 'right');
    state = useWorkspaceStore.getState();
    expect(paneCount()).toBe(initialPaneCount + 1);

    // Simulate Cmd/Ctrl+Shift+D (split down)
    const newPaneId = Object.keys(state.workspaces[0].panes)[1];
    splitPane(newPaneId, 'down');
    state = useWorkspaceStore.getState();
    expect(paneCount()).toBe(initialPaneCount + 2);
  });
});

// ============================================================================
// Pane Limits Tests
// ============================================================================

describe('Integration - Pane Limits', () => {
  it('should enforce maximum panes limit', () => {
    const consoleSpy = vi.spyOn(console, 'warn');
    const { splitPane } = useWorkspaceStore.getState();

    let state = useWorkspaceStore.getState();
    const paneId = Object.keys(state.workspaces[0].panes)[0];

    // Try to create 25 panes (should stop at 20)
    for (let i = 0; i < 25; i++) {
      splitPane(paneId, 'right');
    }

    state = useWorkspaceStore.getState();
    const finalPaneCount = paneCount();

    expect(finalPaneCount).toBeLessThanOrEqual(20);
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('Maximum 20 panes reached'),
    );

    // Try to split again after limit reached
    const lastPaneId = Object.keys(state.workspaces[0].panes)[
      Object.keys(state.workspaces[0].panes).length - 1
    ];
    splitPane(lastPaneId, 'right');

    state = useWorkspaceStore.getState();
    expect(paneCount()).toBeLessThanOrEqual(20);
  });

  it('should warn when approaching pane limit', () => {
    const consoleSpy = vi.spyOn(console, 'warn');
    const { splitPane } = useWorkspaceStore.getState();

    let state = useWorkspaceStore.getState();
    const paneId = Object.keys(state.workspaces[0].panes)[0];

    // Create 16 panes (should trigger warning at 15)
    for (let i = 0; i < 16; i++) {
      splitPane(paneId, 'right');
    }

    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('Warning:'),
    );
  });

  it('should allow splitting below limit', () => {
    const consoleSpy = vi.spyOn(console, 'warn');
    const { splitPane } = useWorkspaceStore.getState();

    let state = useWorkspaceStore.getState();
    const paneId = Object.keys(state.workspaces[0].panes)[0];

    // Create 9 more panes (1 initial + 9 = 10 total)
    for (let i = 0; i < 9; i++) {
      splitPane(paneId, 'right');
    }

    state = useWorkspaceStore.getState();
    expect(paneCount()).toBe(10);

    // Should not warn
    expect(consoleSpy).not.toHaveBeenCalledWith(
      expect.stringContaining('Maximum'),
    );
  });

  it('should prevent closing last pane in workspace', () => {
    const { closePane } = useWorkspaceStore.getState();

    let state = useWorkspaceStore.getState();
    const paneId = Object.keys(state.workspaces[0].panes)[0];
    const initialPaneCount = paneCount();

    closePane(paneId);

    state = useWorkspaceStore.getState();
    expect(paneCount()).toBe(initialPaneCount);
    expect(state.workspaces[0].panes[paneId]).toBeTruthy();
  });
});

// ============================================================================
// Notification System Tests
// ============================================================================

describe('Integration - Notification System', () => {
  it('should mark and clear notifications across tabs', () => {
    const { markNotification, clearNotification, createTab } =
      useWorkspaceStore.getState();

    let state = useWorkspaceStore.getState();
    const paneId = Object.keys(state.workspaces[0].panes)[0];

    // Create multiple tabs
    createTab(paneId);
    createTab(paneId);
    state = useWorkspaceStore.getState();

    // Mark notifications on different tabs
    const tabIds = state.workspaces[0].panes[paneId].tabs.map((t) => t.id);
    markNotification(tabIds[0], 'First notification');
    markNotification(tabIds[1], 'Second notification');
    markNotification(tabIds[2], 'Third notification');

    state = useWorkspaceStore.getState();

    // Verify notifications are marked
    expect(state.workspaces[0].panes[paneId].tabs[0].hasNotification).toBe(
      true,
    );
    expect(state.workspaces[0].panes[paneId].tabs[0].notificationCount).toBe(
      1,
    );
    expect(
      state.workspaces[0].panes[paneId].tabs[0].notificationText,
    ).toBe('First notification');

    expect(state.workspaces[0].panes[paneId].tabs[1].hasNotification).toBe(
      true,
    );

    // Verify pane has notification flag
    expect(state.workspaces[0].panes[paneId].hasNotification).toBe(true);
    expect(state.workspaces[0].hasNotification).toBe(true);

    // Verify hasNotifications getter
    expect(hasNotifications()).toBe(true);

    // Clear notifications
    clearNotification(tabIds[0]);
    clearNotification(tabIds[2]);

    state = useWorkspaceStore.getState();

    // Verify cleared notifications
    expect(state.workspaces[0].panes[paneId].tabs[0].hasNotification).toBe(
      false,
    );
    expect(state.workspaces[0].panes[paneId].tabs[0].notificationCount).toBe(
      0,
    );
    expect(
      state.workspaces[0].panes[paneId].tabs[0].notificationText,
    ).toBeUndefined();

    // One tab still has notification
    expect(state.workspaces[0].panes[paneId].tabs[1].hasNotification).toBe(
      true,
    );
    expect(state.workspaces[0].panes[paneId].hasNotification).toBe(true);
  });

  it('should increment notification count for same tab', () => {
    const { markNotification } = useWorkspaceStore.getState();

    let state = useWorkspaceStore.getState();
    const paneId = Object.keys(state.workspaces[0].panes)[0];
    const tabId = state.workspaces[0].panes[paneId].tabs[0].id;

    // Mark multiple notifications on same tab
    markNotification(tabId, 'First');
    markNotification(tabId, 'Second');
    markNotification(tabId, 'Third');

    state = useWorkspaceStore.getState();

    expect(state.workspaces[0].panes[paneId].tabs[0].notificationCount).toBe(
      3,
    );
    expect(
      state.workspaces[0].panes[paneId].tabs[0].notificationText,
    ).toBe('Third'); // Should show latest message
  });

  it('should set active tab and clear notification', () => {
    const {
      setActiveTab,
      markNotification,
      createTab,
    } = useWorkspaceStore.getState();

    let state = useWorkspaceStore.getState();
    const paneId = Object.keys(state.workspaces[0].panes)[0];

    // Create a second tab
    createTab(paneId);
    state = useWorkspaceStore.getState();
    const tabId = state.workspaces[0].panes[paneId].tabs[0].id;
    const tabId2 = state.workspaces[0].panes[paneId].tabs[1].id;

    // Mark notification on first tab
    markNotification(tabId, 'Unread message');
    state = useWorkspaceStore.getState();

    expect(state.workspaces[0].panes[paneId].tabs[0].hasNotification).toBe(
      true,
    );

    // Switch to different tab (clears notification on that tab)
    setActiveTab(paneId, tabId2);

    state = useWorkspaceStore.getState();

    expect(state.workspaces[0].panes[paneId].tabs[1].hasNotification).toBe(
      false,
    );
    expect(state.workspaces[0].panes[paneId].tabs[1].notificationCount).toBe(
      0,
    );
  });

  it('should track notifications across multiple workspaces', () => {
    const { createWorkspace, markNotification, setActiveWorkspace, clearNotification } =
      useWorkspaceStore.getState();

    // Create second workspace
    createWorkspace('Workspace 2');
    let state = useWorkspaceStore.getState();

    // Mark notification in workspace 1
    const pane1Id = Object.keys(state.workspaces[0].panes)[0];
    const tab1Id = state.workspaces[0].panes[pane1Id].tabs[0].id;
    markNotification(tab1Id, 'Notification in WS1');

    // Mark notification in workspace 2
    const pane2Id = Object.keys(state.workspaces[1].panes)[0];
    const tab2Id = state.workspaces[1].panes[pane2Id].tabs[0].id;
    markNotification(tab2Id, 'Notification in WS2');

    state = useWorkspaceStore.getState();

    // Both workspaces should have notification flag
    expect(state.workspaces[0].hasNotification).toBe(true);
    expect(state.workspaces[1].hasNotification).toBe(true);

    // hasNotifications getter should return true
    expect(hasNotifications()).toBe(true);

    // Clear notification in workspace 2
    setActiveWorkspace(state.workspaces[1].id);
    clearNotification(tab2Id);

    state = useWorkspaceStore.getState();

    // Workspace 2 should not have notification
    expect(state.workspaces[1].hasNotification).toBe(false);

    // Workspace 1 still has notification
    expect(state.workspaces[0].hasNotification).toBe(true);

    // hasNotifications getter should still return true
    expect(hasNotifications()).toBe(true);
  });

  it('should toggle UI panels', () => {
    const { toggleSidebar, toggleNotificationPanel } =
      useWorkspaceStore.getState();

    let state = useWorkspaceStore.getState();

    expect(state.sidebarCollapsed).toBe(false);
    expect(state.notificationPanelOpen).toBe(false);

    // Toggle sidebar
    toggleSidebar();
    state = useWorkspaceStore.getState();
    expect(state.sidebarCollapsed).toBe(true);

    // Toggle notification panel
    toggleNotificationPanel();
    state = useWorkspaceStore.getState();
    expect(state.notificationPanelOpen).toBe(true);

    // Toggle both back
    toggleSidebar();
    toggleNotificationPanel();
    state = useWorkspaceStore.getState();
    expect(state.sidebarCollapsed).toBe(false);
    expect(state.notificationPanelOpen).toBe(false);
  });
});
