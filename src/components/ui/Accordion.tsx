import * as React from 'react';
import { Accordion } from '@base-ui/react/accordion';

export const AccordionRoot = React.forwardRef<HTMLDivElement, Accordion.Root.Props>(
  ({ className = '', ...props }, ref) => {
    return (
      <Accordion.Root
        ref={ref}
        className={`ymir-accordion-root ${className}`.trim()}
        {...props}
      />
    );
  },
);

AccordionRoot.displayName = 'Accordion.Root';

export const AccordionItem = React.forwardRef<HTMLDivElement, Accordion.Item.Props>(
  ({ className = '', ...props }, ref) => {
    return (
      <Accordion.Item
        ref={ref}
        className={`ymir-accordion-item ${className}`.trim()}
        {...props}
      />
    );
  },
);

AccordionItem.displayName = 'Accordion.Item';

export const AccordionHeader = React.forwardRef<HTMLDivElement, Accordion.Header.Props>(
  ({ className = '', ...props }, ref) => {
    return (
      <Accordion.Header
        ref={ref}
        className={`ymir-accordion-header ${className}`.trim()}
        {...props}
      />
    );
  },
);

AccordionHeader.displayName = 'Accordion.Header';

export const AccordionTrigger = React.forwardRef<HTMLButtonElement, Accordion.Trigger.Props>(
  ({ className = '', ...props }, ref) => {
    return (
      <Accordion.Trigger
        ref={ref}
        className={`ymir-accordion-trigger ${className}`.trim()}
        {...props}
      />
    );
  },
);

AccordionTrigger.displayName = 'Accordion.Trigger';

export const AccordionPanel = React.forwardRef<HTMLDivElement, Accordion.Panel.Props>(
  ({ className = '', ...props }, ref) => {
    return (
      <Accordion.Panel
        ref={ref}
        className={`ymir-accordion-panel ${className}`.trim()}
        {...props}
      />
    );
  },
);

AccordionPanel.displayName = 'Accordion.Panel';
