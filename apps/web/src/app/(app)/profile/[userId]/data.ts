/**
 * Server-side data assembly for a household member's read-only profile dossier
 * (`/profile/[userId]`). Mirrors the dashboard's `data.ts` pattern: one pass
 * fetches every section's data and returns plain, serializable shapes the
 * (server) page renders. All-time scoped (the profile shows lifetime stats).
 *
 * Every per-user DAL it calls already takes a `userId`, so the same functions
 * that power the current user's dashboard power any member's profile.
 */

import type { ContentType } from '@bookkeeprr/types';
import { listContinueReading } from '@/server/db/reading-progress';
import {
  getPeriodStats,
  getFormatMix,
  getWeeklyTrend,
  getHeatmap,
  type PeriodStats,
} from '@/server/db/reading-stats-agg';
import { getLeaderboard, type LeaderboardEntry } from '@/server/db/dashboard-agg';
import { listUserActivity, type ActivityFeedItem } from '@/server/db/activity-events';
import { getUser, listUsers } from '@/server/db/users';
import { getDailyStats } from '@/server/db/reading-stats';
import { utcDayString, shiftDay } from '@/server/db/reading-stats-util';

const CONTINUE_LIMIT = 8;
const ACTIVITY_LIMIT = 12;
const FINISHED_LIMIT = 16;
const TREND_WEEKS = 12;
const HEATMAP_DAYS = 371;

/** A continue-reading tile (the member's in-progress titles). */
export type ProfileContinueItem = {
  readableKey: string;
  title: string;
  contentType: ContentType;
  coverUrl: string | null;
  /** 0..100 reading progress. */
  pct: number;
  seriesId: number;
  volumeNumber: number | null;
  volumeTitle: string | null;
};

/** A finished-shelf tile (the member's completed titles, newest first). */
export type ProfileFinishedItem = {
  readableKey: string;
  title: string;
  contentType: ContentType;
  coverUrl: string | null;
  seriesId: number;
  volumeNumber: number | null;
  volumeTitle: string | null;
};

/** Per-content-type minutes view (legacy/untyped rows are dropped). */
export type ProfileFormatView = {
  byType: Partial<Record<ContentType, number>>;
  totalMinutes: number;
};

/** One day of the contribution heatmap (YYYY-MM-DD + minutes). */
export type ProfileHeatDay = { date: string; value: number };

/** A household member shown in the member strip (jump between profiles). */
export type ProfileMember = {
  id: number;
  name: string;
  avatarUrl: string | null;
};

/** The viewed member's identity. */
export type ProfileIdentity = {
  id: number;
  name: string;
  /** Display role label ("Owner" for admins, "Member" otherwise). */
  roleLabel: string;
  isAdmin: boolean;
  /** Avatar URL (the per-user avatar route), or null when none is set. */
  avatarUrl: string | null;
  /** Seed string for Avatar gravatar + colour (email if set, else name). */
  avatarSeed: string;
  /** Pre-formatted join date, e.g. "Jun 2026". */
  joinedLabel: string;
  /** Dominant content type over all time (the "loves" line), or null. */
  favType: ContentType | null;
};

/** Everything the profile page renders, assembled server-side. */
export type ProfileData = {
  member: ProfileIdentity;
  /** True when the viewed member is the current viewer. */
  isYou: boolean;
  stats: PeriodStats;
  /** 1-based all-time rank by reading time, and total member count. */
  serverRank: number;
  memberCount: number;
  /** Current streak (= stats.streakDays) and the longest historical streak. */
  longestStreak: number;
  continueItems: ProfileContinueItem[];
  activity: ActivityFeedItem[];
  format: ProfileFormatView;
  trend: number[];
  heatmap: ProfileHeatDay[];
  /** Distinct active days over the heatmap window. */
  activeDays: number;
  finished: ProfileFinishedItem[];
  members: ProfileMember[];
};

function bestTitle(r: {
  title?: string | null;
  titleEnglish?: string | null;
  titleRomaji?: string | null;
  titleNative?: string | null;
}): string {
  return r.title ?? r.titleEnglish ?? r.titleRomaji ?? r.titleNative ?? 'Untitled';
}

/** Map a per-type format mix to the dominant content type (the "loves" type). */
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

/**
 * The 1-based rank of `userId` within an all-time, time-ranked leaderboard.
 * Pure so it's unit-testable. Returns the leaderboard length + 1 (i.e. last)
 * when the user is absent, which keeps the "#N of M" tile sensible.
 */
export function serverRankIn(entries: LeaderboardEntry[], userId: number): number {
  const idx = entries.findIndex((e) => e.userId === userId);
  return idx === -1 ? entries.length + 1 : idx + 1;
}

/**
 * The longest run of consecutive UTC days with any reading in `rows`. Pure so
 * it's unit-testable. `rows` need not be sorted; days with no reading break a
 * run. An empty history yields 0.
 */
