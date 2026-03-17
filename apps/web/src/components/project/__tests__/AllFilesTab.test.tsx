import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { AllFilesTab } from '../AllFilesTab'
import { useStore } from '../../../store'
import { getWebSocketClient } from '../../../lib/ws'

vi.mock('../../../store')
vi.mock('../../../lib/ws', () => ({
  getWebSocketClient: vi.fn(() => ({
    onMessage: vi.fn(() => vi.fn()),
    send: vi.fn(),
  })),
}))

describe('AllFilesTab', () => {
  const mockUseStore = useStore as unknown as ReturnType<typeof vi.fn>
  const mockWsClient = getWebSocketClient as unknown as ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should show no worktree message when no active worktree', () => {
    mockUseStore.mockReturnValue(null)
    
    render(<AllFilesTab />)
    
    expect(screen.getByText('No worktree selected')).toBeInTheDocument()
  })

  it('should show no files message when no files', () => {
    mockUseStore.mockReturnValue({
      id: 'worktree-1',
      status: 'active',
      branchName: 'main',
      path: '/path/to/worktree',
      workspaceId: 'workspace-1',
    })
    
    const mockOnMessage = vi.fn((type) => {
      if (type === 'FileChange') {
      }
      return vi.fn()
    })
    
    mockWsClient.mockReturnValue({
      onMessage: mockOnMessage,
      send: vi.fn(),
    })
    
    render(<AllFilesTab />)
    
    waitFor(() => {
      expect(screen.getByText('No files found')).toBeInTheDocument()
    })
  })

  it('should display files in tree structure', async () => {
    mockUseStore.mockReturnValue({
      id: 'worktree-1',
      status: 'active',
      branchName: 'main',
      path: '/path/to/worktree',
      workspaceId: 'workspace-1',
    })
    
    const mockOnMessage = vi.fn((type, callback) => {
      if (type === 'FileChange') {
        callback({ type: 'FileChange', worktreeId: 'worktree-1', path: 'src/file1.ts', changeType: 'created' })
      }
      return vi.fn()
    })
    
    mockWsClient.mockReturnValue({
      onMessage: mockOnMessage,
      send: vi.fn(),
    })
    
    render(<AllFilesTab />)
    
    await waitFor(() => {
      expect(screen.getByText('src')).toBeInTheDocument()
      expect(screen.getByText('file1.ts')).toBeInTheDocument()
    })
  })

  it('should expand and collapse directories', async () => {
    mockUseStore.mockReturnValue({
      id: 'worktree-1',
      status: 'active',
      branchName: 'main',
      path: '/path/to/worktree',
      workspaceId: 'workspace-1',
    })
    
    const mockOnMessage = vi.fn((type, callback) => {
      if (type === 'FileChange') {
        callback({ type: 'FileChange', worktreeId: 'worktree-1', path: 'src/components/Button.tsx', changeType: 'created' })
      }
      return vi.fn()
    })
    
    mockWsClient.mockReturnValue({
      onMessage: mockOnMessage,
      send: vi.fn(),
    })
    
    render(<AllFilesTab />)
    
    await waitFor(() => {
      expect(screen.getByText('src')).toBeInTheDocument()
    })
    
    const srcDir = screen.getByText('src')
    fireEvent.click(srcDir)
    
    await waitFor(() => {
      expect(screen.getByText('components')).toBeInTheDocument()
    })
    
    const componentsDir = screen.getByText('components')
    fireEvent.click(componentsDir)
    
    await waitFor(() => {
      expect(screen.getByText('Button.tsx')).toBeInTheDocument()
    })
  })

  it('should update file list when files change', async () => {
    mockUseStore.mockReturnValue({
      id: 'worktree-1',
      status: 'active',
      branchName: 'main',
      path: '/path/to/worktree',
      workspaceId: 'workspace-1',
    })
    
    const mockOnMessage = vi.fn((type, callback) => {
      if (type === 'FileChange') {
        callback({ type: 'FileChange', worktreeId: 'worktree-1', path: 'new-file.ts', changeType: 'created' })
      }
      return vi.fn()
    })
    
    mockWsClient.mockReturnValue({
      onMessage: mockOnMessage,
      send: vi.fn(),
    })
    
    render(<AllFilesTab />)
    
    await waitFor(() => {
      expect(screen.getByText('new-file.ts')).toBeInTheDocument()
    })
  })

  it('should remove file from list when file is deleted', async () => {
    mockUseStore.mockReturnValue({
      id: 'worktree-1',
      status: 'active',
      branchName: 'main',
      path: '/path/to/worktree',
      workspaceId: 'workspace-1',
    })
    
    const mockOnMessage = vi.fn((type, callback) => {
      if (type === 'FileChange') {
        callback({ type: 'FileChange', worktreeId: 'worktree-1', path: 'file1.ts', changeType: 'deleted' })
      }
      return vi.fn()
    })
    
    mockWsClient.mockReturnValue({
      onMessage: mockOnMessage,
      send: vi.fn(),
    })
    
    render(<AllFilesTab />)
    
    await waitFor(() => {
      expect(screen.queryByText('file1.ts')).not.toBeInTheDocument()
    })
  })
})