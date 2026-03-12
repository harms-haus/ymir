import * as React from 'react';
import { Toast } from '@base-ui/react/toast';

export const ToastProvider = Toast.Provider;

export const ToastPortal = Toast.Portal;

export const ToastViewport = React.forwardRef<HTMLDivElement, Toast.Viewport.Props>(
  ({ className = '', ...props }, ref) => {
    return (
      <Toast.Viewport
        ref={ref}
        className={`ymir-toast-viewport ${className}`.trim()}
        {...props}
      />
    );
  },
);

ToastViewport.displayName = 'Toast.Viewport';

export const ToastRoot = React.forwardRef<HTMLDivElement, Toast.Root.Props>(
  ({ className = '', ...props }, ref) => {
    return (
      <Toast.Root
        ref={ref}
        className={`ymir-toast-root ${className}`.trim()}
        {...props}
      />
    );
  },
);

ToastRoot.displayName = 'Toast.Root';

export const ToastContent = Toast.Content;

export const ToastTitle = React.forwardRef<HTMLHeadingElement, Toast.Title.Props>(
  ({ className = '', ...props }, ref) => {
    return (
      <Toast.Title
        ref={ref}
        className={`ymir-toast-title ${className}`.trim()}
        {...props}
      />
    );
  },
);

ToastTitle.displayName = 'Toast.Title';

export const ToastDescription = React.forwardRef<HTMLParagraphElement, Toast.Description.Props>(
  ({ className = '', ...props }, ref) => {
    return (
      <Toast.Description
        ref={ref}
        className={`ymir-toast-description ${className}`.trim()}
        {...props}
      />
    );
  },
);

ToastDescription.displayName = 'Toast.Description';

export const ToastAction = Toast.Action;

export const ToastClose = React.forwardRef<HTMLButtonElement, Toast.Close.Props>(
  ({ className = '', ...props }, ref) => {
    return (
      <Toast.Close
        ref={ref}
        className={`ymir-toast-close ${className}`.trim()}
        {...props}
      />
    );
  },
);

ToastClose.displayName = 'Toast.Close';

export const ToastPositioner = Toast.Positioner;

export const useToastManager = Toast.useToastManager;
export const createToastManager = Toast.createToastManager;
