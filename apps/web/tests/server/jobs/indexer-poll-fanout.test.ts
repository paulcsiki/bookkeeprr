import { describe, expect, it } from 'vitest';
import { insertIndexer } from '@/server/db/indexers';
import { indexerPollFanoutDescriptor } from '@/server/jobs/kinds/indexer-poll-fanout';
import { seedDb } from '../../integration/helpers/seed';

describe('indexer-poll-fanout', () => {
  it('excludes MAM from enqueued ids even when MAM is enabled and due', async () => {
    // skipDefaultSeries avoids seeding a manga series that would cause the nyaa
    // poll (run via runUntilIdle) to make real network requests during the test.
    const h = await seedDb({ skipDefaultSeries: true });
    try {
      // h.indexerId is the seeded nyaa indexer — enabled, no lastRssAt → due.
      const mamId = await insertIndexer({
        kind: 'mam',
        name: 'MyAnonaMouse',
        baseUrl: 'https://www.myanonamouse.net',
        enabled: true,
        configJson: {
          kind: 'mam',
          queryTemplate: '{title}',
          contentTypes: ['light_novel'],
          categoryByContentType: { light_novel: 14 },
          mamId: 'sess',
          proxyUrl: '',
          searchIn: ['title'],
          pollIntervalSeconds: 900,
        },
      });

      // Both nyaa (h.indexerId) and mam (mamId) are enabled with no lastRssAt,
      // so both are "due". listAutomatedIndexers must exclude MAM so only nyaa
      // appears in enqueuedIds.
      const result = await indexerPollFanoutDescriptor.handler({}, 0);

      // MAM must never be enqueued — it is manual-only
      expect(result.enqueuedIds).not.toContain(mamId);
      // The automated nyaa indexer must be enqueued
      expect(result.enqueuedIds).toContain(h.indexerId);
      // No errors during the fanout phase
      expect(result.errors).toHaveLength(0);
    } finally {
      h.cleanup();
    }
  });
});
