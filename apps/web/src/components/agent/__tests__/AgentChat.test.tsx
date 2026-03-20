import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AgentChat } from '../AgentChat';
import { useWebSocketClient } from '../../../hooks/useWebSocket';
import { useAgentStatus } from '../../../hooks/useAgentStatus';
import {
  EventCard,
  EventContentPart,
  PermissionCard,
  ToolCard,
  PlanCard,
  StatusCard,
  UnknownCard,
} from '../EventCards';
import {
  createPermissionCardSchema,
  createToolCardSchema,
  createPlanCardSchema,
  createStatusCardSchema,
  createCardSchema,
  createUnknownCardSchema,
  createSessionStatusCardSchema,
  isValidPermissionCard,
  isValidToolCard,
  isValidErrorCard,
  isPermissionCardSchema,
  isToolCardSchema,
  isPlanCardSchema,
  isStatusCardSchema,
  isUnknownCardSchema,
  type PermissionCardSchema,
  type ToolCardSchema,
  type PlanCardSchema,
  type StatusCardSchema,
  type UnknownCardSchema,
} from '../card-schema';
import {
  createRuntimeInput,
  isValidRuntimeInput,
  getThreadMessages,
  isThreadStreaming,
  getThreadStatus,
  FIRST_CUT_FEATURES,
  type ExternalStoreRuntimeInput,
  type RuntimeMessage,
  type RuntimeThreadState,
  type RuntimeFeatureFlags,
  type RuntimeContentPart,
} from '../runtimeBoundary';
import type { AccumulatedThread, AccumulatedMessage, AccumulatedContentPart } from '../../../types/state';

vi.mock('../../../hooks/useWebSocket');
vi.mock('../../../hooks/useAgentStatus');

describe('AgentChat', () => {
  const mockOnSendMessage = vi.fn();
  const mockOnMessage = vi.fn();
  const mockSend = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();

    const mockClient = {
      send: mockSend,
      onMessage: mockOnMessage.mockReturnValue(vi.fn()),
    };

    (useWebSocketClient as any).mockReturnValue(mockClient);
    (useAgentStatus as any).mockReturnValue({ status: 'idle', taskSummary: '' });
  });

  const renderAgentChat = (props: Partial<Parameters<typeof AgentChat>[0]> = {}) => {
    const defaultProps = {
      sessionId: 'session-1',
      agentType: 'claude',
      worktreeId: 'worktree-1',
      onSendMessage: mockOnSendMessage,
    };
    return render(<AgentChat {...defaultProps} {...props} />);
  };

  it('renders input with dynamic placeholder based on agent type', () => {
    renderAgentChat();
    const input = screen.getByPlaceholderText('Ask claude...');
    expect(input).toBeInTheDocument();
  });

  it('renders different agent names correctly', () => {
    renderAgentChat({ agentType: 'glm-5' });
    expect(screen.getByPlaceholderText('Ask glm-5...')).toBeInTheDocument();
  });

  it('shows correct status from useAgentStatus hook', () => {
    (useAgentStatus as any).mockReturnValue({ status: 'working', taskSummary: 'Processing' });
    renderAgentChat();
    expect(screen.getByText('working')).toBeInTheDocument();
  });

  it('displays agent name and subtitle', () => {
    renderAgentChat();
    expect(screen.getByText(/Claude/)).toBeInTheDocument();
    expect(screen.getByText(/Plan Builder/)).toBeInTheDocument();
  });

  it('displays helper text', () => {
    renderAgentChat();
    expect(screen.getByText(/tab: switch agents/)).toBeInTheDocument();
  });

  it('renders send button', () => {
    renderAgentChat();
    expect(screen.getByRole('button', { name: /send/i })).toBeInTheDocument();
  });

  it('has input that accepts text', () => {
    renderAgentChat();
    const input = screen.getByPlaceholderText('Ask claude...') as HTMLTextAreaElement;
    fireEvent.change(input, { target: { value: 'Hello agent' } });
    expect(input.value).toBe('Hello agent');
  });
});

