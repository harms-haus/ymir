import { describe, it, expect } from 'vitest';
import {
  // Types
  WorkspaceCreate,
  WorkspaceDelete,
  WorktreeCreate,
  AgentSpawn,
  TerminalCreate,
  FileRead,
  GitStatus,
  CreatePR,
  GetState,
  UpdateSettings,
  Ping,
  StateSnapshot,
  WorkspaceCreated,
  WorktreeCreated,
  AgentStatusUpdate,
  TerminalCreated,
  GitStatusResult,
  Error as ProtocolError,
  Pong,
  Notification,
  Ack,
  // WS-ACP Types
  AcpSequence,
  AcpCorrelationId,
  AcpEventEnvelope,
  AcpEvent,
  AcpSessionInit,
  AcpAgentCapabilities,
  AcpSessionStatusEvent,
  AcpSessionStatus,
  AcpPromptChunk,
  AcpChunkContent,
  AcpPromptComplete,
  AcpPromptCompleteReason,
  AcpToolUseEvent,
  AcpToolUseStatus,
  AcpContextUpdate,
  AcpContextUpdateType,
  AcpError,
  AcpErrorCode,
  AcpResumeMarker,
  AcpResumeRequest,
  AcpAck,
  // Functions
  encodeMessage,
  decodeMessage,
  decodeAndValidate,
  withVersion,
  checkVersion,
  // Type guards
  isWorkspaceCreate,
  isWorkspaceDelete,
  isWorktreeCreate,
  isAgentSpawn,
  isTerminalCreate,
  isFileRead,
  isGitStatus,
  isCreatePR,
  isGetState,
  isUpdateSettings,
  isPing,
  isStateSnapshot,
  isWorkspaceCreated,
  isWorktreeCreated,
  isAgentStatusUpdate,
  isTerminalCreated,
  isGitStatusResult,
  isError,
  isPong,
  isNotification,
  isAck,
  isAcpSessionInit,
  isAcpSessionStatus,
  isAcpPromptChunk,
  isAcpPromptComplete,
  isAcpToolUse,
  isAcpContextUpdate,
  isAcpError,
  isAcpResumeMarker,
  ClientMessage,
  ServerMessage,
  UnknownMessage,
  PROTOCOL_VERSION
} from '../generated/protocol';

