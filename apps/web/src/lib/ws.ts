import { encode, decode } from '@msgpack/msgpack';
import { ClientMessage, ServerMessage, PROTOCOL_VERSION } from '../types/protocol';
import { updateStateFromServerMessage } from '../store';

// Generate a UUID v4 for request IDs
function generateId(): string {
  return crypto.randomUUID();
}

export type ConnectionStatus = 'connecting' | 'open' | 'closed' | 'reconnecting';

export interface WebSocketConfig {
  url: string;
  reconnectEnabled?: boolean;
  maxReconnectDelay?: number;
  heartbeatInterval?: number;
  heartbeatTimeout?: number;
}

export class YmirClient {
  private url: string;
  private reconnectEnabled: boolean;
  private maxReconnectDelay: number;
  private heartbeatInterval: number;
  private heartbeatTimeout: number;

  private ws: WebSocket | null = null;
  private status: ConnectionStatus = 'closed';
  private reconnectAttempts = 0;
  private hasConnectedOnce = false;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeatTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeatTimeoutTimer: ReturnType<typeof setTimeout> | null = null;
  
  private messageQueue: ClientMessage[] = [];
  private messageHandlers = new Map<ServerMessage['type'], Set<(message: ServerMessage) => void>>();
  private statusHandlers = new Set<(status: ConnectionStatus) => void>();
  private disconnectHandlers = new Set<() => void>();
  private reconnectHandlers = new Set<() => void>();

  // Store beforeunload handler to prevent memory leaks
  private beforeUnloadHandler: (() => void) | null = null;
  
  constructor(config: WebSocketConfig) {
    this.url = config.url;
    this.reconnectEnabled = config.reconnectEnabled ?? true;
    this.maxReconnectDelay = config.maxReconnectDelay ?? 30000; // 30 seconds
    this.heartbeatInterval = config.heartbeatInterval ?? 30000; // 30 seconds
    this.heartbeatTimeout = config.heartbeatTimeout ?? 5000; // 5 seconds
    
    this.connect();

    // Clean up on page unload - store handler reference for proper cleanup
    if (typeof window !== 'undefined') {
      this.beforeUnloadHandler = () => {
        this.reconnectEnabled = false;
        this.disconnect();
      };
      window.addEventListener('beforeunload', this.beforeUnloadHandler);
    }
  }
  