describe('Runtime Boundary Helpers', () => {
  describe('createRuntimeInput', () => {
    it('returns null for null accumulated thread', () => {
      const result = createRuntimeInput(null);
      expect(result).toBeNull();
    });

    it('creates valid runtime input from accumulated thread', () => {
      const accumulated: AccumulatedThread = {
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
          {
            id: 'msg-2',
            role: 'assistant',
            parts: [{ type: 'text', text: 'Hi there', isStreaming: false }],
            createdAt: 2000,
            lastSequence: 2,
          },
        ],
        sessionStatus: 'Working',
        lastSequence: 2,
        connectionGeneration: 1,
        isStreaming: true,
      };

      const onSubmit = vi.fn();
      const onCancel = vi.fn();
      const result = createRuntimeInput(accumulated, onSubmit, onCancel);

      expect(result).not.toBeNull();
      expect(result?.thread.threadId).toBe('worktree-1');
      expect(result?.thread.status).toBe('working');
      expect(result?.thread.isStreaming).toBe(true);
      expect(result?.thread.messages).toHaveLength(2);
      expect(result?.onSubmit).toBe(onSubmit);
      expect(result?.onCancel).toBe(onCancel);
    });

    it('uses worktreeId as threadId, not session ID', () => {
      const accumulated: AccumulatedThread = {
        worktreeId: 'worktree-1',
        acpSessionId: 'session-1',
        messages: [],
        sessionStatus: 'Waiting',
        lastSequence: 0,
        connectionGeneration: 1,
        isStreaming: false,
      };

      const result = createRuntimeInput(accumulated);

      expect(result?.thread.threadId).toBe('worktree-1');
      expect(result?.thread.threadId).not.toBe('session-1');
    });

    it('includes first-cut feature flags', () => {
      const accumulated: AccumulatedThread = {
        worktreeId: 'worktree-1',
        acpSessionId: 'session-1',
        messages: [],
        sessionStatus: 'Working',
        lastSequence: 0,
        connectionGeneration: 1,
        isStreaming: false,
      };

      const result = createRuntimeInput(accumulated);

      expect(result?.features).toEqual(FIRST_CUT_FEATURES);
      expect(result?.features.editingEnabled).toBe(false);
      expect(result?.features.approvalEnabled).toBe(false);
      expect(result?.features.branchingEnabled).toBe(false);
      expect(result?.features.customPermissionCardsEnabled).toBe(true);
      expect(result?.features.customToolCardsEnabled).toBe(true);
      expect(result?.features.customEventCardsEnabled).toBe(true);
    });
  });

  describe('isValidRuntimeInput', () => {
    it('returns false for null input', () => {
      expect(isValidRuntimeInput(null)).toBe(false);
    });

    it('returns true for valid runtime input', () => {
      const input: ExternalStoreRuntimeInput = {
        thread: {
          threadId: 'worktree-1',
          status: 'working',
          isStreaming: true,
          messages: [],
          lastUpdated: Date.now(),
        },
        features: FIRST_CUT_FEATURES,
      };

      expect(isValidRuntimeInput(input)).toBe(true);
    });

    it('returns false for invalid thread structure (missing threadId)', () => {
      const input: ExternalStoreRuntimeInput = {
        thread: {
          threadId: '',
          status: 'working',
          isStreaming: true,
          messages: [],
          lastUpdated: Date.now(),
        },
        features: FIRST_CUT_FEATURES,
      };

      expect(isValidRuntimeInput(input)).toBe(false);
    });

    it('returns false for invalid thread structure (missing messages array)', () => {
      const input = {
        thread: {
          threadId: 'worktree-1',
          status: 'working',
          isStreaming: true,
          messages: null as any,
          lastUpdated: Date.now(),
        },
        features: FIRST_CUT_FEATURES,
      };

      expect(isValidRuntimeInput(input as any)).toBe(false);
    });

    it('returns false for invalid status', () => {
      const input: ExternalStoreRuntimeInput = {
        thread: {
          threadId: 'worktree-1',
          status: 'invalid' as any,
          isStreaming: true,
          messages: [],
          lastUpdated: Date.now(),
        },
        features: FIRST_CUT_FEATURES,
      };

      expect(isValidRuntimeInput(input)).toBe(false);
    });

    it('returns false if editing is enabled', () => {
      const input: ExternalStoreRuntimeInput = {
        thread: {
          threadId: 'worktree-1',
          status: 'working',
          isStreaming: true,
          messages: [],
          lastUpdated: Date.now(),
        },
        features: { ...FIRST_CUT_FEATURES, editingEnabled: true as any },
      };

      expect(isValidRuntimeInput(input)).toBe(false);
    });

    it('returns false if approval is enabled', () => {
      const input: ExternalStoreRuntimeInput = {
        thread: {
          threadId: 'worktree-1',
          status: 'working',
          isStreaming: true,
          messages: [],
          lastUpdated: Date.now(),
        },
        features: { ...FIRST_CUT_FEATURES, approvalEnabled: true as any },
      };

      expect(isValidRuntimeInput(input)).toBe(false);
    });

    it('returns false if branching is enabled', () => {
      const input: ExternalStoreRuntimeInput = {
        thread: {
          threadId: 'worktree-1',
          status: 'working',
          isStreaming: true,
          messages: [],
          lastUpdated: Date.now(),
        },
        features: { ...FIRST_CUT_FEATURES, branchingEnabled: true as any },
      };

      expect(isValidRuntimeInput(input)).toBe(false);
    });
  });

  describe('getThreadMessages', () => {
    it('returns empty array for null accumulated thread', () => {
      const result = getThreadMessages(null);
      expect(result).toEqual([]);
    });

    it('returns mapped messages from accumulated thread', () => {
      const accumulated: AccumulatedThread = {
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
          {
            id: 'msg-2',
            role: 'assistant',
            parts: [
              { type: 'tool', toolUseId: 'tool-1', toolName: 'bash', status: 'Completed' as any, updatedAt: 100 },
              { type: 'text', text: 'Done', isStreaming: false },
            ],
            createdAt: 2000,
            lastSequence: 2,
          },
        ],
        sessionStatus: 'Working',
        lastSequence: 2,
        connectionGeneration: 1,
        isStreaming: false,
      };

      const result = getThreadMessages(accumulated);

      expect(result).toHaveLength(2);
      expect(result[0].role).toBe('user');
      expect(result[0].content[0].type).toBe('text');
      expect(result[0].content[0].text).toBe('Hello');
      expect(result[1].role).toBe('assistant');
      expect(result[1].content).toHaveLength(2);
      expect(result[1].content[0].type).toBe('tool');
      expect(result[1].content[0].toolName).toBe('bash');
    });
  });

  describe('isThreadStreaming', () => {
    it('returns false for null accumulated thread', () => {
      expect(isThreadStreaming(null)).toBe(false);
    });

    it('returns streaming state from accumulated thread', () => {
      const accumulated: AccumulatedThread = {
        worktreeId: 'worktree-1',
        acpSessionId: 'session-1',
        messages: [],
        sessionStatus: 'Working',
        lastSequence: 0,
        connectionGeneration: 1,
        isStreaming: true,
      };

      expect(isThreadStreaming(accumulated)).toBe(true);

      accumulated.isStreaming = false;
      expect(isThreadStreaming(accumulated)).toBe(false);
    });
  });

  describe('getThreadStatus', () => {
    it('returns idle for null accumulated thread', () => {
      expect(getThreadStatus(null)).toBe('idle');
    });

    it('maps ACP session status to runtime status', () => {
      const accumulated: AccumulatedThread = {
        worktreeId: 'worktree-1',
        acpSessionId: 'session-1',
        messages: [],
        sessionStatus: 'Working',
        lastSequence: 0,
        connectionGeneration: 1,
        isStreaming: false,
      };

      expect(getThreadStatus(accumulated)).toBe('working');

      accumulated.sessionStatus = 'Waiting';
      expect(getThreadStatus(accumulated)).toBe('waiting');

      accumulated.sessionStatus = 'Complete';
      expect(getThreadStatus(accumulated)).toBe('complete');

      accumulated.sessionStatus = 'Cancelled';
      expect(getThreadStatus(accumulated)).toBe('cancelled');

      accumulated.sessionStatus = 'Error';
      expect(getThreadStatus(accumulated)).toBe('error');
    });
  });

  describe('Content Mapping', () => {
    it('maps text content correctly', () => {
      const part: AccumulatedContentPart = {
        type: 'text',
        text: 'Hello world',
        isStreaming: false,
      };

      const result: RuntimeContentPart = {
        type: 'text',
        text: part.text,
      };

      const input = createRuntimeInput({
        worktreeId: 'worktree-1',
        acpSessionId: 'session-1',
        messages: [{ id: 'msg-1', role: 'user', parts: [part], createdAt: 1000, lastSequence: 1 }],
        sessionStatus: 'Working',
        lastSequence: 1,
        connectionGeneration: 1,
        isStreaming: false,
      });

      expect(input?.thread.messages[0].content[0]).toEqual(result);
    });

    it('maps structured content correctly', () => {
      const part: AccumulatedContentPart = {
        type: 'structured',
        data: '{"key": "value"}',
        isStreaming: false,
      };

      const input = createRuntimeInput({
        worktreeId: 'worktree-1',
        acpSessionId: 'session-1',
        messages: [{ id: 'msg-1', role: 'assistant', parts: [part], createdAt: 1000, lastSequence: 1 }],
        sessionStatus: 'Working',
        lastSequence: 1,
        connectionGeneration: 1,
        isStreaming: false,
      });

      expect(input?.thread.messages[0].content[0].type).toBe('text');
      expect(input?.thread.messages[0].content[0].text).toBe(part.data);
    });

    it('maps tool content correctly', () => {
      const part: AccumulatedContentPart = {
        type: 'tool',
        toolUseId: 'tool-1',
        toolName: 'bash',
        status: 'Completed' as any,
        updatedAt: 100,
      };

      const input = createRuntimeInput({
        worktreeId: 'worktree-1',
        acpSessionId: 'session-1',
        messages: [{ id: 'msg-1', role: 'assistant', parts: [part], createdAt: 1000, lastSequence: 1 }],
        sessionStatus: 'Working',
        lastSequence: 1,
        connectionGeneration: 1,
        isStreaming: false,
      });

      expect(input?.thread.messages[0].content[0].type).toBe('tool');
      expect(input?.thread.messages[0].content[0].toolName).toBe('bash');
    });

    it('maps context content correctly', () => {
      const part: AccumulatedContentPart = {
        type: 'context',
        updateType: 'FileRead' as any,
        data: 'src/index.ts',
        sequence: 1,
      };

      const input = createRuntimeInput({
        worktreeId: 'worktree-1',
        acpSessionId: 'session-1',
        messages: [{ id: 'msg-1', role: 'assistant', parts: [part], createdAt: 1000, lastSequence: 1 }],
        sessionStatus: 'Working',
        lastSequence: 1,
        connectionGeneration: 1,
        isStreaming: false,
      });

      expect(input?.thread.messages[0].content[0].type).toBe('context');
      expect(input?.thread.messages[0].content[0].contextType).toBe('FileRead');
      expect(input?.thread.messages[0].content[0].contextData).toBe('src/index.ts');
    });

    it('maps error content correctly', () => {
      const part: AccumulatedContentPart = {
        type: 'error',
        code: 'ToolFailed' as any,
        message: 'Command failed',
        recoverable: true,
        sequence: 1,
      };

      const input = createRuntimeInput({
        worktreeId: 'worktree-1',
        acpSessionId: 'session-1',
        messages: [{ id: 'msg-1', role: 'assistant', parts: [part], createdAt: 1000, lastSequence: 1 }],
        sessionStatus: 'Working',
        lastSequence: 1,
        connectionGeneration: 1,
        isStreaming: false,
      });

      expect(input?.thread.messages[0].content[0].type).toBe('error');
      expect(input?.thread.messages[0].content[0].errorCode).toBe('ToolFailed');
      expect(input?.thread.messages[0].content[0].errorMessage).toBe('Command failed');
      expect(input?.thread.messages[0].content[0].recoverable).toBe(true);
    });

    it('provides safe fallback for unknown content types', () => {
      const part: AccumulatedContentPart = {
        type: 'unknown_type_placeholder' as any,
        someUnknownField: 'Unknown data',
        isStreaming: false,
      } as any;

      const input = createRuntimeInput({
        worktreeId: 'worktree-1',
        acpSessionId: 'session-1',
        messages: [{ id: 'msg-1', role: 'user', parts: [part], createdAt: 1000, lastSequence: 1 }],
        sessionStatus: 'Working',
        lastSequence: 1,
        connectionGeneration: 1,
        isStreaming: false,
      });

      expect(input?.thread.messages[0].content[0].type).toBe('text');
      expect(input?.thread.messages[0].content[0].text).toBe('[Unknown content type]');
    });
  });

  describe('Feature Flags', () => {
    it('ensures editing remains disabled', () => {
      expect(FIRST_CUT_FEATURES.editingEnabled).toBe(false);
    });

    it('ensures approval remains disabled', () => {
      expect(FIRST_CUT_FEATURES.approvalEnabled).toBe(false);
    });

    it('ensures branching remains disabled', () => {
      expect(FIRST_CUT_FEATURES.branchingEnabled).toBe(false);
    });

    it('enables custom permission cards', () => {
      expect(FIRST_CUT_FEATURES.customPermissionCardsEnabled).toBe(true);
    });

    it('enables custom tool cards', () => {
      expect(FIRST_CUT_FEATURES.customToolCardsEnabled).toBe(true);
    });

    it('enables custom event cards', () => {
      expect(FIRST_CUT_FEATURES.customEventCardsEnabled).toBe(true);
    });
  });
});

