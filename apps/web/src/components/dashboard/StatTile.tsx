import { ArrowUp, ArrowDown, type LucideIcon } from 'lucide-react';
import { fmtDelta } from './format';

type Props = {
  label: string;
  value: React.ReactNode;
  /** Mono unit shown after the value (e.g. "hours", "books"). */
  unit?: string;
  /** Mono sub-line beneath the value. */
  sub?: React.ReactNode;
  /** Optional leading icon for the label row. */
  icon?: LucideIcon;
  /**
   * Accent token (without `var()`) for the big value, e.g. `--color-warn` for a
   * streak tile. Defaults to the neutral foreground.
   */
  accentVar?: string;
  /**
   * Period-over-period delta as a signed percentage. Positive → ok-tinted with
   * an up arrow; negative → err-tinted with a down arrow.
   */
  delta?: number;
};

/**
 * A labelled stat card: mono eyebrow, optional trend delta, a big display
 * number, optional unit + sub-line. The canonical dashboard/profile stat cell
 * (the library's `ReadingStatsPanel` reuses it).
 */
export function StatTile({
  label,
  value,
  unit,
  sub,
  icon: Icon,
  accentVar,
  delta,
}: Props): React.JSX.Element {
  const up = (delta ?? 0) >= 0;
  return (
    <div className="flex min-w-0 flex-col gap-2.5 rounded-xl border border-border bg-card px-[18px] py-4">
      <div className="flex min-w-0 items-center gap-2">
        {Icon && <Icon className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />}
        <span className="min-w-0 truncate font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
          {label}
        </span>
        {delta != null && (
          <span
            className="ml-auto inline-flex shrink-0 items-center gap-0.5 font-mono text-[10.5px]"
            style={{ color: up ? 'var(--color-ok)' : 'var(--color-err)' }}
          >
            {up ? (
              <ArrowUp className="size-3" aria-hidden />
            ) : (
              <ArrowDown className="size-3" aria-hidden />
            )}
            {fmtDelta(Math.abs(delta))}
          </span>
        )}
      </div>
      <div className="flex min-w-0 items-baseline gap-1.5">
        <span
          className="font-display text-[28px] font-semibold leading-none tracking-[-0.03em]"
          style={accentVar ? { color: `var(${accentVar})` } : undefined}
        >
          {value}
        </span>
        {unit && <span className="min-w-0 truncate font-mono text-xs text-muted-foreground">{unit}</span>}
      </div>
      {sub != null && (
        <div className="font-mono text-[11.5px] tracking-[0.02em] text-muted-foreground">{sub}</div>
      )}
    </div>
  );
}
