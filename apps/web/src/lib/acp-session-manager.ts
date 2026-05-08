/**
 * AcpSessionManager - Manages SessionController instances from @harms-haus/acp-chat-core.
 *
 * Creates and manages SessionController instances keyed by agentTabId, supporting
 * multiple sessions per worktree. Each agent tab has its own SessionController
 * and ACP session, enabling multi-session agent transport.
 *
 * Responsibilities:
 * - SessionController lifecycle per agent tab (create, initialize, destroy)
 * - Agent tab ID ↔ ACP session ID mapping
 * - Worktree → agent tab index for backward compatibility
 * - Routing ACP events from BridgeEnvelope acp_payload to the correct SessionController
 * - Exposing prompt sending through SessionController
 *
 * Manages ACP sessions per agent tab, routing payloads to SessionControllers.
 * Runs alongside the accumulator-based flow, providing SessionController-managed
 * state that can be consumed once the migration is complete.
 */

import {
  SessionController,
  type Transport,
  type ConnectionStatus as CoreConnectionStatus,
  type ACPRequest,
  type ACPResponse,
  type ACPNotification,
  type SessionControllerState,
  type ConfigOption,
  type CreateTerminalRequest,
  type CreateTerminalResponse,
  type TerminalCreateHandler,
} from "@harms-haus/acp-chat-core";
import { createAcpStore } from "@harms-haus/acp-chat-react";
import type { AcpStore as AcpStoreType } from "@harms-haus/acp-chat-react";

// ============================================================================
// Types
// ============================================================================

/**
 * Internal session record tracking the mapping between an agent tab and its
 * ACP session controller.
 */
interface SessionRecord {
  agentTabId: string;
  worktreeId: string;
  sessionId: string | null;
  cwd: string;
  controller: SessionController;
  transport: YmirAcpTransport;
}

/**
 * Callback for sending raw ACP JSON-RPC through ymir's transport layer.
 * The implementation should encode the payload in the appropriate bridge
 * envelope format and send it over the WebSocket connection.
 */
export type SendAcpPayloadFn = (payload: Record<string, unknown>) => void;

/**
 * Callback for receiving the current connection status from ymir's transport.
 */
export type GetConnectionStatusFn = () => CoreConnectionStatus;

/**
 * Callback for creating a terminal session when an agent requests one
 * via the ACP terminal/create JSON-RPC method.
 *
 * The callback should create a ymir PTY session and return the terminal ID.
 * For the minimal integration, the returned terminalId is a unique ID
 * generated on the client side; the actual PTY creation happens via
 * a TerminalCreate message sent to the ymir server.
 */
export type CreateTerminalCallback = (
  worktreeId: string,
  request: CreateTerminalRequest,
) => Promise<CreateTerminalResponse | null>;

/**
 * Configuration for the AcpSessionManager.
 */
export interface AcpSessionManagerConfig {
  /** Function to send ACP JSON-RPC payloads through ymir's transport. */
  sendAcpPayload: SendAcpPayloadFn;
  /** Function to get the current WebSocket connection status. */
  getConnectionStatus: GetConnectionStatusFn;
  /**
   * Callback to subscribe to connection status changes.
   * The session manager uses this to propagate WS status to
   * all YmirAcpTransport instances so SessionController updates.
   */
  onStatusChange?: (handler: (status: CoreConnectionStatus) => void) => () => void;
  /** Function to create a terminal session when an agent requests terminal/create. */
  createTerminal?: CreateTerminalCallback;
  /** Request timeout in milliseconds (default: 30000). */
  requestTimeoutMs?: number;
}

/**
 * Public interface for the session manager singleton.
 */
export interface AcpSessionManagerApi {
  /**
   * Configure the session manager with transport callbacks.
   * Must be called before any other methods.
   */
  configure(config: AcpSessionManagerConfig): void;

  /**
   * Get or create a SessionController for the given agent tab.
   * If no session exists for the agentTabId, creates a new one
   * (but does NOT initialize or create an ACP session yet —
   * call initialize() and createSession() for that).
   *
   * @param agentTabId - Unique identifier for the agent tab
   * @param worktreeId - The worktree this agent tab belongs to
   * @param transport - The transport to use for ACP communication
   */
  getOrCreateController(
    agentTabId: string,
    worktreeId: string,
    transport?: Transport,
  ): SessionController;

