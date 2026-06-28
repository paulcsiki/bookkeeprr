import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';

// Mock the clearance layer so CF-host tests don't touch FlareSolverr / DB state.
const clearanceForHost = vi.fn();
const invalidateClearance = vi.fn();
vi.mock('@/server/images/cf-clearance', () => ({
  clearanceForHost: (...args: unknown[]) => clearanceForHost(...args),
  invalidateClearance: (...args: unknown[]) => invalidateClearance(...args),
}));

import { GET } from '@/app/api/img/route';
import { closeDb, getDb } from '@/server/db/client';
import { imageCacheSetting } from '@/server/db/settings/library';

function req(u?: string): Request {
  const qs = u === undefined ? '' : `?u=${encodeURIComponent(u)}`;
  return new Request(`http://localhost/api/img${qs}`);
}

const MDEX = 'https://uploads.mangadex.org/covers/abc/def.jpg.512.jpg';

let tmp: string;
let cacheDir: string;

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'bk-img-'));
  cacheDir = join(tmp, 'cache');
  process.env.BOOKKEEPRR_DB_PATH = join(tmp, 'test.db');
  migrate(getDb(), { migrationsFolder: './drizzle' });
});

afterEach(() => {
  vi.restoreAllMocks();
  clearanceForHost.mockReset();
  invalidateClearance.mockReset();
  closeDb();
  rmSync(tmp, { recursive: true, force: true });
});

function imageResponse(bytes = [1, 2, 3], contentType = 'image/jpeg'): Response {
  return new Response(new Uint8Array(bytes), {
    status: 200,
    headers: { 'content-type': contentType },
  });
}

describe('GET /api/img — cover proxy', () => {
  it('400 when the u param is missing', async () => {
    const res = await GET(req());
    expect(res.status).toBe(400);
  });

  it('400 for an unparseable url', async () => {
    const res = await GET(req('not a url'));
    expect(res.status).toBe(400);
  });

  it('403 for a non-allowlisted host (no SSRF / open proxy)', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const res = await GET(req('https://evil.example.com/secret'));
    expect(res.status).toBe(403);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('403 for a non-https allowlisted host', async () => {
    const res = await GET(req('http://uploads.mangadex.org/covers/abc/def.jpg.512.jpg'));
    expect(res.status).toBe(403);
  });

  it('streams the upstream image and sends a mangadex Referer + immutable cache', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(imageResponse());
    const res = await GET(req(MDEX));
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/jpeg');
    expect(res.headers.get('cache-control')).toContain('immutable');

    const [calledUrl, init] = fetchSpy.mock.calls[0]!;
    expect(calledUrl).toBe(MDEX);
    expect((init?.headers as Record<string, string>).referer).toBe('https://mangadex.org/');
  });

  it('502 when the upstream returns a non-image (e.g. an HTML error page)', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('<html>nope</html>', {
        status: 200,
        headers: { 'content-type': 'text/html' },
      }),
    );
    const res = await GET(req(MDEX));
    expect(res.status).toBe(502);
  });

  it('502 when the upstream fetch throws', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network down'));
    const res = await GET(req(MDEX));
    expect(res.status).toBe(502);
  });

  it('does not write any cache file when caching is disabled', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(imageResponse());
    const res = await GET(req(MDEX));
    expect(res.status).toBe(200);
    expect(existsSync(cacheDir)).toBe(false);
  });
});

const NU = 'https://cdn.novelupdates.com/imgmid/series_12345.jpg';

describe('GET /api/img — Cloudflare-gated host (NovelUpdates)', () => {
  it('502 when no clearance is available (FlareSolverr off / solve failed)', async () => {
    clearanceForHost.mockResolvedValue(null);
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const res = await GET(req(NU));
    expect(res.status).toBe(502);
    // Never fetched the image without clearance.
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('fetches with the clearance Cookie + matching User-Agent and returns the bytes', async () => {
    clearanceForHost.mockResolvedValue({ cookie: 'cf_clearance=CLEAR; __cf_bm=BM', userAgent: 'CF-UA' });
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(imageResponse([7, 8, 9]));

    const res = await GET(req(NU));
    expect(res.status).toBe(200);
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(new Uint8Array([7, 8, 9]));

    const [calledUrl, init] = fetchSpy.mock.calls[0]!;
    expect(calledUrl).toBe(NU);
    const headers = init?.headers as Record<string, string>;
    expect(headers.cookie).toBe('cf_clearance=CLEAR; __cf_bm=BM');
    expect(headers['user-agent']).toBe('CF-UA');
  });

  it('on a 403 (stale clearance) invalidates and re-solves once, then serves the retry', async () => {
    clearanceForHost
      .mockResolvedValueOnce({ cookie: 'cf_clearance=OLD', userAgent: 'CF-UA' })
      .mockResolvedValueOnce({ cookie: 'cf_clearance=NEW', userAgent: 'CF-UA-2' });
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response('forbidden', { status: 403 }))
      .mockResolvedValueOnce(imageResponse([1, 1, 1]));

    const res = await GET(req(NU));
    expect(res.status).toBe(200);
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(new Uint8Array([1, 1, 1]));

    expect(invalidateClearance).toHaveBeenCalledWith('cdn.novelupdates.com');
    expect(clearanceForHost).toHaveBeenCalledTimes(2);
    // The retry used the fresh clearance.
    const retryHeaders = fetchSpy.mock.calls[1]![1]?.headers as Record<string, string>;
    expect(retryHeaders.cookie).toBe('cf_clearance=NEW');
    expect(retryHeaders['user-agent']).toBe('CF-UA-2');
  });
});

describe('GET /api/img — disk cache', () => {
  beforeEach(async () => {
    await imageCacheSetting.set({ enabled: true, dir: cacheDir });
  });

  it('cache miss writes a file and serves the bytes', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(imageResponse([5, 6, 7]));
    const res = await GET(req(MDEX));
    expect(res.status).toBe(200);
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(new Uint8Array([5, 6, 7]));
    const files = readdirSync(cacheDir);
    expect(files).toHaveLength(1);
    expect(files[0]).toMatch(/^[0-9a-f]{64}\.jpg$/);
  });

  it('cache hit serves from disk without fetching upstream on the second request', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(imageResponse([9, 9, 9]));
    const first = await GET(req(MDEX));
    expect(first.status).toBe(200);
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    const second = await GET(req(MDEX));
    expect(second.status).toBe(200);
    expect(second.headers.get('content-type')).toBe('image/jpeg');
    expect(new Uint8Array(await second.arrayBuffer())).toEqual(new Uint8Array([9, 9, 9]));
    // Still only the one fetch from the miss — the hit never touched upstream.
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('derives the extension from the upstream content-type (png)', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(imageResponse([1], 'image/png'));
    await GET(req('https://s4.anilist.co/file/x.png'));
    const files = readdirSync(cacheDir);
    expect(files[0]).toMatch(/\.png$/);
  });

  it('403 for a non-allowlisted host even when caching is enabled', async () => {
    const res = await GET(req('https://evil.example.com/secret'));
    expect(res.status).toBe(403);
  });

  it('degrades to pass-through and still serves bytes when the cache write fails', async () => {
    // Point the cache dir at a path that cannot be created (a file is in the way).
    await imageCacheSetting.set({ enabled: true, dir: join(tmp, 'test.db', 'nope') });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(imageResponse([4, 2]));
    const res = await GET(req(MDEX));
    expect(res.status).toBe(200);
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(new Uint8Array([4, 2]));
    expect(warn).toHaveBeenCalled();
  });
});
