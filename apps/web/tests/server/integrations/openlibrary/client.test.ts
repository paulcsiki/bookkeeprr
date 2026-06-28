import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WorkRecord } from '@/server/integrations/openlibrary/schemas';
import {
  searchBooks,
  trendingBooks,
  getWork,
  getWorkEdition,
  getAuthorName,
  coverUrlByIsbn,
  OpenLibraryError,
  __setOpenLibraryFetcherForTests,
  __resetOpenLibraryForTests,
} from '@/server/integrations/openlibrary/client';

const FIXTURE_DIR = path.resolve(__dirname, '../../../fixtures/openlibrary');

async function loadFixture(name: string): Promise<string> {
  return readFile(path.join(FIXTURE_DIR, name), 'utf-8');
}

beforeEach(() => {
  __resetOpenLibraryForTests();
});
afterEach(() => {
  __resetOpenLibraryForTests();
});

describe('searchBooks', () => {
  it('parses success response into OpenLibrarySearchHit[]', async () => {
    const body = await loadFixture('search-success.json');
    __setOpenLibraryFetcherForTests(async () => ({
      ok: true,
      status: 200,
      text: async () => body,
    }));
    const hits = await searchBooks('hail mary');
    expect(hits).toHaveLength(1);
    const h = hits[0]!;
    expect(h.olid).toBe('OL27448W');
    expect(h.title).toBe('Project Hail Mary');
    expect(h.author).toBe('Andy Weir');
    expect(h.firstPublishYear).toBe(2021);
    expect(h.isbn).toBe('9780593135204');
    expect(h.coverUrl).toMatch(/12345678-L\.jpg$/);
  });

  it('returns [] on empty result', async () => {
    const body = await loadFixture('empty-search.json');
    __setOpenLibraryFetcherForTests(async () => ({
      ok: true,
      status: 200,
      text: async () => body,
    }));
    const hits = await searchBooks('nothing');
    expect(hits).toEqual([]);
  });

  it('returns [] on 404', async () => {
    __setOpenLibraryFetcherForTests(async () => ({
      ok: false,
      status: 404,
      text: async () => '',
    }));
    const hits = await searchBooks('x');
    expect(hits).toEqual([]);
  });

  it('throws OpenLibraryError on 5xx', async () => {
    __setOpenLibraryFetcherForTests(async () => ({
      ok: false,
      status: 503,
      text: async () => '',
    }));
    await expect(searchBooks('x')).rejects.toThrow(/HTTP 503/);
  });

  it('throws OpenLibraryError on malformed JSON', async () => {
    __setOpenLibraryFetcherForTests(async () => ({
      ok: true,
      status: 200,
      text: async () => 'not json',
    }));
    await expect(searchBooks('x')).rejects.toThrow(OpenLibraryError);
  });

  it('caches identical queries for the TTL window', async () => {
    const body = await loadFixture('empty-search.json');
    let calls = 0;
    __setOpenLibraryFetcherForTests(async () => {
      calls++;
      return { ok: true, status: 200, text: async () => body };
    });
    await searchBooks('cacheme');
    await searchBooks('cacheme');
    expect(calls).toBe(1);
  });
});

