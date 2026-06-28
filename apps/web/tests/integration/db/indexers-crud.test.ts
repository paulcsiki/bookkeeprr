import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { seedDb, type SeedHandle } from '../helpers/seed';
import { insertIndexer, deleteIndexer, getIndexer, listIndexers } from '@/server/db/indexers';
import { upsertReleaseByGuid } from '@/server/db/releases';
import { getDb } from '@/server/db/client';
import { releases } from '@/server/db/schema';
import { eq } from 'drizzle-orm';

let h: SeedHandle;

beforeEach(async () => {
  h = await seedDb({ skipDefaultSeries: true });
});
afterEach(() => h.cleanup());

describe('insertIndexer', () => {
  it('inserts a nyaa indexer and returns its id', async () => {
    const id = await insertIndexer({
      kind: 'nyaa',
      name: 'test-nyaa',
      baseUrl: 'https://example.test',
      enabled: false,
      configJson: {
        kind: 'nyaa',
        queryTemplate: '{title}',
        contentTypes: ['manga'],
        categoryByContentType: { manga: '3_1' },
        pollIntervalSeconds: 900,
      },
    });
    expect(typeof id).toBe('number');
    expect(id).toBeGreaterThan(0);
    const row = await getIndexer(id);
    expect(row?.name).toBe('test-nyaa');
    expect(row?.enabled).toBe(false);
  });

  it('inserts a filelist indexer', async () => {
    const id = await insertIndexer({
      kind: 'filelist',
      name: 'test-fl',
      baseUrl: 'https://filelist.test',
      enabled: true,
      configJson: {
        kind: 'filelist',
        queryTemplate: '{title}',
        contentTypes: ['ebook'],
        categoryByContentType: { ebook: 24 },
        username: 'u',
        passkey: 'p',
        pollIntervalSeconds: 1800,
      },
    });
    const row = await getIndexer(id);
    expect(row?.kind).toBe('filelist');
    expect(row?.baseUrl).toBe('https://filelist.test');
  });

  it('allows duplicate names (no unique constraint)', async () => {
    const a = await insertIndexer({
      kind: 'nyaa',
      name: 'dup',
      baseUrl: 'https://example.test',
      enabled: false,
      configJson: {
        kind: 'nyaa',
        queryTemplate: '{title}',
        contentTypes: ['manga'],
        categoryByContentType: { manga: '3_1' },
        pollIntervalSeconds: 900,
      },
    });
    const b = await insertIndexer({
      kind: 'nyaa',
      name: 'dup',
      baseUrl: 'https://example.test',
      enabled: false,
      configJson: {
        kind: 'nyaa',
        queryTemplate: '{title}',
        contentTypes: ['manga'],
        categoryByContentType: { manga: '3_1' },
        pollIntervalSeconds: 900,
      },
    });
    expect(a).not.toBe(b);
  });
});

describe('deleteIndexer', () => {
  it('removes the row', async () => {
    const id = await insertIndexer({
      kind: 'nyaa',
      name: 'to-delete',
      baseUrl: 'https://example.test',
      enabled: false,
      configJson: {
        kind: 'nyaa',
        queryTemplate: '{title}',
        contentTypes: ['manga'],
        categoryByContentType: { manga: '3_1' },
        pollIntervalSeconds: 900,
      },
    });
    await deleteIndexer(id);
    const row = await getIndexer(id);
    expect(row).toBeNull();
  });

  it('cascades to releases (releases.indexer_id ON DELETE CASCADE)', async () => {
    const indexerId = await insertIndexer({
      kind: 'nyaa',
      name: 'cascade-test',
      baseUrl: 'https://example.test',
      enabled: false,
      configJson: {
        kind: 'nyaa',
        queryTemplate: '{title}',
        contentTypes: ['manga'],
        categoryByContentType: { manga: '3_1' },
        pollIntervalSeconds: 900,
      },
    });
    await upsertReleaseByGuid({
      indexerId,
      indexerGuid: 'g1',
      seriesId: null,
      title: 't',
      link: 'https://example.test/t',
      targetKind: 'volume',
      targetLow: 1,
      targetHigh: 1,
      groupName: null,
      language: null,
      sizeBytes: 1,
      seeders: 1,
      leechers: 1,
      publishedAt: new Date(),
      score: 0,
    });

    // Sanity: the release exists.
    const beforeRows = await getDb()
      .select()
      .from(releases)
      .where(eq(releases.indexerId, indexerId));
    expect(beforeRows.length).toBe(1);

    await deleteIndexer(indexerId);

    const afterRows = await getDb()
      .select()
      .from(releases)
      .where(eq(releases.indexerId, indexerId));
    expect(afterRows.length).toBe(0);
  });

  it('is a no-op when the id does not exist', async () => {
    await expect(deleteIndexer(99999)).resolves.toBeUndefined();
  });
});

describe('listIndexers after insert/delete', () => {
  it('reflects current state', async () => {
    const before = await listIndexers();
    const id = await insertIndexer({
      kind: 'nyaa',
      name: 'listed',
      baseUrl: 'https://example.test',
      enabled: false,
      configJson: {
        kind: 'nyaa',
        queryTemplate: '{title}',
        contentTypes: ['manga'],
        categoryByContentType: { manga: '3_1' },
        pollIntervalSeconds: 900,
      },
    });
    const mid = await listIndexers();
    expect(mid.length).toBe(before.length + 1);
    await deleteIndexer(id);
    const after = await listIndexers();
    expect(after.length).toBe(before.length);
  });
});
