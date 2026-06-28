import { afterEach, beforeEach, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { seedDb, type SeedHandle } from '../../helpers/seed';
import { insertUser } from '@/server/db/users';
import { createSession } from '@/server/db/sessions';
import { enqueueJob } from '@/server/db/jobs';
import { GET } from '@/app/api/series/[id]/hydration-status/route';

let h: SeedHandle;
let cookie: string;

beforeEach(async () => {
  h = await seedDb();
  const user = await insertUser({
    username: 'admin',
    passwordHash: 'x',
    role: 'admin',
    mustChangePassword: false,
  });
  const s = await createSession({ userId: user.id, userAgent: null, ipAddress: null });
  cookie = `bookkeeprr_session=${s.token}`;
});

afterEach(() => {
  h.cleanup();
});

function ctx(id: number | string) {
  return { params: Promise.resolve({ id: String(id) }) };
}

function req(cookieVal: string | null, id: number | string): NextRequest {
  const headers: Record<string, string> = {};
  if (cookieVal !== null) headers.cookie = cookieVal;
  return new NextRequest(`http://localhost/api/series/${id}/hydration-status`, { headers });
}

type Body = { running: boolean; kinds: string[]; hydrating: boolean };

it('returns { running: false, kinds: [] } when no job is active', async () => {
  const res = await GET(req(cookie, h.seriesId), ctx(h.seriesId));
  expect(res.status).toBe(200);
  const body = (await res.json()) as Body;
  expect(body.running).toBe(false);
  expect(body.kinds).toEqual([]);
  expect(body.hydrating).toBe(false);
});

it('returns running + the kinds when a job is pending for the series', async () => {
  await enqueueJob('metadata_hydrate', { seriesId: h.seriesId });
  await enqueueJob('mangadex_chapter_sync', { seriesId: h.seriesId });
  const res = await GET(req(cookie, h.seriesId), ctx(h.seriesId));
  expect(res.status).toBe(200);
  const body = (await res.json()) as Body;
  expect(body.running).toBe(true);
  expect(body.hydrating).toBe(true);
  expect([...body.kinds].sort()).toEqual(['mangadex_chapter_sync', 'metadata_hydrate']);
});

it('is session-gated (401 without cookie)', async () => {
  const res = await GET(req(null, h.seriesId), ctx(h.seriesId));
  expect(res.status).toBe(401);
});

it('returns 400 for a non-numeric id', async () => {
  const res = await GET(req(cookie, 'abc'), ctx('abc'));
  expect(res.status).toBe(400);
});
