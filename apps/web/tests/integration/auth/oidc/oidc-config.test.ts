import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { seedDb, type SeedHandle } from '../../helpers/seed';
import { GET, PATCH } from '@/app/api/auth/oidc/config/route';
import { expectShape } from '../../../helpers/assert-spec';
import { OidcConfigResponse } from '@/server/openapi/schemas/auth';
import { oidcConfigSetting } from '@/server/db/settings/oidc';
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

describe('GET/PATCH /api/auth/oidc/config', () => {
  let h: SeedHandle;
  beforeEach(async () => {
    h = await seedDb({ skipDefaultSeries: true });
  });
  afterEach(() => h.cleanup());

  it('GET: 401 for unauthenticated callers', async () => {
    const res = await GET(new Request('http://localhost/api/auth/oidc/config'));
    expect(res.status).toBe(401);
  });

  it('GET: 403 for non-admin users', async () => {
    const cookie = await userCookie();
    const res = await GET(
      new Request('http://localhost/api/auth/oidc/config', { headers: { cookie } }),
    );
    expect(res.status).toBe(403);
  });

  it('GET: returns masked clientSecret when configured', async () => {
    const cookie = await adminCookie();
    await oidcConfigSetting.set({
      enabled: true,
      issuer: 'https://idp.example.com/',
      clientId: 'cid',
      clientSecret: 'super-secret',
      scopes: ['openid'],
      buttonLabel: 'Sign in',
      usernameClaim: 'preferred_username',
      emailClaim: 'email',
      groupsClaim: 'groups',
      allowedGroups: [],
      adminGroups: [],
      autoCreateUsers: true,
    });
    const res = await GET(
      new Request('http://localhost/api/auth/oidc/config', { headers: { cookie } }),
    );
    expect(res.status).toBe(200);
    await expectShape(OidcConfigResponse, res, 'GET /api/auth/oidc/config');
    const body = (await res.json()) as { config: { clientSecret: string } };
    expect(body.config.clientSecret).toBe('••••••••');
  });

  it('GET: returns empty clientSecret when unset', async () => {
    const cookie = await adminCookie();
    const res = await GET(
      new Request('http://localhost/api/auth/oidc/config', { headers: { cookie } }),
    );
    const body = (await res.json()) as { config: { clientSecret: string } };
    expect(body.config.clientSecret).toBe('');
  });

  it('PATCH: empty-string clientSecret keeps existing value', async () => {
    const cookie = await adminCookie();
    await oidcConfigSetting.set({
      enabled: true,
      issuer: 'https://idp.example.com/',
      clientId: 'cid',
      clientSecret: 'keep-me',
      scopes: ['openid'],
      buttonLabel: 'Sign in',
      usernameClaim: 'preferred_username',
      emailClaim: 'email',
      groupsClaim: 'groups',
      allowedGroups: [],
      adminGroups: [],
      autoCreateUsers: true,
    });
    const res = await PATCH(
      new Request('http://localhost/api/auth/oidc/config', {
        method: 'PATCH',
        headers: { cookie, 'content-type': 'application/json' },
        body: JSON.stringify({ clientSecret: '' }),
      }),
    );
    expect(res.status).toBe(200);
    await expectShape(OidcConfigResponse, res, 'PATCH /api/auth/oidc/config');
    const stored = await oidcConfigSetting.get();
    expect(stored.clientSecret).toBe('keep-me');
  });

  it('PATCH: null clientSecret clears + disables OIDC', async () => {
    const cookie = await adminCookie();
    await oidcConfigSetting.set({
      enabled: true,
      issuer: 'https://idp.example.com/',
      clientId: 'cid',
      clientSecret: 'will-be-cleared',
      scopes: ['openid'],
      buttonLabel: 'Sign in',
      usernameClaim: 'preferred_username',
      emailClaim: 'email',
      groupsClaim: 'groups',
      allowedGroups: [],
      adminGroups: [],
      autoCreateUsers: true,
    });
    const res = await PATCH(
      new Request('http://localhost/api/auth/oidc/config', {
        method: 'PATCH',
        headers: { cookie, 'content-type': 'application/json' },
        body: JSON.stringify({ clientSecret: null }),
      }),
    );
    expect(res.status).toBe(200);
    const stored = await oidcConfigSetting.get();
    expect(stored.clientSecret).toBe('');
    expect(stored.enabled).toBe(false);
  });

  it('PATCH: updates allowedGroups + adminGroups arrays', async () => {
    const cookie = await adminCookie();
    const res = await PATCH(
      new Request('http://localhost/api/auth/oidc/config', {
        method: 'PATCH',
        headers: { cookie, 'content-type': 'application/json' },
        body: JSON.stringify({
          enabled: true,
          issuer: 'https://idp.example.com/',
          clientId: 'cid',
          clientSecret: 'sec',
          allowedGroups: ['bookkeeprr-users'],
          adminGroups: ['bookkeeprr-admins'],
        }),
      }),
    );
    expect(res.status).toBe(200);
    const stored = await oidcConfigSetting.get();
    expect(stored.allowedGroups).toEqual(['bookkeeprr-users']);
    expect(stored.adminGroups).toEqual(['bookkeeprr-admins']);
  });
});
