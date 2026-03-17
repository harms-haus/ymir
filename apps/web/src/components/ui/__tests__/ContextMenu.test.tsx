import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ContextMenu, type ContextMenuItem, type ContextMenuState } from '../ContextMenu'

describe('ContextMenu', () => {
  const mockOnAction = vi.fn()

  const createWorkspaceState = (): ContextMenuState => ({
    isOpen: true,
    x: 100,
    y: 200,
    targetId: 'workspace-123',
    targetType: 'workspace',
  })

  const createWorktreeState = (): ContextMenuState => ({
    isOpen: true,
    x: 150,
    y: 250,
    targetId: 'worktree-456',
    targetType: 'worktree',
  })

  const allItems: ContextMenuItem[] = [
    { id: 'create-worktree', label: 'Create Worktree', icon: 'ri-git-branch-line' },
    { id: 'delete-worktree', label: 'Delete Worktree', icon: 'ri-delete-bin-line', destructive: true },
    { id: 'merge', label: 'Merge', icon: 'ri-merge-cells-vertical' },
    { id: 'view-diff', label: 'View Diff', icon: 'ri-git-diff-line' },
  ]

  it('should render nothing when menu is closed', () => {
    const closedState: ContextMenuState = {
      isOpen: false,
      x: 100,
      y: 200,
      targetId: null,
      targetType: null,
    }

    const { container } = render(
      <ContextMenu state={closedState} items={allItems} onAction={mockOnAction} />
    )

    expect(container.firstChild).toBeNull()
  })

  it('should render menu when open for workspace', () => {
    render(
      <ContextMenu state={createWorkspaceState()} items={allItems} onAction={mockOnAction} />
    )

    expect(screen.getByText('Create Worktree')).toBeInTheDocument()
  })

  it('should render menu when open for worktree', () => {
    render(
      <ContextMenu state={createWorktreeState()} items={allItems} onAction={mockOnAction} />
    )

    expect(screen.getByText('Delete Worktree')).toBeInTheDocument()
    expect(screen.getByText('Merge')).toBeInTheDocument()
    expect(screen.getByText('View Diff')).toBeInTheDocument()
  })

  it('should show only create-worktree action for workspace', () => {
    render(
      <ContextMenu state={createWorkspaceState()} items={allItems} onAction={mockOnAction} />
    )

    expect(screen.getByText('Create Worktree')).toBeInTheDocument()
    expect(screen.queryByText('Delete Worktree')).not.toBeInTheDocument()
    expect(screen.queryByText('Merge')).not.toBeInTheDocument()
    expect(screen.queryByText('View Diff')).not.toBeInTheDocument()
  })

  it('should show only worktree actions for worktree', () => {
    render(
      <ContextMenu state={createWorktreeState()} items={allItems} onAction={mockOnAction} />
    )

    expect(screen.queryByText('Create Worktree')).not.toBeInTheDocument()
    expect(screen.getByText('Delete Worktree')).toBeInTheDocument()
    expect(screen.getByText('Merge')).toBeInTheDocument()
    expect(screen.getByText('View Diff')).toBeInTheDocument()
  })

  it('should render icons when provided', () => {
    render(
      <ContextMenu state={createWorktreeState()} items={allItems} onAction={mockOnAction} />
    )

    const deleteIcon = document.querySelector('.ri-delete-bin-line')
    const mergeIcon = document.querySelector('.ri-merge-cells-vertical')
    const diffIcon = document.querySelector('.ri-git-diff-line')

    expect(deleteIcon).toBeInTheDocument()
    expect(mergeIcon).toBeInTheDocument()
    expect(diffIcon).toBeInTheDocument()
  })

  it('should call onAction when item is clicked', () => {
    render(
      <ContextMenu state={createWorktreeState()} items={allItems} onAction={mockOnAction} />
    )

    const deleteItem = screen.getByText('Delete Worktree')
    fireEvent.click(deleteItem)

    expect(mockOnAction).toHaveBeenCalledWith('delete-worktree')
  })

  it('should apply destructive style for destructive items', () => {
    const { container } = render(
      <ContextMenu state={createWorktreeState()} items={allItems} onAction={mockOnAction} />
    )

    const deleteButton = screen.getByText('Delete Worktree')
    const computedStyle = window.getComputedStyle(deleteButton as HTMLElement)
    
    expect(computedStyle.color).toContain('destructive')
  })

  it('should position menu at correct coordinates', () => {
    const state = createWorktreeState()
    const { container } = render(
      <ContextMenu state={state} items={allItems} onAction={mockOnAction} />
    )

    const popup = screen.getByText('Delete Worktree').closest('[role="menu"]')
    expect(popup).toBeInTheDocument()
  })

  it('should render nothing when no visible items', () => {
    const emptyItems: ContextMenuItem[] = []
    const { container } = render(
      <ContextMenu state={createWorktreeState()} items={emptyItems} onAction={mockOnAction} />
    )

    expect(container.firstChild).toBeNull()
  })

  it('should filter out workspace-only items for worktree type', () => {
    render(
      <ContextMenu state={createWorktreeState()} items={allItems} onAction={mockOnAction} />
    )

    expect(screen.queryByText('Create Worktree')).not.toBeInTheDocument()
  })

  it('should filter out worktree-only items for workspace type', () => {
    render(
      <ContextMenu state={createWorkspaceState()} items={allItems} onAction={mockOnAction} />
    )

    expect(screen.queryByText('Delete Worktree')).not.toBeInTheDocument()
    expect(screen.queryByText('Merge')).not.toBeInTheDocument()
    expect(screen.queryByText('View Diff')).not.toBeInTheDocument()
  })
})
