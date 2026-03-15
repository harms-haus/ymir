import { useEffect, useState } from 'react';

interface TerminalLoadingProps {
  tabId: string;
  maxRetries: number;
  currentAttempt: number;
  errors: string[];
  onRetry: () => void;
}

export function TerminalLoading({
  tabId,
  maxRetries,
  currentAttempt,
  errors,
  onRetry,
}: TerminalLoadingProps) {
  const [dots, setDots] = useState('');
  const hasFailed = currentAttempt >= maxRetries && errors.length > 0;

  useEffect(() => {
    if (hasFailed) return;
    const interval = setInterval(() => {
      setDots((prev) => (prev.length >= 3 ? '' : prev + '.'));
    }, 400);
    return () => clearInterval(interval);
  }, [hasFailed]);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        width: '100%',
        backgroundColor: 'var(--background-hex)',
        fontFamily: 'var(--font-family-mono)',
        padding: '24px',
        boxSizing: 'border-box',
      }}
    >
      <div
        style={{
          maxWidth: '480px',
          width: '100%',
          backgroundColor: 'var(--background-secondary)',
          borderRadius: 'var(--radius-lg)',
          border: '1px solid var(--border-secondary)',
          overflow: 'hidden',
          boxShadow: 'var(--shadow-md)',
        }}
      >
        {/* Title bar */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '10px 14px',
            backgroundColor: 'var(--background-tertiary)',
            borderBottom: '1px solid var(--border-secondary)',
          }}
        >
          <div
            style={{
              width: '12px',
              height: '12px',
              borderRadius: '50%',
              backgroundColor: hasFailed
                ? 'var(--destructive-hex)'
                : 'var(--status-modified)',
              opacity: hasFailed ? 1 : 0.8,
            }}
          />
          <span
            style={{
              fontSize: '11px',
              color: 'var(--foreground-secondary)',
              fontFamily: 'var(--font-family-mono)',
            }}
          >
            {tabId}
          </span>
        </div>

        <div style={{ padding: '20px' }}>
          {!hasFailed ? (
            <>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  marginBottom: '16px',
                }}
              >
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  role="img"
                  style={{
                    animation: 'terminal-loading-spin 1s linear infinite',
                  }}
                >
                  <title>Connecting to terminal</title>
                  <style>
                    {`@keyframes terminal-loading-spin {
                      from { transform: rotate(0deg); }
                      to { transform: rotate(360deg); }
                    }`}
                  </style>
                  <circle
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="var(--foreground-muted)"
                    strokeWidth="2"
                    fill="none"
                    strokeDasharray="32"
                    strokeDashoffset="8"
                  />
                </svg>
                <span
                  style={{
                    fontSize: '13px',
                    color: 'var(--foreground-hex)',
                  }}
                >
                  Connecting to terminal{dots}
                </span>
              </div>

              <div
                style={{
                  fontSize: '11px',
                  color: 'var(--foreground-muted)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <span>
                  Attempt {currentAttempt} of {maxRetries}
                </span>
                <div
                  style={{
                    width: '100px',
                    height: '4px',
                    backgroundColor: 'var(--background-tertiary)',
                    borderRadius: '2px',
                    overflow: 'hidden',
                  }}
                >
                  <div
                    style={{
                      width: `${(currentAttempt / maxRetries) * 100}%`,
                      height: '100%',
                      backgroundColor: 'var(--primary-hex)',
                      borderRadius: '2px',
                      transition: 'width 0.3s ease',
                    }}
                  />
                </div>
              </div>

              {errors.length > 0 && (
                <div
                  style={{
                    marginTop: '16px',
                    padding: '10px',
                    backgroundColor: 'var(--background-tertiary)',
                    borderRadius: 'var(--radius-sm)',
                    border: '1px solid var(--border-secondary)',
                  }}
                >
                  <div
                    style={{
                      fontSize: '11px',
                      color: 'var(--foreground-muted)',
                      marginBottom: '6px',
                    }}
                  >
                    Last error:
                  </div>
                  <pre
                    style={{
                      fontSize: '11px',
                      color: 'var(--destructive-alt)',
                      margin: 0,
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-word',
                      fontFamily: 'var(--font-family-mono)',
                    }}
                  >
                    {errors[errors.length - 1]}
                  </pre>
                </div>
              )}
            </>
          ) : (
            <>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  marginBottom: '12px',
                }}
              >
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="var(--destructive-hex)"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  role="img"
                >
                  <title>Connection failed</title>
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
                <span
                  style={{
                    fontSize: '14px',
                    fontWeight: 600,
                    color: 'var(--foreground-active)',
                  }}
                >
                  Connection Failed
                </span>
              </div>

              <p
                style={{
                  fontSize: '12px',
                  color: 'var(--foreground-secondary)',
                  marginBottom: '16px',
                  lineHeight: '1.5',
                }}
              >
                Could not connect to the terminal backend after{' '}
                {maxRetries} attempts. The ymir-server sidecar may not be
                running.
              </p>

              {errors.length > 0 && (
                <div
                  style={{
                    marginBottom: '16px',
                    padding: '12px',
                    backgroundColor: 'var(--background-tertiary)',
                    borderRadius: 'var(--radius-sm)',
                    border: '1px solid var(--border-secondary)',
                    maxHeight: '150px',
                    overflowY: 'auto',
                  }}
                >
                  <div
                    style={{
                      fontSize: '11px',
                      color: 'var(--foreground-muted)',
                      marginBottom: '8px',
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                    }}
                  >
                    Errors encountered:
                  </div>
                  {errors.map((err, i) => (
                    <div
                      key={`err-${i}-${err.slice(0, 20)}`}
                      style={{
                        fontSize: '11px',
                        color: 'var(--destructive-alt)',
                        padding: '4px 0',
                        borderBottom:
                          i < errors.length - 1
                            ? '1px solid var(--border-secondary)'
                            : 'none',
                        fontFamily: 'var(--font-family-mono)',
                      }}
                    >
                      [{i + 1}] {err}
                    </div>
                  ))}
                </div>
              )}

              <button
                onClick={onRetry}
                type="button"
                style={{
                  width: '100%',
                  padding: '10px',
                  backgroundColor: 'var(--primary-hex)',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 'var(--radius-sm)',
                  fontSize: '12px',
                  fontWeight: 500,
                  cursor: 'pointer',
                  transition: 'opacity 0.15s ease',
                  fontFamily: 'var(--font-family-sans)',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.opacity = '0.9';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.opacity = '1';
                }}
              >
                Retry Connection
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
