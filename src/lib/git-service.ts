// Git service layer - wraps Tauri git commands with type transformations
// Provides clean interface for git operations from the frontend

import { invoke } from '@tauri-apps/api/core';
import logger from './logger';
import {
  GitBranch,
  GitFile,
  GitFileStatus,
  GitRepo,
} from '../state/types';
import {
  RustGitStatus,
  RustBranchInfo,
} from '../types/tauri';

function transformGitStatus(rustStatus: RustGitStatus): GitRepo {
  const { repoPath, currentBranch, files, aheadCount, behindCount } = rustStatus;

  const staged: GitFile[] = [];
  const unstaged: GitFile[] = [];

  for (const file of files) {
    const primaryStatus = file.status;
    const secondaryStatus = file.secondaryStatus;

    if (primaryStatus === 'Added' || primaryStatus === 'StagedModified' ||
        primaryStatus === 'StagedDeleted' || primaryStatus === 'StagedRenamed') {
      staged.push({
        path: file.path,
        status: mapFileStatus(primaryStatus),
        staged: true,
      });
    }

    const hasUnstaged =
      primaryStatus === 'Modified' || primaryStatus === 'Deleted' ||
      primaryStatus === 'Untracked' || primaryStatus === 'Conflicted' ||
      secondaryStatus === 'Modified' || secondaryStatus === 'Deleted' ||
      secondaryStatus === 'Untracked' || secondaryStatus === 'Conflicted';

    if (hasUnstaged) {
      const unstagedStatus = secondaryStatus || primaryStatus;
      unstaged.push({
        path: file.path,
        status: mapFileStatus(unstagedStatus),
        staged: false,
      });
    }
  }

  return {
    path: repoPath,
    branch: currentBranch,
    ahead: aheadCount,
    behind: behindCount,
    staged,
    unstaged,
  };
}

function mapFileStatus(rustStatus: string): GitFileStatus {
  switch (rustStatus) {
    case 'Added':
    case 'StagedModified':
      return 'added';
    case 'Modified':
      return 'modified';
    case 'StagedDeleted':
    case 'Deleted':
      return 'deleted';
    case 'Untracked':
      return 'untracked';
    case 'StagedRenamed':
      return 'renamed';
    case 'Conflicted':
      return 'conflict';
    default:
      return 'modified';
  }
}

function transformBranch(rustBranch: RustBranchInfo): GitBranch {
  return {
    name: rustBranch.name,
    isCurrent: rustBranch.isHead,
    isRemote: rustBranch.isRemote,
    upstream: rustBranch.upstream ?? undefined,
  };
}

export async function getGitStatus(repoPath: string): Promise<GitRepo> {
  try {
    logger.debug('Getting git status', { repoPath });
    const rustStatus = await invoke<RustGitStatus>('get_git_status', { path: repoPath });
    const result = transformGitStatus(rustStatus);
    logger.info('Git status retrieved', {
      repoPath,
      branch: result.branch,
      stagedCount: result.staged.length,
      unstagedCount: result.unstaged.length,
    });
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error('Failed to get git status', { repoPath, error: message });
    throw new Error(message);
  }
}

export async function stageFile(repoPath: string, filePath: string): Promise<void> {
  try {
    logger.debug('Staging file', { repoPath, filePath });
    await invoke('stage_file', { repo_path: repoPath, file_path: filePath });
    logger.info('File staged successfully', { filePath });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error('Failed to stage file', { repoPath, filePath, error: message });
    throw new Error(message);
  }
}

export async function unstageFile(repoPath: string, filePath: string): Promise<void> {
  try {
    logger.debug('Unstaging file', { repoPath, filePath });
    await invoke('unstage_file', { repo_path: repoPath, file_path: filePath });
    logger.info('File unstaged successfully', { filePath });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error('Failed to unstage file', { repoPath, filePath, error: message });
    throw new Error(message);
  }
}

export async function discardChanges(repoPath: string, filePath: string): Promise<void> {
  try {
    logger.debug('Discarding changes', { repoPath, filePath });
    await invoke('discard_file_changes', { repo_path: repoPath, file_path: filePath });
    logger.info('Changes discarded successfully', { filePath });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error('Failed to discard changes', { repoPath, filePath, error: message });
    throw new Error(message);
  }
}

export async function commit(repoPath: string, message: string): Promise<string> {
  try {
    logger.debug('Creating commit', { repoPath, message });
    const commitId = await invoke('commit_changes', { repo_path: repoPath, message });
    logger.info('Commit created successfully', { commitId, message });
    return commitId as string;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error('Failed to create commit', { repoPath, error: message });
    throw new Error(message);
  }
}

export async function getBranches(repoPath: string): Promise<GitBranch[]> {
  try {
    logger.debug('Getting branches', { repoPath });
    const rustBranches = await invoke<RustBranchInfo[]>('get_branches', { repo_path: repoPath });
    const result = rustBranches.map(transformBranch);
    logger.info('Branches retrieved', { repoPath, count: result.length });
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error('Failed to get branches', { repoPath, error: message });
    throw new Error(message);
  }
}

export async function createBranch(repoPath: string, name: string): Promise<void> {
  try {
    logger.debug('Creating branch', { repoPath, name });
    await invoke('create_branch', { repo_path: repoPath, name });
    logger.info('Branch created successfully', { name });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error('Failed to create branch', { repoPath, name, error: message });
    throw new Error(message);
  }
}

export async function deleteBranch(repoPath: string, name: string): Promise<void> {
  try {
    logger.debug('Deleting branch', { repoPath, name });
    await invoke('delete_branch', { repo_path: repoPath, name });
    logger.info('Branch deleted successfully', { name });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error('Failed to delete branch', { repoPath, name, error: message });
    throw new Error(message);
  }
}

export async function checkoutBranch(repoPath: string, name: string): Promise<void> {
  try {
    logger.debug('Checking out branch', { repoPath, name });
    await invoke('checkout_branch', { repo_path: repoPath, name });
    logger.info('Branch checked out successfully', { name });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error('Failed to checkout branch', { repoPath, name, error: message });
    throw new Error(message);
  }
}

const gitService = {
  getGitStatus,
  stageFile,
  unstageFile,
  discardChanges,
  commit,
  getBranches,
  createBranch,
  deleteBranch,
  checkoutBranch,
};

export default gitService;
