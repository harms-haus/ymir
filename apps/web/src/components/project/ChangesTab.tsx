import { useState, useEffect, useCallback } from 'react';
import { useStore, selectActiveWorktree, AgentTab } from '../../store';
import { getWebSocketClient } from '../../lib/ws';
import { GitStatusEntry } from '../../types/protocol';

interface GroupedFile {
  path: string;
  entries: GitStatusEntry[];
}

function getStatusColor(status: GitStatusEntry['status']) {
  switch (status) {
    case 'added':
      return 'hsl(var(--success))';
    case 'modified':
      return 'hsl(var(--warning))';
    case 'deleted':
      return 'hsl(var(--destructive))';
    case 'untracked':
      return 'hsl(var(--muted-foreground))';
    default:
      return 'hsl(var(--muted-foreground))';
  }
}

function getFileIcon(path: string) {
  const ext = path.split('.').pop()?.toLowerCase();
  const filename = path.split('/').pop() || '';
  
  if (filename === 'package.json') return 'ri-nodejs-line';
  if (filename === 'Cargo.toml') return 'ri-rust-line';
  if (filename === 'README.md') return 'ri-file-text-line';
  if (filename === 'Dockerfile') return 'ri-docker-line';
  
  switch (ext) {
    case 'ts':
    case 'tsx':
    case 'js':
    case 'jsx':
      return 'ri-javascript-line';
    case 'py':
      return 'ri-python-line';
    case 'rs':
      return 'ri-rust-line';
    case 'json':
      return 'ri-braces-line';
    case 'md':
      return 'ri-file-text-line';
    case 'yml':
    case 'yaml':
      return 'ri-file-settings-line';
    case 'toml':
      return 'ri-file-settings-line';
    case 'sh':
      return 'ri-terminal-box-line';
    case 'css':
    case 'scss':
    case 'sass':
      return 'ri-css3-line';
    case 'html':
      return 'ri-html5-line';
    case 'svg':
    case 'png':
    case 'jpg':
    case 'jpeg':
    case 'gif':
      return 'ri-image-line';
    default:
      return 'ri-file-line';
  }
}

function groupFilesByDirectory(files: GitStatusEntry[]): GroupedFile[] {
  const groups = new Map<string, GitStatusEntry[]>();
  
  for (const file of files) {
    const dir = file.path.substring(0, file.path.lastIndexOf('/')) || '.';
    if (!groups.has(dir)) {
      groups.set(dir, []);
    }
    groups.get(dir)!.push(file);
  }
  
  return Array.from(groups.entries())
    .map(([path, entries]) => ({ path, entries }))
    .sort((a, b) => a.path.localeCompare(b.path));
}

