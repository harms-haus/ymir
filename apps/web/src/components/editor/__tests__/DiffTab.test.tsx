import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DiffTab } from '../DiffTab';
import { useWebSocketClient } from '../../../hooks/useWebSocket';

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
    const mockDiff = `--- a/${mockFilePath}
+++ b/${mockFilePath}
@@ -1,3 +1,3 @@
 const a = 10
-const b = 20
+const b = 30
 console.log(a + b)`;

    render(<DiffTab filePath={mockFilePath} worktreeId={mockWorktreeId} />);

    await act(async () => {
      const messageHandler = mockOnMessage.mock.calls[0][1];
      messageHandler({
        type: 'GitDiffResult',
        worktreeId: mockWorktreeId,
        filePath: mockFilePath,
        diff: mockDiff,
      });
    });

    await waitFor(() => {
      expect(screen.getByText(mockFilePath)).toBeInTheDocument();
    });
  });

  it('displays change type indicator for modified files', async () => {
    const mockDiff = `--- a/${mockFilePath}
+++ b/${mockFilePath}
@@ -1 +1 @@
-old
+new`;

    render(<DiffTab filePath={mockFilePath} worktreeId={mockWorktreeId} />);

    await act(async () => {
      const messageHandler = mockOnMessage.mock.calls[0][1];
      messageHandler({
        type: 'GitDiffResult',
        worktreeId: mockWorktreeId,
        filePath: mockFilePath,
        diff: mockDiff,
      });
    });

    await waitFor(() => {
      const badge = screen.getByTitle('Modified');
      expect(badge).toBeInTheDocument();
      expect(badge).toHaveTextContent('M');
    });
  });

  it('displays change type indicator for added files', async () => {
    const mockDiff = `--- /dev/null
+++ b/${mockFilePath}
@@ -0,0 +1 @@
+new content`;

    render(<DiffTab filePath={mockFilePath} worktreeId={mockWorktreeId} />);

    await act(async () => {
      const messageHandler = mockOnMessage.mock.calls[0][1];
      messageHandler({
        type: 'GitDiffResult',
        worktreeId: mockWorktreeId,
        filePath: mockFilePath,
        diff: mockDiff,
      });
    });

    await waitFor(() => {
      const badge = screen.getByText('A');
      expect(badge).toBeInTheDocument();
      expect(badge).toHaveAttribute('title', 'Added');
    });
  });

  it('displays change type indicator for deleted files', async () => {
    const mockDiff = `--- a/${mockFilePath}
+++ /dev/null
@@ -1 +0,0 @@
-deleted content`;

    render(<DiffTab filePath={mockFilePath} worktreeId={mockWorktreeId} />);

    await act(async () => {
      const messageHandler = mockOnMessage.mock.calls[0][1];
      messageHandler({
        type: 'GitDiffResult',
        worktreeId: mockWorktreeId,
        filePath: mockFilePath,
        diff: mockDiff,
      });
    });

    await waitFor(() => {
      const badge = screen.getByText('D');
      expect(badge).toBeInTheDocument();
      expect(badge).toHaveAttribute('title', 'Deleted');
    });
  });

  it('displays old path when file was renamed', async () => {
    const mockDiff = `--- a/src/components/OldName.tsx
+++ b/${mockFilePath}
@@ -1 +1 @@
-old
+new`;

    render(<DiffTab filePath={mockFilePath} worktreeId={mockWorktreeId} />);

    await act(async () => {
      const messageHandler = mockOnMessage.mock.calls[0][1];
      messageHandler({
        type: 'GitDiffResult',
        worktreeId: mockWorktreeId,
        filePath: mockFilePath,
        diff: mockDiff,
      });
    });

    await waitFor(() => {
      expect(screen.getByText('Renamed from: a/src/components/OldName.tsx')).toBeInTheDocument();
    });
  });

  it('toggles between split and inline view modes', async () => {
    const mockDiff = `--- a/${mockFilePath}
+++ b/${mockFilePath}
@@ -1 +1 @@
-old
+new`;

    render(<DiffTab filePath={mockFilePath} worktreeId={mockWorktreeId} />);

    await act(async () => {
      const messageHandler = mockOnMessage.mock.calls[0][1];
      messageHandler({
        type: 'GitDiffResult',
        worktreeId: mockWorktreeId,
        filePath: mockFilePath,
        diff: mockDiff,
      });
    });

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
    render(<DiffTab filePath={mockFilePath} worktreeId={mockWorktreeId} />);

    await act(async () => {
      const messageHandler = mockOnMessage.mock.calls[0][1];
      messageHandler({
        type: 'GitDiffResult',
        worktreeId: mockWorktreeId,
        filePath: mockFilePath,
        diff: '',
      });
    });

    await waitFor(() => {
      expect(screen.getByText('Failed to load diff')).toBeInTheDocument();
      expect(screen.getByText('No diff data available for this file')).toBeInTheDocument();
    });
  });

  it('ignores messages from other worktrees', async () => {
    render(<DiffTab filePath={mockFilePath} worktreeId={mockWorktreeId} />);

    await act(async () => {
      const messageHandler = mockOnMessage.mock.calls[0][1];
      messageHandler({
        type: 'GitDiffResult',
        worktreeId: 'other-worktree',
        filePath: mockFilePath,
        diff: 'some diff',
      });
    });

    await waitFor(() => {
      expect(screen.getByText('Loading diff...')).toBeInTheDocument();
    });
  });

  it('ignores messages for other files', async () => {
    render(<DiffTab filePath={mockFilePath} worktreeId={mockWorktreeId} />);

    await act(async () => {
      const messageHandler = mockOnMessage.mock.calls[0][1];
      messageHandler({
        type: 'GitDiffResult',
        worktreeId: mockWorktreeId,
        filePath: 'other-file.ts',
        diff: 'some diff',
      });
    });

    await waitFor(() => {
      expect(screen.getByText('Loading diff...')).toBeInTheDocument();
    });
  });

  it('displays language information in footer', async () => {
    const mockDiff = `--- a/src/components/App.tsx
+++ b/src/components/App.tsx
@@ -1 +1 @@
-old
+new`;

    render(<DiffTab filePath="src/components/App.tsx" worktreeId={mockWorktreeId} />);

    await act(async () => {
      const messageHandler = mockOnMessage.mock.calls[0][1];
      messageHandler({
        type: 'GitDiffResult',
        worktreeId: mockWorktreeId,
        filePath: 'src/components/App.tsx',
        diff: mockDiff,
      });
    });

    await waitFor(() => {
      expect(screen.getByText('tsx')).toBeInTheDocument();
    });
  });
});
