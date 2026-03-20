/**
 * Assistant-UI Runtime Boundary Helper
 *
 * CRITICAL ARCHITECTURE:
 *
 * This module defines the RENDER-ONLY boundary between Ymir's host-owned state
 * and assistant-ui's ExternalStoreRuntime. Assistant-ui is NEVER the source of truth
 * for worktree, tab, or session identity.
 *
 * Flow:
 *   ACP Events -> WS-ACP Adapter (stateless) -> Accumulator (connection-scoped)
 *   -> Runtime Boundary Mapping -> ExternalStoreRuntime (render-only)
 *
 * FIRST-CUT DISABLED FEATURES:
 * - Editing: assistant-ui's message editing is disabled (Ymir owns canonical state)
 * - Approval: assistant-ui's built-in tool approval is disabled (custom cards handle permissions)
 * - Branching: assistant-ui's thread branching/conversation forks are disabled
 * - Runtime backends: We use ExternalStoreRuntime only, no assistant-ui built-in backends
 *
 * Why these features are disabled:
 * - Ymir's accumulator is the canonical state source via ACP events
 * - Permission cards are custom ACP tool use events, not assistant-ui tool approvals
 * - Worktree/tab identity is owned by Ymir's store, not assistant-ui runtime
 * - Rebuild semantics require accumulator-owned state, not runtime mutations
 *
 * Future Considerations:
 * - Enable editing if parity pressure justifies bidirectional sync
 * - Enable approval if custom permission cards prove insufficient
 * - Enable branching if conversation management becomes more complex
 */

import type { AccumulatedThread, AccumulatedMessage, AccumulatedContentPart } from '../../types/state';

// ============================================================================
// ExternalStoreRuntime Input Types (assistant-ui compatible)
// ============================================================================

/**
 * Message role for assistant-ui
 */
export type RuntimeMessageRole = 'user' | 'assistant' | 'system';

/**
 * Content part type for assistant-ui rendering
 * Simplified from accumulated types to match assistant-ui expectations
 */
export interface RuntimeContentPart {
  type: 'text' | 'image' | 'tool' | 'context' | 'permission' | 'error';
  text?: string;
  image?: string;
  toolName?: string;
  toolStatus?: string;
  contextType?: string;
  contextData?: string;
  errorCode?: string;
  errorMessage?: string;
  recoverable?: boolean;
}

/**
 * Runtime message compatible with assistant-ui message format
 * Maps from AccumulatedMessage but keeps Ymir as source of truth
 */
export interface RuntimeMessage {
  id: string;
  role: RuntimeMessageRole;
  content: RuntimeContentPart[];
  createdAt: number;
  /** Assistant-ui does not own session/worktree identity */
  metadata?: Record<string, unknown>;
}

/**
 * Runtime thread state for ExternalStoreRuntime
 * Render-only snapshot derived from AccumulatedThread
 */
export interface RuntimeThreadState {
  /** Thread ID (derived, not owned by assistant-ui) */
  threadId: string;
  /** Session status */
  status: 'idle' | 'working' | 'waiting' | 'complete' | 'cancelled' | 'error';
  /** Whether assistant is currently streaming */
  isStreaming: boolean;
  /** Messages in the thread (render-only copy) */
  messages: RuntimeMessage[];
  /** Last update timestamp (for rendering only) */
  lastUpdated: number;
}

/**
 * Feature flags for first-cut runtime boundary
 * Explicitly documents what is DISABLED in this version
 */
export interface RuntimeFeatureFlags {
  /** assistant-ui message editing (DISABLED) */
  editingEnabled: false;
  /** assistant-ui built-in tool approval (DISABLED) */
  approvalEnabled: false;
  /** assistant-ui thread branching/forking (DISABLED) */
  branchingEnabled: false;
  /** Custom permission card rendering (ENABLED) */
  customPermissionCardsEnabled: true;
  /** Custom tool card rendering (ENABLED) */
  customToolCardsEnabled: true;
  /** Custom event card rendering (ENABLED) */
  customEventCardsEnabled: true;
}

/**
 * Complete ExternalStoreRuntime input from Ymir's accumulated state
 * This is the CONTRACT between accumulator and assistant-ui
 */
export interface ExternalStoreRuntimeInput {
  /** Thread state (render-only, not mutable by assistant-ui) */
  thread: RuntimeThreadState;
  /** Feature flags (what is enabled/disabled) */
  features: RuntimeFeatureFlags;
  /** Callback for user submissions (assistant-ui -> Ymir -> ACP) */
  onSubmit?: (message: string) => void;
  /** Callback for cancellations (assistant-ui -> Ymir -> ACP) */
  onCancel?: () => void;
}

// ============================================================================
// Feature Flags (First Cut - Conservative)
// ============================================================================

/**
 * First-cut feature flags
 * Document what assistant-ui features we're NOT using in this version
 */
export const FIRST_CUT_FEATURES: RuntimeFeatureFlags = {
  editingEnabled: false,
  approvalEnabled: false,
  branchingEnabled: false,
  customPermissionCardsEnabled: true,
  customToolCardsEnabled: true,
  customEventCardsEnabled: true,
};

