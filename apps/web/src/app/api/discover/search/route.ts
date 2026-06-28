import { NextResponse } from 'next/server';
import { z } from 'zod';
import { CONTENT_TYPES, type ContentType } from '@/server/content-type';
import { searchNovelCached } from '@/server/integrations/anilist/cache';
import { searchMangaMerged } from '@/server/discover/manga-search';
import { searchMangaByTitle } from '@/server/integrations/mangadex/client';
import { dedupeResults } from '@/server/discover/merge';
import { comicVineApiKeySetting, isComicVineConfigured } from '@/server/db/settings/comicvine';
import { searchVolumes, ComicVineError } from '@/server/integrations/comicvine';
import { searchBooks, OpenLibraryError } from '@/server/integrations/openlibrary';
import { searchVolumes as searchGoogleBooksVolumes } from '@/server/integrations/googlebooks';
import { googleBooksApiKeySetting } from '@/server/db/settings/googlebooks';
import { searchAudiobooks, AudnexError } from '@/server/integrations/audnex';
import { searchAudiobooks as searchITunesAudiobooks } from '@/server/integrations/itunes';
import { searchNovelUpdates } from '@/server/integrations/novelupdates';
import { formatDetail } from '@/server/discover/format-detail';
import { findInLib } from '@/server/discover/in-lib';
import { normalizeTitle } from '@/server/discover/merge';
import {
  searchProvidersSetting,
  type SearchProviders,
} from '@/server/db/settings/search-providers';

export const dynamic = 'force-dynamic';

const DISCOVER_CONTENT_TYPES = ['all', ...CONTENT_TYPES] as const;

const SearchQuery = z.object({
  q: z.string().min(1),
  contentType: z.enum(DISCOVER_CONTENT_TYPES).optional().default('all'),
});

export type DiscoverResult = {
  contentType: ContentType;
  sourceId: string;
  title: string;
  year?: number | null;
  author?: string | null;
  isbn?: string | null;
  coverUrl?: string | null;
  /**
   * Long-form synopsis when the provider supplies one. Forwarded into the
   * `/api/series` add body by quick-add so the library page is not blank while
   * the per-type hydrate job backfills the rest. Optional/additive — most
   * search tiers (e.g. OpenLibrary docs) don't carry a synopsis, in which case
   * the content-type hydrate job fills `series.description`.
   */
  description?: string | null;
  source: string;
  detail: string | null;
  inLib: boolean;
  /**
   * MyAnimeList id for manga results, when known. null for AniList-only manga and
   * for non-manga results. Mirrors `sources.mal` and is the canonical field the
   * Add flow reads to persist the cross-link. Additive/optional.
   */
  malId?: number | null;
  /** Provider IDs this result is cross-linked to, when known. Additive/optional. */
  sources?: {
    anilist?: number;
    mangadex?: string;
    mal?: number;
    comicvine?: number;
    openlibrary?: string;
    audnex?: string;
    /** NovelUpdates series slug, when this novel is sourced from / cross-linked to NU. */
    novelupdates?: string;
  };
};

// ---------------------------------------------------------------------------
// Per-type helpers — also used in single-type path.
// ---------------------------------------------------------------------------

/** Cap on MangaDex cross-link lookups per manga search — bounds latency against
 *  MangaDex's ~5/sec rate limit. */
const MANGADEX_CROSSLINK_CAP = 8;

