import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { seedDb, type SeedHandle } from '../helpers/seed';
import { indexerPollDescriptor } from '@/server/jobs/kinds/indexer-poll';
import { adultFilterSetting } from '@/server/db/settings/matcher';
import { enqueueJob } from '@/server/db/jobs';
import { getDb } from '@/server/db/client';
import { releases } from '@/server/db/schema';
import { eq } from 'drizzle-orm';
import { seedDefaultIndexers, updateIndexer } from '@/server/db/indexers';
import * as nyaaClient from '@/server/integrations/nyaa/client';
import type { NyaaRssItem } from '@/server/integrations/nyaa';

let h: SeedHandle;
let tmpConfig: string;

beforeEach(async () => {
  h = await seedDb();
  tmpConfig = mkdtempSync(join(tmpdir(), 'bk-m27-adult-'));
  process.env.BOOKKEEPRR_CONFIG_DIR = tmpConfig;
});
afterEach(() => {
  delete process.env.BOOKKEEPRR_CONFIG_DIR;
  h.cleanup();
  rmSync(tmpConfig, { recursive: true, force: true });
  vi.restoreAllMocks();
});

function nyaaItem(over: Partial<NyaaRssItem> = {}): NyaaRssItem {
  return {
    guid: 'g1',
    title: 'Test Series v1',
    link: 'magnet:?xt=urn:btih:111',
    pubDate: new Date(),
    seeders: 50,
    leechers: 1,
    downloads: 1,
    sizeBytes: 100 * 1024 * 1024,
    infoHash: '111',
    categoryId: '3_1',
    trusted: false,
    remake: false,
    ...over,
  };
}

describe('indexer-poll handler honours adult filter', () => {
  it('does NOT upsert a release whose category is in the blocklist', async () => {
    const { nyaaId } = await seedDefaultIndexers();
    await updateIndexer(nyaaId, { enabled: true });

    // Spy on the nyaa client — confirmed export name is `searchNyaa` from client.ts.
    vi.spyOn(nyaaClient, 'searchNyaa').mockResolvedValue([nyaaItem({ categoryId: '4_1' })]);

    await adultFilterSetting.set({
      enabled: true,
      blockedCategories: ['4_1'],
    });

    const jobId = await enqueueJob('indexer_poll', { indexerId: nyaaId });
    await indexerPollDescriptor.handler({ indexerId: nyaaId }, jobId);

    const rows = await getDb().select().from(releases).where(eq(releases.indexerId, nyaaId));
    expect(rows.length).toBe(0);
  });

  it('handler runs cleanly when adult filter is disabled (smoke test)', async () => {
    const { nyaaId } = await seedDefaultIndexers();
    await updateIndexer(nyaaId, { enabled: true });

    vi.spyOn(nyaaClient, 'searchNyaa').mockResolvedValue([nyaaItem({ categoryId: '4_1' })]);

    await adultFilterSetting.set({
      enabled: false,
      blockedCategories: ['4_1'],
    });

    const jobId = await enqueueJob('indexer_poll', { indexerId: nyaaId });
    // The handler should complete without throwing. Whether the release gets
    // upserted depends on other matcher gates (title match against seeded
    // series, etc.) — that's not what this test asserts. We just confirm
    // the adult filter being disabled doesn't break the path.
    await expect(
      indexerPollDescriptor.handler({ indexerId: nyaaId }, jobId),
    ).resolves.toBeDefined();
  });
});
