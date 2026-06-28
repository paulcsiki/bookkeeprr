import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { seedDb, type SeedHandle } from '../helpers/seed';
import { createReplayRun, getReplayRun } from '@/server/db/replay-runs';
import { releaseMatchReplayDescriptor } from '@/server/jobs/kinds/release-match-replay';

describe('release_match_replay job kind', () => {
  let h: SeedHandle;
  beforeEach(async () => {
    h = await seedDb({ skipDefaultSeries: true });
  });
  afterEach(() => h.cleanup());

  it('runs end-to-end with no series in scope', async () => {
    const run = await createReplayRun({
      windowDays: 30,
      weightsSnapshot: {
        groupTopWeight: 100,
        groupStepDown: 10,
        batchBonus: 30,
        seederMultiplier: 5,
        trustedBonus: 10,
        remakePenalty: -15,
        minSeeders: 1,
      },
      adultFilterSnapshot: { enabled: false, blockedCategories: [] },
    });
    const result = await releaseMatchReplayDescriptor.handler({ replayRunId: run.id }, 1);
    expect(result.replayRunId).toBe(run.id);
    const after = await getReplayRun(run.id);
    expect(after?.status).toBe('completed');
    expect(after?.releasesTotal).toBe(0);
  });

  it('propagates error when replay run does not exist', async () => {
    await expect(
      releaseMatchReplayDescriptor.handler({ replayRunId: 999_999 }, 1),
    ).rejects.toThrow();
  });
});
