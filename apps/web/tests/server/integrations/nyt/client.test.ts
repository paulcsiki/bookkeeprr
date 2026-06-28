import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { seedDb, type SeedHandle } from '../../../integration/helpers/seed';
import { nytApiKeySetting } from '@/server/db/settings/nyt';
import {
  getAudioBestsellers,
  NytError,
  __setNytFetcherForTests,
  __resetNytForTests,
} from '@/server/integrations/nyt/client';

let h: SeedHandle;

beforeEach(async () => {
  h = await seedDb({ skipDefaultSeries: true });
  __resetNytForTests();
});

afterEach(() => {
  __resetNytForTests();
  h.cleanup();
});

function book(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    rank: 1,
    title: 'The Silent Hour',
    author: 'Jane Doe',
    description: 'A thriller.',
    book_image: 'https://nyt/img.jpg',
    primary_isbn13: '9781234567890',
    ...overrides,
  };
}

function listBody(...books: unknown[]): string {
  return JSON.stringify({ status: 'OK', results: { books } });
}

describe('getAudioBestsellers', () => {
  it('fetches both lists, merges, dedupes by title, and maps fields', async () => {
    await nytApiKeySetting.set('test-key');
    __setNytFetcherForTests(async (url) => {
      const body = url.includes('audio-fiction')
        ? listBody(book({ rank: 1, title: 'Shared Title' }), book({ rank: 2, title: 'Fiction Only' }))
        : listBody(
            book({ rank: 1, title: 'shared title', author: 'Other Author' }),
            book({ rank: 2, title: 'Nonfiction Only', author: 'Nonfic Author' }),
          );
      return { ok: true, status: 200, text: async () => body };
    });

    const hits = await getAudioBestsellers();
    // 'Shared Title' / 'shared title' collapse case-insensitively (fiction wins).
    expect(hits.map((h) => h.title)).toEqual(['Shared Title', 'Fiction Only', 'Nonfiction Only']);
    const shared = hits[0]!;
    expect(shared.author).toBe('Jane Doe');
    expect(shared.coverUrl).toBe('https://nyt/img.jpg');
    expect(shared.isbn).toBe('9781234567890');
    expect(shared.description).toBe('A thriller.');
    expect(shared.rank).toBe(1);
  });

  it('hits the audio-fiction and audio-nonfiction endpoints with the api-key', async () => {
    await nytApiKeySetting.set('my-secret-key');
    const urls: string[] = [];
    __setNytFetcherForTests(async (url) => {
      urls.push(url);
      return { ok: true, status: 200, text: async () => listBody() };
    });

    await getAudioBestsellers();
    expect(urls.some((u) => u.includes('/lists/current/audio-fiction.json'))).toBe(true);
    expect(urls.some((u) => u.includes('/lists/current/audio-nonfiction.json'))).toBe(true);
    expect(urls.every((u) => u.includes('api-key=my-secret-key'))).toBe(true);
  });

  it('maps blank/absent optional fields to null', async () => {
    await nytApiKeySetting.set('k');
    __setNytFetcherForTests(async () =>
      ({
        ok: true,
        status: 200,
        text: async () =>
          listBody({ title: 'Bare', author: '', book_image: '   ', primary_isbn13: null }),
      }),
    );

    const hits = await getAudioBestsellers();
    const bare = hits.find((x) => x.title === 'Bare')!;
    expect(bare.author).toBeNull();
    expect(bare.coverUrl).toBeNull();
    expect(bare.isbn).toBeNull();
    expect(bare.description).toBeNull();
    expect(bare.rank).toBeNull();
  });

  it('still returns the other list when one list fails', async () => {
    await nytApiKeySetting.set('k');
    __setNytFetcherForTests(async (url) => {
      if (url.includes('audio-fiction')) {
        return { ok: false, status: 503, text: async () => '' };
      }
      return { ok: true, status: 200, text: async () => listBody(book({ title: 'Survivor' })) };
    });

    const hits = await getAudioBestsellers();
    expect(hits.map((h) => h.title)).toEqual(['Survivor']);
  });

  it('throws NytError when both lists fail', async () => {
    await nytApiKeySetting.set('k');
    __setNytFetcherForTests(async () => ({ ok: false, status: 503, text: async () => '' }));
    await expect(getAudioBestsellers()).rejects.toThrow(NytError);
  });

  it('throws NytError when the api key is empty (no fetch attempted)', async () => {
    let called = false;
    __setNytFetcherForTests(async () => {
      called = true;
      return { ok: true, status: 200, text: async () => listBody() };
    });
    await expect(getAudioBestsellers()).rejects.toThrow(/API key is not configured/);
    expect(called).toBe(false);
  });

  it('throws NytError on malformed JSON from both lists', async () => {
    await nytApiKeySetting.set('k');
    __setNytFetcherForTests(async () => ({ ok: true, status: 200, text: async () => 'nope' }));
    await expect(getAudioBestsellers()).rejects.toThrow(NytError);
  });
});
