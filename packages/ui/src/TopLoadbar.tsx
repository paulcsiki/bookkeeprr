'use client';

import { cn } from './utils';

export type TopLoadbarProps = {
  visible?: boolean;
  className?: string;
};

/**
 * Fixed 3px route-transition bar — see §15 Loading states in
 * `docs/design/bookkeeprr-design-system.html`. Show during any pending
 * navigation or unknown-duration work that affects the whole viewport.
 */
export function TopLoadbar({ visible = false, className }: TopLoadbarProps): React.JSX.Element | null {
  if (!visible) return null;
  return (
    <div
      role="progressbar"
      aria-label="Loading"
      aria-busy="true"
      className={cn('loadbar', className)}
    />
  );
}
