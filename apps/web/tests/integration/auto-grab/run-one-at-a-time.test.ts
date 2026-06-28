/**
 * TDD tests for the "one active grab per target" guard in auto-grab/run.ts.
 *
 * Rule: before grabbing a release for a decision, skip if that series target
 * already has an active (queued|downloading|importing|completed|imported)
 * download for any release covering that target. A stalled/failed download is
 * NOT active, so the next cycle can proceed to the next candidate.
 *
 * The guard is implemented via a DAL helper
 * `hasActiveDownloadForSeriesTarget(seriesId, target)` and called in run.ts
 * before each grab attempt.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { seedDb, type SeedHandle } from '../helpers/seed';
import { insertSeries, updateSeries, getSeries } from '@/server/db/series';
import { insertRelease } from '@/server/db/releases';
import { insertDownload } from '@/server/db/downloads';
import { qbtConnectionSetting } from '@/server/db/settings/qbt';
import { runAutoGrabForSeries } from '@/server/auto-grab/run';

const QBT_CFG = {
  host: 'x',
  port: 1,
  username: 'u',
  password: 'p',
  useHttps: false as const,
};

// Mock grabRelease so we don't need a real qBittorrent for these tests.
const { grabReleaseMock } = vi.hoisted(() => ({
  grabReleaseMock: vi.fn(async () => ({
    ok: true as const,
    result: { downloadId: 999, qbtHash: 'newhash' },
  })),
}));
vi.mock('@/server/grabber', () => ({
  grabRelease: grabReleaseMock,
}));

// Also mock notifications so they don't fail.
vi.mock('@/server/notifications', () => ({
  notify: vi.fn(async () => {}),
  safeNotifyFailure: vi.fn(async () => {}),
}));

let h: SeedHandle;

beforeEach(async () => {
  h = await seedDb({ skipDefaultSeries: true });
  await qbtConnectionSetting.set(QBT_CFG);
  grabReleaseMock.mockClear();
  grabReleaseMock.mockResolvedValue({
    ok: true,
    result: { downloadId: 999, qbtHash: 'newhash' },
  });
});

afterEach(() => h.cleanup());

async function makeSeries(totalVolumes = 3): Promise<number> {
  const seriesId = await insertSeries({
    anilistId: Math.floor(Math.random() * 1_000_000) + 1000,
    status: 'releasing',
    rootPath: `/media/manga/OnceAtATime-${Math.random()}`,
    qualityProfileId: h.qpId,
    titleEnglish: 'OnceAtATime Series',
  });
  await updateSeries(seriesId, { granularity: 'volume', totalVolumes });
  return seriesId;
}

async function makeRelease(seriesId: number, vol: number, score = 50): Promise<number> {
  const guid = `oaat-${Math.random().toString(36).slice(2)}`;
  return insertRelease({
    seriesId,
    indexerId: h.indexerId,
    indexerGuid: guid,
    title: `Vol ${vol} [Group]`,
    link: `magnet:?xt=urn:btih:${guid}`,
    targetKind: 'volume',
    targetLow: vol,
    targetHigh: vol,
    sizeBytes: 100_000_000,
    seeders: 5,
    publishedAt: new Date(),
    score,
  });
}

describe('auto-grab: one-at-a-time per target guard', () => {
  it('does NOT grab a second release for a target that already has an active download', async () => {
    const seriesId = await makeSeries(1);
    const release1Id = await makeRelease(seriesId, 1, 80);
    await makeRelease(seriesId, 1, 50); // lower score — alternate (exists but not needed by ref)

    // Mark release1 as already downloading.
    await insertDownload({
      releaseId: release1Id,
      qbtHash: 'hash-r1',
      status: 'downloading',
    });

    const series = (await getSeries(seriesId))!;
    const result = await runAutoGrabForSeries(series);

    // The target (vol 1) already has an active download — no new grab should happen.
    expect(grabReleaseMock).not.toHaveBeenCalled();
    expect(result.skipped).toBeGreaterThan(0);
  });

  it('DOES grab when the only existing download for the target is failed (stalled)', async () => {
    const seriesId = await makeSeries(1);
    const release1Id = await makeRelease(seriesId, 1, 80);
    await makeRelease(seriesId, 1, 50);

    // Mark release1 as failed (stalled-5m).
    await insertDownload({
      releaseId: release1Id,
      qbtHash: 'hash-r1-failed',
      status: 'failed',
    });

    const series = (await getSeries(seriesId))!;
    const result = await runAutoGrabForSeries(series);

    // release1 is in activeDownloadReleaseIds check in decideGrabs... but it's failed,
    // so it shouldn't be in ACTIVE set. The guard should allow grabbing release2.
    expect(grabReleaseMock).toHaveBeenCalledOnce();
    expect(result.succeeded).toBe(1);
  });

  it('skips when active download is queued (not yet downloading)', async () => {
    const seriesId = await makeSeries(1);
    const release1Id = await makeRelease(seriesId, 1, 80);
    await makeRelease(seriesId, 1, 50);

    await insertDownload({
      releaseId: release1Id,
      qbtHash: 'hash-r1-queued',
      status: 'queued',
    });

    const series = (await getSeries(seriesId))!;
    const result = await runAutoGrabForSeries(series);

    expect(grabReleaseMock).not.toHaveBeenCalled();
    expect(result.skipped).toBeGreaterThan(0);
  });

  it('skips when active download is completed (but not yet imported)', async () => {
    const seriesId = await makeSeries(1);
    const release1Id = await makeRelease(seriesId, 1, 80);
    await makeRelease(seriesId, 1, 50);

    await insertDownload({
      releaseId: release1Id,
      qbtHash: 'hash-r1-completed',
      status: 'completed',
    });

    const series = (await getSeries(seriesId))!;
    const result = await runAutoGrabForSeries(series);

    expect(grabReleaseMock).not.toHaveBeenCalled();
    expect(result.skipped).toBeGreaterThan(0);
  });

  it('can still grab other targets while one target already has an active download', async () => {
    // 2-volume series; vol 1 has active download, vol 2 does not.
    const seriesId = await makeSeries(2);
    const release1Id = await makeRelease(seriesId, 1, 80);
    const release2Id = await makeRelease(seriesId, 2, 80);

    await insertDownload({
      releaseId: release1Id,
      qbtHash: 'hash-r1',
      status: 'downloading',
    });

    const series = (await getSeries(seriesId))!;
    const result = await runAutoGrabForSeries(series);

    // Only vol 2 should get grabbed.
    expect(grabReleaseMock).toHaveBeenCalledOnce();
    expect(result.succeeded).toBe(1);
    // Verify it grabbed release2 not release1.
    expect(grabReleaseMock).toHaveBeenCalledWith(release2Id);
  });
});
