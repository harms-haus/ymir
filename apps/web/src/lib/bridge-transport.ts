/**
 * BridgeEnvelope encoder/decoder for the JSON-based transport layer.
 *
 * Provides typed constructors for each client message type (all 37) and a parser
 * for incoming server envelopes (all 18 BridgeMessage variants decoded into typed
 * handler callbacks).
 *
 * Encoders produce FullBridgeEnvelope messages ready for JSON.stringify.
 * Decoder parses incoming FullBridgeEnvelope and returns DecodedBridgeMessage
 * with type discriminator and typed payload.
 */

import type {
  BridgeEnvelope,
  FullBridgeEnvelope,
  BridgePayload,
  BridgeMessage,
  AcpPayloadMessage,
  BridgeStatusMessage,
  StderrMessage,
  ProcessExitMessage,
  ReplayMetadataMessage,
  StartAgentMessage,
  WorkspaceEventMessage,
  WorktreeEventMessage,
  GitResponseMessage,
  FileResponseMessage,
  AgentEventMessage,
  TerminalEventMessage,
  StateSnapshotMessage,
  NotificationMessage,
  ErrorResponseMessage,
  AckMessage,
  PingMessage,
  PongMessage,
} from '../types/bridge-envelope';

import {
  isAcpPayload,
  isBridgeStatus,
  isStderr,
  isProcessExit,
  isReplayMetadata,
  isStartAgent,
  isWorkspaceEvent,
  isWorktreeEvent,
  isGitResponse,
  isFileResponse,
  isAgentEvent,
  isTerminalEvent,
  isStateSnapshotMessage,
  isNotificationMessage,
  isErrorResponse,
  isAckMessage,
  isPingMessage,
  isPongMessage,
} from '../types/bridge-envelope';

import type {
// Client message types
WorkspaceCreate,
WorkspaceDelete,
WorkspaceRemove,
WorkspaceRename,
WorkspaceUpdate,
WorktreeCreate,
WorktreeDelete,
WorktreeMerge,
WorktreeList,
WorktreeChangeBranch,
GetWorktreeDetails,
WorktreeUpdate,
  AgentSpawn,
  AgentSend,
  AgentCancel,
  AgentSetConfigOption,
  AgentRename,
  AgentReorder,
  AgentResume,
  TerminalInput,
  TerminalResize,
  TerminalCreate,
  TerminalKill,
  TerminalMount,
  TerminalUnmount,
  TerminalTabClose,
  TerminalRename,
  TerminalReorder,
  TerminalRequestHistory,
  FileRead,
  FileWrite,
  FileList,
  GitStatus,
  GitDiff,
  GitCommit,
  CreatePR,
  GetState,
  UpdateSettings,
  Ack,
  Ping,
  Pong,
} from '../types/protocol';

// Bridge envelope version (matches Rust ENVELOPE_VERSION constant).
const BRIDGE_ENVELOPE_VERSION: number = 1;

// ============================================================================
// Sequence number generator
// ============================================================================

let _seq = 0;

/** Generate the next sequence number for BridgeEnvelope ordering. */
export function nextSeq(): number {
  return ++_seq;
}

/** Reset sequence counter (useful for testing or replay mode). */
export function resetSeq(): void {
  _seq = 0;
}

// ============================================================================
// Envelope construction helper
// ============================================================================

/**
 * Create a FullBridgeEnvelope from a message type and payload.
 * The message fields are flattened into the envelope per serde(flatten).
 */
function makeEnvelope<T extends BridgeMessage['type']>(
  type: T,
  payload: Omit<Extract<BridgeMessage, { type: T }>, 'type'>,
  seq?: number
): FullBridgeEnvelope {
  return {
    version: BRIDGE_ENVELOPE_VERSION,
    seq: seq ?? nextSeq(),
    timestamp_ms: Date.now(),
    extra_data: null,
    type,
    ...payload,
  } as unknown as FullBridgeEnvelope;
}

// ============================================================================
// Client message encoders (37 types)
// ============================================================================

// --- Workspace messages (4) ---

