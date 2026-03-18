import { useState, useEffect, useCallback, useRef } from 'react';
import { Dialog } from '@base-ui/react/dialog';
import { useStore, selectWorkspaceById } from '../../store';
import { getWebSocketClient } from '../../lib/ws';
import type { WorkspaceUpdate, WorkspaceUpdated, WorkspaceDeleted, Error as ErrorMessage } from '../../types/protocol';

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

interface WorkspaceSettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspaceId: string | null;
}

export function WorkspaceSettingsDialog({
  open,
  onOpenChange,
  workspaceId,
}: WorkspaceSettingsDialogProps) {
  const workspace = useStore((state) =>
    workspaceId ? selectWorkspaceById(workspaceId)(state) : null
  );
  const worktrees = useStore((state) => state.worktrees);
  const addNotification = useStore((state) => state.addNotification);

  const [name, setName] = useState('');
  const [rootPath, setRootPath] = useState('');
  const [color, setColor] = useState('');
  const [icon, setIcon] = useState('');
  const [worktreeBaseDir, setWorktreeBaseDir] = useState('.worktrees/');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const updateUnsubscribeRef = useRef<(() => void) | null>(null);
  const deleteUnsubscribeRef = useRef<(() => void) | null>(null);
  const updateTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const deleteTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (open && workspace) {
      setName(workspace.name);
      setRootPath(workspace.rootPath);
      setColor(workspace.color || PRESET_COLORS[4].value);
      setIcon(workspace.icon || PRESET_ICONS[0]);
      setWorktreeBaseDir(workspace.worktreeBaseDir || '.worktrees/');
      setIsSubmitting(false);
      setShowDeleteConfirm(false);
    }

    return () => {
      if (updateUnsubscribeRef.current) {
        updateUnsubscribeRef.current();
        updateUnsubscribeRef.current = null;
      }
      if (deleteUnsubscribeRef.current) {
        deleteUnsubscribeRef.current();
        deleteUnsubscribeRef.current = null;
      }
      if (updateTimeoutRef.current) {
        clearTimeout(updateTimeoutRef.current);
        updateTimeoutRef.current = null;
      }
      if (deleteTimeoutRef.current) {
        clearTimeout(deleteTimeoutRef.current);
        deleteTimeoutRef.current = null;
      }
    };
  }, [open, workspace]);

  const workspaceWorktrees = workspaceId
    ? worktrees.filter((wt) => wt.workspaceId === workspaceId)
    : [];

  const handleSave = useCallback(async () => {
    if (!workspace || !workspaceId) return;

    if (updateUnsubscribeRef.current) {
      updateUnsubscribeRef.current();
      updateUnsubscribeRef.current = null;
    }
    if (updateTimeoutRef.current) {
      clearTimeout(updateTimeoutRef.current);
      updateTimeoutRef.current = null;
    }

    setIsSubmitting(true);

    try {
      const client = getWebSocketClient();

      const message: WorkspaceUpdate = {
        type: 'WorkspaceUpdate',
        workspaceId,
        color,
        icon,
        worktreeBaseDir,
      };

      client.send(message);

      const unsubscribe = client.onMessage('WorkspaceUpdated', (msg: WorkspaceUpdated) => {
        if (msg.workspace?.id === workspaceId) {
          setIsSubmitting(false);
          onOpenChange(false);
          addNotification({
            level: 'info',
            message: 'Settings saved',
          });

          if (updateUnsubscribeRef.current) {
            updateUnsubscribeRef.current();
            updateUnsubscribeRef.current = null;
          }
          if (updateTimeoutRef.current) {
            clearTimeout(updateTimeoutRef.current);
            updateTimeoutRef.current = null;
          }
        }
      });

      updateUnsubscribeRef.current = unsubscribe;

      client.onMessage('Error', (msg: ErrorMessage) => {
        setIsSubmitting(false);
        addNotification({
          level: 'error',
          message: msg.message || 'Failed to save settings',
        });

        if (updateUnsubscribeRef.current) {
          updateUnsubscribeRef.current();
          updateUnsubscribeRef.current = null;
        }
        if (updateTimeoutRef.current) {
          clearTimeout(updateTimeoutRef.current);
          updateTimeoutRef.current = null;
        }
      });

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
        message: error instanceof Error ? error.message : 'Failed to save settings',
      });
    }
  }, [workspace, workspaceId, color, icon, worktreeBaseDir, onOpenChange, addNotification]);

  const handleDeleteClick = useCallback(() => {
    if (workspaceWorktrees.length > 0) {
      addNotification({
        level: 'error',
        message: `This workspace has ${workspaceWorktrees.length} worktree${workspaceWorktrees.length > 1 ? 's' : ''}. Delete all worktrees first.`,
      });
      return;
    }
    setShowDeleteConfirm(true);
  }, [workspaceWorktrees.length, addNotification]);

  const handleDeleteConfirm = useCallback(async () => {
    if (!workspaceId) return;

    if (deleteUnsubscribeRef.current) {
      deleteUnsubscribeRef.current();
      deleteUnsubscribeRef.current = null;
    }
    if (deleteTimeoutRef.current) {
      clearTimeout(deleteTimeoutRef.current);
      deleteTimeoutRef.current = null;
    }

    setIsSubmitting(true);

    try {
      const client = getWebSocketClient();

      client.send({
        type: 'WorkspaceDelete',
        workspaceId,
      });

      const unsubscribe = client.onMessage('WorkspaceDeleted', (msg: WorkspaceDeleted) => {
        if (msg.workspaceId === workspaceId) {
          setIsSubmitting(false);
          onOpenChange(false);
          addNotification({
            level: 'info',
            message: 'Workspace deleted',
          });

          if (deleteUnsubscribeRef.current) {
            deleteUnsubscribeRef.current();
            deleteUnsubscribeRef.current = null;
          }
          if (deleteTimeoutRef.current) {
            clearTimeout(deleteTimeoutRef.current);
            deleteTimeoutRef.current = null;
          }
        }
      });

      deleteUnsubscribeRef.current = unsubscribe;

      client.onMessage('Error', (msg: ErrorMessage) => {
        setIsSubmitting(false);
        addNotification({
          level: 'error',
          message: msg.message || 'Failed to delete workspace',
        });

        if (deleteUnsubscribeRef.current) {
          deleteUnsubscribeRef.current();
          deleteUnsubscribeRef.current = null;
        }
        if (deleteTimeoutRef.current) {
          clearTimeout(deleteTimeoutRef.current);
          deleteTimeoutRef.current = null;
        }
      });

      deleteTimeoutRef.current = setTimeout(() => {
        setIsSubmitting(false);
        addNotification({
          level: 'error',
          message: 'Operation timed out',
        });

        if (deleteUnsubscribeRef.current) {
          deleteUnsubscribeRef.current();
          deleteUnsubscribeRef.current = null;
        }
      }, 30000);
    } catch (error) {
      setIsSubmitting(false);
      addNotification({
        level: 'error',
        message: error instanceof Error ? error.message : 'Failed to delete workspace',
      });
    }
  }, [workspaceId, onOpenChange, addNotification]);

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

  if (!open || !workspace) {
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
            Workspace Settings
          </Dialog.Title>

          <Dialog.Description
            style={{
              margin: '0 0 20px 0',
              fontSize: '14px',
              color: 'hsl(var(--muted-foreground))',
            }}
          >
            Configure workspace properties
          </Dialog.Description>

          <form onSubmit={handleSubmit}>
            <div style={{ marginBottom: '16px' }}>
              <label
                htmlFor="ws-name"
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
                id="ws-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
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

            <div style={{ marginBottom: '16px' }}>
              <label
                htmlFor="ws-root-path"
                style={{
                  display: 'block',
                  marginBottom: '6px',
                  fontSize: '14px',
                  fontWeight: 500,
                  color: 'hsl(var(--foreground))',
                }}
              >
                Root Path
              </label>
              <div style={{ display: 'flex', gap: '8px' }}>
                <input
                  id="ws-root-path"
                  type="text"
                  value={rootPath}
                  readOnly
                  disabled={isSubmitting}
                  style={{
                    flex: 1,
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
                <button
                  type="button"
                  disabled
                  style={{
                    padding: '10px 16px',
                    borderRadius: '6px',
                    border: '1px solid hsl(var(--border))',
                    backgroundColor: 'transparent',
                    color: 'hsl(var(--muted-foreground))',
                    fontSize: '14px',
                    cursor: 'not-allowed',
                    opacity: 0.6,
                  }}
                  title="Directory picker not yet implemented"
                >
                  Change
                </button>
              </div>
            </div>

            <div style={{ marginBottom: '16px' }}>
              <div
                id="ws-color-label"
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
                aria-labelledby="ws-color-label"
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

            <div style={{ marginBottom: '16px' }}>
              <div
                id="ws-icon-label"
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
                aria-labelledby="ws-icon-label"
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

            <div style={{ marginBottom: '24px' }}>
              <label
                htmlFor="ws-worktree-dir"
                style={{
                  display: 'block',
                  marginBottom: '6px',
                  fontSize: '14px',
                  fontWeight: 500,
                  color: 'hsl(var(--foreground))',
                }}
              >
                Worktree Base Directory
              </label>
              <input
                id="ws-worktree-dir"
                type="text"
                value={worktreeBaseDir}
                onChange={(e) => setWorktreeBaseDir(e.target.value)}
                placeholder=".worktrees/"
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
                }}
              />
              <span
                style={{
                  display: 'block',
                  marginTop: '4px',
                  fontSize: '12px',
                  color: 'hsl(var(--muted-foreground))',
                }}
              >
                Relative to root path
              </span>
            </div>

            <div
              style={{
                marginTop: '24px',
                padding: '16px',
                borderRadius: '8px',
                border: '1px solid hsl(var(--destructive) / 0.5)',
                backgroundColor: 'hsl(var(--destructive) / 0.1)',
              }}
            >
              <div
                style={{
                  fontSize: '14px',
                  fontWeight: 600,
                  color: 'hsl(var(--destructive))',
                  marginBottom: '12px',
                }}
              >
                Danger Zone
              </div>

              {!showDeleteConfirm ? (
                <button
                  type="button"
                  onClick={handleDeleteClick}
                  disabled={isSubmitting}
                  style={{
                    padding: '8px 16px',
                    borderRadius: '6px',
                    border: '1px solid hsl(var(--destructive))',
                    backgroundColor: 'transparent',
                    color: 'hsl(var(--destructive))',
                    cursor: isSubmitting ? 'not-allowed' : 'pointer',
                    fontSize: '14px',
                    opacity: isSubmitting ? 0.6 : 1,
                  }}
                >
                  Delete Workspace
                </button>
              ) : (
                <div>
                  <p
                    style={{
                      margin: '0 0 12px 0',
                      fontSize: '14px',
                      color: 'hsl(var(--foreground))',
                    }}
                  >
                    Delete workspace "{workspace.name}"? This cannot be undone.
                  </p>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                      type="button"
                      onClick={() => setShowDeleteConfirm(false)}
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
                      onClick={handleDeleteConfirm}
                      disabled={isSubmitting}
                      style={{
                        padding: '8px 16px',
                        borderRadius: '6px',
                        border: 'none',
                        backgroundColor: 'hsl(var(--destructive))',
                        color: 'white',
                        cursor: isSubmitting ? 'not-allowed' : 'pointer',
                        fontSize: '14px',
                        opacity: isSubmitting ? 0.6 : 1,
                      }}
                    >
                      {isSubmitting ? 'Deleting...' : 'Delete'}
                    </button>
                  </div>
                </div>
              )}
            </div>

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