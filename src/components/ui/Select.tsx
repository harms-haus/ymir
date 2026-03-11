import * as React from 'react';
import { Select } from '@base-ui/react/select';

export const SelectRoot = <Value, Multiple extends boolean | undefined = false>(
  props: Select.Root.Props<Value, Multiple>,
) => {
  return <Select.Root {...props} />;
};

SelectRoot.displayName = 'Select.Root';

export const SelectTrigger = React.forwardRef<HTMLButtonElement, Select.Trigger.Props>(
  ({ className = '', ...props }, ref) => {
    return (
      <Select.Trigger
        ref={ref}
        className={`ymir-select-trigger ${className}`.trim()}
        {...props}
      />
    );
  },
);

SelectTrigger.displayName = 'Select.Trigger';

export const SelectPortal = React.forwardRef<HTMLDivElement, Select.Portal.Props>(
  (props, ref) => {
    return <Select.Portal ref={ref} {...props} />;
  },
);

SelectPortal.displayName = 'Select.Portal';

export const SelectPositioner = React.forwardRef<HTMLDivElement, Select.Positioner.Props>(
  ({ className = '', ...props }, ref) => {
    return (
      <Select.Positioner
        ref={ref}
        className={`ymir-select-positioner ${className}`.trim()}
        {...props}
      />
    );
  },
);

SelectPositioner.displayName = 'Select.Positioner';

export const SelectPopup = React.forwardRef<HTMLDivElement, Select.Popup.Props>(
  ({ className = '', ...props }, ref) => {
    return (
      <Select.Popup
        ref={ref}
        className={`ymir-select-popup ${className}`.trim()}
        {...props}
      />
    );
  },
);

SelectPopup.displayName = 'Select.Popup';

export const SelectList = React.forwardRef<HTMLDivElement, Select.List.Props>(
  ({ className = '', ...props }, ref) => {
    return (
      <Select.List
        ref={ref}
        className={`ymir-select-list ${className}`.trim()}
        {...props}
      />
    );
  },
);

SelectList.displayName = 'Select.List';

export const SelectListItem = React.forwardRef<HTMLLIElement, Select.Item.Props>(
  ({ className = '', ...props }, ref) => {
    return (
      <Select.Item
        ref={ref}
        className={`ymir-select-item ${className}`.trim()}
        {...props}
      />
    );
  },
);

SelectListItem.displayName = 'Select.Item';

export const SelectValue = React.forwardRef<HTMLSpanElement, Select.Value.Props>(
  ({ className = '', ...props }, ref) => {
    return (
      <Select.Value
        ref={ref}
        className={`ymir-select-value ${className}`.trim()}
        {...props}
      />
    );
  },
);

SelectValue.displayName = 'Select.Value';