describe('trendingBooks', () => {
  const trendingBody = JSON.stringify({
    works: [
      {
        key: '/works/OL27448W',
        title: 'Project Hail Mary',
        author_name: ['Andy Weir', 'Someone Else'],
        first_publish_year: 2021,
        cover_i: 12345678,
      },
      {
        key: '/works/OL999W',
        title: 'No Cover Book',
      },
    ],
  });

  it('parses /trending response into OpenLibrarySearchHit[]', async () => {
    let requestedUrl = '';
    __setOpenLibraryFetcherForTests(async (url) => {
      requestedUrl = url;
      return { ok: true, status: 200, text: async () => trendingBody };
    });
    const hits = await trendingBooks('daily', 18);
    expect(requestedUrl).toBe('https://openlibrary.org/trending/daily.json?limit=18');
    expect(hits).toHaveLength(2);
    const first = hits[0]!;
    expect(first.olid).toBe('OL27448W');
    expect(first.title).toBe('Project Hail Mary');
    expect(first.author).toBe('Andy Weir');
    expect(first.firstPublishYear).toBe(2021);
    expect(first.isbn).toBeNull();
    expect(first.coverUrl).toMatch(/12345678-L\.jpg$/);
    const second = hits[1]!;
    expect(second.author).toBeNull();
    expect(second.coverUrl).toBeNull();
    expect(second.firstPublishYear).toBeNull();
  });

  it('defaults to daily period and limit 18', async () => {
    let requestedUrl = '';
    __setOpenLibraryFetcherForTests(async (url) => {
      requestedUrl = url;
      return { ok: true, status: 200, text: async () => JSON.stringify({ works: [] }) };
    });
    await trendingBooks();
    expect(requestedUrl).toBe('https://openlibrary.org/trending/daily.json?limit=18');
  });

  it('returns [] on 404', async () => {
    __setOpenLibraryFetcherForTests(async () => ({ ok: false, status: 404, text: async () => '' }));
    const hits = await trendingBooks();
    expect(hits).toEqual([]);
  });

  it('requests offset+limit items and slices locally by offset', async () => {
    // OL trending has no real offset cursor: the client fetches a larger page
    // (offset+limit) and slices. With offset=1, page-1 work is dropped.
    let requestedUrl = '';
    __setOpenLibraryFetcherForTests(async (url) => {
      requestedUrl = url;
      return { ok: true, status: 200, text: async () => trendingBody };
    });
    const hits = await trendingBooks('daily', 1, 1);
    // limit on the wire is offset+limit = 2
    expect(requestedUrl).toBe('https://openlibrary.org/trending/daily.json?limit=2');
    expect(hits).toHaveLength(1);
    expect(hits[0]!.olid).toBe('OL999W');
  });

  it('returns an empty slice past the available trending data', async () => {
    __setOpenLibraryFetcherForTests(async () => ({
      ok: true,
      status: 200,
      text: async () => trendingBody,
    }));
    // Only 2 works available; offset 5 slices to nothing.
    const hits = await trendingBooks('daily', 18, 5);
    expect(hits).toEqual([]);
  });
});

describe('getWork', () => {
  it('returns the Work record', async () => {
    const body = await loadFixture('work-success.json');
    __setOpenLibraryFetcherForTests(async () => ({
      ok: true,
      status: 200,
      text: async () => body,
    }));
    const work = await getWork('OL27448W');
    expect(work?.title).toBe('Project Hail Mary');
    expect(work?.first_publish_date).toBe('2021-05-04');
    expect(work?.covers).toEqual([12345678]);
  });

  it('returns null on 404', async () => {
    __setOpenLibraryFetcherForTests(async () => ({
      ok: false,
      status: 404,
      text: async () => '',
    }));
    const work = await getWork('OL99999W');
    expect(work).toBeNull();
  });
});

describe('getWorkEdition', () => {
  function body(
    entries: Array<{ isbn_13?: string[]; isbn_10?: string[]; number_of_pages?: number }>,
  ): string {
    return JSON.stringify({ entries });
  }

  it('returns the first ISBN-13 across editions, with its page count', async () => {
    __setOpenLibraryFetcherForTests(async () => ({
      ok: true,
      status: 200,
      text: async () =>
        body([{ isbn_10: ['0593135202'] }, { isbn_13: ['9780593135204'], number_of_pages: 320 }]),
    }));
    const ed = await getWorkEdition('OL27448W');
    expect(ed).toEqual({ isbn: '9780593135204', pages: 320 });
  });

  it('falls back to ISBN-10 when no edition has an ISBN-13', async () => {
    __setOpenLibraryFetcherForTests(async () => ({
      ok: true,
      status: 200,
      text: async () => body([{}, { isbn_10: ['0593135202'], number_of_pages: 256 }]),
    }));
    const ed = await getWorkEdition('OL27448W');
    expect(ed).toEqual({ isbn: '0593135202', pages: 256 });
  });

  it('uses page count from a later edition when the chosen ISBN edition lacks it', async () => {
    // Realistic order: the first ISBN edition (a KDP edition) has no page count;
    // a later edition does. The scan must not stop at the first ISBN edition.
    __setOpenLibraryFetcherForTests(async () => ({
      ok: true,
      status: 200,
      text: async () =>
        body([{ isbn_13: ['9798998881152'] }, { isbn_13: ['9786077476719'], number_of_pages: 328 }]),
    }));
    const ed = await getWorkEdition('OL27448W');
    expect(ed).toEqual({ isbn: '9798998881152', pages: 328 });
  });

  it('returns null isbn/pages when no edition carries them', async () => {
    __setOpenLibraryFetcherForTests(async () => ({
      ok: true,
      status: 200,
      text: async () => body([{}, {}]),
    }));
    const ed = await getWorkEdition('OL27448W');
    expect(ed).toEqual({ isbn: null, pages: null });
  });

  it('returns null isbn/pages on 404', async () => {
    __setOpenLibraryFetcherForTests(async () => ({
      ok: false,
      status: 404,
      text: async () => '',
    }));
    const ed = await getWorkEdition('OL99999W');
    expect(ed).toEqual({ isbn: null, pages: null });
  });
});

