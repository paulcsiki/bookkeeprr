import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { seedDb, type SeedHandle } from '../../integration/helpers/seed';
import { insertUser } from '@/server/db/users';
import { hashPassword } from '@/server/auth/password';
import { issueMobileToken } from '@/server/mobile/tokens';
import { listPushDeviceTokensForUsers } from '@/server/db/mobile-push-devices';
import { POST } from '@/app/api/mobile/push/register/route';

let h: SeedHandle;

beforeEach(async () => {
  h = await seedDb({ skipDefaultSeries: true });
});

afterEach(() => {
  vi.unstubAllGlobals();
  h.cleanup();
});

function mkReq(opts: { bearer?: string; body?: unknown }): Request {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (opts.bearer !== undefined) headers.authorization = `Bearer ${opts.bearer}`;
  return new Request('http://localhost/api/mobile/push/register', {
    method: 'POST',
    headers,
    body: opts.body === undefined ? '{}' : JSON.stringify(opts.body),
  });
}

describe('POST /api/mobile/push/register', () => {
  it('rejects requests with no bearer header (401)', async () => {
    const res = await POST(mkReq({ body: { device_token: 't1', platform: 'ios' } }));
    expect(res.status).toBe(401);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('unauthorized');
  });

  it('persists the row and returns 201 when cloud is disabled', async () => {
    const user = await insertUser({
      username: 'push-register-user',
      passwordHash: await hashPassword('hunter22'),
      role: 'user',
      mustChangePassword: false,
    });
    const issued = await issueMobileToken(user.id);

    // Ensure no fetch leaks to the cloud — cloud is disabled by default.
    const fetchSpy = vi.fn(async () => new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchSpy);

    const res = await POST(
      mkReq({ bearer: issued.token, body: { device_token: 'tok-abc', platform: 'ios' } }),
    );
    expect(res.status).toBe(201);
    const body = (await res.json()) as { id: number; registered_at: string };
    expect(typeof body.id).toBe('number');
    expect(typeof body.registered_at).toBe('string');

    // Row is persisted.
    const rows = await listPushDeviceTokensForUsers([user.id]);
    expect(rows).toEqual([{ userId: user.id, deviceToken: 'tok-abc' }]);

    // Cloud was not contacted because it is disabled.
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
