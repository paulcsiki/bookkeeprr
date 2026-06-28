/**
 * Tests for GET /api/reader/stats/pace
 *
 * Covers:
 * - Returns null metrics when fewer than 3 active days.
 * - Returns computed pagesPerDay / secondsPerDay when >= 3 active days.
 * - Ignores days with zero reading time (active day = secondsRead > 0).
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { seedDb, type SeedHandle } from '../../helpers/seed';
import { insertUser } from '@/server/db/users';
import { createSession } from '@/server/db/sessions';
import { addReadingTime } from '@/server/db/reading-stats';
import { GET as PACE_GET } from '@/app/api/reader/stats/pace/route';
import type { PaceResponse } from '@/app/api/reader/stats/pace/route';
import { shiftDay, utcDayString } from '@/server/db/reading-stats-util';

let h: SeedHandle;
let cookie: string;
let userId: number;

beforeEach(async () => {
  h = await seedDb({ skipDefaultSeries: true });
  const user = await insertUser({
    username: 'alice',
    passwordHash: 'x',
    role: 'admin',
    mustChangePassword: false,
  });
  userId = user.id;
  const s = await createSession({ userId: user.id, userAgent: null, ipAddress: null });
  cookie = `bookkeeprr_session=${s.token}`;
});

afterEach(() => h.cleanup());

function reqGet(cookie: string): NextRequest {
  return new NextRequest('http://localhost/api/reader/stats/pace', {
    headers: { cookie },
  });
}

function today(): string {
  return utcDayString(new Date());
}

describe('GET /api/reader/stats/pace', () => {
  it('returns 401 when not authenticated', async () => {
    const res = await PACE_GET(new NextRequest('http://localhost/api/reader/stats/pace'));
    expect(res.status).toBe(401);
  });

  it('returns null metrics when fewer than 3 active days', async () => {
    // Add reading on only 2 days
    const t = today();
    await addReadingTime({ userId, day: t, seconds: 600, units: 10 });
    await addReadingTime({ userId, day: shiftDay(t, -1), seconds: 300, units: 5 });

    const res = await PACE_GET(reqGet(cookie));
    expect(res.status).toBe(200);
    const body = (await res.json()) as PaceResponse;
    expect(body.pagesPerDay).toBeNull();
    expect(body.secondsPerDay).toBeNull();
    expect(body.days).toBe(2);
  });

  it('returns computed pace when >= 3 active days', async () => {
    const t = today();
    // Day 1: 600s, 10 units
    await addReadingTime({ userId, day: t, seconds: 600, units: 10 });
    // Day 2: 300s, 5 units
    await addReadingTime({ userId, day: shiftDay(t, -1), seconds: 300, units: 5 });
    // Day 3: 900s, 15 units
    await addReadingTime({ userId, day: shiftDay(t, -2), seconds: 900, units: 15 });

    const res = await PACE_GET(reqGet(cookie));
    expect(res.status).toBe(200);
    const body = (await res.json()) as PaceResponse;
    expect(body.days).toBe(3);
    // Average: (10+5+15)/3 = 10 pp/day
    expect(body.pagesPerDay).toBeCloseTo(10);
    // Average: (600+300+900)/3 = 600 s/day
    expect(body.secondsPerDay).toBeCloseTo(600);
  });

  it('excludes days with zero reading time from the active-day count', async () => {
    const t = today();
    // Add 5 days but 2 have zero seconds (will be ignored)
    await addReadingTime({ userId, day: t, seconds: 600, units: 12 });
    await addReadingTime({ userId, day: shiftDay(t, -2), seconds: 300, units: 6 });
    await addReadingTime({ userId, day: shiftDay(t, -4), seconds: 1200, units: 24 });
    // Days -1 and -3 have no reading entry → secondsRead = 0 → not active

    const res = await PACE_GET(reqGet(cookie));
    expect(res.status).toBe(200);
    const body = (await res.json()) as PaceResponse;
    expect(body.days).toBe(3);
    expect(body.pagesPerDay).toBeCloseTo((12 + 6 + 24) / 3);
  });
});
