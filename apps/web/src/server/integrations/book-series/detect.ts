/**
 * Book-series auto-detection orchestrator.
 *
 * Given an ebook or audiobook SeriesRow, attempts to identify which book series
 * it belongs to — returning a best-effort detection result, or null when nothing
 * confident could be determined.
 *
 * BEST-EFFORT CONTRACT: all external calls are wrapped in try/catch so that any
 * networking failure, API error, or unexpected shape returns null rather than
 * throwing out of the orchestrator.
 */
import type { SeriesRow } from '@/server/db/schema';
import type { BookSeriesRow } from '@/server/db/schema';
import { searchSeriesVolumes, deriveSeriesFromEditions } from '@/server/integrations/googlebooks';
import { googleBooksApiKeyOrNull, googleBooksApiKeySetting } from '@/server/db/settings/googlebooks';
import {
  getEditionByIsbn,
  getWork,
  getOLSeries,
  getOLSeriesWorks,
} from '@/server/integrations/openlibrary';
import { searchAudiobooks } from '@/server/integrations/itunes/client';
import { normalizeSeriesName, stripVolumeSuffix, nameMatch } from './match';
import { logger } from '@/server/logger';

export type DetectBookSeriesResult = {
  name: string;
  source: BookSeriesRow['source'];
  externalId: string | null;
  position: number | null;
  entries: Array<{
    position: number | null;
    title: string;
    externalRef: string | null;
    coverUrl: string | null;
  }>;
};

// ---------------------------------------------------------------------------
// Ebook detection via Google Books
// ---------------------------------------------------------------------------

/**
 * OpenLibrary fallback for ebook series detection. Used when Google Books
 * returns empty results (e.g. 429/keyless). Looks up the series' ISBN →
 * /isbn/<isbn>.json → work → work.series → /series/<key>.json for a name.
 * Returns a detection result when a series name is found, else null.
 * Best-effort: all failures return null without throwing.
 */
