import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  handleError,
  handlePtyCrash,
  handleGitFailure,
  handleAgentCrash,
  handleDbError,
  sendDbReset,
  ErrorCodes,
} from '../error-recovery';
import { useToastStore, useStore } from '../../store';
import { getWebSocketClient } from '../ws';
import type { PtyCrashError, GitFailureError, AgentCrashError, DbError, Error as ServerError } from '../../types/generated/protocol';

vi.mock('../ws', () => ({
  getWebSocketClient: vi.fn(),
}));

vi.mock('../../store', () => ({
  useToastStore: {
    getState: vi.fn(),
  },
  useStore: {
    getState: vi.fn(),
  },
}));

describe('error-recovery', () => {
  let mockToastStore: {
    addNotification: ReturnType<typeof vi.fn>;
    removeNotification: ReturnType<typeof vi.fn>;
    notifications: unknown[];
  };
  let mockStore: {
    setDbResetDialogOpen: ReturnType<typeof vi.fn>;
  };
  let mockWebSocketClient: {
    send: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    
    mockToastStore = {
      addNotification: vi.fn(),
      removeNotification: vi.fn(),
      notifications: [],
    };
    
    mockStore = {
      setDbResetDialogOpen: vi.fn(),
    };
    
    mockWebSocketClient = {
      send: vi.fn(),
    };
    
    vi.mocked(useToastStore.getState).mockReturnValue(mockToastStore as unknown as ReturnType<typeof useToastStore.getState>);
    vi.mocked(useStore.getState).mockReturnValue(mockStore as unknown as ReturnType<typeof useStore.getState>);
    vi.mocked(getWebSocketClient).mockReturnValue(mockWebSocketClient as unknown as ReturnType<typeof getWebSocketClient>);
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('handlePtyCrash', () => {
    it('should show toast with crash message', () => {
      const error: PtyCrashError = {
        type: 'Error',
        code: ErrorCodes.PTY_CRASH,
        message: 'PTY process terminated unexpectedly',
        sessionId: 'session-123',
        worktreeId: 'worktree-456',
      };

      handlePtyCrash(error);

      expect(mockToastStore.addNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          variant: 'error',
          title: 'Terminal Session Crashed',
          description: 'Restarting terminal session...',
        })
      );
    });

    it('should send TerminalCreate message to restart PTY', () => {
      const error: PtyCrashError = {
        type: 'Error',
        code: ErrorCodes.PTY_CRASH,
        message: 'PTY process terminated',
        sessionId: 'session-123',
        worktreeId: 'worktree-456',
      };

      handlePtyCrash(error);

      expect(mockWebSocketClient.send).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'TerminalCreate',
          worktreeId: 'worktree-456',
        })
      );
    });

    it('should use context worktreeId if error worktreeId missing', () => {
      const error = {
        type: 'Error' as const,
        code: ErrorCodes.PTY_CRASH,
        message: 'PTY process terminated',
        sessionId: 'session-123',
      };

      handlePtyCrash(error as PtyCrashError, { worktreeId: 'context-worktree' });

      expect(mockWebSocketClient.send).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'TerminalCreate',
          worktreeId: 'context-worktree',
        })
      );
    });

    it('should not send TerminalCreate if no worktreeId available', () => {
      const error = {
        type: 'Error' as const,
        code: ErrorCodes.PTY_CRASH,
        message: 'PTY process terminated',
        sessionId: 'session-123',
      };

      handlePtyCrash(error as PtyCrashError);

      expect(mockWebSocketClient.send).not.toHaveBeenCalled();
    });
  });

  describe('handleGitFailure', () => {
    it('should show toast with git error message', () => {
      const error: GitFailureError = {
        type: 'Error',
        code: ErrorCodes.GIT_FAILURE,
        message: 'Merge conflict detected',
        worktreeId: 'worktree-456',
        operation: 'merge',
      };

      handleGitFailure(error);

      expect(mockToastStore.addNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          variant: 'error',
          title: 'Git merge failed',
          description: 'Merge conflict detected',
          duration: 8000,
        })
      );
    });

    it('should show conflict files in description', () => {
      const error: GitFailureError = {
        type: 'Error',
        code: ErrorCodes.GIT_FAILURE,
        message: 'Conflicts found',
        worktreeId: 'worktree-456',
        operation: 'merge',
        conflictFiles: ['src/app.ts', 'src/utils.ts', 'src/index.ts'],
      };

      handleGitFailure(error);

      expect(mockToastStore.addNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          description: 'Conflict in: src/app.ts, src/utils.ts, src/index.ts',
        })
      );
    });

    it('should truncate conflict files list with "and X more"', () => {
      const error: GitFailureError = {
        type: 'Error',
        code: ErrorCodes.GIT_FAILURE,
        message: 'Conflicts found',
        worktreeId: 'worktree-456',
        operation: 'merge',
        conflictFiles: ['src/a.ts', 'src/b.ts', 'src/c.ts', 'src/d.ts', 'src/e.ts'],
      };

      handleGitFailure(error);

      expect(mockToastStore.addNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          description: 'Conflict in: src/a.ts, src/b.ts, src/c.ts and 2 more',
        })
      );
    });

    it('should show correct operation type in title', () => {
      const operations: Array<GitFailureError['operation']> = ['commit', 'push', 'pull', 'checkout', 'other'];
      
      operations.forEach((operation) => {
        const error: GitFailureError = {
          type: 'Error',
          code: ErrorCodes.GIT_FAILURE,
          message: 'Operation failed',
          worktreeId: 'worktree-456',
          operation,
        };

        handleGitFailure(error);

        expect(mockToastStore.addNotification).toHaveBeenCalledWith(
          expect.objectContaining({
            title: `Git ${operation} failed`,
          })
        );
      });
    });
  });

  describe('handleAgentCrash', () => {
    it('should show toast with agent name', () => {
      const error: AgentCrashError = {
        type: 'Error',
        code: ErrorCodes.AGENT_CRASH,
        message: 'Agent process terminated',
        worktreeId: 'worktree-456',
        agentType: 'builder',
      };

      handleAgentCrash(error);

      expect(mockToastStore.addNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          variant: 'error',
          title: 'builder Crashed',
          description: 'You can restart the agent from the worktree context menu.',
        })
      );
    });

    it('should use context agent name if provided', () => {
      const error: AgentCrashError = {
        type: 'Error',
        code: ErrorCodes.AGENT_CRASH,
        message: 'Agent process terminated',
        worktreeId: 'worktree-456',
        agentType: 'builder',
      };

      handleAgentCrash(error, { agentName: 'My Custom Agent' });

      expect(mockToastStore.addNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'My Custom Agent Crashed',
        })
      );
    });

    it('should use agentType as fallback name', () => {
      const error: AgentCrashError = {
        type: 'Error',
        code: ErrorCodes.AGENT_CRASH,
        message: 'Agent process terminated',
        worktreeId: 'worktree-456',
        agentType: 'orchestrator',
      };

      handleAgentCrash(error);

      expect(mockToastStore.addNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'orchestrator Crashed',
        })
      );
    });

    it('should use "Agent" as default name when no type available', () => {
      const error = {
        type: 'Error' as const,
        code: ErrorCodes.AGENT_CRASH,
        message: 'Agent process terminated',
        worktreeId: 'worktree-456',
      };

      handleAgentCrash(error as AgentCrashError);

      expect(mockToastStore.addNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Agent Crashed',
        })
      );
    });
  });

  describe('handleDbError', () => {
    it('should show toast with database error', () => {
      const error: DbError = {
        type: 'Error',
        code: ErrorCodes.DB_ERROR,
        message: 'Failed to read from database',
        operation: 'read',
      };

      handleDbError(error);

      expect(mockToastStore.addNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          variant: 'error',
          title: 'Database Error',
          description: 'Failed to read from database',
          duration: 0,
        })
      );
    });

    it('should open the reset dialog', () => {
      const error: DbError = {
        type: 'Error',
        code: ErrorCodes.DB_ERROR,
        message: 'Database corrupted',
        operation: 'migration',
      };

      handleDbError(error);

      expect(mockStore.setDbResetDialogOpen).toHaveBeenCalledWith(true, 'Database corrupted');
    });
  });

  describe('sendDbReset', () => {
    it('should send UpdateSettings message with db_reset key', () => {
      sendDbReset();

      expect(mockWebSocketClient.send).toHaveBeenCalledWith({
        type: 'UpdateSettings',
        key: 'db_reset',
        value: 'true',
      });
    });
  });

  describe('handleError', () => {
    it('should dispatch to handlePtyCrash for PTY crash errors', () => {
      const error: PtyCrashError = {
        type: 'Error',
        code: ErrorCodes.PTY_CRASH,
        message: 'PTY crashed',
        sessionId: 'session-123',
        worktreeId: 'worktree-456',
      };

      handleError(error);

      expect(mockToastStore.addNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Terminal Session Crashed',
        })
      );
      expect(mockWebSocketClient.send).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'TerminalCreate',
        })
      );
    });

    it('should dispatch to handleGitFailure for git errors', () => {
      const error: GitFailureError = {
        type: 'Error',
        code: ErrorCodes.GIT_FAILURE,
        message: 'Merge failed',
        worktreeId: 'worktree-456',
        operation: 'merge',
      };

      handleError(error);

      expect(mockToastStore.addNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Git merge failed',
        })
      );
    });

    it('should dispatch to handleAgentCrash for agent errors', () => {
      const error: AgentCrashError = {
        type: 'Error',
        code: ErrorCodes.AGENT_CRASH,
        message: 'Agent crashed',
        worktreeId: 'worktree-456',
        agentType: 'builder',
      };

      handleError(error);

      expect(mockToastStore.addNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'builder Crashed',
        })
      );
    });

    it('should dispatch to handleDbError for database errors', () => {
      const error: DbError = {
        type: 'Error',
        code: ErrorCodes.DB_ERROR,
        message: 'Database error',
        operation: 'read',
      };

      handleError(error);

      expect(mockToastStore.addNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Database Error',
        })
      );
      expect(mockStore.setDbResetDialogOpen).toHaveBeenCalledWith(true, 'Database error');
    });

    it('should show generic toast for unknown error codes', () => {
      const error: ServerError = {
        type: 'Error',
        code: 'unknown_error',
        message: 'Something went wrong',
      };

      handleError(error);

      expect(mockToastStore.addNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          variant: 'error',
          title: 'Error',
          description: 'Something went wrong',
          duration: 5000,
        })
      );
    });

    it('should pass context to specific handlers', () => {
      const error = {
        type: 'Error' as const,
        code: ErrorCodes.AGENT_CRASH,
        message: 'Agent crashed',
        worktreeId: 'worktree-456',
      };

      handleError(error as AgentCrashError, { agentName: 'Custom Agent' });

      expect(mockToastStore.addNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Custom Agent Crashed',
        })
      );
    });
  });

  describe('ErrorCodes export', () => {
    it('should export all error codes', () => {
      expect(ErrorCodes.PTY_CRASH).toBe('pty_crash');
      expect(ErrorCodes.GIT_FAILURE).toBe('git_failure');
      expect(ErrorCodes.AGENT_CRASH).toBe('agent_crash');
      expect(ErrorCodes.DB_ERROR).toBe('db_error');
    });
  });
});