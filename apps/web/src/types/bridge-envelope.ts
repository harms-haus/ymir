/**
 * BridgeEnvelope and BridgeMessage TypeScript type definitions.
 *
 * Mirrors the Rust BridgeMessage enum from crates/acp-ws-bridge/src/contract/message.rs.
 * Uses serde(tag = "type", rename_all = "snake_case") for discriminant values.
 *
 * The BridgeEnvelope wraps BridgeMessage with version, sequence, and timestamp metadata.
 * This file provides:
 * - Individual named interfaces for each BridgeMessage variant
 * - The BridgeMessage discriminated union
 * - The BridgeEnvelope interface
 * - Type guard functions for union narrowing
 * - Utility types for payload extraction
 */

import type { BridgeStatus } from "./generated/BridgeStatus";

// ============================================================================
// Payload type alias (maps to serde_json::Value)
// ============================================================================

/** Opaque JSON value passed through from the bridge without interpretation. */
export type BridgePayload =
  | number
  | string
  | boolean
  | Array<BridgePayload>
  | { [key: string]: BridgePayload | undefined }
  | null;

// ============================================================================
// BridgeMessage variants (6 existing + 12 ymir-specific = 18 total)
// ============================================================================

// --- Existing variants (acp-ws-bridge core) ---

/** Raw ACP JSON-RPC payload from the agent's stdout. */
export interface AcpPayloadMessage {
  type: "acp_payload";
  /** The raw JSON-RPC message as received from the ACP agent. */
  payload: BridgePayload;
}

/** Bridge lifecycle state change. */
export interface BridgeStatusMessage {
  type: "bridge_status";
  /** The new bridge state. */
  status: BridgeStatus;
}

/** A line of stderr output from the ACP process. */
export interface StderrMessage {
  type: "stderr";
  /** The stderr line content. */
  line: string;
}

/** Notification that the ACP process has exited. */
export interface ProcessExitMessage {
  type: "process_exit";
  /** The exit code, if available. */
  code: number | null;
  /** Signal that terminated the process, if any. */
  signal: string | null;
}

/** Replay metadata at the start of a replay session. */
export interface ReplayMetadataMessage {
  type: "replay_metadata";
  /** Original capture timestamp in milliseconds. */
  captured_at_ms: number;
  /** Total number of envelopes in the replay file. */
  total_envelopes: number;
  /** Optional description of the captured session. */
  description: string | null;
}

/** Command to spawn an ACP agent process (client-to-server). */
export interface StartAgentMessage {
  type: "start_agent";
  /** Command to execute. */
  command: string;
  /** Command arguments. */
  args: string[];
  /** Working directory for the process. */
  cwd: string | null;
  /** Environment variables as key-value pairs. */
  env: Array<[string, string]>;
}

// --- Ymir-specific passthrough variants (12 new) ---

/**
 * Workspace lifecycle event (WorkspaceCreated, WorkspaceDeleted,
 * WorkspaceUpdated). Carries the original ServerMessagePayload data.
 */
export interface WorkspaceEventMessage {
  type: "workspace_event";
  /** The original MessagePack payload as structured JSON. */
  payload: BridgePayload;
}

/**
 * Worktree lifecycle event (WorktreeCreated, WorktreeDeleted,
 * WorktreeChanged, WorktreeListResult, WorktreeStatus,
 * WorktreeDetailsResult). Carries the original ServerMessagePayload data.
 */
export interface WorktreeEventMessage {
  type: "worktree_event";
  /** The original MessagePack payload as structured JSON. */
  payload: BridgePayload;
}

/**
 * Git operation response (GitStatusResult, GitDiffResult).
 * Carries the original ServerMessagePayload data.
 */
export interface GitResponseMessage {
  type: "git_response";
  /** The original MessagePack payload as structured JSON. */
  payload: BridgePayload;
}

/**
 * File operation response (FileContent, FileListResult).
 * Carries the original ServerMessagePayload data.
 */
export interface FileResponseMessage {
  type: "file_response";
  /** The original MessagePack payload as structured JSON. */
  payload: BridgePayload;
}

/**
 * Agent lifecycle event (AgentStatusUpdate, AgentOutput, AgentPrompt,
 * AgentRemoved, AgentUpdated). Carries the original ServerMessagePayload data.
 */
export interface AgentEventMessage {
  type: "agent_event";
  /** The original MessagePack payload as structured JSON. */
  payload: BridgePayload;
}

/**
 * Terminal lifecycle event (TerminalOutput, TerminalCreated,
 * TerminalRemoved, TerminalUpdated, TerminalHistory). Carries the
 * original ServerMessagePayload data.
 */
