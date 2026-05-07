import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { AppState, NotificationState, AgentTab, AlertDialogConfig, ConfirmDialogConfig, AgentSessionState, TerminalTabState, GitStats, AcpAccumulatorState, AcpAccumulatorAction, AccumulatedThread, AccumulatedMessage, AccumulatedTextContent, AccumulatedToolCard, AccumulatedContextCard, AccumulatedErrorCard, MAX_TOOL_OUTPUT_LENGTH, MAX_ACCUMULATED_MESSAGES, createInitialAccumulatorState, ThreadAccumulatedState, WorktreeSettingsDialogState } from './types/state';
export type { AgentTab };
import { GitStatusEntry, TerminalOutput, AcpEventEnvelope, AcpSequence, AcpToolUseStatus, AcpSessionStatus, AcpContextUpdateType, AcpErrorCode, AcpSessionConfigOption } from './types/protocol';
import { isAcpSessionInit, isAcpConfigOptionsUpdate, isAcpSessionStatus, isAcpPromptChunk, isAcpPromptComplete, isAcpToolUse, isAcpContextUpdate, isAcpError, isAcpResumeMarker } from './types/protocol';
import type { DecodedBridgeMessage } from './lib/bridge-transport';
import { isWorkspaceEvent, isWorktreeEvent, isGitResponse, isFileResponse, isNotificationMessage, isErrorResponse, isAckMessage, isPingMessage, isPongMessage, isAgentEvent, isTerminalEvent, isStateSnapshotMessage, isAcpPayload } from './types/bridge-envelope';
import { encodePong } from './lib/bridge-transport';
import { handleError } from './lib/error-recovery';
import { showNotification } from './lib/tauri';
import { useUIStore } from './uiStore';
import { acpSessionManager } from './lib/acp-session-manager';
import type { AcpStore } from '@harms-haus/acp-chat-react';

// Stable empty array reference to prevent infinite re-renders
const EMPTY_AGENT_TABS: AgentTab[] = [];
const EMPTY_TERMINAL_TABS: TerminalTabState[] = [];
const EMPTY_AGENT_SESSIONS: AgentSessionState[] = [];


// File content callback registry (for routing FileContent to editor components)
let fileContentCallback: ((message: { worktreeId: string; path: string; content: string }) => void) | null = null;

export function setFileContentCallback(callback: ((message: { worktreeId: string; path: string; content: string }) => void) | null): void {
  fileContentCallback = callback;
}

export function getFileContentCallback(): ((message: { worktreeId: string; path: string; content: string }) => void) | null {
  return fileContentCallback;
}

// Terminal output callback registry (for routing TerminalOutput to TerminalProvider)
let terminalOutputCallback: ((message: TerminalOutput) => void) | null = null;

export function setTerminalOutputCallback(callback: ((message: TerminalOutput) => void) | null): void {
  terminalOutputCallback = callback;
}

export function getTerminalOutputCallback(): ((message: TerminalOutput) => void) | null {
  return terminalOutputCallback;
}

// ----------------------------------------------------------------------------
// ACP Event Accumulator Reducer
// ----------------------------------------------------------------------------

function generateMessageId(sequence: number): string {
  return `msg-${sequence}`;
}

function createEmptyThread(threadId: string, acpSessionId: string, agentTabId: string, worktreeId: string, connectionGeneration: number): AccumulatedThread {
  return {
    acpSessionId,
    agentTabId,
    worktreeId,
    messages: [],
    sessionStatus: 'Complete',
    lastSequence: 0,
    connectionGeneration,
    isStreaming: false,
    configOptions: [],
  };
}

function truncateToolOutput(output: string | undefined): string | undefined {
  if (!output) return undefined;
  if (output.length <= MAX_TOOL_OUTPUT_LENGTH) return output;
  return output.slice(0, MAX_TOOL_OUTPUT_LENGTH) + '...[truncated]';
}

