/**
 * YmirWsTransport - WebSocket transport adapter bridging YmirClient's interface
 * to the @harms-haus/acp-ws-bridge TransportClient.
 *
 * Wraps TransportClient with:
 * - Ymir's BridgeEnvelope encode/decode via bridge-transport.ts
 * - Heartbeat Ping/Pong through the BridgeEnvelope format
 * - Exponential backoff reconnection (delegated to TransportClient)
 * - Status mapping between TransportClient and YmirClient conventions
 * - Message queueing for offline messages
 * - ACP event buffering for batched store updates
 *
 * Drop-in replacement for YmirClient from ws.ts.
 * Same public API so useWebSocket.ts and other consumers need minimal changes.
 */

import { TransportClient, type TransportConfig, type BridgeEnvelope } from "@harms-haus/acp-ws-bridge";

import { encodeClientMessage, decodeBridgeJson } from "./bridge-transport";
import type { BridgeMessage, BridgePayload } from "../types/bridge-envelope";
import {
  ClientMessage,
  ServerMessage,
  AcpEventEnvelope,
  StateSnapshot,
} from "../types/protocol";
import { updateStateFromServerMessage, useStore, useToastStore, handleBridgeMessage } from "../store";
import { acpSessionManager, type CoreConnectionStatus } from "./acp-session-manager";
import type { FullBridgeEnvelope } from "../types/bridge-envelope";

// Re-export ConnectionStatus with YmirClient-compatible naming
export type ConnectionStatus = "connecting" | "open" | "closed" | "reconnecting";

export interface WebSocketConfig {
  url: string;
  reconnectEnabled?: boolean;
  maxReconnectDelay?: number;
  heartbeatInterval?: number;
  heartbeatTimeout?: number;
}

// Mapping from TransportClient status to YmirClient status
function mapStatus(raw: string): ConnectionStatus {
  switch (raw) {
    case "connecting":
      return "connecting";
    case "connected":
      return "open";
    case "reconnecting":
      return "reconnecting";
    case "disconnected":
    case "error":
    default:
      return "closed";
  }
}

/**
 * YmirWsTransport wraps TransportClient from @harms-haus/acp-ws-bridge,
 * providing a drop-in replacement for the legacy YmirClient class.
 */
export class YmirWsTransport {
  // --- Config ---
  private url: string;
  private reconnectEnabled: boolean;
  private maxReconnectDelay: number;
  private heartbeatInterval: number;
  private heartbeatTimeout: number;

  // --- Transport ---
  private client: TransportClient;

  // --- State ---
  private status: ConnectionStatus = "closed";
  private hasConnectedOnce = false;
  private wasReconnecting = false; // Track if we were in reconnecting state

  // --- Timers ---
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private heartbeatTimeoutTimer: ReturnType<typeof setTimeout> | null = null;
  private acpFlushTimer: ReturnType<typeof setTimeout> | null = null;

  // --- Queues & Buffers ---
  private messageQueue: ClientMessage[] = [];
  private acpEventBuffer: Array<{ envelope: AcpEventEnvelope; worktreeId: string }> = [];
  private readonly ACP_FLUSH_INTERVAL = 50; // ms

  // --- ACP Session Manager ---
  private acpConfigured = false;

  // --- Handlers ---
  private messageHandlers = new Map<ServerMessage["type"], Set<(message: ServerMessage) => void>>();
  private acpEventHandlers = new Map<string, Set<(envelope: AcpEventEnvelope) => void>>();
  private statusHandlers = new Set<(status: ConnectionStatus) => void>();
  private disconnectHandlers = new Set<() => void>();
  private reconnectHandlers = new Set<() => void>();

  // --- Cleanup ---
  private beforeUnloadHandler: (() => void) | null = null;

