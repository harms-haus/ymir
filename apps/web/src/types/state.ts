/**
 * Application State Types for Zustand Store
 * Defines the shape of the global state managed by the WebSocket client
 */

import { AgentStatus, GitStatusEntry } from './protocol';

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

// ============================================================================
// File Cache Types (for caching file listings and git status)
// ============================================================================

/** Cache entry for file list data */
export interface FileListCache {
  worktreeId: string;
  files: string[];
  timestamp: number;
}

/** Cache entry for git status data */
export interface GitStatusCache {
  worktreeId: string;
  entries: GitStatusEntry[];
  timestamp: number;
}

export type AlertDialogVariant = 'default' | 'destructive';

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
  lastPongTimestamp: number;
  expandedWorkspaceIds: Set<string>;
  isWorkspacesLoading: boolean;

  // Agent pane tabs (per worktree)
  agentTabs: Map<string, AgentTab[]>;
  activeAgentTabId: Map<string, string>;

  // File cache (caches file listings and git status until worktree changes)
  fileListCache: Map<string, FileListCache>;
  gitStatusCache: Map<string, GitStatusCache>;

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
  setLastPongTimestamp: (ts: number) => void;
  setWorkspacesLoading: (loading: boolean) => void;
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

  // File cache actions
  setFileListCache: (worktreeId: string, files: string[]) => void;
  clearFileListCache: (worktreeId: string) => void;
  setGitStatusCache: (worktreeId: string, entries: GitStatusEntry[]) => void;
  clearGitStatusCache: (worktreeId: string) => void;
  clearAllFileCaches: () => void;
}