/** Encode WorkspaceCreate into a BridgeEnvelope. */
export function encodeWorkspaceCreate(
  data: Omit<WorkspaceCreate, 'type'>
): FullBridgeEnvelope {
  return makeEnvelope('workspace_event', {
    payload: {
      type: 'WorkspaceCreate',
      data,
    } as BridgePayload,
  });
}

/** Encode WorkspaceDelete into a BridgeEnvelope. */
export function encodeWorkspaceDelete(
  data: Omit<WorkspaceDelete, 'type'>
): FullBridgeEnvelope {
  return makeEnvelope('workspace_event', {
    payload: {
      type: 'WorkspaceDelete',
      data,
    } as BridgePayload,
  });
}

/** Encode WorkspaceRemove into a BridgeEnvelope. */
export function encodeWorkspaceRemove(
  data: Omit<WorkspaceRemove, 'type'>
): FullBridgeEnvelope {
  return makeEnvelope('workspace_event', {
    payload: {
      type: 'WorkspaceRemove',
      data,
    } as BridgePayload,
  });
}

/** Encode WorkspaceRename into a BridgeEnvelope. */
export function encodeWorkspaceRename(
  data: Omit<WorkspaceRename, 'type'>
): FullBridgeEnvelope {
  return makeEnvelope('workspace_event', {
    payload: {
      type: 'WorkspaceRename',
      data,
    } as BridgePayload,
  });
}

/** Encode WorkspaceUpdate into a BridgeEnvelope. */
export function encodeWorkspaceUpdate(
  data: Omit<WorkspaceUpdate, 'type'>
): FullBridgeEnvelope {
  return makeEnvelope('workspace_event', {
    payload: {
      type: 'WorkspaceUpdate',
      data,
    } as BridgePayload,
  });
}

// --- Worktree messages (6) ---

/** Encode WorktreeCreate into a BridgeEnvelope. */
export function encodeWorktreeCreate(
  data: Omit<WorktreeCreate, 'type'>
): FullBridgeEnvelope {
  return makeEnvelope('worktree_event', {
    payload: {
      type: 'WorktreeCreate',
      data,
    } as BridgePayload,
  });
}

/** Encode WorktreeDelete into a BridgeEnvelope. */
export function encodeWorktreeDelete(
  data: Omit<WorktreeDelete, 'type'>
): FullBridgeEnvelope {
  return makeEnvelope('worktree_event', {
    payload: {
      type: 'WorktreeDelete',
      data,
    } as BridgePayload,
  });
}

/** Encode WorktreeMerge into a BridgeEnvelope. */
export function encodeWorktreeMerge(
  data: Omit<WorktreeMerge, 'type'>
): FullBridgeEnvelope {
  return makeEnvelope('worktree_event', {
    payload: {
      type: 'WorktreeMerge',
      data,
    } as BridgePayload,
  });
}

/** Encode WorktreeList into a BridgeEnvelope. */
export function encodeWorktreeList(
  data: Omit<WorktreeList, 'type'>
): FullBridgeEnvelope {
  return makeEnvelope('worktree_event', {
    payload: {
      type: 'WorktreeList',
      data,
    } as BridgePayload,
  });
}

/** Encode WorktreeChangeBranch into a BridgeEnvelope. */
export function encodeWorktreeChangeBranch(
  data: Omit<WorktreeChangeBranch, 'type'>
): FullBridgeEnvelope {
  return makeEnvelope('worktree_event', {
    payload: {
      type: 'WorktreeChangeBranch',
      data,
    } as BridgePayload,
  });
}

/** Encode GetWorktreeDetails into a BridgeEnvelope. */
export function encodeGetWorktreeDetails(
  data: Omit<GetWorktreeDetails, 'type'>
): FullBridgeEnvelope {
  return makeEnvelope('worktree_event', {
    payload: {
      type: 'GetWorktreeDetails',
      data,
    } as BridgePayload,
  });
}

/** Encode WorktreeUpdate into a BridgeEnvelope. */
export function encodeWorktreeUpdate(
  data: Omit<WorktreeUpdate, 'type'>
): FullBridgeEnvelope {
  return makeEnvelope('worktree_event', {
    payload: {
      type: 'WorktreeUpdate',
      data,
    } as BridgePayload,
  });
}

