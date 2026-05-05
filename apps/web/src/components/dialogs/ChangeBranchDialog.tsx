import { useState, useCallback, useRef, useEffect } from 'react';
import { Dialog } from '@base-ui/react/dialog';
import { Combobox } from '@base-ui/react/combobox';
import { useStore } from '../../store';
import { getWebSocketClient, generateId } from '../../lib/ws';
import { listBranches } from '../../lib/api';
import type { WorktreeChangeBranch, WorktreeChanged, Error as ErrorMessage, BranchInfo } from '../../types/protocol';

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
  const [branches, setBranches] = useState<BranchInfo[]>([]);
  const [isLoadingBranches, setIsLoadingBranches] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const submitTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const unsubscribeChangedRef = useRef<(() => void) | null>(null);
  const unsubscribeErrorRef = useRef<(() => void) | null>(null);
  const currentRequestIdRef = useRef<string | null>(null);

  const worktree = worktreeId ? worktrees.find(wt => wt.id === worktreeId) : null;

  const cleanupSubscriptions = useCallback(() => {
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
  }, []);

  const handleChangeBranch = useCallback(async () => {
    if (!worktreeId || !newBranchName.trim()) return;

    cleanupSubscriptions();

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
          cleanupSubscriptions();
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
        cleanupSubscriptions();
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
        cleanupSubscriptions();
      }, 30000);

    } catch (error) {
      setIsSubmitting(false);
      addNotification({
        level: 'error',
        message: error instanceof Error ? error.message : 'Failed to change branch',
      });
    }
  }, [worktreeId, newBranchName, onOpenChange, addNotification, cleanupSubscriptions]);

  const handleCancel = useCallback(() => {
    cleanupSubscriptions();
    setNewBranchName('');
    onOpenChange(false);
  }, [onOpenChange, cleanupSubscriptions]);

  const handleSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    handleChangeBranch();
  }, [handleChangeBranch]);

  // Fetch branches when dialog opens
  useEffect(() => {
    if (!open || !worktreeId || !worktree?.workspaceId) {
      setBranches([]);
      setFetchError(null);
      return;
    }

    const fetchBranches = async () => {
      setIsLoadingBranches(true);
      setFetchError(null);
      try {
        const result = await listBranches(worktreeId, worktree.workspaceId);
        setBranches(result);
      } catch (error) {
        setFetchError(error instanceof Error ? error.message : 'Failed to fetch branches');
      } finally {
        setIsLoadingBranches(false);
      }
    };

    fetchBranches();
  }, [open, worktreeId, worktree?.workspaceId]);

  // Reset branch list and input when dialog closes
  useEffect(() => {
    if (!open) {
      setBranches([]);
      setNewBranchName('');
      setFetchError(null);
      setIsLoadingBranches(false);
    }
  }, [open]);

  const canSubmit = newBranchName.trim() && !isSubmitting && newBranchName.trim() !== currentBranch;

  // Build branch options with labels and visual indicators
  const branchOptions = branches.map(branch => ({
    ...branch,
    label: branch.isRemote
      ? branch.name.replace(/^origin\//, '')
      : branch.name,
  }));

  // Separate local and remote branches for grouped display
  const localBranches = branchOptions.filter(b => b.isLocal && !b.isRemote);
  const remoteBranches = branchOptions.filter(b => b.isRemote);

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

              <Combobox.Root
                value={newBranchName || null}
                onValueChange={(value) => {
                  if (typeof value === 'string') {
                    setNewBranchName(value);
                  }
                }}
                onInputValueChange={(inputValue) => {
                  setNewBranchName(inputValue);
                }}
                autoHighlight
              >
                <Combobox.Input>
                  <input
                    placeholder={isLoadingBranches ? 'Loading branches...' : 'Search branches or enter new name...'}
                    disabled={isSubmitting || isLoadingBranches}
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
                </Combobox.Input>

                <Combobox.Portal>
                  <Combobox.Positioner sideOffset={4}>
                    <Combobox.Popup
                      style={{
                        backgroundColor: 'hsl(var(--card))',
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '8px',
                        boxShadow: '0 4px 20px rgba(0, 0, 0, 0.3)',
                        maxHeight: '280px',
                        overflow: 'auto',
                        padding: '4px 0',
                        zIndex: 10000,
                      }}
                    >
                      {isLoadingBranches ? (
                        <div
                          style={{
                            padding: '12px 16px',
                            fontSize: '13px',
                            color: 'hsl(var(--muted-foreground))',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                          }}
                        >
                          <span
                            style={{
                              display: 'inline-block',
                              width: '14px',
                              height: '14px',
                              border: '2px solid hsl(var(--border))',
                              borderTopColor: 'hsl(var(--primary))',
                              borderRadius: '50%',
                              animation: 'spin 1s linear infinite',
                            }}
                          />
                          Loading branches...
                        </div>
                      ) : fetchError ? (
                        <div
                          style={{
                            padding: '12px 16px',
                            fontSize: '13px',
                            color: 'hsl(var(--destructive))',
                          }}
                        >
                          {fetchError}
                        </div>
                      ) : (
                        <Combobox.List>
                          {localBranches.length > 0 && (
                            <>
                              <Combobox.Group>
                                <Combobox.GroupLabel
                                  style={{
                                    padding: '6px 16px 4px',
                                    fontSize: '11px',
                                    fontWeight: 600,
                                    textTransform: 'uppercase',
                                    letterSpacing: '0.05em',
                                    color: 'hsl(var(--muted-foreground))',
                                  }}
                                >
                                  Local
                                </Combobox.GroupLabel>
                                {localBranches.map(branch => (
                                  <Combobox.Item
                                    key={`local-${branch.name}`}
                                    value={branch.name}
                                    style={{
                                      display: 'flex',
                                      alignItems: 'center',
                                      justifyContent: 'space-between',
                                      padding: '8px 16px',
                                      fontSize: '14px',
                                      cursor: 'pointer',
                                      backgroundColor: branch.isCurrent
                                        ? 'hsl(var(--primary) / 0.1)'
                                        : 'transparent',
                                      color: 'hsl(var(--foreground))',
                                    }}
                                    data-highlighted-style={{
                                      backgroundColor: 'hsl(var(--accent))',
                                      color: 'hsl(var(--accent-foreground))',
                                    }}
                                  >
                                    <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                      <i
                                        className="ri-git-branch-line"
                                        style={{ fontSize: '14px', color: 'hsl(var(--muted-foreground))' }}
                                      />
                                      {branch.label}
                                    </span>
                                    {branch.isCurrent && (
                                      <span
                                        style={{
                                          fontSize: '11px',
                                          fontWeight: 600,
                                          padding: '2px 8px',
                                          borderRadius: '4px',
                                          backgroundColor: 'hsl(var(--primary))',
                                          color: 'hsl(var(--primary-foreground))',
                                        }}
                                      >
                                        current
                                      </span>
                                    )}
                                  </Combobox.Item>
                                ))}
                              </Combobox.Group>
                            </>
                          )}

                          {remoteBranches.length > 0 && (
                            <>
                              <Combobox.Group>
                                <Combobox.GroupLabel
                                  style={{
                                    padding: '6px 16px 4px',
                                    fontSize: '11px',
                                    fontWeight: 600,
                                    textTransform: 'uppercase',
                                    letterSpacing: '0.05em',
                                    color: 'hsl(var(--muted-foreground))',
                                  }}
                                >
                                  Remote
                                </Combobox.GroupLabel>
                                {remoteBranches.map(branch => (
                                  <Combobox.Item
                                    key={`remote-${branch.name}`}
                                    value={branch.name}
                                    style={{
                                      display: 'flex',
                                      alignItems: 'center',
                                      justifyContent: 'space-between',
                                      padding: '8px 16px',
                                      fontSize: '14px',
                                      cursor: 'pointer',
                                      color: 'hsl(var(--foreground))',
                                    }}
                                    data-highlighted-style={{
                                      backgroundColor: 'hsl(var(--accent))',
                                      color: 'hsl(var(--accent-foreground))',
                                    }}
                                  >
                                    <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                      <i
                                        className="ri-global-line"
                                        style={{ fontSize: '14px', color: 'hsl(var(--muted-foreground))' }}
                                      />
                                      {branch.label}
                                    </span>
                                    <span
                                      style={{
                                        fontSize: '11px',
                                        color: 'hsl(var(--muted-foreground))',
                                        fontFamily: 'monospace',
                                      }}
                                    >
                                      {branch.name}
                                    </span>
                                  </Combobox.Item>
                                ))}
                              </Combobox.Group>
                            </>
                          )}

                          {localBranches.length === 0 && remoteBranches.length === 0 && !isLoadingBranches && !fetchError && (
                            <div
                              style={{
                                padding: '12px 16px',
                                fontSize: '13px',
                                color: 'hsl(var(--muted-foreground))',
                              }}
                            >
                              No branches found
                            </div>
                          )}

                          <Combobox.Empty
                            style={{
                              padding: '12px 16px',
                              fontSize: '13px',
                              color: 'hsl(var(--muted-foreground))',
                            }}
                          >
                            No matching branches
                          </Combobox.Empty>
                        </Combobox.List>
                      )}
                    </Combobox.Popup>
                  </Combobox.Positioner>
                </Combobox.Portal>
              </Combobox.Root>

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
