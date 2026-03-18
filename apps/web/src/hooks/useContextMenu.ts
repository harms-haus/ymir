import { useCallback, useState } from 'react'

export interface ContextMenuState {
  isOpen: boolean
  x: number
  y: number
  targetId: string | null
  targetType: 'workspace' | 'worktree' | null
  targetPath: string | null
}

export type ContextMenuAction = 
  | 'create-worktree'
  | 'delete-worktree'
  | 'merge'
  | 'view-diff'
  | 'settings'
  | 'open-in-file-manager'
  | 'copy-path'

export interface ContextMenuCallbacks {
  onCreateWorktree?: (workspaceId: string) => void
  onDeleteWorktree?: (worktreeId: string) => void
  onMerge?: (worktreeId: string) => void
  onViewDiff?: (worktreeId: string) => void
  onSettings?: (workspaceId: string) => void
  onOpenInFileManager?: (path: string) => void
  onCopyPath?: (path: string) => void
}

export function useContextMenu(callbacks: ContextMenuCallbacks = {}) {
  const [state, setState] = useState<ContextMenuState>({
    isOpen: false,
    x: 0,
    y: 0,
    targetId: null,
    targetType: null,
    targetPath: null,
  })

  const openMenu = useCallback((e: React.MouseEvent, id: string, type: 'workspace' | 'worktree', path?: string) => {
    e.preventDefault()
    e.stopPropagation()
    
    setState({
      isOpen: true,
      x: e.clientX,
      y: e.clientY,
      targetId: id,
      targetType: type,
      targetPath: path ?? null,
    })
  }, [])

  const closeMenu = useCallback(() => {
    setState((prev) => ({
      ...prev,
      isOpen: false,
      targetId: null,
      targetType: null,
      targetPath: null,
    }))
  }, [])

  const handleAction = useCallback((action: ContextMenuAction) => {
    const { targetId, targetType, targetPath } = state
    
    if (!targetId) return

    switch (action) {
      case 'create-worktree':
        if (targetType === 'workspace') {
          callbacks.onCreateWorktree?.(targetId)
        }
        break
      case 'delete-worktree':
        if (targetType === 'worktree') {
          callbacks.onDeleteWorktree?.(targetId)
        }
        break
      case 'merge':
        if (targetType === 'worktree') {
          callbacks.onMerge?.(targetId)
        }
        break
      case 'view-diff':
        if (targetType === 'worktree') {
          callbacks.onViewDiff?.(targetId)
        }
        break
      case 'settings':
        if (targetType === 'workspace') {
          callbacks.onSettings?.(targetId)
        }
        break
      case 'open-in-file-manager':
        if (targetPath) {
          callbacks.onOpenInFileManager?.(targetPath)
        }
        break
      case 'copy-path':
        if (targetPath) {
          callbacks.onCopyPath?.(targetPath)
        }
        break
    }

    closeMenu()
  }, [state, callbacks, closeMenu])

  return {
    state,
    openMenu,
    closeMenu,
    handleAction,
  }
}
