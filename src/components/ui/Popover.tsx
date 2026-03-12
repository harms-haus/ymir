import * as React from 'react';
import { Popover } from '@base-ui/react/popover';

export const PopoverRoot = (props: Popover.Root.Props) => {
  return <Popover.Root {...props} />;
};

PopoverRoot.displayName = 'Popover.Root';

export const PopoverTrigger = React.forwardRef<HTMLButtonElement, Popover.Trigger.Props>(
  ({ className = '', ...props }, ref) => {
    return (
      <Popover.Trigger
        ref={ref}
        className={`ymir-popover-trigger ${className}`.trim()}
        {...props}
      />
    );
  },
);

PopoverTrigger.displayName = 'Popover.Trigger';

export const PopoverPortal = React.forwardRef<HTMLDivElement, Popover.Portal.Props>(
  (props, ref) => {
    return <Popover.Portal ref={ref} {...props} />;
  },
);

PopoverPortal.displayName = 'Popover.Portal';

export const PopoverPositioner = React.forwardRef<HTMLDivElement, Popover.Positioner.Props>(
  ({ className = '', ...props }, ref) => {
    return (
      <Popover.Positioner
        ref={ref}
        className={`ymir-popover-positioner ${className}`.trim()}
        {...props}
      />
    );
  },
);

PopoverPositioner.displayName = 'Popover.Positioner';

export const PopoverPopup = React.forwardRef<HTMLDivElement, Popover.Popup.Props>(
  ({ className = '', ...props }, ref) => {
    return (
      <Popover.Popup
        ref={ref}
        className={`ymir-popover-popup ${className}`.trim()}
        {...props}
      />
    );
  },
);

PopoverPopup.displayName = 'Popover.Popup';

export const PopoverTitle = React.forwardRef<HTMLHeadingElement, Popover.Title.Props>(
  ({ className = '', ...props }, ref) => {
    return (
      <Popover.Title
        ref={ref}
        className={`ymir-popover-title ${className}`.trim()}
        {...props}
      />
    );
  },
);

PopoverTitle.displayName = 'Popover.Title';

export const PopoverDescription = React.forwardRef<HTMLParagraphElement, Popover.Description.Props>(
  ({ className = '', ...props }, ref) => {
    return (
      <Popover.Description
        ref={ref}
        className={`ymir-popover-description ${className}`.trim()}
        {...props}
      />
    );
  },
);

PopoverDescription.displayName = 'Popover.Description';

export const PopoverClose = React.forwardRef<HTMLButtonElement, Popover.Close.Props>(
  ({ className = '', ...props }, ref) => {
    return (
      <Popover.Close
        ref={ref}
        className={`ymir-popover-close ${className}`.trim()}
        {...props}
      />
    );
  },
);

PopoverClose.displayName = 'Popover.Close';

export const PopoverArrow = React.forwardRef<HTMLDivElement, Popover.Arrow.Props>(
  ({ className = '', ...props }, ref) => {
    return (
      <Popover.Arrow
        ref={ref}
        className={`ymir-popover-arrow ${className}`.trim()}
        {...props}
      />
    );
  },
);

PopoverArrow.displayName = 'Popover.Arrow';
