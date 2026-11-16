import React from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '../../lib/utils';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'destructive' | 'outline' | 'secondary' | 'ghost' | 'link' | 'success';
  size?: 'default' | 'sm' | 'lg' | 'icon';
  isLoading?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'default', size = 'default', isLoading = false, children, disabled, ...props }, ref) => {
    const baseStyles = 'inline-flex items-center justify-center font-semibold rounded-lg text-xs transition active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 disabled:pointer-events-none disabled:opacity-50 select-none';

    const variants = {
      default: 'bg-accent-600 text-accent-foreground hover:bg-accent-500 active:bg-accent-700 shadow-sm',
      destructive: 'bg-rose-600 text-white hover:bg-rose-500 active:bg-rose-700 shadow-sm',
      outline: 'border border-surface-border bg-surface-subtle hover:bg-surface-cardHover text-slate-200',
      secondary: 'border border-surface-border bg-surface-card hover:bg-surface-cardHover text-slate-200',
      ghost: 'text-surface-muted hover:text-slate-100 hover:bg-surface-card',
      link: 'text-accent-500 underline-offset-4 hover:underline p-0 h-auto font-normal',
      success: 'bg-emerald-600 text-white hover:bg-emerald-500 active:bg-emerald-700 shadow-sm',
    };

    const sizes = {
      default: 'h-9 px-3.5 py-1.5 gap-2',
      sm: 'h-8 rounded-lg px-3 text-xs gap-1.5',
      lg: 'h-11 rounded-xl px-5 text-sm gap-2',
      icon: 'h-8 w-8 p-0',
    };

    return (
      <button
        ref={ref}
        className={cn(baseStyles, variants[variant], sizes[size], className)}
        disabled={disabled || isLoading}
        {...props}
      >
        {isLoading && <Loader2 className="h-3.5 w-3.5 animate-spin text-current" />}
        {children}
      </button>
    );
  }
);

Button.displayName = 'Button';
