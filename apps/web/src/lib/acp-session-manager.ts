/**
 * AcpSessionManager - Manages SessionController instances from @harms-haus/acp-chat-core.
 *
 * Creates and manages one SessionController per active worktree, mapping ymir's
 * worktree-scoped model to acp-chat-core's session-scoped model.
 *
 * Responsibilities:
 * - SessionController lifecycle per worktree (create, initialize, destroy)
 * - Worktree ID ↔ ACP session ID mapping
 * - Routing ACP events from BridgeEnvelope acp_payload to the correct SessionController
 * - Exposing prompt sending through SessionController
 *
 * Manages ACP sessions per worktree, routing payloads to SessionControllers.
 *       It runs alongside it, providing SessionController-managed state that can be
 *       consumed once the migration is complete.
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
 * Internal session record tracking the mapping between a worktree and its
 * ACP session controller.
 */
interface WorktreeSession {
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
   * Get or create a SessionController for the given worktree.
   * If no session exists, creates a new one (but does NOT initialize or
   * create an ACP session yet — call initialize() and createSession() for that).
   */
  getOrCreateController(worktreeId: string, cwd: string): SessionController;

  /**
   * Remove and clean up a SessionController for a worktree.
   */
  removeController(worktreeId: string): void;

  /**
   * Initialize the ACP protocol for a worktree's session.
   * Calls the ACP `initialize` method.
   */
  initialize(worktreeId: string, options?: {
    clientInfo?: { name: string; version: string };
  }): Promise<unknown>;

  /**
   * Create a new ACP session for a worktree.
   * Calls the ACP `session/new` method.
   */
  createSession(worktreeId: string, cwd: string, mcpServers?: unknown[]): Promise<{ sessionId: string }>;

  /**
   * Load an existing ACP session for a worktree.
   * Calls the ACP `session/load` method.
   */
  loadSession(worktreeId: string, sessionId: string, cwd: string, mcpServers?: unknown[]): Promise<unknown>;

  /**
   * Send a prompt through the SessionController for a worktree.
   */
  sendPrompt(worktreeId: string, prompt: string): Promise<void>;

  /**
   * Cancel the current prompt for a worktree.
   */
  cancelPrompt(worktreeId: string): Promise<void>;

  /**
   * Set a config option for a worktree's session.
   */
  setConfigOption(worktreeId: string, configId: string, value: string): Promise<ConfigOption[]>;

  /**
   * Get the current state of a worktree's SessionController.
   */
  getSessionState(worktreeId: string): SessionControllerState | null;

  /**
   * Get the AcpStore for a worktree's session.
   */
  getAcpStore(worktreeId: string): AcpStoreType | null;

  /**
   * Get the ACP session ID for a worktree.
   */
  getSessionId(worktreeId: string): string | null;

  /**
   * Get the worktree ID for an ACP session ID (reverse lookup).
   */
  getWorktreeId(sessionId: string): string | null;

  /**
   * Get all active worktree IDs.
   */
  getActiveWorktrees(): string[];

  /**
   * Feed a raw ACP JSON-RPC payload from a BridgeEnvelope acp_payload
   * into the appropriate SessionController.
   *
   * This is the main entry point for routing incoming ACP events from
   * the bridge to SessionController instances.
   *
   * @param worktreeId - The worktree this ACP payload belongs to
   * @param payload - The raw ACP JSON-RPC payload from the bridge
   */
  handleAcpPayload(worktreeId: string, payload: Record<string, unknown>): void;

