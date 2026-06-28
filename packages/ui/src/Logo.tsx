import { cn } from './utils';

type Props = {
  size?: number;
  className?: string;
  /** Force a white/inverse rendering for use on the primary color background. */
  variant?: 'default' | 'white';
};

/**
 * The bookkeeprr mark — a filled disc with three offset rules inside
 * (read as a closed book viewed from the side, a tiny library shelf, or
 * an index). Inherits its disc color from `currentColor`, which is wired
 * to `--color-primary` by `LogoMark`. See the design system reference for
 * canonical sizes and inverse-variant rules.
 */
export function LogoMark({ size = 28, className, variant = 'default' }: Props): React.JSX.Element {
  const isWhite = variant === 'white';
  return (
    <svg
      viewBox="0 0 64 64"
      width={size}
      height={size}
      aria-label="bookkeeprr"
      role="img"
      className={cn(className)}
      style={{ color: isWhite ? 'var(--color-primary-foreground)' : 'var(--color-primary)' }}
    >
      <circle
        cx="32"
        cy="32"
        r="30"
        fill="currentColor"
        fillOpacity={isWhite ? 0.16 : 1}
      />
      <rect
        x="14"
        y="22.5"
        width="32"
        height="5"
        rx="1"
        fill={isWhite ? 'currentColor' : 'var(--color-background)'}
      />
      <rect
        x="14"
        y="30.5"
        width="36"
        height="5"
        rx="1"
        fill={isWhite ? 'currentColor' : 'var(--color-background)'}
      />
      <rect
        x="14"
        y="38.5"
        width="22"
        height="5"
        rx="1"
        fill={isWhite ? 'currentColor' : 'var(--color-background)'}
      />
    </svg>
  );
}

type LockupProps = {
  size?: number;
  className?: string;
  variant?: 'default' | 'white';
  /** Hide the wordmark — show mark only. */
  markOnly?: boolean;
};

/**
 * Logo + wordmark. The trailing `rr` is set in the accent color as a quiet
 * nod to the *arr lineage (Sonarr, Radarr, Readarr, etc.). The wordmark
 * uses Space Grotesk via the `--font-display` token.
 */
export function Logo({
  size = 28,
  className,
  variant = 'default',
  markOnly = false,
}: LockupProps): React.JSX.Element {
  if (markOnly) {
    return <LogoMark size={size} className={className} variant={variant} />;
  }
  const isWhite = variant === 'white';
  return (
    <span className={cn('inline-flex items-center gap-2.5', className)}>
      <LogoMark size={size} variant={variant} />
      <span
        className="font-display font-semibold tracking-tight"
        style={{
          fontSize: `${Math.round(size * 0.72)}px`,
          color: isWhite ? 'var(--color-primary-foreground)' : 'var(--color-foreground)',
        }}
      >
        bookkeep
        <span
          style={{
            color: isWhite
              ? 'color-mix(in oklab, var(--color-primary-foreground) 65%, transparent)'
              : 'var(--color-primary)',
          }}
        >
          rr
        </span>
      </span>
    </span>
  );
}
