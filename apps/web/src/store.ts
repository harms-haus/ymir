import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { AppState, NotificationState, AgentTab, AlertDialogConfig, AgentSessionState, TerminalSessionState, AcpAccumulatorState, AcpAccumulatorAction, AccumulatedThread, AccumulatedTextContent, AccumulatedToolCard, AccumulatedContextCard, AccumulatedErrorCard, MAX_TOOL_OUTPUT_LENGTH, MAX_ACCUMULATED_MESSAGES, createInitialAccumulatorState, ThreadAccumulatedState } from './types/state';
export type { AgentTab };
import { ServerMessage, TerminalOutput, isAcpSessionInit, isAcpSessionStatus, isAcpPromptChunk, isAcpPromptComplete, isAcpToolUse, isAcpContextUpdate, isAcpError, isAcpResumeMarker } from './types/generated/protocol';
import { handleError } from './lib/error-recovery';
import { showNotification } from './lib/tauri';

// Stable empty array reference to prevent infinite re-renders
const EMPTY_AGENT_TABS: AgentTab[] = [];
const EMPTY_TERMINAL_SESSIONS: TerminalSessionState[] = [];
const EMPTY_AGENT_SESSIONS: AgentSessionState[] = [];

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
//
// Pure reducer function for ACP event accumulation.
// Connection-scoped: state is flushed on reconnect.
// Derived state: NOT the source of truth for worktree/session identity.

function generateMessageId(sequence: number): string {
  return `msg-${sequence}`;
}

function createEmptyThread(worktreeId: string, acpSessionId: string, connectionGeneration: number): AccumulatedThread {
  return {
    worktreeId,
    acpSessionId,
    messages: [],
    sessionStatus: 'Working',
    lastSequence: 0,
    connectionGeneration,
    isStreaming: false,
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
      newThreads.delete(action.worktreeId);
      return {
        ...state,
        threads: newThreads,
      };
    }

    case 'REBUILD_FROM_SNAPSHOT': {
      const thread = createEmptyThread(action.worktreeId, action.acpSessionId, state.connectionGeneration);
      const newThreads = new Map(state.threads);
      newThreads.set(action.worktreeId, thread);
      return {
        ...state,
        threads: newThreads,
      };
    }

    case 'SET_STREAMING': {
      const thread = state.threads.get(action.worktreeId);
      if (!thread) return state;
      
      const newThreads = new Map(state.threads);
      newThreads.set(action.worktreeId, {
        ...thread,
        isStreaming: action.isStreaming,
      });
      return {
        ...state,
        threads: newThreads,
      };
    }

    case 'EVENT_RECEIVED': {
      const { envelope, worktreeId } = action;
      const eventType = envelope.eventType;
      const data = envelope.data;
      const sequence = envelope.sequence;

      let thread = state.threads.get(worktreeId);

      if (isAcpSessionInit({ eventType, data } as any)) {
        const sessionData = data as any;
        if (!thread) {
          thread = createEmptyThread(worktreeId, sessionData.acpSessionId, state.connectionGeneration);
        }
        const newThreads = new Map(state.threads);
        newThreads.set(worktreeId, { ...thread, acpSessionId: sessionData.acpSessionId });
        return { ...state, threads: newThreads };
      }

      if (!thread) return state;

      const newThreads = new Map(state.threads);
      let updatedThread = { ...thread };
      let changed = false;

      if (isAcpSessionStatus({ eventType, data } as any)) {
        const statusData = data as any;
        updatedThread.sessionStatus = statusData.status;
        changed = true;
      }

      else if (isAcpPromptChunk({ eventType, data } as any)) {
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
          let textPart = lastMessage.parts.find((p): p is AccumulatedTextContent => 
            p.type === 'text'
          ) as AccumulatedTextContent | undefined;

          if (textPart) {
            const newParts = lastMessage.parts.map(p => 
              p.type === 'text' 
                ? { ...p, text: p.text + contentData, isStreaming: !chunkData.isFinal }
                : p
            );
            updatedThread.messages = updatedThread.messages.map((m, i) =>
              i === updatedThread.messages.length - 1
                ? { ...m, parts: newParts, lastSequence: sequence }
                : m
            );
          } else {
            const newTextPart: AccumulatedTextContent = {
              type: 'text',
              text: contentData,
              isStreaming: !chunkData.isFinal,
            };
            const newParts = [...lastMessage.parts, newTextPart];
            updatedThread.messages = updatedThread.messages.map((m, i) =>
              i === updatedThread.messages.length - 1
                ? { ...m, parts: newParts, lastSequence: sequence }
                : m
            );
          }
        } else if (isStructured) {
          const newStructuredPart = {
            type: 'structured' as const,
            data: contentData,
            isStreaming: !chunkData.isFinal,
          };
          const newParts = [...lastMessage.parts, newStructuredPart];
          updatedThread.messages = updatedThread.messages.map((m, i) =>
            i === updatedThread.messages.length - 1
              ? { ...m, parts: newParts, lastSequence: sequence }
              : m
          );
        }
        changed = true;
      }

      else if (isAcpPromptComplete({ eventType, data } as any)) {
        const completeData = data as any;
        updatedThread.isStreaming = false;
        if (completeData.reason === 'Error') {
          updatedThread.sessionStatus = 'Complete';
        }
        changed = true;
      }

      else if (isAcpToolUse({ eventType, data } as any)) {
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
      }

      else if (isAcpContextUpdate({ eventType, data } as any)) {
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
            ? { ...m, parts: [...m.parts, contextCard], lastSequence: sequence }
            : m
        );
        changed = true;
      }

      else if (isAcpError({ eventType, data } as any)) {
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
              ? { ...m, parts: [...m.parts, errorCard], lastSequence: sequence }
              : m
          );
        }
        changed = true;
      }

      else if (isAcpResumeMarker({ eventType, data } as any)) {
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

      newThreads.set(worktreeId, updatedThread);
      return { ...state, threads: newThreads };
    }

    default:
      return state;
  }
}

