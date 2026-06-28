/**
 * TDD RED tests — C. getEditionByIsbn + D. getOLSeries (new OL client functions)
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  getEditionByIsbn,
  getOLSeries,
  __setOpenLibraryFetcherForTests,
  __resetOpenLibraryForTests,
} from '@/server/integrations/openlibrary/client';

beforeEach(() => {
  __resetOpenLibraryForTests();
});
afterEach(() => {
  __resetOpenLibraryForTests();
});

// ---------------------------------------------------------------------------
// getEditionByIsbn
// ---------------------------------------------------------------------------

describe('getEditionByIsbn', () => {
  it('fetches /isbn/<isbn>.json and returns edition data', async () => {
    let capturedUrl = '';
    const body = JSON.stringify({
      key: '/books/OL12345M',
      title: 'Sabriel',
      publish_date: 'November 1, 1995',
      works: [{ key: '/works/OL326781W' }],
    });
    __setOpenLibraryFetcherForTests(async (url) => {
      capturedUrl = url;
      return { ok: true, status: 200, text: async () => body };
    });

    const ed = await getEditionByIsbn('9781741769586');
    expect(capturedUrl).toBe('https://openlibrary.org/isbn/9781741769586.json');
    expect(ed).not.toBeNull();
    expect(ed!.publishDate).toBe('November 1, 1995');
    expect(ed!.workKey).toBe('/works/OL326781W');
  });

  it('retries through a transient 503 (archive.org overload) and succeeds', async () => {
    let calls = 0;
    const body = JSON.stringify({ key: '/books/OL1M', works: [{ key: '/works/OL2628761W' }] });
    __setOpenLibraryFetcherForTests(async () => {
      calls++;
      // First attempt 503s (archive.org throttling); the retry succeeds.
      if (calls === 1) return { ok: false, status: 503, text: async () => 'overloaded' };
      return { ok: true, status: 200, text: async () => body };
    });

    const ed = await getEditionByIsbn('9781741769586');
    expect(calls).toBe(2);
    expect(ed?.workKey).toBe('/works/OL2628761W');
  });

  it('returns null on 404', async () => {
    __setOpenLibraryFetcherForTests(async () => ({
      ok: false,
      status: 404,
      text: async () => '',
    }));
    const ed = await getEditionByIsbn('0000000000000');
    expect(ed).toBeNull();
  });

  it('returns null when works array is missing', async () => {
    __setOpenLibraryFetcherForTests(async () => ({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ key: '/books/OL1M', title: 'Orphan', publish_date: '2000' }),
    }));
    const ed = await getEditionByIsbn('9780000000001');
    expect(ed).not.toBeNull();
    expect(ed!.workKey).toBeNull();
  });

  it('throws OpenLibraryError on 5xx', async () => {
    __setOpenLibraryFetcherForTests(async () => ({
      ok: false,
      status: 503,
      text: async () => '',
    }));
    const { OpenLibraryError } = await import('@/server/integrations/openlibrary/client');
    await expect(getEditionByIsbn('9781741769586')).rejects.toThrow(OpenLibraryError);
  });
});

// ---------------------------------------------------------------------------
// getOLSeries
// ---------------------------------------------------------------------------

describe('getOLSeries', () => {
  it('fetches series by key path and returns name from the real (key-less) OL document', async () => {
    let capturedUrl = '';
    // Shape mirrors the LIVE /series/OL326781L.json: it carries NO top-level
    // `key` — only name/type/description/links/seed_count/meta. The schema must
    // accept this or collection detection silently fails (regression guard).
    const body = JSON.stringify({
      name: 'The Old Kingdom',
      type: { key: '/type/series' },
      description: 'Garth Nix fantasy series.',
      links: [],
      seed_count: 3,
      meta: {},
    });
    __setOpenLibraryFetcherForTests(async (url) => {
      capturedUrl = url;
      return { ok: true, status: 200, text: async () => body };
    });

    const s = await getOLSeries('/series/OL326781L');
    expect(capturedUrl).toBe('https://openlibrary.org/series/OL326781L.json');
    expect(s).not.toBeNull();
    expect(s!.name).toBe('The Old Kingdom');
  });

  it('falls back to title field when name is absent', async () => {
    __setOpenLibraryFetcherForTests(async () => ({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ key: '/series/OL999L', title: 'The Old Kingdom' }),
    }));
    const s = await getOLSeries('/series/OL999L');
    expect(s!.name).toBe('The Old Kingdom');
  });

  it('returns null on 404', async () => {
    __setOpenLibraryFetcherForTests(async () => ({
      ok: false,
      status: 404,
      text: async () => '',
    }));
    const s = await getOLSeries('/series/MISSING');
    expect(s).toBeNull();
  });

  it('returns null when both name and title are missing', async () => {
    __setOpenLibraryFetcherForTests(async () => ({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ key: '/series/OL1L' }),
    }));
    const s = await getOLSeries('/series/OL1L');
    expect(s).toBeNull();
  });

  it('swallows fetch errors and returns null (best-effort)', async () => {
    __setOpenLibraryFetcherForTests(async () => {
      throw new Error('network down');
    });
    // Should not throw — best-effort contract
    await expect(getOLSeries('/series/OL1L')).resolves.toBeNull();
  });
});
