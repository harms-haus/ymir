/**
 * Card Schema Definitions
 *
 * Compact custom card schemas for permission prompts, tool calls, plan updates,
 * and status events. These schemas are separate from assistant-ui's built-in
 * tool approval in this first cut.
 *
 * Schema Design Principles:
 * - Explicit required fields for rendering safety
 * - Safe action-dispatch fields for permissions (replay safety)
 * - Compact representation to minimize payload size
 * - Fallback behavior for unknown variants
 *
 * Schema Naming Convention:
 * - Aligned with accumulator/runtime event names where appropriate
 * - Card suffix indicates rendering component type
 */

import type {
  AccumulatedToolCard,
  AccumulatedContextCard,
  AccumulatedPermissionCard,
  AccumulatedErrorCard,
} from '../../types/state';
import type { AcpToolUseStatus, AcpContextUpdateType, AcpErrorCode } from '../../types/generated/protocol';

// ============================================================================
// Permission Card Schema
// ============================================================================

/**
 * Permission request action types for safe dispatch
 * Replay-safe: only predefined actions are allowed
 */
export type PermissionAction = 'allow' | 'deny' | 'allow-always' | 'deny-always';

/**
 * Compact permission card schema
 * Renders user-facing permission prompts for tool usage
 */
export interface PermissionCardSchema {
  type: 'permission';
  toolUseId: string;
  toolName: string;
  reason: string;
  inputSummary: string;
  isPending: boolean;
  sequence: number;
  actions: {
    allow: { type: 'allow'; toolUseId: string };
    allowAlways: { type: 'allow-always'; toolUseId: string; toolName: string };
    deny: { type: 'deny'; toolUseId: string };
    denyAlways: { type: 'deny-always'; toolUseId: string; toolName: string };
  };
}

/**
 * Create permission card schema from accumulated permission card
 * Validates required fields and generates safe action dispatch objects
 */
export function createPermissionCardSchema(
  card: AccumulatedPermissionCard
): PermissionCardSchema | null {
  if (!isValidPermissionCard(card)) {
    return null;
  }

  const { toolUseId, toolName, input, isPending, sequence } = card;

  return {
    type: 'permission',
    toolUseId,
    toolName,
    reason: getPermissionReason(toolName),
    inputSummary: truncateInputSummary(input),
    isPending,
    sequence,
    actions: {
      allow: { type: 'allow', toolUseId },
      allowAlways: { type: 'allow-always', toolUseId, toolName },
      deny: { type: 'deny', toolUseId },
      denyAlways: { type: 'deny-always', toolUseId, toolName },
    },
  };
}

/**
 * Validate permission card has required fields
 */
export function isValidPermissionCard(card: unknown): card is AccumulatedPermissionCard {
  if (!card || typeof card !== 'object') {
    return false;
  }

  const c = card as AccumulatedPermissionCard;

  return (
    typeof c.type === 'string' &&
    c.type === 'permission' &&
    typeof c.toolUseId === 'string' &&
    c.toolUseId.length > 0 &&
    typeof c.toolName === 'string' &&
    c.toolName.length > 0 &&
    typeof c.input === 'string' &&
    typeof c.isPending === 'boolean' &&
    typeof c.sequence === 'number' &&
    c.sequence >= 0
  );
}

/**
 * Extract human-readable permission reason from tool name
 */
function getPermissionReason(toolName: string): string {
  const reasons: Record<string, string> = {
    bash: 'The agent wants to execute a shell command',
    file_read: 'The agent wants to read a file',
    file_write: 'The agent wants to write to a file',
    browser_action: 'The agent wants to interact with the browser',
    web_search: 'The agent wants to search the web',
  };

  return reasons[toolName] || `The agent wants to use the ${toolName} tool`;
}

/**
 * Truncate input summary for display safety
 */
function truncateInputSummary(input: string, maxLength = 200): string {
  if (input.length <= maxLength) {
    return input;
  }

  return input.substring(0, maxLength) + '...';
}

// ============================================================================
// Tool Card Schema
// ============================================================================

/**
 * Compact tool card schema
 * Renders tool execution status and output
 */
export interface ToolCardSchema {
  type: 'tool';
  toolUseId: string;
  toolName: string;
  status: AcpToolUseStatus;
  inputSummary?: string;
  outputSummary?: string;
  error?: string;
  updatedAt: number;
}

/**
 * Create tool card schema from accumulated tool card
 */
