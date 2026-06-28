import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { seedDb, type SeedHandle } from '../helpers/seed';
import { expectShape } from '../../helpers/assert-spec';
import {
  ReadarrAuthor,
  ReadarrAuthorLookupResult,
  ReadarrErrorResponse,
} from '@/server/openapi/schemas/readarr';
import { insertSeries } from '@/server/db/series';
import { insertVolume } from '@/server/db/volumes';
import { GET as listGET, POST as listPOST } from '@/app/api/readarr/v1/author/route';
import { GET as byIdGET } from '@/app/api/readarr/v1/author/[id]/route';
import { GET as lookupGET } from '@/app/api/readarr/v1/author/lookup/route';
import { __setFederatedDepsForTests, __resetFederatedForTests } from '@/server/search/federated';

let h: SeedHandle;
beforeEach(async () => {
  h = await seedDb({ skipDefaultSeries: true });
});
afterEach(() => {
  h.cleanup();
  __resetFederatedForTests();
});

describe('Readarr v1 author flow', () => {
  it('GET /author returns all readarr-mapped series', async () => {
    const mangaId = await insertSeries({
      contentType: 'manga',
      anilistId: 1,
      status: 'releasing',
      rootPath: '/media/comics/Manga A',
      qualityProfileId: h.qpId,
      titleEnglish: 'Manga A',
    });
    const ebookId = await insertSeries({
      contentType: 'ebook',
      openlibraryId: 'OLebookA',
      author: 'Author A',
      status: 'releasing',
      rootPath: '/media/books/Author A/Book A',
      qualityProfileId: h.qpId,
      titleEnglish: 'Book A',
    });
    await insertVolume({ seriesId: ebookId, number: 1, title: 'Book A' });

    const r = await listGET(new Request('http://x/api/readarr/v1/author'));
    expect(r.status).toBe(200);
    await expectShape(z.array(ReadarrAuthor), r, 'GET /api/readarr/v1/author 200');
    const body = (await r.json()) as Array<{ id: number; metadataProfileId: number }>;
    const ids = body.map((b) => b.id);
    expect(ids).toContain(ebookId);
    expect(ids).toContain(mangaId);
    const ebookAuthor = body.find((b) => b.id === ebookId)!;
    expect(ebookAuthor.metadataProfileId).toBe(1);
  });

  it('GET /author/:id returns single author with books', async () => {
    const id = await insertSeries({
      contentType: 'audiobook',
      asin: 'B0AB',
      author: 'Narrator A',
      status: 'releasing',
      rootPath: '/media/audiobooks/N/Title',
      qualityProfileId: h.qpId,
      titleEnglish: 'Title',
    });
    await insertVolume({ seriesId: id, number: 1, title: 'v1' });
    await insertVolume({ seriesId: id, number: 2, title: 'v2' });

    const r = await byIdGET(new Request(`http://x/api/readarr/v1/author/${id}`), {
      params: Promise.resolve({ id: String(id) }),
    });
    expect(r.status).toBe(200);
    await expectShape(ReadarrAuthor, r, 'GET /api/readarr/v1/author/{id} 200');
    const body = (await r.json()) as { id: number; books: unknown[] };
    expect(body.id).toBe(id);
    expect(body.books).toHaveLength(2);
  });

  it('GET /author/:id returns 404 for unknown id', async () => {
    const r = await byIdGET(new Request('http://x/api/readarr/v1/author/99999'), {
      params: Promise.resolve({ id: '99999' }),
    });
    expect(r.status).toBe(404);
    await expectShape(ReadarrErrorResponse, r, 'GET /api/readarr/v1/author/{id} 404');
  });

  it('GET /author/lookup returns federated results', async () => {
    __setFederatedDepsForTests({
      ebook: async () => [{ foreignId: 'OL1', title: 'Foo', author: 'A', coverUrl: null }],
      audiobook: async () => [{ foreignId: 'B0A', title: 'Foo', author: 'A', coverUrl: null }],
      lightNovel: async () => [],
      manga: async () => [],
      comic: async () => [],
    });
    const r = await lookupGET(new Request('http://x/api/readarr/v1/author/lookup?term=Foo'));
    expect(r.status).toBe(200);
    await expectShape(
      z.array(ReadarrAuthorLookupResult),
      r,
      'GET /api/readarr/v1/author/lookup 200',
    );
    const body = (await r.json()) as Array<{ foreignAuthorId: string }>;
    expect(body).toHaveLength(2);
  });

  it('POST /author creates an ebook series', async () => {
    __setFederatedDepsForTests({
      ebook: async () => [{ foreignId: 'OLfoo', title: 'Foo', author: 'A', coverUrl: null }],
      audiobook: async () => [],
      lightNovel: async () => [],
      manga: async () => [],
      comic: async () => [],
    });
    const body = {
      foreignAuthorId: 'OLfoo',
      authorName: 'A',
      metadataProfileId: 1,
      qualityProfileId: h.qpId,
      rootFolderPath: '/media/books',
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
    await expectShape(ReadarrAuthor, r, 'POST /api/readarr/v1/author 201');
    const created = (await r.json()) as { id: number; metadataProfileId: number };
    expect(created.metadataProfileId).toBe(1);
  });

  it('POST /author rejects invalid metadataProfileId', async () => {
    const r = await listPOST(
      new Request('http://x', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          foreignAuthorId: 'X',
          metadataProfileId: 99,
          qualityProfileId: 1,
          rootFolderPath: '/media/books',
        }),
      }),
    );
    expect(r.status).toBe(400);
    await expectShape(ReadarrErrorResponse, r, 'POST /api/readarr/v1/author 400');
    const body = await r.json();
    expect(body.message).toMatch(/metadataProfileId/);
  });

  it('GET /author returns manga and comic series in addition to book-shaped types', async () => {
    const mangaId = await insertSeries({
      contentType: 'manga',
      anilistId: 105778,
      author: 'Tatsuki Fujimoto',
      status: 'releasing',
      rootPath: '/media/comics/Chainsaw Man',
      qualityProfileId: h.qpId,
      titleEnglish: 'Chainsaw Man',
    });
    const comicId = await insertSeries({
      contentType: 'comic',
      comicvineId: 18166,
      publisher: 'Marvel Comics',
      status: 'releasing',
      rootPath: '/media/comics/Daredevil',
      qualityProfileId: h.qpId,
      titleEnglish: 'Daredevil',
    });

    const r = await listGET(new Request('http://x/api/readarr/v1/author'));
    expect(r.status).toBe(200);
    const body = (await r.json()) as Array<{ id: number; metadataProfileId: number }>;
    const ids = body.map((b) => b.id);
    expect(ids).toContain(mangaId);
    expect(ids).toContain(comicId);
    const mangaAuthor = body.find((b) => b.id === mangaId)!;
    expect(mangaAuthor.metadataProfileId).toBe(4);
    const comicAuthor = body.find((b) => b.id === comicId)!;
    expect(comicAuthor.metadataProfileId).toBe(5);
  });

  it('GET /author/:id returns manga series instead of 404', async () => {
    const id = await insertSeries({
      contentType: 'manga',
      anilistId: 1,
      status: 'releasing',
      rootPath: '/media/comics/A',
      qualityProfileId: h.qpId,
      titleEnglish: 'A',
    });
    const r = await byIdGET(new Request('http://x'), {
      params: Promise.resolve({ id: String(id) }),
    });
    expect(r.status).toBe(200);
    const body = (await r.json()) as { id: number; metadataProfileId: number };
    expect(body.id).toBe(id);
    expect(body.metadataProfileId).toBe(4);
  });

  it('POST /author with metadataProfileId=4 creates a manga series', async () => {
    const body = {
      foreignAuthorId: '105778',
      authorName: 'Tatsuki Fujimoto',
      metadataProfileId: 4,
      qualityProfileId: h.qpId,
      rootFolderPath: '/media/comics',
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
    const created = (await r.json()) as { metadataProfileId: number };
    expect(created.metadataProfileId).toBe(4);
  });

  it('POST /author with metadataProfileId=5 creates a comic series', async () => {
    const body = {
      foreignAuthorId: '18166',
      authorName: 'Marvel Comics',
      metadataProfileId: 5,
      qualityProfileId: h.qpId,
      rootFolderPath: '/media/comics',
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
    const created = (await r.json()) as { metadataProfileId: number };
    expect(created.metadataProfileId).toBe(5);
  });
});
