import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { seedDb, type SeedHandle } from '../helpers/seed';
import { runAutoGrabForSeries } from '@/server/auto-grab/run';
import { autoGrabSetting } from '@/server/db/settings/auto-grab';
import { getSeries, updateSeriesMetadata } from '@/server/db/series';
import {
  upsertReleaseByGuid,
  getRelease,
  markReleaseRejected,
} from '@/server/db/releases';
import * as grabber from '@/server/grabber';
import * as notifications from '@/server/notifications';

let h: SeedHandle;
let tmpConfig: string;

beforeEach(async () => {
  h = await seedDb();
  tmpConfig = mkdtempSync(join(tmpdir(), 'bk-grab-backoff-'));
  process.env.BOOKKEEPRR_CONFIG_DIR = tmpConfig;
  await autoGrabSetting.set({ dryRun: false });
});
afterEach(() => {
  delete process.env.BOOKKEEPRR_CONFIG_DIR;
  h.cleanup();
  rmSync(tmpConfig, { recursive: true, force: true });
  vi.restoreAllMocks();
});

async function seedRelease(seriesId: number): Promise<number> {
  await updateSeriesMetadata(seriesId, { totalVolumes: 1 });
  return upsertReleaseByGuid({
    indexerId: h.indexerId,
    indexerGuid: 'g-backoff',
    seriesId,
    title: 'Test Series v1',
    link: 'magnet:?xt=urn:btih:222',
    targetKind: 'volume',
    targetLow: 1,
    targetHigh: 1,
    groupName: null,
    language: 'en',
    sizeBytes: 100 * 1024 * 1024,
    seeders: 50,
    leechers: 1,
    publishedAt: new Date(),
    score: 75,
  });
}

const FAIL = {
  ok: false as const,
  error: { code: 'download-link-failed' as const, message: 'HTTP 500' },
};

describe('runAutoGrabForSeries — grab-failure backoff', () => {
  it('records the failure and notifies on the FIRST failed cycle', async () => {
    const releaseId = await seedRelease(h.seriesId);
    const series = await getSeries(h.seriesId);

    const grabSpy = vi.spyOn(grabber, 'grabRelease').mockResolvedValue(FAIL);
    const notifySpy = vi.spyOn(notifications, 'safeNotifyFailure').mockResolvedValue();

    const result = await runAutoGrabForSeries(series!);

    expect(grabSpy).toHaveBeenCalledTimes(1);
    expect(result.failed).toHaveLength(1);
    expect(notifySpy).toHaveBeenCalledTimes(1);

    const after = await getRelease(releaseId);
    expect(after?.grabAttempts).toBe(1);
    expect(after?.grabFailedAt).not.toBeNull();
  });

  it('skips the release while inside the backoff window — no grab, no notify', async () => {
    const series = await getSeries(h.seriesId);
    await seedRelease(h.seriesId);

    // First cycle: fail + record backoff.
    vi.spyOn(grabber, 'grabRelease').mockResolvedValue(FAIL);
    vi.spyOn(notifications, 'safeNotifyFailure').mockResolvedValue();
    await runAutoGrabForSeries(series!);

    // Second cycle immediately after — still inside the 5-minute window.
    const grabSpy = vi.spyOn(grabber, 'grabRelease').mockResolvedValue(FAIL);
    const notifySpy = vi.spyOn(notifications, 'safeNotifyFailure').mockResolvedValue();
    const result = await runAutoGrabForSeries(series!);

    expect(grabSpy).not.toHaveBeenCalled();
    expect(notifySpy).not.toHaveBeenCalled();
    expect(result.decisions).toBe(0); // backed-off release produced no decision
  });

  it('does NOT re-notify when retrying after the backoff window elapses', async () => {
    const releaseId = await seedRelease(h.seriesId);
    const series = await getSeries(h.seriesId);

    // First failure.
    vi.spyOn(grabber, 'grabRelease').mockResolvedValue(FAIL);
    vi.spyOn(notifications, 'safeNotifyFailure').mockResolvedValue();
    await runAutoGrabForSeries(series!);
    vi.restoreAllMocks();
    await autoGrabSetting.set({ dryRun: false });

    // Force the backoff window to have elapsed by back-dating grabFailedAt.
    const { getDb } = await import('@/server/db/client');
    const { releases } = await import('@/server/db/schema');
    const { eq } = await import('drizzle-orm');
    getDb()
      .update(releases)
      .set({ grabFailedAt: new Date(Date.now() - 60 * 60_000) }) // 1h ago > 5m window
      .where(eq(releases.id, releaseId))
      .run();

    const grabSpy = vi.spyOn(grabber, 'grabRelease').mockResolvedValue(FAIL);
    const notifySpy = vi.spyOn(notifications, 'safeNotifyFailure').mockResolvedValue();
    const result = await runAutoGrabForSeries(series!);

    // It retries (window elapsed)…
    expect(grabSpy).toHaveBeenCalledTimes(1);
    expect(result.failed).toHaveLength(1);
    // …but stays silent because the primary was already failing (attempts > 0).
    expect(notifySpy).not.toHaveBeenCalled();

    const after = await getRelease(releaseId);
    expect(after?.grabAttempts).toBe(2);
  });

  it('clears backoff state on a successful grab', async () => {
    const releaseId = await seedRelease(h.seriesId);
    const series = await getSeries(h.seriesId);

    // Fail once to set backoff state.
    vi.spyOn(grabber, 'grabRelease').mockResolvedValue(FAIL);
    vi.spyOn(notifications, 'safeNotifyFailure').mockResolvedValue();
    await runAutoGrabForSeries(series!);
    expect((await getRelease(releaseId))?.grabAttempts).toBe(1);
    vi.restoreAllMocks();
    await autoGrabSetting.set({ dryRun: false });

    // Back-date so it's eligible again, then succeed.
    const { getDb } = await import('@/server/db/client');
    const { releases } = await import('@/server/db/schema');
    const { eq } = await import('drizzle-orm');
    getDb()
      .update(releases)
      .set({ grabFailedAt: new Date(Date.now() - 60 * 60_000) })
      .where(eq(releases.id, releaseId))
      .run();

    vi.spyOn(grabber, 'grabRelease').mockResolvedValue({
      ok: true,
      result: { downloadId: 1, qbtHash: 'abc' },
    });
    const result = await runAutoGrabForSeries(series!);
    expect(result.succeeded).toBe(1);

    const after = await getRelease(releaseId);
    expect(after?.grabAttempts).toBe(0);
    expect(after?.grabFailedAt).toBeNull();
  });
});

