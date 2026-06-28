import { z } from 'zod';
import { getSeries, updateSeries } from '@/server/db/series';
import { getSeriesBySlug } from '@/server/integrations/novelupdates/client';
import { logger } from '@/server/logger';
import type { JobKindDescriptor } from '../types';
import { DEFAULT_RETRY_POLICY, DEFAULT_TIMEOUT_MS } from '../types';

const Payload = z.object({ seriesId: z.number().int().positive() });

export type NovelUpdatesHydrateResult = {
  seriesId: number;
  fieldsUpdated: string[];
};

export const novelUpdatesHydrateDescriptor: JobKindDescriptor<
  { seriesId: number },
  NovelUpdatesHydrateResult
> = {
  kind: 'novel_updates_hydrate',
  retryPolicy: DEFAULT_RETRY_POLICY,
  timeoutMs: DEFAULT_TIMEOUT_MS * 5,
  handler: async (raw) => {
    const log = logger().child({ component: 'novel_updates_hydrate' });
    const { seriesId } = Payload.parse(raw);
    const series = await getSeries(seriesId);
    if (!series) {
      log.warn({ seriesId }, 'series not found');
      return { seriesId, fieldsUpdated: [] };
    }
    if (series.novelUpdatesSlug === null || series.novelUpdatesSlug.length === 0) {
      return { seriesId, fieldsUpdated: [] };
    }

    let detail;
    try {
      detail = await getSeriesBySlug(series.novelUpdatesSlug);
    } catch (err) {
      log.warn(
        { seriesId, slug: series.novelUpdatesSlug, err: (err as Error).message },
        'NU hydrate fetch failed',
      );
      return { seriesId, fieldsUpdated: [] };
    }

    const fieldsUpdated: string[] = [];
    const patch: Parameters<typeof updateSeries>[1] = {};

    if (series.novelUpdatesId === null && detail.numericId !== null) {
      patch.novelUpdatesId = detail.numericId;
      fieldsUpdated.push('novelUpdatesId');
    }
    if (series.author === null && detail.author !== null) {
      patch.author = detail.author;
      fieldsUpdated.push('author');
    }
    if (series.totalVolumes === null && detail.totalVolumes !== null) {
      patch.totalVolumes = detail.totalVolumes;
      fieldsUpdated.push('totalVolumes');
    }
    // NOTE: NU aliases are intentionally NOT merged into extraSearchTermsJson.
    // The indexer query template is `{title} {extra}`, which AND-appends every
    // extra term, so a list of foreign-language aliases over-constrains the
    // release search to zero matches. The English/romaji title finds releases.

    if (Object.keys(patch).length > 0) {
      await updateSeries(seriesId, patch);
    }

    log.info({ seriesId, fieldsUpdated }, 'novel_updates_hydrate complete');
    return { seriesId, fieldsUpdated };
  },
};
