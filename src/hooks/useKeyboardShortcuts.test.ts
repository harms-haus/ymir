import { act, render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import useWorkspaceStore from '../state/workspace';
import {
  useKeyboardShortcuts,
  type UseKeyboardShortcutsReturn,
} from './useKeyboardShortcuts';
import { fireKeyDown } from '../test-utils/events';

function assertDefined<T>(value: T, name: string): NonNullable<T> {
  if (value === null || value === undefined) {
    throw new Error(`${name} should be defined`);
  }
  return value;
}

function KeyboardShortcutsHarness({
  onUpdate,
}: {
  onUpdate: (api: UseKeyboardShortcutsReturn) => void;
}) {
  const api = useKeyboardShortcuts();
  onUpdate(api);
  return null;
}

function mountKeyboardShortcutsHook() {
  let latestApi: UseKeyboardShortcutsReturn | null = null;

  const result = render(
    createElement(KeyboardShortcutsHarness, {
      onUpdate: (api: UseKeyboardShortcutsReturn) => {
        latestApi = api;
      },
    }),
  );

  return {
    ...result,
    getApi: () => {
      if (!latestApi) {
        throw new Error('Hook API not initialized');
      }
      return latestApi;
    },
  };
}

function pressKey(options: {
  key: string;
  metaKey?: boolean;
  ctrlKey?: boolean;
  shiftKey?: boolean;
}) {
  act(() => {
    fireKeyDown(document, options);
  });
}

describe('useKeyboardShortcuts', () => {
  beforeEach(() => {
    const { resetState } = useWorkspaceStore.getState();
    resetState();
    vi.restoreAllMocks();
  });

  it('switches workspace with Cmd/Ctrl + number (1-8)', () => {
    const { createWorkspace } = useWorkspaceStore.getState();
    for (let i = 2; i <= 8; i += 1) {
      createWorkspace(`Workspace ${i}`);
    }

    mountKeyboardShortcutsHook();

    let state = useWorkspaceStore.getState();
    pressKey({ key: '3', metaKey: true });
    state = useWorkspaceStore.getState();
    expect(state.activeWorkspaceId).toBe(state.workspaces[2].id);

    pressKey({ key: '7', ctrlKey: true });
    state = useWorkspaceStore.getState();
    expect(state.activeWorkspaceId).toBe(state.workspaces[6].id);
  });

  it('handles split shortcuts with modifier combinations', () => {
    const splitPaneSpy = vi.spyOn(useWorkspaceStore.getState(), 'splitPane');
    mountKeyboardShortcutsHook();

    const paneId = useWorkspaceStore.getState().workspaces[0].activePaneId;
    expect(paneId).toBeTruthy();

    pressKey({ key: 'd', metaKey: true });
    expect(splitPaneSpy).toHaveBeenCalledWith(paneId, 'right');

    pressKey({ key: 'd', ctrlKey: true, shiftKey: true });
    expect(splitPaneSpy).toHaveBeenCalledWith(paneId, 'down');
  });

  it('creates tab in focused pane before active pane', () => {
    const {
      splitPane,
      setActivePane,
      activeWorkspaceId,
    } = useWorkspaceStore.getState();

    const workspace = useWorkspaceStore
      .getState()
      .workspaces.find((ws) => ws.id === activeWorkspaceId);
    expect(workspace).toBeTruthy();

    const firstPaneId = assertDefined(workspace?.activePaneId, 'firstPaneId');
    splitPane(firstPaneId, 'right');

    const panes = Object.keys(useWorkspaceStore.getState().workspaces[0].panes);
    const secondPaneId = assertDefined(
      panes.find((id) => id !== firstPaneId),
      'secondPaneId',
    );

    setActivePane(firstPaneId);

    const { getApi } = mountKeyboardShortcutsHook();

    const beforeFirstTabs = useWorkspaceStore.getState().workspaces[0].panes[firstPaneId].tabs.length;
    const beforeSecondTabs = useWorkspaceStore.getState().workspaces[0].panes[secondPaneId].tabs.length;

    act(() => {
      getApi().setFocusedPaneId(secondPaneId);
    });

    pressKey({ key: 't', metaKey: true });
    expect(useWorkspaceStore.getState().workspaces[0].panes[firstPaneId].tabs.length).toBe(beforeFirstTabs);
    expect(useWorkspaceStore.getState().workspaces[0].panes[secondPaneId].tabs.length).toBe(beforeSecondTabs + 1);

    act(() => {
      getApi().setFocusedPaneId(null);
    });

    pressKey({ key: 't', ctrlKey: true });
    expect(useWorkspaceStore.getState().workspaces[0].panes[firstPaneId].tabs.length).toBe(beforeFirstTabs + 1);
  });

  it('closes active tab with Cmd/Ctrl+W and closes pane with Cmd/Ctrl+Shift+W', () => {
    const closeTabSpy = vi.spyOn(useWorkspaceStore.getState(), 'closeTab');
    const closePaneSpy = vi.spyOn(useWorkspaceStore.getState(), 'closePane');
    const { splitPane } = useWorkspaceStore.getState();

    const paneId = assertDefined(
      useWorkspaceStore.getState().workspaces[0].activePaneId,
      'paneId',
    );
    splitPane(paneId, 'right');

    mountKeyboardShortcutsHook();

    const activePane = useWorkspaceStore.getState().workspaces[0].panes[paneId];
    expect(activePane.activeTabId).toBeTruthy();

    pressKey({ key: 'w', metaKey: true });
    expect(closeTabSpy).toHaveBeenCalledWith(paneId, activePane.activeTabId);

    const paneToClose = assertDefined(
      useWorkspaceStore.getState().workspaces[0].activePaneId,
      'paneToClose',
    );
    pressKey({ key: 'W', ctrlKey: true, shiftKey: true });
    expect(closePaneSpy).toHaveBeenCalledWith(paneToClose);
  });

  it('toggles sidebar and notifications tab shortcuts', () => {
    const toggleSidebarSpy = vi.spyOn(useWorkspaceStore.getState(), 'toggleSidebar');
    const setActiveSidebarTabSpy = vi.spyOn(useWorkspaceStore.getState(), 'setActiveSidebarTab');

    mountKeyboardShortcutsHook();

    pressKey({ key: 'b', metaKey: true });
    expect(toggleSidebarSpy).toHaveBeenCalledTimes(1);

    pressKey({ key: 'i', ctrlKey: true });
    expect(setActiveSidebarTabSpy).toHaveBeenCalledWith('notifications');
    expect(useWorkspaceStore.getState().activeTab).toBe('notifications');
  });

  it('jumps to first unread notification with Cmd/Ctrl+Shift+U', () => {
    const { splitPane, markNotification } = useWorkspaceStore.getState();

    const firstPaneId = assertDefined(
      useWorkspaceStore.getState().workspaces[0].activePaneId,
      'firstPaneId',
    );
    splitPane(firstPaneId, 'right');
    const paneIds = Object.keys(useWorkspaceStore.getState().workspaces[0].panes);
    const unreadPaneId = assertDefined(
      paneIds.find((id) => id !== firstPaneId),
      'unreadPaneId',
    );

    const unreadTabId = useWorkspaceStore.getState().workspaces[0].panes[unreadPaneId].tabs[0].id;
    markNotification(unreadTabId, 'unread');

    mountKeyboardShortcutsHook();

    pressKey({ key: 'u', metaKey: true, shiftKey: true });

    const state = useWorkspaceStore.getState();
    expect(state.workspaces[0].activePaneId).toBe(unreadPaneId);
    expect(state.workspaces[0].panes[unreadPaneId].activeTabId).toBe(unreadTabId);
  });

  it('handles zoom in/out/reset shortcuts', () => {
    const zoomInSpy = vi.spyOn(useWorkspaceStore.getState(), 'zoomIn');
    const zoomOutSpy = vi.spyOn(useWorkspaceStore.getState(), 'zoomOut');
    const resetZoomSpy = vi.spyOn(useWorkspaceStore.getState(), 'resetZoom');

    mountKeyboardShortcutsHook();

    pressKey({ key: '=', metaKey: true });
    pressKey({ key: '+', ctrlKey: true, shiftKey: true });
    pressKey({ key: '-', metaKey: true });
    pressKey({ key: '0', ctrlKey: true });

    expect(zoomInSpy).toHaveBeenCalledTimes(2);
    expect(zoomOutSpy).toHaveBeenCalledTimes(1);
    expect(resetZoomSpy).toHaveBeenCalledTimes(1);
  });

  it('prevents browser defaults for all registered shortcuts', () => {
    const preventDefaultSpy = vi.spyOn(KeyboardEvent.prototype, 'preventDefault');
    mountKeyboardShortcutsHook();

    const shortcuts = [
      { key: '1', metaKey: true },
      { key: 'd', metaKey: true },
      { key: 'd', metaKey: true, shiftKey: true },
      { key: 't', metaKey: true },
      { key: 'w', metaKey: true },
      { key: 'W', metaKey: true, shiftKey: true },
      { key: 'b', metaKey: true },
      { key: 'i', metaKey: true },
      { key: 'u', metaKey: true, shiftKey: true },
      { key: '=', metaKey: true },
      { key: '-', metaKey: true },
      { key: '0', metaKey: true },
    ];

    for (const shortcut of shortcuts) {
      pressKey(shortcut);
    }

    expect(preventDefaultSpy).toHaveBeenCalledTimes(shortcuts.length);
  });

  it('does not trigger shortcuts without Cmd/Ctrl modifier', () => {
    const splitPaneSpy = vi.spyOn(useWorkspaceStore.getState(), 'splitPane');
    const createTabSpy = vi.spyOn(useWorkspaceStore.getState(), 'createTab');
    splitPaneSpy.mockClear();
    createTabSpy.mockClear();

    mountKeyboardShortcutsHook();

    pressKey({ key: 'd' });
    pressKey({ key: 't' });

    expect(splitPaneSpy).not.toHaveBeenCalled();
    expect(createTabSpy).not.toHaveBeenCalled();
  });

  it('cleans up keydown listener on unmount', () => {
    const splitPaneSpy = vi.spyOn(useWorkspaceStore.getState(), 'splitPane');
    splitPaneSpy.mockClear();
    const { unmount } = mountKeyboardShortcutsHook();

    unmount();
    pressKey({ key: 'd', metaKey: true });

    expect(splitPaneSpy).not.toHaveBeenCalled();
  });
});
