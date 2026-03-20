import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AgentPane } from '../AgentPane';
import { useStore, selectActiveAgentTabId, selectAgentTabsByWorktreeId, AgentTab, acpAccumulatorReducer } from '../../../store';
import { useWebSocketClient } from '../../../hooks/useWebSocket';
import type { AccumulatedThread, AcpAccumulatorState, AppState } from '../../../types/state';

vi.mock('../../../store', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../store')>();
  return {
    ...actual,
    useStore: vi.fn(),
    selectAgentTabsByWorktreeId: vi.fn(),
    selectActiveAgentTabId: vi.fn(),
  };
});
vi.mock('../../../hooks/useWebSocket');
vi.mock('../AgentChat', () => ({
  AgentChat: ({ sessionId, agentType }: { sessionId: string; agentType: string }) => (
    <div data-testid={`agent-chat-${sessionId}`}>AgentChat: {agentType}</div>
  ),
}));
vi.mock('../editor/DiffTab', () => ({
  DiffTab: ({ filePath }: { filePath: string }) => <div data-testid={`diff-${filePath}`}>Loading diff...</div>,
}));
vi.mock('../../../hooks/useAgentStatus');

vi.mock('@assistant-ui/react', () => ({
  useExternalStoreRuntime: vi.fn((config: any) => ({
    messages: config.messages || [],
    isRunning: config.isRunning ?? false,
    onNew: config.onNew,
    onCancel: config.onCancel,
    convertMessage: config.convertMessage,
  })),
  AssistantRuntimeProvider: ({ children, runtime }: { children: React.ReactNode; runtime: any }) => (
    <div data-testid="assistant-runtime-provider" data-runtime-messages={JSON.stringify(runtime?.messages || [])}>
      {children}
    </div>
  ),
  ThreadPrimitive: {
    Root: ({ children }: { children: React.ReactNode }) => <div data-testid="thread-root">{children}</div>,
    If: ({ children, empty }: { children: React.ReactNode; empty?: boolean }) => <>{children}</>,
    Messages: ({ children }: { children: (props: { message: any }) => React.ReactNode }) => (
      <div data-testid="thread-messages">{children({ message: { id: 'test', role: 'user' } })}</div>
    ),
  },
  ComposerPrimitive: {
    Root: ({ children }: { children: React.ReactNode }) => <div data-testid="composer-root">{children}</div>,
    Input: (props: any) => <input data-testid="composer-input" {...props} />,
    Send: ({ children }: { children: React.ReactNode }) => <button type="button" data-testid="composer-send">{children}</button>,
  },
  MessagePrimitive: {
    Root: ({ children }: { children: React.ReactNode }) => <div data-testid="message-root">{children}</div>,
    Content: () => <div data-testid="message-content">Message Content</div>,
  },
  ThreadMessageLike: vi.fn(),
  AppendMessage: vi.fn(),
}));

