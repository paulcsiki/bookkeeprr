import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { seedDb, type SeedHandle } from '../helpers/seed';
import { expectShape } from '../../helpers/assert-spec';
import { MessageResponse } from '@/server/openapi/schemas/common';
import { HousekeepingGetResponse } from '@/server/openapi/schemas/settings';
import { GET } from '@/app/api/settings/housekeeping/route';
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
  return new Request('http://localhost/api/settings/housekeeping', {
    method: 'GET',
    headers,
  });
}

describe('GET /api/settings/housekeeping', () => {
  it('returns 401 with no cookie', async () => {
    const res = await GET(req(null));
    expect(res.status).toBe(401);
    await expectShape(MessageResponse, res, 'GET /api/settings/housekeeping (401)');
  });

  it('returns 403 for non-admin', async () => {
    const res = await GET(req(await userCookie()));
    expect(res.status).toBe(403);
  });

  it('returns all four sections with defaults', async () => {
    const res = await GET(req(await adminCookie()));
    expect(res.status).toBe(200);
    await expectShape(HousekeepingGetResponse, res, 'GET /api/settings/housekeeping');
    const body = (await res.json()) as Record<string, Record<string, number>>;
    expect(body.jobs).toEqual({ terminalDays: 30, errorDays: 90 });
    expect(body.backups).toEqual({ daily: 14, monthlyDay1: 12 });
    expect(body.visibility).toEqual({ auditRetentionDays: 30, logRetentionDays: 7 });
    expect(body.releases).toEqual({ keepPerSeries: 30, olderThanDays: 90 });
  });
});
