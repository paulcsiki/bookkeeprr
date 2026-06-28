import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { and, eq } from 'drizzle-orm';
import { seedDb, type SeedHandle } from '../helpers/seed';
import { getDb } from '@/server/db/client';
import { readingProgress } from '@/server/db/schema';
import { insertSeries } from '@/server/db/series';
import { insertVolume } from '@/server/db/volumes';
import { insertLibraryFile } from '@/server/db/library-files';
import { insertUser } from '@/server/db/users';
import { hashPassword } from '@/server/auth/password';
import { upsertProgress } from '@/server/db/reading-progress';
import { queueNextInSeries } from '@/server/reader/queue-next';

let h: SeedHandle;
let media: string;
let userId: number;
let seriesId: number;
let vol1: number;
let vol2: number;

async function ownedVolume(num: number): Promise<number> {
  const id = await insertVolume({ seriesId, number: num, title: `v${num}` });
  const dir = join(media, 'comics', 'S');
  mkdirSync(dir, { recursive: true });
  const p = join(dir, `S - v0${num}.cbz`);
  writeFileSync(p, 'x');
  await insertLibraryFile({ seriesId, volumeId: id, path: p, sizeBytes: 1 });
  return id;
}

beforeEach(async () => {
  h = await seedDb({ skipDefaultSeries: true });
  media = mkdtempSync(join(tmpdir(), 'bk-qn-media-'));
  process.env.BOOKKEEPRR_MEDIA_ROOT = media;
  const u = await insertUser({
    username: 'reader',
    passwordHash: await hashPassword('hunter22'),
    role: 'admin',
    mustChangePassword: false,
  });
  userId = u.id;
  seriesId = await insertSeries({
    contentType: 'manga',
    anilistId: 1,
    status: 'releasing',
    rootPath: '/media/comics/S',
    qualityProfileId: h.qpId,
    titleEnglish: 'S',
    granularity: 'volume',
  });
  vol1 = await ownedVolume(1);
  vol2 = await ownedVolume(2);
});
afterEach(() => {
  h.cleanup();
  rmSync(media, { recursive: true, force: true });
  delete process.env.BOOKKEEPRR_MEDIA_ROOT;
});

async function progressForVolume(volumeId: number) {
  const rows = await getDb()
    .select()
    .from(readingProgress)
    .where(and(eq(readingProgress.userId, userId), eq(readingProgress.volumeId, volumeId)));
  return rows[0] ?? null;
}

describe('queueNextInSeries', () => {
  it('queues the next owned volume as a 0% continue tile', async () => {
    await queueNextInSeries({ userId, seriesId, currentVolumeId: vol1, contentType: 'manga', deviceId: null });
    const p = await progressForVolume(vol2);
    expect(p).not.toBeNull();
    expect(p!.finished).toBe(false);
    expect(p!.position).toBeGreaterThan(0);
    expect(p!.position).toBeLessThan(0.01); // tiny "up next" marker
  });

  it('does nothing when there is no later owned volume', async () => {
    // finishing the last volume (vol2) → no vol3
    await queueNextInSeries({ userId, seriesId, currentVolumeId: vol2, contentType: 'manga', deviceId: null });
    // no new rows created at all
    const all = await getDb().select().from(readingProgress).where(eq(readingProgress.userId, userId));
    expect(all).toHaveLength(0);
  });

  it('does not clobber existing progress on the next volume', async () => {
    const { readableKey } = await (await import('@/server/reader/readable')).resolveReadable({
      volumeId: vol2,
    }) as { readableKey: string };
    await upsertProgress({
      userId,
      readableKey,
      seriesId,
      volumeId: vol2,
      libraryFileId: null,
      contentType: 'manga',
      position: 0.5,
      locator: null,
      deviceId: null,
      deviceName: null,
    });
    await queueNextInSeries({ userId, seriesId, currentVolumeId: vol1, contentType: 'manga', deviceId: null });
    const p = await progressForVolume(vol2);
    expect(p!.position).toBe(0.5); // untouched
  });
});