  /**
   * Remove and clean up a SessionController for an agent tab.
   *
   * @param agentTabId - The agent tab identifier to remove
   */
  removeController(agentTabId: string): void;

  /**
   * Initialize the ACP protocol for an agent tab's session.
   * Calls the ACP `initialize` method.
   */
  initialize(agentTabId: string, options?: {
    clientInfo?: { name: string; version: string };
  }): Promise<unknown>;

  /**
   * Create a new ACP session for an agent tab.
   * Calls the ACP `session/new` method.
   */
  createSession(agentTabId: string, cwd: string, mcpServers?: unknown[]): Promise<{ sessionId: string }>;

  /**
   * Load an existing ACP session for an agent tab.
   * Calls the ACP `session/load` method.
   */
  loadSession(agentTabId: string, sessionId: string, cwd: string, mcpServers?: unknown[]): Promise<unknown>;

  /**
   * Send a prompt through the SessionController for an agent tab.
   */
  sendPrompt(agentTabId: string, prompt: string): Promise<void>;

  /**
   * Cancel the current prompt for an agent tab.
   */
  cancelPrompt(agentTabId: string): Promise<void>;

  /**
   * Set a config option for an agent tab's session.
   */
  setConfigOption(agentTabId: string, configId: string, value: string): Promise<ConfigOption[]>;

  /**
   * Get the current state of an agent tab's SessionController.
   */
  getSessionState(agentTabId: string): SessionControllerState | null;

  /**
   * Get the AcpStore for an agent tab's session.
   */
  getAcpStore(agentTabId: string): AcpStoreType | null;

  /**
   * Get the ACP session ID for an agent tab.
   */
  getSessionId(agentTabId: string): string | null;

  /**
   * Get the agent tab ID for an ACP session ID (reverse lookup).
   */
  getAgentTabId(sessionId: string): string | null;

  /**
   * Get all active agent tab IDs.
   */
  getActiveAgentTabs(): string[];

  /**
   * Feed a raw ACP JSON-RPC payload from a BridgeEnvelope acp_payload
   * into the appropriate SessionController.
   *
   * This method looks up the session by agentTabId directly.
   *
   * @param agentTabId - The agent tab this ACP payload belongs to
   * @param payload - The raw ACP JSON-RPC payload from the bridge
   */
  handleAcpPayloadByAgentTabId(agentTabId: string, payload: Record<string, unknown>): void;

  /**
   * Feed a raw ACP JSON-RPC payload from a BridgeEnvelope acp_payload
   * into the appropriate SessionController (backward compatible).
   *
   * DEPRECATED: Use `handleAcpPayloadByAgentTabId` for new multi-session routing.
   * This method extracts agentTabId from the payload's data field for routing,
   * then falls back to worktreeId lookup if agentTabId is not present
   * (for legacy single-session-per-worktree flows).
   *
   * @param worktreeId - The worktree this ACP payload belongs to (fallback, legacy)
   * @param payload - The raw ACP JSON-RPC payload from the bridge
   */
  handleAcpPayload(worktreeId: string, payload: Record<string, unknown>): void;

  /**
   * Fan-out a JSON-RPC response to ALL session transports.
   * Used when the server relay returns a response without routing metadata
   * (no agentTabId/worktreeId). The transport with the matching pending
   * request ID resolves the promise; others ignore it harmlessly.
   */
  broadcastJsonRpcResponse(payload: Record<string, unknown>): void;

  /**
   * Handle a server-pushed SessionInit event.
   * Sets the sessionId on the SessionController so the Composer enables.
   */
  handleSessionInit(agentTabId: string, acpSessionId: string, configOptions?: unknown[]): void;

  /**
   * Check if a SessionController exists for the given agent tab.
   */
  hasController(agentTabId: string): boolean;

  /**
   * Clean up all sessions and release resources.
   */
  destroy(): void;
}

// ============================================================================
// YmirAcpTransport - Transport adapter for SessionController
// ============================================================================

