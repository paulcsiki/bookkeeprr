'use client';

import { useState } from 'react';

type Props = {
  /** Seven values, Monday → Sunday. */
  values: number[];
  /** Per-bar axis labels (defaults to single-letter Mon–Sun). */
  labels?: string[];
  /** Full day names used in the hover tooltip (defaults to Monday–Sunday). */
  pointLabels?: string[];
  /**
   * Pre-formatted value text per bar for the tooltip (e.g. `"4m"`, `"2h 30m"`).
   * Defaults to the raw number. Pass formatted strings — formatter callbacks
   * can't cross the server→client boundary from a server component.
   */
  valueLabels?: string[];
  height?: number;
  /**
   * Fill the parent's height instead of using a fixed `height`. The parent must
   * be a flex column with a bounded height (e.g. a `flex-1 min-h-0` cell). Lets
   * the chart grow to fill a tall card rather than leaving dead space below.
   */
  fill?: boolean;
  /** Accent token (defaults to themable primary). */
  accentVar?: string;
};

const DEFAULT_LABELS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const DEFAULT_DAYS = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
];

/**
 * Seven-bar weekly chart with the peak day highlighted (full accent vs. a
 * translucent fill). Heights scale to the busiest day. Hovering a column reveals
 * a tooltip with the day + its value. Hand-rolled — no chart library.
 */
export function BarWeek({
  values,
  labels = DEFAULT_LABELS,
  pointLabels = DEFAULT_DAYS,
  valueLabels,
  height = 110,
  fill = false,
  accentVar = '--color-primary',
}: Props): React.JSX.Element {
  const [hovered, setHovered] = useState<number | null>(null);
  const max = Math.max(1, ...values);
  // The busiest day's value (ignoring all-zero weeks); the first bar reaching it
  // is highlighted as the peak. Hoisted so it isn't recomputed per bar.
  const peakValue = Math.max(0, ...values);
  const accent = `var(${accentVar})`;
  const valueText = (i: number): string => valueLabels?.[i] ?? String(values[i] ?? 0);

  return (
    <div className={fill ? 'flex h-full flex-col' : undefined}>
      <div
        className={`flex items-end gap-2${fill ? ' min-h-0 flex-1' : ''}`}
        style={fill ? undefined : { height }}
      >
        {values.map((v, i) => {
          const peak = v > 0 && v === peakValue;
          const pct = Math.max(3, (v / max) * 100);
          const active = hovered === i;
          return (
            <div
              key={i}
              className="relative flex h-full flex-1 cursor-default flex-col items-center justify-end"
              onMouseEnter={() => setHovered(i)}
              onMouseLeave={() => setHovered((h) => (h === i ? null : h))}
              title={`${pointLabels[i] ?? ''} · ${valueText(i)}`}
            >
              {active && (
                <div
                  className="pointer-events-none absolute left-1/2 z-10 -translate-x-1/2 whitespace-nowrap rounded-md border border-border bg-card px-2 py-1 text-center shadow-md"
                  style={{ bottom: `${Math.min(pct, 80)}%` }}
                >
                  <div className="font-mono text-[11px] font-medium text-foreground">
                    {valueText(i)}
                  </div>
                  <div className="font-mono text-[9px] uppercase tracking-[0.08em] text-muted-foreground">
                    {pointLabels[i]}
                  </div>
                </div>
              )}
              <div
                data-testid="barweek-bar"
                className="w-full rounded-md transition-[filter]"
                style={{
                  maxWidth: 46,
                  height: `${pct}%`,
                  background: peak
                    ? accent
                    : `color-mix(in srgb, ${accent} 32%, transparent)`,
                  border: `1px solid color-mix(in srgb, ${accent} ${peak ? '90%' : '40%'}, transparent)`,
                  filter: active ? 'brightness(1.15)' : undefined,
                }}
              />
            </div>
          );
        })}
      </div>
      <div className="mt-2 flex gap-2">
        {labels.map((l, i) => (
          <div key={i} className="flex-1 text-center font-mono text-[10px] text-muted-foreground">
            {l}
          </div>
        ))}
      </div>
    </div>
  );
}
