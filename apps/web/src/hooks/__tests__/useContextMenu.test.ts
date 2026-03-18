import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useContextMenu, type ContextMenuCallbacks } from '../useContextMenu'

describe('useContextMenu', () => {
  const mockCallbacks: ContextMenuCallbacks = {
    onCreateWorktree: vi.fn(),
    onDeleteWorktree: vi.fn(),
    onMerge: vi.fn(),
    onViewDiff: vi.fn(),
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should initialize with closed menu state', () => {
    const { result } = renderHook(() => useContextMenu(mockCallbacks))

expect(result.current.state).toEqual({
    isOpen: false,
    x: 0,
    y: 0,
    targetId: null,
    targetType: null,
    targetPath: null,
  })
  })

  it('should open menu on right-click for workspace', () => {
    const { result } = renderHook(() => useContextMenu(mockCallbacks))
    const mockEvent = {
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
      clientX: 100,
      clientY: 200,
    } as unknown as React.MouseEvent

    act(() => {
      result.current.openMenu(mockEvent, 'workspace-123', 'workspace')
    })

    expect(mockEvent.preventDefault).toHaveBeenCalled()
    expect(mockEvent.stopPropagation).toHaveBeenCalled()
expect(result.current.state).toEqual({
    isOpen: true,
    x: 100,
    y: 200,
    targetId: 'workspace-123',
    targetType: 'workspace',
    targetPath: null,
  })
  })

  it('should open menu on right-click for worktree', () => {
    const { result } = renderHook(() => useContextMenu(mockCallbacks))
    const mockEvent = {
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
      clientX: 150,
      clientY: 250,
    } as unknown as React.MouseEvent

    act(() => {
      result.current.openMenu(mockEvent, 'worktree-456', 'worktree')
    })

expect(result.current.state).toEqual({
    isOpen: true,
    x: 150,
    y: 250,
    targetId: 'worktree-456',
    targetType: 'worktree',
    targetPath: null,
  })
  })

  it('should close menu', () => {
    const { result } = renderHook(() => useContextMenu(mockCallbacks))
    const mockEvent = {
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
      clientX: 100,
      clientY: 200,
    } as unknown as React.MouseEvent

    act(() => {
      result.current.openMenu(mockEvent, 'workspace-123', 'workspace')
    })

    expect(result.current.state.isOpen).toBe(true)

    act(() => {
      result.current.closeMenu()
    })

expect(result.current.state).toEqual({
    isOpen: false,
    x: 100,
    y: 200,
    targetId: null,
    targetType: null,
    targetPath: null,
  })
  })

  it('should call create-worktree callback for workspace', () => {
    const { result } = renderHook(() => useContextMenu(mockCallbacks))
    const mockEvent = {
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
      clientX: 100,
      clientY: 200,
    } as unknown as React.MouseEvent

    act(() => {
      result.current.openMenu(mockEvent, 'workspace-123', 'workspace')
    })

    act(() => {
      result.current.handleAction('create-worktree')
    })

    expect(mockCallbacks.onCreateWorktree).toHaveBeenCalledWith('workspace-123')
    expect(result.current.state.isOpen).toBe(false)
  })

  it('should call delete-worktree callback for worktree', () => {
    const { result } = renderHook(() => useContextMenu(mockCallbacks))
    const mockEvent = {
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
      clientX: 100,
      clientY: 200,
    } as unknown as React.MouseEvent

    act(() => {
      result.current.openMenu(mockEvent, 'worktree-456', 'worktree')
    })

    act(() => {
      result.current.handleAction('delete-worktree')
    })

    expect(mockCallbacks.onDeleteWorktree).toHaveBeenCalledWith('worktree-456')
    expect(result.current.state.isOpen).toBe(false)
  })

  it('should call merge callback for worktree', () => {
    const { result } = renderHook(() => useContextMenu(mockCallbacks))
    const mockEvent = {
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
      clientX: 100,
      clientY: 200,
    } as unknown as React.MouseEvent

    act(() => {
      result.current.openMenu(mockEvent, 'worktree-456', 'worktree')
    })

    act(() => {
      result.current.handleAction('merge')
    })

    expect(mockCallbacks.onMerge).toHaveBeenCalledWith('worktree-456')
    expect(result.current.state.isOpen).toBe(false)
  })

  it('should call view-diff callback for worktree', () => {
    const { result } = renderHook(() => useContextMenu(mockCallbacks))
    const mockEvent = {
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
      clientX: 100,
      clientY: 200,
    } as unknown as React.MouseEvent

    act(() => {
      result.current.openMenu(mockEvent, 'worktree-456', 'worktree')
    })

    act(() => {
      result.current.handleAction('view-diff')
    })

    expect(mockCallbacks.onViewDiff).toHaveBeenCalledWith('worktree-456')
    expect(result.current.state.isOpen).toBe(false)
  })

  it('should not call callback when targetId is null', () => {
    const { result } = renderHook(() => useContextMenu(mockCallbacks))

    act(() => {
      result.current.handleAction('delete-worktree')
    })

    expect(mockCallbacks.onDeleteWorktree).not.toHaveBeenCalled()
  })

  it('should not call create-worktree for worktree type', () => {
    const { result } = renderHook(() => useContextMenu(mockCallbacks))
    const mockEvent = {
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
      clientX: 100,
      clientY: 200,
    } as unknown as React.MouseEvent

    act(() => {
      result.current.openMenu(mockEvent, 'worktree-456', 'worktree')
    })

    act(() => {
      result.current.handleAction('create-worktree')
    })

    expect(mockCallbacks.onCreateWorktree).not.toHaveBeenCalled()
  })

  it('should not call worktree actions for workspace type', () => {
    const { result } = renderHook(() => useContextMenu(mockCallbacks))
    const mockEvent = {
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
      clientX: 100,
      clientY: 200,
    } as unknown as React.MouseEvent

    act(() => {
      result.current.openMenu(mockEvent, 'workspace-123', 'workspace')
    })

    act(() => {
      result.current.handleAction('delete-worktree')
    })

    expect(mockCallbacks.onDeleteWorktree).not.toHaveBeenCalled()
  })
})
