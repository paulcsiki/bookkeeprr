import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { seedDb, type SeedHandle } from '../helpers/seed';
import { seedDefaultIndexer } from '@/server/db/indexers';
import { upsertReleaseByGuid, getRelease } from '@/server/db/releases';
import { deleteSeries } from '@/server/db/series';

let h: SeedHandle;
let indexerId: number;
beforeEach(async () => {
  h = await seedDb();
  indexerId = await seedDefaultIndexer();
});
afterEach(() => h.cleanup());

describe('releases ON DELETE SET NULL (M2 carry-in)', () => {
  it('keeps the release row but nulls series_id when its series is deleted', async () => {
    const releaseId = await upsertReleaseByGuid({
      indexerId,
      indexerGuid: 'g-orphan',
      seriesId: h.seriesId,
      title: 'about-to-orphan',
      link: 'magnet:?xt=foo',
      targetKind: 'volume',
      targetLow: 1,
      targetHigh: 1,
      sizeBytes: 1000,
      publishedAt: new Date(),
      score: 50,
    });
    await deleteSeries(h.seriesId);
    const row = await getRelease(releaseId);
    expect(row).not.toBeNull();
    expect(row?.seriesId).toBeNull();
    expect(row?.title).toBe('about-to-orphan');
  });
});
