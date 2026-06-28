/**
 * Pure collapse+search helper for the library grid.
 *
 * Takes the flat series list, junction memberships, and book-series list, and
 * returns an ordered array of cards to render — either a {kind:'bookSeries'}
 * card (representing all member titles) or a {kind:'series'} card for
 * standalone titles.
 *
 * Rules:
 * - A title that belongs to a book series is collapsed into ONE book-series
 *   card (deduplicated by bookSeriesId).
 * - When `search` is non-empty, a book-series surfaces if its name matches OR
 *   any member title matches. `matchedTitle` is set to the first matched member
 *   title (so the card can show a label).
 * - The content-type filter applies to the book series' contentType.
 * - Standalone titles (not in any book series) surface as `kind:'series'`
 *   cards, filtered by search and type as normal.
 */

import type { SeriesRow, BookSeriesRow } from '@/server/db/schema';
import type { ContentTypeFilterValue } from '@bookkeeprr/ui';

export type Membership = { bookSeriesId: number; seriesId: number };
export type BookSeriesWithCount = BookSeriesRow & { memberCount: number };

export type SeriesCard = { kind: 'series'; series: SeriesRow };
export type BookSeriesCard = { kind: 'bookSeries'; bookSeries: BookSeriesWithCount; matchedTitle?: string };
export type LibraryCard = SeriesCard | BookSeriesCard;

export type CollapseOptions = {
  search: string;
  typeFilter: ContentTypeFilterValue;
};

export type CollapseResult = { cards: LibraryCard[] };

function getTitle(s: SeriesRow): string {
  return s.titleEnglish ?? s.titleRomaji ?? s.titleNative ?? `Series #${s.id}`;
}

/**
 * Collapse the series list for display in the library grid.
 *
 * @param allSeries  - The full (possibly pre-filtered/sorted) series list.
 * @param memberships - All junction rows from `listAllMemberships()`.
 * @param bookSeriesList - All book series from `listBookSeries()`.
 * @param opts - Active search string and content-type filter.
 */
export function collapseForView(
  allSeries: SeriesRow[],
  memberships: Membership[],
  bookSeriesList: BookSeriesWithCount[],
  opts: CollapseOptions,
): CollapseResult {
  const { search, typeFilter } = opts;
  const q = search.trim().toLowerCase();

  // Build lookup: seriesId → bookSeriesId
  const seriesToBookSeries = new Map<number, number>(
    memberships.map((m) => [m.seriesId, m.bookSeriesId]),
  );

  // Build lookup: bookSeriesId → BookSeriesWithCount
  const bookSeriesById = new Map<number, BookSeriesWithCount>(
    bookSeriesList.map((bs) => [bs.id, bs]),
  );

  // Build lookup: bookSeriesId → SeriesRow[] (all members in allSeries)
  const membersByBookSeries = new Map<number, SeriesRow[]>();
  for (const s of allSeries) {
    const bsId = seriesToBookSeries.get(s.id);
    if (bsId !== undefined) {
      const arr = membersByBookSeries.get(bsId) ?? [];
      arr.push(s);
      membersByBookSeries.set(bsId, arr);
    }
  }

  // Track which book series have already been emitted (deduplicate).
  const emittedBookSeries = new Set<number>();
  const cards: LibraryCard[] = [];

  // Iterate allSeries in order. For each series:
  // - If it belongs to a book series and the book series has not been emitted
  //   yet: evaluate the book series and emit it (or skip if filtered).
  // - If it does not belong to a book series: evaluate as standalone.
  for (const s of allSeries) {
    const bsId = seriesToBookSeries.get(s.id);

    if (bsId !== undefined) {
      // Member of a book series — handled when we emit the book-series card.
      if (emittedBookSeries.has(bsId)) continue; // already emitted

      const bs = bookSeriesById.get(bsId);
      if (!bs) {
        // Orphaned membership (shouldn't happen) — fall through as standalone.
      } else {
        // Type filter: apply to the book series' contentType.
        if (typeFilter !== 'all' && bs.contentType !== typeFilter) {
          emittedBookSeries.add(bsId);
          continue;
        }

        if (!q) {
          // No search — collapse normally, no matchedTitle.
          emittedBookSeries.add(bsId);
          cards.push({ kind: 'bookSeries', bookSeries: bs });
        } else {
          // Search — surface if the book series name matches, or any member title matches.
          // membersByBookSeries is built from allSeries (the full, un-text-searched list),
          // so all members are available for matching regardless of text filtering.
          const members = membersByBookSeries.get(bsId) ?? [];
          const nameMatch = bs.name.toLowerCase().includes(q);
          const memberMatch = members.find((m) => getTitle(m).toLowerCase().includes(q));

          if (nameMatch || memberMatch) {
            emittedBookSeries.add(bsId);
            cards.push({
              kind: 'bookSeries',
              bookSeries: bs,
              matchedTitle: memberMatch ? getTitle(memberMatch) : undefined,
            });
          }
          // No match — skip this book series card entirely.
          // Do NOT add to emittedBookSeries: a later member might still match via
          // a different path if the input list changes, and we don't want to
          // permanently block it. (In practice the loop processes all members of
          // this book series in one pass, but being defensive here is cheap.)
        }
        continue;
      }
    }

    // Standalone series (no book series, or orphaned membership).
    if (typeFilter !== 'all' && s.contentType !== typeFilter) continue;
    if (q && !getTitle(s).toLowerCase().includes(q)) continue;
    cards.push({ kind: 'series', series: s });
  }

  return { cards };
}
