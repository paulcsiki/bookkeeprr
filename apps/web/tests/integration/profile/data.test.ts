import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { seedDb, type SeedHandle } from '../helpers/seed';
import { insertUser } from '@/server/db/users';
import { addReadingTime } from '@/server/db/reading-stats';
import { upsertProgress } from '@/server/db/reading-progress';
import { recordActivity } from '@/server/db/activity-events';
import {
  loadProfileData,
  serverRankIn,
  longestStreak,
} from '@/app/(app)/profile/[userId]/data';
import type { LeaderboardEntry } from '@/server/db/dashboard-agg';

let h: SeedHandle;
let paul: number;
let maya: number;

// 2026-06-05 is a Friday; fixing "today" keeps period windows deterministic.
const TODAY = '2026-06-05';

beforeEach(async () => {
  h = await seedDb();
  paul = (
    await insertUser({ username: 'paul', passwordHash: 'x', role: 'admin', mustChangePassword: false })
  ).id;
  maya = (
    await insertUser({ username: 'maya', passwordHash: 'x', role: 'user', mustChangePassword: false })
  ).id;
});
afterEach(() => h.cleanup());

describe('serverRankIn (pure)', () => {
  const lb: LeaderboardEntry[] = [
    { userId: 9, displayName: 'a', avatarUrl: null, role: 'user', value: 100 },
    { userId: 3, displayName: 'b', avatarUrl: null, role: 'user', value: 50 },
    { userId: 7, displayName: 'c', avatarUrl: null, role: 'user', value: 0 },
  ];
  it('returns the 1-based rank of a present user', () => {
    expect(serverRankIn(lb, 9)).toBe(1);
    expect(serverRankIn(lb, 3)).toBe(2);
    expect(serverRankIn(lb, 7)).toBe(3);
  });
  it('returns last+1 for an absent user', () => {
    expect(serverRankIn(lb, 999)).toBe(4);
    expect(serverRankIn([], 1)).toBe(1);
  });
});

describe('longestStreak (pure)', () => {
  it('finds the longest consecutive run of read days', () => {
    const rows = [
      { day: '2026-06-01', secondsRead: 100 },
      { day: '2026-06-02', secondsRead: 100 },
      { day: '2026-06-03', secondsRead: 100 }, // run of 3
      { day: '2026-06-05', secondsRead: 100 }, // gap on the 4th → resets
      { day: '2026-06-06', secondsRead: 0 }, // no reading, ignored
    ];
    expect(longestStreak(rows)).toBe(3);
  });
  it('ignores order and zero days, returns 0 for an empty history', () => {
    expect(longestStreak([])).toBe(0);
    expect(longestStreak([{ day: '2026-06-02', secondsRead: 0 }])).toBe(0);
    expect(
      longestStreak([
        { day: '2026-06-02', secondsRead: 5 },
        { day: '2026-06-01', secondsRead: 5 },
      ]),
    ).toBe(2);
  });
});

