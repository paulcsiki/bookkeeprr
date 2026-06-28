import type { DiscoverResult } from '@/app/api/discover/search/route';

/**
 * Pure mapping from a unified discover result to a `POST /api/series` request
 * body for the "quick-add" path (no per-type configuration step).
 *
 * The body uses `monitoring: 'future'` and the caller-supplied
 * `qualityProfileId`. `rootPath` is included only for the content types whose
 * `/api/series` body requires it (manga / comic / light_novel); ebook and
 * audiobook derive their root server-side and must NOT receive a `rootPath`.
 *
 * Throws a clear Error when the required provider identifier for the content
 * type is missing from the result (the dialog catches and surfaces this).
 *
 * `groupId` (the AddDialog's "Add into" selection) is included on every
 * content-type body when non-null; `null`/`undefined` means Library root and
 * the key is omitted entirely.
 */
export function buildSeriesBody(
  result: DiscoverResult,
  opts: { qualityProfileId: number; rootPath?: string; groupId?: number | null },
): Record<string, unknown> {
  const { qualityProfileId, rootPath } = opts;
  const monitoring = 'future' as const;
  const group = opts.groupId != null ? { groupId: opts.groupId } : {};

  switch (result.contentType) {
    case 'manga': {
      // A manga result may be AniList-only, cross-linked (AniList + MAL), or
      // MAL-only. Carry whichever ids are present; only the AniList id falls back
      // to parsing the numeric sourceId (a MAL-only sourceId looks like
      // `mal:200` and must not be coerced into an anilistId).
      const anilistId =
        result.sources?.anilist ?? (result.malId == null ? parseIntOrNull(result.sourceId) : null);
      const malId = result.malId ?? result.sources?.mal ?? null;
      if (anilistId == null && malId == null) {
        throw new Error('Cannot quick-add manga: missing AniList or MyAnimeList id');
      }
      requireRootPath(rootPath, 'manga');
      return {
        contentType: 'manga',
        // Omit anilistId entirely for MAL-only adds so the server routes to
        // mal_hydrate instead of metadata_hydrate.
        ...(anilistId != null ? { anilistId } : {}),
        ...(malId != null ? { malId } : {}),
        mangadexId: result.sources?.mangadex ?? null,
        titleEnglish: result.title,
        coverUrl: result.coverUrl ?? null,
        status: 'releasing',
        rootPath,
        qualityProfileId,
        monitoring,
        granularity: 'volume',
        ...group,
      };
    }

    case 'comic': {
      const comicvineId = result.sources?.comicvine ?? parseIntOrNull(result.sourceId);
      if (comicvineId == null) {
        throw new Error('Cannot quick-add comic: missing ComicVine id');
      }
      requireRootPath(rootPath, 'comic');
      return {
        contentType: 'comic',
        comicvineId,
        titleEnglish: result.title,
        publisher: result.author ?? undefined,
        startYear: result.year ?? undefined,
        coverUrl: result.coverUrl ?? null,
        rootPath,
        qualityProfileId,
        monitoring,
        ...group,
      };
    }

    case 'light_novel': {
      // A light novel is either AniList-anchored (numeric sourceId / sources.anilist)
      // or NovelUpdates-only (sourceId `nu:<slug>` / sources.novelupdates, no anilist).
      const nuSlug = result.sources?.novelupdates ?? null;
      // Don't coerce a `nu:<slug>` sourceId into an anilistId.
      const anilistId =
        result.sources?.anilist ?? (nuSlug == null ? parseIntOrNull(result.sourceId) : null);
      if (anilistId == null && nuSlug == null) {
        throw new Error('Cannot quick-add light novel: missing AniList id or NovelUpdates slug');
      }
      requireRootPath(rootPath, 'light_novel');
      return {
        contentType: 'light_novel',
        ...(anilistId != null ? { anilistId } : {}),
        ...(nuSlug != null ? { novelUpdatesSlug: nuSlug } : {}),
        titleEnglish: result.title,
        author: result.author ?? undefined,
        coverUrl: result.coverUrl ?? undefined,
        rootPath,
        qualityProfileId,
        monitoring,
        ...group,
      };
    }

    case 'ebook': {
      const olid = result.sources?.openlibrary ?? result.sourceId;
      if (!olid) {
        throw new Error('Cannot quick-add ebook: missing OpenLibrary id');
      }
      return {
        contentType: 'ebook',
        flow: 'single',
        olid,
        title: result.title,
        isbn: result.isbn ?? null,
        author: result.author ?? null,
        year: result.year ?? null,
        coverUrl: result.coverUrl ?? null,
        description: result.description ?? null,
        qualityProfileId,
        monitoring,
        ...group,
      };
    }

    case 'audiobook': {
      // Only a real Audible ASIN (never the iTunes/NYT/LibriVox sourceId). When
      // absent, the audiobook is added title-keyed — still grabbable via
      // indexers — so quick-add never fails just because Audible lacks the title.
      const asin = result.sources?.audnex ?? null;
      return {
        contentType: 'audiobook',
        ...(asin ? { asin } : {}),
        title: result.title,
        author: result.author ?? null,
        year: result.year ?? null,
        coverUrl: result.coverUrl ?? null,
        description: result.description ?? null,
        qualityProfileId,
        monitoring,
        ...group,
      };
    }
  }
}

function parseIntOrNull(s: string): number | null {
  const n = Number.parseInt(s, 10);
  return Number.isNaN(n) ? null : n;
}

function requireRootPath(rootPath: string | undefined, type: string): asserts rootPath is string {
  if (!rootPath) {
    throw new Error(`Cannot quick-add ${type}: rootPath is required`);
  }
}
