import { useState, useEffect, useCallback } from 'react';
import { useStore, selectActiveWorktree, selectGitStatusCache, AgentTab } from '../../store';
import { getWebSocketClient } from '../../lib/ws';
import { FileTree, FileTreeNode } from '../ui/FileTree';
import { GitStatusBadge, transformStatusEntries } from '../ui/GitStatusBadge';
import { ProjectSkeleton } from './ProjectSkeleton';
import type { GitStatusEntry } from '../../types/protocol';

interface ChangesTabProps {
  viewMode: 'flat' | 'grouped';
}

export function ChangesTab({ viewMode }: ChangesTabProps) {
  const activeWorktree = useStore(selectActiveWorktree);
  const gitStatusCache = useStore(selectGitStatusCache(activeWorktree?.id ?? ''));
  const [files, setFiles] = useState<GitStatusEntry[]>(gitStatusCache?.entries ?? []);
  const [isLoading, setIsLoading] = useState(!gitStatusCache);
  const setGitStatusCache = useStore((state) => state.setGitStatusCache);
  const addAgentTab = useStore((state) => state.addAgentTab);
  const wsClient = getWebSocketClient();

  const handleViewDiff = useCallback((filePath: string) => {
    if (!activeWorktree) return;

    const tabId = `diff-${filePath}`;

    const diffTab: AgentTab = {
      id: tabId,
      type: 'diff',
      filePath,
      label: `Diff: ${filePath.split('/').pop()}`,
    };

    addAgentTab(activeWorktree.id, diffTab);
    useStore.getState().setActiveAgentTab(activeWorktree.id, tabId);
  }, [activeWorktree, addAgentTab]);

  useEffect(() => {
    if (!activeWorktree) {
      setFiles([]);
      return;
    }

    const unsubscribe = wsClient.onMessage('GitStatusResult', (message) => {
      if (message.worktreeId === activeWorktree.id) {
        const entries = transformStatusEntries(message.entries);
        setFiles(entries);
        setGitStatusCache(activeWorktree.id, entries);
        setIsLoading(false);
      }
    });

    if (!gitStatusCache) {
      setIsLoading(true);
      wsClient.send({
        type: 'GitStatus',
        worktreeId: activeWorktree.id,
      });
    }

    return unsubscribe;
  }, [activeWorktree, wsClient, gitStatusCache, setGitStatusCache]);



  const treeData: FileTreeNode[] = viewMode === 'flat'
    ? files.map((file) => ({
      id: file.path,
      name: file.path,
      type: 'file' as const,
      data: { status: file.status, staged: file.staged },
      isDeleted: file.status === 'deleted',
    }))
    : buildNestedTree(files);

function buildNestedTree(files: GitStatusEntry[]): FileTreeNode[] {
  const root: FileTreeNode[] = [];
  const nodeMap = new Map<string, FileTreeNode>();

  const sortedFiles = [...files].sort((a, b) => a.path.localeCompare(b.path));

  for (const file of sortedFiles) {
    const parts = file.path.split('/');
    let currentPath = '';

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const parentPath = currentPath;
      currentPath = currentPath ? `${currentPath}/${part}` : part;
      const isFile = i === parts.length - 1;

      if (!nodeMap.has(currentPath)) {
        const node: FileTreeNode = {
          id: currentPath,
          name: part,
          type: isFile ? 'file' : 'directory',
          children: isFile ? undefined : [],
          data: isFile ? { status: file.status, staged: file.staged } : undefined,
          isDeleted: isFile && file.status === 'deleted',
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
        <i className="ri-check-line" style={{ fontSize: '48px', marginBottom: '16px', color: 'hsl(var(--status-working))' }} />
        <p>No changes</p>
      </div>
    );
  }

  function folderHasChanges(folderId: string): boolean {
    return files.some(f => f.path.startsWith(folderId + '/'));
  }

  return (
    <div style={{ height: '100%' }}>
  <FileTree
    data={treeData}
    onActivate={(node) => {
      if (node.data.type === 'file') {
        handleViewDiff(node.id);
      }
    }}
    openByDefault={viewMode === 'grouped'}
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
