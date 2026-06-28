/**
 * Pure formatting helpers for the dashboard + profile data-viz primitives.
 * Ported from the design prototype's `dashboard-data.jsx` (`fmtMins`, `fmtHrs`,
 * `compactNum`). No DOM, no React — safe to unit-test in a node environment.
 */

/** A formatted minute value split into a display value + optional unit suffix. */
export interface FormattedMins {
  /** The numeric/compound value, e.g. `"45"`, `"2h 30m"`, `"120"`. */
  v: string;
  /** A unit suffix to render in mono after the value, e.g. `"m"`, `"h"`, `""`. */
  u: string;
}

/**
 * Human-friendly minutes. Under an hour → `{ v: "45", u: "m" }`; under 100
 * hours → a compound `{ v: "2h 30m", u: "" }` (dropping the minutes when zero);
 * at/over 100 hours → `{ v: "120", u: "h" }` so the value stays compact.
 */
export function fmtMins(min: number): FormattedMins {
  const m = Math.max(0, Math.round(min));
  if (m < 60) return { v: String(m), u: 'm' };
  const h = Math.floor(m / 60);
  const mm = m % 60;
  if (h < 100) return { v: mm ? `${h}h ${mm}m` : `${h}h`, u: '' };
  return { v: String(h), u: 'h' };
}

/** Whole hours from minutes (rounded). */
export function fmtHrs(min: number): number {
  return Math.round(Math.max(0, min) / 60);
}

/**
 * Compact a count: `1234 → "1.2k"`, `12000 → "12k"`, `999 → "999"`.
 * Negative inputs are clamped to 0.
 */
export function compactNum(n: number): string {
  const v = Math.max(0, n);
  if (v >= 1000) return `${(v / 1000).toFixed(1).replace(/\.0$/, '')}k`;
  return String(Math.round(v));
}

/** A signed percentage delta for a StatTile, e.g. `+12%` / `-4%`. */
export function fmtDelta(pct: number): string {
  const rounded = Math.round(pct);
  return `${rounded >= 0 ? '+' : ''}${rounded}%`;
}
