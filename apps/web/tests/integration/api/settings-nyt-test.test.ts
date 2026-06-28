import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { seedDb, type SeedHandle } from '../helpers/seed';
import { expectShape } from '../../helpers/assert-spec';
import {
  ConnectionTestFailureResponse,
  SettingsOkResponse,
} from '@/server/openapi/schemas/settings';
import { nytApiKeySetting } from '@/server/db/settings/nyt';
import { POST } from '@/app/api/settings/nyt/test/route';
import { __setNytFetcherForTests, __resetNytForTests } from '@/server/integrations/nyt/client';
import { insertUser } from '@/server/db/users';
import { createSession } from '@/server/db/sessions';
import { hashPassword } from '@/server/auth/password';

const LIST_OK = JSON.stringify({ status: 'OK', results: { books: [] } });

let h: SeedHandle;
beforeEach(async () => {
  h = await seedDb();
  __resetNytForTests();
});
afterEach(() => {
  __resetNytForTests();
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

describe('POST /api/settings/nyt/test', () => {
  it('401 without a session', async () => {
    const res = await POST(
      new Request('http://t', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ apiKey: 'x' }),
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
        body: JSON.stringify({ apiKey: 'x' }),
      }),
    );
    expect(res.status).toBe(403);
  });

  it('200 testing an API key from the body, stored value untouched', async () => {
    const cookie = await adminCookie();
    __setNytFetcherForTests(async () => ({ ok: true, status: 200, text: async () => LIST_OK }));
    const res = await POST(
      new Request('http://t', {
        method: 'POST',
        headers: { cookie, 'content-type': 'application/json' },
        body: JSON.stringify({ apiKey: 'good-key' }),
      }),
    );
    expect(res.status).toBe(200);
    await expectShape(SettingsOkResponse, res, 'POST /api/settings/nyt/test');
    expect((await res.json()).ok).toBe(true);
    expect(await nytApiKeySetting.get()).toBe('');
  });

  it('200 testing the stored API key when none in body', async () => {
    const cookie = await adminCookie();
    await nytApiKeySetting.set('stored-key');
    __setNytFetcherForTests(async () => ({ ok: true, status: 200, text: async () => LIST_OK }));
    const res = await POST(
      new Request('http://t', {
        method: 'POST',
        headers: { cookie, 'content-type': 'application/json' },
        body: JSON.stringify({}),
      }),
    );
    expect(res.status).toBe(200);
    expect((await res.json()).ok).toBe(true);
    expect(await nytApiKeySetting.get()).toBe('stored-key');
  });

  it('502 when NYT rejects the API key', async () => {
    const cookie = await adminCookie();
    __setNytFetcherForTests(async () => ({ ok: false, status: 401, text: async () => '' }));
    const res = await POST(
      new Request('http://t', {
        method: 'POST',
        headers: { cookie, 'content-type': 'application/json' },
        body: JSON.stringify({ apiKey: 'bad-key' }),
      }),
    );
    expect(res.status).toBe(502);
    await expectShape(ConnectionTestFailureResponse, res, 'POST /api/settings/nyt/test (502)');
    expect((await res.json()).ok).toBe(false);
  });

  it('502 when stored API key is missing', async () => {
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
