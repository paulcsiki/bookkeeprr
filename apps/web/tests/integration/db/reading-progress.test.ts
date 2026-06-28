import { beforeEach, afterEach, it, expect } from 'vitest';
import { seedDb, type SeedHandle } from '../helpers/seed';
import { insertUser } from '@/server/db/users';
import { and, eq } from 'drizzle-orm';
import {
  getProgress,
  upsertProgress,
  listContinueReading,
  getSeriesResume,
  getVolumeReadStates,
  deleteProgress,
} from '@/server/db/reading-progress';
import { insertVolume } from '@/server/db/volumes';
import { getDb } from '@/server/db/client';
import { readingProgress } from '@/server/db/schema';

let h: SeedHandle;
let userId: number;
beforeEach(async () => {
  h = await seedDb();
  userId = (
    await insertUser({ username: 'reader', passwordHash: 'x', role: 'user', mustChangePassword: false })
  ).id;
});
afterEach(() => h.cleanup());

it('upsert then get round-trips', async () => {
  const key = 'page:file:1';
  await upsertProgress({
    userId,
    readableKey: key,
    seriesId: h.seriesId,
    volumeId: h.volumeId,
    libraryFileId: null,
    contentType: 'manga',
    position: 0.5,
    locator: { page: 7 },
  });
  const got = await getProgress(userId, key);
  expect(got?.position).toBeCloseTo(0.5);
  expect(got?.finished).toBe(false);
  expect(JSON.parse(got!.locatorJson)).toEqual({ page: 7 });
});

it('getVolumeReadStates: finished / reading / unread per volume', async () => {
  const v1 = h.volumeId;
  const v2 = await insertVolume({ seriesId: h.seriesId, number: 2 });
  const v3 = await insertVolume({ seriesId: h.seriesId, number: 3 });
  // v1 finished (pos >= 0.999), v2 in progress, v3 untouched.
  await upsertProgress({
    userId, readableKey: 'page:file:101', seriesId: h.seriesId, volumeId: v1,
    libraryFileId: null, contentType: 'manga', position: 1, locator: { page: 99 },
  });
  await upsertProgress({
    userId, readableKey: 'page:file:102', seriesId: h.seriesId, volumeId: v2,
    libraryFileId: null, contentType: 'manga', position: 0.4, locator: { page: 40 },
  });
  const states = await getVolumeReadStates(userId, h.seriesId);
  expect(states.get(v1)).toBe('finished');
  expect(states.get(v2)).toBe('reading');
  expect(states.has(v3)).toBe(false); // no progress → unread (absent)
});

it('position>=0.999 marks finished', async () => {
  await upsertProgress({
    userId,
    readableKey: 'page:file:1',
    seriesId: h.seriesId,
    contentType: 'manga',
    position: 1,
  });
  expect((await getProgress(userId, 'page:file:1'))?.finished).toBe(true);
});

it('keeps ONE shared row per readable across devices (last-write-wins)', async () => {
  // Phone partway through…
  await upsertProgress({
    userId, readableKey: 'page:file:9', seriesId: h.seriesId, contentType: 'manga',
    position: 0.3, locator: { page: 30 }, deviceId: 'phone', deviceName: 'iPhone',
  });
  // …then finished on web. Same readable → same single row, updated in place.
  await upsertProgress({
    userId, readableKey: 'page:file:9', seriesId: h.seriesId, contentType: 'manga',
    position: 1, locator: { page: 99 }, deviceId: 'web', deviceName: 'Chrome',
  });
  const rows = await getDb()
    .select()
    .from(readingProgress)
    .where(and(eq(readingProgress.userId, userId), eq(readingProgress.readableKey, 'page:file:9')));
  expect(rows).toHaveLength(1); // not one-per-device

  const p = await getProgress(userId, 'page:file:9');
  expect(p?.finished).toBe(true);
  expect(p?.position).toBeCloseTo(1); // the last write
  expect(JSON.parse(p!.locatorJson)).toEqual({ page: 99 });
  expect(rows[0]!.deviceName).toBe('Chrome'); // last writer recorded for handoff
});

it('a forward write after finished clears finished', async () => {
  await upsertProgress({
    userId,
    readableKey: 'page:file:1',
    seriesId: h.seriesId,
    contentType: 'manga',
    position: 1,
  });
  await upsertProgress({
    userId,
    readableKey: 'page:file:1',
    seriesId: h.seriesId,
    contentType: 'manga',
    position: 0.2,
  });
  expect((await getProgress(userId, 'page:file:1'))?.finished).toBe(false);
});

it('listContinueReading returns rows scoped to the user, newest first', async () => {
  await upsertProgress({
    userId,
    readableKey: 'page:file:1',
    seriesId: h.seriesId,
    contentType: 'manga',
    position: 0.3,
  });
  const rows = await listContinueReading(userId, 10);
  expect(rows.length).toBe(1);
  expect(rows[0]!.readableKey).toBe('page:file:1');
});