// ============================================================================
// Mapping Helpers: Accumulated State -> Runtime Input
// ============================================================================

/**
 * Map AccumulatedContentPart to RuntimeContentPart
 * Preserves content structure but strips internal accumulator metadata
 */
function mapContentPart(part: AccumulatedContentPart): RuntimeContentPart {
  switch (part.type) {
    case 'text':
      return {
        type: 'text',
        text: part.text,
      };

    case 'structured':
      return {
        type: 'text',
        text: part.data,
      };

    case 'tool':
      return {
        type: 'tool',
        toolName: part.toolName,
        toolStatus: part.status,
      };

    case 'context':
      return {
        type: 'context',
        contextType: part.updateType,
        contextData: part.data,
      };

    case 'permission':
      return {
        type: 'permission',
        toolName: part.toolName,
      };

    case 'error':
      return {
        type: 'error',
        errorCode: part.code,
        errorMessage: part.message,
        recoverable: part.recoverable,
      };

    default:
      // Safe fallback for unknown content types
      return {
        type: 'text',
        text: '[Unknown content type]',
      };
  }
}

/**
 * Map AccumulatedMessage to RuntimeMessage
 * Strips accumulator-specific metadata, keeps render-only data
 */
function mapMessage(msg: AccumulatedMessage): RuntimeMessage {
  return {
    id: msg.id,
    role: msg.role,
    content: msg.parts.map(mapContentPart),
    createdAt: msg.createdAt,
    // Assistant-ui metadata is empty - Ymir owns canonical state
    metadata: {},
  };
}

/**
 * Map AcpSessionStatus to RuntimeThreadState.status
 * Converts ACP status enum to assistant-ui compatible status
 */
function mapStatus(status: string): RuntimeThreadState['status'] {
  switch (status) {
    case 'Working':
      return 'working';
    case 'Waiting':
      return 'waiting';
    case 'Complete':
      return 'complete';
    case 'Cancelled':
      return 'cancelled';
    case 'Error':
      return 'error';
    default:
      return 'idle';
  }
}

/**
 * Create ExternalStoreRuntime input from AccumulatedThread
 * This is the MAIN ENTRY POINT for the runtime boundary
 *
 * CRITICAL: This returns a READ-ONLY snapshot. Mutations must go through
 * Ymir's store -> accumulator -> ExternalStoreRuntime flow, not direct
 * assistant-ui mutations.
 *
 * @param accumulated - The accumulated thread from the accumulator
 * @param onSubmit - Callback for user message submissions
 * @param onCancel - Callback for cancellation requests
 * @returns ExternalStoreRuntimeInput ready for assistant-ui
 */
export function createRuntimeInput(
  accumulated: AccumulatedThread | null,
  onSubmit?: (message: string) => void,
  onCancel?: () => void
): ExternalStoreRuntimeInput | null {
  if (!accumulated) {
    return null;
  }

  const thread: RuntimeThreadState = {
    threadId: accumulated.worktreeId, // Use worktreeId, not session ID (Ymir owns session truth)
    status: mapStatus(accumulated.sessionStatus),
    isStreaming: accumulated.isStreaming,
    messages: accumulated.messages.map(mapMessage),
    lastUpdated: Date.now(),
  };

  return {
    thread,
    features: FIRST_CUT_FEATURES,
    onSubmit,
    onCancel,
  };
}

/**
 * Check if a runtime input is valid for assistant-ui rendering
 * Validation helper for testing and runtime safety
 */
export function isValidRuntimeInput(input: ExternalStoreRuntimeInput | null): input is ExternalStoreRuntimeInput {
  if (!input) return false;

  const { thread, features } = input;

  // Thread must have valid structure
  if (!thread.threadId || !Array.isArray(thread.messages)) {
    return false;
  }

  // Status must be one of allowed values
  const validStatuses: RuntimeThreadState['status'][] = ['idle', 'working', 'waiting', 'complete', 'cancelled', 'error'];
  if (!validStatuses.includes(thread.status)) {
    return false;
  }

  // Feature flags must match first-cut expectations
  if (features.editingEnabled || features.approvalEnabled || features.branchingEnabled) {
    return false;
  }

  return true;
}

/**
 * Get thread messages for a worktree from accumulated state
 * Selector helper for components
 */
export function getThreadMessages(
  accumulated: AccumulatedThread | null
): RuntimeMessage[] {
  if (!accumulated) {
    return [];
  }

  return accumulated.messages.map(mapMessage);
}

/**
 * Check if thread is currently streaming
 * Derived state helper for components
 */
export function isThreadStreaming(
  accumulated: AccumulatedThread | null
): boolean {
  return accumulated?.isStreaming ?? false;
}

/**
 * Get thread status for a worktree
 * Derived state helper for components
 */
export function getThreadStatus(
  accumulated: AccumulatedThread | null
): RuntimeThreadState['status'] {
  if (!accumulated) {
    return 'idle';
  }

  return mapStatus(accumulated.sessionStatus);
}
