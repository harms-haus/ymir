import logger from '../lib/logger';
import { generateUUID } from '../lib/utils';

export const JSONRPC_VERSION = '2.0' as const;

export type ConnectionState =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'disconnecting'
  | 'reconnecting';

export interface ConnectionStatus {
  state: ConnectionState;
  url: string | null;
  error: string | null;
}

export interface JsonRpcRequest<TParams = unknown> {
  jsonrpc: typeof JSONRPC_VERSION;
  id: string;
  method: string;
  params?: TParams;
}

export interface JsonRpcNotification<TParams = unknown> {
  jsonrpc: typeof JSONRPC_VERSION;
  method: string;
  params?: TParams;
}

export interface JsonRpcError {
  code: number;
  message: string;
  data?: unknown;
}

export interface JsonRpcSuccessResponse<TResult = unknown> {
  jsonrpc: typeof JSONRPC_VERSION;
  id: string;
  result?: TResult;
}

export interface JsonRpcErrorResponse {
  jsonrpc: typeof JSONRPC_VERSION;
  id: string;
  error: JsonRpcError;
}

export type JsonRpcResponse<TResult = unknown> =
  | JsonRpcSuccessResponse<TResult>
  | JsonRpcErrorResponse;

export type JsonRpcIncomingMessage<TResult = unknown, TParams = unknown> =
  | JsonRpcResponse<TResult>
  | JsonRpcNotification<TParams>;

export type JsonRpcOutgoingMessage<TParams = unknown> =
  | JsonRpcRequest<TParams>
  | JsonRpcNotification<TParams>;

interface PendingRequest {
  method: string;
  resolve: (value: unknown) => void;
  reject: (error: JsonRpcError) => void;
  timeoutHandle: ReturnType<typeof setTimeout>;
}

const DEFAULT_REQUEST_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_OUTBOUND_QUEUE_SIZE = 500;
const DEFAULT_RECONNECT_BASE_DELAY_MS = 500;
const DEFAULT_RECONNECT_MAX_DELAY_MS = 10_000;
const DEFAULT_RECONNECT_BACKOFF_FACTOR = 2;
const JSONRPC_INTERNAL_ERROR = -32603;
const DEFAULT_WEBSOCKET_URL = 'ws://127.0.0.1:7144/ws';

type MessageListener = (message: JsonRpcIncomingMessage) => void;
type ConnectionListener = (status: ConnectionStatus) => void;

export interface WebSocketTransportOptions {
  requestTimeoutMs?: number;
  maxOutboundQueueSize?: number;
  reconnectBaseDelayMs?: number;
  reconnectMaxDelayMs?: number;
  reconnectBackoffFactor?: number;
}

export class WebSocketService {
  private socket: WebSocket | null = null;
  private status: ConnectionStatus = {
    state: 'disconnected',
    url: null,
    error: null,
  };
  private readonly requestTimeoutMs: number;
  private readonly maxOutboundQueueSize: number;
  private readonly reconnectBaseDelayMs: number;
  private readonly reconnectMaxDelayMs: number;
  private readonly reconnectBackoffFactor: number;
  private readonly outboundQueue: JsonRpcOutgoingMessage[] = [];
  private readonly pendingRequests = new Map<string, PendingRequest>();
  private readonly messageListeners = new Set<MessageListener>();
  private readonly connectionListeners = new Set<ConnectionListener>();
  private intentionalDisconnect = false;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempt = 0;
  private connectionUrl: string | null = null;

  constructor(options?: WebSocketTransportOptions) {
    this.requestTimeoutMs = options?.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
    this.maxOutboundQueueSize = options?.maxOutboundQueueSize ?? DEFAULT_MAX_OUTBOUND_QUEUE_SIZE;
    this.reconnectBaseDelayMs = options?.reconnectBaseDelayMs ?? DEFAULT_RECONNECT_BASE_DELAY_MS;
    this.reconnectMaxDelayMs = options?.reconnectMaxDelayMs ?? DEFAULT_RECONNECT_MAX_DELAY_MS;
    this.reconnectBackoffFactor = options?.reconnectBackoffFactor ?? DEFAULT_RECONNECT_BACKOFF_FACTOR;
  }

  getStatus(): ConnectionStatus {
    return { ...this.status };
  }

  isConnected(): boolean {
    return this.status.state === 'connected';
  }

  getPendingRequestCount(): number {
    return this.pendingRequests.size;
  }

  getQueueSize(): number {
    return this.outboundQueue.length;
  }

  clearQueue(): void {
    this.outboundQueue.length = 0;
  }

  onMessage(listener: MessageListener): () => void {
    this.messageListeners.add(listener);
    return () => this.messageListeners.delete(listener);
  }

  onConnectionChange(listener: ConnectionListener): () => void {
    this.connectionListeners.add(listener);
    listener(this.status);
    return () => this.connectionListeners.delete(listener);
  }

