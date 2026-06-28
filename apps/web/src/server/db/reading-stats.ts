import { and, asc, eq, gte, sql } from 'drizzle-orm';
import type { ContentType } from '@/server/content-type';
import { getDb } from './client';
import { readingStatsDaily, type ReadingStatsDailyRow } from './schema';
import { withWriteLock } from './write-lock';
import { shiftDay } from './reading-stats-util';

/**
 * Sentinel content type for daily-stats rows whose type is unknown — legacy
 * rows written before the `content_type` column existed, and any writer that
 * can't resolve the readable's series type.
 */
export const UNKNOWN_CONTENT_TYPE = 'other';

export type AddReadingTimeInput = {
  userId: number;
  /** Calendar day in UTC, formatted YYYY-MM-DD. */
  day: string;
  seconds: number;
  units?: number;
  /**
   * The readable's series content type. Attributes the day's reading to a
   * type so the by-format donut can sum per type. Defaults to the `'other'`
   * sentinel when the caller can't resolve it.
   */
  contentType?: ContentType | typeof UNKNOWN_CONTENT_TYPE;
};

/** A daily-stats row as needed by streak/aggregation helpers. */
export type DailyStat = Pick<ReadingStatsDailyRow, 'day' | 'secondsRead' | 'unitsRead'>;

/**
 * Add reading time + units to a user's daily total, creating the row on first
 * write and incrementing it on subsequent writes for the same day.
 */
export async function addReadingTime(input: AddReadingTimeInput): Promise<void> {
  const seconds = Math.max(0, Math.round(input.seconds));
  const units = Math.max(0, Math.round(input.units ?? 0));
  if (seconds === 0 && units === 0) return;
  const contentType = input.contentType ?? UNKNOWN_CONTENT_TYPE;
  await withWriteLock(async () => {
    await getDb()
      .insert(readingStatsDaily)
      .values({
        userId: input.userId,
        day: input.day,
        contentType,
        secondsRead: seconds,
        unitsRead: units,
      })
      .onConflictDoUpdate({
        target: [readingStatsDaily.userId, readingStatsDaily.day, readingStatsDaily.contentType],
        set: {
          secondsRead: sql`${readingStatsDaily.secondsRead} + ${seconds}`,
          unitsRead: sql`${readingStatsDaily.unitsRead} + ${units}`,
        },
      });
  });
}

/**
 * Daily stats for a user on/after `sinceDay`, ascending by day, summed across
 * content types so each row is the daily TOTAL for a (user, day). This keeps
 * the contract of existing callers (the weekly chart, streak, pace) unchanged
 * now that the underlying grain is per-content-type. Use `getDailyStatsByType`
 * when the per-type breakdown is needed.
 */
export async function getDailyStats(
  userId: number,
  sinceDay: string,
): Promise<DailyTotalRow[]> {
  const rows = await getDb()
    .select({
      day: readingStatsDaily.day,
      secondsRead: sql<number>`sum(${readingStatsDaily.secondsRead})`,
      unitsRead: sql<number>`sum(${readingStatsDaily.unitsRead})`,
    })
    .from(readingStatsDaily)
    .where(and(eq(readingStatsDaily.userId, userId), gte(readingStatsDaily.day, sinceDay)))
    .groupBy(readingStatsDaily.day)
    .orderBy(asc(readingStatsDaily.day));
  // SQLite SUM() returns the value as-is; ensure numbers for downstream math.
  return rows.map((r) => ({
    day: r.day,
    secondsRead: Number(r.secondsRead),
    unitsRead: Number(r.unitsRead),
  }));
}

/** A daily TOTAL row (summed across content types) for a (user, day). */
export type DailyTotalRow = { day: string; secondsRead: number; unitsRead: number };

/** Raw per-(day, contentType) daily stats for a user on/after `sinceDay`. */
export async function getDailyStatsByType(
  userId: number,
  sinceDay: string,
): Promise<ReadingStatsDailyRow[]> {
  return getDb()
    .select()
    .from(readingStatsDaily)
    .where(and(eq(readingStatsDaily.userId, userId), gte(readingStatsDaily.day, sinceDay)))
    .orderBy(asc(readingStatsDaily.day));
}

/** Step a YYYY-MM-DD day string back one UTC day. */
function previousDay(day: string): string {
  return shiftDay(day, -1);
}

/**
 * Length of the current reading streak: consecutive days with `secondsRead > 0`
 * ending on `today` or `yesterday`. A gap of one or more days breaks it. Pure —
 * operates only on the supplied rows.
 */
export function computeStreak(rows: DailyStat[], today: string): number {
  const read = new Set(rows.filter((r) => r.secondsRead > 0).map((r) => r.day));
  // The streak may end today or, if today has no reading yet, yesterday.
  let cursor = read.has(today) ? today : previousDay(today);
  if (!read.has(cursor)) return 0;
  let streak = 0;
  while (read.has(cursor)) {
    streak += 1;
    cursor = previousDay(cursor);
  }
  return streak;
}
