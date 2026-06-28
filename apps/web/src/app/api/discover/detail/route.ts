import { NextResponse } from 'next/server';
import { z } from 'zod';
import { CONTENT_TYPES, type ContentType } from '@/server/content-type';
import { getManga, getNovel } from '@/server/integrations/anilist';
import { getMangaMal } from '@/server/integrations/mal';
import { findMangaByTitles, getChapterCount } from '@/server/integrations/mangadex';
import { getWork } from '@/server/integrations/openlibrary';
import { getVolume } from '@/server/integrations/comicvine';
import { getAudiobook } from '@/server/integrations/audnex';
import { getAudiobookById } from '@/server/integrations/librivox';
import { getAudioBestsellersCached } from '@/server/discover/browse';
import { malClientIdSetting, isMalConfigured } from '@/server/db/settings/mal';
import { comicVineApiKeySetting, isComicVineConfigured } from '@/server/db/settings/comicvine';
import { nytApiKeySetting, isNytConfigured } from '@/server/db/settings/nyt';

export const dynamic = 'force-dynamic';

const DISCOVER_SOURCES = [
  'anilist',
  'mal',
  'mangadex',
  'comicvine',
  'openlibrary',
  'audnex',
  'nyt',
  'librivox',
  'fixture',
] as const;

const DetailQuery = z.object({
  contentType: z.enum(CONTENT_TYPES),
  source: z.enum(DISCOVER_SOURCES),
  id: z.string().min(1),
  // Cross-linked MangaDex id, used only as a chapter-count fallback for ongoing
  // titles whose AniList/MAL chapter count is null. Optional everywhere.
  mdexId: z.string().optional(),
  // Display title, used to lazily resolve a MangaDex match by title when the
  // primary source left the chapter count null and no mdexId was supplied (the
  // browse/trending tiles carry no cross-linked MangaDex id). Optional.
  title: z.string().optional(),
});

/**
 * Extended detail for a discover result's PRIMARY source. Best-effort: every
 * field is optional and a failed/unsupported lookup yields `{}`. Manga is
 * supported richly (AniList when an anilist id is present, else MyAnimeList);
 * other content types degrade gracefully — the modal simply falls back to the
 * base fields it already has.
 */
export type DiscoverDetail = {
  description?: string | null;
  totalVolumes?: number | null;
  totalChapters?: number | null;
  // The MangaDex id that backed the chapter-count fallback — either the explicit
  // `mdexId` or one resolved by title. Lets the dialog surface a MangaDex link
  // for browse tiles that carry no pre-resolved cross-link. Absent when no
  // MangaDex match was used.
  mangadexId?: string | null;
};

const EMPTY: DiscoverDetail = {};

// Minimum display-title length before we attempt a lazy by-title MangaDex
// resolve. Short titles collide as substrings of unrelated series; below this we
// skip the lookup rather than risk a wrong cross-link.
const MIN_TITLE_RESOLVE_LEN = 4;

function parseIntOrNull(s: string): number | null {
  const n = Number.parseInt(s, 10);
  return Number.isNaN(n) ? null : n;
}

/**
 * Best-effort MangaDex chapter-count fallback. Only consulted when the primary
 * source left `totalChapters` null (e.g. ongoing webtoons/manhwa AniList/MAL
 * don't track). The effective MangaDex id is the explicit `mdexId` when given,
 * otherwise one resolved lazily by `title` via {@link findMangaByTitles} — which
 * validates the match and returns null rather than mis-linking. The by-title
 * lookup only fires when chapters are null, no `mdexId` was supplied, and a
 * non-empty title is given (browse tiles), so search results that already carry
 * an mdexId never pay for it. Isolated in its own try/catch so a MangaDex
 * failure NEVER wipes out the already-resolved description/volumes — on any
 * error the count simply stays null. A non-positive total is ignored too. When a
 * MangaDex id was used (explicit or resolved) it is echoed back as
 * `mangadexId` so the dialog can surface a MangaDex link for browse tiles.
 */
async function withMdexChapterFallback(
  detail: DiscoverDetail,
  mdexId: string | undefined,
  title: string | undefined,
): Promise<DiscoverDetail> {
  if (detail.totalChapters != null) return detail;
  try {
    let effectiveId = mdexId;
    // Resolve by title only for titles long enough to search safely. A single
    // short display title (e.g. "GTO") is a common substring of unrelated
    // MangaDex titles; `findMangaByTitles` validates with `includes`, so a short
    // query risks a confident-but-wrong match. We'd rather show no count than
    // mis-link the wrong series — skip the lookup below the threshold.
    if (!effectiveId && title && title.trim().length >= MIN_TITLE_RESOLVE_LEN) {
      const match = await findMangaByTitles([title.trim()]);
      effectiveId = match?.mangadexId;
    }
    if (!effectiveId) return detail;
    const count = await getChapterCount(effectiveId);
    if (count > 0) return { ...detail, totalChapters: count, mangadexId: effectiveId };
    return { ...detail, mangadexId: effectiveId };
  } catch {
    // Leave totalChapters null; the description/volumes we already have stand.
  }
  return detail;
}

