import * as React from 'react';
import { Input as BaseInput } from '@base-ui/react/input';
import { Checkbox } from '@base-ui/react/checkbox';

export const Input = React.forwardRef<HTMLInputElement, BaseInput.Props>(
  ({ className = '', ...props }, ref) => {
    return (
      <BaseInput
        ref={ref}
        className={`ymir-input ${className}`.trim()}
        {...props}
      />
    );
  },
);

Input.displayName = 'Input';

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className = '', ...props }, ref) => {
    return (
      <textarea
        ref={ref}
        className={`ymir-textarea ${className}`.trim()}
        {...props}
      />
    );
  },
);

Textarea.displayName = 'Textarea';

export const CheckboxComponent = React.forwardRef<HTMLButtonElement, Checkbox.Root.Props>(
  ({ className = '', ...props }, ref) => {
    return (
      <Checkbox.Root
        ref={ref}
        className={`ymir-checkbox ${className}`.trim()}
        {...props}
      >
        <Checkbox.Indicator className="ymir-checkbox-indicator">
          <span>✓</span>
        </Checkbox.Indicator>
      </Checkbox.Root>
    );
  },
);

CheckboxComponent.displayName = 'Checkbox';

export { CheckboxComponent as Checkbox };