describe('Card Schema - Permission Card', () => {
  it('creates valid permission card schema from accumulated permission card', () => {
    const accumulatedCard = {
      type: 'permission',
      toolUseId: 'tool-123',
      toolName: 'bash',
      input: 'ls -la',
      isPending: true,
      sequence: 5,
    };

    const schema = createPermissionCardSchema(accumulatedCard);

    expect(schema).not.toBeNull();
    expect(schema?.type).toBe('permission');
    expect(schema?.toolUseId).toBe('tool-123');
    expect(schema?.toolName).toBe('bash');
    expect(schema?.isPending).toBe(true);
    expect(schema?.sequence).toBe(5);
    expect(schema?.reason).toBe('The agent wants to execute a shell command');
  });

  it('generates safe action dispatch fields for permission', () => {
    const accumulatedCard = {
      type: 'permission',
      toolUseId: 'tool-123',
      toolName: 'file_read',
      input: '/path/to/file.txt',
      isPending: true,
      sequence: 5,
    };

    const schema = createPermissionCardSchema(accumulatedCard);

    expect(schema?.actions.allow).toEqual({ type: 'allow', toolUseId: 'tool-123' });
    expect(schema?.actions.allowAlways).toEqual({ type: 'allow-always', toolUseId: 'tool-123', toolName: 'file_read' });
    expect(schema?.actions.deny).toEqual({ type: 'deny', toolUseId: 'tool-123' });
    expect(schema?.actions.denyAlways).toEqual({ type: 'deny-always', toolUseId: 'tool-123', toolName: 'file_read' });
  });

  it('truncates long input summaries for display safety', () => {
    const longInput = 'a'.repeat(300);
    const accumulatedCard = {
      type: 'permission',
      toolUseId: 'tool-123',
      toolName: 'bash',
      input: longInput,
      isPending: true,
      sequence: 5,
    };

    const schema = createPermissionCardSchema(accumulatedCard);

    expect(schema?.inputSummary).toHaveLength(203);
    expect(schema?.inputSummary).toMatch(/\.\.\.$/);
  });

  it('returns null for invalid permission card', () => {
    const invalidCard = {
      type: 'permission',
      toolUseId: '',
      toolName: 'bash',
      input: 'ls -la',
      isPending: true,
      sequence: 5,
    };

    const schema = createPermissionCardSchema(invalidCard);

    expect(schema).toBeNull();
  });

  it('validates permission card has all required fields', () => {
    const validCard = {
      type: 'permission',
      toolUseId: 'tool-123',
      toolName: 'bash',
      input: 'ls -la',
      isPending: true,
      sequence: 5,
    };

    expect(isValidPermissionCard(validCard)).toBe(true);
    expect(isValidPermissionCard({ type: 'permission', toolUseId: 'tool-123' })).toBe(false);
    expect(isValidPermissionCard(null)).toBe(false);
    expect(isValidPermissionCard({})).toBe(false);
  });
});

