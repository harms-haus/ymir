import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { StatusBar } from '../StatusBar'
import { useStore } from '../../../store'

// Mock the Zustand store
vi.mock('../../../store', () => ({
  useStore: vi.fn(),
}))

describe('StatusBar', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('connection status states', () => {
    it('displays Online status with green dot when connectionStatus is open', () => {
      vi.mocked(useStore).mockImplementation((selector) => selector({ connectionStatus: 'open' }))
      render(<StatusBar />)

      expect(screen.getByText('Online')).toBeInTheDocument()
      expect(screen.getByText('●')).toBeInTheDocument()
    })

    it('displays Offline status with gray dot when connectionStatus is closed', () => {
      vi.mocked(useStore).mockImplementation((selector) => selector({ connectionStatus: 'closed' }))
      render(<StatusBar />)

      expect(screen.getByText('Offline')).toBeInTheDocument()
      expect(screen.getByText('●')).toBeInTheDocument()
    })

    it('displays Reconnecting... with spinning amber dot when connectionStatus is reconnecting', () => {
      vi.mocked(useStore).mockImplementation((selector) => selector({ connectionStatus: 'reconnecting' }))
      render(<StatusBar />)

      expect(screen.getByText('Reconnecting...')).toBeInTheDocument()
      expect(screen.getByText('⟳')).toBeInTheDocument()
    })

    it('displays Connecting... with spinning amber dot when connectionStatus is connecting', () => {
      vi.mocked(useStore).mockImplementation((selector) => selector({ connectionStatus: 'connecting' }))
      render(<StatusBar />)

      expect(screen.getByText('Connecting...')).toBeInTheDocument()
      expect(screen.getByText('⟳')).toBeInTheDocument()
    })
  })

  describe('styling', () => {
    it('renders with correct container styles', () => {
      vi.mocked(useStore).mockImplementation((selector) => selector({ connectionStatus: 'open' }))
      const { container } = render(<StatusBar />)

      const statusBar = container.firstChild as HTMLElement
      expect(statusBar.style.display).toBe('flex')
      expect(statusBar.style.alignItems).toBe('center')
      expect(statusBar.style.height).toBe('24px')
      expect(statusBar.style.fontSize).toBe('11px')
    })

    it('applies spin animation to icon in connecting state', () => {
      vi.mocked(useStore).mockImplementation((selector) => selector({ connectionStatus: 'connecting' }))
      render(<StatusBar />)

      const icon = screen.getByText('⟳')
      expect(icon).toBeInTheDocument()
      expect(icon.style.animation).toBe('spin 1s linear infinite')
    })

    it('applies spin animation to icon in reconnecting state', () => {
      vi.mocked(useStore).mockImplementation((selector) => selector({ connectionStatus: 'reconnecting' }))
      render(<StatusBar />)

      const icon = screen.getByText('⟳')
      expect(icon).toBeInTheDocument()
      expect(icon.style.animation).toBe('spin 1s linear infinite')
    })

    it('does not apply spin animation in open state', () => {
      vi.mocked(useStore).mockImplementation((selector) => selector({ connectionStatus: 'open' }))
      render(<StatusBar />)

      const icon = screen.getByText('●')
      expect(icon).toBeInTheDocument()
      expect(icon.style.animation).toBe('none')
    })

    it('does not apply spin animation in closed state', () => {
      vi.mocked(useStore).mockImplementation((selector) => selector({ connectionStatus: 'closed' }))
      render(<StatusBar />)

      const icon = screen.getByText('●')
      expect(icon).toBeInTheDocument()
      expect(icon.style.animation).toBe('none')
    })

    it('applies correct color to dot for open status', () => {
      vi.mocked(useStore).mockImplementation((selector) => selector({ connectionStatus: 'open' }))
      render(<StatusBar />)

      const icon = screen.getByText('●')
      expect(icon).toBeInTheDocument()
      expect(icon.style.color).toBe('hsl(var(--status-working))')
    })

    it('applies correct color to dot for closed status', () => {
      vi.mocked(useStore).mockImplementation((selector) => selector({ connectionStatus: 'closed' }))
      render(<StatusBar />)

      const icon = screen.getByText('●')
      expect(icon).toBeInTheDocument()
      expect(icon.style.color).toBe('hsl(var(--status-idle))')
    })

    it('applies correct color to dot for connecting status', () => {
      vi.mocked(useStore).mockImplementation((selector) => selector({ connectionStatus: 'connecting' }))
      render(<StatusBar />)

      const icon = screen.getByText('⟳')
      expect(icon).toBeInTheDocument()
      expect(icon.style.color).toBe('hsl(var(--status-waiting))')
    })

    it('applies correct color to dot for reconnecting status', () => {
      vi.mocked(useStore).mockImplementation((selector) => selector({ connectionStatus: 'reconnecting' }))
      render(<StatusBar />)

      const icon = screen.getByText('⟳')
      expect(icon).toBeInTheDocument()
      expect(icon.style.color).toBe('hsl(var(--status-waiting))')
    })
  })

  describe('store integration', () => {
    it('subscribes to connectionStatus from store', () => {
      vi.mocked(useStore).mockImplementation((selector) => selector({ connectionStatus: 'open' }))
      render(<StatusBar />)

      expect(useStore).toHaveBeenCalledWith(expect.any(Function))
      const selector = vi.mocked(useStore).mock.calls[0][0]
      expect(selector({ connectionStatus: 'open' })).toBe('open')
    })
  })
})
