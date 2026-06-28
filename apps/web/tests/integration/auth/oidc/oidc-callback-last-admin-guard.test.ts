import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { seedDb, type SeedHandle } from '../../helpers/seed';
import { GET } from '@/app/api/auth/oidc/callback/route';
import { oidcConfigSetting } from '@/server/db/settings/oidc';
import { createTestIdp, mockOpenIdClient } from '@/server/auth/oidc/test-harness';
import { signOidcPendingCookie } from '@/server/auth/oidc/state-cookie';
import { insertOidcUser, getUser } from '@/server/db/users';
import { __resetDiscoveryCacheForTests } from '@/server/auth/oidc/discovery';
import * as events from '@/server/auth/events';

describe('GET /api/auth/oidc/callback — last-admin guard', () => {
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

  it('keeps the only admin as admin even when groups try to demote them', async () => {
    // The only admin in the DB; groups try to demote.
    const only = await insertOidcUser({
      username: 'alice',
      role: 'admin',
      oidcIssuer: 'https://idp.example.com/',
      oidcSubject: 'oidc|alice',
      email: 'alice@example.com',
    });
    const harness = await createTestIdp({ issuer: 'https://idp.example.com/', clientId: 'cid' });
    harness.setNextClaims({
      sub: 'oidc|alice',
      preferred_username: 'alice',
      email: 'alice@example.com',
      groups: ['bookkeeprr-users'], // no admin group this time
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
    const refreshed = await getUser(only.id);
    expect(refreshed?.role).toBe('admin'); // last-admin guard held the line
    expect(recomputeSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: only.id,
        oldRole: 'admin',
        newRole: 'admin',
        guardFired: true,
        viaGroups: [],
      }),
    );
  });
});
