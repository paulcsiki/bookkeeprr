import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { seedDb, type SeedHandle } from '../../integration/helpers/seed';
import { insertUser, getUser } from '@/server/db/users';
import { hashPassword } from '@/server/auth/password';
import { POST } from '@/app/api/mobile/changelog-seen/route';
import { issueMobileToken } from '@/server/mobile/tokens';

async function makeUser(username = 'mobile-user'): Promise<number> {
  const u = await insertUser({
    username,
    passwordHash: await hashPassword('hunter22'),
    role: 'user',
    mustChangePassword: false,
  });
  return u.id;
}

function mkReq(opts: { bearer?: string; body?: unknown }): Request {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (opts.bearer !== undefined) headers.authorization = `Bearer ${opts.bearer}`;
  return new Request('http://localhost/api/mobile/changelog-seen', {
    method: 'POST',
    headers,
    body: opts.body === undefined ? '{}' : JSON.stringify(opts.body),
  });
}

describe('POST /api/mobile/changelog-seen', () => {
  let h: SeedHandle;
  beforeEach(async () => {
    h = await seedDb({ skipDefaultSeries: true });
  });
  afterEach(() => h.cleanup());

  it('happy path: persists last_seen_changelog_version on the user row', async () => {
    const userId = await makeUser();
    const issued = await issueMobileToken(userId);
    const res = await POST(mkReq({ bearer: issued.token, body: { version: '0.4.2' } }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { version: string };
    expect(body.version).toBe('0.4.2');
    const u = await getUser(userId);
    expect(u?.lastSeenChangelogVersion).toBe('0.4.2');
  });

  it('rejects requests with no Authorization header (401)', async () => {
    const res = await POST(mkReq({ body: { version: '0.4.2' } }));
    expect(res.status).toBe(401);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('unauthorized');
  });

  it('rejects an invalid / unknown bearer token (401)', async () => {
    const res = await POST(mkReq({ bearer: 'not-a-real-token', body: { version: '0.4.2' } }));
    expect(res.status).toBe(401);
  });

  it('rejects a bearer header that is not "Bearer …" with 401', async () => {
    const req = new Request('http://localhost/api/mobile/changelog-seen', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Basic abc' },
      body: '{"version":"0.4.2"}',
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it('rejects missing version with 400', async () => {
    const userId = await makeUser();
    const issued = await issueMobileToken(userId);
    const res = await POST(mkReq({ bearer: issued.token, body: {} }));
    expect(res.status).toBe(400);
  });

  it('rejects invalid JSON with 400', async () => {
    const userId = await makeUser();
    const issued = await issueMobileToken(userId);
    const req = new Request('http://localhost/api/mobile/changelog-seen', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${issued.token}`,
      },
      body: '{ not json',
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });
});
