import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { seedDb, type SeedHandle } from '../helpers/seed';
import { seedDefaultIndexer } from '@/server/db/indexers';
import { upsertReleaseByGuid } from '@/server/db/releases';
import { insertDownload } from '@/server/db/downloads';
import { GET } from '@/app/api/series/[id]/releases/route';

let h: SeedHandle;

beforeEach(async () => {
  h = await seedDb();
  await seedDefaultIndexer();
});
afterEach(() => h.cleanup());

describe('GET /api/series/[id]/releases — downloading ownership', () => {
  it('shows ownership=downloading when a pending download exists', async () => {
    const releaseId = await upsertReleaseByGuid({
      indexerId: 1,
      indexerGuid: 'g1',
      seriesId: h.seriesId,
      title: 't',
      link: 'm:1',
      targetKind: 'volume',
      targetLow: 7,
      targetHigh: 7,
      sizeBytes: 0,
      publishedAt: new Date(),
      score: 80,
    });
    await insertDownload({ releaseId, qbtHash: 'abc', status: 'downloading' });
    const res = await GET(new Request(`http://t/api/series/${h.seriesId}/releases`), {
      params: Promise.resolve({ id: String(h.seriesId) }),
    });
    const body = await res.json();
    expect(body.releases).toHaveLength(1);
    expect(body.releases[0].ownership).toBe('downloading');
  });

  it('imported status does not mark downloading', async () => {
    const releaseId = await upsertReleaseByGuid({
      indexerId: 1,
      indexerGuid: 'g2',
      seriesId: h.seriesId,
      title: 't',
      link: 'm:2',
      targetKind: 'volume',
      targetLow: 99,
      targetHigh: 99,
      sizeBytes: 0,
      publishedAt: new Date(),
      score: 80,
    });
    await insertDownload({ releaseId, qbtHash: 'abc', status: 'imported' });
    const res = await GET(new Request(`http://t/api/series/${h.seriesId}/releases`), {
      params: Promise.resolve({ id: String(h.seriesId) }),
    });
    const body = await res.json();
    expect(body.releases[0].ownership).not.toBe('downloading');
  });
});