async function searchManga(q: string, providers: SearchProviders): Promise<DiscoverResult[]> {
  // All three manga sources off → nothing to query.
  if (!providers.anilist && !providers.mal && !providers.mangadex) return [];
  // Merged AniList (+MangaDex completion fallback) and MyAnimeList hits. MAL is
  // best-effort and never blocks AniList — see searchMangaMerged.
  const hits = await searchMangaMerged(q, {
    anilist: providers.anilist,
    mal: providers.mal,
    mangadex: providers.mangadex,
  });
  const results: DiscoverResult[] = hits.map((h) => {
    // AniList is the display/source primary when present; MAL-only hits report
    // `mal` as their source and a `mal:<id>` sourceId (AniList id is absent).
    const primary = h.anilistId != null ? 'anilist' : 'mal';
    const sources: NonNullable<DiscoverResult['sources']> = {};
    if (h.anilistId != null) sources.anilist = h.anilistId;
    if (h.malId != null) sources.mal = h.malId;
    return {
      contentType: 'manga' as const,
      sourceId: h.anilistId != null ? String(h.anilistId) : `mal:${h.malId}`,
      title: h.titleEnglish ?? h.titleRomaji ?? h.titleNative ?? '',
      year: h.year,
      author: null,
      coverUrl: h.coverUrl,
      source: primary,
      detail: formatDetail('manga', { year: h.year, status: h.status }),
      inLib: false, // populated later by enrichWithInLib
      malId: h.malId,
      sources,
    };
  });

  // Best-effort cross-link to MangaDex for the top AniList-backed hits only.
  // Failures/no-match leave sources.mangadex undefined — this never throws.
  // Skipped entirely when MangaDex is toggled off.
  if (!providers.mangadex) return results;
  const settled = await Promise.allSettled(
    results.slice(0, MANGADEX_CROSSLINK_CAP).map((r, i) => {
      const h = hits[i]!;
      if (h.anilistId == null) return Promise.resolve(null); // MAL-only — skip MangaDex
      const bestTitle = h.titleEnglish ?? h.titleRomaji ?? h.titleNative;
      if (!bestTitle) return Promise.resolve(null);
      return searchMangaByTitle(bestTitle);
    }),
  );
  settled.forEach((outcome, i) => {
    if (outcome.status === 'fulfilled' && outcome.value) {
      results[i]!.sources = { ...results[i]!.sources, mangadex: outcome.value.mangadexId };
    }
  });

  return results;
}

async function searchNovel(q: string): Promise<DiscoverResult[]> {
  const hits = await searchNovelCached(q);
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

/** Maps NovelUpdates search hits into light-novel DiscoverResults. */
async function searchNovelsNU(q: string): Promise<DiscoverResult[]> {
  const hits = await searchNovelUpdates(q);
  return hits.map((h) => ({
    contentType: 'light_novel' as const,
    source: 'novelupdates',
    sourceId: `nu:${h.slug}`,
    title: h.title,
    year: h.year,
    author: null,
    coverUrl: h.coverUrl,
    detail: formatDetail('light_novel', { year: h.year }),
    inLib: false,
    sources: { novelupdates: h.slug },
  }));
}

/**
 * Merges AniList-NOVEL and NovelUpdates light-novel results, deduped by
 * normalized title. When a title exists in both, the AniList result is kept and
 * `sources.novelupdates` is grafted on (so the created series still gets NU
 * chapter sync). NU-only titles pass through as their own standalone results.
 * AniList result order is preserved; NU-only results are appended.
 */
function mergeNovelResults(
  anilist: DiscoverResult[],
  nu: DiscoverResult[],
): DiscoverResult[] {
  const byTitle = new Map<string, number>();
  const out: DiscoverResult[] = anilist.map((r) => ({ ...r }));
  out.forEach((r, i) => byTitle.set(normalizeTitle(r.title), i));

  for (const n of nu) {
    const key = normalizeTitle(n.title);
    const idx = byTitle.get(key);
    const slug = n.sources?.novelupdates;
    if (idx !== undefined && slug != null) {
      // Same title on both — keep AniList, graft the NU slug.
      out[idx] = { ...out[idx]!, sources: { ...out[idx]!.sources, novelupdates: slug } };
    } else if (idx === undefined) {
      byTitle.set(key, out.length);
      out.push(n);
    }
  }
  return out;
}

/** Cap title→cover lookups per search so enrichment can't dominate latency. */
const NOVEL_COVER_ENRICH_CAP = 10;

/**
 * Best-effort cover art for novel results that have none (NovelUpdates-only
 * titles with no NU image). Looks each up on OpenLibrary by title — an extra
 * source beyond NU/AniList — and only accepts a hit whose title loosely matches,
 * so we never paste a wrong book's cover on. Runs in parallel, capped, and never
 * throws; coverless results just keep their tinted fallback.
 */
async function enrichNovelCovers(results: DiscoverResult[]): Promise<DiscoverResult[]> {
  const gaps = results.filter((r) => !r.coverUrl).slice(0, NOVEL_COVER_ENRICH_CAP);
  if (gaps.length === 0) return results;
  const found = new Map<string, string>();
  await Promise.allSettled(
    gaps.map(async (r) => {
      const want = normalizeTitle(r.title);
      try {
        const hits = await searchBooks(r.title);
        const match = hits.find((h) => {
          if (!h.coverUrl) return false;
          const got = normalizeTitle(h.title);
          return got.length > 0 && (got.includes(want) || want.includes(got));
        });
        if (match?.coverUrl) found.set(r.sourceId, match.coverUrl);
      } catch {
        /* best-effort — leave the fallback */
      }
    }),
  );
  if (found.size === 0) return results;
  return results.map((r) =>
    !r.coverUrl && found.has(r.sourceId) ? { ...r, coverUrl: found.get(r.sourceId)! } : r,
  );
}

async function searchComics(q: string): Promise<DiscoverResult[]> {
  const apiKey = await comicVineApiKeySetting.get();
  if (!isComicVineConfigured(apiKey)) return [];
  const hits = await searchVolumes(apiKey, q);
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
    sources: { comicvine: h.comicvineId },
  }));
}

