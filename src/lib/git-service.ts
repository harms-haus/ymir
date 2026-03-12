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
// Rust Response Types (matching src-tauri/src/git.rs structs)
// ============================================================================

/**
 * Rust FileStatus enum serialized as string
 * See git.rs FileStatus enum for all variants
 */
type RustFileStatus =
  | 'Added'
  | 'StagedModified'
  | 'StagedDeleted'
  | 'StagedRenamed'
  | 'Modified'
  | 'Deleted'
  | 'Untracked'
  | 'Ignored'
  | 'Conflicted'
  | 'Clean';

/**
 * Rust GitFile struct (serde camelCase)
 */
interface RustGitFile {
  path: string;
  status: RustFileStatus;
  secondaryStatus?: RustFileStatus | null;
}

/**
 * Rust GitStatus struct (serde camelCase)
 */
interface RustGitStatus {
  repoPath: string;
  currentBranch: string;
  files: RustGitFile[];
  stagedCount: number;
  modifiedCount: number;
  untrackedCount: number;
  conflictedCount: number;
  aheadCount: number;
  behindCount: number;
}

/**
 * Rust BranchInfo struct (serde camelCase)
 */
interface RustBranchInfo {
  name: string;
  isHead: boolean;
  isRemote: boolean;
  upstream?: string | null;
}

// ============================================================================
// Type Transformations (Rust to TypeScript)
// ============================================================================

function transformGitStatus(rustStatus: RustGitStatus): GitRepo {
  const { repoPath, currentBranch, files, aheadCount, behindCount } = rustStatus;

  const staged: GitFile[] = [];
  const unstaged: GitFile[] = [];

  for (const file of files) {
    const primaryStatus = file.status;
    const secondaryStatus = file.secondaryStatus;

    // Check if file has staged status
    if (primaryStatus === 'Added' || primaryStatus === 'StagedModified' ||
        primaryStatus === 'StagedDeleted' || primaryStatus === 'StagedRenamed') {
      staged.push({
        path: file.path,
        status: mapFileStatus(primaryStatus),
        staged: true,
      });
    }

    // Check if file has unstaged status (either primary or secondary)
    const hasUnstaged =
      primaryStatus === 'Modified' || primaryStatus === 'Deleted' ||
      primaryStatus === 'Untracked' || primaryStatus === 'Conflicted' ||
      secondaryStatus === 'Modified' || secondaryStatus === 'Deleted' ||
      secondaryStatus === 'Untracked' || secondaryStatus === 'Conflicted';

    if (hasUnstaged) {
      // Use secondary status if available (for files with both staged and unstaged changes)
      const unstagedStatus = secondaryStatus || primaryStatus;
      // Always create a NEW object — files with both staged/unstaged changes
      // appear in both arrays, and they must be independent so mutating one
      // (e.g. via updateGitFile) doesn't corrupt the other
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

function transformBranch(rustBranch: RustBranchInfo): GitBranch {
  return {
    name: rustBranch.name,
    isCurrent: rustBranch.isHead,
    isRemote: rustBranch.isRemote,
    upstream: rustBranch.upstream ?? undefined,
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

/**
 * Stage a file for commit
 * @param repoPath - Path to the git repository
 * @param filePath - Path to the file to stage (relative to repo root)
 */
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

/**
 * Unstage a file (remove from index, keep working tree changes)
 * @param repoPath - Path to the git repository
 * @param filePath - Path to the file to unstage (relative to repo root)
 */
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

/**
 * Discard changes to a file (reset to last committed version)
 * @param repoPath - Path to the git repository
 * @param filePath - Path to the file to discard changes for (relative to repo root)
 */
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

/**
 * Create a commit with staged changes
 * @param repoPath - Path to the git repository
 * @param message - Commit message
 * @returns Promise<string> - Commit hash/ID
 */
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

/**
 * Get list of all branches in the repository
 * @param repoPath - Path to the git repository
 * @returns Promise<GitBranch[]> - Array of branch information
 */
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

/**
 * Create a new branch from current HEAD
 * @param repoPath - Path to the git repository
 * @param name - Name for the new branch
 */
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

/**
 * Delete a branch
 * @param repoPath - Path to the git repository
 * @param name - Name of the branch to delete
 */
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

/**
 * Checkout/switch to a branch
 * @param repoPath - Path to the git repository
 * @param name - Name of the branch to checkout
 */
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
