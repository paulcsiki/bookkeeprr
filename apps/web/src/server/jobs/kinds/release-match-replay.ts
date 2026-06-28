import { z } from 'zod';
import { replayMatcher } from '@/server/matcher/replay';
import { logger } from '@/server/logger';
import type { JobKindDescriptor } from '../types';
import { DEFAULT_RETRY_POLICY, DEFAULT_TIMEOUT_MS } from '../types';

const Payload = z.object({ replayRunId: z.number().int().positive() });

export type ReleaseMatchReplayResult = {
  replayRunId: number;
};

/**
 * Manual-enqueue job that wraps `replayMatcher`. Replay is expensive; on
 * failure the user re-triggers via the UI rather than auto-retrying, so we
 * cap attempts at 1. `replayMatcher` already records `markReplayRunFailed`
 * inside its own catch and re-throws — the handler lets that propagate so
 * the job runner records the job as failed too.
 */
export const releaseMatchReplayDescriptor: JobKindDescriptor<
  { replayRunId: number },
  ReleaseMatchReplayResult
> = {
  kind: 'release_match_replay',
  retryPolicy: { ...DEFAULT_RETRY_POLICY, maxAttempts: 1 },
  timeoutMs: DEFAULT_TIMEOUT_MS * 30,
  handler: async (raw) => {
    const log = logger().child({ component: 'release_match_replay' });
    const { replayRunId } = Payload.parse(raw);
    log.info({ replayRunId }, 'replay job: starting');
    await replayMatcher(replayRunId);
    log.info({ replayRunId }, 'replay job: complete');
    return { replayRunId };
  },
};
