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

function encodeServerMessage<T extends { type: string }>(message: T): ArrayBuffer {
  const { type, ...data } = message;
  const wrapped = {
    version: PROTOCOL_VERSION,
    type,
    data,
  };
  const encoded = encode(wrapped);
  return encoded.buffer.slice(encoded.byteOffset, encoded.byteOffset + encoded.byteLength);
}

import { renderHook, act, waitFor } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useAgentStatus, useAgentList } from '../useAgentStatus';
import { useStore } from '../../store';
import { resetWebSocketClient, getWebSocketClient } from '../../lib/ws';
import { encode } from '@msgpack/msgpack';
import { PROTOCOL_VERSION } from '../../types/generated/protocol';
import type { AgentStatusUpdate, AgentOutput, AgentSession, AcpSessionStatus } from '../../types/generated/protocol';
import { createInitialAccumulatorState } from '../../types/state';

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
      acpAccumulator: createInitialAccumulatorState(),
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
        id: 'session-1',
        worktreeId: 'worktree-1',
        agentType: 'test-agent',
        status: 'waiting',
        startedAt: Date.now(),
      };

      const encoded = encodeServerMessage(statusUpdate);
      const messageEvent = new MessageEvent('message', {
        data: encoded,
      });

      act(() => {
        callMessageHandler(messageEvent);
      });

      await waitFor(() => {
        expect(result.current?.status).toBe('waiting');
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
      await new Promise(resolve => setTimeout(resolve, 5));
      
      const agentOutput: AgentOutput = {
        type: 'AgentOutput',
        worktreeId: 'worktree-1',
        output: 'Some output from agent',
      };

      const encoded = encodeServerMessage(agentOutput);
      const messageEvent = new MessageEvent('message', {
        data: encoded,
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
        id: 'session-2',
        worktreeId: 'worktree-2',
        agentType: 'test-agent',
        status: 'waiting',
        startedAt: Date.now(),
      };

      const encoded = encodeServerMessage(statusUpdate);
      const messageEvent = new MessageEvent('message', {
        data: encoded,
      });

      act(() => {
        callMessageHandler(messageEvent);
      });

      expect(result.current?.status).toBe(initialStatus);
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

// ============================================================================
// ACP Event Accumulator Reducer Tests
// ============================================================================

import { acpAccumulatorReducer } from '../../store';
import type { AcpAccumulatorState } from '../../types/state';
import type { AcpEventEnvelope } from '../../types/generated/protocol';

describe('ACP Event Accumulator Reducer', () => {
  let state: AcpAccumulatorState;

  beforeEach(() => {
    state = createInitialAccumulatorState();
  });

  describe('CONNECTION_RECONNECTED', () => {
    it('increments connection generation and flushes all threads', () => {
      state.threads.set('worktree-1', {
        worktreeId: 'worktree-1',
        acpSessionId: 'session-1',
        messages: [],
        sessionStatus: 'Working',
        lastSequence: 10,
        connectionGeneration: 1,
        isStreaming: false,
      });

      const newState = acpAccumulatorReducer(state, { type: 'CONNECTION_RECONNECTED' });

      expect(newState.connectionGeneration).toBe(2);
      expect(newState.threads.size).toBe(0);
      expect(newState.lastFlushTimestamp).not.toBeNull();
    });
  });

  describe('FLUSH_ALL', () => {
    it('clears all threads without incrementing generation', () => {
      state.threads.set('worktree-1', {
        worktreeId: 'worktree-1',
        acpSessionId: 'session-1',
        messages: [],
        sessionStatus: 'Working',
        lastSequence: 0,
        connectionGeneration: 1,
        isStreaming: false,
      });

      const newState = acpAccumulatorReducer(state, { type: 'FLUSH_ALL' });

      expect(newState.connectionGeneration).toBe(1);
      expect(newState.threads.size).toBe(0);
    });
  });

  describe('FLUSH_THREAD', () => {
    it('removes specific thread while keeping others', () => {
      state.threads.set('worktree-1', {
        worktreeId: 'worktree-1',
        acpSessionId: 'session-1',
        messages: [],
        sessionStatus: 'Working',
        lastSequence: 0,
        connectionGeneration: 1,
        isStreaming: false,
      });
      state.threads.set('worktree-2', {
        worktreeId: 'worktree-2',
        acpSessionId: 'session-2',
        messages: [],
        sessionStatus: 'Working',
        lastSequence: 0,
        connectionGeneration: 1,
        isStreaming: false,
      });

      const newState = acpAccumulatorReducer(state, { type: 'FLUSH_THREAD', worktreeId: 'worktree-1' });

      expect(newState.threads.has('worktree-1')).toBe(false);
      expect(newState.threads.has('worktree-2')).toBe(true);
    });
  });

  describe('EVENT_RECEIVED - SessionInit', () => {
    it('creates thread on SessionInit event', () => {
      const envelope: AcpEventEnvelope = {
        sequence: 1,
        timestamp: Date.now(),
        eventType: 'SessionInit',
        data: {
          acpSessionId: 'acp-session-1',
          capabilities: { supportsToolUse: true, supportsContextUpdate: true, supportsCancellation: true },
        },
      };

      const newState = acpAccumulatorReducer(state, { type: 'EVENT_RECEIVED', envelope, worktreeId: 'worktree-1' });

      expect(newState.threads.has('worktree-1')).toBe(true);
      const thread = newState.threads.get('worktree-1')!;
      expect(thread.acpSessionId).toBe('acp-session-1');
      expect(thread.connectionGeneration).toBe(1);
    });
  });

  describe('EVENT_RECEIVED - PromptChunk (streaming text)', () => {
    beforeEach(() => {
      state.threads.set('worktree-1', {
        worktreeId: 'worktree-1',
        acpSessionId: 'session-1',
        messages: [],
        sessionStatus: 'Working',
        lastSequence: 0,
        connectionGeneration: 1,
        isStreaming: false,
      });
    });

    it('accumulates text chunks into assistant message', () => {
      const envelope1: AcpEventEnvelope = {
        sequence: 1,
        timestamp: Date.now(),
        eventType: 'PromptChunk',
        data: {
          worktreeId: 'worktree-1',
          acpSessionId: 'session-1',
          content: { type: 'Text', data: 'Hello' },
          isFinal: false,
        },
      };

      const state1 = acpAccumulatorReducer(state, { type: 'EVENT_RECEIVED', envelope: envelope1, worktreeId: 'worktree-1' });
      const thread1 = state1.threads.get('worktree-1')!;

      expect(thread1.isStreaming).toBe(true);
      expect(thread1.messages).toHaveLength(1);
      expect(thread1.messages[0].role).toBe('assistant');
      expect(thread1.messages[0].parts).toHaveLength(1);
      expect(thread1.messages[0].parts[0].type).toBe('text');
      expect((thread1.messages[0].parts[0] as any).text).toBe('Hello');
    });

    it('appends subsequent chunks to same text part', () => {
      const envelope1: AcpEventEnvelope = {
        sequence: 1,
        timestamp: Date.now(),
        eventType: 'PromptChunk',
        data: {
          worktreeId: 'worktree-1',
          acpSessionId: 'session-1',
          content: { type: 'Text', data: 'Hello ' },
          isFinal: false,
        },
      };
      const envelope2: AcpEventEnvelope = {
        sequence: 2,
        timestamp: Date.now(),
        eventType: 'PromptChunk',
        data: {
          worktreeId: 'worktree-1',
          acpSessionId: 'session-1',
          content: { type: 'Text', data: 'World' },
          isFinal: false,
        },
      };

      let newState = acpAccumulatorReducer(state, { type: 'EVENT_RECEIVED', envelope: envelope1, worktreeId: 'worktree-1' });
      newState = acpAccumulatorReducer(newState, { type: 'EVENT_RECEIVED', envelope: envelope2, worktreeId: 'worktree-1' });

      const thread = newState.threads.get('worktree-1')!;
      expect(thread.messages[0].parts).toHaveLength(1);
      expect((thread.messages[0].parts[0] as any).text).toBe('Hello World');
    });

    it('sets isStreaming to false on final chunk', () => {
      const envelope: AcpEventEnvelope = {
        sequence: 1,
        timestamp: Date.now(),
        eventType: 'PromptChunk',
        data: {
          worktreeId: 'worktree-1',
          acpSessionId: 'session-1',
          content: { type: 'Text', data: 'Done' },
          isFinal: true,
        },
      };

      const newState = acpAccumulatorReducer(state, { type: 'EVENT_RECEIVED', envelope, worktreeId: 'worktree-1' });
      const thread = newState.threads.get('worktree-1')!;

      expect(thread.isStreaming).toBe(false);
    });
  });

  describe('EVENT_RECEIVED - ToolUse', () => {
    beforeEach(() => {
      state.threads.set('worktree-1', {
        worktreeId: 'worktree-1',
        acpSessionId: 'session-1',
        messages: [{
          id: 'msg-1',
          role: 'assistant',
          parts: [],
          createdAt: Date.now(),
          lastSequence: 0,
        }],
        sessionStatus: 'Working',
        lastSequence: 0,
        connectionGeneration: 1,
        isStreaming: false,
      });
    });

    it('creates tool card on tool started', () => {
      const envelope: AcpEventEnvelope = {
        sequence: 1,
        timestamp: Date.now(),
        eventType: 'ToolUse',
        data: {
          worktreeId: 'worktree-1',
          acpSessionId: 'session-1',
          toolUseId: 'tool-1',
          toolName: 'ReadFile',
          status: 'Started',
          input: '{"path": "/src/file.ts"}',
        },
      };

      const newState = acpAccumulatorReducer(state, { type: 'EVENT_RECEIVED', envelope, worktreeId: 'worktree-1' });
      const thread = newState.threads.get('worktree-1')!;

      expect(thread.messages[0].parts).toHaveLength(1);
      const toolCard = thread.messages[0].parts[0];
      expect(toolCard.type).toBe('tool');
      expect((toolCard as any).toolName).toBe('ReadFile');
      expect((toolCard as any).status).toBe('Started');
    });

    it('updates tool card on progress/completion', () => {
      const startEnvelope: AcpEventEnvelope = {
        sequence: 1,
        timestamp: Date.now(),
        eventType: 'ToolUse',
        data: {
          worktreeId: 'worktree-1',
          acpSessionId: 'session-1',
          toolUseId: 'tool-1',
          toolName: 'ReadFile',
          status: 'Started',
          input: '{"path": "/src/file.ts"}',
        },
      };
      const completeEnvelope: AcpEventEnvelope = {
        sequence: 2,
        timestamp: Date.now(),
        eventType: 'ToolUse',
        data: {
          worktreeId: 'worktree-1',
          acpSessionId: 'session-1',
          toolUseId: 'tool-1',
          toolName: 'ReadFile',
          status: 'Completed',
          output: 'file contents here',
        },
      };

      let newState = acpAccumulatorReducer(state, { type: 'EVENT_RECEIVED', envelope: startEnvelope, worktreeId: 'worktree-1' });
      newState = acpAccumulatorReducer(newState, { type: 'EVENT_RECEIVED', envelope: completeEnvelope, worktreeId: 'worktree-1' });

      const thread = newState.threads.get('worktree-1')!;
      const toolCard = thread.messages[0].parts[0];
      expect((toolCard as any).status).toBe('Completed');
      expect((toolCard as any).output).toBe('file contents here');
    });

    it('truncates long tool outputs', () => {
      const longOutput = 'x'.repeat(15000);
      const envelope: AcpEventEnvelope = {
        sequence: 1,
        timestamp: Date.now(),
        eventType: 'ToolUse',
        data: {
          worktreeId: 'worktree-1',
          acpSessionId: 'session-1',
          toolUseId: 'tool-1',
          toolName: 'ReadFile',
          status: 'Completed',
          output: longOutput,
        },
      };

      const newState = acpAccumulatorReducer(state, { type: 'EVENT_RECEIVED', envelope, worktreeId: 'worktree-1' });
      const thread = newState.threads.get('worktree-1')!;
      const toolCard = thread.messages[0].parts[0];

      expect((toolCard as any).output.length).toBeLessThan(15000);
      expect((toolCard as any).output).toContain('[truncated]');
    });
  });

  describe('EVENT_RECEIVED - Error', () => {
    beforeEach(() => {
      state.threads.set('worktree-1', {
        worktreeId: 'worktree-1',
        acpSessionId: 'session-1',
        messages: [{
          id: 'msg-1',
          role: 'assistant',
          parts: [],
          createdAt: Date.now(),
          lastSequence: 0,
        }],
        sessionStatus: 'Working',
        lastSequence: 0,
        connectionGeneration: 1,
        isStreaming: false,
      });
    });

    it('creates error card on error event', () => {
      const envelope: AcpEventEnvelope = {
        sequence: 1,
        timestamp: Date.now(),
        eventType: 'Error',
        data: {
          worktreeId: 'worktree-1',
          acpSessionId: 'session-1',
          code: 'PromptFailed',
          message: 'Something went wrong',
          recoverable: true,
        },
      };

      const newState = acpAccumulatorReducer(state, { type: 'EVENT_RECEIVED', envelope, worktreeId: 'worktree-1' });
      const thread = newState.threads.get('worktree-1')!;

      expect(thread.messages[0].parts).toHaveLength(1);
      const errorCard = thread.messages[0].parts[0];
      expect(errorCard.type).toBe('error');
      expect((errorCard as any).code).toBe('PromptFailed');
      expect((errorCard as any).recoverable).toBe(true);
    });
  });

  describe('EVENT_RECEIVED - ResumeMarker', () => {
    beforeEach(() => {
      state.threads.set('worktree-1', {
        worktreeId: 'worktree-1',
        acpSessionId: 'session-1',
        messages: [],
        sessionStatus: 'Working',
        lastSequence: 0,
        connectionGeneration: 1,
        isStreaming: false,
      });
    });

    it('stores checkpoint and lastSequence', () => {
      const envelope: AcpEventEnvelope = {
        sequence: 42,
        timestamp: Date.now(),
        eventType: 'ResumeMarker',
        data: {
          worktreeId: 'worktree-1',
          acpSessionId: 'session-1',
          lastSequence: 42,
          checkpoint: 'checkpoint-data',
        },
      };

      const newState = acpAccumulatorReducer(state, { type: 'EVENT_RECEIVED', envelope, worktreeId: 'worktree-1' });
      const thread = newState.threads.get('worktree-1')!;

      expect(thread.resumeCheckpoint).toBe('checkpoint-data');
      expect(thread.lastSequence).toBe(42);
    });
  });

  describe('EVENT_RECEIVED - SessionStatus', () => {
    beforeEach(() => {
      state.threads.set('worktree-1', {
        worktreeId: 'worktree-1',
        acpSessionId: 'session-1',
        messages: [],
        sessionStatus: 'Working',
        lastSequence: 0,
        connectionGeneration: 1,
        isStreaming: false,
      });
    });

    it('updates session status', () => {
      const envelope: AcpEventEnvelope = {
        sequence: 1,
        timestamp: Date.now(),
        eventType: 'SessionStatus',
        data: {
          worktreeId: 'worktree-1',
          acpSessionId: 'session-1',
          status: 'Waiting',
        },
      };

      const newState = acpAccumulatorReducer(state, { type: 'EVENT_RECEIVED', envelope, worktreeId: 'worktree-1' });
      const thread = newState.threads.get('worktree-1')!;

      expect(thread.sessionStatus).toBe('Waiting');
    });
  });

  describe('reconnect rebuild behavior', () => {
    it('old thread is discarded on reconnect', () => {
      state.threads.set('worktree-1', {
        worktreeId: 'worktree-1',
        acpSessionId: 'old-session',
        messages: [{
          id: 'msg-1',
          role: 'assistant',
          parts: [{ type: 'text', text: 'old content', isStreaming: false }],
          createdAt: Date.now(),
          lastSequence: 100,
        }],
        sessionStatus: 'Working',
        lastSequence: 100,
        connectionGeneration: 1,
        isStreaming: false,
      });

      const newState = acpAccumulatorReducer(state, { type: 'CONNECTION_RECONNECTED' });

      expect(newState.threads.size).toBe(0);
      expect(newState.connectionGeneration).toBe(2);
    });

    it('new thread has correct connection generation after rebuild', () => {
      const reconnectState = acpAccumulatorReducer(state, { type: 'CONNECTION_RECONNECTED' });
      
      const envelope: AcpEventEnvelope = {
        sequence: 1,
        timestamp: Date.now(),
        eventType: 'SessionInit',
        data: {
          acpSessionId: 'new-session',
          capabilities: { supportsToolUse: true, supportsContextUpdate: true, supportsCancellation: true },
        },
      };

      const finalState = acpAccumulatorReducer(reconnectState, { type: 'EVENT_RECEIVED', envelope, worktreeId: 'worktree-1' });
      const thread = finalState.threads.get('worktree-1')!;

      expect(thread.connectionGeneration).toBe(2);
    });
  });

  describe('message limit enforcement', () => {
    it('enforces max message limit', () => {
      const messages = Array.from({ length: 600 }, (_, i) => ({
        id: `msg-${i}`,
        role: 'assistant' as const,
        parts: [{ type: 'text' as const, text: `message ${i}`, isStreaming: false }],
        createdAt: Date.now(),
        lastSequence: i,
      }));

      state.threads.set('worktree-1', {
        worktreeId: 'worktree-1',
        acpSessionId: 'session-1',
        messages,
        sessionStatus: 'Working',
        lastSequence: 600,
        connectionGeneration: 1,
        isStreaming: false,
      });

      const envelope: AcpEventEnvelope = {
        sequence: 601,
        timestamp: Date.now(),
        eventType: 'PromptChunk',
        data: {
          worktreeId: 'worktree-1',
          acpSessionId: 'session-1',
          content: { type: 'Text', data: 'new' },
          isFinal: true,
        },
      };

      const newState = acpAccumulatorReducer(state, { type: 'EVENT_RECEIVED', envelope, worktreeId: 'worktree-1' });
      const thread = newState.threads.get('worktree-1')!;

      expect(thread.messages.length).toBeLessThanOrEqual(500);
    });
  });

  describe('EVENT_RECEIVED - ContextUpdate variations', () => {
    beforeEach(() => {
      state.threads.set('worktree-1', {
        worktreeId: 'worktree-1',
        acpSessionId: 'session-1',
        messages: [{
          id: 'msg-1',
          role: 'assistant',
          parts: [],
          createdAt: Date.now(),
          lastSequence: 0,
        }],
        sessionStatus: 'Working',
        lastSequence: 0,
        connectionGeneration: 1,
        isStreaming: false,
      });
    });

    it('creates context card for FileRead', () => {
      const envelope: AcpEventEnvelope = {
        sequence: 1,
        timestamp: Date.now(),
        eventType: 'ContextUpdate',
        data: {
          worktreeId: 'worktree-1',
          acpSessionId: 'session-1',
          updateType: 'FileRead',
          data: '/src/file.ts',
        },
      };

      const newState = acpAccumulatorReducer(state, { type: 'EVENT_RECEIVED', envelope, worktreeId: 'worktree-1' });
      const thread = newState.threads.get('worktree-1')!;

      expect(thread.messages[0].parts).toHaveLength(1);
      const contextCard = thread.messages[0].parts[0];
      expect(contextCard.type).toBe('context');
      expect((contextCard as any).updateType).toBe('FileRead');
      expect((contextCard as any).data).toBe('/src/file.ts');
    });

    it('creates context card for FileWritten', () => {
      const envelope: AcpEventEnvelope = {
        sequence: 1,
        timestamp: Date.now(),
        eventType: 'ContextUpdate',
        data: {
          worktreeId: 'worktree-1',
          acpSessionId: 'session-1',
          updateType: 'FileWritten',
          data: '/src/new-file.ts',
        },
      };

      const newState = acpAccumulatorReducer(state, { type: 'EVENT_RECEIVED', envelope, worktreeId: 'worktree-1' });
      const thread = newState.threads.get('worktree-1')!;

      const contextCard = thread.messages[0].parts[0];
      expect((contextCard as any).updateType).toBe('FileWritten');
    });

    it('creates context card for CommandExecuted', () => {
      const envelope: AcpEventEnvelope = {
        sequence: 1,
        timestamp: Date.now(),
        eventType: 'ContextUpdate',
        data: {
          worktreeId: 'worktree-1',
          acpSessionId: 'session-1',
          updateType: 'CommandExecuted',
          data: 'npm run build',
        },
      };

      const newState = acpAccumulatorReducer(state, { type: 'EVENT_RECEIVED', envelope, worktreeId: 'worktree-1' });
      const thread = newState.threads.get('worktree-1')!;

      const contextCard = thread.messages[0].parts[0];
      expect((contextCard as any).updateType).toBe('CommandExecuted');
    });

    it('creates context card for BrowserAction', () => {
      const envelope: AcpEventEnvelope = {
        sequence: 1,
        timestamp: Date.now(),
        eventType: 'ContextUpdate',
        data: {
          worktreeId: 'worktree-1',
          acpSessionId: 'session-1',
          updateType: 'BrowserAction',
          data: 'https://example.com',
        },
      };

      const newState = acpAccumulatorReducer(state, { type: 'EVENT_RECEIVED', envelope, worktreeId: 'worktree-1' });
      const thread = newState.threads.get('worktree-1')!;

      const contextCard = thread.messages[0].parts[0];
      expect((contextCard as any).updateType).toBe('BrowserAction');
    });

    it('creates context card for MemoryUpdate', () => {
      const envelope: AcpEventEnvelope = {
        sequence: 1,
        timestamp: Date.now(),
        eventType: 'ContextUpdate',
        data: {
          worktreeId: 'worktree-1',
          acpSessionId: 'session-1',
          updateType: 'MemoryUpdate',
          data: 'plan-step-1',
        },
      };

      const newState = acpAccumulatorReducer(state, { type: 'EVENT_RECEIVED', envelope, worktreeId: 'worktree-1' });
      const thread = newState.threads.get('worktree-1')!;

      const contextCard = thread.messages[0].parts[0];
      expect((contextCard as any).updateType).toBe('MemoryUpdate');
    });
  });

  describe('EVENT_RECEIVED - PromptComplete reason variations', () => {
    beforeEach(() => {
      state.threads.set('worktree-1', {
        worktreeId: 'worktree-1',
        acpSessionId: 'session-1',
        messages: [],
        sessionStatus: 'Working',
        lastSequence: 0,
        connectionGeneration: 1,
        isStreaming: true,
      });
    });

    it('handles Normal completion reason', () => {
      const envelope: AcpEventEnvelope = {
        sequence: 1,
        timestamp: Date.now(),
        eventType: 'PromptComplete',
        data: {
          worktreeId: 'worktree-1',
          acpSessionId: 'session-1',
          reason: 'Normal',
        },
      };

      const newState = acpAccumulatorReducer(state, { type: 'EVENT_RECEIVED', envelope, worktreeId: 'worktree-1' });
      const thread = newState.threads.get('worktree-1')!;

      expect(thread.isStreaming).toBe(false);
      expect(thread.sessionStatus).toBe('Working');
    });

    it('handles Cancelled completion reason', () => {
      const envelope: AcpEventEnvelope = {
        sequence: 1,
        timestamp: Date.now(),
        eventType: 'PromptComplete',
        data: {
          worktreeId: 'worktree-1',
          acpSessionId: 'session-1',
          reason: 'Cancelled',
        },
      };

      const newState = acpAccumulatorReducer(state, { type: 'EVENT_RECEIVED', envelope, worktreeId: 'worktree-1' });
      const thread = newState.threads.get('worktree-1')!;

      expect(thread.isStreaming).toBe(false);
    });

    it('handles Error completion reason and sets session status to Complete', () => {
      const envelope: AcpEventEnvelope = {
        sequence: 1,
        timestamp: Date.now(),
        eventType: 'PromptComplete',
        data: {
          worktreeId: 'worktree-1',
          acpSessionId: 'session-1',
          reason: 'Error',
        },
      };

      const newState = acpAccumulatorReducer(state, { type: 'EVENT_RECEIVED', envelope, worktreeId: 'worktree-1' });
      const thread = newState.threads.get('worktree-1')!;

      expect(thread.isStreaming).toBe(false);
      expect(thread.sessionStatus).toBe('Complete');
    });
  });

  describe('EVENT_RECEIVED - ToolUse status variations', () => {
    beforeEach(() => {
      state.threads.set('worktree-1', {
        worktreeId: 'worktree-1',
        acpSessionId: 'session-1',
        messages: [{
          id: 'msg-1',
          role: 'assistant',
          parts: [],
          createdAt: Date.now(),
          lastSequence: 0,
        }],
        sessionStatus: 'Working',
        lastSequence: 0,
        connectionGeneration: 1,
        isStreaming: false,
      });
    });

    it('handles InProgress tool status', () => {
      const startEnvelope: AcpEventEnvelope = {
        sequence: 1,
        timestamp: Date.now(),
        eventType: 'ToolUse',
        data: {
          worktreeId: 'worktree-1',
          acpSessionId: 'session-1',
          toolUseId: 'tool-1',
          toolName: 'RunTests',
          status: 'Started',
          input: '{"test": "unit"}',
        },
      };
      const progressEnvelope: AcpEventEnvelope = {
        sequence: 2,
        timestamp: Date.now(),
        eventType: 'ToolUse',
        data: {
          worktreeId: 'worktree-1',
          acpSessionId: 'session-1',
          toolUseId: 'tool-1',
          toolName: 'RunTests',
          status: 'InProgress',
        },
      };

      let newState = acpAccumulatorReducer(state, { type: 'EVENT_RECEIVED', envelope: startEnvelope, worktreeId: 'worktree-1' });
      newState = acpAccumulatorReducer(newState, { type: 'EVENT_RECEIVED', envelope: progressEnvelope, worktreeId: 'worktree-1' });
      const thread = newState.threads.get('worktree-1')!;

      const toolCard = thread.messages[0].parts[0];
      expect((toolCard as any).status).toBe('InProgress');
    });

    it('handles Error tool status', () => {
      const startEnvelope: AcpEventEnvelope = {
        sequence: 1,
        timestamp: Date.now(),
        eventType: 'ToolUse',
        data: {
          worktreeId: 'worktree-1',
          acpSessionId: 'session-1',
          toolUseId: 'tool-1',
          toolName: 'ReadFile',
          status: 'Started',
        },
      };
      const errorEnvelope: AcpEventEnvelope = {
        sequence: 2,
        timestamp: Date.now(),
        eventType: 'ToolUse',
        data: {
          worktreeId: 'worktree-1',
          acpSessionId: 'session-1',
          toolUseId: 'tool-1',
          toolName: 'ReadFile',
          status: 'Error',
          error: 'File not found',
        },
      };

      let newState = acpAccumulatorReducer(state, { type: 'EVENT_RECEIVED', envelope: startEnvelope, worktreeId: 'worktree-1' });
      newState = acpAccumulatorReducer(newState, { type: 'EVENT_RECEIVED', envelope: errorEnvelope, worktreeId: 'worktree-1' });
      const thread = newState.threads.get('worktree-1')!;

      const toolCard = thread.messages[0].parts[0];
      expect((toolCard as any).status).toBe('Error');
      expect((toolCard as any).error).toBe('File not found');
    });
  });

  describe('EVENT_RECEIVED - Error code variations', () => {
    beforeEach(() => {
      state.threads.set('worktree-1', {
        worktreeId: 'worktree-1',
        acpSessionId: 'session-1',
        messages: [{
          id: 'msg-1',
          role: 'assistant',
          parts: [],
          createdAt: Date.now(),
          lastSequence: 0,
        }],
        sessionStatus: 'Working',
        lastSequence: 0,
        connectionGeneration: 1,
        isStreaming: false,
      });
    });

    const errorCodes: Array<{ code: any; recoverable: boolean }> = [
      { code: 'AgentCrash', recoverable: false },
      { code: 'InitFailed', recoverable: false },
      { code: 'SessionNotFound', recoverable: false },
      { code: 'PromptFailed', recoverable: true },
      { code: 'ToolFailed', recoverable: true },
      { code: 'CancelFailed', recoverable: false },
      { code: 'Timeout', recoverable: true },
      { code: 'InvalidRequest', recoverable: false },
      { code: 'Internal', recoverable: false },
    ];

    errorCodes.forEach(({ code, recoverable }) => {
      it(`creates error card for ${code} code`, () => {
        const envelope: AcpEventEnvelope = {
          sequence: 1,
          timestamp: Date.now(),
          eventType: 'Error',
          data: {
            worktreeId: 'worktree-1',
            acpSessionId: 'session-1',
            code,
            message: `Error: ${code}`,
            recoverable,
          },
        };

        const newState = acpAccumulatorReducer(state, { type: 'EVENT_RECEIVED', envelope, worktreeId: 'worktree-1' });
        const thread = newState.threads.get('worktree-1')!;

        const errorCard = thread.messages[0].parts[0];
        expect(errorCard.type).toBe('error');
        expect((errorCard as any).code).toBe(code);
        expect((errorCard as any).recoverable).toBe(recoverable);
      });
    });
  });

  describe('EVENT_RECEIVED - Structured content chunks', () => {
    beforeEach(() => {
      state.threads.set('worktree-1', {
        worktreeId: 'worktree-1',
        acpSessionId: 'session-1',
        messages: [],
        sessionStatus: 'Working',
        lastSequence: 0,
        connectionGeneration: 1,
        isStreaming: false,
      });
    });

    it('creates structured content part for Structured chunk type', () => {
      const envelope: AcpEventEnvelope = {
        sequence: 1,
        timestamp: Date.now(),
        eventType: 'PromptChunk',
        data: {
          worktreeId: 'worktree-1',
          acpSessionId: 'session-1',
          content: { type: 'Structured', data: '{"key": "value"}' },
          isFinal: false,
        },
      };

      const newState = acpAccumulatorReducer(state, { type: 'EVENT_RECEIVED', envelope, worktreeId: 'worktree-1' });
      const thread = newState.threads.get('worktree-1')!;

      expect(thread.messages).toHaveLength(1);
      expect(thread.messages[0].parts).toHaveLength(1);
      expect(thread.messages[0].parts[0].type).toBe('structured');
      expect((thread.messages[0].parts[0] as any).data).toBe('{"key": "value"}');
      expect((thread.messages[0].parts[0] as any).isStreaming).toBe(true);
    });

    it('sets isStreaming to false on final structured chunk', () => {
      const envelope: AcpEventEnvelope = {
        sequence: 1,
        timestamp: Date.now(),
        eventType: 'PromptChunk',
        data: {
          worktreeId: 'worktree-1',
          acpSessionId: 'session-1',
          content: { type: 'Structured', data: '{"key": "value"}' },
          isFinal: true,
        },
      };

      const newState = acpAccumulatorReducer(state, { type: 'EVENT_RECEIVED', envelope, worktreeId: 'worktree-1' });
      const thread = newState.threads.get('worktree-1')!;

      expect((thread.messages[0].parts[0] as any).isStreaming).toBe(false);
    });
  });

  describe('EVENT_RECEIVED - SessionStatus variations', () => {
    beforeEach(() => {
      state.threads.set('worktree-1', {
        worktreeId: 'worktree-1',
        acpSessionId: 'session-1',
        messages: [],
        sessionStatus: 'Working',
        lastSequence: 0,
        connectionGeneration: 1,
        isStreaming: false,
      });
    });

    const statuses: AcpSessionStatus[] = ['Working', 'Waiting', 'Complete', 'Cancelled'];

    statuses.forEach((status) => {
      it(`updates session status to ${status}`, () => {
        const envelope: AcpEventEnvelope = {
          sequence: 1,
          timestamp: Date.now(),
          eventType: 'SessionStatus',
          data: {
            worktreeId: 'worktree-1',
            acpSessionId: 'session-1',
            status,
          },
        };

        const newState = acpAccumulatorReducer(state, { type: 'EVENT_RECEIVED', envelope, worktreeId: 'worktree-1' });
        const thread = newState.threads.get('worktree-1')!;

        expect(thread.sessionStatus).toBe(status);
      });
    });
  });

  describe('REBUILD_FROM_SNAPSHOT', () => {
    it('creates empty thread with provided worktreeId and acpSessionId', () => {
      const newState = acpAccumulatorReducer(state, {
        type: 'REBUILD_FROM_SNAPSHOT',
        worktreeId: 'worktree-1',
        acpSessionId: 'recovered-session',
      });

      expect(newState.threads.has('worktree-1')).toBe(true);
      const thread = newState.threads.get('worktree-1')!;
      expect(thread.worktreeId).toBe('worktree-1');
      expect(thread.acpSessionId).toBe('recovered-session');
      expect(thread.messages).toEqual([]);
      expect(thread.connectionGeneration).toBe(1);
    });

    it('overwrites existing thread for same worktreeId', () => {
      state.threads.set('worktree-1', {
        worktreeId: 'worktree-1',
        acpSessionId: 'old-session',
        messages: [{
          id: 'msg-1',
          role: 'assistant',
          parts: [{ type: 'text', text: 'old content', isStreaming: false }],
          createdAt: Date.now(),
          lastSequence: 100,
        }],
        sessionStatus: 'Complete',
        lastSequence: 100,
        connectionGeneration: 1,
        isStreaming: false,
      });

      const newState = acpAccumulatorReducer(state, {
        type: 'REBUILD_FROM_SNAPSHOT',
        worktreeId: 'worktree-1',
        acpSessionId: 'new-session',
      });

      const thread = newState.threads.get('worktree-1')!;
      expect(thread.acpSessionId).toBe('new-session');
      expect(thread.messages).toEqual([]);
      expect(thread.sessionStatus).toBe('Working');
    });
  });

  describe('SET_STREAMING', () => {
    beforeEach(() => {
      state.threads.set('worktree-1', {
        worktreeId: 'worktree-1',
        acpSessionId: 'session-1',
        messages: [],
        sessionStatus: 'Working',
        lastSequence: 0,
        connectionGeneration: 1,
        isStreaming: false,
      });
    });

    it('sets isStreaming to true', () => {
      const newState = acpAccumulatorReducer(state, {
        type: 'SET_STREAMING',
        worktreeId: 'worktree-1',
        isStreaming: true,
      });

      expect(newState.threads.get('worktree-1')!.isStreaming).toBe(true);
    });

    it('sets isStreaming to false', () => {
      state.threads.get('worktree-1')!.isStreaming = true;

      const newState = acpAccumulatorReducer(state, {
        type: 'SET_STREAMING',
        worktreeId: 'worktree-1',
        isStreaming: false,
      });

      expect(newState.threads.get('worktree-1')!.isStreaming).toBe(false);
    });

    it('returns unchanged state if thread does not exist', () => {
      const newState = acpAccumulatorReducer(state, {
        type: 'SET_STREAMING',
        worktreeId: 'nonexistent',
        isStreaming: true,
      });

      expect(newState).toBe(state);
    });
  });

  describe('error envelope parity with Rust', () => {
    beforeEach(() => {
      state.threads.set('worktree-1', {
        worktreeId: 'worktree-1',
        acpSessionId: 'session-1',
        messages: [{
          id: 'msg-1',
          role: 'assistant',
          parts: [],
          createdAt: Date.now(),
          lastSequence: 0,
        }],
        sessionStatus: 'Working',
        lastSequence: 0,
        connectionGeneration: 1,
        isStreaming: false,
      });
    });

    const rustErrorCodes = [
      'WORKTREE_NOT_FOUND',
      'AGENT_NOT_FOUND',
      'AGENT_DB_ERROR',
      'ACP_NOT_INITIALIZED',
      'AGENT_SEND_ERROR',
    ] as const;

    rustErrorCodes.forEach((rustCode) => {
      it(`maps Rust error code ${rustCode} to error card in accumulator`, () => {
        const envelope: AcpEventEnvelope = {
          sequence: 1,
          timestamp: Date.now(),
          eventType: 'Error',
          data: {
            worktreeId: 'worktree-1',
            acpSessionId: 'session-1',
            code: 'Internal',
            message: `Server error: ${rustCode}`,
            recoverable: false,
          },
        };

        const newState = acpAccumulatorReducer(state, { type: 'EVENT_RECEIVED', envelope, worktreeId: 'worktree-1' });
        const thread = newState.threads.get('worktree-1')!;

        const errorCard = thread.messages[0].parts[0];
        expect(errorCard.type).toBe('error');
        expect((errorCard as any).recoverable).toBe(false);
      });
    });
  });

  describe('recoverable error retry behavior', () => {
    beforeEach(() => {
      state.threads.set('worktree-1', {
        worktreeId: 'worktree-1',
        acpSessionId: 'session-1',
        messages: [],
        sessionStatus: 'Working',
        lastSequence: 0,
        connectionGeneration: 1,
        isStreaming: false,
      });
    });

    it('recoverable error preserves thread for retry', () => {
      const errorEnvelope: AcpEventEnvelope = {
        sequence: 1,
        timestamp: Date.now(),
        eventType: 'Error',
        data: {
          worktreeId: 'worktree-1',
          acpSessionId: 'session-1',
          code: 'Timeout',
          message: 'Request timed out',
          recoverable: true,
        },
      };

      const newState = acpAccumulatorReducer(state, { type: 'EVENT_RECEIVED', envelope: errorEnvelope, worktreeId: 'worktree-1' });

      expect(newState.threads.has('worktree-1')).toBe(true);
      const thread = newState.threads.get('worktree-1')!;
      const errorCard = thread.messages[0].parts[0];
      expect((errorCard as any).recoverable).toBe(true);
    });

    it('non-recoverable error adds error card but preserves session status', () => {
      state.threads.get('worktree-1')!.sessionStatus = 'Working';

      const errorEnvelope: AcpEventEnvelope = {
        sequence: 1,
        timestamp: Date.now(),
        eventType: 'Error',
        data: {
          worktreeId: 'worktree-1',
          acpSessionId: 'session-1',
          code: 'AgentCrash',
          message: 'Agent process crashed',
          recoverable: false,
        },
      };

      const newState = acpAccumulatorReducer(state, { type: 'EVENT_RECEIVED', envelope: errorEnvelope, worktreeId: 'worktree-1' });
      const thread = newState.threads.get('worktree-1')!;

      const errorCard = thread.messages[0].parts[0];
      expect(errorCard.type).toBe('error');
      expect((errorCard as any).recoverable).toBe(false);
    });

    it('PromptComplete with Error reason marks session complete', () => {
      state.threads.get('worktree-1')!.sessionStatus = 'Working';

      const completeEnvelope: AcpEventEnvelope = {
        sequence: 1,
        timestamp: Date.now(),
        eventType: 'PromptComplete',
        data: {
          worktreeId: 'worktree-1',
          acpSessionId: 'session-1',
          reason: 'Error',
        },
      };

      const newState = acpAccumulatorReducer(state, { type: 'EVENT_RECEIVED', envelope: completeEnvelope, worktreeId: 'worktree-1' });
      const thread = newState.threads.get('worktree-1')!;

      expect(thread.sessionStatus).toBe('Complete');
    });

    it('error after reconnect creates new thread', () => {
      const reconnectState = acpAccumulatorReducer(state, { type: 'CONNECTION_RECONNECTED' });
      expect(reconnectState.threads.size).toBe(0);

      const sessionInitEnvelope: AcpEventEnvelope = {
        sequence: 1,
        timestamp: Date.now(),
        eventType: 'SessionInit',
        data: {
          acpSessionId: 'session-2',
          capabilities: { supportsToolUse: true, supportsContextUpdate: true, supportsCancellation: true },
        },
      };

      let newState = acpAccumulatorReducer(reconnectState, { type: 'EVENT_RECEIVED', envelope: sessionInitEnvelope, worktreeId: 'worktree-1' });
      
      const errorEnvelope: AcpEventEnvelope = {
        sequence: 2,
        timestamp: Date.now(),
        eventType: 'Error',
        data: {
          worktreeId: 'worktree-1',
          acpSessionId: 'session-2',
          code: 'InitFailed',
          message: 'Failed to initialize session',
          recoverable: false,
        },
      };

      newState = acpAccumulatorReducer(newState, { type: 'EVENT_RECEIVED', envelope: errorEnvelope, worktreeId: 'worktree-1' });
      expect(newState.connectionGeneration).toBe(2);
      expect(newState.threads.has('worktree-1')).toBe(true);
      const errorCard = newState.threads.get('worktree-1')!.messages[0].parts[0];
      expect(errorCard.type).toBe('error');
    });
  });

  describe('cancellation cleanup parity', () => {
    beforeEach(() => {
      state.threads.set('worktree-1', {
        worktreeId: 'worktree-1',
        acpSessionId: 'session-1',
        messages: [],
        sessionStatus: 'Working',
        lastSequence: 0,
        connectionGeneration: 1,
        isStreaming: true,
      });
    });

    it('PromptComplete with Cancelled reason stops streaming', () => {
      const envelope: AcpEventEnvelope = {
        sequence: 1,
        timestamp: Date.now(),
        eventType: 'PromptComplete',
        data: {
          worktreeId: 'worktree-1',
          acpSessionId: 'session-1',
          reason: 'Cancelled',
        },
      };

      const newState = acpAccumulatorReducer(state, { type: 'EVENT_RECEIVED', envelope, worktreeId: 'worktree-1' });
      const thread = newState.threads.get('worktree-1')!;

      expect(thread.isStreaming).toBe(false);
    });

    it('SessionStatus Cancelled updates thread status', () => {
      const envelope: AcpEventEnvelope = {
        sequence: 1,
        timestamp: Date.now(),
        eventType: 'SessionStatus',
        data: {
          worktreeId: 'worktree-1',
          acpSessionId: 'session-1',
          status: 'Cancelled',
        },
      };

      const newState = acpAccumulatorReducer(state, { type: 'EVENT_RECEIVED', envelope, worktreeId: 'worktree-1' });
      const thread = newState.threads.get('worktree-1')!;

      expect(thread.sessionStatus).toBe('Cancelled');
    });

    it('FLUSH_THREAD removes thread for worktree', () => {
      state.threads.set('worktree-2', {
        worktreeId: 'worktree-2',
        acpSessionId: 'session-2',
        messages: [],
        sessionStatus: 'Working',
        lastSequence: 0,
        connectionGeneration: 1,
        isStreaming: false,
      });

      const newState = acpAccumulatorReducer(state, { type: 'FLUSH_THREAD', worktreeId: 'worktree-1' });

      expect(newState.threads.has('worktree-1')).toBe(false);
      expect(newState.threads.has('worktree-2')).toBe(true);
    });
  });
});