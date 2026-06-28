/** @vitest-environment node */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { seedDb, type SeedHandle } from '../../integration/helpers/seed';
import { insertUser, getUser } from '@/server/db/users';
import { createSession } from '@/server/db/sessions';
import { PATCH } from '@/app/api/auth/me/profile/route';
import { expectShape } from '../../helpers/assert-spec';
import { MeProfileResponse } from '@/server/openapi/schemas/auth';

let h: SeedHandle;

beforeEach(async () => {
  h = await seedDb({ skipDefaultSeries: true });
});
afterEach(() => {
  h.cleanup();
});

function req(token: string, body: unknown): Request {
  return new Request('http://x/api/auth/me/profile', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json', cookie: `bookkeeprr_session=${token}` },
    body: JSON.stringify(body),
  });
}

describe('PATCH /api/auth/me/profile', () => {
  it('updates displayName and email for the signed-in user', async () => {
    const u = await insertUser({ username: 'owner@example.com', email: 'owner@example.com', passwordHash: 'x', role: 'admin', mustChangePassword: false });
    const s = await createSession({ userId: u.id, userAgent: null, ipAddress: null });
    const res = await PATCH(req(s.token, { displayName: 'Owner', email: 'new@example.com' }));
    expect(res.status).toBe(200);
    await expectShape(MeProfileResponse, res, 'PATCH /api/auth/me/profile');
    const after = await getUser(u.id);
    expect(after?.displayName).toBe('Owner');
    expect(after?.email).toBe('new@example.com');
    expect(after?.username).toBe('owner@example.com'); // username unchanged
  });

  it('rejects an invalid email', async () => {
    const u = await insertUser({ username: 'a@b.com', passwordHash: 'x', role: 'admin', mustChangePassword: false });
    const s = await createSession({ userId: u.id, userAgent: null, ipAddress: null });
    const res = await PATCH(req(s.token, { email: 'nope' }));
    expect(res.status).toBe(400);
  });

  it('401 without a session', async () => {
    const res = await PATCH(new Request('http://x/api/auth/me/profile', { method: 'PATCH', body: JSON.stringify({ displayName: 'X' }) }));
    expect(res.status).toBe(401);
  });
});
