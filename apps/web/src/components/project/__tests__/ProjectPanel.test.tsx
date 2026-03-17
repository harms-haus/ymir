import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ProjectPanel } from '../ProjectPanel'
import { useStore } from '../../../store'

vi.mock('../../../store')
vi.mock('../../../lib/ws', () => ({
  getWebSocketClient: vi.fn(() => ({
    onMessage: vi.fn(() => vi.fn()),
    send: vi.fn(),
  })),
}))

describe('ProjectPanel', () => {
  const mockUseStore = useStore as unknown as ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should render project panel with tabs', () => {
    mockUseStore.mockReturnValue(null)
    
    render(<ProjectPanel />)
    
    expect(screen.getByText('Project')).toBeInTheDocument()
    expect(screen.getByText('Changes')).toBeInTheDocument()
    expect(screen.getByText('All Files')).toBeInTheDocument()
  })

  it('should show PR button as disabled when no active worktree', () => {
    mockUseStore.mockReturnValue(null)
    
    render(<ProjectPanel />)
    
    const prButton = screen.getByText('PR').closest('button')
    expect(prButton).toBeDisabled()
  })

  it('should show PR button as enabled when active worktree exists', () => {
    mockUseStore.mockReturnValue({
      id: 'worktree-1',
      status: 'active',
      branchName: 'main',
      path: '/path/to/worktree',
      workspaceId: 'workspace-1',
    })
    
    render(<ProjectPanel />)
    
    const prButton = screen.getByText('PR').closest('button')
    expect(prButton).not.toBeDisabled()
  })

  it('should open PR dialog when PR button is clicked', () => {
    mockUseStore.mockReturnValue({
      id: 'worktree-1',
      status: 'active',
      branchName: 'main',
      path: '/path/to/worktree',
      workspaceId: 'workspace-1',
    })
    
    render(<ProjectPanel />)
    
    const prButton = screen.getByText('PR').closest('button')
    fireEvent.click(prButton!)
    
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('should switch between Changes and All Files tabs', () => {
    mockUseStore.mockReturnValue(null)
    
    render(<ProjectPanel />)
    
    const changesTab = screen.getByText('Changes')
    const allFilesTab = screen.getByText('All Files')
    
    expect(changesTab.closest('[role="tab"]')).toHaveAttribute('aria-selected', 'true')
    
    fireEvent.click(allFilesTab)
    expect(allFilesTab.closest('[role="tab"]')).toHaveAttribute('aria-selected', 'true')
    
    fireEvent.click(changesTab)
    expect(changesTab.closest('[role="tab"]')).toHaveAttribute('aria-selected', 'true')
  })
})