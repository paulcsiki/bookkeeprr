import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { seedDb, type SeedHandle } from '../../helpers/seed';
import { insertUser } from '@/server/db/users';
import { createSession } from '@/server/db/sessions';
import { addReadingTime } from '@/server/db/reading-stats';
import { POST as HEARTBEAT_POST } from '@/app/api/reader/stats/heartbeat/route';
import { GET as STATS_GET } from '@/app/api/reader/stats/route';

let h: SeedHandle;
let cookieA: string;
let cookieB: string;

beforeEach(async () => {
  h = await seedDb({ skipDefaultSeries: true });
  const userA = await insertUser({
    username: 'alice',
    passwordHash: 'x',
    role: 'admin',
    mustChangePassword: false,
  });
  const userB = await insertUser({
    username: 'bob',
    passwordHash: 'x',
    role: 'user',
    mustChangePassword: false,
  });
  const sA = await createSession({ userId: userA.id, userAgent: null, ipAddress: null });
  const sB = await createSession({ userId: userB.id, userAgent: null, ipAddress: null });
  cookieA = `bookkeeprr_session=${sA.token}`;
  cookieB = `bookkeeprr_session=${sB.token}`;
});

afterEach(() => {
  vi.useRealTimers();
  h.cleanup();
});

function reqGet(url: string, cookie: string | null): NextRequest {
  const headers: Record<string, string> = {};
  if (cookie !== null) headers.cookie = cookie;
  return new NextRequest(url, { headers });
}

function reqJson(url: string, cookie: string | null, body: unknown): NextRequest {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (cookie !== null) headers.cookie = cookie;
  return new NextRequest(url, {
    method: 'POST',
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

function utcToday(): string {
  return new Date().toISOString().slice(0, 10);
}

describe('reader stats API', () => {
  it('POST /heartbeat requires auth (401)', async () => {
    const res = await HEARTBEAT_POST(
      reqJson('http://localhost/api/reader/stats/heartbeat', null, { seconds: 20 }),
    );
    expect(res.status).toBe(401);
  });

  it('GET /stats requires auth (401)', async () => {
    const res = await STATS_GET(reqGet('http://localhost/api/reader/stats', null));
    expect(res.status).toBe(401);
  });

  it('POST /heartbeat increments today and shows up in GET /stats', async () => {
    const post = await HEARTBEAT_POST(
      reqJson('http://localhost/api/reader/stats/heartbeat', cookieA, { seconds: 20, units: 3 }),
    );
    expect(post.status).toBe(200);
    expect(await post.json()).toEqual({ ok: true });

    const res = await STATS_GET(reqGet('http://localhost/api/reader/stats', cookieA));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.totalSeconds).toBe(20);
    expect(body.totalUnits).toBe(3);
    expect(body.streak).toBe(1);
    const todayRow = body.days.find((d: { day: string }) => d.day === utcToday());
    expect(todayRow.secondsRead).toBe(20);
    expect(body.days).toHaveLength(7);
  });

  it('POST /heartbeat accumulates across calls on the same day', async () => {
    await HEARTBEAT_POST(
      reqJson('http://localhost/api/reader/stats/heartbeat', cookieA, { seconds: 20 }),
    );
    await HEARTBEAT_POST(
      reqJson('http://localhost/api/reader/stats/heartbeat', cookieA, { seconds: 15 }),
    );
    const res = await STATS_GET(reqGet('http://localhost/api/reader/stats', cookieA));
    const body = await res.json();
    expect(body.totalSeconds).toBe(35);
  });

  it('POST /heartbeat clamps oversized seconds', async () => {
    await HEARTBEAT_POST(
      reqJson('http://localhost/api/reader/stats/heartbeat', cookieA, { seconds: 99999 }),
    );
    const res = await STATS_GET(reqGet('http://localhost/api/reader/stats', cookieA));
    const body = await res.json();
    expect(body.totalSeconds).toBeLessThanOrEqual(120);
    expect(body.totalSeconds).toBe(120);
  });

  it('POST /heartbeat rejects a bad payload (400)', async () => {
    const res = await HEARTBEAT_POST(
      reqJson('http://localhost/api/reader/stats/heartbeat', cookieA, { seconds: -5 }),
    );
    expect(res.status).toBe(400);
  });

  it('GET /stats isolates per user', async () => {
    await HEARTBEAT_POST(
      reqJson('http://localhost/api/reader/stats/heartbeat', cookieA, { seconds: 40, units: 2 }),
    );
    const resB = await STATS_GET(reqGet('http://localhost/api/reader/stats', cookieB));
    const bodyB = await resB.json();
    expect(bodyB.totalSeconds).toBe(0);
    expect(bodyB.streak).toBe(0);
    expect(bodyB.days).toHaveLength(7);
  });

  it('GET /stats returns a streak that counts back from today', async () => {
    const today = new Date();
    const dayStr = (offset: number): string => {
      const d = new Date(today);
      d.setUTCDate(d.getUTCDate() - offset);
      return d.toISOString().slice(0, 10);
    };
    const userC = await insertUser({
      username: 'carol',
      passwordHash: 'x',
      role: 'user',
      mustChangePassword: false,
    });
    await addReadingTime({ userId: userC.id, day: dayStr(0), seconds: 30, units: 1 });
    await addReadingTime({ userId: userC.id, day: dayStr(1), seconds: 30, units: 1 });
    await addReadingTime({ userId: userC.id, day: dayStr(2), seconds: 30, units: 1 });
    const sC = await createSession({ userId: userC.id, userAgent: null, ipAddress: null });
    const res = await STATS_GET(
      reqGet('http://localhost/api/reader/stats', `bookkeeprr_session=${sC.token}`),
    );
    const body = await res.json();
    expect(body.streak).toBe(3);
    expect(body.totalSeconds).toBe(90);
  });
});
