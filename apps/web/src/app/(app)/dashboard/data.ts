/**
 * Server-side data assembly for the Dashboard page. Fetches every widget's data
 * for the selected period in one pass and returns plain, serializable shapes the
 * (server) widgets render. Per-widget failures degrade to an empty shape so the
 * page never crashes on a partial install.
 */

import type { ContentType } from '@bookkeeprr/types';
import { listContinueReading } from '@/server/db/reading-progress';
import {
  getPeriodStatsWithDelta,
  getDailyDistribution,
  getWeeklyTrend,
  getFormatMix,
  mondayOf,
  type StatsPeriod,
  type PeriodStats,
} from '@/server/db/reading-stats-agg';
import { getGoals, type ReadingGoals } from '@/server/db/reading-goals';
import {
  getLeaderboard,
  getServerTotals,
  type LeaderboardEntry,
  type LeaderboardMetric,
  type ServerTotals,
} from '@/server/db/dashboard-agg';
import { listRecentActivity, type ActivityFeedItem } from '@/server/db/activity-events';
import { listCalendarEntries, type CalendarEntry } from '@/server/db/calendar';
import { listAllSeries } from '@/server/db/series';
import { listUsers } from '@/server/db/users';
import { getDailyStats } from '@/server/db/reading-stats';
import { utcDayString, shiftDay } from '@/server/db/reading-stats-util';
import { getYearBooksFinished } from './goals-helpers';

const FEED_LIMIT = 7;
const CONTINUE_LIMIT = 8;
const RECENT_LIMIT = 10;
const RELEASES_LIMIT = 6;
const RELEASES_WINDOW_DAYS = 60;

const METRICS: LeaderboardMetric[] = ['time', 'books', 'streak'];

/** A continue-reading tile. */
export type ContinueItem = {
  readableKey: string;
  title: string;
  contentType: ContentType;
  coverUrl: string | null;
  /** 0..100 reading progress. */
  pct: number;
  seriesId: number;
  /**
   * Deep link straight into the reader at the saved position (the reader resumes
   * from reading_progress on load). Prefers the library file, then the volume;
   * null when neither is known (the widget falls back to the series page).
   */
  readerHref: string | null;
};

/** A recently-added library tile. */
export type RecentItem = {
  seriesId: number;
  title: string;
  contentType: ContentType;
  coverUrl: string | null;
  author: string | null;
};

/** A resolved upcoming-release row. */
export type ReleaseItem = {
  seriesId: number;
  volumeId: number;
  title: string;
  contentType: ContentType;
  coverUrl: string | null;
  /** Pre-formatted "in N days" / "Tomorrow" / date label. */
  whenLabel: string;
  /** Mono detail, e.g. "Vol. 14". */
  detail: string;
  /** True when releasing tomorrow (highlights the label). */
  soon: boolean;
};

/** Per-content-type minutes, keyed by content type (legacy/untyped → `other`). */
export type FormatMixView = { byType: Partial<Record<ContentType, number>>; totalMinutes: number };

export type GoalsView = {
  goals: ReadingGoals;
  /** Books finished so far this calendar year (yearly-ring numerator). */
  yearBooksDone: number;
  /** Minutes read this calendar week (weekly-ring numerator). */
  weekMinutesDone: number;
  /** Current streak length in days. */
  streakDays: number;
};

/** Everything the dashboard page renders, assembled server-side. */
export type DashboardData = {
  period: StatsPeriod;
  greetingName: string;
  continueItems: ContinueItem[];
  personal: {
    current: PeriodStats;
    previous: PeriodStats;
    distribution: number[];
    trend: number[];
    favType: ContentType | null;
  };
  goals: GoalsView;
  leaderboard: Record<LeaderboardMetric, LeaderboardEntry[]>;
  format: FormatMixView;
  feed: ActivityFeedItem[];
  releases: ReleaseItem[];
  server: ServerTotals;
  recent: RecentItem[];
  memberCount: number;
};

function bestTitle(r: {
  title?: string | null;
  titleEnglish?: string | null;
  titleRomaji?: string | null;
  titleNative?: string | null;
}): string {
  return (
    r.title ?? r.titleEnglish ?? r.titleRomaji ?? r.titleNative ?? 'Untitled'
  );
}

/** Map a per-type format mix to the dominant content type (the fav). */
function favTypeOf(mix: Partial<Record<ContentType, number>>): ContentType | null {
  let best: ContentType | null = null;
  let bestVal = 0;
  for (const [type, minutes] of Object.entries(mix)) {
    if ((minutes ?? 0) > bestVal) {
      bestVal = minutes ?? 0;
      best = type as ContentType;
    }
  }
  return best;
}

/** ISO start-of-year day string (UTC) for `today`. */
function startOfYear(today: string): string {
  return `${today.slice(0, 4)}-01-01`;
}

/** Books finished this calendar year, for the yearly goal ring. */
async function yearBooksFinished(userId: number, today: string): Promise<number> {
  return getYearBooksFinished(userId, startOfYear(today), today);
}

