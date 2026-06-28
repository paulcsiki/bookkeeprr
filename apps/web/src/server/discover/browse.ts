// Browse: curated rows of discovery content (trending / popular / fresh).
//
// NOTE: AniList and most providers do not expose dedicated trending/popular/
// fresh sorted endpoints via their public search API. We simulate the three
// rows by searching curated query strings and sorting by startDate desc for
// "fresh". This is a best-effort approximation — a follow-up (DC2) can
// replace individual provider calls with ranked queries once the providers
// expose those endpoints.
//
// TODO: When AniList exposes MediaSort:TRENDING_DESC / POPULARITY_DESC via
// the search endpoint, replace the curated query strings below with proper
// ranked queries.

import {
  recentManga,
  trendingManga,
  popularManga,
  recentNovels,
  trendingNovels,
} from '@/server/integrations/anilist/client';
import { comicVineApiKeySetting, isComicVineConfigured } from '@/server/db/settings/comicvine';
import { discoverTrendingSourceSetting } from '@/server/db/settings/discover';
import { recentVolumes } from '@/server/integrations/comicvine';
import { trendingBooks } from '@/server/integrations/openlibrary';
import { getAudioBestsellers, type NytAudioHit } from '@/server/integrations/nyt';
import { getRecentAudiobooks } from '@/server/integrations/librivox';
import { topAudiobooks, type ITunesAudiobookHit } from '@/server/integrations/itunes';
import { nytApiKeySetting, isNytConfigured } from '@/server/db/settings/nyt';
import { getMangaRankingMal } from '@/server/integrations/mal';
import { malClientIdSetting, isMalConfigured } from '@/server/db/settings/mal';
import { formatDetail } from './format-detail';
import { findInLib } from './in-lib';
import type { ContentType } from '@/server/content-type';
import { logger } from '@/server/logger';

const BROWSE_TIMEOUT_MS = 4_000;
// Some providers are reliably slow on a cold fetch. Open Library's /trending
// endpoint measures ~5–6s end-to-end (server-side compute), which blows the
// default 4s budget and leaves the eBook rail empty. Give known-slow providers
// a longer leash; their results are cached for 5min after the first success, so
// only the cold load pays it.
const SLOW_PROVIDER_TIMEOUT_MS = 10_000;
const ROW_CAP = 12;
/** Page size for the "See all" paginated category view (infinite scroll). */
const CATEGORY_PAGE_SIZE = 18;

export type BrowseResultItem = {
  contentType: ContentType;
  sourceId: string;
  title: string;
  year?: number | null;
  author?: string | null;
  isbn?: string | null;
  coverUrl?: string | null;
  source: string;
  detail: string | null;
  inLib: boolean;
  /**
   * MyAnimeList id for manga items, when known. null/absent otherwise. Mirrors
   * `sources.mal` and is what the Add flow reads to persist the cross-link.
   */
  malId?: number | null;
  /** Provider IDs this item is cross-linked to, when known. Mirrors DiscoverResult.sources. */
  sources?: {
    anilist?: number;
    mangadex?: string;
    mal?: number;
    comicvine?: number;
    openlibrary?: string;
    audnex?: string;
  };
};

export type BrowseRowId =
  | 'trending'
  | 'popular'
  | 'fresh'
  | 'novel-trending'
  | 'novel-fresh'
  | 'ebook-trending'
  | 'comic-recent'
  | 'audio-bestsellers'
  | 'audio-librivox'
  | 'audio-itunes-top';

export type BrowseRow = {
  id: BrowseRowId;
  label: string;
  meta: string;
  items: BrowseResultItem[];
};

/** Wraps a promise with a timeout. Resolves to [] if the promise times out or rejects. */
async function withTimeout<T>(
  p: Promise<T[]>,
  source: string,
  timeoutMs: number = BROWSE_TIMEOUT_MS,
): Promise<T[]> {
  const timeout = new Promise<T[]>((resolve) => setTimeout(() => resolve([]), timeoutMs));
  try {
    return await Promise.race([p, timeout]);
  } catch (err) {
    logger().child({ component: 'browse', source }).warn({ err }, 'provider timed out or failed');
    return [];
  }
}

// ---------------------------------------------------------------------------
// Per-type provider helpers
// ---------------------------------------------------------------------------

