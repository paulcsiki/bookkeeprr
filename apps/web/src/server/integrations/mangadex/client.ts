import {
  MdSearchResponse,
  MdChapterListResponse,
  MdCoverListResponse,
  mapManga,
  mapChapter,
  type MangaDexManga,
  type ChapterEntry,
} from './schemas';

const BASE = 'https://api.mangadex.org';
const REFILL_MS = 200; // 5/sec
const BUCKET = 5;
let bucket = BUCKET;
let lastRefill = Date.now();

export function __resetMdForTests(): void {
  bucket = BUCKET;
  lastRefill = Date.now();
}

function refill(): void {
  const now = Date.now();
  const tokens = Math.floor((now - lastRefill) / REFILL_MS);
  if (tokens > 0) {
    bucket = Math.min(BUCKET, bucket + tokens);
    lastRefill = now;
  }
}

async function acquire(): Promise<void> {
  for (;;) {
    refill();
    if (bucket > 0) {
      bucket--;
      return;
    }
    await new Promise((r) => setTimeout(r, REFILL_MS));
  }
}

async function mdGet<T>(
  path: string,
  params?: Record<string, string | number | string[]>,
): Promise<T> {
  await acquire();
  const url = new URL(BASE + path);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (Array.isArray(v)) for (const x of v) url.searchParams.append(k, String(x));
      else url.searchParams.set(k, String(v));
    }
  }
  const res = await fetch(url.toString(), {
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`MangaDex HTTP ${res.status}`);
  return (await res.json()) as T;
}

function normTitle(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * True when a MangaDex manga plausibly IS the queried title. Guards against a
 * relevance search returning an unrelated top hit, which would otherwise
 * mis-link the whole series (covers, chapters, dates) to the wrong manga.
 */
export function mangaTitleMatches(manga: MangaDexManga, query: string): boolean {
  const q = normTitle(query);
  if (q.length < 2) return false;
  return [manga.titleEnglish, manga.titleJa]
    .filter((t): t is string => Boolean(t))
    .map(normTitle)
    .some((c) => c.length >= 2 && (c === q || c.includes(q)));
}

/**
 * Resolve a MangaDex manga by trying each title in order, returning the first
 * relevance hit whose own title actually matches (see {@link mangaTitleMatches}).
 * Returns null rather than an unrelated manga — never mis-link a series. Pass the
 * romaji title first (MangaDex keys on it), then the English title.
 */
export async function findMangaByTitles(titles: string[]): Promise<MangaDexManga | null> {
  for (const raw of titles) {
    const q = raw?.trim();
    if (!q) continue;
    const data = await mdGet<unknown>('/manga', {
      title: q,
      limit: 5,
      'order[relevance]': 'desc',
    });
    const parsed = MdSearchResponse.parse(data);
    for (const m of parsed.data) {
      const manga = mapManga(m);
      if (mangaTitleMatches(manga, q)) return manga;
    }
  }
  return null;
}

export async function searchMangaByTitle(title: string): Promise<MangaDexManga | null> {
  const raw = await mdGet<unknown>('/manga', {
    title,
    limit: 1,
    'order[relevance]': 'desc',
  });
  const parsed = MdSearchResponse.parse(raw);
  if (parsed.data.length === 0) return null;
  return mapManga(parsed.data[0]!);
}

/**
 * Returns up to `limit` latin-script title strings matching `title`, ordered by
 * MangaDex relevance. Unlike {@link searchMangaByTitle}, this keeps the full set
 * (not just the top hit) so callers can derive a canonical query — MangaDex does
 * true substring matching where AniList's relevance search drops short fragments.
 */
export async function searchMangaTitles(title: string, limit = 10): Promise<string[]> {
  const raw = await mdGet<unknown>('/manga', {
    title,
    limit,
    'order[relevance]': 'desc',
  });
  const parsed = MdSearchResponse.parse(raw);
  const out: string[] = [];
  for (const m of parsed.data) {
    const t = m.attributes.title ?? {};
    const best = t.en ?? t['ja-ro'] ?? t['en-us'] ?? Object.values(t)[0];
    if (best) out.push(best);
  }
  return out;
}

// MangaDex feed pages at 500 max and caps offset at 10000.
const FEED_PAGE_SIZE = 500;
const FEED_MAX_OFFSET = 10000;

export async function getChapters(
  mangadexId: string,
  opts: { limit?: number; offset?: number; language?: string } = {},
): Promise<ChapterEntry[]> {
  const language = opts.language ?? 'en';
  const fetchPage = async (limit: number, offset: number) => {
    const raw = await mdGet<unknown>(`/manga/${mangadexId}/feed`, {
      limit,
      offset,
      'translatedLanguage[]': [language],
      'order[chapter]': 'asc',
      includeFutureUpdates: 0,
    });
    return MdChapterListResponse.parse(raw);
  };

  // An explicit limit means the caller wants a single bounded page.
  if (opts.limit !== undefined) {
    const page = await fetchPage(opts.limit, opts.offset ?? 0);
    return page.data.map(mapChapter);
  }

  // Otherwise walk the whole feed so callers (e.g. per-volume release-date
  // inference) see every chapter, not just the first 100/500.
  const out: ChapterEntry[] = [];
  let offset = opts.offset ?? 0;
  for (;;) {
    const page = await fetchPage(FEED_PAGE_SIZE, offset);
    out.push(...page.data.map(mapChapter));
    offset += page.data.length;
    if (page.data.length === 0 || offset >= page.total || offset >= FEED_MAX_OFFSET) break;
  }
  return out;
}

/**
 * Returns the number of chapters MangaDex has in `language` for a manga. Used as
 * a fallback chapter count for ongoing webtoons/manhwa where AniList (and MAL)
 * report a null chapter count. A single `limit: 1` feed request is enough — the
 * response's `total` is the full count regardless of the page size.
 */
export async function getChapterCount(mangadexId: string, language = 'en'): Promise<number> {
  const raw = await mdGet<unknown>(`/manga/${mangadexId}/feed`, {
    limit: 1,
    'translatedLanguage[]': [language],
    includeFutureUpdates: 0,
  });
  return MdChapterListResponse.parse(raw).total;
}

/**
 * Returns per-volume cover images for a manga, ordered by ascending volume.
 * AniList only exposes an aggregate volume count, so MangaDex's cover API is the
 * source for individual volume cover art. Covers without a positive-integer
 * volume (null, "none", "0", non-integers like "1.5") are skipped; when several
 * covers share a volume the first (per `order[volume]=asc`) wins.
 */
export async function getVolumeCovers(
  mangadexId: string,
): Promise<{ volume: number; url: string }[]> {
  const raw = await mdGet<unknown>('/cover', {
    'manga[]': [mangadexId],
    limit: 100,
    'order[volume]': 'asc',
  });
  const parsed = MdCoverListResponse.parse(raw);
  const out: { volume: number; url: string }[] = [];
  const seen = new Set<number>();
  for (const cover of parsed.data) {
    const rawVolume = cover.attributes.volume;
    if (rawVolume == null) continue;
    const volume = Number(rawVolume);
    if (!Number.isInteger(volume) || volume <= 0) continue;
    if (seen.has(volume)) continue;
    // Covers under re-upload can lack a filename; skip rather than build a
    // broken URL.
    const fileName = cover.attributes.fileName;
    if (!fileName) continue;
    seen.add(volume);
    out.push({
      volume,
      url: `https://uploads.mangadex.org/covers/${mangadexId}/${fileName}.512.jpg`,
    });
  }
  return out;
}