  private connect(): void {
    if (this.ws?.readyState === WebSocket.CONNECTING || this.ws?.readyState === WebSocket.OPEN) {
      return;
    }
    
    this.updateStatus('connecting');
    
    try {
      this.ws = new WebSocket(this.url);
      this.ws.binaryType = 'arraybuffer';
      
      this.ws.onopen = () => {
        const isReconnection = this.hasConnectedOnce;
        this.reconnectAttempts = 0;
        this.hasConnectedOnce = true;
        this.updateStatus('open');
        this.flushMessageQueue();
        this.startHeartbeat();

        // Only call reconnect handlers on true reconnections
        if (isReconnection) {
          this.reconnectHandlers.forEach(handler => {
            handler();
          });
        }

        this.send({ type: 'GetState', requestId: generateId() });
      };
      
      this.ws.onmessage = (event) => {
        try {
          const message = this.decodeMessage(event.data);
          this.handleMessage(message);
        } catch (error) {
          console.error('Failed to decode message:', error);
        }
      };
      
      this.ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        return undefined;
      };
      
      this.ws.onclose = () => {
        this.stopHeartbeat();
        this.updateStatus('closed');
        this.disconnectHandlers.forEach(handler => {
          handler();
        });

        this.ws = null;

        if (this.reconnectEnabled) {
          this.scheduleReconnect();
        }
      };
    } catch (error) {
      console.error('Failed to create WebSocket connection:', error);
      this.updateStatus('closed');
      
      if (this.reconnectEnabled) {
        this.scheduleReconnect();
      }
    }
  }
  
  public disconnect(): void {
    this.reconnectEnabled = false;

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    // Remove beforeunload listener to prevent memory leaks
    if (this.beforeUnloadHandler && typeof window !== 'undefined') {
      window.removeEventListener('beforeunload', this.beforeUnloadHandler);
      this.beforeUnloadHandler = null;
    }

    this.updateStatus('closed');
  }
  
  private scheduleReconnect(): void {
    if (this.reconnectTimer) {
      return;
    }
    
    const delay = this.getReconnectDelay();
    this.reconnectAttempts++;
    this.updateStatus('reconnecting');
    
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }
  
  private getReconnectDelay(): number {
    const baseDelay = Math.min(1000 * Math.pow(2, this.reconnectAttempts - 1), this.maxReconnectDelay);
    const jitter = Math.random() * 1000;
    return baseDelay + jitter;
  }
  
  private updateStatus(status: ConnectionStatus): void {
    this.status = status;
    this.statusHandlers.forEach(handler => {
      handler(status);
    });
  }
  
  private startHeartbeat(): void {
    if (!this.heartbeatInterval || this.heartbeatTimer) {
      return;
    }
    
    this.heartbeatTimer = setInterval(() => {
      this.sendPing();
    }, this.heartbeatInterval);
  }
  
  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      console.log('[WS] [Heartbeat] Stopping heartbeat timer');
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }

    if (this.heartbeatTimeoutTimer) {
      console.log('[WS] [Heartbeat] Clearing timeout timer');
      clearTimeout(this.heartbeatTimeoutTimer);
      this.heartbeatTimeoutTimer = null;
    }
  }
  
  private sendPing(): void {
    const timestamp = Date.now();
    console.log(`[WS] [Heartbeat] Sending ping at ${timestamp}`);
    this.send({ type: 'Ping', timestamp });

    // Clear existing timeout before setting new one to prevent timer leak
    if (this.heartbeatTimeoutTimer) {
      clearTimeout(this.heartbeatTimeoutTimer);
    }

    this.heartbeatTimeoutTimer = setTimeout(() => {
      console.warn(`[WS] [Heartbeat] Timeout after ${this.heartbeatTimeout}ms - closing connection`);
      this.ws?.close();
    }, this.heartbeatTimeout);
  }
  
  private handlePong(): void {
    if (this.heartbeatTimeoutTimer) {
      clearTimeout(this.heartbeatTimeoutTimer);
      this.heartbeatTimeoutTimer = null;
    }
  }
  
  private encodeMessage(message: ClientMessage): ArrayBuffer {
    // Extract type and wrap remaining fields in data property
    // Backend expects: { version, type, data: { ...payload } }
    const { type, ...payload } = message;
    
    // Convert camelCase field names to snake_case for Rust compatibility
    const snakeCasePayload = this.toSnakeCaseKeys(payload);
    
    const messageWithVersion = {
      version: PROTOCOL_VERSION,
      type,
      data: snakeCasePayload
    };
    const encoded = encode(messageWithVersion);
    return encoded.buffer.slice(encoded.byteOffset, encoded.byteOffset + encoded.byteLength);
  }
  
  private toSnakeCaseKeys(obj: Record<string, unknown>): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      const snakeKey = key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
      result[snakeKey] = value;
    }
    return result;
  }
  
  private decodeMessage(data: ArrayBuffer): ServerMessage {
    const uint8Array = new Uint8Array(data);
    const decoded = decode(uint8Array) as { version: number; type: string; data: Record<string, unknown> };
    // Convert snake_case field names to camelCase for TypeScript compatibility
    const camelCaseData = this.toCamelCaseKeys(decoded.data);
    // Flatten nested structure: { version, type, data } -> { type, ...data }
    return {
      type: decoded.type,
      ...camelCaseData
    } as ServerMessage;
  }
  
  private toCamelCaseKeys(obj: Record<string, unknown>): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      const camelKey = key.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
      result[camelKey] = value;
    }
    return result;
  }
  
  private handleMessage(message: ServerMessage): void {
    console.log('[WS] Received message type:', message.type, message);
    if (message.type === 'Pong') {
      console.log('[WS] [Heartbeat] Received Pong, clearing timeout');
      this.handlePong();
    } else {
      updateStateFromServerMessage(message);
    }

    const handlers = this.messageHandlers.get(message.type);
    if (handlers) {
      handlers.forEach(handler => {
        handler(message);
      });
    }
  }

  private flushMessageQueue(): void {
    if (this.ws?.readyState !== WebSocket.OPEN) {
      return;
    }

    while (this.messageQueue.length > 0) {
      const message = this.messageQueue.shift();
      if (message) {
        try {
          // Use sendRaw directly to prevent re-queueing during flush
          this.sendRaw(message);
        } catch (error) {
          // If send fails even with OPEN state, log and discard to break re-queue loop
          console.warn('Failed to flush message from queue:', error);
          // Message is intentionally lost to prevent infinite re-queueing
        }
      }
    }
  }
  
  // Public API

  private sendRaw(message: ClientMessage): void {
    if (this.ws?.readyState !== WebSocket.OPEN) {
      throw new Error('WebSocket not open');
    }
    const encoded = this.encodeMessage(message);
    this.ws.send(encoded);
  }

  send(message: ClientMessage): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      try {
        this.sendRaw(message);
      } catch (error) {
        console.error('Failed to send message:', error);
        this.queueMessage(message);
      }
    } else {
      this.queueMessage(message);
    }
  }
  
  private queueMessage(message: ClientMessage): void {
    this.messageQueue.push(message);
  }
  
  onMessage<T extends ServerMessage['type']>(
    type: T,
    callback: (message: Extract<ServerMessage, { type: T }>) => void
  ): () => void {
    const handlers = this.messageHandlers.get(type) || new Set();
    const wrappedCallback = (message: ServerMessage) => {
      if (message.type === type) {
        callback(message as Extract<ServerMessage, { type: T }>);
      }
    };
    handlers.add(wrappedCallback);
    this.messageHandlers.set(type, handlers);
    
    return () => {
      handlers.delete(wrappedCallback);
      if (handlers.size === 0) {
        this.messageHandlers.delete(type);
      }
    };
  }
  
  onStatusChange(callback: (status: ConnectionStatus) => void): () => void {
    this.statusHandlers.add(callback);
    callback(this.status);
    
    return () => {
      this.statusHandlers.delete(callback);
    };
  }
  
  onDisconnect(callback: () => void): () => void {
    this.disconnectHandlers.add(callback);
    return () => {
      this.disconnectHandlers.delete(callback);
    };
  }
  
  onReconnect(callback: () => void): () => void {
    this.reconnectHandlers.add(callback);
    return () => {
      this.reconnectHandlers.delete(callback);
    };
  }
  
  getStatus(): ConnectionStatus {
    return this.status;
  }
  
  isConnected(): boolean {
    return this.status === 'open';
  }
}

// Singleton instance
let client: YmirClient | null = null;

export function getWebSocketClient(config?: Partial<WebSocketConfig>): YmirClient {
  if (!client) {
    // Use WebSocket proxy path - Vite forwards /ws to ws://localhost:7319
    const wsUrl = `ws://${window.location.host}/ws`;

    const defaultConfig: WebSocketConfig = {
      url: wsUrl,
      reconnectEnabled: true,
      maxReconnectDelay: 30000,
      heartbeatInterval: 15000,
      heartbeatTimeout: 5000,
      ...config,
    };
    console.log('[WS] Creating WebSocket client with config:', {
      url: wsUrl,
      heartbeatIntervalMs: defaultConfig.heartbeatInterval,
      heartbeatTimeoutMs: defaultConfig.heartbeatTimeout
    });
    client = new YmirClient(defaultConfig);
  }
  return client;
}

export function resetWebSocketClient(): void {
  if (client) {
    client.disconnect();
    client = null;
  }
}
