import { useCallback, useMemo } from 'react'
import { StatusDot } from './StatusDot'
import { useAgentStatus, useWorkspaceAgentStatusSummary } from '../../hooks/useAgentStatus'
import { useStore } from '../../store'
import type { WorkspaceState, WorktreeState } from '../../types/state'
import { useContextMenu, type ContextMenuCallbacks } from '../../hooks/useContextMenu'
import { ContextMenu, type ContextMenuItem } from '../ui/ContextMenu'
import { AlertDialog } from '../ui/AlertDialog'
import type { Worktree as ProtocolWorktree } from '../../types/protocol'
import { CreateWorktreeDialog } from '../dialogs/CreateWorktreeDialog'
import { WorkspaceSettingsDialog } from '../dialogs/WorkspaceSettingsDialog'
import { MergeDialog } from '../dialogs/MergeDialog'
import { ChangeBranchDialog } from '../dialogs/ChangeBranchDialog'
import { deleteWorktree } from '../../lib/api'
import { revealInFileManager, copyToClipboard } from '../../lib/tauri'

export type TreeNodeType = 'workspace' | 'worktree'

export interface TreeNode {
  id: string
  type: TreeNodeType
  depth: number
  data: WorkspaceState | WorktreeState
  parentId?: string
}

interface WorkspaceRowProps {
  workspace: WorkspaceState
  isExpanded: boolean
  onToggle: () => void
  onNewWorktree: () => void
}

interface WorktreeRowProps {
  worktree: WorktreeState
  isSelected: boolean
  onSelect: () => void
}

