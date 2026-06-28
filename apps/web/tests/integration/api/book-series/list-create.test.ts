import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { seedDb, type SeedHandle } from '../../helpers/seed';
import { adminCookie } from '../../../helpers/auth';
import { expectShape } from '../../../helpers/assert-spec';
import { BookSeriesListResponse, BookSeriesSummaryResponse } from '@/server/openapi/schemas/book-series';
import { GET, POST } from '@/app/api/book-series/route';
import { insertSeries } from '@/server/db/series';
import * as dal from '@/server/db/book-series';

let h: SeedHandle;
beforeEach(async () => { h = await seedDb({ skipDefaultSeries: true }); });
afterEach(() => { h.cleanup(); });

function post(body: unknown, cookie: string | null): Request {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (cookie) headers.cookie = cookie;
  return new Request('http://localhost/api/book-series', { method: 'POST', headers, body: JSON.stringify(body) });
}

describe('GET/POST /api/book-series', () => {
  it('creates a book series and lists it', async () => {
    const res = await POST(post({ name: 'His Dark Materials', contentType: 'ebook' }, await adminCookie()));
    expect(res.status).toBe(201);
    const created = await res.json() as { id: number; memberCount: number };
    expect(created.memberCount).toBe(0);
    await expectShape(BookSeriesSummaryResponse, new Response(JSON.stringify(created)), 'POST /api/book-series 201');

    const listRes = await GET(new Request('http://localhost/api/book-series'));
    await expectShape(BookSeriesListResponse, listRes, 'GET /api/book-series 200');
    const list = await listRes.clone().json() as { bookSeries: unknown[] };
    expect(list.bookSeries).toHaveLength(1);
  });

  it('filters by contentType', async () => {
    await POST(post({ name: 'A', contentType: 'ebook' }, await adminCookie()));
    await POST(post({ name: 'B', contentType: 'audiobook' }, await adminCookie()));
    const res = await GET(new Request('http://localhost/api/book-series?contentType=audiobook'));
    const body = await res.json() as { bookSeries: Array<{ name: string }> };
    expect(body.bookSeries.map((b) => b.name)).toEqual(['B']);
  });

  it('rejects an invalid contentType in the body with 400', async () => {
    const res = await POST(post({ name: 'X', contentType: 'manga' }, await adminCookie()));
    expect(res.status).toBe(400);
  });
});

describe('GET /api/book-series — coverUrl fallback', () => {
  it('falls back to first member cover when saga coverUrl is null', async () => {
    // saga has no cover; member series has a cover — list should return member cover
    const memberSeriesId = await insertSeries({
      contentType: 'ebook', status: 'finished', rootPath: '/t/member1',
      qualityProfileId: h.qpId, titleEnglish: 'Member With Cover',
      coverUrl: 'https://example.com/cover.jpg',
    });
    const bs = await dal.createBookSeries({
      name: 'Saga No Cover', contentType: 'ebook', source: 'manual', coverUrl: null,
    });
    await dal.addMember(bs.id, memberSeriesId, { position: 1, linkSource: 'manual' });

    const res = await GET(new Request('http://localhost/api/book-series'));
    const body = await res.json() as { bookSeries: Array<{ name: string; coverUrl: string | null }> };
    const row = body.bookSeries.find((s) => s.name === 'Saga No Cover');
    expect(row).toBeDefined();
    expect(row!.coverUrl).toBe('https://example.com/cover.jpg');
  });

  it('returns saga coverUrl when saga has its own cover (member ignored)', async () => {
    // saga has its own cover; member also has a cover — saga's own wins
    const memberSeriesId = await insertSeries({
      contentType: 'ebook', status: 'finished', rootPath: '/t/member2',
      qualityProfileId: h.qpId, titleEnglish: 'Member With Cover 2',
      coverUrl: 'https://example.com/member-cover.jpg',
    });
    const bs = await dal.createBookSeries({
      name: 'Saga With Cover', contentType: 'ebook', source: 'manual',
      coverUrl: 'https://example.com/saga-cover.jpg',
    });
    await dal.addMember(bs.id, memberSeriesId, { position: 1, linkSource: 'manual' });

    const res = await GET(new Request('http://localhost/api/book-series'));
    const body = await res.json() as { bookSeries: Array<{ name: string; coverUrl: string | null }> };
    const row = body.bookSeries.find((s) => s.name === 'Saga With Cover');
    expect(row).toBeDefined();
    expect(row!.coverUrl).toBe('https://example.com/saga-cover.jpg');
  });

  it('returns null when saga coverUrl is null and no member has a cover', async () => {
    // saga has no cover; member also has no cover — should return null
    const memberSeriesId = await insertSeries({
      contentType: 'ebook', status: 'finished', rootPath: '/t/member3',
      qualityProfileId: h.qpId, titleEnglish: 'Member No Cover',
      coverUrl: null,
    });
    const bs = await dal.createBookSeries({
      name: 'Saga All Null', contentType: 'ebook', source: 'manual', coverUrl: null,
    });
    await dal.addMember(bs.id, memberSeriesId, { position: 1, linkSource: 'manual' });

    const res = await GET(new Request('http://localhost/api/book-series'));
    const body = await res.json() as { bookSeries: Array<{ name: string; coverUrl: string | null }> };
    const row = body.bookSeries.find((s) => s.name === 'Saga All Null');
    expect(row).toBeDefined();
    expect(row!.coverUrl).toBeNull();
  });
});
