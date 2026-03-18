import { useStore } from '../../store'

export function StatusBar() {
  const connectionStatus = useStore((state) => state.connectionStatus)

  const getStatusConfig = () => {
    switch (connectionStatus) {
      case 'open':
        return {
          dotColor: 'hsl(var(--status-working))',
          text: 'Online',
          icon: '●',
        }
      case 'closed':
        return {
          dotColor: 'hsl(var(--status-idle))',
          text: 'Offline',
          icon: '●',
        }
      case 'reconnecting':
        return {
          dotColor: 'hsl(var(--status-waiting))',
          text: 'Reconnecting...',
          icon: '⟳',
        }
      case 'connecting':
        return {
          dotColor: 'hsl(var(--status-waiting))',
          text: 'Connecting...',
          icon: '⟳',
        }
    }
  }

  const config = getStatusConfig()
  const isSpinning = connectionStatus === 'connecting' || connectionStatus === 'reconnecting'

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        height: '24px',
        backgroundColor: 'hsl(var(--muted))',
        borderTop: '1px solid hsl(var(--border))',
        padding: '0 8px',
        fontSize: '11px',
        color: 'hsl(var(--muted-foreground))',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
        }}
      >
        <span
          style={{
            color: config.dotColor,
            animation: isSpinning ? 'spin 1s linear infinite' : 'none',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {config.icon}
        </span>
        <span>{config.text}</span>
      </div>
    </div>
  )
}
