import { buildHeatmapGrid, type HeatmapDay } from './chart-math';

type Props = {
  /** One entry per day with reading activity (YYYY-MM-DD + a value). */
  days: HeatmapDay[];
  /** Number of week columns (default 53 ≈ one year). */
  weeks?: number;
  /** Anchor the grid's final column at this YYYY-MM-DD (default = latest/today). */
  endDate?: string;
  /**
   * Base accent token (without `var()`) the intensity levels tint from. Defaults
   * to the themable primary.
   */
  accentVar?: string;
  /** Cell edge length in px. */
  cell?: number;
  /** Gap between cells in px. */
  gap?: number;
  /** Show the Less→More legend beneath the grid. */
  legend?: boolean;
};

const LEVEL_ALPHA = [0, 0.3, 0.52, 0.76, 1];
const WEEKDAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/**
 * GitHub-style contribution heatmap: a `weeks × 7` grid of cells, each tinted by
 * one of five intensity levels derived from the day's value vs. the busiest day.
 * Empty input renders an all-level-0 track. Each cell carries a `title` tooltip.
 * The tint derives from a single accent token via `color-mix`, so it honours the
 * active theme (or a fixed content-type accent if passed). Hand-rolled — no
 * chart library.
 */
export function Heatmap({
  days,
  weeks = 53,
  endDate,
  accentVar = '--color-primary',
  cell = 12,
  gap = 3,
  legend = true,
}: Props): React.JSX.Element {
  const { columns } = buildHeatmapGrid(days, weeks, endDate);
  const accent = `var(${accentVar})`;

  const levelColor = (level: number): string => {
    if (level === 0) return 'var(--color-elevated)';
    return `color-mix(in srgb, ${accent} ${Math.round(LEVEL_ALPHA[level]! * 100)}%, transparent)`;
  };

  const cellStyle = (level: number): React.CSSProperties => ({
    width: cell,
    height: cell,
    borderRadius: 3,
    background: levelColor(level),
    border: level === 0 ? '1px solid var(--color-border)' : 'none',
  });

  return (
    <div>
      <div className="flex overflow-hidden" style={{ gap }}>
        {columns.map((col, w) => (
          <div key={w} className="flex flex-col" style={{ gap }}>
            {col.map((c, d) => (
              <div
                key={d}
                style={cellStyle(c.level)}
                title={`${WEEKDAY[d]} ${c.date ?? ''} · ${c.value > 0 ? `${c.value}` : 'no reading'}`}
              />
            ))}
          </div>
        ))}
      </div>
      {legend && (
        <div className="mt-2.5 flex items-center gap-1.5 font-mono text-[9.5px] tracking-[0.06em] text-muted-foreground">
          Less
          {[0, 1, 2, 3, 4].map((l) => (
            <div key={l} style={cellStyle(l)} />
          ))}
          More
        </div>
      )}
    </div>
  );
}
