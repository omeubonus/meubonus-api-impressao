import { Printer } from 'lucide-react';
import { useBranding } from '../context/BrandingContext';
import { cn } from '../lib/utils';

interface BrandLogoProps {
  variant?: 'sidebar' | 'hero' | 'header';
  className?: string;
}

export function BrandLogo({ variant = 'sidebar', className }: BrandLogoProps) {
  const { brand } = useBranding();

  if (variant === 'hero') {
    return (
      <div className={cn('flex flex-col items-center text-center', className)}>
        {brand.logoUrl ? (
          <div className="mb-3 flex items-center justify-center rounded-2xl border border-surface-border bg-surface-card/90 px-5 py-3 shadow-lg">
            <img
              src={brand.logoUrl}
              alt={brand.name}
              className="h-9 w-auto max-w-[220px] object-contain"
            />
          </div>
        ) : (
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-surface-card border border-surface-border text-accent-500 shadow-md">
            <Printer className="h-6 w-6" />
          </div>
        )}

        {(brand.showLogoText || !brand.logoUrl) && (
          <div className="flex items-center justify-center gap-2">
            <h1 className="text-xl font-extrabold tracking-tight text-white">{brand.name}</h1>
            {brand.badge && (
              <span className="text-[10px] uppercase font-bold tracking-wider text-accent-foreground bg-accent-500 px-1.5 py-0.5 rounded">
                {brand.badge}
              </span>
            )}
          </div>
        )}
      </div>
    );
  }

  if (variant === 'header') {
    return (
      <div className={cn('flex items-center gap-2.5', className)}>
        {brand.logoUrl ? (
          <img
            src={brand.logoUrl}
            alt={brand.name}
            className="h-7 w-auto max-w-[160px] object-contain"
          />
        ) : (
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-surface-card border border-surface-border text-accent-500 shadow-sm">
            <Printer className="h-4.5 w-4.5" />
          </div>
        )}

        {(brand.showLogoText || !brand.logoUrl) && (
          <div className="flex items-center gap-1.5">
            <span className="font-extrabold tracking-tight text-white text-sm">{brand.name}</span>
            {brand.badge && (
              <span className="text-[10px] font-semibold text-accent-400 bg-accent-500/10 border border-accent-500/20 px-1.5 py-0.5 rounded">
                {brand.badge}
              </span>
            )}
          </div>
        )}
        {brand.logoUrl && !brand.showLogoText && brand.badge && (
          <span className="text-[10px] font-bold uppercase tracking-wider text-accent-400 bg-accent-500/10 border border-accent-500/25 px-1.5 py-0.5 rounded">
            {brand.badge}
          </span>
        )}
      </div>
    );
  }

  // sidebar variant
  return (
    <div className={cn('flex items-center gap-2.5 min-w-0', className)}>
      {brand.logoUrl ? (
        <div className="min-w-0 flex flex-col gap-0.5">
          <div className="flex items-center gap-1.5">
            <img
              src={brand.logoUrl}
              alt={brand.name}
              className="h-6 w-auto max-w-[140px] object-contain"
            />
            {brand.badge && (
              <span className="text-[9px] uppercase font-bold tracking-wider text-accent-400 bg-accent-500/10 px-1.5 py-0.5 rounded border border-accent-500/25 shrink-0">
                {brand.badge}
              </span>
            )}
          </div>
          <p className="text-[10px] text-surface-muted truncate">{brand.subtitle}</p>
        </div>
      ) : (
        <>
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-surface-card border border-surface-border text-accent-500 shrink-0">
            <Printer className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="font-bold tracking-tight text-white text-xs truncate">{brand.name}</span>
              {brand.badge && (
                <span className="text-[9px] uppercase font-semibold tracking-wider text-surface-muted bg-surface-subtle px-1.5 py-0.5 rounded border border-surface-border">
                  {brand.badge}
                </span>
              )}
            </div>
            <p className="text-[10px] text-surface-muted truncate">{brand.subtitle}</p>
          </div>
        </>
      )}
    </div>
  );
}
