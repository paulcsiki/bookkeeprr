import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { seedDb, type SeedHandle } from '../helpers/seed';
import { insertUser } from '@/server/db/users';
import { addReadingTime } from '@/server/db/reading-stats';
import { upsertProgress } from '@/server/db/reading-progress';
import {
  getDailyDistribution,
  getFormatMix,
  getHeatmap,
  getPeriodStats,
  getPeriodStatsWithDelta,
  getWeeklyTrend,
  mondayOf,
  periodWindow,
  previousPeriodWindow,
} from '@/server/db/reading-stats-agg';

let h: SeedHandle;
let userId: number;

// A fixed "today" — 2026-06-05 is a Friday (UTC), so the Monday of its week is
// 2026-06-01. Using a fixed day keeps the period windows deterministic.
const TODAY = '2026-06-05';

beforeEach(async () => {
  h = await seedDb({ skipDefaultSeries: true });
  userId = (
    await insertUser({
      username: 'reader',
      passwordHash: 'x',
      role: 'user',
      mustChangePassword: false,
    })
  ).id;
});
afterEach(() => h.cleanup());

describe('period windows (pure)', () => {
  it('week is the last 7 inclusive days', () => {
    expect(periodWindow('week', TODAY)).toEqual({ start: '2026-05-30', end: '2026-06-05' });
  });
  it('month is the last 30 inclusive days', () => {
    expect(periodWindow('month', TODAY)).toEqual({ start: '2026-05-07', end: '2026-06-05' });
  });
  it('previous week is the 7 days before the current week', () => {
    expect(previousPeriodWindow('week', TODAY)).toEqual({
      start: '2026-05-23',
      end: '2026-05-29',
    });
  });
  it('mondayOf returns the Monday of the ISO week', () => {
    expect(mondayOf('2026-06-05')).toBe('2026-06-01'); // Fri → Mon
    expect(mondayOf('2026-06-01')).toBe('2026-06-01'); // Mon → Mon
    expect(mondayOf('2026-06-07')).toBe('2026-06-01'); // Sun → Mon
  });
});

describe('getPeriodStats', () => {
  it('aggregates minutes + units over the week window', async () => {
    // Inside the week (last 7 days): 5 + 5 minutes worth of seconds.
    await addReadingTime({ userId, day: '2026-06-05', seconds: 300, units: 10, contentType: 'manga' });
    await addReadingTime({ userId, day: '2026-06-01', seconds: 300, units: 5, contentType: 'ebook' });
    // Outside the week (prior week) — must not count toward "week".
    await addReadingTime({ userId, day: '2026-05-20', seconds: 600, units: 99, contentType: 'manga' });

    const week = await getPeriodStats(userId, 'week', TODAY);
    expect(week.minutes).toBe(10);
    expect(week.units).toBe(15);

    const all = await getPeriodStats(userId, 'all', TODAY);
    expect(all.minutes).toBe(20);
    expect(all.units).toBe(114);
  });

  it('reports the current streak', async () => {
    await addReadingTime({ userId, day: '2026-06-05', seconds: 60, contentType: 'manga' });
    await addReadingTime({ userId, day: '2026-06-04', seconds: 60, contentType: 'manga' });
    await addReadingTime({ userId, day: '2026-06-03', seconds: 60, contentType: 'manga' });
    const week = await getPeriodStats(userId, 'week', TODAY);
    expect(week.streakDays).toBe(3);
  });
});

describe('getPeriodStatsWithDelta', () => {
  it('returns current and previous-period stats for delta math', async () => {
    // Current week.
    await addReadingTime({ userId, day: '2026-06-02', seconds: 600, contentType: 'manga' }); // 10 min
    // Previous week (2026-05-23 .. 2026-05-29).
    await addReadingTime({ userId, day: '2026-05-25', seconds: 300, contentType: 'manga' }); // 5 min

    const { current, previous } = await getPeriodStatsWithDelta(userId, 'week', TODAY);
    expect(current.minutes).toBe(10);
    expect(previous.minutes).toBe(5);
  });
});

