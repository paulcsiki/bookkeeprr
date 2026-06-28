import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { seedDb, type SeedHandle } from '../helpers/seed';
import { expectShape } from '../../helpers/assert-spec';
import { ErrorResponse } from '@/server/openapi/schemas/common';
import {
  ProwlarrSettingsResponse,
  SettingsOkResponse,
} from '@/server/openapi/schemas/settings';
import { prowlarrConnectionSetting } from '@/server/db/settings/prowlarr';
import { GET, PUT } from '@/app/api/settings/prowlarr/route';
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

describe('GET/PUT /api/settings/prowlarr', () => {
  it('GET returns url and masked apiKey when set', async () => {
    await prowlarrConnectionSetting.set({ url: 'http://prowlarr:9696', apiKey: 'secretkey' });
    const res = await GET();
    await expectShape(ProwlarrSettingsResponse, res, 'GET /api/settings/prowlarr');
    const body = await res.json();
    expect(body.url).toBe('http://prowlarr:9696');
    expect(body.apiKey).toBe('****');
  });

  it('GET returns empty apiKey when not set', async () => {
    await prowlarrConnectionSetting.set({ url: 'http://prowlarr:9696', apiKey: '' });
    const res = await GET();
    const body = await res.json();
    expect(body.url).toBe('http://prowlarr:9696');
    expect(body.apiKey).toBe('');
  });

  it('PUT writes new url + apiKey', async () => {
    const cookie = await adminCookie();
    const res = await PUT(
      new Request('http://t', {
        method: 'PUT',
        headers: { cookie, 'content-type': 'application/json' },
        body: JSON.stringify({ url: 'http://new:9696', apiKey: 'newkey' }),
      }),
    );
    expect(res.status).toBe(200);
    await expectShape(SettingsOkResponse, res, 'PUT /api/settings/prowlarr');
    expect(await prowlarrConnectionSetting.get()).toEqual({ url: 'http://new:9696', apiKey: 'newkey' });
  });

  it('PUT with blank apiKey retains existing key but updates url', async () => {
    const cookie = await adminCookie();
    await prowlarrConnectionSetting.set({ url: 'http://old:9696', apiKey: 'keep-me' });
    const res = await PUT(
      new Request('http://t', {
        method: 'PUT',
        headers: { cookie, 'content-type': 'application/json' },
        body: JSON.stringify({ url: 'http://updated:9696', apiKey: '' }),
      }),
    );
    expect(res.status).toBe(200);
    expect(await prowlarrConnectionSetting.get()).toEqual({ url: 'http://updated:9696', apiKey: 'keep-me' });
  });

  it('PUT with masked apiKey (****) retains existing key', async () => {
    const cookie = await adminCookie();
    await prowlarrConnectionSetting.set({ url: 'http://old:9696', apiKey: 'keep-me' });
    const res = await PUT(
      new Request('http://t', {
        method: 'PUT',
        headers: { cookie, 'content-type': 'application/json' },
        body: JSON.stringify({ url: 'http://updated:9696', apiKey: '****' }),
      }),
    );
    expect(res.status).toBe(200);
    expect(await prowlarrConnectionSetting.get()).toEqual({ url: 'http://updated:9696', apiKey: 'keep-me' });
  });

  it('PUT 400 on bad shape', async () => {
    const cookie = await adminCookie();
    const res = await PUT(
      new Request('http://t', {
        method: 'PUT',
        headers: { cookie, 'content-type': 'application/json' },
        body: JSON.stringify({ url: 42 }),
      }),
    );
    expect(res.status).toBe(400);
    await expectShape(ErrorResponse, res, 'PUT /api/settings/prowlarr (400)');
  });
});
