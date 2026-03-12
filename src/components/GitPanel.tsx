import React, { useState, useEffect, useRef } from 'react';
import { PanelDefinition, GitFile, GitRepo } from '../state/types';
import useWorkspaceStore, { getAllGitRepos, getGitChangesCount, getGitError } from '../state/workspace';
import gitService from '../lib/git-service';
import { Button } from './ui/Button';
import { Checkbox, Input } from './ui/Input';
import { Tooltip } from './ui/Tooltip';
import { DialogRoot, DialogPortal, DialogPopup, DialogTitle, DialogClose } from './ui/Dialog';
import {
  AccordionRoot,
  AccordionItem,
  AccordionHeader,
  AccordionTrigger,
  AccordionPanel,
} from './ui/Accordion';
import './GitPanel.css';

const mockGitData = {
  currentBranch: 'main',
  branches: ['main', 'dev', 'feature/sidebar', 'bugfix/terminal-fix'],
  ahead: 2,
  behind: 0,
  stagedCount: 2,
  changesCount: 5,
};

// Dummy staged files to showcase the staged section
const dummyStagedFiles = [
  {
    path: 'src/components/Header.tsx',
    status: 'modified' as const,
    staged: true,
  },
  {
    path: 'src/lib/utils.ts',
    status: 'added' as const,
    staged: true,
  },
  {
    path: 'package.json',
    status: 'modified' as const,
    staged: true,
  },
];

// Dummy unstaged files to showcase the unstaged section
const dummyUnstagedFiles = [
  {
    path: 'src/components/GitPanel.tsx',
    status: 'modified' as const,
    staged: false,
  },
  {
    path: 'src/App.tsx',
    status: 'modified' as const,
    staged: false,
  },
  {
    path: 'src/state/workspace.ts',
    status: 'modified' as const,
    staged: false,
  },
  {
    path: 'src/styles/theme.css',
    status: 'added' as const,
    staged: false,
  },
  {
    path: 'README.md',
    status: 'modified' as const,
    staged: false,
  },
  {
    path: 'src/components/OldComponent.tsx',
    status: 'deleted' as const,
    staged: false,
  },
  {
    path: 'src/utils/helpers.ts',
    status: 'renamed' as const,
    staged: false,
    originalPath: 'src/utils/old-helpers.ts',
  },
  {
    path: 'src/config/local.json',
    status: 'untracked' as const,
    staged: false,
  },
];

// Use real data
const USE_DUMMY_DATA = false;

// Git branch SVG icon
const GitBranchIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <line x1="6" y1="3" x2="6" y2="15" />
    <circle cx="18" cy="6" r="3" />
    <circle cx="6" cy="18" r="3" />
    <path d="M18 9a9 9 0 0 1-9 9" />
  </svg>
);

// Not a git repository empty state component
const NotAGitRepo: React.FC = () => {
  const handleInitialize = () => {
    // Placeholder for v1 - no functionality yet
    console.log('Initialize Repository clicked - not implemented in v1');
  };

  return (
    <div className="git-empty-state-container">
      <div className="git-empty-state-icon-wrapper">
        <GitBranchIcon className="git-empty-state-branch-icon" />
        <div className="git-empty-state-slash" />
      </div>
      <div className="git-empty-state-message">
        This workspace is not a git repository
      </div>
      <Tooltip content="Initialize Repository (coming soon)">
        <Button
          className="git-empty-state-button"
          onClick={handleInitialize}
          variant="primary"
        >
          Initialize Repository
        </Button>
      </Tooltip>
    </div>
  );
};

