import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { seedDb, type SeedHandle } from '../../integration/helpers/seed';
import { insertUser } from '@/server/db/users';
import { createSession } from '@/server/db/sessions';
import { hashPassword } from '@/server/auth/password';
import { GET, POST } from '@/app/api/updates/changelog-seen/route';

let h: SeedHandle;

beforeEach(async () => {
  h = await seedDb({ skipDefaultSeries: true });
});
afterEach(() => h.cleanup());

async function makeUserCookie(
  username = 'alice',
  role: 'admin' | 'user' = 'user',
): Promise<{ userId: number; cookie: string }> {
  const user = await insertUser({
    username,
    passwordHash: await hashPassword('hunter22'),
    role,
    mustChangePassword: false,
  });
  const s = await createSession({ userId: user.id, userAgent: null, ipAddress: null });
  return { userId: user.id, cookie: `bookkeeprr_session=${s.token}` };
}

function getReq(cookie: string | null): Request {
  const headers: Record<string, string> = {};
  if (cookie !== null) headers.cookie = cookie;
  return new Request('http://localhost/api/updates/changelog-seen', { method: 'GET', headers });
}

function postReq(cookie: string | null, body: unknown): Request {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (cookie !== null) headers.cookie = cookie;
  return new Request('http://localhost/api/updates/changelog-seen', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
}

describe('GET /api/updates/changelog-seen', () => {
  it('returns 401 when unauthenticated', async () => {
    const res = await GET(getReq(null));
    expect(res.status).toBe(401);
  });

  it('returns { version: null } for a user who has never seen the changelog', async () => {
    const { cookie } = await makeUserCookie();
    const res = await GET(getReq(cookie));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { version: string | null };
    expect(body.version).toBeNull();
  });
});

describe('POST /api/updates/changelog-seen', () => {
  it('returns 401 when unauthenticated', async () => {
    const res = await POST(postReq(null, { version: '1.0.0' }));
    expect(res.status).toBe(401);
  });

  it('stores the version and a subsequent GET returns it', async () => {
    const { cookie } = await makeUserCookie();
    const postRes = await POST(postReq(cookie, { version: '1.2.3' }));
    expect(postRes.status).toBe(200);
    const postBody = (await postRes.json()) as { ok: boolean };
    expect(postBody.ok).toBe(true);

    // Subsequent GET returns the stored version.
    const getRes = await GET(getReq(cookie));
    expect(getRes.status).toBe(200);
    const getBody = (await getRes.json()) as { version: string | null };
    expect(getBody.version).toBe('1.2.3');
  });

  it('returns 400 for an empty version string', async () => {
    const { cookie } = await makeUserCookie();
    const res = await POST(postReq(cookie, { version: '' }));
    expect(res.status).toBe(400);
  });

  it('returns 400 for a missing version field', async () => {
    const { cookie } = await makeUserCookie();
    const res = await POST(postReq(cookie, {}));
    expect(res.status).toBe(400);
  });
});
