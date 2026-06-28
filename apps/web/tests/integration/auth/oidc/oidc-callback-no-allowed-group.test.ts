import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { seedDb, type SeedHandle } from '../../helpers/seed';
import { GET } from '@/app/api/auth/oidc/callback/route';
import { oidcConfigSetting } from '@/server/db/settings/oidc';
import { createTestIdp, mockOpenIdClient } from '@/server/auth/oidc/test-harness';
import { signOidcPendingCookie } from '@/server/auth/oidc/state-cookie';
import { __resetDiscoveryCacheForTests } from '@/server/auth/oidc/discovery';

describe('GET /api/auth/oidc/callback — no allowed group', () => {
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
      adminGroups: [],
      autoCreateUsers: true,
    });
  });
  afterEach(() => h.cleanup());

  it('returns 403 when claims.groups has no intersection with allowedGroups', async () => {
    const harness = await createTestIdp({ issuer: 'https://idp.example.com/', clientId: 'cid' });
    harness.setNextClaims({
      sub: 'oidc|noaccess',
      preferred_username: 'noaccess',
      email: 'noaccess@example.com',
      groups: ['some-other-group'],
    });
    mockOpenIdClient(harness);
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
    expect(res.status).toBe(403);
  });
});
