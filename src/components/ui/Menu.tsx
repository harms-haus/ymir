import * as React from 'react';
import { Menu } from '@base-ui/react/menu';

export const MenuRoot = (props: Menu.Root.Props) => {
  return <Menu.Root {...props} />;
};

MenuRoot.displayName = 'Menu.Root';

export const MenuTrigger = React.forwardRef<HTMLButtonElement, Menu.Trigger.Props>(
  ({ className = '', ...props }, ref) => {
    return (
      <Menu.Trigger
        ref={ref}
        className={`ymir-menu-trigger ${className}`.trim()}
        {...props}
      />
    );
  },
);

MenuTrigger.displayName = 'Menu.Trigger';

export const MenuPortal = React.forwardRef<HTMLDivElement, Menu.Portal.Props>(
  (props, ref) => {
    return <Menu.Portal ref={ref} {...props} />;
  },
);

MenuPortal.displayName = 'Menu.Portal';

export const MenuPositioner = React.forwardRef<HTMLDivElement, Menu.Positioner.Props>(
  ({ className = '', ...props }, ref) => {
    return (
      <Menu.Positioner
        ref={ref}
        className={`ymir-menu-positioner ${className}`.trim()}
        {...props}
      />
    );
  },
);

MenuPositioner.displayName = 'Menu.Positioner';

export const MenuPopup = React.forwardRef<HTMLDivElement, Menu.Popup.Props>(
  ({ className = '', ...props }, ref) => {
    return (
      <Menu.Popup
        ref={ref}
        className={`ymir-menu-popup ${className}`.trim()}
        {...props}
      />
    );
  },
);

MenuPopup.displayName = 'Menu.Popup';

export const MenuItem = React.forwardRef<HTMLDivElement, Menu.Item.Props>(
  ({ className = '', ...props }, ref) => {
    return (
      <Menu.Item
        ref={ref}
        className={`ymir-menu-item ${className}`.trim()}
        {...props}
      />
    );
  },
);

MenuItem.displayName = 'Menu.Item';