/** Maps AniList manga SearchHits to BrowseResultItems (no slicing). */
function mapMangaHits(hits: Awaited<ReturnType<typeof trendingManga>>): BrowseResultItem[] {
  return hits.map((h) => ({
    contentType: 'manga' as const,
    sourceId: String(h.anilistId),
    title: h.titleEnglish ?? h.titleRomaji ?? h.titleNative ?? '',
    year: h.startYear,
    author: h.author ?? null,
    coverUrl: h.coverUrl,
    source: 'anilist',
    detail: formatDetail('manga', { year: h.startYear, status: h.status }),
    inLib: false,
    sources: { anilist: h.anilistId },
  }));
}

/** Maps MAL ranking hits to BrowseResultItems (no slicing). */
function mapMalHits(hits: Awaited<ReturnType<typeof getMangaRankingMal>>): BrowseResultItem[] {
  return hits.map((h) => ({
    contentType: 'manga' as const,
    sourceId: `mal:${h.malId}`,
    title: h.titles.en ?? h.titles.main,
    year: h.year,
    author: null,
    coverUrl: h.coverUrl,
    source: 'mal',
    detail: formatDetail('manga', { year: h.year, status: h.status }),
    inLib: false,
    malId: h.malId,
    sources: { mal: h.malId },
  }));
}

async function browseRecentManga(page = 1): Promise<BrowseResultItem[]> {
  return mapMangaHits(await recentManga(page)).slice(0, ROW_CAP);
}

/**
 * Trending manga from AniList's real TRENDING_DESC sort — what's hot right now,
 * not a text-query approximation. The default source for the "Trending now"
 * row.
 */
async function browseAnilistTrending(page = 1): Promise<BrowseResultItem[]> {
  return mapMangaHits(await trendingManga(page)).slice(0, ROW_CAP);
}

/** Popular manga from AniList's POPULARITY_DESC sort (manga-only). */
async function browsePopularManga(page = 1): Promise<BrowseResultItem[]> {
  return mapMangaHits(await popularManga(page)).slice(0, ROW_CAP);
}

/**
 * Trending manga sourced from MyAnimeList's popularity ranking — real popular
 * titles, not a text-query approximation. Used for the "Trending now" row when
 * the trending source is set to MAL and MAL is configured. Resilient:
 * getMangaRankingMal returns [] on 404.
 */
async function browseMalTrending(page = 1): Promise<BrowseResultItem[]> {
  const offset = (page - 1) * CATEGORY_PAGE_SIZE;
  return mapMalHits(await getMangaRankingMal('bypopularity', CATEGORY_PAGE_SIZE, offset)).slice(
    0,
    ROW_CAP,
  );
}

function mapNovelHits(
  hits: Awaited<ReturnType<typeof trendingNovels>>,
): BrowseResultItem[] {
  return hits.map((h) => ({
    contentType: 'light_novel' as const,
    sourceId: String(h.anilistId),
    title: h.titleEnglish ?? h.titleRomaji ?? h.titleNative ?? '',
    year: h.startYear,
    author: h.author ?? null,
    coverUrl: h.coverUrl,
    source: 'anilist',
    detail: formatDetail('light_novel', { year: h.startYear }),
    inLib: false,
    sources: { anilist: h.anilistId },
  }));
}

/** Trending light novels from AniList's real TRENDING_DESC sort. */
async function browseNovelTrending(page = 1): Promise<BrowseResultItem[]> {
  return mapNovelHits(await trendingNovels(page)).slice(0, ROW_CAP);
}

/** Genuinely-recent light novels from AniList's START_DATE_DESC sort. */
async function browseNovelRecent(page = 1): Promise<BrowseResultItem[]> {
  return mapNovelHits(await recentNovels(page)).slice(0, ROW_CAP);
}

/** Maps Open Library trending hits to BrowseResultItems (no slicing). */
function mapEbookHits(hits: Awaited<ReturnType<typeof trendingBooks>>): BrowseResultItem[] {
  return hits.map((h) => ({
    contentType: 'ebook' as const,
    sourceId: h.olid,
    title: h.title,
    year: h.firstPublishYear,
    author: h.author,
    isbn: h.isbn,
    coverUrl: h.coverUrl,
    source: 'openlibrary',
    detail: formatDetail('ebook', { year: h.firstPublishYear }),
    inLib: false,
  }));
}

