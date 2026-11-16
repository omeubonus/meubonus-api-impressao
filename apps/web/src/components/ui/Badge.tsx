import React from 'react';
import { cn } from '../../lib/utils';

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'secondary' | 'destructive' | 'outline' | 'success' | 'warning' | 'info';
}

export function Badge({ className, variant = 'default', ...props }: BadgeProps) {
  const variants = {
    default: 'bg-accent-600/15 text-accent-500 border-accent-600/30',
    secondary: 'bg-surface-subtle text-surface-muted border-surface-border',
    destructive: 'bg-rose-950/40 text-rose-400 border-rose-500/30',
    outline: 'text-surface-muted border-surface-border bg-transparent',
    success: 'bg-emerald-950/40 text-emerald-400 border-emerald-500/30',
    warning: 'bg-amber-950/40 text-amber-400 border-amber-500/30',
    info: 'bg-accent-950/40 text-accent-400 border-accent-500/30',
  };

  return (
    <div
      className={cn(
        'inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider border transition-colors select-none',
        variants[variant],
        className
      )}
      {...props}
    />
  );
}