describe('runAutoGrabForSeries — rejected blacklist', () => {
  async function seedReleaseWithGuid(
    seriesId: number,
    guid: string,
    score: number,
  ): Promise<number> {
    return upsertReleaseByGuid({
      indexerId: h.indexerId,
      indexerGuid: guid,
      seriesId,
      title: 'Test Series v1',
      link: `magnet:?xt=urn:btih:${guid}`,
      targetKind: 'volume',
      targetLow: 1,
      targetHigh: 1,
      groupName: null,
      language: 'en',
      sizeBytes: 100 * 1024 * 1024,
      seeders: 50,
      leechers: 1,
      publishedAt: new Date(),
      score,
    });
  }

  it('never grabs a rejected release and falls through to the next-best candidate', async () => {
    await updateSeriesMetadata(h.seriesId, { totalVolumes: 1 });
    // Higher-scored release is blacklisted; lower-scored one should win instead.
    const badId = await seedReleaseWithGuid(h.seriesId, 'g-bad', 99);
    const goodId = await seedReleaseWithGuid(h.seriesId, 'g-good', 50);
    await markReleaseRejected(badId, 'wrong-format');
    const series = await getSeries(h.seriesId);

    const grabSpy = vi.spyOn(grabber, 'grabRelease').mockResolvedValue({
      ok: true,
      result: { downloadId: 1, qbtHash: 'abc' },
    });
    vi.spyOn(notifications, 'safeNotifyFailure').mockResolvedValue();

    const result = await runAutoGrabForSeries(series!);

    expect(result.succeeded).toBe(1);
    // The rejected (higher-scored) release is never handed to grabRelease.
    expect(grabSpy).toHaveBeenCalledTimes(1);
    expect(grabSpy).toHaveBeenCalledWith(goodId);
    expect(grabSpy).not.toHaveBeenCalledWith(badId);
  });

  it('produces no decision when the ONLY covering release is rejected', async () => {
    await updateSeriesMetadata(h.seriesId, { totalVolumes: 1 });
    const onlyId = await seedReleaseWithGuid(h.seriesId, 'g-only', 80);
    await markReleaseRejected(onlyId, 'corrupt-archive');
    const series = await getSeries(h.seriesId);

    const grabSpy = vi.spyOn(grabber, 'grabRelease').mockResolvedValue({
      ok: true,
      result: { downloadId: 1, qbtHash: 'abc' },
    });

    const result = await runAutoGrabForSeries(series!);

    expect(result.decisions).toBe(0);
    expect(grabSpy).not.toHaveBeenCalled();
  });
});