/**
 * Transport adapter that bridges ymir's WebSocket connection to
 * acp-chat-core's Transport interface.
 *
 * This adapter:
 * - Sends ACP JSON-RPC requests/notifications through ymir's sendAcpPayload callback
 * - Receives incoming ACP JSON-RPC via the receiveAcpPayload method
 * - Tracks pending requests and resolves them when responses arrive
 * - Emits notifications, errors, and status changes to registered handlers
 */
class YmirAcpTransport implements Transport {
  private readonly sendAcpPayload: SendAcpPayloadFn;
  private readonly getConnectionStatus: GetConnectionStatusFn;
  private readonly requestTimeoutMs: number;
  private readonly unsubscribeStatus?: () => void;

  private nextRequestId = 1;
  private pendingRequests = new Map<
    number,
    { resolve: (value: ACPResponse<unknown>) => void; reject: (error: Error) => void; timeout: ReturnType<typeof setTimeout> }
  >();

  private notificationHandlers = new Set<(notification: ACPNotification) => void>();
  private errorHandlers = new Set<(error: Error) => void>();
  private statusHandlers = new Set<(status: CoreConnectionStatus) => void>();

  constructor(
    sendAcpPayload: SendAcpPayloadFn,
    getConnectionStatus: GetConnectionStatusFn,
    requestTimeoutMs: number,
    onStatusChange?: (handler: (status: CoreConnectionStatus) => void) => () => void
  ) {
    this.sendAcpPayload = sendAcpPayload;
    this.getConnectionStatus = getConnectionStatus;
    this.requestTimeoutMs = requestTimeoutMs;

    // Subscribe to WS status changes and propagate to all registered
    // SessionController status handlers (sets connectionStatus in state).
    if (onStatusChange) {
      this.unsubscribeStatus = onStatusChange((status) => {
        console.log(`[YmirAcpTransport] status change: ${status}, notifying ${this.statusHandlers.size} handlers`);
        this.statusHandlers.forEach((handler) => handler(status));
      });
    }
  }

  // ---- Transport interface ----

  async connect(): Promise<void> {
    // Connection is managed by ymir's WebSocket client.
    // This is a no-op — the transport delegates to the existing connection.
  }

  async disconnect(): Promise<void> {
    // Disconnect is managed by ymir's WebSocket client.
    // Reject all pending requests on disconnect.
    this.rejectAllPending(new Error("Disconnected"));
    this.unsubscribeStatus?.();
  }

  getStatus(): CoreConnectionStatus {
    return this.getConnectionStatus();
  }