export function createToolCardSchema(
  card: AccumulatedToolCard
): ToolCardSchema | null {
  if (!isValidToolCard(card)) {
    return null;
  }

  const { toolUseId, toolName, status, input, output, error, updatedAt } = card;

  return {
    type: 'tool',
    toolUseId,
    toolName,
    status,
    inputSummary: input ? truncateInputSummary(input) : undefined,
    outputSummary: output ? truncateOutput(output) : undefined,
    error,
    updatedAt,
  };
}

/**
 * Validate tool card has required fields
 */
export function isValidToolCard(card: unknown): card is AccumulatedToolCard {
  if (!card || typeof card !== 'object') {
    return false;
  }

  const c = card as AccumulatedToolCard;

  return (
    typeof c.type === 'string' &&
    c.type === 'tool' &&
    typeof c.toolUseId === 'string' &&
    c.toolUseId.length > 0 &&
    typeof c.toolName === 'string' &&
    c.toolName.length > 0 &&
    typeof c.status === 'string' &&
    typeof c.updatedAt === 'number' &&
    c.updatedAt > 0
  );
}

/**
 * Truncate tool output for display safety
 */
function truncateOutput(output: string, maxLength = 500): string {
  if (output.length <= maxLength) {
    return output;
  }

  return output.substring(0, maxLength) + '...';
}

// ============================================================================
// Plan Card Schema
// ============================================================================

/**
 * Compact plan card schema
 * Renders plan updates and execution progress
 */
export interface PlanCardSchema {
  type: 'plan';
  planId: string;
  title: string;
  description?: string;
  status: 'pending' | 'in-progress' | 'completed' | 'failed';
  stepsCompleted: number;
  totalSteps: number;
  sequence: number;
}

/**
 * Create plan card schema from accumulated context card (MemoryUpdate type)
 */
export function createPlanCardSchema(
  card: AccumulatedContextCard
): PlanCardSchema | null {
  if (!isPlanContextCard(card)) {
    return null;
  }

  let planData: unknown;
  try {
    planData = JSON.parse(card.data);
  } catch {
    return null;
  }

  if (!isValidPlanData(planData)) {
    return null;
  }

  return {
    type: 'plan',
    planId: planData.planId || `plan-${card.sequence}`,
    title: planData.title || 'Untitled Plan',
    description: planData.description,
    status: planData.status || 'pending',
    stepsCompleted: planData.stepsCompleted || 0,
    totalSteps: planData.totalSteps || 0,
    sequence: card.sequence,
  };
}

/**
 * Check if context card represents a plan update
 */
function isPlanContextCard(card: AccumulatedContextCard): boolean {
  return card.updateType === 'MemoryUpdate' && card.data.startsWith('{');
}

/**
 * Validate plan data structure
 */
function isValidPlanData(data: unknown): data is {
  planId?: string;
  title?: string;
  description?: string;
  status?: 'pending' | 'in-progress' | 'completed' | 'failed';
  stepsCompleted?: number;
  totalSteps?: number;
} {
  if (!data || typeof data !== 'object') {
    return false;
  }

  const p = data as Record<string, unknown>;

  return (
    (p.planId === undefined || typeof p.planId === 'string') &&
    (p.title === undefined || typeof p.title === 'string') &&
    (p.description === undefined || typeof p.description === 'string') &&
    (p.status === undefined || ['pending', 'in-progress', 'completed', 'failed'].includes(p.status as string)) &&
    (p.stepsCompleted === undefined || typeof p.stepsCompleted === 'number') &&
    (p.totalSteps === undefined || typeof p.totalSteps === 'number')
  );
}

// ============================================================================
// Status Card Schema
// ============================================================================

/**
 * Compact status card schema
 * Renders session status updates and state transitions
 */
export interface StatusCardSchema {
  type: 'status';
  statusId: string;
  label: string;
  description?: string;
  severity: 'info' | 'warning' | 'error' | 'success';
  sequence: number;
}

/**
 * Create status card schema from accumulated error card
 */
export function createStatusCardSchema(
  card: AccumulatedErrorCard
): StatusCardSchema | null {
  if (!isValidErrorCard(card)) {
    return null;
  }

  return {
    type: 'status',
    statusId: `error-${card.sequence}`,
    label: card.code,
    description: card.message,
    severity: card.recoverable ? 'warning' : 'error',
    sequence: card.sequence,
}
  };

