import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  getRecentAudiobooks,
  getAudiobookById,
  LibriVoxError,
  __setLibriVoxFetcherForTests,
  __resetLibriVoxForTests,
} from '@/server/integrations/librivox/client';

beforeEach(() => {
  __resetLibriVoxForTests();
});
afterEach(() => {
  __resetLibriVoxForTests();
});

function feedBody(...books: unknown[]): string {
  return JSON.stringify({ books });
}

describe('getRecentAudiobooks', () => {
  it('parses the feed into LibriVoxHit[] and joins the first author name', async () => {
    let requestedUrl = '';
    __setLibriVoxFetcherForTests(async (url) => {
      requestedUrl = url;
      return {
        ok: true,
        status: 200,
        text: async () =>
          feedBody(
            {
              id: '1234',
              title: 'Pride and Prejudice',
              description: 'A classic.',
              authors: [{ first_name: 'Jane', last_name: 'Austen' }],
              url_librivox: 'https://librivox.org/x',
            },
            {
              id: 5678,
              title: 'No Author Book',
              authors: [],
            },
          ),
      };
    });

    const hits = await getRecentAudiobooks(18);
    expect(requestedUrl).toBe(
      'https://librivox.org/api/feed/audiobooks/?format=json&limit=18&offset=0',
    );
    expect(hits).toHaveLength(2);
    const first = hits[0]!;
    expect(first.librivoxId).toBe('1234');
    expect(first.title).toBe('Pride and Prejudice');
    expect(first.author).toBe('Jane Austen');
    expect(first.coverUrl).toBeNull();
    expect(first.description).toBe('A classic.');
    // numeric id coerced to string, empty authors → null author
    expect(hits[1]!.librivoxId).toBe('5678');
    expect(hits[1]!.author).toBeNull();
  });

  it('derives the archive.org cover URL from url_zip_file', async () => {
    __setLibriVoxFetcherForTests(async () => ({
      ok: true,
      status: 200,
      text: async () =>
        feedBody({
          id: '711',
          title: 'The Count of Monte Cristo',
          authors: [{ first_name: 'Alexandre', last_name: 'Dumas' }],
          url_zip_file:
            'https://archive.org/compress/count_monte_cristo_0711_librivox/formats=64KBPS MP3&file=/count_monte_cristo_0711_librivox.zip',
        }),
    }));
    const hits = await getRecentAudiobooks();
    expect(hits[0]!.coverUrl).toBe(
      'https://archive.org/services/img/count_monte_cristo_0711_librivox',
    );
  });

  it('yields a null cover when url_zip_file is missing or unparseable', async () => {
    __setLibriVoxFetcherForTests(async () => ({
      ok: true,
      status: 200,
      text: async () =>
        feedBody(
          { id: '1', title: 'No Zip Field' },
          { id: '2', title: 'Garbage Zip', url_zip_file: 'https://example.com/not-a-compress-url' },
        ),
    }));
    const hits = await getRecentAudiobooks();
    expect(hits[0]!.coverUrl).toBeNull();
    expect(hits[1]!.coverUrl).toBeNull();
  });

  it('joins only the present name part when one is blank', async () => {
    __setLibriVoxFetcherForTests(async () => ({
      ok: true,
      status: 200,
      text: async () =>
        feedBody({
          id: '9',
          title: 'Single Name',
          authors: [{ first_name: 'Homer', last_name: '' }],
        }),
    }));
    const hits = await getRecentAudiobooks();
    expect(hits[0]!.author).toBe('Homer');
  });

  it('defaults to limit 18 and offset 0', async () => {
    let requestedUrl = '';
    __setLibriVoxFetcherForTests(async (url) => {
      requestedUrl = url;
      return { ok: true, status: 200, text: async () => feedBody() };
    });
    await getRecentAudiobooks();
    expect(requestedUrl).toBe(
      'https://librivox.org/api/feed/audiobooks/?format=json&limit=18&offset=0',
    );
  });

  it('passes the offset for pagination', async () => {
    let requestedUrl = '';
    __setLibriVoxFetcherForTests(async (url) => {
      requestedUrl = url;
      return { ok: true, status: 200, text: async () => feedBody() };
    });
    await getRecentAudiobooks(18, 36);
    expect(requestedUrl).toBe(
      'https://librivox.org/api/feed/audiobooks/?format=json&limit=18&offset=36',
    );
  });

  it('returns [] on 404', async () => {
    __setLibriVoxFetcherForTests(async () => ({ ok: false, status: 404, text: async () => '' }));
    expect(await getRecentAudiobooks()).toEqual([]);
  });

  it('throws LibriVoxError on 5xx', async () => {
    __setLibriVoxFetcherForTests(async () => ({ ok: false, status: 503, text: async () => '' }));
    await expect(getRecentAudiobooks()).rejects.toThrow(/HTTP 503/);
  });

  it('throws LibriVoxError on malformed JSON', async () => {
    __setLibriVoxFetcherForTests(async () => ({ ok: true, status: 200, text: async () => 'nope' }));
    await expect(getRecentAudiobooks()).rejects.toThrow(LibriVoxError);
  });

  it('caches identical requests for the TTL window', async () => {
    let calls = 0;
    __setLibriVoxFetcherForTests(async () => {
      calls++;
      return { ok: true, status: 200, text: async () => feedBody() };
    });
    await getRecentAudiobooks(5);
    await getRecentAudiobooks(5);
    expect(calls).toBe(1);
  });
});

describe('getAudiobookById', () => {
  it('requests the ?id= feed and maps the first book, including description', async () => {
    let requestedUrl = '';
    __setLibriVoxFetcherForTests(async (url) => {
      requestedUrl = url;
      return {
        ok: true,
        status: 200,
        text: async () =>
          feedBody({
            id: '711',
            title: 'The Count of Monte Cristo',
            description: 'A tale of revenge.',
            authors: [{ first_name: 'Alexandre', last_name: 'Dumas' }],
          }),
      };
    });

    const hit = await getAudiobookById('711');
    expect(requestedUrl).toBe('https://librivox.org/api/feed/audiobooks/?id=711&format=json');
    expect(hit).not.toBeNull();
    expect(hit!.librivoxId).toBe('711');
    expect(hit!.title).toBe('The Count of Monte Cristo');
    expect(hit!.description).toBe('A tale of revenge.');
    expect(hit!.author).toBe('Alexandre Dumas');
  });

  it('returns null when the feed has no books', async () => {
    __setLibriVoxFetcherForTests(async () => ({
      ok: true,
      status: 200,
      text: async () => feedBody(),
    }));
    expect(await getAudiobookById('999')).toBeNull();
  });

  it('returns null on 404', async () => {
    __setLibriVoxFetcherForTests(async () => ({ ok: false, status: 404, text: async () => '' }));
    expect(await getAudiobookById('404')).toBeNull();
  });

  it('throws LibriVoxError on 5xx', async () => {
    __setLibriVoxFetcherForTests(async () => ({ ok: false, status: 503, text: async () => '' }));
    await expect(getAudiobookById('1')).rejects.toThrow(/HTTP 503/);
  });
});
