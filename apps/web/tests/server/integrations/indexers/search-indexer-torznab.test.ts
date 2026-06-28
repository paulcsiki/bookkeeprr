import { afterEach, expect, it } from 'vitest';
import { searchIndexer } from '@/server/integrations/indexers';
import {
  __setTorznabFetcherForTests,
  __resetTorznabForTests,
} from '@/server/integrations/torznab';
import type { IndexerRow } from '@/server/db/schema';
import type { TorznabConfig } from '@/server/integrations/indexers/types';

afterEach(() => __resetTorznabForTests());

const row = { id: 1, kind: 'torznab', name: 'Prowlarr', baseUrl: 'http://prowlarr/1/api', enabled: true } as IndexerRow;
const cfg: TorznabConfig = {
  kind: 'torznab',
  queryTemplate: '{title} {extra}',
  contentTypes: ['ebook'],
  categoryByContentType: { ebook: '7020' },
  apiKey: 'KEY',
  pollIntervalSeconds: 900,
};

it('searchIndexer dispatches to torznab using baseUrl + cat', async () => {
  let url = '';
  __setTorznabFetcherForTests((u) => {
    url = u;
    return Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve('<rss><channel></channel></rss>') });
  });
  const res = await searchIndexer(row, cfg, { q: 'atomic habits', category: '7020' });
  expect(url).toContain('http://prowlarr/1/api?');
  expect(url).toContain('t=search');
  expect(res).toEqual([]);
});
