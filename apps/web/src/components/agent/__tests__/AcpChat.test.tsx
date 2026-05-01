import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AcpChat } from '../AcpChat';

// Mock the acp-session-manager module
vi.mock('../../lib/acp-session-manager', () => ({
  acpSessionManager: {
    getAcpStore: vi.fn(),
    getSessionState: vi.fn(),
    sendPrompt: vi.fn(),
    cancelPrompt: vi.fn(),
  },
}));

// Mock the Thread component from acp-chat-react
vi.mock('@harms-haus/acp-chat-react', async () => {
  const actual = await vi.importActual('@harms-haus/acp-chat-react');
  return {
    ...actual,
    Thread: vi.fn(({ className, store, onPermissionRespond, ...props }) => (
      <div data-testid="thread" data-class-name={className} data-has-store={!!store} {...props}>
        MockThread
      </div>
    )),
  };
});

// Mock the CSS import
vi.mock('../acp-chat.css', () => ({}));

// Import the mocked acpSessionManager
import { acpSessionManager } from '../../lib/acp-session-manager';

describe('AcpChat', () => {
  const defaultProps = {
    sessionId: 'test-session-id',
    agentType: 'test-agent',
    worktreeId: 'test-worktree',
    onSendMessage: vi.fn(),
  };

  const mockStore = {
    getSnapshot: vi.fn(() => ({ messages: new Map() })),
    subscribe: vi.fn(() => vi.fn()),
    respondToPermission: vi.fn(),
  };

  const mockState = {
    connectionStatus: 'connected' as const,
    initialized: true,
    sessionId: 'test-session-id',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(acpSessionManager.getAcpStore).mockReturnValue(mockStore as any);
    vi.mocked(acpSessionManager.getSessionState).mockReturnValue(mockState as any);
  });

  it('renders without crashing when store is available', () => {
    render(<AcpChat {...defaultProps} />);
    
    expect(screen.getByTestId('thread')).toBeInTheDocument();
  });

  it('renders thread component with correct props', () => {
    render(<AcpChat {...defaultProps} />);
    
    const thread = screen.getByTestId('thread');
    expect(thread).toHaveAttribute('data-class-name', 'acp-chat-thread');
    expect(thread).toHaveAttribute('data-has-store', 'true');
  });

  it('displays empty state when store is not available', () => {
    vi.mocked(acpSessionManager.getAcpStore).mockReturnValue(null);
    
    render(<AcpChat {...defaultProps} />);
    
    expect(screen.getByText('No ACP session available for this worktree.')).toBeInTheDocument();
    expect(screen.queryByTestId('thread')).not.toBeInTheDocument();
  });

  it('renders composer wrapper when store is available', () => {
    render(<AcpChat {...defaultProps} />);
    
    const composerWrapper = document.querySelector('.acp-chat-composer-wrapper');
    expect(composerWrapper).toBeInTheDocument();
  });

  it('disables composer when not ready (no session)', () => {
    vi.mocked(acpSessionManager.getSessionState).mockReturnValue({
      connectionStatus: 'connected',
      initialized: true,
      sessionId: null, // No session ID
    } as any);
    
    render(<AcpChat {...defaultProps} />);
    
    const textarea = screen.getByRole('textbox');
    expect(textarea).toBeDisabled();
  });

  it('disables composer when not connected', () => {
    vi.mocked(acpSessionManager.getSessionState).mockReturnValue({
      connectionStatus: 'disconnected',
      initialized: true,
      sessionId: 'test-session-id',
    } as any);
    
    render(<AcpChat {...defaultProps} />);
    
    const textarea = screen.getByRole('textbox');
    expect(textarea).toBeDisabled();
  });

  it('disables composer when not initialized', () => {
    vi.mocked(acpSessionManager.getSessionState).mockReturnValue({
      connectionStatus: 'connected',
      initialized: false,
      sessionId: 'test-session-id',
    } as any);
    
    render(<AcpChat {...defaultProps} />);
    
    const textarea = screen.getByRole('textbox');
    expect(textarea).toBeDisabled();
  });

  it('passes agentType to the composer placeholder', () => {
    render(<AcpChat {...defaultProps} agentType="CustomAgent" />);
    
    const textarea = screen.getByRole('textbox');
    expect(textarea).toHaveAttribute('placeholder', 'Ask CustomAgent...');
  });
});