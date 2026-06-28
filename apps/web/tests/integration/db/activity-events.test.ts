import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { seedDb, type SeedHandle } from '../helpers/seed';
import { insertUser } from '@/server/db/users';
import { createSession } from '@/server/db/sessions';
import {
  listRecentActivity,
  listUserActivity,
  recordActivity,
} from '@/server/db/activity-events';
import * as client from '@/server/db/client';
import { PUT as PROGRESS_PUT } from '@/app/api/reader/progress/[readableKey]/route';

let h: SeedHandle;
let userId: number;
let cookie: string;

beforeEach(async () => {
  // Keep the default series + volume so emitter joins resolve.
  h = await seedDb();
  const user = await insertUser({
    username: 'reader',
    passwordHash: 'x',
    role: 'user',
    mustChangePassword: false,
  });
  userId = user.id;
  const s = await createSession({ userId, userAgent: null, ipAddress: null });
  cookie = `bookkeeprr_session=${s.token}`;
});
afterEach(() => {
  vi.restoreAllMocks();
  h.cleanup();
});

describe('activity-events DAL', () => {
  it('recordActivity writes a row that lists back', async () => {
    await recordActivity({
      userId,
      kind: 'finished',
      seriesId: h.seriesId,
      volumeId: h.volumeId,
      meta: { readableKey: 'audio:vol:1' },
    });
    const items = await listRecentActivity(10);
    expect(items).toHaveLength(1);
    expect(items[0]!.kind).toBe('finished');
    expect(items[0]!.userId).toBe(userId);
    expect(items[0]!.seriesId).toBe(h.seriesId);
    expect(items[0]!.meta).toEqual({ readableKey: 'audio:vol:1' });
    // Joined series fields.
    expect(items[0]!.seriesTitle).toBe('Test Series');
    // Joined volume fields (seed creates volume number 1 titled 'v1').
    expect(items[0]!.volumeNumber).toBe(1);
    expect(items[0]!.volumeTitle).toBe('v1');
  });

  it('volumeNumber and volumeTitle are null when no volumeId on the event', async () => {
    await recordActivity({
      userId,
      kind: 'added',
      seriesId: h.seriesId,
      // no volumeId
    });
    const items = await listRecentActivity(10);
    expect(items).toHaveLength(1);
    expect(items[0]!.volumeNumber).toBeNull();
    expect(items[0]!.volumeTitle).toBeNull();
  });

  it('listRecentActivity returns newest first across users', async () => {
    const other = await insertUser({
      username: 'other',
      passwordHash: 'x',
      role: 'user',
      mustChangePassword: false,
    });
    await recordActivity({ userId, kind: 'added', seriesId: h.seriesId });
    await recordActivity({ userId: other.id, kind: 'grabbed', seriesId: h.seriesId });
    const items = await listRecentActivity(10);
    expect(items.map((i) => i.kind)).toEqual(['grabbed', 'added']);
  });

  it('records a null-user (system) event', async () => {
    await recordActivity({ userId: null, kind: 'imported', seriesId: h.seriesId });
    const items = await listRecentActivity(10);
    expect(items[0]!.userId).toBeNull();
    expect(items[0]!.kind).toBe('imported');
  });

  it('listUserActivity scopes to one user', async () => {
    const other = await insertUser({
      username: 'other',
      passwordHash: 'x',
      role: 'user',
      mustChangePassword: false,
    });
    await recordActivity({ userId, kind: 'added', seriesId: h.seriesId });
    await recordActivity({ userId: other.id, kind: 'added', seriesId: h.seriesId });
    const mine = await listUserActivity(userId, 10);
    expect(mine).toHaveLength(1);
    expect(mine[0]!.userId).toBe(userId);
  });

  it('recordActivity is best-effort: a DB failure does not throw', async () => {
    vi.spyOn(client, 'getDb').mockImplementation(() => {
      throw new Error('boom');
    });
    await expect(recordActivity({ userId, kind: 'added' })).resolves.toBeUndefined();
  });
});

describe('reader finish emits an activity event', () => {
  function putProgress(position: number): NextRequest {
    return new NextRequest('http://localhost/api/reader/progress/audio:vol:1', {
      method: 'PUT',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({
        position,
        seriesId: h.seriesId,
        volumeId: h.volumeId,
        contentType: 'manga',
      }),
    });
  }
  const ctx = { params: Promise.resolve({ readableKey: 'audio:vol:1' }) };

  it('records a finished event when position crosses 100% (once)', async () => {
    // Partial save: no finish event.
    await PROGRESS_PUT(putProgress(0.5), { params: Promise.resolve({ readableKey: 'audio:vol:1' }) });
    expect(await listRecentActivity(10)).toHaveLength(0);

    // Crossing 100%: one finished event.
    await PROGRESS_PUT(putProgress(1), ctx);
    let items = await listRecentActivity(10);
    expect(items).toHaveLength(1);
    expect(items[0]!.kind).toBe('finished');
    expect(items[0]!.seriesId).toBe(h.seriesId);
    expect(items[0]!.volumeId).toBe(h.volumeId);
    expect(items[0]!.meta).toEqual({ readableKey: 'audio:vol:1' });

    // Saving again while already finished does NOT re-emit.
    await PROGRESS_PUT(putProgress(1), { params: Promise.resolve({ readableKey: 'audio:vol:1' }) });
    items = await listRecentActivity(10);
    expect(items).toHaveLength(1);
  });
});
