import { z } from 'zod';
import { eq } from 'drizzle-orm';
import type { ContentType } from '@bookkeeprr/types/pure';
import { getSeries } from '@/server/db/series';
import { getDb } from '@/server/db/client';
import { bookSeries as bookSeriesTable } from '@/server/db/schema';
import {
  createBookSeries,
  listBookSeries,
  addMember,
  replaceEntries,
} from '@/server/db/book-series';
import { detectBookSeries } from '@/server/integrations/book-series/detect';
import { normalizeSeriesName } from '@/server/integrations/book-series/match';
import { logger } from '@/server/logger';
import type { JobKindDescriptor } from '../types';
import { DEFAULT_RETRY_POLICY, DEFAULT_TIMEOUT_MS } from '../types';

const Payload = z.object({ seriesId: z.number().int().positive() });

export type BookSeriesDetectResult = {
  seriesId: number;
  linked: boolean;
  bookSeriesId: number | null;
  created: boolean;
};

/**
 * Find an existing book_series by externalId (when non-null) or by normalised
 * name + contentType.  Returns the id of the matched row, or null when none found.
 *
 * This is intentionally a simple helper rather than a full DAL function so that
 * we keep the find-or-create logic co-located with the job that needs it.
 */
async function findBookSeriesId(
  externalId: string | null,
  normalizedName: string,
  contentType: ContentType,
): Promise<number | null> {
  // Prefer an externalId match — it's exact and cheap.
  if (externalId) {
    const [row] = await getDb()
      .select({ id: bookSeriesTable.id })
      .from(bookSeriesTable)
      .where(eq(bookSeriesTable.externalId, externalId))
      .limit(1);
    if (row) return row.id;
  }

  // Fall back to listing by content type and matching the normalized name in JS
  // (avoids case/punctuation divergence from a LIKE query).
  const candidates = await listBookSeries({ contentType });
  for (const c of candidates) {
    if (normalizeSeriesName(c.name) === normalizedName) return c.id;
  }
  return null;
}

export const bookSeriesDetectDescriptor: JobKindDescriptor<
  { seriesId: number },
  BookSeriesDetectResult
> = {
  kind: 'book_series_detect',
  retryPolicy: DEFAULT_RETRY_POLICY,
  timeoutMs: DEFAULT_TIMEOUT_MS * 2,
  handler: async (raw) => {
    const log = logger().child({ component: 'book_series_detect' });
    const { seriesId } = Payload.parse(raw);

    const empty: BookSeriesDetectResult = {
      seriesId,
      linked: false,
      bookSeriesId: null,
      created: false,
    };

    const series = await getSeries(seriesId);
    if (!series) {
      log.warn({ seriesId }, 'series not found; skipping');
      return empty;
    }

    if (series.contentType !== 'ebook' && series.contentType !== 'audiobook') {
      log.info({ seriesId, contentType: series.contentType }, 'unsupported content type; skipping');
      return empty;
    }

    let d;
    try {
      d = await detectBookSeries(series);
    } catch (err) {
      log.warn({ seriesId, err: (err as Error).message }, 'detectBookSeries threw unexpectedly; skipping');
      return empty;
    }
    if (!d) {
      log.info({ seriesId }, 'no confident book-series detected');
      return empty;
    }

    const normalizedName = normalizeSeriesName(d.name);

    // Find-or-create the book_series row.
    let bookSeriesId = await findBookSeriesId(d.externalId, normalizedName, series.contentType);
    let created = false;

    if (bookSeriesId === null) {
      const bs = await createBookSeries({
        name: d.name,
        contentType: series.contentType,
        source: d.source,
        externalId: d.externalId,
      });
      bookSeriesId = bs.id;
      created = true;
      log.info({ seriesId, bookSeriesId, name: d.name }, 'book_series created');
    } else {
      log.info({ seriesId, bookSeriesId, name: d.name }, 'book_series found');
    }

    // addMember is idempotent: calling again with linkSource:'auto' does NOT
    // throw and does NOT downgrade an existing manual link.
    await addMember(bookSeriesId, seriesId, {
      position: d.position,
      linkSource: 'auto',
    });

    if (d.entries.length > 0) {
      await replaceEntries(bookSeriesId, d.entries);
    }

    log.info({ seriesId, bookSeriesId, created, position: d.position }, 'book_series_detect complete');
    return { seriesId, linked: true, bookSeriesId, created };
  },
};