// --- Agent messages (6) ---

/** Encode AgentSpawn into a BridgeEnvelope. */
export function encodeAgentSpawn(
  data: Omit<AgentSpawn, 'type'>
): FullBridgeEnvelope {
  return makeEnvelope('agent_event', {
    payload: {
      type: 'AgentSpawn',
      data,
    } as BridgePayload,
  });
}

/** Encode AgentSend into a BridgeEnvelope. */
export function encodeAgentSend(
  data: Omit<AgentSend, 'type'>
): FullBridgeEnvelope {
  return makeEnvelope('agent_event', {
    payload: {
      type: 'AgentSend',
      data,
    } as BridgePayload,
  });
}

/** Encode AgentCancel into a BridgeEnvelope. */
export function encodeAgentCancel(
  data: Omit<AgentCancel, 'type'>
): FullBridgeEnvelope {
  return makeEnvelope('agent_event', {
    payload: {
      type: 'AgentCancel',
      data,
    } as BridgePayload,
  });
}

/** Encode AgentSetConfigOption into a BridgeEnvelope. */
export function encodeAgentSetConfigOption(
  data: Omit<AgentSetConfigOption, 'type'>
): FullBridgeEnvelope {
  return makeEnvelope('agent_event', {
    payload: {
      type: 'AgentSetConfigOption',
      data,
    } as BridgePayload,
  });
}

/** Encode AgentRename into a BridgeEnvelope. */
export function encodeAgentRename(
  data: Omit<AgentRename, 'type'>
): FullBridgeEnvelope {
  return makeEnvelope('agent_event', {
    payload: {
      type: 'AgentRename',
      data,
    } as BridgePayload,
  });
}

/** Encode AgentReorder into a BridgeEnvelope. */
export function encodeAgentReorder(
  data: Omit<AgentReorder, 'type'>
): FullBridgeEnvelope {
  return makeEnvelope('agent_event', {
    payload: {
      type: 'AgentReorder',
      data,
    } as BridgePayload,
  });
}

/** Encode AgentResume into a BridgeEnvelope. */
export function encodeAgentResume(
  data: Omit<AgentResume, 'type'>
): FullBridgeEnvelope {
  return makeEnvelope('agent_event', {
    payload: {
      type: 'AgentResume',
      data,
    } as BridgePayload,
  });
}

// --- Terminal messages (7) ---

/** Encode TerminalInput into a BridgeEnvelope. */
export function encodeTerminalInput(
  data: Omit<TerminalInput, 'type'>
): FullBridgeEnvelope {
  return makeEnvelope('terminal_event', {
    payload: {
      type: 'TerminalInput',
      data,
    } as BridgePayload,
  });
}

/** Encode TerminalResize into a BridgeEnvelope. */
export function encodeTerminalResize(
  data: Omit<TerminalResize, 'type'>
): FullBridgeEnvelope {
  return makeEnvelope('terminal_event', {
    payload: {
      type: 'TerminalResize',
      data,
    } as BridgePayload,
  });
}

/** Encode TerminalCreate into a BridgeEnvelope. */
export function encodeTerminalCreate(
  data: Omit<TerminalCreate, 'type'>
): FullBridgeEnvelope {
  return makeEnvelope('terminal_event', {
    payload: {
      type: 'TerminalCreate',
      data,
    } as BridgePayload,
  });
}

/** Encode TerminalKill into a BridgeEnvelope. */
export function encodeTerminalKill(
  data: Omit<TerminalKill, 'type'>
): FullBridgeEnvelope {
  return makeEnvelope('terminal_event', {
    payload: {
      type: 'TerminalKill',
      data,
    } as BridgePayload,
  });
}

/** Encode TerminalMount into a BridgeEnvelope. */
export function encodeTerminalMount(
  data: Omit<TerminalMount, 'type'>
): FullBridgeEnvelope {
  return makeEnvelope('terminal_event', {
    payload: {
      type: 'TerminalMount',
      data,
    } as BridgePayload,
  });
}

