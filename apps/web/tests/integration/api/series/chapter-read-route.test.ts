import { afterEach, beforeEach, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { seedDb, type SeedHandle } from '../../helpers/seed';
import { insertUser } from '@/server/db/users';
import { createSession } from '@/server/db/sessions';
import { insertChapter } from '@/server/db/chapters';
import { insertSeries } from '@/server/db/series';
import { listReadChapterIds } from '@/server/db/chapter-read';
import { POST } from '@/app/api/series/[id]/chapters/[chapterId]/read/route';

let h: SeedHandle;
let userId: number;
let cookie: string;

beforeEach(async () => {
  h = await seedDb();
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

function ctx(id: number | string, chapterId: number | string) {
  return { params: Promise.resolve({ id: String(id), chapterId: String(chapterId) }) };
}

function reqJson(cookieVal: string | null, body: unknown): NextRequest {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (cookieVal !== null) headers.cookie = cookieVal;
  return new NextRequest(
    `http://localhost/api/series/${h.seriesId}/chapters/${h.chapterId}/read`,
    { method: 'POST', headers, body: JSON.stringify(body) },
  );
}

it('POST { read: true } persists, then { read: false } clears', async () => {
  const res = await POST(reqJson(cookie, { read: true }), ctx(h.seriesId, h.chapterId));
  expect(res.status).toBe(200);
  expect(await listReadChapterIds(userId, h.seriesId)).toEqual(new Set([h.chapterId]));

  const res2 = await POST(reqJson(cookie, { read: false }), ctx(h.seriesId, h.chapterId));
  expect(res2.status).toBe(200);
  expect(await listReadChapterIds(userId, h.seriesId)).toEqual(new Set());
});

it('is session-gated (401 without cookie)', async () => {
  const res = await POST(reqJson(null, { read: true }), ctx(h.seriesId, h.chapterId));
  expect(res.status).toBe(401);
});

it('returns 400 for a non-numeric id', async () => {
  const res = await POST(reqJson(cookie, { read: true }), ctx('abc', h.chapterId));
  expect(res.status).toBe(400);
});

it('returns 400 for a malformed body', async () => {
  const res = await POST(reqJson(cookie, { read: 'yes' }), ctx(h.seriesId, h.chapterId));
  expect(res.status).toBe(400);
});

it('returns 404 for an unknown chapter', async () => {
  const res = await POST(reqJson(cookie, { read: true }), ctx(h.seriesId, 999_999));
  expect(res.status).toBe(404);
});

it('returns 404 when the chapter belongs to a different series', async () => {
  const otherSeriesId = await insertSeries({
    anilistId: 4242,
    status: 'releasing',
    rootPath: '/media/comics/Other',
    qualityProfileId: h.qpId,
    titleEnglish: 'Other',
  });
  const otherChapterId = await insertChapter({
    seriesId: otherSeriesId,
    numberText: '1',
    numberSort: 1,
  });
  const res = await POST(reqJson(cookie, { read: true }), ctx(h.seriesId, otherChapterId));
  expect(res.status).toBe(404);
});