/**
 * Create status card schema from session status string
 */
export function createSessionStatusCardSchema(
  status: string,
  sequence: number
): StatusCardSchema {
  const statusMap: Record<string, { label: string; severity: StatusCardSchema['severity'] }> = {
    Working: { label: 'Working', severity: 'info' },
    Waiting: { label: 'Waiting', severity: 'info' },
    Complete: { label: 'Complete', severity: 'success' },
    Cancelled: { label: 'Cancelled', severity: 'warning' },
    Error: { label: 'Error', severity: 'error' },
  };

  const statusInfo = statusMap[status] || { label: status, severity: 'info' };

  return {
    type: 'status',
    statusId: `status-${sequence}`,
    label: statusInfo.label,
    severity: statusInfo.severity,
    sequence,
  };
}

/**
 * Validate error card has required fields
 */
export function isValidErrorCard(card: unknown): card is AccumulatedErrorCard {
  if (!card || typeof card !== 'object') {
    return false;
  }

  const c = card as AccumulatedErrorCard;

  return (
    typeof c.type === 'string' &&
    c.type === 'error' &&
    typeof c.code === 'string' &&
    c.code.length > 0 &&
    typeof c.message === 'string' &&
    typeof c.recoverable === 'boolean' &&
    typeof c.sequence === 'number' &&
    c.sequence >= 0
  );
}

// ============================================================================
// Card Union Type and Fallback
// ============================================================================

/**
 * Union of all card schemas
 */
export type CardSchema =
  | PermissionCardSchema
  | ToolCardSchema
  | PlanCardSchema
  | StatusCardSchema;

/**
 * Unknown card schema fallback
 * Rendered when card type is unrecognized
 */
export interface UnknownCardSchema {
  type: 'unknown';
  originalData: unknown;
  message: string;
  sequence: number;
}

/**
 * Create card schema from accumulated content part
 * Handles all card types with safe fallback for unknown variants
 */
export function createCardSchema(
  part: AccumulatedToolCard | AccumulatedContextCard | AccumulatedPermissionCard | AccumulatedErrorCard | unknown
): CardSchema | UnknownCardSchema {
  if (!part || typeof part !== 'object') {
    return createUnknownCardSchema(part, 'Invalid card data');
  }

  const card = part as { type: string };

  switch (card.type) {
    case 'permission': {
      const permissionSchema = createPermissionCardSchema(card as AccumulatedPermissionCard);
      return permissionSchema || createUnknownCardSchema(card, 'Invalid permission card');
    }

    case 'tool': {
      const toolSchema = createToolCardSchema(card as AccumulatedToolCard);
      return toolSchema || createUnknownCardSchema(card, 'Invalid tool card');
    }

    case 'context': {
      const planSchema = createPlanCardSchema(card as AccumulatedContextCard);
      return planSchema || createUnknownCardSchema(card, 'Invalid plan card');
    }

    case 'error': {
      const statusSchema = createStatusCardSchema(card as AccumulatedErrorCard);
      return statusSchema || createUnknownCardSchema(card, 'Invalid error card');
    }

    default:
      return createUnknownCardSchema(card, `Unknown card type: ${card.type}`);
  }
}

/**
 * Create unknown card schema for unrecognized card types
 */
export function createUnknownCardSchema(
  data: unknown,
  message: string
): UnknownCardSchema {
  return {
    type: 'unknown',
    originalData: data,
    message,
    sequence: 0,
  };
}

/**
 * Check if card schema is unknown
 */
export function isUnknownCardSchema(card: CardSchema | UnknownCardSchema): card is UnknownCardSchema {
  return card.type === 'unknown';
}

/**
 * Type guard for permission card schema
 */
export function isPermissionCardSchema(card: CardSchema | UnknownCardSchema): card is PermissionCardSchema {
  return card.type === 'permission';
}

/**
 * Type guard for tool card schema
 */
export function isToolCardSchema(card: CardSchema | UnknownCardSchema): card is ToolCardSchema {
  return card.type === 'tool';
}

/**
 * Type guard for plan card schema
 */
export function isPlanCardSchema(card: CardSchema | UnknownCardSchema): card is PlanCardSchema {
  return card.type === 'plan';
}

/**
 * Type guard for status card schema
 */
export function isStatusCardSchema(card: CardSchema | UnknownCardSchema): card is StatusCardSchema {
  return card.type === 'status';
}
