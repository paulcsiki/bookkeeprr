import { and, eq, gte, lt, lte, sql } from 'drizzle-orm';
import type { ContentType } from '@/server/content-type';
import { getDb } from './client';
import { readingProgress, readingStatsDaily } from './schema';
import { computeStreak, getDailyStats } from './reading-stats';
import { shiftDay, utcDayString } from './reading-stats-util';

/**
 * Cross-period aggregation over `reading_stats_daily` (+ `reading_progress` for
 * finished counts) for the dashboard / profile. Every function is per-user so
 * the multi-user dashboard can call them once per household member.
 *
 * Time is bucketed by UTC calendar day (the grain `reading_stats_daily` is
 * written at). "Minutes" are derived from `secondsRead`; callers that want
 * seconds can use the raw DAL.
 */

export type StatsPeriod = 'week' | 'month' | 'year' | 'all';

/** Aggregate stats for one period window. */
export type PeriodStats = {
  /** Total reading minutes in the window (rounded). */
  minutes: number;
  /** Total units (pages/chapters/listened-minutes) in the window. */
  units: number;
  /** Distinct readables finished in the window (see booksFinished sourcing). */
  booksFinished: number;
  /** Current streak length as of `today`. */
  streakDays: number;
};

/** A period's stats alongside the immediately-preceding period's, for deltas. */
export type PeriodStatsWithDelta = {
  current: PeriodStats;
  previous: PeriodStats;
};

/** One bucket of the weekly trend. */
export type WeeklyTrendPoint = {
  /** UTC day string (YYYY-MM-DD) for the Monday that starts the week. */
  weekStart: string;
  minutes: number;
};

/** One day of the heatmap / distribution. */
export type DayMinutes = {
  /** UTC day string (YYYY-MM-DD). */
  day: string;
  minutes: number;
};

/** Per-content-type minutes over a period (the by-format donut source). */
export type FormatMix = Record<string, number>;

const SECONDS_PER_MINUTE = 60;

function secondsToMinutes(seconds: number): number {
  return Math.round(seconds / SECONDS_PER_MINUTE);
}

/**
 * The inclusive [start, end] UTC-day window for a period ending on `today`.
 * - week:  the last 7 days (today and the 6 before it)
 * - month: the last 30 days
 * - year:  the last 365 days
 * - all:   from the epoch sentinel to today (effectively unbounded)
 */
export function periodWindow(period: StatsPeriod, today: string): { start: string; end: string } {
  switch (period) {
    case 'week':
      return { start: shiftDay(today, -6), end: today };
    case 'month':
      return { start: shiftDay(today, -29), end: today };
    case 'year':
      return { start: shiftDay(today, -364), end: today };
    case 'all':
      return { start: '0000-01-01', end: today };
  }
}

/** The window for the period immediately before the one ending on `today`. */
export function previousPeriodWindow(
  period: StatsPeriod,
  today: string,
): { start: string; end: string } {
  switch (period) {
    case 'week':
      return { start: shiftDay(today, -13), end: shiftDay(today, -7) };
    case 'month':
      return { start: shiftDay(today, -59), end: shiftDay(today, -30) };
    case 'year':
      return { start: shiftDay(today, -729), end: shiftDay(today, -365) };
    case 'all':
      // "all" has no prior period; an empty range yields zeroed stats.
      return { start: '0000-01-01', end: '0000-01-01' };
  }
}

/**
 * Count distinct readables a user finished in a [start, end] UTC-day window.
 *
 * Sourcing: `reading_stats_daily` does not track per-day "finished" events, so
 * the soundest available signal is `reading_progress`: a row is "finished" when
 * `finished = true` (set when position crossed 0.999), and its `updated_at`
 * timestamp is the best proxy for *when* it was finished (the write that
 * flipped `finished` also bumps `updated_at`). We count distinct readableKeys
 * whose finished row was last updated within the window. This slightly
 * over-attributes a finished book to a later window if the user re-opens it
 * after finishing (which re-bumps updated_at), but there is no dedicated
 * finishedAt column to do better without a schema change.
 */
