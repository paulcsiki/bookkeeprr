import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type * as FlaresolverrSettingMod from '@/server/db/settings/flaresolverr';
import type * as FlaresolverrClientMod from '@/server/integrations/flaresolverr/client';

// Default: FlareSolverr unconfigured, so nuFetch uses the direct-fetch path.
// Individual tests can re-mock flaresolverrSetting.get to exercise routing.
const { flaresolverrGet, solveGetMock } = vi.hoisted(() => ({
  flaresolverrGet: vi.fn(async () => ({ url: '' })),
  solveGetMock: vi.fn(),
}));
vi.mock('@/server/db/settings/flaresolverr', async (importOriginal) => {
  const actual = await importOriginal<typeof FlaresolverrSettingMod>();
  return { ...actual, flaresolverrSetting: { ...actual.flaresolverrSetting, get: flaresolverrGet } };
});

vi.mock('@/server/integrations/flaresolverr/client', async (importOriginal) => {
  const actual = await importOriginal<typeof FlaresolverrClientMod>();
  return { ...actual, solveGet: solveGetMock };
});

import {
  searchNovelUpdates,
  getSeriesBySlug,
  fetchChapterFeed,
  NovelUpdatesError,
  __resetBucketForTests,
} from '@/server/integrations/novelupdates/client';

const FIXTURE_DIR = join(__dirname, '../../../../src/server/integrations/novelupdates/fixtures');

function loadFixture(name: string): string {
  return readFileSync(join(FIXTURE_DIR, name), 'utf-8');
}

function mockFetchOk(body: string): void {
  global.fetch = vi.fn(
    async () => new Response(body, { status: 200, headers: { 'content-type': 'text/html' } }),
  ) as unknown as typeof fetch;
}

function mockFetchStatus(status: number): void {
  global.fetch = vi.fn(async () => new Response('', { status })) as unknown as typeof fetch;
}

const ORIGINAL_FETCH = global.fetch;

beforeEach(() => {
  __resetBucketForTests();
  flaresolverrGet.mockResolvedValue({ url: '' });
  solveGetMock.mockReset();
});
afterEach(() => {
  global.fetch = ORIGINAL_FETCH;
  vi.restoreAllMocks();
});