/** Encode TerminalUnmount into a BridgeEnvelope. */
export function encodeTerminalUnmount(
  data: Omit<TerminalUnmount, 'type'>
): FullBridgeEnvelope {
  return makeEnvelope('terminal_event', {
    payload: {
      type: 'TerminalUnmount',
      data,
    } as BridgePayload,
  });
}

/** Encode TerminalTabClose into a BridgeEnvelope. */
export function encodeTerminalTabClose(
  data: Omit<TerminalTabClose, 'type'>
): FullBridgeEnvelope {
  return makeEnvelope('terminal_event', {
    payload: {
      type: 'TerminalTabClose',
      data,
    } as BridgePayload,
  });
}

/** Encode TerminalRename into a BridgeEnvelope. */
export function encodeTerminalRename(
  data: Omit<TerminalRename, 'type'>
): FullBridgeEnvelope {
  return makeEnvelope('terminal_event', {
    payload: {
      type: 'TerminalRename',
      data,
    } as BridgePayload,
  });
}

/** Encode TerminalReorder into a BridgeEnvelope. */
export function encodeTerminalReorder(
  data: Omit<TerminalReorder, 'type'>
): FullBridgeEnvelope {
  return makeEnvelope('terminal_event', {
    payload: {
      type: 'TerminalReorder',
      data,
    } as BridgePayload,
  });
}

/** Encode TerminalRequestHistory into a BridgeEnvelope. */
export function encodeTerminalRequestHistory(
  data: Omit<TerminalRequestHistory, 'type'>
): FullBridgeEnvelope {
  return makeEnvelope('terminal_event', {
    payload: {
      type: 'TerminalRequestHistory',
      data,
    } as BridgePayload,
  });
}

// --- File messages (3) ---

/** Encode FileRead into a BridgeEnvelope. */
export function encodeFileRead(
  data: Omit<FileRead, 'type'>
): FullBridgeEnvelope {
  return makeEnvelope('file_response', {
    payload: {
      type: 'FileRead',
      data,
    } as BridgePayload,
  });
}

/** Encode FileWrite into a BridgeEnvelope. */
export function encodeFileWrite(
  data: Omit<FileWrite, 'type'>
): FullBridgeEnvelope {
  return makeEnvelope('file_response', {
    payload: {
      type: 'FileWrite',
      data,
    } as BridgePayload,
  });
}

/** Encode FileList into a BridgeEnvelope. */
export function encodeFileList(
  data: Omit<FileList, 'type'>
): FullBridgeEnvelope {
  return makeEnvelope('file_response', {
    payload: {
      type: 'FileList',
      data,
    } as BridgePayload,
  });
}

// --- Git messages (3) ---

/** Encode GitStatus into a BridgeEnvelope. */
export function encodeGitStatus(
  data: Omit<GitStatus, 'type'>
): FullBridgeEnvelope {
  return makeEnvelope('git_response', {
    payload: {
      type: 'GitStatus',
      data,
    } as BridgePayload,
  });
}

/** Encode GitDiff into a BridgeEnvelope. */
export function encodeGitDiff(
  data: Omit<GitDiff, 'type'>
): FullBridgeEnvelope {
  return makeEnvelope('git_response', {
    payload: {
      type: 'GitDiff',
      data,
    } as BridgePayload,
  });
}

/** Encode GitCommit into a BridgeEnvelope. */
export function encodeGitCommit(
  data: Omit<GitCommit, 'type'>
): FullBridgeEnvelope {
  return makeEnvelope('git_response', {
    payload: {
      type: 'GitCommit',
      data,
    } as BridgePayload,
  });
}

// --- PR messages (1) ---

/** Encode CreatePR into a BridgeEnvelope. */
export function encodeCreatePR(
  data: Omit<CreatePR, 'type'>
): FullBridgeEnvelope {
  return makeEnvelope('git_response', {
    payload: {
      type: 'CreatePR',
      data,
    } as BridgePayload,
  });
}

// --- State messages (2) ---

/** Encode GetState into a BridgeEnvelope. */
export function encodeGetState(
  data: Omit<GetState, 'type'>
): FullBridgeEnvelope {
  return makeEnvelope('state_snapshot', {
    payload: {
      type: 'GetState',
      data,
    } as BridgePayload,
  });
}

