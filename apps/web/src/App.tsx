import { useEffect } from 'react'
import { AppShell } from './components/layout/AppShell'
import { getWebSocketClient } from './lib/ws'
import { useStore } from './store'

function App() {
  useEffect(() => {
    const client = getWebSocketClient()
    const unsubscribe = client.onStatusChange((status) => {
      useStore.getState().setConnectionStatus(status)
    })
    return unsubscribe
  }, [])

  return <AppShell />
}

export default App
