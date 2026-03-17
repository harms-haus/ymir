import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CreatePRDialog } from '../CreatePRDialog';

const mockWorktree = {
  id: 'worktree-1',
  workspaceId: 'workspace-1',
  branchName: 'feature/my-branch',
  path: '/path/to/worktree',
  status: 'active' as const,
  createdAt: Date.now(),
};

const mockStore = {
  workspaces: [],
  worktrees: [mockWorktree],
  agentSessions: [],
  terminalSessions: [],
  notifications: [],
  activeWorktreeId: 'worktree-1',
  connectionStatus: 'open' as const,
  connectionError: null,
  agentTabs: new Map(),
  activeAgentTabId: new Map(),
  prDialog: { isOpen: false, title: '', body: '' },
  setWorkspaces: vi.fn(),
  setWorktrees: vi.fn(),
  setAgentSessions: vi.fn(),
  setTerminalSessions: vi.fn(),
  setActiveWorktree: vi.fn(),
  setConnectionStatus: vi.fn(),
  setConnectionError: vi.fn(),
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
  selectActiveWorktree: vi.fn(() => mockWorktree),
}));

vi.mock('../../../lib/ws', () => ({
  getWebSocketClient: vi.fn(() => ({
    send: mockSend,
    onMessage: mockOnMessage,
  })),
}));