  async sendRequest<T = unknown>(request: ACPRequest): Promise<ACPResponse<T>> {
    const id = this.nextRequestId++;
    const fullRequest = { ...request, id } as ACPRequest;
    console.log(`[YmirAcpTransport] sendRequest: id=${id}, method=${request.method}`);

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(id as number);
        reject(new Error(`Request ${id} (${request.method}) timed out after ${this.requestTimeoutMs}ms`));
      }, this.requestTimeoutMs);

      this.pendingRequests.set(id as number, {
        resolve: resolve as (value: ACPResponse<unknown>) => void,
        reject,
        timeout,
      });

      // Send the raw ACP JSON-RPC request through ymir's transport
      this.sendAcpPayload(fullRequest as unknown as Record<string, unknown>);
    });
  }

  sendNotification(notification: ACPNotification): void {
    this.sendAcpPayload(notification as unknown as Record<string, unknown>);
  }

  sendResponse<T = unknown>(response: ACPResponse<T>): void {
    this.sendAcpPayload(response as unknown as Record<string, unknown>);
  }

  sendRawResponse(payload: Record<string, unknown>): void {
    this.sendAcpPayload(payload);
  }

  onNotification(handler: (notification: ACPNotification) => void): () => void {
    this.notificationHandlers.add(handler);
    return () => this.notificationHandlers.delete(handler);
  }

  onError(handler: (error: Error) => void): () => void {
    this.errorHandlers.add(handler);
    return () => this.errorHandlers.delete(handler);
  }

  onStatusChange(handler: (status: CoreConnectionStatus) => void): () => void {
    this.statusHandlers.add(handler);
    return () => this.statusHandlers.delete(handler);
  }

  // ---- Incoming ACP payload processing ----

  /**
   * Process an incoming ACP JSON-RPC payload from the bridge.
   * This is called by AcpSessionManager when a BridgeEnvelope acp_payload arrives.
   */
  receiveAcpPayload(payload: Record<string, unknown>): void {
    // Check if it's a response to a pending request
    if ("id" in payload && typeof payload.id === "number") {
      const id = payload.id as number;
      const pending = this.pendingRequests.get(id);
      console.log(`[YmirAcpTransport] receiveAcpPayload: id=${id}, pending=${!!pending}, pendingKeys=${JSON.stringify([...this.pendingRequests.keys()])}`);
      if (pending) {
        clearTimeout(pending.timeout);
        this.pendingRequests.delete(id);

        if ("error" in payload && payload.error) {
          const err = payload.error as { message: string };
          pending.reject(new Error(err.message || "Unknown error"));
        } else {
          pending.resolve(payload as unknown as ACPResponse<unknown>);
        }
        return;
      }
    }

    // Emit as notification for non-response payloads (session updates, etc.)
    // The SessionController's internal handleAcpPayload will process these
    // and emit sessionUpdate events as appropriate.
    const notification = payload as unknown as ACPNotification;
    this.notificationHandlers.forEach((handler) => handler(notification));
  }

  // ---- Internal helpers ----

  private rejectAllPending(error: Error): void {
    for (const pending of this.pendingRequests.values()) {
      clearTimeout(pending.timeout);
      pending.reject(error);
    }
    this.pendingRequests.clear();
  }
}

// ============================================================================
// AcpSessionManager
// ============================================================================

class AcpSessionManagerImpl implements AcpSessionManagerApi {
  // Sessions keyed by agentTabId (supports multiple sessions per worktree)
  private sessions = new Map<string, SessionRecord>();
  private acpStores = new Map<string, AcpStoreType>();
  private sessionIdToAgentTab = new Map<string, string>();
  // Reverse index: worktreeId → set of agentTabIds for backward compatibility
  private worktreeToAgentTabIds = new Map<string, Set<string>>();
  private config: AcpSessionManagerConfig | null = null;

  // ---- Configuration ----

  configure(config: AcpSessionManagerConfig): void {
    this.config = config;
  }

  private assertConfigured(): AcpSessionManagerConfig {
    if (!this.config) {
      throw new Error(
        "AcpSessionManager not configured. Call configure() before using."
      );
    }
    return this.config;
  }

  // ---- Worktree index helpers ----

  private addToWorktreeIndex(worktreeId: string, agentTabId: string): void {
    let agentTabIds = this.worktreeToAgentTabIds.get(worktreeId);
    if (!agentTabIds) {
      agentTabIds = new Set();
      this.worktreeToAgentTabIds.set(worktreeId, agentTabIds);
    }
    agentTabIds.add(agentTabId);
  }

  private removeFromWorktreeIndex(worktreeId: string, agentTabId: string): void {
    const agentTabIds = this.worktreeToAgentTabIds.get(worktreeId);
    if (agentTabIds) {
      agentTabIds.delete(agentTabId);
      if (agentTabIds.size === 0) {
        this.worktreeToAgentTabIds.delete(worktreeId);
      }
    }
  }

  /**
   * Find an agentTabId for a given worktreeId. Returns the first
   * agentTabId associated with the worktree, or null if none exist.
   * Used by the deprecated handleAcpPayload fallback path.
   */
  private findAgentTabIdByWorktree(worktreeId: string): string | null {
    const agentTabIds = this.worktreeToAgentTabIds.get(worktreeId);
    if (!agentTabIds || agentTabIds.size === 0) return null;
    // Return the first agentTabId (iteration order is insertion order for Sets)
    return agentTabIds.values().next().value as string;
  }

  // ---- Session lifecycle ----

