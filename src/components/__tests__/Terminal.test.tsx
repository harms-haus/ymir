import { describe, it, expect, beforeEach, beforeAll, afterAll, vi } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import type React from 'react';
import { Terminal as TerminalComponent } from '../Terminal';
import useWorkspaceStore from '../../state/workspace';

const originalResizeObserver = globalThis.ResizeObserver;

type MockResizeObserverInstance = {
  trigger: () => void;
  observe: ReturnType<typeof vi.fn>;
  disconnect: ReturnType<typeof vi.fn>;
};

const resizeObserverInstances: MockResizeObserverInstance[] = [];

class MockResizeObserver {
  private callback: ResizeObserverCallback;
  observe = vi.fn();
  disconnect = vi.fn();

  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
    resizeObserverInstances.push({
      trigger: () => this.callback([], this as unknown as ResizeObserver),
      observe: this.observe,
      disconnect: this.disconnect,
    });
  }
}

type WebSocketListener = (message: unknown) => void;
const hoisted = vi.hoisted(() => {
  const websocketListeners: WebSocketListener[] = [];
  const requestMock = vi.fn();
  const connectMock = vi.fn();
  const isConnectedMock = vi.fn();
  const onMessageMock = vi.fn((listener: WebSocketListener) => {
    websocketListeners.push(listener);
    return () => {
      const index = websocketListeners.indexOf(listener);
      if (index >= 0) {
        websocketListeners.splice(index, 1);
      }
    };
  });

  const sendNotificationMock = vi.fn();

  return {
    websocketListeners,
    requestMock,
    connectMock,
    isConnectedMock,
    onMessageMock,
    sendNotificationMock,
    terminalInstances: [] as MockGhosttyTerminal[],
  };
});

const websocketServiceMock = {
  connect: hoisted.connectMock,
  isConnected: hoisted.isConnectedMock,
  request: hoisted.requestMock,
  onMessage: hoisted.onMessageMock,
};

vi.mock('../../services/websocket', () => ({
  getWebSocketService: () => websocketServiceMock,
}));

vi.mock('@tauri-apps/plugin-notification', () => ({
  sendNotification: hoisted.sendNotificationMock,
}));

class MockGhosttyTerminal {
  open = vi.fn();
  write = vi.fn();
  dispose = vi.fn();
  loadAddon = vi.fn();
  cols = 80;
  rows = 24;

  private dataHandler: ((data: string) => void) | null = null;
  private titleHandler: ((title: string) => void) | null = null;

  onData = vi.fn((handler: (data: string) => void) => {
    this.dataHandler = handler;
    return { dispose: vi.fn() };
  });

  onTitleChange = vi.fn((handler: (title: string) => void) => {
    this.titleHandler = handler;
    return { dispose: vi.fn() };
  });

  emitData(data: string) {
    this.dataHandler?.(data);
  }

  emitTitle(title: string) {
    this.titleHandler?.(title);
  }
}

vi.mock('ghostty-web', () => ({
  Terminal: class {
    open = vi.fn();
    write = vi.fn();
    dispose = vi.fn();
    loadAddon = vi.fn();
    cols = 80;
    rows = 24;
    private dataHandler: ((data: string) => void) | null = null;
    private titleHandler: ((title: string) => void) | null = null;

    constructor() {
      const instance = this as unknown as MockGhosttyTerminal;
      hoisted.terminalInstances.push(instance);
    }

    onData = vi.fn((handler: (data: string) => void) => {
      this.dataHandler = handler;
      return { dispose: vi.fn() };
    });

    onTitleChange = vi.fn((handler: (title: string) => void) => {
      this.titleHandler = handler;
      return { dispose: vi.fn() };
    });

    emitData(data: string) {
      this.dataHandler?.(data);
    }

    emitTitle(title: string) {
      this.titleHandler?.(title);
    }
  },
  FitAddon: class {
    fit = vi.fn();
  },
}));

vi.mock('../ErrorBoundary', () => ({
  ErrorBoundary: ({ children }: { children: React.ReactNode }) => <div data-testid="error-boundary">{children}</div>,
}));