async function countBooksFinished(
  userId: number,
  startDay: string,
  endDay: string,
): Promise<number> {
  // updated_at is a timestamp_ms; compare against the window's day bounds.
  const startMs = Date.parse(`${startDay}T00:00:00.000Z`);
  // end is inclusive of the whole day, so use the start of the following day.
  const endMs = Date.parse(`${shiftDay(endDay, 1)}T00:00:00.000Z`);
  const rows = await getDb()
    .select({
      n: sql<number>`count(distinct ${readingProgress.readableKey})`,
    })
    .from(readingProgress)
    .where(
      and(
        eq(readingProgress.userId, userId),
        eq(readingProgress.finished, true),
        gte(readingProgress.updatedAt, new Date(startMs)),
        lt(readingProgress.updatedAt, new Date(endMs)),
      ),
    );
  return Number(rows[0]?.n ?? 0);
}

/** Sum minutes + units for a user over an inclusive [start, end] day window. */
async function sumWindow(
  userId: number,
  startDay: string,
  endDay: string,
): Promise<{ minutes: number; units: number }> {
  const rows = await getDb()
    .select({
      seconds: sql<number>`coalesce(sum(${readingStatsDaily.secondsRead}), 0)`,
      units: sql<number>`coalesce(sum(${readingStatsDaily.unitsRead}), 0)`,
    })
    .from(readingStatsDaily)
    .where(
      and(
        eq(readingStatsDaily.userId, userId),
        gte(readingStatsDaily.day, startDay),
        lte(readingStatsDaily.day, endDay),
      ),
    );
  const seconds = Number(rows[0]?.seconds ?? 0);
  const units = Number(rows[0]?.units ?? 0);
  return { minutes: secondsToMinutes(seconds), units };
}

async function periodStatsForWindow(
  userId: number,
  startDay: string,
  endDay: string,
  today: string,
): Promise<PeriodStats> {
  const [{ minutes, units }, booksFinished] = await Promise.all([
    sumWindow(userId, startDay, endDay),
    countBooksFinished(userId, startDay, endDay),
  ]);
  // Streak is "current as of today", not window-scoped; pull a wide-enough
  // daily history to look back through any gaps.
  const dailyRows = await getDailyStats(userId, shiftDay(today, -370));
  const streakDays = computeStreak(dailyRows, today);
  return { minutes, units, booksFinished, streakDays };
}

/** Aggregate stats over a period window ending today (UTC). */
export async function getPeriodStats(
  userId: number,
  period: StatsPeriod,
  today: string = utcDayString(new Date()),
): Promise<PeriodStats> {
  const { start, end } = periodWindow(period, today);
  return periodStatsForWindow(userId, start, end, today);
}

/** Period stats plus the prior period's, so callers can compute deltas. */
export async function getPeriodStatsWithDelta(
  userId: number,
  period: StatsPeriod,
  today: string = utcDayString(new Date()),
): Promise<PeriodStatsWithDelta> {
  const cur = periodWindow(period, today);
  const prev = previousPeriodWindow(period, today);
  const [current, previous] = await Promise.all([
    periodStatsForWindow(userId, cur.start, cur.end, today),
    periodStatsForWindow(userId, prev.start, prev.end, today),
  ]);
  return { current, previous };
}

/**
 * Minutes per week for the last `weeks` ISO weeks (Monday-started), ascending
 * (oldest first). The final bucket is the current, possibly-partial week.
 */
export async function getWeeklyTrend(
  userId: number,
  weeks = 12,
  today: string = utcDayString(new Date()),
): Promise<WeeklyTrendPoint[]> {
  const thisWeekStart = mondayOf(today);
  // Earliest day we need: the Monday `weeks - 1` weeks before this one.
  const firstWeekStart = shiftDay(thisWeekStart, -7 * (weeks - 1));
  const rows = await getDailyStats(userId, firstWeekStart);
  const byDay = new Map(rows.map((r) => [r.day, r.secondsRead]));

  const out: WeeklyTrendPoint[] = [];
  for (let w = weeks - 1; w >= 0; w -= 1) {
    const weekStart = shiftDay(thisWeekStart, -7 * w);
    let seconds = 0;
    for (let d = 0; d < 7; d += 1) {
      seconds += byDay.get(shiftDay(weekStart, d)) ?? 0;
    }
    out.push({ weekStart, minutes: secondsToMinutes(seconds) });
  }
  return out;
}

