import { z } from 'zod';
import { getSeries, updateSeries, type SeriesUpdate } from '@/server/db/series';
import { insertVolume, listVolumesBySeries } from '@/server/db/volumes';
import { lookupByIsbn, getVolume as getGBVolume } from '@/server/integrations/googlebooks';
import { getWork, getWorkEdition, getEditionByIsbn } from '@/server/integrations/openlibrary';
import { googleBooksApiKeyOrNull, googleBooksApiKeySetting } from '@/server/db/settings/googlebooks';
import { enqueueJob } from '@/server/db/jobs';
import { logger } from '@/server/logger';
import type { JobKindDescriptor } from '../types';
import { DEFAULT_RETRY_POLICY, DEFAULT_TIMEOUT_MS } from '../types';

const Payload = z.object({ seriesId: z.number().int().positive() });

export type EbookHydrateResult = {
  seriesId: number;
  fieldsUpdated: string[];
  volumesAdded: number;
};

function parseYear(s: string): number | null {
  const m = s.match(/(\d{4})/);
  return m && m[1] ? parseInt(m[1], 10) : null;
}

/**
 * Fill-when-null metadata hydrate for ebook series. Resolution order:
 *   1. If openlibraryId starts with "gb:", treat the suffix as a Google Books
 *      volume id and fetch via GB getVolume for description/cover/year. Do NOT
 *      pass gb: ids to OpenLibrary.
 *   2. Otherwise (genuine OL id): inspect the work's editions for ISBN/pages.
 *   3. With an ISBN, backfill description/pageCount/coverUrl from Google Books
 *      (using the configured API key to avoid 429 in keyless mode).
 *   4. If description or startYear are still missing AND an ISBN is available,
 *      fall back to OpenLibrary by ISBN (getEditionByIsbn → getWork) for
 *      description, startYear, and (optionally) cover/pages.
 * Also ensures the series has its expected volume stub rows. Never overwrites
 * values already set by the user or by Discover — only null fields are written.
 * Each external call is wrapped in try/catch so one failing source never blocks
 * the others. Idempotent: a re-run only writes fields that changed and only
 * inserts missing volume numbers.
 */
