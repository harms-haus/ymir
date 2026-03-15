import { useEffect, useRef, useState } from 'react'

const WS_PORT = 7319

type Message = {
  type: string
  payload?: unknown
}

function App() {
  const [status, setStatus] = useState<'connecting' | 'open' | 'closed'>('connecting')
  const [messages, setMessages] = useState<Message[]>([])
  const ws = useRef<WebSocket | null>(null)

  useEffect(() => {
    const socket = new WebSocket(`ws://localhost:${WS_PORT}`)
    ws.current = socket

    socket.onopen = () => setStatus('open')
    socket.onclose = () => setStatus('closed')
    socket.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data) as Message
        setMessages((prev) => [...prev, msg])
      } catch {
        setMessages((prev) => [...prev, { type: 'raw', payload: event.data }])
      }
    }

    return () => socket.close()
  }, [])

  return (
    <div style={{ fontFamily: 'system-ui, sans-serif', padding: '2rem' }}>
      <h1>ymir</h1>
      <p>
        ws status:{' '}
        <span style={{ color: status === 'open' ? '#4ade80' : '#f87171' }}>{status}</span>
      </p>
      <p>messages received: {messages.length}</p>
    </div>
  )
}

export default App
