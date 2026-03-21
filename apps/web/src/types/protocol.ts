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
  status: 'Success' | 'Error';
}

export interface Ping {
  type: 'Ping';
  timestamp: number;
}

export interface Pong {
  type: 'Pong';
  timestamp: number;
}

export interface Error {
  type: 'Error';
  code: string;
  message: string;
  details?: string;
  requestId?: string;
}

export const ErrorCodes = {
  PTY_CRASH: 'pty_crash',
  GIT_FAILURE: 'git_failure',
  AGENT_CRASH: 'agent_crash',
  DB_ERROR: 'db_error',
} as const;

export type ErrorCode = typeof ErrorCodes[keyof typeof ErrorCodes];

export interface PtyCrashError extends Error {
  code: typeof ErrorCodes.PTY_CRASH;
  sessionId: string;
  worktreeId: string;
}

export interface GitFailureError extends Error {
  code: typeof ErrorCodes.GIT_FAILURE;
  worktreeId: string;
  operation: 'merge' | 'commit' | 'push' | 'pull' | 'checkout' | 'other';
  conflictFiles?: string[];
}

export interface AgentCrashError extends Error {
  code: typeof ErrorCodes.AGENT_CRASH;
  worktreeId: string;
  agentType: string;
  sessionId?: string;
}

export interface DbError extends Error {
  code: typeof ErrorCodes.DB_ERROR;
  operation: 'read' | 'write' | 'migration' | 'connection' | 'other';
}

export type ServerErrorMessage = PtyCrashError | GitFailureError | AgentCrashError | DbError | Error;