  getOrCreateController(
    agentTabId: string,
    worktreeId: string,
    externalTransport?: Transport,
  ): SessionController {
    const existing = this.sessions.get(agentTabId);
    if (existing) {
      return existing.controller;
    }

    const config = this.assertConfigured();

    let transport: YmirAcpTransport;
    if (externalTransport) {
      // If an external transport is provided, adapt it to YmirAcpTransport interface
      // For now, create a new YmirAcpTransport with the configured callbacks
      transport = new YmirAcpTransport(
        config.sendAcpPayload,
        config.getConnectionStatus,
        config.requestTimeoutMs ?? 30000,
        config.onStatusChange
      );
    } else {
      transport = new YmirAcpTransport(
        config.sendAcpPayload,
        config.getConnectionStatus,
        config.requestTimeoutMs ?? 30000,
        config.onStatusChange
      );
    }

    return this.createSessionRecord(agentTabId, worktreeId, "", config, transport).controller;
  }

  private createSessionRecord(
    agentTabId: string,
    worktreeId: string,
    cwd: string,
    config: AcpSessionManagerConfig,
    transport: YmirAcpTransport,
  ): SessionRecord {
    const controller = new SessionController(transport);
    const acpStore = createAcpStore(controller);

    const session: SessionRecord = {
      agentTabId,
      worktreeId,
      sessionId: null,
      cwd,
      controller,
      transport,
    };

    this.sessions.set(agentTabId, session);
    this.acpStores.set(agentTabId, acpStore);
    this.addToWorktreeIndex(worktreeId, agentTabId);

    // Subscribe to agent-requested terminal/create events if a callback is configured.
    // This bridges ACP's agent-initiated terminal model to ymir's client-initiated PTY system.
    if (config.createTerminal) {
      const wtId = worktreeId;
      const createTerm = config.createTerminal;
      const handler: TerminalCreateHandler = async (request: CreateTerminalRequest) => {
        return createTerm(wtId, request);
      };
      controller.subscribeToTerminalCreate(handler);
    }

    return session;
  }

  removeController(agentTabId: string): void {
    const session = this.sessions.get(agentTabId);
    if (!session) return;

    // Clean up reverse mapping
    if (session.sessionId) {
      this.sessionIdToAgentTab.delete(session.sessionId);
    }

    // Remove from worktree index
    this.removeFromWorktreeIndex(session.worktreeId, agentTabId);

    // Destroy and clean up the AcpStore
    const acpStore = this.acpStores.get(agentTabId);
    if (acpStore) {
      acpStore.destroy();
      this.acpStores.delete(agentTabId);
    }

    // Disconnect the transport (rejects pending requests)
    session.transport.disconnect().catch(() => {});

    this.sessions.delete(agentTabId);
  }

  // ---- ACP protocol methods ----

  async initialize(agentTabId: string, options?: {
    clientInfo?: { name: string; version: string };
  }): Promise<unknown> {
    const session = this.sessions.get(agentTabId);
    if (!session) {
      throw new Error(`No SessionController for agent tab: ${agentTabId}`);
    }
    console.log(`[AcpSessionManager] initialize() starting for ${agentTabId}`);
    try {
      const result = await session.controller.initialize(options);
      console.log(`[AcpSessionManager] initialize() completed for ${agentTabId}, state:`, session.controller.getState());
      return result;
    } catch (err) {
      console.error(`[AcpSessionManager] initialize() FAILED for ${agentTabId}:`, err);
      throw err;
    }
  }

  async createSession(
    agentTabId: string,
    cwd: string,
    mcpServers: unknown[] = []
  ): Promise<{ sessionId: string }> {
    const session = this.sessions.get(agentTabId);
    if (!session) {
      throw new Error(`No SessionController for agent tab: ${agentTabId}`);
    }

    const result = await session.controller.createSession(cwd, mcpServers);
    const resultObj = result as { sessionId: string };

    // Update mappings
    session.sessionId = resultObj.sessionId;
    session.cwd = cwd;
    this.sessionIdToAgentTab.set(resultObj.sessionId, agentTabId);

    return resultObj;
  }

