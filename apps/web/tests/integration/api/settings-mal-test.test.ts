import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { seedDb, type SeedHandle } from '../helpers/seed';
import { expectShape } from '../../helpers/assert-spec';
import {
  ConnectionTestFailureResponse,
  SettingsOkResponse,
} from '@/server/openapi/schemas/settings';
import { malClientIdSetting } from '@/server/db/settings/mal';
import { POST } from '@/app/api/settings/mal/test/route';
import {
  __setMalFetcherForTests,
  __resetMalForTests,
} from '@/server/integrations/mal/client';
import { insertUser } from '@/server/db/users';
import { createSession } from '@/server/db/sessions';
import { hashPassword } from '@/server/auth/password';

const SEARCH_OK = JSON.stringify({ data: [], paging: {} });

let h: SeedHandle;
beforeEach(async () => {
  h = await seedDb();
  __resetMalForTests();
});
afterEach(() => {
  __resetMalForTests();
  h.cleanup();
});

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

describe('POST /api/settings/mal/test', () => {
  it('401 without a session', async () => {
    const res = await POST(
      new Request('http://t', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ clientId: 'x' }),
      }),
    );
    expect(res.status).toBe(401);
  });

  it('403 for non-admin', async () => {
    const cookie = await userCookie();
    const res = await POST(
      new Request('http://t', {
        method: 'POST',
        headers: { cookie, 'content-type': 'application/json' },
        body: JSON.stringify({ clientId: 'x' }),
      }),
    );
    expect(res.status).toBe(403);
  });

  it('200 testing a Client ID from the body', async () => {
    const cookie = await adminCookie();
    __setMalFetcherForTests(async () => ({ ok: true, status: 200, text: async () => SEARCH_OK }));
    const res = await POST(
      new Request('http://t', {
        method: 'POST',
        headers: { cookie, 'content-type': 'application/json' },
        body: JSON.stringify({ clientId: 'good-id' }),
      }),
    );
    expect(res.status).toBe(200);
    await expectShape(SettingsOkResponse, res, 'POST /api/settings/mal/test');
    expect((await res.json()).ok).toBe(true);
    // The stored value is untouched (was empty).
    expect(await malClientIdSetting.get()).toBe('');
  });

  it('200 testing the stored Client ID when none in body', async () => {
    const cookie = await adminCookie();
    await malClientIdSetting.set('stored-id');
    __setMalFetcherForTests(async () => ({ ok: true, status: 200, text: async () => SEARCH_OK }));
    const res = await POST(
      new Request('http://t', {
        method: 'POST',
        headers: { cookie, 'content-type': 'application/json' },
        body: JSON.stringify({}),
      }),
    );
    expect(res.status).toBe(200);
    expect((await res.json()).ok).toBe(true);
    expect(await malClientIdSetting.get()).toBe('stored-id');
  });

  it('502 when MAL rejects the Client ID', async () => {
    const cookie = await adminCookie();
    __setMalFetcherForTests(async () => ({ ok: false, status: 401, text: async () => '' }));
    const res = await POST(
      new Request('http://t', {
        method: 'POST',
        headers: { cookie, 'content-type': 'application/json' },
        body: JSON.stringify({ clientId: 'bad-id' }),
      }),
    );
    expect(res.status).toBe(502);
    await expectShape(ConnectionTestFailureResponse, res, 'POST /api/settings/mal/test (502)');
    expect((await res.json()).ok).toBe(false);
  });

  it('502 when stored Client ID is missing', async () => {
    const cookie = await adminCookie();
    const res = await POST(
      new Request('http://t', {
        method: 'POST',
        headers: { cookie, 'content-type': 'application/json' },
        body: JSON.stringify({}),
      }),
    );
    expect(res.status).toBe(502);
  });
});
