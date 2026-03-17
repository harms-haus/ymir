import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AgentChat } from '../AgentChat';
import { useWebSocketClient } from '../../../hooks/useWebSocket';
import { useAgentStatus } from '../../../hooks/useAgentStatus';
import { AgentOutput, AgentPrompt } from '../../../types/protocol';

vi.mock('../../../hooks/useWebSocket');
vi.mock('../../../hooks/useAgentStatus');

describe('AgentChat', () => {
  const mockOnSendMessage = vi.fn();
  const mockOnMessage = vi.fn();
  const mockSend = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();

    const mockClient = {
      send: mockSend,
      onMessage: mockOnMessage.mockReturnValue(vi.fn()),
    };

    (useWebSocketClient as any).mockReturnValue(mockClient);
    (useAgentStatus as any).mockReturnValue({ status: 'idle', taskSummary: '' });
  });

  const renderAgentChat = (props: Partial<Parameters<typeof AgentChat>[0]> = {}) => {
    const defaultProps = {
      sessionId: 'session-1',
      agentType: 'claude',
      worktreeId: 'worktree-1',
      onSendMessage: mockOnSendMessage,
    };
    return render(<AgentChat {...defaultProps} {...props} />);
  };

  it('renders empty state with agent name', () => {
    renderAgentChat();

    expect(screen.getByText(/Start a conversation with Claude/i)).toBeInTheDocument();
  });

  it('renders input with dynamic placeholder based on agent type', () => {
    renderAgentChat();

    const input = screen.getByPlaceholderText('Ask claude...');
    expect(input).toBeInTheDocument();
  });

  it('renders different agent names correctly', () => {
    const { rerender } = renderAgentChat({ agentType: 'glm-5' });

    expect(screen.getByPlaceholderText('Ask glm-5...')).toBeInTheDocument();

    rerender(<AgentChat sessionId="session-1" agentType="opencode" worktreeId="worktree-1" onSendMessage={mockOnSendMessage} />);

    expect(screen.getByPlaceholderText('Ask opencode...')).toBeInTheDocument();
  });

  it('sends message on Enter key', () => {
    renderAgentChat();

    const input = screen.getByPlaceholderText('Ask claude...');
    fireEvent.change(input, { target: { value: 'Hello agent' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(mockOnSendMessage).toHaveBeenCalledWith('Hello agent');
  });

  it('does not send empty messages', () => {
    renderAgentChat();

    const input = screen.getByPlaceholderText('Ask claude...');
    fireEvent.change(input, { target: { value: ' ' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(mockOnSendMessage).not.toHaveBeenCalled();
  });

  it('allows Shift+Enter for newlines', () => {
    renderAgentChat();

    const input = screen.getByPlaceholderText('Ask claude...');
    fireEvent.change(input, { target: { value: 'Line 1' } });
    fireEvent.keyDown(input, { key: 'Enter', shiftKey: true });

    expect(mockOnSendMessage).not.toHaveBeenCalled();
  });

  it('displays agent output messages', async () => {
    renderAgentChat();

    const outputHandler = mockOnMessage.mock.calls.find((call) => call[0] === 'AgentOutput')?.[1];
    expect(outputHandler).toBeDefined();

    const mockOutput: AgentOutput = {
      type: 'AgentOutput',
      sessionId: 'session-1',
      output: 'This is the agent response',
    };

    await act(async () => {
      outputHandler(mockOutput);
    });

    expect(screen.getByText('This is the agent response')).toBeInTheDocument();
  });

  it('displays user prompt messages', async () => {
    renderAgentChat();

    const promptHandler = mockOnMessage.mock.calls.find((call) => call[0] === 'AgentPrompt')?.[1];
    expect(promptHandler).toBeDefined();

    const mockPrompt: AgentPrompt = {
      type: 'AgentPrompt',
      sessionId: 'session-1',
      prompt: 'Hello agent',
    };

    await act(async () => {
      promptHandler(mockPrompt);
    });

    expect(screen.getByText('Hello agent')).toBeInTheDocument();
  });

  it('shows correct status from useAgentStatus hook', () => {
    (useAgentStatus as any).mockReturnValue({ status: 'working', taskSummary: 'Processing' });

    renderAgentChat();

    const statusDot = screen.getByText('working');
    expect(statusDot).toBeInTheDocument();
  });

  it('displays agent name and subtitle', () => {
    renderAgentChat();

    expect(screen.getByText('Claude (Plan Builder)')).toBeInTheDocument();
  });

  it('displays helper text', () => {
    renderAgentChat();

    expect(screen.getByText('tab: switch agents')).toBeInTheDocument();
  });

  it('displays tip text', () => {
    renderAgentChat();

    expect(screen.getByText(/Tip: Use instructions in config to load additional rules files/i)).toBeInTheDocument();
  });

  it('clears input after sending message', () => {
    renderAgentChat();

    const input = screen.getByPlaceholderText('Ask claude...') as HTMLTextAreaElement;
    fireEvent.change(input, { target: { value: 'Hello agent' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(input.value).toBe('');
  });

  it('ignores messages from other sessions', async () => {
    renderAgentChat();

    const outputHandler = mockOnMessage.mock.calls.find((call) => call[0] === 'AgentOutput')?.[1];

    const mockOutput: AgentOutput = {
      type: 'AgentOutput',
      sessionId: 'different-session',
      output: 'This should not appear',
    };

    await act(async () => {
      outputHandler(mockOutput);
    });

    expect(screen.queryByText('This should not appear')).not.toBeInTheDocument();
  });
});
