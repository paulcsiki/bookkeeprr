import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { closeDb, getDb } from '@/server/db/client.js';
import { seedDefaultQualityProfile } from '@/server/db/quality-profiles.js';
import { insertSeries, deleteSeries } from '@/server/db/series.js';
import {
  insertVolume,
  listVolumesBySeries,
  getVolume,
  updateVolume,
  deleteVolume,
} from '@/server/db/volumes.js';

let tmp: string;
let seriesId: number;

beforeEach(async () => {
  tmp = mkdtempSync(join(tmpdir(), 'bk-vol-'));
  process.env.BOOKKEEPRR_DB_PATH = join(tmp, 'test.db');
  migrate(getDb(), { migrationsFolder: './drizzle' });
  const qpId = await seedDefaultQualityProfile();
  seriesId = await insertSeries({
    anilistId: 1,
    status: 'releasing',
    rootPath: '/x',
    qualityProfileId: qpId,
  });
});
afterEach(() => {
  closeDb();
  rmSync(tmp, { recursive: true, force: true });
});

describe('volumes CRUD', () => {
  it('inserts and lists per series', async () => {
    const id = await insertVolume({ seriesId, number: 1, title: 'v1' });
    const all = await listVolumesBySeries(seriesId);
    expect(all).toHaveLength(1);
    expect(all[0]?.id).toBe(id);
    expect(all[0]?.title).toBe('v1');
  });

  it('rejects duplicate (series_id, number)', async () => {
    await insertVolume({ seriesId, number: 1 });
    await expect(insertVolume({ seriesId, number: 1 })).rejects.toThrow();
  });

  it('cascades delete when series is deleted', async () => {
    await insertVolume({ seriesId, number: 1 });
    await insertVolume({ seriesId, number: 2 });
    await deleteSeries(seriesId);
    const all = await listVolumesBySeries(seriesId);
    expect(all).toHaveLength(0);
  });

  it('updateVolume changes fields', async () => {
    const id = await insertVolume({ seriesId, number: 1 });
    await updateVolume(id, { title: 'Volume 1: Beginnings' });
    const row = await getVolume(id);
    expect(row?.title).toBe('Volume 1: Beginnings');
  });

  it('deleteVolume removes the row', async () => {
    const id = await insertVolume({ seriesId, number: 1 });
    await deleteVolume(id);
    expect(await getVolume(id)).toBeNull();
  });
});
