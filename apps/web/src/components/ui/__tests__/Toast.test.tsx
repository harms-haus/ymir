import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { Toast } from '../Toast';

describe('Toast', () => {
  it('renders error toast with correct styling', () => {
    render(<Toast variant="error" title="Error message" onClose={vi.fn()} />);
    
    expect(screen.getByText('Error message')).toBeInTheDocument();
  });

  it('renders success toast with correct styling', () => {
    render(<Toast variant="success" title="Success message" onClose={vi.fn()} />);
    
    expect(screen.getByText('Success message')).toBeInTheDocument();
  });

  it('renders info toast with correct styling', () => {
    render(<Toast variant="info" title="Info message" onClose={vi.fn()} />);
    
    expect(screen.getByText('Info message')).toBeInTheDocument();
  });

  it('renders description when provided', () => {
    render(
      <Toast variant="error" title="Error" description="Something went wrong" onClose={vi.fn()} />
    );
    
    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
  });

  it('calls onClose when close button is clicked', async () => {
    const handleClose = vi.fn();
    render(<Toast variant="error" title="Error" onClose={handleClose} />);
    
    const closeButton = screen.getByRole('button');
    fireEvent.click(closeButton);
    
    await waitFor(() => {
      expect(handleClose).toHaveBeenCalled();
    }, { timeout: 1000 });
  });

  it('auto-dismisses after default duration (error: 5000ms)', () => {
    vi.useFakeTimers();
    const handleClose = vi.fn();
    render(<Toast variant="error" title="Error" onClose={handleClose} />);
    
    vi.advanceTimersByTime(5300);
    expect(handleClose).toHaveBeenCalled();
    
    vi.useRealTimers();
  });

  it('auto-dismisses after custom duration', () => {
    vi.useFakeTimers();
    const handleClose = vi.fn();
    render(
      <Toast variant="success" title="Success" onClose={handleClose} duration={2000} />
    );
    
    vi.advanceTimersByTime(2300);
    expect(handleClose).toHaveBeenCalled();
    
    vi.useRealTimers();
  });

  it('uses default duration for success/info toasts (3000ms)', () => {
    vi.useFakeTimers();
    const handleClose = vi.fn();
    render(<Toast variant="success" title="Success" onClose={handleClose} />);
    
    vi.advanceTimersByTime(3300);
    expect(handleClose).toHaveBeenCalled();
    
    vi.useRealTimers();
  });
});
