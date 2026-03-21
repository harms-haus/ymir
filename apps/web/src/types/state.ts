/**
 * Application State Types for Zustand Store
 * Defines the shape of the global state managed by the WebSocket client
 */

import { AgentStatus, AcpSequence, AcpEvent, AcpEventEnvelope, AcpToolUseStatus, AcpSessionStatus, AcpContextUpdateType, AcpErrorCode } from './protocol';

// Workspace and Worktree state (simplified from protocol types)
export interface WorkspaceState {
  id: string;
  name: string;
  rootPath: string;
  color?: string;
  icon?: string;
  worktreeBaseDir?: string;
  settings?: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
}

// Git change statistics
export interface GitStats {
  modified: number;
  added: number;
  deleted: number;
}

export interface WorktreeState {
  id: string;
  workspaceId: string;
  branchName: string;
  path: string;
  status: 'active' | 'inactive' | 'orphaned';
  isMain: boolean;
  gitStats?: GitStats;
  createdAt: number;
}

// Agent session state
export interface AgentSessionState {
    id: string;
    worktreeId: string;
    agentType: string;
    acpSessionId?: string;
    status: AgentStatus;
    startedAt: number;
    label?: string;
    position?: number;
}

// Terminal session state
export interface TerminalSessionState {
    id: string;
    worktreeId: string;
    label: string;
    shell: string;
    createdAt: number;
    position?: number;
}

// Notification state for toast messages
export interface NotificationState {
  id: string;
  level: 'info' | 'warn' | 'error';
  message: string;
  timestamp: number;
}

// Connection status for WebSocket client
export type ConnectionStatus = 'connecting' | 'open' | 'closed' | 'reconnecting';

// Agent tab types
export type AgentTabType = 'agent' | 'diff' | 'editor';

export interface AgentTab {
  id: string;
  type: AgentTabType;
  sessionId?: string;
  filePath?: string;
  label?: string;
}

// PR dialog state
export interface PRDialogState {
  isOpen: boolean;
  title: string;
  body: string;
}

// Create worktree dialog state
export interface CreateWorktreeDialogState {
  isOpen: boolean;
  workspaceId: string | null;
}

export interface WorkspaceSettingsDialogState {
  isOpen: boolean;
  workspaceId: string | null;
}

export interface MergeDialogState {
  isOpen: boolean;
  worktreeId: string | null;
  branchName: string;
  mainBranch: string;
  mergeType: 'merge' | 'squash';
}

export interface DbResetDialogState {
  isOpen: boolean;
  errorMessage: string;
}

export interface ChangeBranchDialogState {
  isOpen: boolean;
  worktreeId: string | null;
  currentBranch: string;
}

export type AlertDialogVariant = 'default' | 'destructive';

// ============================================================================
// ACP Event Accumulator Types
// ============================================================================
//
// The accumulator is DERIVED, connection-scoped state that transforms ACP events
// into assistant-ui-compatible thread/message/card state.
//
// CRITICAL: The accumulator is NOT the source of truth for:
//   - Worktree identity (use AppState.worktrees)
//   - Session identity (use AppState.agentSessions)
//   - Connection state (use AppState.connectionStatus)
//
// Rebuild Rules:
//   - On WebSocket reconnect: accumulator is FLUSHED and rebuilt from replay
//   - Accumulator state is tied to the current WebSocket connection lifecycle
//   - StateSnapshot triggers a full accumulator flush
//   - ResumeMarker events enable partial replay from checkpoint
//
// Retention Policy:
//   - Accumulator retains events up to the last ResumeMarker or connection start
//   - Tool outputs are bounded (see MAX_TOOL_OUTPUT_LENGTH)
//   - Text chunks are accumulated in order, deduplicated by sequence number
//

/** Maximum characters to retain for tool output (prevent memory bloat) */
export const MAX_TOOL_OUTPUT_LENGTH = 10000;

/** Maximum number of accumulated messages per thread (prevent unbounded growth) */
export const MAX_ACCUMULATED_MESSAGES = 500;

// ----------------------------------------------------------------------------
// Accumulated Content Types (for assistant-ui rendering)
// ----------------------------------------------------------------------------

/** Accumulated text content from PromptChunk events */
export interface AccumulatedTextContent {
  type: 'text';
  text: string;
  isStreaming: boolean;
}

/** Accumulated structured content from PromptChunk events (JSON, code blocks, etc.) */
export interface AccumulatedStructuredContent {
  type: 'structured';
  data: string;
  isStreaming: boolean;
}

/** Accumulated tool card from ToolUse events */
export interface AccumulatedToolCard {
  type: 'tool';
  toolUseId: string;
  toolName: string;
  status: AcpToolUseStatus;
  input?: string;
  output?: string;
  error?: string;
  /** Timestamp of last update */
  updatedAt: number;
}

/** Accumulated context update card (file read/written, command executed, etc.) */
export interface AccumulatedContextCard {
  type: 'context';
  updateType: AcpContextUpdateType;
  data: string;
  /** Sequence number for ordering */
  sequence: AcpSequence;
}