/** Encode UpdateSettings into a BridgeEnvelope. */
export function encodeUpdateSettings(
  data: Omit<UpdateSettings, 'type'>
): FullBridgeEnvelope {
  return makeEnvelope('state_snapshot', {
    payload: {
      type: 'UpdateSettings',
      data,
    } as BridgePayload,
  });
}

// --- Heartbeat messages (3) ---

/** Encode client Ping into a BridgeEnvelope. */
export function encodePing(
  data: Omit<Ping, 'type'>
): FullBridgeEnvelope {
  return makeEnvelope('ping', {
    payload: {
      type: 'Ping',
      data,
    } as BridgePayload,
  });
}

/** Encode client Pong into a BridgeEnvelope. */
export function encodePong(
  data: Omit<Pong, 'type'>
): FullBridgeEnvelope {
  return makeEnvelope('pong', {
    payload: {
      type: 'Pong',
      data,
    } as BridgePayload,
  });
}

/** Encode Ack into a BridgeEnvelope. */
export function encodeAck(
  data: Omit<Ack, 'type'>
): FullBridgeEnvelope {
  return makeEnvelope('ack', {
    payload: {
      type: 'Ack',
      data,
    } as BridgePayload,
  });
}

// --- StartAgent (special bridge message) ---

/** Encode StartAgent into a BridgeEnvelope (native bridge message). */
export function encodeStartAgent(
  data: Omit<StartAgentMessage, 'type'>
): FullBridgeEnvelope {
  return makeEnvelope('start_agent', data);
}

// ============================================================================
// Unified encoder: encode any ClientMessage into a BridgeEnvelope
// ============================================================================

/**
 * Encode any ClientMessage into a FullBridgeEnvelope.
 * Dispatches to the appropriate encoder based on message type.
 */
