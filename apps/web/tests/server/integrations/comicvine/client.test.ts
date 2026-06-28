import { beforeEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  __resetComicVineForTests,
  __setComicVineFetcherForTests,
  searchVolumes,
  recentVolumes,
  listIssues,
  testApiKey,
  ComicVineError,
} from '@/server/integrations/comicvine/client';

const F = (name: string) =>
  readFileSync(join(process.cwd(), 'tests/fixtures/comicvine', name), 'utf-8');

let urls: string[];

beforeEach(() => {
  __resetComicVineForTests();
  urls = [];
});

describe('searchVolumes', () => {
  it('parses a typical response', async () => {
    __setComicVineFetcherForTests(async (url) => {
      urls.push(url);
      return { ok: true, status: 200, headers: {}, text: async () => F('search-watchmen.json') };
    });
    const hits = await searchVolumes('KEY', 'Watchmen');
    expect(hits).toHaveLength(2);
    expect(hits[0]).toMatchObject({
      comicvineId: 18847,
      name: 'Watchmen',
      publisher: 'DC Comics',
      startYear: 1986,
      issueCount: 12,
      coverUrl: 'https://example.com/watchmen-cover.jpg',
    });
    expect(hits[1]).toMatchObject({
      comicvineId: 99999,
      name: 'Watchmen (Reprint)',
      publisher: null,
      startYear: null,
      issueCount: null,
      coverUrl: null,
    });
  });

  it('returns [] on empty results', async () => {
    __setComicVineFetcherForTests(async () => ({
      ok: true,
      status: 200,
      headers: {},
      text: async () => F('no-match.json'),
    }));
    expect(await searchVolumes('KEY', 'xxxx')).toEqual([]);
  });

  it('throws ComicVineError on invalid key (status_code 100)', async () => {
    __setComicVineFetcherForTests(async () => ({
      ok: true,
      status: 200,
      headers: {},
      text: async () => F('invalid-key.json'),
    }));
    await expect(searchVolumes('BAD', 'x')).rejects.toBeInstanceOf(ComicVineError);
  });

  it('throws on non-JSON response', async () => {
    __setComicVineFetcherForTests(async () => ({
      ok: true,
      status: 200,
      headers: {},
      text: async () => '<html>cf-challenge</html>',
    }));
    await expect(searchVolumes('KEY', 'x')).rejects.toBeInstanceOf(ComicVineError);
  });

  it('throws on HTTP non-2xx', async () => {
    __setComicVineFetcherForTests(async () => ({
      ok: false,
      status: 503,
      headers: {},
      text: async () => 'down',
    }));
    await expect(searchVolumes('KEY', 'x')).rejects.toBeInstanceOf(ComicVineError);
  });

  it('caches identical queries within TTL', async () => {
    let fetches = 0;
    __setComicVineFetcherForTests(async () => {
      fetches++;
      return { ok: true, status: 200, headers: {}, text: async () => F('search-watchmen.json') };
    });
    await searchVolumes('KEY', 'Watchmen');
    await searchVolumes('KEY', 'Watchmen');
    expect(fetches).toBe(1);
  });

  it('builds URL with api_key + format=json + name filter', async () => {
    __setComicVineFetcherForTests(async (url) => {
      urls.push(url);
      return { ok: true, status: 200, headers: {}, text: async () => F('no-match.json') };
    });
    await searchVolumes('KEY', 'Watchmen');
    expect(urls[0]).toContain('api_key=KEY');
    expect(urls[0]).toContain('format=json');
    expect(urls[0]).toContain('filter=name%3AWatchmen');
    expect(urls[0]).toContain('/volumes/');
  });
});

