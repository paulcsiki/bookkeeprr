import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { seedDb, type SeedHandle } from '../helpers/seed';
import { insertUser } from '@/server/db/users';
import { createSession } from '@/server/db/sessions';
import { hashPassword } from '@/server/auth/password';
import { GET } from '@/app/api/dashboard/route';

let h: SeedHandle;
beforeEach(async () => {
  h = await seedDb({ skipDefaultSeries: true });
});
afterEach(() => h.cleanup());

async function adminReq(range?: string): Promise<NextRequest> {
  const a = await insertUser({
    username: 'dash',
    passwordHash: await hashPassword('hunter22'),
    role: 'admin',
    mustChangePassword: false,
  });
  const s = await createSession({ userId: a.id, userAgent: null, ipAddress: null });
  const url = `http://t/api/dashboard${range ? `?range=${range}` : ''}`;
  return new NextRequest(url, { headers: { cookie: `bookkeeprr_session=${s.token}` } });
}

describe('GET /api/dashboard', () => {
  it('401 without a session', async () => {
    const res = await GET(new NextRequest('http://t/api/dashboard'));
    expect(res.status).toBe(401);
  });

  it('returns the dashboard payload for an authenticated user', async () => {
    const res = await GET(await adminReq('week'));
    expect(res.status).toBe(200);
    const body = await res.json();
    // Core sections present + shaped.
    expect(body.period).toBe('week');
    expect(typeof body.greetingName).toBe('string');
    expect(body.personal).toHaveProperty('current');
    expect(body.goals).toHaveProperty('goals');
    expect(body.format).toHaveProperty('byType');
    expect(body.leaderboard).toHaveProperty('time');
    expect(Array.isArray(body.feed)).toBe(true);
    expect(Array.isArray(body.continueItems)).toBe(true);
    expect(body.server).toHaveProperty('totalMembers');
  });

  it('defaults the range when omitted', async () => {
    const res = await GET(await adminReq());
    const body = await res.json();
    expect(['week', 'month', 'year', 'all']).toContain(body.period);
  });
});
