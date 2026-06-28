import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  searchAudiobooks,
  getAudiobook,
  AudnexError,
  __setAudnexFetcherForTests,
  __resetAudnexForTests,
} from '@/server/integrations/audnex/client';

const FIXTURE_DIR = path.resolve(__dirname, '../../../fixtures/audnex');

async function loadFixture(name: string): Promise<string> {
  return readFile(path.join(FIXTURE_DIR, name), 'utf-8');
}

beforeEach(() => {
  __resetAudnexForTests();
});
afterEach(() => {
  __resetAudnexForTests();
});

describe('searchAudiobooks', () => {
  it('parses success response into AudnexSearchHit[]', async () => {
    const body = await loadFixture('search-success.json');
    __setAudnexFetcherForTests(async () => ({
      ok: true,
      status: 200,
      text: async () => body,
    }));
    const hits = await searchAudiobooks('hail mary');
    expect(hits).toHaveLength(1);
    const h = hits[0]!;
    expect(h.asin).toBe('B086WJP9HX');
    expect(h.title).toBe('Project Hail Mary');
    expect(h.author).toBe('Andy Weir');
    expect(h.narrator).toBe('Ray Porter');
    expect(h.releaseYear).toBe(2021);
    expect(h.runtimeMinutes).toBe(970);
    expect(h.coverUrl).toMatch(/^https:\/\/m\.media-amazon\.com/);
  });

  it('returns [] on empty result', async () => {
    const body = await loadFixture('empty-search.json');
    __setAudnexFetcherForTests(async () => ({
      ok: true,
      status: 200,
      text: async () => body,
    }));
    const hits = await searchAudiobooks('nothing');
    expect(hits).toEqual([]);
  });

  it('returns [] on 404', async () => {
    __setAudnexFetcherForTests(async () => ({
      ok: false,
      status: 404,
      text: async () => '',
    }));
    const hits = await searchAudiobooks('x');
    expect(hits).toEqual([]);
  });

  it('throws AudnexError on 5xx', async () => {
    __setAudnexFetcherForTests(async () => ({
      ok: false,
      status: 503,
      text: async () => '',
    }));
    await expect(searchAudiobooks('x')).rejects.toThrow(/HTTP 503/);
  });

  it('throws AudnexError on malformed JSON', async () => {
    __setAudnexFetcherForTests(async () => ({
      ok: true,
      status: 200,
      text: async () => 'not json',
    }));
    await expect(searchAudiobooks('x')).rejects.toThrow(AudnexError);
  });

  it('caches identical queries for the TTL window', async () => {
    const body = await loadFixture('empty-search.json');
    let calls = 0;
    __setAudnexFetcherForTests(async () => {
      calls++;
      return { ok: true, status: 200, text: async () => body };
    });
    await searchAudiobooks('cacheme');
    await searchAudiobooks('cacheme');
    expect(calls).toBe(1);
  });
});

describe('getAudiobook', () => {
  it('returns the AudnexBook record', async () => {
    const body = await loadFixture('book-success.json');
    __setAudnexFetcherForTests(async () => ({
      ok: true,
      status: 200,
      text: async () => body,
    }));
    const book = await getAudiobook('B086WJP9HX');
    expect(book?.title).toBe('Project Hail Mary');
    expect(book?.runtimeLengthMin).toBe(970);
    expect(book?.authors?.[0]?.name).toBe('Andy Weir');
  });

  it('returns null on 404', async () => {
    __setAudnexFetcherForTests(async () => ({
      ok: false,
      status: 404,
      text: async () => '',
    }));
    const book = await getAudiobook('B00000000X');
    expect(book).toBeNull();
  });
});
