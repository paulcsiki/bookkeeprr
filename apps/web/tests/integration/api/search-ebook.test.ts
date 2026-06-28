import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { GET } from '@/app/api/series/search/route';
import {
  __setOpenLibraryFetcherForTests,
  __resetOpenLibraryForTests,
} from '@/server/integrations/openlibrary/client';
import { expectShape } from '../../helpers/assert-spec';
import { SeriesSearchResponse } from '@/server/openapi/schemas/series';
import { ErrorResponse } from '@/server/openapi/schemas/common';

const FIXTURE_DIR = path.resolve(__dirname, '../../fixtures/openlibrary');
async function loadFixture(name: string): Promise<string> {
  return readFile(path.join(FIXTURE_DIR, name), 'utf-8');
}

beforeEach(() => {
  __resetOpenLibraryForTests();
});
afterEach(() => {
  __resetOpenLibraryForTests();
});

function req(qs: string): Request {
  return new Request(`http://localhost/api/series/search?${qs}`);
}

describe('GET /api/series/search?contentType=ebook', () => {
  it('returns OLID-keyed hits', async () => {
    const body = await loadFixture('search-success.json');
    __setOpenLibraryFetcherForTests(async () => ({
      ok: true,
      status: 200,
      text: async () => body,
    }));
    const res = await GET(req('contentType=ebook&q=hail+mary'));
    expect(res.status).toBe(200);
    await expectShape(SeriesSearchResponse, res, 'GET /api/series/search?contentType=ebook');
    const json = (await res.json()) as { contentType: string; results: unknown[] };
    expect(json.contentType).toBe('ebook');
    expect(json.results).toHaveLength(1);
    const r = json.results[0] as { olid: string; title: string; isbn: string };
    expect(r.olid).toBe('OL27448W');
    expect(r.title).toBe('Project Hail Mary');
    expect(r.isbn).toBe('9780593135204');
  });

  it('returns 502 on OpenLibrary error', async () => {
    __setOpenLibraryFetcherForTests(async () => ({
      ok: false,
      status: 503,
      text: async () => '',
    }));
    const res = await GET(req('contentType=ebook&q=x'));
    expect(res.status).toBe(502);
    await expectShape(ErrorResponse, res, 'GET /api/series/search?contentType=ebook');
  });

  it('returns empty results on OL 404', async () => {
    __setOpenLibraryFetcherForTests(async () => ({
      ok: false,
      status: 404,
      text: async () => '',
    }));
    const res = await GET(req('contentType=ebook&q=x'));
    expect(res.status).toBe(200);
    const json = (await res.json()) as { results: unknown[] };
    expect(json.results).toEqual([]);
  });
});