async function detectEbookViaOpenLibrary(
  series: SeriesRow,
): Promise<DetectBookSeriesResult | null> {
  const isbn = series.isbn;
  if (!isbn) return null;

  const log = logger().child({ component: 'book_series_detect' });
  try {
    const edition = await getEditionByIsbn(isbn);
    if (!edition?.workKey) return null;

    const workOlid = edition.workKey.replace(/^\/works\//, '');
    const work = await getWork(workOlid, 2);
    if (!work?.series?.length) return null;

    const seriesEntry = work.series[0]!;
    const seriesKey = seriesEntry.series.key;
    const position = seriesEntry.position != null ? (parseInt(seriesEntry.position, 10) || null) : null;

    const olSeries = await getOLSeries(seriesKey);
    if (!olSeries?.name) return null;

    // Populate the full catalogue from the series' member works so the book-series
    // page lists every book (owned or not) — not just the titles already added to
    // the library. Best-effort: an empty result leaves entries empty (no regression
    // vs. the previous always-empty behaviour). Position is the 1-based index of
    // the year-sorted list since OL's per-work series position is unreliable.
    const works = await getOLSeriesWorks(seriesKey);
    const entries = works.map((w, i) => ({
      position: i + 1,
      title: w.title,
      externalRef: w.workKey,
      coverUrl: w.coverUrl,
    }));

    return {
      name: olSeries.name,
      source: 'openlibrary',
      externalId: seriesKey,
      position,
      entries,
    };
  } catch (err) {
    log.warn(
      { seriesId: series.id, isbn, err: (err as Error).message },
      'openlibrary ebook series detection failed; skipping',
    );
    return null;
  }
}

async function detectEbook(series: SeriesRow): Promise<DetectBookSeriesResult | null> {
  const title = series.titleEnglish ?? series.titleRomaji ?? series.titleNative;
  if (!title) return null;

  const { base, position } = stripVolumeSuffix(title);
  // A title with no volume suffix may be a standalone — use the full title as
  // the candidate series name, but lower confidence.
  const candidateName = base.trim() || title;

  let apiKey: string | null = null;
  try {
    apiKey = googleBooksApiKeyOrNull(await googleBooksApiKeySetting.get());
  } catch {
    // Settings read failure — proceed keyless.
  }

  let editions;
  try {
    editions = await searchSeriesVolumes(candidateName, series.publisher, apiKey);
  } catch (err) {
    logger().child({ component: 'book_series_detect' }).warn(
      { seriesId: series.id, err: (err as Error).message },
      'google books series volumes search failed; trying openlibrary fallback',
    );
    // D. OL fallback when GB throws (e.g. 429).
    return await detectEbookViaOpenLibrary(series);
  }

  const derived = deriveSeriesFromEditions(editions, candidateName);
  if (!derived) {
    // D. Low confidence from GB — try OL fallback (handles keyless/empty result).
    return await detectEbookViaOpenLibrary(series);
  }

  // Build entries list from derived volumes.
  const entries = derived.volumes.map((v) => ({
    position: v.number,
    title: v.title,
    externalRef: v.googleBooksVolumeId,
    coverUrl: v.coverUrl,
  }));

  return {
    name: candidateName,
    source: 'googlebooks',
    externalId: derived.volumes[0]?.googleBooksVolumeId ?? null,
    position,
    entries,
  };
}

// ---------------------------------------------------------------------------
// Audiobook detection via iTunes
// ---------------------------------------------------------------------------

/**
 * Heuristic: iTunes "collections" are often a single multi-part audiobook (e.g.
 * "Lord of the Rings" as one product) rather than a true multi-book saga.  We
 * only treat collectionName as a real series when the collection name and the
 * individual title differ in a way that suggests the collection groups multiple
 * distinct books — specifically, the collection name does NOT contain the
 * individual title verbatim (after normalisation).
 *
 * NOTE: This heuristic errs on the conservative side and will miss some real
 * multi-book series where the collection name closely matches one of the books.
 * A future improvement could verify against a known series database.
 */
function itunesCollectionIsRealSeries(
  collectionName: string,
  singleTitle: string,
  _author: string | null,
): boolean {
  const normCollection = normalizeSeriesName(collectionName);
  const normTitle = normalizeSeriesName(singleTitle);

  // If the collection name is identical or nearly identical to the single title,
  // it's almost certainly a single-product collection, not a series.
  if (nameMatch(collectionName, singleTitle)) return false;

  // If the normalised collection name contains the normalised single title in
  // full, it's likely a bundled edition (e.g. "Harry Potter Complete Box Set")
  // rather than a series label.
  if (normCollection.includes(normTitle)) return false;

  // Guard 3 removed: requiring the collection name to be shorter than the
  // individual title wrongly rejects legitimate longer series labels such as
  // "The Stormlight Archive" vs "The Way of Kings". Non-empty + not-equal is
  // already enforced by the two guards above.

  return true;
}

async function detectAudiobook(series: SeriesRow): Promise<DetectBookSeriesResult | null> {
  const title = series.titleEnglish ?? series.titleRomaji ?? series.titleNative;
  if (!title) return null;

  const author = series.author ?? null;

  let hits;
  try {
    const query = author ? `${title} ${author}` : title;
    hits = await searchAudiobooks(query);
  } catch (err) {
    logger().child({ component: 'book_series_detect' }).warn(
      { seriesId: series.id, err: (err as Error).message },
      'iTunes audiobook search failed; skipping audiobook detection',
    );
    return null;
  }

  // Find the best-matching hit: the INDIVIDUAL track title matches the user's
  // title, and the hit has a collectionName that differs from the individual
  // title (suggesting a real multi-book series).
  //
  // NOTE: `hit.title` is set from `collectionName ?? trackName` in the iTunes
  // client, so for a series hit the collection name is in `hit.title` while the
  // individual book title is in `hit.trackName`.  We must match on trackName
  // (the individual book) so that series like "The Kingkiller Chronicle" where
  // collectionName ≠ individual book title are not silently skipped.
  for (const hit of hits) {
    if (!hit.collectionName || !hit.collectionId) continue;
    // Match against the individual track title; fall back to hit.title when
    // trackName is absent (RSS feed hits have no trackName).
    if (!nameMatch(hit.trackName ?? hit.title, title)) continue;

    // NOTE: iTunes "collections" often equal ONE multi-part audiobook, not a
    // saga of distinct books.  Guard with a name+author heuristic before
    // treating collectionName as a real multi-book series label.
    if (!itunesCollectionIsRealSeries(hit.collectionName, title, author)) continue;

    return {
      name: hit.collectionName,
      source: 'itunes',
      externalId: String(hit.collectionId),
      position: null,
      entries: [],
    };
  }

  return null;
}

// ---------------------------------------------------------------------------
// Public orchestrator
// ---------------------------------------------------------------------------

/**
 * Detect which book series `series` belongs to.
 *
 * Returns a DetectBookSeriesResult when a confident match was found, or null
 * when nothing could be determined or when the content type is unsupported.
 * Never throws — all integration errors return null.
 */
export async function detectBookSeries(
  series: SeriesRow,
): Promise<DetectBookSeriesResult | null> {
  try {
    if (series.contentType === 'ebook') {
      return await detectEbook(series);
    }
    if (series.contentType === 'audiobook') {
      return await detectAudiobook(series);
    }
    // Not a supported content type for series detection.
    return null;
  } catch (err) {
    logger().child({ component: 'book_series_detect' }).warn(
      { seriesId: series.id, err: (err as Error).message },
      'detectBookSeries unexpected error; returning null',
    );
    return null;
  }
}
