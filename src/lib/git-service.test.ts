// Tests for git service layer - wraps Tauri git commands with type transformations
// Tests transformation functions and service functions with mocked Tauri invoke

import { describe, it, expect, beforeEach, vi } from 'vitest';
import gitService, {
  getGitStatus,
  getBranches,
  stageFile,
  unstageFile,
  discardChanges,
  commit,
  createBranch,
  deleteBranch,
  checkoutBranch,
} from './git-service';

// ============================================================================
// Mock Tauri invoke
// ============================================================================

const mockInvoke = vi.fn();

vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: unknown[]) => mockInvoke(...args),
}));

// Mock logger to avoid console output during tests
vi.mock('./logger', () => ({
  default: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// ============================================================================
// Setup
// ============================================================================

beforeEach(() => {
  mockInvoke.mockClear();
});

// ============================================================================
// getGitStatus() Tests
// ============================================================================

describe('git-service - getGitStatus()', () => {
  it('should transform git status with staged and unstaged files', async () => {
    const mockRustStatus = {
      repoPath: '/test/repo',
      currentBranch: 'main',
      files: [
        { path: 'staged-file.ts', status: 'Added' },
        { path: 'modified-file.ts', status: 'Modified' },
        { path: 'untracked-file.ts', status: 'Untracked' },
        { path: 'deleted-file.ts', status: 'Deleted' },
        { path: 'staged-modified.ts', status: 'StagedModified', secondaryStatus: 'Modified' },
        { path: 'staged-deleted.ts', status: 'StagedDeleted', secondaryStatus: null },
        { path: 'renamed-file.ts', status: 'StagedRenamed' },
        { path: 'conflict-file.ts', status: 'Conflicted' },
      ],
      stagedCount: 5,
      modifiedCount: 2,
      untrackedCount: 1,
      conflictedCount: 1,
      aheadCount: 2,
      behindCount: 1,
    };

    mockInvoke.mockResolvedValueOnce(mockRustStatus);

    const result = await getGitStatus('/test/repo');

    expect(mockInvoke).toHaveBeenCalledWith('get_git_status', { path: '/test/repo' });
    expect(result.path).toBe('/test/repo');
    expect(result.branch).toBe('main');
    expect(result.ahead).toBe(2);
    expect(result.behind).toBe(1);

    expect(result.staged).toHaveLength(4);
    expect(result.staged).toContainEqual({ path: 'staged-file.ts', status: 'added', staged: true });
    expect(result.staged).toContainEqual({ path: 'staged-modified.ts', status: 'added', staged: true });
    expect(result.staged).toContainEqual({ path: 'staged-deleted.ts', status: 'deleted', staged: true });
    expect(result.staged).toContainEqual({ path: 'renamed-file.ts', status: 'renamed', staged: true });

    // Unstaged files
    expect(result.unstaged).toHaveLength(5);
    expect(result.unstaged).toContainEqual({ path: 'modified-file.ts', status: 'modified', staged: false });
    expect(result.unstaged).toContainEqual({ path: 'untracked-file.ts', status: 'untracked', staged: false });
    expect(result.unstaged).toContainEqual({ path: 'deleted-file.ts', status: 'deleted', staged: false });
    expect(result.unstaged).toContainEqual({ path: 'staged-modified.ts', status: 'modified', staged: false });
    expect(result.unstaged).toContainEqual({ path: 'conflict-file.ts', status: 'conflict', staged: false });
  });

  it('should handle empty repository status', async () => {
    const mockRustStatus = {
      repoPath: '/test/repo',
      currentBranch: 'main',
      files: [],
      stagedCount: 0,
      modifiedCount: 0,
      untrackedCount: 0,
      conflictedCount: 0,
      aheadCount: 0,
      behindCount: 0,
    };

    mockInvoke.mockResolvedValueOnce(mockRustStatus);

    const result = await getGitStatus('/test/repo');

    expect(result.staged).toHaveLength(0);
    expect(result.unstaged).toHaveLength(0);
    expect(result.branch).toBe('main');
  });

  it('should handle files with both staged and unstaged changes', async () => {
    const mockRustStatus = {
      repoPath: '/test/repo',
      currentBranch: 'feature',
      files: [
        { path: 'both-changes.ts', status: 'StagedModified', secondaryStatus: 'Modified' },
      ],
      stagedCount: 1,
      modifiedCount: 1,
      untrackedCount: 0,
      conflictedCount: 0,
      aheadCount: 0,
      behindCount: 0,
    };

    mockInvoke.mockResolvedValueOnce(mockRustStatus);

    const result = await getGitStatus('/test/repo');

    // File should appear in both staged and unstaged
    expect(result.staged).toHaveLength(1);
    expect(result.staged[0]).toEqual({ path: 'both-changes.ts', status: 'added', staged: true });

    expect(result.unstaged).toHaveLength(1);
    expect(result.unstaged[0]).toEqual({ path: 'both-changes.ts', status: 'modified', staged: false });

    // Verify they are independent objects
    expect(result.staged[0]).not.toBe(result.unstaged[0]);
  });

  it('should propagate errors from Tauri invoke', async () => {
    mockInvoke.mockRejectedValueOnce(new Error('Not a git repository'));

    await expect(getGitStatus('/not-a-repo')).rejects.toThrow('Not a git repository');
  });

  it('should handle non-Error rejections', async () => {
    mockInvoke.mockRejectedValueOnce('String error');

    await expect(getGitStatus('/test/repo')).rejects.toThrow('String error');
  });

  it('should map all Rust file status values correctly', async () => {
    const testCases = [
      { rustStatus: 'Added', expected: 'added', expectedArray: 'staged' },
      { rustStatus: 'StagedModified', expected: 'added', expectedArray: 'staged' },
      { rustStatus: 'Modified', expected: 'modified', expectedArray: 'unstaged' },
      { rustStatus: 'StagedDeleted', expected: 'deleted', expectedArray: 'staged' },
      { rustStatus: 'Deleted', expected: 'deleted', expectedArray: 'unstaged' },
      { rustStatus: 'Untracked', expected: 'untracked', expectedArray: 'unstaged' },
      { rustStatus: 'StagedRenamed', expected: 'renamed', expectedArray: 'staged' },
      { rustStatus: 'Conflicted', expected: 'conflict', expectedArray: 'unstaged' },
    ];

    for (const testCase of testCases) {
      mockInvoke.mockClear();
      const mockRustStatus = {
        repoPath: '/test/repo',
        currentBranch: 'main',
        files: [{ path: 'test.ts', status: testCase.rustStatus }],
        stagedCount: 0,
        modifiedCount: 1,
        untrackedCount: 0,
        conflictedCount: 0,
        aheadCount: 0,
        behindCount: 0,
      };

      mockInvoke.mockResolvedValueOnce(mockRustStatus);

      const result = await getGitStatus('/test/repo');

      const array = testCase.expectedArray === 'staged' ? result.staged : result.unstaged;
      expect(array[0]?.status).toBe(testCase.expected);
    }
  });

  it('should handle Clean and Ignored statuses (not shown in staged/unstaged)', async () => {
    const hiddenStatuses = ['Clean', 'Ignored'];

    for (const status of hiddenStatuses) {
      mockInvoke.mockClear();
      const mockRustStatus = {
        repoPath: '/test/repo',
        currentBranch: 'main',
        files: [{ path: 'test.ts', status }],
        stagedCount: 0,
        modifiedCount: 0,
        untrackedCount: 0,
        conflictedCount: 0,
        aheadCount: 0,
        behindCount: 0,
      };

      mockInvoke.mockResolvedValueOnce(mockRustStatus);

      const result = await getGitStatus('/test/repo');

      expect(result.staged).toHaveLength(0);
      expect(result.unstaged).toHaveLength(0);
    }
  });
});

// ============================================================================
// getBranches() Tests
// ============================================================================

describe('git-service - getBranches()', () => {
  it('should transform branches correctly', async () => {
    const mockRustBranches = [
      { name: 'main', isHead: true, isRemote: false, upstream: 'origin/main' },
      { name: 'feature-branch', isHead: false, isRemote: false, upstream: null },
      { name: 'origin/main', isHead: false, isRemote: true, upstream: null },
      { name: 'origin/feature', isHead: false, isRemote: true, upstream: null },
    ];

    mockInvoke.mockResolvedValueOnce(mockRustBranches);

    const result = await getBranches('/test/repo');

    expect(mockInvoke).toHaveBeenCalledWith('get_branches', { repo_path: '/test/repo' });
    expect(result).toHaveLength(4);

    // Local current branch
    expect(result[0]).toEqual({
      name: 'main',
      isCurrent: true,
      isRemote: false,
      upstream: 'origin/main',
    });

    // Local non-current branch
    expect(result[1]).toEqual({
      name: 'feature-branch',
      isCurrent: false,
      isRemote: false,
      upstream: undefined,
    });

    // Remote branches
    expect(result[2]).toEqual({
      name: 'origin/main',
      isCurrent: false,
      isRemote: true,
      upstream: undefined,
    });

    expect(result[3]).toEqual({
      name: 'origin/feature',
      isCurrent: false,
      isRemote: true,
      upstream: undefined,
    });
  });

  it('should handle empty branch list', async () => {
    mockInvoke.mockResolvedValueOnce([]);

    const result = await getBranches('/test/repo');

    expect(result).toHaveLength(0);
  });

  it('should handle branch with undefined upstream', async () => {
    const mockRustBranches = [
      { name: 'main', isHead: true, isRemote: false }, // upstream is undefined
    ];

    mockInvoke.mockResolvedValueOnce(mockRustBranches);

    const result = await getBranches('/test/repo');

    expect(result[0].upstream).toBeUndefined();
  });

  it('should propagate errors from Tauri invoke', async () => {
    mockInvoke.mockRejectedValueOnce(new Error('Failed to get branches'));

    await expect(getBranches('/test/repo')).rejects.toThrow('Failed to get branches');
  });
});

// ============================================================================
// stageFile() Tests
// ============================================================================

describe('git-service - stageFile()', () => {
  it('should stage a file successfully', async () => {
    mockInvoke.mockResolvedValueOnce(undefined);

    await stageFile('/test/repo', 'file.ts');

    expect(mockInvoke).toHaveBeenCalledWith('stage_file', {
      repo_path: '/test/repo',
      file_path: 'file.ts',
    });
  });

  it('should propagate errors from Tauri invoke', async () => {
    mockInvoke.mockRejectedValueOnce(new Error('File not found'));

    await expect(stageFile('/test/repo', 'nonexistent.ts')).rejects.toThrow('File not found');
  });
});

// ============================================================================
// unstageFile() Tests
// ============================================================================

describe('git-service - unstageFile()', () => {
  it('should unstage a file successfully', async () => {
    mockInvoke.mockResolvedValueOnce(undefined);

    await unstageFile('/test/repo', 'file.ts');

    expect(mockInvoke).toHaveBeenCalledWith('unstage_file', {
      repo_path: '/test/repo',
      file_path: 'file.ts',
    });
  });

  it('should propagate errors from Tauri invoke', async () => {
    mockInvoke.mockRejectedValueOnce(new Error('File not staged'));

    await expect(unstageFile('/test/repo', 'file.ts')).rejects.toThrow('File not staged');
  });
});

// ============================================================================
// discardChanges() Tests
// ============================================================================

describe('git-service - discardChanges()', () => {
  it('should discard changes successfully', async () => {
    mockInvoke.mockResolvedValueOnce(undefined);

    await discardChanges('/test/repo', 'file.ts');

    expect(mockInvoke).toHaveBeenCalledWith('discard_file_changes', {
      repo_path: '/test/repo',
      file_path: 'file.ts',
    });
  });

  it('should propagate errors from Tauri invoke', async () => {
    mockInvoke.mockRejectedValueOnce(new Error('Cannot discard'));

    await expect(discardChanges('/test/repo', 'file.ts')).rejects.toThrow('Cannot discard');
  });
});

// ============================================================================
// commit() Tests
// ============================================================================

describe('git-service - commit()', () => {
  it('should create a commit and return commit hash', async () => {
    mockInvoke.mockResolvedValueOnce('abc123def456');

    const result = await commit('/test/repo', 'Test commit message');

    expect(mockInvoke).toHaveBeenCalledWith('commit_changes', {
      repo_path: '/test/repo',
      message: 'Test commit message',
    });
    expect(result).toBe('abc123def456');
  });

  it('should propagate errors from Tauri invoke', async () => {
    mockInvoke.mockRejectedValueOnce(new Error('Nothing to commit'));

    await expect(commit('/test/repo', 'Empty commit')).rejects.toThrow('Nothing to commit');
  });
});

// ============================================================================
// createBranch() Tests
// ============================================================================

describe('git-service - createBranch()', () => {
  it('should create a branch successfully', async () => {
    mockInvoke.mockResolvedValueOnce(undefined);

    await createBranch('/test/repo', 'new-feature');

    expect(mockInvoke).toHaveBeenCalledWith('create_branch', {
      repo_path: '/test/repo',
      name: 'new-feature',
    });
  });

  it('should propagate errors from Tauri invoke', async () => {
    mockInvoke.mockRejectedValueOnce(new Error('Branch already exists'));

    await expect(createBranch('/test/repo', 'main')).rejects.toThrow('Branch already exists');
  });
});

// ============================================================================
// deleteBranch() Tests
// ============================================================================

describe('git-service - deleteBranch()', () => {
  it('should delete a branch successfully', async () => {
    mockInvoke.mockResolvedValueOnce(undefined);

    await deleteBranch('/test/repo', 'old-feature');

    expect(mockInvoke).toHaveBeenCalledWith('delete_branch', {
      repo_path: '/test/repo',
      name: 'old-feature',
    });
  });

  it('should propagate errors from Tauri invoke', async () => {
    mockInvoke.mockRejectedValueOnce(new Error('Cannot delete current branch'));

    await expect(deleteBranch('/test/repo', 'main')).rejects.toThrow('Cannot delete current branch');
  });
});

// ============================================================================
// checkoutBranch() Tests
// ============================================================================

describe('git-service - checkoutBranch()', () => {
  it('should checkout a branch successfully', async () => {
    mockInvoke.mockResolvedValueOnce(undefined);

    await checkoutBranch('/test/repo', 'feature-branch');

    expect(mockInvoke).toHaveBeenCalledWith('checkout_branch', {
      repo_path: '/test/repo',
      name: 'feature-branch',
    });
  });

  it('should propagate errors from Tauri invoke', async () => {
    mockInvoke.mockRejectedValueOnce(new Error('Branch not found'));

    await expect(checkoutBranch('/test/repo', 'nonexistent')).rejects.toThrow('Branch not found');
  });
});

// ============================================================================
// gitService default export Tests
// ============================================================================

describe('git-service - default export', () => {
  it('should export all service functions', () => {
    expect(gitService.getGitStatus).toBe(getGitStatus);
    expect(gitService.stageFile).toBe(stageFile);
    expect(gitService.unstageFile).toBe(unstageFile);
    expect(gitService.discardChanges).toBe(discardChanges);
    expect(gitService.commit).toBe(commit);
    expect(gitService.getBranches).toBe(getBranches);
    expect(gitService.createBranch).toBe(createBranch);
    expect(gitService.deleteBranch).toBe(deleteBranch);
    expect(gitService.checkoutBranch).toBe(checkoutBranch);
  });
});
