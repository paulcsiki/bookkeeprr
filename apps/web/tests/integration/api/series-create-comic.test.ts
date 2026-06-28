import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { seedDb, type SeedHandle } from '../helpers/seed';
import { getSeries } from '@/server/db/series';
import { POST } from '@/app/api/series/route';

let h: SeedHandle;
beforeEach(async () => {
  h = await seedDb();
});
afterEach(() => h.cleanup());

function reqBody(body: object): Request {
  return new Request('http://t/api/series', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/series — comic branch (discriminated union)', () => {
  it('creates a comic series + enqueues comicvine_hydrate', async () => {
    const res = await POST(
      reqBody({
        contentType: 'comic',
        comicvineId: 18847,
        publisher: 'DC Comics',
        startYear: 1986,
        titleEnglish: 'Watchmen',
        qualityProfileId: h.qpId,
        rootPath: '/media/comics/DC Comics/Watchmen (1986)',
      }),
    );
    expect(res.status).toBeLessThan(400);
    const body = await res.json();
    const row = await getSeries(body.id);
    expect(row?.contentType).toBe('comic');
    expect(row?.comicvineId).toBe(18847);
    expect(row?.publisher).toBe('DC Comics');
    expect(row?.startYear).toBe(1986);
    expect(row?.granularity).toBe('chapter');
    expect(row?.status).toBe('releasing'); // default
  });

  it('rejects comic body without comicvineId', async () => {
    const res = await POST(
      reqBody({
        contentType: 'comic',
        titleEnglish: 'X',
        qualityProfileId: h.qpId,
        rootPath: '/x',
      }),
    );
    expect(res.status).toBe(400);
  });

  it('manga branch still works (back-compat)', async () => {
    const res = await POST(
      reqBody({
        anilistId: 12345,
        qualityProfileId: h.qpId,
        status: 'releasing',
        rootPath: '/x',
      }),
    );
    expect(res.status).toBeLessThan(400);
    const body = await res.json();
    const row = await getSeries(body.id);
    expect(row?.contentType).toBe('manga');
  });

  it('duplicate comicvineId rejected with 409', async () => {
    await POST(
      reqBody({
        contentType: 'comic',
        comicvineId: 7777,
        publisher: 'A',
        startYear: 2000,
        titleEnglish: 'X',
        qualityProfileId: h.qpId,
        rootPath: '/x',
      }),
    );
    const res = await POST(
      reqBody({
        contentType: 'comic',
        comicvineId: 7777,
        publisher: 'A',
        startYear: 2000,
        titleEnglish: 'Y',
        qualityProfileId: h.qpId,
        rootPath: '/y',
      }),
    );
    expect(res.status).toBe(409);
  });

  it('comic body accepts groupId and persists it', async () => {
    const { createGroup } = await import('@/server/db/library-groups');
    const g = await createGroup('Comics Shelf', null);
    const res = await POST(
      reqBody({
        contentType: 'comic',
        comicvineId: 8888,
        titleEnglish: 'Grouped Comic',
        qualityProfileId: h.qpId,
        rootPath: '/x',
        groupId: g.id,
      }),
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.groupId).toBe(g.id);
    expect(body.groupPath).toBe('Comics Shelf');
    const row = await getSeries(body.id);
    expect(row?.groupId).toBe(g.id);
  });
});
