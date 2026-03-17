import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MergeDialog } from '../MergeDialog';

// Mock WebSocket client
const mockSend = vi.fn();
const messageHandlers = new Map<string, Function>();

vi.mock('../../../lib/ws', () => ({
  getWebSocketClient: vi.fn(() => ({
    send: mockSend,
    onMessage: vi.fn((type: string, handler: Function) => {
      messageHandlers.set(type, handler);
      return () => messageHandlers.delete(type);
    }),
  })),
}));

// Mock WebSocket onMessage
const mockOnMessage = vi.fn();
const mockUnsubscribe = vi.fn();

// Mock store
const mockAddNotification = vi.fn();
const mockOnOpenChange = vi.fn();

vi.mock('../../../store', () => ({
  useStore: vi.fn((selector) => {
    if (typeof selector === 'function') {
      return selector({
        addNotification: mockAddNotification,
      });
    }
    return {
      addNotification: mockAddNotification,
    };
  }),
  }));

// Default props for tests
const defaultProps = {
  worktreeId: 'worktree-123',
  branchName: 'feature-branch',
  targetBranch: 'main',
  mainBranch: 'main',
  mergeType: 'merge' as const,
  open: true,
  onOpenChange: mockOnOpenChange,
};

  beforeEach(() => {
    vi.clearAllMocks();
    mockOnMessage.mockReturnValue(mockUnsubscribe);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Rendering', () => {
    it('should render merge dialog with correct title for regular merge', () => {
      render(<MergeDialog {...defaultProps} mergeType="merge" />);
      
      expect(screen.getByText('Merge worktree')).toBeInTheDocument();
      expect(screen.getByText("Merge branch 'feature-branch' into 'main'?")).toBeInTheDocument();
    });

    it('should render merge dialog with correct title for squash merge', () => {
      render(<MergeDialog {...defaultProps} mergeType="squash" />);
      
      expect(screen.getByText('Squash & Merge worktree')).toBeInTheDocument();
      expect(screen.getByText("Squash and merge branch 'feature-branch' into 'main'?")).toBeInTheDocument();
    });

    it('should render delete checkbox unchecked by default', () => {
      render(<MergeDialog {...defaultProps} />);
      
      const checkbox = screen.getByRole('checkbox', { name: /delete worktree after merge/i });
      expect(checkbox).not.toBeChecked();
    });

    it('should not show warning when delete checkbox is unchecked', () => {
      render(<MergeDialog {...defaultProps} />);
      
      expect(screen.queryByText(/this will permanently delete the worktree directory/i)).not.toBeInTheDocument();
    });

    it('should show warning when delete checkbox is checked', () => {
      render(<MergeDialog {...defaultProps} />);
      
      const checkbox = screen.getByRole('checkbox', { name: /delete worktree after merge/i });
      fireEvent.click(checkbox);
      
      expect(screen.getByText(/this will permanently delete the worktree directory/i)).toBeInTheDocument();
    });

    it('should render Cancel and Merge buttons', () => {
      render(<MergeDialog {...defaultProps} />);
      
      expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /merge/i })).toBeInTheDocument();
    });

    it('should render Squash & Merge button for squash merge type', () => {
      render(<MergeDialog {...defaultProps} mergeType="squash" />);
      
      expect(screen.getByRole('button', { name: /squash & merge/i })).toBeInTheDocument();
    });
  });

  describe('Interactions', () => {
    it('should call onOpenChange with false when Cancel is clicked', () => {
      render(<MergeDialog {...defaultProps} />);
      
      const cancelButton = screen.getByRole('button', { name: /cancel/i });
      fireEvent.click(cancelButton);
      
      expect(mockOnOpenChange).toHaveBeenCalledWith(false);
    });

    it('should toggle delete checkbox when clicked', () => {
      render(<MergeDialog {...defaultProps} />);
      
      const checkbox = screen.getByRole('checkbox', { name: /delete worktree after merge/i });
      expect(checkbox).not.toBeChecked();
      
      fireEvent.click(checkbox);
      expect(checkbox).toBeChecked();
      
      fireEvent.click(checkbox);
      expect(checkbox).not.toBeChecked();
    });
  });

  describe('Merge Operations', () => {
    it('should send WorktreeMerge message when Merge is clicked', () => {
      render(<MergeDialog {...defaultProps} />);
      
      const mergeButton = screen.getByRole('button', { name: /merge/i });
      fireEvent.click(mergeButton);
      
      expect(mockSend).toHaveBeenCalledWith({
        type: 'WorktreeMerge',
        id: 'worktree-123',
        squash: false,
        deleteAfter: false,
      });
    });

    it('should send WorktreeMerge message with squash=true for squash merge', () => {
      render(<MergeDialog {...defaultProps} mergeType="squash" />);
      
      const mergeButton = screen.getByRole('button', { name: /squash & merge/i });
      fireEvent.click(mergeButton);
      
      expect(mockSend).toHaveBeenCalledWith({
        type: 'WorktreeMerge',
        id: 'worktree-123',
        squash: true,
        deleteAfter: false,
      });
    });

    it('should send WorktreeMerge message with deleteAfter=true when checkbox is checked', () => {
      render(<MergeDialog {...defaultProps} />);
      
      const checkbox = screen.getByRole('checkbox', { name: /delete worktree after merge/i });
      fireEvent.click(checkbox);
      
      const mergeButton = screen.getByRole('button', { name: /merge/i });
      fireEvent.click(mergeButton);
      
      expect(mockSend).toHaveBeenCalledWith({
        type: 'WorktreeMerge',
        id: 'worktree-123',
        squash: false,
        deleteAfter: true,
      });
    });

    it('should set up error handler when merge is initiated', () => {
      render(<MergeDialog {...defaultProps} />);
      
      const mergeButton = screen.getByRole('button', { name: /merge/i });
      fireEvent.click(mergeButton);
      
      expect(mockOnMessage).toHaveBeenCalledWith('Error', expect.any(Function));
    });

    it('should set up notification handler when merge is initiated', () => {
      render(<MergeDialog {...defaultProps} />);
      
      const mergeButton = screen.getByRole('button', { name: /merge/i });
      fireEvent.click(mergeButton);
      
      expect(mockOnMessage).toHaveBeenCalledWith('Notification', expect.any(Function));
    });

    it('should disable merge button while submitting', () => {
      render(<MergeDialog {...defaultProps} />);
      
      const mergeButton = screen.getByRole('button', { name: /merge/i });
      fireEvent.click(mergeButton);
      
      expect(mergeButton).toBeDisabled();
      expect(screen.getByText(/merging/i)).toBeInTheDocument();
    });
  });

  describe('Success Handling', () => {
    it('should show success notification and close dialog on successful merge', async () => {
      render(<MergeDialog {...defaultProps} />);
      
      const mergeButton = screen.getByRole('button', { name: /merge/i });
      fireEvent.click(mergeButton);
      
      // Get the notification handler
      const notificationHandler = messageHandlers.get("Notification")!;
      
      // Simulate success notification
      notificationHandler({ worktreeId: 'worktree-123', message: 'Branch merged successfully' });
      
      await waitFor(() => {
        expect(mockAddNotification).toHaveBeenCalledWith({
          level: 'info',
          message: 'Branch merged successfully',
        });
        expect(mockOnOpenChange).toHaveBeenCalledWith(false);
      });
    });

    it('should show worktree deleted notification when deleteAfter is true', async () => {
      render(<MergeDialog {...defaultProps} />);
      
      // Check the delete checkbox
      const checkbox = screen.getByRole('checkbox', { name: /delete worktree after merge/i });
      fireEvent.click(checkbox);
      
      const mergeButton = screen.getByRole('button', { name: /merge/i });
      fireEvent.click(mergeButton);
      
      // Get the notification handler
      const notificationHandler = messageHandlers.get("Notification")!;
      
      // Simulate success notification
      notificationHandler({ worktreeId: 'worktree-123', message: 'Branch merged successfully' });
      
      await waitFor(() => {
        expect(mockAddNotification).toHaveBeenCalledWith({
          level: 'info',
          message: 'Branch merged successfully',
        });
        expect(mockAddNotification).toHaveBeenCalledWith({
          level: 'info',
          message: 'Worktree deleted',
        });
      });
    });
  });

  describe('Error Handling', () => {
    it('should handle timeout after 30 seconds', async () => {
      vi.useFakeTimers();
      
      render(<MergeDialog {...defaultProps} />);
      
      const mergeButton = screen.getByRole('button', { name: /merge/i });
      fireEvent.click(mergeButton);
      
      expect(mergeButton).toBeDisabled();
      
      // Advance time by 30 seconds
      vi.advanceTimersByTime(30000);
      
      // Wait for the timeout to trigger
      await waitFor(() => {
        expect(mockAddNotification).toHaveBeenCalledWith({
          level: 'error',
          message: 'Merge operation timed out',
        });
      }, { timeout: 1000 });
      
      expect(mergeButton).not.toBeDisabled();
      
      vi.useRealTimers();
    });

    it('should re-enable merge button after error', async () => {
      render(<MergeDialog {...defaultProps} />);
      
      const mergeButton = screen.getByRole('button', { name: /merge/i });
      fireEvent.click(mergeButton);
      
      expect(mergeButton).toBeDisabled();
      
      // Get the error handler
      const errorHandler = messageHandlers.get("Error")!;
      
      // Simulate error
      errorHandler({ worktreeId: 'worktree-123', message: 'Merge conflict detected' });
      
      await waitFor(() => {
        expect(mergeButton).not.toBeDisabled();
      });
    });

    it('should re-enable merge button after error', async () => {
      render(<MergeDialog {...defaultProps} />);
      
      const mergeButton = screen.getByRole('button', { name: /merge/i });
      fireEvent.click(mergeButton);
      
      expect(mergeButton).toBeDisabled();
      
      // Get the error handler
      const errorHandler = messageHandlers.get("Error")!;
      
      // Simulate error
      errorHandler({ worktreeId: 'worktree-123', message: 'Merge conflict detected' });
      
      // Wait for error handling to complete
      await waitFor(() => {
        expect(mockAddNotification).toHaveBeenCalledWith({
          level: 'error',
          message: 'Merge conflict detected',
        });
      }, { timeout: 1000 });
      
      // Verify unsubscribe was called
      expect(mockUnsubscribe).toHaveBeenCalled();
    });
  });

  describe('Edge Cases', () => {
  it('should not allow multiple concurrent merge operations', () => {
    render(<MergeDialog {...defaultProps} />);

    const mergeButton = screen.getByRole('button', { name: /merge/i });

    // Click merge button twice
    fireEvent.click(mergeButton);
    fireEvent.click(mergeButton);

    // Should only send one message
    expect(mockSend).toHaveBeenCalledTimes(1);
  });

  it('should handle missing worktreeId gracefully', () => {
    render(<MergeDialog {...defaultProps} worktreeId="" />);

    const mergeButton = screen.getByRole('button', { name: /merge/i });
    fireEvent.click(mergeButton);

    expect(mockSend).toHaveBeenCalledWith({
      type: 'WorktreeMerge',
      id: '',
      squash: false,
      deleteAfter: false,
    });
  });
});
