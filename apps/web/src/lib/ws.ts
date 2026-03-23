import { encode, decode } from '@msgpack/msgpack';
import { ClientMessage, ServerMessage, PROTOCOL_VERSION, StateSnapshot, AcpEventEnvelope } from '../types/protocol';
import { updateStateFromServerMessage, useStore, useToastStore } from '../store';

// Generate a UUID v4 for request IDs
export function generateId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // Fallback for environments without crypto.randomUUID
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
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
  private acpEventHandlers = new Map<string, Set<(envelope: AcpEventEnvelope) => void>>();
  private statusHandlers = new Set<(status: ConnectionStatus) => void>();
  private disconnectHandlers = new Set<() => void>();
  private reconnectHandlers = new Set<() => void>();

  // ACP event batching to reduce store updates during streaming
  private acpEventBuffer: Array<{ envelope: AcpEventEnvelope; worktreeId: string }> = [];
  private acpFlushTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly ACP_FLUSH_INTERVAL = 50; // ms - batch events within this window

  // Store beforeunload handler to prevent memory leaks
  private beforeUnloadHandler: (() => void) | null = null;
  
  constructor(config: WebSocketConfig) {
    this.url = config.url;
    this.reconnectEnabled = config.reconnectEnabled ?? true;
    this.maxReconnectDelay = config.maxReconnectDelay ?? 30000; // 30 seconds
    this.heartbeatInterval = config.heartbeatInterval ?? 30000;
    this.heartbeatTimeout = config.heartbeatTimeout ?? 15000;
    
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

        // Show toast and call reconnect handlers on true reconnections
        if (isReconnection) {
          this.showReconnectToast();
          this.reconnectHandlers.forEach(handler => {
            handler();
          });
        }

        this.send({ type: 'GetState', requestId: generateId() });
      };
      
  this.ws.onmessage = (event) => {
      try {
        const message = this.decodeMessage(event.data);
        // Yield to event loop to prevent blocking during high-frequency message streaming
        // This allows heartbeat Pong responses to be processed
        if (message.type === 'AcpWireEvent') {
          setTimeout(() => this.handleMessage(message), 0);
        } else {
          this.handleMessage(message);
        }
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
  
  public disconnect(code: number = 1000): void {
    this.reconnectEnabled = false;

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.ws) {
      this.ws.close(code);
      this.ws = null;
    }

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
    // Exponential backoff: 1s, 2s, 4s, 8s, 16s, then cap at maxReconnectDelay
    const backoffSequence = [1000, 2000, 4000, 8000, 16000];
    const baseDelay = this.reconnectAttempts < backoffSequence.length
      ? backoffSequence[this.reconnectAttempts]
      : this.maxReconnectDelay;

    // Add jitter: random between -20% and +20% of base delay
    // This prevents thundering herd when server comes back online
    const jitterRange = baseDelay * 0.2; // 20% of base delay
    const jitter = (Math.random() * 2 - 1) * jitterRange; // -20% to +20%
    return Math.min(baseDelay + jitter, this.maxReconnectDelay);
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

  private showReconnectToast(): void {
    const { addNotification } = useToastStore.getState();
    addNotification({
      variant: 'success',
      title: 'Reconnected',
      description: 'Connection to server restored',
      duration: 3000,
    });
  }
  
  private encodeMessage(message: ClientMessage): ArrayBuffer {
    // Extract type and wrap remaining fields in data property
    // Backend expects: { version, type, data: { ...payload } }
    const { type, ...payload } = message;
    
    // Backend serde uses camelCase, so keep field names as-is
    const messageWithVersion = {
      version: PROTOCOL_VERSION,
      type,
      data: payload
    };
    const encoded = encode(messageWithVersion);
    return encoded.buffer.slice(encoded.byteOffset, encoded.byteOffset + encoded.byteLength);
  }
  
  private decodeMessage(data: ArrayBuffer): ServerMessage {
    const uint8Array = new Uint8Array(data);
    const decoded = decode(uint8Array) as { version: number; type: string; data: Record<string, unknown> };
    // Backend serde uses camelCase, so no conversion needed
    // Flatten nested structure: { version, type, data } -> { type, ...data }
    const result = {
      type: decoded.type,
      ...decoded.data
    } as ServerMessage;
    return result;
  }

  private decodeAcpEnvelope(message: ServerMessage): AcpEventEnvelope | null {
    if (message.type !== 'AcpWireEvent') {
      return null;
    }

    const { type, ...envelopeFields } = message as unknown as Record<string, unknown>;

    if (typeof envelopeFields.sequence !== 'number') {
      console.error('[WS] [ACP] Malformed envelope: missing or invalid sequence');
      return null;
    }

    if (typeof envelopeFields.timestamp !== 'number') {
      console.error('[WS] [ACP] Malformed envelope: missing or invalid timestamp');
      return null;
    }

    if (typeof envelopeFields.eventType !== 'string') {
      console.error('[WS] [ACP] Malformed envelope: missing or invalid eventType');
      return null;
    }

    if (!envelopeFields.data || typeof envelopeFields.data !== 'object') {
      console.error('[WS] [ACP] Malformed envelope: missing or invalid data');
      return null;
    }

    if (envelopeFields.correlationId !== undefined && envelopeFields.correlationId !== null) {
      if (typeof envelopeFields.correlationId !== 'object') {
        console.error('[WS] [ACP] Malformed envelope: invalid correlationId');
        return null;
      }
    }

    return envelopeFields as unknown as AcpEventEnvelope;
  }
  
  private handleMessage(message: ServerMessage): void {
    if (message.type === 'Pong') {
      this.handlePong();
    } else if (message.type === 'StateSnapshot') {
      this.flushAcpBuffer();
      this.handleStateSnapshot(message);
    } else if (message.type === 'AcpWireEvent') {
      const envelope = this.decodeAcpEnvelope(message);
      if (envelope) {
        const handlers = this.acpEventHandlers.get(envelope.eventType);
        if (handlers) {
          handlers.forEach(handler => {
            handler(envelope);
          });
        }
        const allHandlers = this.acpEventHandlers.get('*');
        if (allHandlers) {
          allHandlers.forEach(handler => {
            handler(envelope);
          });
        }
      }
      this.bufferAcpEvent(message);
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

  private handleStateSnapshot(message: StateSnapshot): void {
    const { stateFromSnapshot } = useStore.getState();
    stateFromSnapshot({
      workspaces: message.workspaces,
      worktrees: message.worktrees,
      agentSessions: message.agentSessions,
      terminalSessions: message.terminalSessions,
    });
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

  onAcpEvent(
    eventTypeOrCallback: AcpEventEnvelope['eventType'] | '*' | ((envelope: AcpEventEnvelope) => void),
    callback?: (envelope: AcpEventEnvelope) => void
  ): () => void {
    if (typeof eventTypeOrCallback === 'function') {
      const cb = eventTypeOrCallback;
      const handlers = this.acpEventHandlers.get('*') || new Set();
      handlers.add(cb);
      this.acpEventHandlers.set('*', handlers);

      return () => {
        handlers.delete(cb);
        if (handlers.size === 0) {
          this.acpEventHandlers.delete('*');
        }
      };
    }

    const eventType = eventTypeOrCallback;
    if (!callback) {
      throw new Error('Callback is required when eventType is provided');
    }
    const handlers = this.acpEventHandlers.get(eventType) || new Set();
    handlers.add(callback);
    this.acpEventHandlers.set(eventType, handlers);

    return () => {
      handlers.delete(callback);
      if (handlers.size === 0) {
        this.acpEventHandlers.delete(eventType);
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

  private bufferAcpEvent(message: ServerMessage): void {
    const envelope = this.decodeAcpEnvelope(message);
    if (!envelope) return;

    const { activeWorktreeId } = useStore.getState();
    const data = (message as unknown as Record<string, unknown>).data as Record<string, unknown> | undefined;
    const worktreeId = (data?.worktreeId as string) ?? activeWorktreeId;

    if (!worktreeId) return;

    this.acpEventBuffer.push({ envelope, worktreeId });

    if (!this.acpFlushTimer) {
      this.acpFlushTimer = setTimeout(() => {
        this.flushAcpBuffer();
      }, this.ACP_FLUSH_INTERVAL);
    }
  }

  private flushAcpBuffer(): void {
    if (this.acpFlushTimer) {
      clearTimeout(this.acpFlushTimer);
      this.acpFlushTimer = null;
    }

    if (this.acpEventBuffer.length === 0) return;

    const eventsToProcess = [...this.acpEventBuffer];
    this.acpEventBuffer = [];

    const { dispatchAccumulator } = useStore.getState();
    for (const { envelope, worktreeId } of eventsToProcess) {
      dispatchAccumulator({ type: 'EVENT_RECEIVED', envelope, worktreeId });
    }
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

export async function loadWorktreeDetails(workspaceId: string): Promise<void> {
  const wsClient = getWebSocketClient();
  if (!wsClient.isConnected()) {
    throw new Error('WebSocket not connected');
  }
  
  wsClient.send({
    type: 'GetWorktreeDetails',
    workspaceId,
    requestId: generateId(),
  });
}
