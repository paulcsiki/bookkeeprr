import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { seedDb, type SeedHandle } from '../helpers/seed';
import { seedDefaultIndexer } from '@/server/db/indexers';
import { upsertReleaseByGuid } from '@/server/db/releases';
import { insertDownload } from '@/server/db/downloads';
import { insertSeries } from '@/server/db/series';
import { qbtConnectionSetting } from '@/server/db/settings/qbt';
import { POST } from '@/app/api/releases/[id]/grab/route';
import {
  __setQbtFetcherForTests,
  __resetQbtForTests,
} from '@/server/integrations/qbittorrent/client';
import { expectShape } from '../../helpers/assert-spec';
import { ErrorResponse } from '@/server/openapi/schemas/common';
import { ReleaseGrabResponse } from '@/server/openapi/schemas/releases';

let h: SeedHandle;
let releaseId: number;

beforeEach(async () => {
  h = await seedDb();
  await seedDefaultIndexer();
  releaseId = await upsertReleaseByGuid({
    indexerId: 1,
    indexerGuid: 'g1',
    seriesId: h.seriesId,
    title: 't',
    link: 'magnet:?xt=urn:btih:abcdef0123456789abcdef0123456789abcdef01',
    targetKind: 'volume',
    targetLow: 1,
    targetHigh: 1,
    sizeBytes: 0,
    publishedAt: new Date(),
  });
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
              hash: 'abcdef0123456789abcdef0123456789abcdef01',
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

function req(body: object): Request {
  return new Request('http://t', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/releases/[id]/grab', () => {
  it('happy path: adds torrent, inserts download row', async () => {
    mockQbtHappy();
    const res = await POST(req({}), { params: Promise.resolve({ id: String(releaseId) }) });
    expect(res.status).toBe(201);
    await expectShape(ReleaseGrabResponse, res, 'POST /api/releases/{id}/grab');
    const body = await res.json();
    expect(body.qbtHash).toBe('abcdef0123456789abcdef0123456789abcdef01');
  });

  it('409 when an active downloads row exists', async () => {
    await insertDownload({
      releaseId,
      qbtHash: 'abcdef0123456789abcdef0123456789abcdef01',
      status: 'queued',
    });
    mockQbtHappy();
    const res = await POST(req({}), { params: Promise.resolve({ id: String(releaseId) }) });
    expect(res.status).toBe(409);
    await expectShape(ErrorResponse, res, 'POST /api/releases/{id}/grab');
  });

  it('503 when qbt not configured', async () => {
    await qbtConnectionSetting.set({
      host: '',
      port: 8080,
      username: '',
      password: '',
      useHttps: false,
    });
    mockQbtHappy();
    const res = await POST(req({}), { params: Promise.resolve({ id: String(releaseId) }) });
    expect(res.status).toBe(503);
    await expectShape(ErrorResponse, res, 'POST /api/releases/{id}/grab');
  });

  it('502 when qbt add fails', async () => {
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
    const res = await POST(req({}), { params: Promise.resolve({ id: String(releaseId) }) });
    expect(res.status).toBe(502);
    await expectShape(ErrorResponse, res, 'POST /api/releases/{id}/grab');
  });

  it('400 on non-digit id', async () => {
    mockQbtHappy();
    const res = await POST(req({}), { params: Promise.resolve({ id: 'foo' }) });
    expect(res.status).toBe(400);
    await expectShape(ErrorResponse, res, 'POST /api/releases/{id}/grab');
  });

  it('400 on malformed link', async () => {
    const { upsertReleaseByGuid } = await import('@/server/db/releases');
    const badId = await upsertReleaseByGuid({
      indexerId: 1,
      indexerGuid: 'g-bad',
      seriesId: h.seriesId,
      title: 't',
      link: 'not-a-magnet',
      targetKind: 'volume',
      targetLow: 1,
      targetHigh: 1,
      sizeBytes: 0,
      publishedAt: new Date(),
    });
    mockQbtHappy();
    const res = await POST(req({}), { params: Promise.resolve({ id: String(badId) }) });
    expect(res.status).toBe(400);
  });

  it('404 on missing release', async () => {
    mockQbtHappy();
    const res = await POST(req({}), { params: Promise.resolve({ id: '9999' }) });
    expect(res.status).toBe(404);
    await expectShape(ErrorResponse, res, 'POST /api/releases/{id}/grab');
  });
});

describe('POST /api/releases/[id]/grab — per-content-type qBT category', () => {
  it('manga release uses category bookkeeprr-manga', async () => {
    let capturedCategory: string | null = null;
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
        const u = new URL(url);
        capturedCategory = u.searchParams.get('category');
        return {
          ok: true,
          status: 200,
          headers: {},
          text: async () =>
            JSON.stringify([
              {
                hash: 'abcdef0123456789abcdef0123456789abcdef01',
                name: 'x',
                state: 'downloading',
                progress: 0,
                category: capturedCategory ?? '',
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

    const res = await POST(req({}), { params: Promise.resolve({ id: String(releaseId) }) });
    expect(res.status).toBe(201);
    expect(capturedCategory).toBe('bookkeeprr-manga');
  });

  it('ebook release uses category bookkeeprr-ebook', async () => {
    const ebookSeriesId = await insertSeries({
      contentType: 'ebook',
      anilistId: null,
      status: 'finished',
      rootPath: '/media/books/Ebook',
      qualityProfileId: h.qpId,
      titleEnglish: 'Ebook',
    });
    const ebookReleaseId = await upsertReleaseByGuid({
      indexerId: 1,
      indexerGuid: 'ebook-g',
      seriesId: ebookSeriesId,
      title: 'Ebook Title v01',
      link: 'magnet:?xt=urn:btih:abcdef0123456789abcdef0123456789abcdef02',
      targetKind: 'volume',
      targetLow: 1,
      targetHigh: 1,
      sizeBytes: 0,
      publishedAt: new Date(),
    });

    let capturedCategory: string | null = null;
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
        const u = new URL(url);
        capturedCategory = u.searchParams.get('category');
        return {
          ok: true,
          status: 200,
          headers: {},
          text: async () =>
            JSON.stringify([
              {
                hash: 'abcdef0123456789abcdef0123456789abcdef02',
                name: 'x',
                state: 'downloading',
                progress: 0,
                category: capturedCategory ?? '',
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

    const res = await POST(req({}), { params: Promise.resolve({ id: String(ebookReleaseId) }) });
    expect(res.status).toBe(201);
    expect(capturedCategory).toBe('bookkeeprr-ebook');
  });
});
