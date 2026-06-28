import { beforeEach, afterEach, it, expect, describe } from 'vitest';
import { seedDb, type SeedHandle } from '../helpers/seed';
import { insertUser } from '@/server/db/users';
import {
  addReadingTime,
  getDailyStats,
  getDailyStatsByType,
  computeStreak,
} from '@/server/db/reading-stats';

let h: SeedHandle;
let userId: number;
let otherUserId: number;

beforeEach(async () => {
  h = await seedDb();
  userId = (
    await insertUser({
      username: 'reader',
      passwordHash: 'x',
      role: 'user',
      mustChangePassword: false,
    })
  ).id;
  otherUserId = (
    await insertUser({
      username: 'other',
      passwordHash: 'x',
      role: 'user',
      mustChangePassword: false,
    })
  ).id;
});
afterEach(() => h.cleanup());

describe('addReadingTime', () => {
  it('inserts a new daily row', async () => {
    await addReadingTime({ userId, day: '2026-05-30', seconds: 60, units: 4 });
    const rows = await getDailyStats(userId, '2026-05-01');
    expect(rows).toHaveLength(1);
    expect(rows[0]!.day).toBe('2026-05-30');
    expect(rows[0]!.secondsRead).toBe(60);
    expect(rows[0]!.unitsRead).toBe(4);
  });

  it('upsert-increments the same day rather than overwriting', async () => {
    await addReadingTime({ userId, day: '2026-05-30', seconds: 60, units: 4 });
    await addReadingTime({ userId, day: '2026-05-30', seconds: 20, units: 1 });
    const rows = await getDailyStats(userId, '2026-05-01');
    expect(rows).toHaveLength(1);
    expect(rows[0]!.secondsRead).toBe(80);
    expect(rows[0]!.unitsRead).toBe(5);
  });

  it('keeps distinct days separate', async () => {
    await addReadingTime({ userId, day: '2026-05-29', seconds: 10, units: 1 });
    await addReadingTime({ userId, day: '2026-05-30', seconds: 20, units: 2 });
    const rows = await getDailyStats(userId, '2026-05-01');
    expect(rows.map((r) => r.day)).toEqual(['2026-05-29', '2026-05-30']);
  });

  it('treats units as optional (defaults to 0)', async () => {
    await addReadingTime({ userId, day: '2026-05-30', seconds: 30 });
    const rows = await getDailyStats(userId, '2026-05-01');
    expect(rows[0]!.unitsRead).toBe(0);
  });

  it('isolates rows per user', async () => {
    await addReadingTime({ userId, day: '2026-05-30', seconds: 60, units: 4 });
    await addReadingTime({ userId: otherUserId, day: '2026-05-30', seconds: 99, units: 9 });
    const mine = await getDailyStats(userId, '2026-05-01');
    expect(mine).toHaveLength(1);
    expect(mine[0]!.secondsRead).toBe(60);
  });

  it('defaults the content type to the "other" sentinel', async () => {
    await addReadingTime({ userId, day: '2026-05-30', seconds: 10 });
    const rows = await getDailyStatsByType(userId, '2026-05-01');
    expect(rows).toHaveLength(1);
    expect(rows[0]!.contentType).toBe('other');
  });

  it('keeps distinct content types separate on the same day', async () => {
    await addReadingTime({ userId, day: '2026-05-30', seconds: 60, units: 4, contentType: 'manga' });
    await addReadingTime({ userId, day: '2026-05-30', seconds: 20, units: 1, contentType: 'ebook' });
    const byType = await getDailyStatsByType(userId, '2026-05-01');
    expect(byType).toHaveLength(2);
    const manga = byType.find((r) => r.contentType === 'manga');
    const ebook = byType.find((r) => r.contentType === 'ebook');
    expect(manga!.secondsRead).toBe(60);
    expect(ebook!.secondsRead).toBe(20);
  });

  it('upsert-increments within a (day, contentType), not across types', async () => {
    await addReadingTime({ userId, day: '2026-05-30', seconds: 60, contentType: 'manga' });
    await addReadingTime({ userId, day: '2026-05-30', seconds: 30, contentType: 'manga' });
    await addReadingTime({ userId, day: '2026-05-30', seconds: 20, contentType: 'ebook' });
    const byType = await getDailyStatsByType(userId, '2026-05-01');
    expect(byType.find((r) => r.contentType === 'manga')!.secondsRead).toBe(90);
    expect(byType.find((r) => r.contentType === 'ebook')!.secondsRead).toBe(20);
  });
});

