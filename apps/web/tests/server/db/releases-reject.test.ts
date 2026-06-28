import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { seedDb, type SeedHandle } from '../../integration/helpers/seed';
import { insertSeries } from '@/server/db/series';
import {
  upsertReleaseByGuid,
  markReleaseRejected,
  getRelease,
} from '@/server/db/releases';
import { getDb } from '@/server/db/client';
import { releases } from '@/server/db/schema';
import { candidatesFor, type GrabDecision } from '@/server/auto-grab/decide';
import type { ReleaseRow } from '@/server/db/schema';

let h: SeedHandle;

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

async function seedRelease(seriesId: number, guid: string, score: number): Promise<number> {
  return upsertReleaseByGuid({
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
    publishedAt: new Date(),
    score,
  });
}

describe('markReleaseRejected', () => {
  it('round-trips rejectedAt + rejectionReason', async () => {
    const sid = await seedSeries('A');
    const id = await seedRelease(sid, 'r1', 0.9);

    const before = await getRelease(id);
    expect(before?.rejectedAt).toBeNull();
    expect(before?.rejectionReason).toBeNull();

    await markReleaseRejected(id, 'corrupt-archive');

    const after = await getRelease(id);
    expect(after?.rejectedAt).toBeInstanceOf(Date);
    expect(after?.rejectionReason).toBe('corrupt-archive');
  });

  it('preserves rejection across a subsequent upsert of the same release', async () => {
    const sid = await seedSeries('B');
    const id = await seedRelease(sid, 'r2', 0.5);
    await markReleaseRejected(id, 'wrong-format');

    // Re-discover the same release (same indexer guid) — e.g. a later RSS poll.
    const reupsertedId = await upsertReleaseByGuid({
      indexerId: h.indexerId,
      indexerGuid: 'r2',
      seriesId: sid,
      title: '[G] r2 (re-seen)',
      link: 'https://x/r2',
      targetKind: 'volume',
      targetLow: 1,
      targetHigh: 1,
      groupName: 'G',
      language: 'en',
      sizeBytes: 2000,
      seeders: 99,
      leechers: 1,
      publishedAt: new Date(),
      score: 0.99,
    });
    expect(reupsertedId).toBe(id);

    const after = await getRelease(id);
    // Rejection survives the upsert (NOT in the onConflict set).
    expect(after?.rejectedAt).toBeInstanceOf(Date);
    expect(after?.rejectionReason).toBe('wrong-format');
    // The upsert still updated the mutable fields.
    expect(after?.seeders).toBe(99);
    expect(after?.score).toBe(0.99);
  });
});

describe('rejected releases are excluded from candidatesFor', () => {
  it('drops a rejected release from the auto-grab candidate list', async () => {
    const sid = await seedSeries('C');
    const goodId = await seedRelease(sid, 'good', 0.5);
    const badId = await seedRelease(sid, 'bad', 0.99); // higher score, would normally win
    await markReleaseRejected(badId, 'no-images');

    const rows: ReleaseRow[] = await getDb()
      .select()
      .from(releases)
      .where(eq(releases.seriesId, sid));

    // Mirror run.ts: build the rejected exclude set from rejectedAt != null.
    const rejected = new Set(rows.filter((r) => r.rejectedAt != null).map((r) => r.id));
    expect(rejected.has(badId)).toBe(true);

    const decision: GrabDecision = {
      releaseId: goodId,
      reason: 'best-per-target',
      targets: [1],
    };
    const ids = candidatesFor(decision, rows, rejected);

    expect(ids).toContain(goodId);
    expect(ids).not.toContain(badId);
  });
});
