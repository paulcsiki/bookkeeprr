import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { seedDb, type SeedHandle } from '../../integration/helpers/seed';
import {
  createReplayRun,
  getReplayRun,
  getInProgressReplayRun,
  listReplayRuns,
  markReplayRunComplete,
  markReplayRunFailed,
} from '@/server/db/replay-runs';

describe('replayRunsDal', () => {
  let h: SeedHandle;
  beforeEach(async () => {
    h = await seedDb({ skipDefaultSeries: true });
  });
  afterEach(() => h.cleanup());

  it('creates a run in running state with snapshots', async () => {
    const run = await createReplayRun({
      windowDays: 90,
      weightsSnapshot: {
        groupTopWeight: 100,
        groupStepDown: 10,
        batchBonus: 30,
        seederMultiplier: 5,
        trustedBonus: 10,
        remakePenalty: -15,
        minSeeders: 1,
      },
      adultFilterSnapshot: { enabled: true, blockedCategories: ['4_1'] },
    });
    expect(run.id).toBeGreaterThan(0);
    expect(run.status).toBe('running');
    expect(run.windowDays).toBe(90);
    expect(run.completedAt).toBeNull();
  });

  it('getInProgress returns the currently-running row or null', async () => {
    expect(await getInProgressReplayRun()).toBeNull();
    const run = await createReplayRun({
      windowDays: null,
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
    const inProgress = await getInProgressReplayRun();
    expect(inProgress?.id).toBe(run.id);
    await markReplayRunComplete(run.id, {
      releasesTotal: 0,
      releasesFlipped: 0,
      releasesRescored: 0,
    });
    expect(await getInProgressReplayRun()).toBeNull();
  });

  it('markComplete sets status, counters, completedAt', async () => {
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
    await markReplayRunComplete(run.id, {
      releasesTotal: 42,
      releasesFlipped: 3,
      releasesRescored: 7,
    });
    const after = await getReplayRun(run.id);
    expect(after?.status).toBe('completed');
    expect(after?.releasesTotal).toBe(42);
    expect(after?.releasesFlipped).toBe(3);
    expect(after?.releasesRescored).toBe(7);
    expect(after?.completedAt).toBeInstanceOf(Date);
  });

  it('markFailed sets status=failed and errorMessage', async () => {
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
    await markReplayRunFailed(run.id, 'boom');
    const after = await getReplayRun(run.id);
    expect(after?.status).toBe('failed');
    expect(after?.errorMessage).toBe('boom');
    expect(after?.completedAt).toBeInstanceOf(Date);
  });

  it('list returns most-recent-first up to limit', async () => {
    for (let i = 0; i < 5; i++) {
      const r = await createReplayRun({
        windowDays: i * 10 || null,
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
      await markReplayRunComplete(r.id, {
        releasesTotal: 0,
        releasesFlipped: 0,
        releasesRescored: 0,
      });
    }
    const rows = await listReplayRuns(3);
    expect(rows).toHaveLength(3);
    expect(rows[0]!.id).toBeGreaterThan(rows[2]!.id);
  });
});
