import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import bencode from 'bencode';
import { createHash } from 'node:crypto';
import { seedDb, type SeedHandle } from '../helpers/seed';
import { qbtConnectionSetting } from '@/server/db/settings/qbt';
import { POST } from '@/app/api/series/[id]/manual-grab/route';
import {
  __setQbtFetcherForTests,
  __resetQbtForTests,
} from '@/server/integrations/qbittorrent/client';
import { expectShape } from '../../helpers/assert-spec';
import { ManualGrabResponse } from '@/server/openapi/schemas/series';
import { ErrorResponse } from '@/server/openapi/schemas/common';

let h: SeedHandle;

const HASH = 'abcdef0123456789abcdef0123456789abcdef01';
const MAGNET = `magnet:?xt=urn:btih:${HASH}&dn=Route+Test`;

const TORRENT_INFO = { name: 'Route Torrent', 'piece length': 1, pieces: Buffer.alloc(20), length: 7 };
const TORRENT_BYTES = Buffer.from(bencode.encode({ info: TORRENT_INFO }));
const TORRENT_HASH = createHash('sha1').update(bencode.encode(TORRENT_INFO)).digest('hex');

beforeEach(async () => {
  h = await seedDb();
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

function mockQbtHappy(hash: string): void {
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
              hash,
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

function jsonReq(body: unknown): Request {
  return new Request('http://t', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function torrentReq(bytes: Buffer, fileName = 'upload.torrent'): Request {
  const fd = new FormData();
  fd.append('torrent', new File([new Uint8Array(bytes)], fileName));
  return new Request('http://t', { method: 'POST', body: fd });
}

function p(id: string | number): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id: String(id) }) };
}

describe('POST /api/series/[id]/manual-grab', () => {
  it('201 with {releaseId, downloadId} for a JSON magnet (the agreed mobile contract)', async () => {
    mockQbtHappy(HASH);
    const res = await POST(jsonReq({ magnet: MAGNET }), p(h.seriesId));
    expect(res.status, await res.clone().text()).toBe(201);
    await expectShape(ManualGrabResponse, res, 'POST /api/series/{id}/manual-grab');
    const body = (await res.json()) as { releaseId: number; downloadId: number; qbtHash: string };
    expect(body.releaseId).toBeGreaterThan(0);
    expect(body.downloadId).toBeGreaterThan(0);
    expect(body.qbtHash).toBe(HASH);
  });

  it('201 for a multipart .torrent upload', async () => {
    mockQbtHappy(TORRENT_HASH);
    const res = await POST(torrentReq(TORRENT_BYTES), p(h.seriesId));
    expect(res.status, await res.clone().text()).toBe(201);
    await expectShape(ManualGrabResponse, res, 'POST /api/series/{id}/manual-grab');
    const body = (await res.json()) as { releaseId: number; downloadId: number; qbtHash: string };
    expect(body.qbtHash).toBe(TORRENT_HASH);
  });

  it('400 for a non-magnet string (validated downstream)', async () => {
    const res = await POST(jsonReq({ magnet: 'not-a-magnet' }), p(h.seriesId));
    expect(res.status).toBe(400);
    await expectShape(ErrorResponse, res, 'POST /api/series/{id}/manual-grab');
    const body = (await res.json()) as { error: string };
    expect(body.error).toBeTruthy();
  });

  it('400 for bad json', async () => {
    const req = new Request('http://t', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{nope',
    });
    const res = await POST(req, p(h.seriesId));
    expect(res.status).toBe(400);
  });

  it('400 when the magnet field is missing', async () => {
    const res = await POST(jsonReq({}), p(h.seriesId));
    expect(res.status).toBe(400);
  });

  it('400 when the multipart torrent field is missing', async () => {
    const fd = new FormData();
    fd.append('other', 'x');
    const req = new Request('http://t', { method: 'POST', body: fd });
    const res = await POST(req, p(h.seriesId));
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toMatch(/torrent file/);
  });

  it('400 when the uploaded file exceeds 2 MiB', async () => {
    const big = Buffer.alloc(2 * 1024 * 1024 + 1);
    const res = await POST(torrentReq(big), p(h.seriesId));
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toMatch(/2 MiB/);
  });

  it('400 for invalid .torrent bytes within the size cap', async () => {
    const res = await POST(torrentReq(Buffer.from('garbage')), p(h.seriesId));
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toMatch(/not a valid \.torrent/);
  });

  it('400 on a non-digit id', async () => {
    const res = await POST(jsonReq({ magnet: MAGNET }), p('abc'));
    expect(res.status).toBe(400);
  });

  it('404 for an unknown series', async () => {
    const res = await POST(jsonReq({ magnet: MAGNET }), p(99999));
    expect(res.status).toBe(404);
    await expectShape(ErrorResponse, res, 'POST /api/series/{id}/manual-grab');
  });

  it('409 when the torrent was already grabbed', async () => {
    mockQbtHappy(HASH);
    const first = await POST(jsonReq({ magnet: MAGNET }), p(h.seriesId));
    expect(first.status).toBe(201);
    const second = await POST(jsonReq({ magnet: MAGNET }), p(h.seriesId));
    expect(second.status).toBe(409);
    await expectShape(ErrorResponse, second, 'POST /api/series/{id}/manual-grab');
    const body = (await second.json()) as { error: string };
    expect(body.error).toBeTruthy();
  });

  it('503 when qBittorrent is not configured', async () => {
    await qbtConnectionSetting.set({
      host: '',
      port: 8080,
      username: '',
      password: '',
      useHttps: false,
    });
    const res = await POST(jsonReq({ magnet: MAGNET }), p(h.seriesId));
    expect(res.status).toBe(503);
    await expectShape(ErrorResponse, res, 'POST /api/series/{id}/manual-grab');
  });
});