/** Trending eBooks from Open Library's /trending/daily endpoint. */
async function browseEbookTrending(page = 1): Promise<BrowseResultItem[]> {
  const offset = (page - 1) * CATEGORY_PAGE_SIZE;
  return mapEbookHits(await trendingBooks('daily', CATEGORY_PAGE_SIZE, offset)).slice(0, ROW_CAP);
}

/** Maps ComicVine volume hits to BrowseResultItems (no slicing). */
function mapComicHits(hits: Awaited<ReturnType<typeof recentVolumes>>): BrowseResultItem[] {
  return hits.map((h) => ({
    contentType: 'comic' as const,
    sourceId: String(h.comicvineId),
    title: h.name,
    year: h.startYear,
    author: h.publisher,
    coverUrl: h.coverUrl,
    source: 'comicvine',
    detail: formatDetail('comic', { year: h.startYear, volumeCount: h.issueCount }),
    inLib: false,
  }));
}

/** Genuinely-recent comics from ComicVine's date_added:desc sort. */
async function browseComicsRecent(page = 1): Promise<BrowseResultItem[]> {
  const apiKey = await comicVineApiKeySetting.get();
  if (!isComicVineConfigured(apiKey)) return [];
  const offset = (page - 1) * CATEGORY_PAGE_SIZE;
  return mapComicHits(await recentVolumes(apiKey, CATEGORY_PAGE_SIZE, offset)).slice(0, ROW_CAP);
}

// ---------------------------------------------------------------------------
// Audiobook browse rows
//
// NYT/LibriVox tiles carry NO Audible ASIN — they are keyed by isbn (NYT) or a
// LibriVox id. The Add flow resolves an ASIN on add (search Audible by
// "title author"). Here we only set `source` ('nyt' / 'librivox') and a
// namespaced `sourceId` so the add path can tell these apart from real
// audnex tiles.
// ---------------------------------------------------------------------------

// NYT is daily-quota-limited, so cache the bestseller result module-side with a
// 30-minute TTL. Repeated Discover loads within the window reuse it rather than
// burning the daily allowance. The cache is keyed by the configured API key so a
// key change invalidates it implicitly (a different key → a cache miss).
const NYT_TTL_MS = 30 * 60_000;
let nytCache: { key: string; hits: NytAudioHit[]; expiresAt: number } | null = null;

export function __clearNytBrowseCacheForTests(): void {
  nytCache = null;
}

export async function getAudioBestsellersCached(apiKey: string): Promise<NytAudioHit[]> {
  const now = Date.now();
  if (nytCache && nytCache.key === apiKey && nytCache.expiresAt > now) {
    return nytCache.hits;
  }
  const hits = await getAudioBestsellers();
  nytCache = { key: apiKey, hits, expiresAt: now + NYT_TTL_MS };
  return hits;
}

async function browseNytAudiobooks(apiKey: string): Promise<BrowseResultItem[]> {
  const hits = await getAudioBestsellersCached(apiKey);
  return mapNytHits(hits).slice(0, ROW_CAP);
}

/** Maps NYT bestseller hits to BrowseResultItems (no slicing). */
function mapNytHits(hits: NytAudioHit[]): BrowseResultItem[] {
  return hits.map((h) => ({
    contentType: 'audiobook' as const,
    sourceId: `nyt:${h.isbn ?? h.title}`,
    title: h.title,
    author: h.author,
    isbn: h.isbn,
    coverUrl: h.coverUrl,
    source: 'nyt',
    detail: formatDetail('audiobook', {}),
    inLib: false,
  }));
}

/** Maps LibriVox hits to BrowseResultItems (no slicing). */
function mapLibriVoxHits(
  hits: Awaited<ReturnType<typeof getRecentAudiobooks>>,
): BrowseResultItem[] {
  return hits.map((h) => ({
    contentType: 'audiobook' as const,
    sourceId: `librivox:${h.librivoxId}`,
    title: h.title,
    author: h.author,
    coverUrl: h.coverUrl,
    source: 'librivox',
    detail: formatDetail('audiobook', {}),
    inLib: false,
  }));
}

