/**
 * TDD RED tests — A. lookupByIsbn must accept and pass an optional API key.
 * These tests verify the URL includes `&key=` when an apiKey is supplied,
 * and that the function still works keylessly when no key is provided.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  lookupByIsbn,
  __setGoogleBooksFetcherForTests,
  __resetGoogleBooksForTests,
} from '@/server/integrations/googlebooks/client';

const EMPTY_BODY = JSON.stringify({ totalItems: 0 });
const HIT_BODY = JSON.stringify({
  totalItems: 1,
  items: [
    {
      id: 'abc123',
      volumeInfo: {
        description: 'A story.',
        pageCount: 300,
        imageLinks: { thumbnail: 'http://books.google.com/cover.jpg' },
      },
    },
  ],
});

beforeEach(() => {
  __resetGoogleBooksForTests();
});
afterEach(() => {
  __resetGoogleBooksForTests();
});

describe('lookupByIsbn with API key', () => {
  it('appends &key= to the request URL when an apiKey is provided', async () => {
    let capturedUrl = '';
    __setGoogleBooksFetcherForTests(async (url) => {
      capturedUrl = url;
      return { ok: true, status: 200, text: async () => HIT_BODY };
    });

    await lookupByIsbn('9781741769586', 'MY_API_KEY');

    expect(capturedUrl).toContain('&key=MY_API_KEY');
    // The isbn is passed into encodeURIComponent as the value of q=, not as a
    // standalone path segment; the resulting URL uses q=isbn:9781741769586.
    expect(capturedUrl).toContain('isbn:9781741769586');
  });

  it('does NOT append &key= when apiKey is null', async () => {
    let capturedUrl = '';
    __setGoogleBooksFetcherForTests(async (url) => {
      capturedUrl = url;
      return { ok: true, status: 200, text: async () => EMPTY_BODY };
    });

    await lookupByIsbn('9781741769586', null);

    expect(capturedUrl).not.toContain('key=');
  });

  it('does NOT append &key= when no apiKey argument supplied (backward compat)', async () => {
    let capturedUrl = '';
    __setGoogleBooksFetcherForTests(async (url) => {
      capturedUrl = url;
      return { ok: true, status: 200, text: async () => EMPTY_BODY };
    });

    await lookupByIsbn('9781741769586');

    expect(capturedUrl).not.toContain('key=');
  });

  it('still returns lookup result with apiKey provided', async () => {
    __setGoogleBooksFetcherForTests(async () => ({
      ok: true,
      status: 200,
      text: async () => HIT_BODY,
    }));

    const result = await lookupByIsbn('9781741769586', 'MY_API_KEY');
    expect(result).not.toBeNull();
    expect(result!.description).toBe('A story.');
    expect(result!.pageCount).toBe(300);
  });
});