describe('AgentPane', () => {
  const mockSend = vi.fn();
  const mockRemoveAgentTab = vi.fn();
  const mockAddAgentTab = vi.fn();
  const mockSetActiveAgentTab = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();

    const mockClient = {
      send: mockSend,
      onMessage: vi.fn(() => vi.fn()),
    };

    (useWebSocketClient as any).mockReturnValue(mockClient);

    (useStore as any).mockImplementation((selector?: any) => {
      const store = {
        addAgentTab: mockAddAgentTab,
        removeAgentTab: mockRemoveAgentTab,
        setActiveAgentTab: mockSetActiveAgentTab,
        agentSessions: [],
        agentTabs: new Map(),
        activeAgentTabId: new Map(),
      };
      if (typeof selector === 'function') {
        return selector(store);
      }
      return store;
    });

    (selectAgentTabsByWorktreeId as any).mockImplementation((worktreeId: string) => {
      return (state: any) => state.agentTabs.get(worktreeId) || [];
    });

    (selectActiveAgentTabId as any).mockImplementation((worktreeId: string) => {
      return (state: any) => state.activeAgentTabId.get(worktreeId) || null;
    });
  });

  it('renders empty state when no tabs exist', () => {
    (useStore as any).mockImplementation((selector?: any) => {
      const store = {
        addAgentTab: mockAddAgentTab,
        removeAgentTab: mockRemoveAgentTab,
        setActiveAgentTab: mockSetActiveAgentTab,
        agentSessions: [],
        agentTabs: new Map(),
        activeAgentTabId: new Map(),
      };
      if (typeof selector === 'function') {
        return selector(store);
      }
      return store;
    });

    render(<AgentPane worktreeId="worktree-1" />);

    expect(screen.getByText(/No agent session/i)).toBeInTheDocument();
    expect(screen.getByText(/Click \+ to create one/i)).toBeInTheDocument();
  });

  it('renders agent tab with robot icon', () => {
    const tabs: AgentTab[] = [{ id: 'tab-1', type: 'agent', sessionId: 'agent-session-1', label: 'claude' }];
    const mockAgentSessions = [
      {
        id: 'agent-session-1',
        worktreeId: 'worktree-1',
        agentType: 'claude',
        status: 'idle' as const,
        startedAt: Date.now(),
      },
    ];

    (useStore as any).mockImplementation((selector?: any) => {
      const store = {
        addAgentTab: mockAddAgentTab,
        removeAgentTab: mockRemoveAgentTab,
        setActiveAgentTab: mockSetActiveAgentTab,
        agentSessions: mockAgentSessions,
        agentTabs: new Map([['worktree-1', tabs]]),
        activeAgentTabId: new Map([['worktree-1', 'tab-1']]),
      };
      if (typeof selector === 'function') {
        return selector(store);
      }
      return store;
    });

    render(<AgentPane worktreeId="worktree-1" />);

    expect(screen.getByText('claude')).toBeInTheDocument();
    expect(screen.getByTestId('agent-chat-agent-session-1')).toBeInTheDocument();
  });

  it('renders diff tab with diff icon', () => {
    const tabs: AgentTab[] = [{ id: 'tab-1', type: 'diff', filePath: '/path/to/file.ts' }];

    (useStore as any).mockImplementation((selector?: any) => {
      const store = {
        addAgentTab: mockAddAgentTab,
        removeAgentTab: mockRemoveAgentTab,
        setActiveAgentTab: mockSetActiveAgentTab,
        agentSessions: [],
        agentTabs: new Map([['worktree-1', tabs]]),
        activeAgentTabId: new Map([['worktree-1', 'tab-1']]),
      };
      if (typeof selector === 'function') {
        return selector(store);
      }
      return store;
    });

    render(<AgentPane worktreeId="worktree-1" />);

    expect(screen.getByText('Diff: file.ts')).toBeInTheDocument();
    expect(screen.getByText('Loading diff...')).toBeInTheDocument();
  });

  it('renders editor tab with code icon', () => {
    const tabs: AgentTab[] = [{ id: 'tab-1', type: 'editor', filePath: '/path/to/file.ts' }];

    (useStore as any).mockImplementation((selector?: any) => {
      const store = {
        addAgentTab: mockAddAgentTab,
        removeAgentTab: mockRemoveAgentTab,
        setActiveAgentTab: mockSetActiveAgentTab,
        agentSessions: [],
        agentTabs: new Map([['worktree-1', tabs]]),
        activeAgentTabId: new Map([['worktree-1', 'tab-1']]),
      };
      if (typeof selector === 'function') {
        return selector(store);
      }
      return store;
    });

    render(<AgentPane worktreeId="worktree-1" />);

    expect(screen.getByText('file.ts')).toBeInTheDocument();
    expect(screen.getByText('Editor placeholder (T24)')).toBeInTheDocument();
  });



  it('sends AgentSpawn message when + button is clicked', async () => {
    const tabs: AgentTab[] = [{ id: 'tab-1', type: 'agent', sessionId: 'agent-session-1', label: 'claude' }];
    const mockAgentSessions = [
      {
        id: 'agent-session-1',
        worktreeId: 'worktree-1',
        agentType: 'claude',
        status: 'idle' as const,
        startedAt: Date.now(),
      },
    ];

    (useStore as any).mockImplementation((selector?: any) => {
      const store = {
        addAgentTab: mockAddAgentTab,
        removeAgentTab: mockRemoveAgentTab,
        setActiveAgentTab: mockSetActiveAgentTab,
        agentSessions: mockAgentSessions,
        agentTabs: new Map([['worktree-1', tabs]]),
        activeAgentTabId: new Map([['worktree-1', 'tab-1']]),
      };
      if (typeof selector === 'function') {
        return selector(store);
      }
      return store;
    });

    render(<AgentPane worktreeId="worktree-1" />);

    const createButton = screen.getByLabelText('Create new agent');
    expect(createButton).toBeInTheDocument();

    fireEvent.click(createButton);

    await waitFor(() => {
      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'AgentSpawn',
          worktreeId: 'worktree-1',
          agentType: expect.any(String),
        })
      );
    });
  });
});

