import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { seedDb, type SeedHandle } from '../helpers/seed';
import { insertUser } from '@/server/db/users';
import { addReadingTime } from '@/server/db/reading-stats';
import { upsertProgress } from '@/server/db/reading-progress';
import { getLeaderboard, getServerTotals } from '@/server/db/dashboard-agg';
import { utcDayString, shiftDay } from '@/server/db/reading-stats-util';

let h: SeedHandle;
let alice: number;
let bob: number;
let carol: number;

// Anchor "today" to the real current UTC day. The period window is always the
// last 7 days relative to `today`, and finished-book rows are stamped with the
// real now() by upsertProgress — so a hardcoded past TODAY would push those
// finishes outside the window. Deriving TODAY at runtime (and offsetting other
// seeded days from it) keeps the test deterministic on any calendar date.
const TODAY = utcDayString(new Date());
const YESTERDAY = shiftDay(TODAY, -1);

beforeEach(async () => {
  // Keep the default series so finished-progress rows have a valid seriesId.
  h = await seedDb();
  alice = (
    await insertUser({ username: 'alice', passwordHash: 'x', role: 'admin', mustChangePassword: false })
  ).id;
  bob = (
    await insertUser({ username: 'bob', passwordHash: 'x', role: 'user', mustChangePassword: false })
  ).id;
  carol = (
    await insertUser({ username: 'carol', passwordHash: 'x', role: 'user', mustChangePassword: false })
  ).id;
});
afterEach(() => h.cleanup());

async function finishBook(userId: number, key: string): Promise<void> {
  await upsertProgress({
    userId,
    readableKey: key,
    seriesId: h.seriesId,
    volumeId: h.volumeId,
    contentType: 'manga',
    position: 1,
  });
}

describe('getLeaderboard', () => {
  it('ranks users by time (minutes) desc', async () => {
    await addReadingTime({ userId: alice, day: TODAY, seconds: 600, contentType: 'manga' }); // 10 min
    await addReadingTime({ userId: bob, day: TODAY, seconds: 1200, contentType: 'manga' }); // 20 min
    // carol: no reading.
    const board = await getLeaderboard('week', 'time', TODAY);
    expect(board.map((e) => e.userId)).toEqual([bob, alice, carol]);
    expect(board.map((e) => e.value)).toEqual([20, 10, 0]);
    // Identity fields surfaced.
    expect(board[0]!.displayName).toBe('bob');
    expect(board[0]!.role).toBe('user');
    expect(board[0]!.avatarUrl).toBeNull();
  });

  it('ranks users by books finished desc', async () => {
    await finishBook(alice, 'audio:vol:1');
    await finishBook(bob, 'audio:vol:1');
    await finishBook(bob, 'page:file:1');
    const board = await getLeaderboard('week', 'books', TODAY);
    // bob finished 2, alice 1, carol 0.
    expect(board.map((e) => e.value)).toEqual([2, 1, 0]);
    expect(board[0]!.userId).toBe(bob);
  });

  it('ranks users by streak desc', async () => {
    // alice reads today + yesterday (streak 2); bob today only (streak 1).
    await addReadingTime({ userId: alice, day: TODAY, seconds: 60, contentType: 'manga' });
    await addReadingTime({ userId: alice, day: YESTERDAY, seconds: 60, contentType: 'manga' });
    await addReadingTime({ userId: bob, day: TODAY, seconds: 60, contentType: 'manga' });
    const board = await getLeaderboard('week', 'streak', TODAY);
    expect(board.map((e) => e.value)).toEqual([2, 1, 0]);
    expect(board[0]!.userId).toBe(alice);
  });
});

describe('getServerTotals', () => {
  it('sums across users and counts active readers', async () => {
    await addReadingTime({ userId: alice, day: TODAY, seconds: 600, units: 10, contentType: 'manga' });
    await addReadingTime({ userId: bob, day: TODAY, seconds: 1200, units: 20, contentType: 'manga' });
    await finishBook(alice, 'audio:vol:1');
    // carol: inactive.
    const totals = await getServerTotals('week', TODAY);
    expect(totals.minutes).toBe(30); // 10 + 20
    expect(totals.units).toBe(30);
    expect(totals.booksFinished).toBe(1);
    expect(totals.activeReaders).toBe(2); // alice + bob
    expect(totals.totalMembers).toBe(3);
  });

  it('zeroes out for an inactive household', async () => {
    const totals = await getServerTotals('week', TODAY);
    expect(totals).toEqual({
      minutes: 0,
      booksFinished: 0,
      units: 0,
      activeReaders: 0,
      totalMembers: 3,
    });
  });
});
