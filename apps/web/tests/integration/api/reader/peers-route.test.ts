/**
 * Tests for GET /api/reader/progress/<readableKey>/peers
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { seedDb, type SeedHandle } from '../../helpers/seed';
import { insertUser } from '@/server/db/users';
import { createSession } from '@/server/db/sessions';
import { seedReaderFixtures, type ReaderFixtures } from './fixtures-helper';
import { PUT as KEY_PUT } from '@/app/api/reader/progress/[readableKey]/route';
import { GET as PEERS_GET } from '@/app/api/reader/progress/[readableKey]/peers/route';

let h: SeedHandle;
let fx: ReaderFixtures;
let cookieA: string;
let originalMediaRoot: string | undefined;

beforeEach(async () => {
  h = await seedDb({ skipDefaultSeries: true });
  originalMediaRoot = process.env.BOOKKEEPRR_MEDIA_ROOT;
  fx = await seedReaderFixtures(h);
  const user = await insertUser({
    username: 'alice',
    passwordHash: 'x',
    role: 'admin',
    mustChangePassword: false,
  });
  const s = await createSession({ userId: user.id, userAgent: null, ipAddress: null });
  cookieA = `bookkeeprr_session=${s.token}`;
});

afterEach(() => {
  if (originalMediaRoot === undefined) delete process.env.BOOKKEEPRR_MEDIA_ROOT;
  else process.env.BOOKKEEPRR_MEDIA_ROOT = originalMediaRoot;
  h.cleanup();
});

function reqPut(url: string, cookie: string, body: unknown): NextRequest {
  return new NextRequest(url, {
    method: 'PUT',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify(body),
  });
}

function reqGet(url: string, cookie: string): NextRequest {
  return new NextRequest(url, { headers: { cookie } });
}

function keyCtx(readableKey: string): { params: Promise<{ readableKey: string }> } {
  return { params: Promise.resolve({ readableKey }) };
}

describe('GET /api/reader/progress/<key>/peers', () => {
  it('returns 401 when not authenticated', async () => {
    const key = `page:file:${fx.cbzFileId}`;
    const res = await PEERS_GET(
      new NextRequest(
        `http://localhost/api/reader/progress/${encodeURIComponent(key)}/peers?selfDeviceId=aaa`,
      ),
      keyCtx(key),
    );
    expect(res.status).toBe(401);
  });

  it('returns 400 when selfDeviceId is missing', async () => {
    const key = `page:file:${fx.cbzFileId}`;
    const res = await PEERS_GET(
      reqGet(
        `http://localhost/api/reader/progress/${encodeURIComponent(key)}/peers`,
        cookieA,
      ),
      keyCtx(key),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('selfDeviceId');
  });

  it('returns 400 for an invalid readableKey', async () => {
    const res = await PEERS_GET(
      reqGet(
        'http://localhost/api/reader/progress/garbage/peers?selfDeviceId=aaa',
        cookieA,
      ),
      keyCtx('garbage'),
    );
    expect(res.status).toBe(400);
  });

  it('returns empty peers when no other device has written', async () => {
    const key = `page:file:${fx.cbzFileId}`;
    const baseUrl = `http://localhost/api/reader/progress/${encodeURIComponent(key)}`;

    // Write from device-aaa
    await KEY_PUT(
      reqPut(baseUrl, cookieA, {
        position: 0.3,
        locator: null,
        seriesId: fx.comicsSeriesId,
        libraryFileId: fx.cbzFileId,
        contentType: 'manga',
        deviceId: 'device-aaa',
        deviceName: 'MacBook',
      }),
      keyCtx(key),
    );

    // Peers of device-aaa should be empty
    const res = await PEERS_GET(
      reqGet(`${baseUrl}/peers?selfDeviceId=device-aaa`, cookieA),
      keyCtx(key),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.peers).toHaveLength(0);
  });

  it('two devices write progress; GET excludes the requesting device', async () => {
    const key = `page:file:${fx.cbzFileId}`;
    const baseUrl = `http://localhost/api/reader/progress/${encodeURIComponent(key)}`;
    const baseBody = {
      seriesId: fx.comicsSeriesId,
      libraryFileId: fx.cbzFileId,
      contentType: 'manga',
      locator: null,
    };

    // device-aaa at 20%
    await KEY_PUT(
      reqPut(baseUrl, cookieA, { ...baseBody, position: 0.2, deviceId: 'device-aaa', deviceName: 'iPhone' }),
      keyCtx(key),
    );
    // device-bbb at 60%
    await KEY_PUT(
      reqPut(baseUrl, cookieA, { ...baseBody, position: 0.6, deviceId: 'device-bbb', deviceName: 'iPad' }),
      keyCtx(key),
    );

    // Progress is one shared row, last-written by device-bbb. From device-aaa's
    // perspective that shared row is a peer → "resume from device-bbb at 60%".
    const resA = await PEERS_GET(
      reqGet(`${baseUrl}/peers?selfDeviceId=device-aaa`, cookieA),
      keyCtx(key),
    );
    expect(resA.status).toBe(200);
    const bodyA = await resA.json();
    expect(bodyA.peers).toHaveLength(1);
    expect(bodyA.peers[0].deviceId).toBe('device-bbb');
    expect(bodyA.peers[0].deviceName).toBe('iPad');
    expect(bodyA.peers[0].position).toBeCloseTo(0.6);
    expect(typeof bodyA.peers[0].updatedAt).toBe('string');

    // From device-bbb's perspective the shared row IS its own latest write, so
    // there's no peer to hand off from.
    const resB = await PEERS_GET(
      reqGet(`${baseUrl}/peers?selfDeviceId=device-bbb`, cookieA),
      keyCtx(key),
    );
    expect(resB.status).toBe(200);
    const bodyB = await resB.json();
    expect(bodyB.peers).toHaveLength(0);
  });

  it('excludes legacy (null-device) rows from peers', async () => {
    const key = `page:file:${fx.cbzFileId}`;
    const baseUrl = `http://localhost/api/reader/progress/${encodeURIComponent(key)}`;
    const baseBody = {
      seriesId: fx.comicsSeriesId,
      libraryFileId: fx.cbzFileId,
      contentType: 'manga',
      locator: null,
    };

    // Write a legacy row (no deviceId)
    await KEY_PUT(
      reqPut(baseUrl, cookieA, { ...baseBody, position: 0.8 }),
      keyCtx(key),
    );

    const res = await PEERS_GET(
      reqGet(`${baseUrl}/peers?selfDeviceId=device-aaa`, cookieA),
      keyCtx(key),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    // Legacy row has no deviceId — must be excluded
    expect(body.peers).toHaveLength(0);
  });
});
