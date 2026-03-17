import { useCallback, useMemo } from 'react'
import { StatusDot, StatusDotStatus } from './StatusDot'
import {
  useWorkspaceStore,
  useStore,
  Workspace,
  Worktree,
  selectWorkspaces,
  selectExpandedWorkspaceIds,
  selectActiveWorktreeId,
} from '../../store'
import { useContextMenu, type ContextMenuCallbacks } from '../../hooks/useContextMenu'
import { ContextMenu, type ContextMenuItem } from '../ui/ContextMenu'

export type TreeNodeType = 'workspace' | 'worktree'

export interface TreeNode {
  id: string
  type: TreeNodeType
  depth: number
  data: Workspace | Worktree
  parentId?: string
}

interface WorkspaceRowProps {
  workspace: Workspace
  isExpanded: boolean
  onToggle: () => void
  onNewWorktree: () => void
}

interface WorktreeRowProps {
  worktree: Worktree
  isSelected: boolean
  onSelect: () => void
}

function getWorkspaceStatusSummary(
  workspaceId: string,
  worktrees: Worktree[]
): {
  working: number
  waiting: number
  idle: number
} {
  return worktrees
    .filter((wt) => wt.workspaceId === workspaceId)
    .reduce(
      (acc, wt) => {
        acc[wt.status]++
        return acc
      },
      { working: 0, waiting: 0, idle: 0 }
    )
}

function WorkspaceRow({
  workspace,
  isExpanded,
  onToggle,
  onNewWorktree,
  onContextMenu,
}: WorkspaceRowProps & { onContextMenu?: (e: React.MouseEvent) => void }) {
  const worktrees = useWorkspaceStore((state) => state.worktrees)
  const summary = getWorkspaceStatusSummary(workspace.id, worktrees)
  const hasActive = summary.working > 0 || summary.waiting > 0

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        padding: '0 12px',
        borderBottom: '1px solid hsl(var(--border))',
        backgroundColor: 'hsl(var(--panel-sidebar))',
        height: '40px',
      }}
    >
      <button
        type="button"
        onClick={onToggle}
        onContextMenu={onContextMenu}
        style={{
          display: 'flex',
          alignItems: 'center',
          flex: 1,
          background: 'transparent',
          border: 'none',
          padding: 0,
          cursor: 'pointer',
          textAlign: 'left',
          fontFamily: 'inherit',
          fontSize: 'inherit',
          color: 'inherit',
        }}
      >
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '20px',
            height: '20px',
            marginRight: '4px',
            transition: 'transform 0.2s ease',
            transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
          }}
        >
          <i className="ri-arrow-right-s-line" style={{ fontSize: '16px' }} />
        </span>

        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '20px',
            height: '20px',
            marginRight: '8px',
          }}
        >
          <i className="ri-folder-3-line" style={{ fontSize: '16px', color: 'hsl(var(--primary))' }} />
        </span>

        <span
          style={{
            flex: 1,
            fontSize: '14px',
            fontWeight: 500,
            color: 'hsl(var(--foreground))',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {workspace.name}
        </span>

        <span
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            marginLeft: '8px',
            fontSize: '11px',
            color: 'hsl(var(--muted-foreground))',
          }}
        >
          {summary.working > 0 && (
            <span style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
              <StatusDot status="working" size={6} />
              {summary.working}
            </span>
          )}
          {summary.waiting > 0 && (
            <span style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
              <StatusDot status="waiting" size={6} />
              {summary.waiting}
            </span>
          )}
          {!hasActive && summary.idle > 0 && (
            <span style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
              <StatusDot status="idle" size={6} />
              {summary.idle}
            </span>
          )}
        </span>
      </button>

      {isExpanded && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onNewWorktree()
          }}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '24px',
            height: '24px',
            marginLeft: '8px',
            padding: 0,
            background: 'none',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            color: 'hsl(var(--muted-foreground))',
          }}
          title="New Worktree"
        >
          <i className="ri-add-line" style={{ fontSize: '16px' }} />
        </button>
      )}
    </div>
  )
}