describe('searchNovelUpdates', () => {
  it('returns hits from search-success fixture', async () => {
    mockFetchOk(loadFixture('search-success.html'));
    const hits = await searchNovelUpdates('solo leveling');
    expect(hits.length).toBe(2);
    expect(hits[0]!.slug).toBe('solo-leveling');
  });

  it('fetches the series-finder endpoint', async () => {
    const fetchSpy: ReturnType<typeof vi.fn> = vi.fn(
      async (..._args: unknown[]) =>
        new Response(loadFixture('search-success.html'), {
          status: 200,
          headers: { 'content-type': 'text/html' },
        }),
    );
    global.fetch = fetchSpy as unknown as typeof fetch;
    await searchNovelUpdates('solo leveling');
    expect(fetchSpy).toHaveBeenCalledOnce();
    const calledUrl = fetchSpy.mock.calls[0]![0] as string;
    expect(calledUrl).toBe(
      'https://www.novelupdates.com/series-finder/?sf=1&sh=solo%20leveling',
    );
  });

  it('returns [] for empty query', async () => {
    const hits = await searchNovelUpdates('  ');
    expect(hits).toEqual([]);
  });

  it('throws NovelUpdatesError on 429', async () => {
    mockFetchStatus(429);
    try {
      await searchNovelUpdates('x');
      expect.fail('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(NovelUpdatesError);
      expect((err as NovelUpdatesError).code).toBe('rate-limited');
    }
  });

  it('throws NovelUpdatesError on 503 (other HTTP)', async () => {
    mockFetchStatus(503);
    try {
      await searchNovelUpdates('x');
      expect.fail('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(NovelUpdatesError);
      expect((err as NovelUpdatesError).code).toBe('http');
      expect((err as NovelUpdatesError).status).toBe(503);
    }
  });
});

describe('getSeriesBySlug', () => {
  it('returns parsed metadata', async () => {
    mockFetchOk(loadFixture('series-detail.html'));
    const detail = await getSeriesBySlug('mushoku-tensei');
    expect(detail.title).toBe('Mushoku Tensei');
    expect(detail.numericId).toBe(2000);
    expect(detail.totalVolumes).toBe(26);
  });

  it('throws not-found on 404', async () => {
    mockFetchStatus(404);
    try {
      await getSeriesBySlug('does-not-exist');
      expect.fail('should have thrown');
    } catch (err) {
      expect((err as NovelUpdatesError).code).toBe('not-found');
    }
  });
});

describe('fetchChapterFeed', () => {
  it('returns parsed chapter entries from RSS fixture', async () => {
    mockFetchOk(loadFixture('rss-feed.xml'));
    const entries = await fetchChapterFeed(2000);
    expect(entries.length).toBe(3);
    expect(entries[0]!.title).toBe('Mushoku Tensei v26 c264');
  });

  it('throws not-found on 404', async () => {
    mockFetchStatus(404);
    try {
      await fetchChapterFeed(999999);
      expect.fail('should have thrown');
    } catch (err) {
      expect((err as NovelUpdatesError).code).toBe('not-found');
    }
  });
});

describe('nuFetch FlareSolverr routing', () => {
  it('uses FlareSolverr (not direct fetch) when configured', async () => {
    flaresolverrGet.mockResolvedValue({ url: 'http://flaresolverr:8191' });
    solveGetMock.mockResolvedValue({
      html: loadFixture('search-success.html'),
      userAgent: 'CF-UA',
    });
    const directFetch = vi.fn();
    global.fetch = directFetch as unknown as typeof fetch;

    const hits = await searchNovelUpdates('solo leveling');
    expect(hits.length).toBe(2);
    expect(solveGetMock).toHaveBeenCalledOnce();
    expect(solveGetMock.mock.calls[0]![0]).toBe('http://flaresolverr:8191');
    // Direct fetch must NOT be used when FlareSolverr is configured.
    expect(directFetch).not.toHaveBeenCalled();
  });

  it('uses direct fetch when FlareSolverr is unconfigured', async () => {
    flaresolverrGet.mockResolvedValue({ url: '' });
    mockFetchOk(loadFixture('search-success.html'));
    const hits = await searchNovelUpdates('solo leveling');
    expect(hits.length).toBe(2);
    expect(solveGetMock).not.toHaveBeenCalled();
  });

  it('maps a FlaresolverrError to a blocked NovelUpdatesError', async () => {
    flaresolverrGet.mockResolvedValue({ url: 'http://flaresolverr:8191' });
    const { FlaresolverrError } = await import('@/server/integrations/flaresolverr/client');
    solveGetMock.mockRejectedValue(new FlaresolverrError('boom'));
    await expect(searchNovelUpdates('x')).rejects.toMatchObject({
      name: 'NovelUpdatesError',
      code: 'blocked',
    });
  });

  it('maps a still-challenged solved page to a blocked error', async () => {
    flaresolverrGet.mockResolvedValue({ url: 'http://flaresolverr:8191' });
    solveGetMock.mockResolvedValue({
      html: '<html><title>Just a moment...</title></html>',
      userAgent: null,
    });
    await expect(searchNovelUpdates('x')).rejects.toMatchObject({
      name: 'NovelUpdatesError',
      code: 'blocked',
    });
  });

  it('does NOT treat a solved page as challenged just for the cf challenge-platform script', async () => {
    // Cloudflare injects its /cdn-cgi/challenge-platform/ script into every
    // page it fronts — including successfully solved content pages — so that
    // marker must not be read as "still challenged" (regression).
    flaresolverrGet.mockResolvedValue({ url: 'http://flaresolverr:8191' });
    const solved = loadFixture('search-success.html').replace(
      '</body>',
      '<script src="/cdn-cgi/challenge-platform/h/g/scripts/jsd/main.js"></script></body>',
    );
    solveGetMock.mockResolvedValue({ html: solved, userAgent: 'CF-UA' });
    const hits = await searchNovelUpdates('solo leveling');
    expect(hits.length).toBe(2);
  });
});
