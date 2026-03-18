import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WorkspaceSettingsDialog } from '../WorkspaceSettingsDialog';

const mockWorkspace = {
  id: 'workspace-1',
  name: 'My Workspace',
  rootPath: '/path/to/workspace',
  color: '#3b82f6',
  icon: 'ri-folder-line',
  worktreeBaseDir: '.worktrees/',
  createdAt: Date.now(),
  updatedAt: Date.now(),
};

const mockStore = {
  workspaces: [mockWorkspace],
  worktrees: [],
  agentSessions: [],
  terminalSessions: [],
  notifications: [],
  activeWorktreeId: null,
  connectionStatus: 'open' as const,
  connectionError: null,
  expandedWorkspaceIds: new Set<string>(),
  agentTabs: new Map(),
  activeAgentTabId: new Map(),
  prDialog: { isOpen: false, title: '', body: '' },
  createWorktreeDialog: { isOpen: false, workspaceId: null },
  workspaceSettingsDialog: { isOpen: false, workspaceId: null },
  setWorkspaces: vi.fn(),
  setWorktrees: vi.fn(),
  setAgentSessions: vi.fn(),
  setTerminalSessions: vi.fn(),
  setActiveWorktree: vi.fn(),
  setConnectionStatus: vi.fn(),
  setConnectionError: vi.fn(),
  toggleWorkspaceExpanded: vi.fn(),
  stateFromSnapshot: vi.fn(),
  addWorkspace: vi.fn(),
  updateWorkspace: vi.fn(),
  removeWorkspace: vi.fn(),
  addWorktree: vi.fn(),
  updateWorktree: vi.fn(),
  removeWorktree: vi.fn(),
  addAgentSession: vi.fn(),
  updateAgentSession: vi.fn(),
  removeAgentSession: vi.fn(),
  addTerminalSession: vi.fn(),
  removeTerminalSession: vi.fn(),
  addNotification: vi.fn(),
  removeNotification: vi.fn(),
  clearNotifications: vi.fn(),
  addAgentTab: vi.fn(),
  removeAgentTab: vi.fn(),
  setActiveAgentTab: vi.fn(),
  updateAgentTab: vi.fn(),
  setPRDialogOpen: vi.fn(),
  setPRDialogTitle: vi.fn(),
  setPRDialogBody: vi.fn(),
  resetPRDialog: vi.fn(),
  setCreateWorktreeDialogOpen: vi.fn(),
  resetCreateWorktreeDialog: vi.fn(),
  setWorkspaceSettingsDialogOpen: vi.fn(),
  resetWorkspaceSettingsDialog: vi.fn(),
};

const mockSend = vi.fn();
const mockOnMessage = vi.fn(() => vi.fn());

vi.mock('../../../store', () => ({
  useStore: vi.fn((selector) => {
    if (typeof selector === 'function') {
      return selector(mockStore);
    }
    return mockStore;
  }),
  selectWorkspaceById: vi.fn((workspaceId: string) => () =>
    mockStore.workspaces.find((w: any) => w.id === workspaceId)
  ),
}));

vi.mock('../../../lib/ws', () => ({
  getWebSocketClient: vi.fn(() => ({
    send: mockSend,
    onMessage: mockOnMessage,
  })),
}));

