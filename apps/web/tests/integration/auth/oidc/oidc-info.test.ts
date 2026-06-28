import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { seedDb, type SeedHandle } from '../../helpers/seed';
import { GET } from '@/app/api/auth/oidc/info/route';
import { oidcConfigSetting } from '@/server/db/settings/oidc';
import { expectShape } from '../../../helpers/assert-spec';
import { OidcInfoResponse } from '@/server/openapi/schemas/auth';

describe('GET /api/auth/oidc/info', () => {
  let h: SeedHandle;
  beforeEach(async () => {
    h = await seedDb({ skipDefaultSeries: true });
  });
  afterEach(() => h.cleanup());

  it('returns enabled=false when OIDC is unconfigured', async () => {
    const res = await GET();
    const body = (await res.json()) as { enabled: boolean; buttonLabel: string };
    expect(body.enabled).toBe(false);
  });

  it('returns enabled=true + buttonLabel when configured', async () => {
    await oidcConfigSetting.set({
      enabled: true,
      issuer: 'https://idp.example.com/',
      clientId: 'cid',
      clientSecret: 'sec',
      scopes: ['openid', 'profile', 'email', 'groups'],
      buttonLabel: 'Sign in with Authentik',
      usernameClaim: 'preferred_username',
      emailClaim: 'email',
      groupsClaim: 'groups',
      allowedGroups: [],
      adminGroups: [],
      autoCreateUsers: true,
    });
    const res = await GET();
    await expectShape(OidcInfoResponse, res, 'GET /api/auth/oidc/info');
    const body = (await res.json()) as { enabled: boolean; buttonLabel: string };
    expect(body.enabled).toBe(true);
    expect(body.buttonLabel).toBe('Sign in with Authentik');
  });
});