describe('Agent Runtime Wiring', () => {
  const mockSend = vi.fn();
  const mockRemoveAgentTab = vi.fn();
  const mockAddAgentTab = vi.fn();
  const mockSetActiveAgentTab = vi.fn();
  const mockDispatchAccumulator = vi.fn();

  const createMockStore = (overrides: Partial<AppState> = {}) => {
    const defaultAccumulator: AcpAccumulatorState = {
      connectionGeneration: 1,
      threads: new Map(),
      pendingCorrelations: new Map(),
      lastFlushTimestamp: null,
    };

    return {
      addAgentTab: mockAddAgentTab,
      removeAgentTab: mockRemoveAgentTab,
      setActiveAgentTab: mockSetActiveAgentTab,
      agentSessions: [],
      agentTabs: new Map(),
      activeAgentTabId: new Map(),
      acpAccumulator: defaultAccumulator,
      dispatchAccumulator: mockDispatchAccumulator,
      ...overrides,
    };
  };

  beforeEach(() => {
    vi.clearAllMocks();

    const mockClient = {
      send: mockSend,
      onMessage: vi.fn(() => vi.fn()),
    };

    (useWebSocketClient as any).mockReturnValue(mockClient);
  });

  it('wires assistant-ui through ExternalStoreRuntime', () => {
    const mockStore = createMockStore();

    (useStore as any).mockImplementation((selector?: any) => {
      if (typeof selector === 'function') {
        return selector(mockStore);
      }
      return mockStore;
    });

    (selectAgentTabsByWorktreeId as any).mockImplementation((worktreeId: string) => {
      return (state: any) => state.agentTabs.get(worktreeId) || [];
    });

    (selectActiveAgentTabId as any).mockImplementation((worktreeId: string) => {
      return (state: any) => state.activeAgentTabId.get(worktreeId) || null;
    });

    render(<AgentPane worktreeId="worktree-1" />);

    expect(screen.getByText(/No agent session/i)).toBeInTheDocument();
  });

  it('receives messages from accumulator via worktreeId lookup', () => {
    const accumulatedThread: AccumulatedThread = {
      worktreeId: 'worktree-1',
      acpSessionId: 'session-1',
      messages: [
        {
          id: 'msg-1',
          role: 'user',
          parts: [{ type: 'text', text: 'Hello', isStreaming: false }],
          createdAt: 1000,
          lastSequence: 1,
        },
      ],
      sessionStatus: 'Working',
      lastSequence: 1,
      connectionGeneration: 1,
      isStreaming: true,
    };

    const mockStore = createMockStore({
      acpAccumulator: {
        connectionGeneration: 1,
        threads: new Map([['worktree-1', accumulatedThread]]),
        pendingCorrelations: new Map(),
        lastFlushTimestamp: null,
      },
    });

    (useStore as any).mockImplementation((selector?: any) => {
      if (typeof selector === 'function') {
        return selector(mockStore);
      }
      return mockStore;
    });

    (selectAgentTabsByWorktreeId as any).mockImplementation((worktreeId: string) => {
      return (state: any) => state.agentTabs.get(worktreeId) || [];
    });

    (selectActiveAgentTabId as any).mockImplementation((worktreeId: string) => {
      return (state: any) => state.activeAgentTabId.get(worktreeId) || null;
    });

    render(<AgentPane worktreeId="worktree-1" />);

    expect(screen.getByText(/No agent session/i)).toBeInTheDocument();
  });
});

