'use client';

import { cn } from './utils';

export type SpinnerProps = {
  size?: 'sm' | 'lg';
  className?: string;
};

/**
 * Spinner — see §15 Loading states in `docs/design/bookkeeprr-design-system.html`.
 * Inline indicator for sub-300ms or unknown-shape waits; use `<Skeleton>` instead
 * when the target layout is known and the wait will exceed 300ms.
 */
export function Spinner({ size, className }: SpinnerProps): React.JSX.Element {
  return (
    <span
      role="status"
      aria-label="Loading"
      className={cn('spinner', size === 'lg' && 'spinner-lg', className)}
    />
  );
}
