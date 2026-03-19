import { readFileSync } from 'fs';
import { decode } from '@msgpack/msgpack';
import type {
  AnyMessage,
  UnknownMessage,
  ClientMessage,
  ServerMessage,
} from '../types/protocol';
import type { WorkspaceCreate, WorktreeCreate, AgentSpawn, TerminalCreate } from '../types/protocol';

export interface ValidationResult {
  valid: boolean;
  messageType?: string;
  error?: string;
  details?: unknown;
}

function isWorkspaceCreateMsg(msg: AnyMessage | UnknownMessage): msg is WorkspaceCreate {
  return msg.type === 'WorkspaceCreate';
}

function isWorktreeCreateMsg(msg: AnyMessage | UnknownMessage): msg is WorktreeCreate {
  return msg.type === 'WorktreeCreate';
}

function isAgentSpawnMsg(msg: AnyMessage | UnknownMessage): msg is AgentSpawn {
  return msg.type === 'AgentSpawn';
}

function isTerminalCreateMsg(msg: AnyMessage | UnknownMessage): msg is TerminalCreate {
  return msg.type === 'TerminalCreate';
}

export async function validateFixture(filePath: string): Promise<ValidationResult> {
  try {
    try {
      readFileSync(filePath);
    } catch (fileError) {
      return {
        valid: false,
        error: `File not found or not accessible: ${filePath}`,
      };
    }

    const buffer = readFileSync(filePath);
    const uint8Array = new Uint8Array(buffer);

    let decoded: unknown;
    try {
      decoded = decode(uint8Array);
    } catch (decodeError) {
      return {
        valid: false,
        error: `Failed to decode MessagePack: ${decodeError instanceof Error ? decodeError.message : String(decodeError)}`,
      };
    }

    if (typeof decoded !== 'object' || decoded === null || Array.isArray(decoded)) {
      return {
        valid: false,
        error: 'Decoded data is not an object',
        details: decoded,
      };
    }

    if (!('type' in decoded)) {
      return {
        valid: false,
        error: 'Message missing required "type" field',
        details: decoded,
      };
    }

    const message = decoded as AnyMessage | UnknownMessage;

    if (isWorkspaceCreateMsg(message)) {
      return {
        valid: true,
        messageType: 'WorkspaceCreate',
        details: message,
      };
    }

    if (isWorktreeCreateMsg(message)) {
      return {
        valid: true,
        messageType: 'WorktreeCreate',
        details: message,
      };
    }

    if (isAgentSpawnMsg(message)) {
      return {
        valid: true,
        messageType: 'AgentSpawn',
        details: message,
      };
    }

    if (isTerminalCreateMsg(message)) {
      return {
        valid: true,
        messageType: 'TerminalCreate',
        details: message,
      };
    }

    const validTypes = [
      'WorkspaceCreate', 'WorkspaceDelete', 'WorkspaceRename', 'WorkspaceUpdate',
      'WorktreeCreate', 'WorktreeDelete', 'WorktreeMerge', 'WorktreeList',
      'AgentSpawn', 'AgentSend', 'AgentCancel',
      'TerminalInput', 'TerminalResize', 'TerminalCreate', 'TerminalKill',
      'FileRead', 'FileWrite',
      'GitStatus', 'GitDiff', 'GitCommit',
      'CreatePR',
      'GetState', 'UpdateSettings',
      'Ping', 'Pong', 'Ack',
      'StateSnapshot',
      'WorkspaceCreated', 'WorkspaceDeleted', 'WorkspaceUpdated',
      'WorktreeCreated', 'WorktreeDeleted', 'WorktreeStatus',
      'AgentStatusUpdate', 'AgentOutput', 'AgentPrompt',
      'TerminalOutput', 'TerminalCreated',
      'FileContent',
      'GitStatusResult', 'GitDiffResult',
      'Error', 'Notification'
    ];

    if ('type' in message && typeof message.type === 'string' && validTypes.includes(message.type)) {
      return {
        valid: true,
        messageType: message.type,
        details: message,
      };
    }

    return {
      valid: false,
      error: `Unknown or invalid message type: ${typeof message.type === 'string' ? message.type : typeof message.type}`,
      details: message,
    };

  } catch (error) {
    return {
      valid: false,
      error: `Unexpected error: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

export async function validateFixtures(filePaths: string[]): Promise<ValidationResult[]> {
  return Promise.all(filePaths.map(path => validateFixture(path)));
}
