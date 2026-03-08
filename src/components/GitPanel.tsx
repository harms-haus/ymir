import React, { useState } from 'react';
import { PanelDefinition } from '../state/types';
import { getGitChangesCount } from '../state/workspace';
import './GitPanel.css';

// Mock git data for development (will be replaced with real data later)
interface GitFile {
  path: string;
  status: 'modified' | 'added' | 'deleted' | 'untracked';
  staged?: boolean;
}

const mockGitData = {
  currentBranch: 'main',
  branches: ['main', 'dev', 'feature/sidebar', 'bugfix/terminal-fix'],
  ahead: 2,
  behind: 0,
  stagedCount: 2,
  changesCount: 5,
};

// Mock file lists
const mockStagedFiles: GitFile[] = [
  { path: 'src/components/Sidebar.tsx', status: 'modified', staged: true },
  { path: 'src/state/types.ts', status: 'added', staged: true },
];

const mockChangedFiles: GitFile[] = [
  { path: 'src/components/GitPanel.tsx', status: 'modified' },
  { path: 'src/other.ts', status: 'modified' },
  { path: 'src/utils/helper.ts', status: 'added' },
  { path: 'old-file.ts', status: 'deleted' },
  { path: 'untracked-file.ts', status: 'untracked' },
];

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
  const statusMap = {
    modified: { label: 'M', className: 'modified' },
    added: { label: 'A', className: 'added' },
    deleted: { label: 'D', className: 'deleted' },
    untracked: { label: '?', className: 'untracked' },
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
}> = ({ file, showCheckbox = true, expanded = false, onToggleExpand, onCheckboxChange }) => {
  const fileName = file.path.split('/').pop() || file.path;
  const dirPath = file.path.includes('/') ? file.path.substring(0, file.path.lastIndexOf('/')) : '';

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
  
  return (
    <div className="git-section staged-files-section">
      <div className="section-header">
        <span className="section-title">Staged Changes</span>
        {files.length > 0 && (
          <span className="git-count-badge">{files.length}</span>
        )}
      </div>
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
    </div>
  );
};

// Changes files section with expandable tree
const ChangesFilesSection: React.FC<{ files: GitFile[] }> = ({ files }) => {
  const [expandedFiles, setExpandedFiles] = useState<Set<string>>(new Set());
  
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
  
  return (
    <div className="git-section changes-files-section">
      <div className="section-header">
        <span className="section-title">Changes</span>
        {files.length > 0 && (
          <span className="git-count-badge">{files.length}</span>
        )}
      </div>
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
            />
          ))}
        </div>
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
      <div className="git-commit-input-wrapper">
        <textarea
          className="git-commit-textarea"
          placeholder={stagedCount > 0 ? 'Commit message (Ctrl+Enter to commit)...' : 'Stage files first...'}
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
        </button>
      </div>
      {stagedCount > 0 && (
        <div className="git-commit-hint">
          Press Ctrl+Enter to commit
        </div>
      )}
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
  const [selectedBranch, setSelectedBranch] = useState(mockGitData.currentBranch);
  const [stagedFiles, setStagedFiles] = useState<GitFile[]>(mockStagedFiles);
  const [changedFiles, setChangedFiles] = useState<GitFile[]>(mockChangedFiles);
  
  const handleBranchSelect = (branch: string) => {
    setSelectedBranch(branch);
  };
  
  // Handle unstaging a file
  const handleUnstage = (path: string) => {
    const file = stagedFiles.find(f => f.path === path);
    if (file) {
      setStagedFiles(files => files.filter(f => f.path !== path));
      setChangedFiles(files => [...files, { ...file, staged: false }]);
    }
  };
  
  // Handle commit
  const handleCommit = (_message: string) => {
    // In a real implementation, this would call git commit
    // For now, just clear the staged files
    setStagedFiles([]);
  };

  return (
    <div className="git-panel">
      {/* Branch section */}
      <div className="git-section branch-section">
        <BranchSelector
          currentBranch={selectedBranch}
          branches={mockGitData.branches}
          onSelect={handleBranchSelect}
        />
        <AheadBehindIndicator
          ahead={mockGitData.ahead}
          behind={mockGitData.behind}
        />
      </div>

      {/* Commit section */}
      <CommitSection stagedCount={stagedFiles.length} onCommit={handleCommit} />

      {/* Staged files */}
      <StagedFilesSection files={stagedFiles} onUnstage={handleUnstage} />

      {/* Changes files */}
      <ChangesFilesSection files={changedFiles} />
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
