import { afterEach, beforeEach, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { seedDb, type SeedHandle } from '../../helpers/seed';
import { seedReaderFixtures, type ReaderFixtures } from '../reader/fixtures-helper';
import { insertUser } from '@/server/db/users';
import { createSession } from '@/server/db/sessions';
import { GET } from '@/app/api/series/[id]/toc/route';

let h: SeedHandle;
let fx: ReaderFixtures;
let cookie: string;
let originalMediaRoot: string | undefined;

beforeEach(async () => {
  h = await seedDb({ skipDefaultSeries: true });
  originalMediaRoot = process.env.BOOKKEEPRR_MEDIA_ROOT;
  fx = await seedReaderFixtures(h);
  const user = await insertUser({
    username: 'reader',
    passwordHash: 'x',
    role: 'admin',
    mustChangePassword: false,
  });
  const s = await createSession({ userId: user.id, userAgent: null, ipAddress: null });
  cookie = `bookkeeprr_session=${s.token}`;
});

afterEach(() => {
  if (originalMediaRoot === undefined) delete process.env.BOOKKEEPRR_MEDIA_ROOT;
  else process.env.BOOKKEEPRR_MEDIA_ROOT = originalMediaRoot;
  h.cleanup();
});

function ctx(id: number | string) {
  return { params: Promise.resolve({ id: String(id) }) };
}

function req(cookieVal: string | null, id: number | string): NextRequest {
  const headers: Record<string, string> = {};
  if (cookieVal !== null) headers.cookie = cookieVal;
  return new NextRequest(`http://localhost/api/series/${id}/toc`, { headers });
}

type TocBody = { fileId: number | null; entries: { title: string; loc: string }[] };

it('returns epub TOC entries with spine loc tokens for an ebook series', async () => {
  const res = await GET(req(cookie, fx.ebookSeriesId), ctx(fx.ebookSeriesId));
  expect(res.status).toBe(200);
  const body = (await res.json()) as TocBody;
  expect(body.fileId).toBe(fx.epubFileId);
  expect(body.entries.length).toBe(2);
  for (const e of body.entries) {
    expect(typeof e.title).toBe('string');
    expect(e.loc).toMatch(/^spine:\d+$/);
  }
});

it('returns no entries for a cbz comics series', async () => {
  const res = await GET(req(cookie, fx.comicsSeriesId), ctx(fx.comicsSeriesId));
  expect(res.status).toBe(200);
  const body = (await res.json()) as TocBody;
  expect(body.fileId).toBeNull();
  expect(body.entries).toEqual([]);
});

it('is session-gated (401 without cookie)', async () => {
  const res = await GET(req(null, fx.ebookSeriesId), ctx(fx.ebookSeriesId));
  expect(res.status).toBe(401);
});

it('returns 400 for a non-numeric id', async () => {
  const res = await GET(req(cookie, 'abc'), ctx('abc'));
  expect(res.status).toBe(400);
});

it('returns 404 for an unknown series', async () => {
  const res = await GET(req(cookie, 999_999), ctx(999_999));
  expect(res.status).toBe(404);
});