export function acpAccumulatorReducer(
  state: AcpAccumulatorState,
  action: AcpAccumulatorAction
): AcpAccumulatorState {
  switch (action.type) {
    case 'CONNECTION_RECONNECTED': {
      const newGeneration = state.connectionGeneration + 1;
      return {
        connectionGeneration: newGeneration,
        threads: new Map(),
        pendingCorrelations: new Map(),
        lastFlushTimestamp: Date.now(),
      };
    }

    case 'FLUSH_ALL': {
      return {
        ...state,
        threads: new Map(),
        pendingCorrelations: new Map(),
        lastFlushTimestamp: Date.now(),
      };
    }

    case 'FLUSH_THREAD': {
      const newThreads = new Map(state.threads);
      newThreads.delete(action.threadId);
      return { ...state, threads: newThreads };
    }

    case 'REBUILD_FROM_SNAPSHOT': {
      const thread = createEmptyThread(action.threadId, action.acpSessionId, action.threadId, action.worktreeId, state.connectionGeneration);
      const newThreads = new Map(state.threads);
      newThreads.set(action.threadId, thread);
      return { ...state, threads: newThreads };
    }

    case 'SET_STREAMING': {
      const thread = state.threads.get(action.threadId);
      if (!thread) return state;
      const newThreads = new Map(state.threads);
      newThreads.set(action.threadId, { ...thread, isStreaming: action.isStreaming });
      return { ...state, threads: newThreads };
    }

    case 'USER_MESSAGE': {
      const { threadId, content } = action;
      let thread = state.threads.get(threadId);
      if (!thread) {
        // Fallback: use worktreeId from any existing thread, or 'unknown'
        const fallbackWorktreeId = state.threads.values().next().value?.worktreeId ?? 'unknown';
        thread = createEmptyThread(threadId, 'unknown', threadId, fallbackWorktreeId, state.connectionGeneration);
      }
      const newMessage: AccumulatedMessage = {
        id: generateMessageId(Date.now()),
        role: 'user',
        parts: [{ type: 'text', text: content, isStreaming: false }],
        createdAt: Date.now(),
        lastSequence: Date.now(),
      };
      const newThreads = new Map(state.threads);
      newThreads.set(threadId, { ...thread, messages: [...thread.messages, newMessage] });
      return { ...state, threads: newThreads };
    }

    case 'EVENT_RECEIVED': {
      const { envelope, threadId } = action;
      const eventType = envelope.eventType;
      const data = envelope.data;
      const sequence = envelope.sequence;
      const worktreeId = (data as any)?.worktreeId ?? 'unknown';

      // SessionInit: re-key from temp key (agentTabId) to acpSessionId
      if (isAcpSessionInit({ eventType, data } as any)) {
        const sessionData = data as any;
        const acpSessionId = sessionData.acpSessionId;
        const newThreads = new Map(state.threads);

        // Idempotency guard: if a thread already exists at the acpSessionId key,
        // just update config in place. Don't re-key or create duplicates.
        const existingAtTarget = newThreads.get(acpSessionId);
        if (existingAtTarget) {
          console.debug(
            `[acpAccumulator] SessionInit idempotent: thread already exists at acpSessionId=${acpSessionId}, updating config in place`
          );
          newThreads.set(acpSessionId, {
            ...existingAtTarget,
            acpSessionId,
            configOptions: sessionData.configOptions ?? [],
          });
          return { ...state, threads: newThreads };
        }

        // Check if a thread exists at the incoming threadId (agentTabId temp key)
        const existingThread = newThreads.get(threadId);
        if (existingThread && threadId !== acpSessionId) {
          // Re-key: copy thread from agentTabId to acpSessionId, delete old entry
          console.debug(
            `[acpAccumulator] SessionInit re-keying: migrating thread from agentTabId=${threadId} to acpSessionId=${acpSessionId}`
          );
          newThreads.delete(threadId);
          newThreads.set(acpSessionId, {
            ...existingThread,
            acpSessionId,
            agentTabId: threadId, // preserve the original agentTabId
            worktreeId,
            configOptions: sessionData.configOptions ?? [],
          });

          // Migrate pending correlations from old key to new key
          const pendingAtOldKey = state.pendingCorrelations.get(threadId);
          const newPendingCorrelations = new Map(state.pendingCorrelations);
          if (pendingAtOldKey && pendingAtOldKey.length > 0) {
            console.debug(
              `[acpAccumulator] SessionInit re-keying: migrating ${pendingAtOldKey.length} pending correlation(s) from ${threadId} to ${acpSessionId}`
            );
            newPendingCorrelations.delete(threadId);
            newPendingCorrelations.set(acpSessionId, pendingAtOldKey);
          } else {
            // No pending correlations at old key — still ensure old key is cleaned up
            // in case there's an empty array leftover
            newPendingCorrelations.delete(threadId);
          }
          return { ...state, threads: newThreads, pendingCorrelations: newPendingCorrelations };
        } else {
          // No existing thread — create new one keyed by acpSessionId
          console.debug(
            `[acpAccumulator] SessionInit: no existing thread at ${threadId}, creating new thread at acpSessionId=${acpSessionId}`
          );
          newThreads.set(acpSessionId, createEmptyThread(acpSessionId, acpSessionId, threadId, worktreeId, state.connectionGeneration));
          const freshThread = newThreads.get(acpSessionId)!;
          newThreads.set(acpSessionId, {
            ...freshThread,
            configOptions: sessionData.configOptions ?? [],
          });
        }
        return { ...state, threads: newThreads };
      }

      let thread = state.threads.get(threadId);

      if (!thread) {
        const acpSessionId = (data as any)?.acpSessionId ?? 'unknown';
        thread = createEmptyThread(threadId, acpSessionId, threadId, worktreeId, state.connectionGeneration);
      }

      const newThreads = new Map(state.threads);
      let updatedThread = { ...thread };
      let changed = false;

      if (isAcpSessionStatus({ eventType, data } as any)) {
        updatedThread.sessionStatus = (data as any).status;
        changed = true;
      } else if (isAcpConfigOptionsUpdate({ eventType, data } as any)) {
        updatedThread.configOptions = (data as any).configOptions ?? [];
        changed = true;
      } else if (isAcpPromptChunk({ eventType, data } as any)) {
        const chunkData = data as any;
        updatedThread.isStreaming = !chunkData.isFinal;

        let lastMessage = updatedThread.messages[updatedThread.messages.length - 1];
        if (!lastMessage || lastMessage.role !== 'assistant') {
          lastMessage = {
            id: generateMessageId(sequence),
            role: 'assistant',
            parts: [],
            createdAt: Date.now(),
            lastSequence: sequence,
          };
          updatedThread.messages = [...updatedThread.messages, lastMessage];
        }

        const content = chunkData.content;
        const isText = content?.type === 'Text';
        const isStructured = content?.type === 'Structured';
        const contentData = content?.data ?? '';

        if (isText) {
          let textPart = lastMessage.parts.find((p): p is AccumulatedTextContent => p.type === 'text');
          if (textPart) {
            const newParts = lastMessage.parts.map(p =>
              p.type === 'text' ? { ...p, text: p.text + contentData, isStreaming: !chunkData.isFinal } : p
            );
            updatedThread.messages = updatedThread.messages.map((m, i) =>
              i === updatedThread.messages.length - 1 ? { ...m, parts: newParts, lastSequence: sequence } : m
            );
          } else {
            const newTextPart: AccumulatedTextContent = { type: 'text', text: contentData, isStreaming: !chunkData.isFinal };
            const newParts = [...lastMessage.parts, newTextPart];
            updatedThread.messages = updatedThread.messages.map((m, i) =>
              i === updatedThread.messages.length - 1 ? { ...m, parts: newParts, lastSequence: sequence } : m
            );
          }
        } else if (isStructured) {
          const newStructuredPart = { type: 'structured' as const, data: contentData, isStreaming: !chunkData.isFinal };
          const newParts = [...lastMessage.parts, newStructuredPart];
          updatedThread.messages = updatedThread.messages.map((m, i) =>
            i === updatedThread.messages.length - 1 ? { ...m, parts: newParts, lastSequence: sequence } : m
          );
        }
        changed = true;
      } else if (isAcpPromptComplete({ eventType, data } as any)) {
        const completeData = data as any;
        updatedThread.isStreaming = false;
        if (completeData.reason === 'Error') {
          updatedThread.sessionStatus = 'Complete';
        }
        changed = true;
      } else if (isAcpToolUse({ eventType, data } as any)) {
        const toolData = data as any;
        const toolUseId = toolData.toolUseId;

        let toolCardFound = false;
        const newMessages = updatedThread.messages.map(msg => {
          const newParts = msg.parts.map(part => {
            if (part.type === 'tool' && part.toolUseId === toolUseId) {
              toolCardFound = true;
              return {
                ...part,
                status: toolData.status,
                output: truncateToolOutput(toolData.output),
                error: toolData.error,
                updatedAt: Date.now(),
              } as AccumulatedToolCard;
            }
            return part;
          });
          return { ...msg, parts: newParts };
        });

        if (!toolCardFound) {
          let lastMessage = newMessages[newMessages.length - 1];
          if (!lastMessage || lastMessage.role !== 'assistant') {
            lastMessage = {
              id: generateMessageId(sequence),
              role: 'assistant',
              parts: [],
              createdAt: Date.now(),
              lastSequence: sequence,
            };
            newMessages.push(lastMessage);
          }
          const newToolCard: AccumulatedToolCard = {
            type: 'tool',
            toolUseId,
            toolName: toolData.toolName,
            status: toolData.status,
            input: toolData.input,
            output: truncateToolOutput(toolData.output),
            error: toolData.error,
            updatedAt: Date.now(),
          };
          lastMessage.parts = [...lastMessage.parts, newToolCard];
          lastMessage.lastSequence = sequence;
        }

        updatedThread.messages = newMessages;
        changed = true;
      } else if (isAcpContextUpdate({ eventType, data } as any)) {
        const contextData = data as any;
        let lastMessage = updatedThread.messages[updatedThread.messages.length - 1];
        if (!lastMessage || lastMessage.role !== 'assistant') {
          lastMessage = {
            id: generateMessageId(sequence),
            role: 'assistant',
            parts: [],
            createdAt: Date.now(),
            lastSequence: sequence,
          };
          updatedThread.messages = [...updatedThread.messages, lastMessage];
        }
        const contextCard: AccumulatedContextCard = {
          type: 'context',
          updateType: contextData.updateType,
          data: contextData.data,
          sequence,
        };
        updatedThread.messages = updatedThread.messages.map((m, i) =>
          i === updatedThread.messages.length - 1
            ? { ...m, parts: [...m.parts, contextCard], lastSequence: sequence } : m
        );
        changed = true;
      } else if (isAcpError({ eventType, data } as any)) {
        const errorData = data as any;
        const errorCard: AccumulatedErrorCard = {
          type: 'error',
          code: errorData.code,
          message: errorData.message,
          details: errorData.details,
          recoverable: errorData.recoverable,
          sequence,
        };
        let lastMessage = updatedThread.messages[updatedThread.messages.length - 1];
        if (!lastMessage) {
          lastMessage = {
            id: generateMessageId(sequence),
            role: 'assistant',
            parts: [errorCard],
            createdAt: Date.now(),
            lastSequence: sequence,
          };
          updatedThread.messages = [lastMessage];
        } else {
          updatedThread.messages = updatedThread.messages.map((m, i) =>
            i === updatedThread.messages.length - 1
              ? { ...m, parts: [...m.parts, errorCard], lastSequence: sequence } : m
          );
        }
        changed = true;
      } else if (isAcpResumeMarker({ eventType, data } as any)) {
        const resumeData = data as any;
        updatedThread.resumeCheckpoint = resumeData.checkpoint;
        updatedThread.lastSequence = resumeData.lastSequence;
        changed = true;
      }

      if (changed && sequence > updatedThread.lastSequence) {
        updatedThread.lastSequence = sequence;
      }
      if (updatedThread.messages.length > MAX_ACCUMULATED_MESSAGES) {
        updatedThread.messages = updatedThread.messages.slice(-MAX_ACCUMULATED_MESSAGES);
      }
      newThreads.set(threadId, updatedThread);
      return { ...state, threads: newThreads };
    }

    default:
      return state;
  }
}

