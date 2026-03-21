import { useCallback, useState } from 'react'

export interface ContextMenuState {
  isOpen: boolean
  x: number
  y: number
  targetId: string | null
  targetType: 'workspace' | 'worktree' | 'agent-tab' | 'terminal-tab' | null
  targetPath: string | null
}

export type ContextMenuAction =
  | 'create-worktree'
  | 'delete-worktree'
  | 'change-branch'
  | 'merge'
  | 'view-diff'
  | 'settings'
  | 'open-in-file-manager'
  | 'copy-path'
  | 'rename'
  | 'close'
  | 'close-right'
  | 'close-left'
  | 'close-others'

export interface ContextMenuCallbacks {
  onCreateWorktree?: (workspaceId: string) => void
  onDeleteWorktree?: (worktreeId: string) => void
  onChangeBranch?: (worktreeId: string) => void
  onMerge?: (worktreeId: string) => void
  onViewDiff?: (worktreeId: string) => void
  onSettings?: (workspaceId: string) => void
  onOpenInFileManager?: (path: string) => void
  onCopyPath?: (path: string) => void
  onRename?: (tabId: string) => void
  onClose?: (tabId: string) => void
  onCloseRight?: (tabId: string) => void
  onCloseLeft?: (tabId: string) => void
  onCloseOthers?: (tabId: string) => void
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

  const openMenu = useCallback((e: React.MouseEvent, id: string, type: 'workspace' | 'worktree' | 'agent-tab' | 'terminal-tab', path?: string) => {
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
      case 'change-branch':
        if (targetType === 'worktree') {
          callbacks.onChangeBranch?.(targetId)
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
      case 'rename':
        if (targetType === 'agent-tab' || targetType === 'terminal-tab') {
          callbacks.onRename?.(targetId)
        }
        break
      case 'close':
        if (targetType === 'agent-tab' || targetType === 'terminal-tab') {
          callbacks.onClose?.(targetId)
        }
        break
      case 'close-right':
        if (targetType === 'agent-tab' || targetType === 'terminal-tab') {
          callbacks.onCloseRight?.(targetId)
        }
        break
      case 'close-left':
        if (targetType === 'agent-tab' || targetType === 'terminal-tab') {
          callbacks.onCloseLeft?.(targetId)
        }
        break
      case 'close-others':
        if (targetType === 'agent-tab' || targetType === 'terminal-tab') {
          callbacks.onCloseOthers?.(targetId)
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