/**
 * Dual-source ebook search: OpenLibrary (primary) + Google Books (fallback/
 * supplement). Settles both in parallel so a hung/unreachable OL never zeroes
 * out results — Google Books fills the gap when an API key is configured.
 * Google Books is skipped entirely when no key is set (keyless quota causes
 * HTTP 429 from the production cluster). Errors from either source are
 * returned so callers can surface them to the UI; the function never throws.
 */
async function searchEbooks(q: string): Promise<{ results: DiscoverResult[]; errors: Record<string, string> }> {
  const apiKey = await googleBooksApiKeySetting.get();
  const gbEnabled = apiKey.length > 0;

  const [olOut, gbOut] = await Promise.allSettled([
    searchBooks(q),
    gbEnabled ? searchGoogleBooksVolumes(q, apiKey) : Promise.resolve(null),
  ]);

  const errors: Record<string, string> = {};

  const olHits = olOut.status === 'fulfilled' ? olOut.value : [];
  if (olOut.status === 'rejected') {
    const err = olOut.reason as unknown;
    errors['openlibrary'] = err instanceof Error ? err.message : String(err);
  }

  const gbHits = gbOut.status === 'fulfilled' ? (gbOut.value ?? []) : [];
  if (gbOut.status === 'rejected') {
    const err = gbOut.reason as unknown;
    errors['googlebooks'] = err instanceof Error ? err.message : String(err);
  }

  const olResults: DiscoverResult[] = olHits.map((h) => ({
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
    sources: { openlibrary: h.olid },
  }));

  const gbResults: DiscoverResult[] = gbHits.map((h) => ({
    contentType: 'ebook' as const,
    sourceId: `gb:${h.gbid}`,
    title: h.title,
    year: h.year,
    author: h.author,
    isbn: h.isbn,
    coverUrl: h.coverUrl,
    source: 'googlebooks',
    detail: formatDetail('ebook', { year: h.year }),
    inLib: false,
  }));

  // Merge: OL wins on title collision (it has OLID/ISBN data); GB-only titles
  // are appended. Uses normalizeTitle for stable dedup (same logic as audio).
  const byTitle = new Map<string, number>();
  const out = olResults.map((r) => ({ ...r }));
  out.forEach((r, i) => byTitle.set(normalizeTitle(r.title), i));
  for (const gb of gbResults) {
    const key = normalizeTitle(gb.title);
    const idx = byTitle.get(key);
    if (idx === undefined) {
      byTitle.set(key, out.length);
      out.push(gb);
    } else if (!out[idx]!.coverUrl && gb.coverUrl) {
      // OL hit lacks cover — graft GB cover art.
      out[idx] = { ...out[idx]!, coverUrl: gb.coverUrl };
    }
  }

  return { results: out, errors };
}

async function searchAudio(q: string): Promise<DiscoverResult[]> {
  // Two audiobook sources: Audnex (Audible metadata, ASIN-keyed) and iTunes
  // (Apple's keyless catalog — broader commercial coverage + reliable cover art,
  // catches titles Audnex misses like "Greenlights"). Settle both so one failing
  // never zeroes the other.
  const [audnexOut, itunesOut] = await Promise.allSettled([
    searchAudiobooks(q),
    searchITunesAudiobooks(q),
  ]);
  const audnexHits = audnexOut.status === 'fulfilled' ? audnexOut.value : [];
  const itunesHits = itunesOut.status === 'fulfilled' ? itunesOut.value : [];

  const audnex: DiscoverResult[] = audnexHits.map((h) => ({
    contentType: 'audiobook' as const,
    sourceId: h.asin,
    title: h.title,
    year: h.releaseYear,
    author: h.author,
    coverUrl: h.coverUrl,
    source: 'audnex',
    detail: formatDetail('audiobook', {
      year: h.releaseYear,
      durationMs: h.runtimeMinutes != null ? h.runtimeMinutes * 60_000 : null,
    }),
    inLib: false,
    sources: { audnex: h.asin },
  }));

  // iTunes tiles carry no ASIN — they resolve one at add time (see
  // audiobook-resolve `needsAsinResolution`), exactly like NYT/LibriVox tiles.
  const itunes: DiscoverResult[] = itunesHits.map((h) => ({
    contentType: 'audiobook' as const,
    sourceId: `itunes:${h.id}`,
    title: h.title,
    year: h.releaseYear,
    author: h.author,
    coverUrl: h.coverUrl,
    source: 'itunes',
    detail: formatDetail('audiobook', { year: h.releaseYear }),
    inLib: false,
  }));

  // Audnex wins on title (it has ASIN/narrator/runtime); graft an iTunes cover
  // when Audnex lacks one, then append iTunes-only titles.
  const byTitle = new Map<string, number>();
  const out = audnex.map((r) => ({ ...r }));
  out.forEach((r, i) => byTitle.set(normalizeTitle(r.title), i));
  for (const it of itunes) {
    const key = normalizeTitle(it.title);
    const idx = byTitle.get(key);
    if (idx === undefined) {
      byTitle.set(key, out.length);
      out.push(it);
    } else if (!out[idx]!.coverUrl && it.coverUrl) {
      out[idx] = { ...out[idx]!, coverUrl: it.coverUrl };
    }
  }
  return out;
}