describe('CreatePRDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockOnMessage.mockReturnValue(vi.fn());
  });

  it('renders dialog when open is true', () => {
    render(<CreatePRDialog open={true} onOpenChange={vi.fn()} />);

    expect(screen.getByText('Create Pull Request')).toBeInTheDocument();
    expect(screen.getByText('Create a PR for the current worktree changes')).toBeInTheDocument();
  });

  it('does not render dialog when open is false', () => {
    render(<CreatePRDialog open={false} onOpenChange={vi.fn()} />);

    expect(screen.queryByText('Create Pull Request')).not.toBeInTheDocument();
  });

  it('pre-fills title with branch name', () => {
    render(<CreatePRDialog open={true} onOpenChange={vi.fn()} />);

    const titleInput = screen.getByPlaceholderText('Enter PR title') as HTMLInputElement;
    expect(titleInput.value).toBe('feature/my-branch');
  });

  it('has empty body by default', () => {
    render(<CreatePRDialog open={true} onOpenChange={vi.fn()} />);

    const bodyInput = screen.getByPlaceholderText('Enter PR description (optional)') as HTMLTextAreaElement;
    expect(bodyInput.value).toBe('');
  });

  it('allows editing title', () => {
    render(<CreatePRDialog open={true} onOpenChange={vi.fn()} />);

    const titleInput = screen.getByPlaceholderText('Enter PR title') as HTMLInputElement;
    fireEvent.change(titleInput, { target: { value: 'New PR Title' } });

    expect(titleInput.value).toBe('New PR Title');
  });

  it('allows editing body', () => {
    render(<CreatePRDialog open={true} onOpenChange={vi.fn()} />);

    const bodyInput = screen.getByPlaceholderText('Enter PR description (optional)') as HTMLTextAreaElement;
    fireEvent.change(bodyInput, { target: { value: 'This is a description' } });

    expect(bodyInput.value).toBe('This is a description');
  });

  it('calls onOpenChange with false when Cancel is clicked', () => {
    const onOpenChange = vi.fn();
    render(<CreatePRDialog open={true} onOpenChange={onOpenChange} />);

    const cancelButton = screen.getByText('Cancel');
    fireEvent.click(cancelButton);

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('disables Create PR button when title is empty', () => {
    render(<CreatePRDialog open={true} onOpenChange={vi.fn()} />);

    const titleInput = screen.getByPlaceholderText('Enter PR title') as HTMLInputElement;
    fireEvent.change(titleInput, { target: { value: '' } });

    const createButton = screen.getByText('Create PR').closest('button');
    expect(createButton?.disabled).toBe(true);
  });

  it('enables Create PR button when title has content', () => {
    render(<CreatePRDialog open={true} onOpenChange={vi.fn()} />);

    const titleInput = screen.getByPlaceholderText('Enter PR title') as HTMLInputElement;
    fireEvent.change(titleInput, { target: { value: 'Valid Title' } });

    const createButton = screen.getByText('Create PR').closest('button');
    expect(createButton?.disabled).toBe(false);
  });

  it('sends CreatePR message when form is submitted', async () => {
    render(<CreatePRDialog open={true} onOpenChange={vi.fn()} />);

    const titleInput = screen.getByPlaceholderText('Enter PR title') as HTMLInputElement;
    fireEvent.change(titleInput, { target: { value: 'My PR Title' } });

    const bodyInput = screen.getByPlaceholderText('Enter PR description (optional)') as HTMLTextAreaElement;
    fireEvent.change(bodyInput, { target: { value: 'My PR Description' } });

    const createButton = screen.getByText('Create PR').closest('button') as HTMLButtonElement;
    fireEvent.click(createButton);

    await waitFor(() => {
      expect(mockSend).toHaveBeenCalledWith({
        type: 'CreatePR',
        worktreeId: 'worktree-1',
        title: 'My PR Title',
        body: 'My PR Description',
      });
    });
  });

  it('sends CreatePR without body when body is empty', async () => {
    render(<CreatePRDialog open={true} onOpenChange={vi.fn()} />);

    const titleInput = screen.getByPlaceholderText('Enter PR title') as HTMLInputElement;
    fireEvent.change(titleInput, { target: { value: 'My PR Title' } });

    const createButton = screen.getByText('Create PR').closest('button') as HTMLButtonElement;
    fireEvent.click(createButton);

    await waitFor(() => {
      expect(mockSend).toHaveBeenCalledWith({
        type: 'CreatePR',
        worktreeId: 'worktree-1',
        title: 'My PR Title',
      });
    });
  });

  it('shows loading state on Create PR button when submitting', async () => {
    render(<CreatePRDialog open={true} onOpenChange={vi.fn()} />);

    const createButton = screen.getByText('Create PR').closest('button') as HTMLButtonElement;
    fireEvent.click(createButton);

    await waitFor(() => {
      expect(screen.getByText('Creating...')).toBeInTheDocument();
    });
  });

  it('shows loading state on Auto-generate button when auto-generating', async () => {
    render(<CreatePRDialog open={true} onOpenChange={vi.fn()} />);

    const autoGenerateButton = screen.getByText('Auto-generate').closest('button') as HTMLButtonElement;
    fireEvent.click(autoGenerateButton);

    await waitFor(() => {
      expect(screen.getByText('Generating...')).toBeInTheDocument();
    });
  });

  it('sends AgentSpawn message when Auto-generate is clicked', async () => {
    render(<CreatePRDialog open={true} onOpenChange={vi.fn()} />);

    const autoGenerateButton = screen.getByText('Auto-generate').closest('button') as HTMLButtonElement;
    fireEvent.click(autoGenerateButton);

    await waitFor(() => {
      expect(mockSend).toHaveBeenCalledWith({
        type: 'AgentSpawn',
        worktreeId: 'worktree-1',
        agentType: 'pr-generator',
      });
    });
  });

  it('disables inputs when auto-generating', async () => {
    render(<CreatePRDialog open={true} onOpenChange={vi.fn()} />);

    const autoGenerateButton = screen.getByText('Auto-generate').closest('button') as HTMLButtonElement;
    fireEvent.click(autoGenerateButton);

    const titleInput = screen.getByPlaceholderText('Enter PR title') as HTMLInputElement;
    expect(titleInput.disabled).toBe(true);

    const bodyInput = screen.getByPlaceholderText('Enter PR description (optional)') as HTMLTextAreaElement;
    expect(bodyInput.disabled).toBe(true);
  });

  it('disables inputs when submitting', async () => {
    render(<CreatePRDialog open={true} onOpenChange={vi.fn()} />);

    const createButton = screen.getByText('Create PR').closest('button') as HTMLButtonElement;
    fireEvent.click(createButton);

    const titleInput = screen.getByPlaceholderText('Enter PR title') as HTMLInputElement;
    expect(titleInput.disabled).toBe(true);

    const bodyInput = screen.getByPlaceholderText('Enter PR description (optional)') as HTMLTextAreaElement;
    expect(bodyInput.disabled).toBe(true);
  });

});
