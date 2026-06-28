'use client';

import { cn } from './utils';

export type EmptyStateVariant = 'primary' | 'muted' | 'ok' | 'err';

export type EmptyStateProps = {
  variant?: EmptyStateVariant;
  icon: React.ReactNode;
  title: React.ReactNode;
  body?: React.ReactNode;
  actions?: React.ReactNode;
  hint?: React.ReactNode;
  staged?: boolean;
  scrimLabel?: React.ReactNode;
  className?: string;
};

/**
 * Empty state — see §16 in `docs/design/bookkeeprr-design-system.html`.
 *
 * Four flavours distinguished by icon tint: primary (first-run, wants action),
 * muted (empty filter / no-results), ok (good empty / all caught up),
 * err (broken connection / offline). Always exactly one cause line and at
 * most one primary action — never a dead end.
 *
 * `staged` (default true) wraps the empty in an `.es-stage` card with the
 * radial glow + grid pattern; pass false for inline-card uses.
 */
export function EmptyState({
  variant = 'primary',
  icon,
  title,
  body,
  actions,
  hint,
  staged = true,
  scrimLabel,
  className,
}: EmptyStateProps): React.JSX.Element {
  const inner = (
    <div
      className={cn('empty', variant !== 'primary' && variant, !staged && className)}
    >
      <div className="ico">{icon}</div>
      <div className="ttl">{title}</div>
      {body && <div className="sub">{body}</div>}
      {actions && <div className="cta">{actions}</div>}
      {hint && <div className="hint">{hint}</div>}
    </div>
  );
  if (!staged) return inner;
  return (
    <div className={cn('es-stage', className)}>
      {scrimLabel && <span className="scrim-label">{scrimLabel}</span>}
      {inner}
    </div>
  );
}
