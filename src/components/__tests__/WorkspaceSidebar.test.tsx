import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom/vitest';
import { WorkspaceSidebar } from '../WorkspaceSidebar';
import useWorkspaceStore from '../../state/workspace';

const hoisted = vi.hoisted(() => {
  const requestMock = vi.fn();

  return {
    requestMock,
    workspaces: [
      {
        id: 'workspace-1',
        name: 'Workspace 1',
        root: { type: 'leaf', paneId: 'pane-1' },
        activePaneId: null,
        hasNotification: false,
      },
      {
        id: 'workspace-2',
        name: 'Workspace 2',
        root: { type: 'leaf', paneId: 'pane-2' },
        activePaneId: null,
        hasNotification: false,
      },
    ] as Array<{
      id: string;
      name: string;
      root: unknown;
      activePaneId: string | null;
      hasNotification: boolean;
    }>,
    isLoading: false,
    error: null as string | null,
    refetchMock: vi.fn(async () => undefined),
  };
});

vi.mock('../../hooks/useWorkspaces', () => ({
  useWorkspaces: () => ({
    workspaces: hoisted.workspaces,
    isLoading: hoisted.isLoading,
    error: hoisted.error,
    refetch: hoisted.refetchMock,
  }),
}));

vi.mock('../../services/websocket', () => ({
  getWebSocketService: () => ({
    request: hoisted.requestMock,
  }),
}));

vi.mock('../../lib/logger', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

describe('WorkspaceSidebar WebSocket integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const { resetState } = useWorkspaceStore.getState();
    resetState?.();

    hoisted.workspaces = [
      {
        id: 'workspace-1',
        name: 'Workspace 1',
        root: { type: 'leaf', paneId: 'pane-1' },
        activePaneId: null,
        hasNotification: false,
      },
      {
        id: 'workspace-2',
        name: 'Workspace 2',
        root: { type: 'leaf', paneId: 'pane-2' },
        activePaneId: null,
        hasNotification: false,
      },
    ];
    hoisted.isLoading = false;
    hoisted.error = null;
    hoisted.requestMock.mockResolvedValue({});
    hoisted.refetchMock.mockResolvedValue(undefined);
  });

  it('renders workspace list from useWorkspaces hook', () => {
    render(<WorkspaceSidebar />);

    expect(screen.getByText('Workspace 1')).toBeInTheDocument();
    expect(screen.getByText('Workspace 2')).toBeInTheDocument();
  });

  it('reconciles server workspaces into app workspace store', () => {
    render(<WorkspaceSidebar />);

    const storeWorkspaceIds = useWorkspaceStore
      .getState()
      .workspaces.map((workspace) => workspace.id);

    expect(storeWorkspaceIds).toContain('workspace-2');
  });

  it('reconciles again when store is later overwritten with stale workspaces', async () => {
    render(<WorkspaceSidebar />);

    act(() => {
      const firstWorkspace = useWorkspaceStore.getState().workspaces[0];
      useWorkspaceStore.setState({
        workspaces: [firstWorkspace],
        activeWorkspaceId: firstWorkspace.id,
      });
    });

    await waitFor(() => {
      const ids = useWorkspaceStore.getState().workspaces.map((workspace) => workspace.id);
      expect(ids).toContain('workspace-2');
    });
  });

  it('creates a workspace via WebSocket command from New button', async () => {
    const user = userEvent.setup();
    hoisted.requestMock.mockResolvedValueOnce({ workspace: { id: 'workspace-3' } });

    render(<WorkspaceSidebar />);

    await user.click(screen.getByRole('button', { name: /new/i }));

    await waitFor(() => {
      expect(hoisted.requestMock).toHaveBeenCalledWith('workspace.create', {
        name: 'Workspace 3',
      });
    });
    expect(hoisted.refetchMock).toHaveBeenCalled();
  });

  it('switches active workspace when clicking server-backed workspace tab', async () => {
    const user = userEvent.setup();
    render(<WorkspaceSidebar />);

    await user.click(screen.getByText('Workspace 2'));

    expect(useWorkspaceStore.getState().activeWorkspaceId).toBe('workspace-2');
  });

  it('renames a workspace via WebSocket from context menu', async () => {
    const user = userEvent.setup();
    const promptSpy = vi.spyOn(window, 'prompt').mockReturnValue('Renamed Workspace');
    hoisted.requestMock.mockResolvedValueOnce({ workspace: { id: 'workspace-1', name: 'Renamed Workspace' } });

    render(<WorkspaceSidebar />);

    await user.pointer({
      keys: '[MouseRight]',
      target: screen.getByText('Workspace 1'),
    });
    await user.click(screen.getByText('Rename Workspace'));

    await waitFor(() => {
      expect(hoisted.requestMock).toHaveBeenCalledWith('workspace.rename', {
        id: 'workspace-1',
        name: 'Renamed Workspace',
      });
    });
    expect(hoisted.refetchMock).toHaveBeenCalled();
    promptSpy.mockRestore();
  });

  it('deletes a workspace via WebSocket from context menu', async () => {
    const user = userEvent.setup();
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);

    render(<WorkspaceSidebar />);

    await user.pointer({
      keys: '[MouseRight]',
      target: screen.getByText('Workspace 2'),
    });
    await user.click(screen.getByText('Delete Workspace'));

    await waitFor(() => {
      expect(hoisted.requestMock).toHaveBeenCalledWith('workspace.delete', {
        id: 'workspace-2',
      });
    });
    expect(hoisted.refetchMock).toHaveBeenCalled();
    confirmSpy.mockRestore();
  });

  it('renders hook error text when workspace loading fails', () => {
    hoisted.error = 'Failed to load workspaces';

    render(<WorkspaceSidebar />);

    expect(screen.getByText('Failed to load workspaces')).toBeInTheDocument();
  });
});
