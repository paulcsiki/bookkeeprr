import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import path from 'node:path';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { closeDb, getDb } from '@/server/db/client';
import * as anilistClient from '@/server/integrations/anilist/client';
import type { SearchHit } from '@/server/integrations/anilist/schemas';
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
  __setLibriVoxFetcherForTests,
  __resetLibriVoxForTests,
} from '@/server/integrations/librivox/client';
import * as librivox from '@/server/integrations/librivox';
import { __clearNytBrowseCacheForTests, getBrowseCategory } from '@/server/discover/browse';
import * as nyt from '@/server/integrations/nyt';
import { nytApiKeySetting } from '@/server/db/settings/nyt';
import { comicVineApiKeySetting } from '@/server/db/settings/comicvine';
import { malClientIdSetting } from '@/server/db/settings/mal';
import * as mal from '@/server/integrations/mal';
import type { MalMangaHit } from '@/server/integrations/mal';
import { GET } from '@/app/api/discover/category/route';
import type { BrowseResultItem } from '@/server/discover/browse';

let tmpDir: string;

function categoryReq(params: Record<string, string>): Request {
  const qs = new URLSearchParams(params).toString();
  return new Request(`http://localhost/api/discover/category?${qs}`);
}

const PAGE = 18;

/** Builds a SearchHit page of `n` distinct manga hits, ids offset by `base`. */
function mangaPage(n: number, base = 0): SearchHit[] {
  return Array.from({ length: n }, (_, i) => ({
    anilistId: base + i + 1,
    titleEnglish: `Manga ${base + i + 1}`,
    titleRomaji: `Manga ${base + i + 1}`,
    titleNative: null,
    coverUrl: 'https://example.com/cover.jpg',
    status: 'releasing' as const,
    format: 'MANGA',
    startYear: 2020,
  }));
}

beforeEach(async () => {
  tmpDir = mkdtempSync(join(tmpdir(), 'bk-discover-category-'));
  process.env.BOOKKEEPRR_DB_PATH = join(tmpDir, 'test.db');
  const migrationsFolder = path.resolve(__dirname, '../../../../drizzle');
  migrate(getDb(), { migrationsFolder });
  vi.restoreAllMocks();
  __resetComicVineForTests();
  __resetOpenLibraryForTests();
  __resetLibriVoxForTests();
  __clearNytBrowseCacheForTests();
});

afterEach(async () => {
  vi.restoreAllMocks();
  __resetComicVineForTests();
  __resetOpenLibraryForTests();
  __resetLibriVoxForTests();
  __clearNytBrowseCacheForTests();
  await closeDb();
  rmSync(tmpDir, { recursive: true, force: true });
  delete process.env.BOOKKEEPRR_DB_PATH;
});