function WorkspaceRow({
  workspace,
  isExpanded,
  onToggle,
  onNewWorktree,
  onContextMenu,
}: WorkspaceRowProps & { onContextMenu?: (e: React.MouseEvent) => void }) {
  const worktrees = useStore((state) => state.worktrees)
  const protocolWorktrees: ProtocolWorktree[] = worktrees.map(wt => ({
    id: wt.id,
    workspaceId: wt.workspaceId,
    branchName: wt.branchName,
    path: '',
    status: 'active',
    isMain: wt.isMain ?? false,
    createdAt: 0,
  }))
  const summary = useWorkspaceAgentStatusSummary(workspace.id, protocolWorktrees)
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

function getFolderName(path: string): string {
  if (!path) return '';
  const cleanPath = path.replace(/\/+$/, '');
  const segments = cleanPath.split(/[/\\]/);
  return segments[segments.length - 1] || '';
}

function WorktreeRow({
  worktree,
  isSelected,
  onSelect,
  onContextMenu,
}: WorktreeRowProps & { onContextMenu?: (e: React.MouseEvent) => void }) {
  const agentStatus = useAgentStatus(worktree.id)
  const status = agentStatus?.status ?? 'idle'
  
  const totalChanges = worktree.gitStats 
    ? worktree.gitStats.modified + worktree.gitStats.added + worktree.gitStats.deleted 
    : 0;
  
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
        <StatusDot status={status} size={8} />
      </span>

      <span style={{ 
        flex: 1, 
        display: 'flex', 
        alignItems: 'center', 
        gap: '8px',
        overflow: 'hidden',
      }}>
        <span style={{ 
          fontSize: '13px',
          fontWeight: 500,
          color: isSelected
            ? 'hsl(var(--accent-foreground))'
            : 'hsl(var(--foreground))',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}>
          {getFolderName(worktree.path)}
        </span>
        
        <span style={{ 
          fontSize: '11px', 
          color: 'hsl(var(--muted-foreground))',
          fontWeight: 400,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}>
          {worktree.branchName}
        </span>
        
        {totalChanges > 0 && (
          <span style={{
            fontSize: '11px',
            padding: '1px 6px',
            borderRadius: '10px',
            backgroundColor: 'hsl(var(--warning) / 0.15)',
            color: 'hsl(var(--warning))',
            whiteSpace: 'nowrap',
          }}>
            {totalChanges}
          </span>
        )}
      </span>
    </button>
  )
}

export interface WorkspaceTreeProps {
  height?: number
  width?: number | string
}

export function WorkspaceTree({ height = 400 }: WorkspaceTreeProps) {
  const workspaces = useStore((state) => state.workspaces)
  const expandedIds = useStore((state) => state.expandedWorkspaceIds)
  const activeWorktreeId = useStore((state) => state.activeWorktreeId)
  const toggleWorkspaceExpanded = useStore((state) => state.toggleWorkspaceExpanded)
  const setActiveWorktree = useStore((state) => state.setActiveWorktree)
  const worktrees = useStore((state) => state.worktrees)
  const createWorktreeDialog = useStore((state) => state.createWorktreeDialog)
  const setCreateWorktreeDialogOpen = useStore((state) => state.setCreateWorktreeDialogOpen)
  const workspaceSettingsDialog = useStore((state) => state.workspaceSettingsDialog)
  const setWorkspaceSettingsDialogOpen = useStore((state) => state.setWorkspaceSettingsDialogOpen)
  const mergeDialog = useStore((state) => state.mergeDialog)
  const setMergeDialogOpen = useStore((state) => state.setMergeDialogOpen)
  const resetMergeDialog = useStore((state) => state.resetMergeDialog)
  const changeBranchDialog = useStore((state) => state.changeBranchDialog)
  const setChangeBranchDialogOpen = useStore((state) => state.setChangeBranchDialogOpen)
  const resetChangeBranchDialog = useStore((state) => state.resetChangeBranchDialog)
  const showAlertDialog = useStore((state) => state.showAlertDialog)
  const removeWorktree = useStore((state) => state.removeWorktree)
  const alertDialog = useStore((state) => state.alertDialog)
  const hideAlertDialog = useStore((state) => state.hideAlertDialog)

  const contextMenuItems: ContextMenuItem[] = [
    {
      id: 'create-worktree',
      label: 'Create Worktree',
      icon: 'ri-git-branch-line',
    },
    {
      id: 'settings',
      label: 'Settings',
      icon: 'ri-settings-3-line',
    },
    {
      id: 'change-branch',
      label: 'Change Branch',
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
    {
      id: 'open-in-file-manager',
      label: 'Open in File Manager',
      icon: 'ri-folder-open-line',
    },
    {
      id: 'copy-path',
      label: 'Copy Path',
      icon: 'ri-file-copy-line',
    },
  ]

  const handleCreateWorktree = useCallback((workspaceId: string) => {
    setCreateWorktreeDialogOpen(true, workspaceId)
  }, [setCreateWorktreeDialogOpen])

  const handleDeleteWorktree = useCallback((worktreeId: string) => {
    const worktree = worktrees.find(wt => wt.id === worktreeId)
    if (!worktree) return
    
    if (worktree.isMain) {
      showAlertDialog({
        title: 'Cannot Delete Main Worktree',
        description: 'The main worktree cannot be deleted. It is automatically managed.',
        confirmLabel: 'OK',
        variant: 'default',
        onConfirm: () => {},
      })
      return
    }
    
    showAlertDialog({
      title: 'Delete Worktree',
      description: 'Are you sure you want to delete this worktree? This action cannot be undone.',
      confirmLabel: 'Delete',
      cancelLabel: 'Cancel',
      variant: 'destructive',
      onConfirm: () => {
        deleteWorktree(worktreeId)
        removeWorktree(worktreeId)
      },
    })
  }, [showAlertDialog, removeWorktree, worktrees])

const handleChangeBranch = useCallback((worktreeId: string) => {
  const worktree = worktrees.find(wt => wt.id === worktreeId)
  if (!worktree) return

  setChangeBranchDialogOpen(true, worktreeId, worktree.branchName)
}, [worktrees, setChangeBranchDialogOpen])

  const handleMerge = useCallback((worktreeId: string) => {
    const worktree = worktrees.find(wt => wt.id === worktreeId)
    if (!worktree) return
    
    setMergeDialogOpen(true, worktreeId, worktree.branchName, 'main', 'merge')
  }, [worktrees, setMergeDialogOpen])

  const handleViewDiff = useCallback((worktreeId: string) => {
    setActiveWorktree(worktreeId)
  }, [setActiveWorktree])

  const handleSettings = useCallback((workspaceId: string) => {
    setWorkspaceSettingsDialogOpen(true, workspaceId)
  }, [setWorkspaceSettingsDialogOpen])

  const handleOpenInFileManager = useCallback((path: string) => {
    revealInFileManager(path)
  }, [])

  const handleCopyPath = useCallback((path: string) => {
    copyToClipboard(path)
  }, [])

  const contextMenuCallbacks: ContextMenuCallbacks = {
    onCreateWorktree: handleCreateWorktree,
    onDeleteWorktree: handleDeleteWorktree,
    onChangeBranch: handleChangeBranch,
    onMerge: handleMerge,
    onViewDiff: handleViewDiff,
    onSettings: handleSettings,
    onOpenInFileManager: handleOpenInFileManager,
    onCopyPath: handleCopyPath,
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
      const workspaceWorktrees = worktrees
        .filter((wt) => wt.workspaceId === workspace.id)
        .sort((a, b) => {
          if (a.isMain && !b.isMain) return -1
          if (!a.isMain && b.isMain) return 1
          return a.createdAt - b.createdAt
        })
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
    setCreateWorktreeDialogOpen(true, workspaceId)
  }, [setCreateWorktreeDialogOpen])

  if (workspaces.length === 0) {
    return null
  }

  return (
    <>
      <div style={{ height, overflow: 'auto' }}>
        {flattenedNodes.map((node) => {
          if (node.type === 'workspace') {
            const workspace = node.data as WorkspaceState
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

          const worktree = node.data as WorktreeState
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
              onContextMenu={(e) => openMenu(e, worktree.id, 'worktree', worktree.path)}
            />
          )
        })}
      </div>
      <ContextMenu
        state={contextMenuState}
        items={contextMenuItems}
        onAction={handleAction}
        closeMenu={closeMenu}
      />
      <CreateWorktreeDialog
        open={createWorktreeDialog.isOpen}
        onOpenChange={(open) => setCreateWorktreeDialogOpen(open, createWorktreeDialog.workspaceId ?? undefined)}
        workspaceId={createWorktreeDialog.workspaceId}
      />
      <WorkspaceSettingsDialog
        open={workspaceSettingsDialog.isOpen}
        onOpenChange={(open) => setWorkspaceSettingsDialogOpen(open, workspaceSettingsDialog.workspaceId ?? undefined)}
        workspaceId={workspaceSettingsDialog.workspaceId}
      />
      <MergeDialog
        open={mergeDialog.isOpen}
        onOpenChange={(open) => {
          if (!open) resetMergeDialog()
          else setMergeDialogOpen(true, mergeDialog.worktreeId ?? undefined, mergeDialog.branchName, mergeDialog.mainBranch, mergeDialog.mergeType)
        }}
        worktreeId={mergeDialog.worktreeId ?? ''}
        branchName={mergeDialog.branchName}
        mainBranch={mergeDialog.mainBranch}
        mergeType={mergeDialog.mergeType}
      />
      <ChangeBranchDialog
        open={changeBranchDialog.isOpen}
        onOpenChange={(open) => {
          if (!open) resetChangeBranchDialog()
          else setChangeBranchDialogOpen(true, changeBranchDialog.worktreeId ?? undefined, changeBranchDialog.currentBranch)
        }}
        worktreeId={changeBranchDialog.worktreeId}
        currentBranch={changeBranchDialog.currentBranch}
      />
      {alertDialog && (
        <AlertDialog
          open={alertDialog.open}
          onOpenChange={(open) => {
            if (!open) hideAlertDialog()
          }}
          title={alertDialog.title}
          description={alertDialog.description}
          confirmLabel={alertDialog.confirmLabel}
          cancelLabel={alertDialog.cancelLabel}
          variant={alertDialog.variant}
          onConfirm={alertDialog.onConfirm}
          onCancel={alertDialog.onCancel}
        />
      )}
    </>
  )
}
