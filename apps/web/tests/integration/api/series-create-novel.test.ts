import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { seedDb, type SeedHandle } from '../helpers/seed';
import { getSeries } from '@/server/db/series';
import { listJobsByKind } from '@/server/db/jobs';
import { POST } from '@/app/api/series/route';
import { expectShape } from '../../helpers/assert-spec';
import { SeriesCreateResponse } from '@/server/openapi/schemas/series';

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

describe('POST /api/series — light_novel branch', () => {
  it('creates an LN series with author + granularity=volume + enqueues metadata_hydrate', async () => {
    const res = await POST(
      reqBody({
        contentType: 'light_novel',
        anilistId: 21355,
        author: 'Tappei Nagatsuki',
        titleEnglish: 'Re:Zero',
        titleRomaji: 'Re:Zero kara Hajimeru Isekai Seikatsu',
        qualityProfileId: h.qpId,
        rootPath: '/media/books/Tappei Nagatsuki/Re:Zero Light Novel',
      }),
    );
    expect(res.status).toBeLessThan(400);
    await expectShape(SeriesCreateResponse, res, 'POST /api/series');
    const body = await res.json();
    const row = await getSeries(body.id);
    expect(row?.contentType).toBe('light_novel');
    expect(row?.anilistId).toBe(21355);
    expect(row?.author).toBe('Tappei Nagatsuki');
    expect(row?.granularity).toBe('volume');

    // metadata_hydrate enqueued
    const jobs = await listJobsByKind('metadata_hydrate');
    expect(jobs.length).toBeGreaterThan(0);
  });

  it('LN body with omitted author succeeds; author=null', async () => {
    const res = await POST(
      reqBody({
        contentType: 'light_novel',
        anilistId: 99999,
        titleEnglish: 'No Author LN',
        qualityProfileId: h.qpId,
        rootPath: '/media/books/Unknown/No Author LN Light Novel',
      }),
    );
    expect(res.status).toBeLessThan(400);
    const body = await res.json();
    const row = await getSeries(body.id);
    expect(row?.author).toBeNull();
  });

  it('LN body without anilistId rejected with 400', async () => {
    const res = await POST(
      reqBody({
        contentType: 'light_novel',
        author: 'Someone',
        titleEnglish: 'X',
        qualityProfileId: h.qpId,
        rootPath: '/x',
      }),
    );
    expect(res.status).toBe(400);
  });

  it('LN body accepts groupId and persists it', async () => {
    const { createGroup } = await import('@/server/db/library-groups');
    const g = await createGroup('Novels Shelf', null);
    const res = await POST(
      reqBody({
        contentType: 'light_novel',
        anilistId: 31337,
        titleEnglish: 'Grouped Novel',
        qualityProfileId: h.qpId,
        rootPath: '/x',
        groupId: g.id,
      }),
    );
    expect(res.status).toBe(201);
    const { id } = await res.json();
    const row = await getSeries(id);
    expect(row?.groupId).toBe(g.id);
  });

  it('manga branch still works (back-compat)', async () => {
    const res = await POST(
      reqBody({
        anilistId: 12345,
        qualityProfileId: h.qpId,
        status: 'releasing',
        rootPath: '/media/comics/X',
      }),
    );
    expect(res.status).toBeLessThan(400);
    const body = await res.json();
    const row = await getSeries(body.id);
    expect(row?.contentType).toBe('manga');
  });
});
