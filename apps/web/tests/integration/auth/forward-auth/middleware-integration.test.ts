import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { seedDb, type SeedHandle } from '../../helpers/seed';
import { authenticateRequest } from '@/server/auth/session-middleware';
import { forwardAuthConfigSetting } from '@/server/db/settings/forward-auth';
import { insertUser } from '@/server/db/users';
import { getSessionByToken, createSession } from '@/server/db/sessions';
import { hashPassword } from '@/server/auth/password';

function mkReq(headers: Record<string, string>): NextRequest {
  return new NextRequest(new URL('http://localhost/'), { headers });
}

async function enableForwardAuth(
  overrides: Partial<{
    allowedGroups: string[];
    adminGroups: string[];
    autoCreateUsers: boolean;
  }> = {},
): Promise<void> {
  await forwardAuthConfigSetting.set({
    enabled: true,
    trustedProxies: ['10.0.0.0/8'],
    userHeader: 'Remote-User',
    emailHeader: 'Remote-Email',
    groupsHeader: 'Remote-Groups',
    autoCreateUsers: true,
    allowedGroups: [],
    adminGroups: [],
    ...overrides,
  });
}

describe('authenticateRequest: forward-auth integration', () => {
  let h: SeedHandle;
  beforeEach(async () => {
    h = await seedDb({ skipDefaultSeries: true });
  });
  afterEach(() => h.cleanup());

  it('authenticates from forward-auth headers and emits a sessionTokenToSet', async () => {
    await enableForwardAuth();
    const res = await authenticateRequest(
      mkReq({
        'x-forwarded-for': '10.0.0.42',
        'remote-user': 'alice',
        'remote-groups': 'bookkeeprr-users',
      }),
    );
    expect(res.kind).toBe('authenticated');
    if (res.kind !== 'authenticated' || res.actor === 'system') throw new Error();
    expect(res.actor.userId).toBeGreaterThan(0);
    expect(res.sessionTokenToSet).toBeDefined();
    expect(typeof res.sessionTokenToSet).toBe('string');
    const session = await getSessionByToken(res.sessionTokenToSet!);
    expect(session?.userId).toBe(res.actor.userId);
  });

  it('reuses an existing session if the cookie already maps to the same user', async () => {
    await enableForwardAuth();
    const r1 = await authenticateRequest(
      mkReq({
        'x-forwarded-for': '10.0.0.42',
        'remote-user': 'reused',
        'remote-groups': '',
      }),
    );
    if (r1.kind !== 'authenticated') throw new Error();
    const token1 = r1.sessionTokenToSet!;
    const r2 = await authenticateRequest(
      mkReq({
        'x-forwarded-for': '10.0.0.42',
        'remote-user': 'reused',
        cookie: `bookkeeprr_session=${token1}`,
      }),
    );
    if (r2.kind !== 'authenticated') throw new Error();
    expect(r2.sessionTokenToSet).toBeUndefined();
  });

  it('creates a fresh session when the cookie maps to a different user', async () => {
    await enableForwardAuth();
    const r1 = await authenticateRequest(
      mkReq({
        'x-forwarded-for': '10.0.0.42',
        'remote-user': 'alice',
        'remote-groups': '',
      }),
    );
    if (r1.kind !== 'authenticated') throw new Error();
    const aliceToken = r1.sessionTokenToSet!;
    const r2 = await authenticateRequest(
      mkReq({
        'x-forwarded-for': '10.0.0.42',
        'remote-user': 'bob',
        cookie: `bookkeeprr_session=${aliceToken}`,
      }),
    );
    if (r2.kind !== 'authenticated' || r2.actor === 'system') throw new Error();
    expect(r2.sessionTokenToSet).toBeDefined();
    expect(r2.sessionTokenToSet).not.toBe(aliceToken);
    const newSession = await getSessionByToken(r2.sessionTokenToSet!);
    expect(newSession?.userId).toBe(r2.actor.userId);
    expect(await getSessionByToken(aliceToken)).toBe(null);
  });

  it('falls through to unauthenticated when forward-auth is not applicable', async () => {
    await enableForwardAuth();
    const res = await authenticateRequest(mkReq({}));
    expect(res.kind).toBe('unauthenticated');
  });

  it('falls through to unauthenticated when peer is outside trusted CIDR', async () => {
    await enableForwardAuth();
    const res = await authenticateRequest(
      mkReq({
        'x-forwarded-for': '203.0.113.5',
        'remote-user': 'alice',
      }),
    );
    expect(res.kind).toBe('unauthenticated');
  });

  it('returns unauthenticated when forward-auth denies access (no_allowed_group)', async () => {
    await enableForwardAuth({ allowedGroups: ['bookkeeprr-users'] });
    const res = await authenticateRequest(
      mkReq({
        'x-forwarded-for': '10.0.0.42',
        'remote-user': 'charlie',
        'remote-groups': 'random-team',
      }),
    );
    expect(res.kind).toBe('unauthenticated');
  });

  it('still honors the existing session cookie when forward-auth is disabled', async () => {
    const u = await insertUser({
      username: 'plain',
      passwordHash: await hashPassword('hunter22'),
      role: 'user',
      mustChangePassword: false,
    });
    const s = await createSession({ userId: u.id, userAgent: null, ipAddress: null });
    const res = await authenticateRequest(mkReq({ cookie: `bookkeeprr_session=${s.token}` }));
    expect(res.kind).toBe('authenticated');
    if (res.kind !== 'authenticated' || res.actor === 'system') throw new Error();
    expect(res.actor.userId).toBe(u.id);
    expect(res.sessionTokenToSet).toBeUndefined();
  });
});
