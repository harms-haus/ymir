import { useCallback } from 'react';
import { useToastStore } from '../store';
import { ToastVariant } from '../components/ui/Toast';

export const useToast = () => {
  const addNotification = useToastStore((state) => state.addNotification);

  const toast = useCallback(
    (variant: ToastVariant, title: string, description?: string, duration?: number) => {
      addNotification({ variant, title, description, duration });
    },
    [addNotification]
  );

  return {
    error: (title: string, description?: string, duration?: number) =>
      toast('error', title, description, duration),
    success: (title: string, description?: string, duration?: number) =>
      toast('success', title, description, duration),
    info: (title: string, description?: string, duration?: number) =>
      toast('info', title, description, duration)
  };
};
