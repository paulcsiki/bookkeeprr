import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { seedDb, type SeedHandle } from '../helpers/seed';
import { insertUser } from '@/server/db/users';
import { createSession } from '@/server/db/sessions';
import { getGoals, setGoals } from '@/server/db/reading-goals';
import { GET as GOALS_GET, PUT as GOALS_PUT } from '@/app/api/reader/goals/route';

let h: SeedHandle;
let userId: number;
let cookie: string;

beforeEach(async () => {
  h = await seedDb({ skipDefaultSeries: true });
  const user = await insertUser({
    username: 'reader',
    passwordHash: 'x',
    role: 'user',
    mustChangePassword: false,
  });
  userId = user.id;
  const s = await createSession({ userId, userAgent: null, ipAddress: null });
  cookie = `bookkeeprr_session=${s.token}`;
});
afterEach(() => h.cleanup());

function reqGet(cookieHeader: string | null): NextRequest {
  const headers: Record<string, string> = {};
  if (cookieHeader !== null) headers.cookie = cookieHeader;
  return new NextRequest('http://localhost/api/reader/goals', { headers });
}

function reqPut(cookieHeader: string | null, body: unknown): NextRequest {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (cookieHeader !== null) headers.cookie = cookieHeader;
  return new NextRequest('http://localhost/api/reader/goals', {
    method: 'PUT',
    headers,
    body: JSON.stringify(body),
  });
}

describe('reading-goals DAL', () => {
  it('returns nulls when no goal is set', async () => {
    expect(await getGoals(userId)).toEqual({
      yearlyBooks: null,
      weeklyMinutes: null,
      streakDays: null,
    });
  });

  it('sets and reads back goals', async () => {
    await setGoals(userId, { yearlyBooks: 24, weeklyMinutes: 150, streakDays: 30 });
    expect(await getGoals(userId)).toEqual({
      yearlyBooks: 24,
      weeklyMinutes: 150,
      streakDays: 30,
    });
  });

  it('partial update leaves the omitted goal untouched', async () => {
    await setGoals(userId, { yearlyBooks: 24, weeklyMinutes: 150 });
    await setGoals(userId, { weeklyMinutes: 200 });
    expect(await getGoals(userId)).toEqual({
      yearlyBooks: 24,
      weeklyMinutes: 200,
      streakDays: null,
    });
  });

  it('explicit null clears a goal', async () => {
    await setGoals(userId, { yearlyBooks: 24, weeklyMinutes: 150 });
    await setGoals(userId, { yearlyBooks: null });
    expect(await getGoals(userId)).toEqual({
      yearlyBooks: null,
      weeklyMinutes: 150,
      streakDays: null,
    });
  });

  it('streak goal round-trips and clears independently', async () => {
    await setGoals(userId, { streakDays: 100 });
    expect((await getGoals(userId)).streakDays).toBe(100);

    // undefined for streak keeps it while changing another goal
    await setGoals(userId, { yearlyBooks: 12 });
    expect(await getGoals(userId)).toEqual({
      yearlyBooks: 12,
      weeklyMinutes: null,
      streakDays: 100,
    });

    // explicit null clears just the streak
    await setGoals(userId, { streakDays: null });
    expect(await getGoals(userId)).toEqual({
      yearlyBooks: 12,
      weeklyMinutes: null,
      streakDays: null,
    });
  });

  it('isolates goals per user', async () => {
    const other = await insertUser({
      username: 'other',
      passwordHash: 'x',
      role: 'user',
      mustChangePassword: false,
    });
    await setGoals(userId, { yearlyBooks: 10 });
    expect(await getGoals(other.id)).toEqual({
      yearlyBooks: null,
      weeklyMinutes: null,
      streakDays: null,
    });
  });
});

describe('GET/PUT /api/reader/goals', () => {
  it('GET requires auth (401)', async () => {
    expect((await GOALS_GET(reqGet(null))).status).toBe(401);
  });

  it('PUT requires auth (401)', async () => {
    expect((await GOALS_PUT(reqPut(null, { yearlyBooks: 5 }))).status).toBe(401);
  });

  it('GET returns the default empty goals', async () => {
    const res = await GOALS_GET(reqGet(cookie));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      yearlyBooks: null,
      weeklyMinutes: null,
      streakDays: null,
    });
  });

  it('PUT sets goals and GET reflects them', async () => {
    const put = await GOALS_PUT(
      reqPut(cookie, { yearlyBooks: 30, weeklyMinutes: 100, streakDays: 14 }),
    );
    expect(put.status).toBe(200);
    expect(await put.json()).toEqual({ yearlyBooks: 30, weeklyMinutes: 100, streakDays: 14 });

    const get = await GOALS_GET(reqGet(cookie));
    expect(await get.json()).toEqual({ yearlyBooks: 30, weeklyMinutes: 100, streakDays: 14 });
  });

  it('PUT with null clears a goal', async () => {
    await GOALS_PUT(reqPut(cookie, { yearlyBooks: 30, weeklyMinutes: 100 }));
    const put = await GOALS_PUT(reqPut(cookie, { weeklyMinutes: null }));
    expect(await put.json()).toEqual({ yearlyBooks: 30, weeklyMinutes: null, streakDays: null });
  });

  it('PUT accepts and clears the streak goal', async () => {
    const set = await GOALS_PUT(reqPut(cookie, { streakDays: 30 }));
    expect(await set.json()).toEqual({
      yearlyBooks: null,
      weeklyMinutes: null,
      streakDays: 30,
    });

    const clear = await GOALS_PUT(reqPut(cookie, { streakDays: null }));
    expect(await clear.json()).toEqual({
      yearlyBooks: null,
      weeklyMinutes: null,
      streakDays: null,
    });
  });

  it('PUT rejects a negative integer (400)', async () => {
    expect((await GOALS_PUT(reqPut(cookie, { yearlyBooks: -1 }))).status).toBe(400);
  });

  it('PUT rejects a non-integer (400)', async () => {
    expect((await GOALS_PUT(reqPut(cookie, { weeklyMinutes: 1.5 }))).status).toBe(400);
  });
});
