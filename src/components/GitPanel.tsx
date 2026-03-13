import React, { useState, useEffect, useRef, useCallback } from 'react';
import { PanelDefinition, GitFile, GitRepo } from '../state/types';
import useWorkspaceStore, { getAllGitRepos, getGitChangesCount, getGitError } from '../state/workspace';
import gitService from '../lib/git-service';
import logger from '../lib/logger';
import { invoke } from '@tauri-apps/api/core';
import { useExpandCollapse } from '../hooks/useExpandCollapse';
import { Button } from './ui/Button';
import { Checkbox, Input } from './ui/Input';
import { Tooltip } from './ui/Tooltip';
import {
  AlertDialogRoot,
  AlertDialogPortal,
  AlertDialogPopup,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogClose,
} from './ui/Dialog';
import {
  AccordionRoot,
  AccordionItem,
  AccordionHeader,
  AccordionTrigger,
  AccordionPanel,
} from './ui/Accordion';
import {
  PopoverRoot,
  PopoverTrigger,
  PopoverPortal,
  PopoverPositioner,
  PopoverPopup,
} from './ui/Popover';
import {
  ToastProvider,
  ToastPortal,
  ToastViewport,
  ToastRoot,
  ToastContent,
  ToastTitle,
  ToastDescription,
  ToastClose,
} from './ui/Toast';
import './GitPanel.css';

const GitBranchIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <line x1="6" y1="3" x2="6" y2="15" />
    <circle cx="18" cy="6" r="3" />
    <circle cx="6" cy="18" r="3" />
    <path d="M18 9a9 9 0 0 1-9 9" />
  </svg>
);

const NotAGitRepo: React.FC = () => {
  const handleInitialize = () => {
    logger.info('Initialize Repository clicked - not implemented in v1');
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
        <Button className="git-empty-state-button" onClick={handleInitialize} variant="primary">
          Initialize Repository
        </Button>
      </Tooltip>
    </div>
  );
};

const TrashIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <polyline points="3 6 5 6 21 6"></polyline>
    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
  </svg>
);

const BranchDeleteAlert: React.FC<{
  branchName: string;
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
}> = ({ branchName, isOpen, onClose, onConfirm }) => {
  return (
    <AlertDialogRoot open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <AlertDialogPortal>
        <AlertDialogPopup className="branch-delete-alert-popup">
          <AlertDialogTitle className="branch-delete-alert-title">Delete Branch</AlertDialogTitle>
          <AlertDialogDescription className="branch-delete-alert-description">
            Delete branch '{branchName}'?
          </AlertDialogDescription>
          <div className="branch-delete-alert-actions">
            <AlertDialogClose className="branch-delete-alert-cancel" onClick={onClose}>
              Cancel
            </AlertDialogClose>
            <button className="branch-delete-alert-confirm" onClick={onConfirm}>
              Delete
            </button>
          </div>
        </AlertDialogPopup>
      </AlertDialogPortal>
    </AlertDialogRoot>
  );
};

