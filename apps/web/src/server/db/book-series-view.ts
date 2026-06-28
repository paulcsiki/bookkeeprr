import type { BookSeriesDetail } from './book-series';
import type { BookSeriesEntry } from '@bookkeeprr/types';

/**
 * Merges a `BookSeriesDetail` (from `getBookSeries`) into a flat, sorted list
 * of `BookSeriesEntry` objects ready for the API response or the series page.
 *
 * Algorithm:
 * 1. Build lookup maps for owned members: by externalRef (isbn/asin) and by
 *    normalised title+position.
 * 2. Walk the saga entries; match each to an owned member via externalRef first,
 *    then title+position. Matched → owned:true, seriesId set.
 * 3. Unmatched entries → owned:false.
 * 4. Members with no matching entry (orphans — e.g. manual links, no saga
 *    listing) are appended as owned:true at the end.
 * 5. Sort the full list by position ascending, nulls last.
 */
export function mergeBooks(detail: BookSeriesDetail): BookSeriesEntry[] {
  const { members, entries } = detail;

  // Build lookup maps.
  const ownedByRef = new Map<string, (typeof members)[number]>();
  const ownedByTitlePos = new Map<string, (typeof members)[number]>();
  const ownedByTitle = new Map<string, (typeof members)[number]>();
  for (const m of members) {
    if (m.series.isbn) ownedByRef.set(m.series.isbn, m);
    if (m.series.asin) ownedByRef.set(m.series.asin, m);
    ownedByTitlePos.set(
      `${(m.series.titleEnglish ?? '').toLowerCase()}|${m.member.position ?? ''}`,
      m,
    );
    // Title-only fallback: a catalogue entry and the owned member often carry
    // different positions (entries are year-ordered; members keep their source
    // position) and different external refs (work key vs isbn/asin), so without
    // this the same book surfaces twice — once owned, once not. First member per
    // title wins.
    const titleKey = (m.series.titleEnglish ?? '').toLowerCase();
    if (titleKey && !ownedByTitle.has(titleKey)) ownedByTitle.set(titleKey, m);
  }

  const usedMemberIds = new Set<number>();

  const fromEntries: BookSeriesEntry[] = entries.map((e) => {
    const m =
      (e.externalRef ? ownedByRef.get(e.externalRef) : undefined) ??
      ownedByTitlePos.get(`${e.title.toLowerCase()}|${e.position ?? ''}`) ??
      ownedByTitle.get(e.title.toLowerCase());
    if (m) usedMemberIds.add(m.member.id);
    return {
      position: e.position,
      title: e.title,
      externalRef: e.externalRef,
      // Cover + seriesId still come from the linked member even when it has no
      // files, so a monitored-but-undownloaded book shows its art and links to
      // its series — but `owned` requires an actual file (see hasFiles).
      coverUrl: m?.series.coverUrl ?? e.coverUrl,
      owned: Boolean(m?.hasFiles),
      seriesId: m?.series.id ?? null,
    };
  });

  // Members with no matching entry are appended. Owned only if they have a
  // file — a linked-but-empty orphan series shows as not-owned, same as a
  // monitored catalogue entry awaiting download.
  const orphanMembers: BookSeriesEntry[] = members
    .filter((m) => !usedMemberIds.has(m.member.id))
    .map((m) => ({
      position: m.member.position,
      title: m.series.titleEnglish ?? `Series #${m.series.id}`,
      externalRef: m.series.isbn ?? m.series.asin ?? null,
      coverUrl: m.series.coverUrl,
      owned: m.hasFiles,
      seriesId: m.series.id,
    }));

  return [...fromEntries, ...orphanMembers].sort(
    (a, b) => (a.position ?? Infinity) - (b.position ?? Infinity),
  );
}
