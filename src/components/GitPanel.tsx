import React, { useState, useEffect, useRef } from 'react';
import { PanelDefinition, GitFile, GitRepo } from '../state/types';
import useWorkspaceStore, { getAllGitRepos, getGitChangesCount, getGitError } from '../state/workspace';
import gitService from '../lib/git-service';
import { Button } from './ui/Button';
import { Checkbox, Textarea, Input } from './ui/Input';
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

// Use dummy data for demonstration
const USE_DUMMY_DATA = true;

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

// Commit section with message textarea and floating commit button
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
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      handleCommit();
    }
  };

  return (
    <div className="git-commit-section">
      <div className="git-commit-textarea-wrapper">
        <Textarea
          className="git-commit-textarea"
          placeholder={stagedCount === 0 ? "No staged changes to commit" : "Commit message..."}
          value={message}
          onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setMessage(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={stagedCount === 0}
        />
        <Tooltip content="Commit staged changes">
          <Button
            className="git-commit-button"
            onClick={handleCommit}
            disabled={!message.trim() || stagedCount === 0}
            variant="primary"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="20,6 9,17 4,12" />
            </svg>
            <span>Commit</span>
          </Button>
        </Tooltip>
      </div>
      {stagedCount > 0 && (
        <div className="git-commit-hint">
          Press Ctrl+Enter to commit
        </div>
      )}
    </div>
  );
};

const GitPanelHeader: React.FC = () => {
  const handleRefresh = () => {
    console.log('Refresh git status');
  };

  const handleMoreActions = () => {
    console.log('Open more actions menu');
  };

  return (
    <div className="git-panel-header">
      <span className="git-panel-header-title">SOURCE CONTROL</span>
      <div className="git-panel-header-actions">
        <Tooltip content="Refresh">
          <Button
            type="button"
            className="git-header-action-button"
            onClick={handleRefresh}
            variant="ghost"
            size="sm"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M23 4v6h-6M1 20v-6h6M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
            </svg>
          </Button>
        </Tooltip>
        <Tooltip content="More Actions">
          <Button
            type="button"
            className="git-header-action-button"
            onClick={handleMoreActions}
            variant="ghost"
            size="sm"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="5" r="1" fill="currentColor" />
              <circle cx="12" cy="12" r="1" fill="currentColor" />
              <circle cx="12" cy="19" r="1" fill="currentColor" />
            </svg>
          </Button>
        </Tooltip>
      </div>
    </div>
  );
};

