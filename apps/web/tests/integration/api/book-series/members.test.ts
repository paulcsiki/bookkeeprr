import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { seedDb, type SeedHandle } from '../../helpers/seed';
import { adminCookie } from '../../../helpers/auth';
import { expectShape } from '../../../helpers/assert-spec';
import { insertSeries } from '@/server/db/series';
import * as dal from '@/server/db/book-series';
import { BookSeriesDetailResponse } from '@/server/openapi/schemas/book-series';
import { POST as postMembers } from '@/app/api/book-series/[id]/members/route';
import { DELETE as deleteMember } from '@/app/api/book-series/[id]/members/[seriesId]/route';
import { POST as postRefresh } from '@/app/api/book-series/[id]/refresh/route';

let h: SeedHandle;
beforeEach(async () => { h = await seedDb({ skipDefaultSeries: true }); });
afterEach(() => { h.cleanup(); });

const ctx = (id: number) => ({ params: Promise.resolve({ id: String(id) }) });
const memberCtx = (id: number, seriesId: number) => ({
  params: Promise.resolve({ id: String(id), seriesId: String(seriesId) }),
});

function assignReq(bookSeriesId: number, body: unknown, cookie: string): Request {
  return new Request(`http://localhost/api/book-series/${bookSeriesId}/members`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify(body),
  });
}

function unassignReq(bookSeriesId: number, seriesId: number, cookie: string): Request {
  return new Request(
    `http://localhost/api/book-series/${bookSeriesId}/members/${seriesId}`,
    { method: 'DELETE', headers: { cookie } },
  );
}

describe('/api/book-series/[id]/members', () => {
  it('POST assign returns detail and is idempotent (upsert)', async () => {
    const bs = await dal.createBookSeries({ name: 'HDM', contentType: 'ebook', source: 'manual' });
    const s1 = await insertSeries({
      contentType: 'ebook', status: 'finished', rootPath: '/t/1',
      qualityProfileId: h.qpId, titleEnglish: 'Northern Lights',
    });
    const cookie = await adminCookie();

    // First assign
    const res1 = await postMembers(
      assignReq(bs.id, { seriesId: s1, position: 1 }, cookie),
      ctx(bs.id),
    );
    expect(res1.status).toBe(200);
    await expectShape(BookSeriesDetailResponse, res1, 'POST /api/book-series/{id}/members 200');
    const body1 = await res1.clone().json() as { memberCount: number };
    expect(body1.memberCount).toBe(1);

    // Second assign — idempotent upsert, no 409
    const res2 = await postMembers(
      assignReq(bs.id, { seriesId: s1, position: 2 }, await adminCookie()),
      ctx(bs.id),
    );
    expect(res2.status).toBe(200);
    const body2 = await res2.clone().json() as { memberCount: number };
    expect(body2.memberCount).toBe(1); // still 1 member, not 2
  });

  it('DELETE unassign removes the member link', async () => {
    const bs = await dal.createBookSeries({ name: 'HDM', contentType: 'ebook', source: 'manual' });
    const s1 = await insertSeries({
      contentType: 'ebook', status: 'finished', rootPath: '/t/2',
      qualityProfileId: h.qpId, titleEnglish: 'Northern Lights',
    });
    await dal.addMember(bs.id, s1, { position: 1, linkSource: 'manual' });

    const res = await deleteMember(
      unassignReq(bs.id, s1, await adminCookie()),
      memberCtx(bs.id, s1),
    );
    expect(res.status).toBe(200);
    const body = await res.json() as { ok: boolean };
    expect(body.ok).toBe(true);

    // Verify removed
    const detail = await dal.getBookSeries(bs.id);
    expect(detail?.members).toHaveLength(0);
  });

  it('POST → 422 on content type mismatch', async () => {
    const bs = await dal.createBookSeries({ name: 'HDM', contentType: 'ebook', source: 'manual' });
    const audioSeries = await insertSeries({
      contentType: 'audiobook', status: 'finished', rootPath: '/t/3',
      qualityProfileId: h.qpId, titleEnglish: 'Northern Lights Audio',
    });
    const res = await postMembers(
      assignReq(bs.id, { seriesId: audioSeries }, await adminCookie()),
      ctx(bs.id),
    );
    expect(res.status).toBe(422);
  });

  it('POST → 422 on unknown seriesId', async () => {
    const bs = await dal.createBookSeries({ name: 'HDM', contentType: 'ebook', source: 'manual' });
    const res = await postMembers(
      assignReq(bs.id, { seriesId: 99999 }, await adminCookie()),
      ctx(bs.id),
    );
    expect(res.status).toBe(422);
  });

  it('POST → 422 on unknown bookSeriesId', async () => {
    const s1 = await insertSeries({
      contentType: 'ebook', status: 'finished', rootPath: '/t/4',
      qualityProfileId: h.qpId, titleEnglish: 'Orphan',
    });
    const res = await postMembers(
      assignReq(99999, { seriesId: s1 }, await adminCookie()),
      ctx(99999),
    );
    expect(res.status).toBe(422);
  });
});

describe('/api/book-series/[id]/refresh', () => {
  it('POST returns 202 { ok: true } (scaffolded)', async () => {
    const bs = await dal.createBookSeries({ name: 'HDM', contentType: 'ebook', source: 'manual' });
    const res = await postRefresh(
      new Request(`http://localhost/api/book-series/${bs.id}/refresh`, {
        method: 'POST',
        headers: { cookie: await adminCookie() },
      }),
      ctx(bs.id),
    );
    expect(res.status).toBe(202);
    const body = await res.json() as { ok: boolean };
    expect(body.ok).toBe(true);
  });
});
