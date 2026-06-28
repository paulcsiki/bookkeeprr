import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { seedDb, type SeedHandle } from '../helpers/seed';
import {
  seedDefaultIndexer,
  listEnabledIndexers,
  getIndexer,
  updateIndexerLastRssAt,
  updateIndexer,
} from '@/server/db/indexers';
import { getDb } from '@/server/db/client';
import { indexers } from '@/server/db/schema';

let h: SeedHandle;
beforeEach(async () => {
  h = await seedDb();
});
afterEach(() => h.cleanup());

describe('indexers DAL', () => {
  it('seedDefaultIndexer creates a nyaa row when none exist', async () => {
    const id = await seedDefaultIndexer();
    expect(id).toBeGreaterThan(0);
    const all = await getDb().select().from(indexers);
    const nyaa = all.find((r) => r.kind === 'nyaa');
    expect(nyaa).toBeDefined();
    expect(nyaa?.enabled).toBe(true);
    expect(nyaa?.baseUrl).toBe('https://nyaa.si');
    const cfg = JSON.parse(nyaa?.configJson ?? '{}');
    expect(cfg.queryTemplate).toBe('{title} {extra}');
    expect(cfg.categoryByContentType).toEqual({ manga: '3_1', comic: '3_1' });
  });

  it('seedDefaultIndexer is idempotent', async () => {
    const id1 = await seedDefaultIndexer();
    const id2 = await seedDefaultIndexer();
    expect(id2).toBe(id1);
    const nyaaRows = (await getDb().select().from(indexers)).filter((r) => r.kind === 'nyaa');
    expect(nyaaRows).toHaveLength(1);
  });

  it('listEnabledIndexers filters by enabled=true', async () => {
    const id = await seedDefaultIndexer();
    let enabled = await listEnabledIndexers();
    expect(enabled).toHaveLength(1);
    await updateIndexer(id, { enabled: false });
    enabled = await listEnabledIndexers();
    expect(enabled).toHaveLength(0);
  });

  it('updateIndexerLastRssAt sets the timestamp', async () => {
    const id = await seedDefaultIndexer();
    const ts = new Date('2026-05-23T12:00:00Z');
    await updateIndexerLastRssAt(id, ts);
    const row = await getIndexer(id);
    expect(row?.lastRssAt?.getTime()).toBe(ts.getTime());
  });

  it('updateIndexer patches configJson', async () => {
    const id = await seedDefaultIndexer();
    await updateIndexer(id, {
      configJson: {
        pollIntervalSeconds: 900,
        kind: 'nyaa',
        queryTemplate: '{title}',
        contentTypes: ['manga', 'comic'],
        categoryByContentType: { manga: '3_3', comic: '3_3' },
      },
    });
    const row = await getIndexer(id);
    const cfg = JSON.parse(row?.configJson ?? '{}');
    expect(cfg.categoryByContentType.manga).toBe('3_3');
  });
});
