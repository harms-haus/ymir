import { useState, useCallback, useRef } from 'react';
import { Dialog } from '@base-ui/react/dialog';
import { useStore } from '../../store';
import { getWebSocketClient } from '../../lib/ws';
import type { WorktreeMerge } from '../../types/protocol';

interface MergeDialogProps {
  worktreeId?: string;
  mergeType: 'merge' | 'squash';
  branchName: string;
  mainBranch: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function MergeDialog({ 
  worktreeId, 
  mergeType, 
  branchName, 
  mainBranch, 
  open, 
  onOpenChange 
}: MergeDialogProps) {
  const addNotification = useStore((state) => state.addNotification);
  const [deleteAfter, setDeleteAfter] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const mergeUnsubscribeRef = useRef<(() => void) | null>(null);
  const mergeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleConfirm = useCallback(async () => {
    if (isSubmitting || !worktreeId) return;

    setIsSubmitting(true);

    // Clean up previous handlers
    if (mergeUnsubscribeRef.current) {
      mergeUnsubscribeRef.current();
      mergeUnsubscribeRef.current = null;
    }
    if (mergeTimeoutRef.current) {
      clearTimeout(mergeTimeoutRef.current);
      mergeTimeoutRef.current = null;
    }

    try {
      const client = getWebSocketClient();
      
      const message: WorktreeMerge = {
        type: 'WorktreeMerge',
        worktreeId,
        squash: mergeType === 'squash',
        deleteAfter,
      };

      client.send(message);

      // Set up response handlers
      const unsubscribeError = client.onMessage('Error', (msg: any) => {
        if (msg.worktreeId === worktreeId) {
          setIsSubmitting(false);
          addNotification({
            level: 'error',
            message: msg.message || 'Merge failed',
          });
          cleanupHandlers();
        }
      });

      const unsubscribeNotification = client.onMessage('Notification', (msg: any) => {
        if (msg.worktreeId === worktreeId && msg.message.includes('merged')) {
          setIsSubmitting(false);
          onOpenChange(false);
          addNotification({
            level: 'info',
            message: 'Branch merged successfully',
          });
          
          if (deleteAfter) {
            addNotification({
              level: 'info',
              message: 'Worktree deleted',
            });
          }
          
          cleanupHandlers();
        }
      });

      mergeUnsubscribeRef.current = () => {
        unsubscribeError();
        unsubscribeNotification();
      };

      // Timeout after 30 seconds
      mergeTimeoutRef.current = setTimeout(() => {
        setIsSubmitting(false);
        addNotification({
          level: 'error',
          message: 'Merge operation timed out',
        });
        cleanupHandlers();
      }, 30000);

    } catch (error) {
      setIsSubmitting(false);
      addNotification({
        level: 'error',
        message: error instanceof Error ? error.message : 'Failed to merge',
      });
    }

    function cleanupHandlers() {
      if (mergeUnsubscribeRef.current) {
        mergeUnsubscribeRef.current();
        mergeUnsubscribeRef.current = null;
      }
      if (mergeTimeoutRef.current) {
        clearTimeout(mergeTimeoutRef.current);
        mergeTimeoutRef.current = null;
      }
    }
  }, [worktreeId, mergeType, deleteAfter, onOpenChange, addNotification, isSubmitting]);

  const handleCancel = useCallback(() => {
    onOpenChange(false);
  }, [onOpenChange]);

  const dialogTitle = mergeType === 'squash' 
    ? 'Squash & Merge worktree' 
    : 'Merge worktree';

  const confirmButtonText = mergeType === 'squash' 
    ? 'Squash & Merge' 
    : 'Merge';

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
            width: '400px',
            maxWidth: '90vw',
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
            {dialogTitle}
          </Dialog.Title>

          <Dialog.Description
            style={{
              margin: '0 0 20px 0',
              fontSize: '14px',
              color: 'hsl(var(--muted-foreground))',
            }}
          >
            {mergeType === 'squash'
              ? `Squash and merge branch '${branchName}' into '${mainBranch}'?`
              : `Merge branch '${branchName}' into '${mainBranch}'?`}
          </Dialog.Description>

          <div style={{ marginBottom: '20px' }}>
            <label
              htmlFor="delete-worktree-checkbox"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                fontSize: '14px',
                cursor: 'pointer',
              }}
            >
              <input
                id="delete-worktree-checkbox"
                type="checkbox"
                checked={deleteAfter}
                onChange={(e) => setDeleteAfter(e.target.checked)}
                style={{
                  width: '16px',
                  height: '16px',
                  margin: 0,
                }}
              />
              Delete worktree after merge
            </label>
            {deleteAfter && (
              <div
                style={{
                  marginTop: '8px',
                  fontSize: '13px',
                  color: 'hsl(var(--destructive))',
                  paddingLeft: '24px',
                }}
              >
                This will permanently delete the worktree directory.
              </div>
            )}
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
              type="button"
              onClick={handleConfirm}
              disabled={isSubmitting}
              style={{
                padding: '8px 16px',
                borderRadius: '6px',
                border: 'none',
                backgroundColor: 'hsl(142 70% 45%)',
                color: 'white',
                cursor: isSubmitting ? 'not-allowed' : 'pointer',
                fontSize: '14px',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                opacity: isSubmitting ? 0.6 : 1,
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
                  Merging...
                </>
              ) : (
                confirmButtonText
              )}
            </button>
          </div>

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