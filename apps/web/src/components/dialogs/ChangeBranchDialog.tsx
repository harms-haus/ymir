import { useState, useCallback, useRef } from 'react';
import { Dialog } from '@base-ui/react/dialog';
import { useStore } from '../../store';
import { getWebSocketClient, generateId } from '../../lib/ws';
import type { WorktreeChangeBranch, WorktreeChanged, Error as ErrorMessage } from '../../types/protocol';

interface ChangeBranchDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  worktreeId: string | null;
  currentBranch: string;
}

export function ChangeBranchDialog({ open, onOpenChange, worktreeId, currentBranch }: ChangeBranchDialogProps) {
  const addNotification = useStore((state) => state.addNotification);
  const worktrees = useStore((state) => state.worktrees);

  const [newBranchName, setNewBranchName] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const submitTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const unsubscribeChangedRef = useRef<(() => void) | null>(null);
  const unsubscribeErrorRef = useRef<(() => void) | null>(null);
  const currentRequestIdRef = useRef<string | null>(null);

  const worktree = worktreeId ? worktrees.find(wt => wt.id === worktreeId) : null;

  const handleChangeBranch = useCallback(async () => {
    if (!worktreeId || !newBranchName.trim()) return;

    if (unsubscribeChangedRef.current) {
      unsubscribeChangedRef.current();
      unsubscribeChangedRef.current = null;
    }
    if (unsubscribeErrorRef.current) {
      unsubscribeErrorRef.current();
      unsubscribeErrorRef.current = null;
    }
    if (submitTimeoutRef.current) {
      clearTimeout(submitTimeoutRef.current);
      submitTimeoutRef.current = null;
    }

    setIsSubmitting(true);

    const requestId = generateId();
    currentRequestIdRef.current = requestId;

    try {
      const client = getWebSocketClient();

      const unsubscribeChanged = client.onMessage('WorktreeChanged', (message: WorktreeChanged) => {
        if (message.worktree.id === worktreeId) {
          setIsSubmitting(false);
          onOpenChange(false);
          setNewBranchName('');
          addNotification({
            level: 'info',
            message: `Switched to branch "${message.worktree.branchName}"`,
          });

          if (unsubscribeChangedRef.current) {
            unsubscribeChangedRef.current();
            unsubscribeChangedRef.current = null;
          }
          if (unsubscribeErrorRef.current) {
            unsubscribeErrorRef.current();
            unsubscribeErrorRef.current = null;
          }
          if (submitTimeoutRef.current) {
            clearTimeout(submitTimeoutRef.current);
            submitTimeoutRef.current = null;
          }
          currentRequestIdRef.current = null;
        }
      });

      const unsubscribeError = client.onMessage('Error', (msg: ErrorMessage) => {
        if (msg.requestId !== requestId) {
          return;
        }
        setIsSubmitting(false);
        addNotification({
          level: 'error',
          message: msg.message || 'Failed to change branch',
        });
        if (unsubscribeChangedRef.current) {
          unsubscribeChangedRef.current();
          unsubscribeChangedRef.current = null;
        }
        if (unsubscribeErrorRef.current) {
          unsubscribeErrorRef.current();
          unsubscribeErrorRef.current = null;
        }
        if (submitTimeoutRef.current) {
          clearTimeout(submitTimeoutRef.current);
          submitTimeoutRef.current = null;
        }
        currentRequestIdRef.current = null;
      });

      unsubscribeChangedRef.current = unsubscribeChanged;
      unsubscribeErrorRef.current = unsubscribeError;

      const message: WorktreeChangeBranch = {
        type: 'WorktreeChangeBranch',
        worktreeId,
        newBranchName: newBranchName.trim(),
        requestId,
      };

      client.send(message);

      submitTimeoutRef.current = setTimeout(() => {
        setIsSubmitting(false);
        addNotification({
          level: 'error',
          message: 'Branch change timed out',
        });
        if (unsubscribeChangedRef.current) {
          unsubscribeChangedRef.current();
          unsubscribeChangedRef.current = null;
        }
        if (unsubscribeErrorRef.current) {
          unsubscribeErrorRef.current();
          unsubscribeErrorRef.current = null;
        }
        submitTimeoutRef.current = null;
      }, 30000);

    } catch (error) {
      setIsSubmitting(false);
      addNotification({
        level: 'error',
        message: error instanceof Error ? error.message : 'Failed to change branch',
      });
    }
  }, [worktreeId, newBranchName, onOpenChange, addNotification]);

  const handleCancel = useCallback(() => {
    setNewBranchName('');
    onOpenChange(false);
  }, [onOpenChange]);

  const handleSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    handleChangeBranch();
  }, [handleChangeBranch]);

  const canSubmit = newBranchName.trim() && !isSubmitting && newBranchName.trim() !== currentBranch;

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
            width: '480px',
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
            Change Branch
          </Dialog.Title>

          <Dialog.Description
            style={{
              margin: '0 0 20px 0',
              fontSize: '14px',
              color: 'hsl(var(--muted-foreground))',
            }}
          >
            {worktree
              ? `Switch "${worktree.path.split('/').pop() || worktree.branchName}" from "${currentBranch}" to a different branch`
              : 'Enter the branch name to switch to'}
          </Dialog.Description>

          <form onSubmit={handleSubmit}>
            <div style={{ marginBottom: '20px' }}>
              <label
                htmlFor="branch-name"
                style={{
                  display: 'block',
                  marginBottom: '6px',
                  fontSize: '14px',
                  fontWeight: 500,
                  color: 'hsl(var(--foreground))',
                }}
              >
                Branch name
              </label>
              <input
                id="branch-name"
                type="text"
                value={newBranchName}
                onChange={(e) => setNewBranchName(e.target.value)}
                placeholder="feature/new-branch"
                disabled={isSubmitting}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  borderRadius: '6px',
                  border: '1px solid hsl(var(--border))',
                  backgroundColor: 'hsl(var(--input))',
                  color: 'hsl(var(--foreground))',
                  fontSize: '14px',
                  boxSizing: 'border-box',
                }}
              />
              <div
                style={{
                  marginTop: '6px',
                  fontSize: '12px',
                  color: 'hsl(var(--muted-foreground))',
                }}
              >
                Current branch: <strong>{currentBranch}</strong>
              </div>
            </div>

            <div
              style={{
                display: 'flex',
                gap: '8px',
                justifyContent: 'flex-end',
              }}
            >
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
                  backgroundColor: 'hsl(var(--primary))',
                  color: 'hsl(var(--primary-foreground))',
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
                    Changing...
                  </>
                ) : (
                  <>
                    <i className="ri-git-branch-line" style={{ fontSize: '16px' }} />
                    Change Branch
                  </>
                )}
              </button>
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
