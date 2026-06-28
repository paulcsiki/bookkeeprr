'use client';

import { useId, useState } from 'react';
import { trendGeometry } from './chart-math';

type Props = {
  /** The series to plot (e.g. 12 weekly minute totals). */
  points: number[];
  /** Optional axis tick labels rendered in mono beneath the chart. */
  labels?: string[];
  /**
   * Pre-formatted value text per point for the hover tooltip (e.g. `"4m"`).
   * Defaults to the raw number — formatter callbacks can't cross the
   * server→client boundary.
   */
  valueLabels?: string[];
  height?: number;
  /**
   * Accent token for the line/area gradient. Defaults to the themable primary.
   * Pass a fixed content-type token (`--color-manga`) for a per-type trend.
   */
  accentVar?: string;
};

/**
 * Area + line trend over a 0..100 viewBox, scaled to fit. Three faint gridlines,
 * a soft gradient fill, and per-point dots overlaid as HTML (so they stay
 * circular despite the non-uniform SVG stretch). Hovering a point shows its
 * value. Empty / flat series render as a mid-height baseline. No chart library.
 */
export function TrendLine({
  points: values,
  labels,
  valueLabels,
  height = 120,
  accentVar = '--color-primary',
}: Props): React.JSX.Element {
  const { points, line, area, flat } = trendGeometry(values);
  const gradId = useId();
  const accent = `var(${accentVar})`;
  const [hovered, setHovered] = useState<number | null>(null);
  const valueText = (i: number): string => valueLabels?.[i] ?? String(values[i] ?? 0);
  const lastIdx = points.length - 1;

  return (
    <div>
      <div className="relative" style={{ height }}>
        <svg
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          style={{ width: '100%', height: '100%', display: 'block' }}
          role="img"
          aria-label="Reading-time trend"
        >
          <defs>
            <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={accent} stopOpacity="0.34" />
              <stop offset="100%" stopColor={accent} stopOpacity="0" />
            </linearGradient>
          </defs>
          {[25, 50, 75].map((g) => (
            <line
              key={g}
              x1="0"
              y1={g}
              x2="100"
              y2={g}
              stroke="var(--color-border)"
              strokeWidth="0.4"
              vectorEffect="non-scaling-stroke"
            />
          ))}
          {!flat && area && <path d={area} fill={`url(#${gradId})`} />}
          <path
            d={line}
            fill="none"
            stroke={accent}
            strokeWidth="2"
            vectorEffect="non-scaling-stroke"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        </svg>

        {/* Per-point dots + hover targets as an HTML overlay — circles here stay
            round (the SVG above is stretched non-uniformly). */}
        {!flat &&
          points.map((p, i) => {
            const isLast = i === lastIdx;
            const active = hovered === i;
            return (
              <div
                key={i}
                className="absolute -translate-x-1/2 -translate-y-1/2 cursor-default"
                style={{ left: `${p.x}%`, top: `${p.y}%`, width: 18, height: 18 }}
                onMouseEnter={() => setHovered(i)}
                onMouseLeave={() => setHovered((h) => (h === i ? null : h))}
                title={`${valueText(i)}${labels?.[i] ? ` · ${labels[i]}` : ''}`}
              >
                {active && (
                  <div className="pointer-events-none absolute bottom-full left-1/2 mb-1.5 -translate-x-1/2 whitespace-nowrap rounded-md border border-border bg-card px-2 py-1 text-center shadow-md">
                    <span className="font-mono text-[11px] font-medium text-foreground">
                      {valueText(i)}
                    </span>
                  </div>
                )}
                <div
                  className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full"
                  style={{
                    width: isLast || active ? 9 : 6,
                    height: isLast || active ? 9 : 6,
                    background: accent,
                    border: '1.5px solid var(--color-background)',
                    opacity: isLast || active ? 1 : 0.85,
                  }}
                />
              </div>
            );
          })}
      </div>
      {labels && labels.length > 0 && (
        <div className="mt-2 flex justify-between font-mono text-[9.5px] text-muted-foreground">
          {labels.map((l, i) => (
            <span key={i}>{l}</span>
          ))}
        </div>
      )}
    </div>
  );
}
