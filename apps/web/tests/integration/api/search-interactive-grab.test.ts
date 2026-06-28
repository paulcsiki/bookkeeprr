import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { seedDb, type SeedHandle } from '../helpers/seed';
import { seedDefaultIndexer } from '@/server/db/indexers';
import { findReleaseByIndexerGuid } from '@/server/db/releases';
import { qbtConnectionSetting } from '@/server/db/settings/qbt';
import { POST } from '@/app/api/search/interactive/grab/route';
import {
  __setQbtFetcherForTests,
  __resetQbtForTests,
} from '@/server/integrations/qbittorrent/client';
import { expectShape } from '../../helpers/assert-spec';
import { ErrorResponse } from '@/server/openapi/schemas/common';
import { ReleaseGrabResponse } from '@/server/openapi/schemas/releases';

let h: SeedHandle;

const HASH = 'abcdef0123456789abcdef0123456789abcdef01';

beforeEach(async () => {
  h = await seedDb();
  await seedDefaultIndexer();
  await qbtConnectionSetting.set({
    host: 'x',
    port: 1,
    username: 'u',
    password: 'p',
    useHttps: false,
  });
  __resetQbtForTests();
});

afterEach(() => h.cleanup());

function mockQbtHappy(): void {
  __setQbtFetcherForTests(async (url) => {
    if (url.endsWith('/api/v2/auth/login')) {
      return {
        ok: true,
        status: 200,
        headers: { 'set-cookie': 'SID=abc' },
        text: async () => 'Ok.',
      };
    }
    if (url.endsWith('/torrents/add')) {
      return { ok: true, status: 200, headers: {}, text: async () => 'Ok.' };
    }
    if (url.includes('/torrents/info')) {
      return {
        ok: true,
        status: 200,
        headers: {},
        text: async () =>
          JSON.stringify([
            {
              hash: HASH,
              name: 'x',
              state: 'downloading',
              progress: 0,
              category: 'bookkeeprr-manga',
              tags: '',
              save_path: '/x',
              size: 0,
              completed: 0,
            },
          ]),
      };
    }
    throw new Error(`unexpected ${url}`);
  });
}

function body(overrides: Record<string, unknown> = {}): object {
  return {
    seriesId: h.seriesId,
    item: {
      guid: 'forced-1',
      title: '[Group] Test Series v01',
      link: `magnet:?xt=urn:btih:${HASH}`,
      seeders: 50,
      leechers: 1,
      sizeBytes: 100,
      publishedAt: new Date().toISOString(),
      indexerId: 1,
    },
    parsed: {
      targetKind: 'volume',
      targetLow: 1,
      targetHigh: 1,
      group: 'Group',
      language: 'en',
      isBatch: false,
    },
    score: null,
    ...overrides,
  };
}

function req(b: object): Request {
  return new Request('http://t/api/search/interactive/grab', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(b),
  });
}

describe('POST /api/search/interactive/grab', () => {
  it('upserts a previously non-matching result then grabs it (201)', async () => {
    // No release exists for this guid yet (it was a non-match in search).
    expect(await findReleaseByIndexerGuid(1, 'forced-1')).toBeNull();

    mockQbtHappy();
    const res = await POST(req(body()));
    expect(res.status).toBe(201);
    await expectShape(ReleaseGrabResponse, res, 'POST /api/search/interactive/grab');
    const json = await res.json();
    expect(json.qbtHash).toBe(HASH);
    expect(json.status).toBe('queued');
    expect(typeof json.downloadId).toBe('number');

    // The forced grab created/refreshed a release row for the guid.
    const release = await findReleaseByIndexerGuid(1, 'forced-1');
    expect(release).not.toBeNull();
    expect(release?.score).toBeNull();
  });

  it('returns 400 on invalid body', async () => {
    mockQbtHappy();
    const res = await POST(req(body({ item: { guid: 'x' } })));
    expect(res.status).toBe(400);
    await expectShape(ErrorResponse, res, 'POST /api/search/interactive/grab');
  });

  it('maps grabber malformed-link error to 400', async () => {
    mockQbtHappy();
    const res = await POST(
      req(
        body({
          item: {
            guid: 'forced-bad',
            title: '[Group] Test Series v01',
            link: 'not-a-magnet',
            seeders: 50,
            leechers: 1,
            sizeBytes: 100,
            publishedAt: new Date().toISOString(),
            indexerId: 1,
          },
        }),
      ),
    );
    expect(res.status).toBe(400);
  });

  it('maps qbt add failure to 502', async () => {
    __setQbtFetcherForTests(async (url) => {
      if (url.endsWith('/api/v2/auth/login')) {
        return {
          ok: true,
          status: 200,
          headers: { 'set-cookie': 'SID=abc' },
          text: async () => 'Ok.',
        };
      }
      return { ok: true, status: 200, headers: {}, text: async () => 'Fails.' };
    });
    const res = await POST(req(body()));
    expect(res.status).toBe(502);
    await expectShape(ErrorResponse, res, 'POST /api/search/interactive/grab');
  });
});