export function encodeClientMessage(
  message: Omit<
    | WorkspaceCreate
    | WorkspaceDelete
    | WorkspaceRemove
    | WorkspaceRename
    | WorkspaceUpdate
    | WorktreeCreate
    | WorktreeDelete
    | WorktreeMerge
    | WorktreeList
    | WorktreeChangeBranch
    | GetWorktreeDetails
    | AgentSpawn
    | AgentSend
    | AgentCancel
    | AgentSetConfigOption
    | AgentRename
    | AgentReorder
    | AgentResume
    | TerminalInput
    | TerminalResize
    | TerminalCreate
    | TerminalKill
    | TerminalRename
    | TerminalReorder
    | TerminalRequestHistory
    | FileRead
    | FileWrite
    | FileList
    | GitStatus
    | GitDiff
    | GitCommit
    | CreatePR
    | GetState
    | UpdateSettings
    | Ack
    | Ping
    | Pong,
    'type'
  > & { type: string }
): FullBridgeEnvelope {
  const { type, ...rest } = message;
  const payload = rest as Record<string, unknown>;

  switch (type) {
    // Workspace
    case 'WorkspaceCreate':
      return encodeWorkspaceCreate(payload as unknown as Omit<WorkspaceCreate, 'type'>);
    case 'WorkspaceDelete':
      return encodeWorkspaceDelete(payload as unknown as Omit<WorkspaceDelete, 'type'>);
    case 'WorkspaceRemove':
      return encodeWorkspaceRemove(payload as unknown as Omit<WorkspaceRemove, 'type'>);
    case 'WorkspaceRename':
      return encodeWorkspaceRename(payload as unknown as Omit<WorkspaceRename, 'type'>);
    case 'WorkspaceUpdate':
      return encodeWorkspaceUpdate(payload as unknown as Omit<WorkspaceUpdate, 'type'>);

    // Worktree
    case 'WorktreeCreate':
      return encodeWorktreeCreate(payload as unknown as Omit<WorktreeCreate, 'type'>);
    case 'WorktreeDelete':
      return encodeWorktreeDelete(payload as unknown as Omit<WorktreeDelete, 'type'>);
    case 'WorktreeMerge':
      return encodeWorktreeMerge(payload as unknown as Omit<WorktreeMerge, 'type'>);
    case 'WorktreeList':
      return encodeWorktreeList(payload as unknown as Omit<WorktreeList, 'type'>);
    case 'WorktreeChangeBranch':
      return encodeWorktreeChangeBranch(payload as unknown as Omit<WorktreeChangeBranch, 'type'>);
 case 'GetWorktreeDetails':
  return encodeGetWorktreeDetails(payload as unknown as Omit<GetWorktreeDetails, 'type'>);
case 'WorktreeUpdate':
  return encodeWorktreeUpdate(payload as unknown as Omit<WorktreeUpdate, 'type'>);

// Agent
    case 'AgentSpawn':
      return encodeAgentSpawn(payload as unknown as Omit<AgentSpawn, 'type'>);
    case 'AgentSend':
      return encodeAgentSend(payload as unknown as Omit<AgentSend, 'type'>);
    case 'AgentCancel':
      return encodeAgentCancel(payload as unknown as Omit<AgentCancel, 'type'>);
    case 'AgentSetConfigOption':
      return encodeAgentSetConfigOption(payload as unknown as Omit<AgentSetConfigOption, 'type'>);
    case 'AgentRename':
      return encodeAgentRename(payload as unknown as Omit<AgentRename, 'type'>);
    case 'AgentReorder':
      return encodeAgentReorder(payload as unknown as Omit<AgentReorder, 'type'>);
    case 'AgentResume':
      return encodeAgentResume(payload as unknown as Omit<AgentResume, 'type'>);

    // Terminal
    case 'TerminalInput':
      return encodeTerminalInput(payload as unknown as Omit<TerminalInput, 'type'>);
    case 'TerminalResize':
      return encodeTerminalResize(payload as unknown as Omit<TerminalResize, 'type'>);
    case 'TerminalCreate':
      return encodeTerminalCreate(payload as unknown as Omit<TerminalCreate, 'type'>);
    case 'TerminalKill':
      return encodeTerminalKill(payload as unknown as Omit<TerminalKill, 'type'>);
    case 'TerminalMount':
      return encodeTerminalMount(payload as unknown as Omit<TerminalMount, 'type'>);
    case 'TerminalUnmount':
      return encodeTerminalUnmount(payload as unknown as Omit<TerminalUnmount, 'type'>);
    case 'TerminalTabClose':
      return encodeTerminalTabClose(payload as unknown as Omit<TerminalTabClose, 'type'>);
    case 'TerminalRename':
      return encodeTerminalRename(payload as unknown as Omit<TerminalRename, 'type'>);
    case 'TerminalReorder':
      return encodeTerminalReorder(payload as unknown as Omit<TerminalReorder, 'type'>);
    case 'TerminalRequestHistory':
      return encodeTerminalRequestHistory(payload as unknown as Omit<TerminalRequestHistory, 'type'>);

    // File
    case 'FileRead':
      return encodeFileRead(payload as unknown as Omit<FileRead, 'type'>);
    case 'FileWrite':
      return encodeFileWrite(payload as unknown as Omit<FileWrite, 'type'>);
    case 'FileList':
      return encodeFileList(payload as unknown as Omit<FileList, 'type'>);

    // Git
    case 'GitStatus':
      return encodeGitStatus(payload as unknown as Omit<GitStatus, 'type'>);
    case 'GitDiff':
      return encodeGitDiff(payload as unknown as Omit<GitDiff, 'type'>);
    case 'GitCommit':
      return encodeGitCommit(payload as unknown as Omit<GitCommit, 'type'>);

    // PR
    case 'CreatePR':
      return encodeCreatePR(payload as unknown as Omit<CreatePR, 'type'>);

    // State
    case 'GetState':
      return encodeGetState(payload as unknown as Omit<GetState, 'type'>);
    case 'UpdateSettings':
      return encodeUpdateSettings(payload as unknown as Omit<UpdateSettings, 'type'>);

    // Bidirectional
    case 'Ack':
      return encodeAck(payload as unknown as Omit<Ack, 'type'>);
    case 'Ping':
      return encodePing(payload as unknown as Omit<Ping, 'type'>);
    case 'Pong':
      return encodePong(payload as unknown as Omit<Pong, 'type'>);

    default:
      throw new Error(`Unknown client message type: ${type}`);
  }
}

