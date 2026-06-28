import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { seedDb, type SeedHandle } from '../helpers/seed';
import { expectShape } from '../../helpers/assert-spec';
import { ErrorResponse, MessageResponse } from '@/server/openapi/schemas/common';
import { MalSettingsResponse, SettingsOkResponse } from '@/server/openapi/schemas/settings';
import { malClientIdSetting } from '@/server/db/settings/mal';
import { GET, PUT } from '@/app/api/settings/mal/route';
import { insertUser } from '@/server/db/users';
import { createSession } from '@/server/db/sessions';
import { hashPassword } from '@/server/auth/password';

let h: SeedHandle;
beforeEach(async () => {
  h = await seedDb();
});
afterEach(() => h.cleanup());

async function adminCookie(): Promise<string> {
  const admin = await insertUser({
    username: 'admin',
    passwordHash: await hashPassword('hunter22'),
    role: 'admin',
    mustChangePassword: false,
  });
  const s = await createSession({ userId: admin.id, userAgent: null, ipAddress: null });
  return `bookkeeprr_session=${s.token}`;
}

async function userCookie(): Promise<string> {
  const user = await insertUser({
    username: 'plain',
    passwordHash: await hashPassword('hunter22'),
    role: 'user',
    mustChangePassword: false,
  });
  const s = await createSession({ userId: user.id, userAgent: null, ipAddress: null });
  return `bookkeeprr_session=${s.token}`;
}

describe('GET/PUT /api/settings/mal', () => {
  it('GET returns redacted clientId when set', async () => {
    await malClientIdSetting.set('secret-id');
    const res = await GET();
    await expectShape(MalSettingsResponse, res, 'GET /api/settings/mal');
    const body = await res.json();
    expect(body.clientId).toBe('****');
  });

  it('GET returns empty string when not set', async () => {
    const res = await GET();
    const body = await res.json();
    expect(body.clientId).toBe('');
  });

  it('PUT 401 without a session', async () => {
    const res = await PUT(
      new Request('http://t', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ clientId: 'x' }),
      }),
    );
    expect(res.status).toBe(401);
    await expectShape(MessageResponse, res, 'PUT /api/settings/mal (401)');
  });

  it('PUT 403 for non-admin', async () => {
    const cookie = await userCookie();
    const res = await PUT(
      new Request('http://t', {
        method: 'PUT',
        headers: { cookie, 'content-type': 'application/json' },
        body: JSON.stringify({ clientId: 'x' }),
      }),
    );
    expect(res.status).toBe(403);
    await expectShape(MessageResponse, res, 'PUT /api/settings/mal (403)');
  });

  it('PUT writes a new clientId for admin', async () => {
    const cookie = await adminCookie();
    const res = await PUT(
      new Request('http://t', {
        method: 'PUT',
        headers: { cookie, 'content-type': 'application/json' },
        body: JSON.stringify({ clientId: 'new-id' }),
      }),
    );
    expect(res.status).toBe(200);
    await expectShape(SettingsOkResponse, res, 'PUT /api/settings/mal');
    expect(await malClientIdSetting.get()).toBe('new-id');
  });

  it('PUT with empty clientId retains existing', async () => {
    const cookie = await adminCookie();
    await malClientIdSetting.set('keep-me');
    const res = await PUT(
      new Request('http://t', {
        method: 'PUT',
        headers: { cookie, 'content-type': 'application/json' },
        body: JSON.stringify({ clientId: '' }),
      }),
    );
    expect(res.status).toBe(200);
    expect(await malClientIdSetting.get()).toBe('keep-me');
  });

  it('PUT with mask placeholder retains existing', async () => {
    const cookie = await adminCookie();
    await malClientIdSetting.set('keep-me');
    const res = await PUT(
      new Request('http://t', {
        method: 'PUT',
        headers: { cookie, 'content-type': 'application/json' },
        body: JSON.stringify({ clientId: '****' }),
      }),
    );
    expect(res.status).toBe(200);
    expect(await malClientIdSetting.get()).toBe('keep-me');
  });

  it('PUT 400 on bad shape', async () => {
    const cookie = await adminCookie();
    const res = await PUT(
      new Request('http://t', {
        method: 'PUT',
        headers: { cookie, 'content-type': 'application/json' },
        body: JSON.stringify({ clientId: 42 }),
      }),
    );
    expect(res.status).toBe(400);
    await expectShape(ErrorResponse, res, 'PUT /api/settings/mal (400)');
  });
});
