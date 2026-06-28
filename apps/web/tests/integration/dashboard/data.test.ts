import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { seedDb, type SeedHandle } from '../helpers/seed';
import { insertUser } from '@/server/db/users';
import { addReadingTime } from '@/server/db/reading-stats';
import { upsertProgress } from '@/server/db/reading-progress';
import { setGoals } from '@/server/db/reading-goals';
import { recordActivity } from '@/server/db/activity-events';
import { loadDashboardData } from '@/app/(app)/dashboard/data';
import { utcDayString, shiftDay } from '@/server/db/reading-stats-util';
import { mondayOf } from '@/server/db/reading-stats-agg';

let h: SeedHandle;
let paul: number;
let maya: number;

// Anchor "today" to the real current UTC day so finished-book rows (stamped with
// real now() by upsertProgress) fall inside the period window. Other seeded days
// are offset from TODAY, keeping the test deterministic on any calendar date.
const TODAY = utcDayString(new Date());
const YESTERDAY = shiftDay(TODAY, -1);

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

describe('loadDashboardData — populated install', () => {
  beforeEach(async () => {
    // Paul reads manga today + yesterday (streak 2), finishes a book.
    await addReadingTime({ userId: paul, day: TODAY, seconds: 3600, units: 40, contentType: 'manga' });
    await addReadingTime({ userId: paul, day: YESTERDAY, seconds: 1800, units: 20, contentType: 'ebook' });
    await upsertProgress({
      userId: paul,
      readableKey: 'manga:vol:7',
      seriesId: h.seriesId,
      volumeId: h.volumeId,
      contentType: 'manga',
      position: 1,
    });
    // In-progress title for the continue rail.
    await upsertProgress({
      userId: paul,
      readableKey: 'manga:vol:8',
      seriesId: h.seriesId,
      volumeId: h.volumeId,
      contentType: 'manga',
      position: 0.42,
    });
    // Maya reads, for the leaderboard / server totals.
    await addReadingTime({ userId: maya, day: TODAY, seconds: 7200, units: 80, contentType: 'manga' });
    await setGoals(paul, { yearlyBooks: 52, weeklyMinutes: 600 });
    await recordActivity({ userId: maya, kind: 'finished', seriesId: h.seriesId });
  });

  it('assembles every widget without error', async () => {
    const data = await loadDashboardData(paul, 'Paul Avery', 'week', TODAY);

    // continue: the in-progress (not finished) title shows.
    expect(data.continueItems.map((c) => c.readableKey)).toContain('manga:vol:8');
    expect(data.continueItems.some((c) => c.readableKey === 'manga:vol:7')).toBe(false);

    // personal: 60 min today + 30 yesterday = 90 min this week.
    expect(data.personal.current.minutes).toBe(90);
    expect(data.personal.current.streakDays).toBe(2);
    expect(data.personal.favType).toBe('manga');
    expect(data.personal.distribution).toHaveLength(7);
    expect(data.personal.trend).toHaveLength(12);

    // goals: target set, year-books done = the one finished book.
    expect(data.goals.goals.yearlyBooks).toBe(52);
    expect(data.goals.yearBooksDone).toBe(1);
    // weekMinutesDone is the CALENDAR week (Mon→today), unlike the rolling
    // 7-day period window above. YESTERDAY's 30 min only counts when it lands in
    // the same calendar week — i.e. on every day except Monday, when yesterday
    // is last week's Sunday. (The 2-day streak still spans today+yesterday.)
    const yesterdayInWeek = YESTERDAY >= mondayOf(TODAY);
    expect(data.goals.weekMinutesDone).toBe(yesterdayInWeek ? 90 : 60);

    // format mix has manga + ebook minutes.
    expect(data.format.byType.manga).toBeGreaterThan(0);
    expect(data.format.byType.ebook).toBeGreaterThan(0);
    expect(data.format.totalMinutes).toBe(90);

    // leaderboard: all three metrics pre-fetched; maya outreads paul by time.
    expect(Object.keys(data.leaderboard).sort()).toEqual(['books', 'streak', 'time']);
    expect(data.leaderboard.time[0]!.userId).toBe(maya);

    // feed: the recorded activity event surfaces.
    expect(data.feed.length).toBeGreaterThan(0);
    expect(data.feed[0]!.kind).toBe('finished');

    // server totals across both members.
    expect(data.server.totalMembers).toBe(2);
    expect(data.server.activeReaders).toBe(2);
    expect(data.server.minutes).toBe(60 + 30 + 120);

    // recent: the seeded default series is the newest add.
    expect(data.recent.length).toBeGreaterThan(0);
    expect(data.recent[0]!.seriesId).toBe(h.seriesId);

    expect(data.memberCount).toBe(2);
  });

  it('switches stats to the all-time window', async () => {
    const data = await loadDashboardData(paul, 'Paul Avery', 'all', TODAY);
    expect(data.period).toBe('all');
    // all-time still sums the same two days for paul.
    expect(data.personal.current.minutes).toBe(90);
  });
});

describe('loadDashboardData — empty install', () => {
  // A brand-new server: a single user, no reading, no goals, no activity, and an
  // empty library (no series at all). Every widget should fall back to its empty
  // state with no crash.
  let empty: SeedHandle;
  let solo: number;

  beforeEach(async () => {
    // Replace the shared seed with a series-free one for this group.
    h.cleanup();
    empty = await seedDb({ skipDefaultSeries: true });
    solo = (
      await insertUser({ username: 'solo', passwordHash: 'x', role: 'admin', mustChangePassword: false })
    ).id;
  });
  afterEach(() => empty.cleanup());

  it('returns zeroed/empty shapes for every widget without crashing', async () => {
    const data = await loadDashboardData(solo, 'Solo', 'week', TODAY);

    expect(data.continueItems).toEqual([]);
    expect(data.personal.current.minutes).toBe(0);
    expect(data.personal.current.booksFinished).toBe(0);
    expect(data.personal.favType).toBeNull();
    expect(data.goals.goals.yearlyBooks).toBeNull();
    expect(data.goals.goals.weeklyMinutes).toBeNull();
    expect(data.goals.yearBooksDone).toBe(0);
    expect(data.format.totalMinutes).toBe(0);
    expect(Object.keys(data.format.byType)).toEqual([]);
    // The lone user's leaderboard row exists with a 0 value.
    expect(data.leaderboard.time.every((e) => e.value === 0)).toBe(true);
    expect(data.feed).toEqual([]);
    expect(data.releases).toEqual([]);
    expect(data.server.minutes).toBe(0);
    expect(data.server.activeReaders).toBe(0);
    // Empty library → the recently-added hero (no series).
    expect(data.recent).toEqual([]);
    expect(data.memberCount).toBe(1);
  });
});
