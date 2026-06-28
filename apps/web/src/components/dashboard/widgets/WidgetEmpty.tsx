import { EmptyState, type EmptyStateVariant } from '@bookkeeprr/ui';

type Props = {
  icon: React.ReactNode;
  title: React.ReactNode;
  body?: React.ReactNode;
  /** Primary CTA (rendered as an anchor button via `actions`). */
  cta?: { label: React.ReactNode; href: string };
  /** A custom action node (e.g. a dialog-opening button), replacing the `cta`. */
  action?: React.ReactNode;
  /** Secondary CTA (e.g. "Invite members"). */
  secondary?: { label: React.ReactNode; href: string };
  variant?: EmptyStateVariant;
  /** Minimum height so the empty state keeps the populated widget's footprint. */
  minHeight?: number;
};

/**
 * An in-card empty state for a dashboard widget — the unstaged `EmptyState`
 * (icon tile + headline + helper + at most one primary CTA) sized so the widget
 * doesn't jump between its empty and populated states.
 */
export function WidgetEmpty({
  icon,
  title,
  body,
  cta,
  action,
  secondary,
  variant = 'muted',
  minHeight = 172,
}: Props): React.JSX.Element {
  const actions =
    action || cta || secondary ? (
      <>
        {action}
        {!action && cta && (
          <a
            href={cta.href}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-primary px-3.5 text-[12.5px] font-semibold text-primary-foreground"
          >
            {cta.label}
          </a>
        )}
        {secondary && (
          <a
            href={secondary.href}
            className="inline-flex h-8 items-center rounded-lg border border-border bg-elevated px-3.5 text-[12.5px] font-medium text-foreground/80"
          >
            {secondary.label}
          </a>
        )}
      </>
    ) : undefined;

  return (
    <div className="grid place-items-center" style={{ minHeight }}>
      <EmptyState
        staged={false}
        variant={variant}
        icon={icon}
        title={title}
        body={body}
        actions={actions}
      />
    </div>
  );
}

/** A mono caption under a zeroed chart (e.g. "Nothing to break down yet"). */
export function ZeroCaption({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <div className="mt-3 text-center font-mono text-[10.5px] tracking-[0.04em] text-muted-foreground">
      {children}
    </div>
  );
}
