import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { seedDb, type SeedHandle } from '../helpers/seed';
import { seedDefaultIndexer } from '@/server/db/indexers';
import { __setNyaaFetcherForTests, __resetNyaaForTests } from '@/server/integrations/nyaa/client';
import { missingSearchDescriptor } from '@/server/jobs/kinds/missing-search';
import { enqueueJob } from '@/server/db/jobs';
import { runOnce } from '@/server/jobs/runner';
import { insertLibraryFile } from '@/server/db/library-files';
import { updateSeries } from '@/server/db/series';
import { listReleasesBySeries } from '@/server/db/releases';
import { eq } from 'drizzle-orm';
import { getDb } from '@/server/db/client';
import { series as seriesTable } from '@/server/db/schema';
import { type ContentType } from '@/server/content-type';

let h: SeedHandle;

beforeEach(async () => {
  h = await seedDb({ rootPath: '/media/comics/Test' });
  await seedDefaultIndexer();
  __resetNyaaForTests();
});

afterEach(() => {
  h.cleanup();
});

describe('missing_search job', () => {
  it('skips series with all targets owned', async () => {
    // Series has volume id from seedDb, with totalVolumes=1; we have one library_file with volumeId = h.volumeId
    await updateSeries(h.seriesId, { totalVolumes: 1 });
    await insertLibraryFile({
      seriesId: h.seriesId,
      volumeId: h.volumeId,
      path: '/media/comics/Test/v01.cbz',
      sizeBytes: 100,
    });
    let fetchCalled = false;
    __setNyaaFetcherForTests(async () => {
      fetchCalled = true;
      return { ok: true, status: 200, text: async () => '<rss><channel></channel></rss>' };
    });
    await enqueueJob('missing_search', {});
    await runOnce(missingSearchDescriptor);
    expect(fetchCalled).toBe(false);
  });

  it('polls series with at least one missing target', async () => {
    await updateSeries(h.seriesId, { totalVolumes: 5 });
    // Only volume #1 owned out of 5
    await insertLibraryFile({
      seriesId: h.seriesId,
      volumeId: h.volumeId,
      path: '/media/comics/Test/v01.cbz',
      sizeBytes: 100,
    });
    let fetchCalled = false;
    __setNyaaFetcherForTests(async () => {
      fetchCalled = true;
      return {
        ok: true,
        status: 200,
        text: async () => '<?xml version="1.0"?><rss><channel></channel></rss>',
      };
    });
    await enqueueJob('missing_search', {});
    await runOnce(missingSearchDescriptor);
    expect(fetchCalled).toBe(true);
  });

  it('skips series with monitoring=future', async () => {
    await updateSeries(h.seriesId, { monitoring: 'future', totalVolumes: 10 });
    let fetchCalled = false;
    __setNyaaFetcherForTests(async () => {
      fetchCalled = true;
      return {
        ok: true,
        status: 200,
        text: async () => '<?xml version="1.0"?><rss><channel></channel></rss>',
      };
    });
    await enqueueJob('missing_search', {});
    await runOnce(missingSearchDescriptor);
    expect(fetchCalled).toBe(false);
  });
});

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

async function setSeriesContentType(seriesId: number, ct: ContentType): Promise<void> {
  await getDb().update(seriesTable).set({ contentType: ct }).where(eq(seriesTable.id, seriesId));
}

describe('missing_search — content-type filtering', () => {
  it('skips series whose content_type is not in any enabled indexer allowlist', async () => {
    // h.seriesId default contentType is 'manga'; flip to light_novel so the
    // nyaa indexer (default allowlist: manga + comic) excludes it.
    await updateSeries(h.seriesId, { totalVolumes: 5 });
    await setSeriesContentType(h.seriesId, 'light_novel');

    __setNyaaFetcherForTests(async () => ({
      ok: true,
      status: 200,
      text: async () => RSS(ITEM({ title: '[G] Test Series v01', guid: '1' })),
    }));

    await enqueueJob('missing_search', {});
    await runOnce(missingSearchDescriptor);

    const stored = await listReleasesBySeries(h.seriesId);
    expect(stored).toHaveLength(0);
  });
});
