import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { seedDb, type SeedHandle } from '../helpers/seed';
import { expectShape } from '../../helpers/assert-spec';
import {
  ReadarrBook,
  ReadarrBookLookupResult,
  ReadarrErrorResponse,
} from '@/server/openapi/schemas/readarr';
import { insertSeries } from '@/server/db/series';
import { insertVolume } from '@/server/db/volumes';
import { GET as listGET, POST as listPOST } from '@/app/api/readarr/v1/book/route';
import { GET as byIdGET } from '@/app/api/readarr/v1/book/[id]/route';
import { GET as lookupGET } from '@/app/api/readarr/v1/book/lookup/route';
import { __setFederatedDepsForTests, __resetFederatedForTests } from '@/server/search/federated';

let h: SeedHandle;
beforeEach(async () => {
  h = await seedDb({ skipDefaultSeries: true });
});
afterEach(() => {
  h.cleanup();
  __resetFederatedForTests();
});

describe('Readarr v1 book flow', () => {
  it('GET /book returns volumes across readarr-mapped series', async () => {
    const mangaId = await insertSeries({
      contentType: 'manga',
      anilistId: 1,
      status: 'releasing',
      rootPath: '/media/comics/Manga A',
      qualityProfileId: h.qpId,
      titleEnglish: 'Manga A',
    });
    await insertVolume({ seriesId: mangaId, number: 1, title: 'v1' });

    const ebookId = await insertSeries({
      contentType: 'ebook',
      openlibraryId: 'OLA',
      status: 'releasing',
      rootPath: '/media/books/A',
      qualityProfileId: h.qpId,
      titleEnglish: 'Book A',
    });
    await insertVolume({ seriesId: ebookId, number: 1, title: 'v1' });
    await insertVolume({ seriesId: ebookId, number: 2, title: 'v2' });

    const r = await listGET(new Request('http://x/api/readarr/v1/book'));
    await expectShape(z.array(ReadarrBook), r, 'GET /api/readarr/v1/book 200');
    const body = (await r.json()) as Array<{ authorId: number; bookNumber: number }>;
    const authorIds = body.map((b) => b.authorId);
    expect(authorIds).toContain(ebookId);
    expect(authorIds).toContain(mangaId);
    expect(body.filter((b) => b.authorId === ebookId)).toHaveLength(2);
    expect(body.filter((b) => b.authorId === mangaId)).toHaveLength(1);
  });

  it('GET /book/:id returns single book', async () => {
    const sid = await insertSeries({
      contentType: 'ebook',
      openlibraryId: 'OLA',
      status: 'releasing',
      rootPath: '/media/books/A',
      qualityProfileId: h.qpId,
      titleEnglish: 'Book A',
    });
    const vid = await insertVolume({ seriesId: sid, number: 1, title: 'v1' });
    const r = await byIdGET(new Request(`http://x/api/readarr/v1/book/${vid}`), {
      params: Promise.resolve({ id: String(vid) }),
    });
    expect(r.status).toBe(200);
    await expectShape(ReadarrBook, r, 'GET /api/readarr/v1/book/{id} 200');
    const body = (await r.json()) as { id: number; authorId: number };
    expect(body.id).toBe(vid);
    expect(body.authorId).toBe(sid);
  });

  it('GET /book/:id returns 404 for unknown id', async () => {
    const r = await byIdGET(new Request('http://x', {}), {
      params: Promise.resolve({ id: '99999' }),
    });
    expect(r.status).toBe(404);
    await expectShape(ReadarrErrorResponse, r, 'GET /api/readarr/v1/book/{id} 404');
  });

  it('GET /book/lookup returns federated hits', async () => {
    __setFederatedDepsForTests({
      ebook: async () => [{ foreignId: 'OL1', title: 'Foo', author: 'A', coverUrl: null }],
      audiobook: async () => [],
      lightNovel: async () => [],
      manga: async () => [],
      comic: async () => [],
    });
    const r = await lookupGET(new Request('http://x/api/readarr/v1/book/lookup?term=foo'));
    await expectShape(z.array(ReadarrBookLookupResult), r, 'GET /api/readarr/v1/book/lookup 200');
    const body = (await r.json()) as Array<{ foreignBookId: string }>;
    expect(body).toHaveLength(1);
    expect(body[0]?.foreignBookId).toBe('OL1');
  });

  it('POST /book creates single-volume audiobook series', async () => {
    const body = {
      foreignBookId: 'B0AB',
      metadataProfileId: 2,
      qualityProfileId: h.qpId,
      rootFolderPath: '/media/audiobooks',
      monitored: true,
    };
    const r = await listPOST(
      new Request('http://x', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      }),
    );
    expect(r.status).toBe(201);
    await expectShape(ReadarrBook, r, 'POST /api/readarr/v1/book 201');
    const created = (await r.json()) as { authorId: number; bookNumber: number };
    expect(created.bookNumber).toBe(1);
  });

  it('POST /book rejects invalid metadataProfileId', async () => {
    const r = await listPOST(
      new Request('http://x', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          foreignBookId: 'X',
          metadataProfileId: 99,
          qualityProfileId: 1,
          rootFolderPath: '/media/books',
        }),
      }),
    );
    expect(r.status).toBe(400);
    await expectShape(ReadarrErrorResponse, r, 'POST /api/readarr/v1/book 400');
  });

  it('GET /book returns volumes from manga and comic series', async () => {
    const mangaId = await insertSeries({
      contentType: 'manga',
      anilistId: 1,
      status: 'releasing',
      rootPath: '/media/comics/M',
      qualityProfileId: h.qpId,
      titleEnglish: 'M',
    });
    await insertVolume({ seriesId: mangaId, number: 1, title: 'v1' });
    const comicId = await insertSeries({
      contentType: 'comic',
      comicvineId: 42,
      status: 'releasing',
      rootPath: '/media/comics/C',
      qualityProfileId: h.qpId,
      titleEnglish: 'C',
    });
    await insertVolume({ seriesId: comicId, number: 1, title: 'issue1' });

    const r = await listGET(new Request('http://x/api/readarr/v1/book'));
    const body = (await r.json()) as Array<{ authorId: number }>;
    const authorIds = body.map((b) => b.authorId);
    expect(authorIds).toContain(mangaId);
    expect(authorIds).toContain(comicId);
  });

  it('GET /book/:id returns manga volume instead of 404', async () => {
    const sid = await insertSeries({
      contentType: 'manga',
      anilistId: 1,
      status: 'releasing',
      rootPath: '/media/comics/M',
      qualityProfileId: h.qpId,
      titleEnglish: 'M',
    });
    const vid = await insertVolume({ seriesId: sid, number: 1, title: 'v1' });
    const r = await byIdGET(new Request('http://x'), {
      params: Promise.resolve({ id: String(vid) }),
    });
    expect(r.status).toBe(200);
    const body = (await r.json()) as { id: number; authorId: number };
    expect(body.id).toBe(vid);
    expect(body.authorId).toBe(sid);
  });
});
