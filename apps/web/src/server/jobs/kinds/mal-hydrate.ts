import { z } from 'zod';
import { getMangaMal } from '@/server/integrations/mal';
import { getSeries, updateSeriesMetadata, type SeriesMetadataPatch } from '@/server/db/series';
import { insertVolume, listVolumesBySeries } from '@/server/db/volumes';
import { logger } from '@/server/logger';
import type { JobKindDescriptor } from '../types';
import { DEFAULT_TIMEOUT_MS } from '../types';

const HydratePayload = z.object({ seriesId: z.number().int().positive() });

/**
 * Hydrates a MAL-added manga series from MyAnimeList: title fields, cover,
 * synopsis, status, and volume/chapter counts, plus volume stubs. Then chains
 * the same MangaDex enrichment AniList-added series get (per-volume covers via
 * mangadex_volume_hydrate, chapters via mangadex_chapter_sync) — those jobs
 * resolve MangaDex by the now-populated title via findMangaByTitles.
 *
 * Idempotent: series fields are written only when changed, and volume stubs are
 * created only when missing, so re-running is a no-op once hydrated.
 */
export const malHydrateDescriptor: JobKindDescriptor<
  { seriesId: number },
  { volumesAdded: number }
> = {
  kind: 'mal_hydrate',
  retryPolicy: { maxAttempts: 5 },
  timeoutMs: DEFAULT_TIMEOUT_MS,
  handler: async (rawPayload, jobId) => {
    const log = logger().child({ component: 'mal_hydrate', jobId });
    const payload = HydratePayload.parse(rawPayload);
    const series = await getSeries(payload.seriesId);
    if (!series) {
      log.warn({ seriesId: payload.seriesId }, 'series not found; skipping');
      return { volumesAdded: 0 };
    }
    if (series.malId == null) {
      log.warn({ seriesId: series.id }, 'series has no malId; skipping hydrate');
      return { volumesAdded: 0 };
    }

    const detail = await getMangaMal(series.malId);
    if (!detail) {
      log.warn({ seriesId: series.id, malId: series.malId }, 'MAL returned no detail; skipping');
      return { volumesAdded: 0 };
    }

    // Write only fields that actually changed, so a re-run is a no-op.
    const next: SeriesMetadataPatch = {
      titleEnglish: detail.titles.en ?? detail.title,
      titleRomaji: detail.titles.main,
      titleNative: detail.titles.ja,
      coverUrl: detail.coverUrl,
      description: detail.synopsis,
      status: detail.status,
      totalVolumes: detail.totalVolumes,
      totalChapters: detail.totalChapters,
    };
    const patch: SeriesMetadataPatch = {};
    if (series.titleEnglish !== next.titleEnglish) patch.titleEnglish = next.titleEnglish;
    if (series.titleRomaji !== next.titleRomaji) patch.titleRomaji = next.titleRomaji;
    if (series.titleNative !== next.titleNative) patch.titleNative = next.titleNative;
    if (series.coverUrl !== next.coverUrl) patch.coverUrl = next.coverUrl;
    if (series.description !== next.description) patch.description = next.description;
    if (series.status !== next.status) patch.status = next.status;
    if (series.totalVolumes !== next.totalVolumes) patch.totalVolumes = next.totalVolumes;
    if (series.totalChapters !== next.totalChapters) patch.totalChapters = next.totalChapters;
    if (Object.keys(patch).length > 0) {
      await updateSeriesMetadata(series.id, patch);
    }

    const existing = await listVolumesBySeries(series.id);
    const existingNumbers = new Set(existing.map((v) => v.number));
    let added = 0;
    if (detail.totalVolumes && detail.totalVolumes > 0) {
      for (let n = 1; n <= detail.totalVolumes; n++) {
        if (!existingNumbers.has(n)) {
          await insertVolume({ seriesId: series.id, number: n });
          added++;
        }
      }
    }

    log.info({ seriesId: series.id, volumesAdded: added }, 'mal hydrate complete');

    // Chain: per-volume covers + chapters from MangaDex, resolved by the
    // now-populated title (same enrichment AniList-added series receive).
    const { enqueueJob } = await import('@/server/db/jobs');
    await enqueueJob('mangadex_volume_hydrate', { seriesId: series.id });
    await enqueueJob('mangadex_chapter_sync', { seriesId: series.id });

    return { volumesAdded: added };
  },
};