describe('getBrowseCategory', () => {
  it('manga trending: page 1 returns a full page with hasMore=true', async () => {
    const trendingSpy = vi.spyOn(anilistClient, 'trendingManga').mockResolvedValue(mangaPage(PAGE));

    const { items, hasMore } = await getBrowseCategory('manga', 'trending', 1);
    expect(trendingSpy).toHaveBeenCalledWith(1);
    expect(items).toHaveLength(PAGE);
    expect(hasMore).toBe(true);
    expect(items[0]!.sourceId).toBe('1');
    expect(items[0]!.source).toBe('anilist');
  });

  it('manga trending: page 2 fetches page 2 and a short page sets hasMore=false', async () => {
    const trendingSpy = vi
      .spyOn(anilistClient, 'trendingManga')
      .mockResolvedValue(mangaPage(5, 100));

    const { items, hasMore } = await getBrowseCategory('manga', 'trending', 2);
    expect(trendingSpy).toHaveBeenCalledWith(2);
    expect(items).toHaveLength(5);
    expect(hasMore).toBe(false);
    expect(items[0]!.sourceId).toBe('101');
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

  it('manga trending: honors trending_source=mal (offset paging) when MAL configured', async () => {
    await malClientIdSetting.set('mal-cid');
    await discoverTrendingSourceSetting.set('mal');
    const rankingSpy = vi.spyOn(mal, 'getMangaRankingMal').mockResolvedValue([malHit]);
    const trendingSpy = vi.spyOn(anilistClient, 'trendingManga');

    const { items, hasMore } = await getBrowseCategory('manga', 'trending', 2);
    // page 2 → offset 18
    expect(rankingSpy).toHaveBeenCalledWith('bypopularity', PAGE, PAGE);
    expect(trendingSpy).not.toHaveBeenCalled();
    expect(items).toHaveLength(1);
    expect(items[0]!.source).toBe('mal');
    expect(items[0]!.sources?.mal).toBe(1735);
    expect(hasMore).toBe(false);
  });

  it('manga popular: uses POPULARITY_DESC via popularManga', async () => {
    const popularSpy = vi.spyOn(anilistClient, 'popularManga').mockResolvedValue(mangaPage(PAGE));
    const { items, hasMore } = await getBrowseCategory('manga', 'popular', 1);
    expect(popularSpy).toHaveBeenCalledWith(1);
    expect(items).toHaveLength(PAGE);
    expect(hasMore).toBe(true);
  });

  it('novel-trending: page 2 forwards page 2 to trendingNovels', async () => {
    const trendingNovelsSpy = vi
      .spyOn(anilistClient, 'trendingNovels')
      .mockResolvedValue(mangaPage(PAGE));
    const { items, hasMore } = await getBrowseCategory('light_novel', 'novel-trending', 2);
    expect(trendingNovelsSpy).toHaveBeenCalledWith(2);
    expect(items).toHaveLength(PAGE);
    expect(items[0]!.contentType).toBe('light_novel');
    expect(items[0]!.source).toBe('anilist');
    expect(hasMore).toBe(true);
  });

  it('novel-fresh: page 2 forwards page 2 to recentNovels', async () => {
    const recentNovelsSpy = vi
      .spyOn(anilistClient, 'recentNovels')
      .mockResolvedValue(mangaPage(5, 100));
    const { items, hasMore } = await getBrowseCategory('light_novel', 'novel-fresh', 2);
    expect(recentNovelsSpy).toHaveBeenCalledWith(2);
    expect(items).toHaveLength(5);
    expect(items[0]!.contentType).toBe('light_novel');
    expect(hasMore).toBe(false);
  });

  it('ebook-trending: page 2 requests offset+limit (limit=36) from Open Library', async () => {
    // OL has no offset cursor: the client fetches offset+limit items and slices.
    // page 2 with page size 18 → offset 18 → limit=36 in the request URL.
    const works = Array.from({ length: 36 }, (_, i) => ({
      key: `/works/OL${i + 1}W`,
      title: `Book ${i + 1}`,
      author_name: [`Author ${i + 1}`],
      first_publish_year: 2020,
    }));
    let requestedUrl = '';
    __setOpenLibraryFetcherForTests(async (url: string) => {
      requestedUrl = url;
      return { ok: true, status: 200, text: async () => JSON.stringify({ works }) };
    });

    const { items, hasMore } = await getBrowseCategory('ebook', 'ebook-trending', 2);
    expect(requestedUrl).toContain('limit=36');
    // The slice keeps the second page (works 19..36) → a full PAGE.
    expect(items).toHaveLength(PAGE);
    expect(items[0]!.contentType).toBe('ebook');
    expect(items[0]!.source).toBe('openlibrary');
    expect(items[0]!.sourceId).toBe('OL19W');
    expect(hasMore).toBe(true);
  });

  it('audio-librivox: page 2 forwards (limit, offset) = (18, 18) to getRecentAudiobooks', async () => {
    const recentSpy = vi.spyOn(librivox, 'getRecentAudiobooks').mockResolvedValue(
      Array.from({ length: PAGE }, (_, i) => ({
        librivoxId: String(i + 1),
        title: `Audiobook ${i + 1}`,
        author: `Author ${i + 1}`,
        coverUrl: null,
        description: null,
      })),
    );
    const { items, hasMore } = await getBrowseCategory('audiobook', 'audio-librivox', 2);
    expect(recentSpy).toHaveBeenCalledWith(PAGE, PAGE);
    expect(items).toHaveLength(PAGE);
    expect(items[0]!.contentType).toBe('audiobook');
    expect(items[0]!.source).toBe('librivox');
    expect(hasMore).toBe(true);
  });

  it('audio-bestsellers (NYT): hasMore=false on page 1, empty on later pages', async () => {
    await nytApiKeySetting.set('nyt-key');
    const nytSpy = vi.spyOn(nyt, 'getAudioBestsellers').mockResolvedValue([
      {
        title: 'The Silent Hour',
        author: 'Jane Doe',
        coverUrl: 'https://nyt/img.jpg',
        isbn: '9781234567890',
        description: null,
        rank: 1,
      },
    ]);

    const p1 = await getBrowseCategory('audiobook', 'audio-bestsellers', 1);
    expect(nytSpy).toHaveBeenCalled();
    expect(p1.items).toHaveLength(1);
    expect(p1.hasMore).toBe(false);

    const p2 = await getBrowseCategory('audiobook', 'audio-bestsellers', 2);
    expect(p2.items).toEqual([]);
    expect(p2.hasMore).toBe(false);
  });

  it('comic-recent: empty + hasMore=false when ComicVine is unconfigured', async () => {
    await comicVineApiKeySetting.set('');
    const { items, hasMore } = await getBrowseCategory('comic', 'comic-recent', 1);
    expect(items).toEqual([]);
    expect(hasMore).toBe(false);
  });

  it('unknown row: empty + hasMore=false', async () => {
    const { items, hasMore } = await getBrowseCategory('manga', 'does-not-exist', 1);
    expect(items).toEqual([]);
    expect(hasMore).toBe(false);
  });
});

describe('GET /api/discover/category', () => {
  it('valid request returns items + hasMore', async () => {
    vi.spyOn(anilistClient, 'popularManga').mockResolvedValue(mangaPage(PAGE));
    const res = await GET(categoryReq({ contentType: 'manga', row: 'popular', page: '1' }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { items: BrowseResultItem[]; hasMore: boolean };
    expect(Array.isArray(body.items)).toBe(true);
    expect(body.items).toHaveLength(PAGE);
    expect(body.hasMore).toBe(true);
  });

  it('defaults to page 1 when page is omitted', async () => {
    const trendingSpy = vi.spyOn(anilistClient, 'trendingManga').mockResolvedValue(mangaPage(2));
    const res = await GET(categoryReq({ contentType: 'manga', row: 'trending' }));
    expect(res.status).toBe(200);
    expect(trendingSpy).toHaveBeenCalledWith(1);
  });

  it('rejects an unknown contentType with 400', async () => {
    const res = await GET(categoryReq({ contentType: 'nonsense', row: 'trending' }));
    expect(res.status).toBe(400);
  });

  it('rejects a missing row with 400', async () => {
    const res = await GET(categoryReq({ contentType: 'manga' }));
    expect(res.status).toBe(400);
  });
});
