import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { seedDb, type SeedHandle } from '../../helpers/seed';
import { insertUser } from '@/server/db/users';
import { createSession } from '@/server/db/sessions';
import { seedReaderFixtures, type ReaderFixtures } from './fixtures-helper';
import { GET as MANIFEST_GET } from '@/app/api/reader/manifest/route';
import { GET as LIST_GET } from '@/app/api/reader/progress/route';
import {
  GET as KEY_GET,
  PUT as KEY_PUT,
  DELETE as KEY_DELETE,
} from '@/app/api/reader/progress/[readableKey]/route';

let h: SeedHandle;
let fx: ReaderFixtures;
let cookieA: string;
let cookieB: string;
let originalMediaRoot: string | undefined;

beforeEach(async () => {
  h = await seedDb({ skipDefaultSeries: true });
  originalMediaRoot = process.env.BOOKKEEPRR_MEDIA_ROOT;
  fx = await seedReaderFixtures(h);
  const userA = await insertUser({
    username: 'alice',
    passwordHash: 'x',
    role: 'admin',
    mustChangePassword: false,
  });
  const userB = await insertUser({
    username: 'bob',
    passwordHash: 'x',
    role: 'user',
    mustChangePassword: false,
  });
  const sA = await createSession({ userId: userA.id, userAgent: null, ipAddress: null });
  const sB = await createSession({ userId: userB.id, userAgent: null, ipAddress: null });
  cookieA = `bookkeeprr_session=${sA.token}`;
  cookieB = `bookkeeprr_session=${sB.token}`;
});

afterEach(() => {
  if (originalMediaRoot === undefined) delete process.env.BOOKKEEPRR_MEDIA_ROOT;
  else process.env.BOOKKEEPRR_MEDIA_ROOT = originalMediaRoot;
  h.cleanup();
});

function reqGet(url: string, cookie: string | null): NextRequest {
  const headers: Record<string, string> = {};
  if (cookie !== null) headers.cookie = cookie;
  return new NextRequest(url, { headers });
}

function reqJson(url: string, method: string, cookie: string | null, body: unknown): NextRequest {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (cookie !== null) headers.cookie = cookie;
  return new NextRequest(url, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

function keyCtx(readableKey: string): { params: Promise<{ readableKey: string }> } {
  return { params: Promise.resolve({ readableKey }) };
}

describe('reader API routes', () => {
  it('GET /manifest?fileId=<cbz> returns a comics manifest', async () => {
    const res = await MANIFEST_GET(
      reqGet(`http://localhost/api/reader/manifest?fileId=${fx.cbzFileId}`, cookieA),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.reader).toBe('comics');
    expect(body.pageCount).toBe(3);
  });

  it('GET /manifest with no cookie returns 401', async () => {
    const res = await MANIFEST_GET(
      reqGet(`http://localhost/api/reader/manifest?fileId=${fx.cbzFileId}`, null),
    );
    expect(res.status).toBe(401);
  });

  it('GET /manifest with neither id returns 400', async () => {
    const res = await MANIFEST_GET(reqGet('http://localhost/api/reader/manifest', cookieA));
    expect(res.status).toBe(400);
  });

  it('PUT then GET progress; isolation between users', async () => {
    const key = `page:file:${fx.cbzFileId}`;
    const encoded = encodeURIComponent(key);
    const url = `http://localhost/api/reader/progress/${encoded}`;

    const putRes = await KEY_PUT(
      reqJson(url, 'PUT', cookieA, {
        position: 0.4,
        locator: { page: 5 },
        seriesId: fx.comicsSeriesId,
        libraryFileId: fx.cbzFileId,
        contentType: 'manga',
      }),
      keyCtx(key),
    );
    expect(putRes.status).toBe(200);

    const getA = await KEY_GET(reqGet(url, cookieA), keyCtx(key));
    expect(getA.status).toBe(200);
    const bodyA = await getA.json();
    expect(bodyA.position).toBe(0.4);
    expect(bodyA.locator).toEqual({ page: 5 });
    expect(bodyA.readableKey).toBe(key);

    // user B sees the default (isolation)
    const getB = await KEY_GET(reqGet(url, cookieB), keyCtx(key));
    expect(getB.status).toBe(200);
    const bodyB = await getB.json();
    expect(bodyB.position).toBe(0);
    expect(bodyB.finished).toBe(false);
  });

  it('PUT position:1 then GET /manifest shows position 0 + restartedFromFinish', async () => {
    const key = `page:file:${fx.cbzFileId}`;
    const url = `http://localhost/api/reader/progress/${encodeURIComponent(key)}`;
    const putRes = await KEY_PUT(
      reqJson(url, 'PUT', cookieA, {
        position: 1,
        locator: { page: 3 },
        seriesId: fx.comicsSeriesId,
        libraryFileId: fx.cbzFileId,
        contentType: 'manga',
      }),
      keyCtx(key),
    );
    expect(putRes.status).toBe(200);

    const res = await MANIFEST_GET(
      reqGet(`http://localhost/api/reader/manifest?fileId=${fx.cbzFileId}`, cookieA),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.progress.position).toBe(0);
    expect(body.progress.restartedFromFinish).toBe(true);
  });

  it('GET /progress list contains the cbz key', async () => {
    const key = `page:file:${fx.cbzFileId}`;
    const url = `http://localhost/api/reader/progress/${encodeURIComponent(key)}`;
    await KEY_PUT(
      reqJson(url, 'PUT', cookieA, {
        position: 0.5,
        locator: { page: 2 },
        seriesId: fx.comicsSeriesId,
        libraryFileId: fx.cbzFileId,
        contentType: 'manga',
      }),
      keyCtx(key),
    );

    const listRes = await LIST_GET(reqGet('http://localhost/api/reader/progress', cookieA));
    expect(listRes.status).toBe(200);
    const body = await listRes.json();
    const keys = body.items.map((i: { readableKey: string }) => i.readableKey);
    expect(keys).toContain(key);
  });

  it('DELETE clears progress; subsequent GET is default', async () => {
    const key = `page:file:${fx.cbzFileId}`;
    const url = `http://localhost/api/reader/progress/${encodeURIComponent(key)}`;
    await KEY_PUT(
      reqJson(url, 'PUT', cookieA, {
        position: 0.7,
        locator: { page: 6 },
        seriesId: fx.comicsSeriesId,
        libraryFileId: fx.cbzFileId,
        contentType: 'manga',
      }),
      keyCtx(key),
    );

    const delRes = await KEY_DELETE(reqJson(url, 'DELETE', cookieA, undefined), keyCtx(key));
    expect(delRes.status).toBe(200);
    expect(await delRes.json()).toEqual({ ok: true });

    const getRes = await KEY_GET(reqGet(url, cookieA), keyCtx(key));
    const body = await getRes.json();
    expect(body.position).toBe(0);
    expect(body.finished).toBe(false);
  });

  it('GET /progress/garbage returns 400', async () => {
    const res = await KEY_GET(
      reqGet('http://localhost/api/reader/progress/garbage', cookieA),
      keyCtx('garbage'),
    );
    expect(res.status).toBe(400);
  });
});