const CreateBranchDialog: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  onCreateBranch: (branchName: string) => void;
  isCreating?: boolean;
}> = ({ isOpen, onClose, onCreateBranch, isCreating }) => {
  const [branchName, setBranchName] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (branchName.trim()) {
        onCreateBranch(branchName.trim());
        setBranchName('');
        onClose();
      }
    }
    if (e.key === 'Escape') {
      setBranchName('');
      onClose();
    }
  };

  const handleCreate = () => {
    if (branchName.trim()) {
      onCreateBranch(branchName.trim());
      setBranchName('');
      onClose();
    }
  };

  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  return (
    <DialogRoot open={isOpen} onOpenChange={(open) => { if (!open) { setBranchName(''); onClose(); } }}>
      <DialogPortal>
        <DialogPopup className="create-branch-dialog">
          <DialogTitle className="create-branch-dialog-title">
            Create New Branch
          </DialogTitle>
          <Input
            ref={inputRef}
            className="create-branch-dialog-input"
            placeholder="Enter branch name..."
            value={branchName}
            onChange={(e) => setBranchName(e.target.value)}
            onKeyDown={handleKeyDown}
          />
          <div className="create-branch-dialog-actions">
            <DialogClose className="create-branch-dialog-cancel" onClick={() => { setBranchName(''); onClose(); }}>
              Cancel
            </DialogClose>
            <Button
              className="create-branch-dialog-create"
              variant="primary"
              disabled={!branchName.trim() || isCreating}
              onClick={handleCreate}
            >
              {isCreating ? 'Creating...' : 'Create'}
            </Button>
          </div>
        </DialogPopup>
      </DialogPortal>
    </DialogRoot>
  );
};


const BranchSelector: React.FC<{
  currentBranch: string;
  branches: string[];
  onSelect: (branch: string) => void;
  onCreateBranch: (branchName: string) => Promise<void>;
  onDeleteBranch: (branchName: string) => Promise<void>;
  isCreating?: boolean;
  isDeleting?: boolean;
}> = ({ currentBranch, branches, onSelect, onCreateBranch, onDeleteBranch, isCreating, isDeleting }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const handleSelect = (branch: string) => {
    onSelect(branch);
    setIsOpen(false);
  };

  const handleOpenDialog = () => {
    setIsDialogOpen(true);
    setIsOpen(false);
  };

  const handleCloseDialog = () => {
    setIsDialogOpen(false);
  };

  const handleCreateBranch = (branchName: string) => {
    onCreateBranch(branchName);
    handleCloseDialog();
  };

  const handleDeleteBranch = (branchName: string) => {
    onDeleteBranch(branchName);
    setIsOpen(false);
  };

  return (
    <div className="branch-selector">
      <Tooltip content="Switch branch">
        <Button
          className="branch-selector-button"
          onClick={() => setIsOpen(!isOpen)}
          variant="secondary"
        >
          <svg
            className={`branch-selector-chevron ${isOpen ? 'open' : ''}`}
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M6 9l6 6 6-6" />
          </svg>
          <span className="branch-name">{currentBranch}</span>
        </Button>
      </Tooltip>
      {isOpen && (
        <div className="branch-dropdown">
          <Tooltip content="Create new branch">
            <Button
              className="branch-create-button"
              onClick={handleOpenDialog}
              disabled={isCreating}
              variant="secondary"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              <span>Create New Branch</span>
            </Button>
          </Tooltip>
          {branches.map((branch) => (
            <Button
              key={branch}
              className={`branch-option ${branch === currentBranch ? 'current' : ''}`}
              onClick={() => handleSelect(branch)}
              variant="secondary"
            >
              <GitBranchIcon />
              <span>{branch}</span>
              {branch === currentBranch && (
                <svg
                  className="branch-check"
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              )}
              {branch !== currentBranch && (
                <Tooltip content={`Delete branch '${branch}'`}>
                  <Button
                    className="branch-delete-button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteBranch(branch);
                    }}
                    disabled={isDeleting}
                    variant="destructive"
                    size="sm"
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <line x1="18" y1="6" x2="6" y2="18" />
                      <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </Button>
                </Tooltip>
              )}
            </Button>
          ))}
        </div>
      )}
      <CreateBranchDialog
        isOpen={isDialogOpen}
        onClose={handleCloseDialog}
        onCreateBranch={handleCreateBranch}
        isCreating={isCreating}
      />
    </div>
  );
};



// Ahead/Behind indicator component
const AheadBehindIndicator: React.FC<{
  ahead: number;
  behind: number;
}> = ({ ahead, behind }) => {
  if (ahead === 0 && behind === 0) return null;

  return (
    <div className="ahead-behind-indicator">
      {ahead > 0 && (
        <Tooltip content={`${ahead} commits ahead`}>
          <span className="ahead">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 19V5M5 12l7-7 7 7" />
            </svg>
            {ahead}
          </span>
        </Tooltip>
      )}
      {behind > 0 && (
        <Tooltip content={`${behind} commits behind`}>
          <span className="behind">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 5v14M5 12l7 7 7-7" />
            </svg>
            {behind}
          </span>
        </Tooltip>
      )}
    </div>
  );
};

