import { describe, it, expect, beforeEach } from 'vitest'
import { useStore, handleBridgeMessage, selectTerminalTabsByWorktreeId } from '../store'
import type { TerminalTabState } from '../types/state'

// Helper to reset store between tests
function resetTerminalTabs() {
  const state = useStore.getState()
  state.terminalTabs.forEach((tab) => {
    useStore.getState().removeTerminalTab(tab.id)
  })
}

describe('Terminal Tab Store Actions', () => {
  beforeEach(() => {
    resetTerminalTabs()
  })

  describe('addTerminalTab', () => {
    it('adds a new terminal tab to the store', () => {
      const tab: TerminalTabState = {
        id: 'tab-1',
        worktreeId: 'wt-1',
        label: 'Terminal 1',
        position: 0,
        activeSessionId: null,
        status: 'active',
        createdAt: Date.now(),
      }

      useStore.getState().addTerminalTab(tab)

      const tabs = useStore.getState().terminalTabs
      expect(tabs).toHaveLength(1)
      expect(tabs[0].id).toBe('tab-1')
      expect(tabs[0].worktreeId).toBe('wt-1')
      expect(tabs[0].label).toBe('Terminal 1')
    })

    it('appends to existing tabs', () => {
      const tab1: TerminalTabState = {
        id: 'tab-1',
        worktreeId: 'wt-1',
        label: 'Terminal 1',
        position: 0,
        activeSessionId: null,
        status: 'active',
        createdAt: Date.now(),
      }
      const tab2: TerminalTabState = {
        id: 'tab-2',
        worktreeId: 'wt-1',
        label: 'Terminal 2',
        position: 1,
        activeSessionId: null,
        status: 'active',
        createdAt: Date.now(),
      }

      useStore.getState().addTerminalTab(tab1)
      useStore.getState().addTerminalTab(tab2)

      const tabs = useStore.getState().terminalTabs
      expect(tabs).toHaveLength(2)
    })
  })

  describe('setTabSession', () => {
    it('links a PTY session to a tab and sets status to active', () => {
      const tab: TerminalTabState = {
        id: 'tab-1',
        worktreeId: 'wt-1',
        label: 'Terminal 1',
        position: 0,
        activeSessionId: null,
        status: 'disconnected',
        createdAt: Date.now(),
      }
      useStore.getState().addTerminalTab(tab)

      useStore.getState().setTabSession('tab-1', 'session-1')

      const tabs = useStore.getState().terminalTabs
      expect(tabs[0].activeSessionId).toBe('session-1')
      expect(tabs[0].status).toBe('active')
    })

    it('does not affect other tabs', () => {
      const tab1: TerminalTabState = {
        id: 'tab-1',
        worktreeId: 'wt-1',
        label: 'Terminal 1',
        position: 0,
        activeSessionId: null,
        status: 'disconnected',
        createdAt: Date.now(),
      }
      const tab2: TerminalTabState = {
        id: 'tab-2',
        worktreeId: 'wt-1',
        label: 'Terminal 2',
        position: 1,
        activeSessionId: null,
        status: 'disconnected',
        createdAt: Date.now(),
      }
      useStore.getState().addTerminalTab(tab1)
      useStore.getState().addTerminalTab(tab2)

      useStore.getState().setTabSession('tab-1', 'session-1')

      const tabs = useStore.getState().terminalTabs
      expect(tabs[0].activeSessionId).toBe('session-1')
      expect(tabs[0].status).toBe('active')
      expect(tabs[1].activeSessionId).toBeNull()
      expect(tabs[1].status).toBe('disconnected')
    })
  })

  describe('clearTabSession', () => {
    it('unlinks session from tab and sets status to disconnected', () => {
      const tab: TerminalTabState = {
        id: 'tab-1',
        worktreeId: 'wt-1',
        label: 'Terminal 1',
        position: 0,
        activeSessionId: 'session-1',
        status: 'active',
        createdAt: Date.now(),
      }
      useStore.getState().addTerminalTab(tab)

      useStore.getState().clearTabSession('tab-1')

      const tabs = useStore.getState().terminalTabs
      expect(tabs[0].activeSessionId).toBeNull()
      expect(tabs[0].status).toBe('disconnected')
    })
  })

  describe('removeTerminalTab', () => {
    it('removes a tab from the store', () => {
      const tab: TerminalTabState = {
        id: 'tab-1',
        worktreeId: 'wt-1',
        label: 'Terminal 1',
        position: 0,
        activeSessionId: 'session-1',
        status: 'active',
        createdAt: Date.now(),
      }
      useStore.getState().addTerminalTab(tab)

      useStore.getState().removeTerminalTab('tab-1')

      expect(useStore.getState().terminalTabs).toHaveLength(0)
    })

    it('removes only the specified tab', () => {
      const tab1: TerminalTabState = {
        id: 'tab-1',
        worktreeId: 'wt-1',
        label: 'Terminal 1',
        position: 0,
        activeSessionId: 'session-1',
        status: 'active',
        createdAt: Date.now(),
      }
      const tab2: TerminalTabState = {
        id: 'tab-2',
        worktreeId: 'wt-1',
        label: 'Terminal 2',
        position: 1,
        activeSessionId: 'session-2',
        status: 'active',
        createdAt: Date.now(),
      }
      useStore.getState().addTerminalTab(tab1)
      useStore.getState().addTerminalTab(tab2)

      useStore.getState().removeTerminalTab('tab-1')

      const tabs = useStore.getState().terminalTabs
      expect(tabs).toHaveLength(1)
      expect(tabs[0].id).toBe('tab-2')
    })
  })

  describe('updateTerminalTab', () => {
    it('updates tab fields', () => {
      const tab: TerminalTabState = {
        id: 'tab-1',
        worktreeId: 'wt-1',
        label: 'Terminal 1',
        position: 0,
        activeSessionId: null,
        status: 'active',
        createdAt: Date.now(),
      }
      useStore.getState().addTerminalTab(tab)

      useStore.getState().updateTerminalTab('tab-1', {
        label: 'Updated Label',
        position: 2,
      })

      const tabs = useStore.getState().terminalTabs
      expect(tabs[0].label).toBe('Updated Label')
      expect(tabs[0].position).toBe(2)
      expect(tabs[0].id).toBe('tab-1') // unchanged
    })
  })
})