// ============================================================================
// Decoder: parse incoming FullBridgeEnvelope into typed message
// ============================================================================

/**
 * DecodedBridgeMessage represents a parsed server message.
 * The type field is the BridgeMessage discriminator (snake_case).
 * The message field contains the typed BridgeMessage.
 */
export interface DecodedBridgeMessage {
  /** The BridgeMessage type discriminator (snake_case). */
  type: BridgeMessage['type'];
  /** The typed BridgeMessage payload. */
  message: BridgeMessage;
  /** The full envelope metadata (version, seq, timestamp_ms, extra_data). */
  envelope: BridgeEnvelope;
}

/**
 * Decode a FullBridgeEnvelope into a DecodedBridgeMessage.
 *
 * Uses the type discriminator to narrow the BridgeMessage type.
 * The returned DecodedBridgeMessage contains:
 * - type: the snake_case discriminator
 * - message: the typed BridgeMessage variant
 * - envelope: the envelope metadata (version, seq, timestamp_ms, extra_data)
 */
export function decodeBridgeEnvelope(
  envelope: FullBridgeEnvelope
): DecodedBridgeMessage {
  const { version, seq, timestamp_ms, extra_data, type, ...messageFields } =
    envelope;

  // Build the BridgeMessage from type discriminator + flattened fields
  const message = buildBridgeMessage(type, messageFields);

  return {
    type,
    message,
    envelope: {
      version,
      seq,
      timestamp_ms,
      extra_data,
    },
  };
}

/**
 * Build a typed BridgeMessage from a type discriminator and raw fields.
 * Uses the type guards from bridge-envelope.ts for validation.
 */
