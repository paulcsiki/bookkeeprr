import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { seedDb, type SeedHandle } from '../helpers/seed';
import { seedDefaultIndexer } from '@/server/db/indexers';
import { upsertReleaseByGuid } from '@/server/db/releases';
import { insertDownload } from '@/server/db/downloads';
import { GET } from '@/app/api/downloads/route';
import { expectShape } from '../../helpers/assert-spec';
import { DownloadsListResponse } from '@/server/openapi/schemas/downloads';

let h: SeedHandle;
beforeEach(async () => {
  h = await seedDb();
  await seedDefaultIndexer();
});
afterEach(() => h.cleanup());

describe('GET /api/downloads', () => {
  it('returns rows sorted by addedAt desc with joined release+series', async () => {
    const r1 = await upsertReleaseByGuid({
      indexerId: 1,
      indexerGuid: 'g1',
      seriesId: h.seriesId,
      title: 'A',
      link: 'm:1',
      targetKind: 'volume',
      targetLow: 1,
      targetHigh: 1,
      sizeBytes: 0,
      publishedAt: new Date(),
    });
    const r2 = await upsertReleaseByGuid({
      indexerId: 1,
      indexerGuid: 'g2',
      seriesId: h.seriesId,
      title: 'B',
      link: 'm:2',
      targetKind: 'volume',
      targetLow: 2,
      targetHigh: 2,
      sizeBytes: 0,
      publishedAt: new Date(),
    });
    await insertDownload({ releaseId: r1, qbtHash: 'h1' });
    await new Promise((res) => setTimeout(res, 5));
    await insertDownload({ releaseId: r2, qbtHash: 'h2' });
    const res = await GET();
    await expectShape(DownloadsListResponse, res, 'GET /api/downloads');
    const body = await res.json();
    expect(body.downloads).toHaveLength(2);
    expect(body.downloads[0].release?.title).toBe('B'); // newest first
    expect(body.downloads[0].series?.title).toBe('Test Series');
    // Seeded series has no cover -> coverUrl present but null.
    expect(body.downloads[0].series?.coverUrl).toBeNull();
  });

  it('proxies an allowlisted series cover through /api/img', async () => {
    const { updateSeries } = await import('@/server/db/series');
    await updateSeries(h.seriesId, {
      coverUrl: 'https://uploads.mangadex.org/covers/abc/def.jpg',
    });
    const releaseId = await upsertReleaseByGuid({
      indexerId: 1,
      indexerGuid: 'g-cover',
      seriesId: h.seriesId,
      title: 'C',
      link: 'm:3',
      targetKind: 'volume',
      targetLow: 1,
      targetHigh: 1,
      sizeBytes: 0,
      publishedAt: new Date(),
    });
    await insertDownload({ releaseId, qbtHash: 'h-cover' });
    const res = await GET();
    const body = await res.json();
    expect(body.downloads[0].series?.coverUrl).toContain('/api/img?u=');
    expect(body.downloads[0].series?.coverUrl).toContain(
      encodeURIComponent('https://uploads.mangadex.org/covers/abc/def.jpg'),
    );
  });

  it('includes contentType in the series object', async () => {
    // The seeded series defaults to contentType='manga' (seedDb inserts without
    // contentType, which defaults to 'manga' in the schema).
    const releaseId = await upsertReleaseByGuid({
      indexerId: 1,
      indexerGuid: 'g-ct',
      seriesId: h.seriesId,
      title: 'ContentType Test',
      link: 'm:ct',
      targetKind: 'volume',
      targetLow: 1,
      targetHigh: 1,
      sizeBytes: 0,
      publishedAt: new Date(),
    });
    await insertDownload({ releaseId, qbtHash: 'h-ct' });
    const res = await GET();
    const body = await res.json();
    expect(body.downloads[0].series?.contentType).toBe('manga');
  });

  it('returns null series when release orphaned', async () => {
    const releaseId = await upsertReleaseByGuid({
      indexerId: 1,
      indexerGuid: 'orphan',
      seriesId: h.seriesId,
      title: 'orphan-it',
      link: 'm:1',
      targetKind: 'volume',
      targetLow: 1,
      targetHigh: 1,
      sizeBytes: 0,
      publishedAt: new Date(),
    });
    await insertDownload({ releaseId, qbtHash: 'h-orphan' });
    const { deleteSeries } = await import('@/server/db/series');
    await deleteSeries(h.seriesId); // cascades release.seriesId → null
    const res = await GET();
    const body = await res.json();
    expect(body.downloads).toHaveLength(1);
    expect(body.downloads[0].series).toBeNull();
  });
});
