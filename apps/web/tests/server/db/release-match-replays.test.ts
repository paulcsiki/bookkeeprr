import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { seedDb, seedSeriesAndRelease, type SeedHandle } from '../../integration/helpers/seed';
import { createReplayRun } from '@/server/db/replay-runs';
import {
  insertReplayDiffs,
  listReplayDiffs,
  getReplayDiff,
  markReplayDiffAdopted,
  type ReplayDiffInsert,
} from '@/server/db/release-match-replays';

describe('releaseMatchReplaysDal', () => {
  let h: SeedHandle;
  beforeEach(async () => {
    h = await seedDb({ skipDefaultSeries: true });
  });
  afterEach(() => h.cleanup());

  async function setup(): Promise<{ runId: number; releaseId: number }> {
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
      adultFilterSnapshot: { enabled: false, blockedCategories: [] },
    });
    const { releaseId } = await seedSeriesAndRelease({
      qpId: h.qpId,
      indexerId: h.indexerId,
      score: 50,
    });
    return { runId: run.id, releaseId };
  }

  it('inserts a batch of diff rows', async () => {
    const { runId, releaseId } = await setup();
    const rows: ReplayDiffInsert[] = [
      {
        replayRunId: runId,
        releaseId,
        oldScore: 50,
        newScore: 80,
        oldWouldGrab: false,
        newWouldGrab: true,
        changedKind: 'flipped',
      },
    ];
    const inserted = await insertReplayDiffs(rows);
    expect(inserted).toBe(1);
    const listed = await listReplayDiffs(runId, { kind: 'flipped', page: 0, pageSize: 10 });
    expect(listed.rows).toHaveLength(1);
    expect(listed.total).toBe(1);
    expect(listed.rows[0]!.releaseId).toBe(releaseId);
  });

  it('filters list by changedKind', async () => {
    const { runId, releaseId } = await setup();
    const { releaseId: rId2 } = await seedSeriesAndRelease({
      qpId: h.qpId,
      indexerId: h.indexerId,
      score: 20,
    });
    await insertReplayDiffs([
      {
        replayRunId: runId,
        releaseId,
        oldScore: 50,
        newScore: 80,
        oldWouldGrab: false,
        newWouldGrab: true,
        changedKind: 'flipped',
      },
      {
        replayRunId: runId,
        releaseId: rId2,
        oldScore: 20,
        newScore: 35,
        oldWouldGrab: false,
        newWouldGrab: false,
        changedKind: 'rescored',
      },
    ]);
    const flipped = await listReplayDiffs(runId, { kind: 'flipped', page: 0, pageSize: 10 });
    const rescored = await listReplayDiffs(runId, { kind: 'rescored', page: 0, pageSize: 10 });
    expect(flipped.rows).toHaveLength(1);
    expect(flipped.total).toBe(1);
    expect(rescored.rows).toHaveLength(1);
    expect(rescored.total).toBe(1);
  });

  it('markAdopted is idempotent', async () => {
    const { runId, releaseId } = await setup();
    await insertReplayDiffs([
      {
        replayRunId: runId,
        releaseId,
        oldScore: 0,
        newScore: 80,
        oldWouldGrab: false,
        newWouldGrab: true,
        changedKind: 'flipped',
      },
    ]);
    const listed = await listReplayDiffs(runId, { kind: 'flipped', page: 0, pageSize: 10 });
    const id = listed.rows[0]!.id;
    await markReplayDiffAdopted(id);
    await markReplayDiffAdopted(id);
    const row = await getReplayDiff(id);
    expect(row?.adoptedAt).toBeInstanceOf(Date);
  });
});