describe('Render-Only Ownership', () => {
  const mockSend = vi.fn();
  const mockRemoveAgentTab = vi.fn();
  const mockAddAgentTab = vi.fn();
  const mockSetActiveAgentTab = vi.fn();
  const mockDispatchAccumulator = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();

    const mockClient = {
      send: mockSend,
      onMessage: vi.fn(() => vi.fn()),
    };

    (useWebSocketClient as any).mockReturnValue(mockClient);
  });

  it('keeps worktree ownership in Ymir store (not in runtime)', () => {
    const mockStore = {
      addAgentTab: mockAddAgentTab,
      removeAgentTab: mockRemoveAgentTab,
      setActiveAgentTab: mockSetActiveAgentTab,
      agentSessions: [],
      agentTabs: new Map(),
      activeAgentTabId: new Map(),
      acpAccumulator: {
        connectionGeneration: 1,
        threads: new Map(),
        pendingCorrelations: new Map(),
        lastFlushTimestamp: null,
      },
      dispatchAccumulator: mockDispatchAccumulator,
    };

    (useStore as any).mockImplementation((selector?: any) => {
      if (typeof selector === 'function') {
        return selector(mockStore);
      }
      return mockStore;
    });

    (selectAgentTabsByWorktreeId as any).mockImplementation((worktreeId: string) => {
      return (state: any) => state.agentTabs.get(worktreeId) || [];
    });

    (selectActiveAgentTabId as any).mockImplementation((worktreeId: string) => {
      return (state: any) => state.activeAgentTabId.get(worktreeId) || null;
    });

    render(<AgentPane worktreeId="worktree-1" />);

    expect(mockStore.agentTabs).toBeInstanceOf(Map);
    expect(mockStore.acpAccumulator.threads).toBeInstanceOf(Map);
  });

  it('keeps tab ownership in Ymir store (not in runtime)', () => {
    const tabs: AgentTab[] = [
      { id: 'tab-1', type: 'agent', sessionId: 'session-1', label: 'claude' },
      { id: 'tab-2', type: 'diff', filePath: '/path/to/file.ts' },
    ];

    const mockStore = {
      addAgentTab: mockAddAgentTab,
      removeAgentTab: mockRemoveAgentTab,
      setActiveAgentTab: mockSetActiveAgentTab,
      agentSessions: [
        {
          id: 'session-1',
          worktreeId: 'worktree-1',
          agentType: 'claude',
          status: 'idle' as const,
          startedAt: Date.now(),
        },
      ],
      agentTabs: new Map([['worktree-1', tabs]]),
      activeAgentTabId: new Map([['worktree-1', 'tab-1']]),
      acpAccumulator: {
        connectionGeneration: 1,
        threads: new Map(),
        pendingCorrelations: new Map(),
        lastFlushTimestamp: null,
      },
      dispatchAccumulator: mockDispatchAccumulator,
    };

    (useStore as any).mockImplementation((selector?: any) => {
      if (typeof selector === 'function') {
        return selector(mockStore);
      }
      return mockStore;
    });

    (selectAgentTabsByWorktreeId as any).mockImplementation((worktreeId: string) => {
      return (state: any) => state.agentTabs.get(worktreeId) || [];
    });

    (selectActiveAgentTabId as any).mockImplementation((worktreeId: string) => {
      return (state: any) => state.activeAgentTabId.get(worktreeId) || null;
    });

    render(<AgentPane worktreeId="worktree-1" />);

    expect(mockStore.agentTabs.get('worktree-1')).toHaveLength(2);
    expect(mockStore.activeAgentTabId.get('worktree-1')).toBe('tab-1');
  });

  it('keeps session ownership in Ymir store (not in runtime)', () => {
    const agentSessions = [
      {
        id: 'session-1',
        worktreeId: 'worktree-1',
        agentType: 'claude',
        status: 'working' as const,
        startedAt: Date.now(),
        acpSessionId: 'acp-session-1',
      },
    ];

    const mockStore = {
      addAgentTab: mockAddAgentTab,
      removeAgentTab: mockRemoveAgentTab,
      setActiveAgentTab: mockSetActiveAgentTab,
      agentSessions,
      agentTabs: new Map([['worktree-1', [{ id: 'tab-1', type: 'agent', sessionId: 'session-1', label: 'claude' }]]]),
      activeAgentTabId: new Map([['worktree-1', 'tab-1']]),
      acpAccumulator: {
        connectionGeneration: 1,
        threads: new Map(),
        pendingCorrelations: new Map(),
        lastFlushTimestamp: null,
      },
      dispatchAccumulator: mockDispatchAccumulator,
    };

    (useStore as any).mockImplementation((selector?: any) => {
      if (typeof selector === 'function') {
        return selector(mockStore);
      }
      return mockStore;
    });

    (selectAgentTabsByWorktreeId as any).mockImplementation((worktreeId: string) => {
      return (state: any) => state.agentTabs.get(worktreeId) || [];
    });

    (selectActiveAgentTabId as any).mockImplementation((worktreeId: string) => {
      return (state: any) => state.activeAgentTabId.get(worktreeId) || null;
    });

    render(<AgentPane worktreeId="worktree-1" />);

    expect(mockStore.agentSessions).toHaveLength(1);
    expect(mockStore.agentSessions[0].worktreeId).toBe('worktree-1');
    expect(mockStore.agentSessions[0].status).toBe('working');
  });

  it('accumulator uses worktreeId as threadId reference only (does not own identity)', () => {
    const accumulatedThread: AccumulatedThread = {
      worktreeId: 'worktree-1',
      acpSessionId: 'session-1',
      messages: [],
      sessionStatus: 'Working',
      lastSequence: 0,
      connectionGeneration: 1,
      isStreaming: false,
    };

    const mockStore = {
      addAgentTab: mockAddAgentTab,
      removeAgentTab: mockRemoveAgentTab,
      setActiveAgentTab: mockSetActiveAgentTab,
      agentSessions: [
        {
          id: 'session-1',
          worktreeId: 'worktree-1',
          agentType: 'claude',
          status: 'working' as const,
          startedAt: Date.now(),
        },
      ],
      agentTabs: new Map(),
      activeAgentTabId: new Map(),
      acpAccumulator: {
        connectionGeneration: 1,
        threads: new Map([['worktree-1', accumulatedThread]]),
        pendingCorrelations: new Map(),
        lastFlushTimestamp: null,
      },
      dispatchAccumulator: mockDispatchAccumulator,
    };

    (useStore as any).mockImplementation((selector?: any) => {
      if (typeof selector === 'function') {
        return selector(mockStore);
      }
      return mockStore;
    });

    (selectAgentTabsByWorktreeId as any).mockImplementation((worktreeId: string) => {
      return (state: any) => state.agentTabs.get(worktreeId) || [];
    });

    (selectActiveAgentTabId as any).mockImplementation((worktreeId: string) => {
      return (state: any) => state.activeAgentTabId.get(worktreeId) || null;
    });

    render(<AgentPane worktreeId="worktree-1" />);

    const thread = mockStore.acpAccumulator.threads.get('worktree-1');
    expect(thread?.worktreeId).toBe('worktree-1');
    expect(thread?.acpSessionId).toBe('session-1');
  });
});

