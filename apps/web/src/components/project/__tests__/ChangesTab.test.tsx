import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { ChangesTab } from '../ChangesTab'
import { useStore } from '../../../store'
import { getWebSocketClient } from '../../../lib/ws'

vi.mock('../../../store')
vi.mock('../../../lib/ws', () => ({
  getWebSocketClient: vi.fn(() => ({
    onMessage: vi.fn(() => vi.fn()),
    send: vi.fn(),
  })),
}))

describe('ChangesTab', () => {
  const mockUseStore = useStore as unknown as ReturnType<typeof vi.fn>
  const mockWsClient = getWebSocketClient as unknown as ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should show no worktree message when no active worktree', () => {
    mockUseStore.mockReturnValue(null)
    
    render(<ChangesTab />)
    
    expect(screen.getByText('No worktree selected')).toBeInTheDocument()
  })

  it('should show no changes message when no files', () => {
    mockUseStore.mockReturnValue({
      id: 'worktree-1',
      status: 'active',
      branchName: 'main',
      path: '/path/to/worktree',
      workspaceId: 'workspace-1',
    })
    
    const mockOnMessage = vi.fn((type, callback) => {
      if (type === 'GitStatusResult') {
        // Simulate no files
        callback({ type: 'GitStatusResult', worktreeId: 'worktree-1', entries: [] })
      }
      return vi.fn()
    })
    
    mockWsClient.mockReturnValue({
      onMessage: mockOnMessage,
      send: vi.fn(),
    })
    
    render(<ChangesTab />)
    
    expect(screen.getByText('No changes')).toBeInTheDocument()
  })

  it('should display files in flat view by default', async () => {
    mockUseStore.mockReturnValue({
      id: 'worktree-1',
      status: 'active',
      branchName: 'main',
      path: '/path/to/worktree',
      workspaceId: 'workspace-1',
    })
    
    const mockOnMessage = vi.fn((type, callback) => {
      if (type === 'GitStatusResult') {
        callback({
          type: 'GitStatusResult',
          worktreeId: 'worktree-1',
          entries: [
            { path: 'src/file1.ts', status: 'modified', staged: false },
            { path: 'src/file2.ts', status: 'added', staged: false },
          ],
        })
      }
      return vi.fn()
    })
    
    mockWsClient.mockReturnValue({
      onMessage: mockOnMessage,
      send: vi.fn(),
    })
    
    render(<ChangesTab />)
    
    await waitFor(() => {
      expect(screen.getByText('src/file1.ts')).toBeInTheDocument()
      expect(screen.getByText('src/file2.ts')).toBeInTheDocument()
    })
  })

  it('should switch between flat and grouped views', async () => {
    mockUseStore.mockReturnValue({
      id: 'worktree-1',
      status: 'active',
      branchName: 'main',
      path: '/path/to/worktree',
      workspaceId: 'workspace-1',
    })
    
    const mockOnMessage = vi.fn((type, callback) => {
      if (type === 'GitStatusResult') {
        callback({
          type: 'GitStatusResult',
          worktreeId: 'worktree-1',
          entries: [
            { path: 'src/file1.ts', status: 'modified', staged: false },
            { path: 'src/file2.ts', status: 'added', staged: false },
          ],
        })
      }
      return vi.fn()
    })
    
    mockWsClient.mockReturnValue({
      onMessage: mockOnMessage,
      send: vi.fn(),
    })
    
    render(<ChangesTab />)
    
    await waitFor(() => {
      expect(screen.getByText('src/file1.ts')).toBeInTheDocument()
    })
    
    const groupedButton = screen.getByText('Grouped by folder')
    fireEvent.click(groupedButton)
    
    expect(screen.getByText('src')).toBeInTheDocument()
    
    const flatButton = screen.getByText('Flat')
    fireEvent.click(flatButton)
    
    expect(screen.getByText('src/file1.ts')).toBeInTheDocument()
  })

  it('should show correct status colors for different file statuses', async () => {
    mockUseStore.mockReturnValue({
      id: 'worktree-1',
      status: 'active',
      branchName: 'main',
      path: '/path/to/worktree',
      workspaceId: 'workspace-1',
    })
    
    const mockOnMessage = vi.fn((type, callback) => {
      if (type === 'GitStatusResult') {
        callback({
          type: 'GitStatusResult',
          worktreeId: 'worktree-1',
          entries: [
            { path: 'added.ts', status: 'added', staged: false },
            { path: 'modified.ts', status: 'modified', staged: false },
            { path: 'deleted.ts', status: 'deleted', staged: false },
            { path: 'untracked.ts', status: 'untracked', staged: false },
          ],
        })
      }
      return vi.fn()
    })
    
    mockWsClient.mockReturnValue({
      onMessage: mockOnMessage,
      send: vi.fn(),
    })
    
    render(<ChangesTab />)
    
    await waitFor(() => {
      expect(screen.getByText('added.ts')).toBeInTheDocument()
    })
    
    expect(screen.getByText('added')).toBeInTheDocument()
    expect(screen.getByText('modified')).toBeInTheDocument()
    expect(screen.getByText('deleted')).toBeInTheDocument()
    expect(screen.getByText('untracked')).toBeInTheDocument()
  })

  it('should request git status when active worktree changes', () => {
    const mockSend = vi.fn()
    
    mockUseStore.mockReturnValue({
      id: 'worktree-1',
      status: 'active',
      branchName: 'main',
      path: '/path/to/worktree',
      workspaceId: 'workspace-1',
    })
    
    mockWsClient.mockReturnValue({
      onMessage: vi.fn(() => vi.fn()),
      send: mockSend,
    })
    
    render(<ChangesTab />)
    
    expect(mockSend).toHaveBeenCalledWith({
      type: 'GitStatus',
      worktreeId: 'worktree-1',
    })
  })
})