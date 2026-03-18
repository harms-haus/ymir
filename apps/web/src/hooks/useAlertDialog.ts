import { useCallback } from 'react';
import { useStore } from '../store';
import type { AlertDialogConfig } from '../types/state';

export const useAlertDialog = () => {
  const alertDialog = useStore((state) => state.alertDialog);
  const showAlertDialog = useStore((state) => state.showAlertDialog);
  const hideAlertDialog = useStore((state) => state.hideAlertDialog);

  const show = useCallback(
    (config: AlertDialogConfig) => {
      showAlertDialog(config);
    },
    [showAlertDialog]
  );

  const showDestructive = useCallback(
    (title: string, description: string, confirmLabel: string, onConfirm: () => void, onCancel?: () => void) => {
      showAlertDialog({
        title,
        description,
        confirmLabel,
        variant: 'destructive',
        onConfirm,
        onCancel,
      });
    },
    [showAlertDialog]
  );

  const showDefault = useCallback(
    (title: string, description: string, confirmLabel: string, onConfirm: () => void, onCancel?: () => void) => {
      showAlertDialog({
        title,
        description,
        confirmLabel,
        variant: 'default',
        onConfirm,
        onCancel,
      });
    },
    [showAlertDialog]
  );

  const hide = useCallback(() => {
    hideAlertDialog();
  }, [hideAlertDialog]);

  return {
    alertDialog,
    show,
    showDestructive,
    showDefault,
    hide,
  };
};