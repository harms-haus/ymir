import { useCallback, useMemo, useEffect } from 'react';
import { NodeApi } from 'react-arborist';
import { useStore } from '../../store';
import { FileTree, FileTreeNode } from '../ui/FileTree';
import { loadWorktreeDetails, getWebSocketClient } from '../../lib/ws';

function getFolderName(path: string): string {
  if (!path) return '';
  const cleanPath = path.replace(/\/+$/, '');
  const segments = cleanPath.split(/[/\\]/);
  return segments[segments.length - 1] || '';
}

export interface WorkspaceTreeProps {
  height?: number;
  width?: number | string;
}

export function WorkspaceTree({ height = 400 }: WorkspaceTreeProps) {
  const workspaces = useStore((state) => state.workspaces);
  const expandedIds = useStore((state) => state.expandedWorkspaceIds);
  const activeWorktreeId = useStore((state) => state.activeWorktreeId);
  const toggleWorkspaceExpanded = useStore((state) => state.toggleWorkspaceExpanded);
  const setActiveWorktree = useStore((state) => state.setActiveWorktree);
  const worktrees = useStore((state) => state.worktrees);

  const treeData = useMemo<FileTreeNode[]>(() => {
    return workspaces.map((workspace) => {
      const workspaceWorktrees = worktrees
        .filter((wt) => wt.workspaceId === workspace.id)
        .sort((a, b) => {
          if (a.isMain && !b.isMain) return -1;
          if (!a.isMain && b.isMain) return 1;
          return a.createdAt - b.createdAt;
        });

      return {
        id: workspace.id,
        name: workspace.name,
        type: 'directory' as const,
        children: workspaceWorktrees.map((worktree) => ({
          id: worktree.id,
          name: getFolderName(worktree.path),
          type: 'file' as const,
          data: { ...worktree, branchName: worktree.branchName },
        })),
        data: { workspace },
      };
    });
  }, [workspaces, worktrees]);

  const handleSelect = useCallback(
    (node: NodeApi<FileTreeNode>) => {
      if (node.data.type === 'file' && node.data.data) {
        setActiveWorktree(node.data.id);
      }
    },
    [setActiveWorktree]
  );

  const handleToggle = useCallback(
    (id: string) => {
      const isCurrentlyExpanded = expandedIds.has(id);
      toggleWorkspaceExpanded(id);
      if (!isCurrentlyExpanded) {
        loadWorktreeDetails(id).catch(console.error);
      }
    },
    [expandedIds, toggleWorkspaceExpanded]
  );

  useEffect(() => {
    const client = getWebSocketClient();
    let unsubscribe: (() => void) | null = null;

    const tryAutoSelect = () => {
      const state = useStore.getState();
      if (state.activeWorktreeId) return;
      if (state.workspaces.length === 0 || state.worktrees.length === 0) return;

      const firstWorkspace = state.workspaces[0];
      const workspaceWorktrees = state.worktrees
        .filter((wt) => wt.workspaceId === firstWorkspace.id)
        .sort((a, b) => {
          if (a.isMain && !b.isMain) return -1;
          if (!a.isMain && b.isMain) return 1;
          return a.createdAt - b.createdAt;
        });

      if (workspaceWorktrees.length > 0) {
        if (!state.expandedWorkspaceIds.has(firstWorkspace.id)) {
          state.toggleWorkspaceExpanded(firstWorkspace.id);
        }
        state.setActiveWorktree(workspaceWorktrees[0].id);
      }
    };

    unsubscribe = client.onMessage('StateSnapshot', tryAutoSelect);

    tryAutoSelect();

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, []);

  if (workspaces.length === 0) {
    return null;
  }

  return (
    <div style={{ height, width: '100%' }}>
      <FileTree
        data={treeData}
        onSelect={handleSelect}
        onToggle={handleToggle}
        selection={activeWorktreeId || undefined}
        openByDefault={false}
      />
    </div>
  );
}