describe('Card Schema - Tool Card', () => {
  it('creates valid tool card schema from accumulated tool card', () => {
    const accumulatedCard = {
      type: 'tool',
      toolUseId: 'tool-123',
      toolName: 'bash',
      status: 'Completed',
      input: 'ls -la',
      output: 'file1.txt\nfile2.txt',
      updatedAt: 1000,
    };

    const schema = createToolCardSchema(accumulatedCard);

    expect(schema).not.toBeNull();
    expect(schema?.type).toBe('tool');
    expect(schema?.toolUseId).toBe('tool-123');
    expect(schema?.toolName).toBe('bash');
    expect(schema?.status).toBe('Completed');
    expect(schema?.updatedAt).toBe(1000);
  });

  it('truncates long tool outputs for display safety', () => {
    const longOutput = 'output\n'.repeat(100);
    const accumulatedCard = {
      type: 'tool',
      toolUseId: 'tool-123',
      toolName: 'bash',
      status: 'Completed',
      output: longOutput,
      updatedAt: 1000,
    };

    const schema = createToolCardSchema(accumulatedCard);

    expect(schema?.outputSummary).toHaveLength(503);
    expect(schema?.outputSummary).toMatch(/\.\.\.$/);
  });

  it('returns null for invalid tool card', () => {
    const invalidCard = {
      type: 'tool',
      toolUseId: '',
      toolName: 'bash',
      status: 'Completed',
      updatedAt: 1000,
    };

    const schema = createToolCardSchema(invalidCard);

    expect(schema).toBeNull();
  });

  it('validates tool card has all required fields', () => {
    const validCard = {
      type: 'tool',
      toolUseId: 'tool-123',
      toolName: 'bash',
      status: 'Completed',
      updatedAt: 1000,
    };

    expect(isValidToolCard(validCard)).toBe(true);
    expect(isValidToolCard({ type: 'tool', toolUseId: 'tool-123' })).toBe(false);
    expect(isValidToolCard(null)).toBe(false);
    expect(isValidToolCard({})).toBe(false);
  });
});

describe('Card Schema - Plan Card', () => {
  it('creates valid plan card schema from context update', () => {
    const planData = JSON.stringify({
      planId: 'plan-456',
      title: 'Implement feature X',
      description: 'Step-by-step plan',
      status: 'in-progress',
      stepsCompleted: 3,
      totalSteps: 5,
    });

    const contextCard = {
      type: 'context',
      updateType: 'MemoryUpdate',
      data: planData,
      sequence: 10,
    };

    const schema = createPlanCardSchema(contextCard);

    expect(schema).not.toBeNull();
    expect(schema?.type).toBe('plan');
    expect(schema?.planId).toBe('plan-456');
    expect(schema?.title).toBe('Implement feature X');
    expect(schema?.status).toBe('in-progress');
    expect(schema?.stepsCompleted).toBe(3);
    expect(schema?.totalSteps).toBe(5);
    expect(schema?.sequence).toBe(10);
  });

  it('returns null for non-plan context updates', () => {
    const contextCard = {
      type: 'context',
      updateType: 'FileRead',
      data: 'src/index.ts',
      sequence: 10,
    };

    const schema = createPlanCardSchema(contextCard);

    expect(schema).toBeNull();
  });

  it('returns null for malformed plan data', () => {
    const contextCard = {
      type: 'context',
      updateType: 'MemoryUpdate',
      data: '{ invalid json }',
      sequence: 10,
    };

    const schema = createPlanCardSchema(contextCard);

    expect(schema).toBeNull();
  });

  it('handles missing optional plan fields', () => {
    const planData = JSON.stringify({
      title: 'Simple plan',
    });

    const contextCard = {
      type: 'context',
      updateType: 'MemoryUpdate',
      data: planData,
      sequence: 10,
    };

    const schema = createPlanCardSchema(contextCard);

    expect(schema).not.toBeNull();
    expect(schema?.planId).toMatch(/^plan-/);
    expect(schema?.title).toBe('Simple plan');
    expect(schema?.status).toBe('pending');
    expect(schema?.stepsCompleted).toBe(0);
    expect(schema?.totalSteps).toBe(0);
  });
});