export const ebookHydrateDescriptor: JobKindDescriptor<{ seriesId: number }, EbookHydrateResult> = {
  kind: 'ebook_hydrate',
  retryPolicy: DEFAULT_RETRY_POLICY,
  timeoutMs: DEFAULT_TIMEOUT_MS * 5,
  handler: async (raw) => {
    const log = logger().child({ component: 'ebook_hydrate' });
    const { seriesId } = Payload.parse(raw);
    const empty: EbookHydrateResult = { seriesId, fieldsUpdated: [], volumesAdded: 0 };

    const series = await getSeries(seriesId);
    if (!series) {
      log.warn({ seriesId }, 'series not found');
      return empty;
    }
    if (series.contentType !== 'ebook') return empty;

    const fieldsUpdated: string[] = [];
    const patch: SeriesUpdate = {};

    // Read the Google Books API key once — used for all GB calls.
    let apiKey: string | null = null;
    try {
      apiKey = googleBooksApiKeyOrNull(await googleBooksApiKeySetting.get());
    } catch {
      // Settings read failure — proceed keyless.
    }

    // --- Metadata backfill (fill-when-null) ---
    const needDescription = series.description == null;
    const needCover = series.coverUrl == null;
    const needPageCount = series.pageCount == null;
    const needStartYear = series.startYear == null;

    const isGbId = series.openlibraryId?.startsWith('gb:') ?? false;
    const gbVolumeId = isGbId ? series.openlibraryId!.slice('gb:'.length) : null;

    let isbn = series.isbn;

    if (isGbId && gbVolumeId) {
      // B. Route gb:-prefixed ids to Google Books getVolume — NOT to OpenLibrary.
      if (needDescription || needCover || needStartYear || needPageCount) {
        try {
          const vol = await getGBVolume(gbVolumeId, apiKey);
          if (vol) {
            if (needDescription && vol.description) {
              patch.description = vol.description;
              fieldsUpdated.push('description');
            }
            if (needCover && vol.coverUrl) {
              patch.coverUrl = vol.coverUrl;
              fieldsUpdated.push('coverUrl');
            }
            if (needPageCount && vol.pageCount != null) {
              patch.pageCount = vol.pageCount;
              fieldsUpdated.push('pageCount');
            }
            if (needStartYear && vol.publishedYear != null) {
              patch.startYear = vol.publishedYear;
              fieldsUpdated.push('startYear');
            }
          }
        } catch (err) {
          log.warn(
            { seriesId, gbVolumeId, err: (err as Error).message },
            'google books getVolume failed; continuing',
          );
        }
      }
    } else {
      // Genuine OL id (or no id) — use existing OL editions path for ISBN/pages.
      // Inspect the work's editions when we still need an ISBN (works carry none —
      // editions do; required for Google Books) OR a page count (OpenLibrary's
      // number_of_pages is more reliable than Google Books for niche/KDP ISBNs).
      const wantEdition = (isbn == null && (needDescription || needCover)) || needPageCount;
      if (wantEdition && series.openlibraryId) {
        try {
          const edition = await getWorkEdition(series.openlibraryId);
          if (isbn == null && edition.isbn) {
            isbn = edition.isbn;
            patch.isbn = edition.isbn;
            fieldsUpdated.push('isbn');
          }
          if (needPageCount && edition.pages != null) {
            patch.pageCount = edition.pages;
            fieldsUpdated.push('pageCount');
          }
        } catch (err) {
          log.warn(
            { seriesId, olid: series.openlibraryId, err: (err as Error).message },
            'open library edition isbn lookup failed; continuing',
          );
        }
      }

      if (needDescription || needCover || needPageCount) {
        // Tier 1: Google Books by ISBN (stored or just-resolved). A. Use API key.
        if (isbn) {
          try {
            const gb = await lookupByIsbn(isbn, apiKey);
            if (gb) {
              if (needDescription && gb.description) {
                patch.description = gb.description;
                fieldsUpdated.push('description');
              }
              if (needCover && gb.coverUrl) {
                patch.coverUrl = gb.coverUrl;
                fieldsUpdated.push('coverUrl');
              }
              if (needPageCount && patch.pageCount == null && gb.pageCount != null) {
                patch.pageCount = gb.pageCount;
                fieldsUpdated.push('pageCount');
              }
            }
          } catch (err) {
            log.warn(
              { seriesId, isbn, err: (err as Error).message },
              'google books isbn lookup failed; continuing',
            );
          }
        }

        // Tier 2: OpenLibrary work record for the description, if still missing.
        const stillNeedDescription = needDescription && patch.description == null;
        if (stillNeedDescription && series.openlibraryId) {
          try {
            const work = await getWork(series.openlibraryId, 2);
            const olDescription =
              typeof work?.description === 'string'
                ? work.description
                : (work?.description?.value ?? null);
            if (olDescription) {
              patch.description = olDescription;
              fieldsUpdated.push('description');
            }
          } catch (err) {
            log.warn(
              { seriesId, olid: series.openlibraryId, err: (err as Error).message },
              'open library work lookup failed; continuing',
            );
          }
        }
      }
    }

    // C. OL-by-ISBN fallback — runs for BOTH the gb: and OL branches above. When
    // the description is STILL missing and an ISBN is available, hit
    // /isbn/<isbn>.json → work (keyless, no 429 risk) and opportunistically
    // backfill startYear. This is the ONLY OpenLibrary path reachable for
    // gb:-prefixed series, whose ids OpenLibrary cannot resolve.
    const stillNeedDesc = needDescription && patch.description == null;
    if (stillNeedDesc && isbn) {
      try {
        const edition = await getEditionByIsbn(isbn);
        if (edition) {
          // Backfill startYear from edition publish_date (opportunistic).
          if (needStartYear && patch.startYear == null && edition.publishDate) {
            const year = parseYear(edition.publishDate);
            if (year != null) {
              patch.startYear = year;
              fieldsUpdated.push('startYear');
            }
          }
          // Fetch the work for description and first_publish_date fallback.
          if (edition.workKey) {
            const workOlid = edition.workKey.replace(/^\/works\//, '');
            try {
              const work = await getWork(workOlid, 2);
              if (work) {
                if (stillNeedDesc && patch.description == null) {
                  const desc =
                    typeof work.description === 'string'
                      ? work.description
                      : (work.description?.value ?? null);
                  if (desc) {
                    patch.description = desc;
                    fieldsUpdated.push('description');
                  }
                }
                // Also use work first_publish_date as startYear fallback if
                // edition publish_date didn't give us a year.
                if (needStartYear && patch.startYear == null && work.first_publish_date) {
                  const year = parseYear(work.first_publish_date);
                  if (year != null) {
                    patch.startYear = year;
                    fieldsUpdated.push('startYear');
                  }
                }
              }
            } catch (err) {
              log.warn(
                { seriesId, workOlid, err: (err as Error).message },
                'open library work fetch (isbn path) failed; continuing',
              );
            }
          }
        }
      } catch (err) {
        log.warn(
          { seriesId, isbn, err: (err as Error).message },
          'open library isbn edition lookup failed; continuing',
        );
      }
    }

    if (Object.keys(patch).length > 0) {
      await updateSeries(seriesId, patch);
    }

    // --- Alternate titles → extraSearchTermsJson ---
    // Merge OL work's alternate_titles into the series so alias-aware indexer
    // queries find it (e.g. "Northern Lights" gains alias "The Golden Compass").
    // Only runs for genuine OL ids (not gb: prefixed). Idempotent: dedupes
    // against existing terms. Only enqueues a search when something changed.
    if (series.openlibraryId && !isGbId) {
      try {
        const work = await getWork(series.openlibraryId, 2);
        const aliases = (work?.alternateTitles ?? []).filter(
          (t) =>
            t.trim().length > 0 &&
            t.toLowerCase() !== (series.titleEnglish ?? '').toLowerCase(),
        );
        if (aliases.length > 0) {
          const existing: string[] = (() => {
            try {
              return JSON.parse(series.extraSearchTermsJson) as string[];
            } catch {
              return [];
            }
          })();
          const merged = Array.from(new Set([...existing, ...aliases]));
          if (merged.length > existing.length) {
            await updateSeries(series.id, { extraSearchTermsJson: JSON.stringify(merged) });
            await enqueueJob('series_release_search', { seriesId: series.id });
          }
        }
      } catch (err) {
        log.warn(
          { seriesId, olid: series.openlibraryId, err: (err as Error).message },
          'alternate titles lookup failed; continuing',
        );
      }
    }

    // --- Volume stubs ---
    // A single ebook should have volume 1; a book series has 1..totalVolumes.
    // Only insert numbers that don't already exist (idempotent).
    let volumesAdded = 0;
    const existing = await listVolumesBySeries(seriesId);
    if (existing.length === 0 && series.totalVolumes != null && series.totalVolumes >= 1) {
      for (let n = 1; n <= series.totalVolumes; n++) {
        await insertVolume({ seriesId, number: n, title: `Volume ${n}` });
        volumesAdded++;
      }
    }

    log.info({ seriesId, fieldsUpdated, volumesAdded }, 'ebook_hydrate complete');
    return { seriesId, fieldsUpdated, volumesAdded };
  },
};