function buildBridgeMessage(
  type: BridgeMessage['type'],
  fields: Record<string, unknown>
): BridgeMessage {
  switch (type) {
    case 'acp_payload': {
      const msg: AcpPayloadMessage = {
        type: 'acp_payload',
        payload: (fields.payload ?? null) as BridgePayload,
      };
      if (!isAcpPayload(msg)) throw new Error('Invalid acp_payload message');
      return msg;
    }

    case 'bridge_status': {
      const msg: BridgeStatusMessage = {
        type: 'bridge_status',
        status: fields.status as BridgeStatusMessage['status'],
      };
      if (!isBridgeStatus(msg)) throw new Error('Invalid bridge_status message');
      return msg;
    }

    case 'stderr': {
      const msg: StderrMessage = {
        type: 'stderr',
        line: fields.line as string,
      };
      if (!isStderr(msg)) throw new Error('Invalid stderr message');
      return msg;
    }

    case 'process_exit': {
      const msg: ProcessExitMessage = {
        type: 'process_exit',
        code: (fields.code as number | null) ?? null,
        signal: (fields.signal as string | null) ?? null,
      };
      if (!isProcessExit(msg)) throw new Error('Invalid process_exit message');
      return msg;
    }

    case 'replay_metadata': {
      const msg: ReplayMetadataMessage = {
        type: 'replay_metadata',
        captured_at_ms: fields.captured_at_ms as number,
        total_envelopes: fields.total_envelopes as number,
        description: (fields.description as string | null) ?? null,
      };
      if (!isReplayMetadata(msg)) throw new Error('Invalid replay_metadata message');
      return msg;
    }

    case 'start_agent': {
      const msg: StartAgentMessage = {
        type: 'start_agent',
        command: fields.command as string,
        args: (fields.args as string[]) ?? [],
        cwd: (fields.cwd as string | null) ?? null,
        env: (fields.env as Array<[string, string]>) ?? [],
      };
      if (!isStartAgent(msg)) throw new Error('Invalid start_agent message');
      return msg;
    }

    // Ymir-specific passthrough variants
    case 'workspace_event': {
      const msg: WorkspaceEventMessage = {
        type: 'workspace_event',
        payload: (fields.payload ?? null) as BridgePayload,
      };
      if (!isWorkspaceEvent(msg)) throw new Error('Invalid workspace_event message');
      return msg;
    }

    case 'worktree_event': {
      const msg: WorktreeEventMessage = {
        type: 'worktree_event',
        payload: (fields.payload ?? null) as BridgePayload,
      };
      if (!isWorktreeEvent(msg)) throw new Error('Invalid worktree_event message');
      return msg;
    }

    case 'git_response': {
      const msg: GitResponseMessage = {
        type: 'git_response',
        payload: (fields.payload ?? null) as BridgePayload,
      };
      if (!isGitResponse(msg)) throw new Error('Invalid git_response message');
      return msg;
    }

    case 'file_response': {
      const msg: FileResponseMessage = {
        type: 'file_response',
        payload: (fields.payload ?? null) as BridgePayload,
      };
      if (!isFileResponse(msg)) throw new Error('Invalid file_response message');
      return msg;
    }

    case 'agent_event': {
      const msg: AgentEventMessage = {
        type: 'agent_event',
        payload: (fields.payload ?? null) as BridgePayload,
      };
      if (!isAgentEvent(msg)) throw new Error('Invalid agent_event message');
      return msg;
    }

    case 'terminal_event': {
      const msg: TerminalEventMessage = {
        type: 'terminal_event',
        payload: (fields.payload ?? null) as BridgePayload,
      };
      if (!isTerminalEvent(msg)) throw new Error('Invalid terminal_event message');
      return msg;
    }

    case 'state_snapshot': {
      const msg: StateSnapshotMessage = {
        type: 'state_snapshot',
        payload: (fields.payload ?? null) as BridgePayload,
      };
      if (!isStateSnapshotMessage(msg)) throw new Error('Invalid state_snapshot message');
      return msg;
    }

    case 'notification': {
      const msg: NotificationMessage = {
        type: 'notification',
        payload: (fields.payload ?? null) as BridgePayload,
      };
      if (!isNotificationMessage(msg)) throw new Error('Invalid notification message');
      return msg;
    }

    case 'error_response': {
      const msg: ErrorResponseMessage = {
        type: 'error_response',
        payload: (fields.payload ?? null) as BridgePayload,
      };
      if (!isErrorResponse(msg)) throw new Error('Invalid error_response message');
      return msg;
    }

    case 'ack': {
      const msg: AckMessage = {
        type: 'ack',
        payload: (fields.payload ?? null) as BridgePayload,
      };
      if (!isAckMessage(msg)) throw new Error('Invalid ack message');
      return msg;
    }

    case 'ping': {
      const msg: PingMessage = {
        type: 'ping',
        payload: (fields.payload ?? null) as BridgePayload,
      };
      if (!isPingMessage(msg)) throw new Error('Invalid ping message');
      return msg;
    }

    case 'pong': {
      const msg: PongMessage = {
        type: 'pong',
        payload: (fields.payload ?? null) as BridgePayload,
      };
      if (!isPongMessage(msg)) throw new Error('Invalid pong message');
      return msg;
    }

    default: {
      // Handle unknown message types gracefully
      const _exhaustive: never = type;
      throw new Error(`Unknown BridgeMessage type: ${_exhaustive}`);
    }
  }
}

/**
 * Decode a raw JSON string into a DecodedBridgeMessage.
 * Convenience wrapper that parses JSON before decoding.
 */
export function decodeBridgeJson(json: string): DecodedBridgeMessage {
  const parsed = JSON.parse(json) as unknown;
  if (!isFullBridgeEnvelope(parsed)) {
    throw new Error('Invalid BridgeEnvelope: missing required fields');
  }
  return decodeBridgeEnvelope(parsed);
}

/**
 * Check if a value is a valid FullBridgeEnvelope.
 * Validates presence of required metadata fields.
 */
function isFullBridgeEnvelope(value: unknown): value is FullBridgeEnvelope {
  return (
    typeof value === 'object' &&
    value !== null &&
    'version' in value &&
    'seq' in value &&
    'timestamp_ms' in value &&
    'type' in value &&
    typeof (value as FullBridgeEnvelope).version === 'number' &&
    typeof (value as FullBridgeEnvelope).seq === 'number' &&
    typeof (value as FullBridgeEnvelope).timestamp_ms === 'number'
  );
}
