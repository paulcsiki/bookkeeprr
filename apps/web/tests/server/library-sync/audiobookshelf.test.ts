import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  scanLibrary,
  listLibraries,
  AudiobookshelfError,
  __setAudiobookshelfFetcherForTests,
  __resetAudiobookshelfForTests,
} from '@/server/library-sync/audiobookshelf';

const cfg = { baseUrl: 'http://abs.local:13378', apiToken: 'token-123' };

beforeEach(() => __resetAudiobookshelfForTests());
afterEach(() => __resetAudiobookshelfForTests());

describe('scanLibrary', () => {
  it('POSTs to /api/libraries/{id}/scan with Bearer auth', async () => {
    let capturedUrl = '';
    let capturedAuth = '';
    let capturedMethod = '';
    __setAudiobookshelfFetcherForTests(async (url, init) => {
      capturedUrl = url;
      capturedMethod = init.method ?? 'GET';
      const headers = new Headers(init.headers);
      capturedAuth = headers.get('authorization') ?? '';
      return { ok: true, status: 200, text: async () => '' };
    });
    await scanLibrary(cfg, 'lib-a');
    expect(capturedUrl).toBe('http://abs.local:13378/api/libraries/lib-a/scan');
    expect(capturedMethod).toBe('POST');
    expect(capturedAuth).toBe('Bearer token-123');
  });

  it('throws AudiobookshelfError on 401', async () => {
    __setAudiobookshelfFetcherForTests(async () => ({
      ok: false,
      status: 401,
      text: async () => '',
    }));
    await expect(scanLibrary(cfg, 'lib-a')).rejects.toThrow(AudiobookshelfError);
    await expect(scanLibrary(cfg, 'lib-a')).rejects.toThrow(/HTTP 401/);
  });

  it('throws AudiobookshelfError on network failure', async () => {
    __setAudiobookshelfFetcherForTests(async () => {
      throw new Error('econnrefused');
    });
    await expect(scanLibrary(cfg, 'lib-a')).rejects.toThrow(/fetch failed/);
  });
});

describe('listLibraries', () => {
  it('returns only book-type libraries', async () => {
    __setAudiobookshelfFetcherForTests(async () => ({
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify({
          libraries: [
            { id: 'lib-a', name: 'Audiobooks', mediaType: 'book' },
            { id: 'lib-b', name: 'Podcasts', mediaType: 'podcast' },
            { id: 'lib-c', name: 'Ebooks', mediaType: 'book' },
          ],
        }),
    }));
    const libs = await listLibraries(cfg);
    expect(libs).toHaveLength(2);
    expect(libs.map((l) => l.id).sort()).toEqual(['lib-a', 'lib-c']);
  });

  it('throws AudiobookshelfError on 401', async () => {
    __setAudiobookshelfFetcherForTests(async () => ({
      ok: false,
      status: 401,
      text: async () => '',
    }));
    await expect(listLibraries(cfg)).rejects.toThrow(/HTTP 401/);
  });

  it('throws AudiobookshelfError on malformed JSON', async () => {
    __setAudiobookshelfFetcherForTests(async () => ({
      ok: true,
      status: 200,
      text: async () => 'not json',
    }));
    await expect(listLibraries(cfg)).rejects.toThrow(/shape/i);
  });
});
