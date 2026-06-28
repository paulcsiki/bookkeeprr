import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { seedDb, type SeedHandle } from '../helpers/seed';
import { audiobookshelfSetting } from '@/server/db/settings/audiobookshelf';
import { calibreSetting } from '@/server/db/settings/calibre';
import {
  __setAudiobookshelfFetcherForTests,
  __resetAudiobookshelfForTests,
} from '@/server/library-sync/audiobookshelf';
import { __setCalibreFetcherForTests, __resetCalibreForTests } from '@/server/library-sync/calibre';
import { triggerRefresh } from '@/server/library-sync';

let h: SeedHandle;

beforeEach(async () => {
  h = await seedDb({ skipDefaultSeries: true });
  __resetAudiobookshelfForTests();
  __resetCalibreForTests();
});
afterEach(() => {
  __resetAudiobookshelfForTests();
  __resetCalibreForTests();
  h.cleanup();
});

describe('triggerRefresh', () => {
  it('fires Audiobookshelf when configured + content-type matches', async () => {
    await audiobookshelfSetting.set({
      baseUrl: 'http://abs',
      apiToken: 'tok',
      libraryId: 'lib',
      contentTypes: ['audiobook'],
      enabled: true,
    });
    let absCalls = 0;
    __setAudiobookshelfFetcherForTests(async () => {
      absCalls++;
      return { ok: true, status: 200, text: async () => '' };
    });
    await triggerRefresh('audiobook');
    expect(absCalls).toBe(1);
  });

  it('skips Audiobookshelf when content-type not in allowlist', async () => {
    await audiobookshelfSetting.set({
      baseUrl: 'http://abs',
      apiToken: 'tok',
      libraryId: 'lib',
      contentTypes: ['audiobook'],
      enabled: true,
    });
    let absCalls = 0;
    __setAudiobookshelfFetcherForTests(async () => {
      absCalls++;
      return { ok: true, status: 200, text: async () => '' };
    });
    await triggerRefresh('manga');
    expect(absCalls).toBe(0);
  });

  it('fires Calibre when configured + content-type matches', async () => {
    await calibreSetting.set({
      baseUrl: 'http://calibre',
      username: null,
      password: null,
      libraryId: '0',
      contentTypes: ['ebook'],
      enabled: true,
    });
    let cbCalls = 0;
    __setCalibreFetcherForTests(async () => {
      cbCalls++;
      return { ok: true, status: 200, text: async () => '' };
    });
    await triggerRefresh('ebook');
    expect(cbCalls).toBe(1);
  });

  it('fires both when configured for the same content-type', async () => {
    await audiobookshelfSetting.set({
      baseUrl: 'http://abs',
      apiToken: 'tok',
      libraryId: 'lib',
      contentTypes: ['ebook'],
      enabled: true,
    });
    await calibreSetting.set({
      baseUrl: 'http://calibre',
      username: null,
      password: null,
      libraryId: '0',
      contentTypes: ['ebook'],
      enabled: true,
    });
    let absCalls = 0;
    let cbCalls = 0;
    __setAudiobookshelfFetcherForTests(async () => {
      absCalls++;
      return { ok: true, status: 200, text: async () => '' };
    });
    __setCalibreFetcherForTests(async () => {
      cbCalls++;
      return { ok: true, status: 200, text: async () => '' };
    });
    await triggerRefresh('ebook');
    expect(absCalls).toBe(1);
    expect(cbCalls).toBe(1);
  });

  it('continues to the second player when the first throws', async () => {
    await audiobookshelfSetting.set({
      baseUrl: 'http://abs',
      apiToken: 'tok',
      libraryId: 'lib',
      contentTypes: ['ebook'],
      enabled: true,
    });
    await calibreSetting.set({
      baseUrl: 'http://calibre',
      username: null,
      password: null,
      libraryId: '0',
      contentTypes: ['ebook'],
      enabled: true,
    });
    let cbCalls = 0;
    __setAudiobookshelfFetcherForTests(async () => ({
      ok: false,
      status: 500,
      text: async () => '',
    }));
    __setCalibreFetcherForTests(async () => {
      cbCalls++;
      return { ok: true, status: 200, text: async () => '' };
    });
    await expect(triggerRefresh('ebook')).resolves.toBeUndefined();
    expect(cbCalls).toBe(1);
  });

  it('is a no-op when nothing is configured', async () => {
    await expect(triggerRefresh('audiobook')).resolves.toBeUndefined();
  });
});