  async connect(url: string): Promise<void> {
    if (
      (this.status.state === 'connecting' ||
        this.status.state === 'connected' ||
        this.status.state === 'reconnecting') &&
      this.connectionUrl === url
    ) {
      return;
    }

    this.clearReconnectTimer();

    if (this.socket) {
      await this.disconnect('Switching WebSocket endpoint');
    }

    this.intentionalDisconnect = false;
    this.connectionUrl = url;
    this.updateStatus({ state: 'connecting', url, error: null });

    try {
      await this.openSocket(url);
      this.reconnectAttempt = 0;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.updateStatus({ state: 'disconnected', url: null, error: errorMessage });
      throw error;
    }
  }

  async disconnect(reason = 'Client disconnected'): Promise<void> {
    this.clearReconnectTimer();
    this.reconnectAttempt = 0;
    this.connectionUrl = null;

    if (!this.socket) {
      if (this.status.state !== 'disconnected') {
        this.updateStatus({ state: 'disconnected', url: null, error: null });
      }
      return;
    }

    this.intentionalDisconnect = true;
    const socket = this.socket;
    this.updateStatus({ state: 'disconnecting' });

    await new Promise<void>((resolve) => {
      socket.addEventListener('close', () => resolve(), { once: true });
      socket.close();
    });

    if (this.socket === socket) {
      this.handleSocketClosed(socket, reason);
    }
  }

  request<TResult = unknown, TParams = unknown>(
    method: string,
    params?: TParams,
    timeoutMs = this.requestTimeoutMs,
  ): Promise<TResult> {
    const id = generateUUID();
    const message: JsonRpcRequest<TParams> = {
      jsonrpc: JSONRPC_VERSION,
      id,
      method,
      params,
    };

    return new Promise<TResult>((resolve, reject) => {
      const timeoutHandle = setTimeout(() => {
        const pending = this.pendingRequests.get(id);
        if (!pending) {
          return;
        }
        this.pendingRequests.delete(id);
        pending.reject({
          code: JSONRPC_INTERNAL_ERROR,
          message: `Request timed out: ${method}`,
          data: { id, timeoutMs },
        });
      }, timeoutMs);

      this.pendingRequests.set(id, {
        method,
        timeoutHandle,
        resolve: (value) => resolve(value as TResult),
        reject,
      });

      this.send(message);
    });
  }

  notify<TParams = unknown>(method: string, params?: TParams): void {
    this.send({
      jsonrpc: JSONRPC_VERSION,
      method,
      params,
    });
  }

  private send(message: JsonRpcOutgoingMessage): void {
    if (!this.trySend(message)) {
      this.enqueueMessage(message);
    }
  }

  private flushOutboundQueue(): void {
    if (!this.socket || this.status.state !== 'connected' || this.outboundQueue.length === 0) {
      return;
    }

    while (this.outboundQueue.length > 0) {
      const message = this.outboundQueue[0];
      if (!message) {
        break;
      }

      if (!this.trySend(message)) {
        break;
      }

      this.outboundQueue.shift();
    }
  }

  private bindSocketHandlers(socket: WebSocket): void {
    socket.onmessage = (event) => {
      if (typeof event.data !== 'string') {
        return;
      }
      this.handleIncomingMessage(event.data);
    };

    socket.onclose = () => {
      const reason = this.intentionalDisconnect
        ? 'Client disconnected'
        : 'WebSocket connection closed';
      this.handleSocketClosed(socket, reason);
    };

    socket.onerror = () => {
      const reason = 'WebSocket transport error';
      this.handleSocketClosed(socket, reason);
    };
  }

  private handleIncomingMessage(rawData: string): void {
    let parsed: unknown;

    try {
      parsed = JSON.parse(rawData);
    } catch {
      logger.warn('Received non-JSON WebSocket payload');
      return;
    }

    if (!this.isJsonRpcEnvelope(parsed)) {
      logger.warn('Received invalid JSON-RPC payload');
      return;
    }

    const message = parsed as JsonRpcIncomingMessage;
    for (const listener of this.messageListeners) {
      listener(message);
    }

    if ('id' in message) {
      this.handleResponse(message as JsonRpcResponse);
    }
  }

  private handleResponse(response: JsonRpcResponse): void {
    const pending = this.pendingRequests.get(response.id);
    if (!pending) {
      return;
    }

    this.pendingRequests.delete(response.id);
    clearTimeout(pending.timeoutHandle);

    if ('error' in response && response.error) {
      pending.reject(response.error);
      return;
    }

    pending.resolve((response as JsonRpcSuccessResponse).result);
  }

  private isJsonRpcEnvelope(value: unknown): value is JsonRpcIncomingMessage {
    if (!value || typeof value !== 'object') {
      return false;
    }

    const candidate = value as Record<string, unknown>;
    if (candidate.jsonrpc !== JSONRPC_VERSION) {
      return false;
    }

    const hasId = typeof candidate.id === 'string';
    const hasMethod = typeof candidate.method === 'string';
    const hasResult = 'result' in candidate;
    const hasError =
      typeof candidate.error === 'object' && candidate.error !== null && 'code' in candidate.error;

    if (hasId) {
      return hasResult || hasError;
    }

    return hasMethod;
  }

