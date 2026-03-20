import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CreateWorktreeDialog } from '../CreateWorktreeDialog';

const mockAddNotification = vi.fn();
const mockSetActiveWorktree = vi.fn();
const mockOnOpenChange = vi.fn();

const mockStore = {
  addNotification: mockAddNotification,
  setActiveWorktree: mockSetActiveWorktree,
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
}));

vi.mock('../../../lib/ws', () => ({
  getWebSocketClient: vi.fn(() => ({
    send: mockSend,
    onMessage: mockOnMessage,
  })),
  generateId: vi.fn(() => 'test-request-id'),
}));

describe('CreateWorktreeDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockOnMessage.mockReturnValue(vi.fn());
  });

  describe('Rendering', () => {
    it('renders dialog when open is true', () => {
      render(
        <CreateWorktreeDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          workspaceId="workspace-1"
        />
      );

      expect(screen.getByText('New Worktree')).toBeInTheDocument();
      expect(screen.getByText('Create a new git worktree for this workspace')).toBeInTheDocument();
    });

    it('does not render dialog content when open is false', () => {
      render(
        <CreateWorktreeDialog
          open={false}
          onOpenChange={mockOnOpenChange}
          workspaceId="workspace-1"
        />
      );

      expect(screen.queryByText('New Worktree')).not.toBeInTheDocument();
    });

    it('renders branch name input', () => {
      render(
        <CreateWorktreeDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          workspaceId="workspace-1"
        />
      );

      expect(screen.getByLabelText('Branch name')).toBeInTheDocument();
      expect(screen.getByPlaceholderText('feature/my-branch')).toBeInTheDocument();
    });

    it('renders use existing branch checkbox', () => {
      render(
        <CreateWorktreeDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          workspaceId="workspace-1"
        />
      );

      expect(screen.getByText('Use existing branch')).toBeInTheDocument();
    });

    it('renders agent selector with all options', () => {
      render(
        <CreateWorktreeDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          workspaceId="workspace-1"
        />
      );

      expect(screen.getByText('Start with agent')).toBeInTheDocument();
      expect(screen.getByText('Claude')).toBeInTheDocument();
      expect(screen.getByText('Opencode')).toBeInTheDocument();
      expect(screen.getByText('Pi')).toBeInTheDocument();
      expect(screen.getByText('No agent')).toBeInTheDocument();
    });

    it('renders Cancel and Create buttons', () => {
      render(
        <CreateWorktreeDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          workspaceId="workspace-1"
        />
      );

      expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /create/i })).toBeInTheDocument();
    });
  });

  describe('Form Validation', () => {
    it('disables Create button when branch name is empty', () => {
      render(
        <CreateWorktreeDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          workspaceId="workspace-1"
        />
      );

      const createButton = screen.getByRole('button', { name: /create/i });
      expect(createButton).toBeDisabled();
    });

    it('disables Create button when no agent is selected', () => {
      render(
        <CreateWorktreeDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          workspaceId="workspace-1"
        />
      );

      const branchInput = screen.getByPlaceholderText('feature/my-branch');
      fireEvent.change(branchInput, { target: { value: 'feature/test' } });

      const createButton = screen.getByRole('button', { name: /create/i });
      expect(createButton).toBeDisabled();
    });

    it('enables Create button when branch name and agent are selected', () => {
      render(
        <CreateWorktreeDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          workspaceId="workspace-1"
        />
      );

      const branchInput = screen.getByPlaceholderText('feature/my-branch');
      fireEvent.change(branchInput, { target: { value: 'feature/test' } });

      const claudeOption = screen.getByText('Claude').closest('label');
      fireEvent.click(claudeOption!);

      const createButton = screen.getByRole('button', { name: /create/i });
      expect(createButton).not.toBeDisabled();
    });

    it('enables Create button when "No agent" is selected', () => {
      render(
        <CreateWorktreeDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          workspaceId="workspace-1"
        />
      );

      const branchInput = screen.getByPlaceholderText('feature/my-branch');
      fireEvent.change(branchInput, { target: { value: 'feature/test' } });

      const noAgentOption = screen.getByText('No agent').closest('label');
      fireEvent.click(noAgentOption!);

      const createButton = screen.getByRole('button', { name: /create/i });
      expect(createButton).not.toBeDisabled();
    });
  });

  describe('Interactions', () => {
    it('calls onOpenChange with false when Cancel is clicked', () => {
      render(
        <CreateWorktreeDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          workspaceId="workspace-1"
        />
      );

      const cancelButton = screen.getByRole('button', { name: /cancel/i });
      fireEvent.click(cancelButton);

      expect(mockOnOpenChange).toHaveBeenCalledWith(false);
    });

    it('allows editing branch name', () => {
      render(
        <CreateWorktreeDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          workspaceId="workspace-1"
        />
      );

      const branchInput = screen.getByPlaceholderText('feature/my-branch') as HTMLInputElement;
      fireEvent.change(branchInput, { target: { value: 'my-new-feature' } });

      expect(branchInput.value).toBe('my-new-feature');
    });

    it('toggles use existing branch checkbox', () => {
      render(
        <CreateWorktreeDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          workspaceId="workspace-1"
        />
      );

      const checkbox = screen.getByRole('checkbox');
      expect(checkbox).not.toBeChecked();

      fireEvent.click(checkbox);
      expect(checkbox).toBeChecked();

      fireEvent.click(checkbox);
      expect(checkbox).not.toBeChecked();
    });

    it('selects agent when clicked', () => {
      render(
        <CreateWorktreeDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          workspaceId="workspace-1"
        />
      );

      const claudeLabel = screen.getByText('Claude').closest('label')!;
      const claudeInput = claudeLabel.querySelector('input[type="radio"]') as HTMLInputElement;
      fireEvent.click(claudeLabel);
      fireEvent.change(claudeInput, { target: { checked: true, value: 'claude' } });

      const branchInput = screen.getByPlaceholderText('feature/my-branch');
      fireEvent.change(branchInput, { target: { value: 'feature/test' } });

      const createButton = screen.getByRole('button', { name: /create/i });
      expect(createButton).not.toBeDisabled();
    });
  });

  describe('Submit Flow', () => {
    it('sends WorktreeCreate message when form is submitted', async () => {
      render(
        <CreateWorktreeDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          workspaceId="workspace-1"
        />
      );

      const branchInput = screen.getByPlaceholderText('feature/my-branch');
      fireEvent.change(branchInput, { target: { value: 'feature/my-new-feature' } });

      const claudeLabel = screen.getByText('Claude').closest('label')!;
      const claudeInput = claudeLabel.querySelector('input[type="radio"]') as HTMLInputElement;
      fireEvent.click(claudeLabel);
      fireEvent.change(claudeInput, { target: { checked: true, value: 'claude' } });

      const createButton = screen.getByRole('button', { name: /create/i });
      fireEvent.click(createButton);

      await waitFor(() => {
        expect(mockSend).toHaveBeenCalledWith(expect.objectContaining({
          type: 'WorktreeCreate',
          workspaceId: 'workspace-1',
          branchName: 'feature/my-new-feature',
          agentType: 'claude',
        }));
      });
    });

    it('sends WorktreeCreate without agentType when "No agent" is selected', async () => {
      render(
        <CreateWorktreeDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          workspaceId="workspace-1"
        />
      );

      const branchInput = screen.getByPlaceholderText('feature/my-branch');
      fireEvent.change(branchInput, { target: { value: 'feature/test' } });

      const noAgentLabel = screen.getByText('No agent').closest('label')!;
      const noAgentInput = noAgentLabel.querySelector('input[type="radio"]') as HTMLInputElement;
      fireEvent.click(noAgentLabel);
      fireEvent.change(noAgentInput, { target: { checked: true, value: 'none' } });

      const createButton = screen.getByRole('button', { name: /create/i });
      fireEvent.click(createButton);

      await waitFor(() => {
        expect(mockSend).toHaveBeenCalledWith(expect.objectContaining({
          type: 'WorktreeCreate',
          workspaceId: 'workspace-1',
          branchName: 'feature/test',
          agentType: undefined,
        }));
      });
    });

    it('shows loading state when submitting', async () => {
      render(
        <CreateWorktreeDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          workspaceId="workspace-1"
        />
      );

      const branchInput = screen.getByPlaceholderText('feature/my-branch');
      fireEvent.change(branchInput, { target: { value: 'feature/test' } });

      const claudeLabel = screen.getByText('Claude').closest('label')!;
      const claudeInput = claudeLabel.querySelector('input[type="radio"]') as HTMLInputElement;
      fireEvent.click(claudeLabel);
      fireEvent.change(claudeInput, { target: { checked: true, value: 'claude' } });

      const createButton = screen.getByRole('button', { name: /create/i });
      fireEvent.click(createButton);

      await waitFor(() => {
        expect(screen.getByText('Creating...')).toBeInTheDocument();
      });
    });

    it('disables inputs when submitting', async () => {
      render(
        <CreateWorktreeDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          workspaceId="workspace-1"
        />
      );

      const branchInput = screen.getByPlaceholderText('feature/my-branch');
      fireEvent.change(branchInput, { target: { value: 'feature/test' } });

      const claudeLabel = screen.getByText('Claude').closest('label')!;
      const claudeInput = claudeLabel.querySelector('input[type="radio"]') as HTMLInputElement;
      fireEvent.click(claudeLabel);
      fireEvent.change(claudeInput, { target: { checked: true, value: 'claude' } });

      const createButton = screen.getByRole('button', { name: /create/i });
      fireEvent.click(createButton);

      await waitFor(() => {
        expect(branchInput).toBeDisabled();
      });
    });

    it('sets up WorktreeCreated handler on submit', async () => {
      render(
        <CreateWorktreeDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          workspaceId="workspace-1"
        />
      );

      const branchInput = screen.getByPlaceholderText('feature/my-branch');
      fireEvent.change(branchInput, { target: { value: 'feature/test' } });

      const claudeLabel = screen.getByText('Claude').closest('label')!;
      const claudeInput = claudeLabel.querySelector('input[type="radio"]') as HTMLInputElement;
      fireEvent.click(claudeLabel);
      fireEvent.change(claudeInput, { target: { checked: true, value: 'claude' } });

      const createButton = screen.getByRole('button', { name: /create/i });
      fireEvent.click(createButton);

      await waitFor(() => {
        expect(mockOnMessage).toHaveBeenCalledWith('WorktreeCreated', expect.any(Function));
      });
    });

    it('sets up Error handler on submit', async () => {
      render(
        <CreateWorktreeDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          workspaceId="workspace-1"
        />
      );

      const branchInput = screen.getByPlaceholderText('feature/my-branch');
      fireEvent.change(branchInput, { target: { value: 'feature/test' } });

      const claudeLabel = screen.getByText('Claude').closest('label')!;
      const claudeInput = claudeLabel.querySelector('input[type="radio"]') as HTMLInputElement;
      fireEvent.click(claudeLabel);
      fireEvent.change(claudeInput, { target: { checked: true, value: 'claude' } });

      const createButton = screen.getByRole('button', { name: /create/i });
      fireEvent.click(createButton);

      await waitFor(() => {
        expect(mockOnMessage).toHaveBeenCalledWith('Error', expect.any(Function));
      });
    });
  });

  describe('Success Handling', () => {
    it('shows success notification and closes dialog on WorktreeCreated', async () => {
      const messageHandlers = new Map<string, Function>();
      mockOnMessage.mockImplementation((type: string, handler: Function) => {
        messageHandlers.set(type, handler);
        return () => messageHandlers.delete(type);
      });

      render(
        <CreateWorktreeDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          workspaceId="workspace-1"
        />
      );

      const branchInput = screen.getByPlaceholderText('feature/my-branch');
      fireEvent.change(branchInput, { target: { value: 'feature/test' } });

      const claudeLabel = screen.getByText('Claude').closest('label')!;
      const claudeInput = claudeLabel.querySelector('input[type="radio"]') as HTMLInputElement;
      fireEvent.click(claudeLabel);
      fireEvent.change(claudeInput, { target: { checked: true, value: 'claude' } });

      const createButton = screen.getByRole('button', { name: /create/i });
      fireEvent.click(createButton);

      await waitFor(() => {
        expect(messageHandlers.has('WorktreeCreated')).toBe(true);
      });

      const createdHandler = messageHandlers.get('WorktreeCreated')!;
      createdHandler({
        worktree: {
          id: 'worktree-1',
          workspaceId: 'workspace-1',
          branchName: 'feature/test',
          path: '/path/to/worktree',
          status: 'active',
          createdAt: Date.now(),
        },
      });

      await waitFor(() => {
        expect(mockAddNotification).toHaveBeenCalledWith({
          level: 'info',
          message: 'Worktree created',
        });
        expect(mockOnOpenChange).toHaveBeenCalledWith(false);
        expect(mockSetActiveWorktree).toHaveBeenCalledWith('worktree-1');
      });
    });
  });

  describe('Error Handling', () => {
    it('shows error notification on Error message', async () => {
      const messageHandlers = new Map<string, Function>();
      mockOnMessage.mockImplementation((type: string, handler: Function) => {
        messageHandlers.set(type, handler);
        return () => messageHandlers.delete(type);
      });

      render(
        <CreateWorktreeDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          workspaceId="workspace-1"
        />
      );

      const branchInput = screen.getByPlaceholderText('feature/my-branch');
      fireEvent.change(branchInput, { target: { value: 'feature/test' } });

      const claudeLabel = screen.getByText('Claude').closest('label')!;
      const claudeInput = claudeLabel.querySelector('input[type="radio"]') as HTMLInputElement;
      fireEvent.click(claudeLabel);
      fireEvent.change(claudeInput, { target: { checked: true, value: 'claude' } });

      const createButton = screen.getByRole('button', { name: /create/i });
      fireEvent.click(createButton);

      await waitFor(() => {
        expect(messageHandlers.has('Error')).toBe(true);
      });

      const errorHandler = messageHandlers.get('Error')!;
      errorHandler({ requestId: 'test-request-id', message: 'Branch already has worktree' });

      await waitFor(() => {
        expect(mockAddNotification).toHaveBeenCalledWith({
          level: 'error',
          message: 'Branch already has worktree',
        });
      });
    });

    it('re-enables create button after error', async () => {
      const messageHandlers = new Map<string, Function>();
      mockOnMessage.mockImplementation((type: string, handler: Function) => {
        messageHandlers.set(type, handler);
        return () => messageHandlers.delete(type);
      });

      render(
        <CreateWorktreeDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          workspaceId="workspace-1"
        />
      );

      const branchInput = screen.getByPlaceholderText('feature/my-branch');
      fireEvent.change(branchInput, { target: { value: 'feature/test' } });

      const claudeLabel = screen.getByText('Claude').closest('label')!;
      const claudeInput = claudeLabel.querySelector('input[type="radio"]') as HTMLInputElement;
      fireEvent.click(claudeLabel);
      fireEvent.change(claudeInput, { target: { checked: true, value: 'claude' } });

      const createButton = screen.getByRole('button', { name: /create/i });
      fireEvent.click(createButton);

      await waitFor(() => {
        expect(createButton).toBeDisabled();
      });

      const errorHandler = messageHandlers.get('Error')!;
      errorHandler({ requestId: 'test-request-id', message: 'Error' });

      await waitFor(() => {
        expect(createButton).not.toBeDisabled();
      });
    });
  });

  describe('Reset on Open', () => {
    it('resets form when dialog opens', () => {
      const { rerender } = render(
        <CreateWorktreeDialog
          open={false}
          onOpenChange={mockOnOpenChange}
          workspaceId="workspace-1"
        />
      );

      rerender(
        <CreateWorktreeDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          workspaceId="workspace-1"
        />
      );

      const branchInput = screen.getByPlaceholderText('feature/my-branch') as HTMLInputElement;
      expect(branchInput.value).toBe('');
    });

    it('clears selected agent when dialog opens', () => {
      const { rerender } = render(
        <CreateWorktreeDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          workspaceId="workspace-1"
        />
      );

      const claudeLabel = screen.getByText('Claude').closest('label')!;
      const claudeInput = claudeLabel.querySelector('input[type="radio"]') as HTMLInputElement;
      fireEvent.click(claudeLabel);
      fireEvent.change(claudeInput, { target: { checked: true, value: 'claude' } });

      const branchInput = screen.getByPlaceholderText('feature/my-branch');
      fireEvent.change(branchInput, { target: { value: 'feature/test' } });
      let createButton = screen.getByRole('button', { name: /create/i });
      expect(createButton).not.toBeDisabled();

      rerender(
        <CreateWorktreeDialog
          open={false}
          onOpenChange={mockOnOpenChange}
          workspaceId="workspace-1"
        />
      );

      rerender(
        <CreateWorktreeDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          workspaceId="workspace-1"
        />
      );

      createButton = screen.getByRole('button', { name: /create/i });
      expect(createButton).toBeDisabled();
    });
  });
});