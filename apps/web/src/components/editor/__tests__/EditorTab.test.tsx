import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import { EditorTab } from '../EditorTab';

let messageHandlers: Map<string, Set<(msg: unknown) => void>> = new Map();
let monacoOnChangeCallback: ((value: string | undefined) => void) | undefined;

const mockEditorInstance = {
  restoreViewState: vi.fn(),
  saveViewState: vi.fn(() => ({})),
  focus: vi.fn(),
};

const mockMonacoInstance = {
  editor: {
    defineTheme: vi.fn(),
    setTheme: vi.fn(),
  },
};

vi.mock('@monaco-editor/react', () => ({
  default: vi.fn(({ value, onChange, onMount }) => {
    monacoOnChangeCallback = onChange;

    if (onMount) {
      onMount(mockEditorInstance, mockMonacoInstance);
    }

    return (
      <textarea
        data-testid="monaco-editor"
        defaultValue={value || ''}
        onChange={(e) => {
          onChange?.(e.target.value);
        }}
      />
    );
  }),
  loader: {
    config: vi.fn(),
  },
}));

const mockSend = vi.fn();
const mockOnMessage = vi.fn((type: string, handler: (msg: unknown) => void) => {
  if (!messageHandlers.has(type)) {
    messageHandlers.set(type, new Set());
  }
  messageHandlers.get(type)!.add(handler);
  return () => {
    messageHandlers.get(type)?.delete(handler);
  };
});

vi.mock('../../../lib/ws', () => ({
  getWebSocketClient: vi.fn(() => ({
    send: mockSend,
    onMessage: mockOnMessage,
  })),
}));

const mockToastError = vi.fn();

vi.mock('../../../hooks/useToast', () => ({
  useToast: vi.fn(() => ({
    error: mockToastError,
    success: vi.fn(),
    info: vi.fn(),
  })),
}));

