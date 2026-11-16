import React from 'react';
import { AlertCircle, CheckCircle2, Info, AlertTriangle } from 'lucide-react';
import { cn } from '../../lib/utils';

export interface AlertProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'destructive' | 'success' | 'warning' | 'info';
  title?: string;
}

export function Alert({
  className,
  variant = 'default',
  title,
  children,
  ...props
}: AlertProps) {
  const variants = {
    default: 'bg-surface-card border-surface-border text-slate-200',
    destructive: 'bg-rose-950/20 border-rose-900/40 text-rose-200',
    success: 'bg-emerald-950/20 border-emerald-900/40 text-emerald-200',
    warning: 'bg-amber-950/20 border-amber-900/40 text-amber-200',
    info: 'bg-accent-950/20 border-accent-900/40 text-accent-200',
  };

  const icons = {
    default: <Info className="h-4 w-4 text-surface-muted mt-0.5 shrink-0" />,
    destructive: <AlertCircle className="h-4 w-4 text-rose-400 mt-0.5 shrink-0" />,
    success: <CheckCircle2 className="h-4 w-4 text-emerald-400 mt-0.5 shrink-0" />,
    warning: <AlertTriangle className="h-4 w-4 text-amber-400 mt-0.5 shrink-0" />,
    info: <Info className="h-4 w-4 text-accent-400 mt-0.5 shrink-0" />,
  };

  return (
    <div
      role="alert"
      className={cn(
        'relative flex w-full gap-3 rounded-xl border p-3.5 text-xs leading-relaxed shadow-sm',
        variants[variant],
        className
      )}
      {...props}
    >
      <div className="flex-shrink-0">{icons[variant]}</div>
      <div className="flex-1 min-w-0">
        {title && <h5 className="font-bold tracking-tight text-white mb-0.5 text-xs">{title}</h5>}
        <div className="text-xs opacity-90">{children}</div>
      </div>
    </div>
  );
}
