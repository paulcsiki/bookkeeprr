import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { seedDb, type SeedHandle } from '../helpers/seed';
import { expectShape } from '../../helpers/assert-spec';
import { MessageResponse } from '@/server/openapi/schemas/common';
import { MatcherGetResponse } from '@/server/openapi/schemas/settings';
import { GET } from '@/app/api/settings/matcher/route';
import { insertUser } from '@/server/db/users';
import { createSession } from '@/server/db/sessions';
import { hashPassword } from '@/server/auth/password';

let h: SeedHandle;

beforeEach(async () => {
  h = await seedDb({ skipDefaultSeries: true });
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
  const u = await insertUser({
    username: 'bob',
    passwordHash: await hashPassword('hunter22'),
    role: 'user',
    mustChangePassword: false,
  });
  const s = await createSession({ userId: u.id, userAgent: null, ipAddress: null });
  return `bookkeeprr_session=${s.token}`;
}

function req(cookie: string | null): Request {
  const headers: Record<string, string> = {};
  if (cookie !== null) headers.cookie = cookie;
  return new Request('http://localhost/api/settings/matcher', { method: 'GET', headers });
}

describe('GET /api/settings/matcher', () => {
  it('returns 401 with no cookie', async () => {
    const res = await GET(req(null));
    expect(res.status).toBe(401);
    await expectShape(MessageResponse, res, 'GET /api/settings/matcher (401)');
  });

  it('returns 403 for non-admin', async () => {
    const res = await GET(req(await userCookie()));
    expect(res.status).toBe(403);
  });

  it('returns weights + adultFilter with defaults', async () => {
    const res = await GET(req(await adminCookie()));
    expect(res.status).toBe(200);
    await expectShape(MatcherGetResponse, res, 'GET /api/settings/matcher');
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.weights).toEqual({
      groupTopWeight: 100,
      groupStepDown: 10,
      batchBonus: 30,
      seederMultiplier: 5,
      trustedBonus: 10,
      remakePenalty: -15,
      minSeeders: 1,
    });
    expect(body.adultFilter).toEqual({
      enabled: true,
      blockedCategories: ['4_1', '4_2', '4_3', '4_4'],
    });
  });
});