describe('EditorTab', () => {
  const defaultProps = {
    filePath: 'src/components/App.tsx',
    worktreeId: 'worktree-123',
    sessionId: 'session-456',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    messageHandlers = new Map();
    monacoOnChangeCallback = undefined;
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders loading state initially', () => {
    render(<EditorTab {...defaultProps} />);
    expect(screen.getByTestId('editor-loading')).toBeInTheDocument();
  });

  it('sends FileRead message on mount', () => {
    render(<EditorTab {...defaultProps} />);

    expect(mockSend).toHaveBeenCalledWith({
      type: 'FileRead',
      worktreeId: defaultProps.worktreeId,
      path: defaultProps.filePath,
    });
  });

  it('displays file content when received', async () => {
    render(<EditorTab {...defaultProps} />);

    await act(async () => {
      const handlers = messageHandlers.get('FileContent');
      handlers?.forEach((handler) => {
        handler({
          type: 'FileContent',
          worktreeId: defaultProps.worktreeId,
          file: {
            path: defaultProps.filePath,
            content: 'const App = () => <div>Hello</div>;',
            encoding: 'utf8',
            size: 100,
            modifiedAt: Date.now(),
          },
        });
      });
    });

    await waitFor(() => {
      expect(screen.getByTestId('editor-container')).toBeInTheDocument();
    });

    expect(screen.getByTestId('monaco-editor')).toHaveValue(
      'const App = () => <div>Hello</div>;'
    );
  });

  it('shows read-only mode for files larger than 5MB', async () => {
    render(<EditorTab {...defaultProps} />);

    await act(async () => {
      const handlers = messageHandlers.get('FileContent');
      handlers?.forEach((handler) => {
        handler({
          type: 'FileContent',
          worktreeId: defaultProps.worktreeId,
          file: {
            path: defaultProps.filePath,
            content: 'x'.repeat(6 * 1024 * 1024),
            encoding: 'utf8',
            size: 6 * 1024 * 1024,
            modifiedAt: Date.now(),
          },
        });
      });
    });

    await waitFor(() => {
      expect(screen.getByText('Read-only')).toBeInTheDocument();
    });

    expect(mockToastError).toHaveBeenCalledWith(
      'File too large',
      expect.stringContaining('5MB'),
      5000
    );
  });

  it('debounces file writes after 1 second', async () => {
    render(<EditorTab {...defaultProps} />);

    await act(async () => {
      const handlers = messageHandlers.get('FileContent');
      handlers?.forEach((handler) => {
        handler({
          type: 'FileContent',
          worktreeId: defaultProps.worktreeId,
          file: {
            path: defaultProps.filePath,
            content: 'initial content',
            encoding: 'utf8',
            size: 100,
            modifiedAt: Date.now(),
          },
        });
      });
    });

    await waitFor(() => {
      expect(screen.getByTestId('monaco-editor')).toBeInTheDocument();
    });

    await act(async () => {
      monacoOnChangeCallback?.('new content');
    });

    expect(mockSend).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: 'FileWrite' })
    );

    await act(async () => {
      vi.advanceTimersByTime(1000);
    });

    await waitFor(() => {
      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'FileWrite',
          worktreeId: defaultProps.worktreeId,
          path: defaultProps.filePath,
          content: 'new content',
          encoding: 'utf8',
        })
      );
    });
  });

  it('shows unsaved changes indicator', async () => {
    render(<EditorTab {...defaultProps} />);

    await act(async () => {
      const handlers = messageHandlers.get('FileContent');
      handlers?.forEach((handler) => {
        handler({
          type: 'FileContent',
          worktreeId: defaultProps.worktreeId,
          file: {
            path: defaultProps.filePath,
            content: 'initial',
            encoding: 'utf8',
            size: 100,
            modifiedAt: Date.now(),
          },
        });
      });
    });

    await waitFor(() => {
      expect(screen.getByTestId('monaco-editor')).toBeInTheDocument();
    });

    await act(async () => {
      monacoOnChangeCallback?.('initial modified');
    });

    expect(screen.getByTitle('Unsaved changes')).toBeInTheDocument();
  });

  it('displays filename and path in header', async () => {
    render(<EditorTab {...defaultProps} />);

    await act(async () => {
      const handlers = messageHandlers.get('FileContent');
      handlers?.forEach((handler) => {
        handler({
          type: 'FileContent',
          worktreeId: defaultProps.worktreeId,
          file: {
            path: defaultProps.filePath,
            content: 'content',
            encoding: 'utf8',
            size: 100,
            modifiedAt: Date.now(),
          },
        });
      });
    });

    await waitFor(() => {
      expect(screen.getByText('App.tsx')).toBeInTheDocument();
    });

    expect(screen.getByText(defaultProps.filePath)).toBeInTheDocument();
  });

  it('cleans up timeout on unmount', () => {
    const { unmount } = render(<EditorTab {...defaultProps} />);

    act(() => {
      const handlers = messageHandlers.get('FileContent');
      handlers?.forEach((handler) => {
        handler({
          type: 'FileContent',
          worktreeId: defaultProps.worktreeId,
          file: {
            path: defaultProps.filePath,
            content: 'content',
            encoding: 'utf8',
            size: 100,
            modifiedAt: Date.now(),
          },
        });
      });
    });

    unmount();

    expect(() => vi.advanceTimersByTime(1000)).not.toThrow();
  });

  it('ignores FileContent for different worktree', async () => {
    render(<EditorTab {...defaultProps} />);

    await act(async () => {
      const handlers = messageHandlers.get('FileContent');
      handlers?.forEach((handler) => {
        handler({
          type: 'FileContent',
          worktreeId: 'different-worktree',
          file: {
            path: defaultProps.filePath,
            content: 'content',
            encoding: 'utf8',
            size: 100,
            modifiedAt: Date.now(),
          },
        });
      });
    });

    expect(screen.getByTestId('editor-loading')).toBeInTheDocument();
  });

  it('ignores FileContent for different file path', async () => {
    render(<EditorTab {...defaultProps} />);

    await act(async () => {
      const handlers = messageHandlers.get('FileContent');
      handlers?.forEach((handler) => {
        handler({
          type: 'FileContent',
          worktreeId: defaultProps.worktreeId,
          file: {
            path: 'different/path.tsx',
            content: 'content',
            encoding: 'utf8',
            size: 100,
            modifiedAt: Date.now(),
          },
        });
      });
    });

    expect(screen.getByTestId('editor-loading')).toBeInTheDocument();
  });
});
