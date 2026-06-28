import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

type CardProps = {
  className?: string;
  /** Removes the default padding when true (for media-edge headers/banners). */
  flush?: boolean;
  /**
   * Fill the row band: the card stretches to its grid cell's height and lays out
   * as a flex column so a `flex-1` body can absorb the slack. Paired widgets in a
   * row then read as height-matched bands rather than ragged boxes.
   */
  fill?: boolean;
  children: React.ReactNode;
};

/** A dashboard/profile widget shell: card surface, hairline border, rounding. */
export function Card({
  className,
  flush = false,
  fill = false,
  children,
}: CardProps): React.JSX.Element {
  return (
    <div
      className={cn(
        'rounded-2xl border border-border bg-card',
        !flush && 'p-5',
        fill && 'flex h-full flex-col',
        className,
      )}
    >
      {children}
    </div>
  );
}

type CardHeadProps = {
  title: string;
  /** Optional leading icon. */
  icon?: LucideIcon;
  /**
   * Icon accent token (without `var()`), e.g. `--color-primary`. Defaults to the
   * muted foreground.
   */
  accentVar?: string;
  /** Right-aligned action (e.g. a Segmented control or a count). */
  action?: React.ReactNode;
  className?: string;
};

/** In-card header: mono uppercase eyebrow title + optional icon and action. */
export function CardHead({
  title,
  icon: Icon,
  accentVar,
  action,
  className,
}: CardHeadProps): React.JSX.Element {
  return (
    <div className={cn('mb-3.5 flex items-center gap-2.5', className)}>
      {Icon && (
        <Icon
          className="size-[15px]"
          style={{ color: accentVar ? `var(${accentVar})` : 'var(--color-muted-foreground)' }}
          aria-hidden
        />
      )}
      <span className="font-mono text-[10.5px] uppercase tracking-[0.16em] text-muted-foreground">
        {title}
      </span>
      {action && <div className="ml-auto">{action}</div>}
    </div>
  );
}

type SectionHeadProps = {
  title: string;
  icon?: LucideIcon;
  accentVar?: string;
  /** Right-aligned action (e.g. a "See all" link). */
  action?: React.ReactNode;
  className?: string;
};

/**
 * A page-level section header (used above full-bleed rails/grids, outside a
 * card). Same eyebrow treatment as `CardHead`, with bottom spacing instead of a
 * card surface.
 */
export function SectionHead({
  title,
  icon: Icon,
  accentVar,
  action,
  className,
}: SectionHeadProps): React.JSX.Element {
  return (
    <div className={cn('mb-3.5 flex items-center gap-2.5', className)}>
      {Icon && (
        <Icon
          className="size-4"
          style={{ color: accentVar ? `var(${accentVar})` : 'var(--color-muted-foreground)' }}
          aria-hidden
        />
      )}
      <span className="font-mono text-[10.5px] uppercase tracking-[0.16em] text-muted-foreground">
        {title}
      </span>
      {action && <div className="ml-auto">{action}</div>}
    </div>
  );
}