describe('handleBridgeMessage - Terminal Events', () => {
  beforeEach(() => {
    resetTerminalTabs()
  })

  function createTerminalEvent(
    innerType: string,
    data: Record<string, unknown>
  ): any {
    return {
      type: 'terminal_event',
      message: {
        payload: {
          type: innerType,
          data,
        },
      },
    }
  }

  describe('TerminalMounted', () => {
    it('adds a new tab and sets the session', () => {
      handleBridgeMessage(
        createTerminalEvent('TerminalMounted', {
          tabId: 'tab-1',
          worktreeId: 'wt-1',
          sessionId: 'session-1',
          label: 'My Terminal',
          position: 0,
        })
      )

      const tabs = useStore.getState().terminalTabs
      expect(tabs).toHaveLength(1)
      expect(tabs[0].id).toBe('tab-1')
      expect(tabs[0].activeSessionId).toBe('session-1')
      expect(tabs[0].status).toBe('active')
      expect(tabs[0].label).toBe('My Terminal')
    })

    it('uses default label when not provided', () => {
      handleBridgeMessage(
        createTerminalEvent('TerminalMounted', {
          tabId: 'tab-1',
          worktreeId: 'wt-1',
          sessionId: 'session-1',
        })
      )

      const tabs = useStore.getState().terminalTabs
      expect(tabs[0].label).toBe('Terminal')
    })

    it('handles missing position with default 0', () => {
      handleBridgeMessage(
        createTerminalEvent('TerminalMounted', {
          tabId: 'tab-1',
          worktreeId: 'wt-1',
          sessionId: 'session-1',
        })
      )

      const tabs = useStore.getState().terminalTabs
      expect(tabs[0].position).toBe(0)
    })
  })

  describe('TerminalSessionEnded', () => {
    it('clears the session for the matching tab', () => {
      // First mount the tab
      handleBridgeMessage(
        createTerminalEvent('TerminalMounted', {
          tabId: 'tab-1',
          worktreeId: 'wt-1',
          sessionId: 'session-1',
          label: 'Terminal',
        })
      )

      // Then simulate session ended
      handleBridgeMessage(
        createTerminalEvent('TerminalSessionEnded', {
          tabId: 'tab-1',
          sessionId: 'session-1',
          reason: 'ttl',
        })
      )

      const tabs = useStore.getState().terminalTabs
      expect(tabs).toHaveLength(1)
      expect(tabs[0].activeSessionId).toBeNull()
      expect(tabs[0].status).toBe('disconnected')
    })
  })

  describe('TerminalTabClosed', () => {
    it('removes the tab from the store', () => {
      handleBridgeMessage(
        createTerminalEvent('TerminalMounted', {
          tabId: 'tab-1',
          worktreeId: 'wt-1',
          sessionId: 'session-1',
          label: 'Terminal',
        })
      )

      handleBridgeMessage(
        createTerminalEvent('TerminalTabClosed', {
          tabId: 'tab-1',
        })
      )

      expect(useStore.getState().terminalTabs).toHaveLength(0)
    })
  })

  describe('TerminalTabList', () => {
    it('replaces all tabs for a worktree with the new list', () => {
      // Add existing tabs
      useStore.getState().addTerminalTab({
        id: 'old-tab-1',
        worktreeId: 'wt-1',
        label: 'Old Tab 1',
        position: 0,
        activeSessionId: 'old-session-1',
        status: 'active',
        createdAt: Date.now(),
      })

      // Send tab list
      handleBridgeMessage(
        createTerminalEvent('TerminalTabList', {
          worktreeId: 'wt-1',
          tabs: [
            {
              id: 'new-tab-1',
              worktreeId: 'wt-1',
              label: 'New Tab 1',
              position: 0,
              activeSessionId: 'new-session-1',
              status: 'active',
              createdAt: Date.now(),
            },
            {
              id: 'new-tab-2',
              worktreeId: 'wt-1',
              label: 'New Tab 2',
              position: 1,
              activeSessionId: null,
              status: 'disconnected',
              createdAt: Date.now(),
            },
          ],
        })
      )

      const tabs = useStore.getState().terminalTabs
      expect(tabs).toHaveLength(2)
      expect(tabs[0].id).toBe('new-tab-1')
      expect(tabs[1].id).toBe('new-tab-2')
    })

    it('does not affect tabs for other worktrees', () => {
      useStore.getState().addTerminalTab({
        id: 'other-tab',
        worktreeId: 'wt-other',
        label: 'Other Worktree Tab',
        position: 0,
        activeSessionId: null,
        status: 'active',
        createdAt: Date.now(),
      })

      handleBridgeMessage(
        createTerminalEvent('TerminalTabList', {
          worktreeId: 'wt-1',
          tabs: [
            {
              id: 'wt1-tab',
              worktreeId: 'wt-1',
              label: 'WT1 Tab',
              position: 0,
              activeSessionId: null,
              status: 'active',
              createdAt: Date.now(),
            },
          ],
        })
      )

      const tabs = useStore.getState().terminalTabs
      expect(tabs).toHaveLength(2)
      expect(tabs.some((t) => t.id === 'other-tab')).toBe(true)
      expect(tabs.some((t) => t.id === 'wt1-tab')).toBe(true)
    })
  })

  describe('TerminalTabHistory', () => {
    it('does not modify terminal tabs (delivered via onMessage)', () => {
      handleBridgeMessage(
        createTerminalEvent('TerminalTabHistory', {
          tabId: 'tab-1',
          data: 'some history output',
        })
      )

      expect(useStore.getState().terminalTabs).toHaveLength(0)
    })
  })
})

