import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { seedDb, type SeedHandle } from '../helpers/seed';
import { insertSeries } from '@/server/db/series';
import { upsertReleaseByGuid } from '@/server/db/releases';
import { enqueueJob } from '@/server/db/jobs';
import { runOnce } from '@/server/jobs/runner';
import { housekeepingDescriptor, type HousekeepingResult } from '@/server/jobs/kinds/housekeeping';
import { getDb } from '@/server/db/client';
import { jobs, releases } from '@/server/db/schema';
import { eq } from 'drizzle-orm';

let h: SeedHandle;
let tmpConfig: string;
const DAY_MS = 24 * 60 * 60 * 1000;

beforeEach(async () => {
  h = await seedDb({ skipDefaultSeries: true });
  tmpConfig = mkdtempSync(join(tmpdir(), 'bk-hk-prune-cfg-'));
  process.env.BOOKKEEPRR_CONFIG_DIR = tmpConfig;
});
afterEach(() => {
  delete process.env.BOOKKEEPRR_CONFIG_DIR;
  h.cleanup();
  rmSync(tmpConfig, { recursive: true, force: true });
});

describe('housekeeping prunes old releases', () => {
  it('returns releasesPruned > 0 when stale releases exist', async () => {
    const sid = await insertSeries({
      contentType: 'manga',
      titleEnglish: 'A',
      status: 'releasing',
      rootPath: '/m/A',
      qualityProfileId: h.qpId,
    });
    // Seed 50 old releases (older than 90 days, deep rank).
    for (let i = 1; i <= 50; i++) {
      const pubAt = new Date(Date.now() - (100 + i) * DAY_MS);
      await upsertReleaseByGuid({
        indexerId: h.indexerId,
        indexerGuid: `old-${i}`,
        seriesId: sid,
        title: `Old ${i}`,
        link: `https://x/${i}`,
        targetKind: 'volume',
        targetLow: 1,
        targetHigh: 1,
        groupName: 'G',
        language: 'en',
        sizeBytes: 1000,
        seeders: 1,
        leechers: 0,
        publishedAt: pubAt,
        score: 0.5,
      });
    }

    const hkId = await enqueueJob('housekeeping', {});
    await runOnce(housekeepingDescriptor);

    const [row] = await getDb().select().from(jobs).where(eq(jobs.id, hkId));
    expect(row?.resultJson).toBeTruthy();
    const result = JSON.parse(row!.resultJson!) as HousekeepingResult;
    // With keepPerSeries=30, olderThanDays=90: 30 kept, 20 deleted.
    expect(result.releasesPruned).toBe(20);

    const remaining = await getDb().select().from(releases).where(eq(releases.seriesId, sid));
    expect(remaining).toHaveLength(30);
  });
});
