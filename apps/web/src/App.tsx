import { useEffect, useRef } from 'react'
import { AppShell } from './components/layout/AppShell'
import { getWebSocketClient, loadWorktreeDetails } from './lib/ws'
import { useStore } from './store'
import { useUIStore } from './uiStore'

function App() {
  const pendingWorktreeIdsRef = useRef<Set<string>>(new Set())

  useEffect(() => {
    const client = getWebSocketClient()
    const unsubscribe = client.onStatusChange((status) => {
      useStore.getState().setConnectionStatus(status)
    })
    return unsubscribe
  }, [])

  useEffect(() => {
    const client = getWebSocketClient()
    
    const unsubscribeSnapshot = client.onMessage('StateSnapshot', () => {
      const savedWorktreeId = useUIStore.getState().activeWorktreeId
      const savedExpandedIds = useUIStore.getState().expandedWorkspaceIds
      
      if (savedExpandedIds.length > 0) {
        const { expandedWorkspaceIds } = useStore.getState()
        const currentIds = new Set(expandedWorkspaceIds)
        for (const id of savedExpandedIds) {
          currentIds.add(id)
          loadWorktreeDetails(id).catch(console.error)
        }
        useStore.setState({ expandedWorkspaceIds: currentIds })
      }
      
      if (savedWorktreeId) {
        pendingWorktreeIdsRef.current.add(savedWorktreeId)
        const { worktrees } = useStore.getState()
        const worktreeExists = worktrees.some(wt => wt.id === savedWorktreeId)
        if (worktreeExists) {
          useStore.getState().setActiveWorktree(savedWorktreeId)
        }
      }
    })

    const unsubscribeDetails = client.onMessage('WorktreeDetailsResult', (message) => {
      const savedWorktreeId = useUIStore.getState().activeWorktreeId
      if (!savedWorktreeId) return
      if (pendingWorktreeIdsRef.current.has(savedWorktreeId)) {
        for (const worktree of message.worktrees) {
          if (worktree.id === savedWorktreeId) {
            useStore.getState().setActiveWorktree(savedWorktreeId)
            pendingWorktreeIdsRef.current.delete(savedWorktreeId)
            break
          }
        }
      }
    })
    
    return () => {
      unsubscribeSnapshot()
      unsubscribeDetails()
    }
  }, [])

  return <AppShell />
}

export default App
