import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { Toolbar } from '../Toolbar'

describe('Toolbar', () => {
  it('should render PR and Merge buttons', () => {
    const onPRClick = vi.fn()
    
    render(<Toolbar onPRClick={onPRClick} canCreatePR={true} />)
    
    expect(screen.getByText('PR')).toBeInTheDocument()
    expect(screen.getByText('Merge')).toBeInTheDocument()
  })

  it('should enable PR button when canCreatePR is true', () => {
    const onPRClick = vi.fn()
    
    render(<Toolbar onPRClick={onPRClick} canCreatePR={true} />)
    
    const prButton = screen.getByText('PR').closest('button')
    expect(prButton).not.toBeDisabled()
    expect(prButton).toHaveStyle({ backgroundColor: 'hsl(var(--primary))' })
  })

  it('should disable PR button when canCreatePR is false', () => {
    const onPRClick = vi.fn()
    
    render(<Toolbar onPRClick={onPRClick} canCreatePR={false} />)
    
    const prButton = screen.getByText('PR').closest('button')
    expect(prButton).toBeDisabled()
    expect(prButton).toHaveStyle({ backgroundColor: 'hsl(var(--muted))' })
  })

  it('should call onPRClick when PR button is clicked', () => {
    const onPRClick = vi.fn()
    
    render(<Toolbar onPRClick={onPRClick} canCreatePR={true} />)
    
    const prButton = screen.getByText('PR').closest('button')
    fireEvent.click(prButton!)
    
    expect(onPRClick).toHaveBeenCalledTimes(1)
  })

  it('should open merge dropdown when Merge button is clicked', () => {
    const onPRClick = vi.fn()
    
    render(<Toolbar onPRClick={onPRClick} canCreatePR={true} />)
    
    const mergeButton = screen.getByText('Merge').closest('button')
    fireEvent.click(mergeButton!)
    
    expect(screen.getByText('Merge without squash')).toBeInTheDocument()
    expect(screen.getByText('Squash and merge')).toBeInTheDocument()
  })

  it('should show merge options when dropdown is open', () => {
    const onPRClick = vi.fn()
    
    render(<Toolbar onPRClick={onPRClick} canCreatePR={true} />)
    
    const mergeButton = screen.getByText('Merge').closest('button')
    fireEvent.click(mergeButton!)
    
    expect(screen.getByText('Merge without squash')).toBeInTheDocument()
    expect(screen.getByText('Squash and merge')).toBeInTheDocument()
  })
})