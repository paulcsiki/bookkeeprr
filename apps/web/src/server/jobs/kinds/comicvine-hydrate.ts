import { z } from 'zod';
import { getSeries, updateSeries } from '@/server/db/series';
import { upsertChapterByNumberSort } from '@/server/db/chapters';
import { comicVineApiKeySetting, isComicVineConfigured } from '@/server/db/settings/comicvine';
import { listIssues, ComicVineError } from '@/server/integrations/comicvine';
import { logger } from '@/server/logger';
import type { JobKindDescriptor } from '../types';
import { DEFAULT_RETRY_POLICY, DEFAULT_TIMEOUT_MS } from '../types';

const Payload = z.object({ seriesId: z.number().int().positive() });

export type ComicVineHydrateResult = {
  seriesId: number;
  issuesUpserted: number;
  totalIssuesReported: number;
};

export const comicvineHydrateDescriptor: JobKindDescriptor<
  { seriesId: number },
  ComicVineHydrateResult
> = {
  kind: 'comicvine_hydrate',
  retryPolicy: DEFAULT_RETRY_POLICY,
  timeoutMs: DEFAULT_TIMEOUT_MS * 5,
  handler: async (raw) => {
    const log = logger().child({ component: 'comicvine_hydrate' });
    const { seriesId } = Payload.parse(raw);
    const series = await getSeries(seriesId);
    if (!series) {
      log.warn({ seriesId }, 'series not found');
      return { seriesId, issuesUpserted: 0, totalIssuesReported: 0 };
    }
    if (series.contentType !== 'comic') {
      log.warn({ seriesId, contentType: series.contentType }, 'not a comic series; no-op');
      return { seriesId, issuesUpserted: 0, totalIssuesReported: 0 };
    }
    if (series.comicvineId === null) {
      throw new Error('series has no comicvine_id');
    }
    const apiKey = await comicVineApiKeySetting.get();
    if (!isComicVineConfigured(apiKey)) {
      throw new Error('comicvine not configured');
    }

    let issues;
    try {
      issues = await listIssues(apiKey, series.comicvineId);
    } catch (err) {
      const message =
        err instanceof ComicVineError ? `comicvine: ${err.message}` : (err as Error).message;
      log.warn({ seriesId, err: message }, 'comicvine list failed');
      throw err;
    }

    for (const issue of issues) {
      await upsertChapterByNumberSort(seriesId, issue.issueNumberSort, {
        numberText: issue.issueNumber,
        title: issue.name,
      });
    }

    await updateSeries(seriesId, { totalChapters: issues.length });

    return { seriesId, issuesUpserted: issues.length, totalIssuesReported: issues.length };
  },
};