export const useStore = create<AppState>()(
  devtools(
    (set, get) => ({
      // Data slices
      workspaces: [],
      worktrees: [],
      agentSessions: [],
      terminalSessions: [],
      notifications: [],
      
  // UI state
    activeWorktreeId: null,
    connectionStatus: 'closed',
    connectionError: null,
    expandedWorkspaceIds: new Set<string>(),

  // Agent pane tabs (per worktree)
  agentTabs: new Map(),
  activeAgentTabId: new Map(),

  // ACP Event Accumulator (connection-scoped, derived state)
  acpAccumulator: createInitialAccumulatorState(),

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

  alertDialog: null,

  setWorkspaces: (workspaces) => set({ workspaces }),
      
      setWorktrees: (worktrees) => set({ worktrees }),
      
      setAgentSessions: (agentSessions) => set({ agentSessions }),
      
      setTerminalSessions: (terminalSessions) => set({ terminalSessions }),
      
      setActiveWorktree: (activeWorktreeId) => set({ activeWorktreeId }),
      
      setConnectionStatus: (connectionStatus) => set({ connectionStatus }),
      
      setConnectionError: (connectionError) => set({ connectionError }),

      toggleWorkspaceExpanded: (workspaceId: string) =>
        set((state) => {
          const expandedIds = new Set(state.expandedWorkspaceIds)
          if (expandedIds.has(workspaceId)) {
            expandedIds.delete(workspaceId)
          } else {
            expandedIds.add(workspaceId)
          }
          return { expandedWorkspaceIds: expandedIds }
        }),

      // State management from server snapshot
      stateFromSnapshot: (snapshot) => {
        set((state) => ({
          workspaces: snapshot.workspaces,
          worktrees: snapshot.worktrees,
          agentSessions: snapshot.agentSessions,
          terminalSessions: snapshot.terminalSessions,
          acpAccumulator: acpAccumulatorReducer(state.acpAccumulator, { type: 'CONNECTION_RECONNECTED' }),
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
            terminalSessions: state.terminalSessions.filter(
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

      removeWorktree: (worktreeId) =>
        set((state) => ({
          worktrees: state.worktrees.filter((wt) => wt.id !== worktreeId),
          agentSessions: state.agentSessions.filter((as) => as.worktreeId !== worktreeId),
          terminalSessions: state.terminalSessions.filter((ts) => ts.worktreeId !== worktreeId),
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

// Terminal session CRUD
    addTerminalSession: (session) =>
        set((state) => ({
            terminalSessions: [...state.terminalSessions, session],
        })),

    updateTerminalSession: (sessionId, updates) =>
        set((state) => ({
            terminalSessions: state.terminalSessions.map((ts) =>
                ts.id === sessionId ? { ...ts, ...updates } : ts
            ),
        })),

    removeTerminalSession: (sessionId) =>
        set((state) => ({
            terminalSessions: state.terminalSessions.filter((ts) => ts.id !== sessionId),
        })),

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

  setActiveAgentTab: (worktreeId, tabId) =>
    set((state) => {
      const newActiveTabId = new Map(state.activeAgentTabId);
      newActiveTabId.set(worktreeId, tabId);
      return { activeAgentTabId: newActiveTabId };
    }),

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

  showAlertDialog: (config: AlertDialogConfig) =>
    set({
      alertDialog: { ...config, open: true, variant: config.variant ?? 'default' },
    }),

  hideAlertDialog: () =>
    set((state) => ({
      alertDialog: state.alertDialog ? { ...state.alertDialog, open: false } : null,
    })),

  dispatchAccumulator: (action: AcpAccumulatorAction) =>
    set((state) => ({
      acpAccumulator: acpAccumulatorReducer(state.acpAccumulator, action),
    })),

  flushAccumulator: () =>
    set((state) => ({
      acpAccumulator: acpAccumulatorReducer(state.acpAccumulator, { type: 'FLUSH_ALL' }),
    })),

  flushAccumulatorThread: (worktreeId: string) =>
    set((state) => ({
      acpAccumulator: acpAccumulatorReducer(state.acpAccumulator, { type: 'FLUSH_THREAD', worktreeId }),
    })),
  }),
  { name: 'ymir-app-store' }
  )
);

// Selectors for derived state
export const selectWorkspaceById = (workspaceId: string) => (state: AppState) =>
  state.workspaces.find((w) => w.id === workspaceId);

export const selectWorktreeById = (worktreeId: string) => (state: AppState) =>
  state.worktrees.find((wt) => wt.id === worktreeId);

export const selectWorktreesByWorkspaceId = (workspaceId: string) => (state: AppState) =>
  state.worktrees.filter((wt) => wt.workspaceId === workspaceId);

export const selectAgentSessionById = (sessionId: string) => (state: AppState) =>
  state.agentSessions.find((as) => as.id === sessionId);

export const selectAgentSessionsByWorktreeId = (worktreeId: string) => (state: AppState) => {
  const sessions = state.agentSessions.filter((as) => as.worktreeId === worktreeId);
  return sessions.length > 0 ? sessions : EMPTY_AGENT_SESSIONS;
};

export const selectTerminalSessionsByWorktreeId = (worktreeId: string) => (state: AppState) => {
  const sessions = state.terminalSessions.filter((ts) => ts.worktreeId === worktreeId);
  return sessions.length > 0 ? sessions : EMPTY_TERMINAL_SESSIONS;
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

export const selectDbResetDialog = (state: AppState) => state.dbResetDialog;

export const selectDbResetDialogOpen = (state: AppState) => state.dbResetDialog.isOpen;

export const selectAlertDialog = (state: AppState) => state.alertDialog;

// ACP Accumulator selectors
export const selectAccumulatorThread = (worktreeId: string) => (state: AppState): ThreadAccumulatedState => {
  const thread = state.acpAccumulator.threads.get(worktreeId) ?? null;
  return {
    thread,
    messageCount: thread?.messages.length ?? 0,
    isStreaming: thread?.isStreaming ?? false,
    sessionStatus: thread?.sessionStatus ?? 'Working',
    hasErrors: thread?.messages.some(m => m.parts.some(p => p.type === 'error')) ?? false,
  };
};

export const selectAccumulatorConnectionGeneration = (state: AppState) => 
  state.acpAccumulator.connectionGeneration;

export function updateStateFromServerMessage(message: ServerMessage): void {
  const { addWorkspace, updateWorkspace, removeWorkspace, addWorktree, updateWorktree, removeWorktree } = useStore.getState();
  const { updateAgentSession, addTerminalSession, removeTerminalSession, addNotification } = useStore.getState();

  switch (message.type) {
    case 'WorkspaceCreated':
      addWorkspace(message.workspace);
      break;
    
    case 'WorkspaceUpdated':
      updateWorkspace(message.workspace.id, message.workspace);
      break;
    
    case 'WorkspaceDeleted':
      removeWorkspace(message.workspaceId);
      break;
    
    case 'WorktreeCreated':
      addWorktree(message.worktree);
      break;
    
    case 'WorktreeStatus':
      updateWorktree(message.worktree.id, message.worktree);
      break;
    
    case 'WorktreeDeleted':
      removeWorktree(message.worktreeId);
      break;
    
    case 'AgentStatusUpdate': {
      const existingSession = useStore.getState().agentSessions.find(as => as.id === message.id);
      if (existingSession) {
        updateAgentSession(message.id, {
          status: message.status,
        } as any);
      } else {
        const addAgentSession = useStore.getState().addAgentSession;
        addAgentSession({
          id: message.id,
          worktreeId: message.worktreeId,
          agentType: message.agentType,
          status: message.status,
          acpSessionId: undefined,
          startedAt: message.startedAt,
        } as any);
      }
      break;
    }
    
    case 'AgentOutput':
      // Agent output is handled separately (not stored in main state)
      break;
    
    case 'AgentRemoved': {
      const removeAgentSession = useStore.getState().removeAgentSession;
      removeAgentSession(message.id);
      break;
    }
    
    case 'TerminalCreated':
      addTerminalSession({
        id: message.sessionId,
        worktreeId: message.worktreeId,
        label: message.label ?? 'Terminal',
        shell: message.shell,
        createdAt: Date.now(),
      });
      break;
    
    case 'TerminalOutput':
      // Terminal output is routed to TerminalProvider via callback
      if (terminalOutputCallback) {
        terminalOutputCallback(message);
      }
      break;

case 'TerminalRemoved':
            removeTerminalSession(message.sessionId);
            break;

        case 'TerminalUpdated': {
            const { updateTerminalSession } = useStore.getState();
            updateTerminalSession(message.sessionId, {
                label: message.label,
                ...(message.position !== undefined && { position: message.position }),
            });
            break;
        }

        case 'AgentUpdated': {
            const { updateAgentSession } = useStore.getState();
            updateAgentSession(message.sessionId, {
                ...(message.label !== undefined && { label: message.label }),
                ...(message.position !== undefined && { position: message.position }),
            });
            break;
        }

        case 'Notification':
      addNotification({
        level: message.level,
        message: message.message,
        duration: 5000,
      } as any);
      showNotification(message.title, message.message);
      break;

    case 'Error':
      handleError(message);
      break;

    case 'AcpWireEvent': {
      const { dispatchAccumulator, activeWorktreeId } = useStore.getState();
      const envelope = message.envelope;
      const data = envelope.data as any;
      
      // Most ACP events have worktreeId in data; SessionInit falls back to active worktree
      const worktreeId = data?.worktreeId ?? activeWorktreeId;
      
      if (worktreeId) {
        dispatchAccumulator({ type: 'EVENT_RECEIVED', envelope, worktreeId });
      }
      break;
    }
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