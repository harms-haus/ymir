import React from 'react';
import { AlertDialog as BaseAlertDialog } from '@base-ui/react/alert-dialog';
import type { AlertDialogRootChangeEventDetails } from '@base-ui/react/alert-dialog';

export type AlertDialogVariant = 'default' | 'destructive';

export interface AlertDialogProps {
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel?: string;
  variant?: AlertDialogVariant;
  onConfirm: () => void;
  onCancel?: () => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const variantIcon: Record<AlertDialogVariant, string> = {
  default: 'ri-question-line',
  destructive: 'ri-alert-line',
};

const variantConfirmColor: Record<AlertDialogVariant, { backgroundColor: string; color: string }> = {
  default: {
    backgroundColor: 'hsl(var(--primary))',
    color: 'hsl(var(--primary-foreground))',
  },
  destructive: {
    backgroundColor: 'hsl(var(--destructive))',
    color: 'hsl(var(--destructive-foreground))',
  },
};

export const AlertDialog: React.FC<AlertDialogProps> = ({
  title,
  description,
  confirmLabel,
  cancelLabel = 'Cancel',
  variant = 'default',
  onConfirm,
  onCancel,
  open,
  onOpenChange,
}) => {
  const handleOpenChange = React.useCallback(
    (_isOpen: boolean, eventDetails: AlertDialogRootChangeEventDetails) => {
      onOpenChange(_isOpen);

      if (!_isOpen && 'event' in eventDetails && eventDetails.event instanceof KeyboardEvent) {
        onCancel?.();
      }
    },
    [onOpenChange, onCancel]
  );

  const handleConfirm = React.useCallback(() => {
    onConfirm();
    onOpenChange(false);
  }, [onConfirm, onOpenChange]);

  const handleCancel = React.useCallback(() => {
    onCancel?.();
    onOpenChange(false);
  }, [onCancel, onOpenChange]);

  const handleKeyDown = React.useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        handleCancel();
      }
    },
    [handleCancel]
  );

  if (!open) {
    return null;
  }

  return (
    <BaseAlertDialog.Root open={open} onOpenChange={handleOpenChange}>
      <BaseAlertDialog.Portal>
        <BaseAlertDialog.Backdrop
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            zIndex: 9998,
          }}
        />
        <BaseAlertDialog.Viewport
          style={{
            position: 'fixed',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
          }}
          onKeyDown={handleKeyDown}
        >
          <BaseAlertDialog.Popup
            style={{
              backgroundColor: 'hsl(var(--card))',
              border: '1px solid hsl(var(--border))',
              borderRadius: '8px',
              boxShadow: '0 4px 20px rgba(0, 0, 0, 0.25)',
              maxWidth: '400px',
              width: '90%',
              padding: '24px',
            }}
            role="alertdialog"
            aria-modal="true"
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                marginBottom: '8px',
              }}
            >
              <i
                className={variantIcon[variant]}
                style={{
                  fontSize: '24px',
                  color:
                    variant === 'destructive'
                      ? 'hsl(var(--destructive))'
                      : 'hsl(var(--primary))',
                }}
              />
              <BaseAlertDialog.Title
                style={{
                  fontSize: '18px',
                  fontWeight: 600,
                  color: 'hsl(var(--foreground))',
                  margin: 0,
                }}
              >
                {title}
              </BaseAlertDialog.Title>
            </div>

            <BaseAlertDialog.Description
              style={{
                fontSize: '14px',
                color: 'hsl(var(--muted-foreground))',
                lineHeight: 1.5,
                marginBottom: '24px',
                marginTop: '8px',
              }}
            >
              {description}
            </BaseAlertDialog.Description>

            <div
              style={{
                display: 'flex',
                justifyContent: 'flex-end',
                gap: '12px',
              }}
            >
              <BaseAlertDialog.Close
                onClick={handleCancel}
                style={{
                  padding: '8px 16px',
                  fontSize: '14px',
                  fontWeight: 500,
                  borderRadius: '6px',
                  border: '1px solid hsl(var(--border))',
                  backgroundColor: 'hsl(var(--secondary))',
                  color: 'hsl(var(--secondary-foreground))',
                  cursor: 'pointer',
                  transition: 'background-color 0.2s',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = 'hsl(var(--secondary) / 0.8)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'hsl(var(--secondary))';
                }}
              >
                {cancelLabel}
              </BaseAlertDialog.Close>

              <button
                type="button"
                onClick={handleConfirm}
                style={{
                  padding: '8px 16px',
                  fontSize: '14px',
                  fontWeight: 500,
                  borderRadius: '6px',
                  border: 'none',
                  cursor: 'pointer',
                  transition: 'opacity 0.2s',
                  ...variantConfirmColor[variant],
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.opacity = '0.9';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.opacity = '1';
                }}
              >
                {confirmLabel}
              </button>
            </div>
          </BaseAlertDialog.Popup>
        </BaseAlertDialog.Viewport>
      </BaseAlertDialog.Portal>
    </BaseAlertDialog.Root>
  );
};

export default AlertDialog;
