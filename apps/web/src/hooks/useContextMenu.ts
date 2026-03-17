import { useCallback, useState } from 'react'

export interface ContextMenuState {
  isOpen: boolean
  x: number
  y: number
  targetId: string | null
  targetType: 'workspace' | 'worktree' | null
}

export type ContextMenuAction = 
  | 'create-worktree'
  | 'delete-worktree'
  | 'merge'
  | 'view-diff'

export interface ContextMenuCallbacks {
  onCreateWorktree?: (workspaceId: string) => void
  onDeleteWorktree?: (worktreeId: string) => void
  onMerge?: (worktreeId: string) => void
  onViewDiff?: (worktreeId: string) => void
}

export function useContextMenu(callbacks: ContextMenuCallbacks = {}) {
  const [state, setState] = useState<ContextMenuState>({
    isOpen: false,
    x: 0,
    y: 0,
    targetId: null,
    targetType: null,
  })

  const openMenu = useCallback((e: React.MouseEvent, id: string, type: 'workspace' | 'worktree') => {
    e.preventDefault()
    e.stopPropagation()
    
    setState({
      isOpen: true,
      x: e.clientX,
      y: e.clientY,
      targetId: id,
      targetType: type,
    })
  }, [])

  const closeMenu = useCallback(() => {
    setState((prev) => ({
      ...prev,
      isOpen: false,
      targetId: null,
      targetType: null,
    }))
  }, [])

  const handleAction = useCallback((action: ContextMenuAction) => {
    const { targetId, targetType } = state
    
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
