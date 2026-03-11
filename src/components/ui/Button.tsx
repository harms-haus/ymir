import * as React from 'react';
import { Button as BaseButton } from '@base-ui/react/button';
import styles from './Button.module.css';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'destructive';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends Omit<React.ComponentPropsWithoutRef<'button'>, 'variant'> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', children, ...props }, ref) => {
    const variantClass = variant === 'primary' ? styles.primary :
                        variant === 'secondary' ? styles.secondary :
                        variant === 'ghost' ? styles.ghost :
                        styles.destructive;

    const sizeClass = size === 'sm' ? styles.sizeSm :
                     size === 'md' ? styles.sizeMd :
                     styles.sizeLg;

    return (
      <BaseButton
        ref={ref}
        className={`${styles.button} ${variantClass} ${sizeClass} ${className || ''}`}
        {...props}
      >
        {children}
      </BaseButton>
    );
  }
);

Button.displayName = 'Button';
