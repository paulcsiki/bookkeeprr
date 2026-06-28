import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  searchFilelist,
  FilelistError,
  __setFilelistFetcherForTests,
  __resetFilelistForTests,
} from '@/server/integrations/filelist/client';

const FIXTURE_DIR = path.resolve(__dirname, '../../../fixtures/filelist');

async function loadFixture(name: string): Promise<string> {
  return readFile(path.join(FIXTURE_DIR, name), 'utf-8');
}

beforeEach(() => {
  __resetFilelistForTests();
});
afterEach(() => {
  __resetFilelistForTests();
});

const CREDS = { username: 'paul', passkey: 'secret123' };

describe('searchFilelist', () => {
  it('parses success response into IndexerResult[]', async () => {
    const body = await loadFixture('search-success.json');
    __setFilelistFetcherForTests(async () => ({
      ok: true,
      status: 200,
      text: async () => body,
    }));
    const items = await searchFilelist(CREDS, { q: 'Re:Zero', category: 24 });
    expect(items).toHaveLength(2);
    const first = items[0]!;
    expect(first.guid).toBe('712345');
    expect(first.title).toBe('Re.Zero.Vol.01.J-Novel.epub');
    expect(first.sizeBytes).toBe(4194304);
    expect(first.seeders).toBe(12);
    expect(first.leechers).toBe(0);
    expect(first.pubDate.toISOString()).toBe('2024-06-01T12:30:45.000Z');
    expect(first.link).toMatch(/^https:\/\/filelist\.io\/download\.php/);
    expect(first.infoHash).toBeNull();
  });

  it('returns [] on empty result', async () => {
    const body = await loadFixture('empty.json');
    __setFilelistFetcherForTests(async () => ({
      ok: true,
      status: 200,
      text: async () => body,
    }));
    const items = await searchFilelist(CREDS, { q: 'nothing', category: 24 });
    expect(items).toEqual([]);
  });

  it('throws FilelistError on 403 invalid credentials', async () => {
    const body = await loadFixture('invalid-creds.json');
    __setFilelistFetcherForTests(async () => ({
      ok: false,
      status: 403,
      text: async () => body,
    }));
    await expect(searchFilelist(CREDS, { q: 'x', category: 24 })).rejects.toThrow(FilelistError);
    await expect(searchFilelist(CREDS, { q: 'x', category: 24 })).rejects.toThrow(
      /invalid credentials/,
    );
  });

  it('throws FilelistError on 429 rate limit', async () => {
    __setFilelistFetcherForTests(async () => ({
      ok: false,
      status: 429,
      text: async () => '',
    }));
    await expect(searchFilelist(CREDS, { q: 'x', category: 24 })).rejects.toThrow(/rate limited/);
  });

  it('throws FilelistError on 5xx', async () => {
    __setFilelistFetcherForTests(async () => ({
      ok: false,
      status: 503,
      text: async () => '',
    }));
    await expect(searchFilelist(CREDS, { q: 'x', category: 24 })).rejects.toThrow(/HTTP 503/);
  });

  it('throws FilelistError on malformed JSON', async () => {
    __setFilelistFetcherForTests(async () => ({
      ok: true,
      status: 200,
      text: async () => 'not json',
    }));
    await expect(searchFilelist(CREDS, { q: 'x', category: 24 })).rejects.toThrow(
      /response shape invalid/,
    );
  });

  it('throws FilelistError on network failure', async () => {
    __setFilelistFetcherForTests(async () => {
      throw new Error('connection refused');
    });
    await expect(searchFilelist(CREDS, { q: 'x', category: 24 })).rejects.toThrow(/fetch failed/);
  });

  it('caches identical queries for the TTL window', async () => {
    const body = await loadFixture('empty.json');
    let calls = 0;
    __setFilelistFetcherForTests(async () => {
      calls++;
      return { ok: true, status: 200, text: async () => body };
    });
    await searchFilelist(CREDS, { q: 'cacheme', category: 24 });
    await searchFilelist(CREDS, { q: 'cacheme', category: 24 });
    expect(calls).toBe(1);
  });
});