describe('getWeeklyTrend', () => {
  it('buckets minutes per ISO week, oldest first, current week last', async () => {
    // This week (Mon 2026-06-01).
    await addReadingTime({ userId, day: '2026-06-03', seconds: 600, contentType: 'manga' }); // 10 min
    // Last week (Mon 2026-05-25).
    await addReadingTime({ userId, day: '2026-05-26', seconds: 300, contentType: 'manga' }); // 5 min

    const trend = await getWeeklyTrend(userId, 4, TODAY);
    expect(trend).toHaveLength(4);
    expect(trend.map((t) => t.weekStart)).toEqual([
      '2026-05-11',
      '2026-05-18',
      '2026-05-25',
      '2026-06-01',
    ]);
    expect(trend[2]!.minutes).toBe(5);
    expect(trend[3]!.minutes).toBe(10);
    expect(trend[0]!.minutes).toBe(0);
  });
});

describe('getDailyDistribution', () => {
  it('returns Mon–Sun minutes for the current week', async () => {
    // 2026-06-01 is Monday → index 0; 2026-06-05 is Friday → index 4.
    await addReadingTime({ userId, day: '2026-06-01', seconds: 600, contentType: 'manga' }); // 10 min Mon
    await addReadingTime({ userId, day: '2026-06-05', seconds: 300, contentType: 'ebook' }); // 5 min Fri
    const dist = await getDailyDistribution(userId, 'week', TODAY);
    expect(dist).toHaveLength(7);
    expect(dist[0]).toBe(10);
    expect(dist[4]).toBe(5);
    expect(dist[6]).toBe(0);
  });
});

describe('getFormatMix', () => {
  it('sums minutes per content type over the period', async () => {
    await addReadingTime({ userId, day: '2026-06-03', seconds: 600, contentType: 'manga' }); // 10
    await addReadingTime({ userId, day: '2026-06-04', seconds: 300, contentType: 'manga' }); // 5
    await addReadingTime({ userId, day: '2026-06-04', seconds: 120, contentType: 'audiobook' }); // 2
    // Outside the week — excluded.
    await addReadingTime({ userId, day: '2026-05-10', seconds: 600, contentType: 'ebook' });

    const mix = await getFormatMix(userId, 'week', TODAY);
    expect(mix).toEqual({ manga: 15, audiobook: 2 });
  });

  it('includes the "other" sentinel bucket for untyped time', async () => {
    await addReadingTime({ userId, day: '2026-06-03', seconds: 600 }); // no contentType → other
    const mix = await getFormatMix(userId, 'week', TODAY);
    expect(mix).toEqual({ other: 10 });
  });
});

describe('getHeatmap', () => {
  it('returns per-day minutes for active days, oldest first', async () => {
    await addReadingTime({ userId, day: '2026-06-01', seconds: 600, contentType: 'manga' });
    await addReadingTime({ userId, day: '2026-06-05', seconds: 300, contentType: 'manga' });
    const heat = await getHeatmap(userId, 371, TODAY);
    expect(heat).toEqual([
      { day: '2026-06-01', minutes: 10 },
      { day: '2026-06-05', minutes: 5 },
    ]);
  });
});

describe('booksFinished (from reading_progress)', () => {
  async function makeSeries(): Promise<number> {
    // Insert a minimal series via the seed helper's series insert path.
    const { insertSeries } = await import('@/server/db/series');
    return insertSeries({
      anilistId: Math.floor(Math.random() * 1_000_000) + 1,
      status: 'releasing',
      rootPath: `/media/comics/Finished-${Math.random()}`,
      qualityProfileId: h.qpId,
      titleEnglish: 'Finished Series',
      contentType: 'manga',
    });
  }

  it('counts distinct readables finished within the window', async () => {
    const seriesId = await makeSeries();
    // Finished now (in the current week, since the test runs "today").
    await upsertProgress({
      userId,
      readableKey: 'page:file:101',
      seriesId,
      contentType: 'manga',
      position: 1,
    });
    await upsertProgress({
      userId,
      readableKey: 'page:file:102',
      seriesId,
      contentType: 'manga',
      position: 1,
    });
    // Not finished — should not count.
    await upsertProgress({
      userId,
      readableKey: 'page:file:103',
      seriesId,
      contentType: 'manga',
      position: 0.5,
    });

    // The progress rows were written "now", so use the real today for the window.
    const realToday = new Date().toISOString().slice(0, 10);
    const week = await getPeriodStats(userId, 'week', realToday);
    expect(week.booksFinished).toBe(2);
  });
});
