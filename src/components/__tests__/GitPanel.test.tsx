import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { gitPanelDefinition } from '../GitPanel';

vi.mock('../../state/workspace', () => ({
  getGitChangesCount: vi.fn(() => 5),
  default: vi.fn(() => ({
    resetState: vi.fn(),
  })),
}));

const { getGitChangesCount } = await import('../../state/workspace');

describe('GitPanel Component', () => {
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

  describe('Full Panel Rendering', () => {
    beforeEach(() => {
      vi.clearAllMocks();
      (getGitChangesCount as ReturnType<typeof vi.fn>).mockReturnValue(5);
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
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('should render branch selector with icon', () => {
      const PanelContent = gitPanelDefinition.fullRender;
      render(<PanelContent />);

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
      render(<PanelContent />);

      const branchButton = document.querySelector('.branch-selector-button') as HTMLElement;
      expect(branchButton).toBeInTheDocument();

      fireEvent.click(branchButton);

      await waitFor(() => {
        const dropdown = document.querySelector('.branch-dropdown');
        expect(dropdown).toBeInTheDocument();
      });
    });

    it('should display all available branches', async () => {
      const PanelContent = gitPanelDefinition.fullRender;
      const { container } = render(<PanelContent />);

      const branchButton = container.querySelector('.branch-selector-button') as HTMLElement;
      fireEvent.click(branchButton);

      await waitFor(() => {
        const branchOptions = container.querySelectorAll('.branch-option span');
        expect(branchOptions.length).toBe(4);
        expect(branchOptions[0]).toHaveTextContent('main');
        expect(branchOptions[1]).toHaveTextContent('dev');
        expect(branchOptions[2]).toHaveTextContent('feature/sidebar');
        expect(branchOptions[3]).toHaveTextContent('bugfix/terminal-fix');
      });
    });

    it('should show checkmark for current branch', async () => {
      const PanelContent = gitPanelDefinition.fullRender;
      render(<PanelContent />);

      const branchButton = document.querySelector('.branch-selector-button') as HTMLElement;
      fireEvent.click(branchButton);

      await waitFor(() => {
        const mainOption = document.querySelector('.branch-option.current');
        expect(mainOption).toBeInTheDocument();
        expect(mainOption?.querySelector('.branch-check')).toBeInTheDocument();
      });
    });
  });

  describe('Ahead/Behind Indicator', () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('should display ahead commits', () => {
      const PanelContent = gitPanelDefinition.fullRender;
      render(<PanelContent />);

      const aheadIndicator = document.querySelector('.ahead');
      expect(aheadIndicator).toBeInTheDocument();
      expect(aheadIndicator).toHaveTextContent('2');
    });

    it('should not display behind indicator when behind is 0', () => {
      const PanelContent = gitPanelDefinition.fullRender;
      render(<PanelContent />);

      const behindIndicator = document.querySelector('.behind');
      expect(behindIndicator).not.toBeInTheDocument();
    });
  });

  describe('Staged Files Section', () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('should display staged files count badge', () => {
      const PanelContent = gitPanelDefinition.fullRender;
      render(<PanelContent />);

      const badge = document.querySelector('.staged-files-section .git-count-badge');
      expect(badge).toBeInTheDocument();
      expect(badge).toHaveTextContent('2');
    });

    it('should display staged file names', () => {
      const PanelContent = gitPanelDefinition.fullRender;
      render(<PanelContent />);

      expect(screen.getByText('Sidebar.tsx')).toBeInTheDocument();
      expect(screen.getByText('types.ts')).toBeInTheDocument();
    });

    it('should display staged file paths', () => {
      const PanelContent = gitPanelDefinition.fullRender;
      render(<PanelContent />);

      const pathElements = document.querySelectorAll('.git-file-path');
      expect(pathElements.length).toBeGreaterThan(0);
    });

    it('should show checkboxes for staged files', () => {
      const PanelContent = gitPanelDefinition.fullRender;
      render(<PanelContent />);

      const checkboxes = document.querySelectorAll('.staged-files-section .git-checkbox');
      expect(checkboxes.length).toBe(2);
    });

    it('should check staged files checkboxes by default', () => {
      const PanelContent = gitPanelDefinition.fullRender;
      render(<PanelContent />);

      const checkboxes = document.querySelectorAll('.staged-files-section .git-checkbox:checked');
      expect(checkboxes.length).toBe(2);
    });

    it('should expand file details on click', async () => {
      const PanelContent = gitPanelDefinition.fullRender;
      render(<PanelContent />);

      const fileItem = document.querySelector('.git-item') as HTMLElement;
      expect(fileItem).toBeInTheDocument();

      fireEvent.click(fileItem);

      await waitFor(() => {
        const details = document.querySelector('.git-file-details');
        expect(details).toBeInTheDocument();
      });
    });
  });

  describe('Changed Files Section', () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('should display changed files count badge', () => {
      const PanelContent = gitPanelDefinition.fullRender;
      render(<PanelContent />);

      const badge = document.querySelector('.changes-files-section .git-count-badge');
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

    it('should show checkboxes for changed files', () => {
      const PanelContent = gitPanelDefinition.fullRender;
      render(<PanelContent />);

      const checkboxes = document.querySelectorAll('.changes-files-section .git-checkbox');
      expect(checkboxes.length).toBe(5);
    });

    it('should not check changed files checkboxes by default', () => {
      const PanelContent = gitPanelDefinition.fullRender;
      render(<PanelContent />);

      const checkboxes = document.querySelectorAll('.changes-files-section .git-checkbox:checked');
      expect(checkboxes.length).toBe(0);
    });
  });

  describe('Status Badges', () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('should display modified badge with M', () => {
      const PanelContent = gitPanelDefinition.fullRender;
      render(<PanelContent />);

      const modifiedBadges = document.querySelectorAll('.git-status-badge.modified');
      expect(modifiedBadges.length).toBeGreaterThan(0);
      modifiedBadges.forEach(badge => {
        expect(badge).toHaveTextContent('M');
      });
    });

    it('should display added badge with A', () => {
      const PanelContent = gitPanelDefinition.fullRender;
      render(<PanelContent />);

      const addedBadges = document.querySelectorAll('.git-status-badge.added');
      expect(addedBadges.length).toBeGreaterThan(0);
      addedBadges.forEach(badge => {
        expect(badge).toHaveTextContent('A');
      });
    });

    it('should display deleted badge with D', () => {
      const PanelContent = gitPanelDefinition.fullRender;
      render(<PanelContent />);

      const deletedBadge = document.querySelector('.git-status-badge.deleted');
      expect(deletedBadge).toBeInTheDocument();
      expect(deletedBadge).toHaveTextContent('D');
    });

    it('should display untracked badge with ?', () => {
      const PanelContent = gitPanelDefinition.fullRender;
      render(<PanelContent />);

      const untrackedBadge = document.querySelector('.git-status-badge.untracked');
      expect(untrackedBadge).toBeInTheDocument();
      expect(untrackedBadge).toHaveTextContent('?');
    });
  });

  describe('Commit Section', () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

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

    it('should display commit button', () => {
      const PanelContent = gitPanelDefinition.fullRender;
      render(<PanelContent />);

      const commitButton = document.querySelector('.git-commit-button');
      expect(commitButton).toBeInTheDocument();
      expect(commitButton?.querySelector('svg')).toBeInTheDocument();
    });

    it('should disable commit button when message is empty', () => {
      const PanelContent = gitPanelDefinition.fullRender;
      render(<PanelContent />);

      const commitButton = document.querySelector('.git-commit-button') as HTMLButtonElement;
      expect(commitButton.disabled).toBe(true);
    });

    it('should enable commit button when message is entered', async () => {
      const PanelContent = gitPanelDefinition.fullRender;
      render(<PanelContent />);

      const textarea = screen.getByPlaceholderText(/Commit message/i) as HTMLTextAreaElement;
      const commitButton = document.querySelector('.git-commit-button') as HTMLButtonElement;

      fireEvent.change(textarea, { target: { value: 'test commit' } });

      await waitFor(() => {
        expect(commitButton.disabled).toBe(false);
      });
    });

    it('should handle commit message input', () => {
      const PanelContent = gitPanelDefinition.fullRender;
      render(<PanelContent />);

      const textarea = screen.getByPlaceholderText(/Commit message/i) as HTMLTextAreaElement;

      fireEvent.change(textarea, { target: { value: 'Test commit message' } });

      expect(textarea.value).toBe('Test commit message');
    });
  });

  describe('File Item Interactions', () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('should display file icon', () => {
      const PanelContent = gitPanelDefinition.fullRender;
      render(<PanelContent />);

      const fileIcons = document.querySelectorAll('.git-file-icon');
      expect(fileIcons.length).toBeGreaterThan(0);
    });

    it('should display expand/collapse icon', () => {
      const PanelContent = gitPanelDefinition.fullRender;
      render(<PanelContent />);

      const expandIcons = document.querySelectorAll('.git-expand-icon');
      expect(expandIcons.length).toBeGreaterThan(0);
    });

    it('should show file details when expanded', async () => {
      const PanelContent = gitPanelDefinition.fullRender;
      render(<PanelContent />);

      const firstFileItem = document.querySelector('.git-item') as HTMLElement;
      expect(firstFileItem).toBeInTheDocument();

      fireEvent.click(firstFileItem);

      await waitFor(() => {
        const details = document.querySelector('.git-file-details');
        expect(details).toBeInTheDocument();

        const pathLabel = details?.querySelector('.git-detail-label');
        expect(pathLabel).toHaveTextContent('Path:');

        const statusLabel = details?.querySelectorAll('.git-detail-label')[1];
        expect(statusLabel).toHaveTextContent('Status:');
      });
    });
  });

  describe('Unstage File Interaction', () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('should unstage file when checkbox is clicked', async () => {
      const PanelContent = gitPanelDefinition.fullRender;
      const { container } = render(<PanelContent />);

      const stagedCheckbox = container.querySelector('.staged-files-section .git-checkbox') as HTMLInputElement;
      expect(stagedCheckbox).toBeInTheDocument();
      expect(stagedCheckbox.checked).toBe(true);

      fireEvent.click(stagedCheckbox);

      await waitFor(() => {
        const stagedSection = container.querySelector('.staged-files-section');
        const stagedCount = stagedSection?.querySelector('.git-count-badge');
        expect(stagedCount).toHaveTextContent('1');
      });
    });

    it('should move unstaged file to changes section', async () => {
      const PanelContent = gitPanelDefinition.fullRender;
      const { container } = render(<PanelContent />);

      const stagedCheckbox = container.querySelector('.staged-files-section .git-checkbox') as HTMLInputElement;
      fireEvent.click(stagedCheckbox);

      await waitFor(() => {
        const changesSection = container.querySelector('.changes-files-section');
        const changesCount = changesSection?.querySelector('.git-count-badge');
        expect(changesCount).toHaveTextContent('6');
      });
    });
  });

  describe('Empty States', () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('should not show empty state for staged files when files exist', () => {
      const PanelContent = gitPanelDefinition.fullRender;
      render(<PanelContent />);

      const emptyState = document.querySelector('.staged-files-section .git-empty-state');
      expect(emptyState).not.toBeInTheDocument();
    });

    it('should not show empty state for changes when files exist', () => {
      const PanelContent = gitPanelDefinition.fullRender;
      render(<PanelContent />);

      const emptyState = document.querySelector('.changes-files-section .git-empty-state');
      expect(emptyState).not.toBeInTheDocument();
    });
  });

  describe('Badge Renderer', () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('should return badge with correct count', () => {
      (getGitChangesCount as ReturnType<typeof vi.fn>).mockReturnValue(10);

      const badge = gitPanelDefinition.badge?.();
      expect(badge).toEqual({ count: 10, color: '#4fc3f7' });
    });

    it('should return null when count is 0', () => {
      (getGitChangesCount as ReturnType<typeof vi.fn>).mockReturnValue(0);

      const badge = gitPanelDefinition.badge?.();
      expect(badge).toBeNull();
    });
  });

  describe('Icon Renderer', () => {
    it('should render git branch icon', () => {
      const { container } = render(<>{gitPanelDefinition.icon()}</>);

      const svg = container.querySelector('svg');
      expect(svg).toBeInTheDocument();
      expect(svg).toHaveAttribute('width', '16');
      expect(svg).toHaveAttribute('height', '16');
    });
  });
});
