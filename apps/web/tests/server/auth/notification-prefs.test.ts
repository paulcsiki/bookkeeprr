import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { seedDb, type SeedHandle } from '../../integration/helpers/seed';
import { insertUser } from '@/server/db/users';
import { createSession } from '@/server/db/sessions';
import { hashPassword } from '@/server/auth/password';
import { GET, PATCH } from '@/app/api/auth/me/notifications/route';
import { expectShape } from '../../helpers/assert-spec';
import { NotificationPrefsResponse } from '@/server/openapi/schemas/auth';

let h: SeedHandle;

beforeEach(async () => {
  h = await seedDb({ skipDefaultSeries: true });
});
afterEach(() => h.cleanup());

async function makeUserWithSession(
  username = 'alice',
): Promise<{ userId: number; token: string }> {
  const user = await insertUser({
    username,
    passwordHash: await hashPassword('hunter22'),
    role: 'user',
    mustChangePassword: false,
  });
  const session = await createSession({ userId: user.id, userAgent: null, ipAddress: null });
  return { userId: user.id, token: session.token };
}

function getReq(cookie: string | null): Request {
  const headers: Record<string, string> = {};
  if (cookie !== null) headers.cookie = cookie;
  return new Request('http://localhost/api/auth/me/notifications', { method: 'GET', headers });
}

function patchReq(cookie: string | null, body: unknown): Request {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (cookie !== null) headers.cookie = cookie;
  return new Request('http://localhost/api/auth/me/notifications', {
    method: 'PATCH',
    headers,
    body: JSON.stringify(body),
  });
}

describe('GET /api/auth/me/notifications', () => {
  it('returns 401 when unauthenticated', async () => {
    const res = await GET(getReq(null));
    expect(res.status).toBe(401);
  });

  it('returns default prefs when no row exists', async () => {
    const { token } = await makeUserWithSession('alice');
    const res = await GET(getReq(`bookkeeprr_session=${token}`));
    expect(res.status).toBe(200);
    await expectShape(NotificationPrefsResponse, res, 'GET /api/auth/me/notifications');
    const body = (await res.json()) as { prefs: Record<string, unknown> };
    expect(body.prefs.eventGrabSuccess).toBe(true);
    expect(body.prefs.eventImportSuccess).toBe(true);
    expect(body.prefs.eventFailure).toBe(true);
    expect(body.prefs.eventUpdateAvailable).toBe(false);
    expect(body.prefs.channel).toBe('email');
  });

  it('returns the same defaults on repeated calls (idempotent create)', async () => {
    const { token } = await makeUserWithSession('bob');
    const r1 = await GET(getReq(`bookkeeprr_session=${token}`));
    const r2 = await GET(getReq(`bookkeeprr_session=${token}`));
    const b1 = (await r1.json()) as { prefs: Record<string, unknown> };
    const b2 = (await r2.json()) as { prefs: Record<string, unknown> };
    expect(b1.prefs).toEqual(b2.prefs);
  });
});

describe('PATCH /api/auth/me/notifications', () => {
  it('returns 401 when unauthenticated', async () => {
    const res = await PATCH(patchReq(null, {}));
    expect(res.status).toBe(401);
  });

  it('updates a single boolean field', async () => {
    const { token } = await makeUserWithSession('carol');
    const res = await PATCH(
      patchReq(`bookkeeprr_session=${token}`, { eventUpdateAvailable: true }),
    );
    expect(res.status).toBe(200);
    await expectShape(NotificationPrefsResponse, res, 'PATCH /api/auth/me/notifications');
    const body = (await res.json()) as { prefs: Record<string, unknown> };
    expect(body.prefs.eventUpdateAvailable).toBe(true);
    // Others unchanged.
    expect(body.prefs.eventGrabSuccess).toBe(true);
  });

  it('updates the channel', async () => {
    const { token } = await makeUserWithSession('dave');
    const res = await PATCH(patchReq(`bookkeeprr_session=${token}`, { channel: 'push' }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { prefs: Record<string, unknown> };
    expect(body.prefs.channel).toBe('push');
  });

  it('accepts a partial update with multiple fields', async () => {
    const { token } = await makeUserWithSession('eve');
    const res = await PATCH(
      patchReq(`bookkeeprr_session=${token}`, {
        eventGrabSuccess: false,
        eventFailure: false,
        channel: 'webhook',
      }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { prefs: Record<string, unknown> };
    expect(body.prefs.eventGrabSuccess).toBe(false);
    expect(body.prefs.eventFailure).toBe(false);
    expect(body.prefs.channel).toBe('webhook');
    // Unmodified field.
    expect(body.prefs.eventImportSuccess).toBe(true);
  });

  it('returns 400 for invalid channel value', async () => {
    const { token } = await makeUserWithSession('frank');
    const res = await PATCH(
      patchReq(`bookkeeprr_session=${token}`, { channel: 'telegram' }),
    );
    expect(res.status).toBe(400);
  });

  it('returns 400 for unknown fields (strict parsing)', async () => {
    const { token } = await makeUserWithSession('grace');
    const res = await PATCH(
      patchReq(`bookkeeprr_session=${token}`, { unknownField: true }),
    );
    expect(res.status).toBe(400);
  });

  it('persists changes visible via GET', async () => {
    const { token } = await makeUserWithSession('helen');
    await PATCH(patchReq(`bookkeeprr_session=${token}`, { eventUpdateAvailable: true, channel: 'push' }));
    const getRes = await GET(getReq(`bookkeeprr_session=${token}`));
    const body = (await getRes.json()) as { prefs: Record<string, unknown> };
    expect(body.prefs.eventUpdateAvailable).toBe(true);
    expect(body.prefs.channel).toBe('push');
  });
});
