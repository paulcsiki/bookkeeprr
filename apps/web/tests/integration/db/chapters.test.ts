import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { closeDb, getDb } from '@/server/db/client.js';
import { seedDefaultQualityProfile } from '@/server/db/quality-profiles.js';
import { insertSeries } from '@/server/db/series.js';
import { insertVolume } from '@/server/db/volumes.js';
import {
  insertChapter,
  listChaptersBySeries,
  getChapter,
  updateChapter,
  deleteChapter,
} from '@/server/db/chapters.js';

let tmp: string;
let seriesId: number;
let volumeId: number;

beforeEach(async () => {
  tmp = mkdtempSync(join(tmpdir(), 'bk-ch-'));
  process.env.BOOKKEEPRR_DB_PATH = join(tmp, 'test.db');
  migrate(getDb(), { migrationsFolder: './drizzle' });
  const qpId = await seedDefaultQualityProfile();
  seriesId = await insertSeries({
    anilistId: 1,
    status: 'releasing',
    rootPath: '/x',
    qualityProfileId: qpId,
  });
  volumeId = await insertVolume({ seriesId, number: 1 });
});
afterEach(() => {
  closeDb();
  rmSync(tmp, { recursive: true, force: true });
});

describe('chapters CRUD', () => {
  it('inserts with string number and float sort', async () => {
    const id = await insertChapter({
      seriesId,
      volumeId,
      numberText: '42.5',
      numberSort: 42.5,
      title: 'Side chapter',
    });
    const row = await getChapter(id);
    expect(row?.numberText).toBe('42.5');
    expect(row?.numberSort).toBeCloseTo(42.5);
  });

  it('lists chapters by series ordered by numberSort', async () => {
    await insertChapter({ seriesId, numberText: '2', numberSort: 2 });
    await insertChapter({ seriesId, numberText: '1', numberSort: 1 });
    await insertChapter({ seriesId, numberText: '1.5', numberSort: 1.5 });
    const all = await listChaptersBySeries(seriesId);
    expect(all.map((r) => r.numberSort)).toEqual([1, 1.5, 2]);
  });

  it('rejects duplicate (series_id, numberSort)', async () => {
    await insertChapter({ seriesId, numberText: '1', numberSort: 1 });
    await expect(insertChapter({ seriesId, numberText: '1', numberSort: 1 })).rejects.toThrow();
  });

  it('updateChapter mutates fields', async () => {
    const id = await insertChapter({ seriesId, numberText: '1', numberSort: 1 });
    await updateChapter(id, { title: 'Renamed' });
    expect((await getChapter(id))?.title).toBe('Renamed');
  });

  it('deleteChapter removes the row', async () => {
    const id = await insertChapter({ seriesId, numberText: '1', numberSort: 1 });
    await deleteChapter(id);
    expect(await getChapter(id)).toBeNull();
  });
});
