import { describe, it, expect, beforeEach, vi, beforeAll, afterAll } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
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

let capturedChannel: { onmessage: ((msg: unknown) => void) | null } | null = null;

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
  Channel: class {
    onmessage: ((msg: unknown) => void) | null = null;
    constructor() {
      capturedChannel = this;
    }
  },
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

vi.mock('../../lib/logger', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

const { invoke, Channel } = await import('@tauri-apps/api/core');
const { useXTerm } = await import('react-xtermjs');
const { sendNotification } = await import('@tauri-apps/plugin-notification');

describe('Terminal Component (react-xtermjs migration)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedChannel = null;

    const { resetState } = useWorkspaceStore.getState();
    if (resetState) {
      resetState();
    }

    (invoke as ReturnType<typeof vi.fn>).mockResolvedValue('test-session-id');
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

  describe('Channel Message Handling', () => {
    it('should handle output event with string data', async () => {
      const mockWrite = vi.fn();
      const mockTerm = { write: mockWrite, cols: 80, rows: 24 };

      (useXTerm as ReturnType<typeof vi.fn>).mockReturnValue({
        ref: { current: document.createElement('div') },
        instance: mockTerm,
      });

      render(
        <TerminalComponent
          tabId="tab-1"
          paneId="pane-1"
          sessionId="session-123"
        />
      );

      await waitFor(() => expect(capturedChannel).not.toBeNull());

      capturedChannel?.onmessage?.({ event: 'output', data: { data: 'hello world' } });

      await waitFor(() => expect(mockWrite).toHaveBeenCalledWith('hello world'));
    });

    it('should handle output event with non-string data', async () => {
      const mockWrite = vi.fn();
      const mockTerm = { write: mockWrite, cols: 80, rows: 24 };

      (useXTerm as ReturnType<typeof vi.fn>).mockReturnValue({
        ref: { current: document.createElement('div') },
        instance: mockTerm,
      });

      render(
        <TerminalComponent
          tabId="tab-1"
          paneId="pane-1"
          sessionId="session-123"
        />
      );

      await waitFor(() => expect(capturedChannel).not.toBeNull());

      capturedChannel?.onmessage?.({ event: 'output', data: { data: 12345 } });

      await waitFor(() => expect(mockWrite).toHaveBeenCalledWith('12345'));
    });

    it('should handle output event with direct data property', async () => {
      const mockWrite = vi.fn();
      const mockTerm = { write: mockWrite, cols: 80, rows: 24 };

      (useXTerm as ReturnType<typeof vi.fn>).mockReturnValue({
        ref: { current: document.createElement('div') },
        instance: mockTerm,
      });

      render(
        <TerminalComponent
          tabId="tab-1"
          paneId="pane-1"
          sessionId="session-123"
        />
      );

      await waitFor(() => expect(capturedChannel).not.toBeNull());

      capturedChannel?.onmessage?.({ event: 'output', data: 'direct data' });

      await waitFor(() => expect(mockWrite).toHaveBeenCalledWith('direct data'));
    });

    it('should handle notification event', async () => {
      const onNotification = vi.fn();
      const mockTerm = { write: vi.fn(), cols: 80, rows: 24 };

      (useXTerm as ReturnType<typeof vi.fn>).mockReturnValue({
        ref: { current: document.createElement('div') },
        instance: mockTerm,
      });

      render(
        <TerminalComponent
          tabId="tab-1"
          paneId="pane-1"
          sessionId="session-123"
          onNotification={onNotification}
        />
      );

      await waitFor(() => expect(capturedChannel).not.toBeNull());

      capturedChannel?.onmessage?.({ event: 'notification', data: { message: 'Test notification' } });

      await waitFor(() => {
        expect(onNotification).toHaveBeenCalledWith('Test notification');
        expect(sendNotification).toHaveBeenCalledWith({ title: 'Ymir', body: 'Test notification' });
      });
    });

    it('should handle notification event with non-string message', async () => {
      const onNotification = vi.fn();
      const mockTerm = { write: vi.fn(), cols: 80, rows: 24 };

      (useXTerm as ReturnType<typeof vi.fn>).mockReturnValue({
        ref: { current: document.createElement('div') },
        instance: mockTerm,
      });

      render(
        <TerminalComponent
          tabId="tab-1"
          paneId="pane-1"
          sessionId="session-123"
          onNotification={onNotification}
        />
      );

      await waitFor(() => expect(capturedChannel).not.toBeNull());

      capturedChannel?.onmessage?.({ event: 'notification', data: { message: 42 } });

      await waitFor(() => {
        expect(onNotification).toHaveBeenCalledWith('42');
        expect(sendNotification).toHaveBeenCalledWith({ title: 'Ymir', body: '42' });
      });
    });

    it('should handle exit event', async () => {
      const mockWrite = vi.fn();
      const mockTerm = { write: mockWrite, cols: 80, rows: 24 };

      (useXTerm as ReturnType<typeof vi.fn>).mockReturnValue({
        ref: { current: document.createElement('div') },
        instance: mockTerm,
      });

      render(
        <TerminalComponent
          tabId="tab-1"
          paneId="pane-1"
          sessionId="session-123"
        />
      );

      await waitFor(() => expect(capturedChannel).not.toBeNull());

      capturedChannel?.onmessage?.({ event: 'exit' });

      await waitFor(() => expect(mockWrite).toHaveBeenCalledWith('\r\n[Process exited]\r\n'));
    });

    it('should ignore invalid messages', async () => {
      const mockWrite = vi.fn();
      const mockTerm = { write: mockWrite, cols: 80, rows: 24 };

      (useXTerm as ReturnType<typeof vi.fn>).mockReturnValue({
        ref: { current: document.createElement('div') },
        instance: mockTerm,
      });

      render(
        <TerminalComponent
          tabId="tab-1"
          paneId="pane-1"
          sessionId="session-123"
        />
      );

      await waitFor(() => expect(capturedChannel).not.toBeNull());

      capturedChannel?.onmessage?.(null);
      capturedChannel?.onmessage?.('string message');
      capturedChannel?.onmessage?.(123);

      expect(mockWrite).not.toHaveBeenCalled();
    });

    it('should ignore unknown event types', async () => {
      const mockWrite = vi.fn();
      const mockTerm = { write: mockWrite, cols: 80, rows: 24 };

      (useXTerm as ReturnType<typeof vi.fn>).mockReturnValue({
        ref: { current: document.createElement('div') },
        instance: mockTerm,
      });

      render(
        <TerminalComponent
          tabId="tab-1"
          paneId="pane-1"
          sessionId="session-123"
        />
      );

      await waitFor(() => expect(capturedChannel).not.toBeNull());

      capturedChannel?.onmessage?.({ event: 'unknown_event', data: 'test' });

      expect(mockWrite).not.toHaveBeenCalled();
    });

    it('should skip output when data is undefined', async () => {
      const mockWrite = vi.fn();
      const mockTerm = { write: mockWrite, cols: 80, rows: 24 };

      (useXTerm as ReturnType<typeof vi.fn>).mockReturnValue({
        ref: { current: document.createElement('div') },
        instance: mockTerm,
      });

      render(
        <TerminalComponent
          tabId="tab-1"
          paneId="pane-1"
          sessionId="session-123"
        />
      );

      await waitFor(() => expect(capturedChannel).not.toBeNull());

      capturedChannel?.onmessage?.({ event: 'output', data: undefined });

      expect(mockWrite).not.toHaveBeenCalled();
    });

    it('should skip notification when data is undefined', async () => {
      const onNotification = vi.fn();
      const mockTerm = { write: vi.fn(), cols: 80, rows: 24 };

      (useXTerm as ReturnType<typeof vi.fn>).mockReturnValue({
        ref: { current: document.createElement('div') },
        instance: mockTerm,
      });

      render(
        <TerminalComponent
          tabId="tab-1"
          paneId="pane-1"
          sessionId="session-123"
          onNotification={onNotification}
        />
      );

      await waitFor(() => expect(capturedChannel).not.toBeNull());

      capturedChannel?.onmessage?.({ event: 'notification', data: undefined });

      expect(onNotification).not.toHaveBeenCalled();
      expect(sendNotification).not.toHaveBeenCalled();
    });
  });

  describe('Session Attach', () => {
    it('should attach to existing session when is_pty_alive returns true', async () => {
      const mockTerm = { write: vi.fn(), cols: 80, rows: 24 };

      (useXTerm as ReturnType<typeof vi.fn>).mockReturnValue({
        ref: { current: document.createElement('div') },
        instance: mockTerm,
      });

      (invoke as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(true)
        .mockResolvedValueOnce(undefined);

      render(
        <TerminalComponent
          tabId="tab-1"
          paneId="pane-1"
          sessionId="existing-session"
        />
      );

      await waitFor(() => {
        expect(invoke).toHaveBeenCalledWith('is_pty_alive', expect.objectContaining({
          sessionId: 'existing-session',
        }));
      });

      await waitFor(() => {
        expect(invoke).toHaveBeenCalledWith('attach_pty_channel', expect.objectContaining({
          sessionId: 'existing-session',
        }));
      });
    });

    it('should spawn new session when is_pty_alive returns false', async () => {
      const mockTerm = { write: vi.fn(), cols: 80, rows: 24 };

      (useXTerm as ReturnType<typeof vi.fn>).mockReturnValue({
        ref: { current: document.createElement('div') },
        instance: mockTerm,
      });

      (invoke as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(false)
        .mockResolvedValueOnce('new-session-id');

      render(
        <TerminalComponent
          tabId="tab-1"
          paneId="pane-1"
          sessionId="dead-session"
        />
      );

      await waitFor(() => {
        expect(invoke).toHaveBeenCalledWith('is_pty_alive', expect.anything());
      });

      await waitFor(() => {
        expect(invoke).toHaveBeenCalledWith('spawn_pty', expect.anything());
      });
    });

    it('should spawn new session when attach fails', async () => {
      const mockTerm = { write: vi.fn(), cols: 80, rows: 24 };

      (useXTerm as ReturnType<typeof vi.fn>).mockReturnValue({
        ref: { current: document.createElement('div') },
        instance: mockTerm,
      });

      (invoke as ReturnType<typeof vi.fn>)
        .mockRejectedValueOnce(new Error('Attach failed'))
        .mockResolvedValueOnce('fallback-session-id');

      render(
        <TerminalComponent
          tabId="tab-1"
          paneId="pane-1"
          sessionId="failing-session"
        />
      );

      await waitFor(() => {
        expect(invoke).toHaveBeenCalledWith('spawn_pty', expect.anything());
      });
    });
  });

  describe('PTY Spawn', () => {
    it('should handle spawn success', async () => {
      const mockTerm = { write: vi.fn(), cols: 80, rows: 24 };

      (useXTerm as ReturnType<typeof vi.fn>).mockReturnValue({
        ref: { current: document.createElement('div') },
        instance: mockTerm,
      });

      (invoke as ReturnType<typeof vi.fn>).mockResolvedValue('spawned-session-id');

      render(
        <TerminalComponent
          tabId="tab-1"
          paneId="pane-1"
        />
      );

      await waitFor(() => {
        expect(invoke).toHaveBeenCalledWith('spawn_pty', expect.anything());
      });
    });

    it('should handle spawn failure', async () => {
      const mockWrite = vi.fn();
      const mockTerm = { write: mockWrite, cols: 80, rows: 24 };

      (useXTerm as ReturnType<typeof vi.fn>).mockReturnValue({
        ref: { current: document.createElement('div') },
        instance: mockTerm,
      });

      (invoke as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Spawn failed'));

      render(
        <TerminalComponent
          tabId="tab-1"
          paneId="pane-1"
        />
      );

      await waitFor(() => {
        expect(mockWrite).toHaveBeenCalledWith('\r\n[Error: Failed to spawn PTY]\r\n');
      });
    });
  });

  describe('PTY Resize', () => {
    it('should resize PTY when ready', async () => {
      const mockTerm = { write: vi.fn(), cols: 100, rows: 30 };

      (useXTerm as ReturnType<typeof vi.fn>).mockReturnValue({
        ref: { current: document.createElement('div') },
        instance: mockTerm,
      });

      (invoke as ReturnType<typeof vi.fn>).mockResolvedValue('session-id');

      render(
        <TerminalComponent
          tabId="tab-1"
          paneId="pane-1"
          sessionId="session-123"
        />
      );

      await waitFor(() => {
        expect(invoke).toHaveBeenCalledWith('resize_pty', expect.objectContaining({
          sessionId: 'session-123',
          cols: 100,
          rows: 30,
        }));
      });
    });
  });

  describe('Scroll Zoom', () => {
    it('should zoom in on ctrl+scroll up', async () => {
      const zoomIn = vi.fn();
      const zoomOut = vi.fn();

      useWorkspaceStore.setState({ zoomIn, zoomOut, fontSize: 14 });

      const div = document.createElement('div');
      const mockTerm = { write: vi.fn(), cols: 80, rows: 24 };

      (useXTerm as ReturnType<typeof vi.fn>).mockReturnValue({
        ref: { current: div },
        instance: mockTerm,
      });

      const { container } = render(
        <TerminalComponent
          tabId="tab-1"
          paneId="pane-1"
          sessionId="session-123"
        />
      );

      const element = container.querySelector('[style*="background-color"]');
      element?.dispatchEvent(new WheelEvent('wheel', {
        deltaY: -100,
        ctrlKey: true,
        bubbles: true,
      }));

      await waitFor(() => expect(zoomIn).toHaveBeenCalled());
      expect(zoomOut).not.toHaveBeenCalled();
    });

    it('should zoom out on ctrl+scroll down', async () => {
      const zoomIn = vi.fn();
      const zoomOut = vi.fn();

      useWorkspaceStore.setState({ zoomIn, zoomOut, fontSize: 14 });

      const div = document.createElement('div');
      const mockTerm = { write: vi.fn(), cols: 80, rows: 24 };

      (useXTerm as ReturnType<typeof vi.fn>).mockReturnValue({
        ref: { current: div },
        instance: mockTerm,
      });

      const { container } = render(
        <TerminalComponent
          tabId="tab-1"
          paneId="pane-1"
          sessionId="session-123"
        />
      );

      const element = container.querySelector('[style*="background-color"]');
      element?.dispatchEvent(new WheelEvent('wheel', {
        deltaY: 100,
        ctrlKey: true,
        bubbles: true,
      }));

      await waitFor(() => expect(zoomOut).toHaveBeenCalled());
      expect(zoomIn).not.toHaveBeenCalled();
    });

    it('should zoom with metaKey modifier', async () => {
      const zoomIn = vi.fn();
      const zoomOut = vi.fn();

      useWorkspaceStore.setState({ zoomIn, zoomOut, fontSize: 14 });

      const div = document.createElement('div');
      const mockTerm = { write: vi.fn(), cols: 80, rows: 24 };

      (useXTerm as ReturnType<typeof vi.fn>).mockReturnValue({
        ref: { current: div },
        instance: mockTerm,
      });

      const { container } = render(
        <TerminalComponent
          tabId="tab-1"
          paneId="pane-1"
          sessionId="session-123"
        />
      );

      const element = container.querySelector('[style*="background-color"]');
      element?.dispatchEvent(new WheelEvent('wheel', {
        deltaY: -100,
        metaKey: true,
        bubbles: true,
      }));

      await waitFor(() => expect(zoomIn).toHaveBeenCalled());
    });

    it('should not zoom without ctrl or meta key', async () => {
      const zoomIn = vi.fn();
      const zoomOut = vi.fn();

      useWorkspaceStore.setState({ zoomIn, zoomOut, fontSize: 14 });

      const div = document.createElement('div');
      const mockTerm = { write: vi.fn(), cols: 80, rows: 24 };

      (useXTerm as ReturnType<typeof vi.fn>).mockReturnValue({
        ref: { current: div },
        instance: mockTerm,
      });

      const { container } = render(
        <TerminalComponent
          tabId="tab-1"
          paneId="pane-1"
          sessionId="session-123"
        />
      );

      const element = container.querySelector('[style*="background-color"]');
      element?.dispatchEvent(new WheelEvent('wheel', {
        deltaY: -100,
        ctrlKey: false,
        metaKey: false,
        bubbles: true,
      }));

      expect(zoomIn).not.toHaveBeenCalled();
      expect(zoomOut).not.toHaveBeenCalled();
    });

    it('should handle multiple zoom in events', async () => {
      const zoomIn = vi.fn();
      const zoomOut = vi.fn();

      useWorkspaceStore.setState({ zoomIn, zoomOut, fontSize: 14 });

      const div = document.createElement('div');
      const mockTerm = { write: vi.fn(), cols: 80, rows: 24 };

      (useXTerm as ReturnType<typeof vi.fn>).mockReturnValue({
        ref: { current: div },
        instance: mockTerm,
      });

      const { container } = render(
        <TerminalComponent
          tabId="tab-1"
          paneId="pane-1"
          sessionId="session-123"
        />
      );

      const element = container.querySelector('[style*="background-color"]');

      element?.dispatchEvent(new WheelEvent('wheel', {
        deltaY: -100,
        ctrlKey: true,
        bubbles: true,
      }));

      element?.dispatchEvent(new WheelEvent('wheel', {
        deltaY: -50,
        ctrlKey: true,
        bubbles: true,
      }));

      await waitFor(() => expect(zoomIn).toHaveBeenCalledTimes(2));
      expect(zoomOut).not.toHaveBeenCalled();
    });

    it('should handle multiple zoom out events', async () => {
      const zoomIn = vi.fn();
      const zoomOut = vi.fn();

      useWorkspaceStore.setState({ zoomIn, zoomOut, fontSize: 14 });

      const div = document.createElement('div');
      const mockTerm = { write: vi.fn(), cols: 80, rows: 24 };

      (useXTerm as ReturnType<typeof vi.fn>).mockReturnValue({
        ref: { current: div },
        instance: mockTerm,
      });

      const { container } = render(
        <TerminalComponent
          tabId="tab-1"
          paneId="pane-1"
          sessionId="session-123"
        />
      );

      const element = container.querySelector('[style*="background-color"]');

      element?.dispatchEvent(new WheelEvent('wheel', {
        deltaY: 100,
        ctrlKey: true,
        bubbles: true,
      }));

      element?.dispatchEvent(new WheelEvent('wheel', {
        deltaY: 200,
        ctrlKey: true,
        bubbles: true,
      }));

      await waitFor(() => expect(zoomOut).toHaveBeenCalledTimes(2));
      expect(zoomIn).not.toHaveBeenCalled();
    });

    it('should handle alternating zoom in and out events', async () => {
      const zoomIn = vi.fn();
      const zoomOut = vi.fn();

      useWorkspaceStore.setState({ zoomIn, zoomOut, fontSize: 14 });

      const div = document.createElement('div');
      const mockTerm = { write: vi.fn(), cols: 80, rows: 24 };

      (useXTerm as ReturnType<typeof vi.fn>).mockReturnValue({
        ref: { current: div },
        instance: mockTerm,
      });

      const { container } = render(
        <TerminalComponent
          tabId="tab-1"
          paneId="pane-1"
          sessionId="session-123"
        />
      );

      const element = container.querySelector('[style*="background-color"]');

      element?.dispatchEvent(new WheelEvent('wheel', {
        deltaY: -100,
        ctrlKey: true,
        bubbles: true,
      }));

      element?.dispatchEvent(new WheelEvent('wheel', {
        deltaY: 100,
        ctrlKey: true,
        bubbles: true,
      }));

      element?.dispatchEvent(new WheelEvent('wheel', {
        deltaY: -50,
        ctrlKey: true,
        bubbles: true,
      }));

      await waitFor(() => {
        expect(zoomIn).toHaveBeenCalledTimes(2);
        expect(zoomOut).toHaveBeenCalledTimes(1);
      });
    });

    it('should handle meta key for zoom in', async () => {
      const zoomIn = vi.fn();
      const zoomOut = vi.fn();

      useWorkspaceStore.setState({ zoomIn, zoomOut, fontSize: 14 });

      const div = document.createElement('div');
      const mockTerm = { write: vi.fn(), cols: 80, rows: 24 };

      (useXTerm as ReturnType<typeof vi.fn>).mockReturnValue({
        ref: { current: div },
        instance: mockTerm,
      });

      const { container } = render(
        <TerminalComponent
          tabId="tab-1"
          paneId="pane-1"
          sessionId="session-123"
        />
      );

      const element = container.querySelector('[style*="background-color"]');
      element?.dispatchEvent(new WheelEvent('wheel', {
        deltaY: -100,
        metaKey: true,
        bubbles: true,
      }));

      await waitFor(() => expect(zoomIn).toHaveBeenCalled());
      expect(zoomOut).not.toHaveBeenCalled();
    });

    it('should handle meta key for zoom out', async () => {
      const zoomIn = vi.fn();
      const zoomOut = vi.fn();

      useWorkspaceStore.setState({ zoomIn, zoomOut, fontSize: 14 });

      const div = document.createElement('div');
      const mockTerm = { write: vi.fn(), cols: 80, rows: 24 };

      (useXTerm as ReturnType<typeof vi.fn>).mockReturnValue({
        ref: { current: div },
        instance: mockTerm,
      });

      const { container } = render(
        <TerminalComponent
          tabId="tab-1"
          paneId="pane-1"
          sessionId="session-123"
        />
      );

      const element = container.querySelector('[style*="background-color"]');
      element?.dispatchEvent(new WheelEvent('wheel', {
        deltaY: 100,
        metaKey: true,
        bubbles: true,
      }));

      await waitFor(() => expect(zoomOut).toHaveBeenCalled());
      expect(zoomIn).not.toHaveBeenCalled();
    });

    it('should cleanup wheel event listener on unmount', async () => {
      const zoomIn = vi.fn();
      const zoomOut = vi.fn();

      useWorkspaceStore.setState({ zoomIn, zoomOut, fontSize: 14 });

      const div = document.createElement('div');
      const mockTerm = { write: vi.fn(), cols: 80, rows: 24 };

      (useXTerm as ReturnType<typeof vi.fn>).mockReturnValue({
        ref: { current: div },
        instance: mockTerm,
      });

      const { container, unmount } = render(
        <TerminalComponent
          tabId="tab-1"
          paneId="pane-1"
          sessionId="session-123"
        />
      );

      const element = container.querySelector('[style*="background-color"]');

      element?.dispatchEvent(new WheelEvent('wheel', {
        deltaY: -100,
        ctrlKey: true,
        bubbles: true,
      }));

      await waitFor(() => expect(zoomIn).toHaveBeenCalled());

      unmount();

      element?.dispatchEvent(new WheelEvent('wheel', {
        deltaY: 100,
        ctrlKey: true,
        bubbles: true,
      }));

      expect(zoomIn).toHaveBeenCalledTimes(1);
      expect(zoomOut).not.toHaveBeenCalled();
    });
  });
});