async function browseLibriVoxAudiobooks(page = 1): Promise<BrowseResultItem[]> {
  const offset = (page - 1) * CATEGORY_PAGE_SIZE;
  return mapLibriVoxHits(await getRecentAudiobooks(CATEGORY_PAGE_SIZE, offset)).slice(0, ROW_CAP);
}

// Apple's top-audiobooks chart is keyless but a single ~100-item feed; cache it
// module-side (30 min) so paging "show all" and repeated Discover loads reuse one
// fetch.
const ITUNES_TOP_TTL_MS = 30 * 60_000;
let itunesTopCache: { hits: ITunesAudiobookHit[]; expiresAt: number } | null = null;

export function __clearITunesTopBrowseCacheForTests(): void {
  itunesTopCache = null;
}

async function getITunesTopCached(): Promise<ITunesAudiobookHit[]> {
  const now = Date.now();
  if (itunesTopCache && itunesTopCache.expiresAt > now) return itunesTopCache.hits;
  const hits = await topAudiobooks(100);
  itunesTopCache = { hits, expiresAt: now + ITUNES_TOP_TTL_MS };
  return hits;
}

function mapITunesHits(hits: ITunesAudiobookHit[]): BrowseResultItem[] {
  return hits.map((h) => ({
    contentType: 'audiobook' as const,
    sourceId: `itunes:${h.id}`,
    title: h.title,
    author: h.author,
    coverUrl: h.coverUrl,
    source: 'itunes',
    detail: formatDetail('audiobook', { year: h.releaseYear }),
    inLib: false,
  }));
}

/** Batch-populates the inLib flag on a list of browse items. */
async function enrichWithInLib(items: BrowseResultItem[]): Promise<BrowseResultItem[]> {
  if (items.length === 0) return items;
  const inLibSet = await findInLib(items.map((r) => ({ title: r.title, contentType: r.contentType })));
  return items.map((r) => ({
    ...r,
    inLib: inLibSet.has(`${r.contentType}::${r.title.toLowerCase().trim()}`),
  }));
}

// ---------------------------------------------------------------------------
// Public: getBrowseRows
// ---------------------------------------------------------------------------

/**
 * Returns content-type-aware browse rows for the Discover page.
 *
 *   - manga      → trending (AniList/MAL per setting) + popular + fresh
 *   - light_novel → trending + fresh (AniList NOVEL format sorts)
 *   - ebook      → trending (Open Library /trending/daily)
 *   - comic      → recently added (ComicVine date_added:desc) when configured, else []
 *   - audiobook  → no browse source → [] (search-only state)
 */
export async function getBrowseRows(contentType: ContentType): Promise<BrowseRow[]> {
  switch (contentType) {
    case 'manga':
      return getMangaBrowseRows();
    case 'light_novel':
      return getNovelBrowseRows();
    case 'ebook':
      return getEbookBrowseRows();
    case 'comic':
      return getComicBrowseRows();
    case 'audiobook':
      return getAudiobookBrowseRows();
  }
}

// ---------------------------------------------------------------------------
// Public: getBrowseCategory — paginated "See all" for a single row
// ---------------------------------------------------------------------------

export type BrowseCategoryResult = {
  items: BrowseResultItem[];
  hasMore: boolean;
};

/**
 * Returns one page of a single Discover category (the "See all" infinite-scroll
 * view). `page` is 1-based; pages hold up to `CATEGORY_PAGE_SIZE` items.
 *
 * `hasMore` is computed from the page fill: a full page (length ===
 * CATEGORY_PAGE_SIZE) implies another page may exist; a short/empty page means
 * the source is exhausted. Limitations:
 *   - NYT 'audio-bestsellers' is a fixed ~15-item list with no paging → page 1
 *     returns the list with hasMore=false; later pages return [].
 *   - Open Library 'ebook-trending' has no real offset cursor; the client
 *     fetches a larger page and slices, so hasMore goes false once the period's
 *     trending list runs out.
 *   - Unconfigured ComicVine ('comic-recent') / NYT → empty + hasMore=false.
 *
 * Returns empty + hasMore=false for an unknown (contentType, rowId) pairing.
 */
export async function getBrowseCategory(
  contentType: ContentType,
  rowId: string,
  page = 1,
): Promise<BrowseCategoryResult> {
  const raw = await fetchCategoryPage(contentType, rowId, page);
  const items = await enrichWithInLib(raw.items);
  return { items, hasMore: raw.hasMore };
}

