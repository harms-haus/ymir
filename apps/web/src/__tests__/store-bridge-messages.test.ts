import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import type { DecodedBridgeMessage } from '../lib/bridge-transport';
import type { BridgeMessage } from '../types/bridge-envelope';
// --- Mock external dependencies before importing store ---

vi.mock('../lib/error-recovery', () => ({
  handleError: vi.fn(),
}));

vi.mock('../lib/tauri', () => ({
  showNotification: vi.fn(),
}));

vi.mock('../lib/bridge-transport', async (importOriginal) => {
  const original = await importOriginal<typeof import('../lib/bridge-transport')>();
  return {
    ...original,
    encodePong: vi.fn(() => ({
      version: 1,
      seq: 1,
      timestamp_ms: 1234567890,
      extra_data: null,
      type: 'pong',
      payload: { timestamp: 1234567890 },
    })),
  };
});

vi.mock('../uiStore', () => ({
  useUIStore: {
    getState: vi.fn(() => ({
      setActiveWorktreeId: vi.fn(),
      toggleExpandedWorkspaceId: vi.fn(),
      setActiveAgentTabId: vi.fn(),
    })),
  },
}));

vi.mock('../lib/acp-session-manager', () => ({
  acpSessionManager: {
    handleAcpPayload: vi.fn(),
    getAcpStore: vi.fn(() => null),
    configure: vi.fn(),
    getOrCreateController: vi.fn(),
    removeController: vi.fn(),
    hasController: vi.fn(() => false),
    destroy: vi.fn(),
  },
}));

// Import after mocks are set up
import {
  handleBridgeMessage,
  useStore,
  setFileContentCallback,
} from '../store';
import { handleError } from '../lib/error-recovery';
import { showNotification } from '../lib/tauri';
import { encodePong } from '../lib/bridge-transport';
import { acpSessionManager } from '../lib/acp-session-manager';

// ============================================================================
// Helpers
// ============================================================================

/** Build a DecodedBridgeMessage with the given type and message payload. */
function makeDecodedMessage(
  type: BridgeMessage['type'],
  message: Partial<BridgeMessage>,
): DecodedBridgeMessage {
  return {
    type,
    message: { type, ...message } as BridgeMessage,
    envelope: { version: 1, seq: 1, timestamp_ms: Date.now(), extra_data: null },
  };
}

