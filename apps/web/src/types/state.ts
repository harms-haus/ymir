/**
 * Application State Types for Zustand Store
 * Defines the shape of the global state managed by the WebSocket client
 */

import { AgentStatus } from './protocol';

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

export interface WorktreeState {
  id: string;
  workspaceId: string;
  branchName: string;
  path: string;
  status: 'active' | 'inactive' | 'orphaned';
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
}

// Terminal session state
export interface TerminalSessionState {
  id: string;
  worktreeId: string;
  label: string;
  shell: string;
  createdAt: number;
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

export interface DbResetDialogState {
  isOpen: boolean;
  errorMessage: string;
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
  expandedWorkspaceIds: Set<string>;

  // Agent pane tabs (per worktree)
  agentTabs: Map<string, AgentTab[]>;
  activeAgentTabId: Map<string, string>;

  // PR dialog state
  prDialog: PRDialogState;

  // Create worktree dialog state
  createWorktreeDialog: CreateWorktreeDialogState;

  workspaceSettingsDialog: WorkspaceSettingsDialogState;

  dbResetDialog: DbResetDialogState;

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
  removeWorktree: (worktreeId: string) => void;
  
  addAgentSession: (session: AgentSessionState) => void;
  updateAgentSession: (sessionId: string, updates: Partial<AgentSessionState>) => void;
  removeAgentSession: (sessionId: string) => void;
  
  addTerminalSession: (session: TerminalSessionState) => void;
  removeTerminalSession: (sessionId: string) => void;
  
  // Notification management
  addNotification: (notification: Omit<NotificationState, 'id' | 'timestamp'>) => void;
  removeNotification: (id: string) => void;
  clearNotifications: () => void;

  // Agent tab management
  addAgentTab: (worktreeId: string, tab: AgentTab) => void;
  removeAgentTab: (worktreeId: string, tabId: string) => void;
  setActiveAgentTab: (worktreeId: string, tabId: string) => void;
  updateAgentTab: (worktreeId: string, tabId: string, updates: Partial<AgentTab>) => void;

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

  // DB reset dialog actions
  setDbResetDialogOpen: (isOpen: boolean, errorMessage?: string) => void;
  resetDbResetDialog: () => void;

  showAlertDialog: (config: AlertDialogConfig) => void;
  hideAlertDialog: () => void;
}