// Status badge component - shows M, A, D, ? for file status
const StatusBadge: React.FC<{ status: GitFile['status'] }> = ({ status }) => {
  const statusMap: Record<GitFile['status'], { label: string; className: string }> = {
    modified: { label: 'M', className: 'modified' },
    added: { label: 'A', className: 'added' },
    deleted: { label: 'D', className: 'deleted' },
    untracked: { label: '?', className: 'untracked' },
    renamed: { label: 'R', className: 'renamed' },
    conflict: { label: 'C', className: 'conflict' },
  };
  const { label, className } = statusMap[status];
  return <span className={`git-status-badge ${className}`}>{label}</span>;
};

// File item with checkbox for staging/unstaging
const FileItem: React.FC<{
  file: GitFile;
  showCheckbox?: boolean;
  expanded?: boolean;
  onToggleExpand?: () => void;
  onCheckboxChange?: () => void;
  onDiscard?: () => void;
}> = ({ file, showCheckbox = true, expanded = false, onToggleExpand, onCheckboxChange, onDiscard }) => {
  const fileName = file.path.split('/').pop() || file.path;
  const dirPath = file.path.includes('/') ? file.path.substring(0, file.path.lastIndexOf('/')) : '';

  const handleDiscard = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (window.confirm(`Discard changes to ${fileName}?`)) {
      onDiscard?.();
    }
  };

  return (
    <div className="git-item-wrapper">
      <div className="git-item" onClick={onToggleExpand}>
        {showCheckbox && (
          <Tooltip content={file.staged ? 'Unstage file' : 'Stage file'}>
            <Checkbox
              className="git-checkbox"
              checked={file.staged || false}
              onCheckedChange={() => {
                onCheckboxChange?.();
              }}
              onClick={(e: React.MouseEvent) => e.stopPropagation()}
            />
          </Tooltip>
        )}
        <span className="git-file-icon">📄</span>
        <div className="git-file-info">
          <Tooltip content={file.path}>
            <span className="git-file-name">{fileName}</span>
          </Tooltip>
          {dirPath && <span className="git-file-path">{dirPath}</span>}
        </div>
        <StatusBadge status={file.status} />
        {!file.staged && onDiscard && (
          <Tooltip content="Discard changes">
            <Button
              className="git-discard-button"
              onClick={handleDiscard}
              variant="destructive"
              size="sm"
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polyline points="3 6 5 6 21 6"></polyline>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
              </svg>
            </Button>
          </Tooltip>
        )}
        {onToggleExpand && (
          <svg
            className={`git-expand-icon ${expanded ? 'expanded' : ''}`}
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M9 18l6-6-6-6" />
          </svg>
        )}
      </div>
      {expanded && (
        <div className="git-file-details">
          <div className="git-detail-row">
            <span className="git-detail-label">Path:</span>
            <span className="git-detail-value">{file.path}</span>
          </div>
          <div className="git-detail-row">
            <span className="git-detail-label">Status:</span>
            <span className="git-detail-value">{file.status}</span>
          </div>
        </div>
      )}
    </div>
  );
};