describe('Card Schema - Status Card', () => {
  it('creates status card schema from error card', () => {
    const errorCard = {
      type: 'error',
      code: 'ToolFailed',
      message: 'Command failed with exit code 1',
      recoverable: true,
      sequence: 15,
    };

    const schema = createStatusCardSchema(errorCard);

    expect(schema).not.toBeNull();
    expect(schema?.type).toBe('status');
    expect(schema?.statusId).toBe('error-15');
    expect(schema?.label).toBe('ToolFailed');
    expect(schema?.description).toBe('Command failed with exit code 1');
    expect(schema?.severity).toBe('warning');
    expect(schema?.sequence).toBe(15);
  });

  it('creates status card schema with error severity for non-recoverable errors', () => {
    const errorCard = {
      type: 'error',
      code: 'AgentCrash',
      message: 'Agent process crashed',
      recoverable: false,
      sequence: 15,
    };

    const schema = createStatusCardSchema(errorCard);

    expect(schema?.severity).toBe('error');
  });

  it('creates session status card from status string', () => {
    const schema = createSessionStatusCardSchema('Working', 20);

    expect(schema?.type).toBe('status');
    expect(schema?.label).toBe('Working');
    expect(schema?.severity).toBe('info');
    expect(schema?.sequence).toBe(20);
  });

  it('maps session status to correct severity', () => {
    expect(createSessionStatusCardSchema('Complete', 1)?.severity).toBe('success');
    expect(createSessionStatusCardSchema('Cancelled', 1)?.severity).toBe('warning');
    expect(createSessionStatusCardSchema('Error', 1)?.severity).toBe('error');
  });

  it('returns null for invalid error card', () => {
    const invalidCard = {
      type: 'error',
      code: '',
      message: 'Error message',
      recoverable: true,
      sequence: 15,
    };

    const schema = createStatusCardSchema(invalidCard);

    expect(schema).toBeNull();
  });

  it('validates error card has all required fields', () => {
    const validCard = {
      type: 'error',
      code: 'ToolFailed',
      message: 'Error message',
      recoverable: true,
      sequence: 15,
    };

    expect(isValidErrorCard(validCard)).toBe(true);
    expect(isValidErrorCard({ type: 'error', code: 'ToolFailed' })).toBe(false);
    expect(isValidErrorCard(null)).toBe(false);
    expect(isValidErrorCard({})).toBe(false);
  });
});

describe('Card Schema - Fallback Behavior', () => {
  it('creates unknown card schema for unrecognized card types', () => {
    const unknownCard = { type: 'unknown_type', data: 'some data' };

    const schema = createCardSchema(unknownCard);

    expect(isUnknownCardSchema(schema)).toBe(true);
    expect(schema?.type).toBe('unknown');
    expect(schema?.message).toBe('Unknown card type: unknown_type');
    expect(schema?.originalData).toEqual(unknownCard);
  });

  it('creates unknown card schema for invalid card data', () => {
    const invalidCard = null;

    const schema = createCardSchema(invalidCard);

    expect(isUnknownCardSchema(schema)).toBe(true);
    expect(schema?.type).toBe('unknown');
    expect(schema?.message).toBe('Invalid card data');
  });

  it('creates unknown card schema for invalid permission card', () => {
    const invalidPermission = {
      type: 'permission',
      toolUseId: '',
      toolName: 'bash',
      input: 'ls -la',
      isPending: true,
      sequence: 5,
    };

    const schema = createCardSchema(invalidPermission);

    expect(isUnknownCardSchema(schema)).toBe(true);
    expect(schema?.message).toBe('Invalid permission card');
  });

  it('creates unknown card schema for invalid tool card', () => {
    const invalidTool = {
      type: 'tool',
      toolUseId: '',
      toolName: 'bash',
      status: 'Completed',
      updatedAt: 1000,
    };

    const schema = createCardSchema(invalidTool);

    expect(isUnknownCardSchema(schema)).toBe(true);
    expect(schema?.message).toBe('Invalid tool card');
  });

  it('creates unknown card schema for invalid plan card', () => {
    const invalidContext = {
      type: 'context',
      updateType: 'FileRead',
      data: 'src/index.ts',
      sequence: 10,
    };

    const schema = createCardSchema(invalidContext);

    expect(isUnknownCardSchema(schema)).toBe(true);
    expect(schema?.message).toBe('Invalid plan card');
  });

  it('creates unknown card schema for invalid error card', () => {
    const invalidError = {
      type: 'error',
      code: '',
      message: 'Error message',
      recoverable: true,
      sequence: 15,
    };

    const schema = createCardSchema(invalidError);

    expect(isUnknownCardSchema(schema)).toBe(true);
    expect(schema?.message).toBe('Invalid error card');
  });
});

