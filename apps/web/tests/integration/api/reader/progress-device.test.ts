/**
 * Tests for the deviceId / deviceName fields added in DS11f.
 *
 * Covers:
 * - PUT with deviceId persists the row and stores the deviceId.
 * - A second PUT from a different deviceId creates a SECOND row.
 * - A repeat PUT from the same deviceId updates (not inserts) the row.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { getDb } from '@/server/db/client';
import { readingProgress } from '@/server/db/schema';
import { eq, and } from 'drizzle-orm';
import { seedDb, type SeedHandle } from '../../helpers/seed';
import { insertUser } from '@/server/db/users';
import { createSession } from '@/server/db/sessions';
import { seedReaderFixtures, type ReaderFixtures } from './fixtures-helper';
import { PUT as KEY_PUT } from '@/app/api/reader/progress/[readableKey]/route';

let h: SeedHandle;
let fx: ReaderFixtures;
let cookie: string;
let userId: number;
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
  userId = user.id;
  const s = await createSession({ userId: user.id, userAgent: null, ipAddress: null });
  cookie = `bookkeeprr_session=${s.token}`;
});

afterEach(() => {
  if (originalMediaRoot === undefined) delete process.env.BOOKKEEPRR_MEDIA_ROOT;
  else process.env.BOOKKEEPRR_MEDIA_ROOT = originalMediaRoot;
  h.cleanup();
});

function reqJson(url: string, cookie: string | null, body: unknown): NextRequest {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (cookie !== null) headers.cookie = cookie;
  return new NextRequest(url, {
    method: 'PUT',
    headers,
    body: JSON.stringify(body),
  });
}

function keyCtx(readableKey: string): { params: Promise<{ readableKey: string }> } {
  return { params: Promise.resolve({ readableKey }) };
}

describe('progress PUT with deviceId', () => {
  it('stores deviceId and deviceName when provided', async () => {
    const key = `page:file:${fx.cbzFileId}`;
    const url = `http://localhost/api/reader/progress/${encodeURIComponent(key)}`;

    const res = await KEY_PUT(
      reqJson(url, cookie, {
        position: 0.3,
        locator: { page: 3 },
        seriesId: fx.comicsSeriesId,
        libraryFileId: fx.cbzFileId,
        contentType: 'manga',
        deviceId: 'device-aaa',
        deviceName: 'Chrome on macOS',
      }),
      keyCtx(key),
    );
    expect(res.status).toBe(200);

    const rows = await getDb()
      .select()
      .from(readingProgress)
      .where(and(eq(readingProgress.userId, userId), eq(readingProgress.readableKey, key)));
    expect(rows.length).toBe(1);
    expect(rows[0]?.deviceId).toBe('device-aaa');
    expect(rows[0]?.deviceName).toBe('Chrome on macOS');
    expect(rows[0]?.position).toBeCloseTo(0.3);
  });

  it('a second PUT from a different deviceId updates the SAME shared row (last-write-wins)', async () => {
    const key = `page:file:${fx.cbzFileId}`;
    const url = `http://localhost/api/reader/progress/${encodeURIComponent(key)}`;
    const baseBody = {
      seriesId: fx.comicsSeriesId,
      libraryFileId: fx.cbzFileId,
      contentType: 'manga',
    };

    await KEY_PUT(
      reqJson(url, cookie, { ...baseBody, position: 0.2, locator: null, deviceId: 'device-aaa', deviceName: 'iPhone' }),
      keyCtx(key),
    );
    await KEY_PUT(
      reqJson(url, cookie, { ...baseBody, position: 0.6, locator: null, deviceId: 'device-bbb', deviceName: 'iPad' }),
      keyCtx(key),
    );

    const rows = await getDb()
      .select()
      .from(readingProgress)
      .where(and(eq(readingProgress.userId, userId), eq(readingProgress.readableKey, key)));

    // Progress is shared across devices → one row, reflecting the last write.
    expect(rows.length).toBe(1);
    expect(rows[0]?.position).toBeCloseTo(0.6);
    expect(rows[0]?.deviceId).toBe('device-bbb');
    expect(rows[0]?.deviceName).toBe('iPad');
  });

  it('a repeat PUT from the same deviceId updates (not inserts) the row', async () => {
    const key = `page:file:${fx.cbzFileId}`;
    const url = `http://localhost/api/reader/progress/${encodeURIComponent(key)}`;
    const baseBody = {
      seriesId: fx.comicsSeriesId,
      libraryFileId: fx.cbzFileId,
      contentType: 'manga',
      deviceId: 'device-aaa',
      deviceName: 'Chrome',
    };

    await KEY_PUT(reqJson(url, cookie, { ...baseBody, position: 0.2, locator: null }), keyCtx(key));
    await KEY_PUT(reqJson(url, cookie, { ...baseBody, position: 0.5, locator: null }), keyCtx(key));

    const rows = await getDb()
      .select()
      .from(readingProgress)
      .where(and(eq(readingProgress.userId, userId), eq(readingProgress.readableKey, key)));
    expect(rows.length).toBe(1);
    expect(rows[0]?.position).toBeCloseTo(0.5);
  });

  it('PUT without deviceId falls back to legacy single-row behavior', async () => {
    const key = `page:file:${fx.cbzFileId}`;
    const url = `http://localhost/api/reader/progress/${encodeURIComponent(key)}`;
    const baseBody = {
      seriesId: fx.comicsSeriesId,
      libraryFileId: fx.cbzFileId,
      contentType: 'manga',
      position: 0.4,
      locator: null,
    };

    await KEY_PUT(reqJson(url, cookie, { ...baseBody, position: 0.2 }), keyCtx(key));
    await KEY_PUT(reqJson(url, cookie, { ...baseBody, position: 0.4 }), keyCtx(key));

    const rows = await getDb()
      .select()
      .from(readingProgress)
      .where(and(eq(readingProgress.userId, userId), eq(readingProgress.readableKey, key)));
    // Still one row; updated in-place.
    expect(rows.length).toBe(1);
    expect(rows[0]?.position).toBeCloseTo(0.4);
    expect(rows[0]?.deviceId).toBeNull();
  });
});
