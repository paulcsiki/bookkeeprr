import { type NextRequest, NextResponse } from 'next/server';
import { requireUserId } from '@/server/auth/require-user';
import { computeStreak, getDailyStats } from '@/server/db/reading-stats';
import { lastNDays, shiftDay, utcDayString } from '@/server/db/reading-stats-util';

export const dynamic = 'force-dynamic';

const WEEK_DAYS = 7;

export type ReaderStatsDay = { day: string; secondsRead: number; unitsRead: number };
export type ReaderStatsResponse = {
  days: ReaderStatsDay[];
  totalSeconds: number;
  totalUnits: number;
  streak: number;
  pacePerHour: number | null;
};

export async function GET(req: NextRequest): Promise<NextResponse> {
  const userId = await requireUserId(req);
  if (userId === null) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const today = utcDayString(new Date());
  // Pull a slightly wider window than the 7-day chart so the streak can look
  // back beyond the visible week.
  const since = shiftDay(today, -60);
  const rows = await getDailyStats(userId, since);

  const byDay = new Map(rows.map((r) => [r.day, r]));
  const days: ReaderStatsDay[] = lastNDays(today, WEEK_DAYS).map((day) => {
    const r = byDay.get(day);
    return { day, secondsRead: r?.secondsRead ?? 0, unitsRead: r?.unitsRead ?? 0 };
  });

  const totalSeconds = days.reduce((sum, d) => sum + d.secondsRead, 0);
  const totalUnits = days.reduce((sum, d) => sum + d.unitsRead, 0);
  const streak = computeStreak(rows, today);
  const pacePerHour = totalSeconds > 0 ? (totalUnits / totalSeconds) * 3600 : null;

  const payload: ReaderStatsResponse = {
    days,
    totalSeconds,
    totalUnits,
    streak,
    pacePerHour,
  };
  return NextResponse.json(payload, { status: 200 });
}
