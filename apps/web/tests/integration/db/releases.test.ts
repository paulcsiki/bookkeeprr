import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { seedDb, type SeedHandle } from '../helpers/seed';
import { seedDefaultIndexer } from '@/server/db/indexers';
import {
  upsertReleaseByGuid,
  listReleasesBySeries,
  findReleaseByIndexerGuid,
} from '@/server/db/releases';

let h: SeedHandle;
let indexerId: number;
beforeEach(async () => {
  h = await seedDb();
  indexerId = await seedDefaultIndexer();
});
afterEach(() => h.cleanup());

describe('releases DAL extensions', () => {
  it('upsertReleaseByGuid inserts a new row', async () => {
    const id = await upsertReleaseByGuid({
      indexerId,
      indexerGuid: 'g1',
      seriesId: h.seriesId,
      title: 'X',
      link: 'magnet:?xt=foo',
      targetKind: 'volume',
      targetLow: 1,
      targetHigh: 1,
      groupName: 'G',
      language: 'en',
      sizeBytes: 1000,
      seeders: 10,
      leechers: 1,
      publishedAt: new Date(),
      score: 80,
    });
    expect(id).toBeGreaterThan(0);
    const row = await findReleaseByIndexerGuid(indexerId, 'g1');
    expect(row?.title).toBe('X');
    expect(row?.score).toBe(80);
  });

  it('upsertReleaseByGuid updates an existing row in place', async () => {
    const id1 = await upsertReleaseByGuid({
      indexerId,
      indexerGuid: 'g1',
      seriesId: h.seriesId,
      title: 'X',
      link: 'magnet:?xt=foo',
      targetKind: 'volume',
      targetLow: 1,
      targetHigh: 1,
      groupName: 'G',
      language: 'en',
      sizeBytes: 1000,
      seeders: 10,
      leechers: 1,
      publishedAt: new Date(),
      score: 80,
    });
    const id2 = await upsertReleaseByGuid({
      indexerId,
      indexerGuid: 'g1',
      seriesId: h.seriesId,
      title: 'X',
      link: 'magnet:?xt=foo',
      targetKind: 'volume',
      targetLow: 1,
      targetHigh: 1,
      groupName: 'G',
      language: 'en',
      sizeBytes: 1000,
      seeders: 99,
      leechers: 2,
      publishedAt: new Date(),
      score: 95,
    });
    expect(id2).toBe(id1);
    const row = await findReleaseByIndexerGuid(indexerId, 'g1');
    expect(row?.seeders).toBe(99);
    expect(row?.score).toBe(95);
  });

  it('listReleasesBySeries orders by score desc then publishedAt desc', async () => {
    const t0 = new Date('2026-01-01T00:00:00Z');
    const t1 = new Date('2026-02-01T00:00:00Z');
    await upsertReleaseByGuid({
      indexerId,
      indexerGuid: 'g1',
      seriesId: h.seriesId,
      title: 'Low',
      link: 'm:1',
      targetKind: 'volume',
      targetLow: 1,
      targetHigh: 1,
      sizeBytes: 10,
      publishedAt: t0,
      score: 10,
    });
    await upsertReleaseByGuid({
      indexerId,
      indexerGuid: 'g2',
      seriesId: h.seriesId,
      title: 'High',
      link: 'm:2',
      targetKind: 'volume',
      targetLow: 2,
      targetHigh: 2,
      sizeBytes: 20,
      publishedAt: t0,
      score: 100,
    });
    await upsertReleaseByGuid({
      indexerId,
      indexerGuid: 'g3',
      seriesId: h.seriesId,
      title: 'Mid-recent',
      link: 'm:3',
      targetKind: 'volume',
      targetLow: 3,
      targetHigh: 3,
      sizeBytes: 30,
      publishedAt: t1,
      score: 50,
    });
    const rows = await listReleasesBySeries(h.seriesId);
    expect(rows.map((r) => r.title)).toEqual(['High', 'Mid-recent', 'Low']);
  });
});
