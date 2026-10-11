import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cn } from '../utils';

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'destructive';
  size?: 'sm' | 'md' | 'lg';
  asChild?: boolean;
}

const variantClass: Record<NonNullable<ButtonProps['variant']>, string> = {
  primary: 'btn-primary',
  secondary: 'btn-secondary',
  outline: 'btn-outline',
  ghost: 'btn-ghost',
  destructive: 'btn-destructive',
};

const sizeClass: Record<NonNullable<ButtonProps['size']>, string> = {
  sm: 'text-xs px-2 py-1',
  md: 'text-sm px-4 py-3',
  lg: 'text-lg px-6 py-4',
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    { className, variant = 'primary', size = 'md', asChild = false, ...props },
    ref
  ) => {
    const Comp = asChild ? Slot : 'button';
    return (
      <Comp
        ref={ref}
        className={cn(
          'btn',
          variantClass[variant],
          sizeClass[size],
          className ?? ''
        )}
        {...props}
      />
    );
  }
);

Button.displayName = 'Button';