describe('selectTerminalTabsByWorktreeId', () => {
  beforeEach(() => {
    resetTerminalTabs()
  })

  it('returns tabs filtered by worktreeId', () => {
    useStore.getState().addTerminalTab({
      id: 'tab-1',
      worktreeId: 'wt-1',
      label: 'Tab 1',
      position: 0,
      activeSessionId: null,
      status: 'active',
      createdAt: Date.now(),
    })
    useStore.getState().addTerminalTab({
      id: 'tab-2',
      worktreeId: 'wt-2',
      label: 'Tab 2',
      position: 0,
      activeSessionId: null,
      status: 'active',
      createdAt: Date.now(),
    })
    useStore.getState().addTerminalTab({
      id: 'tab-3',
      worktreeId: 'wt-1',
      label: 'Tab 3',
      position: 1,
      activeSessionId: null,
      status: 'active',
      createdAt: Date.now(),
    })

    const selector = selectTerminalTabsByWorktreeId('wt-1')
    const tabs = selector(useStore.getState())

    expect(tabs).toHaveLength(2)
    expect(tabs.map((t) => t.id)).toEqual(['tab-1', 'tab-3'])
  })

  it('returns tabs sorted by position', () => {
    useStore.getState().addTerminalTab({
      id: 'tab-1',
      worktreeId: 'wt-1',
      label: 'Tab 1',
      position: 2,
      activeSessionId: null,
      status: 'active',
      createdAt: Date.now(),
    })
    useStore.getState().addTerminalTab({
      id: 'tab-2',
      worktreeId: 'wt-1',
      label: 'Tab 2',
      position: 0,
      activeSessionId: null,
      status: 'active',
      createdAt: Date.now(),
    })
    useStore.getState().addTerminalTab({
      id: 'tab-3',
      worktreeId: 'wt-1',
      label: 'Tab 3',
      position: 1,
      activeSessionId: null,
      status: 'active',
      createdAt: Date.now(),
    })

    const selector = selectTerminalTabsByWorktreeId('wt-1')
    const tabs = selector(useStore.getState())

    expect(tabs.map((t) => t.id)).toEqual(['tab-2', 'tab-3', 'tab-1'])
  })

  it('returns empty array for worktree with no tabs', () => {
    const selector = selectTerminalTabsByWorktreeId('wt-nonexistent')
    const tabs = selector(useStore.getState())

    expect(tabs).toEqual([])
  })
})
