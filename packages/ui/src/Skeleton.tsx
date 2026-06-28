'use client';

import { cn } from './utils';

export type SkeletonVariant = 'line' | 'cover' | 'chip' | 'circle' | 'card' | 'listrow' | 'hero';

export type SkeletonProps = {
  variant?: Exclude<SkeletonVariant, 'card' | 'listrow' | 'hero'>;
  width?: string | number;
  height?: string | number;
  className?: string;
};

/**
 * Skeleton — see §15 Loading states in `docs/design/bookkeeprr-design-system.html`.
 * Use only when the layout is known and the wait will exceed 300ms; otherwise use
 * <Spinner /> instead. One shared sheen sweeps at 1.4s; reduced-motion users see
 * a static block.
 */
export function Skeleton({
  variant = 'line',
  width,
  height,
  className,
}: SkeletonProps): React.JSX.Element {
  return (
    <span
      className={cn('skel', `skel-${variant}`, className)}
      style={{ width, height }}
      aria-hidden
    />
  );
}

/** Composite: cover + two meta lines (matches `.library-grid` card footprint). */
export function SkeletonCard({ className }: { className?: string }): React.JSX.Element {
  return (
    <div className={cn('skel-card', className)} aria-hidden>
      <Skeleton variant="cover" />
      <div className="meta">
        <Skeleton variant="line" width="80%" />
        <Skeleton variant="line" width="50%" />
      </div>
    </div>
  );
}

/** Composite: 6-cell grid row (matches the standard list-row footprint). */
export function SkeletonListRow({ className }: { className?: string }): React.JSX.Element {
  return (
    <div className={cn('skel-listrow', className)} aria-hidden>
      <Skeleton variant="circle" width={30} height={40} />
      <Skeleton variant="line" width="70%" />
      <Skeleton variant="chip" />
      <Skeleton variant="line" width="60%" />
      <Skeleton variant="line" width="50%" />
      <Skeleton variant="line" width="80%" />
    </div>
  );
}

/** Composite: 188px cover + body block (matches series-detail hero). */
export function SkeletonHero({ className }: { className?: string }): React.JSX.Element {
  return (
    <div className={cn('skel-hero', className)} aria-hidden>
      <Skeleton variant="cover" />
      <div className="body">
        <div style={{ display: 'flex', gap: 8 }}>
          <Skeleton variant="chip" />
          <Skeleton variant="chip" width={88} />
        </div>
        <Skeleton variant="line" width="46%" height={30} />
        <Skeleton variant="line" width="32%" />
        <Skeleton variant="line" width="92%" />
        <Skeleton variant="line" width="84%" />
        <div className="stats">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <Skeleton variant="line" width="60%" height={8} />
            <Skeleton variant="line" width="40%" height={18} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <Skeleton variant="line" width="70%" height={8} />
            <Skeleton variant="line" width="50%" height={18} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <Skeleton variant="line" width="55%" height={8} />
            <Skeleton variant="line" width="65%" height={18} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <Skeleton variant="line" width="65%" height={8} />
            <Skeleton variant="line" width="45%" height={18} />
          </div>
        </div>
      </div>
    </div>
  );
}