describe('getAuthorName', () => {
  it('returns the author name', async () => {
    const body = await loadFixture('author-success.json');
    __setOpenLibraryFetcherForTests(async () => ({
      ok: true,
      status: 200,
      text: async () => body,
    }));
    const name = await getAuthorName('/authors/OL34184A');
    expect(name).toBe('Andy Weir');
  });

  it('returns null on 404', async () => {
    __setOpenLibraryFetcherForTests(async () => ({
      ok: false,
      status: 404,
      text: async () => '',
    }));
    const name = await getAuthorName('/authors/missing');
    expect(name).toBeNull();
  });
});

describe('coverUrlByIsbn', () => {
  it('returns the plain cover url (no query) on a 200 response', async () => {
    __setOpenLibraryFetcherForTests(async (url) => {
      expect(url).toContain('default=false');
      expect(url).toContain('9781975319311');
      return { ok: true, status: 200, text: async () => '' };
    });
    const url = await coverUrlByIsbn('9781975319311');
    expect(url).toBe('https://covers.openlibrary.org/b/isbn/9781975319311-L.jpg');
    expect(url).not.toContain('default=false');
  });

  it('returns null on 404 (no cover available)', async () => {
    __setOpenLibraryFetcherForTests(async () => ({
      ok: false,
      status: 404,
      text: async () => '',
    }));
    const url = await coverUrlByIsbn('9781975319311');
    expect(url).toBeNull();
  });

  it('returns null when the fetcher throws', async () => {
    __setOpenLibraryFetcherForTests(async () => {
      throw new Error('network error');
    });
    const url = await coverUrlByIsbn('9781975319311');
    expect(url).toBeNull();
  });

  it('strips non-isbn characters before probing', async () => {
    let probedUrl = '';
    __setOpenLibraryFetcherForTests(async (url) => {
      probedUrl = url;
      return { ok: true, status: 200, text: async () => '' };
    });
    await coverUrlByIsbn(' 978-1975319311 ');
    // Normalized ISBN must appear without hyphens or spaces in the URL path
    expect(probedUrl).toContain('/9781975319311-L.jpg');
    expect(probedUrl).not.toContain(' ');
  });
});

describe('searchBooks timeout', () => {
  it('rejects with OpenLibraryError when the fetch stalls past SEARCH_TIMEOUT_MS', async () => {
    vi.useFakeTimers();
    try {
      // Fetcher that hangs indefinitely but respects the abort signal.
      __setOpenLibraryFetcherForTests(
        (_url, opts) =>
          new Promise<never>((_resolve, reject) => {
            opts?.signal?.addEventListener('abort', () =>
              reject(new DOMException('The operation was aborted.', 'AbortError')),
            );
          }),
      );

      const promise = searchBooks('hang');
      // Advance past the 5 s timeout in parallel with awaiting the rejection so
      // the promise never becomes an unhandled rejection.
      await Promise.all([
        expect(promise).rejects.toThrow(OpenLibraryError),
        vi.advanceTimersByTimeAsync(5_001),
      ]);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('WorkRecord schema', () => {
  it('parses alternate_titles', () => {
    const parsed = WorkRecord.parse({
      key: '/works/OL28988W',
      title: 'Northern Lights',
      alternate_titles: ['The Golden Compass'],
    });
    expect(parsed.alternate_titles).toEqual(['The Golden Compass']);
  });

  it('accepts a WorkRecord without alternate_titles', () => {
    const parsed = WorkRecord.parse({ key: '/works/OL27448W', title: 'Project Hail Mary' });
    expect(parsed.alternate_titles).toBeUndefined();
  });
});