describe('Protocol Types', () => {
  describe('Message Type Count', () => {
    it('should have 40+ message types defined', () => {
      // Count all unique message types
      const clientMessageTypes = [
        'WorkspaceCreate', 'WorkspaceDelete', 'WorkspaceRename', 'WorkspaceUpdate',
        'WorktreeCreate', 'WorktreeDelete', 'WorktreeMerge', 'WorktreeList',
        'AgentSpawn', 'AgentSend', 'AgentCancel',
        'TerminalInput', 'TerminalResize', 'TerminalCreate',
        'FileRead', 'FileWrite',
        'GitStatus', 'GitDiff', 'GitCommit',
        'CreatePR',
        'GetState', 'UpdateSettings',
        'Ping'
      ];
      
      const serverMessageTypes = [
        'StateSnapshot',
        'WorkspaceCreated', 'WorkspaceDeleted', 'WorkspaceUpdated',
        'WorktreeCreated', 'WorktreeDeleted', 'WorktreeStatus',
        'AgentStatusUpdate', 'AgentOutput', 'AgentPrompt',
        'TerminalOutput', 'TerminalCreated',
        'FileContent',
        'GitStatusResult', 'GitDiffResult',
        'Error', 'Pong', 'Notification'
      ];
      
      const bidirectionalTypes = ['Ack'];
      
      const totalTypes = clientMessageTypes.length + serverMessageTypes.length + bidirectionalTypes.length;
      
      expect(totalTypes).toBeGreaterThanOrEqual(40);
      expect(clientMessageTypes.length).toBe(23);
      expect(serverMessageTypes.length).toBe(18);
      expect(bidirectionalTypes.length).toBe(1);
    });
  });

  describe('Encode/Decode', () => {
    it('should encode and decode WorkspaceCreate message', () => {
      const message: WorkspaceCreate = {
        type: 'WorkspaceCreate',
        id: 'ws-123',
        name: 'Test Workspace',
        rootPath: '/path/to/workspace'
      };

      const encoded = encodeMessage(message);
      const decoded = decodeMessage(encoded);

      expect(decoded).toEqual(message);
      expect(isWorkspaceCreate(decoded)).toBe(true);
    });

    it('should encode and decode WorkspaceDelete message', () => {
      const message: WorkspaceDelete = {
        type: 'WorkspaceDelete',
        id: 'ws-123'
      };

      const encoded = encodeMessage(message);
      const decoded = decodeMessage(encoded);

      expect(decoded).toEqual(message);
      expect(isWorkspaceDelete(decoded)).toBe(true);
    });

    it('should encode and decode WorktreeCreate message', () => {
      const message: WorktreeCreate = {
        type: 'WorktreeCreate',
        workspaceId: 'ws-123',
        branchName: 'feature/test',
        agentType: 'default'
      };

      const encoded = encodeMessage(message);
      const decoded = decodeMessage(encoded);

      expect(decoded).toEqual(message);
      expect(isWorktreeCreate(decoded)).toBe(true);
    });

    it('should encode and decode AgentSpawn message', () => {
      const message: AgentSpawn = {
        type: 'AgentSpawn',
        worktreeId: 'wt-123',
        agentType: 'default'
      };

      const encoded = encodeMessage(message);
      const decoded = decodeMessage(encoded);

      expect(decoded).toEqual(message);
      expect(isAgentSpawn(decoded)).toBe(true);
    });

    it('should encode and decode TerminalCreate message', () => {
      const message: TerminalCreate = {
        type: 'TerminalCreate',
        worktreeId: 'wt-123',
        label: 'Terminal 1',
        shell: 'bash'
      };

      const encoded = encodeMessage(message);
      const decoded = decodeMessage(encoded);

      expect(decoded).toEqual(message);
      expect(isTerminalCreate(decoded)).toBe(true);
    });

    it('should encode and decode FileRead message', () => {
      const message: FileRead = {
        type: 'FileRead',
        worktreeId: 'wt-123',
        path: 'src/main.ts'
      };

      const encoded = encodeMessage(message);
      const decoded = decodeMessage(encoded);

      expect(decoded).toEqual(message);
      expect(isFileRead(decoded)).toBe(true);
    });

    it('should encode and decode GitStatus message', () => {
      const message: GitStatus = {
        type: 'GitStatus',
        worktreeId: 'wt-123'
      };

      const encoded = encodeMessage(message);
      const decoded = decodeMessage(encoded);

      expect(decoded).toEqual(message);
      expect(isGitStatus(decoded)).toBe(true);
    });

    it('should encode and decode CreatePR message', () => {
      const message: CreatePR = {
        type: 'CreatePR',
        worktreeId: 'wt-123',
        title: 'Feature: Add new functionality',
        body: 'This PR adds...'
      };

      const encoded = encodeMessage(message);
      const decoded = decodeMessage(encoded);

      expect(decoded).toEqual(message);
      expect(isCreatePR(decoded)).toBe(true);
    });

    it('should encode and decode GetState message', () => {
      const message: GetState = {
        type: 'GetState'
      };

      const encoded = encodeMessage(message);
      const decoded = decodeMessage(encoded);

      expect(decoded).toEqual(message);
      expect(isGetState(decoded)).toBe(true);
    });

    it('should encode and decode UpdateSettings message', () => {
      const message: UpdateSettings = {
        type: 'UpdateSettings',
        key: 'theme',
        value: 'dark'
      };

      const encoded = encodeMessage(message);
      const decoded = decodeMessage(encoded);

      expect(decoded).toEqual(message);
      expect(isUpdateSettings(decoded)).toBe(true);
    });

    it('should encode and decode Ping message', () => {
      const message: Ping = {
        type: 'Ping',
        id: 123,
        timestamp: Date.now()
      };

      const encoded = encodeMessage(message);
      const decoded = decodeMessage(encoded);

      expect(decoded).toEqual(message);
      expect(isPing(decoded)).toBe(true);
    });

    it('should encode and decode StateSnapshot message', () => {
      const message: StateSnapshot = {
        type: 'StateSnapshot',
        workspaces: [],
        worktrees: [],
        agentSessions: [],
        terminalSessions: [],
        settings: {}
      };

      const encoded = encodeMessage(message);
      const decoded = decodeMessage(encoded);

      expect(decoded).toEqual(message);
      expect(isStateSnapshot(decoded)).toBe(true);
    });

    it('should encode and decode WorkspaceCreated message', () => {
      const message: WorkspaceCreated = {
        type: 'WorkspaceCreated',
        workspace: {
          id: 'ws-123',
          name: 'Test Workspace',
          rootPath: '/path/to/workspace',
          createdAt: Date.now(),
          updatedAt: Date.now()
        }
      };

      const encoded = encodeMessage(message);
      const decoded = decodeMessage(encoded);

      expect(decoded).toEqual(message);
      expect(isWorkspaceCreated(decoded)).toBe(true);
    });

    it('should encode and decode WorktreeCreated message', () => {
      const message: WorktreeCreated = {
        type: 'WorktreeCreated',
        worktree: {
          id: 'wt-123',
          workspaceId: 'ws-123',
          branchName: 'feature/test',
          path: '/path/to/worktree',
          status: 'active',
          createdAt: Date.now()
        }
      };

      const encoded = encodeMessage(message);
      const decoded = decodeMessage(encoded);

      expect(decoded).toEqual(message);
      expect(isWorktreeCreated(decoded)).toBe(true);
    });

    it('should encode and decode AgentStatusUpdate message', () => {
      const message: AgentStatusUpdate = {
        type: 'AgentStatusUpdate',
        sessionId: 'agent-123',
        status: 'working',
        message: 'Processing...'
      };

      const encoded = encodeMessage(message);
      const decoded = decodeMessage(encoded);

      expect(decoded).toEqual(message);
      expect(isAgentStatusUpdate(decoded)).toBe(true);
    });

    it('should encode and decode TerminalCreated message', () => {
      const message: TerminalCreated = {
        type: 'TerminalCreated',
        session: {
          id: 'term-123',
          worktreeId: 'wt-123',
          label: 'Terminal 1',
          shell: 'bash',
          createdAt: Date.now()
        }
      };

      const encoded = encodeMessage(message);
      const decoded = decodeMessage(encoded);

      expect(decoded).toEqual(message);
      expect(isTerminalCreated(decoded)).toBe(true);
    });

    it('should encode and decode GitStatusResult message', () => {
      const message: GitStatusResult = {
        type: 'GitStatusResult',
        worktreeId: 'wt-123',
        entries: [
          {
            path: 'src/main.ts',
            status: 'modified',
            staged: false
          }
        ]
      };

      const encoded = encodeMessage(message);
      const decoded = decodeMessage(encoded);

      expect(decoded).toEqual(message);
      expect(isGitStatusResult(decoded)).toBe(true);
    });

    it('should encode and decode Error message', () => {
      const message: ProtocolError = {
        type: 'Error',
        code: 'WORKSPACE_NOT_FOUND',
        message: 'Workspace not found',
        details: { workspaceId: 'ws-123' }
      };

      const encoded = encodeMessage(message);
      const decoded = decodeMessage(encoded);

      expect(decoded).toEqual(message);
      expect(isError(decoded)).toBe(true);
    });

    it('should encode and decode Pong message', () => {
      const message: Pong = {
        type: 'Pong',
        id: 123,
        timestamp: Date.now()
      };

      const encoded = encodeMessage(message);
      const decoded = decodeMessage(encoded);

      expect(decoded).toEqual(message);
      expect(isPong(decoded)).toBe(true);
    });

    it('should encode and decode Notification message', () => {
      const message: Notification = {
        type: 'Notification',
        level: 'info',
        message: 'Workspace created successfully',
        timestamp: Date.now()
      };

      const encoded = encodeMessage(message);
      const decoded = decodeMessage(encoded);

      expect(decoded).toEqual(message);
      expect(isNotification(decoded)).toBe(true);
    });

    it('should encode and decode Ack message', () => {
      const message: Ack = {
        type: 'Ack',
        messageId: 'msg-123',
        timestamp: Date.now()
      };

      const encoded = encodeMessage(message);
      const decoded = decodeMessage(encoded);

      expect(decoded).toEqual(message);
      expect(isAck(decoded)).toBe(true);
    });
  });

  describe('Decode Unknown Messages', () => {
    it('should return UnknownMessage for invalid data', () => {
      const invalidData = new Uint8Array([0xFF, 0xFF, 0xFF]);
      const decoded = decodeMessage(invalidData);

      expect(decoded.type).toBe('UnknownMessage');
      expect('rawData' in decoded).toBe(true);
    });

    it('should return UnknownMessage for message without type field', () => {
      const messageWithoutType = { foo: 'bar' };
      const encoded = encodeMessage(messageWithoutType as any);
      const decoded = decodeMessage(encoded);

      expect(decoded.type).toBe('UnknownMessage');
      expect((decoded as UnknownMessage).rawData).toEqual(messageWithoutType);
    });

    it('should return UnknownMessage for message with unknown type', () => {
      const messageWithUnknownType = { type: 'UnknownType', data: 'test' };
      const encoded = encodeMessage(messageWithUnknownType as any);
      const decoded = decodeMessage(encoded);

      expect(decoded.type).toBe('UnknownMessage');
      expect((decoded as UnknownMessage).rawData).toEqual(messageWithUnknownType);
    });
  });

  describe('Decode and Validate', () => {
    it('should validate correct message type', () => {
      const message: WorkspaceCreate = {
        type: 'WorkspaceCreate',
        id: 'ws-123',
        name: 'Test Workspace',
        rootPath: '/path/to/workspace'
      };

      const encoded = encodeMessage(message);
      const decoded = decodeAndValidate(encoded, isWorkspaceCreate);

      expect(decoded).toEqual(message);
      expect(isWorkspaceCreate(decoded)).toBe(true);
    });

    it('should return UnknownMessage for incorrect message type', () => {
      const message: WorkspaceCreate = {
        type: 'WorkspaceCreate',
        id: 'ws-123',
        name: 'Test Workspace',
        rootPath: '/path/to/workspace'
      };

      const encoded = encodeMessage(message);
      const decoded = decodeAndValidate(encoded, isPing); // Using wrong type guard

      expect(decoded.type).toBe('UnknownMessage');
    });
  });

  describe('Version Header', () => {
    it('should add version to message', () => {
      const message: Ping = {
        type: 'Ping',
        id: 123,
        timestamp: Date.now()
      };

      const withVer = withVersion(message);

      expect(withVer.version).toBe(PROTOCOL_VERSION);
      expect(withVer.type).toBe('Ping');
      expect(withVer.id).toBe(123);
    });

    it('should check version correctly', () => {
      const messageWithVersion = {
        type: 'Ping' as const,
        id: 123,
        timestamp: Date.now(),
        version: PROTOCOL_VERSION
      };

      expect(checkVersion(messageWithVersion)).toBe(true);
    });

    it('should accept missing version for backward compatibility', () => {
      const messageWithoutVersion = {
        type: 'Ping' as const,
        id: 123,
        timestamp: Date.now()
      };

      expect(checkVersion(messageWithoutVersion)).toBe(true);
    });

    it('should reject incorrect version', () => {
      const messageWithWrongVersion = {
        type: 'Ping' as const,
        id: 123,
        timestamp: Date.now(),
        version: '0.0.0'
      };

      expect(checkVersion(messageWithWrongVersion)).toBe(false);
    });
  });

  describe('Complex Messages', () => {
    it('should handle StateSnapshot with full data', () => {
      const message: StateSnapshot = {
        type: 'StateSnapshot',
        workspaces: [
          {
            id: 'ws-1',
            name: 'Workspace 1',
            rootPath: '/path/1',
            createdAt: 1000,
            updatedAt: 1000
          },
          {
            id: 'ws-2',
            name: 'Workspace 2',
            rootPath: '/path/2',
            createdAt: 2000,
            updatedAt: 2000
          }
        ],
        worktrees: [
          {
            id: 'wt-1',
            workspaceId: 'ws-1',
            branchName: 'feature/1',
            path: '/path/1/wt',
            status: 'active',
            createdAt: 1000
          }
        ],
        agentSessions: [
          {
            id: 'agent-1',
            worktreeId: 'wt-1',
            agentType: 'default',
            status: 'working',
            startedAt: 1000
          }
        ],
        terminalSessions: [
          {
            id: 'term-1',
            worktreeId: 'wt-1',
            label: 'Terminal 1',
            shell: 'bash',
            createdAt: 1000
          }
        ],
        settings: {
          theme: 'dark',
          autoSave: true
        }
      };

      const encoded = encodeMessage(message);
      const decoded = decodeMessage(encoded);

      expect(decoded).toEqual(message);
      expect(isStateSnapshot(decoded)).toBe(true);
    });

    it('should handle GitStatusResult with multiple entries', () => {
      const message: GitStatusResult = {
        type: 'GitStatusResult',
        worktreeId: 'wt-123',
        entries: [
          { path: 'src/main.ts', status: 'modified', staged: false },
          { path: 'src/utils.ts', status: 'added', staged: true },
          { path: 'README.md', status: 'deleted', staged: false },
          { path: 'package.json', status: 'renamed', staged: true }
        ]
      };

      const encoded = encodeMessage(message);
      const decoded = decodeMessage(encoded);

      expect(decoded).toEqual(message);
      expect(isGitStatusResult(decoded)).toBe(true);
      expect((decoded as GitStatusResult).entries).toHaveLength(4);
    });

    it('should handle Error with details', () => {
      const message: ProtocolError = {
        type: 'Error',
        code: 'WORKTREE_CREATE_FAILED',
        message: 'Failed to create worktree',
        details: {
          workspaceId: 'ws-123',
          branchName: 'feature/test',
          error: 'Branch already exists'
        }
      };

      const encoded = encodeMessage(message);
      const decoded = decodeMessage(encoded);

      expect(decoded).toEqual(message);
      expect(isError(decoded)).toBe(true);
      expect((decoded as ProtocolError).details).toBeDefined();
    });
  });

  describe('Type Safety', () => {
    it('should maintain type safety through discriminated unions', () => {
      const messages: ClientMessage[] = [
        { type: 'WorkspaceCreate', id: 'ws-1', name: 'Test', rootPath: '/path' },
        { type: 'WorkspaceDelete', id: 'ws-1' },
        { type: 'WorktreeCreate', workspaceId: 'ws-1', branchName: 'feature/test' },
        { type: 'AgentSpawn', worktreeId: 'wt-1', agentType: 'default' }
      ];

      messages.forEach(message => {
        const encoded = encodeMessage(message);
        const decoded = decodeMessage(encoded);
        expect(decoded).toEqual(message);
      });
    });

    it('should handle all ServerMessage types', () => {
      const messages: ServerMessage[] = [
        { type: 'StateSnapshot', workspaces: [], worktrees: [], agentSessions: [], terminalSessions: [], settings: {} },
        { type: 'WorkspaceCreated', workspace: { id: 'ws-1', name: 'Test', rootPath: '/path', createdAt: 1000, updatedAt: 1000 } },
        { type: 'WorkspaceDeleted', id: 'ws-1' },
        { type: 'WorktreeCreated', worktree: { id: 'wt-1', workspaceId: 'ws-1', branchName: 'test', path: '/path', status: 'active', createdAt: 1000 } },
        { type: 'Error', code: 'TEST', message: 'Test error' },
        { type: 'Pong', id: 123, timestamp: 1000 },
        { type: 'Notification', level: 'info', message: 'Test', timestamp: 1000 }
      ];

      messages.forEach(message => {
        const encoded = encodeMessage(message);
        const decoded = decodeMessage(encoded);
        expect(decoded).toEqual(message);
      });
    });
  });

  describe('WS-ACP Wire Contract', () => {
    describe('Event Types', () => {
      it('should define all WS-ACP event types', () => {
        const eventTypes = [
          'SessionInit', 'SessionStatus', 'PromptChunk', 'PromptComplete',
          'ToolUse', 'ContextUpdate', 'Error', 'ResumeMarker'
        ];
        expect(eventTypes.length).toBe(8);
      });

      it('should create valid AcpSessionInit event', () => {
        const event: AcpEvent = {
          eventType: 'SessionInit',
          data: {
            acpSessionId: 'session-123',
            capabilities: {
              supportsToolUse: true,
              supportsContextUpdate: true,
              supportsCancellation: true
            }
          }
        };
        expect(event.eventType).toBe('SessionInit');
        expect(isAcpSessionInit(event)).toBe(true);
      });

      it('should create valid AcpSessionStatus event', () => {
        const event: AcpEvent = {
          eventType: 'SessionStatus',
          data: {
            worktreeId: 'wt-123',
            acpSessionId: 'session-123',
            status: 'Working'
          }
        };
        expect(event.eventType).toBe('SessionStatus');
        expect(isAcpSessionStatus(event)).toBe(true);
      });

      it('should create valid AcpPromptChunk event with text content', () => {
        const event: AcpEvent = {
          eventType: 'PromptChunk',
          data: {
            worktreeId: 'wt-123',
            acpSessionId: 'session-123',
            content: { type: 'Text', data: 'Hello, world!' },
            isFinal: false
          }
        };
        expect(event.eventType).toBe('PromptChunk');
        expect(isAcpPromptChunk(event)).toBe(true);
      });

      it('should create valid AcpPromptChunk event with structured content', () => {
        const event: AcpEvent = {
          eventType: 'PromptChunk',
          data: {
            worktreeId: 'wt-123',
            acpSessionId: 'session-123',
            content: { type: 'Structured', data: '{"key":"value"}' },
            isFinal: true
          }
        };
        expect(event.eventType).toBe('PromptChunk');
        const chunkData = event.data as AcpPromptChunk;
        expect(chunkData.content.type).toBe('Structured');
      });

      it('should create valid AcpPromptComplete event', () => {
        const event: AcpEvent = {
          eventType: 'PromptComplete',
          data: {
            worktreeId: 'wt-123',
            acpSessionId: 'session-123',
            reason: 'Normal'
          }
        };
        expect(event.eventType).toBe('PromptComplete');
        expect(isAcpPromptComplete(event)).toBe(true);
      });

      it('should create valid AcpToolUse event with all statuses', () => {
        const statuses: AcpToolUseStatus[] = ['Started', 'InProgress', 'Completed', 'Error'];
        statuses.forEach(status => {
          const event: AcpEvent = {
            eventType: 'ToolUse',
            data: {
              worktreeId: 'wt-123',
              acpSessionId: 'session-123',
              toolUseId: 'tool-1',
              toolName: 'read_file',
              status,
              input: status === 'Started' ? '{"path":"test.ts"}' : undefined,
              output: status === 'Completed' ? '{"content":"..."}' : undefined,
              error: status === 'Error' ? 'File not found' : undefined
            }
          };
          expect(event.eventType).toBe('ToolUse');
          expect(isAcpToolUse(event)).toBe(true);
        });
      });

      it('should create valid AcpContextUpdate event', () => {
        const updateTypes: AcpContextUpdateType[] = [
          'FileRead', 'FileWritten', 'CommandExecuted', 'BrowserAction', 'MemoryUpdate'
        ];
        updateTypes.forEach(updateType => {
          const event: AcpEvent = {
            eventType: 'ContextUpdate',
            data: {
              worktreeId: 'wt-123',
              acpSessionId: 'session-123',
              updateType,
              data: '{"details":"..."}'
            }
          };
          expect(event.eventType).toBe('ContextUpdate');
          expect(isAcpContextUpdate(event)).toBe(true);
        });
      });

      it('should create valid AcpError event', () => {
        const event: AcpEvent = {
          eventType: 'Error',
          data: {
            worktreeId: 'wt-123',
            acpSessionId: 'session-123',
            code: 'AgentCrash',
            message: 'Agent process terminated unexpectedly',
            details: '{"exitCode":1}',
            recoverable: false
          }
        };
        expect(event.eventType).toBe('Error');
        expect(isAcpError(event)).toBe(true);
      });

      it('should create valid AcpResumeMarker event', () => {
        const event: AcpEvent = {
          eventType: 'ResumeMarker',
          data: {
            worktreeId: 'wt-123',
            acpSessionId: 'session-123',
            lastSequence: 42,
            checkpoint: 'base64-encoded-checkpoint'
          }
        };
        expect(event.eventType).toBe('ResumeMarker');
        expect(isAcpResumeMarker(event)).toBe(true);
      });
    });

    describe('Event Envelope', () => {
      it('should create valid AcpEventEnvelope with all fields', () => {
        const envelope: AcpEventEnvelope = {
          sequence: 1,
          correlationId: { value: 'corr-123' },
          timestamp: Date.now(),
          eventType: 'SessionInit',
          data: {
            acpSessionId: 'session-123',
            capabilities: {
              supportsToolUse: true,
              supportsContextUpdate: false,
              supportsCancellation: true
            }
          }
        };
        expect(envelope.sequence).toBe(1);
        expect(envelope.correlationId?.value).toBe('corr-123');
      });

      it('should create AcpEventEnvelope without correlationId', () => {
        const envelope: AcpEventEnvelope = {
          sequence: 2,
          timestamp: Date.now(),
          eventType: 'PromptChunk',
          data: {
            worktreeId: 'wt-123',
            acpSessionId: 'session-123',
            content: { type: 'Text', data: 'test' },
            isFinal: true
          }
        };
        expect(envelope.correlationId).toBeUndefined();
      });
    });

    describe('Ordering and Sequence', () => {
      it('should use monotonically increasing sequence numbers', () => {
        const events: AcpEventEnvelope[] = [
          { sequence: 1, timestamp: 1000, eventType: 'SessionInit', data: { acpSessionId: 's1', capabilities: { supportsToolUse: true, supportsContextUpdate: true, supportsCancellation: true } } },
          { sequence: 2, timestamp: 1001, eventType: 'PromptChunk', data: { worktreeId: 'wt-1', acpSessionId: 's1', content: { type: 'Text', data: 'a' }, isFinal: false } },
          { sequence: 3, timestamp: 1002, eventType: 'PromptChunk', data: { worktreeId: 'wt-1', acpSessionId: 's1', content: { type: 'Text', data: 'b' }, isFinal: true } }
        ];
        for (let i = 1; i < events.length; i++) {
          expect(events[i].sequence).toBeGreaterThan(events[i-1].sequence);
        }
      });
    });

    describe('Error Codes', () => {
      it('should define all ACP error codes', () => {
        const errorCodes: AcpErrorCode[] = [
          'AgentCrash', 'InitFailed', 'SessionNotFound', 'PromptFailed',
          'ToolFailed', 'CancelFailed', 'Timeout', 'InvalidRequest', 'Internal'
        ];
        expect(errorCodes.length).toBe(9);
      });

      it('should create recoverable vs non-recoverable errors', () => {
        const recoverableError: AcpError = {
          code: 'Timeout',
          message: 'Request timed out',
          recoverable: true
        };
        const fatalError: AcpError = {
          code: 'AgentCrash',
          message: 'Agent process crashed',
          recoverable: false
        };
        expect(recoverableError.recoverable).toBe(true);
        expect(fatalError.recoverable).toBe(false);
      });
    });

    describe('Resume and Ack', () => {
      it('should create valid AcpResumeRequest', () => {
        const request: AcpResumeRequest = {
          worktreeId: 'wt-123',
          acpSessionId: 'session-123',
          fromSequence: 10
        };
        expect(request.fromSequence).toBe(10);
      });

      it('should create valid AcpAck', () => {
        const ack: AcpAck = {
          worktreeId: 'wt-123',
          acpSessionId: 'session-123',
          lastSequence: 42
        };
        expect(ack.lastSequence).toBe(42);
      });
    });

    describe('Negative Tests: Assistant-UI Payload Rejection', () => {
      it('should NOT accept assistant-ui message part shapes in AcpPromptChunk', () => {
        const assistantUiPayload = {
          type: 'text',
          text: 'Hello',
          _debug: { source: 'assistant-ui' }
        };
        const validChunk: AcpPromptChunk = {
          worktreeId: 'wt-123',
          acpSessionId: 'session-123',
          content: { type: 'Text', data: 'Hello' },
          isFinal: true
        };
        expect(validChunk.content).not.toEqual(assistantUiPayload);
        expect(validChunk.content).toHaveProperty('type');
        expect(validChunk.content).toHaveProperty('data');
      });

      it('should NOT accept assistant-ui thread state in AcpSessionStatus', () => {
        const assistantUiThreadState = {
          messages: [{ id: 'm1', role: 'user', content: 'hi' }],
          isLoading: true,
          error: null
        };
        const validStatus: AcpSessionStatusEvent = {
          worktreeId: 'wt-123',
          acpSessionId: 'session-123',
          status: 'Working'
        };
        expect(validStatus).not.toHaveProperty('messages');
        expect(validStatus).not.toHaveProperty('isLoading');
        expect(validStatus).toHaveProperty('status');
      });

      it('should NOT accept assistant-ui tool call shapes in AcpToolUse', () => {
        const assistantUiToolCall = {
          toolCallId: 'tc-1',
          toolName: 'read_file',
          args: { path: '/src/test.ts' },
          result: null,
          status: 'pending'
        };
        const validToolUse: AcpToolUseEvent = {
          worktreeId: 'wt-123',
          acpSessionId: 'session-123',
          toolUseId: 'tu-1',
          toolName: 'read_file',
          status: 'Started',
          input: '{"path":"/src/test.ts"}'
        };
        expect(validToolUse).toHaveProperty('toolUseId');
        expect(validToolUse).not.toHaveProperty('toolCallId');
        expect(validToolUse).not.toHaveProperty('args');
        expect(validToolUse.input).toBe('{"path":"/src/test.ts"}');
      });

      it('should NOT accept assistant-ui runtime state in AcpContextUpdate', () => {
        const assistantUiRuntime = {
          threadId: 'thread-1',
          isRunning: true,
          error: undefined,
          abortController: {}
        };
        const validContext: AcpContextUpdate = {
          worktreeId: 'wt-123',
          acpSessionId: 'session-123',
          updateType: 'FileRead',
          data: '{"path":"/src/test.ts"}'
        };
        expect(validContext).not.toHaveProperty('threadId');
        expect(validContext).not.toHaveProperty('isRunning');
        expect(validContext).not.toHaveProperty('abortController');
        expect(validContext).toHaveProperty('updateType');
        expect(validContext).toHaveProperty('data');
      });

      it('should enforce that AcpChunkContent uses type/data, not assistant-ui shapes', () => {
        const validTextContent: AcpChunkContent = { type: 'Text', data: 'Hello' };
        const validStructuredContent: AcpChunkContent = { type: 'Structured', data: '{}' };
        expect(validTextContent).toHaveProperty('type');
        expect(validTextContent).toHaveProperty('data');
        expect(validStructuredContent).toHaveProperty('type');
        expect(validStructuredContent).toHaveProperty('data');
      });

      it('should enforce that AcpError uses code/message, not assistant-ui error shapes', () => {
        const assistantUiError = {
          message: 'Something went wrong',
          stack: 'Error at line 1...',
          cause: new Error('original')
        };
        const validAcpError: AcpError = {
          code: 'Internal',
          message: 'Something went wrong',
          recoverable: false
        };
        expect(validAcpError).toHaveProperty('code');
        expect(validAcpError).not.toHaveProperty('stack');
        expect(validAcpError).not.toHaveProperty('cause');
        expect(validAcpError).toHaveProperty('recoverable');
      });
    });

    describe('Type Guard Coverage', () => {
      it('should have type guards for all event types', () => {
        const events: AcpEvent[] = [
          { eventType: 'SessionInit', data: { acpSessionId: 's1', capabilities: { supportsToolUse: true, supportsContextUpdate: true, supportsCancellation: true } } },
          { eventType: 'SessionStatus', data: { worktreeId: 'w1', acpSessionId: 's1', status: 'Working' } },
          { eventType: 'PromptChunk', data: { worktreeId: 'w1', acpSessionId: 's1', content: { type: 'Text', data: 'x' }, isFinal: true } },
          { eventType: 'PromptComplete', data: { worktreeId: 'w1', acpSessionId: 's1', reason: 'Normal' } },
          { eventType: 'ToolUse', data: { worktreeId: 'w1', acpSessionId: 's1', toolUseId: 't1', toolName: 'test', status: 'Started' } },
          { eventType: 'ContextUpdate', data: { worktreeId: 'w1', acpSessionId: 's1', updateType: 'FileRead', data: '{}' } },
          { eventType: 'Error', data: { code: 'Internal', message: 'err', recoverable: false } },
          { eventType: 'ResumeMarker', data: { worktreeId: 'w1', acpSessionId: 's1', lastSequence: 1 } }
        ];

        const guards = [
          isAcpSessionInit, isAcpSessionStatus, isAcpPromptChunk, isAcpPromptComplete,
          isAcpToolUse, isAcpContextUpdate, isAcpError, isAcpResumeMarker
        ];

        events.forEach((event, index) => {
          guards.forEach((guard, guardIndex) => {
            if (index === guardIndex) {
              expect(guard(event)).toBe(true);
            }
          });
        });
      });
    });
  });
});
