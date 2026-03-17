import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { StatusDot } from '../StatusDot'

describe('StatusDot', () => {
  it('renders working status with green color', () => {
    render(<StatusDot status="working" />)
    const dot = screen.getByTitle('Working')
    expect(dot).toBeInTheDocument()
  })

  it('renders waiting status with yellow color', () => {
    render(<StatusDot status="waiting" />)
    const dot = screen.getByTitle('Waiting')
    expect(dot).toBeInTheDocument()
  })

  it('renders idle status with gray color', () => {
    render(<StatusDot status="idle" />)
    const dot = screen.getByTitle('Idle')
    expect(dot).toBeInTheDocument()
  })

  it('renders with custom size', () => {
    render(<StatusDot status="working" size={12} />)
    const dot = screen.getByTitle('Working')
    expect(dot).toBeInTheDocument()
  })
})
