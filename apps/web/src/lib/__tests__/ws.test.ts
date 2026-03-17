// Mock WebSocket before any imports
// Store reference to the current mock for test helpers
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
import type { ServerMessage } from '../../types/protocol';

// Set up the mock implementation
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
        id: 123,
        timestamp: Date.now(),
      };

      client.send(message);

      expect(currentMockWebSocket.send).toHaveBeenCalled();
      const sentData = currentMockWebSocket.send.mock.calls[currentMockWebSocket.send.mock.calls.length - 1][0];
      expect(sentData).toBeInstanceOf(ArrayBuffer);

      const decoded = decodeMessage(sentData);
      expect(decoded).toEqual(message);
    });

    it('should receive and handle server messages', () => {
      const handler = vi.fn();
      client.onMessage('Pong', handler);

      const serverMessage: ServerMessage = {
        type: 'Pong',
        id: 123,
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
        id: 123,
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
        id: 123,
        timestamp: Date.now(),
      };

      callMessageHandler({ data: encodeMessage(serverMessage) } as MessageEvent);
      expect(handler).toHaveBeenCalledTimes(1);

      unsubscribe();

      callMessageHandler({ data: encodeMessage(serverMessage) } as MessageEvent);
      expect(handler).toHaveBeenCalledTimes(1);
    });
  });

  describe('reconnection', () => {
    it('should reconnect with exponential backoff', () => {
      client = new YmirClient({ url: 'ws://localhost:7319' });
      Object.defineProperty(currentMockWebSocket, "readyState", { value: 1, writable: true });
      callOpenHandler();

      callCloseHandler();
      expect(client.getStatus()).toBe('reconnecting');

      vi.advanceTimersByTime(1000);
      expect(globalThis.WebSocket).toHaveBeenCalledTimes(2);

      callCloseHandler();
      vi.advanceTimersByTime(2000);
      expect(globalThis.WebSocket).toHaveBeenCalledTimes(3);

      callCloseHandler();
      vi.advanceTimersByTime(4000);
      expect(globalThis.WebSocket).toHaveBeenCalledTimes(4);
    });

    it('should cap reconnect delay at maxReconnectDelay', () => {
      client = new YmirClient({
        url: 'ws://localhost:7319',
        maxReconnectDelay: 5000,
      });
      Object.defineProperty(currentMockWebSocket, "readyState", { value: 1, writable: true });
      callOpenHandler();

      for (let i = 0; i < 10; i++) {
        callCloseHandler();
        // Advance by more than max to account for jitter
        vi.advanceTimersByTime(6000);
      }

      expect(globalThis.WebSocket).toHaveBeenCalledTimes(11);
    });

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
      vi.advanceTimersByTime(1000);
      Object.defineProperty(currentMockWebSocket, "readyState", { value: 1, writable: true });
      callOpenHandler();

      expect(reconnectHandler).toHaveBeenCalled();
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
        id: (pingMessage as any).id,
        timestamp: Date.now(),
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
});

function encodeMessage(message: any): ArrayBuffer {
  const encoded = encode(message);
  return encoded.buffer.slice(encoded.byteOffset, encoded.byteOffset + encoded.byteLength) as ArrayBuffer;
}

function decodeMessage(data: ArrayBuffer): any {
  return decode(new Uint8Array(data));
}
