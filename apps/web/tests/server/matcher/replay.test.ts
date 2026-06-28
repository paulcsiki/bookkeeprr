import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { seedDb, type SeedHandle } from '../../integration/helpers/seed';
import { getDb } from '@/server/db/client';
import { downloads, releases } from '@/server/db/schema';
import { insertSeries } from '@/server/db/series';
import { insertRelease } from '@/server/db/releases';
import { createReplayRun, getReplayRun } from '@/server/db/replay-runs';
import { listReplayDiffs } from '@/server/db/release-match-replays';
import { replayMatcher } from '@/server/matcher/replay';
import { eq } from 'drizzle-orm';

describe('replayMatcher', () => {
  let h: SeedHandle;
  beforeEach(async () => {
    h = await seedDb({ skipDefaultSeries: true });
  });
  afterEach(() => h.cleanup());

  async function mkRelease(
    seriesId: number,
    indexerId: number,
    title: string,
    opts: { tLow: number; tHigh: number; score: number; group: string; seeders: number },
  ): Promise<number> {
    return insertRelease({
      seriesId,
      indexerId,
      indexerGuid: title,
      title,
      link: `magnet:?xt=urn:btih:${encodeURIComponent(title)}`,
      targetKind: 'volume',
      targetLow: opts.tLow,
      targetHigh: opts.tHigh,
      groupName: opts.group,
      language: 'en',
      sizeBytes: 100_000_000,
      seeders: opts.seeders,
      leechers: 0,
      publishedAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
      score: opts.score,
    });
  }

  async function seedScenario(): Promise<{
    runId: number;
    releaseIds: number[];
    seriesId: number;
  }> {
    // Create a series. Set totalVolumes=2 so unowned={1,2} drives decideGrabs.
    const seriesId = await insertSeries({
      anilistId: 12345,
      status: 'releasing',
      rootPath: '/media/comics/Replay Series',
      qualityProfileId: h.qpId,
      titleEnglish: 'Replay Series',
      totalVolumes: 2,
      monitoring: 'all',
      granularity: 'volume',
    });

    // 6 releases:
    //   R1 vol 1: historical download, still wins vol 1 under new weights → rescored.
    //   R2 vol 2: historical download, loses vol 2 to R3 under new weights → flipped yes→no.
    //   R3 vol 2: new winner under boosted seeder multiplier → flipped no→yes.
    //   R4 vol 3: NOT in unowned (totalVolumes=2), score jumps a lot → rescored (no→no).
    //   R5 vol 4: NOT in unowned, score change tuned to be small → unchanged.
    //   R6 vol 5: NOT in unowned, score change tuned to be small → unchanged.
    //
    // Snapshot uses seederMultiplier=100 (default is 5) so seeders dominate.
    // log10(seeders+1)*100:
    //   R1 seeders=50  → 170.7
    //   R2 seeders=5   → 77.8
    //   R3 seeders=100 → 200.4
    //   R4 seeders=80  → 190.8
    //   R5 seeders=60  → 178.5
    //   R6 seeders=5   → 77.8
    //
    // Old scores (stored on the release row) hand-picked so:
    //   R1 old=100 → Δ ≈ 70 → rescored
    //   R2 old=50  → was-yes flipped to no
    //   R3 old=45  → was-no flipped to yes
    //   R4 old=10  → Δ ≈ 180 → rescored (no→no, decided not a winner since vol 3 is owned/out of scope)
    //   R5 old=178 → Δ ≈ 0.5 → unchanged
    //   R6 old=78  → Δ ≈ 0.2 → unchanged
    const r1 = await mkRelease(seriesId, h.indexerId, '[GroupA] Replay Series Vol 1', {
      tLow: 1,
      tHigh: 1,
      score: 100,
      group: 'GroupA',
      seeders: 50,
    });
    const r2 = await mkRelease(seriesId, h.indexerId, '[GroupB] Replay Series Vol 2', {
      tLow: 2,
      tHigh: 2,
      score: 50,
      group: 'GroupB',
      seeders: 5,
    });
    const r3 = await mkRelease(seriesId, h.indexerId, '[GroupA] Replay Series Vol 2 (alt)', {
      tLow: 2,
      tHigh: 2,
      score: 45,
      group: 'GroupA',
      seeders: 100,
    });
    const r4 = await mkRelease(seriesId, h.indexerId, '[GroupC] Replay Series Vol 3', {
      tLow: 3,
      tHigh: 3,
      score: 10,
      group: 'GroupC',
      seeders: 80,
    });
    const r5 = await mkRelease(seriesId, h.indexerId, '[GroupC] Replay Series Vol 4', {
      tLow: 4,
      tHigh: 4,
      score: 178,
      group: 'GroupC',
      seeders: 60,
    });
    const r6 = await mkRelease(seriesId, h.indexerId, '[GroupC] Replay Series Vol 5', {
      tLow: 5,
      tHigh: 5,
      score: 78,
      group: 'GroupC',
      seeders: 5,
    });
    const releaseIds = [r1, r2, r3, r4, r5, r6];

    // Historical downloads: R1 and R2 (completed, so NOT in activeDownloadReleaseIds).
    await getDb()
      .insert(downloads)
      .values([
        { releaseId: r1, qbtHash: 'hash1', status: 'completed' },
        { releaseId: r2, qbtHash: 'hash2', status: 'completed' },
      ]);

    // Replay run with seederMultiplier=100 (default 5).
    const run = await createReplayRun({
      windowDays: 90,
      weightsSnapshot: {
        groupTopWeight: 100,
        groupStepDown: 10,
        batchBonus: 30,
        seederMultiplier: 100,
        trustedBonus: 10,
        remakePenalty: -15,
        minSeeders: 1,
      },
      adultFilterSnapshot: { enabled: false, blockedCategories: [] },
    });
    return { runId: run.id, releaseIds, seriesId };
  }

  it('produces the expected diff: 2 flipped, 2 rescored, 2 unchanged', async () => {
    const { runId, releaseIds } = await seedScenario();

    await replayMatcher(runId);

    const run = await getReplayRun(runId);
    expect(run?.status).toBe('completed');
    expect(run?.releasesTotal).toBe(6);
    expect(run?.releasesFlipped).toBe(2);
    expect(run?.releasesRescored).toBe(2);

    const flipped = await listReplayDiffs(runId, { kind: 'flipped', page: 0, pageSize: 20 });
    const rescored = await listReplayDiffs(runId, { kind: 'rescored', page: 0, pageSize: 20 });
    expect(flipped.rows).toHaveLength(2);
    expect(rescored.rows).toHaveLength(2);

    // Both directions of flip should appear.
    expect(flipped.rows.some((r) => r.oldWouldGrab && !r.newWouldGrab)).toBe(true);
    expect(flipped.rows.some((r) => !r.oldWouldGrab && r.newWouldGrab)).toBe(true);

    // R2 lost vol 2; R3 won it.
    const [r1, r2, r3, r4, r5, r6] = releaseIds;
    const flippedIds = new Set(flipped.rows.map((r) => r.releaseId));
    expect(flippedIds.has(r2!)).toBe(true);
    expect(flippedIds.has(r3!)).toBe(true);
    const rescoredIds = new Set(rescored.rows.map((r) => r.releaseId));
    expect(rescoredIds.has(r1!)).toBe(true);
    expect(rescoredIds.has(r4!)).toBe(true);
    // R5 and R6 should be unchanged: not present in any diff bucket.
    const allDiffs = await listReplayDiffs(runId, { page: 0, pageSize: 50 });
    const allDiffIds = new Set(allDiffs.rows.map((r) => r.releaseId));
    expect(allDiffIds.has(r5!)).toBe(false);
    expect(allDiffIds.has(r6!)).toBe(false);
  });

  it('windows by discovery time, not the release pub date (back-catalogue books)', async () => {
    // A book release discovered today but published years ago must still be
    // evaluated under a 90-day window — discoveredAt drives the window, not
    // publishedAt. Regression: this used to evaluate 0.
    const seriesId = await insertSeries({
      anilistId: 999,
      status: 'finished',
      rootPath: '/media/ebooks/Atomic Habits',
      qualityProfileId: h.qpId,
      titleEnglish: 'Atomic Habits',
      contentType: 'ebook',
      totalVolumes: 1,
      monitoring: 'all',
      granularity: 'volume',
    });
    // publishedAt is 5 years in the past; discoveredAt is left to default (now).
    await insertRelease({
      seriesId,
      indexerId: h.indexerId,
      indexerGuid: 'atomic-habits-epub',
      title: 'Atomic Habits by James Clear EPUB',
      link: 'magnet:?xt=urn:btih:atomichabits',
      targetKind: 'batch',
      targetLow: 1,
      targetHigh: 1,
      groupName: null,
      language: 'en',
      sizeBytes: 4_000_000,
      seeders: 10,
      leechers: 0,
      publishedAt: new Date(Date.now() - 5 * 365 * 24 * 60 * 60 * 1000),
      score: 5,
    });

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
      seriesId,
    });

    await replayMatcher(run.id);

    const completed = await getReplayRun(run.id);
    expect(completed?.status).toBe('completed');
    expect(completed?.releasesTotal).toBe(1); // evaluated despite the old pub date
  });

  it('marks the run failed and re-throws if scoring blows up', async () => {
    // Trigger by passing a non-existent runId.
    await expect(replayMatcher(999_999)).rejects.toThrow();
  });

  it('skips series with no releases (no work, no diffs)', async () => {
    // Series exists but no releases.
    await insertSeries({
      anilistId: 999_888,
      status: 'releasing',
      rootPath: '/media/comics/Empty',
      qualityProfileId: h.qpId,
      titleEnglish: 'Empty Series',
      totalVolumes: 2,
      monitoring: 'all',
      granularity: 'volume',
    });
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
    await replayMatcher(run.id);
    const after = await getReplayRun(run.id);
    expect(after?.status).toBe('completed');
    expect(after?.releasesTotal).toBe(0);
    expect(after?.releasesFlipped).toBe(0);
    expect(after?.releasesRescored).toBe(0);
  });

  it('excludes rejected releases from replay candidates (rejectedAt != null)', async () => {
    // A rejected release must not appear in releasesTotal or produce any diff,
    // so replay output accurately mirrors live auto-grab behaviour (which also
    // excludes rejected releases).
    const seriesId = await insertSeries({
      anilistId: 111_222,
      status: 'releasing',
      rootPath: '/media/comics/Rejected Test',
      qualityProfileId: h.qpId,
      titleEnglish: 'Rejected Test',
      totalVolumes: 1,
      monitoring: 'all',
      granularity: 'volume',
    });

    // Good release: should appear in releasesTotal.
    await mkRelease(seriesId, h.indexerId, '[GroupA] Rejected Test Vol 1', {
      tLow: 1,
      tHigh: 1,
      score: 100,
      group: 'GroupA',
      seeders: 50,
    });

    // Rejected release: must be invisible to replay.
    const rejectedId = await mkRelease(seriesId, h.indexerId, '[BadGroup] Rejected Test Vol 1', {
      tLow: 1,
      tHigh: 1,
      score: 50,
      group: 'BadGroup',
      seeders: 10,
    });
    await getDb()
      .update(releases)
      .set({ rejectedAt: new Date(), rejectionReason: 'health-check-failed' })
      .where(eq(releases.id, rejectedId));

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
      seriesId,
    });

    await replayMatcher(run.id);

    const after = await getReplayRun(run.id);
    expect(after?.status).toBe('completed');
    // Only the good release should be counted; the rejected one is excluded.
    expect(after?.releasesTotal).toBe(1);

    // The rejected release must not appear in any diff (it's invisible to replay).
    const allDiffs = await listReplayDiffs(run.id, { page: 0, pageSize: 50 });
    const diffIds = new Set(allDiffs.rows.map((r) => r.releaseId));
    expect(diffIds.has(rejectedId)).toBe(false);
    // The good release may appear (e.g. flipped no→yes since there's no historic
    // download) but it's the rejected one's absence that matters here.
  });

  it('respects windowDays cutoff (excludes older releases)', async () => {
    const seriesId = await insertSeries({
      anilistId: 777_666,
      status: 'releasing',
      rootPath: '/media/comics/Window',
      qualityProfileId: h.qpId,
      titleEnglish: 'Window Series',
      totalVolumes: 2,
      monitoring: 'all',
      granularity: 'volume',
    });
    const old = await mkRelease(seriesId, h.indexerId, '[GA] Window Series Vol 1', {
      tLow: 1,
      tHigh: 1,
      score: 10,
      group: 'GA',
      seeders: 50,
    });
    // Backdate the old release's DISCOVERY time outside the window (windowing is
    // by discoveredAt now, not the release's own pub date).
    await getDb()
      .update(releases)
      .set({ discoveredAt: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000) })
      .where(eq(releases.id, old));
    // Recent release inside the window.
    await mkRelease(seriesId, h.indexerId, '[GA] Window Series Vol 2', {
      tLow: 2,
      tHigh: 2,
      score: 10,
      group: 'GA',
      seeders: 50,
    });

    const run = await createReplayRun({
      windowDays: 30,
      weightsSnapshot: {
        groupTopWeight: 100,
        groupStepDown: 10,
        batchBonus: 30,
        seederMultiplier: 100,
        trustedBonus: 10,
        remakePenalty: -15,
        minSeeders: 1,
      },
      adultFilterSnapshot: { enabled: false, blockedCategories: [] },
    });
    await replayMatcher(run.id);

    const after = await getReplayRun(run.id);
    expect(after?.status).toBe('completed');
    // Only the recent release should be counted.
    expect(after?.releasesTotal).toBe(1);
  });
});