  constructor(config: WebSocketConfig) {
    this.url = config.url;
    this.reconnectEnabled = config.reconnectEnabled ?? true;
    this.maxReconnectDelay = config.maxReconnectDelay ?? 30000;
    this.heartbeatInterval = config.heartbeatInterval ?? 30000;
    this.heartbeatTimeout = config.heartbeatTimeout ?? 15000;

    // Build TransportClient config
    const transportConfig: TransportConfig = {
      url: this.url,
      reconnect: this.reconnectEnabled,
      maxReconnectDelayMs: this.maxReconnectDelay,
      baseReconnectDelayMs: 1000,
    };

    this.client = new TransportClient(transportConfig);

    // Subscribe to TransportClient events
    this.client.on("envelope", (envelope: BridgeEnvelope) => {
      this.handleEnvelope(envelope);
    });

    this.client.on("error", (error: Error) => {
      console.error("[YWS] Transport error:", error);
    });

    this.client.on("statusChange", (rawStatus: string) => {
      this.handleStatusChange(rawStatus);
    });

    // Auto-connect
    this.connect();

    // Clean up on page unload
    if (typeof window !== "undefined") {
      this.beforeUnloadHandler = () => {
        this.reconnectEnabled = false;
        this.disconnect();
      };
      window.addEventListener("beforeunload", this.beforeUnloadHandler);
    }
  }

  // ==========================================================================
  // Connection lifecycle
  // ==========================================================================

  private connect(): void {
    this.client.connect();
  }

  /** Disconnect and disable reconnection. */
  public disconnect(_code: number = 1000): void {
    this.reconnectEnabled = false;
    this.stopHeartbeat();

    // Clear beforeunload listener
    if (this.beforeUnloadHandler && typeof window !== "undefined") {
      window.removeEventListener("beforeunload", this.beforeUnloadHandler);
      this.beforeUnloadHandler = null;
    }

    this.client.disconnect().catch(() => {
      // Ignore disconnect errors
    });
    this.updateStatus("closed");
  }

  /**
   * Configure acpSessionManager with transport callbacks.
   * Called once on first successful connection.
   */
  private configureAcpSessionManager(): void {
    console.log("[YWS] Configuring acpSessionManager");
    acpSessionManager.configure({
      sendAcpPayload: (payload: Record<string, unknown>) => {
        // Wrap the raw ACP JSON-RPC payload in a BridgeEnvelope and send
        const envelope: FullBridgeEnvelope = {
          version: 1,
          seq: 0,
          timestamp_ms: Date.now(),
          extra_data: null,
          type: "acp_payload",
          payload: payload as BridgePayload,
        };
        this.client.send(JSON.stringify(envelope));
      },
      getConnectionStatus: (): CoreConnectionStatus => {
        return this.status === "open" ? "connected" : "disconnected";
      },
      createTerminal: async (worktreeId, request) => {
        return this.handleAcpTerminalCreate(worktreeId, request);
      },
    });
  }

  // ==========================================================================
  // ACP terminal creation bridge
  // ==========================================================================

  /**
   * Handle an agent-requested terminal/create by bridging it to ymir's
   * existing PTY system.
   *
   * This sends a TerminalCreate message through ymir's WebSocket transport,
   * which triggers the server to create a PTY session. The terminalId returned
   * is a client-generated UUID that maps to the server-created session.
   */
  private async handleAcpTerminalCreate(
    worktreeId: string,
    request: Record<string, unknown>,
  ): Promise<{ terminalId: string } | null> {
    const command = (request.command as string) ?? "";
    // Generate a unique terminal ID for this ACP terminal session
    const terminalId = crypto.randomUUID?.() ?? generateFallbackId();

    // Build the ymir TerminalCreate message.
    // The command from the ACP request becomes the shell for the PTY.
    const label = `agent-terminal-${terminalId.slice(0, 8)}`;
    const message = {
      type: "TerminalCreate" as const,
      worktreeId,
      label,
      shell: typeof command === "string" ? command : undefined,
    };

    console.log(`[YWS] [Terminal] Agent requested terminal: command=${request.command}, worktree=${worktreeId}, id=${terminalId}`);

    // Send through ymir's transport - this will queue if not connected
    this.send(message);

    // Return the terminalId so the agent can reference this terminal
    return { terminalId };
  }

  // ==========================================================================
  // Status handling
  // ==========================================================================

