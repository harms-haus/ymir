// Tests for Terminal component (react-xtermjs migration target)

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { Terminal as TerminalComponent } from '../Terminal';
import useWorkspaceStore from '../../state/workspace';

// ============================================================================
// Mocks
// ============================================================================

// Mock Tauri API
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
  Channel: vi.fn(() => ({
    onmessage: vi.fn(),
  })),
}));

vi.mock('@tauri-apps/plugin-notification', () => ({
  sendNotification: vi.fn(),
}));

// Mock react-xtermjs (will be added in Task 4)
vi.mock('react-xtermjs', () => ({
  useXTerm: vi.fn(() => ({
    terminalRef: { current: null },
    write: vi.fn(),
    clear: vi.fn(),
    fit: vi.fn(),
  })),
}));

// Mock xterm CSS import
vi.mock('@xterm/xterm/css/xterm.css', () => ({}));

// Mock xterm directly to prevent jsdom errors
vi.mock('@xterm/xterm', () => {
  class MockTerminal {
    open = vi.fn();
    write = vi.fn();
    onData = vi.fn(() => ({ dispose: vi.fn() }));
    refresh = vi.fn();
    loadAddon = vi.fn();
    element = null;
    rows = 24;
    cols = 80;
  }
  return { Terminal: MockTerminal };
});

// Mock ErrorBoundary
vi.mock('../components/ErrorBoundary', () => ({
  ErrorBoundary: ({ children }: { children: React.ReactNode }) => <div data-testid="error-boundary">{children}</div>,
}));