/** Batch-populates the inLib flag on a set of results. */
async function enrichWithInLib(results: DiscoverResult[]): Promise<DiscoverResult[]> {
  if (results.length === 0) return results;
  const inLibSet = await findInLib(results.map((r) => ({ title: r.title, contentType: r.contentType })));
  return results.map((r) => ({
    ...r,
    inLib: inLibSet.has(`${r.contentType}::${r.title.toLowerCase().trim()}`),
  }));
}

// ---------------------------------------------------------------------------
// Single-type path — returns results + optional error string.
// ---------------------------------------------------------------------------

async function searchSingleType(
  q: string,
  contentType: ContentType,
  providers: SearchProviders,
): Promise<{ results: DiscoverResult[]; error?: string }> {
  // Light novels merge two providers (AniList + NovelUpdates). Settle them
  // independently so a NU failure (403/429/timeout) never zeroes the AniList
  // results — the NU error is recorded separately. Disabled providers are
  // skipped (resolved as []) so their fns are never reached.
  if (contentType === 'light_novel') {
    const [aniOut, nuOut] = await Promise.allSettled([
      providers.anilist ? searchNovel(q) : Promise.resolve<DiscoverResult[]>([]),
      providers.novelupdates ? searchNovelsNU(q) : Promise.resolve<DiscoverResult[]>([]),
    ]);
    const anilist = aniOut.status === 'fulfilled' ? aniOut.value : [];
    const nu = nuOut.status === 'fulfilled' ? nuOut.value : [];
    const results = await enrichNovelCovers(mergeNovelResults(anilist, nu));
    // Surface an error only when AniList (the primary, when enabled) fails — a
    // NU-only failure degrades silently so the panel doesn't flag a soft scrape
    // miss as an error.
    if (aniOut.status === 'rejected') {
      const err = aniOut.reason as unknown;
      return { results, error: err instanceof Error ? err.message : String(err) };
    }
    return { results };
  }
  // Ebook search is dual-source (OL + GB) — it never throws, returns its own
  // error map so individual source outages surface to the UI without zeroing all results.
  if (contentType === 'ebook') {
    if (!providers.openlibrary) return { results: [] };
    const { results, errors } = await searchEbooks(q);
    // Surface the first error (if any) — OL takes priority since it's the primary source.
    const errorMsg = errors['openlibrary'] ?? errors['googlebooks'];
    return { results, ...(errorMsg ? { error: errorMsg } : {}) };
  }

  const run = (): Promise<DiscoverResult[]> => {
    switch (contentType) {
      case 'manga':      return searchManga(q, providers);
      case 'comic':      return providers.comicvine ? searchComics(q) : Promise.resolve([]);
      case 'audiobook':  return providers.audnex ? searchAudio(q) : Promise.resolve([]);
    }
  };
  try {
    const results = await run();
    if (results.length === 0 && contentType === 'comic' && providers.comicvine) {
      // Could be unconfigured — surface a hint
      const apiKey = await comicVineApiKeySetting.get();
      if (!isComicVineConfigured(apiKey)) {
        return { results, error: 'comicvine not configured' };
      }
    }
    return { results };
  } catch (err) {
    let message: string;
    if (err instanceof ComicVineError || err instanceof OpenLibraryError || err instanceof AudnexError) {
      message = err.message;
    } else {
      message = err instanceof Error ? err.message : String(err);
    }
    return { results: [], error: message };
  }
}

