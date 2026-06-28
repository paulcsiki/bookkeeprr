import {
  scoringWeightsSetting,
  adultFilterSetting,
  matcherAutoReplaySetting,
} from '@/server/db/settings/matcher';
import { createReplayRun, getInProgressReplayRun } from '@/server/db/replay-runs';
import { enqueueJob } from '@/server/db/jobs';
import { recordAuditEvent } from '@/server/audit/record';
import { extractProxyIp, extractClientIp } from '@/server/auth/forward-auth/peer';
import type { UserRow } from '@/server/db/schema';
import { logger } from '@/server/logger';

const AUTO_REPLAY_WINDOW_DAYS = 90;

export type MaybeAutoReplayResult = { runId: number } | { error: string } | null;

export async function maybeAutoEnqueueReplay(
  req: Request,
  user: UserRow,
  changedFields: string[],
): Promise<MaybeAutoReplayResult> {
  if (changedFields.length === 0) return null;
  const enabled = await matcherAutoReplaySetting.get();
  if (!enabled) return null;

  const inProgress = await getInProgressReplayRun();
  if (inProgress) {
    logger().info({ inProgressRunId: inProgress.id }, 'auto-replay skipped: run in progress');
    return null;
  }

  try {
    const weights = await scoringWeightsSetting.get();
    const adultFilter = await adultFilterSetting.get();
    const run = await createReplayRun({
      windowDays: AUTO_REPLAY_WINDOW_DAYS,
      weightsSnapshot: weights,
      adultFilterSnapshot: adultFilter,
    });
    await enqueueJob('release_match_replay', { replayRunId: run.id });
    await recordAuditEvent({
      actor: { kind: 'user', userId: user.id, username: user.username },
      action: 'release_match_replay.auto_enqueued',
      target: { kind: 'replay_run', id: String(run.id) },
      metadata: {
        windowDays: AUTO_REPLAY_WINDOW_DAYS,
        triggeredByFields: changedFields,
      },
      context: {
        peerIp: extractProxyIp(req),
        clientIp: extractClientIp(req),
        userAgent: req.headers.get('user-agent'),
      },
    });
    return { runId: run.id };
  } catch (err) {
    logger().error({ err }, 'auto-replay enqueue failed');
    return { error: err instanceof Error ? err.message : 'unknown' };
  }
}
