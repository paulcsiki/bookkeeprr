import { cn } from '@/lib/utils';

/**
 * Settings content section — design system `.set-section`: a description
 * column (name + blurb) on the left, controls on the right. Stacks on
 * narrow viewports. Sections are separated by a bottom border.
 */
export function SettingsSection({
  name,
  description,
  children,
  className,
}: {
  name: React.ReactNode;
  description?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}): React.JSX.Element {
  return (
    <section
      className={cn(
        'grid gap-6 border-b border-border pb-7 last:border-b-0 last:pb-0 md:grid-cols-[240px_1fr] md:gap-10',
        className,
      )}
    >
      <div className="min-w-0">
        <h2 className="font-display text-[17px] font-semibold tracking-[-0.015em]">{name}</h2>
        {description && (
          <p className="mt-1.5 text-[13px] leading-[1.55] text-muted-foreground">{description}</p>
        )}
      </div>
      <div className="min-w-0">{children}</div>
    </section>
  );
}

/**
 * A single labelled control row — design system `.set-row`: label (+ optional
 * helper text) on the left, control on the right. Rows stack with a top
 * divider so a group of them reads as one panel.
 */
export function SettingRow({
  label,
  help,
  control,
  className,
}: {
  label: React.ReactNode;
  help?: React.ReactNode;
  control: React.ReactNode;
  className?: string;
}): React.JSX.Element {
  return (
    <div
      className={cn(
        'grid grid-cols-[1fr_auto] items-center gap-6 border-t border-border py-3.5 first:border-t-0',
        className,
      )}
    >
      <div className="min-w-0">
        <div className="text-[13.5px] font-medium text-foreground">{label}</div>
        {help && (
          <div className="mt-1 max-w-[460px] text-[12px] leading-snug text-muted-foreground">
            {help}
          </div>
        )}
      </div>
      <div className="shrink-0">{control}</div>
    </div>
  );
}

/**
 * Bordered group wrapper for a stack of SettingRows or a data table — the
 * design system `.dtable` shell. Gives rows a card surface + rounded border.
 */
export function SettingsPanel({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}): React.JSX.Element {
  return (
    <div className={cn('rounded-lg border border-border bg-elevated px-4 [&>*]:px-0', className)}>
      {children}
    </div>
  );
}
