import * as React from 'react';
import { Tooltip as TooltipPrimitive } from '@base-ui/react/tooltip';
import { cn } from '@/lib/utils';

export interface TooltipProps {
  content: React.ReactNode;
  children: React.ReactNode;
  side?: 'top' | 'bottom' | 'left' | 'right';
  delay?: number;
}

export const Tooltip = ({ content, children, side = 'top', delay = 700 }: TooltipProps) => {
  return (
    <TooltipPrimitive.Provider delay={delay}>
      <TooltipPrimitive.Root>
<TooltipPrimitive.Trigger render={children as React.ReactElement} />
        <TooltipPrimitive.Portal>
          <TooltipPrimitive.Positioner side={side} sideOffset={8}>
            <TooltipPrimitive.Popup
              className={cn(
                'px-2 py-1 text-xs',
                'bg-[var(--background)] text-[var(--foreground-active)]',
                'border border-[var(--border-secondary)]',
                'rounded-[var(--radius-md)]',
                'shadow-[var(--shadow-md)]'
              )}
            >
              {content}
            </TooltipPrimitive.Popup>
          </TooltipPrimitive.Positioner>
        </TooltipPrimitive.Portal>
      </TooltipPrimitive.Root>
    </TooltipPrimitive.Provider>
  );
};

Tooltip.displayName = 'Tooltip';
