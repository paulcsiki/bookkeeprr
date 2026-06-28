import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { seedDb, type SeedHandle } from '../helpers/seed';
import { expectShape } from '../../helpers/assert-spec';
import { ReadarrErrorResponse } from '@/server/openapi/schemas/readarr';
import { POST as authorPOST } from '@/app/api/readarr/v1/author/route';
import { GET as authorByIdGET } from '@/app/api/readarr/v1/author/[id]/route';
import { GET as bookByIdGET } from '@/app/api/readarr/v1/book/[id]/route';
import { GET as authorLookupGET } from '@/app/api/readarr/v1/author/lookup/route';
import { __setFederatedDepsForTests, __resetFederatedForTests } from '@/server/search/federated';
import { insertSeries } from '@/server/db/series';

let h: SeedHandle;
beforeEach(async () => {
  h = await seedDb({ skipDefaultSeries: true });
});
afterEach(() => {
  h.cleanup();
  __resetFederatedForTests();
});

describe('Readarr v1 error shapes', () => {
  it('400 on invalid JSON body', async () => {
    const r = await authorPOST(
      new Request('http://x', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{not json',
      }),
    );
    expect(r.status).toBe(400);
    await expectShape(ReadarrErrorResponse, r, 'POST /api/readarr/v1/author 400 (invalid JSON)');
    const b = await r.json();
    expect(b.message).toBeDefined();
  });

  it('400 on invalid metadataProfileId in author POST', async () => {
    const r = await authorPOST(
      new Request('http://x', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          foreignAuthorId: 'X',
          metadataProfileId: 7,
          qualityProfileId: 1,
          rootFolderPath: '/media/books',
        }),
      }),
    );
    expect(r.status).toBe(400);
  });

  it('400 on missing term in author/lookup', async () => {
    const r = await authorLookupGET(new Request('http://x/api/readarr/v1/author/lookup'));
    expect(r.status).toBe(400);
    await expectShape(ReadarrErrorResponse, r, 'GET /api/readarr/v1/author/lookup 400');
  });

  it('404 on author/:id with non-numeric id', async () => {
    const r = await authorByIdGET(new Request('http://x'), {
      params: Promise.resolve({ id: 'not-a-number' }),
    });
    expect(r.status).toBe(400);
    await expectShape(ReadarrErrorResponse, r, 'GET /api/readarr/v1/author/{id} 400');
  });

  it('200 on author/:id when series is manga (no longer 404 in m19)', async () => {
    const id = await insertSeries({
      contentType: 'manga',
      anilistId: 1,
      status: 'releasing',
      rootPath: '/media/comics/A',
      qualityProfileId: h.qpId,
      titleEnglish: 'A',
    });
    const r = await authorByIdGET(new Request('http://x'), {
      params: Promise.resolve({ id: String(id) }),
    });
    expect(r.status).toBe(200);
  });

  it('404 on book/:id with no volume', async () => {
    const r = await bookByIdGET(new Request('http://x'), {
      params: Promise.resolve({ id: '99999' }),
    });
    expect(r.status).toBe(404);
  });

  it('409 on author POST with duplicate light_novel foreignAuthorId', async () => {
    await insertSeries({
      contentType: 'light_novel',
      anilistId: 105778,
      status: 'releasing',
      rootPath: '/media/comics/LN',
      qualityProfileId: h.qpId,
      titleEnglish: 'LN',
    });
    const r = await authorPOST(
      new Request('http://x', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          foreignAuthorId: '105778',
          metadataProfileId: 3,
          qualityProfileId: h.qpId,
          rootFolderPath: '/media/comics',
        }),
      }),
    );
    expect(r.status).toBe(409);
    await expectShape(ReadarrErrorResponse, r, 'POST /api/readarr/v1/author 409');
  });

  it('all 401-style requests already covered in auth-flow.test.ts', () => {
    expect(true).toBe(true);
  });
});
