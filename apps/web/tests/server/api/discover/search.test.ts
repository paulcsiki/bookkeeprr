import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import path from 'node:path';
import { closeDb, getDb } from '@/server/db/client';
import { comicVineApiKeySetting } from '@/server/db/settings/comicvine';
import * as anilistCache from '@/server/integrations/anilist/cache';
import {
  __setComicVineFetcherForTests,
  __resetComicVineForTests,
} from '@/server/integrations/comicvine/client';
import {
  __setOpenLibraryFetcherForTests,
  __resetOpenLibraryForTests,
} from '@/server/integrations/openlibrary/client';
import {
  __setAudnexFetcherForTests,
  __resetAudnexForTests,
} from '@/server/integrations/audnex/client';
import {
  __setITunesFetcherForTests,
  __resetITunesForTests,
} from '@/server/integrations/itunes/client';
import { malClientIdSetting } from '@/server/db/settings/mal';
import * as malIndex from '@/server/integrations/mal';
import * as mangadex from '@/server/integrations/mangadex/client';
import * as nu from '@/server/integrations/novelupdates';
import { NovelUpdatesError } from '@/server/integrations/novelupdates';
import {
  DEFAULT_SEARCH_PROVIDERS,
  searchProvidersSetting,
} from '@/server/db/settings/search-providers';
import {
  __setGoogleBooksFetcherForTests,
  __resetGoogleBooksForTests,
} from '@/server/integrations/googlebooks/client';
import { googleBooksApiKeySetting } from '@/server/db/settings/googlebooks';
import { GET, type DiscoverResult } from '@/app/api/discover/search/route';

let tmpDir: string;

beforeEach(async () => {
  // Isolation: a prior seedDb test may have left BOOKKEEPRR_DB_PATH pointing at
  // its own DB (where the db singleton keys off). Drop it + close the cached
  // connection so getDb opens THIS test's fresh CONFIG_DIR DB — otherwise we'd
  // read a leaked mal.client_id and hit the real MAL API.
  delete process.env.BOOKKEEPRR_DB_PATH;
  await closeDb();
  tmpDir = mkdtempSync(join(tmpdir(), 'bk-discover-search-'));
  process.env.BOOKKEEPRR_CONFIG_DIR = tmpDir;
  // getDb() resolves its file from BOOKKEEPRR_DB_PATH (NOT CONFIG_DIR). Without
  // this it falls back to ./bookkeeprr.dev.db and clobbers real settings.
  process.env.BOOKKEEPRR_DB_PATH = join(tmpDir, 'test.db');
  const db = getDb();
  const migrationsFolder = path.resolve(__dirname, '../../../../drizzle');
  migrate(db, { migrationsFolder });
  vi.restoreAllMocks();
  __resetComicVineForTests();
  __resetOpenLibraryForTests();
  // Default OpenLibrary to empty: it backs ebook search AND the novel-cover
  // enrichment step, so without this every coverless-novel test would hit the
  // live OL API. Tests that need OL data override this.
  __setOpenLibraryFetcherForTests(async () => ({
    ok: true,
    status: 200,
    text: async () => JSON.stringify({ numFound: 0, docs: [] }),
  }));
  __resetAudnexForTests();
  // iTunes is the second audiobook source — default it to empty so existing
  // assertions (and result counts) are unaffected and no test hits the live API.
  __setITunesFetcherForTests(async () => ({
    ok: true,
    status: 200,
    text: async () => JSON.stringify({ results: [] }),
  }));
  // Default NU mock so light-novel / all-type searches never hit the live site;
  // individual tests override this with vi.spyOn as needed.
  vi.spyOn(nu, 'searchNovelUpdates').mockResolvedValue([]);
  __resetGoogleBooksForTests();
  // Default Google Books to empty so ebook tests don't hit the live API.
  // Tests that need GB data override this.
  __setGoogleBooksFetcherForTests(async () => ({
    ok: true,
    status: 200,
    text: async () => JSON.stringify({ totalItems: 0 }),
  }));
});

afterEach(async () => {
  vi.restoreAllMocks();
  __resetComicVineForTests();
  __resetOpenLibraryForTests();
  __resetAudnexForTests();
  __resetITunesForTests();
  __resetGoogleBooksForTests();
  await closeDb();
  delete process.env.BOOKKEEPRR_DB_PATH;
  rmSync(tmpDir, { recursive: true, force: true });
});

