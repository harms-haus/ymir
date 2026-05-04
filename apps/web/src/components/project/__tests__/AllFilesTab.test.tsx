import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { AllFilesTab } from '../AllFilesTab';
import { getWebSocketClient, resetWebSocketClient } from '../../../lib/ws';
import { useStore } from '../../../store';

// ---- Minimal WebSocket mock infrastructure ----
let currentMockWebSocket: any = null;

function createMockWebSocket() {
  return {
    readyState: 0,
    send: vi.fn(),
    close: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    onopen: undefined as any,
    onclose: undefined as any,
    onmessage: undefined as any,
    onerror: undefined as any,
  };
}

function callOpenHandler() {
  if (currentMockWebSocket?.onopen) currentMockWebSocket.onopen();
}

function callMessageHandler(event: MessageEvent) {
  if (currentMockWebSocket?.onmessage) currentMockWebSocket.onmessage(event);
}

const wsMock = vi.fn(function WebSocketMock(this: any, _url: string) {
  currentMockWebSocket = createMockWebSocket();
  return currentMockWebSocket;
});

// Only set the mock once
if (!(globalThis as any).__WS_MOCK_SET) {
  globalThis.WebSocket = wsMock as any;
  (globalThis.WebSocket as any).CONNECTING = 0;
  (globalThis.WebSocket as any).OPEN = 1;
  (globalThis.WebSocket as any).CLOSING = 2;
  (globalThis.WebSocket as any).CLOSED = 3;
  (globalThis as any).__WS_MOCK_SET = true;
}

// Helper to encode a message as binary (matches YmirClient encoding)
function encodeMessage(msg: Record<string, unknown>): ArrayBuffer {
  const json = JSON.stringify(msg);
  const encoder = new TextEncoder();
  return encoder.encode(json).buffer as ArrayBuffer;
}

function resetStore() {
  useStore.setState({
    workspaces: [],
    worktrees: [],
    agentSessions: [],
    terminalTabs: [],
    notifications: [],
    activeWorktreeId: null,
    connectionStatus: 'closed',
    connectionError: null,
    lastPongTimestamp: 0,
    expandedWorkspaceIds: new Set(),
    isWorkspacesLoading: true,
    agentTabs: new Map(),
    activeAgentTabId: new Map(),
    fileListCache: new Map(),
    gitStatusCache: new Map(),
  });
}

describe('AllFilesTab — error handling', () => {
  const TEST_WORKTREE_ID = 'test-worktree-1';
  const TEST_WORKSPACE_ID = 'test-workspace-1';

  beforeEach(() => {
    resetWebSocketClient();
    vi.clearAllMocks();
    vi.useFakeTimers();
    resetStore();

    // Set up a worktree so AllFilesTab has an active worktree
    useStore.setState({
      workspaces: [{
        id: TEST_WORKSPACE_ID,
        name: 'Test Workspace',
        rootPath: '/test',
        createdAt: 1,
        updatedAt: 1,
      }],
      worktrees: [{
        id: TEST_WORKTREE_ID,
        workspaceId: TEST_WORKSPACE_ID,
        branchName: 'main',
        path: '/test',
        status: 'active',
        isMain: true,
        createdAt: 1,
      }],
      activeWorktreeId: TEST_WORKTREE_ID,
      connectionStatus: 'open',
    });

    // Create client and simulate connection
    getWebSocketClient();
    Object.defineProperty(currentMockWebSocket, 'readyState', {
      value: 1,
      writable: true,
    });
    callOpenHandler();
    vi.runAllTimers();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('ErrorResponse handling', () => {
    it('shows error UI with message when ErrorResponse is received', async () => {
      render(<AllFilesTab />);

      // Initially loading
      expect(screen.getByText(/loading/i)).toBeInTheDocument();

      // Simulate an error response from the server
      const errorMsg = {
        type: 'Error',
        code: 'FILE_LIST_ERROR',
        message: 'Failed to list directory: No such file or directory (path=/nonexistent)',
        details: null,
      };

      callMessageHandler({ data: encodeMessage(errorMsg) } as MessageEvent);

      await waitFor(() => {
        expect(screen.getByText('Failed to load files')).toBeInTheDocument();
        expect(screen.getByText(/Failed to list directory/)).toBeInTheDocument();
      });
    });

    it('shows a Retry button in the error UI', async () => {
      render(<AllFilesTab />);

      // Simulate an error response
      const errorMsg = {
        type: 'Error',
        code: 'FILE_LIST_ERROR',
        message: 'Directory access denied',
        details: null,
      };

      callMessageHandler({ data: encodeMessage(errorMsg) } as MessageEvent);

      await waitFor(() => {
        expect(screen.getByText('Retry')).toBeInTheDocument();
      });
    });

    it('re-sends FileList request when Retry button is clicked', async () => {
      render(<AllFilesTab />);

      // Simulate an error response
      const errorMsg = {
        type: 'Error',
        code: 'FILE_LIST_ERROR',
        message: 'Failed to list directory',
        details: null,
      };

      callMessageHandler({ data: encodeMessage(errorMsg) } as MessageEvent);

      await waitFor(() => {
        expect(screen.getByText('Retry')).toBeInTheDocument();
      });

      // Clear the send mock to count retries
      currentMockWebSocket.send.mockClear();

      // Click retry
      fireEvent.click(screen.getByText('Retry'));

      // Should have sent a FileList message
      await waitFor(() => {
        expect(currentMockWebSocket.send).toHaveBeenCalled();
        const lastCall =
          currentMockWebSocket.send.mock.calls[
            currentMockWebSocket.send.mock.calls.length - 1
          ];
        const sent = JSON.parse(new TextDecoder().decode(lastCall[0]));
        expect(sent.type).toBe('FileList');
        expect(sent.worktreeId).toBe(TEST_WORKTREE_ID);
      });
    });

    it('clears error and shows files when FileListResult arrives after error', async () => {
      render(<AllFilesTab />);

      // First, receive an error
      const errorMsg = {
        type: 'Error',
        code: 'FILE_LIST_ERROR',
        message: 'Temporary error',
        details: null,
      };
      callMessageHandler({ data: encodeMessage(errorMsg) } as MessageEvent);

      await waitFor(() => {
        expect(screen.getByText('Failed to load files')).toBeInTheDocument();
      });

      // Then receive a successful FileListResult
      const fileListResult = {
        type: 'FileListResult',
        worktreeId: TEST_WORKTREE_ID,
        files: ['src/', 'Cargo.toml', 'README.md'],
        path: null,
      };
      callMessageHandler({
        data: encodeMessage(fileListResult),
      } as MessageEvent);

      await waitFor(() => {
        expect(screen.queryByText('Failed to load files')).not.toBeInTheDocument();
        expect(screen.queryByText('Retry')).not.toBeInTheDocument();
        expect(screen.queryByText(/loading/i)).not.toBeInTheDocument();
      });
    });

    it('clears loading state on ErrorResponse', async () => {
      render(<AllFilesTab />);

      // Should be in loading state initially
      expect(screen.getByText(/loading/i)).toBeInTheDocument();

      // Simulate an error response
      const errorMsg = {
        type: 'Error',
        code: 'WORKTREE_NOT_FOUND',
        message: 'Worktree not found',
        details: null,
      };
      callMessageHandler({ data: encodeMessage(errorMsg) } as MessageEvent);

      // Loading should be cleared and error shown
      await waitFor(() => {
        expect(screen.queryByText(/loading/i)).not.toBeInTheDocument();
        expect(screen.getByText('Failed to load files')).toBeInTheDocument();
      });
    });
  });
});
