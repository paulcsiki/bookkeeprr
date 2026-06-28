import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { seedDb, type SeedHandle } from '../helpers/seed';
import { expectShape } from '../../helpers/assert-spec';
import { ErrorResponse } from '@/server/openapi/schemas/common';
import { SettingsOkResponse } from '@/server/openapi/schemas/settings';
import { AudiobookshelfLibrariesResponse } from '@/server/openapi/schemas/settings-library-sync';
import { POST as abPost } from '@/app/api/settings/library-sync/audiobookshelf/test/route';
import { GET as abLibrariesGet } from '@/app/api/settings/library-sync/audiobookshelf/libraries/route';
import { audiobookshelfSetting } from '@/server/db/settings/audiobookshelf';
import {
  __setAudiobookshelfFetcherForTests,
  __resetAudiobookshelfForTests,
} from '@/server/library-sync/audiobookshelf';
import { POST as cbPost } from '@/app/api/settings/library-sync/calibre/test/route';
import { calibreSetting } from '@/server/db/settings/calibre';
import { __setCalibreFetcherForTests, __resetCalibreForTests } from '@/server/library-sync/calibre';

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

describe('POST /api/settings/library-sync/audiobookshelf/test', () => {
  it('returns 503 when not configured', async () => {
    const res = await abPost();
    expect(res.status).toBe(503);
    await expectShape(
      ErrorResponse,
      res,
      'POST /api/settings/library-sync/audiobookshelf/test (503)',
    );
  });

  it('returns ok on success', async () => {
    await audiobookshelfSetting.set({
      baseUrl: 'http://abs',
      apiToken: 'tok',
      libraryId: 'lib',
      contentTypes: ['audiobook'],
      enabled: true,
    });
    __setAudiobookshelfFetcherForTests(async () => ({
      ok: true,
      status: 200,
      text: async () => '',
    }));
    const res = await abPost();
    expect(res.status).toBe(200);
    await expectShape(SettingsOkResponse, res, 'POST /api/settings/library-sync/audiobookshelf/test');
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.ok).toBe(true);
  });

  it('returns 502 with error message on failure', async () => {
    await audiobookshelfSetting.set({
      baseUrl: 'http://abs',
      apiToken: 'tok',
      libraryId: 'lib',
      contentTypes: ['audiobook'],
      enabled: true,
    });
    __setAudiobookshelfFetcherForTests(async () => ({
      ok: false,
      status: 401,
      text: async () => '',
    }));
    const res = await abPost();
    expect(res.status).toBe(502);
    await expectShape(
      ErrorResponse,
      res,
      'POST /api/settings/library-sync/audiobookshelf/test (502)',
    );
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.error).toMatch(/HTTP 401/);
  });
});

describe('GET /api/settings/library-sync/audiobookshelf/libraries', () => {
  it('returns 503 when not configured', async () => {
    const res = await abLibrariesGet();
    expect(res.status).toBe(503);
    await expectShape(
      ErrorResponse,
      res,
      'GET /api/settings/library-sync/audiobookshelf/libraries (503)',
    );
  });

  it('lists the libraries for the picker', async () => {
    await audiobookshelfSetting.set({
      baseUrl: 'http://abs',
      apiToken: 'tok',
      libraryId: null,
      contentTypes: ['audiobook'],
      enabled: false,
    });
    __setAudiobookshelfFetcherForTests(async () => ({
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify({ libraries: [{ id: 'lib1', name: 'Audiobooks', mediaType: 'book' }] }),
    }));
    const res = await abLibrariesGet();
    expect(res.status).toBe(200);
    const body = await expectShape(
      AudiobookshelfLibrariesResponse,
      res,
      'GET /api/settings/library-sync/audiobookshelf/libraries',
    );
    expect(body.libraries[0]!.id).toBe('lib1');
  });

  it('returns 502 when the listing fails', async () => {
    await audiobookshelfSetting.set({
      baseUrl: 'http://abs',
      apiToken: 'tok',
      libraryId: null,
      contentTypes: ['audiobook'],
      enabled: false,
    });
    __setAudiobookshelfFetcherForTests(async () => ({
      ok: false,
      status: 500,
      text: async () => '',
    }));
    const res = await abLibrariesGet();
    expect(res.status).toBe(502);
    await expectShape(
      ErrorResponse,
      res,
      'GET /api/settings/library-sync/audiobookshelf/libraries (502)',
    );
  });
});

describe('POST /api/settings/library-sync/calibre/test', () => {
  it('returns 503 when not configured', async () => {
    const res = await cbPost();
    expect(res.status).toBe(503);
    await expectShape(ErrorResponse, res, 'POST /api/settings/library-sync/calibre/test (503)');
  });

  it('returns ok on success', async () => {
    await calibreSetting.set({
      baseUrl: 'http://calibre',
      username: null,
      password: null,
      libraryId: '0',
      contentTypes: ['ebook'],
      enabled: true,
    });
    __setCalibreFetcherForTests(async () => ({
      ok: true,
      status: 200,
      text: async () => '',
    }));
    const res = await cbPost();
    expect(res.status).toBe(200);
    await expectShape(SettingsOkResponse, res, 'POST /api/settings/library-sync/calibre/test');
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.ok).toBe(true);
  });
});