function req(qs: string): Request {
  return new Request(`http://localhost/api/discover/search?${qs}`);
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

describe('GET /api/discover/search — validation', () => {
  it('returns 400 when q is missing', async () => {
    const res = await GET(req('contentType=manga'));
    expect(res.status).toBe(400);
  });

  it('returns 400 when q is empty', async () => {
    const res = await GET(req('q=&contentType=manga'));
    expect(res.status).toBe(400);
  });

  it('returns 400 when contentType is invalid', async () => {
    const res = await GET(req('q=foo&contentType=badtype'));
    expect(res.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// Single-type paths
// ---------------------------------------------------------------------------

describe('GET /api/discover/search — single type: manga', () => {
  it('returns manga results from AniList', async () => {
    vi.spyOn(anilistCache, 'searchMangaCached').mockResolvedValue([
      {
        anilistId: 101663,
        titleEnglish: 'Chainsaw Man',
        titleRomaji: 'Chainsaw Man',
        titleNative: 'チェンソーマン',
        coverUrl: 'https://example.com/cover.jpg',
        status: 'releasing',
        format: 'MANGA',
        startYear: 2018,
      },
    ]);
    const res = await GET(req('q=chainsaw&contentType=manga'));
    expect(res.status).toBe(200);
    const body = await res.json() as { results: DiscoverResult[]; tookMs: number };
    expect(body.results).toHaveLength(1);
    expect(body.results[0]!.contentType).toBe('manga');
    expect(body.results[0]!.sourceId).toBe('101663');
    expect(body.results[0]!.title).toBe('Chainsaw Man');
    expect(body.results[0]!.source).toBe('anilist');
    expect(typeof body.tookMs).toBe('number');
    // New fields: detail and inLib
    expect('detail' in body.results[0]!).toBe(true);
    expect('inLib' in body.results[0]!).toBe(true);
    expect(typeof body.results[0]!.inLib).toBe('boolean');
  });

  it('returns errors object when AniList throws', async () => {
    vi.spyOn(anilistCache, 'searchMangaCached').mockRejectedValue(new Error('AniList HTTP 429'));
    const res = await GET(req('q=chainsaw&contentType=manga'));
    expect(res.status).toBe(200);
    const body = await res.json() as { results: DiscoverResult[]; errors: Record<string, string> };
    expect(body.results).toHaveLength(0);
    expect(body.errors?.manga).toMatch(/429/);
  });
});

describe('GET /api/discover/search — manga + MyAnimeList', () => {
  it('MAL disabled: results identical to AniList-only and searchMangaMal not called', async () => {
    await malClientIdSetting.set('');
    vi.spyOn(anilistCache, 'searchMangaCached').mockResolvedValue([
      {
        anilistId: 1,
        titleEnglish: 'Chainsaw Man',
        titleRomaji: 'Chainsaw Man',
        titleNative: 'チェンソーマン',
        coverUrl: null,
        status: 'releasing',
        format: 'MANGA',
        startYear: 2018,
      },
    ]);
    vi.spyOn(mangadex, 'searchMangaByTitle').mockResolvedValue(null);
    const malSpy = vi.spyOn(malIndex, 'searchMangaMal');

    const res = await GET(req('q=chainsaw&contentType=manga'));
    const body = await res.json() as { results: DiscoverResult[] };

    expect(malSpy).not.toHaveBeenCalled();
    expect(body.results).toHaveLength(1);
    expect(body.results[0]!.sourceId).toBe('1');
    expect(body.results[0]!.source).toBe('anilist');
    expect(body.results[0]!.malId).toBeNull();
    expect(body.results[0]!.sources?.mal).toBeUndefined();
  });

  it('MAL enabled: cross-linked title carries both ids; MAL-only title has anilist null + malId set', async () => {
    await malClientIdSetting.set('cid');
    vi.spyOn(anilistCache, 'searchMangaCached').mockResolvedValue([
      {
        anilistId: 1,
        titleEnglish: 'Chainsaw Man',
        titleRomaji: 'Chainsaw Man',
        titleNative: null,
        coverUrl: null,
        status: 'releasing',
        format: 'MANGA',
        startYear: 2018,
      },
    ]);
    vi.spyOn(mangadex, 'searchMangaByTitle').mockResolvedValue(null);
    vi.spyOn(malIndex, 'searchMangaMal').mockResolvedValue([
      {
        source: 'mal',
        malId: 100,
        title: 'Chainsaw Man',
        titles: { main: 'Chainsaw Man', en: null, ja: null, synonyms: [], all: ['Chainsaw Man'] },
        coverUrl: null,
        status: 'releasing',
        totalVolumes: null,
        totalChapters: null,
        year: 2018,
        mediaType: 'manga',
      },
      {
        source: 'mal',
        malId: 200,
        title: 'MAL Only Series',
        titles: { main: 'MAL Only Series', en: null, ja: null, synonyms: [], all: ['MAL Only Series'] },
        coverUrl: null,
        status: 'finished',
        totalVolumes: 3,
        totalChapters: null,
        year: 2010,
        mediaType: 'manga',
      },
    ]);

    const res = await GET(req('q=chainsaw&contentType=manga'));
    const body = await res.json() as { results: DiscoverResult[] };

    const linked = body.results.find((r) => r.sourceId === '1')!;
    expect(linked.source).toBe('anilist');
    expect(linked.malId).toBe(100);
    expect(linked.sources?.anilist).toBe(1);
    expect(linked.sources?.mal).toBe(100);

    const malOnly = body.results.find((r) => r.malId === 200)!;
    expect(malOnly.sourceId).toBe('mal:200');
    expect(malOnly.source).toBe('mal');
    expect(malOnly.sources?.anilist).toBeUndefined();
    expect(malOnly.sources?.mal).toBe(200);
    expect(malOnly.title).toBe('MAL Only Series');
  });

  it('MAL throws: still returns AniList results with no error surfaced', async () => {
    await malClientIdSetting.set('cid');
    vi.spyOn(anilistCache, 'searchMangaCached').mockResolvedValue([
      {
        anilistId: 1,
        titleEnglish: 'Chainsaw Man',
        titleRomaji: 'Chainsaw Man',
        titleNative: null,
        coverUrl: null,
        status: 'releasing',
        format: 'MANGA',
        startYear: 2018,
      },
    ]);
    vi.spyOn(mangadex, 'searchMangaByTitle').mockResolvedValue(null);
    vi.spyOn(malIndex, 'searchMangaMal').mockRejectedValue(new Error('MAL HTTP 500'));

    const res = await GET(req('q=chainsaw&contentType=manga'));
    const body = await res.json() as { results: DiscoverResult[]; errors?: Record<string, string> };

    expect(body.results).toHaveLength(1);
    expect(body.results[0]!.sourceId).toBe('1');
    expect(body.results[0]!.malId).toBeNull();
    expect(body.errors).toBeUndefined();
  });
});

describe('GET /api/discover/search — single type: light_novel (AniList + NovelUpdates)', () => {
  it('maps NU hits into light_novel results with the nu:slug sourceId + sources.novelupdates', async () => {
    vi.spyOn(anilistCache, 'searchNovelCached').mockResolvedValue([]);
    vi.spyOn(nu, 'searchNovelUpdates').mockResolvedValue([
      { slug: 'solo-leveling', title: 'Solo Leveling', coverUrl: 'https://x/c.jpg', year: 2016 },
    ]);
    const res = await GET(req('q=solo&contentType=light_novel'));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { results: DiscoverResult[] };
    expect(body.results).toHaveLength(1);
    const r = body.results[0]!;
    expect(r.contentType).toBe('light_novel');
    expect(r.source).toBe('novelupdates');
    expect(r.sourceId).toBe('nu:solo-leveling');
    expect(r.sources?.novelupdates).toBe('solo-leveling');
    expect(r.sources?.anilist).toBeUndefined();
    expect(r.title).toBe('Solo Leveling');
    expect(r.year).toBe(2016);
  });

  it('same title on both: keeps AniList result + grafts sources.novelupdates', async () => {
    vi.spyOn(anilistCache, 'searchNovelCached').mockResolvedValue([
      {
        anilistId: 777,
        titleEnglish: 'Mushoku Tensei',
        titleRomaji: 'Mushoku Tensei',
        titleNative: null,
        coverUrl: 'https://anilist/c.jpg',
        status: 'releasing',
        format: 'NOVEL',
        startYear: 2014,
      },
    ]);
    vi.spyOn(nu, 'searchNovelUpdates').mockResolvedValue([
      { slug: 'mushoku-tensei', title: 'Mushoku Tensei!', coverUrl: null, year: 2014 },
    ]);
    const res = await GET(req('q=mushoku&contentType=light_novel'));
    const body = (await res.json()) as { results: DiscoverResult[] };
    expect(body.results).toHaveLength(1);
    const r = body.results[0]!;
    expect(r.source).toBe('anilist');
    expect(r.sourceId).toBe('777');
    expect(r.sources?.anilist).toBe(777);
    expect(r.sources?.novelupdates).toBe('mushoku-tensei');
  });

  it('NU-only title passes through standalone alongside an unrelated AniList result', async () => {
    vi.spyOn(anilistCache, 'searchNovelCached').mockResolvedValue([
      {
        anilistId: 1,
        titleEnglish: 'Some Other Novel',
        titleRomaji: null,
        titleNative: null,
        coverUrl: null,
        status: 'releasing',
        format: 'NOVEL',
        startYear: 2020,
      },
    ]);
    vi.spyOn(nu, 'searchNovelUpdates').mockResolvedValue([
      { slug: 'solo-leveling', title: 'Solo Leveling', coverUrl: null, year: 2016 },
    ]);
    const res = await GET(req('q=novel&contentType=light_novel'));
    const body = (await res.json()) as { results: DiscoverResult[] };
    expect(body.results).toHaveLength(2);
    expect(body.results.find((r) => r.sourceId === 'nu:solo-leveling')).toBeTruthy();
    expect(body.results.find((r) => r.sourceId === '1')).toBeTruthy();
  });

  it('NU failure: AniList results still returned, NU does not surface an error', async () => {
    vi.spyOn(anilistCache, 'searchNovelCached').mockResolvedValue([
      {
        anilistId: 5,
        titleEnglish: 'AniList Novel',
        titleRomaji: null,
        titleNative: null,
        coverUrl: null,
        status: 'releasing',
        format: 'NOVEL',
        startYear: 2019,
      },
    ]);
    vi.spyOn(nu, 'searchNovelUpdates').mockRejectedValue(
      new NovelUpdatesError('blocked', '403'),
    );
    const res = await GET(req('q=novel&contentType=light_novel'));
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      results: DiscoverResult[];
      errors?: Record<string, string>;
    };
    expect(body.results).toHaveLength(1);
    expect(body.results[0]!.sourceId).toBe('5');
    expect(body.errors).toBeUndefined();
  });

  it('AniList failure: error surfaced, NU results still returned', async () => {
    vi.spyOn(anilistCache, 'searchNovelCached').mockRejectedValue(new Error('AniList HTTP 429'));
    vi.spyOn(nu, 'searchNovelUpdates').mockResolvedValue([
      { slug: 'solo-leveling', title: 'Solo Leveling', coverUrl: null, year: 2016 },
    ]);
    const res = await GET(req('q=novel&contentType=light_novel'));
    const body = (await res.json()) as {
      results: DiscoverResult[];
      errors?: Record<string, string>;
    };
    expect(body.results).toHaveLength(1);
    expect(body.results[0]!.sourceId).toBe('nu:solo-leveling');
    expect(body.errors?.light_novel).toMatch(/429/);
  });
});

describe('GET /api/discover/search — contentType=all merges NU into light novels', () => {
  it('collapses an AniList+NU same-title novel and keeps NU-only standalone', async () => {
    vi.spyOn(anilistCache, 'searchMangaCached').mockResolvedValue([]);
    vi.spyOn(anilistCache, 'searchNovelCached').mockResolvedValue([
      {
        anilistId: 42,
        titleEnglish: 'Overlord',
        titleRomaji: 'Overlord',
        titleNative: null,
        coverUrl: 'https://anilist/o.jpg',
        status: 'releasing',
        format: 'NOVEL',
        startYear: 2012,
      },
    ]);
    vi.spyOn(nu, 'searchNovelUpdates').mockResolvedValue([
      { slug: 'overlord-ln', title: 'Overlord', coverUrl: null, year: 2012 },
      { slug: 'solo-leveling', title: 'Solo Leveling', coverUrl: null, year: 2016 },
    ]);
    __setOpenLibraryFetcherForTests(async () => ({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ numFound: 0, docs: [] }),
    }));
    __setAudnexFetcherForTests(async () => ({ ok: false, status: 404, text: async () => '' }));
    await comicVineApiKeySetting.set('');

    const res = await GET(req('q=test&contentType=all'));
    const body = (await res.json()) as { results: DiscoverResult[] };
    const overlord = body.results.find((r) => r.title === 'Overlord')!;
    expect(overlord.sources?.anilist).toBe(42);
    expect(overlord.sources?.novelupdates).toBe('overlord-ln');
    const solo = body.results.find((r) => r.sourceId === 'nu:solo-leveling');
    expect(solo).toBeTruthy();
  });

  it('records the NU error under "novelupdates" when NU fails in the fan-out', async () => {
    vi.spyOn(anilistCache, 'searchMangaCached').mockResolvedValue([]);
    vi.spyOn(anilistCache, 'searchNovelCached').mockResolvedValue([]);
    vi.spyOn(nu, 'searchNovelUpdates').mockRejectedValue(new NovelUpdatesError('rate-limited', '429'));
    __setOpenLibraryFetcherForTests(async () => ({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ numFound: 0, docs: [] }),
    }));
    __setAudnexFetcherForTests(async () => ({ ok: true, status: 200, text: async () => '[]' }));
    await comicVineApiKeySetting.set('');

    const res = await GET(req('q=test&contentType=all'));
    const body = (await res.json()) as { errors?: Record<string, string> };
    expect(body.errors?.novelupdates).toMatch(/429/);
  });
});

describe('GET /api/discover/search — single type: ebook', () => {
  it('returns ebook results from OpenLibrary', async () => {
    __setOpenLibraryFetcherForTests(async () => ({
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify({
          numFound: 1,
          docs: [
            {
              key: '/works/OL27448W',
              title: 'Project Hail Mary',
              author_name: ['Andy Weir'],
              first_publish_year: 2021,
              isbn: ['9780593135204'],
              cover_i: 12345678,
            },
          ],
        }),
    }));
    const res = await GET(req('q=hail+mary&contentType=ebook'));
    expect(res.status).toBe(200);
    const body = await res.json() as { results: DiscoverResult[] };
    expect(body.results).toHaveLength(1);
    expect(body.results[0]!.contentType).toBe('ebook');
    expect(body.results[0]!.title).toBe('Project Hail Mary');
    expect(body.results[0]!.isbn).toBe('9780593135204');
    expect(body.results[0]!.source).toBe('openlibrary');
    expect('detail' in body.results[0]!).toBe(true);
    expect('inLib' in body.results[0]!).toBe(true);
  });

  it('falls back to Google Books when OpenLibrary is unreachable and API key is set', async () => {
    // OL hangs/throws → simulate with a rejected fetch
    __setOpenLibraryFetcherForTests(async () => {
      throw new Error('fetch failed');
    });
    // GB returns a hit
    await googleBooksApiKeySetting.set('test-key');
    __setGoogleBooksFetcherForTests(async () => ({
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify({
          totalItems: 1,
          items: [
            {
              id: 'gb-ebook-1',
              volumeInfo: {
                title: 'Project Hail Mary',
                authors: ['Andy Weir'],
                publishedDate: '2021',
                industryIdentifiers: [{ type: 'ISBN_13', identifier: '9780593135204' }],
                imageLinks: { thumbnail: 'http://books.google.com/cover.jpg' },
              },
            },
          ],
        }),
    }));
    const res = await GET(req('q=hail+mary&contentType=ebook'));
    expect(res.status).toBe(200);
    const body = await res.json() as { results: DiscoverResult[]; errors?: Record<string, string> };
    // GB result surfaces even though OL failed
    expect(body.results.length).toBeGreaterThan(0);
    const gb = body.results.find((r) => r.source === 'googlebooks');
    expect(gb).toBeTruthy();
    expect(gb!.contentType).toBe('ebook');
    expect(gb!.title).toBe('Project Hail Mary');
    // OL error is recorded (non-blocking)
    expect(body.errors?.openlibrary ?? body.errors?.ebook).toMatch(/fetch failed/);
  });

  it('returns empty results (not a throw) when BOTH OL and GB fail', async () => {
    __setOpenLibraryFetcherForTests(async () => {
      throw new Error('fetch failed');
    });
    await googleBooksApiKeySetting.set('test-key');
    __setGoogleBooksFetcherForTests(async () => ({
      ok: false,
      status: 429,
      text: async () => '',
    }));
    const res = await GET(req('q=hail+mary&contentType=ebook'));
    expect(res.status).toBe(200);
    const body = await res.json() as { results: DiscoverResult[]; errors?: Record<string, string> };
    expect(body.results).toHaveLength(0);
    // Errors captured for both providers
    expect(body.errors).toBeDefined();
  });

  it('deduplicates results with same normalized title across OL and Google Books', async () => {
    __setOpenLibraryFetcherForTests(async () => ({
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify({
          numFound: 1,
          docs: [
            {
              key: '/works/OL27448W',
              title: 'Project Hail Mary',
              author_name: ['Andy Weir'],
              first_publish_year: 2021,
              isbn: ['9780593135204'],
              cover_i: 12345678,
            },
          ],
        }),
    }));
    await googleBooksApiKeySetting.set('test-key');
    __setGoogleBooksFetcherForTests(async () => ({
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify({
          totalItems: 1,
          items: [
            {
              id: 'gb-ebook-1',
              volumeInfo: {
                title: 'Project Hail Mary',
                authors: ['Andy Weir'],
                publishedDate: '2021',
                industryIdentifiers: [{ type: 'ISBN_13', identifier: '9780593135204' }],
              },
            },
          ],
        }),
    }));
    const res = await GET(req('q=hail+mary&contentType=ebook'));
    expect(res.status).toBe(200);
    const body = await res.json() as { results: DiscoverResult[] };
    // Same title → deduplicated to 1 result
    const hailMary = body.results.filter((r) => r.contentType === 'ebook' && r.title === 'Project Hail Mary');
    expect(hailMary).toHaveLength(1);
    // OL wins when both present (higher fidelity source)
    expect(hailMary[0]!.source).toBe('openlibrary');
  });

  it('skips Google Books when no API key is configured (avoids 429)', async () => {
    await googleBooksApiKeySetting.set('');
    const gbFetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ totalItems: 0 }),
    }));
    __setGoogleBooksFetcherForTests(gbFetch);
    __setOpenLibraryFetcherForTests(async () => ({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ numFound: 0, docs: [] }),
    }));
    const res = await GET(req('q=hail+mary&contentType=ebook'));
    expect(res.status).toBe(200);
    // GB fetcher should NOT be called when no key is set
    expect(gbFetch).not.toHaveBeenCalled();
  });

  it('merges distinct titles from both OL and Google Books', async () => {
    __setOpenLibraryFetcherForTests(async () => ({
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify({
          numFound: 1,
          docs: [
            {
              key: '/works/OL1W',
              title: 'OL Only Book',
              author_name: ['Author A'],
              first_publish_year: 2020,
            },
          ],
        }),
    }));
    await googleBooksApiKeySetting.set('test-key');
    __setGoogleBooksFetcherForTests(async () => ({
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify({
          totalItems: 1,
          items: [
            {
              id: 'gb-2',
              volumeInfo: {
                title: 'GB Only Book',
                authors: ['Author B'],
                publishedDate: '2022',
              },
            },
          ],
        }),
    }));
    const res = await GET(req('q=book&contentType=ebook'));
    expect(res.status).toBe(200);
    const body = await res.json() as { results: DiscoverResult[] };
    const titles = body.results.map((r) => r.title);
    expect(titles).toContain('OL Only Book');
    expect(titles).toContain('GB Only Book');
  });
});