describe('loadProfileData — member with history', () => {
  beforeEach(async () => {
    // Paul reads manga today + yesterday (current streak 2), finishes a book and
    // leaves another in progress, and has an activity event + maya outreads him.
    await addReadingTime({ userId: paul, day: TODAY, seconds: 3600, units: 40, contentType: 'manga' });
    await addReadingTime({ userId: paul, day: '2026-06-04', seconds: 1800, units: 20, contentType: 'ebook' });
    await upsertProgress({
      userId: paul,
      readableKey: 'manga:vol:7',
      seriesId: h.seriesId,
      volumeId: h.volumeId,
      contentType: 'manga',
      position: 1,
    });
    await upsertProgress({
      userId: paul,
      readableKey: 'manga:vol:8',
      seriesId: h.seriesId,
      volumeId: h.volumeId,
      contentType: 'manga',
      position: 0.42,
    });
    await recordActivity({ userId: paul, kind: 'finished', seriesId: h.seriesId });
    // Maya outreads paul over all time, so paul ranks #2 by time.
    await addReadingTime({ userId: maya, day: TODAY, seconds: 7200, units: 80, contentType: 'manga' });
  });

  it('assembles a populated dossier', async () => {
    const data = await loadProfileData(paul, paul, TODAY);
    expect(data).not.toBeNull();
    const d = data!;

    expect(d.member.id).toBe(paul);
    expect(d.member.name).toBe('paul');
    expect(d.member.roleLabel).toBe('Owner');
    expect(d.member.isAdmin).toBe(true);
    expect(d.member.favType).toBe('manga');
    expect(d.isYou).toBe(true);

    // all-time stats sum both reading days.
    expect(d.stats.minutes).toBe(90);
    expect(d.stats.streakDays).toBe(2);
    expect(d.longestStreak).toBe(2);

    // maya outreads paul over all time → paul is rank #2 of 2.
    expect(d.serverRank).toBe(2);
    expect(d.memberCount).toBe(2);

    // continue: only the in-progress title; finished shelf: the finished one.
    expect(d.continueItems.map((c) => c.readableKey)).toEqual(['manga:vol:8']);
    expect(d.finished.map((f) => f.readableKey)).toEqual(['manga:vol:7']);
    // Volume fields are present (may be null when no volume linked).
    expect(d.continueItems[0]).toHaveProperty('volumeNumber');
    expect(d.continueItems[0]).toHaveProperty('volumeTitle');
    expect(d.finished[0]).toHaveProperty('volumeNumber');
    expect(d.finished[0]).toHaveProperty('volumeTitle');

    // activity timeline scoped to paul.
    expect(d.activity.length).toBe(1);
    expect(d.activity[0]!.kind).toBe('finished');
    // Volume fields are present on activity items.
    expect(d.activity[0]).toHaveProperty('volumeNumber');
    expect(d.activity[0]).toHaveProperty('volumeTitle');

    // format / trend / heatmap shapes.
    expect(d.format.byType.manga).toBeGreaterThan(0);
    expect(d.format.byType.ebook).toBeGreaterThan(0);
    expect(d.format.totalMinutes).toBe(90);
    expect(d.trend).toHaveLength(12);
    expect(d.activeDays).toBe(2);
    expect(d.heatmap.every((x) => x.value > 0)).toBe(true);

    // member strip lists the whole household.
    expect(d.members.map((m) => m.id).sort()).toEqual([paul, maya].sort());
  });

  it('flags isYou false when viewed by another member', async () => {
    const d = (await loadProfileData(paul, maya, TODAY))!;
    expect(d.isYou).toBe(false);
    expect(d.member.id).toBe(paul);
  });
});

describe('loadProfileData — member with no history', () => {
  it('returns a fully-zeroed dossier shape', async () => {
    const d = (await loadProfileData(maya, paul, TODAY))!;
    expect(d.member.id).toBe(maya);
    expect(d.member.roleLabel).toBe('Member');
    expect(d.member.isAdmin).toBe(false);
    expect(d.member.favType).toBeNull();
    expect(d.isYou).toBe(false);

    expect(d.stats.minutes).toBe(0);
    expect(d.stats.booksFinished).toBe(0);
    expect(d.stats.streakDays).toBe(0);
    expect(d.longestStreak).toBe(0);

    expect(d.continueItems).toEqual([]);
    expect(d.finished).toEqual([]);
    expect(d.activity).toEqual([]);
    expect(d.format.totalMinutes).toBe(0);
    expect(Object.keys(d.format.byType)).toEqual([]);
    expect(d.trend).toHaveLength(12);
    expect(d.trend.every((x) => x === 0)).toBe(true);
    expect(d.heatmap).toEqual([]);
    expect(d.activeDays).toBe(0);
    expect(d.memberCount).toBe(2);
  });
});

describe('loadProfileData — unknown member', () => {
  it('returns null for a missing user id', async () => {
    expect(await loadProfileData(999999, paul, TODAY)).toBeNull();
  });
});
