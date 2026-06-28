import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { seedDb, type SeedHandle } from '../helpers/seed';
import { seedDefaultIndexer } from '@/server/db/indexers';
import { upsertReleaseByGuid } from '@/server/db/releases';
import { insertLibraryFile } from '@/server/db/library-files';
import { GET } from '@/app/api/series/[id]/releases/route';
import { expectShape } from '../../helpers/assert-spec';
import { SeriesReleasesResponse } from '@/server/openapi/schemas/series';
import { ErrorResponse } from '@/server/openapi/schemas/common';

let h: SeedHandle;
let indexerId: number;

beforeEach(async () => {
  h = await seedDb();
  indexerId = await seedDefaultIndexer();
});
afterEach(() => h.cleanup());

function req(seriesId: number): Parameters<typeof GET>[0] {
  return new Request(`http://test/api/series/${seriesId}/releases`) as Parameters<typeof GET>[0];
}

describe('GET /api/series/[id]/releases', () => {
  it('returns scored releases ordered by score desc', async () => {
    await upsertReleaseByGuid({
      indexerId,
      indexerGuid: 'a',
      seriesId: h.seriesId,
      title: 'low',
      link: 'm:1',
      targetKind: 'volume',
      targetLow: 1,
      targetHigh: 1,
      sizeBytes: 1000,
      publishedAt: new Date(),
      score: 10,
    });
    await upsertReleaseByGuid({
      indexerId,
      indexerGuid: 'b',
      seriesId: h.seriesId,
      title: 'high',
      link: 'm:2',
      targetKind: 'volume',
      targetLow: 2,
      targetHigh: 2,
      sizeBytes: 2000,
      publishedAt: new Date(),
      score: 100,
    });
    const res = await GET(req(h.seriesId), { params: Promise.resolve({ id: String(h.seriesId) }) });
    await expectShape(SeriesReleasesResponse, res, 'GET /api/series/{id}/releases');
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.releases).toHaveLength(2);
    expect(body.releases[0].title).toBe('high');
    // Each release is labelled with its source indexer (name + kind) for the UI.
    expect(body.releases[0].indexerName).toBe('nyaa.si');
    expect(body.releases[0].indexerKind).toBe('nyaa');
  });

  it('marks owned volumes as in-library', async () => {
    await upsertReleaseByGuid({
      indexerId,
      indexerGuid: 'a',
      seriesId: h.seriesId,
      title: 'owned-vol-1',
      link: 'm:1',
      targetKind: 'volume',
      targetLow: 1,
      targetHigh: 1,
      sizeBytes: 1000,
      publishedAt: new Date(),
      score: 50,
    });
    await insertLibraryFile({
      seriesId: h.seriesId,
      volumeId: h.volumeId,
      path: '/media/comics/Test Series/v01.cbz',
      sizeBytes: 100,
    });
    const res = await GET(req(h.seriesId), { params: Promise.resolve({ id: String(h.seriesId) }) });
    const body = await res.json();
    expect(body.releases[0].ownership).toBe('in-library');
  });

  it('returns 404 on missing series', async () => {
    const res = await GET(req(999), { params: Promise.resolve({ id: '999' }) });
    expect(res.status).toBe(404);
    await expectShape(ErrorResponse, res, 'GET /api/series/{id}/releases');
  });

  it('rejects non-digit ids with 400', async () => {
    const res = await GET(new Request('http://test/api/series/foo/releases'), {
      params: Promise.resolve({ id: 'foo' }),
    });
    expect(res.status).toBe(400);
    await expectShape(ErrorResponse, res, 'GET /api/series/{id}/releases');
  });
});