// ---------------------------------------------------------------------------
// All-providers fan-out
// ---------------------------------------------------------------------------

describe('GET /api/discover/search — contentType=all', () => {
  it('merges results from all configured providers', async () => {
    vi.spyOn(anilistCache, 'searchMangaCached').mockResolvedValue([
      {
        anilistId: 1,
        titleEnglish: 'Manga Result',
        titleRomaji: null,
        titleNative: null,
        coverUrl: null,
        status: 'releasing',
        format: null,
        startYear: null,
      },
    ]);
    vi.spyOn(anilistCache, 'searchNovelCached').mockResolvedValue([]);
    __setOpenLibraryFetcherForTests(async () => ({
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify({
          numFound: 1,
          docs: [
            {
              key: '/works/OL1W',
              title: 'Ebook Result',
            },
          ],
        }),
    }));
    __setAudnexFetcherForTests(async () => ({
      ok: false,
      status: 404,
      text: async () => '',
    }));
    // No comicvine api key — comic search returns [] silently
    await comicVineApiKeySetting.set('');

    const res = await GET(req('q=test&contentType=all'));
    expect(res.status).toBe(200);
    const body = await res.json() as { results: DiscoverResult[]; tookMs: number; errors?: Record<string, string> };
    // At least manga and ebook results present
    const sources = body.results.map((r) => r.contentType);
    expect(sources).toContain('manga');
    expect(sources).toContain('ebook');
    expect(typeof body.tookMs).toBe('number');
  });

  it('records per-provider errors when a provider fails', async () => {
    vi.spyOn(anilistCache, 'searchMangaCached').mockRejectedValue(new Error('anilist down'));
    vi.spyOn(anilistCache, 'searchNovelCached').mockResolvedValue([]);
    __setOpenLibraryFetcherForTests(async () => ({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ numFound: 0, docs: [] }),
    }));
    __setAudnexFetcherForTests(async () => ({
      ok: true,
      status: 200,
      text: async () => JSON.stringify([]),
    }));
    await comicVineApiKeySetting.set('');

    const res = await GET(req('q=test&contentType=all'));
    expect(res.status).toBe(200);
    const body = await res.json() as { results: DiscoverResult[]; errors?: Record<string, string> };
    expect(body.errors?.['anilist-manga']).toMatch(/anilist down/);
  });

  it('returns empty results and errors when all providers fail', async () => {
    vi.spyOn(anilistCache, 'searchMangaCached').mockRejectedValue(new Error('anilist down'));
    vi.spyOn(anilistCache, 'searchNovelCached').mockRejectedValue(new Error('anilist down'));
    __setOpenLibraryFetcherForTests(async () => ({
      ok: false,
      status: 503,
      text: async () => '',
    }));
    __setAudnexFetcherForTests(async () => ({
      ok: false,
      status: 503,
      text: async () => '',
    }));
    await comicVineApiKeySetting.set('');

    const res = await GET(req('q=test&contentType=all'));
    expect(res.status).toBe(200);
    const body = await res.json() as { results: DiscoverResult[]; errors?: Record<string, string> };
    expect(body.results).toHaveLength(0);
    // errors should be present for the failing providers
    expect(body.errors).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Provider on/off gating (search.providers setting)
// ---------------------------------------------------------------------------

describe('GET /api/discover/search — provider gating', () => {
  it('novelupdates off: NU is not called and no NU results appear (contentType=all)', async () => {
    await searchProvidersSetting.set({ ...DEFAULT_SEARCH_PROVIDERS, novelupdates: false });
    const aniNovel = vi.spyOn(anilistCache, 'searchNovelCached').mockResolvedValue([]);
    vi.spyOn(anilistCache, 'searchMangaCached').mockResolvedValue([]);
    const nuSpy = vi.spyOn(nu, 'searchNovelUpdates').mockResolvedValue([
      { slug: 'solo-leveling', title: 'Solo Leveling', coverUrl: null, year: 2016 },
    ]);
    __setOpenLibraryFetcherForTests(async () => ({ ok: true, status: 200, text: async () => JSON.stringify({ numFound: 0, docs: [] }) }));
    __setAudnexFetcherForTests(async () => ({ ok: true, status: 200, text: async () => '[]' }));
    await comicVineApiKeySetting.set('');

    const res = await GET(req('q=solo&contentType=all'));
    const body = (await res.json()) as { results: DiscoverResult[] };
    expect(nuSpy).not.toHaveBeenCalled();
    expect(aniNovel).toHaveBeenCalled(); // anilist still on
    expect(body.results.find((r) => r.source === 'novelupdates')).toBeUndefined();
  });

  it('novelupdates off (single-type light_novel): NU not called, AniList still runs', async () => {
    await searchProvidersSetting.set({ ...DEFAULT_SEARCH_PROVIDERS, novelupdates: false });
    const aniNovel = vi.spyOn(anilistCache, 'searchNovelCached').mockResolvedValue([
      { anilistId: 5, titleEnglish: 'AniList Novel', titleRomaji: null, titleNative: null, coverUrl: null, status: 'releasing', format: 'NOVEL', startYear: 2019 },
    ]);
    const nuSpy = vi.spyOn(nu, 'searchNovelUpdates').mockResolvedValue([
      { slug: 'solo-leveling', title: 'Solo Leveling', coverUrl: null, year: 2016 },
    ]);
    const res = await GET(req('q=novel&contentType=light_novel'));
    const body = (await res.json()) as { results: DiscoverResult[] };
    expect(nuSpy).not.toHaveBeenCalled();
    expect(aniNovel).toHaveBeenCalled();
    expect(body.results).toHaveLength(1);
    expect(body.results[0]!.sourceId).toBe('5');
  });

  it('anilist off: neither anilist manga nor anilist novel is called', async () => {
    await searchProvidersSetting.set({ ...DEFAULT_SEARCH_PROVIDERS, anilist: false });
    const mangaSpy = vi.spyOn(anilistCache, 'searchMangaCached').mockResolvedValue([]);
    const novelSpy = vi.spyOn(anilistCache, 'searchNovelCached').mockResolvedValue([]);
    vi.spyOn(nu, 'searchNovelUpdates').mockResolvedValue([]);
    __setOpenLibraryFetcherForTests(async () => ({ ok: true, status: 200, text: async () => JSON.stringify({ numFound: 0, docs: [] }) }));
    __setAudnexFetcherForTests(async () => ({ ok: true, status: 200, text: async () => '[]' }));
    await comicVineApiKeySetting.set('');

    const res = await GET(req('q=test&contentType=all'));
    expect(res.status).toBe(200);
    expect(mangaSpy).not.toHaveBeenCalled();
    expect(novelSpy).not.toHaveBeenCalled();
  });

  it('anilist off but mal on: MAL-only manga results still surface', async () => {
    await searchProvidersSetting.set({ ...DEFAULT_SEARCH_PROVIDERS, anilist: false });
    await malClientIdSetting.set('cid');
    const mangaSpy = vi.spyOn(anilistCache, 'searchMangaCached').mockResolvedValue([]);
    vi.spyOn(malIndex, 'searchMangaMal').mockResolvedValue([
      { source: 'mal', malId: 200, title: 'MAL Only', titles: { main: 'MAL Only', en: null, ja: null, synonyms: [], all: ['MAL Only'] }, coverUrl: null, status: 'finished', totalVolumes: 3, totalChapters: null, year: 2010, mediaType: 'manga' },
    ]);

    const res = await GET(req('q=mal&contentType=manga'));
    const body = (await res.json()) as { results: DiscoverResult[] };
    expect(mangaSpy).not.toHaveBeenCalled();
    const malOnly = body.results.find((r) => r.malId === 200);
    expect(malOnly).toBeTruthy();
    expect(malOnly!.source).toBe('mal');
  });

  it('mal off (manga): searchMangaMal not called, AniList result still returned', async () => {
    await searchProvidersSetting.set({ ...DEFAULT_SEARCH_PROVIDERS, mal: false });
    await malClientIdSetting.set('cid'); // configured, but the toggle wins
    vi.spyOn(anilistCache, 'searchMangaCached').mockResolvedValue([
      { anilistId: 1, titleEnglish: 'Chainsaw Man', titleRomaji: 'Chainsaw Man', titleNative: null, coverUrl: null, status: 'releasing', format: 'MANGA', startYear: 2018 },
    ]);
    vi.spyOn(mangadex, 'searchMangaByTitle').mockResolvedValue(null);
    const malSpy = vi.spyOn(malIndex, 'searchMangaMal');

    const res = await GET(req('q=chainsaw&contentType=manga'));
    const body = (await res.json()) as { results: DiscoverResult[] };
    expect(malSpy).not.toHaveBeenCalled();
    expect(body.results).toHaveLength(1);
    expect(body.results[0]!.source).toBe('anilist');
  });

  it('mangadex off (manga): MangaDex cross-link is not called', async () => {
    await searchProvidersSetting.set({ ...DEFAULT_SEARCH_PROVIDERS, mangadex: false });
    await malClientIdSetting.set('');
    vi.spyOn(anilistCache, 'searchMangaCached').mockResolvedValue([
      { anilistId: 1, titleEnglish: 'Chainsaw Man', titleRomaji: 'Chainsaw Man', titleNative: null, coverUrl: null, status: 'releasing', format: 'MANGA', startYear: 2018 },
    ]);
    const byTitle = vi.spyOn(mangadex, 'searchMangaByTitle').mockResolvedValue(null);
    const titles = vi.spyOn(mangadex, 'searchMangaTitles').mockResolvedValue([]);

    const res = await GET(req('q=chainsaw&contentType=manga'));
    const body = (await res.json()) as { results: DiscoverResult[] };
    expect(byTitle).not.toHaveBeenCalled();
    expect(titles).not.toHaveBeenCalled();
    expect(body.results).toHaveLength(1);
  });

  it('comicvine off: ComicVine search is not called even when configured', async () => {
    await searchProvidersSetting.set({ ...DEFAULT_SEARCH_PROVIDERS, comicvine: false });
    await comicVineApiKeySetting.set('cv-key');
    const cvFetch = vi.fn(async () => ({ ok: true, status: 200, headers: {}, text: async () => JSON.stringify({ results: [] }) }));
    __setComicVineFetcherForTests(cvFetch);

    const res = await GET(req('q=batman&contentType=comic'));
    const body = (await res.json()) as { results: DiscoverResult[] };
    expect(cvFetch).not.toHaveBeenCalled();
    expect(body.results).toHaveLength(0);
  });

  it('openlibrary off: ebook search is not called', async () => {
    await searchProvidersSetting.set({ ...DEFAULT_SEARCH_PROVIDERS, openlibrary: false });
    const olFetch = vi.fn(async () => ({ ok: true, status: 200, text: async () => JSON.stringify({ numFound: 0, docs: [] }) }));
    __setOpenLibraryFetcherForTests(olFetch);

    const res = await GET(req('q=book&contentType=ebook'));
    const body = (await res.json()) as { results: DiscoverResult[] };
    expect(olFetch).not.toHaveBeenCalled();
    expect(body.results).toHaveLength(0);
  });

  it('audnex off: audiobook search is not called', async () => {
    await searchProvidersSetting.set({ ...DEFAULT_SEARCH_PROVIDERS, audnex: false });
    const auFetch = vi.fn(async () => ({ ok: true, status: 200, text: async () => '[]' }));
    __setAudnexFetcherForTests(auFetch);

    const res = await GET(req('q=audio&contentType=audiobook'));
    const body = (await res.json()) as { results: DiscoverResult[] };
    expect(auFetch).not.toHaveBeenCalled();
    expect(body.results).toHaveLength(0);
  });

  it('all manga providers off: manga returns [] without crashing', async () => {
    await searchProvidersSetting.set({
      ...DEFAULT_SEARCH_PROVIDERS,
      anilist: false,
      mal: false,
      mangadex: false,
    });
    await malClientIdSetting.set('cid');
    const mangaSpy = vi.spyOn(anilistCache, 'searchMangaCached');
    const malSpy = vi.spyOn(malIndex, 'searchMangaMal');

    const res = await GET(req('q=anything&contentType=manga'));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { results: DiscoverResult[] };
    expect(body.results).toHaveLength(0);
    expect(mangaSpy).not.toHaveBeenCalled();
    expect(malSpy).not.toHaveBeenCalled();
  });

  it('all light-novel providers off: light_novel returns []', async () => {
    await searchProvidersSetting.set({
      ...DEFAULT_SEARCH_PROVIDERS,
      anilist: false,
      novelupdates: false,
    });
    const novelSpy = vi.spyOn(anilistCache, 'searchNovelCached');
    const nuSpy = vi.spyOn(nu, 'searchNovelUpdates');

    const res = await GET(req('q=anything&contentType=light_novel'));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { results: DiscoverResult[] };
    expect(body.results).toHaveLength(0);
    expect(novelSpy).not.toHaveBeenCalled();
    expect(nuSpy).not.toHaveBeenCalled();
  });
});
