import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { gitPanelDefinition } from '../GitPanel';
import gitService, { getGitStatus, stageFile, unstageFile, discardChanges, commit } from '../../lib/git-service';
import { GitRepo, GitFile, GitFileStatus } from '../../state/types';
import { invoke } from '@tauri-apps/api/core';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

vi.mock('../../lib/logger', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

// ============================================================================
// Test Data
// ============================================================================

const mockGitRepo: GitRepo = {
  path: '/home/user/project',
  branch: 'main',
  ahead: 2,
  behind: 0,
  staged: [
    {
      path: 'src/components/Sidebar.tsx',
      status: 'modified' as GitFileStatus,
      staged: true,
    },
    {
      path: 'src/state/types.ts',
      status: 'added' as GitFileStatus,
      staged: true,
    },
  ],
  unstaged: [
    {
      path: 'src/components/GitPanel.tsx',
      status: 'modified' as GitFileStatus,
      staged: false,
    },
    {
      path: 'src/components/other.ts',
      status: 'added' as GitFileStatus,
      staged: false,
    },
    {
      path: 'src/components/helper.ts',
      status: 'modified' as GitFileStatus,
      staged: false,
    },
    {
      path: 'src/components/old-file.ts',
      status: 'deleted' as GitFileStatus,
      staged: false,
    },
    {
      path: 'src/components/untracked-file.ts',
      status: 'untracked' as GitFileStatus,
      staged: false,
    },
  ],
};

const mockRustStatus = {
  repoPath: '/home/user/project',
  currentBranch: 'main',
  files: [
    {
      path: 'src/components/Sidebar.tsx',
      status: 'StagedModified',
      secondary_status: null,
    },
    {
      path: 'src/state/types.ts',
      status: 'Added',
      secondary_status: null,
    },
    {
      path: 'src/components/GitPanel.tsx',
      status: 'Modified',
      secondary_status: null,
    },
    {
      path: 'src/components/other.ts',
      status: 'Added',
      secondary_status: null,
    },
    {
      path: 'src/components/helper.ts',
      status: 'Modified',
      secondary_status: null,
    },
    {
      path: 'src/components/old-file.ts',
      status: 'Deleted',
      secondary_status: null,
    },
    {
      path: 'src/components/untracked-file.ts',
      status: 'Untracked',
      secondary_status: null,
    },
  ],
  aheadCount: 2,
  behindCount: 0,
};

// ============================================================================
// Git Service Tests
// ============================================================================

describe('git-service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (invoke as ReturnType<typeof vi.fn>).mockReset();
  });

  describe('getGitStatus', () => {
    it('should call invoke with correct command and path', async () => {
      (invoke as ReturnType<typeof vi.fn>).mockResolvedValue(mockRustStatus);

      await getGitStatus('/home/user/project');

      expect(invoke).toHaveBeenCalledWith('get_git_status', {
        path: '/home/user/project',
      });
    });

    it('should transform Rust status to TypeScript GitRepo', async () => {
      (invoke as ReturnType<typeof vi.fn>).mockResolvedValue(mockRustStatus);

      const result = await getGitStatus('/home/user/project');

      // File transformations:
      // Sidebar.tsx: StagedModified -> staged modified
      // types.ts: Added -> staged added
      // GitPanel.tsx: Modified -> unstaged modified
      // other.ts: Added -> unstaged added
      // helper.ts: Modified -> unstaged modified
      // old-file.ts: Deleted -> unstaged deleted
      // untracked-file.ts: Untracked -> unstaged untracked

      expect(result).toEqual({
        path: '/home/user/project',
        branch: 'main',
        ahead: 2,
        behind: 0,
        staged: [
          {
            path: 'src/components/Sidebar.tsx',
            status: 'modified',
            staged: true,
          },
          {
            path: 'src/state/types.ts',
            status: 'added',
            staged: true,
          },
        ],
        unstaged: [
          {
            path: 'src/components/GitPanel.tsx',
            status: 'modified',
            staged: false,
          },
          {
            path: 'src/components/other.ts',
            status: 'added',
            staged: false,
          },
          {
            path: 'src/components/helper.ts',
            status: 'modified',
            staged: false,
          },
          {
            path: 'src/components/old-file.ts',
            status: 'deleted',
            staged: false,
          },
          {
            path: 'src/components/untracked-file.ts',
            status: 'untracked',
            staged: false,
          },
        ],
      });
    });

    it('should handle errors and rethrow them', async () => {
      const error = new Error('Not a git repository');
      (invoke as ReturnType<typeof vi.fn>).mockRejectedValue(error);

      await expect(getGitStatus('/home/user/project')).rejects.toThrow('Not a git repository');
    });
  });

  describe('stageFile', () => {
    it('should call invoke with stage_file command', async () => {
      (invoke as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

      await stageFile('/home/user/project', 'src/file.ts');

      expect(invoke).toHaveBeenCalledWith('stage_file', {
        repoPath: '/home/user/project',
        filePath: 'src/file.ts',
      });
    });

    it('should handle errors', async () => {
      const error = new Error('Stage failed');
      (invoke as ReturnType<typeof vi.fn>).mockRejectedValue(error);

      await expect(stageFile('/home/user/project', 'src/file.ts')).rejects.toThrow('Stage failed');
    });
  });

  describe('unstageFile', () => {
    it('should call invoke with unstage_file command', async () => {
      (invoke as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

      await unstageFile('/home/user/project', 'src/file.ts');

      expect(invoke).toHaveBeenCalledWith('unstage_file', {
        repoPath: '/home/user/project',
        filePath: 'src/file.ts',
      });
    });

    it('should handle errors', async () => {
      const error = new Error('Unstage failed');
      (invoke as ReturnType<typeof vi.fn>).mockRejectedValue(error);

      await expect(unstageFile('/home/user/project', 'src/file.ts')).rejects.toThrow('Unstage failed');
    });
  });

  describe('discardChanges', () => {
    it('should call invoke with discard_file_changes command', async () => {
      (invoke as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

      await discardChanges('/home/user/project', 'src/file.ts');

      expect(invoke).toHaveBeenCalledWith('discard_file_changes', {
        repoPath: '/home/user/project',
        filePath: 'src/file.ts',
      });
    });

    it('should handle errors', async () => {
      const error = new Error('Discard failed');
      (invoke as ReturnType<typeof vi.fn>).mockRejectedValue(error);

      await expect(discardChanges('/home/user/project', 'src/file.ts')).rejects.toThrow('Discard failed');
    });
  });

  describe('commit', () => {
    it('should call invoke with commit_changes command', async () => {
      (invoke as ReturnType<typeof vi.fn>).mockResolvedValue('abc123');

      const result = await commit('/home/user/project', 'test commit');

      expect(invoke).toHaveBeenCalledWith('commit_changes', {
        repoPath: '/home/user/project',
        message: 'test commit',
      });
      expect(result).toBe('abc123');
    });

    it('should handle errors', async () => {
      const error = new Error('Commit failed');
      (invoke as ReturnType<typeof vi.fn>).mockRejectedValue(error);

      await expect(commit('/home/user/project', 'test commit')).rejects.toThrow('Commit failed');
    });
  });
});

// ============================================================================
// GitPanel Panel Definition Tests
// ============================================================================

describe('GitPanel Panel Definition', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (invoke as ReturnType<typeof vi.fn>).mockResolvedValue(mockRustStatus);
  });

  describe('Panel Definition', () => {
    it('should have correct panel id', () => {
      expect(gitPanelDefinition.id).toBe('git');
    });

    it('should have correct title', () => {
      expect(gitPanelDefinition.title).toBe('Git');
    });

    it('should have icon renderer', () => {
      expect(gitPanelDefinition.icon).toBeDefined();
      expect(typeof gitPanelDefinition.icon).toBe('function');

      const icon = gitPanelDefinition.icon();
      expect(icon).toBeTruthy();
    });

    it('should have badge renderer', () => {
      expect(gitPanelDefinition.badge).toBeDefined();
      expect(typeof gitPanelDefinition.badge).toBe('function');

      const badge = gitPanelDefinition.badge?.();
      expect(badge).toEqual({ count: 5, color: '#4fc3f7' });
    });

    it('should have full render function', () => {
      expect(gitPanelDefinition.fullRender).toBeDefined();
      expect(typeof gitPanelDefinition.fullRender).toBe('function');
    });
  });

  describe('Badge Renderer', () => {
    it('should return badge with count', () => {
      const badge = gitPanelDefinition.badge?.();
      expect(badge).toEqual({ count: 5, color: '#4fc3f7' });
    });

    it('should return null when count is 0', () => {
      vi.unmock('../../state/workspace');
      vi.mock('../../state/workspace', () => ({
        getActiveRepo: () => mockGitRepo,
        getGitChangesCount: () => 0,
        getGitError: () => null,
      }));

      const badge = gitPanelDefinition.badge?.();
      expect(badge).toBeNull();
    });
  });

  describe('Empty State (NotAGitRepo)', () => {
    beforeEach(() => {
      vi.clearAllMocks();
      vi.unmock('../../state/workspace');
      vi.mock('../../state/workspace', () => ({
        getActiveRepo: () => null,
        getGitChangesCount: () => 5,
        getGitError: () => 'Not a git repository',
      }));
      (invoke as ReturnType<typeof vi.fn>).mockResolvedValue(mockRustStatus);
    });

    it('should render when git error exists', () => {
      const PanelContent = gitPanelDefinition.fullRender;
      const { container } = render(<PanelContent />);

      const containerDiv = container.querySelector('.git-empty-state-container');
      expect(containerDiv).toBeInTheDocument();
    });

    it('should render message text', () => {
      const PanelContent = gitPanelDefinition.fullRender;
      render(<PanelContent />);

      expect(screen.getByText('This workspace is not a git repository')).toBeInTheDocument();
    });

    it('should render initialize button', () => {
      const PanelContent = gitPanelDefinition.fullRender;
      render(<PanelContent />);

      const button = screen.getByText('Initialize Repository');
      expect(button).toBeInTheDocument();
      expect(button).toHaveAttribute('type', 'button');
    });

    it('should show correct title on button', () => {
      const PanelContent = gitPanelDefinition.fullRender;
      render(<PanelContent />);

      const button = screen.getByText('Initialize Repository');
      expect(button).toHaveAttribute('title', 'Initialize Repository (coming soon)');
    });
  });

  describe('Full Panel Rendering', () => {
    beforeEach(() => {
      (invoke as ReturnType<typeof vi.fn>).mockResolvedValue(mockRustStatus);
    });

    it('should render the full git panel', () => {
      const PanelContent = gitPanelDefinition.fullRender;
      const { container } = render(<PanelContent />);

      const gitPanel = container.querySelector('.git-panel');
      expect(gitPanel).toBeInTheDocument();
    });

    it('should display current branch', () => {
      const PanelContent = gitPanelDefinition.fullRender;
      render(<PanelContent />);

      expect(screen.getByText('main')).toBeInTheDocument();
    });

    it('should show staged changes section', () => {
      const PanelContent = gitPanelDefinition.fullRender;
      render(<PanelContent />);

      expect(screen.getByText('Staged Changes')).toBeInTheDocument();
    });

    it('should show changes section', () => {
      const PanelContent = gitPanelDefinition.fullRender;
      render(<PanelContent />);

      expect(screen.getByText('Changes')).toBeInTheDocument();
    });

    it('should display commit textarea', () => {
      const PanelContent = gitPanelDefinition.fullRender;
      render(<PanelContent />);

      const textarea = screen.getByPlaceholderText(/Commit message/i);
      expect(textarea).toBeInTheDocument();
    });

    it('should display commit hint', () => {
      const PanelContent = gitPanelDefinition.fullRender;
      render(<PanelContent />);

      expect(screen.getByText('Press Ctrl+Enter to commit')).toBeInTheDocument();
    });
  });

  describe('Branch Selector', () => {
    it('should render branch selector with icon', () => {
      const PanelContent = gitPanelDefinition.fullRender;
      const { container } = render(<PanelContent />);

      const branchSelector = document.querySelector('.branch-selector-button');
      expect(branchSelector).toBeInTheDocument();
      expect(branchSelector?.querySelector('svg')).toBeInTheDocument();
    });

    it('should display current branch name', () => {
      const PanelContent = gitPanelDefinition.fullRender;
      render(<PanelContent />);

      expect(screen.getByText('main')).toBeInTheDocument();
    });

    it('should open branch dropdown when clicked', async () => {
      const PanelContent = gitPanelDefinition.fullRender;
      const { container } = render(<PanelContent />);

      const branchButton = document.querySelector('.branch-selector-button') as HTMLElement;
      expect(branchButton).toBeInTheDocument();

      fireEvent.click(branchButton);

      await waitFor(() => {
        const dropdown = document.querySelector('.branch-dropdown');
        expect(dropdown).toBeInTheDocument();
      });
    });
  });

  describe('Staged Files Section', () => {
    it('should display staged files count badge', () => {
      const PanelContent = gitPanelDefinition.fullRender;
      const { container } = render(<PanelContent />);

      const badge = container.querySelector('.staged-files-section .git-count-badge');
      expect(badge).toBeInTheDocument();
      expect(badge).toHaveTextContent('2');
    });

    it('should display staged file names', () => {
      const PanelContent = gitPanelDefinition.fullRender;
      render(<PanelContent />);

      expect(screen.getByText('Sidebar.tsx')).toBeInTheDocument();
      expect(screen.getByText('types.ts')).toBeInTheDocument();
    });
  });

  describe('Changed Files Section', () => {
    it('should display changed files count badge', () => {
      const PanelContent = gitPanelDefinition.fullRender;
      const { container } = render(<PanelContent />);

      const badge = container.querySelector('.changes-files-section .git-count-badge');
      expect(badge).toBeInTheDocument();
      expect(badge).toHaveTextContent('5');
    });

    it('should display changed file names', () => {
      const PanelContent = gitPanelDefinition.fullRender;
      render(<PanelContent />);

      expect(screen.getByText('GitPanel.tsx')).toBeInTheDocument();
      expect(screen.getByText('other.ts')).toBeInTheDocument();
      expect(screen.getByText('helper.ts')).toBeInTheDocument();
      expect(screen.getByText('old-file.ts')).toBeInTheDocument();
      expect(screen.getByText('untracked-file.ts')).toBeInTheDocument();
    });
  });

  describe('Status Badges', () => {
    it('should display modified badge with M', () => {
      const PanelContent = gitPanelDefinition.fullRender;
      const { container } = render(<PanelContent />);

      const modifiedBadges = container.querySelectorAll('.git-status-badge.modified');
      expect(modifiedBadges.length).toBeGreaterThan(0);
      modifiedBadges.forEach(badge => {
        expect(badge).toHaveTextContent('M');
      });
    });

    it('should display added badge with A', () => {
      const PanelContent = gitPanelDefinition.fullRender;
      const { container } = render(<PanelContent />);

      const addedBadges = container.querySelectorAll('.git-status-badge.added');
      expect(addedBadges.length).toBeGreaterThan(0);
      addedBadges.forEach(badge => {
        expect(badge).toHaveTextContent('A');
      });
    });

    it('should display deleted badge with D', () => {
      const PanelContent = gitPanelDefinition.fullRender;
      const { container } = render(<PanelContent />);

      const deletedBadge = container.querySelector('.git-status-badge.deleted');
      expect(deletedBadge).toBeInTheDocument();
      expect(deletedBadge).toHaveTextContent('D');
    });

    it('should display untracked badge with ?', () => {
      const PanelContent = gitPanelDefinition.fullRender;
      const { container } = render(<PanelContent />);

      const untrackedBadge = container.querySelector('.git-status-badge.untracked');
      expect(untrackedBadge).toBeInTheDocument();
      expect(untrackedBadge).toHaveTextContent('?');
    });
  });

  describe('Commit Section', () => {
    it('should render commit textarea with placeholder', () => {
      const PanelContent = gitPanelDefinition.fullRender;
      render(<PanelContent />);

      const textarea = screen.getByPlaceholderText(/Commit message/i);
      expect(textarea).toBeInTheDocument();
    });

    it('should enable textarea when there are staged files', () => {
      const PanelContent = gitPanelDefinition.fullRender;
      render(<PanelContent />);

      const textarea = screen.getByPlaceholderText(/Commit message/i) as HTMLTextAreaElement;
      expect(textarea.disabled).toBe(false);
    });

    it('should disable commit button when message is empty', () => {
      const PanelContent = gitPanelDefinition.fullRender;
      const { container } = render(<PanelContent />);

      const commitButton = container.querySelector('.git-commit-button') as HTMLButtonElement;
      expect(commitButton.disabled).toBe(true);
    });

    it('should enable commit button when message is entered', async () => {
      const PanelContent = gitPanelDefinition.fullRender;
      const { container } = render(<PanelContent />);

      const textarea = screen.getByPlaceholderText(/Commit message/i) as HTMLTextAreaElement;
      const commitButton = container.querySelector('.git-commit-button') as HTMLButtonElement;

      fireEvent.change(textarea, { target: { value: 'test commit' } });

      await waitFor(() => {
        expect(commitButton.disabled).toBe(false);
      });
    });
  });
});
