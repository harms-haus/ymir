import { encode, decode } from '@msgpack/msgpack';
import { ClientMessage, ServerMessage } from '../types/protocol';
import { updateStateFromServerMessage } from '../store';

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
  private reconnectTimer: NodeJS.Timeout | null = null;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private heartbeatTimeoutTimer: NodeJS.Timeout | null = null;
  
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
        this.reconnectAttempts = 0;
        this.updateStatus('open');
        this.flushMessageQueue();
        this.startHeartbeat();
        this.reconnectHandlers.forEach(handler => {
          handler();
        });
        
        this.send({ type: 'GetState' });
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
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    
    if (this.heartbeatTimeoutTimer) {
      clearTimeout(this.heartbeatTimeoutTimer);
      this.heartbeatTimeoutTimer = null;
    }
  }
  
  private sendPing(): void {
    this.send({ type: 'Ping', id: Date.now(), timestamp: Date.now() });

    // Clear existing timeout before setting new one to prevent timer leak
    if (this.heartbeatTimeoutTimer) {
      clearTimeout(this.heartbeatTimeoutTimer);
    }

    this.heartbeatTimeoutTimer = setTimeout(() => {
      console.warn('Heartbeat timeout - closing connection');
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
    const encoded = encode(message);
    return encoded.buffer.slice(encoded.byteOffset, encoded.byteOffset + encoded.byteLength);
  }
  
  private decodeMessage(data: ArrayBuffer): ServerMessage {
    const uint8Array = new Uint8Array(data);
    return decode(uint8Array) as ServerMessage;
  }
  
  private handleMessage(message: ServerMessage): void {
    if (message.type === 'Pong') {
      this.handlePong();
      return;
    }

    updateStateFromServerMessage(message);

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
    const defaultConfig: WebSocketConfig = {
      url: 'ws://localhost:7319',
      reconnectEnabled: true,
      maxReconnectDelay: 30000,
      heartbeatInterval: 30000,
      heartbeatTimeout: 5000,
      ...config,
    };
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