/**
 * Maps a (contentType, rowId) pair to its paginated fetcher and returns the raw
 * (un-enriched) page plus hasMore. Honors the trending_source setting for manga
 * 'trending' and the ComicVine/NYT configured checks.
 */
async function fetchCategoryPage(
  contentType: ContentType,
  rowId: string,
  page: number,
): Promise<BrowseCategoryResult> {
  // offset is for MAL/OL/CV/LibriVox; AniList branches use 1-based `page` directly.
  const offset = (page - 1) * CATEGORY_PAGE_SIZE;
  const full = (items: BrowseResultItem[]): BrowseCategoryResult => ({
    items,
    hasMore: items.length >= CATEGORY_PAGE_SIZE,
  });

  switch (contentType) {
    case 'manga': {
      if (rowId === 'trending') {
        const [trendingPref, malOn] = await Promise.all([
          discoverTrendingSourceSetting.get(),
          malClientIdSetting.get().then(isMalConfigured),
        ]);
        if (trendingPref === 'mal' && malOn) {
          const items = mapMalHits(
            await getMangaRankingMal('bypopularity', CATEGORY_PAGE_SIZE, offset),
          );
          return full(items);
        }
        return full(mapMangaHits(await trendingManga(page)));
      }
      if (rowId === 'popular') return full(mapMangaHits(await popularManga(page)));
      if (rowId === 'fresh') return full(mapMangaHits(await recentManga(page)));
      break;
    }
    case 'light_novel': {
      if (rowId === 'novel-trending') return full(mapNovelHits(await trendingNovels(page)));
      if (rowId === 'novel-fresh') return full(mapNovelHits(await recentNovels(page)));
      break;
    }
    case 'ebook': {
      if (rowId === 'ebook-trending') {
        return full(mapEbookHits(await trendingBooks('daily', CATEGORY_PAGE_SIZE, offset)));
      }
      break;
    }
    case 'comic': {
      if (rowId === 'comic-recent') {
        const apiKey = await comicVineApiKeySetting.get();
        if (!isComicVineConfigured(apiKey)) return { items: [], hasMore: false };
        return full(mapComicHits(await recentVolumes(apiKey, CATEGORY_PAGE_SIZE, offset)));
      }
      break;
    }
    case 'audiobook': {
      if (rowId === 'audio-itunes-top') {
        // One cached ~100-item feed, paged by slicing.
        const all = mapITunesHits(await getITunesTopCached());
        const items = all.slice(offset, offset + CATEGORY_PAGE_SIZE);
        return { items, hasMore: offset + CATEGORY_PAGE_SIZE < all.length };
      }
      if (rowId === 'audio-bestsellers') {
        const apiKey = await nytApiKeySetting.get();
        if (!isNytConfigured(apiKey)) return { items: [], hasMore: false };
        // NYT is a fixed list with no paging: page 1 carries the whole list with
        // hasMore=false; later pages are empty.
        if (page > 1) return { items: [], hasMore: false };
        return { items: mapNytHits(await getAudioBestsellersCached(apiKey)), hasMore: false };
      }
      if (rowId === 'audio-librivox') {
        return full(mapLibriVoxHits(await getRecentAudiobooks(CATEGORY_PAGE_SIZE, offset)));
      }
      break;
    }
  }
  return { items: [], hasMore: false };
}

/**
 * Audiobook browse: when NYT is configured, the "Audiobook bestsellers" row
 * (NYT audio lists, quota-cached). Otherwise the "Free audiobooks" row
 * (LibriVox public-domain classics, no key needed). Both rows' tiles resolve an
 * Audible ASIN at add time — see the add flow.
 */
