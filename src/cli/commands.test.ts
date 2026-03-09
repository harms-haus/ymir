// Tests for CLI commands exposed on window.ymir
// Provides programmatic control over workspace/pane/tab operations

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CLI, initCLI } from './commands';
import useWorkspaceStore from '../state/workspace';
import { paneCount } from '../state/workspace';

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
// split() Command Tests
// ============================================================================

describe('CLI Commands - split()', () => {
  it('should split a pane to the right', () => {
    const initialPaneCount = paneCount();
    const state = useWorkspaceStore.getState();
    const paneId = Object.keys(state.workspaces[0].panes)[0];

    // Set active pane
    useWorkspaceStore.getState().setActivePane(paneId);

    CLI.split('right');

    expect(paneCount()).toBe(initialPaneCount + 1);
  });

  it('should split a pane to the left', () => {
    const initialPaneCount = paneCount();
    const state = useWorkspaceStore.getState();
    const paneId = Object.keys(state.workspaces[0].panes)[0];

    useWorkspaceStore.getState().setActivePane(paneId);

    CLI.split('left');

    expect(paneCount()).toBe(initialPaneCount + 1);
  });

  it('should split a pane down', () => {
    const initialPaneCount = paneCount();
    const state = useWorkspaceStore.getState();
    const paneId = Object.keys(state.workspaces[0].panes)[0];

    useWorkspaceStore.getState().setActivePane(paneId);

    CLI.split('down');

    expect(paneCount()).toBe(initialPaneCount + 1);
  });

  it('should split a pane up', () => {
    const initialPaneCount = paneCount();
    const state = useWorkspaceStore.getState();
    const paneId = Object.keys(state.workspaces[0].panes)[0];

    useWorkspaceStore.getState().setActivePane(paneId);

    CLI.split('up');

    expect(paneCount()).toBe(initialPaneCount + 1);
  });

  it('should not throw when no active workspace', () => {
    // Clear workspaces
    useWorkspaceStore.setState({ workspaces: [], activeWorkspaceId: '' });

    expect(() => CLI.split('right')).not.toThrow();
  });

  it('should not throw when no active pane', () => {
    const state = useWorkspaceStore.getState();
    const workspaceId = state.workspaces[0].id;

    // Set active workspace but no active pane
    useWorkspaceStore.setState({
      activeWorkspaceId: workspaceId,
      workspaces: [
        {
          ...state.workspaces[0],
          activePaneId: null,
        },
      ],
    });

    expect(() => CLI.split('right')).not.toThrow();
  });
});

// ============================================================================
// newTab() Command Tests
// ============================================================================

describe('CLI Commands - newTab()', () => {
  it('should create a new tab in active pane', () => {
    const state = useWorkspaceStore.getState();
    const paneId = Object.keys(state.workspaces[0].panes)[0];
    const beforeTabCount = state.workspaces[0].panes[paneId].tabs.length;

    useWorkspaceStore.getState().setActivePane(paneId);

    CLI.newTab();

    const newState = useWorkspaceStore.getState();
    expect(newState.workspaces[0].panes[paneId].tabs.length).toBe(
      beforeTabCount + 1,
    );
  });

  it('should create a new tab with custom cwd', () => {
    const state = useWorkspaceStore.getState();
    const paneId = Object.keys(state.workspaces[0].panes)[0];

    useWorkspaceStore.getState().setActivePane(paneId);

    CLI.newTab('/custom/path');

    const newState = useWorkspaceStore.getState();
    const tabs = newState.workspaces[0].panes[paneId].tabs;
    const newTab = tabs[tabs.length - 1];
    expect(newTab.cwd).toBe('/custom/path');
  });

  it('should not throw when no active workspace', () => {
    useWorkspaceStore.setState({ workspaces: [], activeWorkspaceId: '' });

    expect(() => CLI.newTab()).not.toThrow();
  });

  it('should not throw when no active pane', () => {
    const state = useWorkspaceStore.getState();
    const workspaceId = state.workspaces[0].id;

    useWorkspaceStore.setState({
      activeWorkspaceId: workspaceId,
      workspaces: [
        {
          ...state.workspaces[0],
          activePaneId: null,
        },
      ],
    });

    expect(() => CLI.newTab()).not.toThrow();
  });
});

