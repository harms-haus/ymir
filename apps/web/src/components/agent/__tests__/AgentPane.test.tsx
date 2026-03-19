import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AgentPane } from '../AgentPane';
import { useStore } from '../../../store';
import { useWebSocketClient } from '../../../hooks/useWebSocket';

vi.mock('../../../store');
vi.mock('../../../hooks/useWebSocket');
vi.mock('../AgentChat', () => ({
  AgentChat: ({ sessionId, agentType }: { sessionId: string; agentType: string }) => (
    <div data-testid={`agent-chat-${sessionId}`}>AgentChat: {agentType}</div>
  ),
}));
vi.mock('../editor/DiffTab', () => ({
  DiffTab: ({ filePath }: { filePath: string }) => <div data-testid={`diff-${filePath}`}>Loading diff...</div>,
}));

describe('AgentPane', () => {
  const mockSend = vi.fn();
  const mockRemoveAgentTab = vi.fn();
  const mockAddAgentTab = vi.fn();
  const mockSetActiveAgentTab = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();

    const mockClient = {
      send: mockSend,
      onMessage: vi.fn(() => vi.fn()),
    };

    (useWebSocketClient as any).mockReturnValue(mockClient);

    // Mock useStore to return actions when called without selector
    // and use selector when provided
    (useStore as any).mockImplementation((selector?: any) => {
      const store = {
        addAgentTab: mockAddAgentTab,
        removeAgentTab: mockRemoveAgentTab,
        setActiveAgentTab: mockSetActiveAgentTab,
      };
      if (selector) {
        return selector(store);
      }
      return store;
    });
  });

  it('renders empty state when no tabs exist', () => {
    (useStore as any).mockReturnValue([]);

    render(<AgentPane worktreeId="worktree-1" />);

    expect(screen.getByText(/No agent session/i)).toBeInTheDocument();
    expect(screen.getByText(/Click \+ to create one/i)).toBeInTheDocument();
  });

  it('renders agent tab with robot icon', () => {
    const tabs = [{ id: 'tab-1', type: 'agent', sessionId: 'agent-session-1', label: 'claude' }];
    (useStore as any).mockReturnValue(tabs);

    const mockAgentSession = {
      id: 'agent-session-1',
      worktreeId: 'worktree-1',
      agentType: 'claude',
      status: 'idle' as const,
      startedAt: Date.now(),
    };

    render(<AgentPane worktreeId="worktree-1" agentSession={mockAgentSession} />);

    expect(screen.getByText('claude')).toBeInTheDocument();
    expect(screen.getByTestId('agent-chat-agent-session-1')).toBeInTheDocument();
  });

  it('renders diff tab with diff icon', () => {
    const tabs = [{ id: 'tab-1', type: 'diff', filePath: '/path/to/file.ts' }];
    (useStore as any).mockReturnValue(tabs);

    render(<AgentPane worktreeId="worktree-1" />);

    expect(screen.getByText('Diff: file.ts')).toBeInTheDocument();
    expect(screen.getByText('Loading diff...')).toBeInTheDocument();
  });

  it('renders editor tab with code icon', () => {
    const tabs = [{ id: 'tab-1', type: 'editor', filePath: '/path/to/file.ts' }];
    (useStore as any).mockReturnValue(tabs);

    render(<AgentPane worktreeId="worktree-1" />);

    expect(screen.getByText('file.ts')).toBeInTheDocument();
    expect(screen.getByText('Editor placeholder (T24)')).toBeInTheDocument();
  });



  it('sends AgentSpawn message when + button is clicked', async () => {
    const tabs = [{ id: 'tab-1', type: 'agent', sessionId: 'agent-session-1', label: 'claude' }];
    (useStore as any).mockReturnValue(tabs);

    const mockAgentSession = {
      id: 'agent-session-1',
      worktreeId: 'worktree-1',
      agentType: 'claude',
      status: 'idle' as const,
      startedAt: Date.now(),
    };

    render(<AgentPane worktreeId="worktree-1" agentSession={mockAgentSession} />);

    const createButton = screen.getByLabelText('Create new agent');
    expect(createButton).toBeInTheDocument();

    fireEvent.click(createButton);

    await waitFor(() => {
      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'AgentSpawn',
          worktreeId: 'worktree-1',
          agentType: expect.any(String),
        })
      );
    });
  });
});