export function longestStreak(rows: { day: string; secondsRead: number }[]): number {
  const read = rows.filter((r) => r.secondsRead > 0).map((r) => r.day).sort();
  let best = 0;
  let run = 0;
  let prev: string | null = null;
  for (const day of read) {
    if (prev !== null && shiftDay(prev, 1) === day) {
      run += 1;
    } else {
      run = 1;
    }
    if (run > best) best = run;
    prev = day;
  }
  return best;
}

function joinedLabel(createdAt: Date): string {
  return createdAt.toLocaleDateString('en-US', {
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

/**
 * Assemble the full profile payload for a viewed member. Returns `null` when the
 * member id is unknown (the page maps that to a Next `notFound()`). `viewerId`
 * is the current session user, used only to flag the "you" affordances.
 * `today` is injectable for deterministic tests.
 */
export async function loadProfileData(
  userId: number,
  viewerId: number,
  today: string = utcDayString(new Date()),
): Promise<ProfileData | null> {
  const user = await getUser(userId);
  if (user === null) return null;

  const [
    stats,
    formatMixRaw,
    trendPoints,
    heatDays,
    continueRows,
    activity,
    leaderboard,
    members,
    dailyRows,
  ] = await Promise.all([
    getPeriodStats(userId, 'all', today),
    getFormatMix(userId, 'all', today),
    getWeeklyTrend(userId, TREND_WEEKS, today),
    getHeatmap(userId, HEATMAP_DAYS, today),
    listContinueReading(userId, 64),
    listUserActivity(userId, ACTIVITY_LIMIT),
    getLeaderboard('all', 'time', today),
    listUsers(),
    getDailyStats(userId, shiftDay(today, -(HEATMAP_DAYS - 1))),
  ]);

  // Format mix: drop the `other` sentinel from the typed donut view.
  const byType: Partial<Record<ContentType, number>> = {};
  let totalMinutes = 0;
  for (const [type, minutes] of Object.entries(formatMixRaw)) {
    totalMinutes += minutes;
    if (type === 'other') continue;
    byType[type as ContentType] = minutes;
  }

  // Continue reading: in-progress (not finished, has a position) titles.
  const continueItems: ProfileContinueItem[] = continueRows
    .filter((r) => !r.finished && r.position > 0 && r.position < 0.999)
    .slice(0, CONTINUE_LIMIT)
    .map((r) => ({
      readableKey: r.readableKey,
      title: bestTitle(r),
      contentType: r.contentType as ContentType,
      coverUrl: r.coverUrl,
      pct: Math.round(Math.max(0, Math.min(1, r.position)) * 100),
      seriesId: r.seriesId,
      volumeNumber: r.volumeNumber,
      volumeTitle: r.volumeTitle,
    }));

  // Finished shelf: completed titles, newest first (listContinueReading is
  // already ordered by updatedAt desc).
  const finished: ProfileFinishedItem[] = continueRows
    .filter((r) => r.finished)
    .slice(0, FINISHED_LIMIT)
    .map((r) => ({
      readableKey: r.readableKey,
      title: bestTitle(r),
      contentType: r.contentType as ContentType,
      coverUrl: r.coverUrl,
      seriesId: r.seriesId,
      volumeNumber: r.volumeNumber,
      volumeTitle: r.volumeTitle,
    }));

  const heatmap: ProfileHeatDay[] = heatDays.map((d) => ({ date: d.day, value: d.minutes }));
  const activeDays = heatmap.filter((d) => d.value > 0).length;

  const member: ProfileIdentity = {
    id: user.id,
    name: user.displayName ?? user.username,
    roleLabel: user.role === 'admin' ? 'Owner' : 'Member',
    isAdmin: user.role === 'admin',
    avatarUrl: user.avatarPath != null ? `/api/auth/me/avatar/${user.id}` : null,
    // Only seed the avatar with the real email (→ Gravatar) for the viewer's own
    // profile. Other members' emails are PII and must not be rendered into the
    // page for any viewer; their avatars seed from a non-private identifier.
    avatarSeed:
      userId === viewerId
        ? (user.email ?? user.displayName ?? user.username)
        : (user.displayName ?? user.username),
    joinedLabel: joinedLabel(user.createdAt),
    favType: favTypeOf(byType),
  };

  const memberList: ProfileMember[] = members.map((m) => ({
    id: m.id,
    name: m.displayName ?? m.username,
    avatarUrl: m.avatarPath != null ? `/api/auth/me/avatar/${m.id}` : null,
  }));

  return {
    member,
    isYou: userId === viewerId,
    stats,
    serverRank: serverRankIn(leaderboard, userId),
    memberCount: members.length,
    longestStreak: longestStreak(dailyRows),
    continueItems,
    activity,
    format: { byType, totalMinutes },
    trend: trendPoints.map((t) => t.minutes),
    heatmap,
    activeDays,
    finished,
    members: memberList,
  };
}
