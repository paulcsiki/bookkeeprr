import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { seedDb, type SeedHandle } from '../../helpers/seed';
import { POST } from '@/app/api/auth/forward-auth/validate/route';
import { insertUser } from '@/server/db/users';
import { createSession } from '@/server/db/sessions';
import { hashPassword } from '@/server/auth/password';

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
    username: 'u',
    passwordHash: await hashPassword('hunter22'),
    role: 'user',
    mustChangePassword: false,
  });
  const s = await createSession({ userId: u.id, userAgent: null, ipAddress: null });
  return `bookkeeprr_session=${s.token}`;
}

function mkRequest(
  cookie: string | null,
  body: { trustedProxies: string[]; userHeader: string },
  extraHeaders: Record<string, string> = {},
): Request {
  const headers: Record<string, string> = { 'content-type': 'application/json', ...extraHeaders };
  if (cookie !== null) headers.cookie = cookie;
  return new Request('http://localhost/api/auth/forward-auth/validate', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
}

describe('POST /api/auth/forward-auth/validate', () => {
  let h: SeedHandle;
  beforeEach(async () => {
    h = await seedDb({ skipDefaultSeries: true });
  });
  afterEach(() => h.cleanup());

  it('returns 401 for unauthenticated callers', async () => {
    const res = await POST(
      mkRequest(null, { trustedProxies: ['10.0.0.0/8'], userHeader: 'Remote-User' }),
    );
    expect(res.status).toBe(401);
  });

  it('returns 403 for non-admin users', async () => {
    const cookie = await userCookie();
    const res = await POST(
      mkRequest(cookie, { trustedProxies: ['10.0.0.0/8'], userHeader: 'Remote-User' }),
    );
    expect(res.status).toBe(403);
  });

  it('returns ready=true when peer + header line up', async () => {
    const cookie = await adminCookie();
    const res = await POST(
      mkRequest(
        cookie,
        { trustedProxies: ['10.0.0.0/8'], userHeader: 'Remote-User' },
        { 'x-forwarded-for': '203.0.113.5, 10.0.0.42', 'remote-user': 'alice' },
      ),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      ready: boolean;
      peerIp: string;
      peerInTrustedProxies: boolean;
      userHeaderPresent: boolean;
      userHeaderValue: string;
    };
    expect(body.ready).toBe(true);
    expect(body.peerIp).toBe('10.0.0.42');
    expect(body.peerInTrustedProxies).toBe(true);
    expect(body.userHeaderPresent).toBe(true);
    expect(body.userHeaderValue).toBe('alice');
  });

  it('returns ready=false with diagnostic when peer not trusted', async () => {
    const cookie = await adminCookie();
    const res = await POST(
      mkRequest(
        cookie,
        { trustedProxies: ['10.0.0.0/8'], userHeader: 'Remote-User' },
        { 'x-forwarded-for': '203.0.113.5', 'remote-user': 'alice' },
      ),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      ready: boolean;
      peerIp: string;
      peerInTrustedProxies: boolean;
    };
    expect(body.ready).toBe(false);
    expect(body.peerIp).toBe('203.0.113.5');
    expect(body.peerInTrustedProxies).toBe(false);
  });

  it('returns ready=false when user header absent', async () => {
    const cookie = await adminCookie();
    const res = await POST(
      mkRequest(
        cookie,
        { trustedProxies: ['10.0.0.0/8'], userHeader: 'Remote-User' },
        { 'x-forwarded-for': '10.0.0.42' },
      ),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ready: boolean; userHeaderPresent: boolean };
    expect(body.ready).toBe(false);
    expect(body.userHeaderPresent).toBe(false);
  });

  it('returns 422 with invalid_cidr error when CIDR list contains bad entries', async () => {
    const cookie = await adminCookie();
    const res = await POST(
      mkRequest(
        cookie,
        { trustedProxies: ['10.0.0.0/8', 'nonsense'], userHeader: 'Remote-User' },
        { 'x-forwarded-for': '10.0.0.42', 'remote-user': 'alice' },
      ),
    );
    expect(res.status).toBe(422);
    const body = (await res.json()) as { error: string; invalidCidrs: string[] };
    expect(body.error).toBe('invalid_cidr');
    expect(body.invalidCidrs).toEqual(['nonsense']);
  });
});