  private handleSocketClosed(socket: WebSocket, reason: string): void {
    if (this.socket !== socket) {
      return;
    }

    this.socket = null;

    const rejectError: JsonRpcError = {
      code: JSONRPC_INTERNAL_ERROR,
      message: reason,
    };

    for (const [id, pending] of this.pendingRequests.entries()) {
      clearTimeout(pending.timeoutHandle);
      pending.reject({
        ...rejectError,
        data: { id, method: pending.method },
      });
    }
    this.pendingRequests.clear();

    if (!this.intentionalDisconnect && this.connectionUrl) {
      this.scheduleReconnect(reason);
      return;
    }

    this.updateStatus({ state: 'disconnected', url: null, error: this.intentionalDisconnect ? null : reason });
  }

  private async openSocket(url: string): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      let settled = false;
      const socket = new WebSocket(url);

      const cleanupConnectHandlers = () => {
        socket.onopen = null;
        socket.onerror = null;
        socket.onclose = null;
      };

      socket.onopen = () => {
        if (settled) {
          return;
        }
        settled = true;
        cleanupConnectHandlers();
        this.socket = socket;
        this.bindSocketHandlers(socket);
        this.updateStatus({ state: 'connected', url, error: null });
        this.flushOutboundQueue();
        resolve();
      };

      socket.onerror = () => {
        if (settled) {
          return;
        }
        settled = true;
        cleanupConnectHandlers();
        reject(new Error('WebSocket connection failed'));
      };

      socket.onclose = () => {
        if (settled) {
          return;
        }
        settled = true;
        cleanupConnectHandlers();
        reject(new Error('WebSocket connection closed before open'));
      };
    });
  }

  private scheduleReconnect(reason: string): void {
    if (this.intentionalDisconnect || !this.connectionUrl) {
      return;
    }

    this.clearReconnectTimer();

    const delay = Math.min(
      Math.round(this.reconnectBaseDelayMs * Math.pow(this.reconnectBackoffFactor, this.reconnectAttempt)),
      this.reconnectMaxDelayMs,
    );
    const nextAttempt = this.reconnectAttempt + 1;

    this.updateStatus({
      state: 'reconnecting',
      url: this.connectionUrl,
      error: `${reason}. Reconnecting in ${delay}ms (attempt ${nextAttempt})`,
    });

    this.reconnectAttempt = nextAttempt;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      void this.attemptReconnect();
    }, delay);
  }

  private async attemptReconnect(): Promise<void> {
    if (this.intentionalDisconnect || !this.connectionUrl) {
      return;
    }

    const targetUrl = this.connectionUrl;
    try {
      await this.openSocket(targetUrl);
      this.reconnectAttempt = 0;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.scheduleReconnect(errorMessage);
    }
  }

  private clearReconnectTimer(): void {
    if (!this.reconnectTimer) {
      return;
    }

    clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
  }

  private trySend(message: JsonRpcOutgoingMessage): boolean {
    if (!this.socket || this.status.state !== 'connected') {
      return false;
    }

    try {
      this.socket.send(JSON.stringify(message));
      return true;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('Failed to send WebSocket message', {
        method: 'method' in message ? message.method : undefined,
        error: errorMessage,
      });

      if (this.socket.readyState === WebSocket.OPEN || this.socket.readyState === WebSocket.CONNECTING) {
        this.socket.close();
      }
      return false;
    }
  }

  private enqueueMessage(message: JsonRpcOutgoingMessage, prioritize = false): void {
    if (this.outboundQueue.length >= this.maxOutboundQueueSize) {
      if (prioritize) {
        this.outboundQueue.pop();
      } else {
        this.outboundQueue.shift();
      }
    }

    if (prioritize) {
      this.outboundQueue.unshift(message);
      return;
    }

    this.outboundQueue.push(message);
  }

  private updateStatus(next: Partial<ConnectionStatus>): void {
    this.status = { ...this.status, ...next };
    for (const listener of this.connectionListeners) {
      listener(this.status);
    }
  }
}

let instance: WebSocketService | null = null;

export function getWebSocketService(): WebSocketService {
  if (!instance) {
    instance = new WebSocketService();
  }
  return instance;
}

export function resolveWebSocketUrl(): string {
  const fromEnv = import.meta.env.VITE_WEBSOCKET_URL ?? import.meta.env.VITE_YMIR_WS_URL;
  if (typeof fromEnv === 'string' && fromEnv.trim().length > 0) {
    return fromEnv.trim();
  }

  return DEFAULT_WEBSOCKET_URL;
}

export async function ensureWebSocketConnected(): Promise<void> {
  const service = getWebSocketService();
  await service.connect(resolveWebSocketUrl());
}

export async function resetWebSocketService(): Promise<void> {
  if (instance) {
    await instance.disconnect().catch(() => undefined);
  }
  instance = null;
}
