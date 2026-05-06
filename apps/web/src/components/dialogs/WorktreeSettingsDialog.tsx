import { useState, useEffect, useCallback, useRef } from 'react';
import { Dialog } from '@base-ui/react/dialog';
import { RadioGroup } from '@base-ui/react/radio-group';
import { useStore, selectWorktreeById } from '../../store';
import { getWebSocketClient, generateId } from '../../lib/ws';
import type { WorktreeUpdate, WorktreeUpdated, Error as ErrorMessage } from '../../types/protocol';

const PRESET_COLORS = [
  { name: 'Red', value: '#ef4444' },
  { name: 'Orange', value: '#f97316' },
  { name: 'Yellow', value: '#eab308' },
  { name: 'Green', value: '#22c55e' },
  { name: 'Blue', value: '#3b82f6' },
  { name: 'Purple', value: '#a855f7' },
];

const PRESET_ICONS = [
  'ri-folder-line',
  'ri-code-box-line',
  'ri-bug-line',
  'ri-git-branch-line',
  'ri-terminal-box-line',
  'ri-database-2-line',
  'ri-cloud-line',
  'ri-server-line',
  'ri-tools-line',
  'ri-book-line',
  'ri-file-code-line',
  'ri-stack-line',
];

type AgentOption = 'hermes' | 'claude' | 'opencode' | 'pi' | 'none';

interface AgentConfig {
  value: AgentOption;
  icon: string;
  label: string;
  description: string;
}

const AGENT_OPTIONS: AgentConfig[] = [
  { value: 'hermes', icon: 'ri-robot-line', label: 'Hermes', description: 'Self-improving AI agent with skills & memory' },
  { value: 'claude', icon: 'ri-robot-line', label: 'Claude', description: 'Via ACP adapter' },
  { value: 'opencode', icon: 'ri-terminal-box-line', label: 'Opencode', description: 'Native ACP support' },
  { value: 'pi', icon: 'ri-code-s-slash-line', label: 'Pi', description: 'Via pi-acp adapter' },
  { value: 'none', icon: 'ri-forbid-line', label: 'No agent', description: 'Start with terminal only' },
];

interface WorktreeSettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  worktreeId: string | null;
}