describe('WorkspaceSettingsDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockOnMessage.mockReturnValue(vi.fn());
    mockStore.worktrees = [];
  });

  it('renders dialog when open is true', () => {
    render(
      <WorkspaceSettingsDialog
        open={true}
        onOpenChange={vi.fn()}
        workspaceId="workspace-1"
      />
    );

    expect(screen.getByText('Workspace Settings')).toBeInTheDocument();
    expect(screen.getByText('Configure workspace properties')).toBeInTheDocument();
  });

  it('does not render dialog when open is false', () => {
    render(
      <WorkspaceSettingsDialog
        open={false}
        onOpenChange={vi.fn()}
        workspaceId="workspace-1"
      />
    );

    expect(screen.queryByText('Workspace Settings')).not.toBeInTheDocument();
  });

  it('does not render dialog when workspaceId is null', () => {
    render(
      <WorkspaceSettingsDialog
        open={true}
        onOpenChange={vi.fn()}
        workspaceId={null}
      />
    );

    expect(screen.queryByText('Workspace Settings')).not.toBeInTheDocument();
  });

  it('pre-fills fields with workspace data', () => {
    render(
      <WorkspaceSettingsDialog
        open={true}
        onOpenChange={vi.fn()}
        workspaceId="workspace-1"
      />
    );

    const nameInput = screen.getByDisplayValue('My Workspace') as HTMLInputElement;
    expect(nameInput).toBeInTheDocument();

    const rootPathInput = screen.getByDisplayValue('/path/to/workspace') as HTMLInputElement;
    expect(rootPathInput).toBeInTheDocument();

    const worktreeDirInput = screen.getByDisplayValue('.worktrees/') as HTMLInputElement;
    expect(worktreeDirInput).toBeInTheDocument();
  });

  it('allows changing worktree base directory', () => {
    render(
      <WorkspaceSettingsDialog
        open={true}
        onOpenChange={vi.fn()}
        workspaceId="workspace-1"
      />
    );

    const worktreeDirInput = screen.getByDisplayValue('.worktrees/') as HTMLInputElement;
    fireEvent.change(worktreeDirInput, { target: { value: '.wt/' } });

    expect(worktreeDirInput.value).toBe('.wt/');
  });

  it('selects color when color button is clicked', () => {
    render(
      <WorkspaceSettingsDialog
        open={true}
        onOpenChange={vi.fn()}
        workspaceId="workspace-1"
      />
    );

    const redColorButton = screen.getByRole('radio', { name: 'Red' });
    fireEvent.click(redColorButton);

    expect(redColorButton).toHaveAttribute('aria-checked', 'true');
  });

  it('selects icon when icon button is clicked', () => {
    render(
      <WorkspaceSettingsDialog
        open={true}
        onOpenChange={vi.fn()}
        workspaceId="workspace-1"
      />
    );

    const codeBoxIcon = screen.getByRole('radio', { name: 'code-box' });
    fireEvent.click(codeBoxIcon);

    expect(codeBoxIcon).toHaveAttribute('aria-checked', 'true');
  });

  it('calls onOpenChange with false when Cancel is clicked', () => {
    const onOpenChange = vi.fn();
    render(
      <WorkspaceSettingsDialog
        open={true}
        onOpenChange={onOpenChange}
        workspaceId="workspace-1"
      />
    );

    const cancelButton = screen.getByText('Cancel');
    fireEvent.click(cancelButton);

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('sends WorkspaceUpdate message when Save is clicked', async () => {
    render(
      <WorkspaceSettingsDialog
        open={true}
        onOpenChange={vi.fn()}
        workspaceId="workspace-1"
      />
    );

    const saveButton = screen.getByText('Save').closest('button') as HTMLButtonElement;
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(mockSend).toHaveBeenCalledWith({
        type: 'WorkspaceUpdate',
        workspaceId: 'workspace-1',
        color: '#3b82f6',
        icon: 'ri-folder-line',
        worktreeBaseDir: '.worktrees/',
      });
    });
  });

  it('sends WorkspaceUpdate with modified values', async () => {
    render(
      <WorkspaceSettingsDialog
        open={true}
        onOpenChange={vi.fn()}
        workspaceId="workspace-1"
      />
    );

    const redColorButton = screen.getByRole('radio', { name: 'Red' });
    fireEvent.click(redColorButton);

    const codeBoxIcon = screen.getByRole('radio', { name: 'code-box' });
    fireEvent.click(codeBoxIcon);

    const worktreeDirInput = screen.getByDisplayValue('.worktrees/') as HTMLInputElement;
    fireEvent.change(worktreeDirInput, { target: { value: '.my-worktrees/' } });

    const saveButton = screen.getByText('Save').closest('button') as HTMLButtonElement;
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(mockSend).toHaveBeenCalledWith({
        type: 'WorkspaceUpdate',
        workspaceId: 'workspace-1',
        color: '#ef4444',
        icon: 'ri-code-box-line',
        worktreeBaseDir: '.my-worktrees/',
      });
    });
  });

  it('shows loading state on Save button when submitting', async () => {
    render(
      <WorkspaceSettingsDialog
        open={true}
        onOpenChange={vi.fn()}
        workspaceId="workspace-1"
      />
    );

    const saveButton = screen.getByText('Save').closest('button') as HTMLButtonElement;
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(screen.getByText('Saving...')).toBeInTheDocument();
    });
  });

  it('shows delete confirmation when Delete Workspace is clicked', () => {
    render(
      <WorkspaceSettingsDialog
        open={true}
        onOpenChange={vi.fn()}
        workspaceId="workspace-1"
      />
    );

    const deleteButton = screen.getByText('Delete Workspace');
    fireEvent.click(deleteButton);

    expect(screen.getByText(/Delete workspace "My Workspace"\?/)).toBeInTheDocument();
  });

  it('blocks delete if worktrees exist', () => {
    mockStore.worktrees = [
      {
        id: 'worktree-1',
        workspaceId: 'workspace-1',
        branchName: 'feature-1',
        path: '/path/to/wt1',
        status: 'active' as const,
        createdAt: Date.now(),
      },
    ];

    render(
      <WorkspaceSettingsDialog
        open={true}
        onOpenChange={vi.fn()}
        workspaceId="workspace-1"
      />
    );

    const deleteButton = screen.getByText('Delete Workspace');
    fireEvent.click(deleteButton);

    expect(mockStore.addNotification).toHaveBeenCalledWith({
      level: 'error',
      message: 'This workspace has 1 worktree. Delete all worktrees first.',
    });
  });

  it('sends WorkspaceDelete message when Delete is confirmed', async () => {
    render(
      <WorkspaceSettingsDialog
        open={true}
        onOpenChange={vi.fn()}
        workspaceId="workspace-1"
      />
    );

    const deleteButton = screen.getByText('Delete Workspace');
    fireEvent.click(deleteButton);

    const confirmDeleteButton = screen.getByText('Delete').closest('button') as HTMLButtonElement;
    fireEvent.click(confirmDeleteButton);

    await waitFor(() => {
      expect(mockSend).toHaveBeenCalledWith({
        type: 'WorkspaceDelete',
        workspaceId: 'workspace-1',
      });
    });
  });

  it('cancels delete when Cancel is clicked in confirmation', () => {
    render(
      <WorkspaceSettingsDialog
        open={true}
        onOpenChange={vi.fn()}
        workspaceId="workspace-1"
      />
    );

    const deleteButton = screen.getByRole('button', { name: 'Delete Workspace' });
    fireEvent.click(deleteButton);

    const confirmationText = screen.getByText(/Delete workspace "My Workspace"\?/);
    expect(confirmationText).toBeInTheDocument();

    const allCancelButtons = screen.getAllByRole('button', { name: 'Cancel' });
    fireEvent.click(allCancelButtons[0]);

    expect(screen.queryByText(/Delete workspace "My Workspace"\?/)).not.toBeInTheDocument();
  });

  it('shows Danger Zone section', () => {
    render(
      <WorkspaceSettingsDialog
        open={true}
        onOpenChange={vi.fn()}
        workspaceId="workspace-1"
      />
    );

    expect(screen.getByText('Danger Zone')).toBeInTheDocument();
  });

  it('disables inputs when submitting', async () => {
    render(
      <WorkspaceSettingsDialog
        open={true}
        onOpenChange={vi.fn()}
        workspaceId="workspace-1"
      />
    );

    const saveButton = screen.getByText('Save').closest('button') as HTMLButtonElement;
    fireEvent.click(saveButton);

    await waitFor(() => {
      const worktreeDirInput = screen.getByDisplayValue('.worktrees/') as HTMLInputElement;
      expect(worktreeDirInput.disabled).toBe(true);
    });
  });

  it('handles WorkspaceUpdated message and closes dialog', async () => {
    const onOpenChange = vi.fn();

    mockOnMessage.mockImplementation((type: string, handler: Function) => {
      if (type === 'WorkspaceUpdated') {
        setTimeout(() => {
          handler({ workspace: { id: 'workspace-1' } });
        }, 0);
      }
      return vi.fn();
    });

    render(
      <WorkspaceSettingsDialog
        open={true}
        onOpenChange={onOpenChange}
        workspaceId="workspace-1"
      />
    );

    const saveButton = screen.getByText('Save').closest('button') as HTMLButtonElement;
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(onOpenChange).toHaveBeenCalledWith(false);
      expect(mockStore.addNotification).toHaveBeenCalledWith({
        level: 'info',
        message: 'Settings saved',
      });
    });
  });

  it('handles WorkspaceDeleted message and closes dialog', async () => {
    const onOpenChange = vi.fn();

    mockOnMessage.mockImplementation((type: string, handler: Function) => {
      if (type === 'WorkspaceDeleted') {
        setTimeout(() => {
          handler({ workspaceId: 'workspace-1' });
        }, 0);
      }
      return vi.fn();
    });

    render(
      <WorkspaceSettingsDialog
        open={true}
        onOpenChange={onOpenChange}
        workspaceId="workspace-1"
      />
    );

    const deleteButton = screen.getByText('Delete Workspace');
    fireEvent.click(deleteButton);

    const confirmDeleteButton = screen.getByText('Delete').closest('button') as HTMLButtonElement;
    fireEvent.click(confirmDeleteButton);

    await waitFor(() => {
      expect(onOpenChange).toHaveBeenCalledWith(false);
      expect(mockStore.addNotification).toHaveBeenCalledWith({
        level: 'info',
        message: 'Workspace deleted',
      });
    });
  });
});