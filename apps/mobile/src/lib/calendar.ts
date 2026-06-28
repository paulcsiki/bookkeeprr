// UTC date helpers for the release calendar. Mirrors the web app's
// apps/web/src/app/(app)/calendar/lib.ts so both clients bucket releases onto
// the same grid cells regardless of device timezone (release dates are
// calendar dates, not instants).

import type { CalendarEntry } from '@/api/schemas';
import type { ContentType } from '@/api/schemas';

export const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

export function ymd(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function parseYmd(s: string): Date {
  return new Date(`${s}T00:00:00.000Z`);
}

export function todayUtc(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

export function addDaysUtc(d: Date, n: number): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + n));
}

export function startOfMonthUtc(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

export function addMonthsUtc(d: Date, n: number): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1));
}

/** `YYYY-MM` key for a month, e.g. `2026-06`. */
export function monthKey(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

export function parseMonthKey(s: string | null | undefined): Date {
  if (!s || !/^\d{4}-\d{2}$/.test(s)) return startOfMonthUtc(todayUtc());
  const [y, m] = s.split('-').map(Number);
  if (!y || !m || m < 1 || m > 12) return startOfMonthUtc(todayUtc());
  return new Date(Date.UTC(y, m - 1, 1));
}

/**
 * 6 × 7 = 42-cell grid starting on the Sunday before the month's 1st and
 * running through the Saturday after the month's last day.
 */
export function monthGridDays(monthStart: Date): Date[] {
  const firstDow = monthStart.getUTCDay();
  const start = addDaysUtc(monthStart, -firstDow);
  return Array.from({ length: 42 }, (_, i) => addDaysUtc(start, i));
}

/**
 * The `from`/`to` query range (to exclusive, matching GET /api/calendar)
 * covering the full 42-cell grid of `month` (`YYYY-MM`).
 */
export function monthGridRange(month: string): { from: string; to: string } {
  const days = monthGridDays(parseMonthKey(month));
  const first = days[0]!;
  const last = days[days.length - 1]!;
  return { from: ymd(first), to: ymd(addDaysUtc(last, 1)) };
}

export type DayBucket = {
  date: string;
  entries: CalendarEntry[];
  byType: Map<ContentType, number>;
};

export function bucketByDay(entries: CalendarEntry[]): Map<string, DayBucket> {
  const map = new Map<string, DayBucket>();
  for (const e of entries) {
    let bucket = map.get(e.date);
    if (!bucket) {
      bucket = { date: e.date, entries: [], byType: new Map() };
      map.set(e.date, bucket);
    }
    bucket.entries.push(e);
    bucket.byType.set(e.contentType, (bucket.byType.get(e.contentType) ?? 0) + 1);
  }
  return map;
}

export function formatMonthHeading(monthStart: Date): string {
  const month = monthStart.toLocaleDateString('en-US', { month: 'long', timeZone: 'UTC' });
  return `${month} ${monthStart.getUTCFullYear()}`;
}

export function formatDayHeading(date: Date): string {
  const weekday = date.toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' });
  const month = date.toLocaleDateString('en-US', { month: 'long', timeZone: 'UTC' });
  const day = date.getUTCDate();
  return `${weekday}, ${month} ${day}`;
}