// ----------------------------------------------------------------------------
// ACP Store helpers (access AcpStore from acpSessionManager)
// ----------------------------------------------------------------------------

/** Get the AcpStore for a worktree, or null if none exists. */
export function getAcpStore(worktreeId: string): AcpStore | null {
  return acpSessionManager.getAcpStore(worktreeId);
}

export const useStore = create<AppState>()(
  devtools(
    (set, get) => ({
      // Data slices
      workspaces: [],
      worktrees: [],
      agentSessions: [],
      terminalTabs: [],
      notifications: [],
      
  // UI state
    activeWorktreeId: null,
    connectionStatus: 'closed',
    connectionError: null,
    lastPongTimestamp: 0,
    expandedWorkspaceIds: new Set<string>(),
    isWorkspacesLoading: true,

  // Agent pane tabs (per worktree)
  agentTabs: new Map(),
  activeAgentTabId: new Map(),

  // ACP Event Accumulator (connection-scoped, derived state)
  acpAccumulator: createInitialAccumulatorState(),

  // File cache (caches file listings and git status until worktree changes)
  fileListCache: new Map(),
  gitStatusCache: new Map(),

  // PR dialog state
  prDialog: {
    isOpen: false,
    title: '',
    body: '',
  },

  createWorktreeDialog: {
    isOpen: false,
    workspaceId: null,
  },

  workspaceSettingsDialog: {
    isOpen: false,
    workspaceId: null,
  },

  mergeDialog: {
    isOpen: false,
    worktreeId: null,
    branchName: '',
    mainBranch: 'main',
    mergeType: 'merge',
  },

  dbResetDialog: {
    isOpen: false,
    errorMessage: '',
  },

  changeBranchDialog: {
    isOpen: false,
    worktreeId: null,
    currentBranch: '',
  },

  worktreeSettingsDialog: {
    isOpen: false,
    worktreeId: null,
  },

  alertDialog: null,

  confirmDialog: null,

  setWorkspaces: (workspaces) => set({ workspaces }),
      
      setWorktrees: (worktrees) => set({ worktrees }),
      
      setAgentSessions: (agentSessions) => set({ agentSessions }),
      
      setTerminalTabs: (terminalTabs) => set({ terminalTabs }),
      
      setActiveWorktree: (activeWorktreeId) => {
        useUIStore.getState().setActiveWorktreeId(activeWorktreeId);
        set((state) => {
          if (activeWorktreeId) {
            const worktree = state.worktrees.find(wt => wt.id === activeWorktreeId);
            if (worktree) {
              useUIStore.getState().toggleExpandedWorkspaceId(worktree.workspaceId);
            }
          }
          // Keep file list cache on worktree switch — lazy loading makes root list small/fast
          return {
            activeWorktreeId,
          };
        });
      },
      
  setConnectionStatus: (connectionStatus) => set((state) => ({
    connectionStatus,
    // Set loading to true only when connecting; clear it on terminal state (closed)
    isWorkspacesLoading: connectionStatus === 'connecting' ? true : connectionStatus === 'closed' ? false : state.isWorkspacesLoading
  })),
      
      setConnectionError: (connectionError) => set({ connectionError }),

      setLastPongTimestamp: (lastPongTimestamp) => set({ lastPongTimestamp }),

      setWorkspacesLoading: (isWorkspacesLoading) => set({ isWorkspacesLoading }),

      toggleWorkspaceExpanded: (workspaceId: string) =>
        set((state) => {
          const expandedIds = new Set(state.expandedWorkspaceIds)
          if (expandedIds.has(workspaceId)) {
            expandedIds.delete(workspaceId)
          } else {
            expandedIds.add(workspaceId)
          }
          useUIStore.getState().toggleExpandedWorkspaceId(workspaceId);
          return { expandedWorkspaceIds: expandedIds }
        }),

      // State management from server snapshot
      stateFromSnapshot: (snapshot) => {
        set((_state) => ({
          workspaces: snapshot.workspaces,
          worktrees: snapshot.worktrees,
          agentSessions: snapshot.agentSessions,
          terminalTabs: (snapshot.terminalTabs as any) ?? (snapshot as any).terminalSessions ?? [],
          isWorkspacesLoading: false,
        }));
      },

      // Workspace CRUD
      addWorkspace: (workspace) =>
        set((state) => ({
          workspaces: [...state.workspaces, workspace],
        })),

      updateWorkspace: (workspaceId, updates) =>
        set((state) => ({
          workspaces: state.workspaces.map((w) =>
            w.id === workspaceId ? { ...w, ...updates, updatedAt: Date.now() } : w
          ),
        })),

      removeWorkspace: (workspaceId) =>
        set((state) => {
          // Also remove related worktrees, agent sessions, and terminal sessions
          const worktreesToRemove = state.worktrees
            .filter((wt) => wt.workspaceId === workspaceId)
            .map((wt) => wt.id);
          
          return {
            workspaces: state.workspaces.filter((w) => w.id !== workspaceId),
            worktrees: state.worktrees.filter((wt) => wt.workspaceId !== workspaceId),
            agentSessions: state.agentSessions.filter(
              (as) => !worktreesToRemove.includes(as.worktreeId)
            ),
            terminalTabs: state.terminalTabs.filter(
              (ts) => !worktreesToRemove.includes(ts.worktreeId)
            ),
            activeWorktreeId:
              state.activeWorktreeId &&
              worktreesToRemove.includes(state.activeWorktreeId)
                ? null
                : state.activeWorktreeId,
          };
        }),

      // Worktree CRUD
      addWorktree: (worktree) =>
        set((state) => ({
          worktrees: [...state.worktrees, worktree],
        })),

      updateWorktree: (worktreeId, updates) =>
        set((state) => ({
          worktrees: state.worktrees.map((wt) =>
            wt.id === worktreeId ? { ...wt, ...updates } : wt
          ),
        })),

      updateWorktreeGitStats: (worktreeId: string, stats: GitStats) =>
        set((state) => ({
          worktrees: state.worktrees.map((wt) =>
            wt.id === worktreeId ? { ...wt, gitStats: stats } : wt
          ),
        })),

      removeWorktree: (worktreeId) =>
        set((state) => ({
          worktrees: state.worktrees.filter((wt) => wt.id !== worktreeId),
          agentSessions: state.agentSessions.filter((as) => as.worktreeId !== worktreeId),
          terminalTabs: state.terminalTabs.filter((ts) => ts.worktreeId !== worktreeId),
          activeWorktreeId:
            state.activeWorktreeId === worktreeId ? null : state.activeWorktreeId,
        })),

      // Agent session CRUD
      addAgentSession: (session) =>
        set((state) => ({
          agentSessions: [...state.agentSessions, session],
        })),

      updateAgentSession: (sessionId, updates) =>
        set((state) => ({
          agentSessions: state.agentSessions.map((as) =>
            as.id === sessionId ? { ...as, ...updates } : as
          ),
        })),

      removeAgentSession: (sessionId) =>
        set((state) => ({
          agentSessions: state.agentSessions.filter((as) => as.id !== sessionId),
        })),

// Terminal tab CRUD
    addTerminalTab: (tab) =>
        set((state) => {
            // Prevent duplicate tabs
            if (state.terminalTabs.some((t) => t.id === tab.id)) {
                return { terminalTabs: state.terminalTabs };
            }
            return { terminalTabs: [...state.terminalTabs, tab] };
        }),

  updateTerminalTab: (tabId, updates) =>
    set((state) => ({
      terminalTabs: state.terminalTabs.map((tt) =>
        tt.id === tabId ? { ...tt, ...updates } : tt,
      ),
    })),

    removeTerminalTab: (tabId) =>
        set((state) => ({
            terminalTabs: state.terminalTabs.filter((tt) => tt.id !== tabId),
        })),

    setTabSession: (tabId, sessionId) => {
        console.log('[Store] setTabSession:', tabId.slice(0, 8), '→ sessionId:', sessionId.slice(0, 8));
        set((state) => ({
            terminalTabs: state.terminalTabs.map((tt) =>
                tt.id === tabId
                    ? { ...tt, activeSessionId: sessionId, status: 'active' as const }
                    : tt,
            ),
        }));
    },

    clearTabSession: (tabId) => {
        console.log('[Store] clearTabSession:', tabId.slice(0, 8), '→ disconnected');
        set((state) => ({
            terminalTabs: state.terminalTabs.map((tt) =>
                tt.id === tabId
                    ? { ...tt, activeSessionId: null, status: 'disconnected' as const }
                    : tt,
            ),
        }));
    },

      // Notification management
      addNotification: (notification) => {
        const id = `notification-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
        const newNotification: NotificationState = {
          level: notification.level,
          message: notification.message,
          id,
          timestamp: Date.now(),
        };

        set((state) => ({
          notifications: [...state.notifications, newNotification],
        }));

        // Auto-remove notifications after duration
        const duration = (notification as any).duration ?? 5000;
        if (duration > 0) {
          setTimeout(() => {
            get().removeNotification(id);
          }, duration);
        }
      },

      removeNotification: (id) =>
        set((state) => ({
          notifications: state.notifications.filter((n) => n.id !== id),
        })),

    clearNotifications: () => set({ notifications: [] }),

  // Agent tab management
  addAgentTab: (worktreeId, tab) =>
    set((state) => {
      const newTabs = new Map(state.agentTabs);
      const existingTabs = newTabs.get(worktreeId) || [];
      // Prevent duplicate tabs
      if (existingTabs.some((t) => t.id === tab.id)) {
        return { agentTabs: state.agentTabs, activeAgentTabId: state.activeAgentTabId };
      }
      newTabs.set(worktreeId, [...existingTabs, tab]);

      const newActiveTabId = new Map(state.activeAgentTabId);
      if (!newActiveTabId.has(worktreeId)) {
        newActiveTabId.set(worktreeId, tab.id);
      }

      return { agentTabs: newTabs, activeAgentTabId: newActiveTabId };
    }),

  removeAgentTab: (worktreeId, tabId) =>
    set((state) => {
      const newTabs = new Map(state.agentTabs);
      const existingTabs = newTabs.get(worktreeId) || [];
      const filteredTabs = existingTabs.filter((t) => t.id !== tabId);

      if (filteredTabs.length === 0) {
        newTabs.delete(worktreeId);
      } else {
        newTabs.set(worktreeId, filteredTabs);
      }

      const newActiveTabId = new Map(state.activeAgentTabId);
      if (newActiveTabId.get(worktreeId) === tabId) {
        if (filteredTabs.length > 0) {
          newActiveTabId.set(worktreeId, filteredTabs[0].id);
        } else {
          newActiveTabId.delete(worktreeId);
        }
      }

      return { agentTabs: newTabs, activeAgentTabId: newActiveTabId };
    }),

  removeAgentTabsRightOf: (worktreeId, tabId) =>
    set((state) => {
      const newTabs = new Map(state.agentTabs);
      const existingTabs = newTabs.get(worktreeId) || [];
      const tabIndex = existingTabs.findIndex((t) => t.id === tabId);
      if (tabIndex === -1) return state;
      const filteredTabs = existingTabs.slice(0, tabIndex + 1);
      newTabs.set(worktreeId, filteredTabs);
      return { agentTabs: newTabs };
    }),

  removeAgentTabsLeftOf: (worktreeId, tabId) =>
    set((state) => {
      const newTabs = new Map(state.agentTabs);
      const existingTabs = newTabs.get(worktreeId) || [];
      const tabIndex = existingTabs.findIndex((t) => t.id === tabId);
      if (tabIndex === -1) return state;
      const filteredTabs = existingTabs.slice(tabIndex);
      newTabs.set(worktreeId, filteredTabs);
      return { agentTabs: newTabs };
    }),

  removeAgentTabsOthers: (worktreeId, tabId) =>
    set((state) => {
      const newTabs = new Map(state.agentTabs);
      const existingTabs = newTabs.get(worktreeId) || [];
      const filteredTabs = existingTabs.filter((t) => t.id === tabId);
      newTabs.set(worktreeId, filteredTabs);
      const newActiveTabId = new Map(state.activeAgentTabId);
      newActiveTabId.set(worktreeId, tabId);
      return { agentTabs: newTabs, activeAgentTabId: newActiveTabId };
    }),

setActiveAgentTab: (worktreeId, tabId) => {
        useUIStore.getState().setActiveAgentTabId(worktreeId, tabId);
        set((state) => {
          const newActiveTabId = new Map(state.activeAgentTabId);
          newActiveTabId.set(worktreeId, tabId);
          return { activeAgentTabId: newActiveTabId };
        });
      },

  updateAgentTab: (worktreeId, tabId, updates) =>
    set((state) => {
      const newTabs = new Map(state.agentTabs);
      const existingTabs = newTabs.get(worktreeId) || [];
      const updatedTabs = existingTabs.map((t) =>
        t.id === tabId ? { ...t, ...updates } : t
      );
      newTabs.set(worktreeId, updatedTabs);
      return { agentTabs: newTabs };
    }),

  reorderAgentTabs: (worktreeId, sourceIndex, targetIndex) =>
    set((state) => {
      const newTabs = new Map(state.agentTabs);
      const existingTabs = newTabs.get(worktreeId) || [];
      if (sourceIndex < 0 || sourceIndex >= existingTabs.length || targetIndex < 0 || targetIndex >= existingTabs.length) {
        return state;
      }
      const newOrder = [...existingTabs];
      const [movedTab] = newOrder.splice(sourceIndex, 1);
      newOrder.splice(targetIndex, 0, movedTab);
      newTabs.set(worktreeId, newOrder);
      return { agentTabs: newTabs };
    }),

  setPRDialogOpen: (isOpen) =>
      set((state) => ({
        prDialog: { ...state.prDialog, isOpen },
      })),

  setPRDialogTitle: (title) =>
      set((state) => ({
        prDialog: { ...state.prDialog, title },
      })),

  setPRDialogBody: (body) =>
      set((state) => ({
        prDialog: { ...state.prDialog, body },
      })),

  resetPRDialog: () =>
      set({
        prDialog: { isOpen: false, title: '', body: '' },
      }),

  setCreateWorktreeDialogOpen: (isOpen, workspaceId) =>
      set((state) => ({
        createWorktreeDialog: {
          ...state.createWorktreeDialog,
          isOpen,
          workspaceId: workspaceId ?? state.createWorktreeDialog.workspaceId,
        },
      })),

  resetCreateWorktreeDialog: () =>
      set({
        createWorktreeDialog: { isOpen: false, workspaceId: null },
      }),

  setWorkspaceSettingsDialogOpen: (isOpen, workspaceId) =>
      set((state) => ({
        workspaceSettingsDialog: {
          ...state.workspaceSettingsDialog,
          isOpen,
          workspaceId: workspaceId ?? state.workspaceSettingsDialog.workspaceId,
        },
      })),

  resetWorkspaceSettingsDialog: () =>
      set({
        workspaceSettingsDialog: { isOpen: false, workspaceId: null },
      }),

  setMergeDialogOpen: (isOpen, worktreeId, branchName, mainBranch, mergeType) =>
      set((state) => ({
        mergeDialog: {
          ...state.mergeDialog,
          isOpen,
          worktreeId: worktreeId ?? state.mergeDialog.worktreeId,
          branchName: branchName ?? state.mergeDialog.branchName,
          mainBranch: mainBranch ?? state.mergeDialog.mainBranch,
          mergeType: mergeType ?? state.mergeDialog.mergeType,
        },
      })),

  resetMergeDialog: () =>
      set({
        mergeDialog: { isOpen: false, worktreeId: null, branchName: '', mainBranch: 'main', mergeType: 'merge' },
      }),

  setDbResetDialogOpen: (isOpen, errorMessage) =>
      set((state) => ({
        dbResetDialog: {
          ...state.dbResetDialog,
          isOpen,
          errorMessage: errorMessage ?? state.dbResetDialog.errorMessage,
        },
      })),

  resetDbResetDialog: () =>
    set({
      dbResetDialog: { isOpen: false, errorMessage: '' },
    }),

  setChangeBranchDialogOpen: (isOpen, worktreeId, currentBranch) =>
    set((state) => ({
      changeBranchDialog: {
        ...state.changeBranchDialog,
        isOpen,
        worktreeId: worktreeId ?? state.changeBranchDialog.worktreeId,
        currentBranch: currentBranch ?? state.changeBranchDialog.currentBranch,
      },
    })),

  resetChangeBranchDialog: () =>
    set({
      changeBranchDialog: { isOpen: false, worktreeId: null, currentBranch: '' },
    }),

  setWorktreeSettingsDialogOpen: (isOpen, worktreeId) =>
    set((state) => ({
      worktreeSettingsDialog: {
        ...state.worktreeSettingsDialog,
        isOpen,
        worktreeId: worktreeId ?? state.worktreeSettingsDialog.worktreeId,
      },
    })),

  resetWorktreeSettingsDialog: () =>
    set({
      worktreeSettingsDialog: { isOpen: false, worktreeId: null },
    }),

  showAlertDialog: (config: AlertDialogConfig) =>
    set({
      alertDialog: { ...config, open: true, variant: config.variant ?? 'default' },
    }),

  hideAlertDialog: () =>
    set((state) => ({
      alertDialog: state.alertDialog ? { ...state.alertDialog, open: false } : null,
    })),

  setConfirmDialog: (config: ConfirmDialogConfig) =>
    set({
      confirmDialog: { ...config, open: true, destructive: config.destructive ?? false },
    }),

  hideConfirmDialog: () =>
    set({ confirmDialog: null }),

  // ACP Accumulator actions
  dispatchAccumulator: (action: AcpAccumulatorAction) =>
    set((state) => ({
      acpAccumulator: acpAccumulatorReducer(state.acpAccumulator, action),
    })),

  flushAccumulator: () =>
    set((state) => ({
      acpAccumulator: acpAccumulatorReducer(state.acpAccumulator, { type: 'FLUSH_ALL' }),
    })),

  flushAccumulatorThread: (threadId: string) =>
    set((state) => ({
      acpAccumulator: acpAccumulatorReducer(state.acpAccumulator, { type: 'FLUSH_THREAD', threadId }),
    })),

  // File cache actions
  setFileListCache: (worktreeId: string, files: string[]) =>
    set((state) => {
      const newCache = new Map(state.fileListCache);
      newCache.set(worktreeId, { worktreeId, files, timestamp: Date.now() });
      return { fileListCache: newCache };
    }),

  clearFileListCache: (worktreeId: string) =>
    set((state) => {
      const newCache = new Map(state.fileListCache);
      newCache.delete(worktreeId);
      return { fileListCache: newCache };
    }),

  setGitStatusCache: (worktreeId: string, entries: GitStatusEntry[]) =>
    set((state) => {
      const newCache = new Map(state.gitStatusCache);
      newCache.set(worktreeId, { worktreeId, entries, timestamp: Date.now() });
      return { gitStatusCache: newCache };
    }),

  clearGitStatusCache: (worktreeId: string) =>
    set((state) => {
      const newCache = new Map(state.gitStatusCache);
      newCache.delete(worktreeId);
      return { gitStatusCache: newCache };
    }),

  clearAllFileCaches: () =>
    set(() => ({
      fileListCache: new Map(),
      gitStatusCache: new Map(),
    })),
}),
  { name: 'ymir-app-store' }
  )
);

// Selectors for derived state
export const selectIsWorkspacesLoading = (state: AppState) => state.isWorkspacesLoading;

export const selectWorkspaceById = (workspaceId: string) => (state: AppState) =>
  state.workspaces.find((w) => w.id === workspaceId);

export const selectWorktreeById = (worktreeId: string) => (state: AppState) =>
  state.worktrees.find((wt) => wt.id === worktreeId);

export const selectWorktreesByWorkspaceId = (workspaceId: string) => (state: AppState) =>
  state.worktrees.filter((wt) => wt.workspaceId === workspaceId);

export const selectAgentSessionById = (sessionId: string) => (state: AppState) =>
  state.agentSessions.find((as) => as.id === sessionId);

/** Look up an AgentSessionState by its ACP session ID.
 * Useful when multiple UI contexts (tabs) share the same underlying
 * acpSessionId and need to find the canonical session entry. */
export function getSessionByAcpSessionId(
  acpSessionId: string
): AgentSessionState | undefined {
  return useStore.getState().agentSessions.find(
    (as) => as.acpSessionId === acpSessionId
  );
}

export const selectAgentSessionsByWorktreeId = (worktreeId: string) => (state: AppState) => {
  const sessions = state.agentSessions.filter((as) => as.worktreeId === worktreeId);
  return sessions.length > 0 ? sessions : EMPTY_AGENT_SESSIONS;
};

export const selectTerminalTabsByWorktreeId = (worktreeId: string) => (state: AppState) => {
  const tabs = [...state.terminalTabs]
    .filter((tt) => tt.worktreeId === worktreeId)
    .sort((a, b) => a.position - b.position);
  return tabs.length > 0 ? tabs : EMPTY_TERMINAL_TABS;
};

export const selectActiveWorktree = (state: AppState) => {
  if (!state.activeWorktreeId) return null;
  return state.worktrees.find((wt) => wt.id === state.activeWorktreeId) || null;
};

export const selectActiveWorkspace = (state: AppState) => {
  const activeWorktree = selectActiveWorktree(state);
  if (!activeWorktree) return null;
  return state.workspaces.find((w) => w.id === activeWorktree.workspaceId) || null;
};

export const selectAgentTabsByWorktreeId = (worktreeId: string) => (state: AppState) =>
  state.agentTabs.get(worktreeId) ?? EMPTY_AGENT_TABS;

export const selectActiveAgentTabId = (worktreeId: string) => (state: AppState) =>
  state.activeAgentTabId.get(worktreeId) || null;

export const selectPRDialog = (state: AppState) => state.prDialog;

export const selectPRDialogOpen = (state: AppState) => state.prDialog.isOpen;

export const selectCreateWorktreeDialog = (state: AppState) => state.createWorktreeDialog;

export const selectCreateWorktreeDialogOpen = (state: AppState) => state.createWorktreeDialog.isOpen;

export const selectWorkspaceSettingsDialog = (state: AppState) => state.workspaceSettingsDialog;

export const selectWorkspaceSettingsDialogOpen = (state: AppState) => state.workspaceSettingsDialog.isOpen;

export const selectWorktreeSettingsDialog = (state: AppState) => state.worktreeSettingsDialog;

export const selectWorktreeSettingsDialogOpen = (state: AppState) => state.worktreeSettingsDialog.isOpen;

export const selectDbResetDialog = (state: AppState) => state.dbResetDialog;

export const selectDbResetDialogOpen = (state: AppState) => state.dbResetDialog.isOpen;

export const selectAlertDialog = (state: AppState) => state.alertDialog;

// ACP Store selectors (read from AcpStore via acpSessionManager)
export const selectAcpStoreForWorktree = (worktreeId: string) => (): ReturnType<typeof getAcpStore> => {
  return getAcpStore(worktreeId);
};

// File cache selectors
export const selectFileListCache = (worktreeId: string) => (state: AppState) =>
  state.fileListCache.get(worktreeId) ?? null;

export const selectGitStatusCache = (worktreeId: string) => (state: AppState) =>
  state.gitStatusCache.get(worktreeId) ?? null;

/**
 * Primary message handler for decoded BridgeEnvelope messages.
 * Dispatches to domain-specific handlers based on the BridgeMessage type
 * discriminator. All store mutations for BridgeEnvelope-wrapped messages
 * flow through this function.
 */
export function handleBridgeMessage(decoded: DecodedBridgeMessage, sendFn?: (envelope: unknown) => void): void {
  const { type, message } = decoded;

  switch (type) {
    case 'workspace_event': {
      if (!isWorkspaceEvent(message)) return;

      const payload = message.payload as Record<string, unknown> | null;
      if (!payload) return;

      // Payload is the raw struct (e.g. { workspace: {...} }), NOT wrapped in { originalType, data }
      const data = (payload.data as Record<string, unknown> | undefined) ?? payload;

      if (data.workspace !== undefined) {
        const workspace = (data as any)?.workspace;
        if (workspace) {
          const existing = useStore.getState().workspaces.find(w => w.id === workspace.id);
          if (existing) {
            useStore.getState().updateWorkspace(workspace.id, workspace);
          } else {
            useStore.getState().addWorkspace(workspace);
          }
        }
      } else if (data.workspaceId !== undefined) {
        const workspaceId = (data as any)?.workspaceId as string | undefined;
        if (workspaceId) {
          useStore.getState().removeWorkspace(workspaceId);
        }
      }
      break;
    }

    case 'worktree_event': {
      if (!isWorktreeEvent(message)) return;

      const payload = message.payload as Record<string, unknown> | null;
      if (!payload) return;

      // Payload is the raw struct (e.g. { worktrees, agentSessions, terminalTabs }),
      // NOT wrapped in { originalType, data }
      const data = (payload.data as Record<string, unknown> | undefined) ?? payload;

      // Detect event type from payload structure
      if (data.worktrees !== undefined) {
        // WorktreeDetailsResult or WorktreeListResult
        const { addAgentSession, addTerminalTab } = useStore.getState();
        const worktrees = (data as any)?.worktrees as Array<any> | undefined;
        const agentSessions = (data as any)?.agentSessions as Array<any> | undefined;
        const terminalTabs = (data as any)?.terminalTabs as Array<any> | undefined
          ?? (data as any)?.terminalSessions as Array<any> | undefined;

        if (worktrees) {
          worktrees.forEach((worktree) => {
            useStore.getState().addWorktree(worktree);
          });
        }
        if (agentSessions) {
          agentSessions.forEach((session) => {
            addAgentSession(session as any);
          });
        }
        if (terminalTabs) {
          terminalTabs.forEach((tab) => {
            // Map server TabSessionData to client TerminalTabState
            // Clear activeSessionId — PTY sessions are ephemeral and die on server restart.
            // A TerminalMount will be sent by TerminalPane to re-spawn fresh PTY sessions.
            addTerminalTab({
              id: tab.id,
              worktreeId: tab.worktreeId,
              label: tab.label ?? 'Terminal',
              position: (tab as any).position ?? 0,
              activeSessionId: null,
              status: 'disconnected',
              createdAt: typeof tab.createdAt === 'string'
                ? new Date(tab.createdAt).getTime()
                : tab.createdAt ?? Date.now(),
            });
          });
        }
      } else if (data.worktree !== undefined) {
        // WorktreeCreated, WorktreeChanged, or WorktreeStatus
        const worktree = (data as any)?.worktree;
        if (worktree?.id) {
          const existing = useStore.getState().worktrees.find(wt => wt.id === worktree.id);
          if (existing) {
            useStore.getState().updateWorktree(worktree.id, worktree);
          } else {
            useStore.getState().addWorktree(worktree);
          }
          useStore.getState().clearFileListCache(worktree.id);
          useStore.getState().clearGitStatusCache(worktree.id);
        }
      } else if (data.worktreeId !== undefined) {
        // WorktreeDeleted
        const worktreeId = (data as any)?.worktreeId as string | undefined;
        if (worktreeId) {
          useStore.getState().removeWorktree(worktreeId);
          useStore.getState().clearFileListCache(worktreeId);
          useStore.getState().clearGitStatusCache(worktreeId);
        }
      }
      break;
    }

    case 'git_response': {
      if (!isGitResponse(message)) return;

      const payload = message.payload as Record<string, unknown> | null;
      if (!payload) return;

      // Payload is the raw struct, NOT wrapped in { originalType, data }
      const data = (payload.data as Record<string, unknown> | undefined) ?? payload;

      if (data.worktreeId !== undefined && data.entries !== undefined) {
        // GitStatusResult
        const worktreeId = (data as any)?.worktreeId as string | undefined;
        const entries = (data as any)?.entries as Array<{ path: string; statusCode: string }> | undefined;
        if (worktreeId && entries) {
          const transformed = entries.map((entry) => {
            const statusCode = entry.statusCode;
            let status: GitStatusEntry['status'] = 'modified';
            let staged = false;

            if (statusCode === '??') {
              status = 'untracked';
              staged = false;
            } else if (statusCode.length >= 2) {
              const stagedChar = statusCode[0];
              const unstagedChar = statusCode[1];
              if (stagedChar === 'A') { status = 'added'; staged = true; }
              else if (stagedChar === 'D') { status = 'deleted'; staged = true; }
              else if (stagedChar === 'R') { status = 'renamed'; staged = true; }
              else if (stagedChar === 'M') { status = 'modified'; staged = true; }
              else if (unstagedChar === 'M') { status = 'modified'; staged = false; }
              else if (unstagedChar === 'D') { status = 'deleted'; staged = false; }
            }

            return { path: entry.path, status, staged } as GitStatusEntry;
          });
          useStore.getState().setGitStatusCache(worktreeId, transformed);
        }
      } else if (data.worktreeId !== undefined && data.filePath !== undefined && data.diff !== undefined) {
        // GitDiffResult — no store cache setter yet, DiffTab consumes via wsClient.onMessage
      }
      break;
    }

    case 'notification': {
      if (!isNotificationMessage(message)) return;

      const payload = message.payload as Record<string, unknown> | null;
      if (!payload) return;

      // Extract data from the wrapped payload { type, data }
      const data = (payload.data as Record<string, unknown> | undefined)
        ?? (payload.level !== undefined ? payload : undefined);

      const level = (data as any)?.level as 'info' | 'warning' | 'error' | undefined;
      const title = (data as any)?.title as string | undefined;
      const msg = (data as any)?.message as string | undefined;

      if (level && msg) {
        const notificationLevel = level === 'warning' ? 'warning' : level === 'error' ? 'error' : 'info';
        useStore.getState().addNotification({
          level: notificationLevel,
          message: title ? `${title}: ${msg}` : msg,
          duration: 5000,
        } as any);
        if (title) {
          showNotification(title, msg);
        }
      }
      break;
    }

    case 'error_response': {
      if (!isErrorResponse(message)) return;

      const payload = message.payload as Record<string, unknown> | null;
      if (!payload) return;

      // Extract data from the wrapped payload { type, data }
      const data = (payload.data as Record<string, unknown> | undefined)
        ?? (payload.code !== undefined ? payload : undefined);

      if (data) {
        const error = data as any;
        handleError({
          type: 'Error',
          code: error.code ?? 'unknown',
          message: error.message ?? 'Unknown error',
          details: error.details,
          requestId: error.requestId,
        });
      }
      break;
    }

    case 'file_response': {
      if (!isFileResponse(message)) return;

      const payload = message.payload as Record<string, unknown> | null;
      if (!payload) return;

      // Payload is the raw struct, NOT wrapped in { originalType, data }
      const data = (payload.data as Record<string, unknown> | undefined) ?? payload;

      if (data.worktreeId !== undefined && data.files !== undefined) {
        // FileListResult
        const worktreeId = (data as any)?.worktreeId as string | undefined;
        const files = (data as any)?.files as string[] | undefined;
        if (worktreeId && files) {
          useStore.getState().setFileListCache(worktreeId, files);
        }
      } else if (data.worktreeId !== undefined && data.path !== undefined && data.content !== undefined) {
        // FileContent
        const worktreeId = (data as any)?.worktreeId as string | undefined;
        const path = (data as any)?.path as string | undefined;
        const content = (data as any)?.content as string | undefined;
        if (worktreeId && path && content !== undefined) {
          const cb = getFileContentCallback();
          if (cb) {
            cb({ worktreeId, path, content });
          }
        }
      }
      break;
    }

    case 'agent_event': {
      if (!isAgentEvent(message)) return;

      const payload = message.payload as Record<string, unknown> | null;
      if (!payload) return;

      // Payload is the raw struct, NOT wrapped in { originalType, data }
      const data = (payload.data as Record<string, unknown> | undefined) ?? payload;

      if (data.id !== undefined && data.status !== undefined) {
        // AgentStatusUpdate
        const id = (data as any)?.id as string | undefined;
        if (!id) break;

        // Check if payload carries acpSessionId — if so, link to existing session
        // to avoid creating duplicates when multiple tabs point to the same thread.
        const incomingAcpSessionId = (data as any)?.acpSessionId as string | undefined;
        if (incomingAcpSessionId) {
          const existingByAcp = useStore.getState().agentSessions.find(
            (as) => as.acpSessionId === incomingAcpSessionId
          );
          if (existingByAcp) {
            useStore.getState().updateAgentSession(existingByAcp.id, {
              status: (data as any)?.status,
            } as any);
            break;
          }
        }

        const existingSession = useStore.getState().agentSessions.find(as => as.id === id);
        if (existingSession) {
          useStore.getState().updateAgentSession(id, {
            status: (data as any)?.status,
          } as any);
        } else {
          useStore.getState().addAgentSession({
            id,
            worktreeId: (data as any)?.worktreeId,
            agentType: (data as any)?.agentType,
            status: (data as any)?.status,
            acpSessionId: incomingAcpSessionId,
            startedAt: (data as any)?.startedAt,
          } as any);
        }
      } else if (data.id !== undefined && data.status === undefined) {
        // AgentRemoved
        const id = (data as any)?.id as string | undefined;
        if (id) {
          useStore.getState().removeAgentSession(id);
        }
      } else if (data.sessionId !== undefined) {
        // AgentUpdated
        const sessionId = (data as any)?.sessionId as string | undefined;
        if (sessionId) {
          useStore.getState().updateAgentSession(sessionId, {
            ...((data as any)?.label !== undefined && { label: (data as any)?.label }),
            ...((data as any)?.position !== undefined && { position: (data as any)?.position }),
          });
        }
      }
      break;
    }

    case 'terminal_event': {
      if (!isTerminalEvent(message)) return;

      const payload = message.payload as Record<string, unknown> | null;
      if (!payload) return;

      // Use payload.type for explicit dispatch instead of fragile field-presence heuristics
      const innerType = payload.type as string | undefined;
      // Payload data may be wrapped in { type, data } or be the raw struct directly
      const data = (payload.data as Record<string, unknown> | undefined) ?? payload;

      // DEBUG: Log all terminal_event payloads in store handler
      console.log(
        '[Store] terminal_event handler:',
        'innerType:', innerType ?? 'MISSING',
        'has data.payload:', !!payload.data,
        'data keys:', Object.keys(data).slice(0, 8).join(', '),
        'sessionId:', (data as any)?.sessionId ?? 'n/a',
        'tabId:', (data as any)?.tabId ?? 'n/a'
      );

      if (!innerType) {
        // Fallback: field-presence heuristic for backwards compatibility
        // Maps old TerminalCreated/Removed/Updated to new tab actions
        if (data.tabId !== undefined && data.worktreeId !== undefined) {
          // New-style terminal tab event
          const tabId = (data as any)?.tabId as string | undefined;
          const worktreeId = (data as any)?.worktreeId as string | undefined;
          const label = (data as any)?.label as string | undefined;
          const position = (data as any)?.position as number | undefined;
          const sessionId = (data as any)?.sessionId as string | null | undefined;
          const status = (data as any)?.status as 'active' | 'disconnected' | undefined;
          if (tabId && worktreeId) {
            const { addTerminalTab } = useStore.getState();
            addTerminalTab({
              id: tabId,
              worktreeId,
              label: label ?? 'Terminal',
              position: position ?? 0,
              activeSessionId: sessionId ?? null,
              status: status ?? 'active',
              createdAt: Date.now(),
            });
          }
        } else if (data.sessionId !== undefined && data.worktreeId !== undefined && (data as any)?.shell !== undefined) {
          // Backward compat: old TerminalCreated shape
          const sessionId = (data as any)?.sessionId as string | undefined;
          const worktreeId = (data as any)?.worktreeId as string | undefined;
          const label = (data as any)?.label as string | null | undefined;
          if (sessionId && worktreeId) {
            useStore.getState().addTerminalTab({
              id: `legacy-${sessionId}`,
              worktreeId,
              label: (label as string) ?? 'Terminal',
              position: 0,
              activeSessionId: sessionId,
              status: 'active',
              createdAt: Date.now(),
            });
          }
        } else if (typeof data.sessionId === 'string' && typeof data.data === 'string') {
          // TerminalOutput: has sessionId (string) + data (string)
          // No store mutation — delivered via onMessage('TerminalOutput')
          // Already handled by yws-transport.ts dispatchOnMessageHandlers fallback
        } else if (typeof data.tabId === 'string' && typeof data.data === 'string') {
          // TerminalTabHistory: has tabId (string) + data (string)
          // No store mutation — delivered via onMessage('TerminalTabHistory')
          // Already handled by yws-transport.ts dispatchOnMessageHandlers fallback
        } else if (data.sessionId !== undefined && data.worktreeId === undefined && (data as any)?.shell === undefined && data.data === undefined) {
          const sessionId = (data as any)?.sessionId as string | undefined;
          if (sessionId) {
            if (data.label !== undefined || data.position !== undefined) {
              // Backward compat: old TerminalUpdated — find tab by sessionId and update
              const state = useStore.getState();
              const tab = state.terminalTabs.find(
                (tt) => tt.activeSessionId === sessionId || tt.id === `legacy-${sessionId}`
              );
              if (tab) {
                useStore.getState().updateTerminalTab(tab.id, {
                  ...((data as any)?.label !== undefined && { label: (data as any)?.label ?? undefined }),
                  ...((data as any)?.position !== undefined && { position: (data as any)?.position ?? undefined }),
                });
              }
            } else {
              // Backward compat: old TerminalRemoved
              const state = useStore.getState();
              const tab = state.terminalTabs.find(
                (tt) => tt.activeSessionId === sessionId || tt.id === `legacy-${sessionId}`
              );
              if (tab) {
                useStore.getState().removeTerminalTab(tab.id);
              }
            }
          }
        } else {
          console.warn('[Bridge] terminal_event: unrecognized payload shape:', JSON.stringify(data));
        }
        break;
      }

      switch (innerType) {
        // --- New tab-based events ---
        case 'TerminalMounted': {
          const tabId = (data as any)?.tabId as string | undefined;
          const worktreeId = (data as any)?.worktreeId as string | undefined;
          const sessionId = (data as any)?.sessionId as string | undefined;
          const label = (data as any)?.label as string | undefined;
          const position = (data as any)?.position as number | undefined;
          if (tabId && worktreeId) {
            const { addTerminalTab, setTabSession } = useStore.getState();
            const existing = useStore.getState().terminalTabs.find(tt => tt.id === tabId);
            if (existing) {
              // Tab already exists (e.g., restored by GetWorktreeDetails), just update session
              if (sessionId) {
                setTabSession(tabId, sessionId);
              }
            } else {
              // Create tab atomically with activeSessionId set
              addTerminalTab({
                id: tabId,
                worktreeId,
                label: label ?? 'Terminal',
                position: position ?? 0,
                activeSessionId: sessionId ?? null,
                status: 'active',
                createdAt: Date.now(),
              });
            }
          }
          break;
        }
        case 'TerminalSessionEnded': {
          const tabId = (data as any)?.tabId as string | undefined;
          if (tabId) {
            useStore.getState().clearTabSession(tabId);
          }
          break;
        }
        case 'TerminalTabClosed': {
          const tabId = (data as any)?.tabId as string | undefined;
          if (tabId) {
            useStore.getState().removeTerminalTab(tabId);
          }
          break;
        }
        case 'TerminalTabList': {
          // Bulk sync tabs for a worktreeId — replace all tabs for that worktree
          const worktreeId = (data as any)?.worktreeId as string | undefined;
          const tabs = (data as any)?.tabs as Array<any> | undefined;
          if (worktreeId && tabs) {
            const state = useStore.getState();
            // Remove existing tabs for this worktreeId, then add new ones
            const existingIds = new Set(
              state.terminalTabs
                .filter((tt) => tt.worktreeId === worktreeId)
                .map((tt) => tt.id)
            );
            // Remove old tabs
            existingIds.forEach((id) => {
              useStore.getState().removeTerminalTab(id);
            });
            // Add new tabs
            tabs.forEach((tab) => {
              useStore.getState().addTerminalTab(tab);
            });
          }
          break;
        }
        case 'TerminalTabHistory': {
          // No store mutation — delivered via onMessage('TerminalTabHistory')
          break;
        }
        case 'TerminalOutput': {
          // No store mutation — delivered via onMessage('TerminalOutput')
          break;
        }

        // --- Backward compat: old session-based events ---
        case 'TerminalCreated': {
          const sessionId = (data as any)?.sessionId as string | undefined;
          const worktreeId = (data as any)?.worktreeId as string | undefined;
          const label = (data as any)?.label as string | null | undefined;
          if (sessionId && worktreeId) {
            // Guard: skip if tab already exists (TerminalMounted may have already added it)
            const existing = useStore.getState().terminalTabs.find(
              (tt) => tt.activeSessionId === sessionId || tt.id === `legacy-${sessionId}`
            );
            if (existing) break;
            useStore.getState().addTerminalTab({
              id: `legacy-${sessionId}`,
              worktreeId,
              label: (label as string) ?? 'Terminal',
              position: 0,
              activeSessionId: sessionId,
              status: 'active',
              createdAt: Date.now(),
            });
          }
          break;
        }
        case 'TerminalRemoved': {
          const sessionId = (data as any)?.sessionId as string | undefined;
          if (sessionId) {
            const state = useStore.getState();
            const tab = state.terminalTabs.find(
              (tt) => tt.activeSessionId === sessionId || tt.id === `legacy-${sessionId}`
            );
            if (tab) {
              useStore.getState().removeTerminalTab(tab.id);
            }
          }
          break;
        }
        case 'TerminalUpdated': {
          const sessionId = (data as any)?.sessionId as string | undefined;
          if (sessionId) {
            const state = useStore.getState();
            const tab = state.terminalTabs.find(
              (tt) => tt.activeSessionId === sessionId || tt.id === `legacy-${sessionId}`
            );
            if (tab) {
              useStore.getState().updateTerminalTab(tab.id, {
                ...((data as any)?.label !== undefined && { label: (data as any)?.label ?? undefined }),
                ...((data as any)?.position !== undefined && { position: (data as any)?.position ?? undefined }),
              });
            }
          }
          break;
        }
        default: {
          console.warn('[Bridge] terminal_event: unrecognized innerType:', innerType);
        }
      }
      break;
    }

    // State snapshot response to GetState request. Carries the full
    // application state snapshot as structured JSON.
    // Payload format: { type: "StateSnapshot", data: { workspaces, worktrees, ... } }
    case 'state_snapshot': {
      if (!isStateSnapshotMessage(message)) return;

      const payload = message.payload as Record<string, unknown> | null;
      if (!payload) return;

      // Extract data from the wrapped payload { type, data }
      const data = (payload.data as Record<string, unknown> | undefined)
        ?? (payload.workspaces !== undefined ? payload : undefined);
      if (!data) {
        return;
      }

      const { stateFromSnapshot } = useStore.getState();
      stateFromSnapshot({
        workspaces: (data.workspaces as unknown) as any[],
        worktrees: (data.worktrees as unknown) as any[],
        agentSessions: (data.agentSessions as unknown) as any[],
        terminalTabs: (data.terminalTabs as unknown) as any[] ?? (data as any).terminalSessions ?? [],
      });
      break;
    }

    // Additional BridgeMessage types can be handled here as needed.

    case 'ping': {
      if (!isPingMessage(message)) return;
      const payload = message.payload as Record<string, unknown> | null;
      const timestamp = (payload?.timestamp as number) ?? Date.now();
      if (sendFn) {
        sendFn(encodePong({ timestamp }));
      }
      break;
    }

    case 'pong': {
      if (!isPongMessage(message)) return;
      useStore.getState().setLastPongTimestamp(Date.now());
      break;
    }

    case 'ack': {
      if (!isAckMessage(message)) return;
      // Acknowledgment for rename/reorder ops — no state update needed,
      // but handled here to complete the migration from legacy path.
      break;
    }

    case 'acp_payload': {
      if (!isAcpPayload(message)) return;

      const payload = message.payload as Record<string, unknown> | null;
      if (!payload) return;

      const { activeWorktreeId } = useStore.getState();
      const data = (payload.data as Record<string, unknown>) ?? {};
      const worktreeId = (data as any)?.worktreeId ?? activeWorktreeId;
      if (worktreeId) {
        // Dispatch to accumulator if this looks like an AcpEventEnvelope
        if (payload.eventType && typeof payload.sequence === 'number') {
          // threadId: currently worktreeId as fallback; will be updated to agentTabId/acpSessionId in Task 5
          const threadId = (data as any)?.agentTabId ?? worktreeId;
          useStore.getState().dispatchAccumulator({
            type: 'EVENT_RECEIVED',
            envelope: payload as unknown as AcpEventEnvelope,
            threadId,
          });
        }
        // Also route through acpSessionManager for backward compat
        acpSessionManager.handleAcpPayload(worktreeId, payload);
      }
      break;
    }

    default:
      break;
  }
}

import { persist } from 'zustand/middleware';
import { ToastVariant } from './components/ui/Toast';

export interface Notification {
  id: string;
  variant: ToastVariant;
  title: string;
  description?: string;
  duration?: number;
}

interface ToastStore {
  notifications: Notification[];
  addNotification: (notification: Omit<Notification, 'id'>) => void;
  removeNotification: (id: string) => void;
  _idCounter: number;
}

let idCounter = 0;

export const useToastStore = create<ToastStore>()(
  persist(
    (set) => ({
      notifications: [],
      _idCounter: 0,
      addNotification: (notification) =>
        set((state) => {
          const newId = `toast-${idCounter++}`;
          return {
            notifications: [...state.notifications, { ...notification, id: newId }],
            _idCounter: idCounter,
          };
        }),
      removeNotification: (id) =>
        set((state) => ({
          notifications: state.notifications.filter((n) => n.id !== id),
        })),
    }),
    { name: 'toast-storage' }
  )
);
