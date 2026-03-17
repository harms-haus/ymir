import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { Terminal } from '../TerminalView';

vi.mock('ghostty-web', () => ({
  init: vi.fn().mockResolvedValue(undefined),
  Terminal: vi.fn().mockImplementation(function() {
    return {
      write: vi.fn(),
      resize: vi.fn(),
      dispose: vi.fn(),
      onData: vi.fn(),
      open: vi.fn(),
      options: {
        fontSize: 13,
        fontFamily: 'monospace',
      },
    };
  }),
}));

vi.mock('../../../lib/ws', () => ({
  getWebSocketClient: vi.fn().mockReturnValue({
    send: vi.fn(),
    onMessage: vi.fn().mockReturnValue(() => {}),
  }),
}));

class MockResizeObserver {
  observe = vi.fn();
  disconnect = vi.fn();
  unobserve = vi.fn();
}

globalThis.ResizeObserver = MockResizeObserver as any;

describe('Terminal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render terminal container', async () => {
    render(<Terminal terminalSessionId="test-session-1" />);

    await waitFor(() => {
      expect(screen.getByTestId('terminal')).toBeInTheDocument();
    });
  });

  it('should set session ID as data attribute', async () => {
    render(<Terminal terminalSessionId="test-session-1" />);

    await waitFor(() => {
      const terminal = screen.getByTestId('terminal');
      expect(terminal).toHaveAttribute('data-session-id', 'test-session-1');
    });
  });

  it('should apply CSS theme variables', async () => {
    render(<Terminal terminalSessionId="test-session-1" />);

    await waitFor(() => {
      const terminal = screen.getByTestId('terminal');
      expect(terminal).toHaveStyle({
        backgroundColor: 'hsl(var(--terminal-bg))',
      });
    });
  });
});
