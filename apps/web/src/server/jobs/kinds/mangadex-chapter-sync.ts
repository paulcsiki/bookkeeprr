import { z } from 'zod';
import { findMangaByTitles, getChapters } from '@/server/integrations/mangadex/client';
import { getSeries, updateSeriesMetadata } from '@/server/db/series';
import { insertChapter, listChaptersBySeries, updateChapter } from '@/server/db/chapters';
import { listVolumesBySeries } from '@/server/db/volumes';
import { logger } from '@/server/logger';
import type { JobKindDescriptor } from '../types';
import { DEFAULT_TIMEOUT_MS } from '../types';

const Payload = z.object({ seriesId: z.number().int().positive() });

export const mangadexChapterSyncDescriptor: JobKindDescriptor<
  { seriesId: number },
  { chaptersAdded: number }
> = {
  kind: 'mangadex_chapter_sync',
  retryPolicy: { maxAttempts: 5 },
  timeoutMs: DEFAULT_TIMEOUT_MS,
  handler: async (rawPayload, jobId) => {
    const log = logger().child({ component: 'mangadex_chapter_sync', jobId });
    const { seriesId } = Payload.parse(rawPayload);
    const series = await getSeries(seriesId);
    if (!series) return { chaptersAdded: 0 };

    // Trust an existing mangadexId; only resolve (by validated title match) when
    // missing, and never overwrite — a bad resolve must not mis-link the series.
    let mangadexId = series.mangadexId;
    if (!mangadexId) {
      const md = await findMangaByTitles(
        [series.titleRomaji, series.titleEnglish].filter((t): t is string => Boolean(t)),
      );
      if (!md) {
        log.warn({ seriesId }, 'no MangaDex match found');
        return { chaptersAdded: 0 };
      }
      mangadexId = md.mangadexId;
      await updateSeriesMetadata(series.id, { mangadexId });
    }

    // Fetch chapters (paginated; for M4 we fetch first 100 only)
    const entries = await getChapters(mangadexId, { limit: 100 });

    const existing = await listChaptersBySeries(seriesId);
    const existingBySort = new Map(existing.map((c) => [c.numberSort, c]));
    // Map MangaDex volume numbers to local volume rows so each chapter links to
    // the volume that contains it.
    const volIdByNumber = new Map((await listVolumesBySeries(seriesId)).map((v) => [v.number, v.id]));

    let added = 0;
    let linked = 0;
    for (const e of entries) {
      if (e.numberSort === null) continue; // skip un-numbered specials in M4
      const volumeId = e.volume != null ? (volIdByNumber.get(e.volume) ?? null) : null;
      const row = existingBySort.get(e.numberSort);
      if (row) {
        // Backfill the volume link on a chapter we already have.
        if (volumeId != null && row.volumeId == null) {
          await updateChapter(row.id, { volumeId });
          linked++;
        }
        continue;
      }
      await insertChapter({
        seriesId,
        volumeId,
        numberText: e.numberText ?? String(e.numberSort),
        numberSort: e.numberSort,
        title: e.title,
        releaseDate: e.publishAt,
        mangadexChapterId: e.mangadexChapterId,
      });
      added++;
    }
    log.info({ seriesId, chaptersAdded: added, chaptersLinked: linked }, 'chapter sync complete');
    return { chaptersAdded: added };
  },
};