export interface Notification {
  type: 'Notification';
  level: 'info' | 'warning' | 'error';
  title: string;
  message: string;
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
export interface GitStats {
  modified: number;
  added: number;
  deleted: number;
}

export interface Worktree {
  id: string;
  workspaceId: string;
  branchName: string;
  path: string;
  status: 'active' | 'inactive' | 'orphaned';
  isMain: boolean;
  gitStats?: GitStats;
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

// Wire format from server - raw git status codes
export interface ServerGitStatusEntry {
  path: string;
  statusCode: string;
}

// UI-friendly parsed format
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
  name: string;
  rootPath: string;
  color?: string;
  icon?: string;
  worktreeBaseDir?: string;
}

export interface WorkspaceDelete {
  type: 'WorkspaceDelete';
  workspaceId: string;
  requestId?: string;
}

export interface WorkspaceRename {
  type: 'WorkspaceRename';
  workspaceId: string;
  newName: string;
}

export interface WorkspaceUpdate {
  type: 'WorkspaceUpdate';
  workspaceId: string;
  color?: string;
  icon?: string;
  worktreeBaseDir?: string;
  settings?: string;
  requestId?: string;
}

// Worktree messages
export interface WorktreeCreate {
  type: 'WorktreeCreate';
  workspaceId: string;
  branchName: string;
  agentType?: string;
  requestId?: string;
  useExistingBranch?: boolean;
}

export interface WorktreeDelete {
  type: 'WorktreeDelete';
  worktreeId: string;
}

export interface WorktreeMerge {
  type: 'WorktreeMerge';
  worktreeId: string;
  squash: boolean;
  deleteAfter: boolean;
}

export interface WorktreeList {
  type: 'WorktreeList';
  workspaceId: string;
}

export interface WorktreeChangeBranch {
  type: 'WorktreeChangeBranch';
  worktreeId: string;
  newBranchName: string;
  requestId?: string;
}

export interface GetWorktreeDetails {
  type: 'GetWorktreeDetails';
  workspaceId: string;
  requestId?: string;
}

export interface WorktreeDetailsResult {
  type: 'WorktreeDetailsResult';
  requestId?: string;
  worktrees: Worktree[];
  agentSessions: AgentSession[];
  terminalSessions: TerminalSession[];
}

export interface WorktreeChanged {
  type: 'WorktreeChanged';
  worktree: Worktree;
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
  label?: string;
  shell?: string;
}

export interface TerminalKill {
    type: 'TerminalKill';
    sessionId: string;
}

export interface TerminalRename {
    type: 'TerminalRename';
    sessionId: string;
    newLabel: string;
    requestId?: string;
}

export interface TerminalReorder {
  type: 'TerminalReorder';
  worktreeId: string;
  sessionIds: string[];
  requestId?: string;
}

export interface TerminalRequestHistory {
  type: 'TerminalRequestHistory';
  sessionId: string;
  requestId: string;
  limit?: number;
}

export interface AgentRename {
    type: 'AgentRename';
    sessionId: string;
    newLabel: string;
    requestId?: string;
}

export interface AgentReorder {
    type: 'AgentReorder';
    worktreeId: string;
    sessionIds: string[];
    requestId?: string;
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

export interface FileList {
  type: 'FileList';
  worktreeId: string;
  path?: string;
}

export interface FileListResult {
  type: 'FileListResult';
  worktreeId: string;
  files: string[];
  requestId?: string;
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
  requestId: string;
}

export interface UpdateSettings {
  type: 'UpdateSettings';
  key: string;
  value: string;
}

// ============================================================================
// Server → Client Messages
// ============================================================================

// State snapshot
export interface StateSnapshot {
  type: 'StateSnapshot';
  requestId: string;
  workspaces: Workspace[];
  worktrees: Worktree[];
  agentSessions: AgentSession[];
  terminalSessions: TerminalSession[];
  settings: Array<{ key: string; value: string }>;
}

// Workspace events
export interface WorkspaceCreated {
  type: 'WorkspaceCreated';
  workspace: Workspace;
}

export interface WorkspaceDeleted {
  type: 'WorkspaceDeleted';
  workspaceId: string;
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
  worktreeId: string;
}

export interface WorktreeStatus {
  type: 'WorktreeStatus';
  worktreeId: string;
  status: string;
}

export interface WorktreeStatus {
  type: 'WorktreeStatus';
  worktree: Worktree;
}

// Agent events
export interface AgentStatusUpdate {
  type: 'AgentStatusUpdate';
  id: string;
  worktreeId: string;
  agentType: string;
  status: AgentStatus;
  startedAt: number;
}

export interface AgentOutput {
  type: 'AgentOutput';
  worktreeId: string;
  output: string;
}

export interface AgentPrompt {
  type: 'AgentPrompt';
  worktreeId: string;
  prompt: string;
}

export interface AgentRemoved {
  type: 'AgentRemoved';
  id: string;
  worktreeId: string;
}

// Terminal events
export interface TerminalOutput {
  type: 'TerminalOutput';
  sessionId: string;
  data: string;
}

export interface TerminalCreated {
  type: 'TerminalCreated';
  sessionId: string;
  worktreeId: string;
  label?: string;
  shell: string;
}

export interface TerminalRemoved {
    type: 'TerminalRemoved';
    sessionId: string;
}

export interface TerminalUpdated {
  type: 'TerminalUpdated';
  sessionId: string;
  worktreeId: string;
  label?: string;
  position?: number;
  requestId?: string;
}

export interface TerminalHistory {
  type: 'TerminalHistory';
  sessionId: string;
  data: string;
}

export interface AgentUpdated {
    type: 'AgentUpdated';
    sessionId: string;
    worktreeId: string;
    label?: string;
    position?: number;
    requestId?: string;
}

// File events
export interface FileContentMessage {
  type: 'FileContent';
  worktreeId: string;
  path: string;
  content: string;
}

// Git events
export interface GitStatusResult {
  type: 'GitStatusResult';
  worktreeId: string;
  entries: ServerGitStatusEntry[];
}

export interface GitDiffResult {
  type: 'GitDiffResult';
  worktreeId: string;
  filePath?: string;
  diff: string;
}

// ============================================================================
// WS-ACP Wire Contract Types
// ============================================================================
//
// Stateless event vocabulary for communication between the Rust ACP bridge
// and the TypeScript side. Independent from assistant-ui message parts.
//
// Ordering: sequence numbers are monotonically increasing per session
// Idempotency: duplicate sequence numbers are safe to replay
// Resumability: client can request replay from last known sequence
// Error Envelopes: all failures captured in structured AcpError

export type AcpSequence = number;

export interface AcpCorrelationId {
  value: string;
}

export interface AcpEventEnvelope {
  sequence: AcpSequence;
  correlationId?: AcpCorrelationId;
  timestamp: number;
  eventType: AcpEvent['eventType'];
  data: AcpEventData;
}

export type AcpEventData =
  | AcpSessionInit
  | AcpSessionStatusEvent
  | AcpPromptChunk
  | AcpPromptComplete
  | AcpToolUseEvent
  | AcpContextUpdate
  | AcpError
  | AcpResumeMarker;

export type AcpEvent =
  | { eventType: 'SessionInit'; data: AcpSessionInit }
  | { eventType: 'SessionStatus'; data: AcpSessionStatusEvent }
  | { eventType: 'PromptChunk'; data: AcpPromptChunk }
  | { eventType: 'PromptComplete'; data: AcpPromptComplete }
  | { eventType: 'ToolUse'; data: AcpToolUseEvent }
  | { eventType: 'ContextUpdate'; data: AcpContextUpdate }
  | { eventType: 'Error'; data: AcpError }
  | { eventType: 'ResumeMarker'; data: AcpResumeMarker };

export interface AcpSessionInit {
  acpSessionId: string;
  capabilities: AcpAgentCapabilities;
}

export interface AcpAgentCapabilities {
  supportsToolUse: boolean;
  supportsContextUpdate: boolean;
  supportsCancellation: boolean;
}

export interface AcpSessionStatusEvent {
  worktreeId: string;
  acpSessionId: string;
  status: AcpSessionStatus;
}

export type AcpSessionStatus = 'Working' | 'Waiting' | 'Complete' | 'Cancelled';

export interface AcpPromptChunk {
  worktreeId: string;
  acpSessionId: string;
  content: AcpChunkContent;
  isFinal: boolean;
}

export type AcpChunkContent =
  | { type: 'Text'; data: string }
  | { type: 'Structured'; data: string };

export interface AcpPromptComplete {
  worktreeId: string;
  acpSessionId: string;
  reason: AcpPromptCompleteReason;
}

export type AcpPromptCompleteReason = 'Normal' | 'Cancelled' | 'Error';

export interface AcpToolUseEvent {
  worktreeId: string;
  acpSessionId: string;
  toolUseId: string;
  toolName: string;
  status: AcpToolUseStatus;
  input?: string;
  output?: string;
  error?: string;
}

export type AcpToolUseStatus = 'Started' | 'InProgress' | 'Completed' | 'Error';

export interface AcpContextUpdate {
  worktreeId: string;
  acpSessionId: string;
  updateType: AcpContextUpdateType;
  data: string;
}

export type AcpContextUpdateType =
  | 'FileRead'
  | 'FileWritten'
  | 'CommandExecuted'
  | 'BrowserAction'
  | 'MemoryUpdate';

export interface AcpError {
  worktreeId?: string;
  acpSessionId?: string;
  code: AcpErrorCode;
  message: string;
  details?: string;
  recoverable: boolean;
}

export type AcpErrorCode =
  | 'AgentCrash'
  | 'InitFailed'
  | 'SessionNotFound'
  | 'PromptFailed'
  | 'ToolFailed'
  | 'CancelFailed'
  | 'Timeout'
  | 'InvalidRequest'
  | 'Internal';

export interface AcpResumeMarker {
  worktreeId: string;
  acpSessionId: string;
  lastSequence: AcpSequence;
  checkpoint?: string;
}

export interface AcpResumeRequest {
  worktreeId: string;
  acpSessionId: string;
  fromSequence: AcpSequence;
}

export interface AcpAck {
  worktreeId: string;
  acpSessionId: string;
  lastSequence: AcpSequence;
}

// ============================================================================
// WS-ACP Server Message Types
// ============================================================================

// WS-ACP envelope wrapper for server transmission
// Wraps AcpEventEnvelope with standard message type discriminator
export interface AcpWireEvent {
  type: 'AcpWireEvent';
  envelope: AcpEventEnvelope;
}

// Type guards for WS-ACP events
export function isAcpSessionInit(event: AcpEvent): event is { eventType: 'SessionInit'; data: AcpSessionInit } {
  return event.eventType === 'SessionInit';
}

export function isAcpSessionStatus(event: AcpEvent): event is { eventType: 'SessionStatus'; data: AcpSessionStatusEvent } {
  return event.eventType === 'SessionStatus';
}

export function isAcpPromptChunk(event: AcpEvent): event is { eventType: 'PromptChunk'; data: AcpPromptChunk } {
  return event.eventType === 'PromptChunk';
}

export function isAcpPromptComplete(event: AcpEvent): event is { eventType: 'PromptComplete'; data: AcpPromptComplete } {
  return event.eventType === 'PromptComplete';
}

export function isAcpToolUse(event: AcpEvent): event is { eventType: 'ToolUse'; data: AcpToolUseEvent } {
  return event.eventType === 'ToolUse';
}

export function isAcpContextUpdate(event: AcpEvent): event is { eventType: 'ContextUpdate'; data: AcpContextUpdate } {
  return event.eventType === 'ContextUpdate';
}

export function isAcpError(event: AcpEvent): event is { eventType: 'Error'; data: AcpError } {
  return event.eventType === 'Error';
}

export function isAcpResumeMarker(event: AcpEvent): event is { eventType: 'ResumeMarker'; data: AcpResumeMarker } {
  return event.eventType === 'ResumeMarker';
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
  | WorktreeChangeBranch
  | GetWorktreeDetails
  | AgentSpawn
    | AgentSend
    | AgentCancel
    | AgentRename
    | AgentReorder
    | TerminalInput
    | TerminalResize
    | TerminalCreate
  | TerminalKill
  | TerminalRename
  | TerminalReorder
  | TerminalRequestHistory
  | FileRead
    | FileWrite
    | FileList
    | GitStatus
    | GitDiff
    | GitCommit
    | CreatePR
    | GetState
    | UpdateSettings
    | Ping
    | Pong
    | Ack;

export type ServerMessage =
    | StateSnapshot
    | WorkspaceCreated
    | WorkspaceDeleted
    | WorkspaceUpdated
  | WorktreeCreated
  | WorktreeDeleted
  | WorktreeChanged
  | WorktreeStatus
  | WorktreeDetailsResult
  | AgentStatusUpdate
    | AgentOutput
    | AgentPrompt
    | AgentRemoved
    | AgentUpdated
  | TerminalOutput
  | TerminalCreated
  | TerminalRemoved
  | TerminalUpdated
  | TerminalHistory
  | FileContentMessage
    | FileListResult
    | GitStatusResult
    | GitDiffResult
    | Error
    | Ping
    | Pong
    | Notification
    | Ack
    | AcpWireEvent;

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

export function isPtyCrashError(error: Error): error is PtyCrashError {
  return error.code === ErrorCodes.PTY_CRASH;
}

export function isGitFailureError(error: Error): error is GitFailureError {
  return error.code === ErrorCodes.GIT_FAILURE;
}

export function isAgentCrashError(error: Error): error is AgentCrashError {
  return error.code === ErrorCodes.AGENT_CRASH;
}

export function isDbError(error: Error): error is DbError {
  return error.code === ErrorCodes.DB_ERROR;
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

export function isWorktreeChangeBranch(message: AnyMessage | UnknownMessage): message is WorktreeChangeBranch {
  return message.type === 'WorktreeChangeBranch';
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

export function isTerminalKill(message: AnyMessage | UnknownMessage): message is TerminalKill {
  return message.type === 'TerminalKill';
}

export function isFileRead(message: AnyMessage | UnknownMessage): message is FileRead {
  return message.type === 'FileRead';
}

export function isFileWrite(message: AnyMessage | UnknownMessage): message is FileWrite {
  return message.type === 'FileWrite';
}

export function isFileList(message: AnyMessage | UnknownMessage): message is FileList {
  return message.type === 'FileList';
}

export function isFileListResult(message: AnyMessage | UnknownMessage): message is FileListResult {
  return message.type === 'FileListResult';
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

export function isWorktreeChanged(message: AnyMessage | UnknownMessage): message is WorktreeChanged {
  return message.type === 'WorktreeChanged';
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

export function isAgentRemoved(message: AnyMessage | UnknownMessage): message is AgentRemoved {
  return message.type === 'AgentRemoved';
}

export function isTerminalOutput(message: AnyMessage | UnknownMessage): message is TerminalOutput {
  return message.type === 'TerminalOutput';
}

export function isTerminalCreated(message: AnyMessage | UnknownMessage): message is TerminalCreated {
  return message.type === 'TerminalCreated';
}

export function isTerminalRemoved(message: AnyMessage | UnknownMessage): message is TerminalRemoved {
  return message.type === 'TerminalRemoved';
}

export function isTerminalHistory(message: AnyMessage | UnknownMessage): message is TerminalHistory {
  return message.type === 'TerminalHistory';
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

export function isAcpWireEvent(message: AnyMessage | UnknownMessage): message is AcpWireEvent {
  return message.type === 'AcpWireEvent';
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
      'WorktreeCreate', 'WorktreeDelete', 'WorktreeMerge', 'WorktreeList', 'WorktreeChangeBranch',
      'AgentSpawn', 'AgentSend', 'AgentCancel',
      'TerminalInput', 'TerminalResize', 'TerminalCreate', 'TerminalKill',
      'FileRead', 'FileWrite', 'FileList',
      'GitStatus', 'GitDiff', 'GitCommit',
      'CreatePR',
      'GetState', 'UpdateSettings',
      'Ping',
      // Server messages
      'StateSnapshot',
      'WorkspaceCreated', 'WorkspaceDeleted', 'WorkspaceUpdated',
      'WorktreeCreated', 'WorktreeDeleted', 'WorktreeChanged', 'WorktreeStatus',
      'AgentStatusUpdate', 'AgentOutput', 'AgentPrompt',
      'TerminalOutput', 'TerminalCreated', 'TerminalRemoved',
      'FileContent', 'FileListResult',
      'GitStatusResult', 'GitDiffResult',
      'Error', 'Pong', 'Notification',
      'AcpWireEvent',
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

export const PROTOCOL_VERSION = 1;

/**
 * Wraps a message with protocol version header
 * @param message - The message to wrap
 * @returns Message with version header
 */
export function withVersion<T extends AnyMessage>(message: T): T & { version: number } {
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
