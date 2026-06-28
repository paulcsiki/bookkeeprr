import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { seedDb, type SeedHandle } from '../helpers/seed';
import { seedDefaultIndexer, insertIndexer } from '@/server/db/indexers';
import { insertSeries } from '@/server/db/series';
import { __setNyaaFetcherForTests, __resetNyaaForTests } from '@/server/integrations/nyaa/client';
import {
  __setFilelistFetcherForTests,
  __resetFilelistForTests,
} from '@/server/integrations/filelist/client';
import { POST } from '@/app/api/search/interactive/route';
import { expectShape } from '../../helpers/assert-spec';
import { ErrorResponse } from '@/server/openapi/schemas/common';
import {
  InteractiveSearchFailureResponse,
  InteractiveSearchResponse,
} from '@/server/openapi/schemas/search';

let h: SeedHandle;

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

const RSS = (items: string) =>
  `<?xml version="1.0"?><rss xmlns:nyaa="https://nyaa.si/xmlns/nyaa" version="2.0"><channel>${items}</channel></rss>`;

beforeEach(async () => {
  h = await seedDb();
  await seedDefaultIndexer();
  __resetNyaaForTests();
  __resetFilelistForTests();
});
afterEach(() => h.cleanup());

function reqBody(body: object): Request {
  return new Request('http://test/api/search/interactive', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/search/interactive', () => {
  it('returns matches AND non-matches, sorted matches-first', async () => {
    __setNyaaFetcherForTests(async () => ({
      ok: true,
      status: 200,
      text: async () =>
        RSS(ITEM('[Group] Test Series v01', '1') + ITEM('[Other] Unrelated Show v01', '2')),
    }));
    const res = await POST(reqBody({ seriesId: h.seriesId }));
    expect(res.status).toBe(200);
    await expectShape(InteractiveSearchResponse, res, 'POST /api/search/interactive');
    const body = await res.json();
    expect(body.results).toHaveLength(2);
    expect(body.results[0].matchResult.matches).toBe(true);
    expect(body.results[1].matchResult.matches).toBe(false);
    // infoUrl points at the Nyaa details page (baseUrl + /view/<guid>)
    for (const result of body.results) {
      expect(result.item.infoUrl).toBe(`https://nyaa.si/view/${result.item.guid}`);
    }
  });

  it('honors queryOverride', async () => {
    let urlSeen = '';
    __setNyaaFetcherForTests(async (url) => {
      urlSeen = url;
      return { ok: true, status: 200, text: async () => RSS('') };
    });
    await POST(reqBody({ seriesId: h.seriesId, queryOverride: 'custom term' }));
    expect(urlSeen).toContain('q=custom+term');
  });

  it('returns 404 on missing series', async () => {
    const res = await POST(reqBody({ seriesId: 9999 }));
    expect(res.status).toBe(404);
    await expectShape(ErrorResponse, res, 'POST /api/search/interactive');
  });

  it('returns 400 on bad payload', async () => {
    const res = await POST(reqBody({}));
    expect(res.status).toBe(400);
    await expectShape(ErrorResponse, res, 'POST /api/search/interactive');
  });

  it('searches non-Nyaa indexers via the dispatch (FileList ebook)', async () => {
    // Regression: the route used to call searchNyaa for every indexer, so any
    // FileList/Torznab indexer threw → "all indexers failed". An ebook series on
    // a FileList indexer must be searched through searchIndexer().
    const ebookSeriesId = await insertSeries({
      anilistId: 4242,
      status: 'finished',
      rootPath: '/media/ebooks/Atomic Habits',
      qualityProfileId: h.qpId,
      titleEnglish: 'Atomic Habits',
      contentType: 'ebook',
    });
    await insertIndexer({
      kind: 'filelist',
      name: 'FileList',
      baseUrl: 'https://filelist.io',
      enabled: true,
      configJson: {
        kind: 'filelist',
        queryTemplate: '{title} {extra}',
        contentTypes: ['ebook'],
        categoryByContentType: { ebook: 24 },
        username: 'paul',
        passkey: 'secret123',
        pollIntervalSeconds: 900,
      },
    });
    // The default Nyaa indexer doesn't cover ebooks; if the route still hit it
    // this fetcher would throw and fail the test.
    __setNyaaFetcherForTests(async () => {
      throw new Error('Nyaa should not be queried for an ebook series');
    });
    __setFilelistFetcherForTests(async () => ({
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify([
          {
            id: 712345,
            name: 'Atomic.Habits.James.Clear.epub',
            size: 4194304,
            seeders: 12,
            leechers: 0,
            category: 24,
            upload_date: '2024-06-01 12:30:45',
            download_link: 'https://filelist.io/download.php?id=712345&passkey=x',
          },
        ]),
    }));
    const res = await POST(reqBody({ seriesId: ebookSeriesId }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.results).toHaveLength(1);
    expect(body.results[0].item.title).toBe('Atomic.Habits.James.Clear.epub');
    expect(body.results[0].item.indexerKind).toBe('filelist');
  });

  it('returns 502 only when ALL indexers throw AND no items collected', async () => {
    __setNyaaFetcherForTests(async () => ({ ok: false, status: 500, text: async () => 'err' }));
    const res = await POST(reqBody({ seriesId: h.seriesId }));
    expect(res.status).toBe(502);
    await expectShape(InteractiveSearchFailureResponse, res, 'POST /api/search/interactive');
    const body = await res.json();
    expect(body.errors).toHaveLength(1);
  });
});
