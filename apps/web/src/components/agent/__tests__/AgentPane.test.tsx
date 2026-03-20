import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AgentPane } from '../AgentPane';
import { useStore, selectActiveAgentTabId, selectAgentTabsByWorktreeId, AgentTab } from '../../../store';
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

    (useStore as any).mockImplementation((selector?: any) => {
      const store = {
        addAgentTab: mockAddAgentTab,
        removeAgentTab: mockRemoveAgentTab,
        setActiveAgentTab: mockSetActiveAgentTab,
        agentSessions: [],
        agentTabs: new Map(),
        activeAgentTabId: new Map(),
      };
      if (typeof selector === 'function') {
        return selector(store);
      }
      return store;
    });

    (selectAgentTabsByWorktreeId as any).mockImplementation((worktreeId: string) => {
      return (state: any) => state.agentTabs.get(worktreeId) || [];
    });

    (selectActiveAgentTabId as any).mockImplementation((worktreeId: string) => {
      return (state: any) => state.activeAgentTabId.get(worktreeId) || null;
    });
  });

  it('renders empty state when no tabs exist', () => {
    (useStore as any).mockImplementation((selector?: any) => {
      const store = {
        addAgentTab: mockAddAgentTab,
        removeAgentTab: mockRemoveAgentTab,
        setActiveAgentTab: mockSetActiveAgentTab,
        agentSessions: [],
        agentTabs: new Map(),
        activeAgentTabId: new Map(),
      };
      if (typeof selector === 'function') {
        return selector(store);
      }
      return store;
    });

    render(<AgentPane worktreeId="worktree-1" />);

    expect(screen.getByText(/No agent session/i)).toBeInTheDocument();
    expect(screen.getByText(/Click \+ to create one/i)).toBeInTheDocument();
  });

  it('renders agent tab with robot icon', () => {
    const tabs: AgentTab[] = [{ id: 'tab-1', type: 'agent', sessionId: 'agent-session-1', label: 'claude' }];
    const mockAgentSessions = [
      {
        id: 'agent-session-1',
        worktreeId: 'worktree-1',
        agentType: 'claude',
        status: 'idle' as const,
        startedAt: Date.now(),
      },
    ];

    (useStore as any).mockImplementation((selector?: any) => {
      const store = {
        addAgentTab: mockAddAgentTab,
        removeAgentTab: mockRemoveAgentTab,
        setActiveAgentTab: mockSetActiveAgentTab,
        agentSessions: mockAgentSessions,
        agentTabs: new Map([['worktree-1', tabs]]),
        activeAgentTabId: new Map([['worktree-1', 'tab-1']]),
      };
      if (typeof selector === 'function') {
        return selector(store);
      }
      return store;
    });

    render(<AgentPane worktreeId="worktree-1" />);

    expect(screen.getByText('claude')).toBeInTheDocument();
    expect(screen.getByTestId('agent-chat-agent-session-1')).toBeInTheDocument();
  });

  it('renders diff tab with diff icon', () => {
    const tabs: AgentTab[] = [{ id: 'tab-1', type: 'diff', filePath: '/path/to/file.ts' }];

    (useStore as any).mockImplementation((selector?: any) => {
      const store = {
        addAgentTab: mockAddAgentTab,
        removeAgentTab: mockRemoveAgentTab,
        setActiveAgentTab: mockSetActiveAgentTab,
        agentSessions: [],
        agentTabs: new Map([['worktree-1', tabs]]),
        activeAgentTabId: new Map([['worktree-1', 'tab-1']]),
      };
      if (typeof selector === 'function') {
        return selector(store);
      }
      return store;
    });

    render(<AgentPane worktreeId="worktree-1" />);

    expect(screen.getByText('Diff: file.ts')).toBeInTheDocument();
    expect(screen.getByText('Loading diff...')).toBeInTheDocument();
  });

  it('renders editor tab with code icon', () => {
    const tabs: AgentTab[] = [{ id: 'tab-1', type: 'editor', filePath: '/path/to/file.ts' }];

    (useStore as any).mockImplementation((selector?: any) => {
      const store = {
        addAgentTab: mockAddAgentTab,
        removeAgentTab: mockRemoveAgentTab,
        setActiveAgentTab: mockSetActiveAgentTab,
        agentSessions: [],
        agentTabs: new Map([['worktree-1', tabs]]),
        activeAgentTabId: new Map([['worktree-1', 'tab-1']]),
      };
      if (typeof selector === 'function') {
        return selector(store);
      }
      return store;
    });

    render(<AgentPane worktreeId="worktree-1" />);

    expect(screen.getByText('file.ts')).toBeInTheDocument();
    expect(screen.getByText('Editor placeholder (T24)')).toBeInTheDocument();
  });



  it('sends AgentSpawn message when + button is clicked', async () => {
    const tabs: AgentTab[] = [{ id: 'tab-1', type: 'agent', sessionId: 'agent-session-1', label: 'claude' }];
    const mockAgentSessions = [
      {
        id: 'agent-session-1',
        worktreeId: 'worktree-1',
        agentType: 'claude',
        status: 'idle' as const,
        startedAt: Date.now(),
      },
    ];

    (useStore as any).mockImplementation((selector?: any) => {
      const store = {
        addAgentTab: mockAddAgentTab,
        removeAgentTab: mockRemoveAgentTab,
        setActiveAgentTab: mockSetActiveAgentTab,
        agentSessions: mockAgentSessions,
        agentTabs: new Map([['worktree-1', tabs]]),
        activeAgentTabId: new Map([['worktree-1', 'tab-1']]),
      };
      if (typeof selector === 'function') {
        return selector(store);
      }
      return store;
    });

    render(<AgentPane worktreeId="worktree-1" />);

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