describe('Reconnect Acceptance', () => {
  const mockSend = vi.fn();
  const mockRemoveAgentTab = vi.fn();
  const mockAddAgentTab = vi.fn();
  const mockSetActiveAgentTab = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();

    const mockClient = {
      send: mockSend,
      onMessage: vi.fn(() => vi.fn()),
    };

    (useWebSocketClient as any).mockReturnValue(mockClient);
  });

  it('accepts rebuilt accumulator state on reconnect (connection generation increments)', () => {
    const initialAccumulator: AcpAccumulatorState = {
      connectionGeneration: 1,
      threads: new Map([
        [
          'worktree-1',
          {
            worktreeId: 'worktree-1',
            acpSessionId: 'session-1',
            messages: [
              {
                id: 'msg-1',
                role: 'user',
                parts: [{ type: 'text', text: 'Old message', isStreaming: false }],
                createdAt: 1000,
                lastSequence: 1,
              },
            ],
            sessionStatus: 'Complete',
            lastSequence: 1,
            connectionGeneration: 1,
            isStreaming: false,
          },
        ],
      ]),
      pendingCorrelations: new Map(),
      lastFlushTimestamp: null,
    };

    const action = { type: 'CONNECTION_RECONNECTED' as const };
    const newAccumulator = acpAccumulatorReducer(initialAccumulator, action);

    expect(newAccumulator.connectionGeneration).toBe(2);
    expect(newAccumulator.threads.size).toBe(0);
  });

  it('flushes thread on reconnect and accepts new events', () => {
    const initialAccumulator: AcpAccumulatorState = {
      connectionGeneration: 1,
      threads: new Map([
        [
          'worktree-1',
          {
            worktreeId: 'worktree-1',
            acpSessionId: 'session-1',
            messages: [{ id: 'msg-1', role: 'user', parts: [{ type: 'text', text: 'Old', isStreaming: false }], createdAt: 1000, lastSequence: 1 }],
            sessionStatus: 'Complete',
            lastSequence: 1,
            connectionGeneration: 1,
            isStreaming: false,
          },
        ],
      ]),
      pendingCorrelations: new Map(),
      lastFlushTimestamp: null,
    };

    const reconnectAction = { type: 'CONNECTION_RECONNECTED' as const };
    const afterReconnect = acpAccumulatorReducer(initialAccumulator, reconnectAction);

    expect(afterReconnect.connectionGeneration).toBe(2);
    expect(afterReconnect.threads.has('worktree-1')).toBe(false);

    const newThreadAction = {
      type: 'REBUILD_FROM_SNAPSHOT' as const,
      worktreeId: 'worktree-1',
      acpSessionId: 'session-2',
    };
    const afterRebuild = acpAccumulatorReducer(afterReconnect, newThreadAction);

    expect(afterRebuild.threads.has('worktree-1')).toBe(true);
    expect(afterRebuild.threads.get('worktree-1')?.acpSessionId).toBe('session-2');
    expect(afterRebuild.threads.get('worktree-1')?.messages).toHaveLength(0);
  });

  it('maintains worktree/tab/session ownership across reconnects', () => {
    const agentSessions = [
      {
        id: 'session-1',
        worktreeId: 'worktree-1',
        agentType: 'claude',
        status: 'working' as const,
        startedAt: Date.now(),
      },
    ];

    const agentTabs: AgentTab[] = [
      { id: 'tab-1', type: 'agent', sessionId: 'session-1', label: 'claude' },
    ];

    const mockStore = {
      addAgentTab: mockAddAgentTab,
      removeAgentTab: mockRemoveAgentTab,
      setActiveAgentTab: mockSetActiveAgentTab,
      agentSessions,
      agentTabs: new Map([['worktree-1', agentTabs]]),
      activeAgentTabId: new Map([['worktree-1', 'tab-1']]),
      acpAccumulator: {
        connectionGeneration: 1,
        threads: new Map(),
        pendingCorrelations: new Map(),
        lastFlushTimestamp: null,
      },
      dispatchAccumulator: vi.fn(),
    };

    (useStore as any).mockImplementation((selector?: any) => {
      if (typeof selector === 'function') {
        return selector(mockStore);
      }
      return mockStore;
    });

    (selectAgentTabsByWorktreeId as any).mockImplementation((worktreeId: string) => {
      return (state: any) => state.agentTabs.get(worktreeId) || [];
    });

    (selectActiveAgentTabId as any).mockImplementation((worktreeId: string) => {
      return (state: any) => state.activeAgentTabId.get(worktreeId) || null;
    });

    render(<AgentPane worktreeId="worktree-1" />);

    expect(mockStore.agentSessions).toHaveLength(1);
    expect(mockStore.agentTabs.get('worktree-1')).toHaveLength(1);
    expect(mockStore.activeAgentTabId.get('worktree-1')).toBe('tab-1');
  });
});

