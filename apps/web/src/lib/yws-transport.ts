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
 *
 * Drop-in replacement for YmirClient from ws.ts.
 * Same public API so useWebSocket.ts and other consumers need minimal changes.
 */

import { TransportClient, type TransportConfig, type BridgeEnvelope } from "@harms-haus/acp-ws-bridge";

import { encodeClientMessage, decodeBridgeJson, type DecodedBridgeMessage } from "./bridge-transport";
import type { BridgeMessage, BridgePayload } from "../types/bridge-envelope";
import {
  ClientMessage,
  ServerMessage,
  type AcpEventEnvelope,
} from "../types/protocol";
import { handleBridgeMessage, useStore, useToastStore } from "../store";
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

  // --- Queues & Buffers ---
  private messageQueue: ClientMessage[] = [];

  // --- ACP Session Manager ---
  private acpConfigured = false;

  // --- Handlers ---
  private messageHandlers = new Map<ServerMessage["type"], Set<(message: ServerMessage) => void>>();
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
      console.warn(`[YWS] [Heartbeat] Timeout after ${this.heartbeatTimeout}ms - no pong received, closing connection`);
      this.client.disconnect().catch(() => {});
    }, this.heartbeatTimeout);
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

      // All migrated BridgeMessage types are handled by handleBridgeMessage.
      // This includes: workspace_event, worktree_event, git_response, file_response,
      // notification, error_response, agent_event, terminal_event, state_snapshot,
      // ping, pong, ack
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
        // Dispatch to registered onMessage handlers
        this.dispatchOnMessageHandlers(decoded);
        // Clear heartbeat timeout when receiving ping/pong/ack responses
        if (decoded.type === "ping" || decoded.type === "pong" || decoded.type === "ack") {
          console.log(`[YWS] [Heartbeat] Received ${decoded.type} at ${Date.now()}`);
          this.clearHeartbeatTimeout();
        }
        return;
      }

      // Unmigrated types (bridge_status, stderr, process_exit, replay_metadata,
      // start_agent) — still dispatch to any registered handlers
      this.dispatchOnMessageHandlers(decoded);
      console.warn("[YWS] Unmigrated envelope type:", decoded.type);
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

    // JSON-RPC responses (from the server relay) have "jsonrpc" and "id" fields
    // but no "eventType" or routing metadata. Fan-out to ALL session transports
    // so the one with the matching pending request ID can resolve it.
    if ("jsonrpc" in payload && "id" in payload && !("eventType" in payload)) {
      acpSessionManager.broadcastJsonRpcResponse(payload);
      return;
    }

    // Extract routing metadata from the AcpEventEnvelope top level.
    // agentTabId and worktreeId are routing fields added by the server adapter.
    const { activeWorktreeId } = useStore.getState();
    const envelopeAgentTabId = (payload as any)?.agentTabId as string | undefined;
    const envelopeWorktreeId = (payload as any)?.worktreeId as string | undefined;
    const data = (payload.data as Record<string, unknown>) ?? {};
    const worktreeId = envelopeWorktreeId ?? (data as any)?.worktreeId ?? activeWorktreeId;

    if (worktreeId) {
      // Dispatch to Zustand accumulator (Accumulator-First approach)
      // The server serializes AcpEventEnvelope as the payload, which is
      // the exact format acpAccumulatorReducer expects.
      if (payload.eventType && typeof payload.sequence === 'number') {
        // threadId is derived from agentTabId (multi-session routing).
        // Falls back to worktreeId only if agentTabId is absent.
        const threadId = envelopeAgentTabId ?? (data as any)?.agentTabId ?? worktreeId;
        useStore.getState().dispatchAccumulator({
          type: 'EVENT_RECEIVED',
          envelope: payload as unknown as AcpEventEnvelope,
          threadId,
        });
      }

      // Phase 4: On SessionInit, populate acpSessionId on the matching AgentSessionState.
      // AgentStatusUpdate creates the session with acpSessionId: undefined;
      // the ACP SessionInit event carries the actual acpSessionId in its data.
      if (payload.eventType === 'SessionInit') {
        const acpSessionId = (data as any)?.acpSessionId;
        const agentTabId = envelopeAgentTabId ?? (data as any)?.agentTabId;
        if (acpSessionId) {
          const sessions = useStore.getState().agentSessions;
          // Look up by agentTabId if available, otherwise fall back to worktreeId
          const session = agentTabId
            ? sessions.find(s => (s as any).agentTabId === agentTabId || (!s.acpSessionId && s.worktreeId === worktreeId))
            : sessions.find(s => s.worktreeId === worktreeId && !s.acpSessionId);
          if (session && !session.acpSessionId) {
            useStore.getState().updateAgentSession(session.id, { acpSessionId });
          }
        }
      }

      // Keep existing routing for backward compatibility
      // DEPRECATED: acpSessionManager.handleAcpPayload routes by worktreeId as fallback.
      // New multi-session flow should use handleAcpPayloadByAgentTabId(agentTabId, payload)
      // instead. This backward-compat path is retained for legacy single-session flows.
      if (envelopeAgentTabId) {
        acpSessionManager.handleAcpPayloadByAgentTabId(envelopeAgentTabId, payload);
      } else {
        acpSessionManager.handleAcpPayload(worktreeId, payload);
      }
    }
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

  private clearHeartbeatTimeout(): void {
    if (this.heartbeatTimeoutTimer) {
      clearTimeout(this.heartbeatTimeoutTimer);
      this.heartbeatTimeoutTimer = null;
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

  /** Dispatch decoded BridgeEnvelope to registered onMessage handlers. */
  private dispatchOnMessageHandlers(decoded: DecodedBridgeMessage): void {
    const { type, message } = decoded;
    const payload = (message as any)?.payload as Record<string, unknown> | null;

    // DEBUG: Log all terminal_event envelopes
    if (type === "terminal_event") {
      console.log(
        '[YWS] terminal_event envelope received:',
        'payload.type:', payload?.type ?? 'MISSING',
        'payload keys:', Object.keys(payload ?? {}).join(', '),
        'sessionId:', (payload as any)?.sessionId ?? (payload as any)?.data?.sessionId ?? 'n/a',
        'tabId:', (payload as any)?.tabId ?? 'n/a'
      );
    }

    // Diagnostic logging for terminal_event envelopes with missing payload.type
    if (type === "terminal_event" && payload && !payload.type) {
      console.warn(
        `[YWS] dispatchOnMessageHandlers: terminal_event envelope received with missing payload.type.`,
        `Payload keys: ${Object.keys(payload).join(", ")}.`,
        `Full payload:`, payload
      );
    }

    // Reconstruct the PascalCase ServerMessage type and payload
    let dispatchType: string;
    let dispatchMsg: Record<string, unknown>;

    if (payload?.originalType) {
      // Wrapped messages: extract the original ServerMessage type from payload
      dispatchType = payload.originalType as string;
      dispatchMsg = { type: dispatchType, ...(payload.data as Record<string, unknown> ?? {}) };
    } else if (payload?.type && typeof payload.type === "string") {
      // Server passthrough envelopes (file_response, git_response, agent_event,
      // terminal_event, workspace_event, worktree_event) carry the concrete
      // ServerMessage type in payload.type (e.g. "FileListResult").  Use that
      // instead of the generic envelope discriminator so that onMessage
      // subscribers receive the message they registered for.
      dispatchType = payload.type as string;
      const innerData = payload.data as unknown;
      if (typeof innerData === "object" && innerData !== null && !Array.isArray(innerData)) {
        // Nested object: spread its keys (existing behavior for wrapped messages)
        dispatchMsg = { type: dispatchType, ...(innerData as Record<string, unknown>) };
      } else {
        // Flat structure: preserve all top-level fields except `type`
        const { type: _t, ...rest } = payload as Record<string, unknown>;
        dispatchMsg = { type: dispatchType, ...rest };
      }
    } else {
      // Fix 3: payload.type is missing — try to detect the message type by
      // inspecting the payload structure before falling back to envelope-type.
      if (payload && Array.isArray((payload as Record<string, unknown>).files)) {
        // Detect FileListResult by presence of `files` array field
        dispatchType = "FileListResult";
        dispatchMsg = { type: dispatchType, ...(payload as Record<string, unknown>) };
        console.warn(
          `[YWS] dispatchOnMessageHandlers: payload.type missing, detected FileListResult by 'files' array field`
        );
      } else if (payload && Array.isArray((payload as Record<string, unknown>).entries)) {
        // Detect GitStatusResult by presence of `entries` array field
        dispatchType = "GitStatusResult";
        dispatchMsg = { type: dispatchType, ...(payload as Record<string, unknown>) };
        console.warn(
          `[YWS] dispatchOnMessageHandlers: payload.type missing, detected GitStatusResult by 'entries' array field`
        );
      } else if (
        payload &&
        typeof (payload as Record<string, unknown>).sessionId === "string" &&
        typeof (payload as Record<string, unknown>).data === "string"
      ) {
        // Detect TerminalOutput by presence of `sessionId` (string) + `data` (string) fields
        dispatchType = "TerminalOutput";
        dispatchMsg = { type: dispatchType, ...(payload as Record<string, unknown>) };
        console.warn(
          `[YWS] dispatchOnMessageHandlers: payload.type missing, detected TerminalOutput by 'sessionId' + 'data' string fields`
        );
      } else if (
        payload &&
        typeof (payload as Record<string, unknown>).tabId === "string" &&
        typeof (payload as Record<string, unknown>).data === "string"
      ) {
        // Detect TerminalTabHistory by presence of `tabId` (string) + `data` (string) fields
        dispatchType = "TerminalTabHistory";
        dispatchMsg = { type: dispatchType, ...(payload as Record<string, unknown>) };
        console.warn(
          `[YWS] dispatchOnMessageHandlers: payload.type missing, detected TerminalTabHistory by 'tabId' + 'data' string fields`
        );
      } else {
        // Direct messages (ping, pong, ack, notification, error_response):
        // These don't have a nested {type, data} payload - the envelope type
        // IS the message type. Convert snake_case to PascalCase.
        dispatchType = type.replace(/(^|_)([a-z])/g, (_, __, c) => c.toUpperCase());
        dispatchMsg = { type: dispatchType, ...(payload ?? {}) };
      }
    }

    const handlers = this.messageHandlers.get(dispatchType as ServerMessage["type"]);
    if (handlers) {
      for (const handler of handlers) {
        try {
          handler(dispatchMsg as unknown as ServerMessage);
        } catch (err) {
          console.error(`[YWS] onMessage handler error for ${dispatchType}:`, err);
        }
      }
    }
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

/**
 * Load worktree details - convenience wrapper for use across the app.
 * This is the migrated version of the old loadWorktreeDetails from ws.ts
 */
export async function loadWorktreeDetails(worktreeId: string): Promise<void> {
  const transport = getYmirWsTransport();
  transport.send({
    type: 'GetWorktreeDetails',
    workspaceId: worktreeId,
    requestId: crypto.randomUUID?.() ?? generateFallbackId(),
  });
}

// Legacy re-exports for backward compatibility during migration
// TODO: Remove these once all imports are updated to use getYmirWsTransport directly
export function getWebSocketClient(): YmirWsTransport {
  return getYmirWsTransport();
}
