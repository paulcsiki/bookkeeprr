import { cn } from '@/lib/utils';

/**
 * Shared content-page header. The title row sits on top with the right-aligned
 * actions cluster. When a `subtitle` (lede) is supplied, it renders as a
 * dedicated row below a thin top-border at full width (capped at 720px), per
 * the 2026-05-30 design-system update.
 */
export function PageHeader({
  title,
  subtitle,
  actions,
  className,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}): React.JSX.Element {
  return (
    <div className={cn('border-b border-border pb-[18px]', className)}>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="font-display text-[32px] font-semibold leading-none tracking-tight min-w-0">
          {title}
        </h1>
        {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
      </div>
      {subtitle && (
        <div className="mt-[18px] border-t border-border pt-[14px]">
          <p className="max-w-[720px] text-[14px] leading-[1.55] text-muted-foreground">
            {subtitle}
          </p>
        </div>
      )}
    </div>
  );
}
