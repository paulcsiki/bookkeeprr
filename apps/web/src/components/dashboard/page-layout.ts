/**
 * Pure layout/helpers for the dashboard page — extracted from the design
 * prototype's `dashboard-page.jsx` so the row-packing, greeting, and period
 * parsing are unit-testable without rendering. No DOM, no React.
 */

import type { StatsPeriod } from '@/server/db/reading-stats-agg';

/** The dashboard widget ids, in the default order. */
export type WidgetId =
  | 'continue'
  | 'personal'
  | 'goals'
  | 'leaderboard'
  | 'format'
  | 'feed'
  | 'releases'
  | 'server'
  | 'recent';

/** How wide a widget is: `full` takes its own row; `wide`/`rail` pair up. */
export type WidgetSpan = 'full' | 'wide' | 'rail';

/** Per-widget layout metadata (label/desc are surfaced by the customize drawer). */
export const WIDGET_META: Record<WidgetId, { label: string; desc: string; span: WidgetSpan }> = {
  continue: { label: 'Continue reading', desc: 'Pick up where you left off', span: 'full' },
  personal: { label: 'Your reading stats', desc: 'Time, units, books & streak', span: 'wide' },
  goals: { label: 'Reading goals', desc: 'Yearly & weekly progress rings', span: 'rail' },
  leaderboard: { label: 'Household leaderboard', desc: 'Friendly ranking of members', span: 'wide' },
  format: { label: 'By format', desc: 'Breakdown by media type', span: 'rail' },
  feed: { label: 'Household activity', desc: 'What everyone is reading', span: 'wide' },
  releases: { label: 'Upcoming releases', desc: 'New volumes on the way', span: 'rail' },
  server: { label: 'Server totals', desc: 'Combined stats across members', span: 'full' },
  recent: { label: 'Recently added', desc: 'Latest additions to the library', span: 'full' },
};

/** The default widget order rendered on a fresh dashboard. */
export const DEFAULT_ORDER: WidgetId[] = [
  'continue',
  'personal',
  'goals',
  'leaderboard',
  'format',
  'feed',
  'releases',
  'server',
  'recent',
];

/** A packed row of one or two widget ids. */
export type WidgetRow = WidgetId[];

/**
 * Pack an ordered, enabled widget list into rows. A `full`-span widget always
 * gets its own row; consecutive non-`full` widgets (`wide`/`rail`) pair into a
 * single two-column band. A trailing non-`full` widget sits alone.
 *
 * Mirrors the prototype's row-packing engine exactly.
 */
export function packRows(order: WidgetId[]): WidgetRow[] {
  const rows: WidgetRow[] = [];
  let i = 0;
  while (i < order.length) {
    const a = order[i]!;
    if (WIDGET_META[a].span === 'full') {
      rows.push([a]);
      i += 1;
      continue;
    }
    const b = order[i + 1];
    if (b && WIDGET_META[b].span !== 'full') {
      rows.push([a, b]);
      i += 2;
    } else {
      rows.push([a]);
      i += 1;
    }
  }
  return rows;
}

/**
 * The grid `gridTemplateColumns` for a two-widget row. A `wide`+`rail` pair gets
 * the prototype's `1.6fr 1fr` split (or its mirror); anything else splits evenly.
 */
export function rowColumns(a: WidgetId, b: WidgetId): string {
  const sa = WIDGET_META[a].span;
  const sb = WIDGET_META[b].span;
  if (sa === 'wide' && sb === 'rail') return '1.6fr 1fr';
  if (sa === 'rail' && sb === 'wide') return '1fr 1.6fr';
  return '1fr 1fr';
}

/** Time-of-day greeting from a 0..23 hour, matching the prototype copy. */
export function greetingFromHour(hour: number): string {
  if (hour < 5) return 'Late night';
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

/** The first word of a display name (the greeting only shows the first name). */
export function firstNameOf(displayName: string): string {
  const trimmed = displayName.trim();
  if (trimmed.length === 0) return 'there';
  return trimmed.split(/\s+/)[0]!;
}

const PERIODS: readonly StatsPeriod[] = ['week', 'month', 'year', 'all'];

/** Parse a `?range=` query value into a StatsPeriod, defaulting to `week`. */
export function periodFromQuery(raw: string | string[] | undefined): StatsPeriod {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return (PERIODS as readonly string[]).includes(value ?? '')
    ? (value as StatsPeriod)
    : 'week';
}

/** Mono note for a period, e.g. "this week". */
export const PERIOD_NOTE: Record<StatsPeriod, string> = {
  week: 'this week',
  month: 'this month',
  year: 'this year',
  all: 'all time',
};

/** Compact relative time for the activity feed, e.g. "2h ago", "Yesterday". */
export function relativeTime(from: Date, now: Date = new Date()): string {
  const sec = Math.max(0, Math.round((now.getTime() - from.getTime()) / 1000));
  if (sec < 60) return 'just now';
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.round(hr / 24);
  if (day === 1) return 'Yesterday';
  if (day < 7) return `${day}d ago`;
  const wk = Math.round(day / 7);
  if (wk < 5) return `${wk}w ago`;
  return from.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
