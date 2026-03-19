import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DiffTab } from '../DiffTab';
import { useWebSocketClient } from '../../../hooks/useWebSocket';
import { GitDiffResult } from '../../../types/generated/protocol';

vi.mock('../../../hooks/useWebSocket');

describe('DiffTab', () => {
  const mockSend = vi.fn();
  const mockOnMessage = vi.fn();
  const mockUnsubscribe = vi.fn();

  const mockWorktreeId = 'worktree-1';
  const mockFilePath = 'src/components/App.tsx';

  beforeEach(() => {
    vi.clearAllMocks();

    mockOnMessage.mockReturnValue(mockUnsubscribe);

    const mockClient = {
      send: mockSend,
      onMessage: mockOnMessage,
    };

    (useWebSocketClient as any).mockReturnValue(mockClient);
  });

  it('renders loading state initially', () => {
    render(<DiffTab filePath={mockFilePath} worktreeId={mockWorktreeId} />);

    expect(screen.getByText('Loading diff...')).toBeInTheDocument();
    expect(document.querySelector('.animate-spin')).toBeInTheDocument();
  });

  it('sends GitDiff message on mount', () => {
    render(<DiffTab filePath={mockFilePath} worktreeId={mockWorktreeId} />);

    expect(mockSend).toHaveBeenCalledWith({
      type: 'GitDiff',
      worktreeId: mockWorktreeId,
      filePath: mockFilePath,
    });
  });

  it('subscribes to GitDiffResult messages', () => {
    render(<DiffTab filePath={mockFilePath} worktreeId={mockWorktreeId} />);

    expect(mockOnMessage).toHaveBeenCalledWith('GitDiffResult', expect.any(Function));
  });

  it('unsubscribes from messages on unmount', () => {
    const { unmount } = render(<DiffTab filePath={mockFilePath} worktreeId={mockWorktreeId} />);

    unmount();

    expect(mockUnsubscribe).toHaveBeenCalled();
  });

  it('renders diff data when received', async () => {
    const mockResult: GitDiffResult = {
      type: 'GitDiffResult',
      worktreeId: mockWorktreeId,
      filePath: mockFilePath,
      entries: [
        {
          path: mockFilePath,
          status: 'modified',
          hunks: [
            {
              oldStart: 1,
              oldLines: 3,
              newStart: 1,
              newLines: 3,
              lines: [
                ' const a = 10',
                '-const b = 20',
                '+const b = 30',
                ' console.log(a + b)',
              ],
            },
          ],
        },
      ],
    };

    render(<DiffTab filePath={mockFilePath} worktreeId={mockWorktreeId} />);

    const messageHandler = mockOnMessage.mock.calls[0][1];
    messageHandler(mockResult);

    await waitFor(() => {
      expect(screen.getByText(mockFilePath)).toBeInTheDocument();
    });
  });

  it('displays change type indicator for modified files', async () => {
    const mockResult: GitDiffResult = {
      type: 'GitDiffResult',
      worktreeId: mockWorktreeId,
      filePath: mockFilePath,
      entries: [
        {
          path: mockFilePath,
          status: 'modified',
          hunks: [
            {
              oldStart: 1,
              oldLines: 1,
              newStart: 1,
              newLines: 1,
              lines: ['-old', '+new'],
            },
          ],
        },
      ],
    };

    render(<DiffTab filePath={mockFilePath} worktreeId={mockWorktreeId} />);

    const messageHandler = mockOnMessage.mock.calls[0][1];
    messageHandler(mockResult);

    await waitFor(() => {
      const badge = screen.getByTitle('Modified');
      expect(badge).toBeInTheDocument();
      expect(badge).toHaveTextContent('M');
    });
  });

  it('displays change type indicator for added files', async () => {
    const mockResult: GitDiffResult = {
      type: 'GitDiffResult',
      worktreeId: mockWorktreeId,
      filePath: mockFilePath,
      entries: [
        {
          path: mockFilePath,
          status: 'added',
          hunks: [
            {
              oldStart: 0,
              oldLines: 0,
              newStart: 1,
              newLines: 1,
              lines: ['+new content'],
            },
          ],
        },
      ],
    };

    render(<DiffTab filePath={mockFilePath} worktreeId={mockWorktreeId} />);

    const messageHandler = mockOnMessage.mock.calls[0][1];
    messageHandler(mockResult);

    await waitFor(() => {
      const badge = screen.getByText('A');
      expect(badge).toBeInTheDocument();
      expect(badge).toHaveAttribute('title', 'Added');
    });
  });

  it('displays change type indicator for deleted files', async () => {
    const mockResult: GitDiffResult = {
      type: 'GitDiffResult',
      worktreeId: mockWorktreeId,
      filePath: mockFilePath,
      entries: [
        {
          path: mockFilePath,
          status: 'deleted',
          hunks: [
            {
              oldStart: 1,
              oldLines: 1,
              newStart: 0,
              newLines: 0,
              lines: ['-deleted content'],
            },
          ],
        },
      ],
    };

    render(<DiffTab filePath={mockFilePath} worktreeId={mockWorktreeId} />);

    const messageHandler = mockOnMessage.mock.calls[0][1];
    messageHandler(mockResult);

    await waitFor(() => {
      const badge = screen.getByText('D');
      expect(badge).toBeInTheDocument();
      expect(badge).toHaveAttribute('title', 'Deleted');
    });
  });

  it('displays change type indicator for renamed files', async () => {
    const mockResult: GitDiffResult = {
      type: 'GitDiffResult',
      worktreeId: mockWorktreeId,
      filePath: mockFilePath,
      entries: [
        {
          path: mockFilePath,
          oldPath: 'src/components/OldName.tsx',
          status: 'renamed',
          hunks: [],
        },
      ],
    };

    render(<DiffTab filePath={mockFilePath} worktreeId={mockWorktreeId} />);

    const messageHandler = mockOnMessage.mock.calls[0][1];
    messageHandler(mockResult);

    await waitFor(() => {
      const badge = screen.getByText('R');
      expect(badge).toBeInTheDocument();
      expect(badge).toHaveAttribute('title', 'Renamed');
    });
  });

  it('toggles between split and inline view modes', async () => {
    const mockResult: GitDiffResult = {
      type: 'GitDiffResult',
      worktreeId: mockWorktreeId,
      filePath: mockFilePath,
      entries: [
        {
          path: mockFilePath,
          status: 'modified',
          hunks: [
            {
              oldStart: 1,
              oldLines: 1,
              newStart: 1,
              newLines: 1,
              lines: ['-old', '+new'],
            },
          ],
        },
      ],
    };

    render(<DiffTab filePath={mockFilePath} worktreeId={mockWorktreeId} />);

    const messageHandler = mockOnMessage.mock.calls[0][1];
    messageHandler(mockResult);

    await waitFor(() => {
      expect(screen.getByText('Split')).toBeInTheDocument();
    });

    const splitButton = screen.getByRole('button', { name: /split/i });
    const inlineButton = screen.getByRole('button', { name: /inline/i });

    expect(splitButton).toHaveAttribute('aria-pressed', 'true');
    expect(inlineButton).toHaveAttribute('aria-pressed', 'false');

    fireEvent.click(inlineButton);

    expect(splitButton).toHaveAttribute('aria-pressed', 'false');
    expect(inlineButton).toHaveAttribute('aria-pressed', 'true');
  });

  it('shows error when no diff data is received', async () => {
    const mockResult: GitDiffResult = {
      type: 'GitDiffResult',
      worktreeId: mockWorktreeId,
      filePath: mockFilePath,
      entries: [],
    };

    render(<DiffTab filePath={mockFilePath} worktreeId={mockWorktreeId} />);

    const messageHandler = mockOnMessage.mock.calls[0][1];
    messageHandler(mockResult);

    await waitFor(() => {
      expect(screen.getByText('Failed to load diff')).toBeInTheDocument();
      expect(screen.getByText('No diff data available for this file')).toBeInTheDocument();
    });
  });

  it('ignores messages from other worktrees', async () => {
    const mockResult: GitDiffResult = {
      type: 'GitDiffResult',
      worktreeId: 'other-worktree',
      filePath: mockFilePath,
      entries: [
        {
          path: mockFilePath,
          status: 'modified',
          hunks: [],
        },
      ],
    };

    render(<DiffTab filePath={mockFilePath} worktreeId={mockWorktreeId} />);

    const messageHandler = mockOnMessage.mock.calls[0][1];
    messageHandler(mockResult);

    await waitFor(() => {
      expect(screen.getByText('Loading diff...')).toBeInTheDocument();
    });
  });

  it('ignores messages for other files', async () => {
    const mockResult: GitDiffResult = {
      type: 'GitDiffResult',
      worktreeId: mockWorktreeId,
      filePath: 'other-file.ts',
      entries: [
        {
          path: 'other-file.ts',
          status: 'modified',
          hunks: [],
        },
      ],
    };

    render(<DiffTab filePath={mockFilePath} worktreeId={mockWorktreeId} />);

    const messageHandler = mockOnMessage.mock.calls[0][1];
    messageHandler(mockResult);

    await waitFor(() => {
      expect(screen.getByText('Loading diff...')).toBeInTheDocument();
    });
  });

  it('displays renamed file information', async () => {
    const mockResult: GitDiffResult = {
      type: 'GitDiffResult',
      worktreeId: mockWorktreeId,
      filePath: mockFilePath,
      entries: [
        {
          path: mockFilePath,
          oldPath: 'src/components/OldName.tsx',
          status: 'renamed',
          hunks: [],
        },
      ],
    };

    render(<DiffTab filePath={mockFilePath} worktreeId={mockWorktreeId} />);

    const messageHandler = mockOnMessage.mock.calls[0][1];
    messageHandler(mockResult);

    await waitFor(() => {
      expect(screen.getByText('Renamed from: src/components/OldName.tsx')).toBeInTheDocument();
    });
  });

  it('displays language information in footer', async () => {
    const mockResult: GitDiffResult = {
      type: 'GitDiffResult',
      worktreeId: mockWorktreeId,
      filePath: 'src/components/App.tsx',
      entries: [
        {
          path: 'src/components/App.tsx',
          status: 'modified',
          hunks: [
            {
              oldStart: 1,
              oldLines: 1,
              newStart: 1,
              newLines: 1,
              lines: ['-old', '+new'],
            },
          ],
        },
      ],
    };

    render(<DiffTab filePath="src/components/App.tsx" worktreeId={mockWorktreeId} />);

    const messageHandler = mockOnMessage.mock.calls[0][1];
    messageHandler(mockResult);

    await waitFor(() => {
      expect(screen.getByText('tsx')).toBeInTheDocument();
    });
  });
});