// ============================================================================
// closeTab() Command Tests
// ============================================================================

describe('CLI Commands - closeTab()', () => {
  it('should close the active tab in active pane', () => {
    const state = useWorkspaceStore.getState();
    const paneId = Object.keys(state.workspaces[0].panes)[0];

    // Create an extra tab first
    useWorkspaceStore.getState().createTab(paneId);

    // Get updated state after creating tab
    const updatedState = useWorkspaceStore.getState();
    const beforeTabCount = updatedState.workspaces[0].panes[paneId].tabs.length;

    useWorkspaceStore.getState().setActivePane(paneId);

    CLI.closeTab();

    const newState = useWorkspaceStore.getState();
    expect(newState.workspaces[0].panes[paneId].tabs.length).toBe(
      beforeTabCount - 1,
    );
  });

  it('should not throw when no active workspace', () => {
    useWorkspaceStore.setState({ workspaces: [], activeWorkspaceId: '' });

    expect(() => CLI.closeTab()).not.toThrow();
  });

  it('should not throw when no active pane', () => {
    const state = useWorkspaceStore.getState();
    const workspaceId = state.workspaces[0].id;

    useWorkspaceStore.setState({
      activeWorkspaceId: workspaceId,
      workspaces: [
        {
          ...state.workspaces[0],
          activePaneId: null,
        },
      ],
    });

    expect(() => CLI.closeTab()).not.toThrow();
  });

  it('should not throw when pane has no active tab', () => {
    const state = useWorkspaceStore.getState();
    const paneId = Object.keys(state.workspaces[0].panes)[0];

    // Set active pane but clear active tab
    useWorkspaceStore.setState({
      workspaces: [
        {
          ...state.workspaces[0],
          activePaneId: paneId,
          panes: {
            ...state.workspaces[0].panes,
            [paneId]: {
              ...state.workspaces[0].panes[paneId],
              activeTabId: null,
            },
          },
        },
      ],
    });

    expect(() => CLI.closeTab()).not.toThrow();
  });
});

// ============================================================================
// closePane() Command Tests
// ============================================================================

describe('CLI Commands - closePane()', () => {
  it('should close the active pane', () => {
    const state = useWorkspaceStore.getState();
    const paneId = Object.keys(state.workspaces[0].panes)[0];

    // Create a split first so we can close one
    useWorkspaceStore.getState().splitPane(paneId, 'right');
    const beforePaneCount = paneCount();

    // Get the new pane ID
    const newState = useWorkspaceStore.getState();
    const panes = Object.keys(newState.workspaces[0].panes);
    const paneToClose = panes[panes.length - 1];

    useWorkspaceStore.getState().setActivePane(paneToClose);

    CLI.closePane();

    expect(paneCount()).toBe(beforePaneCount - 1);
  });

  it('should not close the last pane', () => {
    const state = useWorkspaceStore.getState();
    const paneId = Object.keys(state.workspaces[0].panes)[0];

    useWorkspaceStore.getState().setActivePane(paneId);

    const beforePaneCount = paneCount();

    CLI.closePane();

    expect(paneCount()).toBe(beforePaneCount);
  });

  it('should not throw when no active workspace', () => {
    useWorkspaceStore.setState({ workspaces: [], activeWorkspaceId: '' });

    expect(() => CLI.closePane()).not.toThrow();
  });

  it('should not throw when no active pane', () => {
    const state = useWorkspaceStore.getState();
    const workspaceId = state.workspaces[0].id;

    useWorkspaceStore.setState({
      activeWorkspaceId: workspaceId,
      workspaces: [
        {
          ...state.workspaces[0],
          activePaneId: null,
        },
      ],
    });

    expect(() => CLI.closePane()).not.toThrow();
  });
});

// ============================================================================
// notify() Command Tests
// ============================================================================