  private handleStatusChange(rawStatus: string): void {
    const newStatus = mapStatus(rawStatus);

    // Detect connection (first connect or reconnection)
    if (newStatus === "open") {
      const isReconnection = this.hasConnectedOnce;
      this.hasConnectedOnce = true;
      this.wasReconnecting = false;

      // Configure acpSessionManager on first connection
      if (!this.acpConfigured) {
        this.configureAcpSessionManager();
        this.acpConfigured = true;
      }

      this.flushMessageQueue();
      this.startHeartbeat();

      // Send GetState request on connect
      this.send({ type: "GetState", requestId: crypto.randomUUID?.() ?? generateFallbackId() });

      if (isReconnection) {
        this.showReconnectToast();
        this.reconnectHandlers.forEach((handler) => handler());
      }
    }

    // Track if we were in reconnecting state before going to closed
    if (rawStatus === "reconnecting") {
      this.wasReconnecting = true;
    }

    // Detect disconnect (transition to closed/disconnected/error)
    if (newStatus === "closed" && this.hasConnectedOnce && this.wasReconnecting) {
      this.stopHeartbeat();
      this.disconnectHandlers.forEach((handler) => handler());
    }

    if (rawStatus === "disconnected" || rawStatus === "error") {
      this.stopHeartbeat();
    }

    this.updateStatus(newStatus);
  }

  private updateStatus(status: ConnectionStatus): void {
    this.status = status;
    this.statusHandlers.forEach((handler) => handler(status));
  }

