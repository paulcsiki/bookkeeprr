import { afterEach, beforeEach, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { seedDb, type SeedHandle } from '../../helpers/seed';
import { insertUser } from '@/server/db/users';
import { createSession } from '@/server/db/sessions';
import { insertVolume } from '@/server/db/volumes';
import { insertChapter } from '@/server/db/chapters';
import { insertLibraryFile } from '@/server/db/library-files';
import { listReadChapterIds } from '@/server/db/chapter-read';
import { PUT } from '@/app/api/reader/progress/[readableKey]/route';

let h: SeedHandle;
let userId: number;
let cookie: string;
let volumeId: number;
let fileId: number;
let chA: number;
let chB: number;

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

  volumeId = await insertVolume({ seriesId: h.seriesId, number: 5, title: 'v5' });
  chA = await insertChapter({
    seriesId: h.seriesId,
    volumeId,
    numberText: '50',
    numberSort: 50,
  });
  chB = await insertChapter({
    seriesId: h.seriesId,
    volumeId,
    numberText: '51',
    numberSort: 51,
  });
  // The volume readable is addressed via its single file (page:file:<id>); the
  // volumeId travels in the PUT body, which is what auto-mark keys off.
  fileId = await insertLibraryFile({
    seriesId: h.seriesId,
    volumeId,
    path: `/media/comics/Test Series/v5.cbz`,
    sizeBytes: 1000,
  });
});

afterEach(() => h.cleanup());

function putReq(body: unknown): { req: NextRequest; key: string } {
  const key = `page:file:${fileId}`;
  const req = new NextRequest(
    `http://localhost/api/reader/progress/${encodeURIComponent(key)}`,
    {
      method: 'PUT',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify(body),
    },
  );
  return { req, key };
}

function ctx(key: string) {
  return { params: Promise.resolve({ readableKey: key }) };
}

it('finishing a volume auto-marks its chapters read', async () => {
  const { req, key } = putReq({
    position: 1,
    locator: { page: 3 },
    seriesId: h.seriesId,
    volumeId,
    contentType: 'manga',
  });
  const res = await PUT(req, ctx(key));
  expect(res.status).toBe(200);

  const read = await listReadChapterIds(userId, h.seriesId);
  expect(read.has(chA)).toBe(true);
  expect(read.has(chB)).toBe(true);
});

it('a mid-volume (not finished) write does NOT mark chapters read', async () => {
  const { req, key } = putReq({
    position: 0.5,
    locator: { page: 1 },
    seriesId: h.seriesId,
    volumeId,
    contentType: 'manga',
  });
  const res = await PUT(req, ctx(key));
  expect(res.status).toBe(200);

  expect(await listReadChapterIds(userId, h.seriesId)).toEqual(new Set());
});