describe('CLI Commands - notify()', () => {
  it('should mark notification on active tab', () => {
    const state = useWorkspaceStore.getState();
    const paneId = Object.keys(state.workspaces[0].panes)[0];
    const tabId = state.workspaces[0].panes[paneId].tabs[0].id;

    useWorkspaceStore.getState().setActivePane(paneId);

    CLI.notify('Build complete');

    const newState = useWorkspaceStore.getState();
    const tab = newState.workspaces[0].panes[paneId].tabs[0];
    expect(tab.hasNotification).toBe(true);
    expect(tab.notificationText).toBe('Build complete');
  });

  it('should increment notification count', () => {
    const state = useWorkspaceStore.getState();
    const paneId = Object.keys(state.workspaces[0].panes)[0];

    useWorkspaceStore.getState().setActivePane(paneId);

    CLI.notify('First notification');
    CLI.notify('Second notification');

    const newState = useWorkspaceStore.getState();
    const tab = newState.workspaces[0].panes[paneId].tabs[0];
    expect(tab.notificationCount).toBe(2);
  });

  it('should not throw when no active workspace', () => {
    useWorkspaceStore.setState({ workspaces: [], activeWorkspaceId: '' });

    expect(() => CLI.notify('Test message')).not.toThrow();
  });

  it('should not throw when no active pane', () => {
    const state = useWorkspaceStore.getState();
    const workspaceId = state.workspaces[0].id;

    useWorkspaceStore.setState({
      activeWorkspaceId: workspaceId,
      workspaces: [
        {
          ...state.workspaces[0],
          activePaneId: null,
        },
      ],
    });

    expect(() => CLI.notify('Test message')).not.toThrow();
  });

  it('should not throw when pane has no active tab', () => {
    const state = useWorkspaceStore.getState();
    const paneId = Object.keys(state.workspaces[0].panes)[0];

    useWorkspaceStore.setState({
      workspaces: [
        {
          ...state.workspaces[0],
          activePaneId: paneId,
          panes: {
            ...state.workspaces[0].panes,
            [paneId]: {
              ...state.workspaces[0].panes[paneId],
              activeTabId: null,
            },
          },
        },
      ],
    });

    expect(() => CLI.notify('Test message')).not.toThrow();
  });
});

// ============================================================================
// focus() Command Tests
// ============================================================================

describe('CLI Commands - focus()', () => {
  it('should be a placeholder function (not implemented)', () => {
    // focus() is a placeholder for Phase 2
    // It should not throw and should return void
    expect(() => CLI.focus('left')).not.toThrow();
    expect(() => CLI.focus('right')).not.toThrow();
    expect(() => CLI.focus('up')).not.toThrow();
    expect(() => CLI.focus('down')).not.toThrow();
  });

  it('should accept all direction values', () => {
    // Verify all directions are accepted without error
    const directions = ['left', 'right', 'up', 'down'] as const;

    directions.forEach((direction) => {
      expect(() => CLI.focus(direction)).not.toThrow();
    });
  });
});

// ============================================================================
// initCLI() Tests
// ============================================================================

describe('CLI Commands - initCLI()', () => {
  it('should expose CLI on window.ymir', () => {
    // Mock window object
    const mockWindow = {} as Window & { ymir?: typeof CLI };
    globalThis.window = mockWindow as unknown as Window & typeof globalThis;

    initCLI();

    expect(mockWindow.ymir).toBeDefined();
    expect(mockWindow.ymir?.split).toBe(CLI.split);
    expect(mockWindow.ymir?.newTab).toBe(CLI.newTab);
    expect(mockWindow.ymir?.closeTab).toBe(CLI.closeTab);
    expect(mockWindow.ymir?.closePane).toBe(CLI.closePane);
    expect(mockWindow.ymir?.notify).toBe(CLI.notify);
    expect(mockWindow.ymir?.focus).toBe(CLI.focus);
  });

  it('should log initialization message', () => {
    const consoleSpy = vi.spyOn(console, 'log');

    // Mock window object
    const mockWindow = {} as Window & { ymir?: typeof CLI };
    globalThis.window = mockWindow as unknown as Window & typeof globalThis;

    initCLI();

    expect(consoleSpy).toHaveBeenCalledWith('[ymir] CLI initialized on window.ymir');
  });
});