function WorktreeRow({
  worktree,
  isSelected,
  onSelect,
  onContextMenu,
}: WorktreeRowProps & { onContextMenu?: (e: React.MouseEvent) => void }) {
  return (
    <button
      type="button"
      onClick={onSelect}
      onContextMenu={onContextMenu}
      style={{
        display: 'flex',
        alignItems: 'center',
        padding: '0 12px 0 44px',
        cursor: 'pointer',
        borderBottom: '1px solid hsl(var(--border))',
        backgroundColor: isSelected
          ? 'hsl(var(--accent))'
          : 'transparent',
        border: 'none',
        width: '100%',
        textAlign: 'left',
        fontFamily: 'inherit',
        fontSize: 'inherit',
        height: '32px',
      }}
    >
      <span style={{ marginRight: '8px' }}>
        <StatusDot status={worktree.status as StatusDotStatus} size={8} />
      </span>

      <span
        style={{
          flex: 1,
          fontSize: '13px',
          color: isSelected
            ? 'hsl(var(--accent-foreground))'
            : 'hsl(var(--foreground))',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {worktree.branchName}
      </span>
    </button>
  )
}

export interface WorkspaceTreeProps {
  height?: number
  width?: number | string
}

export function WorkspaceTree({ height = 400 }: WorkspaceTreeProps) {
  const workspaces = useWorkspaceStore(selectWorkspaces)
  const expandedIds = useWorkspaceStore(selectExpandedWorkspaceIds)
  const activeWorktreeId = useWorkspaceStore(selectActiveWorktreeId)
  const toggleWorkspaceExpanded = useWorkspaceStore(
    (state) => state.toggleWorkspaceExpanded
  )
  const setActiveWorktree = useStore(
    (state) => state.setActiveWorktree
  )
  const worktrees = useWorkspaceStore((state) => state.worktrees)

  const contextMenuItems: ContextMenuItem[] = [
    {
      id: 'create-worktree',
      label: 'Create Worktree',
      icon: 'ri-git-branch-line',
    },
    {
      id: 'delete-worktree',
      label: 'Delete Worktree',
      icon: 'ri-delete-bin-line',
      destructive: true,
    },
    {
      id: 'merge',
      label: 'Merge',
      icon: 'ri-merge-cells-vertical',
    },
    {
      id: 'view-diff',
      label: 'View Diff',
      icon: 'ri-git-diff-line',
    },
  ]

  const handleCreateWorktree = useCallback((workspaceId: string) => {
    console.log('Create worktree for workspace:', workspaceId)
  }, [])

  const handleDeleteWorktree = useCallback((worktreeId: string) => {
    console.log('Delete worktree:', worktreeId)
  }, [])

  const handleMerge = useCallback((worktreeId: string) => {
    console.log('Merge worktree:', worktreeId)
  }, [])

  const handleViewDiff = useCallback((worktreeId: string) => {
    console.log('View diff for worktree:', worktreeId)
  }, [])

  const contextMenuCallbacks: ContextMenuCallbacks = {
    onCreateWorktree: handleCreateWorktree,
    onDeleteWorktree: handleDeleteWorktree,
    onMerge: handleMerge,
    onViewDiff: handleViewDiff,
  }

  const { state: contextMenuState, openMenu, closeMenu, handleAction } = useContextMenu(contextMenuCallbacks)

  const flattenedNodes = useMemo(() => {
    const nodes: TreeNode[] = []
    
    for (const workspace of workspaces) {
      nodes.push({
        id: workspace.id,
        type: 'workspace',
        depth: 0,
        data: workspace,
      })

      if (expandedIds.has(workspace.id)) {
        const workspaceWorktrees = worktrees.filter((wt) => wt.workspaceId === workspace.id)
        for (const worktree of workspaceWorktrees) {
          nodes.push({
            id: worktree.id,
            type: 'worktree',
            depth: 1,
            data: worktree,
            parentId: workspace.id,
          })
        }
      }
    }

    return nodes
  }, [workspaces, expandedIds, worktrees])

  const handleToggleWorkspace = useCallback(
    (id: string) => {
      toggleWorkspaceExpanded(id)
    },
    [toggleWorkspaceExpanded]
  )

  const handleSelectWorktree = useCallback(
    (id: string) => {
      setActiveWorktree(id)
    },
    [setActiveWorktree]
  )

  const handleNewWorktree = useCallback((workspaceId: string) => {
    console.log('New worktree for workspace:', workspaceId)
  }, [])

  if (workspaces.length === 0) {
    return null
  }

  return (
    <>
      <div style={{ height, overflow: 'auto' }}>
        {flattenedNodes.map((node) => {
          if (node.type === 'workspace') {
            const workspace = node.data as Workspace
            const isExpanded = expandedIds.has(workspace.id)

            return (
              <WorkspaceRow
                key={workspace.id}
                workspace={workspace}
                isExpanded={isExpanded}
                onToggle={() => {
                  closeMenu()
                  handleToggleWorkspace(workspace.id)
                }}
                onNewWorktree={() => handleNewWorktree(workspace.id)}
                onContextMenu={(e) => openMenu(e, workspace.id, 'workspace')}
              />
            )
          }

          const worktree = node.data as Worktree
          const isSelected = activeWorktreeId === worktree.id

          return (
            <WorktreeRow
              key={worktree.id}
              worktree={worktree}
              isSelected={isSelected}
              onSelect={() => {
                closeMenu()
                handleSelectWorktree(worktree.id)
              }}
              onContextMenu={(e) => openMenu(e, worktree.id, 'worktree')}
            />
          )
        })}
      </div>
      <ContextMenu
        state={contextMenuState}
        items={contextMenuItems}
        onAction={handleAction}
      />
    </>
  )
}
