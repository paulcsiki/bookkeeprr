import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  lookupByIsbn,
  searchVolumes,
  GoogleBooksError,
  __setGoogleBooksFetcherForTests,
  __resetGoogleBooksForTests,
} from '@/server/integrations/googlebooks/client';

const FIXTURE_DIR = path.resolve(__dirname, '../../../fixtures/googlebooks');

async function loadFixture(name: string): Promise<string> {
  return readFile(path.join(FIXTURE_DIR, name), 'utf-8');
}

beforeEach(() => {
  __resetGoogleBooksForTests();
});
afterEach(() => {
  __resetGoogleBooksForTests();
});

describe('lookupByIsbn', () => {
  it('parses success response into GoogleBooksLookup', async () => {
    const body = await loadFixture('lookup-by-isbn-success.json');
    __setGoogleBooksFetcherForTests(async () => ({
      ok: true,
      status: 200,
      text: async () => body,
    }));
    const lookup = await lookupByIsbn('9780593135204');
    expect(lookup).not.toBeNull();
    expect(lookup!.description).toContain('lone astronaut');
    expect(lookup!.pageCount).toBe(496);
    expect(lookup!.coverUrl).toMatch(/^https:\/\/books\.google\.com/);
    expect(lookup!.coverUrl).not.toMatch(/^http:\/\//);
  });

  it('returns null on empty result', async () => {
    const body = await loadFixture('empty.json');
    __setGoogleBooksFetcherForTests(async () => ({
      ok: true,
      status: 200,
      text: async () => body,
    }));
    const lookup = await lookupByIsbn('0000000000000');
    expect(lookup).toBeNull();
  });

  it('returns null on 404', async () => {
    __setGoogleBooksFetcherForTests(async () => ({
      ok: false,
      status: 404,
      text: async () => '',
    }));
    const lookup = await lookupByIsbn('x');
    expect(lookup).toBeNull();
  });

  it('throws GoogleBooksError on 5xx', async () => {
    __setGoogleBooksFetcherForTests(async () => ({
      ok: false,
      status: 503,
      text: async () => '',
    }));
    await expect(lookupByIsbn('x')).rejects.toThrow(/HTTP 503/);
  });

  it('throws GoogleBooksError on malformed JSON', async () => {
    __setGoogleBooksFetcherForTests(async () => ({
      ok: true,
      status: 200,
      text: async () => 'not json',
    }));
    await expect(lookupByIsbn('x')).rejects.toThrow(GoogleBooksError);
  });
});

describe('searchVolumes timeout', () => {
  it('rejects with GoogleBooksError when the fetch stalls past SEARCH_TIMEOUT_MS', async () => {
    vi.useFakeTimers();
    try {
      // Fetcher that hangs indefinitely but respects the abort signal.
      __setGoogleBooksFetcherForTests(
        (_url, opts) =>
          new Promise<never>((_resolve, reject) => {
            opts?.signal?.addEventListener('abort', () =>
              reject(new DOMException('The operation was aborted.', 'AbortError')),
            );
          }),
      );

      const promise = searchVolumes('hang');
      // Advance past the 5 s timeout in parallel with awaiting the rejection so
      // the promise never becomes an unhandled rejection.
      await Promise.all([
        expect(promise).rejects.toThrow(GoogleBooksError),
        vi.advanceTimersByTimeAsync(5_001),
      ]);
    } finally {
      vi.useRealTimers();
    }
  });
});
