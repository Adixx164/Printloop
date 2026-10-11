import { forwardRef, ButtonHTMLAttributes } from 'react';
import { LucideIcons } from '../components/LucideIcons';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  leftIcon?: string;
  rightIcon?: string;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'primary', size = 'md', loading, leftIcon, rightIcon, children, className = '', disabled, ...props }, ref) => {
    const baseStyles = 'inline-flex items-center justify-center font-medium rounded-lg border-2 transition-all focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed';
    
    const variantStyles = {
      primary: 'bg-ink text-paper border-ink hover:bg-ink/90 focus:ring-ink',
      secondary: 'bg-paper text-ink border-ink hover:bg-paper-light focus:ring-ink',
      ghost: 'bg-transparent text-ink border-transparent hover:bg-persimmon/10 text-persimmon focus:ring-persimmon',
      danger: 'bg-red-600 text-white border-red-600 hover:bg-red-700 focus:ring-red-500',
    };
    
    const sizeStyles = {
      sm: 'px-3 py-1.5 text-sm gap-1.5',
      md: 'px-5 py-2.5 text-base gap-2',
      lg: 'px-7 py-3 text-lg gap-2.5',
    };
    
    return (
      <button
        ref={ref}
        className={`${baseStyles} ${variantStyles[variant]} ${sizeStyles[size]} ${className}`}
        disabled={disabled || loading}
        {...props}
      >
        {loading && <LucideIcons name="loader" size={16} className="animate-spin" />}
        {!loading && leftIcon && <LucideIcons name={leftIcon} size={16} />}
        {children}
        {!loading && rightIcon && <LucideIcons name={rightIcon} size={16} />}
      </button>
    );
  }
);

Button.displayName = 'Button';

export default Button;