export function ChangesTab() {
  const [viewMode, setViewMode] = useState<'flat' | 'grouped'>('flat');
  const [files, setFiles] = useState<GitStatusEntry[]>([]);
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(new Set(['.']));
  const activeWorktree = useStore(selectActiveWorktree);
  const wsClient = getWebSocketClient();
  const { addAgentTab, setActiveAgentTab } = useStore();

  const handleViewDiff = useCallback((filePath: string) => {
    if (!activeWorktree) return;

    const diffTab: AgentTab = {
      id: `diff-${filePath}-${Date.now()}`,
      type: 'diff',
      filePath,
      label: filePath.split('/').pop() || filePath,
    };

    addAgentTab(activeWorktree.id, diffTab);
    setActiveAgentTab(activeWorktree.id, diffTab.id);
  }, [activeWorktree, addAgentTab, setActiveAgentTab]);

  useEffect(() => {
    if (!activeWorktree) {
      setFiles([]);
      return;
    }

    // Subscribe to GitStatusResult messages
    const unsubscribe = wsClient.onMessage('GitStatusResult', (message) => {
      if (message.worktreeId === activeWorktree.id) {
        // TODO: Parse status string into file entries
        setFiles([]);
      }
    });

    // Request initial status
    wsClient.send({
      type: 'GitStatus',
      worktreeId: activeWorktree.id,
    });

    return unsubscribe;
  }, [activeWorktree, wsClient]);

  const handleToggleDir = useCallback((dirPath: string) => {
    setExpandedDirs(prev => {
      const newSet = new Set(prev);
      if (newSet.has(dirPath)) {
        newSet.delete(dirPath);
      } else {
        newSet.add(dirPath);
      }
      return newSet;
    });
  }, []);

  if (!activeWorktree) {
    return (
      <div style={{ padding: '24px', textAlign: 'center', color: 'hsl(var(--muted-foreground))' }}>
        <i className="ri-folder-warning-line" style={{ fontSize: '48px', marginBottom: '16px' }} />
        <p>No worktree selected</p>
      </div>
    );
  }

  if (files.length === 0) {
    return (
      <div style={{ padding: '48px 24px', textAlign: 'center', color: 'hsl(var(--muted-foreground))' }}>
        <i className="ri-check-line" style={{ fontSize: '48px', marginBottom: '16px', color: 'hsl(var(--success))' }} />
        <p>No changes</p>
      </div>
    );
  }

  const groupedFiles = groupFilesByDirectory(files);

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '12px 16px', borderBottom: '1px solid hsl(var(--border))' }}>
        <div style={{ display: 'inline-flex', gap: '4px' }}>
          <button
            type="button"
            onClick={() => setViewMode('flat')}
            style={{
              padding: '4px 12px',
              borderRadius: '4px',
              border: '1px solid hsl(var(--border))',
              backgroundColor: viewMode === 'flat' ? 'hsl(var(--accent))' : 'transparent',
              color: viewMode === 'flat' ? 'hsl(var(--accent-foreground))' : 'hsl(var(--foreground))',
              cursor: 'pointer',
              fontSize: '13px',
            }}
          >
            Flat
          </button>
          <button
            type="button"
            onClick={() => setViewMode('grouped')}
            style={{
              padding: '4px 12px',
              borderRadius: '4px',
              border: '1px solid hsl(var(--border))',
              backgroundColor: viewMode === 'grouped' ? 'hsl(var(--accent))' : 'transparent',
              color: viewMode === 'grouped' ? 'hsl(var(--accent-foreground))' : 'hsl(var(--foreground))',
              cursor: 'pointer',
              fontSize: '13px',
            }}
          >
            Grouped by folder
          </button>
        </div>
      </div>

      <div style={{ flex: 1, overflow: 'auto' }}>
        {viewMode === 'flat' ? (
          <div>
            {files.map((file) => (
              <div
                key={file.path}
                role="button"
                tabIndex={0}
                onClick={() => handleViewDiff(file.path)}
                onKeyUp={(e) => { if (e.key === 'Enter') handleViewDiff(file.path); }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  padding: '8px 16px',
                  cursor: 'pointer',
                  borderBottom: '1px solid hsl(var(--border))',
                }}
              >
                <span
                  style={{
                    width: '8px',
                    height: '8px',
                    borderRadius: '50%',
                    backgroundColor: getStatusColor(file.status),
                    marginRight: '12px',
                  }}
                />
                <i 
                  className={getFileIcon(file.path)} 
                  style={{ 
                    fontSize: '16px', 
                    marginRight: '8px',
                    color: 'hsl(var(--muted-foreground))'
                  }} 
                />
                <span style={{ flex: 1, fontSize: '13px', color: 'hsl(var(--foreground))' }}>
                  {file.path}
                </span>
                <span style={{ fontSize: '11px', color: 'hsl(var(--muted-foreground))', textTransform: 'capitalize' }}>
                  {file.status}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div>
            {groupedFiles.map(({ path, entries }) => {
              const isExpanded = expandedDirs.has(path);
              
              return (
                <div key={path}>
                  <button
                    type="button"
                    onClick={() => handleToggleDir(path)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      padding: '8px 16px',
                      cursor: 'pointer',
                      borderBottom: '1px solid hsl(var(--border))',
                      width: '100%',
                      border: 'none',
                      background: 'transparent',
                      textAlign: 'left',
                      fontFamily: 'inherit',
                    }}
                  >
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        width: '20px',
                        height: '20px',
                        marginRight: '8px',
                        transition: 'transform 0.2s ease',
                        transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
                      }}
                    >
                      <i className="ri-arrow-right-s-line" style={{ fontSize: '16px' }} />
                    </span>
                    <i className="ri-folder-3-line" style={{ fontSize: '16px', marginRight: '8px', color: 'hsl(var(--primary))' }} />
                    <span style={{ flex: 1, fontSize: '13px', color: 'hsl(var(--foreground))' }}>
                      {path}
                    </span>
                    <span style={{ fontSize: '11px', color: 'hsl(var(--muted-foreground))' }}>
                      {entries.length} {entries.length === 1 ? 'file' : 'files'}
                    </span>
                  </button>
                  
                  {isExpanded && (
                    <div>
                      {entries.map((file) => (
                        <div
                          key={file.path}
                          role="button"
                          tabIndex={0}
                          onClick={() => handleViewDiff(file.path)}
                          onKeyUp={(e) => { if (e.key === 'Enter') handleViewDiff(file.path); }}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            padding: '6px 16px 6px 52px',
                            cursor: 'pointer',
                            borderBottom: '1px solid hsl(var(--border))',
                          }}
                        >
                          <span
                            style={{
                              width: '8px',
                              height: '8px',
                              borderRadius: '50%',
                              backgroundColor: getStatusColor(file.status),
                              marginRight: '12px',
                            }}
                          />
                          <i 
                            className={getFileIcon(file.path)} 
                            style={{ 
                              fontSize: '14px', 
                              marginRight: '8px',
                              color: 'hsl(var(--muted-foreground))'
                            }} 
                          />
                          <span style={{ flex: 1, fontSize: '13px', color: 'hsl(var(--foreground))' }}>
                            {file.path.split('/').pop()}
                          </span>
                          <span style={{ fontSize: '11px', color: 'hsl(var(--muted-foreground))', textTransform: 'capitalize' }}>
                            {file.status}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