  /**
   * Handle a server-pushed SessionInit event.
   * Sets the sessionId on the SessionController so the Composer enables.
   * Also updates the internal session mapping and configOptions.
   */
  handleSessionInit(agentTabId: string, acpSessionId: string, configOptions?: unknown[]): void {
    const session = this.sessions.get(agentTabId);
    if (!session) {
      console.warn(`[AcpSessionManager] handleSessionInit: no session for ${agentTabId}`);
      return;
    }

    console.log(`[AcpSessionManager] handleSessionInit: setting sessionId=${acpSessionId} for agentTabId=${agentTabId}`);

    // Update the controller state (triggers statusChange → React re-render)
    session.controller.setSessionId(acpSessionId, configOptions);

    // Update internal mapping
    session.sessionId = acpSessionId;
    this.sessionIdToAgentTab.set(acpSessionId, agentTabId);
  }

  async loadSession(
    agentTabId: string,
    sessionId: string,
    cwd: string,
    mcpServers?: unknown[]
  ): Promise<unknown> {
    const session = this.sessions.get(agentTabId);
    if (!session) {
      throw new Error(`No SessionController for agent tab: ${agentTabId}`);
    }

    const result = await session.controller.loadSession(sessionId, cwd, mcpServers);

    // Update mappings
    session.sessionId = sessionId;
    session.cwd = cwd;
    this.sessionIdToAgentTab.set(sessionId, agentTabId);

    return result;
  }

  async sendPrompt(agentTabId: string, prompt: string): Promise<void> {
    const session = this.sessions.get(agentTabId);
    if (!session) {
      throw new Error(`No SessionController for agent tab: ${agentTabId}`);
    }
    if (!session.sessionId) {
      throw new Error(`No ACP session for agent tab: ${agentTabId}`);
    }
    return session.controller.sendPrompt(session.sessionId, prompt);
  }

  async cancelPrompt(agentTabId: string): Promise<void> {
    const session = this.sessions.get(agentTabId);
    if (!session) {
      throw new Error(`No SessionController for agent tab: ${agentTabId}`);
    }
    if (!session.sessionId) {
      throw new Error(`No ACP session for agent tab: ${agentTabId}`);
    }
    return session.controller.cancelPrompt(session.sessionId);
  }

  async setConfigOption(
    agentTabId: string,
    configId: string,
    value: string
  ): Promise<ConfigOption[]> {
    const session = this.sessions.get(agentTabId);
    if (!session) {
      throw new Error(`No SessionController for agent tab: ${agentTabId}`);
    }
    if (!session.sessionId) {
      throw new Error(`No ACP session for agent tab: ${agentTabId}`);
    }
    return session.controller.setConfigOption(session.sessionId, configId, value);
  }

  // ---- State queries ----

  getSessionState(agentTabId: string): SessionControllerState | null {
    const session = this.sessions.get(agentTabId);
    if (!session) return null;
    return session.controller.getState();
  }

  getAcpStore(agentTabId: string): AcpStoreType | null {
    return this.acpStores.get(agentTabId) ?? null;
  }

  getSessionId(agentTabId: string): string | null {
    const session = this.sessions.get(agentTabId);
    return session?.sessionId ?? null;
  }

  getAgentTabId(sessionId: string): string | null {
    return this.sessionIdToAgentTab.get(sessionId) ?? null;
  }

  getActiveAgentTabs(): string[] {
    return Array.from(this.sessions.keys());
  }

  // ---- Incoming ACP event routing ----

  /**
   * Route ACP payload by agentTabId directly (new multi-session flow).
   */
  handleAcpPayloadByAgentTabId(agentTabId: string, payload: Record<string, unknown>): void {
    const session = this.sessions.get(agentTabId);
    if (!session) {
      console.warn(
        `[AcpSessionManager] No SessionController for agent tab: ${agentTabId}. ` +
        "Dropping ACP payload. Create a controller first with getOrCreateController()."
      );
      return;
    }

    // Feed the raw ACP JSON-RPC payload to the transport, which will either
    // resolve a pending request or emit it as a notification.
    // The SessionController's internal handleAcpPayload method (called via
    // the transport's onNotification handler wired up in the constructor)
    // will process session updates, permission requests, etc.
    session.transport.receiveAcpPayload(payload);
  }

