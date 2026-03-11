import * as React from 'react';
import { Tabs } from '@base-ui/react/tabs';

export const TabsRoot = React.forwardRef<HTMLDivElement, Tabs.Root.Props>(
  ({ className = '', ...props }, ref) => {
    return (
      <Tabs.Root
        ref={ref}
        className={`ymir-tabs-root ${className}`.trim()}
        {...props}
      />
    );
  },
);

TabsRoot.displayName = 'Tabs.Root';

export const TabsList = React.forwardRef<HTMLDivElement, Tabs.List.Props>(
  ({ className = '', ...props }, ref) => {
    return (
      <Tabs.List
        ref={ref}
        className={`ymir-tabs-list ${className}`.trim()}
        {...props}
      />
    );
  },
);

TabsList.displayName = 'Tabs.List';

export const TabsTab = React.forwardRef<HTMLButtonElement, Tabs.Tab.Props>(
  ({ className = '', ...props }, ref) => {
    return (
      <Tabs.Tab
        ref={ref}
        className={`ymir-tabs-tab ${className}`.trim()}
        {...props}
      />
    );
  },
);

TabsTab.displayName = 'Tabs.Tab';

export const TabsPanel = React.forwardRef<HTMLDivElement, Tabs.Panel.Props>(
  ({ className = '', ...props }, ref) => {
    return (
      <Tabs.Panel
        ref={ref}
        className={`ymir-tabs-panel ${className}`.trim()}
        {...props}
      />
    );
  },
);

TabsPanel.displayName = 'Tabs.Panel';

export const TabsIndicator = React.forwardRef<HTMLDivElement, Tabs.Indicator.Props>(
  ({ className = '', ...props }, ref) => {
    return (
      <Tabs.Indicator
        ref={ref}
        className={`ymir-tabs-indicator ${className}`.trim()}
        {...props}
      />
    );
  },
);

TabsIndicator.displayName = 'Tabs.Indicator';
