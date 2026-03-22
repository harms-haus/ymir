import { useState, useEffect, useCallback } from 'react';
import { NodeApi } from 'react-arborist';
import { useStore, selectActiveWorktree, selectFileListCache, selectGitStatusCache } from '../../store';
import { getWebSocketClient } from '../../lib/ws';
import { FileTree, FileTreeNode } from '../ui/FileTree';
import { GitStatusBadge, transformStatusEntries } from '../ui/GitStatusBadge';
import { ProjectSkeleton } from './ProjectSkeleton';
import type { FileList, GitStatusEntry } from '../../types/protocol';

function buildFileTree(
  paths: string[],
  gitStatusMap: Map<string, GitStatusEntry>
): FileTreeNode[] {
  const root: FileTreeNode[] = [];
  const nodeMap = new Map<string, FileTreeNode>();

  const sortedPaths = [...paths].sort();

  for (const path of sortedPaths) {
    const parts = path.split('/');
    let currentPath = '';
    const gitStatus = gitStatusMap.get(path);

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const parentPath = currentPath;
      currentPath = currentPath ? `${currentPath}/${part}` : part;
      const isLastPart = i === parts.length - 1;
      const partGitStatus = isLastPart ? gitStatus : undefined;

      if (!nodeMap.has(currentPath)) {
        const node: FileTreeNode = {
          id: currentPath,
          name: part,
          type: isLastPart ? 'file' : 'directory',
          children: isLastPart ? undefined : [],
          data: partGitStatus ? { status: partGitStatus.status, staged: partGitStatus.staged } : undefined,
          isDeleted: partGitStatus?.status === 'deleted',
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

  function sortChildren(nodes: FileTreeNode[]) {
    nodes.sort((a, b) => {
      if (a.type !== b.type) {
        return a.type === 'directory' ? -1 : 1;
      }
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

export function AllFilesTab() {
  const activeWorktree = useStore(selectActiveWorktree);
  const fileListCache = useStore(selectFileListCache(activeWorktree?.id ?? ''));
  const gitStatusCache = useStore(selectGitStatusCache(activeWorktree?.id ?? ''));
  const [files, setFiles] = useState<string[]>(fileListCache?.files ?? []);
  const [isLoading, setIsLoading] = useState(!fileListCache);
  const [gitStatusEntries, setGitStatusEntries] = useState<GitStatusEntry[]>(gitStatusCache?.entries ?? []);
  const setFileListCache = useStore((state) => state.setFileListCache);
  const setGitStatusCache = useStore((state) => state.setGitStatusCache);

  const handleEdit = useCallback((node: NodeApi<FileTreeNode>) => {
    if (node.data.type === 'file') {
      console.log('Edit file:', node.data.id);
    }
  }, []);

  const handleContextMenu = useCallback((e: React.MouseEvent, node: NodeApi<FileTreeNode>) => {
    e.preventDefault();
    console.log('Context menu for:', node.data.id);
  }, []);

  useEffect(() => {
    if (!activeWorktree) {
      setFiles([]);
      return;
    }

    const client = getWebSocketClient();

    const unsubscribe = client.onMessage('FileListResult', (message) => {
      if (message.worktreeId === activeWorktree.id) {
        setFiles(message.files);
        setFileListCache(activeWorktree.id, message.files);
        setIsLoading(false);
      }
    });

    if (!fileListCache) {
      setIsLoading(true);
      const fileListMsg: FileList = {
        type: 'FileList',
        worktreeId: activeWorktree.id,
      };
      client.send(fileListMsg);
    }

    return () => {
      unsubscribe();
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

  const gitStatusMap = new Map<string, GitStatusEntry>();
  for (const entry of gitStatusEntries) {
    gitStatusMap.set(entry.path, entry);
  }

  const treeData = buildFileTree(files, gitStatusMap);

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

  if (files.length === 0) {
    return (
      <div style={{ padding: '48px 24px', textAlign: 'center', color: 'hsl(var(--muted-foreground))' }}>
        <i className="ri-file-search-line" style={{ fontSize: '48px', marginBottom: '16px' }} />
        <p>No files found</p>
      </div>
    );
  }

  function folderHasChanges(folderId: string): boolean {
    return gitStatusEntries.some(f => f.path.startsWith(folderId + '/'));
  }

  return (
    <div style={{ height: '100%' }}>
      <FileTree
        data={treeData}
        onActivate={handleEdit}
        onContextMenu={handleContextMenu}
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
          if (node.type === 'directory' && folderHasChanges(node.id)) {
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