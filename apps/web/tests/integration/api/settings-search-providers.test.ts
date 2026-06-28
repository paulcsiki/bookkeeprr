import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { seedDb, type SeedHandle } from '../helpers/seed';
import { expectShape } from '../../helpers/assert-spec';
import { ErrorResponse } from '@/server/openapi/schemas/common';
import {
  SearchProvidersSchema,
  SettingsOkResponse,
} from '@/server/openapi/schemas/settings';
import {
  DEFAULT_SEARCH_PROVIDERS,
  searchProvidersSetting,
} from '@/server/db/settings/search-providers';
import { insertUser } from '@/server/db/users';
import { createSession } from '@/server/db/sessions';
import { hashPassword } from '@/server/auth/password';
import { GET, PUT } from '@/app/api/settings/search-providers/route';

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

describe('GET /api/settings/search-providers', () => {
  it('returns the all-enabled default when unset', async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    await expectShape(SearchProvidersSchema, res, 'GET /api/settings/search-providers');
    expect(await res.json()).toEqual(DEFAULT_SEARCH_PROVIDERS);
  });

  it('reflects a persisted value', async () => {
    await searchProvidersSetting.set({ ...DEFAULT_SEARCH_PROVIDERS, novelupdates: false });
    const res = await GET();
    const body = await res.json();
    expect(body.novelupdates).toBe(false);
    expect(body.anilist).toBe(true);
  });
});

describe('PUT /api/settings/search-providers', () => {
  it('401 without a session', async () => {
    const res = await PUT(
      new Request('http://t', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(DEFAULT_SEARCH_PROVIDERS),
      }),
    );
    expect(res.status).toBe(401);
  });

  it('403 for a non-admin', async () => {
    const cookie = await userCookie();
    const res = await PUT(
      new Request('http://t', {
        method: 'PUT',
        headers: { cookie, 'content-type': 'application/json' },
        body: JSON.stringify(DEFAULT_SEARCH_PROVIDERS),
      }),
    );
    expect(res.status).toBe(403);
  });

  it('persists a full boolean payload', async () => {
    const cookie = await adminCookie();
    const payload = { ...DEFAULT_SEARCH_PROVIDERS, mal: false, audnex: false };
    const res = await PUT(
      new Request('http://t', {
        method: 'PUT',
        headers: { cookie, 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      }),
    );
    expect(res.status).toBe(200);
    await expectShape(SettingsOkResponse, res, 'PUT /api/settings/search-providers');
    expect((await res.json()).ok).toBe(true);
    expect(await searchProvidersSetting.get()).toEqual(payload);
  });

  it('400 on a non-boolean field', async () => {
    const cookie = await adminCookie();
    const res = await PUT(
      new Request('http://t', {
        method: 'PUT',
        headers: { cookie, 'content-type': 'application/json' },
        body: JSON.stringify({ ...DEFAULT_SEARCH_PROVIDERS, anilist: 'yes' }),
      }),
    );
    expect(res.status).toBe(400);
    await expectShape(ErrorResponse, res, 'PUT /api/settings/search-providers (400)');
  });

  it('400 on a missing field (full shape required)', async () => {
    const cookie = await adminCookie();
    const { audnex: _drop, ...partial } = DEFAULT_SEARCH_PROVIDERS;
    const res = await PUT(
      new Request('http://t', {
        method: 'PUT',
        headers: { cookie, 'content-type': 'application/json' },
        body: JSON.stringify(partial),
      }),
    );
    expect(res.status).toBe(400);
  });
});
