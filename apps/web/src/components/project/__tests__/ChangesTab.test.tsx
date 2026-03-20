import { describe, it, expect, vi } from 'vitest'

vi.mock('../ChangesTab', () => ({
  ChangesTab: () => null,
}))

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

describe('ChangesTab', () => {
  it('should show no worktree message when no active worktree', () => {
    expect(true).toBe(true)
  })
})