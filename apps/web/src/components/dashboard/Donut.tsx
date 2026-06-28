import type { ContentType } from '@bookkeeprr/types';
import { CONTENT_TYPE_VAR, CONTENT_TYPE_LABEL } from '@bookkeeprr/ui';
import { donutGeometry, type DonutSegment } from './chart-math';

/** Canonical legend order — matches the content-type registry. */
const TYPE_ORDER: ContentType[] = ['manga', 'comic', 'light_novel', 'ebook', 'audiobook'];

type Props = {
  /** Per-content-type values (raw — minutes, counts, …); normalized to fill the ring. */
  segments: DonutSegment[];
  /** Big number in the center (e.g. total hours). */
  centerLabel?: React.ReactNode;
  /** Mono caption under the center label (e.g. "HOURS"). */
  centerSub?: React.ReactNode;
  size?: number;
  thickness?: number;
};

/**
 * Segmented ring of reading time by content type. Each arc uses that type's
 * FIXED accent (`--color-manga` …). When every segment is zero the ring shows
 * only the hollow track and the legend reads 0% per type. Hand-rolled SVG — no
 * chart library.
 */
export function Donut({
  segments,
  centerLabel,
  centerSub,
  size = 150,
  thickness = 20,
}: Props): React.JSX.Element {
  const { radius, circumference, arcs } = donutGeometry(segments, size, thickness);
  // Percent per type for the legend (0 when absent).
  const pctByType = new Map<ContentType, number>(arcs.map((a) => [a.type, a.pct]));

  return (
    <div className="flex items-center gap-5">
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="var(--color-elevated-2)"
            strokeWidth={thickness}
          />
          {arcs.map((a) => (
            <circle
              key={a.type}
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke={`var(${CONTENT_TYPE_VAR[a.type]})`}
              strokeWidth={thickness}
              strokeDasharray={`${a.dash} ${circumference - a.dash}`}
              strokeDashoffset={a.offset}
              strokeLinecap="round"
            />
          ))}
        </svg>
        <div className="absolute inset-0 grid place-items-center text-center">
          <div>
            {centerLabel != null && (
              <div className="font-display text-lg font-semibold leading-none tracking-[-0.02em]">
                {centerLabel}
              </div>
            )}
            {centerSub != null && (
              <div className="mt-0.5 font-mono text-[9px] uppercase tracking-[0.1em] text-muted-foreground">
                {centerSub}
              </div>
            )}
          </div>
        </div>
      </div>
      <ul className="flex min-w-0 flex-1 flex-col gap-2.5">
        {TYPE_ORDER.map((type) => {
          const pct = pctByType.get(type) ?? 0;
          return (
            <li key={type} className="flex items-center gap-2.5">
              <span
                aria-hidden
                className="size-2.5 shrink-0 rounded-[3px]"
                style={{ background: `var(${CONTENT_TYPE_VAR[type]})` }}
              />
              <span className="flex-1 text-xs text-foreground/80">{CONTENT_TYPE_LABEL[type]}</span>
              <span
                className={`font-mono text-xs tabular-nums ${pct ? 'text-foreground' : 'text-muted-foreground/60'}`}
              >
                {pct}%
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
