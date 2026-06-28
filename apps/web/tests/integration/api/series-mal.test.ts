import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { seedDb, type SeedHandle } from '../helpers/seed';
import { getSeries } from '@/server/db/series';
import { listJobsByKind } from '@/server/db/jobs';
import { POST } from '@/app/api/series/route';

let h: SeedHandle;
beforeEach(async () => {
  h = await seedDb({ skipDefaultSeries: true });
});
afterEach(() => h.cleanup());

function reqBody(body: object): Request {
  return new Request('http://t/api/series', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/series — MyAnimeList manga source', () => {
  it('MAL-only add stores mal_id, enqueues mal_hydrate, not metadata_hydrate', async () => {
    const res = await POST(
      reqBody({
        contentType: 'manga',
        malId: 11061,
        titleEnglish: 'Hunter x Hunter',
        status: 'releasing',
        rootPath: '/media/comics/Hunter x Hunter',
        qualityProfileId: h.qpId,
      }),
    );
    expect(res.status).toBe(201);
    const row = await res.json();
    const stored = await getSeries(row.id);
    expect(stored?.malId).toBe(11061);
    expect(stored?.anilistId).toBeNull();

    const malJobs = await listJobsByKind('mal_hydrate');
    expect(malJobs).toHaveLength(1);
    expect(JSON.parse(malJobs[0]!.payloadJson)).toEqual({ seriesId: row.id });

    const metaJobs = await listJobsByKind('metadata_hydrate');
    expect(metaJobs).toHaveLength(0);
  });

  it('cross-linked add stores both ids, enqueues metadata_hydrate (not mal_hydrate)', async () => {
    const res = await POST(
      reqBody({
        contentType: 'manga',
        anilistId: 11061,
        malId: 11061,
        titleEnglish: 'Cross Linked Manga',
        status: 'releasing',
        rootPath: '/media/comics/Cross Linked Manga',
        qualityProfileId: h.qpId,
      }),
    );
    expect(res.status).toBe(201);
    const row = await res.json();
    const stored = await getSeries(row.id);
    expect(stored?.anilistId).toBe(11061);
    expect(stored?.malId).toBe(11061);

    const metaJobs = await listJobsByKind('metadata_hydrate');
    expect(metaJobs).toHaveLength(1);
    expect(JSON.parse(metaJobs[0]!.payloadJson)).toEqual({ seriesId: row.id });

    const malJobs = await listJobsByKind('mal_hydrate');
    expect(malJobs).toHaveLength(0);
  });

  it('returns 409 when adding a manga whose mal_id already exists', async () => {
    const first = await POST(
      reqBody({
        contentType: 'manga',
        malId: 99999,
        titleEnglish: 'Dup Source',
        status: 'releasing',
        rootPath: '/media/comics/Dup Source',
        qualityProfileId: h.qpId,
      }),
    );
    expect(first.status).toBe(201);

    const second = await POST(
      reqBody({
        contentType: 'manga',
        malId: 99999,
        titleEnglish: 'Dup Source 2',
        status: 'releasing',
        rootPath: '/media/comics/Dup Source 2',
        qualityProfileId: h.qpId,
      }),
    );
    expect(second.status).toBe(409);
  });
});
