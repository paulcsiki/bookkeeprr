import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { seedDb, type SeedHandle } from '../../integration/helpers/seed';
import { getDb } from '@/server/db/client';
import { releases } from '@/server/db/schema';
import { insertRelease } from '@/server/db/releases';
import { eq } from 'drizzle-orm';

describe('releases.trusted / .remake persistence', () => {
  let h: SeedHandle;

  beforeEach(async () => {
    h = await seedDb({ skipDefaultSeries: false });
  });

  afterEach(() => {
    h.cleanup();
  });

  it('persists trusted=true and remake=false on insert', async () => {
    const id = await insertRelease({
      seriesId: h.seriesId,
      indexerId: h.indexerId,
      indexerGuid: 'g-trusted',
      title: 'Series Vol 1 [Group]',
      link: 'magnet:?xt=urn:btih:abc',
      targetKind: 'volume',
      targetLow: 1,
      targetHigh: 1,
      groupName: 'Group',
      language: 'en',
      sizeBytes: 100_000_000,
      seeders: 10,
      leechers: 0,
      publishedAt: new Date(),
      score: 50,
      trusted: true,
      remake: false,
    });
    const [row] = await getDb().select().from(releases).where(eq(releases.id, id));
    expect(row?.trusted).toBe(true);
    expect(row?.remake).toBe(false);
  });

  it('persists null when trusted/remake are omitted', async () => {
    const id = await insertRelease({
      seriesId: h.seriesId,
      indexerId: h.indexerId,
      indexerGuid: 'g-null',
      title: 'Series Vol 2 [Group]',
      link: 'magnet:?xt=urn:btih:def',
      targetKind: 'volume',
      targetLow: 2,
      targetHigh: 2,
      groupName: 'Group',
      language: 'en',
      sizeBytes: 100_000_000,
      seeders: 10,
      leechers: 0,
      publishedAt: new Date(),
      score: 50,
    });
    const [row] = await getDb().select().from(releases).where(eq(releases.id, id));
    expect(row?.trusted).toBeNull();
    expect(row?.remake).toBeNull();
  });
});
