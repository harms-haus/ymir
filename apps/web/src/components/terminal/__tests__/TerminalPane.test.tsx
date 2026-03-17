import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TerminalPane } from '../TerminalPane';
import { useStore } from '../../../store';
import { useWebSocketClient } from '../../../hooks/useWebSocket';

vi.mock('../../../store');
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

  it('renders empty state when no terminals exist', () => {
    (useStore as any).mockReturnValue([]);
    
    render(<TerminalPane worktreeId="test-worktree" />);
    
    expect(screen.getByText('No terminals')).toBeInTheDocument();
    expect(screen.getByText('Click + to create one')).toBeInTheDocument();
  });

  it('auto-creates first terminal when no terminals exist', async () => {
    (useStore as any).mockReturnValue([]);
    
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
    (useStore as any).mockReturnValue([
      { id: 'session-1', label: 'Terminal 1', worktreeId: 'test-worktree' },
    ]);
    
    render(<TerminalPane worktreeId="test-worktree" />);
    
    expect(screen.getByText('Terminal 1')).toBeInTheDocument();
    expect(screen.getByTestId('terminal-session-1')).toBeInTheDocument();
  });

  it('creates new tab when + button is clicked', async () => {
    (useStore as any).mockReturnValue([
      { id: 'session-1', label: 'Terminal 1', worktreeId: 'test-worktree' },
    ]);
    
    render(<TerminalPane worktreeId="test-worktree" />);
    
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

  it('closes tab when × button is clicked', async () => {
    (useStore as any).mockReturnValue([
      { id: 'session-1', label: 'Terminal 1', worktreeId: 'test-worktree' },
      { id: 'session-2', label: 'Terminal 2', worktreeId: 'test-worktree' },
    ]);
    
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
    (useStore as any).mockReturnValue([
      { id: 'session-1', label: 'Terminal 1', worktreeId: 'test-worktree' },
      { id: 'session-2', label: 'Terminal 2', worktreeId: 'test-worktree' },
    ]);
    
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

  it('switches active tab when clicking on a tab', () => {
    (useStore as any).mockReturnValue([
      { id: 'session-1', label: 'Terminal 1', worktreeId: 'test-worktree' },
      { id: 'session-2', label: 'Terminal 2', worktreeId: 'test-worktree' },
    ]);
    
    render(<TerminalPane worktreeId="test-worktree" />);
    
    const tabs = screen.getAllByRole('tab');
    
    expect(screen.getByTestId('terminal-session-1')).toBeInTheDocument();
    expect(screen.queryByTestId('terminal-session-2')).not.toBeInTheDocument();
    
    fireEvent.click(tabs[1]);
    
    expect(screen.queryByTestId('terminal-session-1')).not.toBeInTheDocument();
    expect(screen.getByTestId('terminal-session-2')).toBeInTheDocument();
  });

  it('shows empty state when last tab is closed', async () => {
    (useStore as any).mockReturnValue([
      { id: 'session-1', label: 'Terminal 1', worktreeId: 'test-worktree' },
    ]);
    
    const { rerender } = render(<TerminalPane worktreeId="test-worktree" />);
    
    const closeButton = screen.getByLabelText('Close tab');
    fireEvent.click(closeButton);
    
    (useStore as any).mockReturnValue([]);
    rerender(<TerminalPane worktreeId="test-worktree" />);
    
    await waitFor(() => {
      expect(screen.getByText('No terminals')).toBeInTheDocument();
    });
  });

  it('increments terminal numbers correctly', async () => {
    (useStore as any).mockReturnValue([
      { id: 'session-1', label: 'Terminal 1', worktreeId: 'test-worktree' },
      { id: 'session-2', label: 'Terminal 2', worktreeId: 'test-worktree' },
    ]);
    
    render(<TerminalPane worktreeId="test-worktree" />);
    
    const addButton = screen.getByLabelText('Create new terminal');
    fireEvent.click(addButton);
    
    await waitFor(() => {
      expect(mockSend).toHaveBeenCalledWith({
        type: 'TerminalCreate',
        worktreeId: 'test-worktree',
        label: 'Terminal 3',
      });
    });
  });
});