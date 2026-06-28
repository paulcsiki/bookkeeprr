import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { searchIndexer } from '@/server/integrations/indexers';
import { __setNyaaFetcherForTests, __resetNyaaForTests } from '@/server/integrations/nyaa/client';
import {
  __setFilelistFetcherForTests,
  __resetFilelistForTests,
} from '@/server/integrations/filelist/client';
import type { IndexerRow } from '@/server/db/schema';

const NYAA_INDEXER: IndexerRow = {
  id: 1,
  kind: 'nyaa',
  name: 'nyaa.si',
  baseUrl: 'https://nyaa.si',
  configJson: '{}',
  enabled: true,
  lastRssAt: null,
  lastSearchAt: null,
};

const RSS = (item: string) => `<?xml version="1.0"?>
<rss xmlns:nyaa="https://nyaa.si/xmlns/nyaa" version="2.0"><channel>${item}</channel></rss>`;

const ITEM = (guid = '9', title = '[G] Foo v01') => `
<item>
  <title>${title}</title>
  <link>https://nyaa.si/download/${guid}.torrent</link>
  <guid isPermaLink="true">https://nyaa.si/view/${guid}</guid>
  <pubDate>Mon, 22 May 2026 12:00:00 +0000</pubDate>
  <nyaa:seeders>10</nyaa:seeders>
  <nyaa:leechers>1</nyaa:leechers>
  <nyaa:downloads>5</nyaa:downloads>
  <nyaa:infoHash>${'a'.repeat(40)}</nyaa:infoHash>
  <nyaa:categoryId>3_1</nyaa:categoryId>
  <nyaa:size>100 MiB</nyaa:size>
  <nyaa:comments>0</nyaa:comments>
  <nyaa:trusted>No</nyaa:trusted>
  <nyaa:remake>No</nyaa:remake>
</item>`;

const FILELIST_INDEXER: IndexerRow = {
  id: 2,
  kind: 'filelist',
  name: 'filelist.io',
  baseUrl: 'https://filelist.io',
  configJson: '{}',
  enabled: true,
  lastRssAt: null,
  lastSearchAt: null,
};

beforeEach(() => {
  __resetNyaaForTests();
  __resetFilelistForTests();
});
afterEach(() => {
  __resetNyaaForTests();
  __resetFilelistForTests();
});

describe('searchIndexer — nyaa branch', () => {
  it('dispatches to searchNyaa and maps to IndexerResult shape', async () => {
    __setNyaaFetcherForTests(async () => ({
      ok: true,
      status: 200,
      text: async () => RSS(ITEM('42', '[G] Foo v01')),
    }));

    const cfg = {
      kind: 'nyaa' as const,
      queryTemplate: '{title}',
      contentTypes: ['manga' as const],
      categoryByContentType: { manga: '3_1' as const },
      pollIntervalSeconds: 900,
    };
    const items = await searchIndexer(NYAA_INDEXER, cfg, { q: 'foo', category: '3_1' });
    expect(items).toHaveLength(1);
    const item = items[0]!;
    expect(item.guid).toBe('42');
    expect(item.title).toBe('[G] Foo v01');
    expect(item.sizeBytes).toBe(100 * 1024 * 1024);
    expect(item.seeders).toBe(10);
    expect(item.infoHash).toMatch(/^a+$/);
    expect(item.pubDate).toBeInstanceOf(Date);
  });
});

describe('searchIndexer — filelist branch', () => {
  it('dispatches to searchFilelist with creds + numeric category', async () => {
    let capturedUrl = '';
    __setFilelistFetcherForTests(async (url) => {
      capturedUrl = url;
      return {
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify([
            {
              id: 9001,
              name: 'A Book',
              size: 1024,
              seeders: 3,
              leechers: 0,
              category: 24,
              upload_date: '2024-01-02 03:04:05',
              download_link: 'https://filelist.io/download.php?id=9001',
            },
          ]),
      };
    });

    const cfg = {
      kind: 'filelist' as const,
      queryTemplate: '{title}',
      contentTypes: ['light_novel' as const],
      categoryByContentType: { light_novel: 24 },
      username: 'paul',
      passkey: 'k',
      pollIntervalSeconds: 900,
    };
    const items = await searchIndexer(FILELIST_INDEXER, cfg, { q: 'book', category: 24 });
    expect(items).toHaveLength(1);
    expect(items[0]!.guid).toBe('9001');
    expect(items[0]!.infoHash).toBeNull();
    expect(capturedUrl).toContain('username=paul');
    expect(capturedUrl).toContain('category=24');
    expect(capturedUrl).toContain('query=book');
  });
});