describe('recentVolumes', () => {
  it('issues the date_added:desc sort with api_key, format, limit + field_list', async () => {
    __setComicVineFetcherForTests(async (url) => {
      urls.push(url);
      return { ok: true, status: 200, headers: {}, text: async () => F('search-watchmen.json') };
    });
    await recentVolumes('KEY', 5);
    expect(urls[0]).toContain('/volumes/');
    expect(urls[0]).toContain('api_key=KEY');
    expect(urls[0]).toContain('format=json');
    expect(urls[0]).toContain('sort=date_added%3Adesc');
    expect(urls[0]).toContain('limit=5');
    expect(urls[0]).toContain(
      'field_list=id%2Cname%2Cpublisher%2Cstart_year%2Ccount_of_issues%2Cimage%2Cdescription',
    );
  });

  it('defaults limit to 18 and offset to 0', async () => {
    __setComicVineFetcherForTests(async (url) => {
      urls.push(url);
      return { ok: true, status: 200, headers: {}, text: async () => F('no-match.json') };
    });
    await recentVolumes('KEY');
    expect(urls[0]).toContain('limit=18');
    expect(urls[0]).toContain('offset=0');
  });

  it('passes the offset for pagination', async () => {
    __setComicVineFetcherForTests(async (url) => {
      urls.push(url);
      return { ok: true, status: 200, headers: {}, text: async () => F('no-match.json') };
    });
    await recentVolumes('KEY', 18, 36);
    expect(urls[0]).toContain('limit=18');
    expect(urls[0]).toContain('offset=36');
  });

  it('parses + maps results to the search-hit shape', async () => {
    __setComicVineFetcherForTests(async () => ({
      ok: true,
      status: 200,
      headers: {},
      text: async () => F('search-watchmen.json'),
    }));
    const hits = await recentVolumes('KEY');
    expect(hits).toHaveLength(2);
    expect(hits[0]).toMatchObject({
      comicvineId: 18847,
      name: 'Watchmen',
      publisher: 'DC Comics',
      startYear: 1986,
      issueCount: 12,
      coverUrl: 'https://example.com/watchmen-cover.jpg',
    });
  });
});

describe('listIssues', () => {
  it('paginates across multiple pages', async () => {
    const offsets: number[] = [];
    __setComicVineFetcherForTests(async (url) => {
      const u = new URL(url);
      const offset = parseInt(u.searchParams.get('offset') ?? '0', 10);
      offsets.push(offset);
      const body = offset === 0 ? F('issues-watchmen-page1.json') : F('issues-watchmen-page2.json');
      return { ok: true, status: 200, headers: {}, text: async () => body };
    });
    const issues = await listIssues('KEY', 18847);
    expect(issues).toHaveLength(8);
    expect(offsets).toEqual([0, 5]);
  });

  it('parses issue numbers preserving non-numeric strings', async () => {
    __setComicVineFetcherForTests(async (url) => {
      const u = new URL(url);
      const offset = parseInt(u.searchParams.get('offset') ?? '0', 10);
      return {
        ok: true,
        status: 200,
        headers: {},
        text: async () =>
          offset === 0 ? F('issues-watchmen-page1.json') : F('issues-watchmen-page2.json'),
      };
    });
    const issues = await listIssues('KEY', 18847);
    const annual = issues.find((i) => i.issueNumber === 'Annual 1');
    expect(annual).toBeDefined();
    expect(annual?.issueNumberSort).toBeGreaterThanOrEqual(100000);
  });

  it('sorts numerics by float ascending, non-numerics last in encounter order', async () => {
    __setComicVineFetcherForTests(async (url) => {
      const u = new URL(url);
      const offset = parseInt(u.searchParams.get('offset') ?? '0', 10);
      return {
        ok: true,
        status: 200,
        headers: {},
        text: async () =>
          offset === 0 ? F('issues-watchmen-page1.json') : F('issues-watchmen-page2.json'),
      };
    });
    const issues = await listIssues('KEY', 18847);
    const sorts = issues.map((i) => i.issueNumberSort);
    // First 7 entries (numerics): 0.5, 1, 2, 3, 4, 5, 6
    expect(sorts.slice(0, 7)).toEqual([0.5, 1, 2, 3, 4, 5, 6]);
    // Last entry: Annual 1 with sentinel >= 100000
    expect(sorts[7]).toBeGreaterThanOrEqual(100000);
  });
});

describe('testApiKey', () => {
  it('succeeds on status_code=1 response', async () => {
    __setComicVineFetcherForTests(async () => ({
      ok: true,
      status: 200,
      headers: {},
      text: async () => F('no-match.json'),
    }));
    await expect(testApiKey('KEY')).resolves.toBeUndefined();
  });

  it('throws on invalid-key response', async () => {
    __setComicVineFetcherForTests(async () => ({
      ok: true,
      status: 200,
      headers: {},
      text: async () => F('invalid-key.json'),
    }));
    await expect(testApiKey('BAD')).rejects.toBeInstanceOf(ComicVineError);
  });
});
