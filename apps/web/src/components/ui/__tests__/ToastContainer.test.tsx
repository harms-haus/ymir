import { render, screen } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ToastContainer } from '../ToastContainer';
import { useToastStore } from '../../../store';

describe('ToastContainer', () => {
  beforeEach(() => {
    useToastStore.setState({ notifications: [] });
  });

  it('renders no toasts when store is empty', () => {
    render(<ToastContainer />);
    
    const container = document.querySelector('[style*="position: fixed"]');
    expect(container).toBeInTheDocument();
    expect(screen.queryByText(/Error|Success|Info/)).not.toBeInTheDocument();
  });

  it('renders toast from store', () => {
    useToastStore.setState({
      notifications: [
        { id: '1', variant: 'error', title: 'Test Error' }
      ]
    });
    
    render(<ToastContainer />);
    
    expect(screen.getByText('Test Error')).toBeInTheDocument();
  });

  it('renders multiple toasts', () => {
    useToastStore.setState({
      notifications: [
        { id: '1', variant: 'error', title: 'Error 1' },
        { id: '2', variant: 'success', title: 'Success 1' },
        { id: '3', variant: 'info', title: 'Info 1' }
      ]
    });
    
    render(<ToastContainer />);
    
    expect(screen.getByText('Error 1')).toBeInTheDocument();
    expect(screen.getByText('Success 1')).toBeInTheDocument();
    expect(screen.getByText('Info 1')).toBeInTheDocument();
  });

  it('limits visible toasts to maximum 5', () => {
    useToastStore.setState({
      notifications: Array.from({ length: 7 }, (_, i) => ({
        id: String(i),
        variant: 'info' as const,
        title: `Toast ${i}`
      }))
    });
    
    render(<ToastContainer />);
    
    expect(screen.getByText('Toast 2')).toBeInTheDocument();
    expect(screen.getByText('Toast 6')).toBeInTheDocument();
    expect(screen.queryByText('Toast 0')).not.toBeInTheDocument();
    expect(screen.queryByText('Toast 1')).not.toBeInTheDocument();
  });

  it('removes toast from store when close button is clicked', async () => {
    vi.useFakeTimers();
    useToastStore.setState({
      notifications: [
        { id: '1', variant: 'error', title: 'Error' }
      ]
    });
    
    render(<ToastContainer />);
    
    const closeButton = screen.getByRole('button');
    closeButton.click();
    
    vi.advanceTimersByTime(300);
    
    expect(useToastStore.getState().notifications).toHaveLength(0);
    
    vi.useRealTimers();
  });
});
