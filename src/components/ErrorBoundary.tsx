import React, { Component, ReactNode } from 'react';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error?: Error;
  errorInfo?: React.ErrorInfo;
}

/**
 * ErrorBoundary component to catch React errors and display user-friendly fallback UI.
 * Logs errors in development mode for debugging.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    // Log error in development mode for debugging
    if (import.meta.env.DEV) {
      console.error('[ErrorBoundary] Component error caught:', { error, errorInfo });
    }
  }

  handleReload = (): void => {
    window.location.reload();
  };

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100vh',
            backgroundColor: '#1e1e1e',
            color: '#cccccc',
            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
            fontSize: '14px',
            padding: '20px',
          }}
        >
          <div
            style={{
              textAlign: 'center',
              maxWidth: '600px',
            }}
          >
            <div
              style={{
                fontSize: '48px',
                marginBottom: '16px',
                color: '#007acc',
              }}
            >
              ⚠️
            </div>

            <h2
              style={{
                fontSize: '24px',
                fontWeight: 600,
                color: '#ffffff',
                marginBottom: '12px',
              }}
            >
              Something went wrong
            </h2>

            <p
              style={{
                fontSize: '14px',
                color: '#666666',
                marginBottom: '24px',
                lineHeight: '1.5',
              }}
            >
              An unexpected error occurred. You can try reloading the page to recover.
            </p>

            <button
              onClick={this.handleReload}
              style={{
                backgroundColor: '#007acc',
                color: '#ffffff',
                border: 'none',
                padding: '10px 20px',
                borderRadius: '4px',
                fontSize: '14px',
                cursor: 'pointer',
                transition: 'background-color 0.15s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = '#005a9e';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = '#007acc';
              }}
            >
              Try again
            </button>

            {import.meta.env.DEV && this.state.error && (
              <details
                style={{
                  marginTop: '32px',
                  textAlign: 'left',
                  backgroundColor: '#252526',
                  padding: '16px',
                  borderRadius: '4px',
                  border: '1px solid #333',
                }}
              >
                <summary
                  style={{
                    cursor: 'pointer',
                    fontSize: '12px',
                    fontWeight: 600,
                    color: '#4fc3f7',
                    marginBottom: '8px',
                  }}
                >
                  Error details (development mode)
                </summary>
                <pre
                  style={{
                    fontSize: '11px',
                    color: '#666666',
                    overflow: 'auto',
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                  }}
                >
                  {this.state.error.toString()}
                  {this.state.errorInfo && (
                    <>
                      {'\n\nComponent Stack:\n'}
                      {this.state.errorInfo.componentStack}
                    </>
                  )}
                </pre>
              </details>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
