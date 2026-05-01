import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TerminalPane } from '../TerminalPane';
import { useStore } from '../../../store';
import { useWebSocketClient } from '../../../hooks/useWebSocket';

vi.mock('../../../store', () => ({
  useStore: vi.fn(),
  selectTerminalSessionsByWorktreeId: vi.fn((worktreeId: string) => (state: any) => state.terminalSessionsByWorktree?.[worktreeId] || []),
  selectIsWorkspacesLoading: vi.fn((state: any) => state.isWorkspacesLoading ?? false),
}));
vi.mock('../../../hooks/useWebSocket');
vi.mock('../TerminalView', () => ({
  Terminal: ({ terminalSessionId }: { terminalSessionId: string }) => <div data-testid={`terminal-${terminalSessionId}`}>Terminal {terminalSessionId}</div>,
}));

describe('TerminalPane', () => {
  const mockSend = vi.fn();
  const mockOnMessage = vi.fn();
  
  beforeEach(() => {
    vi.clearAllMocks();
    
    const mockClient = {
      send: mockSend,
      onMessage: mockOnMessage,
    };
    
    (useWebSocketClient as any).mockReturnValue(mockClient);
  });

  const mockEmptyStore = { terminalSessionsByWorktree: {}, isWorkspacesLoading: false };
  const mockStoreWithTerminals = (terminals: any[]) => ({
    terminalSessionsByWorktree: { 'test-worktree': terminals },
    isWorkspacesLoading: false,
  });

  it('auto-creates first terminal when no terminals exist', async () => {
    (useStore as any).mockImplementation((selectorOrValue: any) => {
      if (typeof selectorOrValue === 'function') {
        return selectorOrValue(mockEmptyStore);
      }
      return selectorOrValue;
    });
    
    render(<TerminalPane worktreeId="test-worktree" />);
    
    await waitFor(() => {
      expect(mockSend).toHaveBeenCalledWith({
        type: 'TerminalCreate',
        worktreeId: 'test-worktree',
        label: 'Terminal 1',
      });
    });
  });

  it('renders existing terminal tabs', () => {
    const store = mockStoreWithTerminals([
      { id: 'session-1', label: 'Terminal 1', worktreeId: 'test-worktree' },
    ]);
    (useStore as any).mockImplementation((selectorOrValue: any) => {
      if (typeof selectorOrValue === 'function') {
        return selectorOrValue(store);
      }
      return selectorOrValue;
    });
    
    render(<TerminalPane worktreeId="test-worktree" />);
    
    expect(screen.getByText('Terminal 1')).toBeInTheDocument();
    expect(screen.getByTestId('terminal-session-1')).toBeInTheDocument();
  });

  it('creates new tab when + button is clicked', async () => {
    const store = mockStoreWithTerminals([
      { id: 'session-1', label: 'Terminal 1', worktreeId: 'test-worktree' },
    ]);
    (useStore as any).mockImplementation((selectorOrValue: any) => {
      if (typeof selectorOrValue === 'function') {
        return selectorOrValue(store);
      }
      return selectorOrValue;
    });
    
    render(<TerminalPane worktreeId="test-worktree" />);
    
    const addButton = screen.getByLabelText('Create new terminal');
    fireEvent.click(addButton);
    
    await waitFor(() => {
      // The nextTabIndexRef is module-level and may have been incremented by previous tests
      expect(mockSend).toHaveBeenCalledWith(expect.objectContaining({
        type: 'TerminalCreate',
        worktreeId: 'test-worktree',
      }));
    });
  });

  it('closes tab when × button is clicked', async () => {
    const store = mockStoreWithTerminals([
      { id: 'session-1', label: 'Terminal 1', worktreeId: 'test-worktree' },
      { id: 'session-2', label: 'Terminal 2', worktreeId: 'test-worktree' },
    ]);
    (useStore as any).mockImplementation((selectorOrValue: any) => {
      if (typeof selectorOrValue === 'function') {
        return selectorOrValue(store);
      }
      return selectorOrValue;
    });
    
    render(<TerminalPane worktreeId="test-worktree" />);
    
    const closeButtons = screen.getAllByLabelText('Close tab');
    fireEvent.click(closeButtons[0]);
    
    await waitFor(() => {
      expect(mockSend).toHaveBeenCalledWith({
        type: 'TerminalKill',
        sessionId: 'session-1',
      });
    });
  });

  it('closes tab on middle-click', async () => {
    const store = mockStoreWithTerminals([
      { id: 'session-1', label: 'Terminal 1', worktreeId: 'test-worktree' },
      { id: 'session-2', label: 'Terminal 2', worktreeId: 'test-worktree' },
    ]);
    (useStore as any).mockImplementation((selectorOrValue: any) => {
      if (typeof selectorOrValue === 'function') {
        return selectorOrValue(store);
      }
      return selectorOrValue;
    });
    
    render(<TerminalPane worktreeId="test-worktree" />);
    
    const tabs = screen.getAllByRole('tab');
    fireEvent.mouseDown(tabs[0], { button: 1 });
    
    await waitFor(() => {
      expect(mockSend).toHaveBeenCalledWith({
        type: 'TerminalKill',
        sessionId: 'session-1',
      });
    });
  });

  it('switches active tab when clicking on a tab', async () => {
    const store = mockStoreWithTerminals([
      { id: 'session-1', label: 'Terminal 1', worktreeId: 'test-worktree' },
      { id: 'session-2', label: 'Terminal 2', worktreeId: 'test-worktree' },
    ]);
    (useStore as any).mockImplementation((selectorOrValue: any) => {
      if (typeof selectorOrValue === 'function') {
        return selectorOrValue(store);
      }
      return selectorOrValue;
    });
    
    render(<TerminalPane worktreeId="test-worktree" />);
    
    // Wait for tabs to render
    await waitFor(() => {
      expect(screen.getByTestId('terminal-session-1')).toBeInTheDocument();
    });
    
    const tabs = screen.getAllByRole('tab');
    
    expect(screen.getByTestId('terminal-session-1')).toBeInTheDocument();
    expect(screen.queryByTestId('terminal-session-2')).not.toBeInTheDocument();
    
    fireEvent.click(tabs[1]);
    
    await waitFor(() => {
      expect(screen.queryByTestId('terminal-session-1')).not.toBeInTheDocument();
      expect(screen.getByTestId('terminal-session-2')).toBeInTheDocument();
    });
  });

  it('increments terminal numbers correctly', async () => {
    (useStore as any).mockImplementation((selectorOrValue: any) => {
      if (typeof selectorOrValue === 'function') {
        return selectorOrValue(mockEmptyStore);
      }
      return selectorOrValue;
    });

    render(<TerminalPane worktreeId="test-worktree" />);

    await waitFor(() => {
      expect(mockSend).toHaveBeenCalledWith({
        type: 'TerminalCreate',
        worktreeId: 'test-worktree',
        label: 'Terminal 1',
      });
    });

    mockSend.mockClear();

    const addButton = screen.getByLabelText('Create new terminal');
    fireEvent.click(addButton);

    await waitFor(() => {
      expect(mockSend).toHaveBeenCalledWith({
        type: 'TerminalCreate',
        worktreeId: 'test-worktree',
        label: 'Terminal 2',
      });
    });
  });
});