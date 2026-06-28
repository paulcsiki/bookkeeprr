import { type NextRequest, NextResponse } from 'next/server';
import { requireUserId } from '@/server/auth/require-user';
import { getDailyStats } from '@/server/db/reading-stats';
import { shiftDay, utcDayString } from '@/server/db/reading-stats-util';

export const dynamic = 'force-dynamic';

const WINDOW_DAYS = 14;
const MIN_ACTIVE_DAYS = 3;

export type PaceResponse = {
  /** Average pages/chapters per active reading day; null if insufficient data. */
  pagesPerDay: number | null;
  /** Average seconds per active reading day; null if insufficient data. */
  secondsPerDay: number | null;
  /** Number of active reading days in the last 14-day window. */
  days: number;
};

/**
 * GET /api/reader/stats/pace
 *
 * Returns the user's reading pace derived from the last 14 days of
 * `readingStatsDaily`. Returns null metrics when fewer than 3 active days
 * are on record (not enough data for a meaningful average).
 *
 * "Active day" = any day with secondsRead > 0.
 * "pagesPerDay" = unitsRead / activeDays (units = pages/chapters for text/comics,
 * listened-minutes for audio).
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const userId = await requireUserId(req);
  if (userId === null) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const today = utcDayString(new Date());
  const since = shiftDay(today, -(WINDOW_DAYS - 1));

  const rows = await getDailyStats(userId, since);
  const activeDays = rows.filter((r) => r.secondsRead > 0);

  if (activeDays.length < MIN_ACTIVE_DAYS) {
    return NextResponse.json(
      { pagesPerDay: null, secondsPerDay: null, days: activeDays.length } satisfies PaceResponse,
      { status: 200 },
    );
  }

  const totalUnits = activeDays.reduce((s, r) => s + r.unitsRead, 0);
  const totalSeconds = activeDays.reduce((s, r) => s + r.secondsRead, 0);
  const n = activeDays.length;

  const payload: PaceResponse = {
    pagesPerDay: totalUnits / n,
    secondsPerDay: totalSeconds / n,
    days: n,
  };
  return NextResponse.json(payload, { status: 200 });
}