  /**
   * Check if a SessionController exists for the given worktree.
   */
  hasController(worktreeId: string): boolean;

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
    requestTimeoutMs: number
  ) {
    this.sendAcpPayload = sendAcpPayload;
    this.getConnectionStatus = getConnectionStatus;
    this.requestTimeoutMs = requestTimeoutMs;
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
  }

  getStatus(): CoreConnectionStatus {
    return this.getConnectionStatus();
  }

  async sendRequest<T = unknown>(request: ACPRequest): Promise<ACPResponse<T>> {
    const id = this.nextRequestId++;
    const fullRequest = { ...request, id } as ACPRequest;

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
  private sessions = new Map<string, WorktreeSession>();
  private acpStores = new Map<string, AcpStoreType>();
  private sessionIdToWorktree = new Map<string, string>();
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

  // ---- Session lifecycle ----

  getOrCreateController(worktreeId: string, cwd: string): SessionController {
    const existing = this.sessions.get(worktreeId);
    if (existing) {
      return existing.controller;
    }

    const config = this.assertConfigured();
    const transport = new YmirAcpTransport(
      config.sendAcpPayload,
      config.getConnectionStatus,
      config.requestTimeoutMs ?? 30000
    );

    const controller = new SessionController(transport);
    this.sessions.set(worktreeId, {
      worktreeId,
      sessionId: null,
      cwd,
      controller,
      transport,
    });

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

    // Create an AcpStore for this session controller
    const acpStore = createAcpStore(controller);
    this.acpStores.set(worktreeId, acpStore);

    return controller;
  }

  removeController(worktreeId: string): void {
    const session = this.sessions.get(worktreeId);
    if (!session) return;

    // Clean up reverse mapping
    if (session.sessionId) {
      this.sessionIdToWorktree.delete(session.sessionId);
    }

    // Destroy and clean up the AcpStore
    const acpStore = this.acpStores.get(worktreeId);
    if (acpStore) {
      acpStore.destroy();
      this.acpStores.delete(worktreeId);
    }

    // Disconnect the transport (rejects pending requests)
    session.transport.disconnect().catch(() => {});

    this.sessions.delete(worktreeId);
  }

  // ---- ACP protocol methods ----

  async initialize(worktreeId: string, options?: {
    clientInfo?: { name: string; version: string };
  }): Promise<unknown> {
    const session = this.sessions.get(worktreeId);
    if (!session) {
      throw new Error(`No SessionController for worktree: ${worktreeId}`);
    }
    return session.controller.initialize(options);
  }

  async createSession(
    worktreeId: string,
    cwd: string,
    mcpServers: unknown[] = []
  ): Promise<{ sessionId: string }> {
    const session = this.sessions.get(worktreeId);
    if (!session) {
      throw new Error(`No SessionController for worktree: ${worktreeId}`);
    }

    const result = await session.controller.createSession(cwd, mcpServers);
    const resultObj = result as { sessionId: string };

    // Update mappings
    session.sessionId = resultObj.sessionId;
    session.cwd = cwd;
    this.sessionIdToWorktree.set(resultObj.sessionId, worktreeId);

    return resultObj;
  }

  async loadSession(
    worktreeId: string,
    sessionId: string,
    cwd: string,
    mcpServers?: unknown[]
  ): Promise<unknown> {
    const session = this.sessions.get(worktreeId);
    if (!session) {
      throw new Error(`No SessionController for worktree: ${worktreeId}`);
    }

    const result = await session.controller.loadSession(sessionId, cwd, mcpServers);

    // Update mappings
    session.sessionId = sessionId;
    session.cwd = cwd;
    this.sessionIdToWorktree.set(sessionId, worktreeId);

    return result;
  }

  async sendPrompt(worktreeId: string, prompt: string): Promise<void> {
    const session = this.sessions.get(worktreeId);
    if (!session) {
      throw new Error(`No SessionController for worktree: ${worktreeId}`);
    }
    if (!session.sessionId) {
      throw new Error(`No ACP session for worktree: ${worktreeId}`);
    }
    return session.controller.sendPrompt(session.sessionId, prompt);
  }

  async cancelPrompt(worktreeId: string): Promise<void> {
    const session = this.sessions.get(worktreeId);
    if (!session) {
      throw new Error(`No SessionController for worktree: ${worktreeId}`);
    }
    if (!session.sessionId) {
      throw new Error(`No ACP session for worktree: ${worktreeId}`);
    }
    return session.controller.cancelPrompt(session.sessionId);
  }

  async setConfigOption(
    worktreeId: string,
    configId: string,
    value: string
  ): Promise<ConfigOption[]> {
    const session = this.sessions.get(worktreeId);
    if (!session) {
      throw new Error(`No SessionController for worktree: ${worktreeId}`);
    }
    if (!session.sessionId) {
      throw new Error(`No ACP session for worktree: ${worktreeId}`);
    }
    return session.controller.setConfigOption(session.sessionId, configId, value);
  }

  // ---- State queries ----

  getSessionState(worktreeId: string): SessionControllerState | null {
    const session = this.sessions.get(worktreeId);
    if (!session) return null;
    return session.controller.getState();
  }

  getAcpStore(worktreeId: string): AcpStoreType | null {
    return this.acpStores.get(worktreeId) ?? null;
  }

  getSessionId(worktreeId: string): string | null {
    const session = this.sessions.get(worktreeId);
    return session?.sessionId ?? null;
  }

  getWorktreeId(sessionId: string): string | null {
    return this.sessionIdToWorktree.get(sessionId) ?? null;
  }

  getActiveWorktrees(): string[] {
    return Array.from(this.sessions.keys());
  }

  // ---- Incoming ACP event routing ----

  handleAcpPayload(worktreeId: string, payload: Record<string, unknown>): void {
    const session = this.sessions.get(worktreeId);
    if (!session) {
      console.warn(
        `[AcpSessionManager] No SessionController for worktree: ${worktreeId}. ` +
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

  // ---- Utility ----

  hasController(worktreeId: string): boolean {
    return this.sessions.has(worktreeId);
  }

  destroy(): void {
    // Destroy all AcpStores first
    for (const acpStore of this.acpStores.values()) {
      acpStore.destroy();
    }
    this.acpStores.clear();

    for (const worktreeId of this.sessions.keys()) {
      this.removeController(worktreeId);
    }
    this.sessions.clear();
    this.sessionIdToWorktree.clear();
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
 *   // Create a session controller per worktree
 *   const controller = acpSessionManager.getOrCreateController(worktreeId, cwd);
 *
 *   // Route incoming ACP events from the bridge
 *   acpSessionManager.handleAcpPayload(worktreeId, rawAcpJsonRpc);
 *
 *   // Send prompts
 *   await acpSessionManager.sendPrompt(worktreeId, "Hello");
 */
export const acpSessionManager: AcpSessionManagerApi = new AcpSessionManagerImpl();

// ============================================================================
// Re-exports for convenience
// ============================================================================

export type {
  WorktreeSession as InternalWorktreeSession,
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