const BranchSelector: React.FC<{
  currentBranch: string;
  branches: string[];
  onSelect: (branch: string) => void;
  onCreateBranch: (branchName: string) => Promise<void>;
  onDeleteBranch: (branchName: string) => Promise<void>;
  onShowToast: (message: string, type?: 'error' | 'success') => void;
  isCreating?: boolean;
  isDeleting?: boolean;
}> = ({ currentBranch, branches, onSelect, onCreateBranch, onDeleteBranch, onShowToast, isCreating, isDeleting }) => {
  const [open, setOpen] = useState(false);
  const [isCreatingInline, setIsCreatingInline] = useState(false);
  const [newBranchName, setNewBranchName] = useState('');
  const [branchToDelete, setBranchToDelete] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isCreatingInline && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isCreatingInline]);

  const handleSelect = async (branch: string) => {
    try {
      await onSelect(branch);
      setOpen(false);
    } catch (error) {
      onShowToast('Cannot switch branches: You have uncommitted changes', 'error');
    }
  };

  const handleStartCreate = () => {
    setIsCreatingInline(true);
    setNewBranchName('');
  };

  const handleCancelCreate = () => {
    setIsCreatingInline(false);
    setNewBranchName('');
  };

  const handleCreateBranch = async () => {
    if (newBranchName.trim()) {
      try {
        await onCreateBranch(newBranchName.trim());
        setIsCreatingInline(false);
        setNewBranchName('');
        setOpen(false);
      } catch (error) {
        onShowToast('Failed to create branch', 'error');
      }
    }
  };

  const handleInputKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleCreateBranch();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      handleCancelCreate();
    }
  };

  const handleDeleteClick = (e: React.MouseEvent, branch: string) => {
    e.stopPropagation();
    setBranchToDelete(branch);
  };

  const handleConfirmDelete = async () => {
    if (branchToDelete) {
      try {
        await onDeleteBranch(branchToDelete);
        setBranchToDelete(null);
        setOpen(false);
      } catch (error) {
        onShowToast('Failed to delete branch', 'error');
      }
    }
  };

  const handleCloseDeleteAlert = () => {
    setBranchToDelete(null);
  };

  return (
    <>
      <PopoverRoot open={open} onOpenChange={setOpen}>
        <Tooltip content="Switch branch">
          <PopoverTrigger className="branch-selector-trigger">
            <svg className={`branch-selector-chevron ${open ? 'open' : ''}`} width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M6 9l6 6 6-6" />
            </svg>
            <span className="branch-name">{currentBranch}</span>
          </PopoverTrigger>
        </Tooltip>
        <PopoverPortal>
          <PopoverPositioner side="bottom" align="center" sideOffset={4}>
            <PopoverPopup className="branch-dropdown-popup">
              <div className="branch-dropdown">
                {isCreatingInline ? (
                  <div className="branch-create-input-wrapper">
                    <input
                      ref={inputRef}
                      className="branch-create-input"
                      type="text"
                      placeholder="Enter branch name..."
                      value={newBranchName}
                      onChange={(e) => setNewBranchName(e.target.value)}
                      onKeyDown={handleInputKeyDown}
                      disabled={isCreating}
                    />
                  </div>
                ) : (
                  <button className="branch-create-link" onClick={handleStartCreate}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <line x1="12" y1="5" x2="12" y2="19" />
                      <line x1="5" y1="12" x2="19" y2="12" />
                    </svg>
                    <span>Create New Branch</span>
                  </button>
                )}
                {branches.map((branch) => (
                  <button
                    key={branch}
                    className={`branch-option ${branch === currentBranch ? 'current' : ''}`}
                    onClick={() => handleSelect(branch)}
                  >
                    <GitBranchIcon />
                    <span>{branch}</span>
                    {branch === currentBranch && (
                      <svg className="branch-check" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    )}
                    {branch !== currentBranch && (
                      <Tooltip content={`Delete branch '${branch}'`}>
                        <button
                          className="branch-delete-button"
                          onClick={(e) => handleDeleteClick(e, branch)}
                          disabled={isDeleting}
                          aria-label={`Delete branch ${branch}`}
                        >
                          <TrashIcon />
                        </button>
                      </Tooltip>
                    )}
                  </button>
                ))}
              </div>
            </PopoverPopup>
          </PopoverPositioner>
        </PopoverPortal>
      </PopoverRoot>
      <BranchDeleteAlert
        branchName={branchToDelete || ''}
        isOpen={!!branchToDelete}
        onClose={handleCloseDeleteAlert}
        onConfirm={handleConfirmDelete}
      />
    </>
  );
};

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