describe('Card Schema - Type Guards', () => {
  it('correctly identifies permission card schemas', () => {
    const permissionSchema: PermissionCardSchema = {
      type: 'permission',
      toolUseId: 'tool-123',
      toolName: 'bash',
      reason: 'Execute command',
      inputSummary: 'ls -la',
      isPending: true,
      sequence: 5,
      actions: {
        allow: { type: 'allow', toolUseId: 'tool-123' },
        allowAlways: { type: 'allow-always', toolUseId: 'tool-123', toolName: 'bash' },
        deny: { type: 'deny', toolUseId: 'tool-123' },
        denyAlways: { type: 'deny-always', toolUseId: 'tool-123', toolName: 'bash' },
      },
    };

    expect(isPermissionCardSchema(permissionSchema)).toBe(true);
    expect(isToolCardSchema(permissionSchema)).toBe(false);
    expect(isPlanCardSchema(permissionSchema)).toBe(false);
    expect(isStatusCardSchema(permissionSchema)).toBe(false);
    expect(isUnknownCardSchema(permissionSchema)).toBe(false);
  });

  it('correctly identifies tool card schemas', () => {
    const toolSchema: ToolCardSchema = {
      type: 'tool',
      toolUseId: 'tool-123',
      toolName: 'bash',
      status: 'Completed',
      updatedAt: 1000,
    };

    expect(isPermissionCardSchema(toolSchema)).toBe(false);
    expect(isToolCardSchema(toolSchema)).toBe(true);
    expect(isPlanCardSchema(toolSchema)).toBe(false);
    expect(isStatusCardSchema(toolSchema)).toBe(false);
    expect(isUnknownCardSchema(toolSchema)).toBe(false);
  });

  it('correctly identifies plan card schemas', () => {
    const planSchema: PlanCardSchema = {
      type: 'plan',
      planId: 'plan-456',
      title: 'Implement feature',
      status: 'in-progress',
      stepsCompleted: 3,
      totalSteps: 5,
      sequence: 10,
    };

    expect(isPermissionCardSchema(planSchema)).toBe(false);
    expect(isToolCardSchema(planSchema)).toBe(false);
    expect(isPlanCardSchema(planSchema)).toBe(true);
    expect(isStatusCardSchema(planSchema)).toBe(false);
    expect(isUnknownCardSchema(planSchema)).toBe(false);
  });

  it('correctly identifies status card schemas', () => {
    const statusSchema: StatusCardSchema = {
      type: 'status',
      statusId: 'status-20',
      label: 'Working',
      severity: 'info',
      sequence: 20,
    };

    expect(isPermissionCardSchema(statusSchema)).toBe(false);
    expect(isToolCardSchema(statusSchema)).toBe(false);
    expect(isPlanCardSchema(statusSchema)).toBe(false);
    expect(isStatusCardSchema(statusSchema)).toBe(true);
    expect(isUnknownCardSchema(statusSchema)).toBe(false);
  });

  it('correctly identifies unknown card schemas', () => {
    const unknownSchema: UnknownCardSchema = {
      type: 'unknown',
      originalData: { type: 'custom' },
      message: 'Unknown type: custom',
      sequence: 0,
    };

    expect(isPermissionCardSchema(unknownSchema)).toBe(false);
    expect(isToolCardSchema(unknownSchema)).toBe(false);
    expect(isPlanCardSchema(unknownSchema)).toBe(false);
    expect(isStatusCardSchema(unknownSchema)).toBe(false);
    expect(isUnknownCardSchema(unknownSchema)).toBe(true);
  });
});

