import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { closeDb, getDb } from '@/server/db/client.js';
import { seedDefaultQualityProfile } from '@/server/db/quality-profiles.js';
import { GET as listGet, POST as listPost } from '@/app/api/series/route.js';
import { getSeries, insertSeries } from '@/server/db/series.js';
import {
  GET as singleGet,
  PATCH as singlePatch,
  DELETE as singleDel,
} from '@/app/api/series/[id]/route.js';
import { enqueueJob } from '@/server/db/jobs.js';
import { expectShape } from '../../helpers/assert-spec';
import {
  SeriesCreateResponse,
  SeriesDetailResponse,
  SeriesListResponse,
  SeriesRow,
  SeriesRowWithGroupPath,
} from '@/server/openapi/schemas/series';
import { ErrorResponse } from '@/server/openapi/schemas/common';
import { createGroup } from '@/server/db/library-groups';

let tmp: string;
let qpId: number;

beforeEach(async () => {
  tmp = mkdtempSync(join(tmpdir(), 'bk-api-'));
  process.env.BOOKKEEPRR_DB_PATH = join(tmp, 'test.db');
  migrate(getDb(), { migrationsFolder: './drizzle' });
  qpId = await seedDefaultQualityProfile();
});
afterEach(() => {
  closeDb();
  rmSync(tmp, { recursive: true, force: true });
});