/**
 * The Mon–Sun minutes distribution for a period. For `week` this is the current
 * week; for longer periods it's the average-agnostic SUM of minutes that fell on
 * each weekday across the whole window (index 0 = Monday … 6 = Sunday).
 */
export async function getDailyDistribution(
  userId: number,
  period: StatsPeriod,
  today: string = utcDayString(new Date()),
): Promise<number[]> {
  const dist = new Array<number>(7).fill(0);
  if (period === 'week') {
    const weekStart = mondayOf(today);
    const rows = await getDailyStats(userId, weekStart);
    const byDay = new Map(rows.map((r) => [r.day, r.secondsRead]));
    for (let d = 0; d < 7; d += 1) {
      const day = shiftDay(weekStart, d);
      dist[d] = secondsToMinutes(byDay.get(day) ?? 0);
    }
    return dist;
  }
  const { start, end } = periodWindow(period, today);
  const rows = await getDailyStats(userId, start);
  for (const r of rows) {
    if (r.day > end) continue;
    const idx = weekdayIndex(r.day);
    dist[idx] = (dist[idx] ?? 0) + r.secondsRead;
  }
  return dist.map(secondsToMinutes);
}

/**
 * Minutes per content type over a period (the by-format donut source). Sums the
 * per-content-type `reading_stats_daily` rows. The `'other'` sentinel bucket is
 * included when legacy/untyped rows contributed.
 */
export async function getFormatMix(
  userId: number,
  period: StatsPeriod,
  today: string = utcDayString(new Date()),
): Promise<FormatMix> {
  const { start, end } = periodWindow(period, today);
  const rows = await getDb()
    .select({
      contentType: readingStatsDaily.contentType,
      seconds: sql<number>`coalesce(sum(${readingStatsDaily.secondsRead}), 0)`,
    })
    .from(readingStatsDaily)
    .where(
      and(
        eq(readingStatsDaily.userId, userId),
        gte(readingStatsDaily.day, start),
        lte(readingStatsDaily.day, end),
      ),
    )
    .groupBy(readingStatsDaily.contentType);
  const mix: FormatMix = {};
  for (const r of rows) {
    const minutes = secondsToMinutes(Number(r.seconds));
    if (minutes > 0) mix[r.contentType] = (mix[r.contentType] ?? 0) + minutes;
  }
  return mix;
}

/**
 * Per-day minutes for the last `days` days (oldest first), suitable for the
 * GitHub-style contribution heatmap. Days with no reading are omitted; callers
 * that need a dense grid should fill gaps with 0.
 */
export async function getHeatmap(
  userId: number,
  days = 371,
  today: string = utcDayString(new Date()),
): Promise<DayMinutes[]> {
  const since = shiftDay(today, -(days - 1));
  const rows = await getDailyStats(userId, since);
  return rows
    .filter((r) => r.day <= today && r.secondsRead > 0)
    .map((r) => ({ day: r.day, minutes: secondsToMinutes(r.secondsRead) }));
}

/** Monday (UTC) of the ISO week containing `day`. */
export function mondayOf(day: string): string {
  return shiftDay(day, -weekdayIndex(day));
}

/** 0 = Monday … 6 = Sunday for a UTC day string. */
function weekdayIndex(day: string): number {
  const dow = new Date(`${day}T00:00:00.000Z`).getUTCDay(); // 0 = Sun … 6 = Sat
  return (dow + 6) % 7;
}

// Re-export the ContentType type so callers can build a typed FormatMix view.
export type { ContentType };
