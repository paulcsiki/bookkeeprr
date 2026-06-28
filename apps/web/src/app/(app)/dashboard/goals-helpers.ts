/**
 * Goal-ring numerator helpers. The yearly-books ring needs a calendar-year-to-
 * date finished count (distinct from the period-window counts in
 * `reading-stats-agg`), so it's computed here against the same finished-progress
 * signal that the agg DAL uses.
 */

import { and, eq, gte, lt, sql } from 'drizzle-orm';
import { getDb } from '@/server/db/client';
import { readingProgress } from '@/server/db/schema';
import { shiftDay } from '@/server/db/reading-stats-util';

/**
 * Distinct readables a user finished within an inclusive [startDay, endDay]
 * UTC-day window, sourced from `reading_progress` (finished = true, last touched
 * inside the window). Used for the yearly-books goal ring.
 */
export async function getYearBooksFinished(
  userId: number,
  startDay: string,
  endDay: string,
): Promise<number> {
  const startMs = Date.parse(`${startDay}T00:00:00.000Z`);
  const endMs = Date.parse(`${shiftDay(endDay, 1)}T00:00:00.000Z`);
  const rows = await getDb()
    .select({ n: sql<number>`count(distinct ${readingProgress.readableKey})` })
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