it('listContinueReading collapses per readable across devices: finished on any device wins', async () => {
  // Phone left it mid-way…
  await upsertProgress({
    userId,
    readableKey: 'page:file:1',
    seriesId: h.seriesId,
    contentType: 'manga',
    position: 0.338,
    deviceId: 'phone',
    deviceName: 'your iPhone',
  });
  // …then it was finished on the web.
  await upsertProgress({
    userId,
    readableKey: 'page:file:1',
    seriesId: h.seriesId,
    contentType: 'manga',
    position: 1,
    deviceId: 'web',
    deviceName: 'Chrome on Linux',
  });
  const rows = (await listContinueReading(userId, 10)).filter((r) => r.readableKey === 'page:file:1');
  // One collapsed entry, finished, at the max position — so the dashboard's
  // !finished filter drops it instead of showing the stale phone row.
  expect(rows).toHaveLength(1);
  expect(rows[0]!.finished).toBe(true);
  expect(rows[0]!.position).toBeCloseTo(1);
});

it('listContinueReading collapses to the furthest progress when unfinished on all devices', async () => {
  await upsertProgress({
    userId, readableKey: 'page:file:2', seriesId: h.seriesId, contentType: 'manga',
    position: 0.2, deviceId: 'a',
  });
  await upsertProgress({
    userId, readableKey: 'page:file:2', seriesId: h.seriesId, contentType: 'manga',
    position: 0.6, deviceId: 'b',
  });
  const rows = (await listContinueReading(userId, 10)).filter((r) => r.readableKey === 'page:file:2');
  expect(rows).toHaveLength(1);
  expect(rows[0]!.finished).toBe(false);
  expect(rows[0]!.position).toBeCloseTo(0.6);
});

it('listContinueReading prefers the in-progress volume cover (proxied) over the series cover', async () => {
  const { updateVolume } = await import('@/server/db/volumes');
  const { updateSeries } = await import('@/server/db/series');
  await updateSeries(h.seriesId, { coverUrl: 'https://s4.anilist.co/series.jpg' });
  const volCover = 'https://uploads.mangadex.org/covers/abc/v2.jpg';
  await updateVolume(h.volumeId, { metadataJson: JSON.stringify({ coverUrl: volCover }) });
  await upsertProgress({
    userId,
    readableKey: 'page:file:1',
    seriesId: h.seriesId,
    volumeId: h.volumeId,
    contentType: 'manga',
    position: 0.4,
  });
  const rows = await listContinueReading(userId, 10);
  expect(rows[0]!.coverUrl).toBe(`/api/img?u=${encodeURIComponent(volCover)}`);
});

it('listContinueReading falls back to the series cover when the volume has none', async () => {
  const { updateSeries } = await import('@/server/db/series');
  await updateSeries(h.seriesId, { coverUrl: 'https://s4.anilist.co/series.jpg' });
  await upsertProgress({
    userId,
    readableKey: 'page:file:1',
    seriesId: h.seriesId,
    contentType: 'manga',
    position: 0.4,
  });
  const rows = await listContinueReading(userId, 10);
  expect(rows[0]!.coverUrl).toBe('https://s4.anilist.co/series.jpg');
});

it('getSeriesResume returns the most-recent in-progress readable, skipping finished', async () => {
  await upsertProgress({
    userId, readableKey: 'page:file:1', seriesId: h.seriesId, contentType: 'manga', position: 1,
  });
  await upsertProgress({
    userId, readableKey: 'page:file:2', seriesId: h.seriesId, contentType: 'manga', position: 0.4,
  });
  const r = await getSeriesResume(userId, h.seriesId);
  expect(r?.readableKey).toBe('page:file:2');
  expect(r?.position).toBeCloseTo(0.4);
});

it('getSeriesResume returns null when nothing in the series is in progress', async () => {
  await upsertProgress({
    userId, readableKey: 'page:file:1', seriesId: h.seriesId, contentType: 'manga', position: 1,
  });
  expect(await getSeriesResume(userId, h.seriesId)).toBeNull();
});

it('listContinueReading includes volumeNumber and volumeTitle from the joined volume', async () => {
  const { updateVolume } = await import('@/server/db/volumes');
  // h.volumeId is a volume with number 1 by default; update it to have a title too.
  await updateVolume(h.volumeId, { title: 'Birth' });
  await upsertProgress({
    userId,
    readableKey: 'page:file:vol1',
    seriesId: h.seriesId,
    volumeId: h.volumeId,
    contentType: 'manga',
    position: 0.5,
  });
  const rows = await listContinueReading(userId, 10);
  const row = rows.find((r) => r.readableKey === 'page:file:vol1');
  expect(row).toBeDefined();
  expect(row!.volumeNumber).toBe(1);
  expect(row!.volumeTitle).toBe('Birth');
});

it('listContinueReading returns null volumeNumber/volumeTitle when no volumeId on progress', async () => {
  await upsertProgress({
    userId,
    readableKey: 'page:file:novol',
    seriesId: h.seriesId,
    volumeId: null,
    contentType: 'manga',
    position: 0.3,
  });
  const rows = await listContinueReading(userId, 10);
  const row = rows.find((r) => r.readableKey === 'page:file:novol');
  expect(row).toBeDefined();
  expect(row!.volumeNumber).toBeNull();
  expect(row!.volumeTitle).toBeNull();
});

it('deleteProgress removes the row', async () => {
  await upsertProgress({
    userId,
    readableKey: 'page:file:1',
    seriesId: h.seriesId,
    contentType: 'manga',
    position: 0.3,
  });
  await deleteProgress(userId, 'page:file:1');
  expect(await getProgress(userId, 'page:file:1')).toBeNull();
});
