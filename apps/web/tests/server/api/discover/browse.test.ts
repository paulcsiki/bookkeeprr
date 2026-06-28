import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import path from 'node:path';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { closeDb, getDb } from '@/server/db/client';
import * as anilistCache from '@/server/integrations/anilist/cache';
import * as anilistClient from '@/server/integrations/anilist/client';
import { discoverTrendingSourceSetting } from '@/server/db/settings/discover';
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
  __setLibriVoxFetcherForTests,
  __resetLibriVoxForTests,
} from '@/server/integrations/librivox/client';
import { __clearNytBrowseCacheForTests, __clearITunesTopBrowseCacheForTests } from '@/server/discover/browse';
import {
  __setITunesFetcherForTests,
  __resetITunesForTests,
} from '@/server/integrations/itunes/client';
import * as nyt from '@/server/integrations/nyt';
import { nytApiKeySetting } from '@/server/db/settings/nyt';
import { comicVineApiKeySetting } from '@/server/db/settings/comicvine';
import { malClientIdSetting } from '@/server/db/settings/mal';
import * as mal from '@/server/integrations/mal';
import type { MalMangaHit } from '@/server/integrations/mal';
import { GET } from '@/app/api/discover/browse/route';
import type { BrowseRow } from '@/server/discover/browse';

let tmpDir: string;

function browseReq(contentType?: string): Request {
  const url = contentType
    ? `http://localhost/api/discover/browse?contentType=${contentType}`
    : 'http://localhost/api/discover/browse';
  return new Request(url);
}

beforeEach(async () => {
  tmpDir = mkdtempSync(join(tmpdir(), 'bk-discover-browse-'));
  process.env.BOOKKEEPRR_DB_PATH = join(tmpDir, 'test.db');
  const migrationsFolder = path.resolve(__dirname, '../../../../drizzle');
  migrate(getDb(), { migrationsFolder });
  vi.restoreAllMocks();
  __resetComicVineForTests();
  __resetOpenLibraryForTests();
  __resetAudnexForTests();
  __resetLibriVoxForTests();
  __clearNytBrowseCacheForTests();
  __clearITunesTopBrowseCacheForTests();
  // Default the Apple top-audiobooks feed to empty so existing audio-row
  // assertions are unaffected (the iTunes row is omitted when empty) and no test
  // hits the live feed. Tests that exercise the iTunes row override this.
  __setITunesFetcherForTests(async () => ({
    ok: true,
    status: 200,
    text: async () => JSON.stringify({ feed: { results: [] } }),
  }));
});

afterEach(async () => {
  vi.restoreAllMocks();
  __resetComicVineForTests();
  __resetOpenLibraryForTests();
  __resetAudnexForTests();
  __resetLibriVoxForTests();
  __resetITunesForTests();
  __clearNytBrowseCacheForTests();
  __clearITunesTopBrowseCacheForTests();
  await closeDb();
  rmSync(tmpDir, { recursive: true, force: true });
  delete process.env.BOOKKEEPRR_DB_PATH;
});

const mangaHit = {
  anilistId: 1,
  titleEnglish: 'Mock Manga',
  titleRomaji: 'Mock Manga',
  titleNative: null,
  coverUrl: 'https://example.com/cover.jpg',
  status: 'releasing' as const,
  format: 'MANGA',
  startYear: 2020,
};

function mockAllProviders() {
  vi.spyOn(anilistCache, 'searchMangaCached').mockResolvedValue([mangaHit]);
  vi.spyOn(anilistCache, 'searchNovelCached').mockResolvedValue([]);
  // trending/fresh rails call the AniList client directly (sorted browse), not
  // the text-search cache. Stub them so tests are deterministic + fast.
  vi.spyOn(anilistClient, 'trendingManga').mockResolvedValue([mangaHit]);
  vi.spyOn(anilistClient, 'recentManga').mockResolvedValue([mangaHit]);
  // popular row is now AniList POPULARITY_DESC (manga-only), not the bestseller
  // fan-out. Stub it so the popular row is deterministic.
  vi.spyOn(anilistClient, 'popularManga').mockResolvedValue([mangaHit]);
  __setComicVineFetcherForTests(async () => ({
    ok: false,
    status: 404,
    headers: {},
    text: async () => '',
  }));
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
  // No comic vine API key
  return comicVineApiKeySetting.set('');
}