/** Reset the zustand store to a clean initial state. */
function resetStore(): void {
  useStore.setState({
    workspaces: [],
    worktrees: [],
    agentSessions: [],
    terminalSessions: [],
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

// ============================================================================
// Tests
// ============================================================================

describe('handleBridgeMessage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetStore();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // --------------------------------------------------------------------------
  // workspace_event
  // --------------------------------------------------------------------------

  describe('workspace_event', () => {
    it('WorkspaceCreated: adds workspace to store', () => {
      const workspace = { id: 'ws-1', name: 'Test Workspace' };
      const decoded = makeDecodedMessage('workspace_event', {
        payload: {
          originalType: 'WorkspaceCreated',
          data: { workspace },
        },
      });

      handleBridgeMessage(decoded);

      expect(useStore.getState().workspaces).toHaveLength(1);
      expect(useStore.getState().workspaces[0]).toEqual(workspace);
    });

    it('WorkspaceDeleted: removes workspace from store', () => {
      useStore.setState({
        workspaces: [
          { id: 'ws-1', name: 'Test' },
          { id: 'ws-2', name: 'Other' },
        ],
      });

      const decoded = makeDecodedMessage('workspace_event', {
        payload: {
          originalType: 'WorkspaceDeleted',
          data: { workspaceId: 'ws-1' },
        },
      });

      handleBridgeMessage(decoded);

      expect(useStore.getState().workspaces).toHaveLength(1);
      expect(useStore.getState().workspaces[0].id).toBe('ws-2');
    });

    it('WorkspaceUpdated: updates workspace in store', () => {
      useStore.setState({
        workspaces: [{ id: 'ws-1', name: 'Old Name' }],
      });

      const decoded = makeDecodedMessage('workspace_event', {
        payload: {
          originalType: 'WorkspaceUpdated',
          data: { workspace: { id: 'ws-1', name: 'New Name' } },
        },
      });

      handleBridgeMessage(decoded);

      expect(useStore.getState().workspaces[0].name).toBe('New Name');
    });

    it('ignores null payload', () => {
      const decoded = makeDecodedMessage('workspace_event', {
        payload: null,
      });

      handleBridgeMessage(decoded);

      expect(useStore.getState().workspaces).toHaveLength(0);
    });

    it('ignores unknown originalType', () => {
      const decoded = makeDecodedMessage('workspace_event', {
        payload: {
          originalType: 'UnknownEvent',
          data: { foo: 'bar' },
        },
      });

      // Should not throw
      handleBridgeMessage(decoded);
      expect(useStore.getState().workspaces).toHaveLength(0);
    });
  });

  // --------------------------------------------------------------------------
  // worktree_event
  // --------------------------------------------------------------------------

  describe('worktree_event', () => {
    it('WorktreeCreated: adds worktree to store', () => {
      const worktree = { id: 'wt-1', workspaceId: 'ws-1', name: 'feature-branch' };
      const decoded = makeDecodedMessage('worktree_event', {
        payload: {
          originalType: 'WorktreeCreated',
          data: { worktree },
        },
      });

      handleBridgeMessage(decoded);

      expect(useStore.getState().worktrees).toHaveLength(1);
      expect(useStore.getState().worktrees[0]).toEqual(worktree);
    });

    it('WorktreeDeleted: removes worktree and clears caches', () => {
      useStore.setState({
        worktrees: [{ id: 'wt-1', workspaceId: 'ws-1' }],
        fileListCache: new Map([['wt-1', { worktreeId: 'wt-1', files: ['a.ts'], timestamp: 1 }]]),
        gitStatusCache: new Map([['wt-1', { worktreeId: 'wt-1', entries: [], timestamp: 1 }]]),
      });

      const decoded = makeDecodedMessage('worktree_event', {
        payload: {
          originalType: 'WorktreeDeleted',
          data: { worktreeId: 'wt-1' },
        },
      });

      handleBridgeMessage(decoded);

      expect(useStore.getState().worktrees).toHaveLength(0);
      expect(useStore.getState().fileListCache.has('wt-1')).toBe(false);
      expect(useStore.getState().gitStatusCache.has('wt-1')).toBe(false);
    });

    it('WorktreeChanged: updates worktree and clears caches', () => {
      useStore.setState({
        worktrees: [{ id: 'wt-1', workspaceId: 'ws-1', name: 'old' }],
        fileListCache: new Map([['wt-1', { worktreeId: 'wt-1', files: ['a.ts'], timestamp: 1 }]]),
      });

      const decoded = makeDecodedMessage('worktree_event', {
        payload: {
          originalType: 'WorktreeChanged',
          data: { worktree: { id: 'wt-1', workspaceId: 'ws-1', name: 'updated' } },
        },
      });

      handleBridgeMessage(decoded);

      expect(useStore.getState().worktrees[0].name).toBe('updated');
      expect(useStore.getState().fileListCache.has('wt-1')).toBe(false);
    });

    it('WorktreeListResult: adds multiple worktrees', () => {
      const decoded = makeDecodedMessage('worktree_event', {
        payload: {
          originalType: 'WorktreeListResult',
          data: {
            worktrees: [
              { id: 'wt-1', workspaceId: 'ws-1' },
              { id: 'wt-2', workspaceId: 'ws-1' },
            ],
          },
        },
      });

      handleBridgeMessage(decoded);

      expect(useStore.getState().worktrees).toHaveLength(2);
    });

    it('WorktreeDetailsResult: adds worktrees, agent sessions, and terminal sessions', () => {
      const decoded = makeDecodedMessage('worktree_event', {
        payload: {
          originalType: 'WorktreeDetailsResult',
          data: {
            worktrees: [{ id: 'wt-1', workspaceId: 'ws-1' }],
            agentSessions: [{ id: 'as-1', worktreeId: 'wt-1', agentType: 'builder', status: 'running' }],
            terminalSessions: [{ id: 'ts-1', worktreeId: 'wt-1', label: 'Term', shell: '/bin/bash' }],
          },
        },
      });

      handleBridgeMessage(decoded);

      expect(useStore.getState().worktrees).toHaveLength(1);
      expect(useStore.getState().agentSessions).toHaveLength(1);
      expect(useStore.getState().terminalSessions).toHaveLength(1);
    });
  });

  // --------------------------------------------------------------------------
  // git_response
  // --------------------------------------------------------------------------

  describe('git_response', () => {
    it('GitStatusResult: updates git status cache with transformed entries', () => {
      const decoded = makeDecodedMessage('git_response', {
        payload: {
          originalType: 'GitStatusResult',
          data: {
            worktreeId: 'wt-1',
            entries: [
              { path: 'src/a.ts', statusCode: 'M ' },
              { path: 'src/b.ts', statusCode: 'A ' },
              { path: 'src/c.ts', statusCode: '??' },
              { path: 'src/d.ts', statusCode: ' D' },
            ],
          },
        },
      });

      handleBridgeMessage(decoded);

      const cache = useStore.getState().gitStatusCache.get('wt-1');
      expect(cache).toBeDefined();
      expect(cache!.entries).toHaveLength(4);
      expect(cache!.entries[0]).toEqual({ path: 'src/a.ts', status: 'modified', staged: true });
      expect(cache!.entries[1]).toEqual({ path: 'src/b.ts', status: 'added', staged: true });
      expect(cache!.entries[2]).toEqual({ path: 'src/c.ts', status: 'untracked', staged: false });
      expect(cache!.entries[3]).toEqual({ path: 'src/d.ts', status: 'deleted', staged: false });
    });

    it('GitDiffResult: does not throw', () => {
      const decoded = makeDecodedMessage('git_response', {
        payload: {
          originalType: 'GitDiffResult',
          data: {
            worktreeId: 'wt-1',
            filePath: 'src/a.ts',
            diff: '--- a/src/a.ts\n+++ b/src/a.ts\n',
          },
        },
      });

      expect(() => handleBridgeMessage(decoded)).not.toThrow();
    });

    it('ignores null payload', () => {
      const decoded = makeDecodedMessage('git_response', { payload: null });
      handleBridgeMessage(decoded);
      expect(useStore.getState().gitStatusCache.size).toBe(0);
    });
  });

  // --------------------------------------------------------------------------
  // file_response
  // --------------------------------------------------------------------------

  describe('file_response', () => {
    it('FileListResult: updates file list cache', () => {
      const decoded = makeDecodedMessage('file_response', {
        payload: {
          originalType: 'FileListResult',
          data: {
            worktreeId: 'wt-1',
            files: ['src/a.ts', 'src/b.ts'],
          },
        },
      });

      handleBridgeMessage(decoded);

      const cache = useStore.getState().fileListCache.get('wt-1');
      expect(cache).toBeDefined();
      expect(cache!.files).toEqual(['src/a.ts', 'src/b.ts']);
    });

    it('FileContent: calls fileContentCallback', () => {
      const callback = vi.fn();

      // Use the imported setFileContentCallback
      setFileContentCallback(callback);

      const decoded = makeDecodedMessage('file_response', {
        payload: {
          originalType: 'FileContent',
          data: {
            worktreeId: 'wt-1',
            path: 'src/a.ts',
            content: 'file contents',
          },
        },
      });

      handleBridgeMessage(decoded);

      expect(callback).toHaveBeenCalledWith({
        worktreeId: 'wt-1',
        path: 'src/a.ts',
        content: 'file contents',
      });

      // Clean up
      setFileContentCallback(null);
    });
  });

  // --------------------------------------------------------------------------
  // notification
  // --------------------------------------------------------------------------

  describe('notification', () => {
    it('adds notification to store and calls showNotification when title present', () => {
      const decoded = makeDecodedMessage('notification', {
        payload: {
          data: {
            level: 'info',
            title: 'Git Commit',
            message: 'Changes committed successfully',
          },
        },
      });

      handleBridgeMessage(decoded);

      expect(useStore.getState().notifications).toHaveLength(1);
      expect(useStore.getState().notifications[0].level).toBe('info');
      expect(useStore.getState().notifications[0].message).toContain('Git Commit');
      expect(showNotification).toHaveBeenCalledWith('Git Commit', 'Changes committed successfully');
    });

    it('adds notification without showNotification when no title', () => {
      const decoded = makeDecodedMessage('notification', {
        payload: {
          data: {
            level: 'warning',
            message: 'Something happened',
          },
        },
      });

      handleBridgeMessage(decoded);

      expect(useStore.getState().notifications).toHaveLength(1);
      expect(showNotification).not.toHaveBeenCalled();
    });

    it('ignores notification without level or message', () => {
      const decoded = makeDecodedMessage('notification', {
        payload: {
          data: {},
        },
      });

      handleBridgeMessage(decoded);
      expect(useStore.getState().notifications).toHaveLength(0);
    });
  });

  // --------------------------------------------------------------------------
  // error_response
  // --------------------------------------------------------------------------

  describe('error_response', () => {
    it('calls handleError with error data', () => {
      const decoded = makeDecodedMessage('error_response', {
        payload: {
          data: {
            code: 'git_failure',
            message: 'Merge conflict',
            details: null,
            request_id: 'req-1',
          },
        },
      });

      handleBridgeMessage(decoded);

      expect(handleError).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'Error',
          code: 'git_failure',
          message: 'Merge conflict',
          requestId: 'req-1',
        }),
      );
    });

    it('handles null data gracefully', () => {
      const decoded = makeDecodedMessage('error_response', {
        payload: { data: null },
      });

      // data is null but payload is not null, so it won't enter the if(data) block
      expect(() => handleBridgeMessage(decoded)).not.toThrow();
      expect(handleError).not.toHaveBeenCalled();
    });
  });

  // --------------------------------------------------------------------------
  // agent_event
  // --------------------------------------------------------------------------

  describe('agent_event', () => {
    it('AgentStatusUpdate: adds new session when not found', () => {
      const decoded = makeDecodedMessage('agent_event', {
        payload: {
          originalType: 'AgentStatusUpdate',
          data: {
            id: 'as-1',
            worktreeId: 'wt-1',
            agentType: 'builder',
            status: 'running',
            startedAt: 1000,
          },
        },
      });

      handleBridgeMessage(decoded);

      expect(useStore.getState().agentSessions).toHaveLength(1);
      expect(useStore.getState().agentSessions[0].id).toBe('as-1');
    });

    it('AgentStatusUpdate: updates existing session', () => {
      useStore.setState({
        agentSessions: [{ id: 'as-1', worktreeId: 'wt-1', status: 'idle' }],
      });

      const decoded = makeDecodedMessage('agent_event', {
        payload: {
          originalType: 'AgentStatusUpdate',
          data: {
            id: 'as-1',
            status: 'running',
          },
        },
      });

      handleBridgeMessage(decoded);

      expect(useStore.getState().agentSessions).toHaveLength(1);
      expect(useStore.getState().agentSessions[0].status).toBe('running');
    });

    it('AgentRemoved: removes session', () => {
      useStore.setState({
        agentSessions: [{ id: 'as-1', worktreeId: 'wt-1' }],
      });

      const decoded = makeDecodedMessage('agent_event', {
        payload: {
          originalType: 'AgentRemoved',
          data: { id: 'as-1' },
        },
      });

      handleBridgeMessage(decoded);

      expect(useStore.getState().agentSessions).toHaveLength(0);
    });

    it('AgentUpdated: updates session fields', () => {
      useStore.setState({
        agentSessions: [{ id: 'as-1', worktreeId: 'wt-1', label: 'old', position: 0 }],
      });

      const decoded = makeDecodedMessage('agent_event', {
        payload: {
          originalType: 'AgentUpdated',
          data: {
            sessionId: 'as-1',
            label: 'new-label',
            position: 2,
          },
        },
      });

      handleBridgeMessage(decoded);

      expect(useStore.getState().agentSessions[0].label).toBe('new-label');
      expect(useStore.getState().agentSessions[0].position).toBe(2);
    });
  });

  // --------------------------------------------------------------------------
  // terminal_event
  // --------------------------------------------------------------------------

  describe('terminal_event', () => {
    it('TerminalCreated: adds terminal session', () => {
      const decoded = makeDecodedMessage('terminal_event', {
        payload: {
          originalType: 'TerminalCreated',
          data: {
            sessionId: 'ts-1',
            worktreeId: 'wt-1',
            label: 'My Terminal',
            shell: '/bin/bash',
          },
        },
      });

      handleBridgeMessage(decoded);

      expect(useStore.getState().terminalSessions).toHaveLength(1);
      expect(useStore.getState().terminalSessions[0].id).toBe('ts-1');
      expect(useStore.getState().terminalSessions[0].label).toBe('My Terminal');
    });

    it('TerminalCreated: uses default label when null', () => {
      const decoded = makeDecodedMessage('terminal_event', {
        payload: {
          originalType: 'TerminalCreated',
          data: {
            sessionId: 'ts-1',
            worktreeId: 'wt-1',
            label: null,
            shell: '/bin/bash',
          },
        },
      });

      handleBridgeMessage(decoded);

      expect(useStore.getState().terminalSessions[0].label).toBe('Terminal');
    });

    it('TerminalRemoved: removes terminal session', () => {
      useStore.setState({
        terminalSessions: [{ id: 'ts-1', worktreeId: 'wt-1', label: 'Term' }],
      });

      const decoded = makeDecodedMessage('terminal_event', {
        payload: {
          originalType: 'TerminalRemoved',
          data: { sessionId: 'ts-1' },
        },
      });

      handleBridgeMessage(decoded);

      expect(useStore.getState().terminalSessions).toHaveLength(0);
    });

    it('TerminalUpdated: updates terminal session fields', () => {
      useStore.setState({
        terminalSessions: [{ id: 'ts-1', worktreeId: 'wt-1', label: 'old', position: 0 }],
      });

      const decoded = makeDecodedMessage('terminal_event', {
        payload: {
          originalType: 'TerminalUpdated',
          data: {
            sessionId: 'ts-1',
            label: 'new',
            position: 3,
          },
        },
      });

      handleBridgeMessage(decoded);

      expect(useStore.getState().terminalSessions[0].label).toBe('new');
      expect(useStore.getState().terminalSessions[0].position).toBe(3);
    });

    it('TerminalOutput: no store mutation (routed via onMessage)', () => {
      // Pre-populate store to verify it's not modified
      useStore.setState({
        terminalSessions: [{ id: 'ts-1', worktreeId: 'wt-1', label: 'Term' }],
      });

      const decoded = makeDecodedMessage('terminal_event', {
        payload: {
          type: 'TerminalOutput',
          data: { sessionId: 'ts-1', data: 'some output\n' },
        },
      });

      // Should not throw or warn
      handleBridgeMessage(decoded);

      // Store state unchanged
      expect(useStore.getState().terminalSessions).toHaveLength(1);
    });

    it('TerminalHistory: no store mutation (routed via onMessage)', () => {
      // Pre-populate store to verify it's not modified
      useStore.setState({
        terminalSessions: [{ id: 'ts-1', worktreeId: 'wt-1', label: 'Term' }],
      });

      const decoded = makeDecodedMessage('terminal_event', {
        payload: {
          type: 'TerminalHistory',
          data: { sessionId: 'ts-1', data: 'history output\n' },
        },
      });

      // Should not throw or warn
      handleBridgeMessage(decoded);

      // Store state unchanged
      expect(useStore.getState().terminalSessions).toHaveLength(1);
    });
  });

  // --------------------------------------------------------------------------
  // state_snapshot
  // --------------------------------------------------------------------------

  describe('state_snapshot', () => {
    it('loads full state snapshot', () => {
      const snapshot = {
        workspaces: [{ id: 'ws-1', name: 'WS' }],
        worktrees: [{ id: 'wt-1', workspaceId: 'ws-1' }],
        agentSessions: [{ id: 'as-1', worktreeId: 'wt-1' }],
        terminalSessions: [{ id: 'ts-1', worktreeId: 'wt-1' }],
      };

      const decoded = makeDecodedMessage('state_snapshot', {
        payload: { data: snapshot },
      });

      handleBridgeMessage(decoded);

      const state = useStore.getState();
      expect(state.workspaces).toHaveLength(1);
      expect(state.worktrees).toHaveLength(1);
      expect(state.agentSessions).toHaveLength(1);
      expect(state.terminalSessions).toHaveLength(1);
      expect(state.isWorkspacesLoading).toBe(false);
    });

    it('ignores null data', () => {
      const decoded = makeDecodedMessage('state_snapshot', {
        payload: { data: null },
      });

      handleBridgeMessage(decoded);
      // Should not crash, state unchanged
      expect(useStore.getState().workspaces).toHaveLength(0);
    });
  });

  // --------------------------------------------------------------------------
  // ping
  // --------------------------------------------------------------------------

  describe('ping', () => {
    it('sends pong via sendFn', () => {
      const sendFn = vi.fn();
      const decoded = makeDecodedMessage('ping', {
        payload: { timestamp: 12345 },
      });

      handleBridgeMessage(decoded, sendFn);

      expect(sendFn).toHaveBeenCalledTimes(1);
      expect(encodePong).toHaveBeenCalledWith({ timestamp: 12345 });
    });

    it('does not send pong when no sendFn', () => {
      const decoded = makeDecodedMessage('ping', {
        payload: { timestamp: 12345 },
      });

      handleBridgeMessage(decoded);

      expect(encodePong).not.toHaveBeenCalled();
    });
  });

  // --------------------------------------------------------------------------
  // pong
  // --------------------------------------------------------------------------

  describe('pong', () => {
    it('updates lastPongTimestamp', () => {
      const before = useStore.getState().lastPongTimestamp;

      const decoded = makeDecodedMessage('pong', {
        payload: { timestamp: Date.now() },
      });

      handleBridgeMessage(decoded);

      const after = useStore.getState().lastPongTimestamp;
      expect(after).toBeGreaterThanOrEqual(before);
    });
  });

  // --------------------------------------------------------------------------
  // ack
  // --------------------------------------------------------------------------

  describe('ack', () => {
    it('does not throw for ack messages', () => {
      const decoded = makeDecodedMessage('ack', {
        payload: { message_id: 'msg-1', status: 'ok' },
      });

      expect(() => handleBridgeMessage(decoded)).not.toThrow();
    });
  });

  // --------------------------------------------------------------------------
  // acp_payload
  // --------------------------------------------------------------------------

  describe('acp_payload', () => {
    it('routes payload through acpSessionManager with active worktree', () => {
      useStore.setState({ activeWorktreeId: 'wt-1' });

      const payload = { jsonrpc: '2.0', method: 'session/update', params: {} };
      const decoded = makeDecodedMessage('acp_payload', {
        payload: payload as any,
      });

      handleBridgeMessage(decoded);

      expect(acpSessionManager.handleAcpPayload).toHaveBeenCalledWith('wt-1', payload);
    });

    it('routes payload using worktreeId from payload data', () => {
      const payload = {
        jsonrpc: '2.0',
        method: 'session/update',
        data: { worktreeId: 'wt-2' },
      };
      const decoded = makeDecodedMessage('acp_payload', {
        payload: payload as any,
      });

      handleBridgeMessage(decoded);

      expect(acpSessionManager.handleAcpPayload).toHaveBeenCalledWith('wt-2', payload);
    });

    it('does not route when no worktreeId available', () => {
      useStore.setState({ activeWorktreeId: null });

      const payload = { jsonrpc: '2.0', method: 'session/update' };
      const decoded = makeDecodedMessage('acp_payload', {
        payload: payload as any,
      });

      handleBridgeMessage(decoded);

      expect(acpSessionManager.handleAcpPayload).not.toHaveBeenCalled();
    });
  });

  // --------------------------------------------------------------------------
  // Edge cases / error handling
  // --------------------------------------------------------------------------

  describe('error handling', () => {
    it('does not throw for unknown message type', () => {
      const decoded = makeDecodedMessage('workspace_event', {
        payload: { originalType: 'CompletelyUnknown', data: {} },
      });

      expect(() => handleBridgeMessage(decoded)).not.toThrow();
    });

    it('does not throw when payload data is missing', () => {
      const decoded = makeDecodedMessage('workspace_event', {
        payload: { originalType: 'WorkspaceCreated' },
      });

      expect(() => handleBridgeMessage(decoded)).not.toThrow();
    });
  });
});
