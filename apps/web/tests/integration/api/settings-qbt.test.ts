import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { seedDb, type SeedHandle } from '../helpers/seed';
import { expectShape } from '../../helpers/assert-spec';
import { ErrorResponse } from '@/server/openapi/schemas/common';
import { QbtSettingsResponse, SettingsOkResponse } from '@/server/openapi/schemas/settings';
import { qbtConnectionSetting } from '@/server/db/settings/qbt';
import { GET, PUT } from '@/app/api/settings/qbt/route';
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

describe('GET/PUT /api/settings/qbt', () => {
  it('GET returns redacted password', async () => {
    await qbtConnectionSetting.set({
      host: 'h',
      port: 1,
      username: 'u',
      password: 'secret',
      useHttps: false,
    });
    const res = await GET();
    await expectShape(QbtSettingsResponse, res, 'GET /api/settings/qbt');
    const body = await res.json();
    expect(body.password).toBe('****');
    expect(body.username).toBe('u');
  });

  it('GET returns empty password when not set', async () => {
    const res = await GET();
    const body = await res.json();
    expect(body.password).toBe('');
  });

  it('PUT roundtrips with new password', async () => {
    const cookie = await adminCookie();
    const res = await PUT(
      new Request('http://t', {
        method: 'PUT',
        headers: { cookie, 'content-type': 'application/json' },
        body: JSON.stringify({
          host: 'h',
          port: 1,
          username: 'u',
          password: 'newpw',
          useHttps: true,
        }),
      }),
    );
    expect(res.status).toBe(200);
    await expectShape(SettingsOkResponse, res, 'PUT /api/settings/qbt');
    const stored = await qbtConnectionSetting.get();
    expect(stored.password).toBe('newpw');
    expect(stored.useHttps).toBe(true);
  });

  it('PUT empty password retains existing', async () => {
    const cookie = await adminCookie();
    await qbtConnectionSetting.set({
      host: 'h',
      port: 1,
      username: 'u',
      password: 'kept',
      useHttps: false,
    });
    const res = await PUT(
      new Request('http://t', {
        method: 'PUT',
        headers: { cookie, 'content-type': 'application/json' },
        body: JSON.stringify({
          host: 'h2',
          port: 2,
          username: 'u2',
          password: '',
          useHttps: false,
        }),
      }),
    );
    expect(res.status).toBe(200);
    const stored = await qbtConnectionSetting.get();
    expect(stored.host).toBe('h2');
    expect(stored.password).toBe('kept');
  });

  it('PUT 400 on bad shape', async () => {
    const cookie = await adminCookie();
    const res = await PUT(
      new Request('http://t', {
        method: 'PUT',
        headers: { cookie, 'content-type': 'application/json' },
        body: JSON.stringify({ host: 42 }),
      }),
    );
    expect(res.status).toBe(400);
    await expectShape(ErrorResponse, res, 'PUT /api/settings/qbt (400)');
  });
});
