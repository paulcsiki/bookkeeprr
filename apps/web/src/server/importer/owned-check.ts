import { eq } from 'drizzle-orm';
import { getDb } from '@/server/db/client';
import { libraryFiles, series, volumes } from '@/server/db/schema';
import type { SeriesRow } from '@/server/db/schema';
import { parseReleaseTitle } from '@/server/parser/release';
import { titleMatches } from '@/server/matcher/titles';
import { contentTypeSubdir } from '@/server/content-type/paths';
import type { ScanItem } from '@/server/importer/import-scan';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ExistingSeriesEntry = {
  series: SeriesRow;
  /** Volume numbers already owned (have a library_files row). */
  ownedVolumes: Set<number>;
};

// ---------------------------------------------------------------------------
// DAL helper
// ---------------------------------------------------------------------------

/**
 * Load all library series along with the set of volume numbers they currently
 * own (have at least one library_files row linked through library_files.volumeId).
 *
 * Used by the import scanner to filter out scan items whose volume is already
 * in the library. One call per scan run — not per item.
 */
export async function loadExistingSeriesWithOwnedVolumes(): Promise<ExistingSeriesEntry[]> {
  const db = getDb();

  const [seriesRows, ownedRows] = await Promise.all([
    db.select().from(series),
    db
      .select({ seriesId: libraryFiles.seriesId, volumeNumber: volumes.number })
      .from(libraryFiles)
      .innerJoin(volumes, eq(libraryFiles.volumeId, volumes.id)),
  ]);

  // Build seriesId → Set<number> owned-volume map.
  const ownedMap = new Map<number, Set<number>>();
  for (const r of ownedRows) {
    let s = ownedMap.get(r.seriesId);
    if (!s) {
      s = new Set<number>();
      ownedMap.set(r.seriesId, s);
    }
    s.add(r.volumeNumber);
  }

  return seriesRows.map((s) => ({
    series: s,
    ownedVolumes: ownedMap.get(s.id) ?? new Set<number>(),
  }));
}

// ---------------------------------------------------------------------------
// Pure decision function
// ---------------------------------------------------------------------------

/**
 * Returns true if the scan item's volume is already owned by a matching
 * library series — i.e. the item should be excluded from import results.
 *
 * Decision logic:
 * 1. Parse the item's detectedTitle with parseReleaseTitle to get a cleanTitle
 *    and targetLow (the volume number). Items with no parseable volume are
 *    treated as volume 1 (consistent with the adopt flow's default).
 * 2. For each existing series of the SAME contentType where titleMatches is
 *    true, check whether ownedVolumes contains the item's volume.
 * 3. If any such match confirms ownership → return true (skip the item).
 *
 * Conservative: returns false when no matching series is found or when the
 * volume cannot be confirmed as owned. When in doubt, show the item — it is
 * always better to surface a potential duplicate than to hide a missing volume.
 */
export function isScanItemAlreadyOwned(
  item: ScanItem,
  existing: ExistingSeriesEntry[],
): boolean {
  const parsed = parseReleaseTitle(item.detectedTitle);
  // A batch item (e.g. "v01-v03") may include volumes we don't own — never hide it.
  if (parsed.isBatch) return false;
  // Treat "no parseable volume" as volume 1 (single-book / whole-series item).
  const vol = parsed.targetLow ?? 1;

  for (const entry of existing) {
    // Match across content types that share a storage directory
    // (ebook ⇄ light_novel → "books", manga ⇄ comic → "comics"): the SAME
    // physical file is scanned once per content type mapped to its directory, so
    // an ebook scan of a file already owned as a light_novel (or vice versa) must
    // still be recognised as owned — otherwise the duplicate leaks into import.
    if (contentTypeSubdir(entry.series.contentType) !== contentTypeSubdir(item.contentType)) {
      continue;
    }
    // Import filenames carry publisher/group tags but never the author, so match
    // on title alone — requiring the author (as the release matcher does) would
    // never match a book series that has an author set, leaking owned volumes
    // back into the import grid.
    if (titleMatches(parsed, entry.series, { requireAuthor: false }) && entry.ownedVolumes.has(vol)) {
      return true;
    }
  }
  return false;
}
