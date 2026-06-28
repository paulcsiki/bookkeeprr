import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { seedDb, type SeedHandle } from '../../integration/helpers/seed';
import { insertSeries } from '@/server/db/series';
import { upsertReleaseByGuid, pruneReleases } from '@/server/db/releases';
import { getDb } from '@/server/db/client';
import { releases, downloads } from '@/server/db/schema';
import { eq } from 'drizzle-orm';

let h: SeedHandle;
const DAY_MS = 24 * 60 * 60 * 1000;

beforeEach(async () => {
  h = await seedDb({ skipDefaultSeries: true });
});
afterEach(() => h.cleanup());

async function seedSeries(name: string): Promise<number> {
  return insertSeries({
    contentType: 'manga',
    titleEnglish: name,
    status: 'releasing',
    rootPath: `/m/${name}`,
    qualityProfileId: h.qpId,
  });
}

async function seedRelease(seriesId: number, ageDays: number, guid: string): Promise<number> {
  const now = Date.now();
  const pubAt = new Date(now - ageDays * DAY_MS);
  await upsertReleaseByGuid({
    indexerId: h.indexerId,
    indexerGuid: guid,
    seriesId,
    title: `[G] ${guid}`,
    link: `https://x/${guid}`,
    targetKind: 'volume',
    targetLow: 1,
    targetHigh: 1,
    groupName: 'G',
    language: 'en',
    sizeBytes: 1000,
    seeders: 5,
    leechers: 0,
    publishedAt: pubAt,
    score: 0.9,
  });
  const rows = await getDb()
    .select({ id: releases.id })
    .from(releases)
    .where(eq(releases.indexerGuid, guid));
  return rows[0]!.id;
}

describe('pruneReleases', () => {
  it('preserves releases newer than olderThanDays', async () => {
    const sid = await seedSeries('A');
    for (let i = 1; i <= 5; i++) await seedRelease(sid, 30, `recent-${i}`);
    const { deletedCount } = await pruneReleases({ keepPerSeries: 2, olderThanDays: 90 });
    expect(deletedCount).toBe(0);
  });

  it('preserves top-N most recent per series even if old', async () => {
    const sid = await seedSeries('B');
    for (let i = 1; i <= 5; i++) await seedRelease(sid, 100 + i, `old-${i}`);
    const { deletedCount } = await pruneReleases({ keepPerSeries: 3, olderThanDays: 90 });
    // 5 old; top 3 kept; 2 deleted.
    expect(deletedCount).toBe(2);
    const remaining = await getDb().select().from(releases).where(eq(releases.seriesId, sid));
    expect(remaining).toHaveLength(3);
  });

  it('preserves releases referenced by downloads', async () => {
    const sid = await seedSeries('C');
    const oldId = await seedRelease(sid, 200, 'old-downloaded');
    await seedRelease(sid, 199, 'old-not-downloaded');
    await getDb()
      .insert(downloads)
      .values({
        releaseId: oldId,
        qbtHash: 'a'.repeat(40),
        status: 'imported',
      });
    // keepPerSeries:0 isolates the downloads-protection rule: rank rule
    // protects nothing, so only the downloaded row should survive.
    const { deletedCount } = await pruneReleases({ keepPerSeries: 0, olderThanDays: 90 });
    expect(deletedCount).toBe(1);
    const remaining = await getDb()
      .select({ guid: releases.indexerGuid })
      .from(releases)
      .where(eq(releases.seriesId, sid));
    expect(remaining.map((r) => r.guid).sort()).toEqual(['old-downloaded']);
  });

  it('combined rule: only deletes when ALL conditions hold', async () => {
    const sidA = await seedSeries('A');
    const sidB = await seedSeries('B');
    for (let i = 1; i <= 5; i++) await seedRelease(sidA, 100 + i, `A-old-${i}`);
    for (let i = 1; i <= 3; i++) await seedRelease(sidA, 5, `A-fresh-${i}`);
    for (let i = 1; i <= 2; i++) await seedRelease(sidB, 200 + i, `B-old-${i}`);

    const { deletedCount } = await pruneReleases({ keepPerSeries: 3, olderThanDays: 90 });
    // Series A: 3 fresh outrank old, top 3 by date DESC are the fresh ones (rank 1-3).
    //   All 5 old are rank > 3 AND old AND not downloaded → 5 deleted.
    // Series B: 2 old, both rank ≤ 3 → both kept.
    expect(deletedCount).toBe(5);
  });
});
