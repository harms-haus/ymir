import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { AllFilesTab } from '../AllFilesTab'
import { useStore, selectActiveWorktree } from '../../../store'
import { getWebSocketClient } from '../../../lib/ws'

const mockStore = {
  workspaces: [],
  worktrees: [],
  agentSessions: [],
  terminalSessions: [],
  notifications: [],
  activeWorktreeId: null as string | null,
  connectionStatus: 'open' as const,
  connectionError: null,
  agentTabs: new Map(),
  activeAgentTabId: new Map(),
  prDialog: { isOpen: false, title: '', body: '' },
  setWorkspaces: vi.fn(),
  setWorktrees: vi.fn(),
  setAgentSessions: vi.fn(),
  setTerminalSessions: vi.fn(),
  setActiveWorktree: vi.fn(),
  setConnectionStatus: vi.fn(),
  setConnectionError: vi.fn(),
  stateFromSnapshot: vi.fn(),
  addWorkspace: vi.fn(),
  updateWorkspace: vi.fn(),
  removeWorkspace: vi.fn(),
  addWorktree: vi.fn(),
  updateWorktree: vi.fn(),
  removeWorktree: vi.fn(),
  addAgentSession: vi.fn(),
  updateAgentSession: vi.fn(),
  removeAgentSession: vi.fn(),
  addTerminalSession: vi.fn(),
  removeTerminalSession: vi.fn(),
  addNotification: vi.fn(),
  removeNotification: vi.fn(),
  clearNotifications: vi.fn(),
  addAgentTab: vi.fn(),
  removeAgentTab: vi.fn(),
  setActiveAgentTab: vi.fn(),
  updateAgentTab: vi.fn(),
  setPRDialogOpen: vi.fn(),
  setPRDialogTitle: vi.fn(),
  setPRDialogBody: vi.fn(),
  resetPRDialog: vi.fn(),
}

vi.mock('../../../store', () => ({
  useStore: vi.fn((selector) => {
    if (typeof selector === 'function') {
      return selector(mockStore)
    }
    return mockStore
  }),
  selectActiveWorktree: vi.fn(() => null),
}))

vi.mock('../../../lib/ws', () => ({
  getWebSocketClient: vi.fn(() => ({
    onMessage: vi.fn(() => vi.fn()),
    send: vi.fn(),
  })),
}))

describe('AllFilesTab', () => {
  const mockSelectActiveWorktree = selectActiveWorktree as unknown as ReturnType<typeof vi.fn>
  const mockWsClient = getWebSocketClient as unknown as ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should show no worktree message when no active worktree', () => {
    mockSelectActiveWorktree.mockReturnValue(null)
    
    render(<AllFilesTab />)
    
    expect(screen.getByText('No worktree selected')).toBeInTheDocument()
  })

  it('should show no files message when no files', async () => {
    mockSelectActiveWorktree.mockReturnValue({
      id: 'worktree-1',
      status: 'active',
      branchName: 'main',
      path: '/path/to/worktree',
      workspaceId: 'workspace-1',
    })
    
    const mockOnMessage = vi.fn(() => vi.fn())
    
    mockWsClient.mockReturnValue({
      onMessage: mockOnMessage,
      send: vi.fn(),
    })
    
    render(<AllFilesTab />)
    
    await waitFor(() => {
      expect(screen.getByText('No files found')).toBeInTheDocument()
    })
  })

  it('should display files in tree structure', async () => {
    mockSelectActiveWorktree.mockReturnValue({
      id: 'worktree-1',
      status: 'active',
      branchName: 'main',
      path: '/path/to/worktree',
      workspaceId: 'workspace-1',
    })
    
    const mockOnMessage = vi.fn((type, callback) => {
      if (type === 'FileListResult') {
        callback({ type: 'FileListResult', worktreeId: 'worktree-1', files: ['src/file1.ts'] })
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
      expect(screen.getByText('file1.ts')).toBeInTheDocument()
    })
  })

  it('should expand and collapse directories', async () => {
    mockSelectActiveWorktree.mockReturnValue({
      id: 'worktree-1',
      status: 'active',
      branchName: 'main',
      path: '/path/to/worktree',
      workspaceId: 'workspace-1',
    })
    
    const mockOnMessage = vi.fn((type, callback) => {
      if (type === 'FileListResult') {
        callback({ type: 'FileListResult', worktreeId: 'worktree-1', files: ['src/components/Button.tsx'] })
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
    mockSelectActiveWorktree.mockReturnValue({
      id: 'worktree-1',
      status: 'active',
      branchName: 'main',
      path: '/path/to/worktree',
      workspaceId: 'workspace-1',
    })
    
    const mockOnMessage = vi.fn((type, callback) => {
      if (type === 'FileListResult') {
        callback({ type: 'FileListResult', worktreeId: 'worktree-1', files: ['new-file.ts'] })
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
    mockSelectActiveWorktree.mockReturnValue({
      id: 'worktree-1',
      status: 'active',
      branchName: 'main',
      path: '/path/to/worktree',
      workspaceId: 'workspace-1',
    })
    
    const mockOnMessage = vi.fn((type, callback) => {
      if (type === 'FileListResult') {
        callback({ type: 'FileListResult', worktreeId: 'worktree-1', files: [] })
      }
      return vi.fn()
    })
    
    mockWsClient.mockReturnValue({
      onMessage: mockOnMessage,
      send: vi.fn(),
    })
    
    render(<AllFilesTab />)
    
    await waitFor(() => {
      expect(screen.getByText('No files found')).toBeInTheDocument()
    })
  })
})