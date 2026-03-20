import { useState, useEffect, useCallback, useMemo } from 'react';
import { useStore, selectActiveWorktree } from '../../store';
import { useContextMenu } from '../../hooks/useContextMenu';
import { ContextMenu } from '../ui/ContextMenu';
import { getWebSocketClient } from '../../lib/ws';
import type { FileList } from '../../types/generated/protocol';

interface FileNode {
  path: string;
  name: string;
  type: 'file' | 'directory';
  children?: FileNode[];
  depth: number;
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

function buildFileTree(paths: string[]): FileNode[] {
  const root: FileNode[] = [];
  const nodeMap = new Map<string, FileNode>();
  
  // Sort paths to ensure consistent ordering
  const sortedPaths = [...paths].sort();
  
  for (const path of sortedPaths) {
    const parts = path.split('/');
    let currentPath = '';
    
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const parentPath = currentPath;
      currentPath = currentPath ? `${currentPath}/${part}` : part;
      
      if (!nodeMap.has(currentPath)) {
        const isFile = i === parts.length - 1;
        const node: FileNode = {
          path: currentPath,
          name: part,
          type: isFile ? 'file' : 'directory',
          children: isFile ? undefined : [],
          depth: i,
        };
        
        nodeMap.set(currentPath, node);
        
        if (parentPath) {
          const parent = nodeMap.get(parentPath);
          if (parent && parent.children) {
            parent.children.push(node);
          }
        } else {
          root.push(node);
        }
      }
    }
  }
  
  // Sort children at each level
  function sortChildren(nodes: FileNode[]) {
    nodes.sort((a, b) => {
      // Directories first
      if (a.type !== b.type) {
        return a.type === 'directory' ? -1 : 1;
      }
      // Then sort by name
      return a.name.localeCompare(b.name);
    });
    
    for (const node of nodes) {
      if (node.children) {
        sortChildren(node.children);
      }
    }
  }
  
  sortChildren(root);
  return root;
}

function flattenTree(nodes: FileNode[], expandedDirs: Set<string>, depth = 0): FileNode[] {
  const flattened: FileNode[] = [];
  
  for (const node of nodes) {
    flattened.push({ ...node, depth });
    
    if (node.type === 'directory' && node.children && expandedDirs.has(node.path)) {
      flattened.push(...flattenTree(node.children, expandedDirs, depth + 1));
    }
  }
  
  return flattened;
}

const contextMenuItems = [
  { id: 'edit', label: 'Edit', icon: 'ri-edit-line' },
  { id: 'open-external', label: 'Open External', icon: 'ri-external-link-line' },
  { id: 'copy-path', label: 'Copy Path', icon: 'ri-file-copy-line' },
] as const;

export function AllFilesTab() {
  const [files, setFiles] = useState<string[]>([]);
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(new Set(['.']));
  const activeWorktree = useStore(selectActiveWorktree);

  const handleEdit = useCallback((filePath: string) => {
    console.log('Edit file:', filePath);
    // TODO: Send FileRead message and open EditorTab in main panel (T24)
  }, []);

  const handleOpenExternal = useCallback((filePath: string) => {
    console.log('Open external:', filePath);
    // TODO: Implement open external
  }, []);

  const handleCopyPath = useCallback((filePath: string) => {
    navigator.clipboard.writeText(filePath);
  }, []);

  const { state: contextMenuState, openMenu, closeMenu } = useContextMenu({});

  useEffect(() => {
    if (!activeWorktree) {
      setFiles([]);
      return;
    }

    const client = getWebSocketClient();

  // Subscribe to FileListResult
  const unsubscribe = client.onMessage('FileListResult', (message) => {
    // Only update if this is for the current worktree
    if (message.worktreeId === activeWorktree.id) {
      setFiles(message.files);
    }
  });

  // Send FileList request
  const fileListMsg: FileList = {
    type: 'FileList',
    worktreeId: activeWorktree.id,
  };
  client.send(fileListMsg);

    return () => {
      unsubscribe();
    };
  }, [activeWorktree]);

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

  const handleContextMenuAction = useCallback((action: string) => {
    const filePath = contextMenuState.targetId;
    if (!filePath) return;

    switch (action) {
      case 'edit':
        handleEdit(filePath);
        break;
      case 'open-external':
        handleOpenExternal(filePath);
        break;
      case 'copy-path':
        handleCopyPath(filePath);
        break;
    }
    closeMenu();
  }, [contextMenuState.targetId, handleEdit, handleOpenExternal, handleCopyPath, closeMenu]);

  const fileTree = useMemo(() => buildFileTree(files), [files]);
  const flattenedNodes = useMemo(() => flattenTree(fileTree, expandedDirs), [fileTree, expandedDirs]);

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
        <i className="ri-file-search-line" style={{ fontSize: '48px', marginBottom: '16px' }} />
        <p>No files found</p>
      </div>
    );
  }

  return (
    <div style={{ height: '100%', overflow: 'auto' }}>
      {flattenedNodes.map((node) => {
        if (node.type === 'directory') {
          const isExpanded = expandedDirs.has(node.path);
          const hasChildren = node.children && node.children.length > 0;
          
          return (
            <div
              key={node.path}
              style={{
                display: 'flex',
                alignItems: 'center',
                padding: `6px 16px 6px ${16 + node.depth * 20}px`,
                cursor: hasChildren ? 'pointer' : 'default',
                borderBottom: '1px solid hsl(var(--border))',
              }}
              onClick={() => hasChildren && handleToggleDir(node.path)}
            >
              {hasChildren && (
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
              )}
              {!hasChildren && <span style={{ width: '28px' }} />}
              <i 
                className={isExpanded ? 'ri-folder-open-line' : 'ri-folder-3-line'} 
                style={{ 
                  fontSize: '16px', 
                  marginRight: '8px',
                  color: 'hsl(var(--primary))'
                }} 
              />
              <span style={{ fontSize: '13px', color: 'hsl(var(--foreground))' }}>
                {node.name}
              </span>
            </div>
          );
        }
        
        return (
          <div
            key={node.path}
            onClick={() => handleEdit(node.path)}
            onContextMenu={(e) => openMenu(e, node.path, 'worktree')}
            style={{
              display: 'flex',
              alignItems: 'center',
              padding: `6px 16px 6px ${16 + node.depth * 20}px`,
              cursor: 'pointer',
              borderBottom: '1px solid hsl(var(--border))',
            }}
          >
            <span style={{ width: '28px' }} />
            <i
              className={getFileIcon(node.path)}
              style={{
                fontSize: '14px',
                marginRight: '8px',
                color: 'hsl(var(--muted-foreground))'
              }}
            />
            <span style={{ flex: 1, fontSize: '13px', color: 'hsl(var(--foreground))' }}>
              {node.name}
            </span>
          </div>
        );
      })}

      <ContextMenu
        state={contextMenuState}
        items={contextMenuItems as any}
        onAction={handleContextMenuAction as any}
        closeMenu={closeMenu}
      />
    </div>
  );
}