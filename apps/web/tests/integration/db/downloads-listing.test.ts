import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { seedDb, type SeedHandle } from '../helpers/seed';
import { seedDefaultIndexer } from '@/server/db/indexers';
import { upsertReleaseByGuid } from '@/server/db/releases';
import {
  insertDownload,
  listPendingDownloads,
  listDownloadsByRelease,
} from '@/server/db/downloads';

let h: SeedHandle;
let indexerId: number;

beforeEach(async () => {
  h = await seedDb();
  indexerId = await seedDefaultIndexer();
});
afterEach(() => h.cleanup());

describe('downloads listing helpers', () => {
  it('listPendingDownloads filters to non-imported, non-failed', async () => {
    const releaseId = await upsertReleaseByGuid({
      indexerId,
      indexerGuid: 'g1',
      seriesId: h.seriesId,
      title: 't',
      link: 'm:1',
      targetKind: 'volume',
      targetLow: 1,
      targetHigh: 1,
      sizeBytes: 0,
      publishedAt: new Date(),
    });
    await insertDownload({ releaseId, qbtHash: 'h1', status: 'queued' });
    await insertDownload({ releaseId, qbtHash: 'h2', status: 'imported' });
    await insertDownload({ releaseId, qbtHash: 'h3', status: 'failed' });
    const pending = await listPendingDownloads();
    expect(pending.map((d) => d.qbtHash).sort()).toEqual(['h1']);
  });

  it('listDownloadsByRelease returns all for that release', async () => {
    const releaseId = await upsertReleaseByGuid({
      indexerId,
      indexerGuid: 'g1',
      seriesId: h.seriesId,
      title: 't',
      link: 'm:1',
      targetKind: 'volume',
      targetLow: 1,
      targetHigh: 1,
      sizeBytes: 0,
      publishedAt: new Date(),
    });
    await insertDownload({ releaseId, qbtHash: 'h1' });
    await insertDownload({ releaseId, qbtHash: 'h2' });
    const list = await listDownloadsByRelease(releaseId);
    expect(list).toHaveLength(2);
  });
});
