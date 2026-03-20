import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ProjectPanel } from '../ProjectPanel'
import { useStore, selectActiveWorktree } from '../../../store'

vi.mock('../../../store', () => ({
  useStore: vi.fn(),
  selectActiveWorktree: vi.fn(),
}))

vi.mock('../../../lib/ws', () => ({
  getWebSocketClient: vi.fn(() => ({
    onMessage: vi.fn(() => vi.fn()),
    send: vi.fn(),
  })),
}))

vi.mock('../ChangesTab', () => ({
  ChangesTab: () => <div data-testid="changes-tab">Changes Tab</div>,
}))

vi.mock('../AllFilesTab', () => ({
  AllFilesTab: () => <div data-testid="all-files-tab">All Files Tab</div>,
}))

describe('ProjectPanel', () => {
  const mockSelectActiveWorktree = selectActiveWorktree as unknown as ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.clearAllMocks()
    
    const mockStore = {
      addNotification: vi.fn(),
    }
    
    ;(useStore as any).mockImplementation((selector: any) => {
      if (typeof selector === 'function') {
        return selector(mockStore)
      }
      return mockStore
    })
  })

  it('should render project panel with tabs', () => {
    mockSelectActiveWorktree.mockReturnValue(null)
    
    render(<ProjectPanel />)
    
    expect(screen.getByText('Project')).toBeInTheDocument()
    expect(screen.getByText('Changes')).toBeInTheDocument()
    expect(screen.getByText('All Files')).toBeInTheDocument()
  })

  it('should show PR button as disabled when no active worktree', () => {
    mockSelectActiveWorktree.mockReturnValue(null)
    
    render(<ProjectPanel />)
    
    const prButton = screen.getByText('PR').closest('button')
    expect(prButton).toBeDisabled()
  })

  it('should show PR button as enabled when active worktree exists', () => {
    mockSelectActiveWorktree.mockReturnValue({
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
})