import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { AUTH_MODES, type AuthMode } from '@bookkeeprr/types';
import { seedDb, type SeedHandle } from '../../integration/helpers/seed';
import { GET } from '@/app/api/mobile/handshake/route';
import { forwardAuthConfigSetting } from '@/server/db/settings/forward-auth';
import { oidcConfigSetting } from '@/server/db/settings/oidc';
import { cloudSettings } from '@/server/db/settings/cloud';
import { getCurrentServerVersion } from '@/server/mobile/version';

type HandshakeBody = {
  server_version: string;
  supported_auth_modes: AuthMode[];
  brand: string;
  push_enabled: boolean;
};

describe('GET /api/mobile/handshake', () => {
  let h: SeedHandle;
  beforeEach(async () => {
    h = await seedDb({ skipDefaultSeries: true });
  });
  afterEach(() => h.cleanup());

  it('returns brand + version + password mode when no SSO is configured', async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    const body = (await res.json()) as HandshakeBody;
    expect(body.brand).toBe('bookkeeprr');
    expect(body.server_version).toBe(getCurrentServerVersion());
    expect(body.supported_auth_modes).toEqual(['password']);
    expect(body.push_enabled).toBe(false);
  });

  it('reports push_enabled=true when cloud is enabled and tenantId is set', async () => {
    await cloudSettings.set({ enabled: true, tenantId: 'tnt-1' });
    const res = await GET();
    const body = (await res.json()) as HandshakeBody;
    expect(body.push_enabled).toBe(true);
  });

  it('reports push_enabled=false when cloud is enabled but tenantId is null', async () => {
    await cloudSettings.set({ enabled: true, tenantId: null });
    const res = await GET();
    const body = (await res.json()) as HandshakeBody;
    expect(body.push_enabled).toBe(false);
  });

  it('advertises forward_auth when configured', async () => {
    await forwardAuthConfigSetting.set({
      enabled: true,
      trustedProxies: ['10.0.0.0/8'],
      userHeader: 'Remote-User',
      emailHeader: 'Remote-Email',
      groupsHeader: 'Remote-Groups',
      autoCreateUsers: true,
      allowedGroups: [],
      adminGroups: [],
    });
    const res = await GET();
    const body = (await res.json()) as HandshakeBody;
    expect(body.supported_auth_modes).toContain('forward_auth');
    expect(body.supported_auth_modes).toContain('password');
  });

  it('advertises oidc when configured', async () => {
    await oidcConfigSetting.set({
      enabled: true,
      issuer: 'https://idp.example.com/',
      clientId: 'mobile-client',
      clientSecret: 'shh',
      scopes: ['openid', 'profile', 'email'],
      buttonLabel: 'Sign in with SSO',
      usernameClaim: 'preferred_username',
      emailClaim: 'email',
      groupsClaim: 'groups',
      allowedGroups: [],
      adminGroups: [],
      autoCreateUsers: true,
    });
    const res = await GET();
    const body = (await res.json()) as HandshakeBody;
    expect(body.supported_auth_modes).toContain('oidc');
  });

  // Contract guard: the mobile client validates supported_auth_modes against
  // the shared AUTH_MODES enum (packages/types). If this route ever emits a
  // mode outside that set, mobile login breaks with a zod parse error. Assert
  // the real route output is a subset of the shared source of truth even with
  // every SSO mode configured at once.
  it('only ever advertises modes from the shared AUTH_MODES enum', async () => {
    await oidcConfigSetting.set({
      enabled: true,
      issuer: 'https://idp.example.com/',
      clientId: 'mobile-client',
      clientSecret: 'shh',
      scopes: ['openid', 'profile', 'email'],
      buttonLabel: 'Sign in with SSO',
      usernameClaim: 'preferred_username',
      emailClaim: 'email',
      groupsClaim: 'groups',
      allowedGroups: [],
      adminGroups: [],
      autoCreateUsers: true,
    });
    await forwardAuthConfigSetting.set({
      enabled: true,
      trustedProxies: ['10.0.0.0/8'],
      userHeader: 'Remote-User',
      emailHeader: 'Remote-Email',
      groupsHeader: 'Remote-Groups',
      autoCreateUsers: true,
      allowedGroups: [],
      adminGroups: [],
    });
    const res = await GET();
    const body = (await res.json()) as HandshakeBody;
    for (const mode of body.supported_auth_modes) {
      expect(AUTH_MODES).toContain(mode);
    }
  });
});
