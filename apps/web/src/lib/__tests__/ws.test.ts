// Mock WebSocket before any imports
const eventHandlers: Record<string, Function> = {};
const mockWebSocket = {
  readyState: WebSocket.CONNECTING,
  send: vi.fn(),
  close: vi.fn(),
  addEventListener: vi.fn((event: string, handler: Function) => {
    eventHandlers[event] = handler;
  }),
  removeEventListener: vi.fn(),
  get onopen() { return eventHandlers['open']; },
  set onopen(handler: Function) { eventHandlers['open'] = handler; },
  get onclose() { return eventHandlers['close']; },
  set onclose(handler: Function) { eventHandlers['close'] = handler; },
  get onmessage() { return eventHandlers['message']; },
  set onmessage(handler: Function) { eventHandlers['message'] = handler; },
  get onerror() { return eventHandlers['error']; },
  set onerror(handler: Function) { eventHandlers['error'] = handler; },
};

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { YmirClient, getWebSocketClient, resetWebSocketClient } from '../ws';
import { encode } from '@msgpack/msgpack';
import type { ServerMessage } from '../../types/protocol';

// Set up the mock implementation
global.WebSocket = vi.fn(() => mockWebSocket);

describe('YmirClient', () => {
  let client: YmirClient;

  beforeEach(() => {
    resetWebSocketClient();
    vi.clearAllMocks();
    vi.useFakeTimers();
    
    // Reset mock state
    mockWebSocket.readyState = WebSocket.CONNECTING;
    mockWebSocket.send.mockClear();
    mockWebSocket.close.mockClear();
    mockWebSocket.addEventListener.mockClear();
    mockWebSocket.removeEventListener.mockClear();
    Object.keys(eventHandlers).forEach(key => {
      delete eventHandlers[key];
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    client?.disconnect();
  });

  describe('connection', () => {
    it('should connect to WebSocket server', () => {
      client = new YmirClient({ url: 'ws://localhost:7319' });
      
      expect(global.WebSocket).toHaveBeenCalledWith('ws://localhost:7319');
      expect(client.getStatus()).toBe('connecting');
    });

    it('should update status to open when connected', () => {
      client = new YmirClient({ url: 'ws://localhost:7319' });
      
      // Simulate connection
      mockWebSocket.readyState = WebSocket.OPEN;
      mockWebSocket.onopen();
      
      expect(client.getStatus()).toBe('open');
      expect(client.isConnected()).toBe(true);
    });

    it('should send GetState message on connect', () => {
      client = new YmirClient({ url: 'ws://localhost:7319' });
      
      mockWebSocket.readyState = WebSocket.OPEN;
      mockWebSocket.send = vi.fn();
      mockWebSocket.onopen();
      
      // GetState message should be sent
      expect(mockWebSocket.send).toHaveBeenCalled();
      const sentData = mockWebSocket.send.mock.calls[0][0];
      const decoded = decodeMessage(sentData);
      expect(decoded.type).toBe('GetState');
    });
  });

  describe('message sending and receiving', () => {
    beforeEach(() => {
      client = new YmirClient({ url: 'ws://localhost:7319' });
      mockWebSocket.readyState = WebSocket.OPEN;
      mockWebSocket.onopen();
    });

    it('should send messages as MessagePack binary', () => {
      const message = {
        type: 'Ping',
        id: 123,
        timestamp: Date.now(),
      };

      client.send(message);

      expect(mockWebSocket.send).toHaveBeenCalled();
      const sentData = mockWebSocket.send.mock.calls[0][0];
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

      mockWebSocket.onmessage({ data: encodeMessage(serverMessage) });

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

      mockWebSocket.onmessage({ data: encodeMessage(serverMessage) });

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

      // First message should be received
      mockWebSocket.onmessage({ data: encodeMessage(serverMessage) });
      expect(handler).toHaveBeenCalledTimes(1);

      // Unsubscribe
      unsubscribe();

      // Second message should not be received
      mockWebSocket.onmessage({ data: encodeMessage(serverMessage) });
      expect(handler).toHaveBeenCalledTimes(1);
    });
  });

  describe('reconnection', () => {
    it('should reconnect with exponential backoff', () => {
      client = new YmirClient({ url: 'ws://localhost:7319' });
      mockWebSocket.readyState = WebSocket.OPEN;
      mockWebSocket.onopen();

      // Close connection
      mockWebSocket.onclose();
      expect(client.getStatus()).toBe('reconnecting');

      // First reconnect attempt should be after ~1 second
      vi.advanceTimersByTime(1000);
      expect(global.WebSocket).toHaveBeenCalledTimes(2);

      // Close again
      mockWebSocket.onclose();

      // Second reconnect attempt should be after ~2 seconds
      vi.advanceTimersByTime(2000);
      expect(global.WebSocket).toHaveBeenCalledTimes(3);

      // Close again
      mockWebSocket.onclose();

      // Third reconnect attempt should be after ~4 seconds
      vi.advanceTimersByTime(4000);
      expect(global.WebSocket).toHaveBeenCalledTimes(4);
    });

    it('should cap reconnect delay at maxReconnectDelay', () => {
      client = new YmirClient({ 
        url: 'ws://localhost:7319',
        maxReconnectDelay: 5000,
      });
      mockWebSocket.readyState = WebSocket.OPEN;
      mockWebSocket.onopen();

      // Simulate multiple disconnections
      for (let i = 0; i < 10; i++) {
        mockWebSocket.onclose();
        vi.advanceTimersByTime(5000);
      }

      // Should not exceed maxReconnectDelay
      expect(global.WebSocket).toHaveBeenCalledTimes(11);
    });

    it('should not reconnect when reconnectEnabled is false', () => {
      client = new YmirClient({ 
        url: 'ws://localhost:7319',
        reconnectEnabled: false,
      });
      mockWebSocket.readyState = WebSocket.OPEN;
      mockWebSocket.onopen();

      // Close connection
      mockWebSocket.onclose();

      // Should not attempt to reconnect
      vi.advanceTimersByTime(10000);
      expect(global.WebSocket).toHaveBeenCalledTimes(1);
      expect(client.getStatus()).toBe('closed');
    });

    it('should call reconnect handlers on successful reconnect', () => {
      client = new YmirClient({ url: 'ws://localhost:7319' });
      mockWebSocket.readyState = WebSocket.OPEN;
      mockWebSocket.onopen();

      const reconnectHandler = vi.fn();
      client.onReconnect(reconnectHandler);

      // Close and reconnect
      mockWebSocket.onclose();
      vi.advanceTimersByTime(1000);

      // Simulate successful reconnect
      mockWebSocket.readyState = WebSocket.OPEN;
      mockWebSocket.onopen();

      expect(reconnectHandler).toHaveBeenCalled();
    });
  });

  describe('message queue', () => {
    it('should queue messages when disconnected', () => {
      client = new YmirClient({ url: 'ws://localhost:7319' });
      
      // Send message while disconnected
      const message = {
        type: 'Ping',
        id: 123,
        timestamp: Date.now(),
      };

      client.send(message);
      expect(mockWebSocket.send).not.toHaveBeenCalled();

      // Connect
      mockWebSocket.readyState = WebSocket.OPEN;
      mockWebSocket.onopen();

      // Message should be sent after connection
      expect(mockWebSocket.send).toHaveBeenCalled();
      const sentData = mockWebSocket.send.mock.calls[0][0];
      const decoded = decodeMessage(sentData);
      expect(decoded).toEqual(message);
    });

    it('should flush queued messages on reconnect', () => {
      client = new YmirClient({ url: 'ws://localhost:7319' });
      mockWebSocket.readyState = WebSocket.OPEN;
      mockWebSocket.onopen();

      // Close connection
      mockWebSocket.onclose();

      // Queue multiple messages
      const messages = [
        { type: 'Ping', id: 1, timestamp: Date.now() },
        { type: 'Ping', id: 2, timestamp: Date.now() },
        { type: 'Ping', id: 3, timestamp: Date.now() },
      ];

      messages.forEach(msg => {
        client.send(msg);
      });
      expect(mockWebSocket.send).toHaveBeenCalledTimes(1); // Only GetState

      // Reconnect
      vi.advanceTimersByTime(1000);
      mockWebSocket.readyState = WebSocket.OPEN;
      mockWebSocket.send = vi.fn();
      mockWebSocket.onopen();

      // All queued messages should be sent
      expect(mockWebSocket.send).toHaveBeenCalledTimes(4); // GetState + 3 queued
    });
  });

  describe('heartbeat', () => {
    it('should send ping on heartbeat interval', () => {
      client = new YmirClient({ 
        url: 'ws://localhost:7319',
        heartbeatInterval: 30000,
      });
      mockWebSocket.readyState = WebSocket.OPEN;
      mockWebSocket.onopen();

      // Should send ping after interval
      vi.advanceTimersByTime(30000);
      expect(mockWebSocket.send).toHaveBeenCalled();
      
      const sentData = mockWebSocket.send.mock.calls[mockWebSocket.send.mock.calls.length - 1][0];
      const decoded = decodeMessage(sentData);
      expect(decoded.type).toBe('Ping');
    });

    it('should handle pong response', () => {
      client = new YmirClient({ url: 'ws://localhost:7319' });
      mockWebSocket.readyState = WebSocket.OPEN;
      mockWebSocket.onopen();

      // Send ping
      vi.advanceTimersByTime(30000);

      // Send pong response
      const pingMessage = decodeMessage(mockWebSocket.send.mock.calls[mockWebSocket.send.mock.calls.length - 1][0]);
      const pongMessage: ServerMessage = {
        type: 'Pong',
        id: (pingMessage as any).id,
        timestamp: Date.now(),
      };

      mockWebSocket.onmessage({ data: encodeMessage(pongMessage) });

      // Connection should remain open
      expect(client.getStatus()).toBe('open');
    });
  });

  describe('status handlers', () => {
    it('should notify status change handlers', () => {
      client = new YmirClient({ url: 'ws://localhost:7319' });
      
      const statusHandler = vi.fn();
      client.onStatusChange(statusHandler);

      // Connect
      mockWebSocket.readyState = WebSocket.OPEN;
      mockWebSocket.onopen();

      expect(statusHandler).toHaveBeenCalledWith('open');
    });

    it('should notify disconnect handlers', () => {
      client = new YmirClient({ url: 'ws://localhost:7319' });
      mockWebSocket.readyState = WebSocket.OPEN;
      mockWebSocket.onopen();

      const disconnectHandler = vi.fn();
      client.onDisconnect(disconnectHandler);

      mockWebSocket.onclose();

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

// Helper functions
function encodeMessage(message: any): ArrayBuffer {
  const encoded = encode(message);
  return encoded.buffer.slice(encoded.byteOffset, encoded.byteOffset + encoded.byteLength);
}

function decodeMessage(data: ArrayBuffer): any {
  const uint8Array = new Uint8Array(data);
  return decode(uint8Array);
}
