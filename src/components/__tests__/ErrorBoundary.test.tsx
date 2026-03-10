import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { ErrorBoundary } from '../ErrorBoundary';

const ThrowError = ({ shouldThrow }: { shouldThrow: boolean }) => {
  if (shouldThrow) {
    throw new Error('Test error message');
  }
  return <div data-testid="child-component">Child component</div>;
};

const ThrowCustomError = ({ shouldThrow }: { shouldThrow: boolean }) => {
  if (shouldThrow) {
    const error = new Error('Custom error with details');
    error.name = 'CustomError';
    throw error;
  }
  return <div data-testid="custom-child">Custom child</div>;
};

describe('ErrorBoundary', () => {
  const originalConsoleError = console.error;
  const originalLocation = window.location;

  beforeEach(() => {
    console.error = vi.fn();
  });

  afterEach(() => {
    console.error = originalConsoleError;
    Object.defineProperty(window, 'location', {
      writable: true,
      value: originalLocation,
    });
  });

  describe('Normal Rendering', () => {
    it('should render children when no error occurs', () => {
      render(
        <ErrorBoundary>
          <div data-testid="normal-child">Normal content</div>
        </ErrorBoundary>
      );

      expect(screen.getByTestId('normal-child')).toBeInTheDocument();
      expect(screen.getByText('Normal content')).toBeInTheDocument();
    });

    it('should render multiple children', () => {
      render(
        <ErrorBoundary>
          <div data-testid="child-1">First child</div>
          <div data-testid="child-2">Second child</div>
        </ErrorBoundary>
      );

      expect(screen.getByTestId('child-1')).toBeInTheDocument();
      expect(screen.getByTestId('child-2')).toBeInTheDocument();
    });
  });

  describe('Error Catching', () => {
    it('should catch errors thrown by child components', () => {
      render(
        <ErrorBoundary>
          <ThrowError shouldThrow={true} />
        </ErrorBoundary>
      );

      expect(screen.getByText('Something went wrong')).toBeInTheDocument();
      expect(screen.getByText('An unexpected error occurred. You can try reloading the page to recover.')).toBeInTheDocument();
    });

    it('should catch custom error types', () => {
      render(
        <ErrorBoundary>
          <ThrowCustomError shouldThrow={true} />
        </ErrorBoundary>
      );

      expect(screen.getByText('Something went wrong')).toBeInTheDocument();
    });

    it('should not render children after error is caught', () => {
      const { container } = render(
        <ErrorBoundary>
          <ThrowError shouldThrow={true} />
        </ErrorBoundary>
      );

      expect(container.querySelector('[data-testid="child-component"]')).not.toBeInTheDocument();
    });
  });

  describe('Fallback Rendering', () => {
    it('should display error icon', () => {
      render(
        <ErrorBoundary>
          <ThrowError shouldThrow={true} />
        </ErrorBoundary>
      );

      expect(screen.getByText('⚠️')).toBeInTheDocument();
    });

    it('should display error heading', () => {
      render(
        <ErrorBoundary>
          <ThrowError shouldThrow={true} />
        </ErrorBoundary>
      );

      const heading = screen.getByRole('heading', { name: 'Something went wrong' });
      expect(heading).toBeInTheDocument();
    });

    it('should display error description', () => {
      render(
        <ErrorBoundary>
          <ThrowError shouldThrow={true} />
        </ErrorBoundary>
      );

      expect(screen.getByText(/An unexpected error occurred/)).toBeInTheDocument();
    });

    it('should display reload button', () => {
      render(
        <ErrorBoundary>
          <ThrowError shouldThrow={true} />
        </ErrorBoundary>
      );

      const button = screen.getByRole('button', { name: 'Try again' });
      expect(button).toBeInTheDocument();
    });
  });

  describe('Development Mode Behavior', () => {
    it('should show error details in development mode', () => {
      render(
        <ErrorBoundary>
          <ThrowError shouldThrow={true} />
        </ErrorBoundary>
      );

      expect(screen.getByText('Error details (development mode)')).toBeInTheDocument();
    });
  });

  describe('Reload Functionality', () => {
    it('should call window.location.reload when Try again button is clicked', () => {
      const mockReload = vi.fn();
      Object.defineProperty(window, 'location', {
        writable: true,
        value: { reload: mockReload },
      });

      render(
        <ErrorBoundary>
          <ThrowError shouldThrow={true} />
        </ErrorBoundary>
      );

      const button = screen.getByRole('button', { name: 'Try again' });
      fireEvent.click(button);

      expect(mockReload).toHaveBeenCalledTimes(1);
    });

    it('should have hover effect styles on button', () => {
      render(
        <ErrorBoundary>
          <ThrowError shouldThrow={true} />
        </ErrorBoundary>
      );

      const button = screen.getByRole('button', { name: 'Try again' });
      expect(button).toBeInTheDocument();

      fireEvent.mouseEnter(button);
      fireEvent.mouseLeave(button);

      expect(button).toBeInTheDocument();
    });
  });

  describe('Error Logging', () => {
    it('should log errors in development mode', () => {
      render(
        <ErrorBoundary>
          <ThrowError shouldThrow={true} />
        </ErrorBoundary>
      );

      expect(console.error).toHaveBeenCalled();
    });

    it('should log error with correct prefix in development mode', () => {
      render(
        <ErrorBoundary>
          <ThrowError shouldThrow={true} />
        </ErrorBoundary>
      );

      const calls = (console.error as ReturnType<typeof vi.fn>).mock.calls;
      const hasErrorBoundaryLog = calls.some(call =>
        typeof call[0] === 'string' && call[0].includes('[ErrorBoundary]')
      );
      expect(hasErrorBoundaryLog).toBe(true);
    });
  });

  describe('Error State Recovery', () => {
    it('should maintain error state after initial error', () => {
      const { rerender } = render(
        <ErrorBoundary>
          <ThrowError shouldThrow={true} />
        </ErrorBoundary>
      );

      expect(screen.getByText('Something went wrong')).toBeInTheDocument();

      rerender(
        <ErrorBoundary>
          <ThrowError shouldThrow={false} />
        </ErrorBoundary>
      );

      expect(screen.getByText('Something went wrong')).toBeInTheDocument();
    });
  });

  describe('Styling', () => {
    it('should render with correct container structure', () => {
      const { container } = render(
        <ErrorBoundary>
          <ThrowError shouldThrow={true} />
        </ErrorBoundary>
      );

      expect(container.querySelector('div')).toBeInTheDocument();
    });

    it('should render error details with correct structure in DEV mode', () => {
      render(
        <ErrorBoundary>
          <ThrowError shouldThrow={true} />
        </ErrorBoundary>
      );

      const details = screen.getByText('Error details (development mode)').closest('details');
      expect(details).toBeInTheDocument();

      const pre = details?.querySelector('pre');
      expect(pre).toBeInTheDocument();
    });
  });
});
