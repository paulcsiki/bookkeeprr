import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { seedDb, type SeedHandle } from '../helpers/seed';
import { expectShape } from '../../helpers/assert-spec';
import { ErrorResponse, MessageResponse } from '@/server/openapi/schemas/common';
import {
  DiscoverSettingsResponse,
  SettingsOkResponse,
} from '@/server/openapi/schemas/settings';
import { discoverTrendingSourceSetting } from '@/server/db/settings/discover';
import { GET, PUT } from '@/app/api/settings/discover/route';
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

describe('GET/PUT /api/settings/discover', () => {
  it('GET returns the default trending source (anilist)', async () => {
    const res = await GET();
    await expectShape(DiscoverSettingsResponse, res, 'GET /api/settings/discover');
    const body = await res.json();
    expect(body.trendingSource).toBe('anilist');
  });

  it('GET returns the stored trending source', async () => {
    await discoverTrendingSourceSetting.set('mal');
    const res = await GET();
    const body = await res.json();
    expect(body.trendingSource).toBe('mal');
  });

  it('PUT 401 without a session', async () => {
    const res = await PUT(
      new Request('http://t', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ trendingSource: 'mal' }),
      }),
    );
    expect(res.status).toBe(401);
    await expectShape(MessageResponse, res, 'PUT /api/settings/discover (401)');
  });

  it('PUT 403 for non-admin', async () => {
    const cookie = await userCookie();
    const res = await PUT(
      new Request('http://t', {
        method: 'PUT',
        headers: { cookie, 'content-type': 'application/json' },
        body: JSON.stringify({ trendingSource: 'mal' }),
      }),
    );
    expect(res.status).toBe(403);
    await expectShape(MessageResponse, res, 'PUT /api/settings/discover (403)');
  });

  it('PUT stores a valid trending source for admin', async () => {
    const cookie = await adminCookie();
    const res = await PUT(
      new Request('http://t', {
        method: 'PUT',
        headers: { cookie, 'content-type': 'application/json' },
        body: JSON.stringify({ trendingSource: 'mal' }),
      }),
    );
    expect(res.status).toBe(200);
    await expectShape(SettingsOkResponse, res, 'PUT /api/settings/discover');
    expect(await discoverTrendingSourceSetting.get()).toBe('mal');
  });

  it('PUT 400 on an invalid enum value', async () => {
    const cookie = await adminCookie();
    const res = await PUT(
      new Request('http://t', {
        method: 'PUT',
        headers: { cookie, 'content-type': 'application/json' },
        body: JSON.stringify({ trendingSource: 'kitsu' }),
      }),
    );
    expect(res.status).toBe(400);
    await expectShape(ErrorResponse, res, 'PUT /api/settings/discover (400)');
  });
});