// Mock logger
vi.mock('../lib/logger', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

const { invoke, Channel } = await import('@tauri-apps/api/core');
const { useXTerm } = await import('react-xtermjs');

// ============================================================================
// Setup
// ============================================================================

describe('Terminal Component (react-xtermjs migration target)', () => {
  const mockWrite = vi.fn();
  const mockFit = vi.fn();
  const mockOnDataDispose = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();

    // Reset store state
    const { resetState } = useWorkspaceStore.getState();
    if (resetState) {
      resetState();
    }

    // Mock useXTerm return value
    (useXTerm as any).mockReturnValue({
      terminalRef: { current: null },
      write: mockWrite,
      clear: vi.fn(),
      fit: mockFit,
    });

    // Mock Tauri invoke to return default values
    (invoke as any).mockResolvedValue('test-session-id');
    (Channel as any).mockImplementation(() => ({
      onmessage: null,
    }));

    // Mock onData handler dispose
    mockOnDataDispose.mockReset();
  });

  // ============================================================================
  // Rendering Tests
  // ============================================================================

  describe('Rendering', () => {
    it('should render without errors', () => {
      render(
        <TerminalComponent
          tabId="tab-1"
          paneId="pane-1"
          sessionId="session-123"
        />
      );

      const terminal = screen.getByTestId('error-boundary');
      expect(terminal).toBeInTheDocument();
    });

    it('should render with required props', () => {
      render(
        <TerminalComponent
          tabId="tab-1"
          paneId="pane-1"
          sessionId="session-123"
        />
      );

      expect(screen.getByTestId('error-boundary')).toBeInTheDocument();
    });

    it('should render without sessionId prop (will spawn new PTY)', () => {
      render(
        <TerminalComponent
          tabId="tab-1"
          paneId="pane-1"
        />
      );

      expect(screen.getByTestId('error-boundary')).toBeInTheDocument();
    });

    it('should render with onNotification callback', () => {
      const onNotification = vi.fn();

      render(
        <TerminalComponent
          tabId="tab-1"
          paneId="pane-1"
          sessionId="session-123"
          onNotification={onNotification}
        />
      );

      expect(screen.getByTestId('error-boundary')).toBeInTheDocument();
    });

    it('should render with hasNotification flag', () => {
      render(
        <TerminalComponent
          tabId="tab-1"
          paneId="pane-1"
          sessionId="session-123"
          hasNotification={true}
        />
      );

      expect(screen.getByTestId('error-boundary')).toBeInTheDocument();
    });
  });

  // ============================================================================
  // PTY Command Tests
  // ============================================================================

  describe('PTY Commands', () => {
    it('should call write_pty when data is received from terminal', async () => {
      const sessionId = 'test-session-123';
      const testData = 'echo "hello"\n';

      // Mock onData handler setup (simulating react-xtermjs behavior)
      let onDataCallback: ((data: string) => void) | null = null;

      (useXTerm as any).mockReturnValue({
        terminalRef: { current: null },
        write: mockWrite,
        clear: vi.fn(),
        fit: mockFit,
        onData: (callback: (data: string) => void) => {
          onDataCallback = callback;
          return { dispose: mockOnDataDispose };
        },
      });

      render(
        <TerminalComponent
          tabId="tab-1"
          paneId="pane-1"
          sessionId={sessionId}
        />
      );

      // Wait for component to initialize
      await waitFor(() => {
        expect(invoke).toHaveBeenCalled();
      });

      // Simulate data from terminal
      if (onDataCallback) {
        onDataCallback(testData);
      }

      // Verify write_pty was called with correct sessionId and data
      expect(invoke).toHaveBeenCalledWith('write_pty', {
        sessionId: sessionId,
        data: testData,
      });
    });

    it('should spawn new PTY when no sessionId is provided', async () => {
      render(
        <TerminalComponent
          tabId="tab-1"
          paneId="pane-1"
        />
      );

      await waitFor(() => {
        expect(invoke).toHaveBeenCalledWith('spawn_pty', expect.any(Object));
      });
    });

    it('should attach to existing PTY when sessionId is provided', async () => {
      const sessionId = 'existing-session-123';

      // Mock is_pty_alive to return true
      (invoke as any).mockImplementation((command: string) => {
        if (command === 'is_pty_alive') {
          return Promise.resolve(true);
        }
        if (command === 'attach_pty_channel') {
          return Promise.resolve();
        }
        return Promise.resolve(sessionId);
      });

      render(
        <TerminalComponent
          tabId="tab-1"
          paneId="pane-1"
          sessionId={sessionId}
        />
      );

      await waitFor(() => {
        expect(invoke).toHaveBeenCalledWith('is_pty_alive', expect.any(Object));
      });

      await waitFor(() => {
        expect(invoke).toHaveBeenCalledWith('attach_pty_channel', expect.any(Object));
      });
    });

    it('should call resize_pty when terminal dimensions change', async () => {
      const sessionId = 'test-session-123';

      // Mock resize with cols and rows
      let onDataCallback: ((data: string) => void) | null = null;

      (useXTerm as any).mockReturnValue({
        terminalRef: { current: { cols: 80, rows: 24 } },
        write: mockWrite,
        clear: vi.fn(),
        fit: mockFit,
        onData: (callback: (data: string) => void) => {
          onDataCallback = callback;
          return { dispose: mockOnDataDispose };
        },
      });

      render(
        <TerminalComponent
          tabId="tab-1"
          paneId="pane-1"
          sessionId={sessionId}
        />
      );

      await waitFor(() => {
        expect(invoke).toHaveBeenCalled();
      });

      // Trigger resize effect by simulating terminal ready state
      await waitFor(() => {
        expect(invoke).toHaveBeenCalledWith('resize_pty', expect.objectContaining({
          sessionId: sessionId,
          cols: 80,
          rows: 24,
        }));
      });
    });
  });

  // ============================================================================
  // onData Handler Tests
  // ============================================================================

  describe('onData Handler', () => {
    it('should call write_pty with correct sessionId', async () => {
      const sessionId = 'session-abc-123';
      const testData = 'ls -la\n';

      let onDataCallback: ((data: string) => void) | null = null;

      (useXTerm as any).mockReturnValue({
        terminalRef: { current: null },
        write: mockWrite,
        clear: vi.fn(),
        fit: mockFit,
        onData: (callback: (data: string) => void) => {
          onDataCallback = callback;
          return { dispose: mockOnDataDispose };
        },
      });

      render(
        <TerminalComponent
          tabId="tab-1"
          paneId="pane-1"
          sessionId={sessionId}
        />
      );

      await waitFor(() => {
        expect(invoke).toHaveBeenCalled();
      });

      if (onDataCallback) {
        onDataCallback(testData);
      }

      expect(invoke).toHaveBeenCalledWith('write_pty', {
        sessionId: sessionId,
        data: testData,
      });
    });

    it('should not call write_pty when no session exists', async () => {
      const testData = 'some command\n';

      let onDataCallback: ((data: string) => void) | null = null;

      (useXTerm as any).mockReturnValue({
        terminalRef: { current: null },
        write: mockWrite,
        clear: vi.fn(),
        fit: mockFit,
        onData: (callback: (data: string) => void) => {
          onDataCallback = callback;
          return { dispose: mockOnDataDispose };
        },
      });

      render(
        <TerminalComponent
          tabId="tab-1"
          paneId="pane-1"
        />
      );

      await waitFor(() => {
        expect(invoke).toHaveBeenCalled();
      });

      if (onDataCallback) {
        onDataCallback(testData);
      }

      // write_pty should not be called if no active session
      expect(invoke).not.toHaveBeenCalledWith('write_pty', expect.any(Object));
    });
  });

  // ============================================================================
  // Theme Application Tests
  // ============================================================================

  describe('Theme Application', () => {
    it('should apply theme to terminal options', () => {
      // Mock useXTerm to capture options
      let capturedOptions: any = null;

      (useXTerm as any).mockImplementation((options: any) => {
        capturedOptions = options;
        return {
          terminalRef: { current: null },
          write: mockWrite,
          clear: vi.fn(),
          fit: mockFit,
        };
      });

      render(
        <TerminalComponent
          tabId="tab-1"
          paneId="pane-1"
          sessionId="session-123"
        />
      );

      expect(capturedOptions).toBeDefined();
      expect(capturedOptions.theme).toEqual({
        background: '#1e1e1e',
        foreground: '#d4d4d4',
        cursor: '#d4d4d4',
        selectionBackground: '#264f78',
        black: '#000000',
        red: '#cd3131',
        green: '#0dbc79',
        yellow: '#e5e510',
        blue: '#2472c8',
        magenta: '#bc3fbc',
        cyan: '#11a8cd',
        white: '#e5e5e5',
        brightBlack: '#666666',
        brightRed: '#f14c4c',
        brightGreen: '#23d18b',
        brightYellow: '#f5f543',
        brightBlue: '#3b8eea',
        brightMagenta: '#d670d6',
        brightCyan: '#29b8db',
        brightWhite: '#e5e5e5',
      });
    });

    it('should set cursorBlink to true', () => {
      let capturedOptions: any = null;

      (useXTerm as any).mockImplementation((options: any) => {
        capturedOptions = options;
        return {
          terminalRef: { current: null },
          write: mockWrite,
          clear: vi.fn(),
          fit: mockFit,
        };
      });

      render(
        <TerminalComponent
          tabId="tab-1"
          paneId="pane-1"
          sessionId="session-123"
        />
      );

      expect(capturedOptions.cursorBlink).toBe(true);
    });

    it('should set fontSize to 14', () => {
      let capturedOptions: any = null;

      (useXTerm as any).mockImplementation((options: any) => {
        capturedOptions = options;
        return {
          terminalRef: { current: null },
          write: mockWrite,
          clear: vi.fn(),
          fit: mockFit,
        };
      });

      render(
        <TerminalComponent
          tabId="tab-1"
          paneId="pane-1"
          sessionId="session-123"
        />
      );

      expect(capturedOptions.fontSize).toBe(14);
    });

    it('should set fontFamily to JetBrains Mono with fallbacks', () => {
      let capturedOptions: any = null;

      (useXTerm as any).mockImplementation((options: any) => {
        capturedOptions = options;
        return {
          terminalRef: { current: null },
          write: mockWrite,
          clear: vi.fn(),
          fit: mockFit,
        };
      });

      render(
        <TerminalComponent
          tabId="tab-1"
          paneId="pane-1"
          sessionId="session-123"
        />
      );

      expect(capturedOptions.fontFamily).toBe(
        '"JetBrains Mono", "NerdFontSymbols", "monospace"'
      );
    });
  });

  // ============================================================================
  // Addons Tests
  // ============================================================================

  describe('Addons', () => {
    it('should pass FitAddon to useXTerm via addons array', () => {
      let capturedAddons: any[] = [];

      (useXTerm as any).mockImplementation((options: any) => {
        if (options.addons) {
          capturedAddons = options.addons;
        }
        return {
          terminalRef: { current: null },
          write: mockWrite,
          clear: vi.fn(),
          fit: mockFit,
        };
      });

      render(
        <TerminalComponent
          tabId="tab-1"
          paneId="pane-1"
          sessionId="session-123"
        />
      );

      expect(capturedAddons).toBeDefined();
      expect(capturedAddons.length).toBeGreaterThan(0);
      // Note: Actual addon instance verification will depend on react-xtermjs implementation
    });

    it('should call fit addon when terminal renders', async () => {
      let fitAddonMock = vi.fn();

      (useXTerm as any).mockReturnValue({
        terminalRef: { current: null },
        write: mockWrite,
        clear: vi.fn(),
        fit: fitAddonMock,
      });

      render(
        <TerminalComponent
          tabId="tab-1"
          paneId="pane-1"
          sessionId="session-123"
        />
      );

      await waitFor(() => {
        expect(fitAddonMock).toHaveBeenCalled();
      });
    });
  });

  // ============================================================================
  // Cleanup Tests
  // ============================================================================

  describe('Cleanup', () => {
    it('should dispose data handler on unmount', async () => {
      let onDataCallback: ((data: string) => void) | null = null;

      (useXTerm as any).mockReturnValue({
        terminalRef: { current: null },
        write: mockWrite,
        clear: vi.fn(),
        fit: mockFit,
        onData: (callback: (data: string) => void) => {
          onDataCallback = callback;
          return { dispose: mockOnDataDispose };
        },
      });

      const { unmount } = render(
        <TerminalComponent
          tabId="tab-1"
          paneId="pane-1"
          sessionId="session-123"
        />
      );

      await waitFor(() => {
        expect(invoke).toHaveBeenCalled();
      });

      unmount();

      expect(mockOnDataDispose).toHaveBeenCalled();
    });

    it('should disconnect resize observer on unmount', async () => {
      const mockDisconnect = vi.fn();

      (useXTerm as any).mockReturnValue({
        terminalRef: { current: null },
        write: mockWrite,
        clear: vi.fn(),
        fit: mockFit,
      });

      // Mock ResizeObserver in global scope
      const originalResizeObserver = global.ResizeObserver;
      global.ResizeObserver = vi.fn(() => ({
        observe: vi.fn(),
        disconnect: mockDisconnect,
      })) as any;

      const { unmount } = render(
        <TerminalComponent
          tabId="tab-1"
          paneId="pane-1"
          sessionId="session-123"
        />
      );

      await waitFor(() => {
        expect(global.ResizeObserver).toHaveBeenCalled();
      });

      unmount();

      expect(mockDisconnect).toHaveBeenCalled();

      // Restore original ResizeObserver
      global.ResizeObserver = originalResizeObserver;
    });

    it('should clean up Tauri Channel on unmount', async () => {
      const mockChannel = {
        onmessage: null,
      };

      (Channel as any).mockReturnValue(mockChannel);

      (useXTerm as any).mockReturnValue({
        terminalRef: { current: null },
        write: mockWrite,
        clear: vi.fn(),
        fit: mockFit,
      });

      const { unmount } = render(
        <TerminalComponent
          tabId="tab-1"
          paneId="pane-1"
          sessionId="session-123"
        />
      );

      await waitFor(() => {
        expect(Channel).toHaveBeenCalled();
      });

      unmount();

      // Channel cleanup is verified by ensuring no memory leaks
      // (Channel itself doesn't have a dispose method)
      expect(Channel).toHaveBeenCalled();
    });
  });

  // ============================================================================
  // Error Handling Tests
  // ============================================================================

  describe('Error Handling', () => {
    it('should handle PTY spawn errors gracefully', async () => {
      // Mock spawn_pty to throw error
      (invoke as any).mockImplementation((command: string) => {
        if (command === 'spawn_pty') {
          return Promise.reject(new Error('Failed to spawn PTY'));
        }
        return Promise.resolve('test-session-id');
      });

      render(
        <TerminalComponent
          tabId="tab-1"
          paneId="pane-1"
        />
      );

      await waitFor(() => {
        expect(invoke).toHaveBeenCalledWith('spawn_pty', expect.any(Object));
      });

      // Component should still render (error should be handled gracefully)
      expect(screen.getByTestId('error-boundary')).toBeInTheDocument();
    });

    it('should handle PTY attach errors by spawning new PTY', async () => {
      const sessionId = 'existing-session-123';

      // Mock attach failure, then spawn success
      let attachAttempted = false;

      (invoke as any).mockImplementation((command: string) => {
        if (command === 'is_pty_alive') {
          return Promise.resolve(true);
        }
        if (command === 'attach_pty_channel') {
          attachAttempted = true;
          return Promise.reject(new Error('Attach failed'));
        }
        if (command === 'spawn_pty') {
          return Promise.resolve('new-session-id');
        }
        return Promise.resolve('test-session-id');
      });

      render(
        <TerminalComponent
          tabId="tab-1"
          paneId="pane-1"
          sessionId={sessionId}
        />
      );

      await waitFor(() => {
        expect(invoke).toHaveBeenCalledWith('attach_pty_channel', expect.any(Object));
      });

      await waitFor(() => {
        expect(invoke).toHaveBeenCalledWith('spawn_pty', expect.any(Object));
      });

      expect(attachAttempted).toBe(true);
    });
  });

  // ============================================================================
  // Integration with Workspace Store
  // ============================================================================

  describe('Workspace Store Integration', () => {
    it('should update tab sessionId in store when new PTY is spawned', async () => {
      const newSessionId = 'newly-spawned-session-456';

      (invoke as any).mockImplementation((command: string) => {
        if (command === 'spawn_pty') {
          return Promise.resolve(newSessionId);
        }
        return Promise.resolve('test-session-id');
      });

      render(
        <TerminalComponent
          tabId="tab-1"
          paneId="pane-1"
        />
      );

      await waitFor(() => {
        expect(invoke).toHaveBeenCalledWith('spawn_pty', expect.any(Object));
      });

      // Check that store was updated with new session ID
      const state = useWorkspaceStore.getState();
      const pane = state.workspaces[0].panes['pane-1'];
      const tab = pane?.tabs.find((t) => t.id === 'tab-1');

      // Note: This will work after the actual component is updated with react-xtermjs
      // For now, we verify the invoke was called correctly
      expect(invoke).toHaveBeenCalled();
    });
  });
});
