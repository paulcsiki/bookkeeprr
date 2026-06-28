import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { seedDb, type SeedHandle } from '../helpers/seed';
import {
  insertScanMatch,
  getScanMatchByPath,
  updateScanMatchByPath,
  listPendingByDirectoryPrefix,
} from '@/server/db/scan-matches';

let h: SeedHandle;
beforeEach(async () => {
  h = await seedDb();
});
afterEach(() => h.cleanup());

describe('scan-matches DAL', () => {
  it('getScanMatchByPath returns the row, or null', async () => {
    const id = await insertScanMatch({ filePath: '/media/comics/A/A v01.cbz' });
    const row = await getScanMatchByPath('/media/comics/A/A v01.cbz');
    expect(row?.id).toBe(id);
    const miss = await getScanMatchByPath('/media/comics/A/missing.cbz');
    expect(miss).toBeNull();
  });

  it('updateScanMatchByPath patches by path', async () => {
    await insertScanMatch({ filePath: '/media/comics/A/A v01.cbz' });
    await updateScanMatchByPath('/media/comics/A/A v01.cbz', { confidence: 0.95 });
    const row = await getScanMatchByPath('/media/comics/A/A v01.cbz');
    expect(row?.confidence).toBe(0.95);
  });

  it('listPendingByDirectoryPrefix returns only pending rows in that directory', async () => {
    await insertScanMatch({ filePath: '/media/comics/A/file1.cbz' });
    await insertScanMatch({ filePath: '/media/comics/A/file2.cbz' });
    await insertScanMatch({ filePath: '/media/comics/B/file1.cbz' });
    const aId = (await getScanMatchByPath('/media/comics/A/file1.cbz'))!.id;
    await updateScanMatchByPath('/media/comics/A/file1.cbz', { status: 'confirmed' });
    void aId;
    const pending = await listPendingByDirectoryPrefix('/media/comics/A');
    expect(pending.map((r) => r.filePath).sort()).toEqual(['/media/comics/A/file2.cbz']);
  });

  it('listPendingByDirectoryPrefix treats % and _ literally, not as wildcards', async () => {
    await insertScanMatch({ filePath: '/media/comics/100% Scanlations/file1.cbz' });
    await insertScanMatch({ filePath: '/media/comics/100A Scanlations/file2.cbz' });
    await insertScanMatch({ filePath: '/media/comics/100% Scanlations/file3.cbz' });
    const pending = await listPendingByDirectoryPrefix('/media/comics/100% Scanlations');
    expect(pending.map((r) => r.filePath).sort()).toEqual([
      '/media/comics/100% Scanlations/file1.cbz',
      '/media/comics/100% Scanlations/file3.cbz',
    ]);
  });
});
