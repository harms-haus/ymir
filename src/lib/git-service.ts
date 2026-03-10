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

// ============================================================================
// Type Transformations (Rust to TypeScript)
// ============================================================================

/**
 * Transform Rust GitStatus to TypeScript GitRepo
 */
function transformGitStatus(rustStatus: any): GitRepo {
  const { repoPath, currentBranch, files, aheadCount, behindCount } = rustStatus;

  // Separate staged and unstaged files
  const staged: GitFile[] = [];
  const unstaged: GitFile[] = [];

  for (const file of files) {
    const rustStatus = file.status;
    const rustSecondaryStatus = file.secondary_status;

    // Check if file has staged status
    if (rustStatus === 'Added' || rustStatus === 'StagedModified' ||
        rustStatus === 'StagedDeleted' || rustStatus === 'StagedRenamed') {
      staged.push({
        path: file.path,
        status: mapFileStatus(rustStatus),
        staged: true,
      });
    }

    // Check if file has unstaged status (either primary or secondary)
    const hasUnstaged =
      rustStatus === 'Modified' || rustStatus === 'Deleted' ||
      rustStatus === 'Untracked' || rustStatus === 'Conflicted' ||
      rustSecondaryStatus === 'Modified' || rustSecondaryStatus === 'Deleted' ||
      rustSecondaryStatus === 'Untracked' || rustSecondaryStatus === 'Conflicted';

    if (hasUnstaged) {
      // Use secondary status if available (for files with both staged and unstaged changes)
      const unstagedStatus = rustSecondaryStatus || rustStatus;
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

/**
 * Map Rust FileStatus to TypeScript GitFileStatus
 */
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
      return 'modified'; // Default fallback
  }
}

/**
 * Transform Rust BranchInfo to TypeScript GitBranch
 */
function transformBranch(rustBranch: any): GitBranch {
  return {
    name: rustBranch.name,
    isCurrent: rustBranch.is_head,
    isRemote: rustBranch.is_remote,
    upstream: rustBranch.upstream,
  };
}

// ============================================================================
// Service Functions
// ============================================================================

/**
 * Get git status for a repository
 * @param repoPath - Path to the git repository
 * @returns Promise<GitRepo> - Repository status with staged/unstaged files
 */
export async function getGitStatus(repoPath: string): Promise<GitRepo> {
  try {
    logger.debug('Getting git status', { repoPath });
    const rustStatus = await invoke('get_git_status', { path: repoPath });
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

/**
 * Stage a file for commit
 * @param repoPath - Path to the git repository
 * @param filePath - Path to the file to stage (relative to repo root)
 */
export async function stageFile(repoPath: string, filePath: string): Promise<void> {
  try {
    logger.debug('Staging file', { repoPath, filePath });
    await invoke('stage_file', { repoPath, filePath });
    logger.info('File staged successfully', { filePath });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error('Failed to stage file', { repoPath, filePath, error: message });
    throw new Error(message);
  }
}

/**
 * Unstage a file (remove from index, keep working tree changes)
 * @param repoPath - Path to the git repository
 * @param filePath - Path to the file to unstage (relative to repo root)
 */
export async function unstageFile(repoPath: string, filePath: string): Promise<void> {
  try {
    logger.debug('Unstaging file', { repoPath, filePath });
    await invoke('unstage_file', { repoPath, filePath });
    logger.info('File unstaged successfully', { filePath });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error('Failed to unstage file', { repoPath, filePath, error: message });
    throw new Error(message);
  }
}

/**
 * Discard changes to a file (reset to last committed version)
 * @param repoPath - Path to the git repository
 * @param filePath - Path to the file to discard changes for (relative to repo root)
 */
export async function discardChanges(repoPath: string, filePath: string): Promise<void> {
  try {
    logger.debug('Discarding changes', { repoPath, filePath });
    await invoke('discard_file_changes', { repoPath, filePath });
    logger.info('Changes discarded successfully', { filePath });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error('Failed to discard changes', { repoPath, filePath, error: message });
    throw new Error(message);
  }
}

/**
 * Create a commit with staged changes
 * @param repoPath - Path to the git repository
 * @param message - Commit message
 * @returns Promise<string> - Commit hash/ID
 */
export async function commit(repoPath: string, message: string): Promise<string> {
  try {
    logger.debug('Creating commit', { repoPath, message });
    const commitId = await invoke('commit_changes', { repoPath, message });
    logger.info('Commit created successfully', { commitId, message });
    return commitId as string;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error('Failed to create commit', { repoPath, error: message });
    throw new Error(message);
  }
}

/**
 * Get list of all branches in the repository
 * @param repoPath - Path to the git repository
 * @returns Promise<GitBranch[]> - Array of branch information
 */
export async function getBranches(repoPath: string): Promise<GitBranch[]> {
  try {
    logger.debug('Getting branches', { repoPath });
    const rustBranches = await invoke('get_branches', { repoPath }) as any[];
    const result = rustBranches.map(transformBranch);
    logger.info('Branches retrieved', { repoPath, count: result.length });
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error('Failed to get branches', { repoPath, error: message });
    throw new Error(message);
  }
}

/**
 * Create a new branch from current HEAD
 * @param repoPath - Path to the git repository
 * @param name - Name for the new branch
 */
export async function createBranch(repoPath: string, name: string): Promise<void> {
  try {
    logger.debug('Creating branch', { repoPath, name });
    await invoke('create_branch', { repoPath, name });
    logger.info('Branch created successfully', { name });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error('Failed to create branch', { repoPath, name, error: message });
    throw new Error(message);
  }
}

/**
 * Delete a branch
 * @param repoPath - Path to the git repository
 * @param name - Name of the branch to delete
 */
export async function deleteBranch(repoPath: string, name: string): Promise<void> {
  try {
    logger.debug('Deleting branch', { repoPath, name });
    await invoke('delete_branch', { repoPath, name });
    logger.info('Branch deleted successfully', { name });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error('Failed to delete branch', { repoPath, name, error: message });
    throw new Error(message);
  }
}

/**
 * Checkout/switch to a branch
 * @param repoPath - Path to the git repository
 * @param name - Name of the branch to checkout
 */
export async function checkoutBranch(repoPath: string, name: string): Promise<void> {
  try {
    logger.debug('Checking out branch', { repoPath, name });
    await invoke('checkout_branch', { repoPath, name });
    logger.info('Branch checked out successfully', { name });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error('Failed to checkout branch', { repoPath, name, error: message });
    throw new Error(message);
  }
}

// ============================================================================
// Service Export
// ============================================================================

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
