import { z } from 'zod';
import { listAutomatedIndexers, parseIndexerConfig, type IndexerKind } from '@/server/db/indexers';
import { enqueueJob } from '@/server/db/jobs';
import { runUntilIdle } from '@/server/jobs/runner';
import { logger } from '@/server/logger';
import type { JobKindDescriptor } from '../types';
import { DEFAULT_RETRY_POLICY, DEFAULT_TIMEOUT_MS } from '../types';
import { indexerPollDescriptor } from './indexer-poll';

const Payload = z.object({}).passthrough();

export type FanoutResult = {
  enabledCount: number;
  dueCount: number;
  enqueuedIds: number[];
  errors: { indexerId: number; message: string }[];
};

export const indexerPollFanoutDescriptor: JobKindDescriptor<Record<string, never>, FanoutResult> = {
  kind: 'indexer_poll_fanout',
  retryPolicy: DEFAULT_RETRY_POLICY,
  timeoutMs: DEFAULT_TIMEOUT_MS,
  handler: async (raw) => {
    Payload.parse(raw);
    const log = logger().child({ component: 'indexer_poll_fanout' });

    const enabled = await listAutomatedIndexers();
    const enqueuedIds: number[] = [];
    const errors: FanoutResult['errors'] = [];
    let dueCount = 0;
    const now = Date.now();

    for (const indexer of enabled) {
      try {
        const cfg = parseIndexerConfig(indexer.configJson, indexer.kind as IndexerKind);
        const intervalMs = cfg.pollIntervalSeconds * 1000;
        const lastMs = indexer.lastRssAt?.getTime() ?? null;
        const due = lastMs === null || now - lastMs >= intervalMs;
        if (!due) continue;
        dueCount++;
        await enqueueJob('indexer_poll', { indexerId: indexer.id });
        enqueuedIds.push(indexer.id);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        log.warn({ indexerId: indexer.id, err: message }, 'fanout error for indexer; continuing');
        errors.push({ indexerId: indexer.id, message });
      }
    }

    await runUntilIdle(indexerPollDescriptor);

    log.info(
      { enabledCount: enabled.length, dueCount, enqueued: enqueuedIds.length },
      'fanout complete',
    );
    return { enabledCount: enabled.length, dueCount, enqueuedIds, errors };
  },
};
