import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ChangesTab } from '../ChangesTab'
import { useStore } from '../../../store'
import { getWebSocketClient } from '../../../lib/ws'

vi.mock('../../../store')
vi.mock('../../../lib/ws', () => ({
  getWebSocketClient: vi.fn(),
}))

describe('ChangesTab', () => {
  const mockStoreState = {
    activeWorktreeId: null,
    worktrees: [],
    addAgentTab: vi.fn(),
    setActiveAgentTab: vi.fn(),
  }

  beforeEach(() => {
    vi.clearAllMocks()
    ;(getWebSocketClient as any).mockReturnValue({
      onMessage: vi.fn(() => vi.fn()),
      send: vi.fn(),
    })
    ;(useStore as any).mockImplementation((selector?: any) => {
      if (typeof selector === 'function') {
        return selector(mockStoreState)
      }
      return mockStoreState
    })
  })

  it('should show no worktree message when no active worktree', () => {
    render(<ChangesTab />)

    expect(screen.getByText('No worktree selected')).toBeInTheDocument()
  })
})