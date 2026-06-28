import { beforeEach, afterEach, it, expect } from 'vitest';
import { seedDb, type SeedHandle } from '../helpers/seed';
import { insertUser } from '@/server/db/users';
import { insertVolume } from '@/server/db/volumes';
import { insertChapter } from '@/server/db/chapters';
import {
  setChapterRead,
  listReadChapterIds,
  markVolumeChaptersRead,
} from '@/server/db/chapter-read';

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

it('setChapterRead marks a chapter read, then clears it', async () => {
  await setChapterRead(userId, h.chapterId, true);
  expect(await listReadChapterIds(userId, h.seriesId)).toEqual(new Set([h.chapterId]));

  // idempotent — marking again does not error or duplicate
  await setChapterRead(userId, h.chapterId, true);
  expect(await listReadChapterIds(userId, h.seriesId)).toEqual(new Set([h.chapterId]));

  await setChapterRead(userId, h.chapterId, false);
  expect(await listReadChapterIds(userId, h.seriesId)).toEqual(new Set());
});

it('listReadChapterIds is scoped to the user', async () => {
  await setChapterRead(userId, h.chapterId, true);
  expect(await listReadChapterIds(otherUserId, h.seriesId)).toEqual(new Set());
});

it('listReadChapterIds is scoped to the series', async () => {
  // A second series with its own chapter.
  const otherSeriesId = await (await import('@/server/db/series')).insertSeries({
    anilistId: 999,
    status: 'releasing',
    rootPath: '/media/comics/Other',
    qualityProfileId: h.qpId,
    titleEnglish: 'Other Series',
  });
  const otherChapterId = await insertChapter({
    seriesId: otherSeriesId,
    numberText: '1',
    numberSort: 1,
    title: 'Other Ch 1',
  });
  await setChapterRead(userId, h.chapterId, true);
  await setChapterRead(userId, otherChapterId, true);

  expect(await listReadChapterIds(userId, h.seriesId)).toEqual(new Set([h.chapterId]));
  expect(await listReadChapterIds(userId, otherSeriesId)).toEqual(new Set([otherChapterId]));
});

it('markVolumeChaptersRead marks all chapters of a volume for the user', async () => {
  const volId = await insertVolume({ seriesId: h.seriesId, number: 2, title: 'v2' });
  const c1 = await insertChapter({
    seriesId: h.seriesId,
    volumeId: volId,
    numberText: '10',
    numberSort: 10,
  });
  const c2 = await insertChapter({
    seriesId: h.seriesId,
    volumeId: volId,
    numberText: '11',
    numberSort: 11,
  });
  // A chapter NOT in the volume must stay unread.
  const outside = await insertChapter({
    seriesId: h.seriesId,
    numberText: '12',
    numberSort: 12,
  });

  await markVolumeChaptersRead(userId, volId);

  const read = await listReadChapterIds(userId, h.seriesId);
  expect(read.has(c1)).toBe(true);
  expect(read.has(c2)).toBe(true);
  expect(read.has(outside)).toBe(false);
});

it('markVolumeChaptersRead is idempotent', async () => {
  const volId = await insertVolume({ seriesId: h.seriesId, number: 3, title: 'v3' });
  const c1 = await insertChapter({
    seriesId: h.seriesId,
    volumeId: volId,
    numberText: '20',
    numberSort: 20,
  });
  await markVolumeChaptersRead(userId, volId);
  await markVolumeChaptersRead(userId, volId);
  expect((await listReadChapterIds(userId, h.seriesId)).has(c1)).toBe(true);
});
