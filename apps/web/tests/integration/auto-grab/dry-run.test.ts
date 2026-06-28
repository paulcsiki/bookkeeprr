import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { seedDb, type SeedHandle } from '../helpers/seed';
import { runAutoGrabForSeries } from '@/server/auto-grab/run';
import { autoGrabSetting } from '@/server/db/settings/auto-grab';
import { getSeries, updateSeriesMetadata } from '@/server/db/series';
import { upsertReleaseByGuid } from '@/server/db/releases';
import { queryAuditEvents } from '@/server/db/audit';
import * as grabber from '@/server/grabber';

let h: SeedHandle;
let tmpConfig: string;

beforeEach(async () => {
  h = await seedDb();
  tmpConfig = mkdtempSync(join(tmpdir(), 'bk-m28-auto-'));
  process.env.BOOKKEEPRR_CONFIG_DIR = tmpConfig;
});
afterEach(() => {
  delete process.env.BOOKKEEPRR_CONFIG_DIR;
  h.cleanup();
  rmSync(tmpConfig, { recursive: true, force: true });
  vi.restoreAllMocks();
});

async function seedRelease(seriesId: number): Promise<number> {
  // Ensure the series has totalVolumes=1 so decideGrabs can compute unowned volumes
  await updateSeriesMetadata(seriesId, { totalVolumes: 1 });
  return upsertReleaseByGuid({
    indexerId: h.indexerId,
    indexerGuid: 'g-dry-run',
    seriesId,
    title: 'Test Series v1',
    link: 'magnet:?xt=urn:btih:111',
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

describe('runAutoGrabForSeries — dry-run mode', () => {
  it('does NOT call grabRelease when dryRun=true; emits auto_grab.dry_run_decision audit', async () => {
    const releaseId = await seedRelease(h.seriesId);
    // Fetch series AFTER seedRelease so totalVolumes is set
    const series = await getSeries(h.seriesId);
    expect(series).not.toBeNull();

    await autoGrabSetting.set({ dryRun: true });

    const grabSpy = vi.spyOn(grabber, 'grabRelease');

    const result = await runAutoGrabForSeries(series!);

    expect(grabSpy).not.toHaveBeenCalled();
    expect(result.decisions).toBeGreaterThanOrEqual(1);
    expect(result.succeeded).toBe(0);

    const { rows } = await queryAuditEvents(
      { action: 'auto_grab.dry_run_decision' },
      { limit: 10, offset: 0 },
    );
    expect(rows.length).toBeGreaterThan(0);
    const row = rows.find((r) => {
      const meta = r.metadataJson ? (JSON.parse(r.metadataJson) as { releaseId?: number }) : {};
      return meta.releaseId === releaseId;
    });
    expect(row).toBeDefined();
    expect(row!.targetKind).toBe('series');
    expect(row!.targetId).toBe(String(h.seriesId));
  });
});

describe('runAutoGrabForSeries — live mode emits auto_grab.grabbed', () => {
  it('emits auto_grab.grabbed audit event on successful grabRelease', async () => {
    const releaseId = await seedRelease(h.seriesId);
    // Fetch series AFTER seedRelease so totalVolumes is set
    const series = await getSeries(h.seriesId);
    expect(series).not.toBeNull();

    await autoGrabSetting.set({ dryRun: false });

    vi.spyOn(grabber, 'grabRelease').mockResolvedValue({
      ok: true,
      result: { downloadId: 1, qbtHash: 'abc' },
    });

    const result = await runAutoGrabForSeries(series!);
    expect(result.succeeded).toBeGreaterThanOrEqual(1);

    const { rows } = await queryAuditEvents(
      { action: 'auto_grab.grabbed' },
      { limit: 10, offset: 0 },
    );
    expect(rows.length).toBeGreaterThan(0);
    const row = rows.find((r) => {
      const meta = r.metadataJson ? (JSON.parse(r.metadataJson) as { releaseId?: number }) : {};
      return meta.releaseId === releaseId;
    });
    expect(row).toBeDefined();
    expect(row!.targetKind).toBe('series');
    expect(row!.targetId).toBe(String(h.seriesId));
  });
});
