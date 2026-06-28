import { z } from 'zod';
import { getSeries } from '@/server/db/series';
import { upsertChapterByNumberSort } from '@/server/db/chapters';
import { fetchChapterFeed } from '@/server/integrations/novelupdates/client';
import { logger } from '@/server/logger';
import type { JobKindDescriptor } from '../types';
import { DEFAULT_RETRY_POLICY, DEFAULT_TIMEOUT_MS } from '../types';

const Payload = z.object({ seriesId: z.number().int().positive() });

export type NovelUpdatesChapterSyncResult = {
  seriesId: number;
  chaptersAdded: number;
};

/**
 * Parse a chapter number from a NU RSS title such as:
 *   "Mushoku Tensei v26 c264"   → { numberText: "264", numberSort: 264 }
 *   "Mushoku Tensei v26 c264.5" → { numberText: "264.5", numberSort: 264.5 }
 *   "Series Name Chapter 12"    → { numberText: "12", numberSort: 12 }
 *   "Series Name c12"           → { numberText: "12", numberSort: 12 }
 *
 * Matches "c<N>", "c.<N>", "Chapter <N>", "chapter<N>" (case-insensitive).
 */
function extractChapterNumber(title: string): { numberText: string; numberSort: number } | null {
  const match = title.match(/\bc(?:hapter)?\.?\s*(\d+(?:\.\d+)?)/i);
  if (match?.[1]) {
    const n = Number(match[1]);
    if (Number.isFinite(n)) {
      return { numberText: match[1], numberSort: n };
    }
  }
  return null;
}

export const novelUpdatesChapterSyncDescriptor: JobKindDescriptor<
  { seriesId: number },
  NovelUpdatesChapterSyncResult
> = {
  kind: 'novel_updates_chapter_sync',
  retryPolicy: DEFAULT_RETRY_POLICY,
  timeoutMs: DEFAULT_TIMEOUT_MS * 5,
  handler: async (raw, _jobId) => {
    const log = logger().child({ component: 'novel_updates_chapter_sync' });
    const { seriesId } = Payload.parse(raw);

    const series = await getSeries(seriesId);
    if (!series) {
      log.warn({ seriesId }, 'series not found');
      return { seriesId, chaptersAdded: 0 };
    }
    if (series.novelUpdatesId === null) {
      return { seriesId, chaptersAdded: 0 };
    }

    let entries;
    try {
      entries = await fetchChapterFeed(series.novelUpdatesId);
    } catch (err) {
      log.warn(
        { seriesId, numericId: series.novelUpdatesId, err: (err as Error).message },
        'NU chapter feed fetch failed',
      );
      return { seriesId, chaptersAdded: 0 };
    }

    // upsertChapterByNumberSort returns void; count additions by checking
    // existence before the upsert is not worth the extra query — we track
    // chaptersAdded as the number of entries that had parseable chapter numbers
    // and were fed to the upsert (idempotency is enforced by the upsert itself).
    let chaptersAdded = 0;
    for (const entry of entries) {
      const parsed = extractChapterNumber(entry.title);
      if (parsed === null) {
        log.debug({ seriesId, title: entry.title }, 'could not parse chapter number; skipping');
        continue;
      }
      try {
        await upsertChapterByNumberSort(seriesId, parsed.numberSort, {
          numberText: parsed.numberText,
          title: entry.title,
          releaseDate: entry.pubDate,
        });
        chaptersAdded++;
      } catch (err) {
        log.warn(
          { seriesId, title: entry.title, err: (err as Error).message },
          'upsertChapter failed',
        );
      }
    }

    log.info({ seriesId, chaptersAdded }, 'novel_updates_chapter_sync complete');
    return { seriesId, chaptersAdded };
  },
};
