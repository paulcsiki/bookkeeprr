import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  __resetNyaaForTests,
  __setNyaaFetcherForTests,
  searchNyaa,
  NyaaError,
} from '@/server/integrations/nyaa/client';

const FIXTURE_DIR = join(process.cwd(), 'tests/fixtures/nyaa');

function readFixture(name: string): string {
  return readFileSync(join(FIXTURE_DIR, name), 'utf-8');
}

let calls: string[];

beforeEach(() => {
  __resetNyaaForTests();
  calls = [];
});

afterEach(() => {
  vi.useRealTimers();
});

describe('searchNyaa', () => {
  it('defaults to https://nyaa.si when no baseUrl is given', async () => {
    __setNyaaFetcherForTests(async (url: string) => {
      calls.push(url);
      return { ok: true, status: 200, text: async () => readFixture('popular-series.xml') };
    });
    await searchNyaa({ q: 'Chainsaw Man' });
    expect(calls[0]).toMatch(/^https:\/\/nyaa\.si\//);
  });

  it('uses the provided baseUrl (mirror / e2e mock support)', async () => {
    __setNyaaFetcherForTests(async (url: string) => {
      calls.push(url);
      return { ok: true, status: 200, text: async () => readFixture('popular-series.xml') };
    });
    await searchNyaa({ q: 'Chainsaw Man' }, 'http://mock-nyaa:8080');
    expect(calls[0]).toMatch(/^http:\/\/mock-nyaa:8080\//);
    expect(calls[0]).toContain('page=rss');
    expect(calls[0]).toContain('q=Chainsaw+Man');
  });

  it('strips a trailing slash from baseUrl', async () => {
    __setNyaaFetcherForTests(async (url: string) => {
      calls.push(url);
      return { ok: true, status: 200, text: async () => readFixture('popular-series.xml') };
    });
    await searchNyaa({ q: 'x' }, 'http://mirror.example/');
    // Single `/` between baseUrl and `?`, not `//`.
    expect(calls[0]).toMatch(/^http:\/\/mirror\.example\/\?/);
  });

  it('parses a typical RSS response into typed items', async () => {
    __setNyaaFetcherForTests(async (url: string) => {
      calls.push(url);
      return { ok: true, status: 200, text: async () => readFixture('popular-series.xml') };
    });
    const items = await searchNyaa({ q: 'Chainsaw Man' });
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({
      guid: '1234567',
      title: '[Group] Chainsaw Man - v01 (2024) (Digital) (Group)',
      seeders: 120,
      leechers: 3,
      downloads: 456,
      trusted: false,
      remake: false,
      categoryId: '3_1',
    });
    expect(items[0]?.sizeBytes).toBeGreaterThan(120 * 1024 * 1024);
    expect(items[0]?.sizeBytes).toBeLessThan(125 * 1024 * 1024);
    expect(items[1]?.trusted).toBe(true);
    expect(items[1]?.guid).toBe('1234568');
  });

  it('returns empty array on no-result feeds', async () => {
    __setNyaaFetcherForTests(async () => ({
      ok: true,
      status: 200,
      text: async () => readFixture('empty-result.xml'),
    }));
    const items = await searchNyaa({ q: 'QueryWithNoResults' });
    expect(items).toEqual([]);
  });

  it('parses GiB sizes', async () => {
    __setNyaaFetcherForTests(async () => ({
      ok: true,
      status: 200,
      text: async () => readFixture('with-batch.xml'),
    }));
    const items = await searchNyaa({ q: 'Naruto' });
    expect(items).toHaveLength(1);
    expect(items[0]?.sizeBytes).toBeGreaterThan(4 * 1024 * 1024 * 1024);
    expect(items[0]?.sizeBytes).toBeLessThan(5 * 1024 * 1024 * 1024);
  });

  it('builds the URL with category and sort params', async () => {
    __setNyaaFetcherForTests(async (url) => {
      calls.push(url);
      return { ok: true, status: 200, text: async () => readFixture('empty-result.xml') };
    });
    await searchNyaa({ q: 'Foo', category: '3_3', sort: 'date', order: 'asc' });
    expect(calls[0]).toContain('page=rss');
    expect(calls[0]).toContain('q=Foo');
    expect(calls[0]).toContain('c=3_3');
    expect(calls[0]).toContain('s=date');
    expect(calls[0]).toContain('o=asc');
  });

  it('caches identical queries within TTL', async () => {
    let fetches = 0;
    __setNyaaFetcherForTests(async () => {
      fetches++;
      return { ok: true, status: 200, text: async () => readFixture('empty-result.xml') };
    });
    await searchNyaa({ q: 'Same' });
    await searchNyaa({ q: 'Same' });
    expect(fetches).toBe(1);
  });

  it('throws NyaaError on non-2xx', async () => {
    __setNyaaFetcherForTests(async () => ({
      ok: false,
      status: 500,
      text: async () => 'server boom',
    }));
    await expect(searchNyaa({ q: 'X' })).rejects.toBeInstanceOf(NyaaError);
  });

  it('throws NyaaError on bad XML', async () => {
    __setNyaaFetcherForTests(async () => ({
      ok: true,
      status: 200,
      text: async () => '<not-rss>nope</not-rss>',
    }));
    await expect(searchNyaa({ q: 'X' })).rejects.toBeInstanceOf(NyaaError);
  });
});