const FileItem: React.FC<{
  file: GitFile;
  showCheckbox?: boolean;
  expanded?: boolean;
  onToggleExpand?: () => void;
  onCheckboxChange?: () => void;
  onDiscard?: () => void;
}> = React.memo(({ file, showCheckbox = true, expanded = false, onToggleExpand, onCheckboxChange, onDiscard }) => {
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
              onCheckedChange={() => { onCheckboxChange?.(); }}
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
            <Button className="git-discard-button" onClick={handleDiscard} variant="destructive" size="sm">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="3 6 5 6 21 6"></polyline>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
              </svg>
            </Button>
          </Tooltip>
        )}
        {onToggleExpand && (
          <svg className={`git-expand-icon ${expanded ? 'expanded' : ''}`} width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M9 18l6-6-6-6" />
          </svg>
        )}
      </div>
      {expanded && (
        <div className="git-file-details">
          <div className="git-detail-row"><span className="git-detail-label">Path:</span><span className="git-detail-value">{file.path}</span></div>
          <div className="git-detail-row"><span className="git-detail-label">Status:</span><span className="git-detail-value">{file.status}</span></div>
        </div>
      )}
    </div>
  );
});

const StagedFilesSection: React.FC<{
  files: GitFile[];
  onUnstage: (path: string) => void;
  onUnstageAll: () => Promise<void>;
}> = ({ files, onUnstage, onUnstageAll }) => {
  const { expandedFiles, isCollapsed, toggleExpand, toggleCollapsed } = useExpandCollapse();

  return (
    <div className="git-section staged-files-section">
      <div className="section-header" onClick={toggleCollapsed}>
        <div className="section-header-left">
          <svg className={`section-chevron ${isCollapsed ? 'collapsed' : ''}`} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M9 18l6-6-6-6" />
          </svg>
          <span className="section-title">Staged Changes</span>
          {files.length > 0 && <span className="git-count-badge">{files.length}</span>}
        </div>
        <div className="section-header-actions">
          <Tooltip content="Unstage all">
            <Button type="button" className="section-action-button" onClick={(e) => { e.stopPropagation(); onUnstageAll(); }} disabled={files.length === 0} variant="ghost" size="sm">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </Button>
          </Tooltip>
        </div>
      </div>
      {!isCollapsed && (
        <>
          {files.length === 0 ? (
            <div className="git-empty-state"><span className="git-empty-text">No staged changes</span></div>
          ) : (
            <div className="git-file-list">
              {files.map((file) => (
                <FileItem key={file.path} file={file} showCheckbox={true} expanded={expandedFiles.has(file.path)} onToggleExpand={() => toggleExpand(file.path)} onCheckboxChange={() => onUnstage(file.path)} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
};

const ChangesFilesSection: React.FC<{
  files: GitFile[];
  onStage: (path: string) => Promise<void>;
  onDiscard?: (path: string) => Promise<void>;
  onStageAll: () => Promise<void>;
  onDiscardAll: () => Promise<void>;
}> = ({ files, onStage, onDiscard, onStageAll, onDiscardAll }) => {
  const { expandedFiles, isCollapsed, toggleExpand, toggleCollapsed } = useExpandCollapse();

  const handleDiscardAll = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (window.confirm(`Discard changes in ${files.length} files?`)) await onDiscardAll();
  };

  return (
    <div className="git-section changes-files-section">
      <div className="section-header" onClick={toggleCollapsed}>
        <div className="section-header-left">
          <svg className={`section-chevron ${isCollapsed ? 'collapsed' : ''}`} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M9 18l6-6-6-6" />
          </svg>
          <span className="section-title">Changes</span>
          {files.length > 0 && <span className="git-count-badge">{files.length}</span>}
        </div>
        <div className="section-header-actions">
          <Tooltip content="Stage all">
            <Button type="button" className="section-action-button" onClick={(e) => { e.stopPropagation(); onStageAll(); }} disabled={files.length === 0} variant="ghost" size="sm">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="20,6 9,17 4,12" />
              </svg>
            </Button>
          </Tooltip>
          <Tooltip content="Restore all">
            <Button type="button" className="section-action-button" onClick={handleDiscardAll} disabled={files.length === 0} variant="ghost" size="sm">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="3 6 5 6 21 6"></polyline>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
              </svg>
            </Button>
          </Tooltip>
        </div>
      </div>
      {!isCollapsed && (
        <>
          {files.length === 0 ? (
            <div className="git-empty-state"><span className="git-empty-text">No unstaged changes</span></div>
          ) : (
            <div className="git-file-list">
              {files.map((file) => (
                <FileItem key={file.path} file={file} showCheckbox={true} expanded={expandedFiles.has(file.path)} onToggleExpand={() => toggleExpand(file.path)} onCheckboxChange={() => onStage(file.path)} onDiscard={onDiscard ? () => onDiscard(file.path) : undefined} />
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
      if (e.shiftKey) { e.preventDefault(); setMessage(prev => prev + '\n'); }
      else if (e.ctrlKey || e.metaKey) { e.preventDefault(); handleCommit(); }
    }
  };

  return (
    <div className="git-commit-section">
      <div className="git-commit-input-wrapper">
        <Input className="git-commit-input" type="text" placeholder={stagedCount === 0 ? "No staged changes to commit" : "Commit message..."} value={message} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setMessage(e.target.value)} onKeyDown={handleKeyDown} disabled={stagedCount === 0} />
        <Tooltip content="Commit staged changes (Ctrl+Enter)">
          <Button className="git-commit-icon-button" onClick={handleCommit} disabled={!message.trim() || stagedCount === 0} variant="ghost" size="sm">
            <CommitIcon />
          </Button>
        </Tooltip>
      </div>
    </div>
  );
};

const GitPanelIcon = (): React.ReactNode => (
  <div className="git-panel-icon"><GitBranchIcon /></div>
);

const GitPanelBadge = (): import('../state/types').TabBadge | null => {
  const count = getGitChangesCount();
  if (count === 0) return null;
  return { count, color: 'var(--notification)' };
};

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
    try { await gitService.stageFile(repoPath, path); } catch (error) { updateGitFile(repoPath, path, false); }
  };

  const handleUnstage = async (path: string) => {
    updateGitFile(repoPath, path, false);
    try { await gitService.unstageFile(repoPath, path); } catch (error) { updateGitFile(repoPath, path, true); }
  };

  const handleCommit = async (message: string) => {
    try {
      await gitService.commit(repoPath, message);
      const updatedRepo = await gitService.getGitStatus(repoPath);
      useWorkspaceStore.getState().setGitRepo(repoPath, updatedRepo);
    } catch (error) { logger.error('Commit failed', { repoPath, error }); }
  };

  const handleDiscard = async (path: string) => {
    try {
      await gitService.discardChanges(repoPath, path);
      const updatedRepo = await gitService.getGitStatus(repoPath);
      useWorkspaceStore.getState().setGitRepo(repoPath, updatedRepo);
    } catch (error) { logger.error('Discard failed', { repoPath, path, error }); }
  };

  const handleRefresh = async () => {
    try {
      const updatedRepo = await gitService.getGitStatus(repoPath);
      useWorkspaceStore.getState().setGitRepo(repoPath, updatedRepo);
    } catch (error) { logger.error('Refresh failed', { repoPath, error }); }
  };

  const handleStageAll = async () => {
    const unstagedFiles = repo.unstaged;
    await Promise.all(
      unstagedFiles.map(file =>
        gitService.stageFile(repoPath, file.path).catch(error => {
          logger.error('Failed to stage file', { repoPath, path: file.path, error });
        })
      )
    );
    await handleRefresh();
  };

  const handleUnstageAll = async () => {
    const stagedFiles = repo.staged;
    await Promise.all(
      stagedFiles.map(file =>
        gitService.unstageFile(repoPath, file.path).catch(error => {
          logger.error('Failed to unstage file', { repoPath, path: file.path, error });
        })
      )
    );
    await handleRefresh();
  };

  const handleDiscardAll = async () => {
    const unstagedFiles = repo.unstaged;
    await Promise.all(
      unstagedFiles.map(file =>
        gitService.discardChanges(repoPath, file.path).catch(error => {
          logger.error('Failed to discard file', { repoPath, path: file.path, error });
        })
      )
    );
    await handleRefresh();
  };

  const displayStaged = repo?.staged || [];
  const displayUnstaged = repo?.unstaged || [];

  return (
    <div className="git-repo-section">
      <CommitSection stagedCount={displayStaged.length} onCommit={handleCommit} />
      <StagedFilesSection files={displayStaged} onUnstage={handleUnstage} onUnstageAll={handleUnstageAll} />
      <ChangesFilesSection files={displayUnstaged} onStage={handleStage} onDiscard={handleDiscard} onStageAll={handleStageAll} onDiscardAll={handleDiscardAll} />
    </div>
  );
};

const AccordionChevronIcon: React.FC<{ className?: string; expanded?: boolean }> = ({ className, expanded }) => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} style={{ transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.2s ease' }}>
    <path d="M9 18l6-6-6-6" />
  </svg>
);

const RefreshIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className}>
    <path d="M23 4v6h-6M1 20v-6h6M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
  </svg>
);

const RepoAccordionTrigger: React.FC<{
  repo: GitRepo;
  onRefresh: () => Promise<void>;
  onShowToast: (message: string, type?: 'error' | 'success') => void;
  isExpanded?: boolean;
}> = ({ repo, onRefresh, onShowToast, isExpanded }) => {
  const [branches, setBranches] = useState<string[]>([]);
  const handleRefresh = async (e: React.MouseEvent) => {
    e.stopPropagation();
    await onRefresh();
  };

  const handleBranchSelectorClick = (e: React.MouseEvent) => {
    e.stopPropagation();
  };

  const handleSelectBranch = async (branch: string) => {
    try {
      await gitService.checkoutBranch(repo.path, branch);
      const updatedRepo = await gitService.getGitStatus(repo.path);
      useWorkspaceStore.getState().setGitRepo(repo.path, updatedRepo);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (errorMessage.includes('uncommitted') || errorMessage.includes('changes')) {
        onShowToast('Cannot switch branches: You have uncommitted changes', 'error');
      } else {
        onShowToast(`Failed to switch to branch '${branch}'`, 'error');
      }
      throw error;
    }
  };

  const handleCreateBranch = async (branchName: string) => {
    try {
      await gitService.createBranch(repo.path, branchName);
      await gitService.checkoutBranch(repo.path, branchName);
      const updatedRepo = await gitService.getGitStatus(repo.path);
      useWorkspaceStore.getState().setGitRepo(repo.path, updatedRepo);
      onShowToast(`Created and switched to branch '${branchName}'`, 'success');
    } catch (error) {
      onShowToast('Failed to create branch', 'error');
      throw error;
    }
  };

  const handleDeleteBranch = async (branchName: string) => {
    try {
      await gitService.deleteBranch(repo.path, branchName);
      const updatedRepo = await gitService.getGitStatus(repo.path);
      useWorkspaceStore.getState().setGitRepo(repo.path, updatedRepo);
      onShowToast(`Deleted branch '${branchName}'`, 'success');
    } catch (error) {
      onShowToast('Failed to delete branch', 'error');
      throw error;
    }
  };

  useEffect(() => {
    const fetchBranches = async () => {
      try {
        const branchInfo = await gitService.getBranches(repo.path);
        setBranches(branchInfo.map(b => b.name));
      } catch (error) {
        logger.error('Failed to fetch branches', { repoPath: repo.path, error });
      }
    };

    fetchBranches();
  }, [repo.path]);

  return (
    <div className="repo-accordion-trigger-content">
      <AccordionChevronIcon className="repo-accordion-chevron" expanded={isExpanded} />
      <span className="git-repo-name">{getRepoFolderName(repo.path)}</span>
      <Tooltip content="Refresh">
        <Button type="button" className="git-repo-refresh-button" onClick={handleRefresh} variant="ghost" size="sm">
          <RefreshIcon />
        </Button>
      </Tooltip>
      <div className="branch-selector-wrapper" onClick={handleBranchSelectorClick}>
        <BranchSelector
          currentBranch={repo.branch}
          branches={branches}
          onSelect={handleSelectBranch}
          onCreateBranch={handleCreateBranch}
          onDeleteBranch={handleDeleteBranch}
          onShowToast={onShowToast}
          isCreating={false}
          isDeleting={false}
        />
      </div>
      {(repo.staged.length + repo.unstaged.length) > 0 && (
        <span className="git-repo-changes-badge">{repo.staged.length + repo.unstaged.length}</span>
      )}
    </div>
  );
};

interface ToastItem {
  id: string;
  message: string;
  type: 'error' | 'success';
}

const GitPanelFull = (): React.ReactNode => {
  const gitError = getGitError();
  const { discoverAndRegisterRepos } = useWorkspaceStore();
  const allRepos = getAllGitRepos();
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const toastTimeoutRefs = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());

  // Cleanup all toast timeouts on unmount
  useEffect(() => {
    return () => {
      toastTimeoutRefs.current.forEach((id) => clearTimeout(id));
      toastTimeoutRefs.current.clear();
    };
  }, []);

  useEffect(() => {
    invoke<string>('get_app_cwd').then((cwd) => {
      logger.info('[GitPanel] get_app_cwd returned', { cwd });
      discoverAndRegisterRepos(cwd);
    }).catch((err) => {
      logger.info('[GitPanel] get_app_cwd failed, using fallback', { err });
      discoverAndRegisterRepos('.');
    });
  }, [discoverAndRegisterRepos]);

  const showToast = useCallback((message: string, type: 'error' | 'success' = 'error') => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts(prev => [...prev, { id, message, type }]);
    const timeoutId = setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
      toastTimeoutRefs.current.delete(timeoutId);
    }, 5000);
    toastTimeoutRefs.current.add(timeoutId);
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  if (allRepos.length === 0 || gitError) {
    return (
      <div className="git-panel">
        <NotAGitRepo />
      </div>
    );
  }

  const reposToDisplay = allRepos;

  const defaultExpandedValues = reposToDisplay.map(repo => repo.path);

  return (
    <ToastProvider>
      <div className="git-panel">
        <AccordionRoot className="git-repos-accordion" multiple defaultValue={defaultExpandedValues}>
          {reposToDisplay.map((repo) => (
            <AccordionItem key={repo.path} value={repo.path} className="git-repo-accordion-item">
              <AccordionHeader className="git-repo-accordion-header">
                <AccordionTrigger className="git-repo-accordion-trigger">
                  <RepoAccordionTrigger
                    repo={repo}
                    onRefresh={async () => {
                      const updatedRepo = await gitService.getGitStatus(repo.path);
                      useWorkspaceStore.getState().setGitRepo(repo.path, updatedRepo);
                    }}
                    onShowToast={showToast}
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
      <ToastPortal>
        <ToastViewport className="ymir-toast-viewport">
          {toasts.map((toast) => (
            <ToastRoot
              key={toast.id}
              toast={{
                id: toast.id,
                title: toast.type === 'error' ? 'Error' : 'Success',
                description: toast.message,
                type: toast.type,
              }}
              className="ymir-toast-root"
            >
              <ToastContent className="ymir-toast-content">
                <ToastTitle className="ymir-toast-title" />
                <ToastDescription className="ymir-toast-description" />
                <ToastClose
                  className="ymir-toast-close"
                  onClick={() => removeToast(toast.id)}
                  aria-label="Close"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </ToastClose>
              </ToastContent>
            </ToastRoot>
          ))}
        </ToastViewport>
      </ToastPortal>
    </ToastProvider>
  );
};

export const gitPanelDefinition: PanelDefinition = {
  id: 'git',
  title: 'Git',
  icon: GitPanelIcon,
  badge: GitPanelBadge,
  fullRender: GitPanelFull,
};


