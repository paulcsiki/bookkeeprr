import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { closeDb, getDb } from '@/server/db/client.js';
import { seedDefaultQualityProfile } from '@/server/db/quality-profiles.js';
import {
  insertSeries,
  listSeries,
  getSeries,
  updateSeries,
  deleteSeries,
  getSeriesByAniListId,
} from '@/server/db/series.js';
import { insertVolume, deleteVolume } from '@/server/db/volumes.js';
import { imageCacheSetting } from '@/server/db/settings/library.js';

let tmp: string;
let defaultProfileId: number;

beforeEach(async () => {
  tmp = mkdtempSync(join(tmpdir(), 'bk-series-'));
  process.env.BOOKKEEPRR_DB_PATH = join(tmp, 'test.db');
  migrate(getDb(), { migrationsFolder: './drizzle' });
  defaultProfileId = await seedDefaultQualityProfile();
});
afterEach(() => {
  closeDb();
  rmSync(tmp, { recursive: true, force: true });
});

describe('series CRUD', () => {
  it('inserts and lists', async () => {
    const id = await insertSeries({
      anilistId: 123,
      status: 'releasing',
      rootPath: '/media/comics/Chainsaw Man',
      qualityProfileId: defaultProfileId,
      titleEnglish: 'Chainsaw Man',
    });
    expect(id).toBeGreaterThan(0);
    const all = await listSeries();
    expect(all).toHaveLength(1);
    expect(all[0]?.titleEnglish).toBe('Chainsaw Man');
  });

  it('getSeries returns the row', async () => {
    const id = await insertSeries({
      anilistId: 456,
      status: 'finished',
      rootPath: '/media/comics/Berserk',
      qualityProfileId: defaultProfileId,
      titleRomaji: 'Berserk',
    });
    const row = await getSeries(id);
    expect(row?.titleRomaji).toBe('Berserk');
    expect(row?.monitoring).toBe('all');
    expect(row?.granularity).toBe('volume');
  });

  it('getSeries returns null for missing id', async () => {
    expect(await getSeries(99999)).toBeNull();
  });

  it('updateSeries mutates allowed fields', async () => {
    const id = await insertSeries({
      anilistId: 789,
      status: 'releasing',
      rootPath: '/x',
      qualityProfileId: defaultProfileId,
    });
    await updateSeries(id, { monitoring: 'missing', granularity: 'chapter' });
    const row = await getSeries(id);
    expect(row?.monitoring).toBe('missing');
    expect(row?.granularity).toBe('chapter');
  });

  it('deleteSeries removes the row', async () => {
    const id = await insertSeries({
      anilistId: 111,
      status: 'releasing',
      rootPath: '/x',
      qualityProfileId: defaultProfileId,
    });
    await deleteSeries(id);
    expect(await getSeries(id)).toBeNull();
  });

  it('rejects duplicate anilistId', async () => {
    await insertSeries({
      anilistId: 222,
      status: 'releasing',
      rootPath: '/x',
      qualityProfileId: defaultProfileId,
    });
    await expect(
      insertSeries({
        anilistId: 222,
        status: 'releasing',
        rootPath: '/y',
        qualityProfileId: defaultProfileId,
      }),
    ).rejects.toThrow();
  });
});

describe('deleteSeries purges cached covers', () => {
  function seedCacheFile(dir: string, url: string, ext: string): string {
    const file = join(dir, createHash('sha256').update(url).digest('hex') + ext);
    writeFileSync(file, 'fake-bytes');
    return file;
  }

  it('unlinks the series cover + its volumes covers on delete', async () => {
    const cacheDir = join(tmp, 'cache');
    mkdirSync(cacheDir, { recursive: true });
    await imageCacheSetting.set({ enabled: true, dir: cacheDir });

    const seriesCover = 'https://uploads.mangadex.org/covers/series.jpg';
    const volCover = 'https://covers.openlibrary.org/b/id/v1-L.jpg';

    const id = await insertSeries({
      anilistId: 555,
      status: 'releasing',
      rootPath: '/x',
      qualityProfileId: defaultProfileId,
      coverUrl: seriesCover,
    });
    await insertVolume({
      seriesId: id,
      number: 1,
      metadataJson: JSON.stringify({ coverUrl: volCover }),
    });

    const seriesFile = seedCacheFile(cacheDir, seriesCover, '.jpg');
    const volFile = seedCacheFile(cacheDir, volCover, '.webp');
    expect(existsSync(seriesFile)).toBe(true);
    expect(existsSync(volFile)).toBe(true);

    await deleteSeries(id);

    expect(await getSeries(id)).toBeNull();
    expect(existsSync(seriesFile)).toBe(false);
    expect(existsSync(volFile)).toBe(false);
  });

  it('deleteVolume purges that volume\'s cached cover (Readarr book-delete path)', async () => {
    const cacheDir = join(tmp, 'cache-vol');
    mkdirSync(cacheDir, { recursive: true });
    await imageCacheSetting.set({ enabled: true, dir: cacheDir });

    const volCover = 'https://covers.openlibrary.org/b/id/solo-L.jpg';
    const id = await insertSeries({
      anilistId: 557,
      status: 'releasing',
      rootPath: '/x',
      qualityProfileId: defaultProfileId,
    });
    const volId = await insertVolume({
      seriesId: id,
      number: 1,
      metadataJson: JSON.stringify({ coverUrl: volCover }),
    });
    const volFile = seedCacheFile(cacheDir, volCover, '.jpg');
    expect(existsSync(volFile)).toBe(true);

    await deleteVolume(volId);
    expect(existsSync(volFile)).toBe(false);
  });

  it('delete still succeeds when there is no cached file (no-op purge)', async () => {
    const cacheDir = join(tmp, 'cache2');
    mkdirSync(cacheDir, { recursive: true });
    await imageCacheSetting.set({ enabled: true, dir: cacheDir });

    const id = await insertSeries({
      anilistId: 556,
      status: 'releasing',
      rootPath: '/x',
      qualityProfileId: defaultProfileId,
      coverUrl: 'https://uploads.mangadex.org/covers/none.jpg',
    });
    await expect(deleteSeries(id)).resolves.toBeUndefined();
    expect(await getSeries(id)).toBeNull();
  });
});

describe('getSeriesByAniListId', () => {
  it('returns the row when present', async () => {
    const id = await insertSeries({
      anilistId: 42,
      status: 'releasing',
      rootPath: '/media/comics/Test',
      qualityProfileId: defaultProfileId,
      titleEnglish: 'Test Series',
    });
    const row = await getSeriesByAniListId(42);
    expect(row?.id).toBe(id);
  });

  it('returns null when absent', async () => {
    const row = await getSeriesByAniListId(9999);
    expect(row).toBeNull();
  });
});