/** Resolve manga detail, preferring AniList; falling back to MAL. */
async function mangaDetail(
  source: string,
  id: string,
  mdexId: string | undefined,
  title: string | undefined,
): Promise<DiscoverDetail> {
  // AniList-backed (or cross-linked) results carry a numeric AniList id; MAL-only
  // results report source `mal` with a `mal:<id>` sourceId.
  if (source === 'anilist') {
    const anilistId = parseIntOrNull(id);
    if (anilistId == null) return EMPTY;
    const detail = await getManga(anilistId);
    return withMdexChapterFallback(
      {
        description: detail.description,
        totalVolumes: detail.totalVolumes,
        totalChapters: detail.totalChapters,
      },
      mdexId,
      title,
    );
  }

  if (source === 'mal') {
    const clientId = await malClientIdSetting.get();
    if (!isMalConfigured(clientId)) return EMPTY;
    const malId = parseIntOrNull(id.startsWith('mal:') ? id.slice(4) : id);
    if (malId == null) return EMPTY;
    const detail = await getMangaMal(malId);
    if (detail == null) return EMPTY;
    return withMdexChapterFallback(
      {
        description: detail.synopsis,
        totalVolumes: detail.totalVolumes,
        totalChapters: detail.totalChapters,
      },
      mdexId,
      title,
    );
  }

  return EMPTY;
}

/** Resolve light-novel detail from AniList (volume/chapter counts). */
async function novelDetail(source: string, id: string): Promise<DiscoverDetail> {
  if (source === 'anilist') {
    const anilistId = parseIntOrNull(id);
    if (anilistId == null) return EMPTY;
    const detail = await getNovel(anilistId);
    return {
      description: detail.description,
      totalVolumes: detail.totalVolumes,
      totalChapters: detail.totalChapters,
    };
  }
  return EMPTY;
}

/** Resolve eBook detail (synopsis) from the Open Library work record. */
async function ebookDetail(source: string, id: string): Promise<DiscoverDetail> {
  if (source !== 'openlibrary') return EMPTY;
  const work = await getWork(id);
  if (work == null) return EMPTY;
  // OL `description` is either a plain string or a typed { value } object.
  const raw = work.description;
  const description = typeof raw === 'string' ? raw : (raw?.value ?? null);
  return { description };
}

/** Resolve comic detail (synopsis) from the ComicVine volume record. */
async function comicDetail(source: string, id: string): Promise<DiscoverDetail> {
  if (source !== 'comicvine') return EMPTY;
  const cid = parseIntOrNull(id);
  if (cid == null) return EMPTY;
  const apiKey = await comicVineApiKeySetting.get();
  if (!isComicVineConfigured(apiKey)) return EMPTY;
  const vol = await getVolume(apiKey, cid);
  return { description: vol.description };
}

/**
 * Resolve audiobook detail (synopsis) across the three audiobook sources:
 *   - audnex   → Audible/Audnex book record by ASIN.
 *   - librivox → the LibriVox feed, by id (sourceId is `librivox:<id>`).
 *   - nyt      → the NYT audio bestsellers list, matched by isbn-or-title key
 *                (sourceId is `nyt:<isbn|title>`). Reuses browse's 30-min quota
 *                cache rather than burning NYT's daily allowance.
 */
async function audiobookDetail(source: string, id: string): Promise<DiscoverDetail> {
  if (source === 'audnex') {
    const book = await getAudiobook(id);
    return { description: book?.description ?? null };
  }

  if (source === 'librivox') {
    const librivoxId = id.startsWith('librivox:') ? id.slice('librivox:'.length) : id;
    const hit = await getAudiobookById(librivoxId);
    return { description: hit?.description ?? null };
  }

  if (source === 'nyt') {
    const key = id.startsWith('nyt:') ? id.slice('nyt:'.length) : id;
    const apiKey = await nytApiKeySetting.get();
    if (!isNytConfigured(apiKey)) return EMPTY;
    const hits = await getAudioBestsellersCached(apiKey);
    const hit = hits.find((h) => h.isbn === key || h.title === key);
    return { description: hit?.description ?? null };
  }

  return EMPTY;
}

async function resolveDetail(
  contentType: ContentType,
  source: string,
  id: string,
  mdexId: string | undefined,
  title: string | undefined,
): Promise<DiscoverDetail> {
  switch (contentType) {
    case 'manga':
      return mangaDetail(source, id, mdexId, title);
    case 'light_novel':
      return novelDetail(source, id);
    case 'ebook':
      return ebookDetail(source, id);
    case 'comic':
      return comicDetail(source, id);
    case 'audiobook':
      return audiobookDetail(source, id);
    // Remaining content types have no cheap extended-detail source wired up yet;
    // the modal falls back to its base fields.
    default:
      return EMPTY;
  }
}

export async function GET(req: Request): Promise<NextResponse> {
  const url = new URL(req.url);
  const parsed = DetailQuery.safeParse({
    contentType: url.searchParams.get('contentType') ?? undefined,
    source: url.searchParams.get('source') ?? undefined,
    id: url.searchParams.get('id') ?? undefined,
    mdexId: url.searchParams.get('mdexId') ?? undefined,
    title: url.searchParams.get('title') ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid query', detail: parsed.error.message },
      { status: 400 },
    );
  }

  const { contentType, source, id, mdexId, title } = parsed.data;
  try {
    const detail = await resolveDetail(contentType, source, id, mdexId, title);
    return NextResponse.json(detail);
  } catch {
    // Best-effort: never break the modal on a failed detail fetch.
    return NextResponse.json(EMPTY);
  }
}