describe('EventCards - Component Rendering', () => {
  describe('PermissionCard', () => {
    it('renders pending permission card with all action buttons', () => {
      const schema: PermissionCardSchema = {
        type: 'permission',
        toolUseId: 'tool-123',
        toolName: 'bash',
        reason: 'Execute shell command',
        inputSummary: 'ls -la',
        isPending: true,
        sequence: 1,
        actions: {
          allow: { type: 'allow', toolUseId: 'tool-123' },
          allowAlways: { type: 'allow-always', toolUseId: 'tool-123', toolName: 'bash' },
          deny: { type: 'deny', toolUseId: 'tool-123' },
          denyAlways: { type: 'deny-always', toolUseId: 'tool-123', toolName: 'bash' },
        },
      };

      render(<PermissionCard schema={schema} />);

      expect(screen.getByText('Permission Required')).toBeInTheDocument();
      expect(screen.getByText('Execute shell command')).toBeInTheDocument();
      expect(screen.getByText('ls -la')).toBeInTheDocument();
      expect(screen.getByText('Allow')).toBeInTheDocument();
      expect(screen.getByText('Always')).toBeInTheDocument();
      expect(screen.getByText('Deny')).toBeInTheDocument();
      expect(screen.getByText('Never')).toBeInTheDocument();
    });

    it('renders resolved permission card when not pending', () => {
      const schema: PermissionCardSchema = {
        type: 'permission',
        toolUseId: 'tool-123',
        toolName: 'bash',
        reason: 'Execute shell command',
        inputSummary: 'ls -la',
        isPending: false,
        sequence: 1,
        actions: {
          allow: { type: 'allow', toolUseId: 'tool-123' },
          allowAlways: { type: 'allow-always', toolUseId: 'tool-123', toolName: 'bash' },
          deny: { type: 'deny', toolUseId: 'tool-123' },
          denyAlways: { type: 'deny-always', toolUseId: 'tool-123', toolName: 'bash' },
        },
      };

      render(<PermissionCard schema={schema} />);

      expect(screen.getByText('Permission Resolved')).toBeInTheDocument();
      expect(screen.queryByText('Allow')).not.toBeInTheDocument();
    });

    it('dispatches allow action when Allow button clicked', () => {
      const onAction = vi.fn();
      const schema: PermissionCardSchema = {
        type: 'permission',
        toolUseId: 'tool-123',
        toolName: 'bash',
        reason: 'Execute shell command',
        inputSummary: '',
        isPending: true,
        sequence: 1,
        actions: {
          allow: { type: 'allow', toolUseId: 'tool-123' },
          allowAlways: { type: 'allow-always', toolUseId: 'tool-123', toolName: 'bash' },
          deny: { type: 'deny', toolUseId: 'tool-123' },
          denyAlways: { type: 'deny-always', toolUseId: 'tool-123', toolName: 'bash' },
        },
      };

      render(<PermissionCard schema={schema} onAction={onAction} />);

      fireEvent.click(screen.getByText('Allow'));
      expect(onAction).toHaveBeenCalledWith({ type: 'allow', toolUseId: 'tool-123' });
    });

    it('dispatches allow-always action when Always button clicked', () => {
      const onAction = vi.fn();
      const schema: PermissionCardSchema = {
        type: 'permission',
        toolUseId: 'tool-123',
        toolName: 'bash',
        reason: 'Execute shell command',
        inputSummary: '',
        isPending: true,
        sequence: 1,
        actions: {
          allow: { type: 'allow', toolUseId: 'tool-123' },
          allowAlways: { type: 'allow-always', toolUseId: 'tool-123', toolName: 'bash' },
          deny: { type: 'deny', toolUseId: 'tool-123' },
          denyAlways: { type: 'deny-always', toolUseId: 'tool-123', toolName: 'bash' },
        },
      };

      render(<PermissionCard schema={schema} onAction={onAction} />);

      fireEvent.click(screen.getByText('Always'));
      expect(onAction).toHaveBeenCalledWith({ type: 'allow-always', toolUseId: 'tool-123', toolName: 'bash' });
    });

    it('dispatches deny action when Deny button clicked', () => {
      const onAction = vi.fn();
      const schema: PermissionCardSchema = {
        type: 'permission',
        toolUseId: 'tool-123',
        toolName: 'bash',
        reason: 'Execute shell command',
        inputSummary: '',
        isPending: true,
        sequence: 1,
        actions: {
          allow: { type: 'allow', toolUseId: 'tool-123' },
          allowAlways: { type: 'allow-always', toolUseId: 'tool-123', toolName: 'bash' },
          deny: { type: 'deny', toolUseId: 'tool-123' },
          denyAlways: { type: 'deny-always', toolUseId: 'tool-123', toolName: 'bash' },
        },
      };

      render(<PermissionCard schema={schema} onAction={onAction} />);

      fireEvent.click(screen.getByText('Deny'));
      expect(onAction).toHaveBeenCalledWith({ type: 'deny', toolUseId: 'tool-123' });
    });

    it('dispatches deny-always action when Never button clicked', () => {
      const onAction = vi.fn();
      const schema: PermissionCardSchema = {
        type: 'permission',
        toolUseId: 'tool-123',
        toolName: 'bash',
        reason: 'Execute shell command',
        inputSummary: '',
        isPending: true,
        sequence: 1,
        actions: {
          allow: { type: 'allow', toolUseId: 'tool-123' },
          allowAlways: { type: 'allow-always', toolUseId: 'tool-123', toolName: 'bash' },
          deny: { type: 'deny', toolUseId: 'tool-123' },
          denyAlways: { type: 'deny-always', toolUseId: 'tool-123', toolName: 'bash' },
        },
      };

      render(<PermissionCard schema={schema} onAction={onAction} />);

      fireEvent.click(screen.getByText('Never'));
      expect(onAction).toHaveBeenCalledWith({ type: 'deny-always', toolUseId: 'tool-123', toolName: 'bash' });
    });
  });

  describe('ToolCard', () => {
    it('renders tool card with status Started', () => {
      const schema: ToolCardSchema = {
        type: 'tool',
        toolUseId: 'tool-123',
        toolName: 'bash',
        status: 'Started',
        inputSummary: 'ls -la',
        updatedAt: Date.now(),
      };

      render(<ToolCard schema={schema} />);

      expect(screen.getByText('bash')).toBeInTheDocument();
      expect(screen.getByText('Started')).toBeInTheDocument();
      expect(screen.getByText('ls -la')).toBeInTheDocument();
    });

    it('renders tool card with status Completed and output', () => {
      const schema: ToolCardSchema = {
        type: 'tool',
        toolUseId: 'tool-123',
        toolName: 'bash',
        status: 'Completed',
        inputSummary: 'echo hello',
        outputSummary: 'hello',
        updatedAt: Date.now(),
      };

      render(<ToolCard schema={schema} />);

      expect(screen.getByText('bash')).toBeInTheDocument();
      expect(screen.getByText('Completed')).toBeInTheDocument();
      expect(screen.getByText('Output:')).toBeInTheDocument();
      expect(screen.getByText('hello')).toBeInTheDocument();
    });

    it('renders tool card with error', () => {
      const schema: ToolCardSchema = {
        type: 'tool',
        toolUseId: 'tool-123',
        toolName: 'bash',
        status: 'Error',
        inputSummary: 'invalid_command',
        error: 'Command not found',
        updatedAt: Date.now(),
      };

      render(<ToolCard schema={schema} />);

      expect(screen.getByText('bash')).toBeInTheDocument();
      expect(screen.getByText('Error')).toBeInTheDocument();
      expect(screen.getByText('Command not found')).toBeInTheDocument();
    });
  });

  describe('PlanCard', () => {
    it('renders plan card with progress', () => {
      const schema: PlanCardSchema = {
        type: 'plan',
        planId: 'plan-456',
        title: 'Implement feature',
        description: 'Step-by-step implementation plan',
        status: 'in-progress',
        stepsCompleted: 3,
        totalSteps: 5,
        sequence: 10,
      };

      render(<PlanCard schema={schema} />);

      expect(screen.getByText('Implement feature')).toBeInTheDocument();
      expect(screen.getByText('Step-by-step implementation plan')).toBeInTheDocument();
      expect(screen.getByText('in-progress')).toBeInTheDocument();
      expect(screen.getByText('3/5')).toBeInTheDocument();
    });

    it('renders plan card without description', () => {
      const schema: PlanCardSchema = {
        type: 'plan',
        planId: 'plan-456',
        title: 'Simple plan',
        status: 'pending',
        stepsCompleted: 0,
        totalSteps: 0,
        sequence: 10,
      };

      render(<PlanCard schema={schema} />);

      expect(screen.getByText('Simple plan')).toBeInTheDocument();
      expect(screen.getByText('pending')).toBeInTheDocument();
    });
  });

  describe('StatusCard', () => {
    it('renders status card with info severity', () => {
      const schema: StatusCardSchema = {
        type: 'status',
        statusId: 'status-1',
        label: 'Working',
        description: 'Processing request',
        severity: 'info',
        sequence: 1,
      };

      render(<StatusCard schema={schema} />);

      expect(screen.getByText('Working')).toBeInTheDocument();
      expect(screen.getByText('Processing request')).toBeInTheDocument();
      expect(screen.getByText('info')).toBeInTheDocument();
    });

    it('renders status card with error severity', () => {
      const schema: StatusCardSchema = {
        type: 'status',
        statusId: 'status-1',
        label: 'Error',
        description: 'Something went wrong',
        severity: 'error',
        sequence: 1,
      };

      render(<StatusCard schema={schema} />);

      expect(screen.getByText('Error')).toBeInTheDocument();
      expect(screen.getByText('error')).toBeInTheDocument();
    });
  });

  describe('UnknownCard', () => {
    it('renders unknown card with message', () => {
      const schema: UnknownCardSchema = {
        type: 'unknown',
        message: 'Unknown card type: custom',
        originalData: { type: 'custom' },
        sequence: 0,
      };

      render(<UnknownCard schema={schema} />);

      expect(screen.getByText('Unknown Event')).toBeInTheDocument();
      expect(screen.getByText('Unknown card type: custom')).toBeInTheDocument();
    });

    it('renders unknown card with debug data', () => {
      const schema: UnknownCardSchema = {
        type: 'unknown',
        message: 'Unknown card type: custom',
        originalData: { foo: 'bar', num: 123 },
        sequence: 0,
      };

      render(<UnknownCard schema={schema} />);

      expect(screen.getByText('Debug Data')).toBeInTheDocument();
    });
  });

  describe('EventCard unified component', () => {
    it('renders PermissionCard for permission schema', () => {
      const schema: PermissionCardSchema = {
        type: 'permission',
        toolUseId: 'tool-123',
        toolName: 'bash',
        reason: 'Execute command',
        inputSummary: '',
        isPending: true,
        sequence: 1,
        actions: {
          allow: { type: 'allow', toolUseId: 'tool-123' },
          allowAlways: { type: 'allow-always', toolUseId: 'tool-123', toolName: 'bash' },
          deny: { type: 'deny', toolUseId: 'tool-123' },
          denyAlways: { type: 'deny-always', toolUseId: 'tool-123', toolName: 'bash' },
        },
      };

      render(<EventCard schema={schema} />);
      expect(screen.getByText('Permission Required')).toBeInTheDocument();
    });

    it('renders ToolCard for tool schema', () => {
      const schema: ToolCardSchema = {
        type: 'tool',
        toolUseId: 'tool-123',
        toolName: 'bash',
        status: 'Completed',
        updatedAt: Date.now(),
      };

      render(<EventCard schema={schema} />);
      expect(screen.getByText('bash')).toBeInTheDocument();
    });

    it('renders PlanCard for plan schema', () => {
      const schema: PlanCardSchema = {
        type: 'plan',
        planId: 'plan-456',
        title: 'Test Plan',
        status: 'pending',
        stepsCompleted: 0,
        totalSteps: 5,
        sequence: 1,
      };

      render(<EventCard schema={schema} />);
      expect(screen.getByText('Test Plan')).toBeInTheDocument();
    });

    it('renders StatusCard for status schema', () => {
      const schema: StatusCardSchema = {
        type: 'status',
        statusId: 'status-1',
        label: 'Working',
        severity: 'info',
        sequence: 1,
      };

      render(<EventCard schema={schema} />);
      expect(screen.getByText('Working')).toBeInTheDocument();
    });

    it('renders UnknownCard for unknown schema', () => {
      const schema: UnknownCardSchema = {
        type: 'unknown',
        message: 'Unknown type',
        originalData: null,
        sequence: 0,
      };

      render(<EventCard schema={schema} />);
      expect(screen.getByText('Unknown Event')).toBeInTheDocument();
    });
  });

  describe('EventContentPart', () => {
    it('renders permission card for data part with name permission', () => {
      const part = {
        type: 'data',
        name: 'permission',
        data: { toolUseId: 'tool-123', toolName: 'bash' },
      };

      render(<EventContentPart part={part} />);
      expect(screen.getByText('Permission Required')).toBeInTheDocument();
    });

    it('renders tool card for tool-call part', () => {
      const part = {
        type: 'tool-call',
        toolCallId: 'tool-123',
        toolName: 'bash',
        status: 'Started',
      };

      render(<EventContentPart part={part} />);
      expect(screen.getByText('bash')).toBeInTheDocument();
    });

    it('calls onPermissionAction when permission action triggered', () => {
      const onPermissionAction = vi.fn();
      const part = {
        type: 'data',
        name: 'permission',
        data: { toolUseId: 'tool-123', toolName: 'bash' },
      };

      render(<EventContentPart part={part} onPermissionAction={onPermissionAction} />);
      fireEvent.click(screen.getByText('Allow'));

      expect(onPermissionAction).toHaveBeenCalled();
    });
  });
});

