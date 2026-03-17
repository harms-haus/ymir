import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AgentPane } from '../AgentPane';
import { useStore, selectAgentTabsByWorktreeId, selectActiveAgentTabId } from '../../../store';
import { useWebSocketClient } from '../../../hooks/useWebSocket';

vi.mock('../../../store');
vi.mock('../../../hooks/useWebSocket');
vi.mock('../AgentChat', () => ({
  AgentChat: ({ sessionId, agentType }: { sessionId: string; agentType: string }) => (
    <div data-testid={`agent-chat-${sessionId}`}>AgentChat: {agentType}</div>
  ),
}));

describe('AgentPane', () => {
  const mockSend = vi.fn();
  const mockAddAgentTab = vi.fn();
  const mockRemoveAgentTab = vi.fn();
  const mockSetActiveAgentTab = vi.fn();

  const mockAgentSession = {
    id: 'agent-session-1',
    worktreeId: 'worktree-1',
    agentType: 'claude',
    status: 'idle' as const,
    startedAt: Date.now(),
  };

  beforeEach(() => {
    vi.clearAllMocks();

    const mockClient = {
      send: mockSend,
    };

    (useWebSocketClient as any).mockReturnValue(mockClient);
    
    // Mock the selectors
    (selectAgentTabsByWorktreeId as any).mockReturnValue(() => []);
    (selectActiveAgentTabId as any).mockReturnValue(() => null);
    
    // Mock useStore to return actions
    (useStore as any).mockImplementation((selector: any) => {
      const store = {
        addAgentTab: mockAddAgentTab,
        removeAgentTab: mockRemoveAgentTab,
        setActiveAgentTab: mockSetActiveAgentTab,
      };
      if (typeof selector === 'function') {
        return selector(store);
      }
      return store;
    });
  });

  it('renders empty state when no tabs exist', () => {
    (selectAgentTabsByWorktreeId as any).mockReturnValue(() => []);
    
    render(<AgentPane worktreeId="worktree-1" />);

    expect(screen.getByText('No agent session')).toBeInTheDocument();
    expect(screen.getByText('Spawn an agent to start chatting')).toBeInTheDocument();
  });

  it('auto-creates agent tab when agent session exists', () => {
    (selectAgentTabsByWorktreeId as any).mockReturnValue(() => []);
    
    render(<AgentPane worktreeId="worktree-1" agentSession={mockAgentSession} />);

    expect(mockAddAgentTab).toHaveBeenCalledWith('worktree-1', {
      id: 'agent-agent-session-1',
      type: 'agent',
      sessionId: 'agent-session-1',
      label: 'claude',
    });
  });

  it('renders agent tab with robot icon', () => {
    const tabs = [{ id: 'tab-1', type: 'agent', sessionId: 'agent-session-1', label: 'claude' }];
    (selectAgentTabsByWorktreeId as any).mockReturnValue(() => tabs);
    (selectActiveAgentTabId as any).mockReturnValue(() => 'tab-1');

    render(<AgentPane worktreeId="worktree-1" agentSession={mockAgentSession} />);

    expect(screen.getByText('claude')).toBeInTheDocument();
    expect(screen.getByTestId('agent-chat-agent-session-1')).toBeInTheDocument();
  });

  it('renders diff tab with diff icon', () => {
    const tabs = [{ id: 'tab-1', type: 'diff', filePath: '/path/to/file.ts' }];
    (selectAgentTabsByWorktreeId as any).mockReturnValue(() => tabs);
    (selectActiveAgentTabId as any).mockReturnValue(() => 'tab-1');

    render(<AgentPane worktreeId="worktree-1" />);

    expect(screen.getByText('Diff: file.ts')).toBeInTheDocument();
    expect(screen.getByText('Diff viewer placeholder (T25)')).toBeInTheDocument();
  });

  it('renders editor tab with code icon', () => {
    const tabs = [{ id: 'tab-1', type: 'editor', filePath: '/path/to/file.ts' }];
    (selectAgentTabsByWorktreeId as any).mockReturnValue(() => tabs);
    (selectActiveAgentTabId as any).mockReturnValue(() => 'tab-1');

    render(<AgentPane worktreeId="worktree-1" />);

    expect(screen.getByText('file.ts')).toBeInTheDocument();
    expect(screen.getByText('Editor placeholder (T24)')).toBeInTheDocument();
  });

  it('closes tab when × button is clicked', () => {
    const tabs = [
      { id: 'tab-1', type: 'agent', sessionId: 'agent-session-1', label: 'claude' },
      { id: 'tab-2', type: 'agent', sessionId: 'agent-session-2', label: 'opencode' },
    ];
    (selectAgentTabsByWorktreeId as any).mockReturnValue(() => tabs);
    (selectActiveAgentTabId as any).mockReturnValue(() => 'tab-1');

    render(<AgentPane worktreeId="worktree-1" agentSession={mockAgentSession} />);

    const closeButtons = screen.getAllByLabelText('Close tab');
    fireEvent.click(closeButtons[0]);

    expect(mockRemoveAgentTab).toHaveBeenCalledWith('worktree-1', 'tab-1');
  });

  it('closes tab on middle-click', () => {
    const tabs = [
      { id: 'tab-1', type: 'agent', sessionId: 'agent-session-1', label: 'claude' },
      { id: 'tab-2', type: 'agent', sessionId: 'agent-session-2', label: 'opencode' },
    ];
    (selectAgentTabsByWorktreeId as any).mockReturnValue(() => tabs);
    (selectActiveAgentTabId as any).mockReturnValue(() => 'tab-1');

    render(<AgentPane worktreeId="worktree-1" agentSession={mockAgentSession} />);

    const tabsElements = screen.getAllByRole('tab');
    fireEvent.mouseDown(tabsElements[0], { button: 1 });

    expect(mockRemoveAgentTab).toHaveBeenCalledWith('worktree-1', 'tab-1');
  });

  it('switches active tab when clicking on a tab', () => {
    const tabs = [
      { id: 'tab-1', type: 'agent', sessionId: 'agent-session-1', label: 'claude' },
      { id: 'tab-2', type: 'agent', sessionId: 'agent-session-2', label: 'opencode' },
    ];
    (selectAgentTabsByWorktreeId as any).mockReturnValue(() => tabs);
    (selectActiveAgentTabId as any).mockReturnValue(() => 'tab-1');

    render(<AgentPane worktreeId="worktree-1" agentSession={mockAgentSession} />);

    const tabsElements = screen.getAllByRole('tab');
    fireEvent.click(tabsElements[1]);

    expect(mockSetActiveAgentTab).toHaveBeenCalledWith('worktree-1', 'tab-2');
  });

  it('sends AgentSend message when chat sends a message', async () => {
    const tabs = [{ id: 'tab-1', type: 'agent', sessionId: 'agent-session-1', label: 'claude' }];
    (selectAgentTabsByWorktreeId as any).mockReturnValue(() => tabs);
    (selectActiveAgentTabId as any).mockReturnValue(() => 'tab-1');

    render(<AgentPane worktreeId="worktree-1" agentSession={mockAgentSession} />);

    expect(screen.getByTestId('agent-chat-agent-session-1')).toBeInTheDocument();
  });
});
