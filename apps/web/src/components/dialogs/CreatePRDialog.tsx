import { useState, useEffect, useCallback, useRef } from 'react';
import { Dialog } from '@base-ui/react/dialog';
import { useStore, selectActiveWorktree } from '../../store';
import { getWebSocketClient } from '../../lib/ws';
import type { CreatePR } from '../../types/protocol';

interface CreatePRDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CreatePRDialog({ open, onOpenChange }: CreatePRDialogProps) {
  const activeWorktree = useStore(selectActiveWorktree);
  const addNotification = useStore((state) => state.addNotification);

  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [isAutoGenerating, setIsAutoGenerating] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const autoGenTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoGenUnsubscribeRef = useRef<(() => void) | null>(null);
  const prSubmitTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prSubmitUnsubscribeErrorRef = useRef<(() => void) | null>(null);
  const prSubmitUnsubscribeNotificationRef = useRef<(() => void) | null>(null);
  const prCorrelationIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (open && activeWorktree) {
      setTitle(activeWorktree.branchName);
      setBody('');
      setIsAutoGenerating(false);
      setIsSubmitting(false);
      
      return () => {
        if (autoGenUnsubscribeRef.current) {
          autoGenUnsubscribeRef.current();
          autoGenUnsubscribeRef.current = null;
        }
        if (autoGenTimeoutRef.current) {
          clearTimeout(autoGenTimeoutRef.current);
          autoGenTimeoutRef.current = null;
        }
        if (prSubmitUnsubscribeErrorRef.current) {
          prSubmitUnsubscribeErrorRef.current();
          prSubmitUnsubscribeErrorRef.current = null;
        }
        if (prSubmitUnsubscribeNotificationRef.current) {
          prSubmitUnsubscribeNotificationRef.current();
          prSubmitUnsubscribeNotificationRef.current = null;
        }
        if (prSubmitTimeoutRef.current) {
          clearTimeout(prSubmitTimeoutRef.current);
          prSubmitTimeoutRef.current = null;
        }
        prCorrelationIdRef.current = null;
      };
    }
    return undefined;
  }, [open, activeWorktree]);

  const handleAutoGenerate = useCallback(async () => {
    if (!activeWorktree) return;

    if (autoGenUnsubscribeRef.current) {
      autoGenUnsubscribeRef.current();
      autoGenUnsubscribeRef.current = null;
    }
    if (autoGenTimeoutRef.current) {
      clearTimeout(autoGenTimeoutRef.current);
      autoGenTimeoutRef.current = null;
    }

    setIsAutoGenerating(true);

    try {
      const client = getWebSocketClient();

      client.send({
        type: 'AgentSpawn',
        worktreeId: activeWorktree.id,
        agentType: 'pr-generator',
      } as any);

      const unsubscribe = client.onMessage('AgentOutput', (message: any) => {
        if (message.output) {
          try {
            const prContent = JSON.parse(message.output);
            if (prContent.title) {
              setTitle(prContent.title);
            }
            if (prContent.body) {
              setBody(prContent.body);
            }
            setIsAutoGenerating(false);
        } catch (error) {
          setIsAutoGenerating(false);
          addNotification({
            level: 'error',
            message: `Failed to parse agent output: ${error instanceof Error ? error.message : 'Unknown error'}`,
          });
        } finally {
            if (autoGenUnsubscribeRef.current) {
              autoGenUnsubscribeRef.current();
              autoGenUnsubscribeRef.current = null;
            }
            if (autoGenTimeoutRef.current) {
              clearTimeout(autoGenTimeoutRef.current);
              autoGenTimeoutRef.current = null;
            }
          }
        }
      });

      autoGenUnsubscribeRef.current = unsubscribe;

      autoGenTimeoutRef.current = setTimeout(() => {
        setIsAutoGenerating(false);
        if (autoGenUnsubscribeRef.current) {
          autoGenUnsubscribeRef.current();
          autoGenUnsubscribeRef.current = null;
        }
        autoGenTimeoutRef.current = null;
      }, 30000);

    } catch (error) {
      throw error;
    } finally {
      setIsAutoGenerating(false);
    }
  }, [activeWorktree, addNotification]);

  useEffect(() => {
    return () => {
      if (autoGenUnsubscribeRef.current) {
        autoGenUnsubscribeRef.current();
        autoGenUnsubscribeRef.current = null;
      }
      if (autoGenTimeoutRef.current) {
        clearTimeout(autoGenTimeoutRef.current);
        autoGenTimeoutRef.current = null;
      }
      if (prSubmitUnsubscribeErrorRef.current) {
        prSubmitUnsubscribeErrorRef.current();
        prSubmitUnsubscribeErrorRef.current = null;
      }
      if (prSubmitUnsubscribeNotificationRef.current) {
        prSubmitUnsubscribeNotificationRef.current();
        prSubmitUnsubscribeNotificationRef.current = null;
      }
      if (prSubmitTimeoutRef.current) {
        clearTimeout(prSubmitTimeoutRef.current);
        prSubmitTimeoutRef.current = null;
      }
    };
  }, []);

  const handleCreatePR = useCallback(async () => {
    if (!activeWorktree || !title.trim()) return;

    if (prSubmitUnsubscribeErrorRef.current) {
      prSubmitUnsubscribeErrorRef.current();
      prSubmitUnsubscribeErrorRef.current = null;
    }
    if (prSubmitUnsubscribeNotificationRef.current) {
      prSubmitUnsubscribeNotificationRef.current();
      prSubmitUnsubscribeNotificationRef.current = null;
    }
    if (prSubmitTimeoutRef.current) {
      clearTimeout(prSubmitTimeoutRef.current);
      prSubmitTimeoutRef.current = null;
    }

    setIsSubmitting(true);

    try {
      const client = getWebSocketClient();
      const correlationId = Date.now().toString();

      prCorrelationIdRef.current = correlationId;

      const message: CreatePR = {
        type: 'CreatePR',
        worktreeId: activeWorktree.id,
        title: title.trim(),
        body: body.trim() || undefined,
      };

      client.send(message);

      const unsubscribeError = client.onMessage('Error', (msg: any) => {
        if (msg.worktreeId === activeWorktree.id) {
          setIsSubmitting(false);
          addNotification({
            level: 'error',
            message: msg.message || 'Failed to create PR',
          });
          if (prSubmitUnsubscribeErrorRef.current) {
            prSubmitUnsubscribeErrorRef.current();
            prSubmitUnsubscribeErrorRef.current = null;
          }
          if (prSubmitUnsubscribeNotificationRef.current) {
            prSubmitUnsubscribeNotificationRef.current();
            prSubmitUnsubscribeNotificationRef.current = null;
          }
          if (prSubmitTimeoutRef.current) {
            clearTimeout(prSubmitTimeoutRef.current);
            prSubmitTimeoutRef.current = null;
          }
          prCorrelationIdRef.current = null;
        }
      });

      const unsubscribeNotification = client.onMessage('Notification', (msg: any) => {
        if (msg.worktreeId === activeWorktree.id && (msg.message === 'PR created' || msg.message.includes('pull request'))) {
          setIsSubmitting(false);
          onOpenChange(false);
          addNotification({
            level: 'info',
            message: msg.message,
          });
          if (prSubmitUnsubscribeErrorRef.current) {
            prSubmitUnsubscribeErrorRef.current();
            prSubmitUnsubscribeErrorRef.current = null;
          }
          if (prSubmitUnsubscribeNotificationRef.current) {
            prSubmitUnsubscribeNotificationRef.current();
            prSubmitUnsubscribeNotificationRef.current = null;
          }
          if (prSubmitTimeoutRef.current) {
            clearTimeout(prSubmitTimeoutRef.current);
            prSubmitTimeoutRef.current = null;
          }
          prCorrelationIdRef.current = null;
        }
      });

      prSubmitUnsubscribeErrorRef.current = unsubscribeError;
      prSubmitUnsubscribeNotificationRef.current = unsubscribeNotification;

      prSubmitTimeoutRef.current = setTimeout(() => {
        setIsSubmitting(false);
        if (prSubmitUnsubscribeErrorRef.current) {
          prSubmitUnsubscribeErrorRef.current();
          prSubmitUnsubscribeErrorRef.current = null;
        }
        if (prSubmitUnsubscribeNotificationRef.current) {
          prSubmitUnsubscribeNotificationRef.current();
          prSubmitUnsubscribeNotificationRef.current = null;
        }
        prSubmitTimeoutRef.current = null;
        prCorrelationIdRef.current = null;
      }, 30000);

    } catch (error) {
      setIsSubmitting(false);
      addNotification({
        level: 'error',
        message: error instanceof Error ? error.message : 'Failed to create PR',
      });
    }
  }, [activeWorktree, title, body, onOpenChange, addNotification]);

  const handleCancel = useCallback(() => {
    onOpenChange(false);
  }, [onOpenChange]);

  const handleSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    handleCreatePR();
  }, [handleCreatePR]);

  const canSubmit = title.trim() && !isSubmitting && !isAutoGenerating;

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            zIndex: 9998,
          }}
        />
        <Dialog.Popup
          style={{
            position: 'fixed',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            backgroundColor: 'hsl(var(--card))',
            border: '1px solid hsl(var(--border))',
            borderRadius: '8px',
            padding: '24px',
            width: '500px',
            maxWidth: '90vw',
            maxHeight: '90vh',
            overflow: 'auto',
            boxShadow: '0 4px 20px rgba(0, 0, 0, 0.3)',
            zIndex: 9999,
          }}
        >
          <Dialog.Title
            style={{
              margin: '0 0 8px 0',
              fontSize: '18px',
              fontWeight: 600,
              color: 'hsl(var(--card-foreground))',
            }}
          >
            Create Pull Request
          </Dialog.Title>

          <Dialog.Description
            style={{
              margin: '0 0 20px 0',
              fontSize: '14px',
              color: 'hsl(var(--muted-foreground))',
            }}
          >
            Create a PR for the current worktree changes
          </Dialog.Description>

          <form onSubmit={handleSubmit}>
            <div style={{ marginBottom: '16px' }}>
              <label
                htmlFor="pr-title"
                style={{
                  display: 'block',
                  marginBottom: '6px',
                  fontSize: '14px',
                  fontWeight: 500,
                  color: 'hsl(var(--foreground))',
                }}
              >
                Title
              </label>
              <input
                id="pr-title"
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Enter PR title"
                disabled={isAutoGenerating || isSubmitting}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  borderRadius: '6px',
                  border: '1px solid hsl(var(--border))',
                  backgroundColor: 'hsl(var(--input))',
                  color: 'hsl(var(--foreground))',
                  fontSize: '14px',
                  boxSizing: 'border-box',
                  outline: 'none',
                }}
              />
            </div>

            <div style={{ marginBottom: '20px' }}>
              <label
                htmlFor="pr-body"
                style={{
                  display: 'block',
                  marginBottom: '6px',
                  fontSize: '14px',
                  fontWeight: 500,
                  color: 'hsl(var(--foreground))',
                }}
              >
                Description
              </label>
              <textarea
                id="pr-body"
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="Enter PR description (optional)"
                disabled={isAutoGenerating || isSubmitting}
                rows={6}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  borderRadius: '6px',
                  border: '1px solid hsl(var(--border))',
                  backgroundColor: 'hsl(var(--input))',
                  color: 'hsl(var(--foreground))',
                  fontSize: '14px',
                  boxSizing: 'border-box',
                  resize: 'vertical',
                  minHeight: '120px',
                  fontFamily: 'inherit',
                  outline: 'none',
                }}
              />
            </div>

            <div
              style={{
                display: 'flex',
                gap: '8px',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <button
                type="button"
                onClick={handleAutoGenerate}
                disabled={isAutoGenerating || isSubmitting || !activeWorktree}
                style={{
                  padding: '8px 16px',
                  borderRadius: '6px',
                  border: '1px solid hsl(var(--border))',
                  backgroundColor: 'transparent',
                  color: 'hsl(var(--foreground))',
                  cursor: isAutoGenerating || isSubmitting ? 'not-allowed' : 'pointer',
                  fontSize: '14px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  opacity: isAutoGenerating || isSubmitting ? 0.6 : 1,
                }}
              >
                {isAutoGenerating ? (
                  <>
                    <span
                      style={{
                        display: 'inline-block',
                        width: '14px',
                        height: '14px',
                        border: '2px solid hsl(var(--muted-foreground))',
                        borderTopColor: 'transparent',
                        borderRadius: '50%',
                        animation: 'spin 1s linear infinite',
                      }}
                    />
                    Generating...
                  </>
                ) : (
                  <>
                    <i className="ri-magic-line" style={{ fontSize: '16px' }} />
                    Auto-generate
                  </>
                )}
              </button>

              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  type="button"
                  onClick={handleCancel}
                  disabled={isSubmitting}
                  style={{
                    padding: '8px 16px',
                    borderRadius: '6px',
                    border: '1px solid hsl(var(--border))',
                    backgroundColor: 'transparent',
                    color: 'hsl(var(--foreground))',
                    cursor: isSubmitting ? 'not-allowed' : 'pointer',
                    fontSize: '14px',
                    opacity: isSubmitting ? 0.6 : 1,
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!canSubmit}
                  style={{
                    padding: '8px 16px',
                    borderRadius: '6px',
                    border: 'none',
                    backgroundColor: 'hsl(142 70% 45%)',
                    color: 'white',
                    cursor: canSubmit ? 'pointer' : 'not-allowed',
                    fontSize: '14px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    opacity: canSubmit ? 1 : 0.6,
                  }}
                >
                  {isSubmitting ? (
                    <>
                      <span
                        style={{
                          display: 'inline-block',
                          width: '14px',
                          height: '14px',
                          border: '2px solid rgba(255, 255, 255, 0.3)',
                          borderTopColor: 'white',
                          borderRadius: '50%',
                          animation: 'spin 1s linear infinite',
                        }}
                      />
                      Creating...
                    </>
                  ) : (
                    <>
                      <i className="ri-git-pull-request-line" style={{ fontSize: '16px' }} />
                      Create PR
                    </>
                  )}
                </button>
              </div>
            </div>
      </form>

            <style>{`
            @keyframes spin {
              to {
                transform: rotate(360deg);
              }
            }
          `}</style>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
