import { describe, expect, it } from 'vitest';
import {
  insertIndexer,
  listAutomatedIndexers,
  listEnabledIndexers,
  isManualOnlyIndexer,
} from '@/server/db/indexers';
import { seedDb } from '../../integration/helpers/seed';

describe('isManualOnlyIndexer', () => {
  it('is true only for mam', () => {
    expect(isManualOnlyIndexer('mam')).toBe(true);
    expect(isManualOnlyIndexer('nyaa')).toBe(false);
    expect(isManualOnlyIndexer('filelist')).toBe(false);
    expect(isManualOnlyIndexer('torznab')).toBe(false);
  });
});

describe('listAutomatedIndexers', () => {
  it('excludes enabled mam indexers (but listEnabledIndexers includes them)', async () => {
    const h = await seedDb();
    try {
      await insertIndexer({
        kind: 'mam',
        name: 'MyAnonaMouse',
        baseUrl: 'https://www.myanonamouse.net',
        enabled: true,
        configJson: {
          kind: 'mam',
          queryTemplate: '{title}',
          contentTypes: ['ebook'],
          categoryByContentType: { ebook: 14 },
          mamId: 'sess',
          proxyUrl: '',
          searchIn: ['title'],
          pollIntervalSeconds: 900,
        },
      });
      const enabled = await listEnabledIndexers();
      expect(enabled.some((i) => i.kind === 'mam')).toBe(true);

      const automated = await listAutomatedIndexers();
      expect(automated.some((i) => i.kind === 'mam')).toBe(false);
    } finally {
      h.cleanup();
    }
  });
});
