import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { seedDb, type SeedHandle } from '../helpers/seed';
import { insertUser } from '@/server/db/users';
import { createSession } from '@/server/db/sessions';
import { getDashboardPrefs, setDashboardPrefs } from '@/server/db/dashboard-prefs';
import { GET as PREFS_GET, PUT as PREFS_PUT } from '@/app/api/dashboard/prefs/route';
import {
  WIDGET_IDS,
  DEFAULT_ORDER,
  SOCIAL_ORDER,
  defaultPrefs,
} from '@/components/dashboard/widget-registry';

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

function fullEnabled(overrides: Record<string, boolean> = {}): Record<string, boolean> {
  return { ...Object.fromEntries(WIDGET_IDS.map((id) => [id, true])), ...overrides };
}

function reqGet(cookieHeader: string | null): NextRequest {
  const headers: Record<string, string> = {};
  if (cookieHeader !== null) headers.cookie = cookieHeader;
  return new NextRequest('http://localhost/api/dashboard/prefs', { headers });
}

function reqPut(cookieHeader: string | null, body: unknown): NextRequest {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (cookieHeader !== null) headers.cookie = cookieHeader;
  return new NextRequest('http://localhost/api/dashboard/prefs', {
    method: 'PUT',
    headers,
    body: JSON.stringify(body),
  });
}

describe('dashboard-prefs DAL', () => {
  it('returns the default when nothing is stored', async () => {
    expect(await getDashboardPrefs(userId)).toEqual(defaultPrefs());
  });

  it('round-trips a stored order + enabled map', async () => {
    await setDashboardPrefs(userId, { order: SOCIAL_ORDER, enabled: fullEnabled({ feed: false }) });
    const got = await getDashboardPrefs(userId);
    expect(got.order).toEqual(SOCIAL_ORDER);
    expect(got.enabled.feed).toBe(false);
    expect(got.enabled.continue).toBe(true);
  });

  it('merges over default: a manually-stored stale blob drops unknown ids and defaults new ids on', async () => {
    // Write a deliberately stale blob directly via the schema, bypassing validation,
    // to simulate a widget set that has since grown.
    const { getDb } = await import('@/server/db/client');
    const { dashboardPrefs } = await import('@/server/db/schema');
    await getDb()
      .insert(dashboardPrefs)
      .values({
        userId,
        orderJson: JSON.stringify(['recent', 'ghost', 'continue']),
        enabledJson: JSON.stringify({ continue: false, ghost: true }),
        updatedAt: new Date(),
      });
    const got = await getDashboardPrefs(userId);
    expect(got.order.slice(0, 2)).toEqual(['recent', 'continue']);
    expect(got.order).not.toContain('ghost');
    expect([...got.order].sort()).toEqual([...WIDGET_IDS].sort());
    expect(got.enabled.continue).toBe(false); // stored value respected
    expect(got.enabled.personal).toBe(true); // newly-defaulted on
    expect('ghost' in got.enabled).toBe(false);
  });

  it('upsert overwrites a prior set', async () => {
    await setDashboardPrefs(userId, { order: SOCIAL_ORDER, enabled: fullEnabled() });
    await setDashboardPrefs(userId, { order: DEFAULT_ORDER, enabled: fullEnabled({ recent: false }) });
    const got = await getDashboardPrefs(userId);
    expect(got.order).toEqual(DEFAULT_ORDER);
    expect(got.enabled.recent).toBe(false);
  });

  it('rejects an invalid payload (bogus id) by throwing', async () => {
    const order = [...DEFAULT_ORDER.slice(0, -1), 'bogus'];
    await expect(setDashboardPrefs(userId, { order, enabled: fullEnabled() })).rejects.toThrow();
  });

  it('isolates prefs per user', async () => {
    const other = await insertUser({
      username: 'other',
      passwordHash: 'x',
      role: 'user',
      mustChangePassword: false,
    });
    await setDashboardPrefs(userId, { order: SOCIAL_ORDER, enabled: fullEnabled({ feed: false }) });
    expect(await getDashboardPrefs(other.id)).toEqual(defaultPrefs());
  });
});

describe('GET/PUT /api/dashboard/prefs', () => {
  it('GET requires auth (401)', async () => {
    expect((await PREFS_GET(reqGet(null))).status).toBe(401);
  });

  it('PUT requires auth (401)', async () => {
    expect(
      (await PREFS_PUT(reqPut(null, { order: DEFAULT_ORDER, enabled: fullEnabled() }))).status,
    ).toBe(401);
  });

  it('GET returns the default prefs', async () => {
    const res = await PREFS_GET(reqGet(cookie));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(defaultPrefs());
  });

  it('PUT persists and GET reflects it', async () => {
    const body = { order: SOCIAL_ORDER, enabled: fullEnabled({ feed: false }) };
    const put = await PREFS_PUT(reqPut(cookie, body));
    expect(put.status).toBe(200);
    const get = await PREFS_GET(reqGet(cookie));
    const got = await get.json();
    expect(got.order).toEqual(SOCIAL_ORDER);
    expect(got.enabled.feed).toBe(false);
  });

  it('PUT rejects a bogus widget id (400)', async () => {
    const order = [...DEFAULT_ORDER.slice(0, -1), 'bogus'];
    const res = await PREFS_PUT(reqPut(cookie, { order, enabled: fullEnabled() }));
    expect(res.status).toBe(400);
  });

  it('PUT rejects an incomplete enabled map (400)', async () => {
    const enabled = fullEnabled();
    delete enabled.feed;
    const res = await PREFS_PUT(reqPut(cookie, { order: DEFAULT_ORDER, enabled }));
    expect(res.status).toBe(400);
  });

  it('PUT rejects invalid json (400)', async () => {
    const headers: Record<string, string> = { 'content-type': 'application/json', cookie };
    const req = new NextRequest('http://localhost/api/dashboard/prefs', {
      method: 'PUT',
      headers,
      body: '{ not json',
    });
    expect((await PREFS_PUT(req)).status).toBe(400);
  });
});