  // ==========================================================================
  // Heartbeat
  // ==========================================================================

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
      console.log("[YWS] [Heartbeat] Stopping heartbeat timer");
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }

    if (this.heartbeatTimeoutTimer) {
      console.log("[YWS] [Heartbeat] Clearing timeout timer");
      clearTimeout(this.heartbeatTimeoutTimer);
      this.heartbeatTimeoutTimer = null;
    }
  }

  private sendPing(): void {
    const timestamp = Date.now();
    console.log(`[YWS] [Heartbeat] Sending ping at ${timestamp}`);
    this.send({ type: "Ping", timestamp });

    // Clear existing timeout before setting new one to prevent timer leak
    if (this.heartbeatTimeoutTimer) {
      clearTimeout(this.heartbeatTimeoutTimer);
    }

    this.heartbeatTimeoutTimer = setTimeout(() => {
      console.warn(`[YWS] [Heartbeat] Timeout after ${this.heartbeatTimeout}ms - closing connection`);
      this.client.disconnect().catch(() => {});
    }, this.heartbeatTimeout);
  }

  private handlePong(): void {
    if (this.heartbeatTimeoutTimer) {
      clearTimeout(this.heartbeatTimeoutTimer);
      this.heartbeatTimeoutTimer = null;
    }
  }

  // ==========================================================================
  // Message handling
  // ==========================================================================

  private handleEnvelope(envelope: BridgeEnvelope): void {
    try {
      const decoded = decodeBridgeJson(JSON.stringify(envelope));

      // Route acp_payload directly through acpSessionManager
      if (decoded.type === "acp_payload") {
        this.handleAcpPayload(decoded.message);
        return;
      }

      // Route migrated message types directly through handleBridgeMessage
      // instead of converting back to ServerMessage format.
      // Migrated: workspace_event, worktree_event, git_response, file_response,
      //   notification, error_response, agent_event, terminal_event, state_snapshot,
      //   ping, pong, ack
      // Unmigrated (stays on old path): bridge_status, stderr, process_exit, etc.
      const migratedTypes: BridgeMessage["type"][] = [
        "workspace_event",
        "worktree_event",
        "git_response",
        "file_response",
        "notification",
        "error_response",
        "agent_event",
        "terminal_event",
        "state_snapshot",
        "ping",
        "pong",
        "ack",
      ];

      if (migratedTypes.includes(decoded.type)) {
        handleBridgeMessage(decoded, (envelope) => {
          this.client.send(JSON.stringify(envelope));
        });
        return;
      }

      // Legacy path: convert to ServerMessage for unmigrated types
      const serverMessage = this.bridgeMessageToServerMessage(decoded.message, decoded.type);

      if (!serverMessage) {
        return;
      }

      // Yield to event loop for high-frequency ACP events (allows heartbeat Pong to be processed)
      if (serverMessage.type === "AcpWireEvent") {
        setTimeout(() => this.handleMessage(serverMessage), 0);
      } else {
        this.handleMessage(serverMessage);
      }
    } catch (error) {
      console.error("[YWS] Failed to decode envelope:", error);
    }
  }

  /**
   * Handle incoming acp_payload BridgeMessage by routing it through
   * acpSessionManager to the appropriate SessionController.
   */
  private handleAcpPayload(message: BridgeMessage): void {
    const payload = (message as any).payload as Record<string, unknown> | null;
    if (!payload) return;

    // Extract worktreeId from payload data for routing
    const { activeWorktreeId } = useStore.getState();
    const data = (payload.data as Record<string, unknown>) ?? {};
    const worktreeId = (data as any)?.worktreeId ?? activeWorktreeId;

    if (worktreeId) {
      acpSessionManager.handleAcpPayload(worktreeId, payload);
    }
  }

  /**
   * Convert a BridgeMessage to a Ymir ServerMessage.
   * The bridge wraps original message types in payload.originalType + payload.data.
   */
  private bridgeMessageToServerMessage(
    message: BridgeMessage,
    envelopeType: BridgeMessage["type"]
  ): ServerMessage | null {
    // Handle bridge_status (internal, not exposed)
    if (envelopeType === "bridge_status") {
      return null;
    }

    // Ymir-specific passthrough variants carry payload with originalType
    const payload = (message as any).payload as Record<string, unknown> | null;
    if (!payload) {
      // Some bridge messages don't have payloads (stderr, process_exit, replay_metadata, start_agent)
      // These aren't mapped to ServerMessage types
      return null;
    }

    const originalType = payload.originalType as string | undefined;
    const data = payload.data as Record<string, unknown> | undefined;

    if (!originalType) {
      // Fallback: treat payload itself as the message
      return {
        type: envelopeType as ServerMessage["type"],
        ...(data ?? payload),
      } as ServerMessage;
    }

    // Build the ServerMessage from originalType + data
    return {
      type: originalType as ServerMessage["type"],
      ...(data ?? {}),
    } as ServerMessage;
  }

  private handleMessage(message: ServerMessage): void {
    if (message.type === "Pong") {
      this.handlePong();
    } else if (message.type === "StateSnapshot") {
      this.flushAcpBuffer();
      this.handleStateSnapshot(message);
    } else if (message.type === "AcpWireEvent") {
      const envelope = this.decodeAcpEnvelope(message);
      if (envelope) {
        const handlers = this.acpEventHandlers.get(envelope.eventType);
        if (handlers) {
          handlers.forEach((handler) => handler(envelope));
        }
        const allHandlers = this.acpEventHandlers.get("*");
        if (allHandlers) {
          allHandlers.forEach((handler) => handler(envelope));
        }
      }
      this.bufferAcpEvent(message);
    } else {
      updateStateFromServerMessage(message);
    }

    // Dispatch to type-specific message handlers
    const handlers = this.messageHandlers.get(message.type);
    if (handlers) {
      handlers.forEach((handler) => handler(message));
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

  private decodeAcpEnvelope(message: ServerMessage): AcpEventEnvelope | null {
    if (message.type !== "AcpWireEvent") {
      return null;
    }

    const { type, ...envelopeFields } = message as unknown as Record<string, unknown>;

    if (typeof envelopeFields.sequence !== "number") {
      console.error("[YWS] [ACP] Malformed envelope: missing or invalid sequence");
      return null;
    }

    if (typeof envelopeFields.timestamp !== "number") {
      console.error("[YWS] [ACP] Malformed envelope: missing or invalid timestamp");
      return null;
    }

    if (typeof envelopeFields.eventType !== "string") {
      console.error("[YWS] [ACP] Malformed envelope: missing or invalid eventType");
      return null;
    }

    if (!envelopeFields.data || typeof envelopeFields.data !== "object") {
      console.error("[YWS] [ACP] Malformed envelope: missing or invalid data");
      return null;
    }

    if (
      envelopeFields.correlationId !== undefined &&
      envelopeFields.correlationId !== null
    ) {
      if (typeof envelopeFields.correlationId !== "object") {
        console.error("[YWS] [ACP] Malformed envelope: invalid correlationId");
        return null;
      }
    }

    return envelopeFields as unknown as AcpEventEnvelope;
  }

  // ==========================================================================
  // Sending
  // ==========================================================================

  /** Send a message, queueing if not connected. */
  send(message: ClientMessage): void {
    const status = this.client.getStatus();
    if (status === "connected") {
      try {
        this.sendRaw(message);
      } catch (error) {
        console.error("[YWS] Failed to send message:", error);
        this.queueMessage(message);
      }
    } else {
      this.queueMessage(message);
    }
  }

  private sendRaw(message: ClientMessage): void {
    const status = this.client.getStatus();
    if (status !== "connected") {
      throw new Error("Transport not connected");
    }
    const envelope = encodeClientMessage(message as any);
    this.client.send(JSON.stringify(envelope));
  }

  private queueMessage(message: ClientMessage): void {
    this.messageQueue.push(message);
  }

  private flushMessageQueue(): void {
    if (this.client.getStatus() !== "connected") {
      return;
    }

    while (this.messageQueue.length > 0) {
      const message = this.messageQueue.shift();
      if (message) {
        try {
          this.sendRaw(message);
        } catch (error) {
          console.warn("[YWS] Failed to flush message from queue:", error);
          // Message is intentionally lost to prevent infinite re-queueing
        }
      }
    }
  }

  // ==========================================================================
  // ACP event buffering
  // ==========================================================================

  private bufferAcpEvent(message: ServerMessage): void {
    const envelope = this.decodeAcpEnvelope(message);
    if (!envelope) return;

    const { activeWorktreeId } = useStore.getState();
    const data = (message as unknown as Record<string, unknown>).data as
      | Record<string, unknown>
      | undefined;
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

    for (const { envelope, worktreeId } of eventsToProcess) {
      // Route the ACP event envelope through acpSessionManager
      acpSessionManager.handleAcpPayload(worktreeId, envelope as unknown as Record<string, unknown>);
    }
  }

  // ==========================================================================
  // Public API (matching YmirClient interface)
  // ==========================================================================

  /** Subscribe to messages of a specific type. Returns unsubscribe function. */
  onMessage<T extends ServerMessage["type"]>(
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

  /** Subscribe to ACP events by type, or '*' for all events. Returns unsubscribe function. */
  onAcpEvent(
    eventTypeOrCallback: AcpEventEnvelope["eventType"] | "*" | ((envelope: AcpEventEnvelope) => void),
    callback?: (envelope: AcpEventEnvelope) => void
  ): () => void {
    if (typeof eventTypeOrCallback === "function") {
      const cb = eventTypeOrCallback;
      const handlers = this.acpEventHandlers.get("*") || new Set();
      handlers.add(cb);
      this.acpEventHandlers.set("*", handlers);

      return () => {
        handlers.delete(cb);
        if (handlers.size === 0) {
          this.acpEventHandlers.delete("*");
        }
      };
    }

    const eventType = eventTypeOrCallback;
    if (!callback) {
      throw new Error("Callback is required when eventType is provided");
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

  /** Subscribe to connection status changes. Returns unsubscribe function. */
  onStatusChange(callback: (status: ConnectionStatus) => void): () => void {
    this.statusHandlers.add(callback);
    callback(this.status);

    return () => {
      this.statusHandlers.delete(callback);
    };
  }

  /** Subscribe to disconnection events. Returns unsubscribe function. */
  onDisconnect(callback: () => void): () => void {
    this.disconnectHandlers.add(callback);
    return () => {
      this.disconnectHandlers.delete(callback);
    };
  }

  /** Subscribe to reconnection events. Returns unsubscribe function. */
  onReconnect(callback: () => void): () => void {
    this.reconnectHandlers.add(callback);
    return () => {
      this.reconnectHandlers.delete(callback);
    };
  }

  /** Get current connection status. */
  getStatus(): ConnectionStatus {
    return this.status;
  }

  /** Check if the connection is currently open. */
  isConnected(): boolean {
    return this.status === "open";
  }

  // ==========================================================================
  // Toast helpers
  // ==========================================================================

  private showReconnectToast(): void {
    const { addNotification } = useToastStore.getState();
    addNotification({
      variant: "success",
      title: "Reconnected",
      description: "Connection to server restored",
      duration: 3000,
    });
  }
}

// ==========================================================================
// Fallback ID generator (for environments without crypto.randomUUID)
// ==========================================================================

function generateFallbackId(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// ==========================================================================
// Singleton instance
// ==========================================================================

let transport: YmirWsTransport | null = null;

/**
 * Get the singleton YmirWsTransport instance.
 * Creates it on first call with the default config.
 */
export function getYmirWsTransport(config?: Partial<WebSocketConfig>): YmirWsTransport {
  if (!transport) {
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

    console.log("[YWS] Creating YmirWsTransport with config:", {
      url: wsUrl,
      heartbeatIntervalMs: defaultConfig.heartbeatInterval,
      heartbeatTimeoutMs: defaultConfig.heartbeatTimeout,
    });

    transport = new YmirWsTransport(defaultConfig);
  }
  return transport;
}

/** Reset the singleton instance (useful for testing). */
export function resetYmirWsTransport(): void {
  if (transport) {
    transport.disconnect();
    transport = null;
  }
}
