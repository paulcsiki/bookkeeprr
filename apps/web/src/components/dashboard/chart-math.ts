/**
 * Pure geometry helpers for the hand-rolled SVG dashboard charts. Extracted so
 * the arc / scaling / bucketing math is unit-testable without rendering. No DOM,
 * no React. Ported from the design prototype (`dashboard-widgets.jsx`,
 * `profile-page.jsx`).
 */

import type { ContentType } from '@bookkeeprr/types';

/** A donut input segment: a content type and its raw (unnormalized) value. */
export interface DonutSegment {
  type: ContentType;
  value: number;
}

/** A resolved donut arc, ready to paint as an SVG `<circle>` dasharray. */
export interface DonutArc {
  type: ContentType;
  /** Share of the whole, 0..1. */
  fraction: number;
  /** Whole-number percentage for the legend (0..100). */
  pct: number;
  /** Dash length in user units (along the circle circumference). */
  dash: number;
  /** Negative dash offset to position the arc start. */
  offset: number;
}

export interface DonutGeometry {
  /** Circle radius given size + thickness. */
  radius: number;
  /** Full circumference. */
  circumference: number;
  /** Arcs for segments with a positive value, in input order. */
  arcs: DonutArc[];
  /** True when every segment is zero/empty (render the hollow track only). */
  empty: boolean;
}

/**
 * Resolve donut segments into SVG arc geometry. Segments are normalized to the
 * sum of their values (so callers may pass raw minutes, counts, or percentages
 * — the donut always fills the full ring). Zero/negative segments are dropped.
 * When the total is zero, `empty` is true and `arcs` is empty (hollow track).
 *
 * `gap` trims each arc's painted length so neighbouring segments read as
 * distinct (matches the prototype's 2.5px rounded-cap gap).
 */
export function donutGeometry(
  segments: DonutSegment[],
  size: number,
  thickness: number,
  gap = 2.5,
): DonutGeometry {
  const radius = (size - thickness) / 2;
  const circumference = 2 * Math.PI * radius;
  const total = segments.reduce((sum, s) => sum + Math.max(0, s.value), 0);
  if (total <= 0) {
    return { radius, circumference, arcs: [], empty: true };
  }
  let acc = 0;
  const arcs: DonutArc[] = [];
  for (const s of segments) {
    const value = Math.max(0, s.value);
    if (value <= 0) continue;
    const fraction = value / total;
    const len = fraction * circumference;
    arcs.push({
      type: s.type,
      fraction,
      pct: Math.round(fraction * 100),
      dash: Math.max(0, len - gap),
      offset: -acc,
    });
    acc += len;
  }
  return { radius, circumference, arcs, empty: false };
}

/**
 * Map a per-day value to a 0..4 contribution-heatmap intensity bucket, given a
 * `max` reference (typically the period's busiest day). Level 0 = no activity;
 * 1..4 split the (0, max] range into quartiles. A non-positive `max` yields
 * level 0 for everything (empty track).
 */
export function heatmapLevel(value: number, max: number): 0 | 1 | 2 | 3 | 4 {
  if (value <= 0 || max <= 0) return 0;
  const frac = Math.min(1, value / max);
  if (frac <= 0.25) return 1;
  if (frac <= 0.5) return 2;
  if (frac <= 0.75) return 3;
  return 4;
}

/** A point on the trend SVG, in the 0..100 user-space viewBox. */
export interface TrendPoint {
  x: number;
  y: number;
}

export interface TrendGeometry {
  points: TrendPoint[];
  /** SVG path `d` for the line. */
  line: string;
  /** SVG path `d` for the filled area under the line. */
  area: string;
  /** The final point (for the end-cap dot). */
  last: TrendPoint;
  /** True when there's no meaningful data (all-zero or single point). */
  flat: boolean;
}