describe('GET /api/discover/browse', () => {
  it('returns 3 rows', async () => {
    await mockAllProviders();

    const res = await GET(browseReq());
    expect(res.status).toBe(200);
    const body = await res.json() as { rows: BrowseRow[] };
    expect(Array.isArray(body.rows)).toBe(true);
    expect(body.rows).toHaveLength(3);
  });

  it('row ids are trending, popular, fresh', async () => {
    await mockAllProviders();

    const res = await GET(browseReq());
    const body = await res.json() as { rows: BrowseRow[] };
    const ids = body.rows.map((r) => r.id);
    expect(ids).toContain('trending');
    expect(ids).toContain('popular');
    expect(ids).toContain('fresh');
  });

  it('each row has label, meta, and items array', async () => {
    await mockAllProviders();

    const res = await GET(browseReq());
    const body = await res.json() as { rows: BrowseRow[] };
    for (const row of body.rows) {
      expect(typeof row.label).toBe('string');
      expect(typeof row.meta).toBe('string');
      expect(Array.isArray(row.items)).toBe(true);
    }
  });

  it('each item has detail and inLib fields', async () => {
    await mockAllProviders();

    const res = await GET(browseReq());
    const body = await res.json() as { rows: BrowseRow[] };
    // Find a row with at least one item
    const rowWithItems = body.rows.find((r) => r.items.length > 0);
    if (rowWithItems) {
      const item = rowWithItems.items[0]!;
      expect('detail' in item).toBe(true);
      expect('inLib' in item).toBe(true);
      expect(typeof item.inLib).toBe('boolean');
    }
  });

  it('rows contain at least 1 item across all three when manga provider returns results', async () => {
    await mockAllProviders();

    const res = await GET(browseReq());
    const body = await res.json() as { rows: BrowseRow[] };
    const totalItems = body.rows.reduce((sum, r) => sum + r.items.length, 0);
    // We mock manga to return 1 hit — called 3x (once per row), so total >= 3
    expect(totalItems).toBeGreaterThanOrEqual(1);
  });

  const malHit: MalMangaHit = {
    source: 'mal',
    malId: 1735,
    title: 'Naruto',
    titles: { main: 'Naruto', en: 'Naruto', ja: null, synonyms: [], all: ['Naruto'] },
    coverUrl: 'https://cdn.myanimelist.net/x.jpg',
    status: 'finished',
    totalVolumes: 72,
    totalChapters: 700,
    year: 1999,
    mediaType: 'manga',
  };

  it('sources the trending row from MAL ranking, carrying malId/sources.mal, when source=mal and MAL is configured', async () => {
    await mockAllProviders();
    await malClientIdSetting.set('mal-cid');
    await discoverTrendingSourceSetting.set('mal');
    const rankingSpy = vi.spyOn(mal, 'getMangaRankingMal').mockResolvedValue([malHit]);

    const res = await GET(browseReq());
    const body = await res.json() as { rows: BrowseRow[] };
    const trending = body.rows.find((r) => r.id === 'trending')!;

    expect(rankingSpy).toHaveBeenCalledWith('bypopularity', 18, 0);
    expect(trending.items).toHaveLength(1);
    const item = trending.items[0]!;
    expect(item.source).toBe('mal');
    expect(item.sourceId).toBe('mal:1735');
    expect(item.malId).toBe(1735);
    expect(item.sources?.mal).toBe(1735);
    expect(item.contentType).toBe('manga');
    expect(item.title).toBe('Naruto');
  });

  it('sources the popular row from AniList POPULARITY_DESC (manga-only)', async () => {
    await mockAllProviders();
    const popularSpy = vi
      .spyOn(anilistClient, 'popularManga')
      .mockResolvedValue([{ ...mangaHit, anilistId: 77, titleEnglish: 'Popular Manga' }]);

    const res = await GET(browseReq());
    const body = (await res.json()) as { rows: BrowseRow[] };
    const popular = body.rows.find((r) => r.id === 'popular')!;

    expect(popularSpy).toHaveBeenCalled();
    expect(popular.meta).toBe('AniList · popular');
    expect(popular.items).toHaveLength(1);
    const item = popular.items[0]!;
    expect(item.contentType).toBe('manga');
    expect(item.source).toBe('anilist');
    expect(item.sourceId).toBe('77');
    expect(item.title).toBe('Popular Manga');
  });

  it('defaults to AniList trending and never calls MAL ranking (source=anilist)', async () => {
    await mockAllProviders();
    await malClientIdSetting.set('mal-cid'); // MAL configured but source defaults to anilist
    const rankingSpy = vi.spyOn(mal, 'getMangaRankingMal').mockResolvedValue([malHit]);
    const trendingSpy = vi.spyOn(anilistClient, 'trendingManga').mockResolvedValue([mangaHit]);

    const res = await GET(browseReq());
    const body = await res.json() as { rows: BrowseRow[] };
    const trending = body.rows.find((r) => r.id === 'trending')!;

    expect(rankingSpy).not.toHaveBeenCalled();
    expect(trendingSpy).toHaveBeenCalled();
    expect(trending.items.some((i) => i.source === 'mal')).toBe(false);
    expect(trending.items.some((i) => i.source === 'anilist')).toBe(true);
  });

  it('falls back to AniList trending when source=mal but MAL is not configured', async () => {
    await mockAllProviders();
    await malClientIdSetting.set(''); // not configured
    await discoverTrendingSourceSetting.set('mal');
    const rankingSpy = vi.spyOn(mal, 'getMangaRankingMal').mockResolvedValue([malHit]);
    const trendingSpy = vi.spyOn(anilistClient, 'trendingManga').mockResolvedValue([mangaHit]);

    const res = await GET(browseReq());
    const body = await res.json() as { rows: BrowseRow[] };
    const trending = body.rows.find((r) => r.id === 'trending')!;

    expect(rankingSpy).not.toHaveBeenCalled();
    expect(trendingSpy).toHaveBeenCalled();
    expect(trending.items.some((i) => i.source === 'mal')).toBe(false);
    expect(trending.items.some((i) => i.source === 'anilist')).toBe(true);
  });
});

