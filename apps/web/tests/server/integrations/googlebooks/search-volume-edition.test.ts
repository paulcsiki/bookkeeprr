import { afterEach, describe, expect, it } from 'vitest';
import {
  searchVolumeEdition,
  __setGoogleBooksFetcherForTests,
  __resetGoogleBooksForTests,
} from '@/server/integrations/googlebooks';

afterEach(() => __resetGoogleBooksForTests());

function resp(body: unknown) {
  return Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve(JSON.stringify(body)) });
}

describe('searchVolumeEdition', () => {
  it('builds a query with intitle: twice (series title + Vol. N) and maps editions', async () => {
    const calledUrls: string[] = [];
    __setGoogleBooksFetcherForTests((url) => {
      calledUrls.push(url);
      return resp({
        totalItems: 1,
        items: [
          {
            id: 'v2QBAJ',
            volumeInfo: {
              title: 'Solo Leveling, Vol. 2 (novel)',
              publisher: 'Yen Press',
              description: 'Volume 2 description',
              pageCount: 320,
              language: 'en',
              imageLinks: { thumbnail: 'http://books.google.com/c?id=v2QBAJ&zoom=1' },
            },
            accessInfo: { viewability: 'PARTIAL' },
          },
        ],
      });
    });

    const editions = await searchVolumeEdition('Solo Leveling', 2);

    expect(calledUrls).toHaveLength(1);
    const decoded = decodeURIComponent(calledUrls[0]!);
    // Must contain intitle: for the series title AND for Vol. N
    const intitleMatches = decoded.match(/intitle:/g);
    expect(intitleMatches).not.toBeNull();
    expect(intitleMatches!.length).toBeGreaterThanOrEqual(2);
    expect(decoded).toContain('Solo Leveling');
    expect(decoded).toContain('Vol. 2');

    expect(editions).toHaveLength(1);
    const e = editions[0]!;
    expect(e.id).toBe('v2QBAJ');
    expect(e.viewability).toBe('PARTIAL');
    expect(e.coverUrl).toMatch(/^https:\/\//); // httpsified
  });

  it('returns an empty array when no items are found', async () => {
    __setGoogleBooksFetcherForTests(() => resp({ totalItems: 0 }));
    const editions = await searchVolumeEdition('Solo Leveling', 3);
    expect(editions).toEqual([]);
  });

  it('returned editions carry id, viewability, and coverUrl', async () => {
    __setGoogleBooksFetcherForTests(() =>
      resp({
        totalItems: 1,
        items: [
          {
            id: 'XYZ123QBAJ',
            volumeInfo: {
              title: 'My Series, Vol. 5',
              language: 'en',
              imageLinks: { thumbnail: 'http://books.google.com/c?id=XYZ123QBAJ&zoom=1&edge=curl' },
            },
            accessInfo: { viewability: 'ALL_PAGES' },
          },
        ],
      }),
    );
    const editions = await searchVolumeEdition('My Series', 5);
    expect(editions[0]!.id).toBe('XYZ123QBAJ');
    expect(editions[0]!.viewability).toBe('ALL_PAGES');
    expect(editions[0]!.coverUrl).toMatch(/^https:\/\//);
    expect(editions[0]!.coverUrl).not.toContain('edge=curl');
  });

  it('includes the api key in the url when provided', async () => {
    let calledUrl = '';
    __setGoogleBooksFetcherForTests((url) => {
      calledUrl = url;
      return resp({ totalItems: 0 });
    });
    await searchVolumeEdition('Solo Leveling', 1, 'my-api-key');
    expect(calledUrl).toContain('key=my-api-key');
  });

  it('does not include a key param when apiKey is null', async () => {
    let calledUrl = '';
    __setGoogleBooksFetcherForTests((url) => {
      calledUrl = url;
      return resp({ totalItems: 0 });
    });
    await searchVolumeEdition('Solo Leveling', 1, null);
    expect(calledUrl).not.toContain('key=');
  });

  it('extracts ISBN_13 from industryIdentifiers into the edition isbn field', async () => {
    __setGoogleBooksFetcherForTests(() =>
      resp({
        totalItems: 1,
        items: [
          {
            id: 'v3ACAAJ',
            volumeInfo: {
              title: 'Solo Leveling, Vol. 3 (novel)',
              language: 'en',
              industryIdentifiers: [
                { type: 'OTHER', identifier: 'abc' },
                { type: 'ISBN_13', identifier: '9781975319311' },
              ],
            },
            accessInfo: { viewability: 'NO_PAGES' },
          },
        ],
      }),
    );
    const editions = await searchVolumeEdition('Solo Leveling', 3);
    expect(editions[0]!.isbn).toBe('9781975319311');
  });

  it('sets isbn to null when industryIdentifiers is absent', async () => {
    __setGoogleBooksFetcherForTests(() =>
      resp({
        totalItems: 1,
        items: [
          {
            id: 'v2QBAJ',
            volumeInfo: { title: 'Solo Leveling, Vol. 2 (novel)', language: 'en' },
            accessInfo: { viewability: 'PARTIAL' },
          },
        ],
      }),
    );
    const editions = await searchVolumeEdition('Solo Leveling', 2);
    expect(editions[0]!.isbn).toBeNull();
  });
});