export interface TerminalEventMessage {
  type: "terminal_event";
  /** The original MessagePack payload as structured JSON. */
  payload: BridgePayload;
}

/**
 * State snapshot response to GetState request. Carries the full
 * application state snapshot as structured JSON.
 */
export interface StateSnapshotMessage {
  type: "state_snapshot";
  /** The original MessagePack payload as structured JSON. */
  payload: BridgePayload;
}

/**
 * System notification (info, warning, error). Triggered by git
 * operations, system events. Carries the original Notification data.
 */
export interface NotificationMessage {
  type: "notification";
  /** The original MessagePack payload as structured JSON. */
  payload: BridgePayload;
}

/**
 * Error response from any failed operation. Carries the original
 * Error data with code, message, details, and optional request_id.
 */
export interface ErrorResponseMessage {
  type: "error_response";
  /** The original MessagePack payload as structured JSON. */
  payload: BridgePayload;
}

/**
 * Acknowledgment for rename/reorder operations. Carries the original
 * Ack data with message_id and status.
 */
export interface AckMessage {
  type: "ack";
  /** The original MessagePack payload as structured JSON. */
  payload: BridgePayload;
}

/**
 * Server-initiated heartbeat ping. Carries the original Ping data
 * with timestamp.
 */
export interface PingMessage {
  type: "ping";
  /** The original MessagePack payload as structured JSON. */
  payload: BridgePayload;
}

/**
 * Heartbeat pong response. Carries the original Pong data with
 * timestamp.
 */
export interface PongMessage {
  type: "pong";
  /** The original MessagePack payload as structured JSON. */
  payload: BridgePayload;
}

// ============================================================================
// BridgeMessage discriminated union
// ============================================================================

/**
 * Complete BridgeMessage union — all 18 variants.
 * Discriminated by the `type` field (snake_case, per serde rename_all).
 */
export type BridgeMessage =
  | AcpPayloadMessage
  | BridgeStatusMessage
  | StderrMessage
  | ProcessExitMessage
  | ReplayMetadataMessage
  | StartAgentMessage
  | WorkspaceEventMessage
  | WorktreeEventMessage
  | GitResponseMessage
  | FileResponseMessage
  | AgentEventMessage
  | TerminalEventMessage
  | StateSnapshotMessage
  | NotificationMessage
  | ErrorResponseMessage
  | AckMessage
  | PingMessage
  | PongMessage;

// ============================================================================
// BridgeEnvelope
// ============================================================================

/**
 * Versioned WebSocket envelope wrapping a BridgeMessage.
 *
 * Fields:
 * - version: Envelope format version (must match supported versions)
 * - seq: Sequence number for ordering (0 in live mode, increasing in replay)
 * - timestamp_ms: Unix timestamp in milliseconds when envelope was created
 * - extra_data: Optional free-form metadata (opaque to the bridge)
 * - ...BridgeMessage: Flattened message fields (type + variant-specific data)
 */
export interface BridgeEnvelope {
  /** Envelope format version. Must be one of SUPPORTED_VERSIONS. */
  version: number;
  /**
   * Sequence number for ordering messages in replay mode.
   * Zero in live mode; monotonically increasing in replay mode.
   */
  seq: number;
  /** Unix timestamp in milliseconds when the envelope was created. */
  timestamp_ms: number;
  /**
   * Optional free-form metadata. The ws-bridge treats this as opaque JSON.
   * Specific interpretations (e.g., replay-speed) happen at the harness-server layer.
   */
  extra_data: BridgePayload | null;
}

/**
 * Full BridgeEnvelope with flattened message fields.
 * The serde(flatten) on BridgeMessage means the type discriminator
 * and variant fields are merged into the envelope at the top level.
 */
export type FullBridgeEnvelope = BridgeEnvelope & BridgeMessage;

// ============================================================================
// Discriminant type literal
// ============================================================================

export type BridgeMessageType = BridgeMessage["type"];

// ============================================================================
// Type guard functions for all 18 variants
// ============================================================================

// --- Existing variant guards ---

/** Type guard for AcpPayload messages. */
export function isAcpPayload(msg: BridgeMessage): msg is AcpPayloadMessage {
  return msg.type === "acp_payload";
}

/** Type guard for BridgeStatus messages. */
export function isBridgeStatus(msg: BridgeMessage): msg is BridgeStatusMessage {
  return msg.type === "bridge_status";
}

/** Type guard for Stderr messages. */
export function isStderr(msg: BridgeMessage): msg is StderrMessage {
  return msg.type === "stderr";
}