function reqJson(method: string, body?: unknown): Request {
  return new Request('http://localhost/api/series', {
    method,
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

function reqIdJson(id: number, method: string, body?: unknown): NextRequest {
  // NextRequest (not bare Request) so the GET handler's requireUserId() can read
  // cookies. Unauthenticated here → userId null → empty read states.
  return new NextRequest(`http://localhost/api/series/${id}`, {
    method,
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

describe('/api/series', () => {
  it('GET returns empty list initially', async () => {
    const res = await listGet(new NextRequest('http://localhost/api/series'));
    expect(res.status).toBe(200);
    await expectShape(SeriesListResponse, res, 'GET /api/series');
    const body = (await res.json()) as { rows: unknown[]; total: number };
    expect(body.rows).toEqual([]);
    expect(body.total).toBe(0);
  });

  it('POST creates and returns 201', async () => {
    const res = await listPost(
      reqJson('POST', {
        anilistId: 1,
        status: 'releasing',
        rootPath: '/media/comics/Test',
        qualityProfileId: qpId,
        titleEnglish: 'Test',
      }),
    );
    expect(res.status).toBe(201);
    await expectShape(SeriesCreateResponse, res, 'POST /api/series');
    const body = await res.json();
    expect(body.id).toBeGreaterThan(0);
    expect(body.titleEnglish).toBe('Test');
  });

  it('POST 400 on invalid payload', async () => {
    const res = await listPost(reqJson('POST', { anilistId: 'nope' }));
    expect(res.status).toBe(400);
    await expectShape(ErrorResponse, res, 'POST /api/series');
  });

  it('GET /[id] returns the series', async () => {
    const create = await listPost(
      reqJson('POST', {
        anilistId: 2,
        status: 'releasing',
        rootPath: '/x',
        qualityProfileId: qpId,
      }),
    );
    const { id } = await create.json();
    const res = await singleGet(reqIdJson(id, 'GET'), {
      params: Promise.resolve({ id: String(id) }),
    });
    expect(res.status).toBe(200);
    await expectShape(SeriesDetailResponse, res, 'GET /api/series/{id}');
    expect((await res.json()).id).toBe(id);
  });

  it('GET /[id] returns each volume cover proxied through /api/img', async () => {
    const create = await listPost(
      reqJson('POST', { anilistId: 3, status: 'releasing', rootPath: '/x', qualityProfileId: qpId }),
    );
    const { id } = await create.json();
    const { insertVolume } = await import('@/server/db/volumes.js');
    const cover = 'https://uploads.mangadex.org/covers/xyz/v1.jpg';
    await insertVolume({
      seriesId: id,
      number: 1,
      title: 'Volume 1',
      releaseDate: new Date('2005-04-01T00:00:00Z'),
      metadataJson: JSON.stringify({ coverUrl: cover }),
    });
    const res = await singleGet(reqIdJson(id, 'GET'), {
      params: Promise.resolve({ id: String(id) }),
    });
    const body = await res.json();
    const vol = body.volumesList[0];
    expect(vol.coverUrl).toBe(`/api/img?u=${encodeURIComponent(cover)}`);
    expect(vol.publishedAt).toBe('2005-04-01T00:00:00.000Z');
    // No library file yet -> not owned, no readable file id.
    expect(vol.status).toBe('wanted');
    expect(vol.libraryFileId).toBeNull();
  });

  it('GET /[id] returns 404 for missing id', async () => {
    const res = await singleGet(reqIdJson(9999, 'GET'), {
      params: Promise.resolve({ id: '9999' }),
    });
    expect(res.status).toBe(404);
    await expectShape(ErrorResponse, res, 'GET /api/series/{id}');
  });

  it('PATCH /[id] mutates fields', async () => {
    const create = await listPost(
      reqJson('POST', {
        anilistId: 3,
        status: 'releasing',
        rootPath: '/x',
        qualityProfileId: qpId,
      }),
    );
    const { id } = await create.json();
    const res = await singlePatch(reqIdJson(id, 'PATCH', { monitoring: 'missing' }), {
      params: Promise.resolve({ id: String(id) }),
    });
    expect(res.status).toBe(200);
    await expectShape(SeriesRow, res, 'PATCH /api/series/{id}');
    expect((await res.json()).monitoring).toBe('missing');
  });

  it('PATCH rejects immutable fields', async () => {
    const create = await listPost(
      reqJson('POST', {
        anilistId: 4,
        status: 'releasing',
        rootPath: '/x',
        qualityProfileId: qpId,
      }),
    );
    const { id } = await create.json();
    const res = await singlePatch(reqIdJson(id, 'PATCH', { anilistId: 999 }), {
      params: Promise.resolve({ id: String(id) }),
    });
    expect(res.status).toBe(400);
    await expectShape(ErrorResponse, res, 'PATCH /api/series/{id}');
  });

  it('POST 409 on duplicate anilistId', async () => {
    await listPost(
      reqJson('POST', {
        anilistId: 42,
        status: 'releasing',
        rootPath: '/x',
        qualityProfileId: qpId,
      }),
    );
    const res = await listPost(
      reqJson('POST', {
        anilistId: 42,
        status: 'releasing',
        rootPath: '/y',
        qualityProfileId: qpId,
      }),
    );
    expect(res.status).toBe(409);
    await expectShape(ErrorResponse, res, 'POST /api/series');
  });

  it('POST 422 on bad qualityProfileId', async () => {
    const res = await listPost(
      reqJson('POST', {
        anilistId: 43,
        status: 'releasing',
        rootPath: '/x',
        qualityProfileId: 99999,
      }),
    );
    expect(res.status).toBe(422);
    await expectShape(ErrorResponse, res, 'POST /api/series');
  });

  it('DELETE /[id] removes the series', async () => {
    const create = await listPost(
      reqJson('POST', {
        anilistId: 5,
        status: 'releasing',
        rootPath: '/x',
        qualityProfileId: qpId,
      }),
    );
    const { id } = await create.json();
    const res = await singleDel(reqIdJson(id, 'DELETE'), {
      params: Promise.resolve({ id: String(id) }),
    });
    expect(res.status).toBe(204);
    const after = await singleGet(reqIdJson(id, 'GET'), {
      params: Promise.resolve({ id: String(id) }),
    });
    expect(after.status).toBe(404);
  });

  it('GET /[id] returns hydrating:false when no active job', async () => {
    // Insert directly (no POST route) so no hydrate jobs are enqueued.
    const id = await insertSeries({
      contentType: 'manga',
      anilistId: 600,
      status: 'releasing',
      rootPath: '/x',
      qualityProfileId: qpId,
    });
    const res = await singleGet(reqIdJson(id, 'GET'), {
      params: Promise.resolve({ id: String(id) }),
    });
    expect(res.status).toBe(200);
    await expectShape(SeriesDetailResponse, res, 'GET /api/series/{id}');
    const body = await res.json();
    expect(body.hydrating).toBe(false);
  });

  it('GET /[id] returns hydrating:true when a pending metadata-hydrate job exists', async () => {
    const id = await insertSeries({
      contentType: 'manga',
      anilistId: 700,
      status: 'releasing',
      rootPath: '/x',
      qualityProfileId: qpId,
    });
    await enqueueJob('metadata_hydrate', { seriesId: id });
    const res = await singleGet(reqIdJson(id, 'GET'), {
      params: Promise.resolve({ id: String(id) }),
    });
    expect(res.status).toBe(200);
    await expectShape(SeriesDetailResponse, res, 'GET /api/series/{id}');
    const body = await res.json();
    expect(body.hydrating).toBe(true);
  });

  it('GET /[id] returns hydrating:false for a job belonging to a different series', async () => {
    const id1 = await insertSeries({
      contentType: 'manga',
      anilistId: 800,
      status: 'releasing',
      rootPath: '/x',
      qualityProfileId: qpId,
    });
    const id2 = await insertSeries({
      contentType: 'manga',
      anilistId: 900,
      status: 'releasing',
      rootPath: '/y',
      qualityProfileId: qpId,
    });
    // Enqueue a job for id2 only; id1 should still report hydrating:false.
    await enqueueJob('metadata_hydrate', { seriesId: id2 });
    const res = await singleGet(reqIdJson(id1, 'GET'), {
      params: Promise.resolve({ id: String(id1) }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.hydrating).toBe(false);
  });
});

describe('/api/series — library groups', () => {
  /** Seed 'Engineering / Architecture' and return the leaf (Architecture) id. */
  async function seedNestedGroup(): Promise<{ rootId: number; leafId: number }> {
    const root = await createGroup('Engineering', null);
    const leaf = await createGroup('Architecture', root.id);
    return { rootId: root.id, leafId: leaf.id };
  }

  it('POST with groupId persists it and returns groupId + groupPath', async () => {
    const { leafId } = await seedNestedGroup();
    const res = await listPost(
      reqJson('POST', {
        anilistId: 101,
        status: 'releasing',
        rootPath: '/x',
        qualityProfileId: qpId,
        titleEnglish: 'Grouped',
        groupId: leafId,
      }),
    );
    expect(res.status).toBe(201);
    const body = await expectShape(SeriesCreateResponse, res, 'POST /api/series');
    expect(body).toMatchObject({ groupId: leafId, groupPath: 'Engineering / Architecture' });
    const row = await getSeries((body as { id: number }).id);
    expect(row?.groupId).toBe(leafId);
  });

  it('POST with unknown groupId → 422', async () => {
    const res = await listPost(
      reqJson('POST', {
        anilistId: 102,
        status: 'releasing',
        rootPath: '/x',
        qualityProfileId: qpId,
        groupId: 9999,
      }),
    );
    expect(res.status).toBe(422);
    await expectShape(ErrorResponse, res, 'POST /api/series');
  });

  it('PATCH {groupId} moves the series into the group', async () => {
    const { leafId } = await seedNestedGroup();
    const create = await listPost(
      reqJson('POST', { anilistId: 103, status: 'releasing', rootPath: '/x', qualityProfileId: qpId }),
    );
    const { id } = await create.json();
    const res = await singlePatch(reqIdJson(id, 'PATCH', { groupId: leafId }), {
      params: Promise.resolve({ id: String(id) }),
    });
    expect(res.status).toBe(200);
    const body = await expectShape(SeriesRowWithGroupPath, res, 'PATCH /api/series/{id}');
    expect(body.groupId).toBe(leafId);
    expect(body.groupPath).toBe('Engineering / Architecture');
    const row = await getSeries(id);
    expect(row?.groupId).toBe(leafId);
  });

  it('PATCH {groupId: null} ungroups the series', async () => {
    const { leafId } = await seedNestedGroup();
    const create = await listPost(
      reqJson('POST', {
        anilistId: 104,
        status: 'releasing',
        rootPath: '/x',
        qualityProfileId: qpId,
        groupId: leafId,
      }),
    );
    const { id } = await create.json();
    const res = await singlePatch(reqIdJson(id, 'PATCH', { groupId: null }), {
      params: Promise.resolve({ id: String(id) }),
    });
    expect(res.status).toBe(200);
    const body = await expectShape(SeriesRowWithGroupPath, res, 'PATCH /api/series/{id}');
    expect(body.groupId).toBeNull();
    expect(body.groupPath).toBe('');
    const row = await getSeries(id);
    expect(row?.groupId).toBeNull();
  });

  it('PATCH with unknown groupId → 422 (no fields applied)', async () => {
    const create = await listPost(
      reqJson('POST', { anilistId: 105, status: 'releasing', rootPath: '/x', qualityProfileId: qpId }),
    );
    const { id } = await create.json();
    const res = await singlePatch(reqIdJson(id, 'PATCH', { groupId: 9999 }), {
      params: Promise.resolve({ id: String(id) }),
    });
    expect(res.status).toBe(422);
    await expectShape(ErrorResponse, res, 'PATCH /api/series/{id}');
    const row = await getSeries(id);
    expect(row?.groupId).toBeNull();
  });

  it('GET list rows carry groupId + groupPath (grouped and ungrouped)', async () => {
    const { leafId } = await seedNestedGroup();
    const grouped = await listPost(
      reqJson('POST', {
        anilistId: 106,
        status: 'releasing',
        rootPath: '/x',
        qualityProfileId: qpId,
        titleEnglish: 'In Group',
        groupId: leafId,
      }),
    );
    const { id: groupedId } = await grouped.json();
    const ungrouped = await listPost(
      reqJson('POST', {
        anilistId: 107,
        status: 'releasing',
        rootPath: '/y',
        qualityProfileId: qpId,
        titleEnglish: 'No Group',
      }),
    );
    const { id: ungroupedId } = await ungrouped.json();
    const res = await listGet(new NextRequest('http://localhost/api/series'));
    expect(res.status).toBe(200);
    const body = await expectShape(SeriesListResponse, res, 'GET /api/series');
    const inGroup = body.rows.find((r) => r.id === groupedId);
    const noGroup = body.rows.find((r) => r.id === ungroupedId);
    expect(inGroup).toMatchObject({ groupId: leafId, groupPath: 'Engineering / Architecture' });
    expect(noGroup).toMatchObject({ groupId: null, groupPath: '' });
  });

  it('GET detail carries groupId + groupPath', async () => {
    const { leafId } = await seedNestedGroup();
    const create = await listPost(
      reqJson('POST', {
        anilistId: 108,
        status: 'releasing',
        rootPath: '/x',
        qualityProfileId: qpId,
        groupId: leafId,
      }),
    );
    const { id } = await create.json();
    const res = await singleGet(reqIdJson(id, 'GET'), {
      params: Promise.resolve({ id: String(id) }),
    });
    expect(res.status).toBe(200);
    const body = await expectShape(SeriesDetailResponse, res, 'GET /api/series/{id}');
    expect(body.groupId).toBe(leafId);
    expect(body.groupPath).toBe('Engineering / Architecture');
  });
});

describe('POST /api/series — content-type', () => {
  it('omitted contentType defaults to manga', async () => {
    const res = await listPost(
      reqJson('POST', {
        anilistId: 12345,
        qualityProfileId: qpId,
        status: 'releasing',
        rootPath: '/x',
      }),
    );
    expect(res.status).toBeLessThan(400);
    const body = await res.json();
    const row = await getSeries(body.id);
    expect(row?.contentType).toBe('manga');
  });

  it('accepts contentType=ebook single book via new ebook arm', async () => {
    const res = await listPost(
      reqJson('POST', {
        contentType: 'ebook',
        flow: 'single',
        olid: 'OL99999W',
        title: 'X',
        author: 'Author',
        qualityProfileId: qpId,
      }),
    );
    expect(res.status).toBeLessThan(400);
  });

  it('rejects unknown contentType with 400', async () => {
    const res = await listPost(
      reqJson('POST', {
        contentType: 'novel',
        anilistId: null,
        qualityProfileId: qpId,
        status: 'releasing',
        rootPath: '/x',
      }),
    );
    expect(res.status).toBe(400);
  });
});