/**
 * Scale a series of values into a 0..100 × 0..100 SVG path. The y-axis is
 * inverted (0 at the top), the max is padded 12% so the peak never touches the
 * ceiling, and the baseline is 0. With fewer than two points (or an all-zero
 * series) the geometry is `flat` — a single mid-height horizontal line.
 */
export function trendGeometry(values: number[]): TrendGeometry {
  const w = 100;
  const h = 100;
  const n = values.length;
  if (n === 0) {
    const last = { x: w, y: h / 2 };
    return { points: [last], line: `M0 ${h / 2} L${w} ${h / 2}`, area: '', last, flat: true };
  }
  const peak = Math.max(...values);
  const max = peak * 1.12 || 1;
  const flat = n < 2 || peak <= 0;
  const points: TrendPoint[] = values.map((v, i) => ({
    x: n === 1 ? w : (i / (n - 1)) * w,
    y: h - (Math.max(0, v) / max) * h,
  }));
  const line = points
    .map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
    .join(' ');
  const area = `${line} L${w} ${h} L0 ${h} Z`;
  const last = points[points.length - 1]!;
  return { points, line, area, last, flat };
}

/** One day in the contribution heatmap. */
export interface HeatmapDay {
  /** YYYY-MM-DD. */
  date: string;
  value: number;
}

/** A resolved heatmap cell: the source day (if any) and its intensity level. */
export interface HeatmapCell {
  date: string | null;
  value: number;
  level: 0 | 1 | 2 | 3 | 4;
}

/**
 * Build a `weeks × 7` (column-major) grid of leveled cells from a list of days.
 * Columns are weeks (oldest → newest), rows are weekday 0..6 (Sun..Sat). The
 * grid ends at `endDate` (default = the latest day, or today) and spans `weeks`
 * columns back. Cells with no matching day are level 0 with a null date. The
 * intensity reference is the busiest day's value across the supplied days, so an
 * all-zero/empty input yields an all-level-0 track.
 */
export function buildHeatmapGrid(
  days: HeatmapDay[],
  weeks = 53,
  endDate?: string,
): { columns: HeatmapCell[][]; max: number; activeDays: number } {
  const byDate = new Map<string, number>();
  let max = 0;
  let activeDays = 0;
  for (const d of days) {
    const v = Math.max(0, d.value);
    byDate.set(d.date, v);
    if (v > max) max = v;
    if (v > 0) activeDays += 1;
  }

  // Anchor: the Saturday of the most recent column.
  const latest = days.reduce<string>((a, d) => (d.date > a ? d.date : a), '');
  const anchorStr = endDate ?? (latest || isoToday());
  const anchor = new Date(`${anchorStr}T00:00:00.000Z`);
  // Walk forward to the end of that week (Saturday) so the last column is full.
  const endOfWeek = new Date(anchor);
  endOfWeek.setUTCDate(endOfWeek.getUTCDate() + (6 - endOfWeek.getUTCDay()));

  const totalDays = weeks * 7;
  const start = new Date(endOfWeek);
  start.setUTCDate(start.getUTCDate() - (totalDays - 1));

  const columns: HeatmapCell[][] = [];
  const cursor = new Date(start);
  for (let w = 0; w < weeks; w++) {
    const col: HeatmapCell[] = [];
    for (let d = 0; d < 7; d++) {
      const iso = cursor.toISOString().slice(0, 10);
      const value = byDate.get(iso) ?? 0;
      col.push({ date: iso, value, level: heatmapLevel(value, max) });
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
    columns.push(col);
  }
  return { columns, max, activeDays };
}

function isoToday(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Progress fraction (0..1) and dash length for a ProgressRing, given `value`,
 * `max`, and the ring circumference. A non-positive `max` yields 0.
 */
export function ringProgress(
  value: number,
  max: number,
  circumference: number,
): { fraction: number; dash: number } {
  const fraction = max > 0 ? Math.min(1, Math.max(0, value / max)) : 0;
  return { fraction, dash: fraction * circumference };
}