/** Permission request card (derived from tool use awaiting approval) */
export interface AccumulatedPermissionCard {
  type: 'permission';
  toolUseId: string;
  toolName: string;
  input: string;
  /** Whether permission is still pending */
  isPending: boolean;
  /** Sequence number for ordering */
  sequence: AcpSequence;
}

/** Error card from AcpError events */
export interface AccumulatedErrorCard {
  type: 'error';
  code: AcpErrorCode;
  message: string;
  details?: string;
  recoverable: boolean;
  /** Sequence number for ordering */
  sequence: AcpSequence;
}

/** Image content from image-containing events */
export interface AccumulatedImageContent {
  type: 'image';
  image?: string;
  imageUrl?: string;
  base64?: string;
}

/** Union type for all accumulated content parts */
export type AccumulatedContentPart =
  | AccumulatedTextContent
  | AccumulatedStructuredContent
  | AccumulatedToolCard
  | AccumulatedContextCard
  | AccumulatedPermissionCard
  | AccumulatedErrorCard
  | AccumulatedImageContent;

/** Accumulated message in a thread */
export interface AccumulatedMessage {
  /** Unique message ID (derived from sequence or generated) */
  id: string;
  /** Role: 'user' | 'assistant' */
  role: 'user' | 'assistant';
  /** Content parts in this message */
  parts: AccumulatedContentPart[];
  /** Timestamp of message creation */
  createdAt: number;
  /** Sequence number of last update */
  lastSequence: AcpSequence;
}

/** Accumulated thread for a worktree/session */
export interface AccumulatedThread {
  /** Worktree ID this thread belongs to */
  worktreeId: string;
  /** ACP session ID */
  acpSessionId: string;
  /** Messages in chronological order */
  messages: AccumulatedMessage[];
  /** Current session status from AcpSessionStatus events */
  sessionStatus: AcpSessionStatus;
  /** Last processed sequence number */
  lastSequence: AcpSequence;
  /** Connection generation (increments on reconnect) */
  connectionGeneration: number;
  /** Whether this thread is currently streaming */
  isStreaming: boolean;
  /** Resume marker checkpoint if available */
  resumeCheckpoint?: string;
}

// ----------------------------------------------------------------------------
// Accumulator State Shape
// ----------------------------------------------------------------------------

/** Per-connection accumulator state */
export interface AcpAccumulatorState {
  /** Connection generation counter (increments on each reconnect) */
  connectionGeneration: number;
  /** Accumulated threads keyed by worktreeId */
  threads: Map<string, AccumulatedThread>;
  /** Pending events awaiting correlation (keyed by correlationId) */
  pendingCorrelations: Map<string, AcpEvent[]>;
  /** Last flush timestamp */
  lastFlushTimestamp: number | null;
}

/** Initial accumulator state factory */
export function createInitialAccumulatorState(): AcpAccumulatorState {
  return {
    connectionGeneration: 1,
    threads: new Map(),
    pendingCorrelations: new Map(),
    lastFlushTimestamp: null,
  };
}

// ----------------------------------------------------------------------------
// Accumulator Action Types (for reducer)
// ----------------------------------------------------------------------------

/** Actions that can be dispatched to the accumulator */
export type AcpAccumulatorAction =
  | { type: 'EVENT_RECEIVED'; envelope: AcpEventEnvelope; worktreeId: string }
  | { type: 'CONNECTION_RECONNECTED' }
  | { type: 'FLUSH_THREAD'; worktreeId: string }
  | { type: 'FLUSH_ALL' }
  | { type: 'REBUILD_FROM_SNAPSHOT'; worktreeId: string; acpSessionId: string }
  | { type: 'SET_STREAMING'; worktreeId: string; isStreaming: boolean };

/** Result of processing an event through the accumulator */
export interface AccumulatorResult {
  /** The updated thread (if any) */
  thread?: AccumulatedThread;
  /** Whether the accumulator state changed */
  changed: boolean;
  /** Action to dispatch to assistant-ui (if any) */
  assistantUiAction?: {
    type: 'APPEND_CONTENT' | 'UPDATE_CONTENT' | 'REMOVE_CONTENT' | 'SET_STATUS';
    payload: unknown;
  };
}

// ----------------------------------------------------------------------------
// Selector Types
// ----------------------------------------------------------------------------

/** Selector result for a thread's accumulated state */
export interface ThreadAccumulatedState {
  /** The accumulated thread, or null if not found */
  thread: AccumulatedThread | null;
  /** Derived message count */
  messageCount: number;
  /** Derived is-streaming state */
  isStreaming: boolean;
  /** Derived session status */
  sessionStatus: AcpSessionStatus;
  /** Whether the thread has errors */
  hasErrors: boolean;
}

export interface AlertDialogConfig {
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel?: string;
  variant?: AlertDialogVariant;
  onConfirm: () => void;
  onCancel?: () => void;
}

export interface AlertDialogState extends AlertDialogConfig {
  open: boolean;
}

export interface AppState {
  // Data slices
  workspaces: WorkspaceState[];
  worktrees: WorktreeState[];
  agentSessions: AgentSessionState[];
  terminalSessions: TerminalSessionState[];
  notifications: NotificationState[];

