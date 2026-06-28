import { searchBooks } from '@/server/integrations/openlibrary';
import { searchVolumes } from '@/server/integrations/googlebooks';
import { googleBooksApiKeySetting } from '@/server/db/settings/googlebooks';
import { titleMatches } from '@/server/matcher/titles';
import { parseReleaseTitle } from '@/server/parser/release';
import type { ScanItem } from '@/server/importer/import-scan';
import type { SeriesRow } from '@/server/db/schema';

// ---------------------------------------------------------------------------
// Public types (consumed by the grid + adopt tasks)
// ---------------------------------------------------------------------------

export type Candidate = {
  sourceId: string;
  title: string;
  author: string | null;
  year: number | null;
  isbn: string | null;
  coverUrl: string | null;
  source: 'openlibrary' | 'googlebooks';
};

export type MatchedItem = ScanItem & { best: Candidate | null; alternatives: Candidate[] };

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

const MAX_ALTERNATIVES = 4;

/**
 * Build a throwaway SeriesRow-shaped object whose only purpose is to let
 * `titleMatches` compare a candidate against the detected title. The non-
 * essential fields carry harmless defaults — they are never written to the DB.
 */
function syntheticSeries(
  detectedTitle: string,
  author: string | null,
  contentType: SeriesRow['contentType'],
): SeriesRow {
  return {
    id: 0,
    contentType,
    titleEnglish: detectedTitle,
    titleRomaji: null,
    titleNative: null,
    author,
    extraSearchTermsJson: '[]',
    status: 'releasing',
    monitoring: 'all',
    granularity: 'volume',
    rootPath: '',
    qualityProfileId: 0,
    groupId: null,
    addedAt: new Date(0),
    updatedAt: new Date(0),
    // Provider / enrichment fields — irrelevant for ranking
    anilistId: null,
    malId: null,
    comicvineId: null,
    publisher: null,
    startYear: null,
    pageCount: null,
    runtimeMinutes: null,
    openlibraryId: null,
    isbn: null,
    asin: null,
    narrator: null,
    mangadexId: null,
    novelUpdatesSlug: null,
    novelUpdatesId: null,
    googleBooksVolumeId: null,
    googleBooksQuery: null,
    coverUrl: null,
    description: null,
    totalVolumes: null,
    totalChapters: null,
  };
}

/**
 * True when the candidate's title matches the detected title via the same
 * token-based logic used by the release matcher. Constructing a synthetic
 * SeriesRow per candidate is cheap — this runs in-process with no I/O.
 */
function candidateMatches(
  candidate: Candidate,
  detectedTitle: string,
  contentType: SeriesRow['contentType'],
): boolean {
  const parsed = parseReleaseTitle(
    candidate.title + (candidate.author ? ' ' + candidate.author : ''),
  );
  const series = syntheticSeries(detectedTitle, candidate.author, contentType);
  return titleMatches(parsed, series);
}

/**
 * Rank candidates: matched (title-leading) first, then by cover presence, then
 * by year descending (most recent). Within each group the order is stable with
 * respect to provider order (OL results precede GB results in the input).
 */
function rankCandidates(
  candidates: Candidate[],
  detectedTitle: string,
  contentType: SeriesRow['contentType'],
): Candidate[] {
  return candidates.slice().sort((a, b) => {
    const matchA = candidateMatches(a, detectedTitle, contentType) ? 1 : 0;
    const matchB = candidateMatches(b, detectedTitle, contentType) ? 1 : 0;
    if (matchA !== matchB) return matchB - matchA;

    // Within group: prefer a present cover
    const coverA = a.coverUrl ? 1 : 0;
    const coverB = b.coverUrl ? 1 : 0;
    if (coverA !== coverB) return coverB - coverA;

    // Then prefer more-recent year (higher year = smaller sort index)
    const yearA = a.year ?? 0;
    const yearB = b.year ?? 0;
    return yearB - yearA;
  });
}

/**
 * Normalize a title+author pair for dedup: lowercase + trim.  Keying on both
 * fields prevents two different books that share a title (different authors)
 * from wrongly collapsing into one candidate.
 */
function normalizeForDedup(title: string, author?: string | null): string {
  return `${title.toLowerCase().trim()}||${(author ?? '').toLowerCase().trim()}`;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Query metadata providers for `item.detectedTitle`, map results to
 * `Candidate`, rank them using the same title-matching core as the release
 * matcher, and return the best match plus up to 4 alternatives.
 *
 * Provider failures are caught and ignored — if nothing is found `best` is
 * null and `alternatives` is empty, letting the import grid fall back to
 * manual search.
 */
export async function matchScanItem(item: ScanItem): Promise<MatchedItem> {
  const { detectedTitle, contentType } = item;

  // Fan out to providers in parallel: OL always; GB only when an API key is set.
  const [olOut, gbOut] = await Promise.allSettled([
    searchBooks(detectedTitle),
    (async () => {
      const rawKey = await googleBooksApiKeySetting.get();
      const key = rawKey.length > 0 ? rawKey : null;
      if (!key) return null;
      return searchVolumes(detectedTitle, key);
    })(),
  ]);

  const candidates: Candidate[] = [];

  if (olOut.status === 'fulfilled') {
    for (const h of olOut.value) {
      candidates.push({
        sourceId: h.olid,
        title: h.title,
        author: h.author,
        year: h.firstPublishYear,
        isbn: h.isbn,
        coverUrl: h.coverUrl,
        source: 'openlibrary',
      });
    }
  }
  // OL errors are silently swallowed — `candidates` stays empty for OL.

  if (gbOut.status === 'fulfilled' && gbOut.value) {
    // Dedup against already-collected OL titles (OL wins on collision).
    const seen = new Set(candidates.map((c) => normalizeForDedup(c.title, c.author)));
    for (const h of gbOut.value) {
      const key = normalizeForDedup(h.title, h.author);
      if (!seen.has(key)) {
        seen.add(key);
        candidates.push({
          sourceId: `gb:${h.gbid}`,
          title: h.title,
          author: h.author,
          year: h.year,
          isbn: h.isbn,
          coverUrl: h.coverUrl,
          source: 'googlebooks',
        });
      } else {
        // OL entry exists — graft GB cover when OL lacks one.
        const idx = candidates.findIndex((c) => normalizeForDedup(c.title, c.author) === key);
        if (idx !== -1 && !candidates[idx]!.coverUrl && h.coverUrl) {
          candidates[idx] = { ...candidates[idx]!, coverUrl: h.coverUrl };
        }
      }
    }
  }
  // GB errors are silently swallowed.

  if (candidates.length === 0) {
    return { ...item, best: null, alternatives: [] };
  }

  const ranked = rankCandidates(
    candidates,
    detectedTitle,
    contentType as SeriesRow['contentType'],
  );
  const best = ranked[0] ?? null;
  const alternatives = ranked.slice(1, 1 + MAX_ALTERNATIVES);

  return { ...item, best, alternatives };
}
