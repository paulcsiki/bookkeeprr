import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { seedDb, type SeedHandle } from '../helpers/seed';
import { seedDefaultIndexer } from '@/server/db/indexers';
import { upsertReleaseByGuid } from '@/server/db/releases';
import { insertDownload } from '@/server/db/downloads';
import { __setNyaaFetcherForTests, __resetNyaaForTests } from '@/server/integrations/nyaa/client';
import { POST } from '@/app/api/search/interactive/route';

let h: SeedHandle;
beforeEach(async () => {
  h = await seedDb();
  await seedDefaultIndexer();
  __resetNyaaForTests();
});
afterEach(() => h.cleanup());

const RSS = (item: string) =>
  `<?xml version="1.0"?><rss xmlns:nyaa="https://nyaa.si/xmlns/nyaa" version="2.0"><channel>${item}</channel></rss>`;

const ITEM = (title: string, guid: string) => `
  <item>
    <title>${title}</title>
    <link>https://nyaa.si/download/${guid}.torrent</link>
    <guid isPermaLink="true">https://nyaa.si/view/${guid}</guid>
    <pubDate>Mon, 22 May 2026 12:00:00 +0000</pubDate>
    <nyaa:seeders>50</nyaa:seeders>
    <nyaa:leechers>1</nyaa:leechers>
    <nyaa:downloads>100</nyaa:downloads>
    <nyaa:infoHash>${'a'.repeat(40)}</nyaa:infoHash>
    <nyaa:categoryId>3_1</nyaa:categoryId>
    <nyaa:size>100 MiB</nyaa:size>
    <nyaa:comments>0</nyaa:comments>
    <nyaa:trusted>No</nyaa:trusted>
    <nyaa:remake>No</nyaa:remake>
  </item>`;

describe('POST /api/search/interactive — downloading ownership', () => {
  it('shows downloading when match has an active download', async () => {
    __setNyaaFetcherForTests(async () => ({
      ok: true,
      status: 200,
      text: async () => RSS(ITEM('[Group] Test Series v01', '111')),
    }));
    // Pre-stage a release+download that nyaa will rediscover via upsert
    const releaseId = await upsertReleaseByGuid({
      indexerId: 1,
      indexerGuid: '111',
      seriesId: h.seriesId,
      title: '[Group] Test Series v01',
      link: 'm:1',
      targetKind: 'volume',
      targetLow: 1,
      targetHigh: 1,
      sizeBytes: 100 * 1024 * 1024,
      publishedAt: new Date(),
      score: 50,
    });
    await insertDownload({ releaseId, qbtHash: 'abc', status: 'queued' });

    const res = await POST(
      new Request('http://t', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ seriesId: h.seriesId }),
      }),
    );
    const body = await res.json();
    const match = body.results.find(
      (r: { matchResult: { matches: boolean } }) => r.matchResult.matches,
    );
    expect(match.ownership).toBe('downloading');
  });
});
