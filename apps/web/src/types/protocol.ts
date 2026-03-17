/**
 * MessagePack Protocol Types for Ymir WebSocket Communication
 * Mirrors Rust protocol types defined in crates/ws-server/src/protocol.rs
 */

import { encode, decode } from '@msgpack/msgpack';

// ============================================================================
// Shared Types
// ============================================================================

export interface Ack {
  type: 'Ack';
  messageId: string;
  timestamp: number;
}

export interface Ping {
  type: 'Ping';
  id: number;
  timestamp: number;
}

export interface Pong {
  type: 'Pong';
  id: number;
  timestamp: number;
}

export interface Error {
  type: 'Error';
  code: string;
  message: string;
  details?: unknown;
}

export interface Notification {
  type: 'Notification';
  level: 'info' | 'warn' | 'error';
  message: string;
  timestamp: number;
}

// Workspace types
export interface Workspace {
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

// Worktree types
export interface Worktree {
  id: string;
  workspaceId: string;
  branchName: string;
  path: string;
  status: 'active' | 'inactive' | 'orphaned';
  createdAt: number;
}

// Agent types
export type AgentStatus = 'idle' | 'working' | 'waiting' | 'error';

export interface AgentSession {
  id: string;
  worktreeId: string;
  agentType: string;
  acpSessionId?: string;
  status: AgentStatus;
  startedAt: number;
}

// Terminal types
export interface TerminalSession {
  id: string;
  worktreeId: string;
  label: string;
  shell: string;
  createdAt: number;
}

// File types
export interface FileData {
  path: string;
  content: string;
  encoding: 'utf8' | 'base64';
  size: number;
  modifiedAt: number;
}

// Git types
export interface GitStatusEntry {
  path: string;
  status: 'unmodified' | 'modified' | 'added' | 'deleted' | 'renamed' | 'copied' | 'untracked';
  staged: boolean;
}

export interface GitDiffEntry {
  path: string;
  oldPath?: string;
  status: 'modified' | 'added' | 'deleted' | 'renamed';
  hunks: Array<{
    oldStart: number;
    oldLines: number;
    newStart: number;
    newLines: number;
    lines: string[];
  }>;
}

// ============================================================================
// Client → Server Messages
// ============================================================================

// Workspace messages
export interface WorkspaceCreate {
  type: 'WorkspaceCreate';
  id: string;
  name: string;
  rootPath: string;
  color?: string;
  icon?: string;
  worktreeBaseDir?: string;
  settings?: Record<string, unknown>;
}

export interface WorkspaceDelete {
  type: 'WorkspaceDelete';
  id: string;
}

export interface WorkspaceRename {
  type: 'WorkspaceRename';
  id: string;
  name: string;
}

export interface WorkspaceUpdate {
  type: 'WorkspaceUpdate';
  id: string;
  color?: string;
  icon?: string;
  worktreeBaseDir?: string;
  settings?: Record<string, unknown>;
}

// Worktree messages
export interface WorktreeCreate {
  type: 'WorktreeCreate';
  workspaceId: string;
  branchName: string;
  agentType?: string;
}

export interface WorktreeDelete {
  type: 'WorktreeDelete';
  id: string;
}

export interface WorktreeMerge {
  type: 'WorktreeMerge';
  id: string;
  squash: boolean;
  deleteAfter: boolean;
}

export interface WorktreeList {
  type: 'WorktreeList';
  workspaceId: string;
}

// Agent messages
export interface AgentSpawn {
  type: 'AgentSpawn';
  worktreeId: string;
  agentType: string;
}

export interface AgentSend {
  type: 'AgentSend';
  worktreeId: string;
  message: string;
}

export interface AgentCancel {
  type: 'AgentCancel';
  worktreeId: string;
}

// Terminal messages
export interface TerminalInput {
  type: 'TerminalInput';
  sessionId: string;
  data: string;
}

export interface TerminalResize {
  type: 'TerminalResize';
  sessionId: string;
  cols: number;
  rows: number;
}

export interface TerminalCreate {
  type: 'TerminalCreate';
  worktreeId: string;
  label: string;
  shell?: string;
}

// File messages
export interface FileRead {
  type: 'FileRead';
  worktreeId: string;
  path: string;
}

export interface FileWrite {
  type: 'FileWrite';
  worktreeId: string;
  path: string;
  content: string;
  encoding?: 'utf8' | 'base64';
}

// Git messages
export interface GitStatus {
  type: 'GitStatus';
  worktreeId: string;
}

export interface GitDiff {
  type: 'GitDiff';
  worktreeId: string;
  filePath?: string;
}

export interface GitCommit {
  type: 'GitCommit';
  worktreeId: string;
  message: string;
  files?: string[];
}

// PR messages
export interface CreatePR {
  type: 'CreatePR';
  worktreeId: string;
  title: string;
  body?: string;
}

// State messages
export interface GetState {
  type: 'GetState';
}

export interface UpdateSettings {
  type: 'UpdateSettings';
  key: string;
  value: unknown;
}

// ============================================================================
// Server → Client Messages
// ============================================================================

// State snapshot
export interface StateSnapshot {
  type: 'StateSnapshot';
  workspaces: Workspace[];
  worktrees: Worktree[];
  agentSessions: AgentSession[];
  terminalSessions: TerminalSession[];
  settings: Record<string, unknown>;
}

// Workspace events
export interface WorkspaceCreated {
  type: 'WorkspaceCreated';
  workspace: Workspace;
}

export interface WorkspaceDeleted {
  type: 'WorkspaceDeleted';
  id: string;
}

export interface WorkspaceUpdated {
  type: 'WorkspaceUpdated';
  workspace: Workspace;
}

// Worktree events
export interface WorktreeCreated {
  type: 'WorktreeCreated';
  worktree: Worktree;
}

export interface WorktreeDeleted {
  type: 'WorktreeDeleted';
  id: string;
}

export interface WorktreeStatus {
  type: 'WorktreeStatus';
  worktree: Worktree;
}

// Agent events
export interface AgentStatusUpdate {
  type: 'AgentStatusUpdate';
  sessionId: string;
  status: AgentStatus;
  message?: string;
}

export interface AgentOutput {
  type: 'AgentOutput';
  sessionId: string;
  output: string;
}

export interface AgentPrompt {
  type: 'AgentPrompt';
  sessionId: string;
  prompt: string;
}

// Terminal events
export interface TerminalOutput {
  type: 'TerminalOutput';
  sessionId: string;
  data: string;
}

export interface TerminalCreated {
  type: 'TerminalCreated';
  session: TerminalSession;
}

// File events
export interface FileContentMessage {
  type: 'FileContent';
  worktreeId: string;
  file: FileData;
}

// Git events
export interface GitStatusResult {
  type: 'GitStatusResult';
  worktreeId: string;
  entries: GitStatusEntry[];
}

export interface GitDiffResult {
  type: 'GitDiffResult';
  worktreeId: string;
  filePath?: string;
  entries: GitDiffEntry[];
}

// ============================================================================
// Discriminated Unions
// ============================================================================

export type ClientMessage =
  | WorkspaceCreate
  | WorkspaceDelete
  | WorkspaceRename
  | WorkspaceUpdate
  | WorktreeCreate
  | WorktreeDelete
  | WorktreeMerge
  | WorktreeList
  | AgentSpawn
  | AgentSend
  | AgentCancel
  | TerminalInput
  | TerminalResize
  | TerminalCreate
  | FileRead
  | FileWrite
  | GitStatus
  | GitDiff
  | GitCommit
  | CreatePR
  | GetState
  | UpdateSettings
  | Ping
  | Ack;

export type ServerMessage =
  | StateSnapshot
  | WorkspaceCreated
  | WorkspaceDeleted
  | WorkspaceUpdated
  | WorktreeCreated
  | WorktreeDeleted
  | WorktreeStatus
  | AgentStatusUpdate
  | AgentOutput
  | AgentPrompt
  | TerminalOutput
  | TerminalCreated
  | FileContentMessage
  | GitStatusResult
  | GitDiffResult
  | Error
  | Pong
  | Notification
  | Ack;

export type BidirectionalMessage = Ack;

export type AnyMessage = ClientMessage | ServerMessage | BidirectionalMessage;

// ============================================================================
// Unknown Message Type (for graceful degradation)
// ============================================================================

export interface UnknownMessage {
  type: 'UnknownMessage';
  rawData: unknown;
}

// ============================================================================
// Type Guards
// ============================================================================

export function isAck(message: AnyMessage | UnknownMessage): message is Ack {
  return message.type === 'Ack';
}

export function isPing(message: AnyMessage | UnknownMessage): message is Ping {
  return message.type === 'Ping';
}

export function isPong(message: AnyMessage | UnknownMessage): message is Pong {
  return message.type === 'Pong';
}

export function isError(message: AnyMessage | UnknownMessage): message is Error {
  return message.type === 'Error';
}

export function isNotification(message: AnyMessage | UnknownMessage): message is Notification {
  return message.type === 'Notification';
}

// Client message guards
export function isWorkspaceCreate(message: AnyMessage | UnknownMessage): message is WorkspaceCreate {
  return message.type === 'WorkspaceCreate';
}

export function isWorkspaceDelete(message: AnyMessage | UnknownMessage): message is WorkspaceDelete {
  return message.type === 'WorkspaceDelete';
}

export function isWorkspaceRename(message: AnyMessage | UnknownMessage): message is WorkspaceRename {
  return message.type === 'WorkspaceRename';
}

export function isWorkspaceUpdate(message: AnyMessage | UnknownMessage): message is WorkspaceUpdate {
  return message.type === 'WorkspaceUpdate';
}

export function isWorktreeCreate(message: AnyMessage | UnknownMessage): message is WorktreeCreate {
  return message.type === 'WorktreeCreate';
}

export function isWorktreeDelete(message: AnyMessage | UnknownMessage): message is WorktreeDelete {
  return message.type === 'WorktreeDelete';
}

export function isWorktreeMerge(message: AnyMessage | UnknownMessage): message is WorktreeMerge {
  return message.type === 'WorktreeMerge';
}

export function isWorktreeList(message: AnyMessage | UnknownMessage): message is WorktreeList {
  return message.type === 'WorktreeList';
}

export function isAgentSpawn(message: AnyMessage | UnknownMessage): message is AgentSpawn {
  return message.type === 'AgentSpawn';
}

export function isAgentSend(message: AnyMessage | UnknownMessage): message is AgentSend {
  return message.type === 'AgentSend';
}

export function isAgentCancel(message: AnyMessage | UnknownMessage): message is AgentCancel {
  return message.type === 'AgentCancel';
}

export function isTerminalInput(message: AnyMessage | UnknownMessage): message is TerminalInput {
  return message.type === 'TerminalInput';
}

export function isTerminalResize(message: AnyMessage | UnknownMessage): message is TerminalResize {
  return message.type === 'TerminalResize';
}

export function isTerminalCreate(message: AnyMessage | UnknownMessage): message is TerminalCreate {
  return message.type === 'TerminalCreate';
}

export function isFileRead(message: AnyMessage | UnknownMessage): message is FileRead {
  return message.type === 'FileRead';
}

export function isFileWrite(message: AnyMessage | UnknownMessage): message is FileWrite {
  return message.type === 'FileWrite';
}

export function isGitStatus(message: AnyMessage | UnknownMessage): message is GitStatus {
  return message.type === 'GitStatus';
}

export function isGitDiff(message: AnyMessage | UnknownMessage): message is GitDiff {
  return message.type === 'GitDiff';
}

export function isGitCommit(message: AnyMessage | UnknownMessage): message is GitCommit {
  return message.type === 'GitCommit';
}

export function isCreatePR(message: AnyMessage | UnknownMessage): message is CreatePR {
  return message.type === 'CreatePR';
}

export function isGetState(message: AnyMessage | UnknownMessage): message is GetState {
  return message.type === 'GetState';
}

export function isUpdateSettings(message: AnyMessage | UnknownMessage): message is UpdateSettings {
  return message.type === 'UpdateSettings';
}

// Server message guards
export function isStateSnapshot(message: AnyMessage | UnknownMessage): message is StateSnapshot {
  return message.type === 'StateSnapshot';
}

export function isWorkspaceCreated(message: AnyMessage | UnknownMessage): message is WorkspaceCreated {
  return message.type === 'WorkspaceCreated';
}

export function isWorkspaceDeleted(message: AnyMessage | UnknownMessage): message is WorkspaceDeleted {
  return message.type === 'WorkspaceDeleted';
}

export function isWorkspaceUpdated(message: AnyMessage | UnknownMessage): message is WorkspaceUpdated {
  return message.type === 'WorkspaceUpdated';
}

export function isWorktreeCreated(message: AnyMessage | UnknownMessage): message is WorktreeCreated {
  return message.type === 'WorktreeCreated';
}

export function isWorktreeDeleted(message: AnyMessage | UnknownMessage): message is WorktreeDeleted {
  return message.type === 'WorktreeDeleted';
}

export function isWorktreeStatus(message: AnyMessage | UnknownMessage): message is WorktreeStatus {
  return message.type === 'WorktreeStatus';
}

export function isAgentStatusUpdate(message: AnyMessage | UnknownMessage): message is AgentStatusUpdate {
  return message.type === 'AgentStatusUpdate';
}

export function isAgentOutput(message: AnyMessage | UnknownMessage): message is AgentOutput {
  return message.type === 'AgentOutput';
}

export function isAgentPrompt(message: AnyMessage | UnknownMessage): message is AgentPrompt {
  return message.type === 'AgentPrompt';
}

export function isTerminalOutput(message: AnyMessage | UnknownMessage): message is TerminalOutput {
  return message.type === 'TerminalOutput';
}

export function isTerminalCreated(message: AnyMessage | UnknownMessage): message is TerminalCreated {
  return message.type === 'TerminalCreated';
}

export function isFileContent(message: AnyMessage | UnknownMessage): message is FileContentMessage {
  return message.type === 'FileContent';
}

export function isGitStatusResult(message: AnyMessage | UnknownMessage): message is GitStatusResult {
  return message.type === 'GitStatusResult';
}

export function isGitDiffResult(message: AnyMessage | UnknownMessage): message is GitDiffResult {
  return message.type === 'GitDiffResult';
}

// ============================================================================
// Message Encoding/Decoding
// ============================================================================

/**
 * Encodes a message to MessagePack binary format
 * @param message - The message to encode
 * @returns ArrayBuffer containing the encoded message
 */
export function encodeMessage(message: AnyMessage): ArrayBuffer {
  const encoded = encode(message);
  return encoded.buffer.slice(encoded.byteOffset, encoded.byteOffset + encoded.byteLength);
}

/**
 * Decodes a MessagePack binary message to a typed message
 * @param data - The binary data to decode
 * @returns The decoded message, or UnknownMessage if type is unrecognized
 */
export function decodeMessage(data: ArrayBuffer | Uint8Array): AnyMessage | UnknownMessage {
  try {
    const decoded = decode(data);
    
    // Validate that the decoded object has a type field
    if (typeof decoded !== 'object' || decoded === null || !('type' in decoded)) {
      return {
        type: 'UnknownMessage',
        rawData: decoded
      };
    }
    
    // Check if the type is a valid message type
    const validTypes = [
      // Client messages
      'WorkspaceCreate', 'WorkspaceDelete', 'WorkspaceRename', 'WorkspaceUpdate',
      'WorktreeCreate', 'WorktreeDelete', 'WorktreeMerge', 'WorktreeList',
      'AgentSpawn', 'AgentSend', 'AgentCancel',
      'TerminalInput', 'TerminalResize', 'TerminalCreate',
      'FileRead', 'FileWrite',
      'GitStatus', 'GitDiff', 'GitCommit',
      'CreatePR',
      'GetState', 'UpdateSettings',
      'Ping',
      // Server messages
      'StateSnapshot',
      'WorkspaceCreated', 'WorkspaceDeleted', 'WorkspaceUpdated',
      'WorktreeCreated', 'WorktreeDeleted', 'WorktreeStatus',
      'AgentStatusUpdate', 'AgentOutput', 'AgentPrompt',
      'TerminalOutput', 'TerminalCreated',
      'FileContent',
      'GitStatusResult', 'GitDiffResult',
      'Error', 'Pong', 'Notification',
      // Bidirectional
      'Ack'
    ];
    
    if (!validTypes.includes((decoded as any).type)) {
      return {
        type: 'UnknownMessage',
        rawData: decoded
      };
    }
    
    // TypeScript will infer the correct type based on the type field
    return decoded as AnyMessage;
  } catch (error) {
    return {
      type: 'UnknownMessage',
      rawData: data
    };
  }
}

/**
 * Decodes a message and validates it against a specific type guard
 * @param data - The binary data to decode
 * @param typeGuard - The type guard function to validate against
 * @returns The decoded message if it matches the type guard, or UnknownMessage
 */
export function decodeAndValidate<T extends AnyMessage>(
  data: ArrayBuffer | Uint8Array,
  typeGuard: (msg: AnyMessage | UnknownMessage) => msg is T
): T | UnknownMessage {
  const decoded = decodeMessage(data);
  
  if (typeGuard(decoded)) {
    return decoded;
  }
  
  return {
    type: 'UnknownMessage',
    rawData: decoded
  };
}

// ============================================================================
// Version Header
// ============================================================================

export const PROTOCOL_VERSION = '1.0.0';

/**
 * Wraps a message with protocol version header
 * @param message - The message to wrap
 * @returns Message with version header
 */
export function withVersion<T extends AnyMessage>(message: T): T & { version: string } {
  return {
    ...message,
    version: PROTOCOL_VERSION
  };
}

/**
 * Checks if a message has the correct protocol version
 * @param message - The message to check
 * @returns true if version matches or is missing (for backward compatibility)
 */
export function checkVersion(message: any): boolean {
  return !message.version || message.version === PROTOCOL_VERSION;
}
