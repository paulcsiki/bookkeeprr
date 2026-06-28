import { afterEach, describe, expect, it } from 'vitest';
import {
  searchSeriesVolumes,
  GoogleBooksError,
  __setGoogleBooksFetcherForTests,
  __resetGoogleBooksForTests,
} from '@/server/integrations/googlebooks';

afterEach(() => __resetGoogleBooksForTests());

function resp(body: unknown) {
  return Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve(JSON.stringify(body)) });
}

describe('searchSeriesVolumes', () => {
  it('maps Google Books items to normalized editions and upgrades thumbnails', async () => {
    const calledUrls: string[] = [];
    __setGoogleBooksFetcherForTests((url) => {
      calledUrls.push(url);
      // First call (startIndex=0): return item; subsequent calls: return empty to stop pagination.
      if (decodeURIComponent(url).includes('startIndex=0')) {
        return resp({
          totalItems: 1,
          items: [
            {
              id: 'GEiHEAAAQBAJ',
              volumeInfo: {
                title: 'Solo Leveling, Vol. 6 (novel)',
                publisher: 'Yen Press',
                description: 'd',
                pageCount: 350,
                language: 'en',
                imageLinks: { thumbnail: 'http://books.google.com/c?id=GEiHEAAAQBAJ&zoom=1&edge=curl' },
              },
              accessInfo: { viewability: 'PARTIAL' },
            },
          ],
        });
      }
      return resp({ totalItems: 1 }); // no items → stop
    });

    const editions = await searchSeriesVolumes('Solo Leveling', 'Yen Press');
    const firstDecoded = decodeURIComponent(calledUrls[0]!);
    expect(firstDecoded).toContain('intitle:');
    expect(firstDecoded).toContain('inpublisher:');
    expect(firstDecoded).toContain('startIndex=0');
    expect(editions).toHaveLength(1);
    const e = editions[0]!;
    expect(e.id).toBe('GEiHEAAAQBAJ');
    expect(e.language).toBe('en');
    expect(e.viewability).toBe('PARTIAL');
    expect(e.coverUrl).toMatch(/^https:\/\//); // httpsified
    expect(e.coverUrl).not.toContain('edge=curl'); // upgraded
  });

  it('paginates up to 3 pages and dedupes by id', async () => {
    const calledUrls: string[] = [];
    __setGoogleBooksFetcherForTests((url) => {
      calledUrls.push(url);
      const decoded = decodeURIComponent(url);
      if (decoded.includes('startIndex=0')) {
        return resp({
          totalItems: 80,
          items: [
            { id: 'id1', volumeInfo: { title: 'T', language: 'en' }, accessInfo: { viewability: 'NO_PAGES' } },
            { id: 'id2', volumeInfo: { title: 'T2', language: 'en' }, accessInfo: { viewability: 'PARTIAL' } },
          ],
        });
      }
      if (decoded.includes('startIndex=40')) {
        return resp({
          totalItems: 80,
          items: [
            // id1 duplicate — should be deduped
            { id: 'id1', volumeInfo: { title: 'T', language: 'en' }, accessInfo: { viewability: 'NO_PAGES' } },
            { id: 'id3', volumeInfo: { title: 'T3', language: 'en' }, accessInfo: {} },
          ],
        });
      }
      // startIndex=80: empty → stop
      return resp({ totalItems: 80 });
    });

    const editions = await searchSeriesVolumes('Solo Leveling');
    expect(calledUrls).toHaveLength(3); // 0, 40, 80
    // 3 unique ids (id1, id2, id3)
    expect(editions).toHaveLength(3);
    expect(editions.map((e) => e.id)).toEqual(['id1', 'id2', 'id3']);
    // viewability mapped correctly
    expect(editions.find((e) => e.id === 'id1')!.viewability).toBe('NO_PAGES');
    expect(editions.find((e) => e.id === 'id2')!.viewability).toBe('PARTIAL');
    expect(editions.find((e) => e.id === 'id3')!.viewability).toBeNull();
  });

  it('stops early when a page returns 0 items', async () => {
    const calledUrls: string[] = [];
    __setGoogleBooksFetcherForTests((url) => {
      calledUrls.push(url);
      if (decodeURIComponent(url).includes('startIndex=0')) {
        return resp({ totalItems: 5, items: [{ id: 'id1', volumeInfo: {}, accessInfo: {} }] });
      }
      return resp({ totalItems: 5 }); // no items key → stop
    });
    await searchSeriesVolumes('Solo Leveling');
    expect(calledUrls).toHaveLength(2); // stops after page 2 returns empty
  });

  it('omits inpublisher when no publisher is given', async () => {
    let calledUrl = '';
    __setGoogleBooksFetcherForTests((url) => {
      calledUrl = url;
      return resp({ totalItems: 0 });
    });
    const editions = await searchSeriesVolumes('Solo Leveling');
    const decoded = decodeURIComponent(calledUrl);
    expect(decoded).toContain('intitle:');
    expect(decoded).not.toContain('inpublisher:');
    expect(editions).toEqual([]);
  });

  it('throws GoogleBooksError when the server returns a non-OK status', async () => {
    __setGoogleBooksFetcherForTests(() =>
      Promise.resolve({ ok: false, status: 500, text: () => Promise.resolve('Internal Server Error') }),
    );
    await expect(searchSeriesVolumes('Solo Leveling')).rejects.toBeInstanceOf(GoogleBooksError);
  });

  it('throws GoogleBooksError when the response body is not valid JSON', async () => {
    __setGoogleBooksFetcherForTests(() =>
      Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve('not json at all') }),
    );
    await expect(searchSeriesVolumes('Solo Leveling')).rejects.toBeInstanceOf(GoogleBooksError);
  });

  it('extracts ISBN_13 from industryIdentifiers into the edition isbn field', async () => {
    __setGoogleBooksFetcherForTests((url) => {
      if (decodeURIComponent(url).includes('startIndex=0')) {
        return resp({
          totalItems: 1,
          items: [
            {
              id: 'v3ACAAJ',
              volumeInfo: {
                title: 'Solo Leveling, Vol. 3 (novel)',
                language: 'en',
                industryIdentifiers: [
                  { type: 'ISBN_10', identifier: '1975319311' },
                  { type: 'ISBN_13', identifier: '9781975319311' },
                ],
              },
              accessInfo: { viewability: 'NO_PAGES' },
            },
          ],
        });
      }
      return resp({ totalItems: 0 });
    });
    const editions = await searchSeriesVolumes('Solo Leveling');
    expect(editions[0]!.isbn).toBe('9781975319311');
  });

  it('falls back to ISBN_10 when ISBN_13 is absent', async () => {
    __setGoogleBooksFetcherForTests((url) => {
      if (decodeURIComponent(url).includes('startIndex=0')) {
        return resp({
          totalItems: 1,
          items: [
            {
              id: 'v3ACAAJ',
              volumeInfo: {
                title: 'Solo Leveling, Vol. 3 (novel)',
                language: 'en',
                industryIdentifiers: [{ type: 'ISBN_10', identifier: '1975319311' }],
              },
              accessInfo: { viewability: 'NO_PAGES' },
            },
          ],
        });
      }
      return resp({ totalItems: 0 });
    });
    const editions = await searchSeriesVolumes('Solo Leveling');
    expect(editions[0]!.isbn).toBe('1975319311');
  });

  it('sets isbn to null when industryIdentifiers is absent', async () => {
    __setGoogleBooksFetcherForTests((url) => {
      if (decodeURIComponent(url).includes('startIndex=0')) {
        return resp({
          totalItems: 1,
          items: [
            {
              id: 'v1QBAJ',
              volumeInfo: { title: 'Solo Leveling, Vol. 1 (novel)', language: 'en' },
              accessInfo: { viewability: 'PARTIAL' },
            },
          ],
        });
      }
      return resp({ totalItems: 0 });
    });
    const editions = await searchSeriesVolumes('Solo Leveling');
    expect(editions[0]!.isbn).toBeNull();
  });
});