/** Type guard for ProcessExit messages. */
export function isProcessExit(msg: BridgeMessage): msg is ProcessExitMessage {
  return msg.type === "process_exit";
}

/** Type guard for ReplayMetadata messages. */
export function isReplayMetadata(msg: BridgeMessage): msg is ReplayMetadataMessage {
  return msg.type === "replay_metadata";
}

/** Type guard for StartAgent messages. */
export function isStartAgent(msg: BridgeMessage): msg is StartAgentMessage {
  return msg.type === "start_agent";
}

// --- Ymir-specific variant guards ---

/** Type guard for WorkspaceEvent messages. */
export function isWorkspaceEvent(msg: BridgeMessage): msg is WorkspaceEventMessage {
  return msg.type === "workspace_event";
}

/** Type guard for WorktreeEvent messages. */
export function isWorktreeEvent(msg: BridgeMessage): msg is WorktreeEventMessage {
  return msg.type === "worktree_event";
}

/** Type guard for GitResponse messages. */
export function isGitResponse(msg: BridgeMessage): msg is GitResponseMessage {
  return msg.type === "git_response";
}

/** Type guard for FileResponse messages. */
export function isFileResponse(msg: BridgeMessage): msg is FileResponseMessage {
  return msg.type === "file_response";
}

/** Type guard for AgentEvent messages. */
export function isAgentEvent(msg: BridgeMessage): msg is AgentEventMessage {
  return msg.type === "agent_event";
}

/** Type guard for TerminalEvent messages. */
export function isTerminalEvent(msg: BridgeMessage): msg is TerminalEventMessage {
  return msg.type === "terminal_event";
}

/** Type guard for StateSnapshot messages. */
export function isStateSnapshotMessage(msg: BridgeMessage): msg is StateSnapshotMessage {
  return msg.type === "state_snapshot";
}

/** Type guard for Notification messages. */
export function isNotificationMessage(msg: BridgeMessage): msg is NotificationMessage {
  return msg.type === "notification";
}

/** Type guard for ErrorResponse messages. */
export function isErrorResponse(msg: BridgeMessage): msg is ErrorResponseMessage {
  return msg.type === "error_response";
}

/** Type guard for Ack messages. */
export function isAckMessage(msg: BridgeMessage): msg is AckMessage {
  return msg.type === "ack";
}

/** Type guard for Ping messages. */
export function isPingMessage(msg: BridgeMessage): msg is PingMessage {
  return msg.type === "ping";
}

/** Type guard for Pong messages. */
export function isPongMessage(msg: BridgeMessage): msg is PongMessage {
  return msg.type === "pong";
}

// ============================================================================
// Envelope-level type guards
// ============================================================================

/** Check if an unknown value is a valid BridgeEnvelope (has required metadata fields). */
export function isBridgeEnvelope(value: unknown): value is FullBridgeEnvelope {
  return (
    typeof value === "object" &&
    value !== null &&
    "version" in value &&
    "seq" in value &&
    "timestamp_ms" in value &&
    "type" in value &&
    typeof (value as FullBridgeEnvelope).version === "number" &&
    typeof (value as FullBridgeEnvelope).seq === "number" &&
    typeof (value as FullBridgeEnvelope).timestamp_ms === "number"
  );
}

/**
 * Narrow a FullBridgeEnvelope to a specific message type.
 * Returns the narrowed envelope or null if the type doesn't match.
 */
export function envelopeIs<T extends BridgeMessage["type"]>(
  envelope: FullBridgeEnvelope,
  type: T
): envelope is FullBridgeEnvelope & { type: T } & Extract<BridgeMessage, { type: T }> {
  return envelope.type === type;
}

// ============================================================================
// Utility types for payload extraction
// ============================================================================

/** Extract the payload type from a BridgeMessage variant that carries a payload field. */
export type PayloadCarryingMessage = Extract<
  BridgeMessage,
  { payload: BridgePayload }
>;

/** Extract the payload type from AcpPayloadMessage specifically. */
export type AcpPayloadType = AcpPayloadMessage["payload"];

/** All message types that carry an opaque payload field. */
export type PayloadMessageType =
  | "acp_payload"
  | "workspace_event"
  | "worktree_event"
  | "git_response"
  | "file_response"
  | "agent_event"
  | "terminal_event"
  | "state_snapshot"
  | "notification"
  | "error_response"
  | "ack"
  | "ping"
  | "pong";

/** Messages with structured fields (not opaque payloads). */
export type StructuredMessage = Extract<
  BridgeMessage,
  | BridgeStatusMessage
  | StderrMessage
  | ProcessExitMessage
  | ReplayMetadataMessage
  | StartAgentMessage
>;