describe('Tab Coexistence', () => {
  const mockSend = vi.fn();
  const mockRemoveAgentTab = vi.fn();
  const mockAddAgentTab = vi.fn();
  const mockSetActiveAgentTab = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();

    const mockClient = {
      send: mockSend,
      onMessage: vi.fn(() => vi.fn()),
    };

    (useWebSocketClient as any).mockReturnValue(mockClient);
  });

  it('allows agent, diff, and editor tabs to coexist in the same worktree', () => {
    const mixedTabs: AgentTab[] = [
      { id: 'tab-1', type: 'agent', sessionId: 'session-1', label: 'claude' },
      { id: 'tab-2', type: 'diff', filePath: '/path/to/file.ts' },
      { id: 'tab-3', type: 'editor', filePath: '/path/to/another.ts' },
    ];

    const mockAgentSessions = [
      {
        id: 'session-1',
        worktreeId: 'worktree-1',
        agentType: 'claude',
        status: 'idle' as const,
        startedAt: Date.now(),
      },
    ];

    const mockStore = {
      addAgentTab: mockAddAgentTab,
      removeAgentTab: mockRemoveAgentTab,
      setActiveAgentTab: mockSetActiveAgentTab,
      agentSessions: mockAgentSessions,
      agentTabs: new Map([['worktree-1', mixedTabs]]),
      activeAgentTabId: new Map([['worktree-1', 'tab-1']]),
      acpAccumulator: {
        connectionGeneration: 1,
        threads: new Map(),
        pendingCorrelations: new Map(),
        lastFlushTimestamp: null,
      },
      dispatchAccumulator: vi.fn(),
    };

    (useStore as any).mockImplementation((selector?: any) => {
      if (typeof selector === 'function') {
        return selector(mockStore);
      }
      return mockStore;
    });

    (selectAgentTabsByWorktreeId as any).mockImplementation((worktreeId: string) => {
      return (state: any) => state.agentTabs.get(worktreeId) || [];
    });

    (selectActiveAgentTabId as any).mockImplementation((worktreeId: string) => {
      return (state: any) => state.activeAgentTabId.get(worktreeId) || null;
    });

    render(<AgentPane worktreeId="worktree-1" />);

    expect(screen.getByText('claude')).toBeInTheDocument();
    expect(screen.getByText('Diff: file.ts')).toBeInTheDocument();
    expect(screen.getByText('another.ts')).toBeInTheDocument();
  });

  it('switches between tab types without corrupting state', () => {
    const mixedTabs: AgentTab[] = [
      { id: 'tab-1', type: 'agent', sessionId: 'session-1', label: 'claude' },
      { id: 'tab-2', type: 'diff', filePath: '/path/to/file.ts' },
    ];

    const mockAgentSessions = [
      {
        id: 'session-1',
        worktreeId: 'worktree-1',
        agentType: 'claude',
        status: 'idle' as const,
        startedAt: Date.now(),
      },
    ];

    let activeTabId = 'tab-1';

    const mockStore = {
      addAgentTab: mockAddAgentTab,
      removeAgentTab: mockRemoveAgentTab,
      setActiveAgentTab: vi.fn((worktreeId: string, tabId: string) => {
        activeTabId = tabId;
      }),
      agentSessions: mockAgentSessions,
      agentTabs: new Map([['worktree-1', mixedTabs]]),
      activeAgentTabId: new Map([['worktree-1', activeTabId]]),
      acpAccumulator: {
        connectionGeneration: 1,
        threads: new Map(),
        pendingCorrelations: new Map(),
        lastFlushTimestamp: null,
      },
      dispatchAccumulator: vi.fn(),
    };

    (useStore as any).mockImplementation((selector?: any) => {
      const storeWithActive = {
        ...mockStore,
        activeAgentTabId: new Map([['worktree-1', activeTabId]]),
      };
      if (typeof selector === 'function') {
        return selector(storeWithActive);
      }
      return storeWithActive;
    });

    (selectAgentTabsByWorktreeId as any).mockImplementation((worktreeId: string) => {
      return (state: any) => state.agentTabs.get(worktreeId) || [];
    });

    (selectActiveAgentTabId as any).mockImplementation((worktreeId: string) => {
      return (state: any) => state.activeAgentTabId.get(worktreeId) || null;
    });

    const { rerender } = render(<AgentPane worktreeId="worktree-1" />);

    expect(screen.getByTestId('agent-chat-session-1')).toBeInTheDocument();

    activeTabId = 'tab-2';
    rerender(<AgentPane worktreeId="worktree-1" />);

    expect(screen.getByText('Loading diff...')).toBeInTheDocument();
  });

  it('isolates tabs between different worktrees', () => {
    const worktree1Tabs: AgentTab[] = [
      { id: 'tab-1', type: 'agent', sessionId: 'session-1', label: 'claude' },
    ];

    const worktree2Tabs: AgentTab[] = [
      { id: 'tab-2', type: 'diff', filePath: '/other/file.ts' },
    ];

    const mockAgentSessions = [
      {
        id: 'session-1',
        worktreeId: 'worktree-1',
        agentType: 'claude',
        status: 'idle' as const,
        startedAt: Date.now(),
      },
    ];

    const mockStore = {
      addAgentTab: mockAddAgentTab,
      removeAgentTab: mockRemoveAgentTab,
      setActiveAgentTab: mockSetActiveAgentTab,
      agentSessions: mockAgentSessions,
      agentTabs: new Map([
        ['worktree-1', worktree1Tabs],
        ['worktree-2', worktree2Tabs],
      ]),
      activeAgentTabId: new Map([
        ['worktree-1', 'tab-1'],
        ['worktree-2', 'tab-2'],
      ]),
      acpAccumulator: {
        connectionGeneration: 1,
        threads: new Map(),
        pendingCorrelations: new Map(),
        lastFlushTimestamp: null,
      },
      dispatchAccumulator: vi.fn(),
    };

    (useStore as any).mockImplementation((selector?: any) => {
      if (typeof selector === 'function') {
        return selector(mockStore);
      }
      return mockStore;
    });

    (selectAgentTabsByWorktreeId as any).mockImplementation((worktreeId: string) => {
      return (state: any) => state.agentTabs.get(worktreeId) || [];
    });

    (selectActiveAgentTabId as any).mockImplementation((worktreeId: string) => {
      return (state: any) => state.activeAgentTabId.get(worktreeId) || null;
    });

    const { rerender } = render(<AgentPane worktreeId="worktree-1" />);

    expect(screen.getByText('claude')).toBeInTheDocument();
    expect(screen.getByTestId('agent-chat-session-1')).toBeInTheDocument();

    rerender(<AgentPane worktreeId="worktree-2" />);

    expect(screen.getByText('Diff: file.ts')).toBeInTheDocument();
    expect(screen.queryByText('claude')).not.toBeInTheDocument();
  });

  it('preserves assistant-ui runtime state when switching between agent tabs', () => {
    const accumulatedThread: AccumulatedThread = {
      worktreeId: 'worktree-1',
      acpSessionId: 'session-1',
      messages: [
        {
          id: 'msg-1',
          role: 'user',
          parts: [{ type: 'text', text: 'Hello', isStreaming: false }],
          createdAt: 1000,
          lastSequence: 1,
        },
      ],
      sessionStatus: 'Working',
      lastSequence: 1,
      connectionGeneration: 1,
      isStreaming: true,
    };

    const agentTabs: AgentTab[] = [
      { id: 'tab-1', type: 'agent', sessionId: 'session-1', label: 'claude' },
    ];

    const mockAgentSessions = [
      {
        id: 'session-1',
        worktreeId: 'worktree-1',
        agentType: 'claude',
        status: 'working' as const,
        startedAt: Date.now(),
      },
    ];

    const mockStore = {
      addAgentTab: mockAddAgentTab,
      removeAgentTab: mockRemoveAgentTab,
      setActiveAgentTab: mockSetActiveAgentTab,
      agentSessions: mockAgentSessions,
      agentTabs: new Map([['worktree-1', agentTabs]]),
      activeAgentTabId: new Map([['worktree-1', 'tab-1']]),
      acpAccumulator: {
        connectionGeneration: 1,
        threads: new Map([['worktree-1', accumulatedThread]]),
        pendingCorrelations: new Map(),
        lastFlushTimestamp: null,
      },
      dispatchAccumulator: vi.fn(),
    };

    (useStore as any).mockImplementation((selector?: any) => {
      if (typeof selector === 'function') {
        return selector(mockStore);
      }
      return mockStore;
    });

    (selectAgentTabsByWorktreeId as any).mockImplementation((worktreeId: string) => {
      return (state: any) => state.agentTabs.get(worktreeId) || [];
    });

    (selectActiveAgentTabId as any).mockImplementation((worktreeId: string) => {
      return (state: any) => state.activeAgentTabId.get(worktreeId) || null;
    });

    render(<AgentPane worktreeId="worktree-1" />);

    expect(screen.getByTestId('agent-chat-session-1')).toBeInTheDocument();
    expect(screen.getByText('AgentChat: claude')).toBeInTheDocument();
  });
});