// New toolbar row component with branch selector and icon buttons
const GitPanelToolbarRow: React.FC<{
  currentBranch: string;
  branches: string[];
  onSelectBranch: (branch: string) => void;
  onCreateBranch: (branchName: string) => Promise<void>;
  onDeleteBranch: (branchName: string) => Promise<void>;
  onRefresh: () => Promise<void>;
  onStageAll: () => Promise<void>;
  onUnstageAll: () => Promise<void>;
  unstagedCount: number;
  stagedCount: number;
  ahead: number;
  behind: number;
  isCreating?: boolean;
  isDeleting?: boolean;
}> = ({
  currentBranch,
  branches,
  onSelectBranch,
  onCreateBranch,
  onDeleteBranch,
  onRefresh,
  onStageAll,
  onUnstageAll,
  unstagedCount,
  stagedCount,
  ahead,
  behind,
  isCreating,
  isDeleting,
}) => {
  return (
    <div className="git-panel-toolbar-row">
      <div className="git-panel-toolbar-left">
        <BranchSelector
          currentBranch={currentBranch}
          branches={branches}
          onSelect={onSelectBranch}
          onCreateBranch={onCreateBranch}
          onDeleteBranch={onDeleteBranch}
          isCreating={isCreating}
          isDeleting={isDeleting}
        />
        <AheadBehindIndicator ahead={ahead} behind={behind} />
      </div>
      <div className="git-panel-toolbar-actions">
        <Tooltip content="Refresh">
          <Button
            type="button"
            className="git-toolbar-icon-button"
            onClick={onRefresh}
            variant="ghost"
            size="sm"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M23 4v6h-6M1 20v-6h6M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
            </svg>
          </Button>
        </Tooltip>
        <Tooltip content="Stage all unstaged changes">
          <Button
            type="button"
            className="git-toolbar-icon-button"
            onClick={onStageAll}
            disabled={unstagedCount === 0}
            variant="ghost"
            size="sm"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="20,6 9,17 4,12" />
            </svg>
          </Button>
        </Tooltip>
        <Tooltip content="Unstage all staged changes">
          <Button
            type="button"
            className="git-toolbar-icon-button"
            onClick={onUnstageAll}
            disabled={stagedCount === 0}
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

// RepoSection component - contains all git UI for a single repo
const RepoSection: React.FC<{
  repoPath: string;
  repo: GitRepo;
}> = ({ repoPath, repo }) => {
  const { updateGitFile } = useWorkspaceStore();
  const [createBranch, setCreateBranch] = useState(false);
  const [deleteBranch, setDeleteBranch] = useState(false);

  // Handle staging a file
  const handleStage = async (path: string) => {
    // Optimistic UI update - move file from unstaged to staged
    updateGitFile(repoPath, path, true);

    try {
      await gitService.stageFile(repoPath, path);
    } catch (error) {
      // Revert optimistic update on error
      updateGitFile(repoPath, path, false);
    }
  };

  // Handle unstaging a file
  const handleUnstage = async (path: string) => {
    // Optimistic UI update - move file from staged to unstaged
    updateGitFile(repoPath, path, false);

    try {
      await gitService.unstageFile(repoPath, path);
    } catch (error) {
      // Revert optimistic update on error
      updateGitFile(repoPath, path, true);
    }
  };

  // Handle commit
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

  const onCreateBranch = async (branchName: string) => {
    setCreateBranch(true);

    if (window.confirm(`Create branch '${branchName}'?`)) {
      try {
        await gitService.createBranch(repoPath, branchName);
        const updatedRepo = await gitService.getGitStatus(repoPath);
        useWorkspaceStore.getState().setGitRepo(repoPath, updatedRepo);
      } catch (error) {
        console.error('Failed to create branch:', error);
      }
    }

    setCreateBranch(false);
  };

  const onDeleteBranch = async (branchName: string) => {
    setDeleteBranch(true);

    if (window.confirm(`Delete branch '${branchName}'?`)) {
      try {
        await gitService.deleteBranch(repoPath, branchName);
        const updatedRepo = await gitService.getGitStatus(repoPath);
        useWorkspaceStore.getState().setGitRepo(repoPath, updatedRepo);
      } catch (error) {
        console.error('Failed to delete branch:', error);
      }
    }

    setDeleteBranch(false);
  };

  const displayStaged = USE_DUMMY_DATA ? dummyStagedFiles : (repo?.staged || []);
  const displayUnstaged = USE_DUMMY_DATA ? dummyUnstagedFiles : (repo?.unstaged || []);

  return (
    <div className="git-repo-section">
      {/* Branch selector + toolbar row */}
      <GitPanelToolbarRow
        currentBranch={repo?.branch || 'main'}
        branches={mockGitData.branches}
        onSelectBranch={() => {}}
        onCreateBranch={onCreateBranch}
        onDeleteBranch={onDeleteBranch}
        onRefresh={handleRefresh}
        onStageAll={handleStageAll}
        onUnstageAll={handleUnstageAll}
        unstagedCount={displayUnstaged.length}
        stagedCount={displayStaged.length}
        ahead={repo?.ahead || 0}
        behind={repo?.behind || 0}
        isCreating={createBranch}
        isDeleting={deleteBranch}
      />

      {/* Commit section */}
      <CommitSection stagedCount={displayStaged.length} onCommit={handleCommit} />

      {/* Staged files */}
      <StagedFilesSection files={displayStaged} onUnstage={handleUnstage} />

      {/* Changes files */}
      <ChangesFilesSection files={displayUnstaged} onStage={handleStage} onDiscard={handleDiscard} />
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
        <GitPanelHeader />
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

  return (
    <div className="git-panel">
      <GitPanelHeader />

      <AccordionRoot className="git-repos-accordion" multiple>
        {reposToDisplay.map((repo) => (
          <AccordionItem
            key={repo.path}
            value={repo.path}
            className="git-repo-accordion-item"
          >
            <AccordionHeader className="git-repo-accordion-header">
              <AccordionTrigger className="git-repo-accordion-trigger">
                <GitBranchIcon className="git-repo-icon" />
                <span className="git-repo-name">{getRepoFolderName(repo.path)}</span>
                <span className="git-repo-branch">({repo.branch})</span>
                {(repo.staged.length + repo.unstaged.length) > 0 && (
                  <span className="git-repo-changes-badge">
                    {repo.staged.length + repo.unstaged.length}
                  </span>
                )}
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
