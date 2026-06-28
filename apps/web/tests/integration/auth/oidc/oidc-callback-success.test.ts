import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { seedDb, type SeedHandle } from '../../helpers/seed';
import { GET } from '@/app/api/auth/oidc/callback/route';
import { oidcConfigSetting } from '@/server/db/settings/oidc';
import { createTestIdp, mockOpenIdClient } from '@/server/auth/oidc/test-harness';
import { signOidcPendingCookie } from '@/server/auth/oidc/state-cookie';
import { findUserByOidcSubject } from '@/server/db/users';
import { __resetDiscoveryCacheForTests } from '@/server/auth/oidc/discovery';

async function configureOidc(): Promise<void> {
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
}

describe('GET /api/auth/oidc/callback — happy path', () => {
  let h: SeedHandle;
  beforeEach(async () => {
    h = await seedDb({ skipDefaultSeries: true });
    vi.restoreAllMocks();
    __resetDiscoveryCacheForTests();
  });
  afterEach(() => h.cleanup());

  it('creates a new OIDC user and sets a session cookie', async () => {
    await configureOidc();
    const harness = await createTestIdp({ issuer: 'https://idp.example.com/', clientId: 'cid' });
    harness.setNextClaims({
      sub: 'oidc|alice',
      preferred_username: 'alice',
      email: 'alice@example.com',
      groups: ['bookkeeprr-users', 'bookkeeprr-admins'],
    });
    mockOpenIdClient(harness);
    const pending = await signOidcPendingCookie({
      codeVerifier: 'verifier',
      state: 'matching-state',
      nonce: 'nonce-1',
      issuer: 'https://idp.example.com/',
      next: '/library',
    });
    const req = new Request(
      'http://localhost:3000/api/auth/oidc/callback?code=abc&state=matching-state',
      { headers: { cookie: `bookkeeprr_oidc_pending=${pending}` } },
    );
    const res = await GET(req);
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe('/library');
    const setCookies = res.headers.getSetCookie?.() ?? [res.headers.get('set-cookie') ?? ''];
    const session = setCookies.find((c) => c.startsWith('bookkeeprr_session='));
    expect(session).toBeDefined();
    expect(session).toMatch(/HttpOnly/i);

    const created = await findUserByOidcSubject('https://idp.example.com/', 'oidc|alice');
    expect(created?.username).toBe('alice');
    expect(created?.role).toBe('admin');
    expect(created?.authSource).toBe('oidc');
    expect(created?.email).toBe('alice@example.com');
  });
});
