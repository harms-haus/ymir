import * as React from 'react';
import { Dialog } from '@base-ui/react/dialog';
import { AlertDialog } from '@base-ui/react/alert-dialog';

export const DialogRoot = (props: Dialog.Root.Props) => {
  return <Dialog.Root {...props} />;
};

DialogRoot.displayName = 'Dialog.Root';

export const DialogTrigger = React.forwardRef<HTMLButtonElement, Dialog.Trigger.Props>(
  ({ className = '', ...props }, ref) => {
    return (
      <Dialog.Trigger
        ref={ref}
        className={`ymir-dialog-trigger ${className}`.trim()}
        {...props}
      />
    );
  },
);

DialogTrigger.displayName = 'Dialog.Trigger';

export const DialogPortal = React.forwardRef<HTMLDivElement, Dialog.Portal.Props>(
  (props, ref) => {
    return <Dialog.Portal ref={ref} {...props} />;
  },
);

DialogPortal.displayName = 'Dialog.Portal';

export const DialogPopup = React.forwardRef<HTMLDivElement, Dialog.Popup.Props>(
  ({ className = '', ...props }, ref) => {
    return (
      <Dialog.Popup
        ref={ref}
        className={`ymir-dialog-popup ${className}`.trim()}
        {...props}
      />
    );
  },
);

DialogPopup.displayName = 'Dialog.Popup';

export const DialogTitle = React.forwardRef<HTMLHeadingElement, Dialog.Title.Props>(
  ({ className = '', ...props }, ref) => {
    return (
      <Dialog.Title
        ref={ref}
        className={`ymir-dialog-title ${className}`.trim()}
        {...props}
      />
    );
  },
);

DialogTitle.displayName = 'Dialog.Title';

export const DialogDescription = React.forwardRef<HTMLParagraphElement, Dialog.Description.Props>(
  ({ className = '', ...props }, ref) => {
    return (
      <Dialog.Description
        ref={ref}
        className={`ymir-dialog-description ${className}`.trim()}
        {...props}
      />
    );
  },
);

DialogDescription.displayName = 'Dialog.Description';

export const DialogClose = React.forwardRef<HTMLButtonElement, Dialog.Close.Props>(
  ({ className = '', ...props }, ref) => {
    return (
      <Dialog.Close
        ref={ref}
        className={`ymir-dialog-close ${className}`.trim()}
        {...props}
      />
    );
  },
);

DialogClose.displayName = 'Dialog.Close';

export const AlertDialogRoot = (props: AlertDialog.Root.Props) => {
  return <AlertDialog.Root {...props} />;
};

AlertDialogRoot.displayName = 'AlertDialog.Root';

export const AlertDialogTrigger = React.forwardRef<HTMLButtonElement, AlertDialog.Trigger.Props>(
  ({ className = '', ...props }, ref) => {
    return (
      <AlertDialog.Trigger
        ref={ref}
        className={`ymir-alert-dialog-trigger ${className}`.trim()}
        {...props}
      />
    );
  },
);

AlertDialogTrigger.displayName = 'AlertDialog.Trigger';

export const AlertDialogPopup = React.forwardRef<HTMLDivElement, AlertDialog.Popup.Props>(
  ({ className = '', ...props }, ref) => {
    return (
      <AlertDialog.Popup
        ref={ref}
        className={`ymir-alert-dialog-popup ${className}`.trim()}
        {...props}
      />
    );
  },
);

AlertDialogPopup.displayName = 'AlertDialog.Popup';

export const AlertDialogTitle = React.forwardRef<HTMLHeadingElement, AlertDialog.Title.Props>(
  ({ className = '', ...props }, ref) => {
    return (
      <AlertDialog.Title
        ref={ref}
        className={`ymir-alert-dialog-title ${className}`.trim()}
        {...props}
      />
    );
  },
);

AlertDialogTitle.displayName = 'AlertDialog.Title';

export const AlertDialogDescription = React.forwardRef<HTMLParagraphElement, AlertDialog.Description.Props>(
  ({ className = '', ...props }, ref) => {
    return (
      <AlertDialog.Description
        ref={ref}
        className={`ymir-alert-dialog-description ${className}`.trim()}
        {...props}
      />
    );
  },
);

AlertDialogDescription.displayName = 'AlertDialog.Description';
