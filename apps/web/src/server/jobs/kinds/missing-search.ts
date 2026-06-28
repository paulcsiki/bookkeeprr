import { z } from 'zod';
import { eq, and } from 'drizzle-orm';
import { getDb } from '@/server/db/client';
import { libraryFiles, volumes, chapters } from '@/server/db/schema';
import { listAutomatedIndexers } from '@/server/db/indexers';
import { listMonitoredSeries } from '@/server/db/series';
import { logger } from '@/server/logger';
import type { JobKindDescriptor } from '../types';
import { DEFAULT_RETRY_POLICY, DEFAULT_TIMEOUT_MS } from '../types';
import type { SeriesRow } from '@/server/db/schema';
import { runAutoGrabForSeries } from '@/server/auto-grab/run';
import { scoringWeightsSetting, adultFilterSetting } from '@/server/db/settings/matcher';
import { searchReleasesForSeries } from '@/server/releases/search-series';

const Payload = z.object({}).passthrough();

type Result = {
  seriesPolled: number;
  releasesUpserted: number;
  errors: { seriesId: number; message: string }[];
};

async function hasUnownedTarget(series: SeriesRow): Promise<boolean> {
  if (series.granularity === 'volume') {
    if (!series.totalVolumes || series.totalVolumes <= 0) return false;
    const owned = await getDb()
      .select({ number: volumes.number })
      .from(libraryFiles)
      .innerJoin(volumes, eq(libraryFiles.volumeId, volumes.id))
      .where(eq(libraryFiles.seriesId, series.id));
    const ownedSet = new Set(owned.map((r) => r.number));
    for (let n = 1; n <= series.totalVolumes; n++) {
      if (!ownedSet.has(n)) return true;
    }
    return false;
  } else {
    const allChapters = await getDb()
      .select({ id: chapters.id })
      .from(chapters)
      .where(eq(chapters.seriesId, series.id));
    if (allChapters.length === 0) return false;
    const owned = await getDb()
      .select({ chapterId: libraryFiles.chapterId })
      .from(libraryFiles)
      .where(and(eq(libraryFiles.seriesId, series.id)));
    const ownedSet = new Set(owned.map((r) => r.chapterId).filter((v): v is number => v !== null));
    return allChapters.some((c) => !ownedSet.has(c.id));
  }
}

export const missingSearchDescriptor: JobKindDescriptor<Record<string, unknown>, Result> = {
  kind: 'missing_search',
  retryPolicy: DEFAULT_RETRY_POLICY,
  timeoutMs: DEFAULT_TIMEOUT_MS * 2,
  handler: async (rawPayload) => {
    const log = logger().child({ component: 'missing_search' });
    Payload.parse(rawPayload);
    const errors: Result['errors'] = [];
    let seriesPolled = 0;
    let releasesUpserted = 0;

    const indexerRows = await listAutomatedIndexers();
    if (indexerRows.length === 0) return { seriesPolled, releasesUpserted, errors };

    const [weights, adultFilter] = await Promise.all([
      scoringWeightsSetting.get(),
      adultFilterSetting.get(),
    ]);

    const monitored = await listMonitoredSeries(['all', 'missing']);

    for (const series of monitored) {
      try {
        if (!(await hasUnownedTarget(series))) continue;
        const { upserted, errors: perSeriesErrors, skippedNoProfile } =
          await searchReleasesForSeries(series, indexerRows, { weights, adultFilter });
        for (const e of perSeriesErrors) errors.push({ seriesId: series.id, message: e.message });
        // A series with no quality profile is skipped entirely — don't count it
        // as polled (mirrors the pre-refactor behavior).
        if (skippedNoProfile) continue;
        releasesUpserted += upserted;
        if (upserted > 0) {
          const ag = await runAutoGrabForSeries(series);
          log.info({ seriesId: series.id, autoGrab: ag }, 'auto-grab cycle complete');
        }
        seriesPolled++;
      } catch (err) {
        const message = (err as Error).message;
        log.warn({ seriesId: series.id, err: message }, 'per-series error; continuing');
        errors.push({ seriesId: series.id, message });
      }
    }

    return { seriesPolled, releasesUpserted, errors };
  },
};
