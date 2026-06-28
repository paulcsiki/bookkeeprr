import { listUsers } from './users';
import { getPeriodStats, type StatsPeriod } from './reading-stats-agg';
import { utcDayString } from './reading-stats-util';

/**
 * Multi-user (household) aggregation for the dashboard's social widgets. These
 * fan out over `listUsers()` and call the Task-1 per-user period stats once per
 * member. The household is small (a handful of users), so the N+1 fan-out is
 * acceptable; revisit with a grouped query if it ever grows.
 */

/** The metric a leaderboard is ranked by. */
export type LeaderboardMetric = 'time' | 'books' | 'streak';

export type LeaderboardEntry = {
  userId: number;
  displayName: string;
  /** Avatar URL (the per-user avatar route), or null when none is set. */
  avatarUrl: string | null;
  role: 'admin' | 'user';
  /** The metric value: minutes for 'time', books for 'books', days for 'streak'. */
  value: number;
};

function avatarUrlFor(userId: number, avatarPath: string | null): string | null {
  return avatarPath != null ? `/api/auth/me/avatar/${userId}` : null;
}

function metricValue(
  stats: { minutes: number; booksFinished: number; streakDays: number },
  metric: LeaderboardMetric,
): number {
  switch (metric) {
    case 'time':
      return stats.minutes;
    case 'books':
      return stats.booksFinished;
    case 'streak':
      return stats.streakDays;
  }
}

/**
 * Household leaderboard for a period, ranked desc by `metric`. Includes every
 * user (even those with a zero value) so the dashboard can show the full
 * household; callers that want only active members can filter `value > 0`.
 */
export async function getLeaderboard(
  period: StatsPeriod,
  metric: LeaderboardMetric,
  today: string = utcDayString(new Date()),
): Promise<LeaderboardEntry[]> {
  const users = await listUsers();
  const entries = await Promise.all(
    users.map(async (u) => {
      const stats = await getPeriodStats(u.id, period, today);
      return {
        userId: u.id,
        displayName: u.displayName ?? u.username,
        avatarUrl: avatarUrlFor(u.id, u.avatarPath),
        role: u.role,
        value: metricValue(stats, metric),
      } satisfies LeaderboardEntry;
    }),
  );
  return entries.sort((a, b) => b.value - a.value || a.userId - b.userId);
}

export type ServerTotals = {
  /** Total reading minutes across all users in the period. */
  minutes: number;
  /** Total books finished across all users in the period. */
  booksFinished: number;
  /** Total units (pages/chapters/listened-minutes) across all users in the period. */
  units: number;
  /** Users with any reading activity (minutes > 0) in the period. */
  activeReaders: number;
  /** Total household members. */
  totalMembers: number;
};

/** Server-wide totals for a period, summed across all household members. */
export async function getServerTotals(
  period: StatsPeriod,
  today: string = utcDayString(new Date()),
): Promise<ServerTotals> {
  const users = await listUsers();
  const perUser = await Promise.all(
    users.map((u) => getPeriodStats(u.id, period, today)),
  );
  let minutes = 0;
  let booksFinished = 0;
  let units = 0;
  let activeReaders = 0;
  for (const s of perUser) {
    minutes += s.minutes;
    booksFinished += s.booksFinished;
    units += s.units;
    if (s.minutes > 0) activeReaders += 1;
  }
  return { minutes, booksFinished, units, activeReaders, totalMembers: users.length };
}