async function getAudiobookBrowseRows(): Promise<BrowseRow[]> {
  const rows: BrowseRow[] = [];

  // Popular (Apple) — keyless and deep (~100), so it leads and gives "show all"
  // real depth. Best-effort: a feed hiccup must not drop the other rows.
  try {
    const top = await withTimeout(getITunesTopCached(), 'itunes-top');
    const items = await enrichWithInLib(mapITunesHits(top).slice(0, ROW_CAP));
    if (items.length > 0) {
      rows.push({ id: 'audio-itunes-top', label: 'Popular audiobooks', meta: 'Apple', items });
    }
  } catch {
    /* best-effort */
  }

  // Then the existing curated row: NYT bestsellers when configured, else the
  // free LibriVox classics.
  const apiKey = await nytApiKeySetting.get();
  if (isNytConfigured(apiKey)) {
    const raw = await withTimeout(browseNytAudiobooks(apiKey), 'nyt-audio');
    rows.push({
      id: 'audio-bestsellers',
      label: 'Audiobook bestsellers',
      meta: 'NYT',
      items: await enrichWithInLib(raw),
    });
  } else {
    const lv = await withTimeout(browseLibriVoxAudiobooks(), 'librivox');
    rows.push({
      id: 'audio-librivox',
      label: 'Free audiobooks',
      meta: 'LibriVox',
      items: await enrichWithInLib(lv),
    });
  }

  return rows;
}

async function getComicBrowseRows(): Promise<BrowseRow[]> {
  if (!isComicVineConfigured(await comicVineApiKeySetting.get())) return [];
  const recentRaw = await withTimeout(browseComicsRecent(), 'comicvine-recent');
  const recent = await enrichWithInLib(recentRaw);
  return [
    { id: 'comic-recent', label: 'Recently added', meta: 'ComicVine', items: recent },
  ];
}

async function getNovelBrowseRows(): Promise<BrowseRow[]> {
  const [trendingRaw, freshRaw] = await Promise.all([
    withTimeout(browseNovelTrending(), 'anilist-novel-trending'),
    withTimeout(browseNovelRecent(), 'anilist-novel-recent'),
  ]);
  const [trending, fresh] = await Promise.all([
    enrichWithInLib(trendingRaw),
    enrichWithInLib(freshRaw),
  ]);
  return [
    { id: 'novel-trending', label: 'Trending now',  meta: 'AniList · trending', items: trending },
    { id: 'novel-fresh',    label: 'New this week', meta: 'Recent entries',     items: fresh },
  ];
}

async function getEbookBrowseRows(): Promise<BrowseRow[]> {
  const trendingRaw = await withTimeout(
    browseEbookTrending(),
    'openlibrary-trending',
    SLOW_PROVIDER_TIMEOUT_MS,
  );
  const trending = await enrichWithInLib(trendingRaw);
  return [
    { id: 'ebook-trending', label: 'Trending now', meta: 'Open Library · daily', items: trending },
  ];
}

async function getMangaBrowseRows(): Promise<BrowseRow[]> {
  // Three named rows: trending, popular, fresh.
  // The trending row's source is configurable (Settings → Discover):
  //   - 'anilist' (default): AniList's real TRENDING_DESC sort.
  //   - 'mal': MyAnimeList's popularity ranking, when MAL is configured;
  //     otherwise falls back to AniList trending.
  // popular/fresh still use curated queries / sorted browse.
  const [trendingPref, malOn] = await Promise.all([
    discoverTrendingSourceSetting.get(),
    malClientIdSetting.get().then(isMalConfigured),
  ]);
  // withTimeout already resolves to [] on timeout/error, so each row is resilient.
  const trendingSource =
    trendingPref === 'mal' && malOn
      ? withTimeout(browseMalTrending(), 'mal-trending')
      : withTimeout(browseAnilistTrending(), 'anilist-trending');

  const [trendingRaw, popularRaw, freshRaw] = await Promise.all([
    trendingSource,
    // popular: AniList POPULARITY_DESC, manga-only (consistent + paginatable).
    withTimeout(browsePopularManga(), 'anilist-popular'),
    // fresh: genuinely recent manga via AniList's sorted browse (a text query
    // like "new release 2024" matches no titles).
    withTimeout(browseRecentManga(), 'anilist-recent'),
  ]);

  const [trending, popular, fresh] = await Promise.all([
    enrichWithInLib(trendingRaw),
    enrichWithInLib(popularRaw),
    enrichWithInLib(freshRaw),
  ]);

  const trendingMeta =
    trendingPref === 'mal' && malOn ? 'MyAnimeList · popularity' : 'AniList · trending';

  return [
    { id: 'trending', label: 'Trending now',        meta: trendingMeta,        items: trending },
    { id: 'popular',  label: 'Popular',             meta: 'AniList · popular',  items: popular },
    { id: 'fresh',    label: 'New this week',        meta: 'Recent entries',     items: fresh },
  ];
}
