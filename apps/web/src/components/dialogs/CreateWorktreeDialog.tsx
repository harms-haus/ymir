import { useState, useEffect, useCallback, useRef } from 'react';
import { Dialog } from '@base-ui/react/dialog';
import { RadioGroup } from '@base-ui/react/radio-group';
import { useStore } from '../../store';
import { getWebSocketClient } from '../../lib/ws';
import type { WorktreeCreate, WorktreeCreated, Error as ErrorMessage } from '../../types/protocol';

type AgentOption = 'claude' | 'opencode' | 'pi' | 'none';

interface AgentConfig {
  value: AgentOption;
  icon: string;
  label: string;
  description: string;
}

const AGENT_OPTIONS: AgentConfig[] = [
  { value: 'claude', icon: 'ri-robot-line', label: 'Claude', description: 'Via ACP adapter' },
  { value: 'opencode', icon: 'ri-terminal-box-line', label: 'Opencode', description: 'Native ACP support' },
  { value: 'pi', icon: 'ri-code-s-slash-line', label: 'Pi', description: 'Via pi-acp adapter' },
  { value: 'none', icon: 'ri-forbid-line', label: 'No agent', description: 'Start with terminal only' },
];

interface CreateWorktreeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspaceId: string | null;
}

export function CreateWorktreeDialog({ open, onOpenChange, workspaceId }: CreateWorktreeDialogProps) {
  const addNotification = useStore((state) => state.addNotification);
  const setActiveWorktree = useStore((state) => state.setActiveWorktree);

  const [branchName, setBranchName] = useState('');
  const [useExistingBranch, setUseExistingBranch] = useState(false);
  const [selectedAgent, setSelectedAgent] = useState<AgentOption | undefined>(undefined);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isBranchInputFocused, setIsBranchInputFocused] = useState(false);

  const submitTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const unsubscribeCreatedRef = useRef<(() => void) | null>(null);
  const unsubscribeErrorRef = useRef<(() => void) | null>(null);
  const currentRequestIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (open) {
      setBranchName('');
      setUseExistingBranch(false);
      setSelectedAgent(undefined);
      setIsSubmitting(false);
    }

    return () => {
      if (submitTimeoutRef.current) {
        clearTimeout(submitTimeoutRef.current);
        submitTimeoutRef.current = null;
      }
      if (unsubscribeCreatedRef.current) {
        unsubscribeCreatedRef.current();
        unsubscribeCreatedRef.current = null;
      }
      if (unsubscribeErrorRef.current) {
        unsubscribeErrorRef.current();
        unsubscribeErrorRef.current = null;
      }
    };
  }, [open]);

  useEffect(() => {
    return () => {
      if (submitTimeoutRef.current) {
        clearTimeout(submitTimeoutRef.current);
      }
      if (unsubscribeCreatedRef.current) {
        unsubscribeCreatedRef.current();
      }
      if (unsubscribeErrorRef.current) {
        unsubscribeErrorRef.current();
      }
    };
  }, []);

  const handleCreate = useCallback(async () => {
    if (!workspaceId || !branchName.trim() || !selectedAgent) return;

    if (unsubscribeCreatedRef.current) {
      unsubscribeCreatedRef.current();
      unsubscribeCreatedRef.current = null;
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

    const requestId = `create-worktree-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    currentRequestIdRef.current = requestId;

    try {
      const client = getWebSocketClient();

      const unsubscribeCreated = client.onMessage('WorktreeCreated', (message: WorktreeCreated) => {
        if (message.worktree.workspaceId === workspaceId) {
          setIsSubmitting(false);
          onOpenChange(false);
          addNotification({
            level: 'info',
            message: 'Worktree created',
          });
          setActiveWorktree(message.worktree.id);

          if (unsubscribeCreatedRef.current) {
            unsubscribeCreatedRef.current();
            unsubscribeCreatedRef.current = null;
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
          message: msg.message || 'Failed to create worktree',
        });
        if (unsubscribeCreatedRef.current) {
          unsubscribeCreatedRef.current();
          unsubscribeCreatedRef.current = null;
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

      unsubscribeCreatedRef.current = unsubscribeCreated;
      unsubscribeErrorRef.current = unsubscribeError;

      const message: WorktreeCreate = {
        type: 'WorktreeCreate',
        workspaceId,
        branchName: branchName.trim(),
        agentType: selectedAgent === 'none' ? undefined : selectedAgent,
        requestId,
        useExistingBranch,
      };

      client.send(message);

      submitTimeoutRef.current = setTimeout(() => {
        setIsSubmitting(false);
        addNotification({
          level: 'error',
          message: 'Worktree creation timed out',
        });
        if (unsubscribeCreatedRef.current) {
          unsubscribeCreatedRef.current();
          unsubscribeCreatedRef.current = null;
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
        message: error instanceof Error ? error.message : 'Failed to create worktree',
      });
    }
  }, [workspaceId, branchName, selectedAgent, useExistingBranch, onOpenChange, addNotification, setActiveWorktree]);

  const handleCancel = useCallback(() => {
    onOpenChange(false);
  }, [onOpenChange]);

  const handleSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    handleCreate();
  }, [handleCreate]);

  const canSubmit = branchName.trim() && selectedAgent && !isSubmitting;

  const radioGroupStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  };

  const radioItemStyle = (isSelected: boolean): React.CSSProperties => ({
    display: 'flex',
    alignItems: 'center',
    padding: '12px',
    borderRadius: '6px',
    border: `1px solid ${isSelected ? 'hsl(var(--primary))' : 'hsl(var(--border))'}`,
    backgroundColor: isSelected ? 'hsl(var(--primary) / 0.1)' : 'transparent',
    cursor: 'pointer',
    transition: 'all 0.15s ease',
  });

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
            New Worktree
          </Dialog.Title>

          <Dialog.Description
            style={{
              margin: '0 0 20px 0',
              fontSize: '14px',
              color: 'hsl(var(--muted-foreground))',
            }}
          >
            Create a new git worktree for this workspace
          </Dialog.Description>

          <form onSubmit={handleSubmit}>
            <div style={{ marginBottom: '16px' }}>
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
                value={branchName}
                onChange={(e) => setBranchName(e.target.value)}
                onFocus={() => setIsBranchInputFocused(true)}
                onBlur={() => setIsBranchInputFocused(false)}
                placeholder="feature/my-branch"
                disabled={isSubmitting}
                required
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  borderRadius: '6px',
                  border: `1px solid ${isBranchInputFocused ? 'hsl(var(--ring))' : 'hsl(var(--border))'}`,
                  backgroundColor: 'hsl(var(--input))',
                  color: 'hsl(var(--foreground))',
                  fontSize: '14px',
                  boxSizing: 'border-box',
                  outline: 'none',
                  boxShadow: isBranchInputFocused ? `0 0 0 2px hsl(var(--ring) / 0.2)` : 'none',
                  transition: 'border-color 0.15s ease, box-shadow 0.15s ease',
                }}
              />
            </div>

            <div style={{ marginBottom: '20px' }}>
              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  fontSize: '14px',
                  color: 'hsl(var(--foreground))',
                  cursor: 'pointer',
                }}
              >
                <input
                  type="checkbox"
                  checked={useExistingBranch}
                  onChange={(e) => setUseExistingBranch(e.target.checked)}
                  disabled={isSubmitting}
                  style={{
                    width: '16px',
                    height: '16px',
                    cursor: 'pointer',
                  }}
                />
                Use existing branch
              </label>
            </div>

            <div style={{ marginBottom: '24px' }}>
              <div
                id="agent-selector-label"
                style={{
                  marginBottom: '8px',
                  fontSize: '14px',
                  fontWeight: 500,
                  color: 'hsl(var(--foreground))',
                }}
              >
                Start with agent
              </div>
              <RadioGroup
                onValueChange={(value) => setSelectedAgent(value as AgentOption)}
                aria-labelledby="agent-selector-label"
                style={radioGroupStyle}
              >
                {AGENT_OPTIONS.map((option) => {
                  const isSelected = selectedAgent === option.value;
                  return (
                    <label
                      key={option.value}
                      style={radioItemStyle(isSelected)}
                    >
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '12px',
                          flex: 1,
                        }}
                      >
                        <i
                          className={option.icon}
                          style={{
                            fontSize: '20px',
                            color: isSelected
                              ? 'hsl(var(--primary))'
                              : 'hsl(var(--muted-foreground))',
                          }}
                        />
                        <div>
                          <div
                            style={{
                              fontSize: '14px',
                              fontWeight: 500,
                              color: 'hsl(var(--foreground))',
                            }}
                          >
                            {option.label}
                          </div>
                          <div
                            style={{
                              fontSize: '12px',
                              color: 'hsl(var(--muted-foreground))',
                            }}
                          >
                            {option.description}
                          </div>
                        </div>
                      </div>
                      <input
                        type="radio"
                        name="agent"
                        value={option.value}
                        checked={isSelected}
                        onChange={() => setSelectedAgent(option.value)}
                        style={{ display: 'none' }}
                      />
                      <div
                        style={{
                          width: '18px',
                          height: '18px',
                          borderRadius: '50%',
                          border: `2px solid ${isSelected ? 'hsl(var(--primary))' : 'hsl(var(--border))'}`,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        {isSelected && (
                          <div
                            style={{
                              width: '10px',
                              height: '10px',
                              borderRadius: '50%',
                              backgroundColor: 'hsl(var(--primary))',
                            }}
                          />
                        )}
                      </div>
                    </label>
                  );
                })}
              </RadioGroup>
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
                    <i className="ri-git-branch-line" style={{ fontSize: '16px' }} />
                    Create
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