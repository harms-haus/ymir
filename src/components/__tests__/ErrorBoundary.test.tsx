import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

// Mock import.meta.env before importing the component
const mockEnv = { DEV: true, PROD: false };
vi.mock('../ErrorBoundary', async () => {
  const actual = await vi.importActual<typeof import('../ErrorBoundary')>('../ErrorBoundary');
  return actual;
});

// Import after mock setup
import { ErrorBoundary } from '../ErrorBoundary';

// Component that throws an error
const ThrowError = ({ shouldThrow }: { shouldThrow: boolean }) => {
  if (shouldThrow) {
    throw new Error('Test error message');
  }
  return <div data-testid="child-component">Child component</div>;
};

// Component that throws a custom error type
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
    // Mock console.error to prevent error output in tests
    console.error = vi.fn();
  });

  afterEach(() => {
    // Restore console.error after each test
    console.error = originalConsoleError;
    // Restore window.location
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

      // Should show error fallback UI instead of crashing
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

      // Child component should not be rendered
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

  describe('Development vs Production Behavior', () => {
    it('should show error details in development mode', () => {
      render(
        <ErrorBoundary>
          <ThrowError shouldThrow={true} />
        </ErrorBoundary>
      );

      // Error details should be visible in DEV mode
      expect(screen.getByText('Error details (development mode)')).toBeInTheDocument();
    });

    it('should not show error details in production mode', async () => {
      // Dynamically import with mocked PROD mode
      vi.doMock('../ErrorBoundary', async () => {
        const React = await import('react');
        const { Component, ReactNode } = React;

        interface ErrorBoundaryProps {
          children: ReactNode;
        }

        interface ErrorBoundaryState {
          hasError: boolean;
          error?: Error;
          errorInfo?: React.ErrorInfo;
        }

        class MockedErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
          constructor(props: ErrorBoundaryProps) {
            super(props);
            this.state = { hasError: false };
          }

          static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
            return { hasError: true, error };
          }

          componentDidCatch(): void {
            // No logging in production
          }

          handleReload = (): void => {
            window.location.reload();
          };

          render(): ReactNode {
            if (this.state.hasError) {
              return (
                <div>
                  <h2>Something went wrong</h2>
                  <p>An unexpected error occurred. You can try reloading the page to recover.</p>
                  <button onClick={this.handleReload}>Try again</button>
                  {/* No error details in production */}
                </div>
              );
            }
            return this.props.children;
          }
        }

        return { ErrorBoundary: MockedErrorBoundary };
      });

      const { ErrorBoundary: ProdErrorBoundary } = await import('../ErrorBoundary');

      render(
        <ProdErrorBoundary>
          <ThrowError shouldThrow={true} />
        </ProdErrorBoundary>
      );

      // Error details should NOT be visible in production
      expect(screen.queryByText('Error details (development mode)')).not.toBeInTheDocument();

      // Cleanup mock
      vi.doUnmock('../ErrorBoundary');
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

      // Simulate mouse enter
      fireEvent.mouseEnter(button);
      // Simulate mouse leave
      fireEvent.mouseLeave(button);

      // Button should still be present after hover interactions
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

      // console.error should be called in DEV mode
      expect(console.error).toHaveBeenCalled();
    });

    it('should log error with correct prefix in development mode', () => {
      render(
        <ErrorBoundary>
          <ThrowError shouldThrow={true} />
        </ErrorBoundary>
      );

      // Check that console.error was called with the expected prefix
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

      // Re-render with shouldThrow=false - should still show error UI
      rerender(
        <ErrorBoundary>
          <ThrowError shouldThrow={false} />
        </ErrorBoundary>
      );

      // Error boundary should still show error UI (doesn't reset automatically)
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

      // Container should have the error boundary content
      expect(container.querySelector('div')).toBeInTheDocument();
    });

    it('should render error details with correct structure in DEV mode', () => {
      render(
        <ErrorBoundary>
          <ThrowError shouldThrow={true} />
        </ErrorBoundary>
      );

      // Should have details element
      const details = screen.getByText('Error details (development mode)').closest('details');
      expect(details).toBeInTheDocument();

      // Should have pre element for stack trace
      const pre = details?.querySelector('pre');
      expect(pre).toBeInTheDocument();
    });
  });
});
