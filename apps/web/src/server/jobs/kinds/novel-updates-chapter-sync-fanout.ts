import { z } from 'zod';
import { enqueueJob } from '@/server/db/jobs';
import { getLnSeriesIdsWithNu } from '@/server/db/series';
import { logger } from '@/server/logger';
import type { JobKindDescriptor } from '../types';
import { DEFAULT_RETRY_POLICY, DEFAULT_TIMEOUT_MS } from '../types';

const Payload = z.object({}).passthrough();

export type NovelUpdatesChapterSyncFanoutResult = {
  enqueuedIds: number[];
};

export const novelUpdatesChapterSyncFanoutDescriptor: JobKindDescriptor<
  Record<string, never>,
  NovelUpdatesChapterSyncFanoutResult
> = {
  kind: 'novel_updates_chapter_sync_fanout',
  retryPolicy: DEFAULT_RETRY_POLICY,
  timeoutMs: DEFAULT_TIMEOUT_MS,
  handler: async (raw) => {
    const log = logger().child({ component: 'novel_updates_chapter_sync_fanout' });
    Payload.parse(raw);
    const ids = await getLnSeriesIdsWithNu();
    const enqueuedIds: number[] = [];
    for (const seriesId of ids) {
      const jobId = await enqueueJob('novel_updates_chapter_sync', { seriesId });
      enqueuedIds.push(jobId);
    }
    log.info({ count: enqueuedIds.length }, 'fanout: enqueued chapter sync jobs');
    return { enqueuedIds };
  },
};