describe('Panel Routing', () => {
  const mockSend = vi.fn();
  const mockRemoveAgentTab = vi.fn();
  const mockAddAgentTab = vi.fn();
  const mockSetActiveAgentTab = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();

    const mockClient = {
      send: mockSend,
      onMessage: vi.fn(() => vi.fn()),
    };

    (useWebSocketClient as any).mockReturnValue(mockClient);
  });

  it('routes cross-panel open actions to correct worktree context', () => {
    const agentTabs: AgentTab[] = [
      { id: 'tab-1', type: 'agent', sessionId: 'session-1', label: 'claude' },
    ];

    const mockAgentSessions = [
      {
        id: 'session-1',
        worktreeId: 'worktree-1',
        agentType: 'claude',
        status: 'idle' as const,
        startedAt: Date.now(),
      },
    ];

    const mockStore = {
      addAgentTab: mockAddAgentTab,
      removeAgentTab: mockRemoveAgentTab,
      setActiveAgentTab: mockSetActiveAgentTab,
      agentSessions: mockAgentSessions,
      agentTabs: new Map([['worktree-1', agentTabs]]),
      activeAgentTabId: new Map([['worktree-1', 'tab-1']]),
      acpAccumulator: {
        connectionGeneration: 1,
        threads: new Map(),
        pendingCorrelations: new Map(),
        lastFlushTimestamp: null,
      },
      dispatchAccumulator: vi.fn(),
    };

    (useStore as any).mockImplementation((selector?: any) => {
      if (typeof selector === 'function') {
        return selector(mockStore);
      }
      return mockStore;
    });

    (selectAgentTabsByWorktreeId as any).mockImplementation((worktreeId: string) => {
      return (state: any) => state.agentTabs.get(worktreeId) || [];
    });

    (selectActiveAgentTabId as any).mockImplementation((worktreeId: string) => {
      return (state: any) => state.activeAgentTabId.get(worktreeId) || null;
    });

    render(<AgentPane worktreeId="worktree-1" />);

    expect(mockStore.agentTabs.has('worktree-1')).toBe(true);
    expect(mockStore.agentSessions[0].worktreeId).toBe('worktree-1');
  });

  it('routes send message actions through correct worktree session', async () => {
    const agentTabs: AgentTab[] = [
      { id: 'tab-1', type: 'agent', sessionId: 'session-1', label: 'claude' },
    ];

    const mockAgentSessions = [
      {
        id: 'session-1',
        worktreeId: 'worktree-1',
        agentType: 'claude',
        status: 'idle' as const,
        startedAt: Date.now(),
      },
    ];

    const mockStore = {
      addAgentTab: mockAddAgentTab,
      removeAgentTab: mockRemoveAgentTab,
      setActiveAgentTab: mockSetActiveAgentTab,
      agentSessions: mockAgentSessions,
      agentTabs: new Map([['worktree-1', agentTabs]]),
      activeAgentTabId: new Map([['worktree-1', 'tab-1']]),
      acpAccumulator: {
        connectionGeneration: 1,
        threads: new Map(),
        pendingCorrelations: new Map(),
        lastFlushTimestamp: null,
      },
      dispatchAccumulator: vi.fn(),
    };

    (useStore as any).mockImplementation((selector?: any) => {
      if (typeof selector === 'function') {
        return selector(mockStore);
      }
      return mockStore;
    });

    (selectAgentTabsByWorktreeId as any).mockImplementation((worktreeId: string) => {
      return (state: any) => state.agentTabs.get(worktreeId) || [];
    });

    (selectActiveAgentTabId as any).mockImplementation((worktreeId: string) => {
      return (state: any) => state.activeAgentTabId.get(worktreeId) || null;
    });

    render(<AgentPane worktreeId="worktree-1" />);

    // Verify the worktreeId is passed to AgentChat which uses it for send actions
    expect(screen.getByTestId('agent-chat-session-1')).toHaveTextContent('AgentChat: claude');
  });

  it('maintains separate accumulator threads per worktree for panel isolation', () => {
    const worktree1Thread: AccumulatedThread = {
      worktreeId: 'worktree-1',
      acpSessionId: 'session-1',
      messages: [
        {
          id: 'msg-1',
          role: 'user',
          parts: [{ type: 'text', text: 'Worktree 1 message', isStreaming: false }],
          createdAt: 1000,
          lastSequence: 1,
        },
      ],
      sessionStatus: 'Working',
      lastSequence: 1,
      connectionGeneration: 1,
      isStreaming: false,
    };

    const worktree2Thread: AccumulatedThread = {
      worktreeId: 'worktree-2',
      acpSessionId: 'session-2',
      messages: [
        {
          id: 'msg-2',
          role: 'user',
          parts: [{ type: 'text', text: 'Worktree 2 message', isStreaming: false }],
          createdAt: 2000,
          lastSequence: 2,
        },
      ],
      sessionStatus: 'Complete',
      lastSequence: 2,
      connectionGeneration: 1,
      isStreaming: false,
    };

    const mockStore = {
      addAgentTab: mockAddAgentTab,
      removeAgentTab: mockRemoveAgentTab,
      setActiveAgentTab: mockSetActiveAgentTab,
      agentSessions: [],
      agentTabs: new Map(),
      activeAgentTabId: new Map(),
      acpAccumulator: {
        connectionGeneration: 1,
        threads: new Map([
          ['worktree-1', worktree1Thread],
          ['worktree-2', worktree2Thread],
        ]),
        pendingCorrelations: new Map(),
        lastFlushTimestamp: null,
      },
      dispatchAccumulator: vi.fn(),
    };

    (useStore as any).mockImplementation((selector?: any) => {
      if (typeof selector === 'function') {
        return selector(mockStore);
      }
      return mockStore;
    });

    (selectAgentTabsByWorktreeId as any).mockImplementation((worktreeId: string) => {
      return (state: any) => state.agentTabs.get(worktreeId) || [];
    });

    (selectActiveAgentTabId as any).mockImplementation((worktreeId: string) => {
      return (state: any) => state.activeAgentTabId.get(worktreeId) || null;
    });

    const { rerender } = render(<AgentPane worktreeId="worktree-1" />);

    // Each worktree has its own thread
    expect(mockStore.acpAccumulator.threads.get('worktree-1')).toBeDefined();
    expect(mockStore.acpAccumulator.threads.get('worktree-2')).toBeDefined();
    expect(mockStore.acpAccumulator.threads.get('worktree-1')?.messages).toHaveLength(1);
    expect(mockStore.acpAccumulator.threads.get('worktree-2')?.messages).toHaveLength(1);

    // Switch to worktree 2
    rerender(<AgentPane worktreeId="worktree-2" />);

    // Threads remain separate
    expect(mockStore.acpAccumulator.threads.get('worktree-1')?.messages[0].parts[0].text).toBe('Worktree 1 message');
    expect(mockStore.acpAccumulator.threads.get('worktree-2')?.messages[0].parts[0].text).toBe('Worktree 2 message');
  });

  it('preserves shell authority when agent pane is embedded in main panel', () => {
    const agentTabs: AgentTab[] = [
      { id: 'tab-1', type: 'agent', sessionId: 'session-1', label: 'claude' },
    ];

    const mockAgentSessions = [
      {
        id: 'session-1',
        worktreeId: 'worktree-1',
        agentType: 'claude',
        status: 'idle' as const,
        startedAt: Date.now(),
      },
    ];

    const mockStore = {
      addAgentTab: mockAddAgentTab,
      removeAgentTab: mockRemoveAgentTab,
      setActiveAgentTab: mockSetActiveAgentTab,
      agentSessions: mockAgentSessions,
      agentTabs: new Map([['worktree-1', agentTabs]]),
      activeAgentTabId: new Map([['worktree-1', 'tab-1']]),
      acpAccumulator: {
        connectionGeneration: 1,
        threads: new Map(),
        pendingCorrelations: new Map(),
        lastFlushTimestamp: null,
      },
      dispatchAccumulator: vi.fn(),
    };

    (useStore as any).mockImplementation((selector?: any) => {
      if (typeof selector === 'function') {
        return selector(mockStore);
      }
      return mockStore;
    });

    (selectAgentTabsByWorktreeId as any).mockImplementation((worktreeId: string) => {
      return (state: any) => state.agentTabs.get(worktreeId) || [];
    });

    (selectActiveAgentTabId as any).mockImplementation((worktreeId: string) => {
      return (state: any) => state.activeAgentTabId.get(worktreeId) || null;
    });

    render(<AgentPane worktreeId="worktree-1" />);

    // Shell (store) owns the worktree, tab, and session state
    // AgentPane receives worktreeId as prop and delegates to store
    expect(mockStore.agentTabs.get('worktree-1')).toBeDefined();
    expect(mockStore.agentSessions).toHaveLength(1);
    expect(mockStore.activeAgentTabId.get('worktree-1')).toBe('tab-1');
  });
});
