import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { seedDb, type SeedHandle } from '../../helpers/seed';
import { GET } from '@/app/api/auth/oidc/callback/route';
import { oidcConfigSetting } from '@/server/db/settings/oidc';
import { createTestIdp, mockOpenIdClient } from '@/server/auth/oidc/test-harness';
import { signOidcPendingCookie } from '@/server/auth/oidc/state-cookie';
import { insertOidcUser, getUser, insertUser } from '@/server/db/users';
import { __resetDiscoveryCacheForTests } from '@/server/auth/oidc/discovery';
import * as events from '@/server/auth/events';

describe('GET /api/auth/oidc/callback — role recompute', () => {
  let h: SeedHandle;
  beforeEach(async () => {
    h = await seedDb({ skipDefaultSeries: true });
    vi.restoreAllMocks();
    __resetDiscoveryCacheForTests();
    await oidcConfigSetting.set({
      enabled: true,
      issuer: 'https://idp.example.com/',
      clientId: 'cid',
      clientSecret: 'sec',
      scopes: ['openid', 'profile', 'email', 'groups'],
      buttonLabel: 'Sign in',
      usernameClaim: 'preferred_username',
      emailClaim: 'email',
      groupsClaim: 'groups',
      allowedGroups: ['bookkeeprr-users'],
      adminGroups: ['bookkeeprr-admins'],
      autoCreateUsers: true,
    });
  });
  afterEach(() => h.cleanup());

  it('promotes user → admin on next login when groups include admin group', async () => {
    // Seed a local admin so the demotion guard never fires.
    await insertUser({
      username: 'localadmin',
      passwordHash: 'fake',
      role: 'admin',
      mustChangePassword: false,
    });
    const existing = await insertOidcUser({
      username: 'bob',
      role: 'user',
      oidcIssuer: 'https://idp.example.com/',
      oidcSubject: 'oidc|bob',
      email: 'bob@example.com',
    });
    const harness = await createTestIdp({ issuer: 'https://idp.example.com/', clientId: 'cid' });
    harness.setNextClaims({
      sub: 'oidc|bob',
      preferred_username: 'bob',
      email: 'bob@example.com',
      groups: ['bookkeeprr-users', 'bookkeeprr-admins'],
    });
    mockOpenIdClient(harness);
    const recomputeSpy = vi.spyOn(events, 'logOidcRoleRecompute');
    const pending = await signOidcPendingCookie({
      codeVerifier: 'v',
      state: 's',
      nonce: 'n',
      issuer: 'https://idp.example.com/',
      next: null,
    });
    const req = new Request('http://localhost:3000/api/auth/oidc/callback?code=abc&state=s', {
      headers: { cookie: `bookkeeprr_oidc_pending=${pending}` },
    });
    const res = await GET(req);
    expect(res.status).toBe(302);
    const refreshed = await getUser(existing.id);
    expect(refreshed?.role).toBe('admin');
    expect(recomputeSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: existing.id,
        oldRole: 'user',
        newRole: 'admin',
        guardFired: false,
        viaGroups: expect.arrayContaining(['bookkeeprr-admins']),
      }),
    );
  });
});
