import { useState } from 'react'

export type StatusDotStatus = 'working' | 'waiting' | 'idle'

interface StatusDotProps {
  status: StatusDotStatus
  size?: number
}

const statusConfig = {
  working: {
    color: 'hsl(var(--status-working))',
    animation: 'status-flash 0.5s ease-in-out infinite',
    label: 'Working',
  },
  waiting: {
    color: 'hsl(var(--status-waiting))',
    animation: 'status-pulse 2s ease-in-out infinite',
    label: 'Waiting',
  },
  idle: {
    color: 'hsl(var(--status-idle))',
    animation: 'none',
    label: 'Idle',
  },
}

export function StatusDot({ status, size = 8 }: StatusDotProps) {
  const [showTooltip, setShowTooltip] = useState(false)
  const config = statusConfig[status]

  return (
    <span
      role="img"
      aria-label={config.label}
      style={{
        position: 'relative',
        display: 'inline-flex',
        padding: 0,
        margin: 0,
      }}
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
    >
      <span
        style={{
          width: size,
          height: size,
          borderRadius: '50%',
          backgroundColor: config.color,
          display: 'inline-block',
          animation: config.animation,
          flexShrink: 0,
        }}
      />
      {showTooltip && (
        <span
          role="tooltip"
          style={{
            position: 'absolute',
            bottom: '100%',
            left: '50%',
            transform: 'translateX(-50%)',
            marginBottom: '4px',
            padding: '4px 8px',
            backgroundColor: 'hsl(var(--popover))',
            color: 'hsl(var(--popover-foreground))',
            fontSize: '12px',
            borderRadius: '4px',
            whiteSpace: 'nowrap',
            zIndex: 100,
            boxShadow: '0 2px 8px rgba(0, 0, 0, 0.15)',
            border: '1px solid hsl(var(--border))',
          }}
        >
          {config.label}
        </span>
      )}
    </span>
  )
}
