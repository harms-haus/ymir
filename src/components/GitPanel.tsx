import React, { useState, useEffect } from 'react';
import { PanelDefinition, GitFile } from '../state/types';
import useWorkspaceStore, { getActiveRepo, getGitChangesCount } from '../state/workspace';
import gitService from '../lib/git-service';
import './GitPanel.css';

const mockGitData = {
  currentBranch: 'main',
  branches: ['main', 'dev', 'feature/sidebar', 'bugfix/terminal-fix'],
  ahead: 2,
  behind: 0,
  stagedCount: 2,
  changesCount: 5,
};

// Git branch SVG icon
const GitBranchIcon: React.FC = () => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <line x1="6" y1="3" x2="6" y2="15" />
    <circle cx="18" cy="6" r="3" />
    <circle cx="6" cy="18" r="3" />
    <path d="M18 9a9 9 0 0 1-9 9" />
  </svg>
);



// Branch selector dropdown component
const BranchSelector: React.FC<{
  currentBranch: string;
  branches: string[];
  onSelect: (branch: string) => void;
}> = ({ currentBranch, branches, onSelect }) => {
  const [isOpen, setIsOpen] = useState(false);

  const handleSelect = (branch: string) => {
    onSelect(branch);
    setIsOpen(false);
  };

  return (
    <div className="branch-selector">
      <button
        className="branch-selector-button"
        onClick={() => setIsOpen(!isOpen)}
        title="Switch branch"
      >
        <GitBranchIcon />
        <span className="branch-name">{currentBranch}</span>
        <svg
          className={`branch-selector-arrow ${isOpen ? 'open' : ''}`}
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
      {isOpen && (
        <div className="branch-dropdown">
          {branches.map((branch) => (
            <button
              key={branch}
              className={`branch-option ${branch === currentBranch ? 'current' : ''}`}
              onClick={() => handleSelect(branch)}
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
            </button>
          ))}
        </div>
      )}
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
        <span className="ahead" title={`${ahead} commits ahead`}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 19V5M5 12l7-7 7 7" />
          </svg>
          {ahead}
        </span>
      )}
      {behind > 0 && (
        <span className="behind" title={`${behind} commits behind`}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 5v14M5 12l7 7 7-7" />
          </svg>
          {behind}
        </span>
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
          <input
            type="checkbox"
            className="git-checkbox"
            checked={file.staged || false}
            onChange={(e) => {
              e.stopPropagation();
              onCheckboxChange?.();
            }}
            title={file.staged ? 'Unstage file' : 'Stage file'}
            onClick={(e) => e.stopPropagation()}
          />
        )}
        <span className="git-file-icon">📄</span>
        <div className="git-file-info">
          <span className="git-file-name" title={file.path}>{fileName}</span>
          {dirPath && <span className="git-file-path">{dirPath}</span>}
        </div>
        <StatusBadge status={file.status} />
        {!file.staged && onDiscard && (
          <button
            className="git-discard-button"
            onClick={handleDiscard}
            title="Discard changes"
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
          </button>
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

// Commit section with message textarea and commit button
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
      <textarea
        className="git-commit-textarea"
        placeholder="Commit message..."
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        onKeyDown={handleKeyDown}
        rows={3}
        disabled={stagedCount === 0}
      />
      <button
        className="git-commit-button"
        onClick={handleCommit}
        disabled={!message.trim() || stagedCount === 0}
        title="Commit staged changes"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <polyline points="20,6 9,17 4,12" />
        </svg>
        <span>Commit</span>
      </button>
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
        <button
          type="button"
          className="git-header-action-button"
          onClick={handleRefresh}
          title="Refresh"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M23 4v6h-6M1 20v-6h6M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
          </svg>
        </button>
        <button
          type="button"
          className="git-header-action-button"
          onClick={handleMoreActions}
          title="More Actions"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="5" r="1" fill="currentColor" />
            <circle cx="12" cy="12" r="1" fill="currentColor" />
            <circle cx="12" cy="19" r="1" fill="currentColor" />
          </svg>
        </button>
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
    color: '#4fc3f7', // notification blue accent
  };
};

// Full panel renderer
const GitPanelFull = (): React.ReactNode => {
  const activeRepo = getActiveRepo();
  const { discoverAndRegisterRepos, updateGitFile } = useWorkspaceStore();

  // Discover git repos on mount
  useEffect(() => {
    discoverAndRegisterRepos('/home/blake/Documents/software/ymir');
  }, [discoverAndRegisterRepos]);

  // Handle staging a file
  const handleStage = async (path: string) => {
    if (!activeRepo) return;

    // Optimistic UI update - move file from unstaged to staged
    updateGitFile(activeRepo.path, path, true);

    try {
      await gitService.stageFile(activeRepo.path, path);
    } catch (error) {
      // Revert optimistic update on error
      updateGitFile(activeRepo.path, path, false);
    }
  };

  // Handle unstaging a file
  const handleUnstage = async (path: string) => {
    if (!activeRepo) return;

    // Optimistic UI update - move file from staged to unstaged
    updateGitFile(activeRepo.path, path, false);

    try {
      await gitService.unstageFile(activeRepo.path, path);
    } catch (error) {
      // Revert optimistic update on error
      updateGitFile(activeRepo.path, path, true);
    }
  };

  // Handle commit
  const handleCommit = async (message: string) => {
    if (!activeRepo) return;

    try {
      await gitService.commit(activeRepo.path, message);
      const updatedRepo = await gitService.getGitStatus(activeRepo.path);
      useWorkspaceStore.getState().setGitRepo(activeRepo.path, updatedRepo);
    } catch (error) {
      console.error('Commit failed:', error);
    }
  };

  const handleDiscard = async (path: string) => {
    if (!activeRepo) return;

    try {
      await gitService.discardChanges(activeRepo.path, path);
      const updatedRepo = await gitService.getGitStatus(activeRepo.path);
      useWorkspaceStore.getState().setGitRepo(activeRepo.path, updatedRepo);
    } catch (error) {
      console.error('Discard failed:', error);
    }
  };

  return (
    <div className="git-panel">
      <GitPanelHeader />
      {/* Commit section */}
      <CommitSection stagedCount={activeRepo?.staged.length || 0} onCommit={handleCommit} />

      {/* Branch section */}
      <div className="git-section branch-section">
        <BranchSelector
          currentBranch={activeRepo?.branch || 'main'}
          branches={mockGitData.branches}
          onSelect={() => {}}
        />
        <AheadBehindIndicator
          ahead={activeRepo?.ahead || 0}
          behind={activeRepo?.behind || 0}
        />
      </div>

      {/* Staged files */}
      <StagedFilesSection files={activeRepo?.staged || []} onUnstage={handleUnstage} />

      {/* Changes files */}
      <ChangesFilesSection files={activeRepo?.unstaged || []} onStage={handleStage} onDiscard={handleDiscard} />
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
