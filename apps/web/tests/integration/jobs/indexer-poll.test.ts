import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { seedDb, type SeedHandle } from '../helpers/seed';
import { seedDefaultIndexer } from '@/server/db/indexers';
import { listReleasesBySeries } from '@/server/db/releases';
import { __setNyaaFetcherForTests, __resetNyaaForTests } from '@/server/integrations/nyaa/client';
import { indexerPollDescriptor } from '@/server/jobs/kinds/indexer-poll';
import { enqueueJob } from '@/server/db/jobs';
import { runOnce } from '@/server/jobs/runner';

let h: SeedHandle;
let indexerId: number;

const RSS = (item: string) => `<?xml version="1.0"?>
<rss xmlns:nyaa="https://nyaa.si/xmlns/nyaa" version="2.0">
  <channel>
    ${item}
  </channel>
</rss>`;

const ITEM = (overrides: Partial<{ title: string; guid: string; size: string }>) => {
  const t = overrides.title ?? '[Group] Test Series v01';
  const g = overrides.guid ?? '111';
  const s = overrides.size ?? '100 MiB';
  return `
    <item>
      <title>${t}</title>
      <link>https://nyaa.si/download/${g}.torrent</link>
      <guid isPermaLink="true">https://nyaa.si/view/${g}</guid>
      <pubDate>Mon, 22 May 2026 12:00:00 +0000</pubDate>
      <nyaa:seeders>50</nyaa:seeders>
      <nyaa:leechers>1</nyaa:leechers>
      <nyaa:downloads>100</nyaa:downloads>
      <nyaa:infoHash>${'a'.repeat(40)}</nyaa:infoHash>
      <nyaa:categoryId>3_1</nyaa:categoryId>
      <nyaa:size>${s}</nyaa:size>
      <nyaa:comments>0</nyaa:comments>
      <nyaa:trusted>No</nyaa:trusted>
      <nyaa:remake>No</nyaa:remake>
    </item>`;
};

beforeEach(async () => {
  h = await seedDb({ rootPath: '/media/comics/Test Series' });
  indexerId = await seedDefaultIndexer();
  __resetNyaaForTests();
});

afterEach(() => {
  h.cleanup();
});

describe('indexer_poll job', () => {
  it('upserts confident matches and skips non-matches', async () => {
    __setNyaaFetcherForTests(async () => ({
      ok: true,
      status: 200,
      text: async () =>
        RSS(
          ITEM({ title: '[Group] Test Series v01', guid: '1' }) +
            ITEM({ title: '[Other] Unrelated Show v01', guid: '2' }),
        ),
    }));

    await enqueueJob('indexer_poll', { indexerId });
    await runOnce(indexerPollDescriptor);

    const stored = await listReleasesBySeries(h.seriesId);
    expect(stored).toHaveLength(1);
    expect(stored[0]?.indexerGuid).toBe('1');
  });

  it('isolates per-series errors: one fetch failure does not abort the job', async () => {
    let call = 0;
    __setNyaaFetcherForTests(async () => {
      call++;
      if (call === 1) {
        return { ok: false, status: 500, text: async () => 'err' };
      }
      return {
        ok: true,
        status: 200,
        text: async () => RSS(ITEM({ title: '[G] Test Series v01' })),
      };
    });
    // Seed a second series so the poll has 2 series to walk
    const { insertSeries } = await import('@/server/db/series');
    const id2 = await insertSeries({
      anilistId: 2,
      status: 'releasing',
      rootPath: '/media/comics/Second',
      qualityProfileId: h.qpId,
      titleEnglish: 'Test Series',
    });
    await enqueueJob('indexer_poll', { indexerId });
    await runOnce(indexerPollDescriptor);
    // The successful series (whichever order) should have a release
    const a = await listReleasesBySeries(h.seriesId);
    const b = await listReleasesBySeries(id2);
    expect(a.length + b.length).toBeGreaterThanOrEqual(1);
  });

  it('returns idle when indexer is disabled', async () => {
    const { updateIndexer } = await import('@/server/db/indexers');
    await updateIndexer(indexerId, { enabled: false });
    __setNyaaFetcherForTests(async () => {
      throw new Error('should not be called');
    });
    await enqueueJob('indexer_poll', { indexerId });
    await runOnce(indexerPollDescriptor);
    const stored = await listReleasesBySeries(h.seriesId);
    expect(stored).toHaveLength(0);
  });
});

import { eq } from 'drizzle-orm';
import { getDb } from '@/server/db/client';
import { series as seriesTable } from '@/server/db/schema';
import { updateIndexer } from '@/server/db/indexers';

async function setSeriesContentType(
  id: number,
  ct: 'manga' | 'comic' | 'light_novel' | 'ebook' | 'audiobook',
): Promise<void> {
  await getDb().update(seriesTable).set({ contentType: ct }).where(eq(seriesTable.id, id));
}

describe('indexer_poll — content-type filtering', () => {
  it('skips series whose content_type is not in the indexer allowlist', async () => {
    await setSeriesContentType(h.seriesId, 'light_novel');

    __setNyaaFetcherForTests(async () => ({
      ok: true,
      status: 200,
      text: async () => RSS(ITEM({ title: '[G] Test Series v01', guid: '1' })),
    }));

    await enqueueJob('indexer_poll', { indexerId });
    await runOnce(indexerPollDescriptor);

    const stored = await listReleasesBySeries(h.seriesId);
    expect(stored).toHaveLength(0);
  });

  it('skips series whose content-type has no category mapping', async () => {
    await updateIndexer(indexerId, {
      configJson: {
        kind: 'nyaa',
        queryTemplate: '{title}',
        contentTypes: ['light_novel'],
        categoryByContentType: {},
        pollIntervalSeconds: 900,
      },
    });
    await setSeriesContentType(h.seriesId, 'light_novel');

    __setNyaaFetcherForTests(async () => ({
      ok: true,
      status: 200,
      text: async () => RSS(ITEM({ title: '[G] Test Series v01', guid: '1' })),
    }));

    await enqueueJob('indexer_poll', { indexerId });
    await runOnce(indexerPollDescriptor);

    const stored = await listReleasesBySeries(h.seriesId);
    expect(stored).toHaveLength(0);
  });
});
