import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { seedDb, type SeedHandle } from '../helpers/seed';
import { POST } from '@/app/api/series/route';
import { getSeries } from '@/server/db/series';

let h: SeedHandle;

beforeEach(async () => {
  h = await seedDb();
});
afterEach(() => h.cleanup());

function req(body: unknown): Request {
  return new Request('http://localhost/api/series', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/series — ebook single book', () => {
  it('creates a series with totalVolumes=1, granularity=volume, openlibraryId, isbn', async () => {
    const res = await POST(
      req({
        contentType: 'ebook',
        flow: 'single',
        olid: 'OL27448W',
        isbn: '9780593135204',
        author: 'Andy Weir',
        title: 'Project Hail Mary',
        year: 2021,
        coverUrl: 'https://covers.openlibrary.org/b/id/12345678-L.jpg',
        description: 'A lone astronaut.',
        qualityProfileId: h.qpId,
        monitoring: 'all',
      }),
    );
    expect(res.status).toBe(201);
    const body = (await res.json()) as { id?: number } & Record<string, unknown>;
    const id = (body.id ?? (body as { id: number }).id) as number;
    const row = await getSeries(id);
    expect(row?.contentType).toBe('ebook');
    expect(row?.openlibraryId).toBe('OL27448W');
    expect(row?.isbn).toBe('9780593135204');
    expect(row?.author).toBe('Andy Weir');
    expect(row?.titleEnglish).toBe('Project Hail Mary');
    expect(row?.totalVolumes).toBe(1);
    expect(row?.granularity).toBe('volume');
    expect(row?.rootPath).toContain('books/');
  });

  it('ebook single body accepts groupId and persists it', async () => {
    const { createGroup } = await import('@/server/db/library-groups');
    const g = await createGroup('Books Shelf', null);
    const res = await POST(
      req({
        contentType: 'ebook',
        flow: 'single',
        olid: 'OL777777W',
        title: 'Grouped Book',
        qualityProfileId: h.qpId,
        groupId: g.id,
      }),
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.groupId).toBe(g.id);
    expect(body.groupPath).toBe('Books Shelf');
    const row = await getSeries(body.id);
    expect(row?.groupId).toBe(g.id);
  });
});

describe('POST /api/series — ebook book series', () => {
  it('creates a series with user-supplied totalVolumes', async () => {
    const res = await POST(
      req({
        contentType: 'ebook',
        flow: 'series',
        olid: 'OL16066W',
        isbn: '9780765376671',
        author: 'Brandon Sanderson',
        title: 'Mistborn',
        year: 2006,
        totalVolumes: 3,
        qualityProfileId: h.qpId,
        monitoring: 'all',
      }),
    );
    expect(res.status).toBe(201);
    const body = (await res.json()) as { id?: number } & Record<string, unknown>;
    const id = (body.id ?? (body as { id: number }).id) as number;
    const row = await getSeries(id);
    expect(row?.contentType).toBe('ebook');
    expect(row?.openlibraryId).toBe('OL16066W');
    expect(row?.totalVolumes).toBe(3);
    expect(row?.titleEnglish).toBe('Mistborn');
  });

  it('returns 409 on duplicate openlibraryId', async () => {
    const body1 = {
      contentType: 'ebook',
      flow: 'single',
      olid: 'OL27448W',
      isbn: '9780593135204',
      author: 'Andy Weir',
      title: 'Project Hail Mary',
      qualityProfileId: h.qpId,
    };
    const first = await POST(req(body1));
    expect(first.status).toBe(201);
    const second = await POST(req({ ...body1, title: 'Project Hail Mary (dup)' }));
    expect(second.status).toBe(409);
  });

  it('returns 400 when EbookSeriesBody is missing totalVolumes', async () => {
    const res = await POST(
      req({
        contentType: 'ebook',
        flow: 'series',
        olid: 'OL16066W',
        author: 'Brandon Sanderson',
        title: 'Mistborn',
        qualityProfileId: h.qpId,
      }),
    );
    expect(res.status).toBe(400);
  });
});