  /**
   * Route ACP payload with backward compatibility (legacy single-session flow).
   * DEPRECATED: Use `handleAcpPayloadByAgentTabId` for new multi-session routing.
   * Extracts agentTabId from the payload data for multi-session routing.
   * Falls back to worktreeId lookup if agentTabId is not present.
   */
  handleAcpPayload(worktreeId: string, payload: Record<string, unknown>): void {
    // Extract agentTabId from payload.data for multi-session routing
    const data = payload.data as Record<string, unknown> | undefined;
    const agentTabIdFromPayload = data?.agentTabId as string | undefined;

    // Use agentTabId from payload if available; otherwise resolve via the
    // worktree→agentTabId reverse index so we always look up by the correct key.
    const lookupKey = agentTabIdFromPayload ?? this.findAgentTabIdByWorktree(worktreeId);

    if (!lookupKey) {
      console.warn(
        `[AcpSessionManager] Cannot route ACP payload: no agentTabId in payload ` +
        `and no controller found for worktreeId ${worktreeId}. Dropping.`
      );
      return;
    }

    const session = this.sessions.get(lookupKey);
    if (!session) {
      console.warn(
        `[AcpSessionManager] No SessionController for key: ${lookupKey}. ` +
        "Dropping ACP payload. Create a controller first with getOrCreateController()."
      );
      return;
    }

    // Feed the raw ACP JSON-RPC payload to the transport, which will either
    // resolve a pending request or emit it as a notification.
    session.transport.receiveAcpPayload(payload);
  }

  // ---- Utility ----

  hasController(agentTabId: string): boolean {
    return this.sessions.has(agentTabId);
  }

  broadcastJsonRpcResponse(payload: Record<string, unknown>): void {
    const sessionCount = this.sessions.size;
    console.log(`[AcpSessionManager] broadcastJsonRpcResponse: id=${payload.id}, sessions=${sessionCount}`);
    for (const [key, session] of this.sessions.entries()) {
      console.log(`[AcpSessionManager] broadcasting to transport key=${key}`);
      session.transport.receiveAcpPayload(payload);
    }
  }

  destroy(): void {
    // Destroy all AcpStores first
    for (const acpStore of this.acpStores.values()) {
      acpStore.destroy();
    }
    this.acpStores.clear();

    // Collect all agentTabIds before removing (removeController mutates the index)
    const allAgentTabIds = Array.from(this.sessions.keys());
    for (const agentTabId of allAgentTabIds) {
      this.removeController(agentTabId);
    }
    this.sessions.clear();
    this.sessionIdToAgentTab.clear();
    this.worktreeToAgentTabIds.clear();
    this.config = null;
  }
}

// ============================================================================
// Singleton export
// ============================================================================

/**
 * Global AcpSessionManager singleton.
 *
 * Usage:
 *   import { acpSessionManager } from './lib/acp-session-manager';
 *
 *   // Configure once at app startup
 *   acpSessionManager.configure({
 *     sendAcpPayload: (payload) => { /* send through ymir's WS *\/ },
 *     getConnectionStatus: () => ymirClient.getStatus(),
 *   });
 *
 *   // Multi-session: Create a session controller per agent tab
 *   const controller = acpSessionManager.getOrCreateController(agentTabId, worktreeId);
 *
 *   // Route incoming ACP events from the bridge (backward compatible)
 *   acpSessionManager.handleAcpPayload(worktreeId, rawAcpJsonRpc);
 *
 *   // Or route by agentTabId directly (multi-session flow)
 *   acpSessionManager.handleAcpPayloadByAgentTabId(agentTabId, rawAcpJsonRpc);
 *
 *   // Send prompts
 *   await acpSessionManager.sendPrompt(agentTabId, "Hello");
 */
export const acpSessionManager: AcpSessionManagerApi = new AcpSessionManagerImpl();

// ============================================================================
// Re-exports for convenience
// ============================================================================

export type {
  SessionRecord as InternalSessionRecord,
  YmirAcpTransport,
};

export {
  SessionController,
  type Transport,
  type CoreConnectionStatus,
  type ACPRequest,
  type ACPResponse,
  type ACPNotification,
  type SessionControllerState,
  type ConfigOption,
};
