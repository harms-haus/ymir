import * as React from 'react';
import { Button as BaseButton } from '@base-ui/react/button';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../../lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center font-medium transition-colors focus-visible:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-50 disabled:cursor-not-allowed',
  {
    variants: {
      variant: {
        default: 'border bg-[var(--background-tertiary)] text-[var(--foreground)] hover:bg-[var(--background-hover)] border-[var(--border-secondary)]',
        primary: 'border bg-[var(--background-tertiary)] text-[var(--foreground)] hover:bg-[var(--background-hover)] border-[var(--border-secondary)]',
        secondary: 'border bg-[var(--background-secondary)] text-[var(--foreground)] hover:bg-[var(--background-hover)] border-[var(--border-secondary)]',
        ghost: 'border border-[var(--border-secondary)] bg-transparent text-[var(--foreground)] hover:bg-[var(--background-hover)]',
        destructive: 'bg-[var(--destructive)] text-white hover:opacity-90',
        icon: 'text-[var(--foreground)] hover:text-[var(--foreground-active)]',
      },
      size: {
        sm: 'h-8 px-2 text-xs rounded-[var(--radius-sm)]',
        md: 'h-9 px-3 text-sm rounded-[var(--radius-md)]',
        lg: 'h-10 px-4 text-sm rounded-[var(--radius-md)]',
        icon: 'h-9 w-9 rounded-md',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'md',
    },
  }
);

export type ButtonVariant = 'default' | 'primary' | 'secondary' | 'ghost' | 'destructive' | 'icon';
export type ButtonSize = 'sm' | 'md' | 'lg' | 'icon';

export interface ButtonProps extends React.ComponentPropsWithoutRef<typeof BaseButton>, VariantProps<typeof buttonVariants> {}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => {
    return (
      <BaseButton
        ref={ref}
        className={cn(buttonVariants({ variant, size, className }))}
        {...props}
      />
    );
  }
);

Button.displayName = 'Button';

export { buttonVariants };
