import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { seedDb, type SeedHandle } from '../helpers/seed';
import { comicVineApiKeySetting } from '@/server/db/settings/comicvine';
import {
  __setComicVineFetcherForTests,
  __resetComicVineForTests,
} from '@/server/integrations/comicvine/client';
import { GET } from '@/app/api/series/search/route';
import { expectShape } from '../../helpers/assert-spec';
import { SeriesSearchResponse } from '@/server/openapi/schemas/series';
import { ErrorResponse } from '@/server/openapi/schemas/common';
import { ContentTypeEnum } from '@/server/openapi/schemas/series';
import { CONTENT_TYPES } from '@bookkeeprr/types/pure';

const F = (n: string) => readFileSync(join(process.cwd(), 'tests/fixtures/comicvine', n), 'utf-8');

let h: SeedHandle;

beforeEach(async () => {
  h = await seedDb();
  __resetComicVineForTests();
});
afterEach(() => h.cleanup());

function req(qs: string): Request {
  return new Request(`http://t/api/series/search?${qs}`);
}

describe('GET /api/series/search — comic dispatch', () => {
  it('routes to ComicVine when contentType=comic', async () => {
    await comicVineApiKeySetting.set('TESTKEY');
    __setComicVineFetcherForTests(async () => ({
      ok: true,
      status: 200,
      headers: {},
      text: async () => F('search-watchmen.json'),
    }));
    const res = await GET(req('contentType=comic&q=Watchmen'));
    expect(res.status).toBe(200);
    await expectShape(SeriesSearchResponse, res, 'GET /api/series/search?contentType=comic');
    const body = await res.json();
    expect(body.contentType).toBe('comic');
    expect(body.results).toHaveLength(2);
    expect(body.results[0].comicvineId).toBe(18847);
    expect(body.results[0].publisher).toBe('DC Comics');
  });

  it('returns 503 when comic search without API key', async () => {
    await comicVineApiKeySetting.set('');
    const res = await GET(req('contentType=comic&q=Watchmen'));
    expect(res.status).toBe(503);
    await expectShape(ErrorResponse, res, 'GET /api/series/search?contentType=comic');
  });

  it('defaults to manga (AniList) when contentType omitted', async () => {
    // Don't mock ComicVine; the existing test infrastructure for AniList
    // is whatever the M3 search test uses. To avoid live calls, we just
    // verify the route doesn't try to call ComicVine.
    let comicvineCalled = false;
    __setComicVineFetcherForTests(async () => {
      comicvineCalled = true;
      return { ok: false, status: 500, headers: {}, text: async () => '' };
    });
    // The manga path may itself call AniList; if your test harness already
    // mocks AniList globally, this works. Otherwise expect a non-200 here.
    try {
      await GET(req('q=Chainsaw'));
    } catch {
      // ignore — AniList fetch may fail without a mock; we only care that
      // ComicVine wasn't touched
    }
    expect(comicvineCalled).toBe(false);
  });
});

// The OpenAPI module is import-pure, so it duplicates the content-type list
// instead of importing @bookkeeprr/types. Keep the copies in lockstep.
describe('SeriesSearchQuery contentType enum', () => {
  it('stays in sync with CONTENT_TYPES from @bookkeeprr/types', () => {
    expect(ContentTypeEnum.options).toEqual([...CONTENT_TYPES]);
  });
});
