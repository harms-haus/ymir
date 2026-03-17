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

import { renderHook, act, waitFor } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useAgentStatus, useAgentList } from '../useAgentStatus';
import { useStore } from '../../store';
import { resetWebSocketClient, getWebSocketClient } from '../../lib/ws';
import { encode } from '@msgpack/msgpack';
import type { AgentStatusUpdate, AgentOutput, AgentSession } from '../../types/protocol';

const wsMock = vi.fn(function WebSocketMock(this: any, _url: string) {
  currentMockWebSocket = createMockWebSocket();
  return currentMockWebSocket;
});
globalThis.WebSocket = wsMock as any;
(globalThis.WebSocket as any).CONNECTING = 0;
(globalThis.WebSocket as any).OPEN = 1;
(globalThis.WebSocket as any).CLOSING = 2;
(globalThis.WebSocket as any).CLOSED = 3;

describe('useAgentStatus', () => {
  beforeEach(() => {
    resetWebSocketClient();
    vi.clearAllMocks();
    
    useStore.setState({
      workspaces: [],
      worktrees: [],
      agentSessions: [],
      terminalSessions: [],
      notifications: [],
      activeWorktreeId: null,
      connectionStatus: 'closed',
      connectionError: null,
    });
  });

  afterEach(() => {
    vi.clearAllTimers();
  });

  describe('status mapping', () => {
    it('maps AgentStatus working → StatusDotStatus working', () => {
      const session: AgentSession = {
        id: 'session-1',
        worktreeId: 'worktree-1',
        agentType: 'test-agent',
        status: 'working',
        startedAt: Date.now(),
      };

      useStore.setState({
        agentSessions: [session],
      });

      const { result } = renderHook(() => useAgentStatus('worktree-1'));
      
      expect(result.current).not.toBeNull();
      expect(result.current?.status).toBe('working');
    });

    it('maps AgentStatus waiting → StatusDotStatus waiting', () => {
      const session: AgentSession = {
        id: 'session-1',
        worktreeId: 'worktree-1',
        agentType: 'test-agent',
        status: 'waiting',
        startedAt: Date.now(),
      };

      useStore.setState({
        agentSessions: [session],
      });

      const { result } = renderHook(() => useAgentStatus('worktree-1'));
      
      expect(result.current?.status).toBe('waiting');
    });

    it('maps AgentStatus idle → StatusDotStatus idle', () => {
      const session: AgentSession = {
        id: 'session-1',
        worktreeId: 'worktree-1',
        agentType: 'test-agent',
        status: 'idle',
        startedAt: Date.now(),
      };

      useStore.setState({
        agentSessions: [session],
      });

      const { result } = renderHook(() => useAgentStatus('worktree-1'));
      
      expect(result.current?.status).toBe('idle');
    });

    it('maps AgentStatus error → StatusDotStatus idle', () => {
      const session: AgentSession = {
        id: 'session-1',
        worktreeId: 'worktree-1',
        agentType: 'test-agent',
        status: 'error',
        startedAt: Date.now(),
      };

      useStore.setState({
        agentSessions: [session],
      });

      const { result } = renderHook(() => useAgentStatus('worktree-1'));
      
      expect(result.current?.status).toBe('idle');
    });
  });

  describe('worktree status derivation', () => {
    it('returns null when no agent exists for worktree', () => {
      const { result } = renderHook(() => useAgentStatus('worktree-1'));
      
      expect(result.current).toBeNull();
    });

    it('returns null when worktreeId is null', () => {
      const { result } = renderHook(() => useAgentStatus(null));
      
      expect(result.current).toBeNull();
    });

    it('returns agent info when agent exists for worktree', () => {
      const session: AgentSession = {
        id: 'session-1',
        worktreeId: 'worktree-1',
        agentType: 'test-agent',
        status: 'working',
        startedAt: Date.now(),
      };

      useStore.setState({
        agentSessions: [session],
      });

      const { result } = renderHook(() => useAgentStatus('worktree-1'));
      
      expect(result.current).not.toBeNull();
      expect(result.current?.agentType).toBe('test-agent');
      expect(result.current?.status).toBe('working');
      expect(result.current?.taskSummary).toBe('');
      expect(typeof result.current?.lastActivity).toBe('number');
    });

    it('uses first session when multiple agents exist for worktree', () => {
      const session1: AgentSession = {
        id: 'session-1',
        worktreeId: 'worktree-1',
        agentType: 'test-agent-1',
        status: 'working',
        startedAt: Date.now(),
      };
      
      const session2: AgentSession = {
        id: 'session-2',
        worktreeId: 'worktree-1',
        agentType: 'test-agent-2',
        status: 'waiting',
        startedAt: Date.now(),
      };

      useStore.setState({
        agentSessions: [session1, session2],
      });

      const { result } = renderHook(() => useAgentStatus('worktree-1'));
      
      expect(result.current?.agentType).toBe('test-agent-1');
      expect(result.current?.status).toBe('working');
    });
  });

  describe('WebSocket subscription', () => {
    beforeEach(() => {
      getWebSocketClient();
      Object.defineProperty(currentMockWebSocket, 'readyState', {
        value: 1,
        writable: true,
      });
      callOpenHandler();
    });

    it('subscribes to AgentStatusUpdate messages', async () => {
      const session: AgentSession = {
        id: 'session-1',
        worktreeId: 'worktree-1',
        agentType: 'test-agent',
        status: 'working',
        startedAt: Date.now(),
      };

      useStore.setState({
        agentSessions: [session],
      });

      const { result } = renderHook(() => useAgentStatus('worktree-1'));
      
      const statusUpdate: AgentStatusUpdate = {
        type: 'AgentStatusUpdate',
        sessionId: 'session-1',
        status: 'waiting',
        message: 'Waiting for user input',
      };

      const encoded = encode(statusUpdate);
      const messageEvent = new MessageEvent('message', {
        data: encoded.buffer.slice(encoded.byteOffset, encoded.byteOffset + encoded.byteLength),
      });

      act(() => {
        callMessageHandler(messageEvent);
      });

      await waitFor(() => {
        expect(result.current?.status).toBe('waiting');
        expect(result.current?.taskSummary).toBe('Waiting for user input');
      });
    });

    it('subscribes to AgentOutput messages', async () => {
      const session: AgentSession = {
        id: 'session-1',
        worktreeId: 'worktree-1',
        agentType: 'test-agent',
        status: 'working',
        startedAt: Date.now(),
      };

      useStore.setState({
        agentSessions: [session],
      });

      const { result } = renderHook(() => useAgentStatus('worktree-1'));
      
      const initialActivity = result.current?.lastActivity;
      // Wait 1ms to ensure timestamps are different
      await new Promise(resolve => setTimeout(resolve, 1));
      
      const agentOutput: AgentOutput = {
        type: 'AgentOutput',
        sessionId: 'session-1',
        output: 'Some output from agent',
      };

      const encoded = encode(agentOutput);
      const messageEvent = new MessageEvent('message', {
        data: encoded.buffer.slice(encoded.byteOffset, encoded.byteOffset + encoded.byteLength),
      });

      act(() => {
        callMessageHandler(messageEvent);
      });

      await waitFor(() => {
        expect(result.current?.lastActivity).toBeGreaterThan(initialActivity!);
      });
    });

    it('ignores messages for different sessions', async () => {
      const session: AgentSession = {
        id: 'session-1',
        worktreeId: 'worktree-1',
        agentType: 'test-agent',
        status: 'working',
        startedAt: Date.now(),
      };

      useStore.setState({
        agentSessions: [session],
      });

      const { result } = renderHook(() => useAgentStatus('worktree-1'));
      
      const initialStatus = result.current?.status;
      
      const statusUpdate: AgentStatusUpdate = {
        type: 'AgentStatusUpdate',
        sessionId: 'session-2',
        status: 'waiting',
        message: 'This should be ignored',
      };

      const encoded = encode(statusUpdate);
      const messageEvent = new MessageEvent('message', {
        data: encoded.buffer.slice(encoded.byteOffset, encoded.byteOffset + encoded.byteLength),
      });

      act(() => {
        callMessageHandler(messageEvent);
      });

      expect(result.current?.status).toBe(initialStatus);
      expect(result.current?.taskSummary).toBe('');
    });
  });

  describe('useAgentList', () => {
    it('returns empty array when no agents for worktree', () => {
      const { result } = renderHook(() => useAgentList('worktree-1'));
      
      expect(result.current).toEqual([]);
    });

    it('returns all agent sessions for worktree', () => {
      const session1: AgentSession = {
        id: 'session-1',
        worktreeId: 'worktree-1',
        agentType: 'test-agent-1',
        status: 'working',
        startedAt: Date.now(),
      };
      
      const session2: AgentSession = {
        id: 'session-2',
        worktreeId: 'worktree-1',
        agentType: 'test-agent-2',
        status: 'waiting',
        startedAt: Date.now(),
      };
      
      const session3: AgentSession = {
        id: 'session-3',
        worktreeId: 'worktree-2',
        agentType: 'test-agent-3',
        status: 'idle',
        startedAt: Date.now(),
      };

      useStore.setState({
        agentSessions: [session1, session2, session3],
      });

      const { result } = renderHook(() => useAgentList('worktree-1'));
      
      expect(result.current).toHaveLength(2);
      expect(result.current[0].id).toBe('session-1');
      expect(result.current[1].id).toBe('session-2');
    });

    it('returns empty array when worktreeId is null', () => {
      const { result } = renderHook(() => useAgentList(null));
      
      expect(result.current).toEqual([]);
    });
  });
});