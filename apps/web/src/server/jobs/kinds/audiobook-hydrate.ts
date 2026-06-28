import { z } from 'zod';
import { getSeries, updateSeries, type SeriesUpdate } from '@/server/db/series';
import { searchAudiobooks, type ITunesAudiobookHit } from '@/server/integrations/itunes/client';
import { nameMatch } from '@/server/integrations/book-series/match';
import { logger } from '@/server/logger';
import type { JobKindDescriptor } from '../types';
import { DEFAULT_RETRY_POLICY, DEFAULT_TIMEOUT_MS } from '../types';

const Payload = z.object({ seriesId: z.number().int().positive() });

export type AudiobookHydrateResult = {
  seriesId: number;
  fieldsUpdated: string[];
};

/**
 * Pick the iTunes audiobook hit whose individual title best matches the series
 * title. Mirrors detectAudiobook: match against `trackName` (the individual
 * book) and fall back to `title` (collectionName ?? trackName) when trackName
 * is absent. Returns the first matching hit, or null when none match.
 */
/**
 * Strip the "(Unabridged)" / "(Abridged)" edition tag iTunes appends to most
 * audiobook titles. Without this, the English "Sabriel (Unabridged)" fails an
 * exact name match against "Sabriel" and a bare foreign-language edition (e.g.
 * a Danish "Sabriel") wins instead — yielding a wrong-language description.
 */
function stripEditionTag(s: string): string {
  return s.replace(/\s*\((?:un)?abridged\)\s*/gi, ' ').trim();
}

function pickBestHit(hits: ITunesAudiobookHit[], title: string): ITunesAudiobookHit | null {
  for (const hit of hits) {
    if (nameMatch(stripEditionTag(hit.trackName ?? hit.title), title)) return hit;
  }
  return null;
}

/**
 * Fill-when-null metadata hydrate for audiobook series.
 *
 * Audiobook metadata otherwise only arrives from Audnex (ASIN-keyed) at
 * discover/add time, so an audiobook added without an ASIN stays blank forever.
 * This job backfills description, startYear, coverUrl (and narrator if iTunes
 * ever exposes one) by searching iTunes' keyless audiobook catalog by title
 * (and `title author` when an author is known, like detectAudiobook). The best
 * matching hit is chosen with the same `nameMatch` heuristic used for series
 * detection.
 *
 * Contract: fill-when-null only (never overwrites a value set by the user or
 * Discover), idempotent (a re-run only writes fields that are still null and
 * found again), and best-effort (the iTunes call is wrapped in try/catch so a
 * network/API failure never throws out of the handler). No-op for non-audiobook
 * series.
 *
 * NOTE: iTunes does NOT expose a narrator field for audiobook search results,
 * so narrator is intentionally NOT backfilled here (it would always be a no-op).
 * narrator continues to come from Audnex at discover/add time.
 */
export const audiobookHydrateDescriptor: JobKindDescriptor<
  { seriesId: number },
  AudiobookHydrateResult
> = {
  kind: 'audiobook_hydrate',
  retryPolicy: DEFAULT_RETRY_POLICY,
  timeoutMs: DEFAULT_TIMEOUT_MS * 5,
  handler: async (raw) => {
    const log = logger().child({ component: 'audiobook_hydrate' });
    const { seriesId } = Payload.parse(raw);
    const empty: AudiobookHydrateResult = { seriesId, fieldsUpdated: [] };

    const series = await getSeries(seriesId);
    if (!series) {
      log.warn({ seriesId }, 'series not found');
      return empty;
    }
    if (series.contentType !== 'audiobook') return empty;

    const needDescription = series.description == null;
    const needStartYear = series.startYear == null;
    const needCover = series.coverUrl == null;

    // Nothing to do — every backfillable field is already set. (narrator is not
    // backfillable from iTunes, so it does not gate the search.)
    if (!needDescription && !needStartYear && !needCover) return empty;

    const title = series.titleEnglish ?? series.titleRomaji ?? series.titleNative;
    if (!title) return empty;
    const author = series.author ?? null;

    let hits: ITunesAudiobookHit[];
    try {
      const query = author ? `${title} ${author}` : title;
      hits = await searchAudiobooks(query);
    } catch (err) {
      log.warn(
        { seriesId, err: (err as Error).message },
        'iTunes audiobook search failed; skipping audiobook_hydrate',
      );
      return empty;
    }

    const hit = pickBestHit(hits, title);
    if (!hit) {
      log.info({ seriesId, title }, 'no matching iTunes audiobook hit; nothing to backfill');
      return empty;
    }

    const fieldsUpdated: string[] = [];
    const patch: SeriesUpdate = {};

    if (needDescription && hit.description) {
      patch.description = hit.description;
      fieldsUpdated.push('description');
    }
    if (needStartYear) {
      const year = hit.releaseYear ?? null;
      if (year != null) {
        patch.startYear = year;
        fieldsUpdated.push('startYear');
      }
    }
    if (needCover && hit.coverUrl) {
      patch.coverUrl = hit.coverUrl;
      fieldsUpdated.push('coverUrl');
    }

    if (Object.keys(patch).length > 0) {
      await updateSeries(seriesId, patch);
    }

    log.info({ seriesId, fieldsUpdated }, 'audiobook_hydrate complete');
    return { seriesId, fieldsUpdated };
  },
};