describe('GET /api/discover/browse — content-type-aware rows', () => {
  const novelHit = {
    anilistId: 42,
    titleEnglish: 'Mock Novel',
    titleRomaji: 'Mock Novel',
    titleNative: null,
    coverUrl: 'https://example.com/novel.jpg',
    status: 'releasing' as const,
    format: 'LIGHT_NOVEL',
    startYear: 2023,
    author: 'Mock Author',
  };

  it('light_novel returns trending + fresh rows from trendingNovels/recentNovels', async () => {
    const trendingSpy = vi
      .spyOn(anilistClient, 'trendingNovels')
      .mockResolvedValue([{ ...novelHit, anilistId: 1 }]);
    const recentSpy = vi
      .spyOn(anilistClient, 'recentNovels')
      .mockResolvedValue([{ ...novelHit, anilistId: 2 }]);

    const res = await GET(browseReq('light_novel'));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { rows: BrowseRow[] };
    expect(trendingSpy).toHaveBeenCalled();
    expect(recentSpy).toHaveBeenCalled();

    const ids = body.rows.map((r) => r.id);
    expect(ids).toEqual(['novel-trending', 'novel-fresh']);

    const trending = body.rows.find((r) => r.id === 'novel-trending')!;
    expect(trending.items).toHaveLength(1);
    const item = trending.items[0]!;
    expect(item.contentType).toBe('light_novel');
    expect(item.source).toBe('anilist');
    expect(item.sourceId).toBe('1');
    expect(item.title).toBe('Mock Novel');
    expect(item.author).toBe('Mock Author');

    const fresh = body.rows.find((r) => r.id === 'novel-fresh')!;
    expect(fresh.items[0]!.sourceId).toBe('2');
  });

  it('ebook returns a trending row from Open Library /trending', async () => {
    __setOpenLibraryFetcherForTests(async (url) => {
      if (url.includes('/trending/')) {
        return {
          ok: true,
          status: 200,
          text: async () =>
            JSON.stringify({
              works: [
                {
                  key: '/works/OL1W',
                  title: 'Trending Ebook',
                  author_name: ['Book Author'],
                  first_publish_year: 2022,
                  cover_i: 999,
                },
              ],
            }),
        };
      }
      return { ok: true, status: 200, text: async () => JSON.stringify({ numFound: 0, docs: [] }) };
    });

    const res = await GET(browseReq('ebook'));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { rows: BrowseRow[] };
    expect(body.rows.map((r) => r.id)).toEqual(['ebook-trending']);
    const trending = body.rows[0]!;
    expect(trending.items).toHaveLength(1);
    const item = trending.items[0]!;
    expect(item.contentType).toBe('ebook');
    expect(item.source).toBe('openlibrary');
    expect(item.sourceId).toBe('OL1W');
    expect(item.title).toBe('Trending Ebook');
    expect(item.author).toBe('Book Author');
  });

  // Regression: Open Library's /trending endpoint reliably takes ~5–6s, which
  // exceeds the default 4s browse budget and used to leave the eBook rail empty.
  // The eBook row gets a longer (slow-provider) timeout — a response that lands
  // after 4s but before the longer budget must still populate the rail.
  it('ebook trending tolerates a slow (>4s) Open Library response', async () => {
    vi.useFakeTimers();
    try {
      __setOpenLibraryFetcherForTests(
        (url) =>
          new Promise((resolve) =>
            setTimeout(
              () =>
                resolve({
                  ok: true,
                  status: 200,
                  text: async () =>
                    url.includes('/trending/')
                      ? JSON.stringify({ works: [{ key: '/works/OL9W', title: 'Slow Ebook' }] })
                      : JSON.stringify({ numFound: 0, docs: [] }),
                }),
              6000,
            ),
          ),
      );

      const promise = GET(browseReq('ebook'));
      await vi.advanceTimersByTimeAsync(6000);
      const res = await promise;
      const body = (await res.json()) as { rows: BrowseRow[] };
      expect(body.rows[0]!.items).toHaveLength(1);
      expect(body.rows[0]!.items[0]!.title).toBe('Slow Ebook');
    } finally {
      vi.useRealTimers();
    }
  });

  it('comic returns no rows when ComicVine is not configured', async () => {
    await comicVineApiKeySetting.set('');
    const res = await GET(browseReq('comic'));
    const body = (await res.json()) as { rows: BrowseRow[] };
    expect(body.rows).toEqual([]);
  });

  it('comic returns a comic-recent row from recentVolumes when ComicVine is configured', async () => {
    await comicVineApiKeySetting.set('CV-KEY');
    const cvUrls: string[] = [];
    __setComicVineFetcherForTests(async (url) => {
      cvUrls.push(url);
      return {
        ok: true,
        status: 200,
        headers: {},
        text: async () =>
          JSON.stringify({
            error: 'OK',
            status_code: 1,
            number_of_total_results: 1,
            results: [
              {
                id: 4242,
                name: 'Fresh Comic',
                publisher: { id: 1, name: 'Image' },
                start_year: '2025',
                count_of_issues: 6,
                image: { small_url: 'https://example.com/fresh.jpg' },
                description: null,
              },
            ],
          }),
      };
    });

    const res = await GET(browseReq('comic'));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { rows: BrowseRow[] };
    expect(body.rows.map((r) => r.id)).toEqual(['comic-recent']);

    const row = body.rows[0]!;
    expect(row.label).toBe('Recently added');
    expect(row.meta).toBe('ComicVine');
    expect(row.items).toHaveLength(1);
    const item = row.items[0]!;
    expect(item.contentType).toBe('comic');
    expect(item.source).toBe('comicvine');
    expect(item.sourceId).toBe('4242');
    expect(item.title).toBe('Fresh Comic');
    expect(item.author).toBe('Image');
    expect(item.year).toBe(2025);

    // confirms the recent-sort endpoint was hit, not search
    expect(cvUrls.some((u) => u.includes('sort=date_added%3Adesc'))).toBe(true);
  });

  it('audiobook returns an audio-bestsellers (NYT) row when NYT is configured', async () => {
    await nytApiKeySetting.set('nyt-key');
    const nytSpy = vi.spyOn(nyt, 'getAudioBestsellers').mockResolvedValue([
      {
        title: 'The Silent Hour',
        author: 'Jane Doe',
        coverUrl: 'https://nyt/img.jpg',
        isbn: '9781234567890',
        description: 'A thriller.',
        rank: 1,
      },
    ]);

    const res = await GET(browseReq('audiobook'));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { rows: BrowseRow[] };
    expect(body.rows.map((r) => r.id)).toEqual(['audio-bestsellers']);
    expect(nytSpy).toHaveBeenCalled();

    const row = body.rows[0]!;
    expect(row.label).toBe('Audiobook bestsellers');
    expect(row.meta).toBe('NYT');
    expect(row.items).toHaveLength(1);
    const item = row.items[0]!;
    expect(item.contentType).toBe('audiobook');
    expect(item.source).toBe('nyt');
    expect(item.sourceId).toBe('nyt:9781234567890');
    expect(item.title).toBe('The Silent Hour');
    expect(item.author).toBe('Jane Doe');
    expect(item.coverUrl).toBe('https://nyt/img.jpg');
    expect(item.isbn).toBe('9781234567890');
  });

  it('caches the NYT bestseller result across calls within the TTL', async () => {
    await nytApiKeySetting.set('nyt-key');
    const nytSpy = vi.spyOn(nyt, 'getAudioBestsellers').mockResolvedValue([
      {
        title: 'Cached Book',
        author: 'A',
        coverUrl: null,
        isbn: '111',
        description: null,
        rank: 1,
      },
    ]);

    await GET(browseReq('audiobook'));
    await GET(browseReq('audiobook'));
    // Second call within the TTL must reuse the cached result, not refetch.
    expect(nytSpy).toHaveBeenCalledTimes(1);
  });

  it('audiobook falls back to a LibriVox row when NYT is not configured', async () => {
    await nytApiKeySetting.set('');
    const nytSpy = vi.spyOn(nyt, 'getAudioBestsellers');
    __setLibriVoxFetcherForTests(async () => ({
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify({
          books: [
            {
              id: '1234',
              title: 'Pride and Prejudice',
              description: 'A classic.',
              authors: [{ first_name: 'Jane', last_name: 'Austen' }],
            },
          ],
        }),
    }));

    const res = await GET(browseReq('audiobook'));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { rows: BrowseRow[] };
    expect(body.rows.map((r) => r.id)).toEqual(['audio-librivox']);
    expect(nytSpy).not.toHaveBeenCalled();

    const row = body.rows[0]!;
    expect(row.label).toBe('Free audiobooks');
    expect(row.meta).toBe('LibriVox');
    expect(row.items).toHaveLength(1);
    const item = row.items[0]!;
    expect(item.contentType).toBe('audiobook');
    expect(item.source).toBe('librivox');
    expect(item.sourceId).toBe('librivox:1234');
    expect(item.title).toBe('Pride and Prejudice');
    expect(item.author).toBe('Jane Austen');
    expect(item.coverUrl).toBeNull();
  });

  it('leads with a Popular audiobooks (Apple/iTunes) row when the feed has data', async () => {
    await nytApiKeySetting.set('nyt-key');
    vi.spyOn(nyt, 'getAudioBestsellers').mockResolvedValue([]);
    __setITunesFetcherForTests(async () => ({
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify({
          feed: {
            results: [
              {
                id: '555',
                name: 'Greenlights',
                artistName: 'Matthew McConaughey',
                artworkUrl100: 'https://is1.mzstatic.com/a/100x100bb.jpg',
                releaseDate: '2020-10-20',
              },
            ],
          },
        }),
    }));

    const res = await GET(browseReq('audiobook'));
    const body = (await res.json()) as { rows: BrowseRow[] };
    const top = body.rows.find((r) => r.id === 'audio-itunes-top');
    expect(top).toBeDefined();
    expect(body.rows[0]!.id).toBe('audio-itunes-top'); // leads
    expect(top!.label).toBe('Popular audiobooks');
    const item = top!.items[0]!;
    expect(item.source).toBe('itunes');
    expect(item.sourceId).toBe('itunes:555');
    expect(item.title).toBe('Greenlights');
    expect(item.coverUrl).toBe('https://is1.mzstatic.com/a/600x600bb.jpg');
  });

  it('flows the derived archive.org cover from LibriVox to the tile', async () => {
    await nytApiKeySetting.set('');
    vi.spyOn(nyt, 'getAudioBestsellers');
    __setLibriVoxFetcherForTests(async () => ({
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify({
          books: [
            {
              id: '711',
              title: 'The Count of Monte Cristo',
              authors: [{ first_name: 'Alexandre', last_name: 'Dumas' }],
              url_zip_file:
                'https://archive.org/compress/count_monte_cristo_0711_librivox/formats=64KBPS MP3&file=/count_monte_cristo_0711_librivox.zip',
            },
          ],
        }),
    }));

    const res = await GET(browseReq('audiobook'));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { rows: BrowseRow[] };
    const item = body.rows[0]!.items[0]!;
    expect(item.coverUrl).toBe(
      'https://archive.org/services/img/count_monte_cristo_0711_librivox',
    );
  });

  it('defaults to manga when no contentType param is given', async () => {
    await mockAllProviders();
    const res = await GET(browseReq());
    const body = (await res.json()) as { rows: BrowseRow[] };
    expect(body.rows.map((r) => r.id)).toEqual(['trending', 'popular', 'fresh']);
  });

  it('rejects an unknown contentType with 400', async () => {
    const res = await GET(browseReq('nonsense'));
    expect(res.status).toBe(400);
  });
});
