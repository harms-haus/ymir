import { getWebSocketClient, generateId } from './ws';
import {
WorkspaceCreate,
WorkspaceDelete,
WorkspaceRemove,
WorkspaceRename,
WorkspaceUpdate,
WorktreeCreate,
WorktreeDelete,
WorktreeMerge,
WorktreeList,
AgentSpawn,
AgentSend,
TerminalCreate,
TerminalInput,
TerminalResize,
FileRead,
FileWrite,
GitStatus,
GitDiff,
GitCommit,
GitListBranches,
BranchInfo,
GitListBranchesResult,
CreatePR,
UpdateSettings,
GetState
} from '../types/protocol';

// Workspace API
export function createWorkspace(name: string, rootPath: string, color?: string, icon?: string): void {
  const client = getWebSocketClient();
  const message: WorkspaceCreate = {
    type: 'WorkspaceCreate',
    name,
    rootPath,
    color,
    icon,
  };
  client.send(message);
}

export function deleteWorkspace(workspaceId: string): void {
  const client = getWebSocketClient();
  const message: WorkspaceDelete = {
    type: 'WorkspaceDelete',
    workspaceId,
  };
  client.send(message);
}

export function removeWorkspace(workspaceId: string): void {
  const client = getWebSocketClient();
  const message: WorkspaceRemove = {
    type: 'WorkspaceRemove',
    workspaceId,
  };
  client.send(message);
}

export function renameWorkspace(workspaceId: string, name: string): void {
  const client = getWebSocketClient();
  const message: WorkspaceRename = {
    type: 'WorkspaceRename',
    workspaceId,
    newName: name,
  };
  client.send(message);
}

export function updateWorkspace(workspaceId: string, updates: {
  color?: string;
  icon?: string;
  worktreeBaseDir?: string;
  settings?: string;
}): void {
  const client = getWebSocketClient();
  const message: WorkspaceUpdate = {
    type: 'WorkspaceUpdate',
    workspaceId,
    ...updates,
  };
  client.send(message);
}

// Worktree API
export function createWorktree(workspaceId: string, branchName: string, agentType?: string): void {
  const client = getWebSocketClient();
  const message: WorktreeCreate = {
    type: 'WorktreeCreate',
    workspaceId,
    branchName,
    agentType,
  };
  client.send(message);
}

export function deleteWorktree(worktreeId: string): void {
  const client = getWebSocketClient();
  const message: WorktreeDelete = {
    type: 'WorktreeDelete',
    worktreeId,
  };
  client.send(message);
}

export function mergeWorktree(worktreeId: string, squash = false, deleteAfter = false): void {
  const client = getWebSocketClient();
  const message: WorktreeMerge = {
    type: 'WorktreeMerge',
    worktreeId,
    squash,
    deleteAfter,
  };
  client.send(message);
}

export function listWorktrees(workspaceId: string): void {
  const client = getWebSocketClient();
  const message: WorktreeList = {
    type: 'WorktreeList',
    workspaceId,
  };
  client.send(message);
}

// Agent API
export function spawnAgent(worktreeId: string, agentType: string): void {
  const client = getWebSocketClient();
  const message: AgentSpawn = {
    type: 'AgentSpawn',
    worktreeId,
    agentType,
  };
  client.send(message);
}

export function sendToAgent(worktreeId: string, agentTabId: string, message: string): void {
  const client = getWebSocketClient();
  const msg: AgentSend = {
    type: 'AgentSend',
    worktreeId,
    message,
    agentTabId,
  };
  client.send(msg);
}

// Terminal API
export function createTerminal(worktreeId: string, label: string, shell?: string): void {
  const client = getWebSocketClient();
  const message: TerminalCreate = {
    type: 'TerminalCreate',
    worktreeId,
    label,
    shell,
  };
  client.send(message);
}

export function sendTerminalInput(sessionId: string, data: string): void {
  const client = getWebSocketClient();
  const message: TerminalInput = {
    type: 'TerminalInput',
    sessionId,
    data,
  };
  client.send(message);
}

export function resizeTerminal(sessionId: string, cols: number, rows: number): void {
  const client = getWebSocketClient();
  const message: TerminalResize = {
    type: 'TerminalResize',
    sessionId,
    cols,
    rows,
  };
  client.send(message);
}

// File API
export function readFile(worktreeId: string, path: string): void {
  const client = getWebSocketClient();
  const message: FileRead = {
    type: 'FileRead',
    worktreeId,
    path,
  };
  client.send(message);
}

export function writeFile(worktreeId: string, path: string, content: string): void {
  const client = getWebSocketClient();
  const message: FileWrite = {
    type: 'FileWrite',
    worktreeId,
    path,
    content,
  };
  client.send(message);
}

// Git API
export function getGitStatus(worktreeId: string): void {
  const client = getWebSocketClient();
  const message: GitStatus = {
    type: 'GitStatus',
    worktreeId,
  };
  client.send(message);
}

export function getGitDiff(worktreeId: string, filePath?: string): void {
  const client = getWebSocketClient();
  const message: GitDiff = {
    type: 'GitDiff',
    worktreeId,
    filePath,
  };
  client.send(message);
}

export function commitChanges(worktreeId: string, message: string, files?: string[]): void {
  const client = getWebSocketClient();
  const msg: GitCommit = {
    type: 'GitCommit',
    worktreeId,
    message,
    files,
  };
  client.send(msg);
}

export function listBranches(worktreeId: string, workspaceId: string): Promise<BranchInfo[]> {
  const client = getWebSocketClient();

  return new Promise<BranchInfo[]>((resolve, reject) => {
    const timeout = setTimeout(() => {
      unsubResult();
      unsubError();
      reject(new Error('listBranches timed out after 30s'));
    }, 30000);

    const unsubResult = client.onMessage('GitListBranchesResult', (msg: GitListBranchesResult) => {
      if (msg.worktreeId !== worktreeId) return;
      clearTimeout(timeout);
      unsubError();
      resolve(msg.branches);
    });

    const unsubError = client.onMessage('Error', () => {
      clearTimeout(timeout);
      unsubResult();
      reject(new Error('Failed to list branches'));
    });

    const message: GitListBranches = {
      type: 'GitListBranches',
      workspaceId,
      worktreeId,
    };
    client.send(message);
  });
}

// PR API
export function createPR(worktreeId: string, title: string, body?: string): void {
  const client = getWebSocketClient();
  const message: CreatePR = {
    type: 'CreatePR',
    worktreeId,
    title,
    body,
  };
  client.send(message);
}

// Settings API
export function updateSettings(key: string, value: unknown): void {
  const client = getWebSocketClient();
  const message: UpdateSettings = {
    type: 'UpdateSettings',
    key,
    value: typeof value === 'string' ? value : JSON.stringify(value),
  };
  client.send(message);
}

// State API
export function getState(): void {
  const client = getWebSocketClient();
  const message: GetState = {
    type: 'GetState',
    requestId: generateId(),
  };
  client.send(message);
}

export function executeOperations(operations: Array<() => void>): void {
  operations.forEach(op => {
    op();
  });
}

// Utility functions
export function createWorkspaceAndWorktree(
  workspaceName: string,
  rootPath: string,
  branchName: string,
  agentType?: string
): void {
  createWorkspace(workspaceName, rootPath);
  setTimeout(() => {
    console.warn('createWorkspaceAndWorktree: Workspace ID needed for createWorktree', { branchName, agentType });
  }, 100);
}