describe('getDailyStats sums across content types', () => {
  it('returns a single daily TOTAL row summing every content type', async () => {
    await addReadingTime({ userId, day: '2026-05-30', seconds: 60, units: 4, contentType: 'manga' });
    await addReadingTime({ userId, day: '2026-05-30', seconds: 20, units: 1, contentType: 'ebook' });
    const totals = await getDailyStats(userId, '2026-05-01');
    expect(totals).toHaveLength(1);
    expect(totals[0]!.day).toBe('2026-05-30');
    expect(totals[0]!.secondsRead).toBe(80);
    expect(totals[0]!.unitsRead).toBe(5);
  });

  it('streak treats a multi-type day as one active day', async () => {
    await addReadingTime({ userId, day: '2026-05-29', seconds: 10, contentType: 'manga' });
    await addReadingTime({ userId, day: '2026-05-30', seconds: 10, contentType: 'manga' });
    await addReadingTime({ userId, day: '2026-05-30', seconds: 10, contentType: 'ebook' });
    const totals = await getDailyStats(userId, '2026-05-01');
    expect(totals).toHaveLength(2);
    expect(computeStreak(totals, '2026-05-30')).toBe(2);
  });
});

describe('getDailyStats', () => {
  it('returns only rows on/after sinceDay, ascending by day', async () => {
    await addReadingTime({ userId, day: '2026-05-20', seconds: 5 });
    await addReadingTime({ userId, day: '2026-05-28', seconds: 5 });
    await addReadingTime({ userId, day: '2026-05-30', seconds: 5 });
    const rows = await getDailyStats(userId, '2026-05-28');
    expect(rows.map((r) => r.day)).toEqual(['2026-05-28', '2026-05-30']);
  });
});

describe('computeStreak (pure)', () => {
  const rowsFor = (entries: Array<[string, number]>) =>
    entries.map(([day, secondsRead]) => ({ day, secondsRead, unitsRead: 0 }));

  it('counts consecutive days ending today', () => {
    const rows = rowsFor([
      ['2026-05-28', 10],
      ['2026-05-29', 10],
      ['2026-05-30', 10],
    ]);
    expect(computeStreak(rows, '2026-05-30')).toBe(3);
  });

  it('counts a streak that ends yesterday (today not yet read)', () => {
    const rows = rowsFor([
      ['2026-05-28', 10],
      ['2026-05-29', 10],
    ]);
    expect(computeStreak(rows, '2026-05-30')).toBe(2);
  });

  it('returns 0 when neither today nor yesterday has reading', () => {
    const rows = rowsFor([
      ['2026-05-26', 10],
      ['2026-05-27', 10],
    ]);
    expect(computeStreak(rows, '2026-05-30')).toBe(0);
  });

  it('breaks the streak on a gap', () => {
    const rows = rowsFor([
      ['2026-05-25', 10],
      ['2026-05-26', 10],
      // gap on the 27th + 28th
      ['2026-05-29', 10],
      ['2026-05-30', 10],
    ]);
    expect(computeStreak(rows, '2026-05-30')).toBe(2);
  });

  it('ignores days with zero secondsRead', () => {
    const rows = rowsFor([
      ['2026-05-28', 10],
      ['2026-05-29', 0],
      ['2026-05-30', 10],
    ]);
    // 29th has 0 → streak from today is just today
    expect(computeStreak(rows, '2026-05-30')).toBe(1);
  });

  it('returns 0 for no rows', () => {
    expect(computeStreak([], '2026-05-30')).toBe(0);
  });

  it('handles month boundaries', () => {
    const rows = rowsFor([
      ['2026-04-30', 10],
      ['2026-05-01', 10],
    ]);
    expect(computeStreak(rows, '2026-05-01')).toBe(2);
  });
});