describe('EventCards - Safe Action Dispatch', () => {
  it('permission actions contain only safe, predefined fields', () => {
    const schema: PermissionCardSchema = {
      type: 'permission',
      toolUseId: 'tool-123',
      toolName: 'bash',
      reason: 'Execute command',
      inputSummary: '',
      isPending: true,
      sequence: 1,
      actions: {
        allow: { type: 'allow', toolUseId: 'tool-123' },
        allowAlways: { type: 'allow-always', toolUseId: 'tool-123', toolName: 'bash' },
        deny: { type: 'deny', toolUseId: 'tool-123' },
        denyAlways: { type: 'deny-always', toolUseId: 'tool-123', toolName: 'bash' },
      },
    };

    const onAction = vi.fn();
    render(<PermissionCard schema={schema} onAction={onAction} />);

    fireEvent.click(screen.getByText('Allow'));
    const action = onAction.mock.calls[0][0];

    expect(Object.keys(action)).toContain('type');
    expect(Object.keys(action)).toContain('toolUseId');
    expect(typeof action.type).toBe('string');
    expect(typeof action.toolUseId).toBe('string');
    expect(action.type).toBe('allow');
    expect(action.toolUseId).toBe('tool-123');
  });

  it('permission actions do not contain arbitrary function references', () => {
    const schema: PermissionCardSchema = {
      type: 'permission',
      toolUseId: 'tool-123',
      toolName: 'bash',
      reason: 'Execute command',
      inputSummary: '',
      isPending: true,
      sequence: 1,
      actions: {
        allow: { type: 'allow', toolUseId: 'tool-123' },
        allowAlways: { type: 'allow-always', toolUseId: 'tool-123', toolName: 'bash' },
        deny: { type: 'deny', toolUseId: 'tool-123' },
        denyAlways: { type: 'deny-always', toolUseId: 'tool-123', toolName: 'bash' },
      },
    };

    const onAction = vi.fn();
    render(<PermissionCard schema={schema} onAction={onAction} />);

    fireEvent.click(screen.getByText('Allow'));
    const action = onAction.mock.calls[0][0];

    const values = Object.values(action);
    values.forEach((value) => {
      expect(typeof value).not.toBe('function');
    });
  });

  it('unknown card fallback preserves original data safely', () => {
    const originalData = { type: 'custom', payload: { nested: 'value' } };
    const schema: UnknownCardSchema = {
      type: 'unknown',
      message: 'Unknown card type: custom',
      originalData,
      sequence: 0,
    };

    render(<UnknownCard schema={schema} />);
    expect(screen.getByText('Debug Data')).toBeInTheDocument();
  });
});
