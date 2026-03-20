// Mock WebSocket before any imports
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

function callCloseHandler() {
  if (currentMockWebSocket?.onclose) currentMockWebSocket.onclose();
}

function callMessageHandler(event: MessageEvent) {
  if (currentMockWebSocket?.onmessage) currentMockWebSocket.onmessage(event);
}

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { YmirClient, getWebSocketClient, resetWebSocketClient } from '../ws';
import { encode, decode } from '@msgpack/msgpack';
import type { ServerMessage, StateSnapshot } from '../../types/generated/protocol';
import { useToastStore, useStore } from '../../store';

const wsMock = vi.fn(function WebSocketMock(this: any, _url: string) {
  currentMockWebSocket = createMockWebSocket();
  return currentMockWebSocket;
});
globalThis.WebSocket = wsMock as any;
(globalThis.WebSocket as any).CONNECTING = 0;
(globalThis.WebSocket as any).OPEN = 1;
(globalThis.WebSocket as any).CLOSING = 2;
(globalThis.WebSocket as any).CLOSED = 3;

describe('YmirClient', () => {
  let client: YmirClient;

  beforeEach(() => {
    resetWebSocketClient();
    vi.clearAllMocks();
    vi.useFakeTimers();
    useToastStore.setState({ notifications: [] });
    // Reset useStore to initial state for test isolation
    useStore.setState({
      workspaces: [],
      worktrees: [],
      agentSessions: [],
      terminalSessions: [],
      connectionStatus: 'closed',
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    client?.disconnect();
  });

  describe('connection', () => {
    it('should connect to WebSocket server', () => {
      client = new YmirClient({ url: 'ws://localhost:7319' });

      expect(globalThis.WebSocket).toHaveBeenCalledWith('ws://localhost:7319');
      expect(client.getStatus()).toBe('connecting');
    });

    it('should update status to open when connected', () => {
      client = new YmirClient({ url: 'ws://localhost:7319' });

      Object.defineProperty(currentMockWebSocket, 'readyState', {
        value: 1,
        writable: true,
      });
      callOpenHandler();

      expect(client.getStatus()).toBe('open');
      expect(client.isConnected()).toBe(true);
    });

    it('should send GetState message on connect', () => {
      client = new YmirClient({ url: 'ws://localhost:7319' });

      Object.defineProperty(currentMockWebSocket, 'readyState', {
        value: 1,
        writable: true,
      });
      currentMockWebSocket.send = vi.fn();
      callOpenHandler();

      expect(currentMockWebSocket.send).toHaveBeenCalled();
      const sentData = currentMockWebSocket.send.mock.calls[0][0];
      const decoded = decodeMessage(sentData);
      expect(decoded.type).toBe('GetState');
    });
  });

  describe('message sending and receiving', () => {
    beforeEach(() => {
      client = new YmirClient({ url: 'ws://localhost:7319' });
      Object.defineProperty(currentMockWebSocket, "readyState", { value: 1, writable: true });
      callOpenHandler();
    });

    it('should send messages as MessagePack binary', () => {
      const message = {
        type: 'Ping' as const,
        timestamp: Date.now(),
      };

      client.send(message);

      expect(currentMockWebSocket.send).toHaveBeenCalled();
      const sentData = currentMockWebSocket.send.mock.calls[currentMockWebSocket.send.mock.calls.length - 1][0];
      expect(sentData).toBeInstanceOf(ArrayBuffer);

      const decoded = decodeMessage(sentData);
      expect(decoded.type).toBe('Ping');
      expect(decoded.version).toBe(1);
    });

    it('should receive and handle server messages', () => {
      const handler = vi.fn();
      client.onMessage('Pong', handler);

      const serverMessage: ServerMessage = {
        type: 'Pong',
        timestamp: Date.now(),
      };

      callMessageHandler({ data: encodeMessage(serverMessage) } as MessageEvent);

      expect(handler).toHaveBeenCalledWith(serverMessage);
    });

    it('should handle multiple message handlers for same type', () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();

      client.onMessage('Pong', handler1);
      client.onMessage('Pong', handler2);

      const serverMessage: ServerMessage = {
        type: 'Pong',
        timestamp: Date.now(),
      };

      callMessageHandler({ data: encodeMessage(serverMessage) } as MessageEvent);

      expect(handler1).toHaveBeenCalledWith(serverMessage);
      expect(handler2).toHaveBeenCalledWith(serverMessage);
    });

    it('should allow unsubscribing from messages', () => {
      const handler = vi.fn();
      const unsubscribe = client.onMessage('Pong', handler);

      const serverMessage: ServerMessage = {
        type: 'Pong',
        timestamp: Date.now(),
      };

      callMessageHandler({ data: encodeMessage(serverMessage) } as MessageEvent);
      expect(handler).toHaveBeenCalledTimes(1);

      unsubscribe();

      callMessageHandler({ data: encodeMessage(serverMessage) } as MessageEvent);
      expect(handler).toHaveBeenCalledTimes(1);
    });
  });

  describe('exponential backoff', () => {
    it('should use correct backoff sequence: 1s, 2s, 4s, 8s, 16s, 30s cap', () => {
      const mathRandomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.5);

      client = new YmirClient({ url: 'ws://localhost:7319' });
      Object.defineProperty(currentMockWebSocket, "readyState", { value: 1, writable: true });
      callOpenHandler();

      const expectedDelays = [1000, 2000, 4000, 8000, 16000];

      for (let i = 0; i < expectedDelays.length; i++) {
        callCloseHandler();
        vi.advanceTimersByTime(expectedDelays[i] * 1.25);
        expect(globalThis.WebSocket).toHaveBeenCalledTimes(i + 2);
      }

      mathRandomSpy.mockRestore();
    });

    it('should cap reconnect delay at maxReconnectDelay (30s default)', () => {
      client = new YmirClient({ url: 'ws://localhost:7319', maxReconnectDelay: 30000 });
      Object.defineProperty(currentMockWebSocket, "readyState", { value: 1, writable: true });
      callOpenHandler();

      for (let i = 0; i < 10; i++) {
        callCloseHandler();
        vi.advanceTimersByTime(36000);
      }

      expect(globalThis.WebSocket).toHaveBeenCalledTimes(11);
    });

    it('should use custom maxReconnectDelay', () => {
      client = new YmirClient({
        url: 'ws://localhost:7319',
        maxReconnectDelay: 5000,
      });
      Object.defineProperty(currentMockWebSocket, "readyState", { value: 1, writable: true });
      callOpenHandler();

      for (let i = 0; i < 10; i++) {
        callCloseHandler();
        vi.advanceTimersByTime(6000);
      }

      expect(globalThis.WebSocket).toHaveBeenCalledTimes(11);
    });
  });

  describe('jitter', () => {
    it('should add random jitter between -20% and +20% of base delay', () => {
      const mathRandomSpy = vi.spyOn(Math, 'random');

      client = new YmirClient({ url: 'ws://localhost:7319' });
      Object.defineProperty(currentMockWebSocket, "readyState", { value: 1, writable: true });
      callOpenHandler();

      mathRandomSpy.mockReturnValue(0);
      callCloseHandler();
      vi.advanceTimersByTime(800);
      expect(globalThis.WebSocket).toHaveBeenCalledTimes(2);

      mathRandomSpy.mockReturnValue(1);
      callCloseHandler();
      vi.advanceTimersByTime(2400);
      expect(globalThis.WebSocket).toHaveBeenCalledTimes(3);

      mathRandomSpy.mockRestore();
    });

    it('should apply jitter to capped delay', () => {
      const mathRandomSpy = vi.spyOn(Math, 'random');
      mathRandomSpy.mockReturnValue(0.5);

      client = new YmirClient({ url: 'ws://localhost:7319', maxReconnectDelay: 10000 });
      Object.defineProperty(currentMockWebSocket, "readyState", { value: 1, writable: true });
      callOpenHandler();

      for (let i = 0; i < 7; i++) {
        callCloseHandler();
        vi.advanceTimersByTime(12000);
      }

      expect(globalThis.WebSocket).toHaveBeenCalledTimes(8);
      mathRandomSpy.mockRestore();
    });
  });

  describe('reconnection', () => {
    it('should not reconnect when reconnectEnabled is false', () => {
      client = new YmirClient({
        url: 'ws://localhost:7319',
        reconnectEnabled: false,
      });
      Object.defineProperty(currentMockWebSocket, "readyState", { value: 1, writable: true });
      callOpenHandler();

      callCloseHandler();

      vi.advanceTimersByTime(10000);
      expect(globalThis.WebSocket).toHaveBeenCalledTimes(1);
      expect(client.getStatus()).toBe('closed');
    });

    it('should call reconnect handlers on successful reconnect', () => {
      client = new YmirClient({ url: 'ws://localhost:7319' });
      Object.defineProperty(currentMockWebSocket, "readyState", { value: 1, writable: true });
      callOpenHandler();

      const reconnectHandler = vi.fn();
      client.onReconnect(reconnectHandler);

      callCloseHandler();
      vi.advanceTimersByTime(1200);
      Object.defineProperty(currentMockWebSocket, "readyState", { value: 1, writable: true });
      callOpenHandler();

      expect(reconnectHandler).toHaveBeenCalled();
    });

    it('should show success toast on reconnect', () => {
      client = new YmirClient({ url: 'ws://localhost:7319' });
      Object.defineProperty(currentMockWebSocket, "readyState", { value: 1, writable: true });
      callOpenHandler();

      callCloseHandler();
      vi.advanceTimersByTime(1200);
      Object.defineProperty(currentMockWebSocket, "readyState", { value: 1, writable: true });
      callOpenHandler();

      const notifications = useToastStore.getState().notifications;
      expect(notifications.length).toBeGreaterThan(0);
      expect(notifications[0].variant).toBe('success');
      expect(notifications[0].title).toBe('Reconnected');
    });

    it('should not show toast on initial connection', () => {
      client = new YmirClient({ url: 'ws://localhost:7319' });
      Object.defineProperty(currentMockWebSocket, "readyState", { value: 1, writable: true });
      callOpenHandler();

      const notifications = useToastStore.getState().notifications;
      expect(notifications.length).toBe(0);
    });
  });

  describe('message queue', () => {
    it('should queue messages when disconnected', () => {
      client = new YmirClient({ url: 'ws://localhost:7319' });

      const message = {
        type: 'Ping' as const,
        id: 123,
        timestamp: Date.now(),
      };

      expect(() => client.send(message)).not.toThrow();
    });

    it('should flush queued messages on reconnect', () => {
      client = new YmirClient({ url: 'ws://localhost:7319' });

      const message = {
        type: 'Ping' as const,
        id: 123,
        timestamp: Date.now(),
      };

      client.send(message);

      Object.defineProperty(currentMockWebSocket, "readyState", { value: 1, writable: true });
      callOpenHandler();

      expect(currentMockWebSocket.send).toHaveBeenCalled();
    });

    it('should flush multiple queued messages in order', () => {
      client = new YmirClient({ url: 'ws://localhost:7319' });

      const messages = [
        { type: 'Ping' as const, timestamp: 1 },
        { type: 'Ping' as const, timestamp: 2 },
        { type: 'Ping' as const, timestamp: 3 },
      ];

      messages.forEach(msg => { client.send(msg); });

      Object.defineProperty(currentMockWebSocket, "readyState", { value: 1, writable: true });
      currentMockWebSocket.send = vi.fn();
      callOpenHandler();

      expect(currentMockWebSocket.send).toHaveBeenCalledTimes(4);
    });
  });

 describe('state snapshot handling', () => {
 it('should handle StateSnapshot message and update store', () => {
 client = new YmirClient({ url: 'ws://localhost:7319' });
 Object.defineProperty(currentMockWebSocket, "readyState", { value: 1, writable: true });
 callOpenHandler();

 const snapshot: StateSnapshot = {
 type: 'StateSnapshot',
 requestId: 'test-request-id',
 workspaces: [{ id: 'ws-1', name: 'Test', rootPath: '/test', createdAt: 1, updatedAt: 1 }],
 worktrees: [],
 agentSessions: [],
 terminalSessions: [],
 settings: [],
 };

 callMessageHandler({ data: encodeMessage(snapshot) } as MessageEvent);

 const store = useStore.getState();
 expect(store.workspaces).toHaveLength(1);
 expect(store.workspaces[0]).toMatchObject({
 id: 'ws-1',
 name: 'Test',
 rootPath: '/test',
 });
 });
 });

  describe('disconnect with close code', () => {
    it('should close WebSocket with default code 1000', () => {
      client = new YmirClient({ url: 'ws://localhost:7319' });
      Object.defineProperty(currentMockWebSocket, "readyState", { value: 1, writable: true });
      callOpenHandler();

      client.disconnect();

      expect(currentMockWebSocket.close).toHaveBeenCalledWith(1000);
    });

    it('should close WebSocket with custom code', () => {
      client = new YmirClient({ url: 'ws://localhost:7319' });
      Object.defineProperty(currentMockWebSocket, "readyState", { value: 1, writable: true });
      callOpenHandler();

      client.disconnect(1001);

      expect(currentMockWebSocket.close).toHaveBeenCalledWith(1001);
    });
  });

  describe('heartbeat', () => {
    it('should send ping on heartbeat interval', () => {
      client = new YmirClient({
        url: 'ws://localhost:7319',
        heartbeatInterval: 30000,
      });
      Object.defineProperty(currentMockWebSocket, "readyState", { value: 1, writable: true });
      callOpenHandler();

      vi.advanceTimersByTime(30000);

      expect(currentMockWebSocket.send).toHaveBeenCalled();
      const calls = currentMockWebSocket.send.mock.calls;
      const lastCall = calls[calls.length - 1];
      const decoded = decodeMessage(lastCall[0]);
      expect(decoded.type).toBe('Ping');
    });

    it('should handle pong response', () => {
      client = new YmirClient({ url: 'ws://localhost:7319' });
      Object.defineProperty(currentMockWebSocket, "readyState", { value: 1, writable: true });
      callOpenHandler();

      vi.advanceTimersByTime(30000);

      const pingMessage = decodeMessage(currentMockWebSocket.send.mock.calls[currentMockWebSocket.send.mock.calls.length - 1][0]);
      const pongMessage: ServerMessage = {
        type: 'Pong',
        timestamp: (pingMessage as any).timestamp,
      };

      callMessageHandler({ data: encodeMessage(pongMessage) } as MessageEvent);

      expect(client.getStatus()).toBe('open');
    });
  });

  describe('status handlers', () => {
    it('should notify status change handlers', () => {
      client = new YmirClient({ url: 'ws://localhost:7319' });

      const statusHandler = vi.fn();
      client.onStatusChange(statusHandler);

      Object.defineProperty(currentMockWebSocket, "readyState", { value: 1, writable: true });
      callOpenHandler();

      expect(statusHandler).toHaveBeenCalledWith('open');
    });

    it('should notify disconnect handlers', () => {
      client = new YmirClient({ url: 'ws://localhost:7319' });
      Object.defineProperty(currentMockWebSocket, "readyState", { value: 1, writable: true });
      callOpenHandler();

      const disconnectHandler = vi.fn();
      client.onDisconnect(disconnectHandler);

      callCloseHandler();

      expect(disconnectHandler).toHaveBeenCalled();
    });

    it('should update status to reconnecting on disconnect', () => {
      client = new YmirClient({ url: 'ws://localhost:7319' });
      Object.defineProperty(currentMockWebSocket, "readyState", { value: 1, writable: true });
      callOpenHandler();

      callCloseHandler();

      expect(client.getStatus()).toBe('reconnecting');
    });
  });

  describe('singleton', () => {
    it('should return singleton instance', () => {
      const client1 = getWebSocketClient();
      const client2 = getWebSocketClient();

      expect(client1).toBe(client2);
    });

    it('should reset singleton instance', () => {
      const client1 = getWebSocketClient();
      resetWebSocketClient();
      const client2 = getWebSocketClient();

      expect(client1).not.toBe(client2);
    });
  });

  describe('WS-ACP adapter', () => {
    const testWorktreeId = 'test-worktree-id';
    const testAcpSessionId = 'test-acp-session-id';

    describe('decodeAcpEnvelope', () => {
      it('should decode valid AcpWireEvent envelope', () => {
        client = new YmirClient({ url: 'ws://localhost:7319' });
        Object.defineProperty(currentMockWebSocket, "readyState", { value: 1, writable: true });
        callOpenHandler();

        const envelope: import('../../types/generated/protocol').AcpEventEnvelope = {
          sequence: 1,
          timestamp: Date.now(),
          eventType: 'SessionStatus',
          correlationId: { value: 'test-correlation' },
          data: {
            worktreeId: testWorktreeId,
            acpSessionId: testAcpSessionId,
            status: 'Working',
          },
        };

        const message: ServerMessage = {
          type: 'AcpWireEvent',
          envelope,
        };

        expect(() => {
          callMessageHandler({ data: encodeMessage(message) } as MessageEvent);
        }).not.toThrow();
      });

      it('should decode envelope with SessionInit event type', () => {
        client = new YmirClient({ url: 'ws://localhost:7319' });
        Object.defineProperty(currentMockWebSocket, "readyState", { value: 1, writable: true });
        callOpenHandler();

        const envelope: import('../../types/generated/protocol').AcpEventEnvelope = {
          sequence: 1,
          timestamp: Date.now(),
          eventType: 'SessionInit',
          data: {
            acpSessionId: testAcpSessionId,
            capabilities: {
              supportsToolUse: true,
              supportsContextUpdate: true,
              supportsCancellation: true,
            },
          },
        };

        const message: ServerMessage = {
          type: 'AcpWireEvent',
          envelope,
        };

        expect(() => {
          callMessageHandler({ data: encodeMessage(message) } as MessageEvent);
        }).not.toThrow();
      });

      it('should decode envelope with PromptChunk event type', () => {
        client = new YmirClient({ url: 'ws://localhost:7319' });
        Object.defineProperty(currentMockWebSocket, "readyState", { value: 1, writable: true });
        callOpenHandler();

        const envelope: import('../../types/generated/protocol').AcpEventEnvelope = {
          sequence: 2,
          timestamp: Date.now(),
          eventType: 'PromptChunk',
          data: {
            worktreeId: testWorktreeId,
            acpSessionId: testAcpSessionId,
            content: { type: 'Text', data: 'test content' },
            isFinal: false,
          },
        };

        const message: ServerMessage = {
          type: 'AcpWireEvent',
          envelope,
        };

        expect(() => {
          callMessageHandler({ data: encodeMessage(message) } as MessageEvent);
        }).not.toThrow();
      });
    });

    describe('malformed payload handling', () => {
      it('should return null for non-AcpWireEvent messages', () => {
        client = new YmirClient({ url: 'ws://localhost:7319' });
        Object.defineProperty(currentMockWebSocket, "readyState", { value: 1, writable: true });
        callOpenHandler();

        const message: ServerMessage = {
          type: 'Pong',
          timestamp: Date.now(),
        };

        const result = (client as any).decodeAcpEnvelope(message);
        expect(result).toBeNull();
      });

      it('should handle missing envelope object gracefully', () => {
        client = new YmirClient({ url: 'ws://localhost:7319' });

        const message: ServerMessage = {
          type: 'AcpWireEvent',
          envelope: null as any,
        };

        const result = (client as any).decodeAcpEnvelope(message);
        expect(result).toBeNull();
      });

      it('should handle invalid envelope type gracefully', () => {
        client = new YmirClient({ url: 'ws://localhost:7319' });

        const message: ServerMessage = {
          type: 'AcpWireEvent',
          envelope: 'invalid' as any,
        };

        const result = (client as any).decodeAcpEnvelope(message);
        expect(result).toBeNull();
      });

      it('should handle missing sequence field', () => {
        client = new YmirClient({ url: 'ws://localhost:7319' });

        const message: ServerMessage = {
          type: 'AcpWireEvent',
          envelope: {
            timestamp: Date.now(),
            eventType: 'SessionStatus',
            data: {},
          } as any,
        };

        const result = (client as any).decodeAcpEnvelope(message);
        expect(result).toBeNull();
      });

      it('should handle invalid sequence type', () => {
        client = new YmirClient({ url: 'ws://localhost:7319' });

        const message: ServerMessage = {
          type: 'AcpWireEvent',
          envelope: {
            sequence: 'invalid' as any,
            timestamp: Date.now(),
            eventType: 'SessionStatus',
            data: {},
          },
        };

        const result = (client as any).decodeAcpEnvelope(message);
        expect(result).toBeNull();
      });

      it('should handle missing timestamp field', () => {
        client = new YmirClient({ url: 'ws://localhost:7319' });

        const message: ServerMessage = {
          type: 'AcpWireEvent',
          envelope: {
            sequence: 1,
            eventType: 'SessionStatus',
            data: {},
          } as any,
        };

        const result = (client as any).decodeAcpEnvelope(message);
        expect(result).toBeNull();
      });

      it('should handle missing eventType field', () => {
        client = new YmirClient({ url: 'ws://localhost:7319' });

        const message: ServerMessage = {
          type: 'AcpWireEvent',
          envelope: {
            sequence: 1,
            timestamp: Date.now(),
            data: {},
          } as any,
        };

        const result = (client as any).decodeAcpEnvelope(message);
        expect(result).toBeNull();
      });

      it('should handle missing data field', () => {
        client = new YmirClient({ url: 'ws://localhost:7319' });

        const message: ServerMessage = {
          type: 'AcpWireEvent',
          envelope: {
            sequence: 1,
            timestamp: Date.now(),
            eventType: 'SessionStatus',
          } as any,
        };

        const result = (client as any).decodeAcpEnvelope(message);
        expect(result).toBeNull();
      });

      it('should handle invalid correlationId if present', () => {
        client = new YmirClient({ url: 'ws://localhost:7319' });

        const message: ServerMessage = {
          type: 'AcpWireEvent',
          envelope: {
            sequence: 1,
            timestamp: Date.now(),
            eventType: 'SessionStatus',
            correlationId: 'invalid' as any,
            data: {},
          },
        };

        const result = (client as any).decodeAcpEnvelope(message);
        expect(result).toBeNull();
      });
    });

    describe('event ordering and sequence handling', () => {
      it('should preserve sequence numbers across events', () => {
        client = new YmirClient({ url: 'ws://localhost:7319' });
        Object.defineProperty(currentMockWebSocket, "readyState", { value: 1, writable: true });
        callOpenHandler();

        const envelopes: import('../../types/generated/protocol').AcpEventEnvelope[] = [
          {
            sequence: 1,
            timestamp: Date.now(),
            eventType: 'SessionInit',
            data: {
              acpSessionId: testAcpSessionId,
              capabilities: {
                supportsToolUse: true,
                supportsContextUpdate: true,
                supportsCancellation: true,
              },
            },
          },
          {
            sequence: 2,
            timestamp: Date.now(),
            eventType: 'PromptChunk',
            data: {
              worktreeId: testWorktreeId,
              acpSessionId: testAcpSessionId,
              content: { type: 'Text', data: 'chunk 1' },
              isFinal: false,
            },
          },
          {
            sequence: 3,
            timestamp: Date.now(),
            eventType: 'PromptChunk',
            data: {
              worktreeId: testWorktreeId,
              acpSessionId: testAcpSessionId,
              content: { type: 'Text', data: 'chunk 2' },
              isFinal: false,
            },
          },
        ];

        envelopes.forEach((envelope) => {
          const message: ServerMessage = {
            type: 'AcpWireEvent',
            envelope,
          };
          expect(() => {
            callMessageHandler({ data: encodeMessage(message) } as MessageEvent);
          }).not.toThrow();
        });
      });

      it('should handle correlationId for request-response tracking', () => {
        client = new YmirClient({ url: 'ws://localhost:7319' });
        Object.defineProperty(currentMockWebSocket, "readyState", { value: 1, writable: true });
        callOpenHandler();

        const envelope: import('../../types/generated/protocol').AcpEventEnvelope = {
          sequence: 1,
          timestamp: Date.now(),
          eventType: 'SessionInit',
          correlationId: { value: 'req-123' },
          data: {
            acpSessionId: testAcpSessionId,
            capabilities: {
              supportsToolUse: true,
              supportsContextUpdate: true,
              supportsCancellation: true,
            },
          },
        };

        const message: ServerMessage = {
          type: 'AcpWireEvent',
          envelope,
        };

        expect(() => {
          callMessageHandler({ data: encodeMessage(message) } as MessageEvent);
        }).not.toThrow();
      });

      it('should handle monotonically increasing sequence numbers', () => {
        client = new YmirClient({ url: 'ws://localhost:7319' });
        Object.defineProperty(currentMockWebSocket, "readyState", { value: 1, writable: true });
        callOpenHandler();

        const baseSequence = 100;
        for (let i = 0; i < 5; i++) {
          const envelope: import('../../types/generated/protocol').AcpEventEnvelope = {
            sequence: baseSequence + i,
            timestamp: Date.now() + i,
            eventType: 'PromptChunk',
            data: {
              worktreeId: testWorktreeId,
              acpSessionId: testAcpSessionId,
              content: { type: 'Text', data: `chunk ${i}` },
              isFinal: i === 4,
            },
          };

          const message: ServerMessage = {
            type: 'AcpWireEvent',
            envelope,
          };

          expect(() => {
            callMessageHandler({ data: encodeMessage(message) } as MessageEvent);
          }).not.toThrow();
        }
      });
    });

    describe('event type discrimination', () => {
      it('should handle all eight ACP event types', () => {
        client = new YmirClient({ url: 'ws://localhost:7319' });
        Object.defineProperty(currentMockWebSocket, "readyState", { value: 1, writable: true });
        callOpenHandler();

        const eventTypes: import('../../types/generated/protocol').AcpEvent['eventType'][] = [
          'SessionInit',
          'SessionStatus',
          'PromptChunk',
          'PromptComplete',
          'ToolUse',
          'ContextUpdate',
          'Error',
          'ResumeMarker',
        ];

        eventTypes.forEach((eventType) => {
          let envelope: import('../../types/generated/protocol').AcpEventEnvelope;

          switch (eventType) {
            case 'SessionInit':
              envelope = {
                sequence: 1,
                timestamp: Date.now(),
                eventType,
                data: {
                  acpSessionId: testAcpSessionId,
                  capabilities: {
                    supportsToolUse: true,
                    supportsContextUpdate: true,
                    supportsCancellation: true,
                  },
                },
              };
              break;
            case 'SessionStatus':
              envelope = {
                sequence: 2,
                timestamp: Date.now(),
                eventType,
                data: {
                  worktreeId: testWorktreeId,
                  acpSessionId: testAcpSessionId,
                  status: 'Working',
                },
              };
              break;
            case 'PromptChunk':
              envelope = {
                sequence: 3,
                timestamp: Date.now(),
                eventType,
                data: {
                  worktreeId: testWorktreeId,
                  acpSessionId: testAcpSessionId,
                  content: { type: 'Text', data: 'test' },
                  isFinal: false,
                },
              };
              break;
            case 'PromptComplete':
              envelope = {
                sequence: 4,
                timestamp: Date.now(),
                eventType,
                data: {
                  worktreeId: testWorktreeId,
                  acpSessionId: testAcpSessionId,
                  reason: 'Normal',
                },
              };
              break;
            case 'ToolUse':
              envelope = {
                sequence: 5,
                timestamp: Date.now(),
                eventType,
                data: {
                  worktreeId: testWorktreeId,
                  acpSessionId: testAcpSessionId,
                  toolUseId: 'tool-1',
                  toolName: 'test-tool',
                  status: 'Completed',
                },
              };
              break;
            case 'ContextUpdate':
              envelope = {
                sequence: 6,
                timestamp: Date.now(),
                eventType,
                data: {
                  worktreeId: testWorktreeId,
                  acpSessionId: testAcpSessionId,
                  updateType: 'FileRead',
                  data: 'file content',
                },
              };
              break;
            case 'Error':
              envelope = {
                sequence: 7,
                timestamp: Date.now(),
                eventType,
                data: {
                  worktreeId: testWorktreeId,
                  acpSessionId: testAcpSessionId,
                  code: 'Internal',
                  message: 'test error',
                  recoverable: true,
                },
              };
              break;
            case 'ResumeMarker':
              envelope = {
                sequence: 8,
                timestamp: Date.now(),
                eventType,
                data: {
                  worktreeId: testWorktreeId,
                  acpSessionId: testAcpSessionId,
                  lastSequence: 7,
                },
              };
              break;
          }

          const message: ServerMessage = {
            type: 'AcpWireEvent',
            envelope,
          };

          expect(() => {
            callMessageHandler({ data: encodeMessage(message) } as MessageEvent);
          }).not.toThrow();
        });
      });
    });
  });

  describe('Rust-TS error code parity', () => {
    it('handles Error server message with Rust error codes', () => {
      client = new YmirClient({ url: 'ws://localhost:7319' });
      Object.defineProperty(currentMockWebSocket, "readyState", { value: 1, writable: true });
      callOpenHandler();

      const rustErrorCodes = [
        'WORKTREE_NOT_FOUND',
        'AGENT_NOT_FOUND',
        'AGENT_DB_ERROR',
        'ACP_NOT_INITIALIZED',
        'AGENT_SEND_ERROR',
      ];

      rustErrorCodes.forEach((code) => {
        const errorMessage: ServerMessage = {
          type: 'Error',
          code,
          message: `Server error: ${code}`,
          details: null,
          requestId: null,
        };

        expect(() => {
          callMessageHandler({ data: encodeMessage(errorMessage) } as MessageEvent);
        }).not.toThrow();
      });
    });

    it('Error message structure matches Rust Error struct', () => {
      client = new YmirClient({ url: 'ws://localhost:7319' });
      Object.defineProperty(currentMockWebSocket, "readyState", { value: 1, writable: true });
      callOpenHandler();

      const errorMessage = {
        type: 'Error' as const,
        code: 'WORKTREE_NOT_FOUND',
        message: 'Worktree not found',
        details: 'Additional context',
        requestId: 'req-123',
      };

      const encoded = encodeMessage(errorMessage);

      expect(() => {
        callMessageHandler({ data: encoded } as MessageEvent);
      }).not.toThrow();
    });

    it('AgentRemoved message matches Rust AgentRemoved struct', () => {
      const agentRemovedMessage = {
        type: 'AgentRemoved' as const,
        id: 'session-uuid',
        worktreeId: 'worktree-uuid',
      };

      const encoded = encodeMessage(agentRemovedMessage);

      expect(() => {
        callMessageHandler({ data: encoded } as MessageEvent);
      }).not.toThrow();
    });

    it('Ack message matches Rust Ack struct with status', () => {
      const ackMessage = {
        type: 'Ack' as const,
        messageId: 'msg-uuid',
        status: 'success' as const,
      };

      const encoded = encodeMessage(ackMessage);

      expect(() => {
        callMessageHandler({ data: encoded } as MessageEvent);
      }).not.toThrow();
    });

    it('AgentStatusUpdate message matches Rust AgentStatusUpdate struct', () => {
      const statusUpdateMessage = {
        type: 'AgentStatusUpdate' as const,
        id: 'session-uuid',
        worktreeId: 'worktree-uuid',
        agentType: 'claude',
        status: 'working' as const,
        startedAt: Date.now(),
      };

      const encoded = encodeMessage(statusUpdateMessage);

      expect(() => {
        callMessageHandler({ data: encoded } as MessageEvent);
      }).not.toThrow();
    });
  });
});

function encodeMessage(message: any): ArrayBuffer {
  const { type, ...data } = message;
  const wrapped = {
    version: 1,
    type,
    data,
  };
  const encoded = encode(wrapped);
  return encoded.buffer.slice(encoded.byteOffset, encoded.byteOffset + encoded.byteLength) as ArrayBuffer;
}

function decodeMessage(data: ArrayBuffer): any {
  return decode(new Uint8Array(data));
}