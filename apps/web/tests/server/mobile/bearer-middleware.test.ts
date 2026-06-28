import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { NextRequest } from 'next/server';
import { seedDb, type SeedHandle } from '../../integration/helpers/seed';
import { insertUser, updateUser } from '@/server/db/users';
import { hashPassword } from '@/server/auth/password';
import { authenticateBearer, hasBearerHeader } from '@/server/mobile/bearer-middleware';
import { authenticateRequest } from '@/server/auth/session-middleware';
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

function mkBareReq(headers: Record<string, string> = {}): Request {
  return new Request('http://localhost/api/something', { headers });
}

function mkNextReq(headers: Record<string, string> = {}): NextRequest {
  // session-middleware accesses req.cookies and req.headers — a Next-shape
  // request is built by wrapping a fetch Request via duck-typing for the
  // cookies API the middleware reads.
  const req = mkBareReq(headers) as unknown as NextRequest;
  // Minimal cookies shim — middleware only ever calls .get('bookkeeprr_session').
  Object.defineProperty(req, 'cookies', {
    value: { get: (_name: string) => undefined },
    configurable: true,
  });
  return req;
}

describe('hasBearerHeader / authenticateBearer', () => {
  let h: SeedHandle;
  beforeEach(async () => {
    h = await seedDb({ skipDefaultSeries: true });
  });
  afterEach(() => h.cleanup());

  it('reports no_token when the Authorization header is missing', async () => {
    expect(hasBearerHeader(mkBareReq())).toBe(false);
    const r = await authenticateBearer(mkBareReq());
    expect(r.kind).toBe('no_token');
  });

  it('reports no_token when the Authorization header is not Bearer', async () => {
    expect(hasBearerHeader(mkBareReq({ authorization: 'Basic abc' }))).toBe(false);
    const r = await authenticateBearer(mkBareReq({ authorization: 'Basic abc' }));
    expect(r.kind).toBe('no_token');
  });

  it('matches the Bearer scheme case-insensitively', async () => {
    const userId = await makeUser();
    const issued = await issueMobileToken(userId);
    expect(hasBearerHeader(mkBareReq({ authorization: `bearer ${issued.token}` }))).toBe(true);
    const r = await authenticateBearer(mkBareReq({ authorization: `bearer ${issued.token}` }));
    expect(r.kind).toBe('authenticated');
  });

  it('returns invalid_token for an unknown token', async () => {
    const r = await authenticateBearer(mkBareReq({ authorization: 'Bearer not-real' }));
    expect(r.kind).toBe('invalid_token');
  });

  it('returns invalid_token when the owning user has been disabled', async () => {
    const userId = await makeUser();
    const issued = await issueMobileToken(userId);
    await updateUser(userId, { disabled: true });
    const r = await authenticateBearer(mkBareReq({ authorization: `Bearer ${issued.token}` }));
    expect(r.kind).toBe('invalid_token');
  });

  it('returns the user on a valid token', async () => {
    const userId = await makeUser('alice-bearer');
    const issued = await issueMobileToken(userId);
    const r = await authenticateBearer(mkBareReq({ authorization: `Bearer ${issued.token}` }));
    expect(r.kind).toBe('authenticated');
    if (r.kind !== 'authenticated') throw new Error();
    expect(r.user.id).toBe(userId);
    expect(r.user.username).toBe('alice-bearer');
  });
});

describe('authenticateRequest() with mobile bearer token (M34)', () => {
  let h: SeedHandle;
  beforeEach(async () => {
    h = await seedDb({ skipDefaultSeries: true });
  });
  afterEach(() => h.cleanup());

  it('accepts a valid Bearer token when no other auth was supplied', async () => {
    const userId = await makeUser();
    const issued = await issueMobileToken(userId);
    const r = await authenticateRequest(mkNextReq({ authorization: `Bearer ${issued.token}` }));
    expect(r.kind).toBe('authenticated');
    if (r.kind !== 'authenticated') throw new Error();
    expect(r.actor).not.toBe('system');
    if (r.actor === 'system') throw new Error();
    expect(r.actor.userId).toBe(userId);
  });

  it('falls through to unauthenticated when the Bearer token is unknown', async () => {
    await makeUser();
    const r = await authenticateRequest(mkNextReq({ authorization: 'Bearer not-a-real-token' }));
    expect(r.kind).toBe('unauthenticated');
  });

  it('does not attempt bearer auth when no Authorization header is set', async () => {
    const r = await authenticateRequest(mkNextReq());
    expect(r.kind).toBe('unauthenticated');
  });
});
