import type { DiscoverResult } from '@/app/api/discover/search/route';
import type { SearchHit } from '@/server/integrations/anilist/schemas';
import type { ComicSearchHit } from '@/server/integrations/comicvine';
import type { EbookHit, AudiobookHit } from '@/app/(app)/add/types';

/**
 * The per-type "Add sheet" `hit` prop, discriminated by content type. Each
 * variant carries the exact shape the corresponding sheet component expects.
 *
 * - manga / light_novel sheets both consume the AniList `SearchHit` shape.
 * - comic sheet consumes ComicVine's `ComicSearchHit`.
 * - ebook / audiobook sheets consume their own `EbookHit` / `AudiobookHit`.
 */
/**
 * The manga Add sheet accepts a `SearchHit` whose `anilistId` may be null when
 * the result is MAL-only (carried via `malId`). Cross-linked results set both;
 * AniList-only results set `anilistId` with `malId` null. The sheet must never
 * fabricate an `anilistId` of 0 — that would poison the DB and error-loop the
 * AniList-backed hydrate.
 */
export type MangaSheetHit = Omit<SearchHit, 'anilistId'> & {
  anilistId: number | null;
  malId?: number | null;
};

/**
 * The light-novel Add sheet accepts an `anilistId` that may be null when the
 * result is NovelUpdates-only (carried via `novelUpdatesSlug`). AniList-anchored
 * results set `anilistId`; NU-only results set the slug with `anilistId` null.
 */
export type LightNovelSheetHit = Omit<SearchHit, 'anilistId'> & {
  anilistId: number | null;
  novelUpdatesSlug?: string | null;
};

export type AddSheetTarget =
  | { type: 'manga'; hit: MangaSheetHit }
  | { type: 'comic'; hit: ComicSearchHit }
  | { type: 'light_novel'; hit: LightNovelSheetHit }
  | { type: 'ebook'; hit: EbookHit }
  | { type: 'audiobook'; hit: AudiobookHit };

/**
 * Best-effort adapt a unified discover result into the `hit` shape the matching
 * per-type Add sheet expects, for the "Add & configure" path.
 *
 * `DiscoverResult` is a lossy projection — it does not carry every field a sheet
 * type declares (e.g. comic `issueCount`, manga `titleRomaji`/`titleNative`,
 * `format`, `description`). Those are filled with sensible defaults
 * (null / 0). The sheets re-resolve full detail from the provider id, so the
 * defaults here only need to satisfy the type and seed the initial render.
 */
function parseIdOr0(s: string): number {
  const n = Number.parseInt(s, 10);
  return Number.isNaN(n) ? 0 : n;
}

/** Like parseIdOr0 but null (never 0) on a non-numeric id — 0 would poison the add. */
function parseIdOrNull(s: string): number | null {
  const n = Number.parseInt(s, 10);
  return Number.isNaN(n) ? null : n;
}

export function toSheetHit(result: DiscoverResult): AddSheetTarget {
  switch (result.contentType) {
    case 'manga': {
      // AniList-only / cross-linked carry a real anilistId; MAL-only carry malId
      // with anilistId null. Never coerce a `mal:<id>` sourceId into anilistId 0.
      const malId = result.malId ?? result.sources?.mal ?? null;
      const anilistId =
        result.sources?.anilist ?? (malId == null ? parseIdOrNull(result.sourceId) : null);
      return {
        type: 'manga',
        hit: {
          anilistId,
          malId,
          titleEnglish: result.title || null,
          titleRomaji: null,
          titleNative: null,
          coverUrl: result.coverUrl ?? null,
          status: 'releasing',
          format: null,
          startYear: result.year ?? null,
          author: result.author ?? null,
        },
      };
    }

    case 'light_novel': {
      // NU-only results carry no AniList id; don't coerce a `nu:<slug>` sourceId
      // into anilistId 0. AniList-anchored results keep their numeric id.
      const nuSlug = result.sources?.novelupdates ?? null;
      const anilistId =
        result.sources?.anilist ?? (nuSlug == null ? parseIdOrNull(result.sourceId) : null);
      return {
        type: 'light_novel',
        hit: {
          anilistId,
          novelUpdatesSlug: nuSlug,
          titleEnglish: result.title || null,
          titleRomaji: null,
          titleNative: null,
          coverUrl: result.coverUrl ?? null,
          status: 'releasing',
          format: null,
          startYear: result.year ?? null,
          author: result.author ?? null,
        },
      };
    }

    case 'comic': {
      const comicvineId = result.sources?.comicvine ?? parseIdOr0(result.sourceId);
      return {
        type: 'comic',
        hit: {
          comicvineId,
          name: result.title,
          publisher: result.author ?? null,
          startYear: result.year ?? null,
          issueCount: null,
          coverUrl: result.coverUrl ?? null,
          description: null,
        },
      };
    }

    case 'ebook': {
      return {
        type: 'ebook',
        hit: {
          olid: result.sources?.openlibrary ?? result.sourceId,
          title: result.title,
          author: result.author ?? null,
          firstPublishYear: result.year ?? null,
          isbn: result.isbn ?? null,
          coverUrl: result.coverUrl ?? null,
          description: result.description ?? null,
        },
      };
    }

    case 'audiobook': {
      return {
        type: 'audiobook',
        hit: {
          // Only a real Audible ASIN — never the iTunes/NYT/LibriVox sourceId.
          asin: result.sources?.audnex ?? null,
          title: result.title,
          author: result.author ?? null,
          narrator: null,
          releaseYear: result.year ?? null,
          coverUrl: result.coverUrl ?? null,
          runtimeMinutes: null,
          description: result.description ?? null,
        },
      };
    }
  }
}
