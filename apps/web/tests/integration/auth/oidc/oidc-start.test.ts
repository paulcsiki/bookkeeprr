import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { seedDb, type SeedHandle } from '../../helpers/seed';
import { POST } from '@/app/api/auth/oidc/start/route';
import { oidcConfigSetting } from '@/server/db/settings/oidc';
import { createTestIdp, mockOpenIdClient } from '@/server/auth/oidc/test-harness';
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
    allowedGroups: [],
    adminGroups: [],
    autoCreateUsers: true,
  });
}

describe('POST /api/auth/oidc/start', () => {
  let h: SeedHandle;
  beforeEach(async () => {
    h = await seedDb({ skipDefaultSeries: true });
    vi.restoreAllMocks();
    __resetDiscoveryCacheForTests();
  });
  afterEach(() => h.cleanup());

  it('returns 400 when OIDC is not configured', async () => {
    const req = new Request('http://localhost:3000/api/auth/oidc/start', { method: 'POST' });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it('returns a 302 to the IdP authorize URL with PKCE/state/nonce and sets a pending cookie', async () => {
    await configureOidc();
    const harness = await createTestIdp({ issuer: 'https://idp.example.com/', clientId: 'cid' });
    mockOpenIdClient(harness);
    const req = new Request('http://localhost:3000/api/auth/oidc/start', { method: 'POST' });
    const res = await POST(req);
    expect(res.status).toBe(302);
    const loc = res.headers.get('location') ?? '';
    expect(loc).toContain('https://idp.example.com/authorize');
    expect(loc).toMatch(/code_challenge=/);
    expect(loc).toMatch(/code_challenge_method=S256/);
    expect(loc).toMatch(/state=/);
    expect(loc).toMatch(/nonce=/);
    expect(loc).toMatch(/scope=openid/);
    const setCookie = res.headers.get('set-cookie') ?? '';
    expect(setCookie).toMatch(/bookkeeprr_oidc_pending=/);
    expect(setCookie).toMatch(/HttpOnly/i);
    expect(setCookie).toMatch(/Max-Age=600/);
  });

  it('forwards ?next=/somewhere into the pending cookie payload', async () => {
    await configureOidc();
    const harness = await createTestIdp({ issuer: 'https://idp.example.com/', clientId: 'cid' });
    mockOpenIdClient(harness);
    const req = new Request('http://localhost:3000/api/auth/oidc/start?next=/library', {
      method: 'POST',
    });
    const res = await POST(req);
    expect(res.status).toBe(302);
    const setCookie = res.headers.get('set-cookie') ?? '';
    const match = /bookkeeprr_oidc_pending=([^;]+)/.exec(setCookie);
    expect(match).not.toBeNull();
    const value = match![1]!;
    const { parseOidcPendingCookie } = await import('@/server/auth/oidc/state-cookie');
    const payload = await parseOidcPendingCookie(value);
    expect(payload?.next).toBe('/library');
  });
});
