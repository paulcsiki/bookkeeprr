import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { seedDb, type SeedHandle } from '../helpers/seed';
import { expectShape } from '../../helpers/assert-spec';
import { ErrorResponse } from '@/server/openapi/schemas/common';
import {
  GoogleBooksSettingsResponse,
  SettingsOkResponse,
} from '@/server/openapi/schemas/settings';
import { googleBooksApiKeySetting } from '@/server/db/settings/googlebooks';
import { GET, PUT } from '@/app/api/settings/googlebooks/route';
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

describe('GET/PUT /api/settings/googlebooks', () => {
  it('GET returns redacted apiKey when set', async () => {
    await googleBooksApiKeySetting.set('secretkey');
    const res = await GET();
    await expectShape(GoogleBooksSettingsResponse, res, 'GET /api/settings/googlebooks');
    const body = await res.json();
    expect(body.apiKey).toBe('****');
  });

  it('GET returns empty string when not set', async () => {
    const res = await GET();
    const body = await res.json();
    expect(body.apiKey).toBe('');
  });

  it('PUT writes new key', async () => {
    const cookie = await adminCookie();
    const res = await PUT(
      new Request('http://t', {
        method: 'PUT',
        headers: { cookie, 'content-type': 'application/json' },
        body: JSON.stringify({ apiKey: 'newkey' }),
      }),
    );
    expect(res.status).toBe(200);
    await expectShape(SettingsOkResponse, res, 'PUT /api/settings/googlebooks');
    expect(await googleBooksApiKeySetting.get()).toBe('newkey');
  });

  it('PUT with empty apiKey retains existing', async () => {
    const cookie = await adminCookie();
    await googleBooksApiKeySetting.set('keep-me');
    const res = await PUT(
      new Request('http://t', {
        method: 'PUT',
        headers: { cookie, 'content-type': 'application/json' },
        body: JSON.stringify({ apiKey: '' }),
      }),
    );
    expect(res.status).toBe(200);
    expect(await googleBooksApiKeySetting.get()).toBe('keep-me');
  });

  it('PUT 400 on bad shape', async () => {
    const cookie = await adminCookie();
    const res = await PUT(
      new Request('http://t', {
        method: 'PUT',
        headers: { cookie, 'content-type': 'application/json' },
        body: JSON.stringify({ apiKey: 42 }),
      }),
    );
    expect(res.status).toBe(400);
    await expectShape(ErrorResponse, res, 'PUT /api/settings/googlebooks (400)');
  });
});