export function WorktreeSettingsDialog({
  open,
  onOpenChange,
  worktreeId,
}: WorktreeSettingsDialogProps) {
  const worktree = useStore((state) =>
    worktreeId ? selectWorktreeById(worktreeId)(state) : null
  );
  const addNotification = useStore((state) => state.addNotification);

  const [name, setName] = useState('');
  const [path, setPath] = useState('');
  const [color, setColor] = useState('');
  const [icon, setIcon] = useState('');
  const [agent, setAgent] = useState<AgentOption>('hermes');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const updateUnsubscribeRef = useRef<(() => void) | null>(null);
  const updateTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const errorUnsubscribeRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (open && worktree) {
      setName(worktree.branchName);
      setPath(worktree.path);
      setColor(worktree.color || PRESET_COLORS[4].value);
      setIcon(worktree.icon || PRESET_ICONS[0]);
      setAgent((worktree.agentType as AgentOption) || 'hermes');
      setIsSubmitting(false);
    }

    return () => {
      if (updateUnsubscribeRef.current) {
        updateUnsubscribeRef.current();
        updateUnsubscribeRef.current = null;
      }
      if (errorUnsubscribeRef.current) {
        errorUnsubscribeRef.current();
        errorUnsubscribeRef.current = null;
      }
      if (updateTimeoutRef.current) {
        clearTimeout(updateTimeoutRef.current);
        updateTimeoutRef.current = null;
      }
    };
  }, [open, worktree]);

  const handleSave = useCallback(async () => {
    if (!worktree || !worktreeId) return;

    if (updateUnsubscribeRef.current) {
      updateUnsubscribeRef.current();
      updateUnsubscribeRef.current = null;
    }
    if (updateTimeoutRef.current) {
      clearTimeout(updateTimeoutRef.current);
      updateTimeoutRef.current = null;
    }

    setIsSubmitting(true);

    const requestId = generateId();

    try {
      const client = getWebSocketClient();

      const message: WorktreeUpdate = {
        type: 'WorktreeUpdate',
        worktreeId,
        color,
        icon,
        agentType: agent === 'none' ? undefined : agent,
        requestId,
      };

      client.send(message);

      const unsubscribe = client.onMessage('WorktreeUpdated', (msg: WorktreeUpdated) => {
        if (msg.worktree.id === worktreeId) {
          setIsSubmitting(false);
          onOpenChange(false);
          addNotification({
            level: 'info',
            message: 'Worktree settings saved',
          });

          if (updateUnsubscribeRef.current) {
            updateUnsubscribeRef.current();
            updateUnsubscribeRef.current = null;
          }
          if (errorUnsubscribeRef.current) {
            errorUnsubscribeRef.current();
            errorUnsubscribeRef.current = null;
          }
          if (updateTimeoutRef.current) {
            clearTimeout(updateTimeoutRef.current);
            updateTimeoutRef.current = null;
          }
        }
      });

      updateUnsubscribeRef.current = unsubscribe;

      const errorUnsubscribe = client.onMessage('Error', (msg: ErrorMessage) => {
        if (msg.requestId !== requestId) {
          return;
        }
        setIsSubmitting(false);
        addNotification({
          level: 'error',
          message: msg.message || 'Failed to save worktree settings',
        });

        if (updateUnsubscribeRef.current) {
          updateUnsubscribeRef.current();
          updateUnsubscribeRef.current = null;
        }
        if (errorUnsubscribeRef.current) {
          errorUnsubscribeRef.current();
          errorUnsubscribeRef.current = null;
        }
        if (updateTimeoutRef.current) {
          clearTimeout(updateTimeoutRef.current);
          updateTimeoutRef.current = null;
        }
      });

      errorUnsubscribeRef.current = errorUnsubscribe;

      updateTimeoutRef.current = setTimeout(() => {
        setIsSubmitting(false);
        addNotification({
          level: 'error',
          message: 'Operation timed out',
        });

        if (updateUnsubscribeRef.current) {
          updateUnsubscribeRef.current();
          updateUnsubscribeRef.current = null;
        }
      }, 30000);
    } catch (error) {
      setIsSubmitting(false);
      addNotification({
        level: 'error',
        message: error instanceof Error ? error.message : 'Failed to save worktree settings',
      });
    }
  }, [worktree, worktreeId, color, icon, agent, onOpenChange, addNotification]);

  const handleCancel = useCallback(() => {
    onOpenChange(false);
  }, [onOpenChange]);

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      handleSave();
    },
    [handleSave]
  );

  if (!open || !worktree) {
    return null;
  }

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
            Worktree Settings
          </Dialog.Title>

          <Dialog.Description
            style={{
              margin: '0 0 20px 0',
              fontSize: '14px',
              color: 'hsl(var(--muted-foreground))',
            }}
          >
            Configure worktree properties
          </Dialog.Description>

          <form onSubmit={handleSubmit}>
            {/* Read-only name */}
            <div style={{ marginBottom: '16px' }}>
              <label
                htmlFor="wt-name"
                style={{
                  display: 'block',
                  marginBottom: '6px',
                  fontSize: '14px',
                  fontWeight: 500,
                  color: 'hsl(var(--foreground))',
                }}
              >
                Name
              </label>
              <input
                id="wt-name"
                type="text"
                value={name}
                readOnly
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
                  outline: 'none',
                  opacity: 0.6,
                  cursor: 'not-allowed',
                }}
                title="Name editing is not supported"
              />
            </div>

            {/* Read-only path */}
            <div style={{ marginBottom: '16px' }}>
              <label
                htmlFor="wt-path"
                style={{
                  display: 'block',
                  marginBottom: '6px',
                  fontSize: '14px',
                  fontWeight: 500,
                  color: 'hsl(var(--foreground))',
                }}
              >
                Path
              </label>
              <input
                id="wt-path"
                type="text"
                value={path}
                readOnly
                disabled={isSubmitting}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  borderRadius: '6px',
                  border: '1px solid hsl(var(--border))',
                  backgroundColor: 'hsl(var(--input))',
                  color: 'hsl(var(--muted-foreground))',
                  fontSize: '14px',
                  boxSizing: 'border-box',
                  outline: 'none',
                  opacity: 0.6,
                  cursor: 'not-allowed',
                }}
              />
            </div>

            {/* Color picker */}
            <div style={{ marginBottom: '16px' }}>
              <div
                id="wt-color-label"
                style={{
                  marginBottom: '8px',
                  fontSize: '14px',
                  fontWeight: 500,
                  color: 'hsl(var(--foreground))',
                }}
              >
                Color
              </div>
              <div
                role="radiogroup"
                aria-labelledby="wt-color-label"
                style={{ display: 'flex', gap: '8px' }}
              >
                {PRESET_COLORS.map((presetColor) => (
                  <button
                    key={presetColor.value}
                    type="button"
                    role="radio"
                    aria-checked={color === presetColor.value}
                    aria-label={presetColor.name}
                    onClick={() => setColor(presetColor.value)}
                    disabled={isSubmitting}
                    style={{
                      width: '32px',
                      height: '32px',
                      borderRadius: '50%',
                      border:
                        color === presetColor.value
                          ? '2px solid hsl(var(--foreground))'
                          : '2px solid transparent',
                      backgroundColor: presetColor.value,
                      cursor: isSubmitting ? 'not-allowed' : 'pointer',
                      opacity: isSubmitting ? 0.6 : 1,
                      outline:
                        color === presetColor.value
                          ? '2px solid hsl(var(--background))'
                          : 'none',
                    }}
                  />
                ))}
              </div>
            </div>

            {/* Icon picker */}
            <div style={{ marginBottom: '16px' }}>
              <div
                id="wt-icon-label"
                style={{
                  marginBottom: '8px',
                  fontSize: '14px',
                  fontWeight: 500,
                  color: 'hsl(var(--foreground))',
                }}
              >
                Icon
              </div>
              <div
                role="radiogroup"
                aria-labelledby="wt-icon-label"
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(6, 1fr)',
                  gap: '8px',
                }}
              >
                {PRESET_ICONS.map((presetIcon) => (
                  <button
                    key={presetIcon}
                    type="button"
                    role="radio"
                    aria-checked={icon === presetIcon}
                    aria-label={presetIcon.replace('ri-', '').replace('-line', '')}
                    onClick={() => setIcon(presetIcon)}
                    disabled={isSubmitting}
                    style={{
                      width: '40px',
                      height: '40px',
                      borderRadius: '6px',
                      border:
                        icon === presetIcon
                          ? '2px solid hsl(var(--primary))'
                          : '1px solid hsl(var(--border))',
                      backgroundColor:
                        icon === presetIcon
                          ? 'hsl(var(--accent))'
                          : 'hsl(var(--background))',
                      cursor: isSubmitting ? 'not-allowed' : 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      opacity: isSubmitting ? 0.6 : 1,
                    }}
                  >
                    <i
                      className={presetIcon}
                      style={{
                        fontSize: '20px',
                        color:
                          icon === presetIcon
                            ? 'hsl(var(--accent-foreground))'
                            : 'hsl(var(--foreground))',
                      }}
                    />
                  </button>
                ))}
              </div>
            </div>

            {/* Agent selector */}
            <div style={{ marginBottom: '24px' }}>
              <div
                id="wt-agent-label"
                style={{
                  marginBottom: '8px',
                  fontSize: '14px',
                  fontWeight: 500,
                  color: 'hsl(var(--foreground))',
                }}
              >
                Agent
              </div>
              <RadioGroup
                onValueChange={(value) => setAgent(value as AgentOption)}
                aria-labelledby="wt-agent-label"
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px',
                }}
              >
                {AGENT_OPTIONS.map((option) => {
                  const isSelected = agent === option.value;
                  return (
                    <label
                      key={option.value}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        padding: '12px',
                        borderRadius: '6px',
                        border: `1px solid ${isSelected ? 'hsl(var(--primary))' : 'hsl(var(--border))'}`,
                        backgroundColor: isSelected ? 'hsl(var(--primary) / 0.1)' : 'transparent',
                        cursor: isSubmitting ? 'not-allowed' : 'pointer',
                        transition: 'all 0.15s ease',
                      }}
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

            {/* Action buttons */}
            <div
              style={{
                display: 'flex',
                gap: '8px',
                justifyContent: 'flex-end',
                marginTop: '24px',
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
                    Saving...
                  </>
                ) : (
                  <>
                    <i className="ri-save-line" style={{ fontSize: '16px' }} />
                    Save
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
