import { z } from 'zod';
import { getSeries } from '@/server/db/series';
import { listAutomatedIndexers } from '@/server/db/indexers';
import { searchReleasesForSeries } from '@/server/releases/search-series';
import { runAutoGrabForSeries } from '@/server/auto-grab/run';
import { scoringWeightsSetting, adultFilterSetting } from '@/server/db/settings/matcher';
import { logger } from '@/server/logger';
import type { JobKindDescriptor } from '../types';
import { DEFAULT_RETRY_POLICY, DEFAULT_TIMEOUT_MS } from '../types';

const Payload = z.object({ seriesId: z.number().int().positive() });

export type SeriesReleaseSearchResult = { upserted: number; errors: number };

/**
 * Search every enabled indexer for ONE series and upsert matching releases.
 * Enqueued on add (and on demand) so the Releases tab is populated promptly,
 * instead of waiting for the global RSS poll to happen to surface the series.
 * Event-driven; the scheduler entry only drains pending jobs.
 */
export const seriesReleaseSearchDescriptor: JobKindDescriptor<
  { seriesId: number },
  SeriesReleaseSearchResult
> = {
  kind: 'series_release_search',
  retryPolicy: DEFAULT_RETRY_POLICY,
  timeoutMs: DEFAULT_TIMEOUT_MS * 2,
  handler: async (rawPayload) => {
    const log = logger().child({ component: 'series_release_search' });
    const { seriesId } = Payload.parse(rawPayload);
    const series = await getSeries(seriesId);
    if (!series) {
      log.warn({ seriesId }, 'series not found; skipping');
      return { upserted: 0, errors: 0 };
    }
    if (series.monitoring === 'none') return { upserted: 0, errors: 0 };

    const indexerRows = await listAutomatedIndexers();
    if (indexerRows.length === 0) return { upserted: 0, errors: 0 };

    const [weights, adultFilter] = await Promise.all([
      scoringWeightsSetting.get(),
      adultFilterSetting.get(),
    ]);
    const { upserted, errors, skippedNoProfile } = await searchReleasesForSeries(
      series,
      indexerRows,
      { weights, adultFilter },
    );
    // A missing quality profile is a config problem, not a search failure — don't
    // surface it as an error count (mirrors missing_search's skip handling).
    if (skippedNoProfile) {
      log.warn({ seriesId }, 'series has no quality profile; skipping');
      return { upserted: 0, errors: 0 };
    }
    if (upserted > 0) {
      const ag = await runAutoGrabForSeries(series);
      log.info({ seriesId, autoGrab: ag }, 'auto-grab cycle complete');
    }
    log.info({ seriesId, upserted, errors: errors.length }, 'series release search complete');
    return { upserted, errors: errors.length };
  },
};