// ---------------------------------------------------------------------------
// All-providers fan-out — parallel with per-provider error capture.
// ---------------------------------------------------------------------------

async function searchAllProviders(q: string, providers: SearchProviders): Promise<{
  results: DiscoverResult[];
  errors: Record<string, string>;
}> {
  type Entry = { key: string; enabled: boolean; fn: () => Promise<DiscoverResult[]> };
  // `searchManga` is gated internally on anilist/mal/mangadex — include it when
  // ANY of its sub-sources is on (it returns [] when all three are off).
  const mangaEnabled = providers.anilist || providers.mal || providers.mangadex;
  const allEntries: Entry[] = [
    { key: 'anilist-manga',  enabled: mangaEnabled,         fn: () => searchManga(q, providers) },
    { key: 'anilist-novel',  enabled: providers.anilist,    fn: () => searchNovel(q) },
    // NovelUpdates joins as its own provider — a failure (403/429/timeout) is
    // captured in `errors` and never breaks the rest of the fan-out. NU light-
    // novel hits sharing a normalized title with an AniList novel collapse via
    // dedupeResults (AniList kept, `sources.novelupdates` grafted on).
    { key: 'novelupdates',   enabled: providers.novelupdates, fn: () => searchNovelsNU(q) },
    { key: 'comicvine',      enabled: providers.comicvine,  fn: () => searchComics(q) },
    { key: 'audnex',         enabled: providers.audnex,     fn: () => searchAudio(q) },
  ];
  const entries = allEntries.filter((e) => e.enabled);

  // Ebook search is dual-source — run it in the fan-out separately so its
  // per-source errors surface individually in the errors map.
  const ebookPromise = providers.openlibrary
    ? searchEbooks(q)
    : Promise.resolve({ results: [] as DiscoverResult[], errors: {} });

  const [settled, ebookOut] = await Promise.all([
    Promise.allSettled(entries.map((e) => e.fn())),
    ebookPromise,
  ]);

  const byKey: Record<string, DiscoverResult[]> = {};
  const errors: Record<string, string> = { ...ebookOut.errors };

  settled.forEach((outcome, i) => {
    const key = entries[i]!.key;
    if (outcome.status === 'fulfilled') {
      byKey[key] = outcome.value;
    } else {
      const err = outcome.reason as unknown;
      errors[key] = err instanceof Error ? err.message : String(err);
    }
  });

  // Merge the two novel sources the SAME way the single-type path does — AniList
  // is the canonical winner and the NU slug is grafted on — so a novel returns an
  // identical shape whether searched via `all` or `light_novel`.
  const novels = await enrichNovelCovers(
    mergeNovelResults(byKey['anilist-novel'] ?? [], byKey['novelupdates'] ?? []),
  );
  const results: DiscoverResult[] = [
    ...(byKey['anilist-manga'] ?? []),
    ...novels,
    ...(byKey['comicvine'] ?? []),
    ...ebookOut.results,
    ...(byKey['audnex'] ?? []),
  ];

  return { results: dedupeResults(results).slice(0, 30), errors };
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

export async function GET(req: Request): Promise<NextResponse> {
  const url = new URL(req.url);
  const rawParams = {
    q: url.searchParams.get('q') ?? undefined,
    contentType: url.searchParams.get('contentType') ?? undefined,
  };

  const parsed = SearchQuery.safeParse(rawParams);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid query', detail: parsed.error.message },
      { status: 400 },
    );
  }

  const { q, contentType } = parsed.data;
  const startMs = Date.now();

  // Loaded once per request and threaded through every fan-out path so a
  // toggled-off provider's fn is never reached.
  const providers = await searchProvidersSetting.get();

  if (contentType !== 'all') {
    const { results: rawResults, error } = await searchSingleType(
      q,
      contentType as ContentType,
      providers,
    );
    const results = await enrichWithInLib(rawResults);
    const tookMs = Date.now() - startMs;
    const errors = error ? { [contentType]: error } : undefined;
    return NextResponse.json({ results, tookMs, ...(errors ? { errors } : {}) });
  }

  // All-providers fan-out
  const { results: rawResults, errors } = await searchAllProviders(q, providers);
  const results = await enrichWithInLib(rawResults);
  const tookMs = Date.now() - startMs;
  return NextResponse.json({
    results,
    tookMs,
    ...(Object.keys(errors).length > 0 ? { errors } : {}),
  });
}