// Staged files section with expandable tree and unstage checkbox
const StagedFilesSection: React.FC<{
  files: GitFile[];
  onUnstage: (path: string) => void;
}> = ({ files, onUnstage }) => {
  const [expandedFiles, setExpandedFiles] = useState<Set<string>>(new Set());
  const [isCollapsed, setIsCollapsed] = useState(false);

  const toggleExpand = (path: string) => {
    setExpandedFiles(prev => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  };

  const toggleCollapsed = () => {
    setIsCollapsed(prev => !prev);
  };

  return (
    <div className="git-section staged-files-section">
      <div className="section-header" onClick={toggleCollapsed}>
        <svg
          className={`section-chevron ${isCollapsed ? 'collapsed' : ''}`}
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path d="M9 18l6-6-6-6" />
        </svg>
        <span className="section-title">Staged Changes</span>
        {files.length > 0 && (
          <span className="git-count-badge">{files.length}</span>
        )}
      </div>
      {!isCollapsed && (
        <>
          {files.length === 0 ? (
            <div className="git-empty-state">
              <span className="git-empty-text">No staged changes</span>
            </div>
          ) : (
            <div className="git-file-list">
              {files.map((file) => (
                <FileItem
                  key={file.path}
                  file={file}
                  showCheckbox={true}
                  expanded={expandedFiles.has(file.path)}
                  onToggleExpand={() => toggleExpand(file.path)}
                  onCheckboxChange={() => onUnstage(file.path)}
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
};

// Changes files section with expandable tree
const ChangesFilesSection: React.FC<{
  files: GitFile[];
  onStage: (path: string) => Promise<void>;
  onDiscard?: (path: string) => Promise<void>;
}> = ({ files, onStage, onDiscard }) => {
  const [expandedFiles, setExpandedFiles] = useState<Set<string>>(new Set());
  const [isCollapsed, setIsCollapsed] = useState(false);

  const toggleExpand = (path: string) => {
    setExpandedFiles(prev => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  };

  const toggleCollapsed = () => {
    setIsCollapsed(prev => !prev);
  };

  return (
    <div className="git-section changes-files-section">
      <div className="section-header" onClick={toggleCollapsed}>
        <svg
          className={`section-chevron ${isCollapsed ? 'collapsed' : ''}`}
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path d="M9 18l6-6-6-6" />
        </svg>
        <span className="section-title">Changes</span>
        {files.length > 0 && (
          <span className="git-count-badge">{files.length}</span>
        )}
      </div>
      {!isCollapsed && (
        <>
          {files.length === 0 ? (
            <div className="git-empty-state">
              <span className="git-empty-text">No unstaged changes</span>
            </div>
          ) : (
            <div className="git-file-list">
              {files.map((file) => (
                <FileItem
                  key={file.path}
                  file={file}
                  showCheckbox={true}
                  expanded={expandedFiles.has(file.path)}
                  onToggleExpand={() => toggleExpand(file.path)}
                  onCheckboxChange={() => onStage(file.path)}
                  onDiscard={onDiscard ? () => onDiscard(file.path) : undefined}
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
};

const CommitIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className}>
    <circle cx="12" cy="12" r="10" />
    <path d="M8 12l3 3 5-5" />
  </svg>
);

const CommitSection: React.FC<{
  stagedCount: number;
  onCommit: (message: string) => void;
}> = ({ stagedCount, onCommit }) => {
  const [message, setMessage] = useState('');

  const handleCommit = () => {
    if (message.trim() && stagedCount > 0) {
      onCommit(message.trim());
      setMessage('');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      if (e.shiftKey) {
        e.preventDefault();
        setMessage(prev => prev + '\n');
      } else if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        handleCommit();
      }
    }
  };

  return (
    <div className="git-commit-section">
      <div className="git-commit-input-wrapper">
        <Input
          className="git-commit-input"
          type="text"
          placeholder={stagedCount === 0 ? "No staged changes to commit" : "Commit message..."}
          value={message}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setMessage(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={stagedCount === 0}
        />
        <Tooltip content="Commit staged changes (Ctrl+Enter)">
          <Button
            className="git-commit-icon-button"
            onClick={handleCommit}
            disabled={!message.trim() || stagedCount === 0}
            variant="ghost"
            size="sm"
          >
            <CommitIcon />
          </Button>
        </Tooltip>
      </div>
    </div>
  );
};





// Icon renderer - git branch icon
const GitPanelIcon = (): React.ReactNode => (
  <div className="git-panel-icon">
    <GitBranchIcon />
  </div>
);

// Badge renderer - reactive count of staged + changed files
const GitPanelBadge = (): import('../state/types').TabBadge | null => {
  const count = getGitChangesCount();
  if (count === 0) return null;

  return {
    count,
    color: 'var(--notification)',
  };
};

// Helper function to get folder name from repo path
function getRepoFolderName(repoPath: string): string {
  const normalizedPath = repoPath.replace(/\\/g, '/');
  const parts = normalizedPath.split('/').filter(Boolean);
  return parts[parts.length - 1] || 'repo';
}

const RepoSection: React.FC<{
  repoPath: string;
  repo: GitRepo;
}> = ({ repoPath, repo }) => {
  const { updateGitFile } = useWorkspaceStore();

  const handleStage = async (path: string) => {
    updateGitFile(repoPath, path, true);
    try {
      await gitService.stageFile(repoPath, path);
    } catch (error) {
      updateGitFile(repoPath, path, false);
    }
  };

  const handleUnstage = async (path: string) => {
    updateGitFile(repoPath, path, false);
    try {
      await gitService.unstageFile(repoPath, path);
    } catch (error) {
      updateGitFile(repoPath, path, true);
    }
  };

  const handleCommit = async (message: string) => {
    try {
      await gitService.commit(repoPath, message);
      const updatedRepo = await gitService.getGitStatus(repoPath);
      useWorkspaceStore.getState().setGitRepo(repoPath, updatedRepo);
    } catch (error) {
      console.error('Commit failed:', error);
    }
  };

  const handleDiscard = async (path: string) => {
    try {
      await gitService.discardChanges(repoPath, path);
      const updatedRepo = await gitService.getGitStatus(repoPath);
      useWorkspaceStore.getState().setGitRepo(repoPath, updatedRepo);
    } catch (error) {
      console.error('Discard failed:', error);
    }
  };

  const handleRefresh = async () => {
    try {
      const updatedRepo = await gitService.getGitStatus(repoPath);
      useWorkspaceStore.getState().setGitRepo(repoPath, updatedRepo);
    } catch (error) {
      console.error('Refresh failed:', error);
    }
  };

  const handleStageAll = async () => {
    const unstagedFiles = repo.unstaged;
    for (const file of unstagedFiles) {
      try {
        await gitService.stageFile(repoPath, file.path);
      } catch (error) {
        console.error(`Failed to stage ${file.path}:`, error);
      }
    }
    await handleRefresh();
  };

  const handleUnstageAll = async () => {
    const stagedFiles = repo.staged;
    for (const file of stagedFiles) {
      try {
        await gitService.unstageFile(repoPath, file.path);
      } catch (error) {
        console.error(`Failed to unstage ${file.path}:`, error);
      }
    }
    await handleRefresh();
  };

  const displayStaged = USE_DUMMY_DATA ? dummyStagedFiles : (repo?.staged || []);
  const displayUnstaged = USE_DUMMY_DATA ? dummyUnstagedFiles : (repo?.unstaged || []);

  return (
    <div className="git-repo-section">
      <div className="git-repo-actions-row">
        <div className="git-repo-actions-left">
          <AheadBehindIndicator ahead={repo?.ahead || 0} behind={repo?.behind || 0} />
        </div>
        <div className="git-repo-actions-right">
          <Tooltip content="Stage all">
            <Button
              type="button"
              className="git-action-icon-button"
              onClick={handleStageAll}
              disabled={displayUnstaged.length === 0}
              variant="ghost"
              size="sm"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="20,6 9,17 4,12" />
              </svg>
            </Button>
          </Tooltip>
          <Tooltip content="Unstage all">
            <Button
              type="button"
              className="git-action-icon-button"
              onClick={handleUnstageAll}
              disabled={displayStaged.length === 0}
              variant="ghost"
              size="sm"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </Button>
          </Tooltip>
        </div>
      </div>

      <CommitSection stagedCount={displayStaged.length} onCommit={handleCommit} />

      <StagedFilesSection files={displayStaged} onUnstage={handleUnstage} />

      <ChangesFilesSection files={displayUnstaged} onStage={handleStage} onDiscard={handleDiscard} />
    </div>
  );
};

const AccordionChevronIcon: React.FC<{ className?: string; expanded?: boolean }> = ({ className, expanded }) => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    style={{ transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.2s ease' }}
  >
    <path d="M9 18l6-6-6-6" />
  </svg>
);

const RefreshIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className}>
    <path d="M23 4v6h-6M1 20v-6h6M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
  </svg>
);

const RepoAccordionTrigger: React.FC<{
  repo: GitRepo;
  onRefresh: () => Promise<void>;
  isExpanded?: boolean;
}> = ({ repo, onRefresh, isExpanded }) => {
  const handleRefresh = async (e: React.MouseEvent) => {
    e.stopPropagation();
    await onRefresh();
  };

  return (
    <div className="repo-accordion-trigger-content">
      <AccordionChevronIcon className="repo-accordion-chevron" expanded={isExpanded} />
      <span className="git-repo-name">{getRepoFolderName(repo.path)}</span>
      <BranchSelector
        currentBranch={repo.branch}
        branches={mockGitData.branches}
        onSelect={() => {}}
        onCreateBranch={async () => {}}
        onDeleteBranch={async () => {}}
        isCreating={false}
        isDeleting={false}
      />
      {(repo.staged.length + repo.unstaged.length) > 0 && (
        <span className="git-repo-changes-badge">
          {repo.staged.length + repo.unstaged.length}
        </span>
      )}
      <Tooltip content="Refresh">
        <Button
          type="button"
          className="git-repo-refresh-button"
          onClick={handleRefresh}
          variant="ghost"
          size="sm"
        >
          <RefreshIcon />
        </Button>
      </Tooltip>
    </div>
  );
};

// Full panel renderer - shows all repos in accordion
const GitPanelFull = (): React.ReactNode => {
  const gitError = getGitError();
  const { discoverAndRegisterRepos } = useWorkspaceStore();
  const allRepos = getAllGitRepos();

  // Discover git repos on mount
  useEffect(() => {
    discoverAndRegisterRepos('/home/blake/Documents/software/ymir');
  }, [discoverAndRegisterRepos]);

  // Show empty state when no repos or git error exists (unless using dummy data)
  if (!USE_DUMMY_DATA && (allRepos.length === 0 || gitError)) {
    return (
      <div className="git-panel">
        <NotAGitRepo />
      </div>
    );
  }

  // If using dummy data and no repos, show a single dummy repo
  const reposToDisplay = USE_DUMMY_DATA && allRepos.length === 0
    ? [{
      path: '/home/blake/Documents/software/ymir',
      branch: 'main',
      ahead: 2,
      behind: 0,
      staged: dummyStagedFiles,
      unstaged: dummyUnstagedFiles,
    }]
    : allRepos;

  const defaultExpandedValues = reposToDisplay.map(repo => repo.path);

  return (
    <div className="git-panel">
      <AccordionRoot className="git-repos-accordion" multiple defaultValue={defaultExpandedValues}>
        {reposToDisplay.map((repo) => (
          <AccordionItem
            key={repo.path}
            value={repo.path}
            className="git-repo-accordion-item"
          >
            <AccordionHeader className="git-repo-accordion-header">
              <AccordionTrigger className="git-repo-accordion-trigger">
                <RepoAccordionTrigger
                  repo={repo}
                  onRefresh={async () => {
                    const updatedRepo = await gitService.getGitStatus(repo.path);
                    useWorkspaceStore.getState().setGitRepo(repo.path, updatedRepo);
                  }}
                />
              </AccordionTrigger>
            </AccordionHeader>
            <AccordionPanel className="git-repo-accordion-panel">
              <RepoSection repoPath={repo.path} repo={repo} />
            </AccordionPanel>
          </AccordionItem>
        ))}
      </AccordionRoot>
    </div>
  );
};


export const gitPanelDefinition: PanelDefinition = {
  id: 'git',
  title: 'Git',
  icon: GitPanelIcon,
  badge: GitPanelBadge,
  fullRender: GitPanelFull,
};

function getRepoFolderNameOld(repoPath: string): string {
  const normalizedPath = repoPath.replace(/\\/g, '/');
  const parts = normalizedPath.split('/').filter(Boolean);
  return parts[parts.length - 1] || 'repo';
}

function RepoPanelContent({ repoPath }: { repoPath: string }): React.ReactElement {
  const { setActiveRepo } = useWorkspaceStore();

  React.useEffect(() => {
    setActiveRepo(repoPath);
  }, [repoPath, setActiveRepo]);

  return <GitPanelFull />;
}

export function createRepoPanelDefinition(repoPath: string): PanelDefinition {
  const folderName = getRepoFolderNameOld(repoPath);
  const panelId = `git-${repoPath}`;

  return {
    id: panelId,
    title: folderName,
    icon: GitPanelIcon,
    badge: () => {
      const { gitRepos } = useWorkspaceStore.getState();
      const repo = gitRepos[repoPath];
      if (!repo) return null;
      const count = repo.staged.length + repo.unstaged.length;
      return count > 0 ? { count, color: 'var(--notification)' } : null;
    },
    fullRender: () => React.createElement(RepoPanelContent, { repoPath }),
  };
}