/** Minutes read this calendar week (Mon→today), for the weekly goal ring. */
async function weekMinutes(userId: number, today: string): Promise<number> {
  const weekStart = mondayOf(today);
  const rows = await getDailyStats(userId, weekStart);
  const seconds = rows
    .filter((r) => r.day >= weekStart && r.day <= today)
    .reduce((sum, r) => sum + r.secondsRead, 0);
  return Math.round(seconds / 60);
}

function formatReleaseWhen(date: string, today: string): { label: string; soon: boolean } {
  const tomorrow = shiftDay(today, 1);
  if (date === today) return { label: 'Today', soon: true };
  if (date === tomorrow) return { label: 'Tomorrow', soon: true };
  const d = new Date(`${date}T00:00:00.000Z`);
  return {
    label: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }),
    soon: false,
  };
}

/**
 * Assemble the full dashboard payload for a user + period. Designed to be called
 * from the server page (and from tests) with an injectable `today` for
 * determinism.
 */
export async function loadDashboardData(
  userId: number,
  greetingName: string,
  period: StatsPeriod,
  today: string = utcDayString(new Date()),
): Promise<DashboardData> {
  const [
    continueRows,
    statsDelta,
    distribution,
    trendPoints,
    formatMixRaw,
    goals,
    yearBooksDone,
    weekMinutesDone,
    feed,
    calendarRows,
    seriesRows,
    members,
    leaderboards,
    server,
  ] = await Promise.all([
    listContinueReading(userId, CONTINUE_LIMIT),
    getPeriodStatsWithDelta(userId, period, today),
    getDailyDistribution(userId, period, today),
    getWeeklyTrend(userId, 12, today),
    getFormatMix(userId, period, today),
    getGoals(userId),
    yearBooksFinished(userId, today),
    weekMinutes(userId, today),
    listRecentActivity(FEED_LIMIT),
    listCalendarEntries(
      new Date(`${today}T00:00:00.000Z`),
      new Date(`${shiftDay(today, RELEASES_WINDOW_DAYS)}T00:00:00.000Z`),
    ),
    listAllSeries(),
    listUsers(),
    Promise.all(METRICS.map((m) => getLeaderboard(period, m, today))),
    getServerTotals(period, today),
  ]);

  // Continue reading: in-progress (not finished, has some position) titles.
  const continueItems: ContinueItem[] = continueRows
    .filter((r) => !r.finished && r.position > 0 && r.position < 0.999)
    .map((r) => ({
      readableKey: r.readableKey,
      title: bestTitle(r),
      contentType: r.contentType as ContentType,
      coverUrl: r.coverUrl,
      pct: Math.round(Math.max(0, Math.min(1, r.position)) * 100),
      seriesId: r.seriesId,
      readerHref:
        r.libraryFileId != null
          ? `/read/f/${r.libraryFileId}`
          : r.volumeId != null
            ? `/read/v/${r.volumeId}`
            : null,
    }));

  // Format mix: drop the `other` sentinel from the typed donut view.
  const byType: Partial<Record<ContentType, number>> = {};
  let totalMinutes = 0;
  for (const [type, minutes] of Object.entries(formatMixRaw)) {
    totalMinutes += minutes;
    if (type === 'other') continue;
    byType[type as ContentType] = minutes;
  }

  const recent: RecentItem[] = [...seriesRows]
    .sort((a, b) => b.addedAt.getTime() - a.addedAt.getTime())
    .slice(0, RECENT_LIMIT)
    .map((s) => ({
      seriesId: s.id,
      title: bestTitle(s),
      contentType: s.contentType as ContentType,
      coverUrl: s.coverUrl,
      author: s.author,
    }));

  const releases: ReleaseItem[] = calendarRows.slice(0, RELEASES_LIMIT).map((c: CalendarEntry) => {
    const { label, soon } = formatReleaseWhen(c.date, today);
    const isAudio = c.contentType === 'audiobook';
    const detail =
      c.volumeTitle ?? (isAudio ? c.seriesTitle : `Vol. ${c.volumeNumber}`);
    return {
      seriesId: c.seriesId,
      volumeId: c.volumeId,
      title: c.seriesTitle,
      contentType: c.contentType,
      coverUrl: c.coverUrl,
      whenLabel: label,
      detail,
      soon,
    };
  });

  const leaderboard: Record<LeaderboardMetric, LeaderboardEntry[]> = {
    time: leaderboards[0]!,
    books: leaderboards[1]!,
    streak: leaderboards[2]!,
  };

  return {
    period,
    greetingName,
    continueItems,
    personal: {
      current: statsDelta.current,
      previous: statsDelta.previous,
      distribution,
      trend: trendPoints.map((t) => t.minutes),
      favType: favTypeOf(byType),
    },
    goals: { goals, yearBooksDone, weekMinutesDone, streakDays: statsDelta.current.streakDays },
    leaderboard,
    format: { byType, totalMinutes },
    feed,
    releases,
    server,
    recent,
    memberCount: members.length,
  };
}

// Re-exported for tests.
export { startOfYear };
