import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { GET } from '@/app/api/series/search/route';
import {
  __setAudnexFetcherForTests,
  __resetAudnexForTests,
} from '@/server/integrations/audnex/client';
import { expectShape } from '../../helpers/assert-spec';
import { SeriesSearchResponse } from '@/server/openapi/schemas/series';
import { ErrorResponse } from '@/server/openapi/schemas/common';

const FIXTURE_DIR = path.resolve(__dirname, '../../fixtures/audnex');
async function loadFixture(name: string): Promise<string> {
  return readFile(path.join(FIXTURE_DIR, name), 'utf-8');
}

beforeEach(() => {
  __resetAudnexForTests();
});
afterEach(() => {
  __resetAudnexForTests();
});

function req(qs: string): Request {
  return new Request(`http://localhost/api/series/search?${qs}`);
}

describe('GET /api/series/search?contentType=audiobook', () => {
  it('returns ASIN-keyed hits with narrator', async () => {
    const body = await loadFixture('search-success.json');
    __setAudnexFetcherForTests(async () => ({
      ok: true,
      status: 200,
      text: async () => body,
    }));
    const res = await GET(req('contentType=audiobook&q=hail+mary'));
    expect(res.status).toBe(200);
    await expectShape(SeriesSearchResponse, res, 'GET /api/series/search?contentType=audiobook');
    const json = (await res.json()) as { contentType: string; results: unknown[] };
    expect(json.contentType).toBe('audiobook');
    expect(json.results).toHaveLength(1);
    const r = json.results[0] as { asin: string; title: string; narrator: string };
    expect(r.asin).toBe('B086WJP9HX');
    expect(r.title).toBe('Project Hail Mary');
    expect(r.narrator).toBe('Ray Porter');
  });

  it('returns 502 on Audnex error', async () => {
    __setAudnexFetcherForTests(async () => ({
      ok: false,
      status: 503,
      text: async () => '',
    }));
    const res = await GET(req('contentType=audiobook&q=x'));
    expect(res.status).toBe(502);
    await expectShape(ErrorResponse, res, 'GET /api/series/search?contentType=audiobook');
  });

  it('returns empty results on Audnex 404', async () => {
    __setAudnexFetcherForTests(async () => ({
      ok: false,
      status: 404,
      text: async () => '',
    }));
    const res = await GET(req('contentType=audiobook&q=x'));
    expect(res.status).toBe(200);
    const json = (await res.json()) as { results: unknown[] };
    expect(json.results).toEqual([]);
  });
});
