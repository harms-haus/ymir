import { describe, it, expect, beforeEach, vi, beforeAll, afterAll } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { Terminal as TerminalComponent } from '../Terminal';
import useWorkspaceStore from '../../state/workspace';

const originalResizeObserver = globalThis.ResizeObserver;

class MockResizeObserver {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
}

beforeAll(() => {
  globalThis.ResizeObserver = MockResizeObserver as unknown as typeof ResizeObserver;
});

afterAll(() => {
  globalThis.ResizeObserver = originalResizeObserver;
});

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
  Channel: vi.fn(() => ({
    onmessage: null,
  })),
}));

vi.mock('@tauri-apps/plugin-notification', () => ({
  sendNotification: vi.fn(),
}));

vi.mock('react-xtermjs', () => ({
  useXTerm: vi.fn(() => ({
    ref: { current: null },
    instance: null,
  })),
}));

vi.mock('@xterm/xterm/css/xterm.css', () => ({}));

vi.mock('../ErrorBoundary', () => ({
  ErrorBoundary: ({ children }: { children: React.ReactNode }) => <div data-testid="error-boundary">{children}</div>
}));

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

describe('Terminal Component (react-xtermjs migration)', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    const { resetState } = useWorkspaceStore.getState();
    if (resetState) {
      resetState();
    }

    (useXTerm as ReturnType<typeof vi.fn>).mockReturnValue({
      ref: { current: null },
      instance: null,
    });

    (invoke as ReturnType<typeof vi.fn>).mockResolvedValue('test-session-id');
    (Channel as ReturnType<typeof vi.fn>).mockImplementation(() => ({
      onmessage: null,
    }));
  });

  describe('Rendering', () => {
    it('should render without errors', () => {
      render(
        <TerminalComponent
          tabId="tab-1"
          paneId="pane-1"
          sessionId="session-123"
        />
      );

      expect(screen.getByTestId('error-boundary')).toBeInTheDocument();
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

    it('should render without sessionId prop', () => {
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

  describe('useXTerm Hook Options', () => {
    it('should pass terminal theme to useXTerm', () => {
      let capturedOptions: { options?: object } = {};

      (useXTerm as ReturnType<typeof vi.fn>).mockImplementation((opts: object) => {
        capturedOptions = opts;
        return {
          ref: { current: null },
          instance: null,
        };
      });

      render(
        <TerminalComponent
          tabId="tab-1"
          paneId="pane-1"
          sessionId="session-123"
        />
      );

      expect(capturedOptions.options).toBeDefined();
      const options = capturedOptions.options as {
        background?: string;
        cursorBlink?: boolean;
        fontSize?: number;
      };
      expect(options.background).toBe('#1e1e1e');
      expect(options.cursorBlink).toBe(true);
      expect(options.fontSize).toBe(14);
    });

    it('should pass FitAddon in addons array', () => {
      let capturedOptions: { addons?: unknown[] } = {};

      (useXTerm as ReturnType<typeof vi.fn>).mockImplementation((opts: object) => {
        capturedOptions = opts;
        return {
          ref: { current: null },
          instance: null,
        };
      });

      render(
        <TerminalComponent
          tabId="tab-1"
          paneId="pane-1"
          sessionId="session-123"
        />
      );

      expect(capturedOptions.addons).toBeDefined();
      expect(capturedOptions.addons?.length).toBeGreaterThan(0);
    });

    it('should set up onData listener for write_pty', () => {
      let capturedOptions: { listeners?: { onData?: (data: string) => void } } = {};

      (useXTerm as ReturnType<typeof vi.fn>).mockImplementation((opts: object) => {
        capturedOptions = opts;
        return {
          ref: { current: null },
          instance: null,
        };
      });

      render(
        <TerminalComponent
          tabId="tab-1"
          paneId="pane-1"
          sessionId="session-123"
        />
      );

      expect(capturedOptions.listeners?.onData).toBeDefined();
    });
  });

  describe('Cleanup', () => {
    it('should disconnect resize observer on unmount', async () => {
      const mockDisconnect = vi.fn();

      class TestResizeObserver {
        observe = vi.fn();
        unobserve = vi.fn();
        disconnect = mockDisconnect;
      }

      const originalRO = globalThis.ResizeObserver;
      globalThis.ResizeObserver = TestResizeObserver as unknown as typeof ResizeObserver;

      (useXTerm as ReturnType<typeof vi.fn>).mockReturnValue({
        ref: { current: null },
        instance: null,
      });

      const { unmount } = render(
        <TerminalComponent
          tabId="tab-1"
          paneId="pane-1"
          sessionId="session-123"
        />
      );

      unmount();

      expect(mockDisconnect).toHaveBeenCalled();

      globalThis.ResizeObserver = originalRO;
    });
  });
});
