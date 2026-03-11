import * as React from 'react';
import { Tooltip } from '@base-ui/react/tooltip';

export const TooltipRoot = (props: Tooltip.Root.Props) => {
  return <Tooltip.Root {...props} />;
};

TooltipRoot.displayName = 'Tooltip.Root';

export const TooltipTrigger = React.forwardRef<HTMLButtonElement, Tooltip.Trigger.Props>(
  ({ className = '', ...props }, ref) => {
    return (
      <Tooltip.Trigger
        ref={ref}
        className={`ymir-tooltip-trigger ${className}`.trim()}
        {...props}
      />
    );
  },
);

TooltipTrigger.displayName = 'Tooltip.Trigger';

export const TooltipPortal = React.forwardRef<HTMLDivElement, Tooltip.Portal.Props>(
  (props, ref) => {
    return <Tooltip.Portal ref={ref} {...props} />;
  },
);

TooltipPortal.displayName = 'Tooltip.Portal';

export const TooltipPositioner = React.forwardRef<HTMLDivElement, Tooltip.Positioner.Props>(
  ({ className = '', ...props }, ref) => {
    return (
      <Tooltip.Positioner
        ref={ref}
        className={`ymir-tooltip-positioner ${className}`.trim()}
        {...props}
      />
    );
  },
);

TooltipPositioner.displayName = 'Tooltip.Positioner';

export const TooltipPopup = React.forwardRef<HTMLDivElement, Tooltip.Popup.Props>(
  ({ className = '', ...props }, ref) => {
    return (
      <Tooltip.Popup
        ref={ref}
        className={`ymir-tooltip-popup ${className}`.trim()}
        {...props}
      />
    );
  },
);

TooltipPopup.displayName = 'Tooltip.Popup';
