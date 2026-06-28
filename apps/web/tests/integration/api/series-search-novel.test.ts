import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { seedDb, type SeedHandle } from '../helpers/seed';
import { GET } from '@/app/api/series/search/route';
import { expectShape } from '../../helpers/assert-spec';
import { SeriesSearchResponse } from '@/server/openapi/schemas/series';

const F = (n: string) => readFileSync(join(process.cwd(), 'tests/fixtures/anilist', n), 'utf-8');

let h: SeedHandle;

beforeEach(async () => {
  h = await seedDb();
  // Reset the AniList cache so tests don't bleed
  const { __clearCacheForTests } = await import('@/server/integrations/anilist/cache');
  __clearCacheForTests();
});
afterEach(() => h.cleanup());

function req(qs: string): Request {
  return new Request(`http://t/api/series/search?${qs}`);
}

describe('GET /api/series/search — light_novel dispatch', () => {
  it('routes to AniList NOVEL filter when contentType=light_novel', async () => {
    // Spy on fetch — the AniList client uses global fetch by default
    const originalFetch = global.fetch;
    let lastBody: string | null = null;
    global.fetch = (async (_url: string, init?: RequestInit) => {
      lastBody = typeof init?.body === 'string' ? init.body : null;
      return {
        ok: true,
        status: 200,
        json: async () => JSON.parse(F('search-novel-rezero.json')),
      } as Response;
    }) as typeof fetch;

    try {
      const res = await GET(req('contentType=light_novel&q=Re%3AZero'));
      expect(res.status).toBe(200);
      await expectShape(SeriesSearchResponse, res, 'GET /api/series/search?contentType=light_novel');
      const body = await res.json();
      expect(body.contentType).toBe('light_novel');
      expect(body.results).toHaveLength(2);
      expect(body.results[0].author).toBe('Tappei Nagatsuki');
      // Verify the GraphQL query used AniList's NOVEL format enum (not LIGHT_NOVEL → 400)
      expect(lastBody).toContain('format: NOVEL');
      expect(lastBody).not.toContain('LIGHT_NOVEL');
    } finally {
      global.fetch = originalFetch;
    }
  });

  it('defaults to manga when contentType omitted', async () => {
    // We can't verify the manga path's exact response here without a manga fixture,
    // but we can verify the search at least doesn't route to ComicVine.
    // Just check that a manga-shaped fetcher is what gets called.
    const originalFetch = global.fetch;
    const urls: string[] = [];
    global.fetch = (async (u: string) => {
      urls.push(String(u));
      return {
        ok: true,
        status: 200,
        json: async () => ({ data: { Page: { media: [] } } }),
      } as Response;
    }) as typeof fetch;

    try {
      const res = await GET(req('q=Chainsaw'));
      expect(res.status).toBe(200);
      // The AniList endpoint should have been hit (not ComicVine). The manga path
      // may also probe MangaDex as a completion fallback when AniList returns no
      // hits, so assert AniList was among the calls rather than the last one.
      expect(urls.some((u) => u.includes('graphql.anilist.co'))).toBe(true);
      expect(urls.some((u) => u.includes('comicvine'))).toBe(false);
    } finally {
      global.fetch = originalFetch;
    }
  });
});
