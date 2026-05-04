import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { NodeApi } from 'react-arborist';
import { useStore, selectActiveWorktree, selectFileListCache, selectGitStatusCache, AgentTab } from '../../store';
import { getWebSocketClient } from '../../lib/ws';
import { FileTree, FileTreeNode } from '../ui/FileTree';
import { GitStatusBadge, transformStatusEntries } from '../ui/GitStatusBadge';
import { ProjectSkeleton } from './ProjectSkeleton';
import type { FileList, GitStatusEntry } from '../../types/protocol';

function buildFileTree(
  rootPaths: string[],
  loadedChildren: Map<string, string[]>,
  gitStatusMap: Map<string, GitStatusEntry>
): FileTreeNode[] {
  const root: FileTreeNode[] = [];
  const nodeMap = new Map<string, FileTreeNode>();

  function buildNodes(paths: string[], parentPath: string): FileTreeNode[] {
    const nodes: FileTreeNode[] = [];

    for (const rawPath of paths) {
      const isDir = rawPath.endsWith('/');
      const name = isDir ? rawPath.slice(0, -1) : rawPath;
      const fullPath = parentPath ? `${parentPath}/${name}` : name;

      if (nodeMap.has(fullPath)) continue;

      const gitStatus = gitStatusMap.get(fullPath);
      const node: FileTreeNode = {
        id: fullPath,
        name,
        type: isDir ? 'directory' : 'file',
        children: isDir ? [] : undefined,
        data: gitStatus ? { status: gitStatus.status, staged: gitStatus.staged } : undefined,
        isDeleted: gitStatus?.status === 'deleted',
      };

      nodeMap.set(fullPath, node);
      nodes.push(node);

      // If this is a loaded directory, recursively build its children
      if (isDir && loadedChildren.has(fullPath)) {
        const children = buildNodes(loadedChildren.get(fullPath)!, fullPath);
        node.children = children;
      }
    }

    // Sort: directories first, then alphabetically
    nodes.sort((a, b) => {
      if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

    return nodes;
  }

  const rootNodes = buildNodes(rootPaths, '');
  root.push(...rootNodes);

  return root;
}

export function AllFilesTab() {
  const activeWorktree = useStore(selectActiveWorktree);
  const fileListCache = useStore(selectFileListCache(activeWorktree?.id ?? ''));
  const gitStatusCache = useStore(selectGitStatusCache(activeWorktree?.id ?? ''));
  const [files, setFiles] = useState<string[]>(fileListCache?.files ?? []);
  const [isLoading, setIsLoading] = useState(!fileListCache);
  const [gitStatusEntries, setGitStatusEntries] = useState<GitStatusEntry[]>(gitStatusCache?.entries ?? []);
  const [loadedChildren, setLoadedChildren] = useState<Map<string, string[]>>(new Map());
  const [loadingDirs, setLoadingDirs] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const setFileListCache = useStore((state) => state.setFileListCache);
  const setGitStatusCache = useStore((state) => state.setGitStatusCache);
  const addAgentTab = useStore((state) => state.addAgentTab);
  const pendingFileListWorktreeId = useRef<string | null>(null);
  const fileListTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingDirRequests = useRef<Map<string, string>>(new Map()); // path -> worktreeId

  const handleEdit = useCallback((node: NodeApi<FileTreeNode>) => {
    if (node.data.type === 'file' && activeWorktree) {
      const filePath = node.data.id;
      const tabId = `editor-${filePath}`;

      const editorTab: AgentTab = {
        id: tabId,
        type: 'editor',
        filePath,
        label: filePath.split('/').pop() || 'Editor',
      };

      addAgentTab(activeWorktree.id, editorTab);
      useStore.getState().setActiveAgentTab(activeWorktree.id, tabId);
    }
  }, [activeWorktree, addAgentTab]);

  const handleContextMenu = useCallback((e: React.MouseEvent, node: NodeApi<FileTreeNode>) => {
    e.preventDefault();
    console.log('Context menu for:', node.data.id);
  }, []);

  // Lazy load directory children on toggle
  const handleToggle = useCallback((id: string) => {
    if (!activeWorktree) return;
    if (loadedChildren.has(id)) return; // already loaded
    if (loadingDirs.has(id)) return; // already loading

    const client = getWebSocketClient();

    // Track this as a pending directory request
    pendingDirRequests.current.set(id, activeWorktree.id);

    setLoadingDirs((prev) => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });

    const fileListMsg: FileList = {
      type: 'FileList',
      worktreeId: activeWorktree.id,
      path: id,
    };
    client.send(fileListMsg);
  }, [activeWorktree, loadedChildren, loadingDirs]);

  const handleRetry = useCallback(() => {
    if (!activeWorktree) return;
    setError(null);
    setIsLoading(true);
    pendingFileListWorktreeId.current = activeWorktree.id;
    const client = getWebSocketClient();
    const fileListMsg: FileList = {
      type: 'FileList',
      worktreeId: activeWorktree.id,
    };
    client.send(fileListMsg);
  }, [activeWorktree]);

  useEffect(() => {
    if (!activeWorktree) {
      setError(null);
      setFiles([]);
      return;
    }

    const client = getWebSocketClient();

    // Fix 4: Subscribe to Error messages to recover from server errors
    const unsubscribeError = client.onMessage('ErrorResponse', (message) => {
      console.warn('[AllFilesTab] Received Error message, clearing loading state');
      const errorMessage = message.message || message.code || 'Unknown error';
      setError(errorMessage);
      setIsLoading(false);
      setLoadingDirs(new Set());
      pendingDirRequests.current.clear();
    });

    const unsubscribe = client.onMessage('FileListResult', (message) => {
      // Check if this is a directory-specific response by matching on path
      const dirPath = message.path;
      if (dirPath && pendingDirRequests.current.has(dirPath)) {
        // This is a lazy-loaded directory response - merge children
        setLoadedChildren((prev) => {
          const next = new Map(prev);
          next.set(dirPath, message.files);
          return next;
        });
        setLoadingDirs((prev) => {
          const next = new Set(prev);
          next.delete(dirPath);
          return next;
        });
        pendingDirRequests.current.delete(dirPath);
        return;
      }

      // Root-level response
      if (message.worktreeId === activeWorktree.id) {
        setError(null);
        setFiles(message.files);
        setFileListCache(activeWorktree.id, message.files);
        setIsLoading(false);
        pendingFileListWorktreeId.current = null;
      } else if (pendingFileListWorktreeId.current === message.worktreeId) {
        console.warn(
          `[AllFilesTab] FileListResult for worktree ${message.worktreeId} arrived after switching to ${activeWorktree.id}. Applying anyway to prevent stuck state.`
        );
        setError(null);
        setFiles(message.files);
        setFileListCache(message.worktreeId, message.files);
      }
    });

    // Clear any previous timeout
    if (fileListTimeoutRef.current) {
      clearTimeout(fileListTimeoutRef.current);
      fileListTimeoutRef.current = null;
    }

    if (!fileListCache) {
      setIsLoading(true);
      pendingFileListWorktreeId.current = activeWorktree.id;
      const fileListMsg: FileList = {
        type: 'FileList',
        worktreeId: activeWorktree.id,
      };
      client.send(fileListMsg);

      // Fix 1: Loading timeout — if FileListResult doesn't arrive within 15s, recover
      fileListTimeoutRef.current = setTimeout(() => {
        console.warn(
          `[AllFilesTab] FileListResult timeout after 15s for worktree ${activeWorktree.id}. Clearing cache and recovering.`
        );
        setError(null);
        setFileListCache(activeWorktree.id, []);
        setIsLoading(false);
        pendingFileListWorktreeId.current = null;
      }, 15000);
    }

    return () => {
      unsubscribe();
      unsubscribeError();
      if (fileListTimeoutRef.current) {
        clearTimeout(fileListTimeoutRef.current);
        fileListTimeoutRef.current = null;
      }
    };
  }, [activeWorktree, fileListCache, setFileListCache]);

  useEffect(() => {
    if (!activeWorktree) {
      setGitStatusEntries([]);
      return;
    }

    const client = getWebSocketClient();

    const unsubscribe = client.onMessage('GitStatusResult', (message) => {
      if (message.worktreeId === activeWorktree.id) {
        const entries = transformStatusEntries(message.entries);
        setGitStatusEntries(entries);
        setGitStatusCache(activeWorktree.id, entries);
      }
    });

    if (!gitStatusCache) {
      client.send({
        type: 'GitStatus',
        worktreeId: activeWorktree.id,
      });
    }

    return () => {
      unsubscribe();
    };
  }, [activeWorktree, gitStatusCache, setGitStatusCache]);

  // Memoize gitStatusMap
  const gitStatusMap = useMemo(() => {
    const m = new Map<string, GitStatusEntry>();
    for (const entry of gitStatusEntries) {
      m.set(entry.path, entry);
    }
    return m;
  }, [gitStatusEntries]);

  // Pre-compute dirsWithChanges for O(1) lookup
  const dirsWithChanges = useMemo(() => {
    const dirs = new Set<string>();
    for (const entry of gitStatusEntries) {
      const parts = entry.path.split('/');
      let prefix = '';
      for (let i = 0; i < parts.length - 1; i++) {
        prefix = prefix ? `${prefix}/${parts[i]}` : parts[i];
        dirs.add(prefix);
      }
    }
    return dirs;
  }, [gitStatusEntries]);

  // Memoize treeData with lazy loaded children
  const treeData = useMemo(
    () => buildFileTree(files, loadedChildren, gitStatusMap),
    [files, loadedChildren, gitStatusMap]
  );

  if (!activeWorktree) {
    return (
      <div style={{ padding: '24px', textAlign: 'center', color: 'hsl(var(--muted-foreground))' }}>
        <i className="ri-folder-warning-line" style={{ fontSize: '48px', marginBottom: '16px' }} />
        <p>No worktree selected</p>
      </div>
    );
  }

  if (isLoading) {
    return <ProjectSkeleton />;
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center p-4 text-center">
        <i className="ri-error-warning-line text-2xl text-red-400 mb-2" />
        <p className="text-sm text-gray-400 mb-2">Failed to load files</p>
        <p className="text-xs text-gray-500 mb-3 max-w-xs break-words">{error}</p>
        <button
          className="px-3 py-1 text-xs bg-red-500/20 text-red-400 rounded hover:bg-red-500/30"
          onClick={handleRetry}
        >
          Retry
        </button>
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
    <div style={{ height: '100%' }}>
      <FileTree
        data={treeData}
        onActivate={handleEdit}
        onContextMenu={handleContextMenu}
        onToggle={handleToggle}
        openByDefault={false}
        renderRightContent={(node) => {
          if (node.type === 'file') {
            if (!node.data?.status) return null;
            return (
              <GitStatusBadge
                status={node.data.status as GitStatusEntry['status']}
                staged={node.data.staged as boolean}
              />
            );
          }
          if (node.type === 'directory' && dirsWithChanges.has(node.id)) {
            return (
              <span
                style={{
                  width: '6px',
                  height: '6px',
                  borderRadius: '50%',
                  backgroundColor: 'hsl(var(--git-modified))',
                  flexShrink: 0,
                }}
              />
            );
          }
          return null;
        }}
      />
    </div>
  );
}
