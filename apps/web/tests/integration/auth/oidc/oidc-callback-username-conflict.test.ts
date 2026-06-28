import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { seedDb, type SeedHandle } from '../../helpers/seed';
import { GET } from '@/app/api/auth/oidc/callback/route';
import { oidcConfigSetting } from '@/server/db/settings/oidc';
import { createTestIdp, mockOpenIdClient } from '@/server/auth/oidc/test-harness';
import { signOidcPendingCookie } from '@/server/auth/oidc/state-cookie';
import { insertUser } from '@/server/db/users';
import { __resetDiscoveryCacheForTests } from '@/server/auth/oidc/discovery';

describe('GET /api/auth/oidc/callback — username conflict', () => {
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
      allowedGroups: [],
      adminGroups: [],
      autoCreateUsers: true,
    });
  });
  afterEach(() => h.cleanup());

  it('returns 409 when a local user already owns the OIDC preferred_username', async () => {
    await insertUser({
      username: 'alice',
      passwordHash: 'localhash',
      role: 'user',
      mustChangePassword: false,
    });
    const harness = await createTestIdp({ issuer: 'https://idp.example.com/', clientId: 'cid' });
    harness.setNextClaims({
      sub: 'oidc|alice-from-idp',
      preferred_username: 'alice',
      email: 'alice@example.com',
      groups: [],
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
    expect(res.status).toBe(409);
  });
});