vi.mock('../../lib/logger', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

function setupRequestDefaults() {
  hoisted.connectMock.mockResolvedValue(undefined);
  hoisted.isConnectedMock.mockReturnValue(false);

  hoisted.requestMock.mockImplementation((method: string) => {
    if (method === 'pty.connect') {
      return Promise.resolve({ connected: true, tabId: 'tab-1' });
    }

    if (method === 'tab.list') {
      return Promise.resolve({ tabs: [] });
    }

    if (method === 'pty.write' || method === 'pty.resize') {
      return Promise.resolve({});
    }

    return Promise.resolve({});
  });
}

describe('Terminal WebSocket adapter', () => {
  beforeAll(() => {
    globalThis.ResizeObserver = MockResizeObserver as unknown as typeof ResizeObserver;
  });

  afterAll(() => {
    globalThis.ResizeObserver = originalResizeObserver;
  });

  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.websocketListeners.length = 0;
    resizeObserverInstances.length = 0;
    hoisted.terminalInstances.length = 0;
    setupRequestDefaults();

    const { resetState } = useWorkspaceStore.getState();
    resetState?.();
  });

  it('connects to PTY and loads tab scrollback over WebSocket', async () => {
    hoisted.requestMock.mockImplementation((method: string) => {
      if (method === 'pty.connect') {
        return Promise.resolve({ connected: true, tabId: 'tab-1' });
      }

      if (method === 'tab.list') {
        return Promise.resolve({
          tabs: [{ id: 'tab-1', scrollback: [{ text: 'line 1' }, { text: 'line 2' }] }],
        });
      }

      return Promise.resolve({});
    });

    render(<TerminalComponent tabId="tab-1" paneId="pane-1" />);

    expect(screen.getByTestId('error-boundary')).toBeInTheDocument();

    await waitFor(() => {
      expect(hoisted.connectMock).toHaveBeenCalledWith('ws://127.0.0.1:7139/ws');
      expect(hoisted.requestMock).toHaveBeenCalledWith('pty.connect', { tabId: 'tab-1' });
      expect(hoisted.requestMock).toHaveBeenCalledWith('tab.list', { paneId: 'pane-1' });
    });

    expect(hoisted.terminalInstances[0]?.write).toHaveBeenCalledWith('line 1\r\nline 2\r\n');
  });

  it('uses sessionId as PTY target when provided', async () => {
    render(<TerminalComponent tabId="tab-1" paneId="pane-1" sessionId="session-123" />);

    await waitFor(() => {
      expect(hoisted.connectMock).toHaveBeenCalledWith('ws://127.0.0.1:7139/ws');
      expect(hoisted.requestMock).toHaveBeenCalledWith('pty.connect', { tabId: 'session-123' });
    });
  });

  it('does not reconnect when transport is already connected', async () => {
    hoisted.isConnectedMock.mockReturnValue(true);

    render(<TerminalComponent tabId="tab-1" paneId="pane-1" />);

    await waitFor(() => {
      expect(hoisted.requestMock).toHaveBeenCalledWith('pty.connect', { tabId: 'tab-1' });
    });

    expect(hoisted.connectMock).not.toHaveBeenCalled();
  });

  it('forwards terminal input through pty.write', async () => {
    render(<TerminalComponent tabId="tab-1" paneId="pane-1" />);

    await waitFor(() => {
      expect(hoisted.requestMock).toHaveBeenCalledWith('pty.connect', { tabId: 'tab-1' });
    });

    hoisted.terminalInstances[0]?.emitData('echo hello\n');

    await waitFor(() => {
      expect(hoisted.requestMock).toHaveBeenCalledWith('pty.write', {
        tabId: 'tab-1',
        data: 'echo hello\n',
      });
    });
  });

  it('streams PTY output notifications for the active tab', async () => {
    render(<TerminalComponent tabId="tab-1" paneId="pane-1" />);

    await waitFor(() => {
      expect(hoisted.websocketListeners.length).toBeGreaterThan(0);
    });

    act(() => {
      hoisted.websocketListeners[0]?.({
        jsonrpc: '2.0',
        method: 'pty.output',
        params: {
          type: 'output',
          tabId: 'tab-1',
          data: 'hello from pty',
        },
      });
    });

    expect(hoisted.terminalInstances[0]?.write).toHaveBeenCalledWith('hello from pty');
  });

  it('handles PTY notification payloads and desktop notifications', async () => {
    const onNotification = vi.fn();
    render(<TerminalComponent tabId="tab-1" paneId="pane-1" onNotification={onNotification} />);

    await waitFor(() => {
      expect(hoisted.websocketListeners.length).toBeGreaterThan(0);
    });

    act(() => {
      hoisted.websocketListeners[0]?.({
        jsonrpc: '2.0',
        method: 'pty.output',
        params: {
          type: 'notification',
          tabId: 'tab-1',
          message: 'Build finished',
        },
      });
    });

    expect(onNotification).toHaveBeenCalledWith('Build finished');
    expect(hoisted.sendNotificationMock).toHaveBeenCalledWith({ title: 'Ymir', body: 'Build finished' });
  });

  it('ignores PTY output notifications for other tabs', async () => {
    render(<TerminalComponent tabId="tab-1" paneId="pane-1" />);

    await waitFor(() => {
      expect(hoisted.websocketListeners.length).toBeGreaterThan(0);
    });

    act(() => {
      hoisted.websocketListeners[0]?.({
        jsonrpc: '2.0',
        method: 'pty.output',
        params: {
          type: 'output',
          tabId: 'tab-2',
          data: 'should be ignored',
        },
      });
    });

    expect(hoisted.terminalInstances[0]?.write).not.toHaveBeenCalledWith('should be ignored');
  });

  it('sends debounced resize through pty.resize', async () => {
    const { container } = render(<TerminalComponent tabId="tab-1" paneId="pane-1" />);

    await waitFor(() => {
      expect(hoisted.requestMock).toHaveBeenCalledWith('pty.connect', { tabId: 'tab-1' });
      expect(resizeObserverInstances.length).toBeGreaterThan(0);
    });

    await waitFor(() => {
      expect(container.querySelector('[style*="opacity: 1"]')).not.toBeNull();
    });

    act(() => {
      resizeObserverInstances[resizeObserverInstances.length - 1]?.trigger();
    });

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 120));
    });

    expect(hoisted.requestMock).toHaveBeenCalledWith('pty.resize', {
      tabId: 'tab-1',
      cols: 80,
      rows: 24,
    });
  });
});