  // UI state
  activeWorktreeId: string | null;
  connectionStatus: ConnectionStatus;
  connectionError: string | null;
  expandedWorkspaceIds: Set<string>;

  // Agent pane tabs (per worktree)
  agentTabs: Map<string, AgentTab[]>;
  activeAgentTabId: Map<string, string>;

  // ACP Event Accumulator (connection-scoped, derived state)
  // IMPORTANT: This is NOT the source of truth for worktree/session identity
  acpAccumulator: AcpAccumulatorState;

  // PR dialog state
  prDialog: PRDialogState;

  // Create worktree dialog state
  createWorktreeDialog: CreateWorktreeDialogState;

  workspaceSettingsDialog: WorkspaceSettingsDialogState;

  mergeDialog: MergeDialogState;

  dbResetDialog: DbResetDialogState;

  changeBranchDialog: ChangeBranchDialogState;

  alertDialog: AlertDialogState | null;

  setWorkspaces: (workspaces: WorkspaceState[]) => void;
  setWorktrees: (worktrees: WorktreeState[]) => void;
  setAgentSessions: (sessions: AgentSessionState[]) => void;
  setTerminalSessions: (sessions: TerminalSessionState[]) => void;
  setActiveWorktree: (worktreeId: string | null) => void;
  setConnectionStatus: (status: ConnectionStatus) => void;
  setConnectionError: (error: string | null) => void;
  toggleWorkspaceExpanded: (workspaceId: string) => void;
  
  // State management from server messages
  stateFromSnapshot: (snapshot: {
    workspaces: WorkspaceState[];
    worktrees: WorktreeState[];
    agentSessions: AgentSessionState[];
    terminalSessions: TerminalSessionState[];
  }) => void;
  
  // CRUD operations
  addWorkspace: (workspace: WorkspaceState) => void;
  updateWorkspace: (workspaceId: string, updates: Partial<WorkspaceState>) => void;
  removeWorkspace: (workspaceId: string) => void;
  
  addWorktree: (worktree: WorktreeState) => void;
  updateWorktree: (worktreeId: string, updates: Partial<WorktreeState>) => void;
  updateWorktreeGitStats: (worktreeId: string, stats: GitStats) => void;
  removeWorktree: (worktreeId: string) => void;
  
  addAgentSession: (session: AgentSessionState) => void;
  updateAgentSession: (sessionId: string, updates: Partial<AgentSessionState>) => void;
  removeAgentSession: (sessionId: string) => void;
  
addTerminalSession: (session: TerminalSessionState) => void;
    updateTerminalSession: (sessionId: string, updates: Partial<TerminalSessionState>) => void;
    removeTerminalSession: (sessionId: string) => void;
  
  // Notification management
  addNotification: (notification: Omit<NotificationState, 'id' | 'timestamp'>) => void;
  removeNotification: (id: string) => void;
  clearNotifications: () => void;

  // Agent tab management
  addAgentTab: (worktreeId: string, tab: AgentTab) => void;
  removeAgentTab: (worktreeId: string, tabId: string) => void;
  removeAgentTabsRightOf: (worktreeId: string, tabId: string) => void;
  removeAgentTabsLeftOf: (worktreeId: string, tabId: string) => void;
  removeAgentTabsOthers: (worktreeId: string, tabId: string) => void;
  setActiveAgentTab: (worktreeId: string, tabId: string) => void;
  updateAgentTab: (worktreeId: string, tabId: string, updates: Partial<AgentTab>) => void;
  reorderAgentTabs: (worktreeId: string, sourceIndex: number, targetIndex: number) => void;

  // PR dialog actions
  setPRDialogOpen: (isOpen: boolean) => void;
  setPRDialogTitle: (title: string) => void;
  setPRDialogBody: (body: string) => void;
  resetPRDialog: () => void;

  // Create worktree dialog actions
  setCreateWorktreeDialogOpen: (isOpen: boolean, workspaceId?: string) => void;
  resetCreateWorktreeDialog: () => void;

  setWorkspaceSettingsDialogOpen: (isOpen: boolean, workspaceId?: string) => void;
  resetWorkspaceSettingsDialog: () => void;

  setMergeDialogOpen: (isOpen: boolean, worktreeId?: string, branchName?: string, mainBranch?: string, mergeType?: 'merge' | 'squash') => void;
  resetMergeDialog: () => void;

  // DB reset dialog actions
  setDbResetDialogOpen: (isOpen: boolean, errorMessage?: string) => void;
  resetDbResetDialog: () => void;

  setChangeBranchDialogOpen: (isOpen: boolean, worktreeId?: string, currentBranch?: string) => void;
  resetChangeBranchDialog: () => void;

  showAlertDialog: (config: AlertDialogConfig) => void;
  hideAlertDialog: () => void;

  // ACP Accumulator actions
  dispatchAccumulator: (action: AcpAccumulatorAction) => void;
  flushAccumulator: () => void;
  flushAccumulatorThread: (worktreeId: string) => void;
}
