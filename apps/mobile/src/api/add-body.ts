import type { ContentType } from '@/api/schemas';

/** The fields a discover/search result needs to build an add request. */
export type AddBodyInput = {
  contentType: ContentType;
  sourceId: string;
  title: string;
  author?: string | null;
  year?: number | null;
  isbn?: string | null;
  coverUrl?: string | null;
};

/**
 * Build a `POST /api/series` body from a discover/search result, mirroring the
 * web quick-add. The server accepts a content-type-specific shape; ids are taken
 * from `sourceId` (an AniList/ComicVine numeric id, an `nu:<slug>`/`mal:<id>`
 * prefix, an OpenLibrary olid, or an Audible ASIN). Root path + most metadata
 * are derived/hydrated server-side. New series start on `future` monitoring.
 *
 * @param groupId  Optional group to place the series in. Omitted (not sent) when
 *                 null so the server keeps the series at Library root.
 */
export function buildAddBody(
  item: AddBodyInput,
  qualityProfileId: number,
  groupId: number | null = null,
): Record<string, unknown> {
  const groupSpread = groupId != null ? { groupId } : {};
  const monitoring = 'future' as const;
  const cover = item.coverUrl ?? null;

  switch (item.contentType) {
    case 'manga': {
      const mal = item.sourceId.startsWith('mal:') ? Number(item.sourceId.slice(4)) : null;
      const anilistId = mal == null ? Number(item.sourceId) : null;
      return {
        contentType: 'manga',
        ...(anilistId != null && Number.isFinite(anilistId) ? { anilistId } : {}),
        ...(mal != null && Number.isFinite(mal) ? { malId: mal } : {}),
        titleEnglish: item.title,
        coverUrl: cover,
        status: 'releasing',
        qualityProfileId,
        monitoring,
        ...groupSpread,
      };
    }
    case 'comic':
      return {
        contentType: 'comic',
        comicvineId: Number(item.sourceId),
        titleEnglish: item.title,
        ...(item.author ? { publisher: item.author } : {}),
        ...(item.year != null ? { startYear: item.year } : {}),
        coverUrl: cover,
        qualityProfileId,
        monitoring,
        ...groupSpread,
      };
    case 'novel': {
      const nu = item.sourceId.startsWith('nu:') ? item.sourceId.slice(3) : null;
      const anilistId = nu == null ? Number(item.sourceId) : null;
      return {
        contentType: 'light_novel',
        ...(anilistId != null && Number.isFinite(anilistId) ? { anilistId } : {}),
        ...(nu ? { novelUpdatesSlug: nu } : {}),
        titleEnglish: item.title,
        coverUrl: cover,
        qualityProfileId,
        monitoring,
        ...groupSpread,
      };
    }
    case 'ebook':
      return {
        contentType: 'ebook',
        flow: 'single',
        olid: item.sourceId,
        ...(item.isbn ? { isbn: item.isbn } : {}),
        ...(item.author ? { author: item.author } : {}),
        title: item.title,
        ...(item.year != null ? { year: item.year } : {}),
        coverUrl: cover,
        qualityProfileId,
        monitoring,
        ...groupSpread,
      };
    case 'audio': {
      // iTunes/NYT/LibriVox tiles carry no Audible ASIN — add title-keyed.
      const asin = /^(itunes|nyt|librivox):/.test(item.sourceId) ? null : item.sourceId;
      return {
        contentType: 'audiobook',
        ...(asin ? { asin } : {}),
        title: item.title,
        ...(item.author ? { author: item.author } : {}),
        ...(item.year != null ? { year: item.year } : {}),
        coverUrl: cover,
        qualityProfileId,
        monitoring,
        ...groupSpread,
      };
    }
  }
}
