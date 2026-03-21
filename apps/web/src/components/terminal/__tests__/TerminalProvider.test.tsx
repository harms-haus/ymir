import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import {
  TerminalProvider,
  useTerminalContext,
  useTerminal,
} from '../TerminalProvider';
import { setTerminalOutputCallback } from '../../../store';
import type { TerminalOutput } from '../../../types/protocol';

vi.mock('../../../store', () => ({
  setTerminalOutputCallback: vi.fn(),
}));

vi.mock('../TerminalView', () => ({
  initializeGhostty: vi.fn().mockResolvedValue(undefined),
  isGhosttyInitialized: vi.fn().mockReturnValue(false),
}));

const TestComponent = () => {
  const context = useTerminalContext();
  return (
    <div data-testid="context-ready">
      {context.isInitialized ? 'initialized' : 'not-initialized'}
    </div>
  );
};

describe('TerminalProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should provide context to children', async () => {
    render(
      <TerminalProvider>
        <TestComponent />
      </TerminalProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('context-ready')).toBeInTheDocument();
    });
  });

  it('should auto-initialize ghostty-web on mount', async () => {
    const { initializeGhostty } = await import('../TerminalView');

    render(
      <TerminalProvider>
        <TestComponent />
      </TerminalProvider>
    );

    await waitFor(() => {
      expect(initializeGhostty).toHaveBeenCalled();
    });
  });

  it('should set up TerminalOutput callback', async () => {
    render(
      <TerminalProvider>
        <TestComponent />
      </TerminalProvider>
    );

    await waitFor(() => {
      expect(setTerminalOutputCallback).toHaveBeenCalled();
    });
  });

  it('should clean up callback on unmount', async () => {
    const { unmount } = render(
      <TerminalProvider>
        <TestComponent />
      </TerminalProvider>
    );

    await waitFor(() => {
      expect(setTerminalOutputCallback).toHaveBeenCalled();
    });

    unmount();

    expect(setTerminalOutputCallback).toHaveBeenLastCalledWith(null);
  });
});

describe('useTerminalContext', () => {
  it('should throw error when used outside provider', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    const TestComponentOutside = () => {
      useTerminalContext();
      return null;
    };

    expect(() => {
      render(<TestComponentOutside />);
    }).toThrow('useTerminalContext must be used within a TerminalProvider');

    consoleError.mockRestore();
  });
});

describe('useTerminal', () => {
  it('should register terminal instance', async () => {
    const write = vi.fn();
    const resize = vi.fn();

    const TestRegister = () => {
      const { register, isInitialized } = useTerminal('test-session');

      React.useEffect(() => {
        register(write, resize);
      }, [register]);

      return <div data-testid="status">{isInitialized ? 'ready' : 'loading'}</div>;
    };

    render(
      <TerminalProvider>
        <TestRegister />
      </TerminalProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('status')).toHaveTextContent('ready');
    });
  });

  it('should route data to correct terminal', async () => {
    const write1 = vi.fn();
    const write2 = vi.fn();

    const TestRouting = () => {
      const { register: register1 } = useTerminal('session-1');
      const { register: register2 } = useTerminal('session-2');
      const { writeToTerminal } = useTerminalContext();

      React.useEffect(() => {
        register1(write1, vi.fn());
        register2(write2, vi.fn());
      }, [register1, register2]);

      return (
        <button
          type="button"
          data-testid="send-btn"
          onClick={() => writeToTerminal('session-1', 'hello')}
        >
          Send
        </button>
      );
    };

    render(
      <TerminalProvider>
        <TestRouting />
      </TerminalProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('send-btn')).toBeInTheDocument();
    });

    screen.getByTestId('send-btn').click();

    expect(write1).toHaveBeenCalledWith('hello');
    expect(write2).not.toHaveBeenCalled();
  });
});

describe('TerminalOutput routing', () => {
  it('should route TerminalOutput to registered terminal', async () => {
    const write = vi.fn();
    let capturedCallback: ((message: TerminalOutput) => void) | null = null;

    (setTerminalOutputCallback as any).mockImplementation((callback: ((message: TerminalOutput) => void) | null) => {
      capturedCallback = callback;
    });

    const TestRouting = () => {
      const { register } = useTerminal('test-session');

      React.useEffect(() => {
        register(write, vi.fn());
      }, [register]);

      return <div data-testid="terminal">Terminal</div>;
    };

    render(
      <TerminalProvider>
        <TestRouting />
      </TerminalProvider>
    );

    await waitFor(() => {
      expect(capturedCallback).toBeTruthy();
    });

    const message: TerminalOutput = {
      type: 'TerminalOutput',
      sessionId: 'test-session',
      data: 'Hello from PTY',
    };

    ((capturedCallback as unknown) as (message: TerminalOutput) => void)(message);

    expect(write).toHaveBeenCalledWith('Hello from PTY');
  });

  it('should not throw for unknown session', async () => {
    let capturedCallback: ((message: TerminalOutput) => void) | null = null;

    (setTerminalOutputCallback as any).mockImplementation((callback: ((message: TerminalOutput) => void) | null) => {
      capturedCallback = callback;
    });

    render(
      <TerminalProvider>
        <div>Test</div>
      </TerminalProvider>
    );

    await waitFor(() => {
      expect(capturedCallback).toBeTruthy();
    });

    const message: TerminalOutput = {
      type: 'TerminalOutput',
      sessionId: 'unknown-session',
      data: 'Hello',
    };

    expect(() => {
    (capturedCallback as (message: TerminalOutput) => void)(message);
    }).not.toThrow();
  });
});

describe('registerTerminal cleanup', () => {
  it('should unregister terminal on cleanup', async () => {
    const write = vi.fn();
    let capturedCallback: ((message: TerminalOutput) => void) | null = null;

    (setTerminalOutputCallback as any).mockImplementation((callback: ((message: TerminalOutput) => void) | null) => {
      capturedCallback = callback;
    });

    const TestCleanup = ({ show }: { show: boolean }) => {
      const { register } = useTerminal('test-session');

      React.useEffect(() => {
        if (show) {
          const cleanup = register(write, vi.fn());
          return cleanup;
        }
      }, [register, show]);

      return show ? <div data-testid="terminal">Terminal</div> : null;
    };

    const { rerender } = render(
      <TerminalProvider>
        <TestCleanup show={true} />
      </TerminalProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('terminal')).toBeInTheDocument();
    });

    // Unmount terminal
    rerender(
      <TerminalProvider>
        <TestCleanup show={false} />
      </TerminalProvider>
    );

    const message: TerminalOutput = {
      type: 'TerminalOutput',
      sessionId: 'test-session',
      data: 'Hello',
    };

    ((capturedCallback as unknown) as (message: TerminalOutput) => void)(message);

    // Should not receive data after unmount
    expect(write).not.toHaveBeenCalled();
  });
});
